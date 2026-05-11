"""Phase 4 Batch 19 — Onboarding Tours + Keyboard Shortcuts + Branding + Cross-portal + Presentation Mode

Sub-chunk A:
  POST /api/preferences/me/tour-complete  {tour_id}
  POST /api/preferences/me/tour-dismiss   {tour_id}

Sub-chunk B:
  GET  /api/orgs/me/branding              → branding del org del user
  PUT  /api/orgs/me/branding              → upsert (admin only)
  POST /api/orgs/me/branding/logo         → upload logo (multipart <500KB)
  DELETE /api/orgs/me/branding/logo       → reset a default
  GET  /api/orgs/cross-portal/events      → polling cross-portal events

Sub-chunk C:
  PATCH /api/preferences/me — extendido para aceptar presentation_mode
  (handled by extending routes_dev_batch18.py PATCH via this router too)
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from pydantic import BaseModel

log = logging.getLogger("dmx.batch19")
router = APIRouter(tags=["batch19"])

UPLOAD_DIR = os.environ.get("IE_UPLOAD_DIR", "/app/backend/uploads/ie_engine")
ORG_LOGOS_DIR = os.path.join(os.path.dirname(UPLOAD_DIR), "org_logos")

# Default branding (DMX design tokens)
DEFAULT_BRANDING = {
    "logo_url": None,
    "primary_color": "#06080F",
    "accent_color": "#F4E9D8",
    "display_name": None,
    "tagline": None,
}

# Roles that can admin branding
ADMIN_ROLES = {"developer_admin", "asesor_admin", "inmobiliaria_admin", "superadmin"}

# Cross-portal event types
CROSS_PORTAL_TRIGGER_EVENTS = {
    "project_published", "lead_created", "asesor_deactivated",
    "commission_updated", "pricing_changed",
}

CROSS_PORTAL_AFFECTED_MAP = {
    "project_published":    ["marketplace", "asesor", "inmobiliaria"],
    "lead_created":         ["asesor", "inmobiliaria"],
    "asesor_deactivated":   ["crm", "marketplace"],
    "commission_updated":   ["asesor", "inmobiliaria"],
    "pricing_changed":      ["marketplace", "asesor"],
}


def _db(request: Request):
    return request.app.state.db


async def _auth(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    return user


# ─── SUB-CHUNK A: Tour endpoints ──────────────────────────────────────────────

class TourActionIn(BaseModel):
    tour_id: str


@router.post("/api/preferences/me/tour-complete")
async def tour_complete(payload: TourActionIn, request: Request):
    """Mark a tour as completed for the current user."""
    user = await _auth(request)
    db = _db(request)

    tour_id = (payload.tour_id or "").strip()
    if not tour_id:
        raise HTTPException(422, "tour_id cannot be empty")

    await db.user_preferences.update_one(
        {"user_id": user.user_id},
        {
            "$addToSet": {"tours_completed": tour_id},
            "$set": {"updated_at": datetime.now(timezone.utc)},
            "$setOnInsert": {"user_id": user.user_id},
        },
        upsert=True,
    )
    return {"ok": True, "tour_id": tour_id, "action": "completed"}


@router.post("/api/preferences/me/tour-dismiss")
async def tour_dismiss(payload: TourActionIn, request: Request):
    """Mark a tour as permanently dismissed for the current user."""
    user = await _auth(request)
    db = _db(request)

    tour_id = (payload.tour_id or "").strip()
    if not tour_id:
        raise HTTPException(422, "tour_id cannot be empty")

    await db.user_preferences.update_one(
        {"user_id": user.user_id},
        {
            "$addToSet": {"tours_dismissed": tour_id},
            "$set": {"updated_at": datetime.now(timezone.utc)},
            "$setOnInsert": {"user_id": user.user_id},
        },
        upsert=True,
    )
    return {"ok": True, "tour_id": tour_id, "action": "dismissed"}


# ─── SUB-CHUNK B: Org Branding endpoints ─────────────────────────────────────

def _tenant_id_for_user(user) -> str:
    """Return the user's tenant_id, defaulting to 'dmx'."""
    return getattr(user, "tenant_id", None) or "dmx"


async def _get_branding(db, tenant_id: str) -> dict:
    """Fetch branding doc for org, merging with defaults."""
    doc = await db.organizations.find_one(
        {"tenant_id": tenant_id}, {"_id": 0, "branding": 1}
    )
    stored = (doc or {}).get("branding") or {}
    return {**DEFAULT_BRANDING, **stored}


@router.get("/api/orgs/me/branding")
async def get_my_branding(request: Request):
    """Returns branding config for the calling user's org."""
    user = await _auth(request)
    db = _db(request)
    tenant_id = _tenant_id_for_user(user)
    branding = await _get_branding(db, tenant_id)
    return {"ok": True, "tenant_id": tenant_id, "branding": branding}


@router.put("/api/orgs/me/branding")
async def put_my_branding(request: Request):
    """Upsert full branding config. Admin roles only."""
    user = await _auth(request)
    if user.role not in ADMIN_ROLES:
        raise HTTPException(403, "Rol no autorizado para modificar branding")

    db = _db(request)
    tenant_id = _tenant_id_for_user(user)

    body = await request.json()

    # Whitelist fields
    allowed = {"logo_url", "primary_color", "accent_color", "display_name", "tagline"}
    branding_update = {k: v for k, v in body.items() if k in allowed}

    # Validate hex colors
    for color_field in ("primary_color", "accent_color"):
        val = branding_update.get(color_field)
        if val is not None:
            if not (val.startswith("#") and len(val) in (4, 7, 9)):
                raise HTTPException(422, f"{color_field} must be a valid hex color")

    await db.organizations.update_one(
        {"tenant_id": tenant_id},
        {
            "$set": {
                **{f"branding.{k}": v for k, v in branding_update.items()},
                "updated_at": datetime.now(timezone.utc),
            },
            "$setOnInsert": {"tenant_id": tenant_id},
        },
        upsert=True,
    )

    # Read back
    branding = await _get_branding(db, tenant_id)
    return {"ok": True, "tenant_id": tenant_id, "branding": branding}


@router.post("/api/orgs/me/branding/logo")
async def upload_branding_logo(request: Request, file: UploadFile = File(...)):
    """Upload org logo. Max 500KB. PNG/SVG only."""
    user = await _auth(request)
    if user.role not in ADMIN_ROLES:
        raise HTTPException(403, "Rol no autorizado para subir logo")

    db = _db(request)
    tenant_id = _tenant_id_for_user(user)

    # Validate file size
    content = await file.read()
    if len(content) > 500 * 1024:
        raise HTTPException(413, "Logo demasiado grande. Máximo 500KB.")

    # Validate mime
    fname = (file.filename or "").lower()
    if not (fname.endswith(".png") or fname.endswith(".svg")):
        raise HTTPException(400, "Solo se aceptan archivos PNG o SVG")

    # Store
    os.makedirs(ORG_LOGOS_DIR, exist_ok=True)
    ext = "svg" if fname.endswith(".svg") else "png"
    logo_id = str(uuid.uuid4())
    dest = os.path.join(ORG_LOGOS_DIR, f"{tenant_id}_{logo_id}.{ext}")
    with open(dest, "wb") as f:
        f.write(content)

    # Relative URL (served from uploads)
    logo_url = f"/api/uploads/org_logos/{tenant_id}_{logo_id}.{ext}"

    await db.organizations.update_one(
        {"tenant_id": tenant_id},
        {
            "$set": {"branding.logo_url": logo_url, "updated_at": datetime.now(timezone.utc)},
            "$setOnInsert": {"tenant_id": tenant_id},
        },
        upsert=True,
    )
    return {"ok": True, "logo_url": logo_url}


@router.delete("/api/orgs/me/branding/logo")
async def delete_branding_logo(request: Request):
    """Reset org logo to default (null)."""
    user = await _auth(request)
    if user.role not in ADMIN_ROLES:
        raise HTTPException(403, "Rol no autorizado")

    db = _db(request)
    tenant_id = _tenant_id_for_user(user)

    await db.organizations.update_one(
        {"tenant_id": tenant_id},
        {"$set": {"branding.logo_url": None, "updated_at": datetime.now(timezone.utc)}},
    )
    return {"ok": True, "logo_url": None}


# ─── SUB-CHUNK B: Cross-portal events ─────────────────────────────────────────

class CrossPortalEventIn(BaseModel):
    event_type: str
    entity_id: Optional[str] = None
    entity_type: Optional[str] = None
    source_portal: Optional[str] = None
    metadata: Optional[dict] = None


@router.post("/api/orgs/cross-portal/log")
async def log_cross_portal_event(payload: CrossPortalEventIn, request: Request):
    """Log a cross-portal sync event (called internally by mutations)."""
    user = await _auth(request)
    db = _db(request)

    if payload.event_type not in CROSS_PORTAL_TRIGGER_EVENTS:
        raise HTTPException(422, f"Unknown event_type: {payload.event_type}")

    affected = CROSS_PORTAL_AFFECTED_MAP.get(payload.event_type, [])

    doc = {
        "id": str(uuid.uuid4()),
        "event_type": payload.event_type,
        "entity_id": payload.entity_id,
        "entity_type": payload.entity_type,
        "source_portal": payload.source_portal or "developer",
        "affected_portals": affected,
        "org_id": _tenant_id_for_user(user),
        "user_id": user.user_id,
        "status": "synced",
        "metadata": payload.metadata or {},
        "created_at": datetime.now(timezone.utc),
    }
    await db.cross_portal_events.insert_one(doc)
    return {"ok": True, "event_id": doc["id"], "affected_portals": affected}


@router.get("/api/orgs/cross-portal/events")
async def get_cross_portal_events(request: Request, since: Optional[str] = None, limit: int = 20):
    """Poll recent cross-portal events for the user's org."""
    user = await _auth(request)
    db = _db(request)

    org_id = _tenant_id_for_user(user)
    query: dict = {"org_id": org_id}

    if since:
        try:
            since_dt = datetime.fromisoformat(since.replace("Z", "+00:00"))
            query["created_at"] = {"$gt": since_dt}
        except ValueError:
            pass

    cursor = db.cross_portal_events.find(
        query, {"_id": 0}
    ).sort("created_at", -1).limit(min(limit, 50))

    events = []
    async for doc in cursor:
        doc["created_at"] = doc["created_at"].isoformat() if hasattr(doc.get("created_at"), "isoformat") else str(doc.get("created_at", ""))
        events.append(doc)

    return {"events": events, "count": len(events)}


# ─── SUB-CHUNK C: Presentation mode PATCH extension ──────────────────────────
# This mirrors the PATCH endpoint in routes_dev_batch18.py but adds presentation_mode.

class PresentationModeConfig(BaseModel):
    active: Optional[bool] = None
    anonymize_pii: Optional[bool] = None
    hide_pricing: Optional[bool] = None
    hide_internal_notes: Optional[bool] = None


class PresentationModePatch(BaseModel):
    presentation_mode: Optional[PresentationModeConfig] = None


@router.patch("/api/preferences/me/presentation-mode")
async def patch_presentation_mode(payload: PresentationModePatch, request: Request):
    """Partial update of presentation_mode settings."""
    user = await _auth(request)
    db = _db(request)

    if payload.presentation_mode is None:
        return {"ok": True, "updated": []}

    pm = payload.presentation_mode
    sub_updates = {}

    if pm.active is not None:
        sub_updates["presentation_mode.active"] = pm.active
    if pm.anonymize_pii is not None:
        sub_updates["presentation_mode.anonymize_pii"] = pm.anonymize_pii
    if pm.hide_pricing is not None:
        sub_updates["presentation_mode.hide_pricing"] = pm.hide_pricing
    if pm.hide_internal_notes is not None:
        sub_updates["presentation_mode.hide_internal_notes"] = pm.hide_internal_notes

    if not sub_updates:
        return {"ok": True, "updated": []}

    sub_updates["updated_at"] = datetime.now(timezone.utc)

    await db.user_preferences.update_one(
        {"user_id": user.user_id},
        {
            "$set": sub_updates,
            "$setOnInsert": {"user_id": user.user_id},
        },
        upsert=True,
    )

    return {"ok": True, "updated": list(sub_updates.keys())}


# ─── Indexes ──────────────────────────────────────────────────────────────────

async def ensure_batch19_indexes(db) -> None:
    try:
        await db.user_preferences.create_index("user_id", unique=True)
        await db.organizations.create_index("tenant_id", unique=True)
        await db.cross_portal_events.create_index("org_id")
        await db.cross_portal_events.create_index([("org_id", 1), ("created_at", -1)])
        await db.cross_portal_events.create_index("event_type")
    except Exception:
        pass
    log.info("[batch19] indexes OK")
