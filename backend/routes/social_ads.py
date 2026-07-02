"""W5.10 — Social/Ads Routes (Meta multi-tenant · STUB-aware).

9 endpoints:
  GET  /api/social-ads/oauth/url                       T2+ advisor · build Meta OAuth URL
  GET  /api/social-ads/oauth/callback?code=&state=     público · OAuth callback (redirect)
  GET  /api/social-ads/accounts                        T2+ advisor · own ad accounts
  POST /api/social-ads/accounts/{id}/disconnect        T2+ advisor · revoke connection
  GET  /api/social-ads/accounts/{id}/campaigns         T2+ advisor · own campaigns
  GET  /api/social-ads/accounts/{id}/budget-suggestion T2+ advisor · LLM IA allocation
  GET  /api/social-ads/accounts/{id}/performance       T2+ advisor · serie temporal
  GET  /api/superadmin/social-ads/tenants              superadmin · tenants conectados
  GET  /api/superadmin/social-ads/stats                superadmin · tokens + cost + health

Cross-tenant isolation: _assert_account_owner (critical PII). Rate-limit 60/min/IP.
Audit: social_ads_connect / social_ads_revoke (en engine).
"""
from __future__ import annotations

import os
import logging
import time
from collections import defaultdict, deque
from typing import Dict

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import JSONResponse, RedirectResponse
from ratelimit import client_ip as _dmx_canon_ip  # SEGURIDAD: IP anti-spoofing (pentest 2026-06-27)

log = logging.getLogger("dmx.routes_social_ads")

router = APIRouter(tags=["social-ads"])

TIER_RANK = {
    "free": 0, "off": 0,
    "t1": 1, "t2": 2, "t3": 3, "t4": 4, "t5": 5,
}

ADVISOR_ROLES = {
    "advisor", "asesor_admin", "asesor_freelance",
    "developer", "developer_admin", "developer_member", "developer_director",
    "developer_advisor", "developer_marketing",
    "inmobiliaria_member", "inmobiliaria_admin", "inmobiliaria_director",
    "inmobiliaria_advisor", "inmobiliaria_marketing",
    "superadmin",
}


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _db(request: Request):
    return request.app.state.db


def _user_id(user) -> str:
    return (
        getattr(user, "user_id", None) or
        (user.get("user_id") if isinstance(user, dict) else None) or
        getattr(user, "user_id", None) or
        (user.get("id") if isinstance(user, dict) else None) or
        "anon"
    )


def _user_field(user, *keys) -> str:
    for k in keys:
        v = getattr(user, k, None) or (user.get(k) if isinstance(user, dict) else None)
        if v:
            return v
    return ""


async def _require_advisor(request: Request):
    """T2+ advisor / developer / inmobiliaria. 401 sin auth, 403 si tier inferior."""
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="auth_required")
    role = (_user_field(user, "role") or "").lower()
    if role in ADVISOR_ROLES:
        return user
    tier = (_user_field(user, "tier", "plan_tier") or "free").lower()
    if TIER_RANK.get(tier, 0) >= 2:
        return user
    raise HTTPException(status_code=403, detail={
        "code": "tier_locked", "required_tier": "T2",
        "message": "Social Ads requiere tier T2+ (advisor).",
    })


async def _require_superadmin(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="auth_required")
    if (_user_field(user, "role") or "").lower() != "superadmin":
        raise HTTPException(status_code=403, detail="superadmin_required")
    return user


async def _assert_account_owner(request: Request, user, account_id: str) -> str:
    """Verifica que account_id pertenece al usuario. Devuelve token_id propietario.

    CRITICAL PII: previene que un asesor consulte cuentas de otro tenant.
    """
    from social_ads_engine import list_ad_accounts
    accounts = await list_ad_accounts(_db(request), _user_id(user))
    for a in accounts:
        if a.get("account_id") == account_id:
            return a.get("token_id") or ""
    raise HTTPException(status_code=403, detail="account_not_owned")


# ─── Rate limiting ─────────────────────────────────────────────────────────────

_RATE_BUCKET: Dict[str, deque] = defaultdict(lambda: deque(maxlen=60))
_RATE_WINDOW_S = 60


def _rate_limit(request: Request, limit: int = 60) -> None:
    ip = _dmx_canon_ip(request)
    if not ip and request.client:
        ip = request.client.host
    ip = ip or "unknown"
    bkt = _RATE_BUCKET[ip]
    now = time.time()
    while bkt and (now - bkt[0]) > _RATE_WINDOW_S:
        bkt.popleft()
    if len(bkt) >= limit:
        raise HTTPException(status_code=429, detail=f"Rate limit excedido · {limit}/min por IP")
    bkt.append(now)


def _callback_redirect_uri(request: Request) -> str:
    """Redirect URI registrado en la app Meta (env o derivado del request)."""
    env = os.environ.get("SOCIAL_ADS_OAUTH_REDIRECT_URI")
    if env:
        return env
    base = str(request.base_url).rstrip("/")
    return f"{base}/api/social-ads/oauth/callback"


# ─── Endpoint 1 — OAuth URL ───────────────────────────────────────────────────

@router.get("/api/social-ads/oauth/url")
async def get_oauth_url(request: Request):
    _rate_limit(request)
    user = await _require_advisor(request)
    from social_ads_oauth import build_meta_oauth_url, generate_csrf_state, is_stub_mode

    user_id = _user_id(user)
    tenant_id = _user_field(user, "tenant_id", "org_id", "developer_id")
    state = generate_csrf_state(user_id, tenant_id)
    redirect_uri = _callback_redirect_uri(request)
    url = build_meta_oauth_url(tenant_id, redirect_uri, state)
    return JSONResponse({
        "url": url,
        "state": state,
        "stub_mode": is_stub_mode(),
        "redirect_uri": redirect_uri,
    })


# ─── Endpoint 2 — OAuth callback (público) ────────────────────────────────────

@router.get("/api/social-ads/oauth/callback")
async def oauth_callback(
    request: Request,
    code: str = Query(default=""),
    state: str = Query(default=""),
    error: str = Query(default=""),
):
    _rate_limit(request)
    db = _db(request)
    from social_ads_engine import connect_meta_account

    frontend = os.environ.get("FRONTEND_BASE_URL", "").rstrip("/")
    connect_page = f"{frontend}/portal/asesor/social-ads" if frontend else "/portal/asesor/social-ads"

    if error or not code or not state:
        return RedirectResponse(url=f"{connect_page}?social_ads=error", status_code=302)

    redirect_uri = _callback_redirect_uri(request)
    result = await connect_meta_account(db, code=code, state=state, redirect_uri=redirect_uri)
    if result.get("connected"):
        return RedirectResponse(url=f"{connect_page}?social_ads=connected", status_code=302)
    reason = result.get("error", "failed")
    return RedirectResponse(url=f"{connect_page}?social_ads={reason}", status_code=302)


# ─── Endpoint 3 — Ad accounts ─────────────────────────────────────────────────

@router.get("/api/social-ads/accounts")
async def list_accounts(request: Request):
    _rate_limit(request)
    user = await _require_advisor(request)
    from social_ads_engine import list_ad_accounts, MAX_CONNECTIONS_PER_TENANT
    from social_ads_oauth import is_stub_mode, count_tenant_tokens

    db = _db(request)
    accounts = await list_ad_accounts(db, _user_id(user))
    tenant_id = _user_field(user, "tenant_id", "org_id", "developer_id")
    connections = await count_tenant_tokens(db, tenant_id)
    return JSONResponse({
        "accounts": accounts,
        "count": len(accounts),
        "connections": connections,
        "cap": MAX_CONNECTIONS_PER_TENANT,
        "stub_mode": is_stub_mode(),
    })


# ─── Endpoint 4 — Disconnect ──────────────────────────────────────────────────

@router.post("/api/social-ads/accounts/{account_id}/disconnect")
async def disconnect_account(account_id: str, request: Request):
    _rate_limit(request)
    user = await _require_advisor(request)
    token_id = await _assert_account_owner(request, user, account_id)
    if not token_id:
        raise HTTPException(status_code=404, detail="connection_not_found")
    from social_ads_engine import revoke_meta_connection
    result = await revoke_meta_connection(_db(request), _user_id(user), token_id)
    return JSONResponse(result)


# ─── Endpoint 5 — Campaigns ───────────────────────────────────────────────────

@router.get("/api/social-ads/accounts/{account_id}/campaigns")
async def get_account_campaigns(
    account_id: str,
    request: Request,
    status: str = Query(default=""),
):
    _rate_limit(request)
    user = await _require_advisor(request)
    await _assert_account_owner(request, user, account_id)
    from social_ads_engine import get_campaigns
    result = await get_campaigns(_db(request), account_id, status=status or None)
    return JSONResponse(result)


# ─── Endpoint 6 — Budget suggestion (LLM IA) ──────────────────────────────────

@router.get("/api/social-ads/accounts/{account_id}/budget-suggestion")
async def get_budget_suggestion(account_id: str, request: Request):
    _rate_limit(request)
    user = await _require_advisor(request)
    await _assert_account_owner(request, user, account_id)
    from social_ads_engine import suggest_budget_allocation
    # F.89 audit fix · pasa tenant_id para cost tracking ai_budget en LLM allocation
    tenant_id = getattr(user, "tenant_id", None) or getattr(user, "dev_org_id", None)
    result = await suggest_budget_allocation(_db(request), account_id, tenant_id=tenant_id)
    return JSONResponse(result)


# ─── Endpoint 7 — Performance ─────────────────────────────────────────────────

@router.get("/api/social-ads/accounts/{account_id}/performance")
async def get_account_performance(
    account_id: str,
    request: Request,
    days: int = Query(default=30, ge=1, le=90),
):
    _rate_limit(request)
    user = await _require_advisor(request)
    await _assert_account_owner(request, user, account_id)
    from social_ads_engine import get_performance
    result = await get_performance(_db(request), account_id, days=days)
    return JSONResponse(result)


# ─── Endpoint 8 — Superadmin tenants ──────────────────────────────────────────

@router.get("/api/superadmin/social-ads/tenants")
async def superadmin_tenants(request: Request):
    _rate_limit(request)
    await _require_superadmin(request)
    from social_ads_engine import list_tenant_connections
    tenants = await list_tenant_connections(_db(request))
    return JSONResponse({"tenants": tenants, "count": len(tenants)})


# ─── Endpoint 9 — Superadmin stats ────────────────────────────────────────────

@router.get("/api/superadmin/social-ads/stats")
async def superadmin_stats(request: Request):
    _rate_limit(request)
    await _require_superadmin(request)
    from social_ads_engine import get_superadmin_stats
    stats = await get_superadmin_stats(_db(request))
    return JSONResponse(stats)
