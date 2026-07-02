"""W4.18.3 — Private Beta Routes.

Endpoints:
- POST /api/superadmin/invites/generate    (superadmin)
- GET  /api/superadmin/invites             (superadmin)
- POST /api/superadmin/invites/{code}/revoke (superadmin)
- GET  /api/auth/validate-code/{code}      (public)
- POST /api/auth/signup-broker             (public, code-gated)
- POST /api/waitlist/signup                (public, idempotent, rate-limited)
- GET  /api/superadmin/waitlist            (superadmin)
"""
from __future__ import annotations

import logging
import time
import uuid
from collections import defaultdict, deque
from datetime import datetime, timezone
from typing import Any, Deque, Dict, Optional
from fastapi import APIRouter, HTTPException, Request, Response, Query
from pydantic import BaseModel, Field

import private_beta_engine as eng
from ratelimit import client_ip as _dmx_canon_ip  # SEGURIDAD: IP anti-spoofing (pentest 2026-06-27)

log = logging.getLogger("dmx.routes_private_beta")
router = APIRouter()

# F0.1 Sub-D · in-memory rate limit (pattern from routes_avm_public.py)
_WAITLIST_RL: Dict[str, Deque[float]] = defaultdict(deque)
WAITLIST_RL_WINDOW_S = 60
WAITLIST_RL_MAX = 30


def _waitlist_rate_limit(ip: str) -> None:
    now = time.time()
    q = _WAITLIST_RL[ip]
    while q and (now - q[0]) > WAITLIST_RL_WINDOW_S:
        q.popleft()
    if len(q) >= WAITLIST_RL_MAX:
        raise HTTPException(429, "Too many requests · retry in 1 min",
                            headers={"Retry-After": "60"})
    q.append(now)


def _db(request: Request):
    return request.app.state.db


def _client_ip(request: Request) -> str:
    fwd =_dmx_canon_ip(request)
    if fwd:
        return fwd
    return request.client.host if request.client else ""


async def _current_user(request: Request) -> Optional[Dict[str, Any]]:
    try:
        from server import get_current_user
        u = await get_current_user(request)
        if u:
            return u.model_dump() if hasattr(u, "model_dump") else dict(u)
    except Exception:
        pass
    return None


async def _require_superadmin(request: Request) -> Dict[str, Any]:
    u = await _current_user(request)
    if not u:
        raise HTTPException(401, "auth_required")
    if (u.get("role") or "").lower() != "superadmin":
        raise HTTPException(403, "superadmin_required")
    return u


# ─── Superadmin · invites ─────────────────────────────────────────────────────
class GenerateCodesIn(BaseModel):
    count: int = Field(10, ge=1, le=100)
    intended_role: str = Field("broker")
    expires_days: Optional[int] = Field(None, ge=1, le=730)
    notes: str = Field("", max_length=500)


@router.post("/api/superadmin/invites/generate")
async def generate_invites(body: GenerateCodesIn, request: Request):
    u = await _require_superadmin(request)
    db = _db(request)
    codes = await eng.generate_codes(
        db, body.count, body.intended_role, body.expires_days, body.notes, u["user_id"],
    )
    return {"ok": True, "codes": codes, "count": len(codes)}


@router.get("/api/superadmin/invites")
async def list_invites(
    request: Request,
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
):
    await _require_superadmin(request)
    db = _db(request)
    out = await eng.list_codes(db, status, page, limit)
    return {"ok": True, **out}


@router.post("/api/superadmin/invites/{code}/revoke")
async def revoke_invite(code: str, request: Request):
    u = await _require_superadmin(request)
    db = _db(request)
    ok = await eng.revoke_code(db, code, u["user_id"])
    if not ok:
        raise HTTPException(404, "code_not_found_or_not_active")
    return {"ok": True, "code": code}


# ─── Public · validate code (inline feedback) ─────────────────────────────────
@router.get("/api/auth/validate-code/{code}")
async def validate_code(code: str, request: Request):
    # [AUD-030] oráculo de validez de código → rate-limit por IP para frenar la enumeración
    # por fuerza bruta del espacio de invite-codes (antes sin límite).
    _waitlist_rate_limit(_client_ip(request))
    db = _db(request)
    out = await eng.validate_code(db, code)
    return out


# ─── Public · signup broker (gated) ───────────────────────────────────────────
class SignupBrokerIn(BaseModel):
    email: str
    password: str
    name: str
    invite_code: str
    locale: Optional[str] = "es-MX"


@router.post("/api/auth/signup-broker", status_code=201)
async def signup_broker(body: SignupBrokerIn, response: Response, request: Request):
    _waitlist_rate_limit(_client_ip(request))  # [AUD-030] freno anti fuerza-bruta de invite-codes
    db = _db(request)
    code = (body.invite_code or "").strip().upper()
    val = await eng.validate_code(db, code)
    if not val.get("valid"):
        raise HTTPException(403, {"code": "invite_invalid", "reason": val.get("reason")})

    body.email = body.email.lower().strip()
    if not body.email or "@" not in body.email:
        raise HTTPException(422, "invalid_email")

    existing = await db.users.find_one({"email": body.email})
    if existing:
        raise HTTPException(400, "email_already_registered")

    from server import hash_password, create_access_token, create_refresh_token
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    await db.users.insert_one({
        "user_id": user_id,
        "email": body.email,
        "name": body.name,
        "password_hash": hash_password(body.password),
        "role": "broker",
        "tenant_id": None,
        "tier": "T1",
        "onboarded": True,
        "private_beta_invite_code": code,
        "created_at": datetime.now(timezone.utc),
    })
    consumed = await eng.consume_code(db, code, user_id)
    if not consumed:
        # Race condition: someone else just used it
        await db.users.delete_one({"user_id": user_id})
        raise HTTPException(409, "code_race_consumed")

    # F0.1 Sub-C · Welcome broker email (best-effort, never blocks)
    welcome_sent = False
    try:
        from resend_engine import send_welcome_broker
        welcome_sent = send_welcome_broker(
            email=body.email, name=body.name or body.email.split("@")[0], invite_code=code,
        )
    except Exception as exc:
        log.warning(f"[signup_broker] welcome email exception · {exc}")
    try:
        await db.audit_log.insert_one({
            "user_id": user_id,
            "action": "welcome_broker_email_sent" if welcome_sent else "welcome_broker_email_failed",
            "resource": f"user:{user_id}",
            "ts": datetime.now(timezone.utc).isoformat(),
        })
    except Exception:
        pass

    access = create_access_token(user_id, body.email)
    refresh = create_refresh_token(user_id)
    response.set_cookie("access_token", access, httponly=True, secure=True, samesite="none", max_age=28800)
    response.set_cookie("refresh_token", refresh, httponly=True, secure=True, samesite="none", max_age=2592000)
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    return {"ok": True, "user": user_doc}


# ─── Public · waitlist signup ─────────────────────────────────────────────────
class WaitlistIn(BaseModel):
    email: str
    utm_source: Optional[str] = ""
    utm_medium: Optional[str] = ""
    utm_campaign: Optional[str] = ""
    locale: Optional[str] = "es-MX"


@router.post("/api/waitlist/signup")
async def waitlist_signup(body: WaitlistIn, request: Request):
    ip = _client_ip(request)
    _waitlist_rate_limit(ip)
    db = _db(request)
    out = await eng.add_to_waitlist(
        db, body.email,
        utm={
            "utm_source":   body.utm_source or "",
            "utm_medium":   body.utm_medium or "",
            "utm_campaign": body.utm_campaign or "",
        },
        ip=ip,
        locale=body.locale or "es-MX",
    )
    if not out.get("ok"):
        raise HTTPException(422, out.get("reason", "invalid"))
    return out


@router.get("/api/superadmin/waitlist")
async def superadmin_waitlist(
    request: Request,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
):
    await _require_superadmin(request)
    db = _db(request)
    out = await eng.list_waitlist(db, page, limit)
    return {"ok": True, **out}

# W5.FF4 register_feature marker · NO duplicate
from feature_registry import register_feature as _w5ff4_register_feature
_w5ff4_register_feature("private_beta_invites", plan_tier="enterprise", monthly_price_mxn=0,   category="operations",   name="Private Beta Invites")
