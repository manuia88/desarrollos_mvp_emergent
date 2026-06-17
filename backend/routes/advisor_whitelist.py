"""Phase 13 · Batch 36 — Advisor Whitelist + Auto-Approve routes.

Endpoints:
  Asesor-side (auth: advisor|asesor_admin|superadmin):
    POST /api/asesor/whitelist/request
    GET  /api/asesor/whitelist/me
    GET  /api/asesor/whitelist/authorized-devs

  Developer-side (auth: developer_admin|superadmin):
    GET  /api/dev/whitelist/pending
    GET  /api/dev/whitelist/all
    POST /api/dev/whitelist/{auth_id}/approve
    POST /api/dev/whitelist/{auth_id}/reject
    POST /api/dev/whitelist/{auth_id}/revoke
    POST /api/dev/whitelist/bulk-approve
    GET  /api/dev/auto-approve-rule
    PUT  /api/dev/auto-approve-rule
    POST /api/dev/auto-approve-rule/simulate
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request, Query
from pydantic import BaseModel, Field

log = logging.getLogger("dmx.routes_advisor_whitelist")

router = APIRouter(tags=["whitelist"])

ASESOR_ROLES = {"advisor", "asesor_admin", "superadmin"}
DEV_ROLES = {"developer_admin", "superadmin"}


def _db(request: Request):
    return request.app.state.db


async def _auth_asesor(request: Request):
    # Candado 3 · envuelve el check_role central (mismos roles → cero cambio de acceso).
    from permissions import check_role
    return await check_role(request, *ASESOR_ROLES)


async def _auth_dev(request: Request):
    from permissions import check_role
    return await check_role(request, *DEV_ROLES)


def _dev_org_id_of(user) -> str:
    """Obtiene el dev_org_id del usuario desarrollador."""
    tid = getattr(user, "tenant_id", None)
    if not tid:
        raise HTTPException(409, "Tu cuenta no está vinculada a una desarrolladora")
    return tid


# ═══ Schemas ═════════════════════════════════════════════════════════════════

class RequestAccessIn(BaseModel):
    dev_org_id: str = Field(..., min_length=1, max_length=80)
    motivo: str = Field(..., min_length=5, max_length=500)
    experiencia_colonia: str = Field("", max_length=300)
    clientes_interesados_count: int = Field(0, ge=0, le=9999)


class ApproveIn(BaseModel):
    comentario: Optional[str] = Field(None, max_length=500)


class RejectIn(BaseModel):
    comentario: str = Field(..., min_length=3, max_length=500)


class RevokeIn(BaseModel):
    reason: str = Field(..., min_length=3, max_length=500)


class BulkApproveIn(BaseModel):
    auth_ids: List[str] = Field(..., min_items=1, max_items=100)
    comentario: Optional[str] = Field(None, max_length=500)


class AutoApproveRuleIn(BaseModel):
    enabled: bool = False
    threshold_trust_score: int = Field(70, ge=0, le=100)
    require_zona_expertise: bool = True
    target_colonias: Optional[List[str]] = Field(default_factory=list)
    min_deals_closed_12m: int = Field(1, ge=0, le=999)


class SimulateRuleIn(BaseModel):
    threshold_trust_score: int = Field(70, ge=0, le=100)
    require_zona_expertise: bool = True
    target_colonias: Optional[List[str]] = Field(default_factory=list)
    min_deals_closed_12m: int = Field(1, ge=0, le=999)


# ═══ Asesor side ═════════════════════════════════════════════════════════════

@router.post("/api/asesor/whitelist/request")
async def whitelist_request(payload: RequestAccessIn, request: Request):
    user = await _auth_asesor(request)
    db = _db(request)
    from services.advisor_authorization import request_access
    try:
        doc = await request_access(
            db,
            asesor_id=user.user_id,
            dev_org_id=payload.dev_org_id,
            motivo=payload.motivo,
            experiencia_colonia=payload.experiencia_colonia,
            clientes_interesados_count=payload.clientes_interesados_count,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    return doc


@router.get("/api/asesor/whitelist/me")
async def whitelist_me(request: Request):
    user = await _auth_asesor(request)
    db = _db(request)
    from services.advisor_authorization import list_for_asesor
    items = await list_for_asesor(db, user.user_id)
    return {"items": items, "total": len(items)}


@router.get("/api/asesor/whitelist/authorized-devs")
async def whitelist_authorized_devs(request: Request):
    """Retorna lista de dev_org_ids con acceso aprobado."""
    user = await _auth_asesor(request)
    db = _db(request)
    from services.advisor_authorization import get_authorized_dev_org_ids
    dev_org_ids = await get_authorized_dev_org_ids(db, user.user_id)
    return {"dev_org_ids": dev_org_ids, "total": len(dev_org_ids)}


# ═══ Developer side ══════════════════════════════════════════════════════════

@router.get("/api/dev/whitelist/pending")
async def dev_whitelist_pending(request: Request):
    user = await _auth_dev(request)
    db = _db(request)
    dev_org = _dev_org_id_of(user) if user.role != "superadmin" else None
    if not dev_org:
        raise HTTPException(400, "Especifica dev_org_id para superadmin")
    from services.advisor_authorization import list_pending
    items = await list_pending(db, dev_org)
    # Enrich with asesor user info
    items = await _enrich_with_asesor_info(db, items)
    return {"items": items, "total": len(items)}


@router.get("/api/dev/whitelist/all")
async def dev_whitelist_all(
    request: Request,
    status: Optional[str] = Query(None),
):
    user = await _auth_dev(request)
    db = _db(request)
    dev_org = _dev_org_id_of(user) if user.role != "superadmin" else None
    if not dev_org:
        raise HTTPException(400, "Especifica dev_org_id")
    from services.advisor_authorization import list_all_for_dev
    items = await list_all_for_dev(db, dev_org, status=status)
    items = await _enrich_with_asesor_info(db, items)
    return {"items": items, "total": len(items)}


@router.post("/api/dev/whitelist/{auth_id}/approve")
async def dev_whitelist_approve(
    auth_id: str, payload: ApproveIn, request: Request,
):
    user = await _auth_dev(request)
    db = _db(request)
    # Multi-tenant check
    await _assert_dev_owns_auth(db, auth_id, user)
    from services.advisor_authorization import approve
    try:
        doc = await approve(db, auth_id, user.user_id, payload.comentario)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return doc


@router.post("/api/dev/whitelist/{auth_id}/reject")
async def dev_whitelist_reject(
    auth_id: str, payload: RejectIn, request: Request,
):
    user = await _auth_dev(request)
    db = _db(request)
    await _assert_dev_owns_auth(db, auth_id, user)
    from services.advisor_authorization import reject
    try:
        doc = await reject(db, auth_id, user.user_id, payload.comentario)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return doc


@router.post("/api/dev/whitelist/{auth_id}/revoke")
async def dev_whitelist_revoke(
    auth_id: str, payload: RevokeIn, request: Request,
):
    user = await _auth_dev(request)
    db = _db(request)
    await _assert_dev_owns_auth(db, auth_id, user)
    from services.advisor_authorization import revoke
    try:
        doc = await revoke(db, auth_id, user.user_id, payload.reason)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return doc


@router.post("/api/dev/whitelist/bulk-approve")
async def dev_whitelist_bulk_approve(payload: BulkApproveIn, request: Request):
    user = await _auth_dev(request)
    db = _db(request)
    dev_org = _dev_org_id_of(user) if user.role != "superadmin" else None
    # Validate ownership of each auth_id
    if dev_org:
        for auth_id in payload.auth_ids:
            auth = await db.dev_advisor_authorizations.find_one(
                {"auth_id": auth_id}, {"_id": 0, "dev_org_id": 1}
            )
            if not auth or auth.get("dev_org_id") != dev_org:
                raise HTTPException(403, f"auth_id {auth_id} no pertenece a tu organización")
    from services.advisor_authorization import bulk_approve
    result = await bulk_approve(db, payload.auth_ids, user.user_id, payload.comentario)
    return result


# ═══ Auto-Approve Rule ══════════════════════════════════════════════════════

@router.get("/api/dev/auto-approve-rule")
async def get_auto_approve_rule(request: Request):
    user = await _auth_dev(request)
    db = _db(request)
    dev_org = _dev_org_id_of(user) if user.role != "superadmin" else None
    if not dev_org:
        raise HTTPException(400, "Especifica dev_org_id")
    from services.auto_approve_engine import get_rule
    return await get_rule(db, dev_org)


@router.put("/api/dev/auto-approve-rule")
async def upsert_auto_approve_rule(payload: AutoApproveRuleIn, request: Request):
    user = await _auth_dev(request)
    db = _db(request)
    dev_org = _dev_org_id_of(user) if user.role != "superadmin" else None
    if not dev_org:
        raise HTTPException(400, "Especifica dev_org_id")
    from services.auto_approve_engine import upsert_rule
    rule = await upsert_rule(
        db,
        dev_org_id=dev_org,
        modified_by=user.user_id,
        enabled=payload.enabled,
        threshold_trust_score=payload.threshold_trust_score,
        require_zona_expertise=payload.require_zona_expertise,
        target_colonias=payload.target_colonias,
        min_deals_closed_12m=payload.min_deals_closed_12m,
    )
    try:
        from routes.dev_batch14 import log_activity
        await log_activity(
            db, user.user_id, "developer_admin", "update",
            dev_org, "auto_approve_rule",
            metadata={"enabled": payload.enabled, "threshold": payload.threshold_trust_score},
        )
    except Exception:
        pass
    return rule


@router.post("/api/dev/auto-approve-rule/simulate")
async def simulate_auto_approve(payload: SimulateRuleIn, request: Request):
    user = await _auth_dev(request)
    db = _db(request)
    dev_org = _dev_org_id_of(user) if user.role != "superadmin" else None
    if not dev_org:
        raise HTTPException(400, "Especifica dev_org_id")
    from services.auto_approve_engine import simulate_rule
    return await simulate_rule(
        db,
        dev_org_id=dev_org,
        threshold_trust_score=payload.threshold_trust_score,
        require_zona_expertise=payload.require_zona_expertise,
        target_colonias=payload.target_colonias,
        min_deals_closed_12m=payload.min_deals_closed_12m,
    )


# ─── Private helpers ──────────────────────────────────────────────────────────

async def _assert_dev_owns_auth(db, auth_id: str, user) -> None:
    """403 si el auth_id no pertenece al dev_org del user (excepto superadmin)."""
    if user.role == "superadmin":
        return
    dev_org = _dev_org_id_of(user)
    auth = await db.dev_advisor_authorizations.find_one(
        {"auth_id": auth_id}, {"_id": 0, "dev_org_id": 1}
    )
    if not auth:
        raise HTTPException(404, "Solicitud no encontrada")
    if auth.get("dev_org_id") != dev_org:
        raise HTTPException(403, "Sin acceso a esta solicitud")


async def _enrich_with_asesor_info(
    db, items: list
) -> list:
    """Adds asesor user info (name, email, trust_score) to each item."""
    if not items:
        return items
    asesor_ids = list({item["asesor_id"] for item in items})
    users = await db.users.find(
        {"user_id": {"$in": asesor_ids}},
        {"_id": 0, "user_id": 1, "name": 1, "email": 1, "picture": 1},
    ).to_list(500)
    user_map = {u["user_id"]: u for u in users}

    # Get trust scores
    ts_docs = await db.asesor_trust_scores.find(
        {"asesor_id": {"$in": asesor_ids}},
        {"_id": 0, "asesor_id": 1, "score": 1},
    ).to_list(500)
    ts_map = {t["asesor_id"]: t.get("score", 0) for t in ts_docs}

    enriched = []
    for item in items:
        aid = item["asesor_id"]
        u = user_map.get(aid, {})
        item["asesor_name"] = u.get("name", aid)
        item["asesor_email"] = u.get("email", "")
        item["asesor_picture"] = u.get("picture", "")
        item["asesor_trust_score"] = int(ts_map.get(aid, 0))
        enriched.append(item)
    return enriched
