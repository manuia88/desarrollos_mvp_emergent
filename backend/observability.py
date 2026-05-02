"""Phase F0.11 — Sentry + PostHog wiring + ml_training_events emit helper.

Lightweight observability stack:
- Sentry: error tracking + perf 0.1 sample.
- PostHog: product analytics + ML training events pipeline (seeds Phase 17).
- ml_training_events (Mongo): bare-bones schema that Phase 17 will expand.

All integrations gracefully no-op when keys are missing (stub honest).
"""
from __future__ import annotations

import os
import uuid
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

log = logging.getLogger("dmx.observability")

_posthog_client = None
_sentry_initialized = False


# ─── Sentry ───────────────────────────────────────────────────────────────────
def init_sentry() -> bool:
    """Call once at backend startup. Returns True if initialized."""
    global _sentry_initialized
    dsn = os.environ.get("SENTRY_DSN", "").strip()
    if not dsn:
        log.info("[observability] SENTRY_DSN empty — Sentry disabled (stub).")
        return False
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.starlette import StarletteIntegration
        from sentry_sdk.integrations.logging import LoggingIntegration
        sentry_sdk.init(
            dsn=dsn,
            traces_sample_rate=0.1,
            profiles_sample_rate=0.1,
            environment=os.environ.get("DMX_ENV", "preview"),
            release=os.environ.get("DMX_RELEASE", "dmx-backend@dev"),
            send_default_pii=False,
            integrations=[
                FastApiIntegration(transaction_style="endpoint"),
                StarletteIntegration(transaction_style="endpoint"),
                LoggingIntegration(level=logging.INFO, event_level=logging.ERROR),
            ],
        )
        _sentry_initialized = True
        log.info("[observability] Sentry initialized OK")
        return True
    except Exception as e:
        log.warning(f"[observability] Sentry init failed: {e}")
        return False


def sentry_tag_user(user: Optional[Dict[str, Any]]) -> None:
    """Attach user_id/role/tenant_id tags to current Sentry scope."""
    if not _sentry_initialized or not user:
        return
    try:
        import sentry_sdk
        with sentry_sdk.configure_scope() as scope:
            scope.set_user({
                "id": user.get("user_id"),
                "email": user.get("email"),
            })
            scope.set_tag("role", user.get("role"))
            scope.set_tag("tenant_id", user.get("tenant_id"))
            scope.set_tag("org_id", user.get("tenant_id"))
    except Exception:
        pass


# ─── PostHog ──────────────────────────────────────────────────────────────────
def init_posthog():
    """Returns posthog.Client or None."""
    global _posthog_client
    key = os.environ.get("POSTHOG_KEY", "").strip()
    host = os.environ.get("POSTHOG_HOST", "https://us.i.posthog.com").strip()
    if not key:
        log.info("[observability] POSTHOG_KEY empty — PostHog disabled (stub).")
        return None
    try:
        from posthog import Posthog
        _posthog_client = Posthog(project_api_key=key, host=host, sync_mode=False)
        log.info(f"[observability] PostHog initialized OK (host={host})")
        return _posthog_client
    except Exception as e:
        log.warning(f"[observability] PostHog init failed: {e}")
        return None


def capture_event(user_id: str, event: str, properties: Optional[Dict[str, Any]] = None) -> None:
    """Fire-and-forget PostHog event. Safe no-op if disabled."""
    if not _posthog_client or not user_id:
        return
    try:
        _posthog_client.capture(
            distinct_id=str(user_id),
            event=event,
            properties=properties or {},
        )
    except Exception as e:
        log.debug(f"[observability] capture_event failed ({event}): {e}")


def identify_user(user: Dict[str, Any]) -> None:
    if not _posthog_client or not user:
        return
    try:
        _posthog_client.identify(
            distinct_id=str(user.get("user_id")),
            properties={
                "email": user.get("email"),
                "role": user.get("role"),
                "org_id": user.get("tenant_id"),
                "tenant_id": user.get("tenant_id"),
                "name": user.get("name"),
            },
        )
    except Exception:
        pass


# ─── ML training events (Phase 17 seed) ───────────────────────────────────────
async def ensure_ml_indexes(db) -> None:
    coll = db.ml_training_events
    await coll.create_index("event_type")
    await coll.create_index("user_id")
    await coll.create_index("org_id")
    await coll.create_index([("ts", -1)])


async def emit_ml_event(
    db,
    *,
    event_type: str,
    user_id: Optional[str] = None,
    org_id: Optional[str] = None,
    role: Optional[str] = None,
    context: Optional[Dict[str, Any]] = None,
    ai_decision: Optional[Dict[str, Any]] = None,
    user_action: Optional[Dict[str, Any]] = None,
) -> str:
    """Unified ML training event emitter → Mongo + PostHog mirror."""
    eid = f"ml_{uuid.uuid4().hex[:14]}"
    now = datetime.now(timezone.utc)
    doc = {
        "id": eid,
        "event_type": event_type,
        "user_id": user_id,
        "org_id": org_id,
        "role": role,
        "context": context or {},
        "ai_decision": ai_decision or {},
        "user_action": user_action or {},
        "ts": now,
    }
    try:
        await db.ml_training_events.insert_one(doc)
    except Exception as e:
        log.warning(f"[observability] ml_training_events insert failed: {e}")
    # Mirror to PostHog with dmx_ml_* prefix for filtering
    capture_event(user_id or "system", f"dmx_ml_{event_type}", {
        "org_id": org_id, "role": role,
        "context": context or {}, "ai_decision": ai_decision or {},
        "user_action": user_action or {},
    })
    return eid


# ─── Router ───────────────────────────────────────────────────────────────────
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

router = APIRouter(tags=["observability"])


class MlEmitIn(BaseModel):
    event_type: str = Field(..., min_length=2, max_length=80)
    context: Dict[str, Any] = Field(default_factory=dict)
    ai_decision: Dict[str, Any] = Field(default_factory=dict)
    user_action: Dict[str, Any] = Field(default_factory=dict)


async def _get_user(request: Request):
    from server import get_current_user
    return await get_current_user(request)


@router.post("/api/ml/emit")
async def api_ml_emit(payload: MlEmitIn, request: Request):
    user = await _get_user(request)
    if not user:
        raise HTTPException(401, "Auth requerida")
    db = request.app.state.db
    eid = await emit_ml_event(
        db,
        event_type=payload.event_type,
        user_id=user.user_id,
        org_id=getattr(user, "tenant_id", None),
        role=user.role,
        context=payload.context,
        ai_decision=payload.ai_decision,
        user_action=payload.user_action,
    )
    return {"ok": True, "id": eid}


@router.post("/api/_internal/test-sentry")
async def test_sentry(request: Request):
    """Force an exception to validate Sentry pipeline. Superadmin-only."""
    user = await _get_user(request)
    if not user or getattr(user, "role", None) != "superadmin":
        raise HTTPException(403, "Solo superadmin")
    # Tag the scope so we can verify in Sentry
    sentry_tag_user({
        "user_id": user.user_id, "email": user.email,
        "role": user.role, "tenant_id": getattr(user, "tenant_id", None),
    })
    raise RuntimeError(f"DMX Sentry pipeline smoke test — {datetime.now(timezone.utc).isoformat()} — user={user.user_id}")


@router.get("/api/_internal/observability/status")
async def observability_status(request: Request):
    """Returns count cards for /superadmin/observability page."""
    user = await _get_user(request)
    if not user or getattr(user, "role", None) != "superadmin":
        raise HTTPException(403, "Solo superadmin")
    db = request.app.state.db
    now = datetime.now(timezone.utc)
    from datetime import timedelta
    since_24h = now - timedelta(hours=24)
    ml_24h = await db.ml_training_events.count_documents({"ts": {"$gte": since_24h}})
    ml_total = await db.ml_training_events.count_documents({})
    ml_by_type: Dict[str, int] = {}
    cursor = db.ml_training_events.aggregate([
        {"$match": {"ts": {"$gte": since_24h}}},
        {"$group": {"_id": "$event_type", "n": {"$sum": 1}}},
        {"$sort": {"n": -1}},
        {"$limit": 10},
    ])
    async for row in cursor:
        ml_by_type[row["_id"]] = row["n"]

    sentry_enabled = _sentry_initialized
    posthog_enabled = _posthog_client is not None

    # External dashboard links
    sentry_link = "https://sentry.io/" if sentry_enabled else None
    posthog_link = os.environ.get("POSTHOG_HOST", "https://us.i.posthog.com")

    return {
        "sentry": {"enabled": sentry_enabled, "dashboard_url": sentry_link},
        "posthog": {"enabled": posthog_enabled, "dashboard_url": posthog_link},
        "ml_events": {
            "last_24h": ml_24h,
            "total": ml_total,
            "by_type_24h": ml_by_type,
        },
        "env": os.environ.get("DMX_ENV", "preview"),
    }
