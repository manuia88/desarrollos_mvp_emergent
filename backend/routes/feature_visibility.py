"""W5.FF3 Sub-A — UI Feature Visibility Matrix backend.

Endpoints (superadmin only · audit chain + rate-limit 60/min/IP):
  GET  /api/superadmin/features/catalog            → extended catalog (legacy+registry)
  GET  /api/superadmin/features/users              → users + features_enabled per user
  POST /api/superadmin/features/grant              → upsert tenant_features (grant/revoke)
  POST /api/superadmin/features/apply-template     → bulk apply by tier template

Consume W5.FF1+FF2: feature_flags_engine + feature_legacy_adapter + feature_gate_engine.
"""
from __future__ import annotations

import logging
import time
from collections import defaultdict, deque
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

import feature_flags_engine as ff
from feature_legacy_adapter import TIER_TO_FEATURES, merge_legacy_with_flags
import feature_gate_engine as fg
from permissions import require_superadmin
from audit_immutable_engine import log as audit_log

log = logging.getLogger("dmx.routes_feature_visibility")

router = APIRouter(tags=["superadmin_feature_visibility"])
PREFIX = "/api/superadmin/features"


def _db(request: Request):
    return request.app.state.db


# ─── Rate limiting (60/min/IP · pattern imitado de battle_card) ───────────────
_RATE_BUCKET: Dict[str, deque] = defaultdict(lambda: deque(maxlen=60))
_RATE_WINDOW_S = 60


def _rate_limit(request: Request, limit: int = 60) -> None:
    ip = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
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


# ─── Pydantic models ──────────────────────────────────────────────────────────
class GrantBody(BaseModel):
    user_id: str = Field(..., min_length=1)
    tenant_id: str = Field(..., min_length=1)
    feature_key: str = Field(..., min_length=1)
    enabled: bool


class ApplyTemplateBody(BaseModel):
    user_id: str = Field(..., min_length=1)
    tenant_id: str = Field(..., min_length=1)
    template: str = Field(..., pattern=r"^(starter|pro|enterprise|free)$")


# Template name → tier key in TIER_TO_FEATURES
_TEMPLATE_TO_TIER = {"starter": "free", "free": "free", "pro": "pro", "enterprise": "enterprise"}


# ─── Endpoint 1 · Catalog ─────────────────────────────────────────────────────
@router.get(PREFIX + "/catalog")
async def get_catalog(request: Request):
    _rate_limit(request)
    await require_superadmin(request)
    catalog = ff.get_extended_catalog()
    # Normalize shape for UI (defensive · cualquier entrada legacy puede faltar campos)
    items = []
    for f in catalog:
        items.append({
            "key": f.get("key"),
            "name": f.get("name") or (f.get("key") or "").replace("_", " ").title(),
            "plan_tier": f.get("plan_tier") or "free",
            "monthly_price_mxn": int(f.get("monthly_price_mxn") or 0),
            "category": f.get("category") or "general",
            "requires_features": list(f.get("requires_features") or []),
        })
    # SCHEMA_VERSION lazy import (W5.FF2)
    try:
        from feature_registry import SCHEMA_VERSION
    except Exception:
        SCHEMA_VERSION = 1
    return {"catalog": items, "count": len(items), "schema_version": SCHEMA_VERSION}


# ─── Endpoint 2 · Users with their features ───────────────────────────────────
@router.get(PREFIX + "/users")
async def list_users_with_features(
    request: Request,
    role: Optional[str] = Query(None),
    tier: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    skip: int = Query(0, ge=0),
):
    _rate_limit(request)
    await require_superadmin(request)
    db = _db(request)

    query: Dict[str, Any] = {}
    if role:
        query["role"] = role
    if search:
        # case-insensitive on email or name
        query["$or"] = [
            {"email": {"$regex": search, "$options": "i"}},
            {"name": {"$regex": search, "$options": "i"}},
        ]

    items: List[Dict[str, Any]] = []
    cursor = db.users.find(query, {"_id": 0}).skip(skip).limit(limit)
    async for u in cursor:
        user_id = u.get("user_id") or u.get("id") or ""
        tenant_id = u.get("tenant_id") or user_id
        try:
            feats = await merge_legacy_with_flags(db, user_id, tenant_id)
        except Exception as exc:
            log.warning(f"[feature_visibility] merge failed user={user_id}: {exc}")
            feats = []
        # Derived tier via feature_gate_engine helper
        try:
            flags = await ff.get_tenant_flags(db, tenant_id)
            derived_tier = fg.derive_user_tier(flags)
        except Exception:
            derived_tier = "free"
        if tier and derived_tier != tier:
            continue
        items.append({
            "user_id": user_id,
            "name": u.get("name") or "",
            "email": u.get("email") or "",
            "role": u.get("role") or "",
            "tier": derived_tier,
            "tenant_id": tenant_id,
            "features_enabled": feats,
            "features_count": len(feats),
        })

    # Total count for pagination UI (without features merge · O(1))
    try:
        total = await db.users.count_documents(query)
    except Exception:
        total = len(items)

    return {"items": items, "count": len(items), "total": total, "skip": skip, "limit": limit}


# ─── Endpoint 3 · Grant / revoke single feature ───────────────────────────────
@router.post(PREFIX + "/grant")
async def grant_feature(request: Request, body: GrantBody):
    _rate_limit(request)
    actor = await require_superadmin(request)
    db = _db(request)

    # W5.FF4 · validate dependencies (only when enabling)
    if body.enabled:
        from feature_dependencies import validate_dependencies
        is_valid, missing = await validate_dependencies(db, body.user_id, body.tenant_id, body.feature_key)
        if not is_valid:
            raise HTTPException(
                status_code=409,
                detail={
                    "error": "missing_dependencies",
                    "feature_key": body.feature_key,
                    "required": missing,
                },
            )

    # Upsert in tenant_features (W2.4 SA5 storage) · respeta schema existente.
    try:
        doc = await ff.upsert_feature(
            db,
            body.tenant_id,
            body.feature_key,
            enabled=body.enabled,
            source="manual",
            actor_user_id=getattr(actor, "user_id", None),
        )
    except ValueError as ve:
        # Feature key NOT in legacy catalog → check registry (extended)
        extended_keys = {f["key"] for f in ff.get_extended_catalog()}
        if body.feature_key not in extended_keys:
            raise HTTPException(400, str(ve))
        # Bypass legacy validation: manual upsert minimal doc
        import secrets
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc).isoformat()
        await db.tenant_features.update_one(
            {"tenant_id": body.tenant_id, "feature_key": body.feature_key},
            {
                "$set": {
                    "tenant_id": body.tenant_id,
                    "feature_key": body.feature_key,
                    "enabled": bool(body.enabled),
                    "enabled_at": now if body.enabled else None,
                    "enabled_by": getattr(actor, "user_id", None),
                    "source": "manual",
                    "updated_at": now,
                },
                "$setOnInsert": {
                    "id": "tf_" + secrets.token_urlsafe(8),
                    "created_at": now,
                },
            },
            upsert=True,
        )
        ff.cache_invalidate(body.tenant_id)
        doc = {"tenant_id": body.tenant_id, "feature_key": body.feature_key, "enabled": body.enabled}

    # Invalidate feature_gate cache for this (user, tenant)
    try:
        fg.cache_invalidate(user_id=body.user_id, tenant_id=body.tenant_id)
    except Exception as exc:
        log.warning(f"[feature_visibility] fg.cache_invalidate failed: {exc}")

    # Audit chain
    try:
        await audit_log(
            db,
            actor={"user_id": getattr(actor, "user_id", "superadmin"), "role": "superadmin"},
            action="feature_visibility_change",
            entity_type="tenant_feature",
            entity_id=f"{body.tenant_id}:{body.feature_key}",
            before=None,
            after={
                "by": getattr(actor, "user_id", None),
                "user_id": body.user_id,
                "tenant_id": body.tenant_id,
                "feature_key": body.feature_key,
                "enabled": body.enabled,
                "source": "manual",
            },
            request=request,
        )
    except Exception as exc:
        log.warning(f"[feature_visibility] audit log failed (non-fatal): {exc}")

    return {"ok": True, "doc": doc}


# ─── Endpoint 4 · Apply template (bulk grant per tier) ────────────────────────
@router.post(PREFIX + "/apply-template")
async def apply_template_endpoint(request: Request, body: ApplyTemplateBody):
    _rate_limit(request)
    actor = await require_superadmin(request)
    db = _db(request)

    tier_key = _TEMPLATE_TO_TIER[body.template]
    target_keys = list(TIER_TO_FEATURES.get(tier_key, []))
    # Also include inherited features (pro hereda free, etc) via adapter helper
    from feature_legacy_adapter import resolve_features_from_tier
    target_keys = resolve_features_from_tier(tier_key)
    # W5.FF4 · cascade dependencies (prerequisites first)
    from feature_dependencies import resolve_cascade
    target_keys = resolve_cascade(target_keys)

    granted: List[str] = []
    skipped: List[Dict[str, str]] = []
    import secrets
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    actor_id = getattr(actor, "user_id", None)

    for fk in target_keys:
        try:
            await db.tenant_features.update_one(
                {"tenant_id": body.tenant_id, "feature_key": fk},
                {
                    "$set": {
                        "tenant_id": body.tenant_id,
                        "feature_key": fk,
                        "enabled": True,
                        "enabled_at": now,
                        "enabled_by": actor_id,
                        "source": "template",
                        "plan_tier": tier_key,
                        "updated_at": now,
                    },
                    "$setOnInsert": {
                        "id": "tf_" + secrets.token_urlsafe(8),
                        "created_at": now,
                    },
                },
                upsert=True,
            )
            granted.append(fk)
        except Exception as exc:
            skipped.append({"feature_key": fk, "error": str(exc)[:160]})

    ff.cache_invalidate(body.tenant_id)
    try:
        fg.cache_invalidate(user_id=body.user_id, tenant_id=body.tenant_id)
    except Exception:
        pass

    # Audit summary
    try:
        await audit_log(
            db,
            actor={"user_id": actor_id or "superadmin", "role": "superadmin"},
            action="feature_visibility_change",
            entity_type="tenant_feature_template",
            entity_id=f"{body.tenant_id}:{body.template}",
            before=None,
            after={
                "by": actor_id,
                "user_id": body.user_id,
                "tenant_id": body.tenant_id,
                "template": body.template,
                "granted_count": len(granted),
                "skipped_count": len(skipped),
                "source": "template",
            },
            request=request,
        )
    except Exception as exc:
        log.warning(f"[feature_visibility] audit template (non-fatal): {exc}")

    return {
        "ok": True,
        "template": body.template,
        "tier": tier_key,
        "granted": granted,
        "skipped": skipped,
        "granted_count": len(granted),
    }


# ─── Endpoint 5 · W5.FF4 · Feature usage analytics ────────────────────────────
@router.get(PREFIX + "/usage")
async def get_feature_usage(request: Request, days: int = Query(7, ge=1, le=90)):
    _rate_limit(request)
    await require_superadmin(request)
    db = _db(request)
    from feature_usage_analytics import compute_feature_usage, compute_global_summary
    usage = await compute_feature_usage(db, days=days)
    summary = await compute_global_summary(db, days=days, top_n=5)
    return {
        "usage": usage,
        "period_days": days,
        "summary": summary,
    }
