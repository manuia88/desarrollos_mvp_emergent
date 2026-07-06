"""W3.5 — Public API Key validator + rate limiter.

Schema db.public_api_keys:
  { id, key_hash (sha256), key_prefix (first 12 chars visible),
    tenant_id, tier:"free|pro|enterprise",
    monthly_quota_calls, calls_this_month, calls_total,
    expires_at?, status:"active|revoked|paused",
    contact_email, created_by, created_at, last_used_at }
  unique key_hash · index (tenant_id, status)

Schema db.api_call_logs:
  { api_key_id, ts, method, endpoint, status_code, latency_ms,
    ip, response_size_bytes, billable, cost_usd_cents }
  index (api_key_id, ts desc) · TTL 90d
"""
from __future__ import annotations

import hashlib
import logging
import os
import secrets
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Dict

from fastapi import HTTPException, Request

log = logging.getLogger("dmx.public_api_auth")

DEFAULT_QUOTA = {
    "free":       1_000,
    "pro":        100_000,
    "enterprise": 1_000_000,
}
DEFAULT_EXPIRY_DAYS = 365
KEY_PREFIX_ENV = os.environ.get("DMX_API_KEY_PREFIX", "dmx_test")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso() -> str:
    return _now().isoformat()


def _hash_key(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _now_month() -> str:
    n = _now()
    return f"{n.year}-{n.month:02d}"


# ─── Generate a new API key ───────────────────────────────────────────────────

def generate_api_key() -> Dict[str, str]:
    raw_token = secrets.token_urlsafe(32)
    full_key = f"{KEY_PREFIX_ENV}_{raw_token}"
    return {
        "full_key": full_key,
        "key_hash": _hash_key(full_key),
        "key_prefix": full_key[:12],
    }


# ─── ApiKeyContext ─────────────────────────────────────────────────────────────

@dataclass
class ApiKeyContext:
    id: str
    tenant_id: str
    tier: str
    monthly_quota_calls: int
    calls_this_month: int
    calls_remaining: int
    status: str
    scopes: tuple = ()   # F6: productos que la key puede consumir; vacío = sin restricción (compat)


# ─── Validate ─────────────────────────────────────────────────────────────────

async def validate_api_key(request: Request) -> ApiKeyContext:
    """Reads `Authorization: Bearer <key>` header. Raises 401/429/402."""
    auth = (request.headers.get("authorization") or "").strip()
    if not auth.lower().startswith("bearer "):
        raise HTTPException(401, "API key requerida (Authorization: Bearer ...)")
    token = auth.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(401, "API key vacía")

    db = request.app.state.db
    key_hash = _hash_key(token)
    doc = await db.public_api_keys.find_one(
        {"key_hash": key_hash}, {"_id": 0},
    )
    if not doc:
        raise HTTPException(401, "API key inválida")
    if doc.get("status") != "active":
        raise HTTPException(401, f"API key {doc.get('status')}")
    if doc.get("expires_at"):
        try:
            expires = datetime.fromisoformat(doc["expires_at"].replace("Z", "+00:00"))
            if expires < _now():
                raise HTTPException(401, "API key expirada")
        except (ValueError, TypeError):
            pass

    month = _now_month()
    # Reset atómico del bucket mensual (la condición va en el FILTRO → sin carrera entre requests concurrentes).
    if doc.get("month_bucket") != month:
        await db.public_api_keys.update_one(
            {"id": doc["id"], "month_bucket": {"$ne": month}},
            {"$set": {"calls_this_month": 0, "month_bucket": month}},
        )

    _q = doc.get("monthly_quota_calls")  # SEGURIDAD (3ª ola): quota=0 (key suspendida) NO debe caer al default 1000
    quota = _q if _q is not None else DEFAULT_QUOTA.get(doc.get("tier", "free"), 1000)
    # SEGURIDAD (pentest 2026-06-27): check de cuota + incremento ATÓMICO en UNA sola op. Antes el check (aquí) y el
    # incremento (track_api_call, después del request) eran 2 ops separadas → TOCTOU: N requests concurrentes pasaban
    # el check con el MISMO contador y excedían la cuota hasta 12×. Ahora find_one_and_update incrementa SOLO si sigue
    # bajo cuota; si el filtro no matchea (cuota llena) → 429.
    bumped = await db.public_api_keys.find_one_and_update(
        {"id": doc["id"], "month_bucket": month,
         "$expr": {"$lt": [{"$ifNull": ["$calls_this_month", 0]}, quota]}},
        {"$inc": {"calls_this_month": 1, "calls_total": 1}, "$set": {"last_used_at": _iso()}},
        projection={"_id": 0, "calls_this_month": 1},
    )
    if not bumped:
        raise HTTPException(429, "Rate limit excedido (cuota mensual agotada)")
    used = (bumped.get("calls_this_month") or 0) + 1

    return ApiKeyContext(
        id=doc["id"], tenant_id=doc.get("tenant_id", ""),
        tier=doc.get("tier", "free"),
        monthly_quota_calls=quota, calls_this_month=used,
        calls_remaining=max(0, quota - used),
        status=doc.get("status", "active"),
        scopes=tuple(doc.get("scopes") or ()),
    )


def require_scope(ctx: ApiKeyContext, scope: str) -> None:
    """F6 · una key CON scopes solo consume sus productos (el bundle de $90k ya no abre todo
    enterprise). Key sin scopes = comportamiento previo (compat con las emitidas a mano)."""
    if ctx.scopes and scope not in ctx.scopes:
        raise HTTPException(403, detail={"error": "scope_insufficient", "required_scope": scope,
                                         "key_scopes": list(ctx.scopes)})


def require_tier(ctx: ApiKeyContext, minimum: str) -> None:
    """Raise 402 if ctx.tier < minimum.  free < pro < enterprise."""
    rank = {"free": 0, "pro": 1, "enterprise": 2}
    if rank.get(ctx.tier, 0) < rank.get(minimum, 0):
        raise HTTPException(
            402,
            detail={
                "error": "tier_insufficient",
                "current_tier": ctx.tier,
                "required_tier": minimum,
                "upgrade_url": "/docs/api#pricing",
            },
        )


# ─── Track usage ──────────────────────────────────────────────────────────────

async def track_api_call(
    db, ctx: ApiKeyContext, request: Request, *,
    status_code: int, latency_ms: int, response_size: int = 0,
    billable: bool = True,
) -> None:
    try:
        endpoint = str(request.url.path)
        method = request.method
        ip = (request.client.host if request.client else "") or ""
        await db.api_call_logs.insert_one({
            "api_key_id": ctx.id,
            "tenant_id": ctx.tenant_id,
            "ts": _now(),
            "method": method,
            "endpoint": endpoint,
            "status_code": status_code,
            "latency_ms": latency_ms,
            "ip": ip,
            "response_size_bytes": response_size,
            "billable": billable,
            "cost_usd_cents": 0,
        })
        # SEGURIDAD (pentest 2026-06-27): el incremento de cuota ya se hace ATÓMICO en validate_api_key (al inicio del
        # request). Aquí solo se registra el log de la llamada — NO se vuelve a incrementar (sería doble conteo y
        # reabriría la carrera TOCTOU). last_used_at también lo setea validate.
    except Exception as e:
        log.warning(f"[apikey] track failed: {e}")


# ─── Indexes ──────────────────────────────────────────────────────────────────

async def ensure_indexes(db) -> None:
    try:
        await db.public_api_keys.create_index("key_hash", unique=True, name="api_key_hash_unique")
        await db.public_api_keys.create_index([("tenant_id", 1), ("status", 1)], name="api_tenant_status")
        await db.public_api_keys.create_index("id", unique=True, name="api_key_id_unique")
        await db.api_call_logs.create_index([("api_key_id", 1), ("ts", -1)], name="api_logs_key_ts")
        await db.api_call_logs.create_index("ts", expireAfterSeconds=90 * 86400, name="api_logs_ttl_90d")
    except Exception as e:
        log.warning(f"[apikey] ensure_indexes failed: {e}")
