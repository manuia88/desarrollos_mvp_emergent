"""W5.10 — Social/Ads Meta OAuth flow + encrypted token vault (multi-tenant).

STUB-aware: si META_APP_REVIEW_APPROVED != "true" (default) todas las llamadas a
Meta Graph API retornan mock data realista. Cuando founder activa post-review
(META_APP_REVIEW_APPROVED=true + META_APP_ID + META_APP_SECRET) flips a real API
calls SIN cambio de código.

Token vault: collection `social_ads_tokens` · Fernet encrypted (env key) ·
1 doc por conexión Meta Business (cap 5/tenant aplicado en engine).

Funciones públicas:
  is_stub_mode()
  build_meta_oauth_url(tenant_id, redirect_uri, state)
  generate_csrf_state(user_id, tenant_id) / consume_csrf_state(state)
  handle_oauth_callback(db, code, state, redirect_uri)
  exchange_code_for_token(code, redirect_uri)
  store_meta_token(db, user_id, tenant_id, token_data)
  get_meta_token(db, token_id) / list_user_tokens(db, user_id)
  count_tenant_tokens(db, tenant_id)
  revoke_meta_token(db, user_id, token_id)
  refresh_token_if_expiring(db, token_doc)
"""
from __future__ import annotations

import os
import uuid
import secrets
import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

import httpx
from cryptography.fernet import Fernet

log = logging.getLogger("dmx.social_ads_oauth")

COLLECTION = "social_ads_tokens"

# Meta Graph API (v19.0) endpoints — solo se llaman cuando NO stub.
_META_API_VERSION = "v19.0"
_META_DIALOG_URI = f"https://www.facebook.com/{_META_API_VERSION}/dialog/oauth"
_META_TOKEN_URI = f"https://graph.facebook.com/{_META_API_VERSION}/oauth/access_token"
_META_SCOPES = ["ads_read", "ads_management", "business_management"]

# Tokens de larga vida Meta duran ~60 días.
_LONG_LIVED_TTL_DAYS = 60


# ─── Stub mode ─────────────────────────────────────────────────────────────────

def is_stub_mode() -> bool:
    """True salvo que META_APP_REVIEW_APPROVED esté explícitamente en 'true'."""
    return os.environ.get("META_APP_REVIEW_APPROVED", "false").strip().lower() != "true"


# ─── Encryption (Fernet) ─────────────────────────────────────────────────────

_fernet: Optional[Fernet] = None


def _get_fernet() -> Fernet:
    """Carga Fernet key desde env vars (orden de búsqueda).

    Audit fix · acepta `SOCIAL_ADS_ENCRYPTION_KEY` (nombre spec) además de los aliases legacy.
    Prioridad: SOCIAL_ADS_ENCRYPTION_KEY > SOCIAL_ADS_FERNET_KEY > OAUTH_TOKEN_ENCRYPTION_KEY > IE_FERNET_KEY.
    """
    global _fernet
    if _fernet is None:
        key = (
            os.environ.get("SOCIAL_ADS_ENCRYPTION_KEY")  # nombre spec (audit alignment)
            or os.environ.get("SOCIAL_ADS_FERNET_KEY")    # alias legacy
            or os.environ.get("OAUTH_TOKEN_ENCRYPTION_KEY")
            or os.environ.get("IE_FERNET_KEY")
        )
        if not key:
            # STUB-safe: sin key configurada generamos una efímera (tokens mock).
            # En producción real exigir SOCIAL_ADS_ENCRYPTION_KEY persistente.
            key = Fernet.generate_key()
            log.warning(
                "[social_ads] SOCIAL_ADS_ENCRYPTION_KEY no configurada · usando key "
                "efímera (solo válido para STUB · tokens no persisten entre reinicios). "
                "Configurar antes de pasar Meta a real."
            )
        _fernet = Fernet(key.encode() if isinstance(key, str) else key)
    return _fernet


def encrypt_token(token: str) -> str:
    if not token:
        return ""
    return _get_fernet().encrypt(token.encode()).decode()


def decrypt_token(cipher: str) -> str:
    if not cipher:
        return ""
    return _get_fernet().decrypt(cipher.encode()).decode()


# ─── CSRF state store ─────────────────────────────────────────────────────────

_csrf_states: Dict[str, Dict[str, str]] = {}  # state → {user_id, tenant_id, ts}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def generate_csrf_state(user_id: str, tenant_id: str) -> str:
    state = secrets.token_urlsafe(32)
    _csrf_states[state] = {
        "user_id": user_id,
        "tenant_id": tenant_id or "",
        "ts": _now().isoformat(),
    }
    # Cleanup states > 1h
    cutoff = (_now() - timedelta(hours=1)).isoformat()
    for k in [k for k, v in _csrf_states.items() if v["ts"] < cutoff]:
        _csrf_states.pop(k, None)
    return state


def consume_csrf_state(state: str) -> Optional[Dict[str, str]]:
    return _csrf_states.pop(state, None)


# ─── OAuth URL + exchange ─────────────────────────────────────────────────────

def build_meta_oauth_url(tenant_id: str, redirect_uri: str, state: str) -> str:
    """Construye la URL del dialog OAuth de Meta.

    En STUB mode retornamos directamente al callback con un code mock para que
    el flujo end-to-end funcione sin app aprobada.
    """
    if is_stub_mode():
        sep = "&" if "?" in redirect_uri else "?"
        return f"{redirect_uri}{sep}code=meta_stub_code_{secrets.token_hex(8)}&state={state}"

    client_id = os.environ.get("META_APP_ID", "")
    scope = ",".join(_META_SCOPES)
    return (
        f"{_META_DIALOG_URI}"
        f"?client_id={client_id}"
        f"&redirect_uri={redirect_uri}"
        f"&state={state}"
        f"&response_type=code"
        f"&scope={scope}"
    )


async def exchange_code_for_token(code: str, redirect_uri: str) -> Dict[str, Any]:
    """Intercambia authorization code por access_token de larga vida.

    STUB: retorna token mock realista. Real: llama Meta Graph token endpoint.
    """
    if is_stub_mode():
        return {
            "access_token": f"meta_stub_token_{secrets.token_hex(16)}",
            "token_type": "bearer",
            "expires_in": _LONG_LIVED_TTL_DAYS * 86400,
            "scope": ",".join(_META_SCOPES),
            "meta_business_id": f"act_{secrets.randbelow(9_000_000_000) + 1_000_000_000}",
        }

    client_id = os.environ.get("META_APP_ID", "")
    client_secret = os.environ.get("META_APP_SECRET", "")
    async with httpx.AsyncClient(timeout=15) as c:
        resp = await c.get(_META_TOKEN_URI, params={
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
            "code": code,
        })
    data = resp.json()
    if "error" in data:
        raise ValueError(f"Meta token exchange error: {data.get('error')}")
    return {
        "access_token": data["access_token"],
        "token_type": data.get("token_type", "bearer"),
        "expires_in": data.get("expires_in", _LONG_LIVED_TTL_DAYS * 86400),
        "scope": ",".join(_META_SCOPES),
        "meta_business_id": data.get("meta_business_id", ""),
    }


async def handle_oauth_callback(
    db, code: str, state: str, redirect_uri: str,
) -> Dict[str, Any]:
    """Valida CSRF state + intercambia code + persiste token encrypted."""
    ctx = consume_csrf_state(state)
    if not ctx:
        raise ValueError("invalid_or_expired_state")
    token_data = await exchange_code_for_token(code, redirect_uri)
    doc = await store_meta_token(
        db,
        user_id=ctx["user_id"],
        tenant_id=ctx.get("tenant_id", ""),
        token_data=token_data,
    )
    return {"connected": True, "token_id": doc["id"], "user_id": ctx["user_id"]}


# ─── Token vault CRUD ─────────────────────────────────────────────────────────

async def store_meta_token(
    db, user_id: str, tenant_id: str, token_data: Dict[str, Any],
) -> Dict[str, Any]:
    """Encrypt + upsert token. Una conexión por (user_id, meta_business_id)."""
    now = _now()
    expires_at = now + timedelta(seconds=int(token_data.get("expires_in", _LONG_LIVED_TTL_DAYS * 86400)))
    biz_id = token_data.get("meta_business_id") or f"act_{secrets.token_hex(6)}"
    token_id = f"sa_{uuid.uuid4().hex[:16]}"

    doc = {
        "id": token_id,
        "user_id": user_id,
        "tenant_id": tenant_id or "",
        "meta_business_id": biz_id,
        "access_token": encrypt_token(token_data["access_token"]),
        "refresh_token": encrypt_token(token_data.get("refresh_token", "")),
        "scope": token_data.get("scope", ""),
        "expires_at": expires_at.isoformat(),
        "status": "active",
        "stub": is_stub_mode(),
        "connected_at": now.isoformat(),
        "last_refreshed_at": now.isoformat(),
    }
    await db[COLLECTION].replace_one(
        {"user_id": user_id, "meta_business_id": biz_id},
        doc, upsert=True,
    )
    stored = await db[COLLECTION].find_one(
        {"user_id": user_id, "meta_business_id": biz_id}, {"_id": 0},
    )
    return stored or doc


async def get_meta_token(db, token_id: str) -> Optional[Dict[str, Any]]:
    doc = await db[COLLECTION].find_one({"id": token_id}, {"_id": 0})
    if not doc or doc.get("status") == "revoked":
        return None
    return doc


async def list_user_tokens(db, user_id: str) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    cursor = db[COLLECTION].find(
        {"user_id": user_id, "status": {"$ne": "revoked"}}, {"_id": 0},
    )
    async for d in cursor:
        out.append(d)
    return out


async def count_tenant_tokens(db, tenant_id: str) -> int:
    try:
        return int(await db[COLLECTION].count_documents(
            {"tenant_id": tenant_id or "", "status": {"$ne": "revoked"}},
        ))
    except Exception:
        return 0


async def revoke_meta_token(db, user_id: str, token_id: str) -> bool:
    res = await db[COLLECTION].update_one(
        {"id": token_id, "user_id": user_id},
        {"$set": {"status": "revoked", "revoked_at": _now().isoformat()}},
    )
    return res.modified_count > 0


# ─── Token refresh ────────────────────────────────────────────────────────────

async def refresh_token_if_expiring(db, token_doc: Dict[str, Any]) -> bool:
    """Refresca tokens próximos a expirar (<7 días).

    STUB: extiende expires_at sin llamada externa (no-op realista). Real: usaría
    fb_exchange_token para renovar long-lived token.
    """
    expires_at = token_doc.get("expires_at")
    if not expires_at:
        return False
    if isinstance(expires_at, str):
        try:
            expires_at = datetime.fromisoformat(expires_at)
        except ValueError:
            return False
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at - _now() > timedelta(days=7):
        return False  # aún vigente

    new_expires = _now() + timedelta(days=_LONG_LIVED_TTL_DAYS)
    try:
        await db[COLLECTION].update_one(
            {"id": token_doc["id"]},
            {"$set": {
                "expires_at": new_expires.isoformat(),
                "last_refreshed_at": _now().isoformat(),
                "status": "active",
            }},
        )
        return True
    except Exception as exc:
        log.warning(f"[social_ads_oauth] refresh failed {token_doc.get('id')}: {exc}")
        return False
