"""W3.8 — Partner Management Routes (superadmin) + Webhook receiver.

SUPERADMIN endpoints:
  GET  /api/superadmin/partners
  POST /api/superadmin/partners
  PATCH /api/superadmin/partners/{id}
  GET  /api/superadmin/cross-sell/analytics
  POST /api/superadmin/cross-sell/revenue-events/manual

PUBLIC (HMAC-validated) webhook:
  POST /api/webhooks/partners/{partner_id}/offer-status
"""
from __future__ import annotations

import logging
import secrets
from typing import Optional
from urllib.parse import unquote

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

import cross_sell_engine as cs

log = logging.getLogger("dmx.routes_partners")

router = APIRouter(tags=["partners"])


def _db(request: Request):
    return request.app.state.db


def _ip(request: Request) -> str:
    return request.client.host if request.client else ""


async def _sa(request: Request):
    from permissions import require_superadmin
    return await require_superadmin(request)


# ─── Bodies ───────────────────────────────────────────────────────────────────

class PartnerCreateBody(BaseModel):
    name: str
    type: str
    contact_email: str
    contact_phone: Optional[str] = None
    website: Optional[str] = None
    logo_url: Optional[str] = None
    commission_pct: Optional[float] = None
    revenue_share_pct: Optional[float] = None
    notes: Optional[str] = None
    product_offerings: Optional[list] = None
    status: str = "pending_partnership"


class PartnerPatchBody(BaseModel):
    status: Optional[str] = None
    commission_pct: Optional[float] = None
    revenue_share_pct: Optional[float] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    notes: Optional[str] = None
    logo_url: Optional[str] = None
    website: Optional[str] = None
    product_offerings: Optional[list] = None


class RevenueEventBody(BaseModel):
    partner_offer_id: str
    revenue_mxn: float
    notes: Optional[str] = None


class OfferStatusWebhookBody(BaseModel):
    offer_id: str
    new_status: str
    metadata: Optional[dict] = None


# ─── SUPERADMIN endpoints ────────────────────────────────────────────────────

@router.get("/api/superadmin/partners")
async def list_partners(
    request: Request,
    status: Optional[str] = Query(None),
    type: Optional[str] = Query(None),
    days: int = Query(30, ge=1, le=365),
):
    await _sa(request)
    db = _db(request)

    q: dict = {}
    if status:
        q["status"] = status
    if type:
        q["type"] = type

    cursor = db.partners.find(q, {"_id": 0, "webhook_hmac_secret": 0}).sort("created_at", -1)
    partners = [p async for p in cursor]

    # KPIs
    from datetime import timedelta, timezone, datetime
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    kpi_total = await db.partners.count_documents({})
    kpi_active = await db.partners.count_documents({"status": "active"})
    kpi_pending = await db.partners.count_documents({"status": "pending_partnership"})

    rev_pipeline = [
        {"$match": {"event_at": {"$gte": since}}},
        {"$group": {"_id": None, "total": {"$sum": "$revenue_dmx_mxn"}}},
    ]
    rev_30d = 0
    async for row in db.partner_revenue_events.aggregate(rev_pipeline):
        rev_30d = row.get("total", 0)

    leads_30d = await db.partner_offers.count_documents({"presented_at": {"$gte": since}})

    # Per-partner stats enrichment
    for p in partners:
        p["offers_30d"] = await db.partner_offers.count_documents(
            {"partner_id": p["id"], "presented_at": {"$gte": since}}
        )
        rev_p = 0
        async for row in db.partner_revenue_events.aggregate([
            {"$match": {"partner_id": p["id"], "event_at": {"$gte": since}}},
            {"$group": {"_id": None, "total": {"$sum": "$revenue_dmx_mxn"}}},
        ]):
            rev_p = row.get("total", 0)
        p["revenue_30d_mxn"] = rev_p
        # Don't expose HMAC in list
        p.pop("webhook_hmac_secret", None)

    return {
        "items": partners,
        "count": len(partners),
        "kpis": {
            "total_partners": kpi_total,
            "active": kpi_active,
            "pending_partnership": kpi_pending,
            "revenue_30d_mxn": rev_30d,
            "leads_30d": leads_30d,
        },
    }


@router.post("/api/superadmin/partners")
async def create_partner(body: PartnerCreateBody, request: Request):
    user = await _sa(request)
    db = _db(request)

    if body.type not in cs.PARTNER_TYPES:
        raise HTTPException(400, f"type inválido. Valores: {', '.join(sorted(cs.PARTNER_TYPES))}")

    from datetime import datetime, timezone
    now_iso = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": cs._new_id("prt"),
        "name": body.name,
        "type": body.type,
        "contact_email": body.contact_email.strip().lower(),
        "contact_phone": body.contact_phone,
        "website": body.website,
        "logo_url": body.logo_url,
        "status": body.status,
        "commission_pct": body.commission_pct,
        "revenue_share_pct": body.revenue_share_pct,
        "notes": body.notes,
        "product_offerings": body.product_offerings or [],
        "activated_at": now_iso if body.status == "active" else None,
        "webhook_hmac_secret": secrets.token_hex(32),
        "created_at": now_iso,
    }
    await db.partners.insert_one(doc)
    doc.pop("_id", None)

    # Send welcome email to partner contact (if Resend configured)
    import os
    resend_key = os.environ.get("RESEND_API_KEY", "")
    email_sent = False
    if resend_key and not resend_key.startswith("re_placeholder") and body.contact_email:
        try:
            import httpx
            from datetime import datetime, timezone
            html = f"""<div style="font-family:sans-serif;max-width:520px">
              <h2 style="color:#6366f1">Bienvenido a la red DMX — {body.name}</h2>
              <p>Tu partnership con DesarrollosMX ha sido registrado.</p>
              <p>Status actual: <strong>{body.status}</strong></p>
              <p>El equipo de DesarrollosMX se comunicará contigo para configurar la integración.</p>
              <p style="color:#6b7280;font-size:12px">{datetime.now(timezone.utc).isoformat()}</p>
            </div>"""
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.post(
                    "https://api.resend.com/emails",
                    headers={"Authorization": f"Bearer {resend_key}", "Content-Type": "application/json"},
                    json={
                        "from": "DesarrollosMX <partners@desarrollosmx.io>",
                        "to": [body.contact_email],
                        "subject": f"Registro partnership DMX — {body.name}",
                        "html": html,
                    },
                )
            email_sent = r.status_code < 300
        except Exception:
            pass

    try:
        from audit_log import log_mutation
        await log_mutation(db, user, "create", "partner", doc["id"],
                           before=None, after=doc, request=request)
    except Exception:
        pass

    return {**doc, "welcome_email_sent": email_sent}


@router.patch("/api/superadmin/partners/{partner_id}")
async def update_partner(partner_id: str, body: PartnerPatchBody, request: Request):
    user = await _sa(request)
    db = _db(request)
    pid = unquote(partner_id)

    existing = await db.partners.find_one({"id": pid}, {"_id": 0})
    if not existing:
        raise HTTPException(404, f"Partner {pid} no encontrado")

    from datetime import datetime, timezone
    update: dict = {}
    for field, val in body.model_dump(exclude_none=True).items():
        update[field] = val

    # When activating partner, stamp activated_at
    if body.status == "active" and existing.get("status") != "active":
        update["activated_at"] = datetime.now(timezone.utc).isoformat()

    if not update:
        return existing

    await db.partners.update_one({"id": pid}, {"$set": update})
    updated = await db.partners.find_one({"id": pid}, {"_id": 0, "webhook_hmac_secret": 0})

    try:
        from audit_log import log_mutation
        await log_mutation(db, user, "update", "partner", pid,
                           before=existing, after=update, request=request)
    except Exception:
        pass

    return updated


@router.get("/api/superadmin/partners/{partner_id}")
async def get_partner_detail(partner_id: str, request: Request):
    """Return partner detail including webhook HMAC secret (superadmin only)."""
    await _sa(request)
    db = _db(request)
    pid = unquote(partner_id)
    p = await db.partners.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(404, f"Partner {pid} no encontrado")

    # Include recent offer timeline
    from datetime import datetime, timezone, timedelta
    since = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    cursor = db.partner_offers.find(
        {"partner_id": pid, "presented_at": {"$gte": since}},
        {"_id": 0, "buyer_id_hash": 0},
    ).sort("presented_at", -1).limit(20)
    recent_offers = [d async for d in cursor]

    # Revenue ledger
    rev_cursor = db.partner_revenue_events.find(
        {"partner_id": pid},
        {"_id": 0},
    ).sort("event_at", -1).limit(50)
    revenue_ledger = [d async for d in rev_cursor]

    return {
        **p,
        "recent_offers": recent_offers,
        "revenue_ledger": revenue_ledger,
        "webhook_instructions": {
            "endpoint": f"/api/webhooks/partners/{pid}/offer-status",
            "method": "POST",
            "headers": {
                "Content-Type": "application/json",
                "X-DMX-Signature": "<hmac_sha256_hex(body, hmac_secret)>",
            },
            "hmac_secret": p.get("webhook_hmac_secret", ""),
            "body_example": {
                "offer_id": "off_XXXX",
                "new_status": "partner_contacted_buyer",
                "metadata": {},
            },
        },
    }


@router.get("/api/superadmin/cross-sell/analytics")
async def cross_sell_analytics(
    request: Request,
    days: int = Query(30, ge=1, le=365),
):
    await _sa(request)
    db = _db(request)
    return await cs.compute_funnel_analytics(db, days=days)


@router.post("/api/superadmin/cross-sell/revenue-events/manual")
async def manual_revenue_event(body: RevenueEventBody, request: Request):
    user = await _sa(request)
    db = _db(request)

    try:
        event = await cs.record_revenue_event(
            db,
            partner_offer_id=body.partner_offer_id,
            revenue_mxn=body.revenue_mxn,
            source="manual_admin",
            admin_user_id=getattr(user, "user_id", ""),
        )
    except ValueError as exc:
        raise HTTPException(404, str(exc))

    try:
        from audit_log import log_mutation
        await log_mutation(db, user, "create", "revenue_event", event["id"],
                           before=None, after=event, request=request)
    except Exception:
        pass

    return event


# ─── PUBLIC webhook (HMAC-validated) ─────────────────────────────────────────

@router.post("/api/webhooks/partners/{partner_id}/offer-status")
async def partner_webhook(
    partner_id: str,
    request: Request,
):
    """PUBLIC — receives partner status update webhooks. Validates HMAC signature.

    H2 integration point for SOC Asesores or other partners.
    Configure: partner sends POST with X-DMX-Signature: hmac_sha256(body, hmac_secret).
    """
    pid = unquote(partner_id)
    db = _db(request)

    partner = await db.partners.find_one({"id": pid}, {"_id": 0, "webhook_hmac_secret": 1})
    if not partner:
        raise HTTPException(404, "Partner no encontrado")

    body_bytes = await request.body()
    signature = request.headers.get("X-DMX-Signature", "")

    secret = partner.get("webhook_hmac_secret", "")
    if not cs.verify_webhook_hmac(secret, body_bytes, signature):
        log.warning("[webhook] HMAC validation failed for partner %s from %s", pid, _ip(request))
        raise HTTPException(401, "Firma HMAC inválida")

    import json
    try:
        payload = json.loads(body_bytes)
    except Exception:
        raise HTTPException(400, "JSON inválido")

    offer_id = payload.get("offer_id")
    new_status = payload.get("new_status")
    metadata = payload.get("metadata") or {}

    if not offer_id or not new_status:
        raise HTTPException(400, "offer_id y new_status son requeridos")
    if new_status not in cs.OFFER_STATUSES:
        raise HTTPException(400, f"new_status inválido. Valores: {', '.join(sorted(cs.OFFER_STATUSES))}")

    result = await cs.track_offer_event(db, offer_id, new_status, metadata)
    if not result.get("ok"):
        raise HTTPException(404, result.get("reason", "offer_not_found"))

    await cs.track_offer_event(db, offer_id, new_status, metadata)

    from compliance_engine import log_compliance_event
    await log_compliance_event(
        db, action="webhook_received",
        endpoint=f"/api/webhooks/partners/{pid}/offer-status",
        requestor_ip=_ip(request),
        extra={"offer_id": offer_id, "new_status": new_status},
    )

    return {"ok": True, "offer_id": offer_id, "new_status": new_status}
