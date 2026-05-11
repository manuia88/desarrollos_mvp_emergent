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


# ─── Endpoints usuario (asesor/superadmin) ─────────────────────────────────────

@router.post("/api/whatsapp/messages")
async def send_whatsapp_message(body: SendMessageIn, request: Request):
    """Envía mensaje WhatsApp vía provider activo."""
    user = await _get_user(request)
    if getattr(user, "role", None) not in ("superadmin", "advisor", "asesor_admin", "asesor_freelance"):
        raise HTTPException(403, "Acceso denegado")

    import os as _os
    provider = _os.environ.get("WHATSAPP_PROVIDER", "stub").lower()

    db = _db(request)
    org_id = getattr(user, "org_id", None) or getattr(user, "tenant_id", None) or "dmx"
    engine = WAEngine(db, org_id=org_id)

    # Phase Y tier gate solo para providers reales
    if provider != "stub":
        phase_ok = await engine._check_phase_y()
        if not phase_ok:
            raise HTTPException(403, "WhatsApp Business no habilitado — activa tier whatsapp_business en Phase Y settings")

    result = await engine.send_message(
        to_number=body.to_number,
        body=body.body,
        lead_id=body.lead_id,
        template_name=body.template,
        variables=body.variables,
    )
    return JSONResponse(result)


@router.get("/api/whatsapp/conversations")
async def get_conversation(lead_id: str, request: Request):
    """Retorna hilo de mensajes de un lead."""
    user = await _get_user(request)
    if getattr(user,"role",None) not in ("superadmin", "advisor", "asesor_admin", "asesor_freelance"):
        raise HTTPException(403, "Acceso denegado")

    db = _db(request)
    engine = WAEngine(db, org_id=getattr(user,"org_id",None) or getattr(user,"tenant_id",None) or "dmx")
    msgs = await engine.get_conversation(lead_id)
    return JSONResponse({"ok": True, "messages": msgs, "count": len(msgs)})


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
