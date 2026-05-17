"""W5.ASR.5 Partes 1+2 — Lead Capture Routes.

Endpoints:
    POST /api/webhooks/email-inbound                   (público · valida X-Capture-Secret)
    GET  /api/asesor/lead-capture/aliases              (auth asesor)
    POST /api/asesor/lead-capture/aliases              (auth asesor)
    POST /api/webhooks/fb-lead-ads                     (público · valida X-Capture-Secret)
    GET  /api/asesor/lead-capture/fb-config            (auth asesor)
    POST /api/asesor/lead-capture/fb-config            (auth asesor)
    GET  /api/superadmin/lead-capture/stats?days=30    (auth superadmin)
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import os
import secrets
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

log = logging.getLogger("dmx.lead_capture_routes")
router = APIRouter(tags=["lead-capture"])


# ─── Auth helpers ─────────────────────────────────────────────────────────────

def _verify_capture_secret(request: Request) -> bool:
    """Valida que el header X-Capture-Secret coincida con LEAD_CAPTURE_SECRET env var."""
    expected = os.environ.get("LEAD_CAPTURE_SECRET", "")
    if not expected:
        # Secret no configurado → modo dev local · aceptar todo
        return True
    provided = request.headers.get("X-Capture-Secret", "")
    return hmac.compare_digest(expected, provided)


async def _auth_asesor(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    role = (getattr(user, "role", "") or "").lower()
    allowed = {"advisor", "asesor", "asesor_admin", "asesor_freelance", "broker", "superadmin"}
    if role not in allowed:
        raise HTTPException(403, "Solo asesores tienen acceso a lead capture")
    return user


def _db(request: Request):
    return request.app.state.db


# ─── Pydantic ──────────────────────────────────────────────────────────────────

class AliasCreate(BaseModel):
    alias_slug: Optional[str] = Field(None, max_length=40)


class FbConfigCreate(BaseModel):
    fb_page_id: str = Field(..., min_length=1, max_length=80)
    form_id: str = Field(..., min_length=1, max_length=80)
    stub_mode: bool = True


# ─── Alias endpoints ──────────────────────────────────────────────────────────

@router.get("/api/asesor/lead-capture/aliases")
async def list_my_aliases(request: Request) -> Dict[str, Any]:
    user = await _auth_asesor(request)
    db = _db(request)
    asesor_id = getattr(user, "user_id", "")
    from lead_capture_engine import list_aliases_by_asesor
    aliases = await list_aliases_by_asesor(db, asesor_id)
    return {"aliases": aliases, "count": len(aliases)}


@router.post("/api/asesor/lead-capture/aliases", status_code=201)
async def create_my_alias(body: AliasCreate, request: Request) -> Dict[str, Any]:
    user = await _auth_asesor(request)
    db = _db(request)
    asesor_id = getattr(user, "user_id", "")

    from lead_capture_engine import register_alias
    result = await register_alias(db, asesor_id=asesor_id, alias_slug=body.alias_slug)
    return {
        "ok": True,
        "alias_email": result["alias_email"],
        "alias_slug": result["alias_slug"],
        "created_at": result["created_at"],
        "idempotent": result.get("existed", False),
    }


# ─── Email inbound webhook ─────────────────────────────────────────────────────

@router.post("/api/webhooks/email-inbound")
async def email_inbound_webhook(request: Request) -> Dict[str, Any]:
    """Webhook público para emails inbound reenviados por servicio de email.
    Body: raw email dict (compatible Resend/Postmark inbound webhook format).
    Requiere header X-Capture-Secret == LEAD_CAPTURE_SECRET env var.
    """
    if not _verify_capture_secret(request):
        raise HTTPException(401, "X-Capture-Secret inválido")

    try:
        raw_email = await request.json()
    except Exception:
        raise HTTPException(400, "Payload JSON inválido")

    db = _db(request)

    # Construir mapa alias → asesor en cada request (cacheable en futuro)
    from lead_capture_engine import build_alias_map, process_email_capture
    alias_map = await build_alias_map(db)

    result = await process_email_capture(db, raw_email, alias_map)
    return result


# ─── FB Lead Ads endpoints ────────────────────────────────────────────────────

@router.get("/api/asesor/lead-capture/fb-config")
async def list_fb_configs(request: Request) -> Dict[str, Any]:
    user = await _auth_asesor(request)
    db = _db(request)
    asesor_id = getattr(user, "user_id", "")
    configs = []
    async for doc in db.fb_lead_ads_config.find({"asesor_id": asesor_id}, {"_id": 0}).sort("created_at", -1):
        configs.append(doc)
    return {"configs": configs, "count": len(configs)}


@router.post("/api/asesor/lead-capture/fb-config", status_code=201)
async def create_fb_config(body: FbConfigCreate, request: Request) -> Dict[str, Any]:
    user = await _auth_asesor(request)
    db = _db(request)
    asesor_id = getattr(user, "user_id", "")

    # Verificar si ya existe config para este form_id + asesor
    existing = await db.fb_lead_ads_config.find_one(
        {"asesor_id": asesor_id, "form_id": body.form_id}, {"_id": 0}
    )
    if existing:
        return {
            "ok": True,
            "id": existing["id"],
            "fb_page_id": existing["fb_page_id"],
            "form_id": existing["form_id"],
            "stub_mode": existing["stub_mode"],
            "active": existing["active"],
            "idempotent": True,
        }

    from datetime import datetime, timezone
    import secrets as _secrets
    config_id = f"fbcfg_{_secrets.token_urlsafe(10)}"
    doc = {
        "id": config_id,
        "asesor_id": asesor_id,
        "fb_page_id": body.fb_page_id,
        "form_id": body.form_id,
        "webhook_secret": _secrets.token_urlsafe(24),
        "stub_mode": body.stub_mode,
        "active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.fb_lead_ads_config.insert_one(dict(doc))
    doc.pop("_id", None)
    # Omitir webhook_secret en respuesta
    doc.pop("webhook_secret", None)

    return {"ok": True, **doc, "idempotent": False}


@router.get("/api/webhooks/fb-lead-ads")
async def fb_lead_ads_challenge(request: Request):
    """Verificación de webhook Meta (GET challenge)."""
    params = dict(request.query_params)
    challenge = params.get("hub.challenge", "")
    verify_token = params.get("hub.verify_token", "")
    expected_token = os.environ.get("META_VERIFY_TOKEN", "")
    if expected_token and verify_token != expected_token:
        raise HTTPException(403, "hub.verify_token inválido")
    return int(challenge) if challenge.isdigit() else challenge


@router.post("/api/webhooks/fb-lead-ads")
async def fb_lead_ads_webhook(request: Request) -> Dict[str, Any]:
    """Webhook FB Lead Ads (STUB MODE · Meta App Review pendiente).
    Requiere header X-Capture-Secret == LEAD_CAPTURE_SECRET.
    Cuando stub_mode=False (futuro): también valida X-Hub-Signature-256.
    """
    if not _verify_capture_secret(request):
        raise HTTPException(401, "X-Capture-Secret inválido")

    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(400, "Payload JSON inválido")

    db = _db(request)

    # Lookup config por form_id — si no hay match, no procesar
    form_id = str(payload.get("form_id") or "")
    if not form_id:
        return {"captured": False, "reason": "form_id_missing"}

    config = await db.fb_lead_ads_config.find_one(
        {"form_id": form_id, "active": True}, {"_id": 0}
    )
    if config is None:
        return {"captured": False, "reason": "no_form_id_match"}

    stub_mode = config.get("stub_mode", True)

    # Validar firma Meta si stub_mode=False
    if not stub_mode:
        meta_secret = os.environ.get("META_APP_SECRET", "")
        if not meta_secret:
            raise HTTPException(
                503,
                "Meta credentials not configured · use stub_mode=true",
            )
        hub_sig = request.headers.get("X-Hub-Signature-256", "")
        raw_body = await request.body()
        expected_sig = "sha256=" + hmac.new(
            meta_secret.encode("utf-8"), raw_body, hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(hub_sig, expected_sig):
            raise HTTPException(401, "X-Hub-Signature-256 inválida")

    from lead_capture_engine import process_fb_lead_ad
    result = await process_fb_lead_ad(db, payload, stub_mode=stub_mode)
    return result



# ─── Superadmin stats endpoint ────────────────────────────────────────────────

async def _auth_superadmin(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    role = (getattr(user, "role", "") or "").lower()
    if role != "superadmin":
        raise HTTPException(403, "Solo superadmin tiene acceso a lead capture stats")
    return user


@router.get("/api/superadmin/lead-capture/stats")
async def lead_capture_stats(request: Request, days: int = 30) -> Dict[str, Any]:
    """Estadísticas agregadas de lead capture para superadmin.
    Query param: days=30 (default 30 · max 365)
    """
    await _auth_superadmin(request)
    db = _db(request)

    days = min(max(days, 1), 365)
    from datetime import datetime, timezone, timedelta
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    pipeline_all = [
        {"$match": {"ingested_at": {"$gte": cutoff}}},
        {"$group": {
            "_id": None,
            "total": {"$sum": 1},
            "captured": {"$sum": {"$cond": ["$success", 1, 0]}},
        }},
    ]
    agg_all = await db.lead_capture_events.aggregate(pipeline_all).to_list(1)
    totals = agg_all[0] if agg_all else {"total": 0, "captured": 0}
    total = totals.get("total", 0)
    captured = totals.get("captured", 0)
    success_rate = round((captured / total) * 100, 1) if total > 0 else 0.0

    # Por source
    pipeline_by_source = [
        {"$match": {"ingested_at": {"$gte": cutoff}, "success": True}},
        {"$group": {"_id": "$source", "count": {"$sum": 1}}},
    ]
    by_source_raw = await db.lead_capture_events.aggregate(pipeline_by_source).to_list(50)
    by_source = {doc["_id"]: doc["count"] for doc in by_source_raw if doc["_id"]}

    # Failures por reason
    pipeline_failures = [
        {"$match": {"ingested_at": {"$gte": cutoff}, "success": False}},
        {"$group": {"_id": "$error_msg", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 10},
    ]
    failures_raw = await db.lead_capture_events.aggregate(pipeline_failures).to_list(10)
    failures_by_reason = {doc["_id"] or "unknown": doc["count"] for doc in failures_raw}

    # Top aliases por capturas exitosas
    pipeline_aliases = [
        {"$match": {"ingested_at": {"$gte": cutoff}, "success": True,
                    "source": {"$in": ["email_alias", "portal_inmuebles24", "portal_lamudi"]}}},
        # Join alias info via lead → alias_email_matched
        {"$lookup": {
            "from": "leads",
            "localField": "parsed_lead_id",
            "foreignField": "id",
            "as": "_lead",
        }},
        {"$unwind": {"path": "$_lead", "preserveNullAndEmptyArrays": True}},
        {"$group": {
            "_id": "$_lead.alias_email_matched",
            "count": {"$sum": 1},
        }},
        {"$sort": {"count": -1}},
        {"$limit": 10},
    ]
    aliases_raw = await db.lead_capture_events.aggregate(pipeline_aliases).to_list(10)
    top_aliases = [{"alias": doc["_id"] or "sin_alias", "count": doc["count"]} for doc in aliases_raw if doc.get("_id")]

    # Top FB forms
    pipeline_fb = [
        {"$match": {"ingested_at": {"$gte": cutoff}, "success": True, "source": "fb_lead_ads"}},
        {"$lookup": {
            "from": "leads",
            "localField": "parsed_lead_id",
            "foreignField": "id",
            "as": "_lead",
        }},
        {"$unwind": {"path": "$_lead", "preserveNullAndEmptyArrays": True}},
        {"$group": {"_id": "$_lead.fb_form_id", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 10},
    ]
    fb_raw = await db.lead_capture_events.aggregate(pipeline_fb).to_list(10)
    top_fb_forms = [{"form_id": doc["_id"] or "unknown", "count": doc["count"]} for doc in fb_raw if doc.get("_id")]

    return {
        "days": days,
        "total_events": total,
        "total_captured": captured,
        "success_rate": success_rate,
        "by_source": by_source,
        "failures_by_reason": failures_by_reason,
        "top_aliases": top_aliases,
        "top_fb_forms": top_fb_forms,
    }
