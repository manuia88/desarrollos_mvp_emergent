"""Phase 4 Batch 16 · Sub-Chunk C — Public Booking Page endpoints.

Public (no-auth) endpoints that power `/reservar/:slug`:

    GET  /api/public/projects/{slug}/booking         → project basic info + asesor pool
    POST /api/public/projects/{slug}/availability    → available slots for a date range
    POST /api/public/projects/{slug}/book            → create lead + auto-assign appointment

Minimal lead capture per user choice (Sub-Chunk C, opt A): name + phone + email.
Confirmation channel: WhatsApp stub (logs message). Resend key is not required.
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, EmailStr

log = logging.getLogger("dmx.batch16_public")

router = APIRouter(tags=["batch16_public"])


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _db(req: Request):
    return req.app.state.db


def _whatsapp_stub(phone: str, text: str, context: Dict[str, Any] = None) -> Dict[str, Any]:
    """Honest WhatsApp stub: logs message + persists audit entry. Real API pending user action."""
    log.info(f"[whatsapp-stub] → {phone} :: {text[:140]}")
    return {"ok": True, "channel": "whatsapp", "stub": True,
            "to": phone, "body": text, "context": context or {}}


async def _get_dev_branding(db, tenant_id: str) -> Dict[str, Any]:
    """B19.5 — Get org branding for the developer org, fallback to DMX defaults."""
    try:
        from branding_helpers import get_org_branding
        return await get_org_branding(db, tenant_id or "dmx")
    except Exception:
        return {
            "logo_url": None,
            "primary_color": "#06080F",
            "accent_color": "#F4E9D8",
            "display_name": "DesarrollosMX",
            "tagline": None,
        }


# ─── A. Project booking info ─────────────────────────────────────────────────

@router.get("/api/public/projects/{slug}/booking")
async def get_public_booking_info(slug: str, request: Request):
    """Returns the project info required to render the public booking page."""
    db = _db(request)
    from projects_unified import get_project_by_slug
    proj = await get_project_by_slug(db, slug)
    if not proj:
        raise HTTPException(404, "Proyecto no encontrado")

    from data_developments import DEVELOPERS_BY_ID
    dev = DEVELOPERS_BY_ID.get(proj.get("developer_id")) or {}

    # Apply overlay if exists (prices may be synced from docs)
    try:
        from routes_public import _ensure_overlay_loaded, _apply_overlay
        await _ensure_overlay_loaded(slug, db)
        proj_pub = _apply_overlay(proj)
    except Exception:
        proj_pub = proj

    # Policy & pool presence — returns capability flags, not IDs
    policy = await db.appointment_policies.find_one(
        {"project_id": slug}, {"_id": 0, "asesor_pool": 1, "slot_duration_min": 1,
                                "working_hours": 1, "policy_type": 1},
    )
    pool_size = len(policy.get("asesor_pool", [])) if policy else 0

    # Hero photo: first asset if any, else first seed photo
    hero_photo = ""
    try:
        asset = await db.dev_assets.find_one(
            {"development_id": slug, "asset_type": {"$in": ["foto_render"]}},
            {"_id": 0, "public_url": 1}, sort=[("position", 1), ("created_at", 1)],
        )
        if asset and asset.get("public_url"):
            hero_photo = asset["public_url"]
    except Exception:
        pass
    if not hero_photo:
        photos = proj_pub.get("photos", []) or []
        if photos:
            hero_photo = photos[0] if isinstance(photos[0], str) else photos[0].get("url", "")

    return {
        "slug": slug,
        "name": proj_pub.get("name"),
        "colonia": proj_pub.get("colonia_id"),
        "address": proj_pub.get("address") or proj_pub.get("location", {}).get("address", ""),
        "price_from": proj_pub.get("price_from"),
        "price_to": proj_pub.get("price_to"),
        "stage": proj_pub.get("stage"),
        "description": (proj_pub.get("description") or "")[:480],
        "hero_photo": hero_photo,
        "developer": {
            "id": dev.get("id"),
            "name": dev.get("name"),
        },
        "booking_enabled": pool_size > 0,
        "pool_size": pool_size,
        "slot_duration_min": (policy or {}).get("slot_duration_min", 60),
        "policy_type": (policy or {}).get("policy_type", "round_robin"),
        # B19.5 — org branding for public booking page
        "dev_branding": await _get_dev_branding(db, proj_pub.get("developer_id") or proj_pub.get("dev_org_id") or "dmx"),
    }


# ─── B. Public availability (wraps B15 engine without auth) ──────────────────

class PublicAvailabilityIn(BaseModel):
    date_from: str
    date_to: str


@router.post("/api/public/projects/{slug}/availability")
async def post_public_availability(slug: str, body: PublicAvailabilityIn, request: Request):
    db = _db(request)
    from projects_unified import get_project_by_slug
    proj = await get_project_by_slug(db, slug)
    if not proj:
        raise HTTPException(404, "Proyecto no encontrado")

    try:
        dfrom = datetime.fromisoformat(body.date_from.replace("Z", "+00:00"))
        dto = datetime.fromisoformat(body.date_to.replace("Z", "+00:00"))
    except ValueError as e:
        raise HTTPException(400, f"Fecha inválida: {e}")

    if dto - dfrom > timedelta(days=14):
        raise HTTPException(400, "Rango máximo: 14 días")

    from availability import get_available_slots
    slots = await get_available_slots(db, slug, dfrom, dto)

    # Strip internal asesor_ids — public users don't need them
    public_slots = [
        {
            "slot_start": s["slot_start"],
            "slot_end": s["slot_end"],
            "duration_min": s.get("duration_min", 60),
            "asesores_available": len(s.get("available_asesor_ids", [])),
        }
        for s in slots
    ]
    return {"slots": public_slots, "count": len(public_slots), "project_id": slug}


# ─── C. Public booking (creates lead + auto-assign) ──────────────────────────

class PublicBookIn(BaseModel):
    lead_name: str
    lead_email: EmailStr
    lead_phone: str
    slot_start: str
    slot_end: str
    utm_source: Optional[str] = ""
    utm_medium: Optional[str] = ""
    utm_campaign: Optional[str] = ""
    notes: Optional[str] = ""


@router.post("/api/public/projects/{slug}/book")
async def post_public_book(slug: str, body: PublicBookIn, request: Request):
    db = _db(request)
    from projects_unified import get_project_by_slug
    proj = await get_project_by_slug(db, slug)
    if not proj:
        raise HTTPException(404, "Proyecto no encontrado")

    # Rate limit — 3 bookings per email per hour
    since = (_now() - timedelta(hours=1)).isoformat()
    recent = await db.leads.count_documents({
        "email": body.lead_email, "created_at": {"$gte": since},
    })
    if recent >= 3:
        raise HTTPException(429, "Demasiadas solicitudes recientes. Intenta más tarde.")

    # Find or create lead
    lead_doc = await db.leads.find_one({"email": body.lead_email}, {"_id": 0})
    if lead_doc:
        lead_id = lead_doc.get("lead_id") or lead_doc.get("id")
        # Update phone/name if changed
        await db.leads.update_one(
            {"email": body.lead_email},
            {"$set": {"phone": body.lead_phone, "last_touch_at": _now().isoformat()}},
        )
    else:
        lead_id = str(uuid.uuid4())
        await db.leads.insert_one({
            "id": lead_id,
            "lead_id": lead_id,
            "name": body.lead_name[:120],
            "email": body.lead_email,
            "phone": body.lead_phone[:40],
            "project_id": slug,
            "lead_stage": "calificado",
            "source": "public_booking",
            "utm": {
                "source": body.utm_source or "",
                "medium": body.utm_medium or "",
                "campaign": body.utm_campaign or "",
            },
            "created_at": _now().isoformat(),
            "last_touch_at": _now().isoformat(),
        })
        try:
            from routes_dev_batch14 import log_activity
            await log_activity(
                db, lead_id, "lead", "lead_created", lead_id, "lead",
                metadata={"name": body.lead_name, "project_id": slug,
                           "source": "public_booking"},
            )
        except Exception:
            pass

    # Auto-assign via B15 engine
    from availability import assign_appointment
    try:
        result = await assign_appointment(
            db,
            project_id=slug,
            slot_start=body.slot_start,
            slot_end=body.slot_end,
            lead_id=lead_id,
            lead_email=body.lead_email,
            actor_user_id="public_booking",
        )
    except ValueError as e:
        raise HTTPException(409, str(e))

    # Enrich asesor info for confirmation screen
    asesor_name = ""
    asesor_phone = ""
    asesor_doc = await db.users.find_one({"user_id": result["asesor_id"]}, {"_id": 0})
    if asesor_doc:
        asesor_name = asesor_doc.get("name", "")
        asesor_phone = asesor_doc.get("phone", "") or asesor_doc.get("whatsapp", "")

    # WhatsApp stub confirmation to lead
    wa_text = (
        f"Hola {body.lead_name.split(' ')[0]}, agendaste una visita a "
        f"{proj.get('name', slug)} para el {body.slot_start[:16].replace('T', ' ')}. "
        f"Tu asesor {asesor_name} te contactará. — DesarrollosMX"
    )
    wa_result = _whatsapp_stub(
        body.lead_phone, wa_text,
        context={"lead_id": lead_id, "appointment_id": result["appointment_id"]},
    )

    # ML event
    try:
        from observability import emit_ml_event
        await emit_ml_event(
            db, event_type="public_booking_created",
            user_id=lead_id, org_id=proj.get("dev_org_id", "default"),
            role="buyer",
            context={
                "project_id": slug,
                "slot": body.slot_start,
                "utm_source": body.utm_source or "",
                "utm_campaign": body.utm_campaign or "",
            },
            ai_decision={}, user_action={"action": "book"},
        )
    except Exception:
        pass

    return {
        "ok": True,
        "appointment_id": result["appointment_id"],
        "lead_id": lead_id,
        "slot_start": result["slot_start"],
        "slot_end": result["slot_end"],
        "asesor_name": asesor_name,
        "asesor_phone_available": bool(asesor_phone),
        "calendar_html_link": result.get("calendar_html_link", ""),
        "ics": result.get("ics", ""),
        "project_name": proj.get("name"),
        "confirmation": {
            "whatsapp": wa_result,
        },
    }
