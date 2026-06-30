"""Phase 4 Batch 20 · Backend routes — Tracking links + QR + click redirect."""
from __future__ import annotations
import base64
import io
import logging
import secrets
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional
from urllib.parse import urlencode

import qrcode
from fastapi import APIRouter, HTTPException, Query, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

log = logging.getLogger("dmx.tracking_links")
router = APIRouter(tags=["tracking_links"])

ASESOR_ROLES = {"advisor", "asesor_admin"}
ADMIN_ROLES = {"developer_admin", "developer_director", "inmobiliaria_admin",
                "asesor_admin", "superadmin"}
ALLOWED_SOURCES = {"facebook", "instagram", "email", "whatsapp", "qr", "other"}
ALLOWED_MEDIUMS = {"social", "email", "print", "direct"}


def _db(req): return req.app.state.db
def _now(): return datetime.now(timezone.utc)


async def _auth(req: Request):
    from server import get_current_user
    u = await get_current_user(req)
    if not u:
        raise HTTPException(401, "No autenticado")
    return u


def _gen_slug() -> str:
    """8-char URL-safe slug."""
    return secrets.token_urlsafe(6)[:8]


def _qr_png_b64(url: str) -> str:
    img = qrcode.make(url, box_size=8, border=2)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


# ─── CRUD ────────────────────────────────────────────────────────────────────

class LinkCreate(BaseModel):
    project_id: str
    utm_source: str
    utm_medium: str
    utm_campaign: Optional[str] = ""
    expires_at: Optional[str] = None  # ISO


@router.post("/api/asesor/links")
async def create_link(body: LinkCreate, request: Request):
    user = await _auth(request)
    if user.role not in ASESOR_ROLES | ADMIN_ROLES:
        raise HTTPException(403, "Sin permiso")
    if body.utm_source not in ALLOWED_SOURCES:
        raise HTTPException(400, f"utm_source inválido. Opciones: {sorted(ALLOWED_SOURCES)}")
    if body.utm_medium not in ALLOWED_MEDIUMS:
        raise HTTPException(400, f"utm_medium inválido. Opciones: {sorted(ALLOWED_MEDIUMS)}")
    db = _db(request)

    # Unique slug — retry up to 5 times if collision
    slug = ""
    for _ in range(5):
        candidate = _gen_slug()
        if not await db.tracking_links.find_one({"link_id": candidate}, {"_id": 0}):
            slug = candidate
            break
    if not slug:
        raise HTTPException(500, "No se pudo generar slug único")

    now = _now()
    expires = None
    if body.expires_at:
        try:
            expires = datetime.fromisoformat(body.expires_at.replace("Z", "+00:00")).isoformat()
        except Exception:
            raise HTTPException(400, "expires_at inválido")

    doc = {
        "id": str(uuid.uuid4()),
        "link_id": slug,
        "asesor_id": user.user_id,
        "project_id": body.project_id,
        "utm_source": body.utm_source,
        "utm_medium": body.utm_medium,
        "utm_campaign": (body.utm_campaign or "")[:120],
        "expires_at": expires,
        "active": True,
        "total_clicks": 0,
        "total_bookings": 0,
        "total_conversions": 0,
        "created_at": now.isoformat(),
        "tenant_id": getattr(user, "tenant_id", "") or "",
    }
    await db.tracking_links.insert_one({**doc})

    base_url = request.headers.get("x-public-base-url") \
        or str(request.base_url).rstrip("/")
    booking_url = f"{base_url}/reservar/{body.project_id}?ref={slug}&utm_source={body.utm_source}&utm_medium={body.utm_medium}"
    if body.utm_campaign:
        booking_url += f"&utm_campaign={body.utm_campaign}"
    qr = _qr_png_b64(booking_url)

    # Activity log
    try:
        from routes.dev_batch14 import log_activity
        await log_activity(
            db, user.user_id, "asesor", "link_created",
            slug, "tracking_link",
            metadata={"project_id": body.project_id, "utm_source": body.utm_source},
        )
    except Exception as _e:
        log.warning("[audit] log_activity perdido (link_created tracking_link %s): %s",
                    slug, _e)

    out = {**doc, "booking_url": booking_url, "qr_png_data_url": qr}
    out.pop("_id", None)
    return out


@router.get("/api/asesor/links")
async def list_links(request: Request, project_id: Optional[str] = None,
                      utm_source: Optional[str] = None,
                      status: Optional[str] = None):
    user = await _auth(request)
    if user.role not in ASESOR_ROLES | ADMIN_ROLES:
        raise HTTPException(403, "Sin permiso")
    db = _db(request)
    q: Dict[str, Any] = {}
    if user.role in ASESOR_ROLES:
        q["asesor_id"] = user.user_id
    elif getattr(user, "tenant_id", None) and user.role != "superadmin":
        q["tenant_id"] = user.tenant_id
    if project_id:
        q["project_id"] = project_id
    if utm_source:
        q["utm_source"] = utm_source
    if status == "active":
        q["active"] = True
    elif status == "expired":
        q["$or"] = [{"active": False}, {"expires_at": {"$lt": _now().isoformat()}}]

    items = await db.tracking_links.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    base_url = request.headers.get("x-public-base-url") or str(request.base_url).rstrip("/")
    for it in items:
        it["booking_url"] = (
            f"{base_url}/reservar/{it.get('project_id', '')}?ref={it['link_id']}"
        )
        it["conversion_rate_pct"] = round(
            ((it.get("total_bookings", 0) / it["total_clicks"]) * 100) if it.get("total_clicks") else 0, 1,
        )
    return {"items": items, "count": len(items)}


@router.delete("/api/asesor/links/{link_id}")
async def delete_link(link_id: str, request: Request):
    user = await _auth(request)
    db = _db(request)
    link = await db.tracking_links.find_one({"link_id": link_id}, {"_id": 0})
    if not link:
        raise HTTPException(404, "Link no encontrado")
    if link["asesor_id"] != user.user_id and user.role not in ADMIN_ROLES:
        raise HTTPException(403, "Sin permiso")
    # Admin (no superadmin) solo sobre links de SU cuenta — antes podía borrar cross-tenant.
    if link["asesor_id"] != user.user_id and user.role != "superadmin":
        from tenant_scope import tenant_of, _demo_mode
        link_tenant = link.get("tenant_id") or link.get("dev_org_id") or link.get("inmobiliaria_id")
        if link_tenant and link_tenant != tenant_of(user):
            raise HTTPException(403, "Este link es de otra cuenta")
        if not link_tenant and not _demo_mode():
            raise HTTPException(403, "Link sin cuenta asignada")
    await db.tracking_links.update_one(
        {"link_id": link_id}, {"$set": {"active": False, "deleted_at": _now().isoformat()}},
    )
    try:
        from routes.dev_batch14 import log_activity
        await log_activity(db, user.user_id, user.role, "link_deleted", link_id, "tracking_link")
    except Exception as _e:
        log.warning("[audit] log_activity perdido (link_deleted tracking_link %s): %s",
                    link_id, _e)
    return {"ok": True, "link_id": link_id}


# ─── Public click redirect ────────────────────────────────────────────────────

@router.get("/api/links/{slug}/click")
async def public_click(slug: str, request: Request):
    db = _db(request)
    link = await db.tracking_links.find_one({"link_id": slug}, {"_id": 0})
    if not link:
        raise HTTPException(404, "Link no válido")

    # Active + non-expired check
    if not link.get("active", True):
        raise HTTPException(410, "Link desactivado")
    expires = link.get("expires_at")
    if expires and expires < _now().isoformat():
        raise HTTPException(410, "Link expirado")

    # Log the click
    ua = request.headers.get("user-agent", "")[:300]
    referrer = request.headers.get("referer", "")[:300]
    ip = request.client.host if request.client else ""
    import hashlib
    ip_hash = hashlib.sha256(ip.encode()).hexdigest()[:16] if ip else ""
    await db.link_clicks.insert_one({
        "id": str(uuid.uuid4()),
        "link_id": slug,
        "ip_hash": ip_hash,
        "user_agent": ua,
        "referrer": referrer,
        "clicked_at": _now().isoformat(),
        "converted_to_booking": False,
        "booking_appointment_id": None,
    })
    await db.tracking_links.update_one(
        {"link_id": slug}, {"$inc": {"total_clicks": 1}},
    )

    # 302 redirect with cookie
    qs = urlencode({
        "ref": slug,
        "utm_source": link.get("utm_source", ""),
        "utm_medium": link.get("utm_medium", ""),
        "utm_campaign": link.get("utm_campaign", ""),
    })
    target = f"/reservar/{link.get('project_id', '')}?{qs}"
    response = RedirectResponse(url=target, status_code=302)
    response.set_cookie(
        key="dmx_ref", value=slug, max_age=30 * 24 * 3600,
        httponly=False, samesite="lax",
    )
    return response


# ─── Hook called from public booking endpoint when a booking is confirmed ────

async def attribute_booking_to_link(db, ref_slug: str, appointment_id: str,
                                     lead_id: str) -> None:
    """Mark a click as converted + bump link counters. Idempotent."""
    if not ref_slug:
        return
    link = await db.tracking_links.find_one({"link_id": ref_slug}, {"_id": 0})
    if not link:
        return
    await db.tracking_links.update_one(
        {"link_id": ref_slug},
        {"$inc": {"total_bookings": 1, "total_conversions": 1}},
    )
    await db.link_clicks.update_one(
        {"link_id": ref_slug, "converted_to_booking": False},
        {"$set": {"converted_to_booking": True,
                   "booking_appointment_id": appointment_id}},
    )
    # B13 attribution write
    try:
        await db.lead_source_attribution.update_one(
            {"lead_id": lead_id},
            {"$set": {
                "lead_id": lead_id,
                "project_id": link.get("project_id"),
                "first_touch_asesor_id": link.get("asesor_id"),
                "last_touch_asesor_id": link.get("asesor_id"),
                "touchpoints": [{
                    "asesor_id": link.get("asesor_id"),
                    "link_id": ref_slug,
                    "utm_source": link.get("utm_source"),
                    "utm_medium": link.get("utm_medium"),
                    "utm_campaign": link.get("utm_campaign"),
                    "timestamp": _now().isoformat(),
                }],
                "updated_at": _now().isoformat(),
            }}, upsert=True,
        )
    except Exception as e:
        log.warning(f"[tracking_links] attribution failed: {e}")


# ─── Indexes ─────────────────────────────────────────────────────────────────

async def ensure_tracking_links_indexes(db) -> None:
    await db.tracking_links.create_index("link_id", unique=True, background=True)
    await db.tracking_links.create_index("asesor_id", background=True)
    await db.tracking_links.create_index("project_id", background=True)
    await db.tracking_links.create_index([("asesor_id", 1), ("active", 1)], background=True)
    await db.link_clicks.create_index("link_id", background=True)
    await db.link_clicks.create_index([("link_id", 1), ("clicked_at", -1)], background=True)
    log.info("[tracking_links] indexes ensured")
