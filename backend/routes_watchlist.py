"""
Public Watchlist Subscribe (W3.9b) — bulletins + risk_alerts unified subscription.

Endpoints:
- POST   /api/watchlist/subscribe                     → create pending sub + send double opt-in email
- GET    /api/watchlist/confirm/{confirm_token}       → activate subscription
- GET    /api/watchlist/manage/{manage_token}         → fetch subscription details
- POST   /api/watchlist/manage/{manage_token}         → update zones/scope
- DELETE /api/watchlist/manage/{manage_token}         → unsubscribe (soft delete)

Schema (db.watchlist_subscribers):
    email, zone_ids[], scope ("bulletins"|"risk_alerts"|"both"),
    active, confirmed_at, confirm_token, manage_token,
    created_at, last_email_sent_at

Cron alerts: see scheduler_ie.run_watchlist_alerts_after_risk_recompute.
Throttle: 1 alert per week per subscriber.
"""
from __future__ import annotations

import logging
import os
import re
import secrets
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field

log = logging.getLogger("watchlist")
router = APIRouter(prefix="/api/watchlist", tags=["watchlist"])

VALID_SCOPES = {"bulletins", "risk_alerts", "both"}
EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")


# ─── Schemas ────────────────────────────────────────────────────────────────
class SubscribeRequest(BaseModel):
    email: str
    zone_ids: List[str] = Field(default_factory=list)
    scope: str = "both"


class SubscribeResponse(BaseModel):
    status: str  # "pending_confirmation" | "already_active"
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


# ─── Helpers ────────────────────────────────────────────────────────────────
def _validate_scope(scope: str) -> None:
    if scope not in VALID_SCOPES:
        raise HTTPException(400, f"scope must be one of {sorted(VALID_SCOPES)}")


def _validate_email(email: str) -> str:
    e = (email or "").strip().lower()
    if not EMAIL_RE.match(e):
        raise HTTPException(400, "invalid email")
    return e


async def _send_opt_in_email(email: str, confirm_token: str, manage_token: str, scope: str) -> bool:
    """Send Resend double opt-in email. Returns True if dispatched, False if no API key (stub)."""
    resend_key = os.environ.get("RESEND_API_KEY", "")
    public_url = os.environ.get("DMX_PUBLIC_URL", "https://dmx.mx")
    confirm_url = f"{public_url}/api/watchlist/confirm/{confirm_token}"
    manage_url = f"{public_url}/watchlist/manage/{manage_token}"

    if not resend_key:
        log.info(f"[watchlist] Resend stub — opt-in for {email} confirm={confirm_url}")
        return False

    try:
        import httpx
        scope_label = {
            "bulletins": "boletines mensuales",
            "risk_alerts": "alertas de riesgo",
            "both": "boletines + alertas de riesgo",
        }.get(scope, scope)
        body = {
            "from": "DMX <no-reply@desarrollosmx.com>",
            "to": [email],
            "subject": "Confirma tu suscripción a DMX Watchlist",
            "html": (
                f"<h2>Confirma tu suscripción</h2>"
                f"<p>Te suscribiste a {scope_label} de DMX. Para activar tu suscripción, "
                f"haz clic en el siguiente enlace:</p>"
                f"<p><a href='{confirm_url}' style='display:inline-block;padding:12px 24px;"
                f"background:#6366F1;color:#fff;text-decoration:none;border-radius:9999px;'>"
                f"Confirmar suscripción</a></p>"
                f"<p style='color:#888;font-size:12px;'>Si no fuiste tú, ignora este correo. "
                f"Para gestionar o cancelar tu suscripción: <a href='{manage_url}'>{manage_url}</a></p>"
                f"<p style='color:#888;font-size:11px;'>DMX Platform · LFPDPPP Compliant México</p>"
            ),
        }
        async with httpx.AsyncClient() as client:
            r = await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {resend_key}"},
                json=body,
                timeout=10,
            )
            if r.status_code >= 400:
                log.warning(f"[watchlist] resend non-200: {r.status_code} {r.text[:200]}")
                return False
        return True
    except Exception as e:
        log.warning(f"[watchlist] opt-in email failed: {e}")
        return False


async def ensure_indexes(db) -> None:
    """Create indexes idempotently. Called on startup."""
    try:
        await db.watchlist_subscribers.create_index("email")
        await db.watchlist_subscribers.create_index("manage_token", unique=True, sparse=True)
        await db.watchlist_subscribers.create_index("confirm_token", sparse=True)
        await db.watchlist_subscribers.create_index([("active", 1), ("scope", 1)])
    except Exception as e:
        log.warning(f"[watchlist] ensure_indexes failed: {e}")


# ─── Endpoints ──────────────────────────────────────────────────────────────
@router.post("/subscribe", response_model=SubscribeResponse)
async def subscribe(payload: SubscribeRequest, request: Request):
    """Create pending subscription + send double opt-in email."""
    _validate_scope(payload.scope)
    email = _validate_email(payload.email)
    db = request.app.state.db
    now = datetime.now(timezone.utc)

    # Idempotency: if already active with same email, do not re-create
    existing = await db.watchlist_subscribers.find_one(
        {"email": email, "active": True}, {"_id": 0, "manage_token": 1, "scope": 1}
    )
    if existing:
        return SubscribeResponse(
            status="already_active",
            message=f"Ya estás suscrito ({existing.get('scope')}). Gestiona en /watchlist/manage/{existing.get('manage_token')}",
        )

    # Generate tokens
    confirm_token = secrets.token_urlsafe(32)
    manage_token = secrets.token_urlsafe(32)

    # Upsert: replace any pending (non-active) subscription for this email
    await db.watchlist_subscribers.update_one(
        {"email": email, "active": False},
        {"$set": {
            "email": email,
            "zone_ids": payload.zone_ids,
            "scope": payload.scope,
            "active": False,
            "confirm_token": confirm_token,
            "manage_token": manage_token,
            "created_at": now,
            "confirmed_at": None,
            "last_email_sent_at": None,
        }},
        upsert=True,
    )

    await _send_opt_in_email(email, confirm_token, manage_token, payload.scope)

    return SubscribeResponse(
        status="pending_confirmation",
        message="Te enviamos un correo de confirmación. Revisa tu bandeja de entrada (y spam).",
    )


@router.get("/confirm/{confirm_token}")
async def confirm(confirm_token: str, request: Request):
    """Activate subscription via opt-in token."""
    db = request.app.state.db
    sub = await db.watchlist_subscribers.find_one({"confirm_token": confirm_token}, {"_id": 0})
    if not sub:
        raise HTTPException(404, "token inválido o expirado")
    if sub.get("active"):
        return {"status": "already_active", "manage_token": sub.get("manage_token")}

    await db.watchlist_subscribers.update_one(
        {"confirm_token": confirm_token},
        {"$set": {
            "active": True,
            "confirmed_at": datetime.now(timezone.utc),
        }, "$unset": {"confirm_token": ""}},
    )
    return {"status": "confirmed", "manage_token": sub.get("manage_token")}


@router.get("/manage/{manage_token}", response_model=ManageResponse)
async def manage_get(manage_token: str, request: Request):
    """Fetch subscription details for management page."""
    db = request.app.state.db
    sub = await db.watchlist_subscribers.find_one({"manage_token": manage_token}, {"_id": 0})
    if not sub:
        raise HTTPException(404, "subscription not found")
    return ManageResponse(
        email=sub["email"],
        zone_ids=sub.get("zone_ids", []),
        scope=sub.get("scope", "both"),
        active=sub.get("active", False),
        created_at=sub.get("created_at"),
        confirmed_at=sub.get("confirmed_at"),
    )


@router.post("/manage/{manage_token}", response_model=ManageResponse)
async def manage_update(manage_token: str, payload: UpdateRequest, request: Request):
    """Update zones or scope of a subscription."""
    db = request.app.state.db
    sub = await db.watchlist_subscribers.find_one({"manage_token": manage_token}, {"_id": 0})
    if not sub:
        raise HTTPException(404, "subscription not found")

    update: dict = {}
    if payload.zone_ids is not None:
        update["zone_ids"] = payload.zone_ids
    if payload.scope is not None:
        _validate_scope(payload.scope)
        update["scope"] = payload.scope
    if not update:
        raise HTTPException(400, "no fields to update")

    await db.watchlist_subscribers.update_one(
        {"manage_token": manage_token},
        {"$set": update},
    )
    sub2 = await db.watchlist_subscribers.find_one({"manage_token": manage_token}, {"_id": 0})
    return ManageResponse(
        email=sub2["email"],
        zone_ids=sub2.get("zone_ids", []),
        scope=sub2.get("scope", "both"),
        active=sub2.get("active", False),
        created_at=sub2.get("created_at"),
        confirmed_at=sub2.get("confirmed_at"),
    )


@router.delete("/manage/{manage_token}")
async def manage_unsubscribe(manage_token: str, request: Request):
    """Soft-delete: marca active=False (preserva email para auditoría LFPDPPP)."""
    db = request.app.state.db
    res = await db.watchlist_subscribers.update_one(
        {"manage_token": manage_token},
        {"$set": {"active": False, "unsubscribed_at": datetime.now(timezone.utc)}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "subscription not found")
    return {"status": "unsubscribed"}
