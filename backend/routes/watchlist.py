"""
W3.9b — Watchlist subscribe API (public).

Five endpoints:
  POST   /api/watchlist/subscribe                 → opt-in (sends confirm email)
  GET    /api/watchlist/confirm/{confirm_token}   → activates subscription
  GET    /api/watchlist/manage/{manage_token}     → fetch current state
  POST   /api/watchlist/manage/{manage_token}     → update zone_ids/scope
  DELETE /api/watchlist/manage/{manage_token}     → soft-delete (LFPDPPP audit trail)

Schema collection: db.watchlist_subscribers
"""
from __future__ import annotations

import logging
import os
import re
import secrets
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/watchlist", tags=["watchlist"])
log = logging.getLogger("watchlist")

VALID_SCOPES = {"bulletins", "risk_alerts", "both"}
EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")


# ─── Schemas ─────────────────────────────────────────────────────────────────
class SubscribeRequest(BaseModel):
    email: str
    zone_ids: List[str] = Field(default_factory=list)
    scope: str = "both"


class SubscribeResponse(BaseModel):
    status: str
    message: str


class ManageResponse(BaseModel):
    email: str
    zone_ids: List[str]
    scope: str
    active: bool
    created_at: Optional[datetime] = None
    confirmed_at: Optional[datetime] = None


class UpdateRequest(BaseModel):
    zone_ids: Optional[List[str]] = None
    scope: Optional[str] = None


# ─── Helpers ─────────────────────────────────────────────────────────────────
def _now() -> datetime:
    return datetime.now(timezone.utc)


def _public_url() -> str:
    return os.environ.get("DMX_PUBLIC_URL", "https://desarrollosmx.io").rstrip("/")


async def _send_opt_in_email(email: str, confirm_token: str, manage_token: str, scope: str) -> None:
    """Sends opt-in confirmation email via Resend if RESEND_API_KEY present.
    Never raises — failure is logged and swallowed (caller already persisted subscriber)."""
    base = _public_url()
    confirm_url = f"{base}/api/watchlist/confirm/{confirm_token}"
    manage_url = f"{base}/watchlist/manage?token={manage_token}"
    resend_key = os.environ.get("RESEND_API_KEY", "")
    if not resend_key:
        log.info(f"[watchlist] Resend stub — would send opt-in to {email} (scope={scope})")
        return
    try:
        import httpx
        html = (
            f"<div style='font-family:DM Sans,sans-serif;color:#1a1a1a;max-width:540px;margin:0 auto;padding:24px'>"
            f"<h2 style='font-family:Outfit,sans-serif;font-weight:700;margin:0 0 12px 0'>Confirma tu suscripción a DesarrollosMX Watchlist</h2>"
            f"<p>Recibirás alertas <strong>{scope}</strong> sobre las zonas que sigues.</p>"
            f"<p style='margin:24px 0'>"
            f"<a href='{confirm_url}' style='display:inline-block;padding:12px 24px;background:#6366F1;color:#fff;border-radius:9999px;text-decoration:none;font-weight:600'>Confirmar suscripción</a>"
            f"</p>"
            f"<p style='font-size:12px;color:#666'>Para gestionar o darte de baja en cualquier momento: <a href='{manage_url}'>{manage_url}</a></p>"
            f"<p style='font-size:11px;color:#999;margin-top:32px'>LFPDPPP — DesarrollosMX nunca compartirá tu correo. Audit trail conservado por compliance.</p>"
            f"</div>"
        )
        body = {
            "from": "DMX Watchlist <no-reply@desarrollosmx.io>",
            "to": [email],
            "subject": "Confirma tu suscripción · DMX Watchlist",
            "html": html,
        }
        async with httpx.AsyncClient() as client:
            await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {resend_key}"},
                json=body,
                timeout=10,
            )
    except Exception as e:  # noqa: BLE001
        log.warning(f"[watchlist] opt-in email failed for {email}: {e}")


async def ensure_indexes(db) -> None:
    await db.watchlist_subscribers.create_index("email")
    await db.watchlist_subscribers.create_index(
        "manage_token", unique=True, sparse=True,
    )
    await db.watchlist_subscribers.create_index("confirm_token", sparse=True)
    await db.watchlist_subscribers.create_index([("active", 1), ("scope", 1)])


# ─── Endpoints ───────────────────────────────────────────────────────────────
@router.post("/subscribe", response_model=SubscribeResponse)
async def subscribe(payload: SubscribeRequest, request: Request):
    if payload.scope not in VALID_SCOPES:
        raise HTTPException(400, f"scope inválido (válidos: {sorted(VALID_SCOPES)})")
    email = (payload.email or "").strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(400, "email inválido")

    db = request.app.state.db
    existing = await db.watchlist_subscribers.find_one({"email": email}, {"_id": 0})
    if existing and existing.get("active"):
        return SubscribeResponse(
            status="already_active",
            message="Ya estás suscrito y confirmado. Revisa tu correo de gestión.",
        )

    confirm_token = secrets.token_urlsafe(32)
    manage_token = secrets.token_urlsafe(32)
    now = _now()
    doc = {
        "email": email,
        "zone_ids": list(payload.zone_ids or []),
        "scope": payload.scope,
        "active": False,
        "confirm_token": confirm_token,
        "manage_token": manage_token,
        "created_at": now,
        "confirmed_at": None,
        "unsubscribed_at": None,
        "last_email_sent_at": None,
    }
    await db.watchlist_subscribers.update_one(
        {"email": email},
        {"$set": doc},
        upsert=True,
    )
    await _send_opt_in_email(email, confirm_token, manage_token, payload.scope)
    return SubscribeResponse(
        status="pending_confirmation",
        message="Te enviamos un correo para confirmar la suscripción.",
    )


@router.get("/confirm/{confirm_token}")
async def confirm(confirm_token: str, request: Request):
    db = request.app.state.db
    sub = await db.watchlist_subscribers.find_one({"confirm_token": confirm_token}, {"_id": 0})
    if not sub:
        # Maybe already confirmed: search by manage_token? Not the same token. Return not_found.
        raise HTTPException(404, "Token de confirmación no encontrado o expirado.")
    if sub.get("active"):
        return {"status": "already_active", "manage_token": sub.get("manage_token")}
    await db.watchlist_subscribers.update_one(
        {"confirm_token": confirm_token},
        {
            "$set": {"active": True, "confirmed_at": _now()},
            "$unset": {"confirm_token": ""},
        },
    )
    return {"status": "confirmed", "manage_token": sub.get("manage_token")}


@router.get("/manage/{manage_token}", response_model=ManageResponse)
async def manage_get(manage_token: str, request: Request):
    db = request.app.state.db
    sub = await db.watchlist_subscribers.find_one({"manage_token": manage_token}, {"_id": 0})
    if not sub:
        raise HTTPException(404, "Manage token no encontrado.")
    return ManageResponse(
        email=sub["email"],
        zone_ids=sub.get("zone_ids", []),
        scope=sub.get("scope", "both"),
        active=bool(sub.get("active")),
        created_at=sub.get("created_at"),
        confirmed_at=sub.get("confirmed_at"),
    )


@router.post("/manage/{manage_token}", response_model=ManageResponse)
async def manage_update(manage_token: str, payload: UpdateRequest, request: Request):
    db = request.app.state.db
    sub = await db.watchlist_subscribers.find_one({"manage_token": manage_token}, {"_id": 0})
    if not sub:
        raise HTTPException(404, "Manage token no encontrado.")

    update = {}
    if payload.scope is not None:
        if payload.scope not in VALID_SCOPES:
            raise HTTPException(400, f"scope inválido (válidos: {sorted(VALID_SCOPES)})")
        update["scope"] = payload.scope
    if payload.zone_ids is not None:
        update["zone_ids"] = list(payload.zone_ids)

    if update:
        await db.watchlist_subscribers.update_one({"manage_token": manage_token}, {"$set": update})
        sub.update(update)

    return ManageResponse(
        email=sub["email"],
        zone_ids=sub.get("zone_ids", []),
        scope=sub.get("scope", "both"),
        active=bool(sub.get("active")),
        created_at=sub.get("created_at"),
        confirmed_at=sub.get("confirmed_at"),
    )


@router.delete("/manage/{manage_token}")
async def manage_unsubscribe(manage_token: str, request: Request):
    db = request.app.state.db
    sub = await db.watchlist_subscribers.find_one({"manage_token": manage_token}, {"_id": 0})
    if not sub:
        raise HTTPException(404, "Manage token no encontrado.")
    await db.watchlist_subscribers.update_one(
        {"manage_token": manage_token},
        {"$set": {"active": False, "unsubscribed_at": _now()}},
    )
    return {"status": "unsubscribed", "email": sub["email"]}
