"""W4.10 Sub-Fix 1 — WhatsApp routes.

Prefix: /api/whatsapp + /api/webhooks + /api/superadmin/whatsapp
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from whatsapp_engine import WAEngine, ensure_whatsapp_indexes

log = logging.getLogger("dmx.routes_whatsapp")

router = APIRouter(tags=["whatsapp"])


def _now():
    return datetime.now(timezone.utc)


def _db(request: Request):
    return request.app.state.db


async def _get_user(request: Request) -> Dict[str, Any]:
    from server import get_current_user
    return await get_current_user(request)


# ─── Models ────────────────────────────────────────────────────────────────────

class SendMessageIn(BaseModel):
    lead_id: Optional[str] = None
    to_number: str
    body: str
    template: Optional[str] = None
    variables: Optional[Dict[str, str]] = None


class TemplateIn(BaseModel):
    template_name: str
    category: str = "followup"
    body_text: str
    variables: Optional[List[str]] = None


# (Endpoints no-superadmin /api/whatsapp/messages y /conversations borrados 2026-06-16 ·
#  0 callers · la UI viva usa las rutas asesor/superadmin de WhatsApp)


# ─── Webhook inbound (público) ─────────────────────────────────────────────────

@router.post("/api/webhooks/whatsapp-inbound")
async def whatsapp_inbound_webhook(request: Request):
    """Recibe mensajes entrantes de WhatsApp (Twilio/Meta)."""
    content_type = request.headers.get("content-type", "")
    if "form" in content_type:
        form = await request.form()
        payload = dict(form)
    else:
        payload = await request.json()

    signature = request.headers.get("X-Twilio-Signature", "") or request.headers.get("x-hub-signature-256", "")
    url = str(request.url)

    db = request.app.state.db

    # Determinar org desde número destino (simplificado → dmx default)
    engine = WAEngine(db, org_id="dmx")
    try:
        result = await engine.receive_webhook(payload, signature=signature, url=url)
    except ValueError as exc:
        raise HTTPException(401, str(exc))

    # Copiloto E6: si es un comprador NUEVO/público (no contacto de asesor), Atlax conversa y lo lleva a la
    # plataforma. Fail-open (el candado vive en handle_buyer_wa; jamás secuestra hilos del asesor).
    try:
        from_num = (payload.get("From") or payload.get("from") or "").replace("whatsapp:", "")
        body = payload.get("Body") or payload.get("body") or ""
        if from_num and body:
            from routes.whatsapp_copiloto import handle_buyer_wa
            await handle_buyer_wa(db, from_num, body)
    except Exception as _ce:
        import logging as _l
        _l.getLogger("dmx.whatsapp").info(f"[copiloto wa] no aplicó: {_ce}")

    return JSONResponse({"ok": True, **result})


# ─── Superadmin endpoints ──────────────────────────────────────────────────────

@router.get("/api/superadmin/whatsapp/messages")
async def list_whatsapp_messages(
    request: Request,
    org_id: Optional[str] = None,
    direction: Optional[str] = None,
    limit: int = 50,
    skip: int = 0,
):
    user = await _get_user(request)
    if getattr(user,"role",None) != "superadmin":
        raise HTTPException(403, "Solo superadmin")

    db = _db(request)
    query: Dict[str, Any] = {}
    if org_id:
        query["org_id"] = org_id
    if direction:
        query["direction"] = direction

    cursor = db.whatsapp_messages.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit)
    msgs = await cursor.to_list(limit)
    # Serialize datetimes
    for m in msgs:
        for k in ("created_at", "sent_at", "delivered_at", "read_at"):
            if m.get(k) and hasattr(m[k], "isoformat"):
                m[k] = m[k].isoformat()
    total = await db.whatsapp_messages.count_documents(query)

    return JSONResponse({
        "ok": True,
        "messages": msgs,
        "total": total,
        "limit": limit,
        "skip": skip,
    })


@router.post("/api/superadmin/whatsapp/templates")
async def create_template(body: TemplateIn, request: Request):
    user = await _get_user(request)
    if getattr(user,"role",None) != "superadmin":
        raise HTTPException(403, "Solo superadmin")

    db = _db(request)
    org_id = getattr(user,"org_id",None) or "dmx"
    doc = {
        "_id": f"tpl_{__import__('uuid').uuid4().hex[:10]}",
        "org_id": org_id,
        "template_name": body.template_name,
        "category": body.category,
        "body_text": body.body_text,
        "variables": body.variables or [],
        "approved_by_provider": False,
        "created_at": _now(),
    }
    try:
        await db.whatsapp_templates.insert_one(doc)
    except Exception as exc:
        if "duplicate" in str(exc).lower():
            raise HTTPException(409, "Nombre de plantilla ya existe en esta org")
        raise HTTPException(500, str(exc))
    doc.pop("_id", None)
    if doc.get("created_at") and hasattr(doc["created_at"], "isoformat"):
        doc["created_at"] = doc["created_at"].isoformat()  # fecha→ISO: no es JSON-serializable cruda
    return JSONResponse({"ok": True, "template": doc})


@router.get("/api/superadmin/whatsapp/templates")
async def list_templates(request: Request):
    user = await _get_user(request)
    if getattr(user,"role",None) != "superadmin":
        raise HTTPException(403, "Solo superadmin")

    db = _db(request)
    cursor = db.whatsapp_templates.find({"org_id": getattr(user,"org_id",None) or "dmx"}, {"_id": 0}).sort("created_at", -1)
    templates = await cursor.to_list(100)
    for t in templates:
        for k in ("created_at",):
            if t.get(k) and hasattr(t[k], "isoformat"):
                t[k] = t[k].isoformat()
    return JSONResponse({"ok": True, "templates": templates})


@router.get("/api/superadmin/whatsapp/stats")
async def whatsapp_stats(request: Request, days: int = 7):
    user = await _get_user(request)
    if getattr(user,"role",None) != "superadmin":
        raise HTTPException(403, "Solo superadmin")

    db = _db(request)
    from datetime import timedelta
    since = _now() - timedelta(days=days)

    pipeline = [
        {"$match": {"created_at": {"$gte": since}}},
        {"$group": {
            "_id": "$status",
            "count": {"$sum": 1},
        }},
    ]
    status_counts = {}
    async for doc in db.whatsapp_messages.aggregate(pipeline):
        status_counts[doc["_id"]] = doc["count"]

    total = await db.whatsapp_messages.count_documents({"created_at": {"$gte": since}})
    outbound = await db.whatsapp_messages.count_documents({"direction": "outbound", "created_at": {"$gte": since}})
    inbound = await db.whatsapp_messages.count_documents({"direction": "inbound", "created_at": {"$gte": since}})

    return JSONResponse({
        "ok": True,
        "days": days,
        "total": total,
        "outbound": outbound,
        "inbound": inbound,
        "by_status": status_counts,
    })

# W5.FF4 register_feature marker · NO duplicate
from feature_registry import register_feature as _w5ff4_register_feature
_w5ff4_register_feature("whatsapp_business", plan_tier="pro",        monthly_price_mxn=299, category="growth",      name="WhatsApp Business")
