"""W7.AS.1 · Lead Enrichment · REST routes.

4 endpoints:
  POST   /api/leads/{lead_id}/enrich                     (T2+ advisor · own lead)
  POST   /api/leads/enrich-bulk                          (T2+ advisor · max 20)
  GET    /api/leads/{lead_id}/enrichment-cache           (T2+ advisor)
  GET    /api/superadmin/lead-enrichment/stats           (superadmin)
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from lead_enrichment_engine import (
    DAILY_CAP_PER_TENANT,
    _check_daily_cap,
    enrich_lead,
    get_cached_enrichment,
    get_stats,
)
from permissions import require_superadmin

log = logging.getLogger("dmx.routes_lead_enrichment")
router = APIRouter()

_ADVISOR_ROLES = ("superadmin", "advisor", "asesor_admin", "asesor_freelance")
_BULK_MAX = 20


async def _get_user(request: Request):
    from server import get_current_user
    return await get_current_user(request)


async def _require_advisor(request: Request):
    user = await _get_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    role = getattr(user, "role", None)
    if role not in _ADVISOR_ROLES:
        raise HTTPException(403, "Acceso denegado · solo asesor T2+")
    return user


def _actor_from_user(user) -> Dict[str, Any]:
    return {
        "user_id": getattr(user, "user_id", None) or getattr(user, "email", None) or "unknown",
        "role": getattr(user, "role", "unknown"),
    }


async def _resolve_tenant(db, user, lead_doc: Dict[str, Any]) -> Optional[str]:
    """Resuelve tenant_id efectivo · prefiere el del lead, fallback user."""
    if lead_doc and lead_doc.get("tenant_id"):
        return lead_doc["tenant_id"]
    return getattr(user, "tenant_id", None) or getattr(user, "dev_org_id", None)


async def _assert_lead_owner(db, user, lead_id: str) -> Dict[str, Any]:
    """Carga lead y verifica ownership (advisor solo su lead · superadmin bypass)."""
    role = getattr(user, "role", "")
    try:
        lead_doc = await db.leads.find_one(
            {"$or": [{"id": lead_id}, {"lead_id": lead_id}]},
            {"_id": 0},
        )
    except Exception as exc:
        log.warning(f"[lead_enrichment] lead fetch failed: {exc}")
        raise HTTPException(500, "lead lookup failed") from exc

    if not lead_doc:
        raise HTTPException(404, "Lead no encontrado")

    if role == "superadmin":
        return lead_doc

    uid = getattr(user, "user_id", None) or getattr(user, "email", None)
    tenant = getattr(user, "tenant_id", None) or getattr(user, "dev_org_id", None)
    owner_id = (
        lead_doc.get("owner_user_id")
        or lead_doc.get("advisor_user_id")
        or lead_doc.get("assigned_to")
    )
    if owner_id and uid and owner_id == uid:
        return lead_doc
    if tenant and lead_doc.get("tenant_id") == tenant:
        return lead_doc
    raise HTTPException(403, "Lead no pertenece al asesor")


# ─── Models ──────────────────────────────────────────────────────────────────

class EnrichIn(BaseModel):
    force_refresh: bool = False


class EnrichBulkIn(BaseModel):
    lead_ids: List[str] = Field(..., min_length=1, max_length=_BULK_MAX)
    force_refresh: bool = False


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.post("/api/leads/{lead_id}/enrich")
async def enrich_endpoint(lead_id: str, body: EnrichIn, request: Request):
    user = await _require_advisor(request)
    db = request.app.state.db
    is_sa = getattr(user, "role", "") == "superadmin"

    lead_doc = await _assert_lead_owner(db, user, lead_id)
    tenant_id = await _resolve_tenant(db, user, lead_doc)

    allowed, used = await _check_daily_cap(db, tenant_id, is_superadmin=is_sa)
    if not allowed:
        raise HTTPException(
            429,
            f"daily_cap_exceeded · max {DAILY_CAP_PER_TENANT}/día · usado={used}",
        )

    return await enrich_lead(
        db,
        lead_id=lead_id,
        lead_data={
            "email": lead_doc.get("email"),
            "phone": lead_doc.get("phone"),
            "full_name": lead_doc.get("full_name") or lead_doc.get("name"),
            "tenant_id": tenant_id,
        },
        tenant_id=tenant_id,
        actor=_actor_from_user(user),
        force_refresh=bool(body.force_refresh),
        is_superadmin=is_sa,
    )


@router.post("/api/leads/enrich-bulk")
async def enrich_bulk_endpoint(body: EnrichBulkIn, request: Request):
    user = await _require_advisor(request)
    db = request.app.state.db
    is_sa = getattr(user, "role", "") == "superadmin"

    if len(body.lead_ids) > _BULK_MAX:
        raise HTTPException(400, f"max {_BULK_MAX} leads por request")

    actor = _actor_from_user(user)
    results: List[Dict[str, Any]] = []
    skipped: List[Dict[str, Any]] = []

    for lid in body.lead_ids:
        try:
            lead_doc = await _assert_lead_owner(db, user, lid)
        except HTTPException as he:
            skipped.append({"lead_id": lid, "skipped": True, "reason": he.detail})
            continue

        tenant_id = await _resolve_tenant(db, user, lead_doc)

        allowed, used = await _check_daily_cap(db, tenant_id, is_superadmin=is_sa)
        if not allowed:
            skipped.append({
                "lead_id": lid, "skipped": True,
                "reason": f"daily_cap_exceeded · usado={used}",
            })
            continue

        try:
            res = await enrich_lead(
                db,
                lead_id=lid,
                lead_data={
                    "email": lead_doc.get("email"),
                    "phone": lead_doc.get("phone"),
                    "full_name": lead_doc.get("full_name") or lead_doc.get("name"),
                    "tenant_id": tenant_id,
                },
                tenant_id=tenant_id,
                actor=actor,
                force_refresh=bool(body.force_refresh),
                is_superadmin=is_sa,
            )
            results.append(res)
        except Exception as exc:
            log.warning(f"[lead_enrichment] bulk item failed {lid}: {exc}")
            skipped.append({"lead_id": lid, "skipped": True, "reason": str(exc)[:120]})

    total_cost = round(sum(r.get("cost_usd", 0.0) for r in results), 4)
    return {
        "status": "ok",
        "processed": len(results),
        "skipped": len(skipped),
        "items": results,
        "skipped_items": skipped,
        "total_cost_usd": total_cost,
    }


@router.get("/api/leads/{lead_id}/enrichment-cache")
async def cache_endpoint(lead_id: str, request: Request):
    user = await _require_advisor(request)
    db = request.app.state.db
    await _assert_lead_owner(db, user, lead_id)
    return await get_cached_enrichment(db, lead_id)


@router.get("/api/superadmin/lead-enrichment/stats")
async def stats_endpoint(
    request: Request, days: int = 30, tenant_id: Optional[str] = None,
):
    await require_superadmin(request)
    db = request.app.state.db
    return await get_stats(db, tenant_id=tenant_id, days=days)
