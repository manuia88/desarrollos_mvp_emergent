"""W2.4 SA5 — Commercial Foundation routes.

Prefix: /api/superadmin/commercial · all require_superadmin.
"""
from __future__ import annotations

import logging
import secrets
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

import feature_flags_engine as ff

log = logging.getLogger("dmx.routes_superadmin_commercial")

router = APIRouter(tags=["superadmin_commercial"])
PREFIX = "/api/superadmin/commercial"


def _db(request: Request):
    return request.app.state.db


def _iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _require_superadmin(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    if user.role != "superadmin":
        raise HTTPException(403, "Solo superadmin")
    return user


# ─── Schemas ──────────────────────────────────────────────────────────────────
class FeatureUpsertBody(BaseModel):
    enabled: bool
    plan_tier: Optional[str] = None
    expires_at: Optional[str] = None
    source: Optional[str] = "manual"


class BulkFeatureItem(BaseModel):
    feature_key: str
    enabled: bool
    plan_tier: Optional[str] = None
    expires_at: Optional[str] = None


class BulkFeaturesBody(BaseModel):
    features: List[BulkFeatureItem]


class TemplateCreateBody(BaseModel):
    name: str = Field(..., min_length=2, max_length=80)
    description: Optional[str] = ""
    plan_tier: str = Field("custom", pattern="^(basic|pro|enterprise|custom)$")
    features: List[str] = []
    price_mxn: Optional[float] = Field(None, ge=0, le=1_000_000)


class TemplatePatchBody(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    plan_tier: Optional[str] = None
    features: Optional[List[str]] = None
    price_mxn: Optional[float] = None


class SnapshotCreateBody(BaseModel):
    name: str = Field(..., min_length=2, max_length=80)
    description: Optional[str] = ""
    scope: str = "developer"
    payload: Dict[str, Any] = {}
    from_tenant_id: Optional[str] = None  # serialize live state


class SnapshotApplyBody(BaseModel):
    include_features: bool = True
    include_pipeline: bool = True
    include_email_templates: bool = True
    include_branding: bool = False
    include_automations: bool = True
    include_disc: bool = True
    include_reportes: bool = True


# ─── 1) GET /features/catalog ─────────────────────────────────────────────────
@router.get(PREFIX + "/features/catalog")
async def features_catalog(request: Request):
    await _require_superadmin(request)
    return {"items": ff.get_catalog(), "total": len(ff.get_catalog())}


# ─── 2) GET /tenants/{id}/features ────────────────────────────────────────────
@router.get(PREFIX + "/tenants/{tenant_id}/features")
async def list_tenant_features(tenant_id: str, request: Request):
    await _require_superadmin(request)
    db = _db(request)
    cur = db.tenant_features.find({"tenant_id": tenant_id}, {"_id": 0}).sort("feature_key", 1)
    items = [d async for d in cur]
    enabled_count = sum(1 for it in items if it.get("enabled"))
    return {"tenant_id": tenant_id, "items": items, "total": len(items),
            "enabled_count": enabled_count, "catalog_total": len(ff.FEATURE_CATALOG)}


# ─── 4) POST /tenants/{id}/features/bulk ──────────────────────────────────────
# IMPORTANT: declared BEFORE /tenants/{id}/features/{feature_key} to avoid
# FastAPI path matching "bulk" as a feature_key wildcard.
@router.post(PREFIX + "/tenants/{tenant_id}/features/bulk")
async def bulk_upsert_tenant_features(tenant_id: str, body: BulkFeaturesBody,
                                      request: Request):
    user = await _require_superadmin(request)
    db = _db(request)
    items = [it.dict() for it in body.features]
    result = await ff.bulk_upsert_features(db, tenant_id, items, actor_user_id=user.user_id)
    try:
        from audit_log import log_mutation
        await log_mutation(db, user, "bulk_update", "tenant_features",
                           tenant_id, before=None,
                           after={"count": len(items), "result": result}, request=request)
    except Exception:
        pass
    return {"ok": True, **result, "tenant_id": tenant_id}


# ─── 3) POST /tenants/{id}/features/{feature_key} ─────────────────────────────
@router.post(PREFIX + "/tenants/{tenant_id}/features/{feature_key}")
async def upsert_tenant_feature(tenant_id: str, feature_key: str,
                                body: FeatureUpsertBody, request: Request):
    user = await _require_superadmin(request)
    db = _db(request)
    before = await db.tenant_features.find_one(
        {"tenant_id": tenant_id, "feature_key": feature_key}, {"_id": 0},
    )
    src = body.source or ("trial" if (body.enabled and body.expires_at) else "manual")
    try:
        doc = await ff.upsert_feature(
            db, tenant_id, feature_key,
            enabled=body.enabled, plan_tier=body.plan_tier,
            expires_at=body.expires_at, source=src,
            actor_user_id=user.user_id,
        )
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    try:
        from audit_log import log_mutation
        await log_mutation(db, user, "update", "tenant_feature",
                           f"{tenant_id}:{feature_key}",
                           before=before, after=doc, request=request)
    except Exception:
        pass
    return {"ok": True, "feature": doc}


# ─── 5) GET /plan-templates ───────────────────────────────────────────────────
@router.get(PREFIX + "/plan-templates")
async def list_templates(request: Request):
    await _require_superadmin(request)
    db = _db(request)
    cur = db.plan_templates.find({}, {"_id": 0}).sort("price_mxn", 1)
    return {"items": [d async for d in cur]}


# ─── 6) POST /plan-templates ──────────────────────────────────────────────────
@router.post(PREFIX + "/plan-templates")
async def create_template(body: TemplateCreateBody, request: Request):
    user = await _require_superadmin(request)
    db = _db(request)
    # Validate features
    bad = [f for f in body.features if not ff.get_feature(f)]
    if bad:
        raise HTTPException(400, f"feature_keys desconocidos: {bad}")
    doc = {
        "id": "tpl_" + secrets.token_urlsafe(8),
        "name": body.name, "description": body.description or "",
        "plan_tier": body.plan_tier, "features": body.features,
        "price_mxn": body.price_mxn,
        "created_by": user.user_id, "created_at": _iso(), "updated_at": _iso(),
    }
    try:
        await db.plan_templates.insert_one(dict(doc))
    except Exception as e:
        if "duplicate" in str(e).lower():
            raise HTTPException(409, "Ya existe un template con ese nombre") from e
        raise HTTPException(500, str(e)) from e
    try:
        from audit_log import log_mutation
        await log_mutation(db, user, "create", "plan_template", doc["id"],
                           before=None, after=doc, request=request)
    except Exception:
        pass
    return {"ok": True, "template": {k: v for k, v in doc.items() if k != "_id"}}


# ─── 7) PATCH /plan-templates/{id} ────────────────────────────────────────────
@router.patch(PREFIX + "/plan-templates/{template_id}")
async def patch_template(template_id: str, body: TemplatePatchBody, request: Request):
    user = await _require_superadmin(request)
    db = _db(request)
    before = await db.plan_templates.find_one({"id": template_id}, {"_id": 0})
    if not before:
        raise HTTPException(404, "Template no encontrado")
    upd = {k: v for k, v in body.dict(exclude_unset=True).items() if v is not None}
    if "features" in upd:
        bad = [f for f in upd["features"] if not ff.get_feature(f)]
        if bad:
            raise HTTPException(400, f"feature_keys desconocidos: {bad}")
    upd["updated_at"] = _iso()
    if not upd:
        raise HTTPException(400, "Sin campos a actualizar")
    await db.plan_templates.update_one({"id": template_id}, {"$set": upd})
    after = await db.plan_templates.find_one({"id": template_id}, {"_id": 0})
    try:
        from audit_log import log_mutation
        await log_mutation(db, user, "update", "plan_template", template_id,
                           before=before, after=after, request=request)
    except Exception:
        pass
    return {"ok": True, "template": after}


# ─── 8) POST /plan-templates/{id}/apply/{tenant_id} ───────────────────────────
@router.post(PREFIX + "/plan-templates/{template_id}/apply/{tenant_id}")
async def apply_template_route(template_id: str, tenant_id: str, request: Request):
    user = await _require_superadmin(request)
    db = _db(request)
    try:
        result = await ff.apply_template(db, template_id, tenant_id, actor_user_id=user.user_id)
    except ValueError as e:
        raise HTTPException(404, str(e)) from e
    try:
        from audit_log import log_mutation
        await log_mutation(db, user, "apply", "plan_template_to_tenant",
                           f"{template_id}:{tenant_id}",
                           before=None, after=result, request=request)
    except Exception:
        pass
    return {"ok": True, **result}


# ─── 9) GET /snapshots ────────────────────────────────────────────────────────
@router.get(PREFIX + "/snapshots")
async def list_snapshots(request: Request):
    await _require_superadmin(request)
    db = _db(request)
    cur = db.tenant_snapshots.find({}, {"_id": 0}).sort("created_at", -1)
    items = [d async for d in cur]
    # Add summary counts
    for it in items:
        p = it.get("payload") or {}
        it["summary"] = {
            "features": len(p.get("features") or []),
            "pipeline_stages": len(p.get("pipeline_default") or []),
            "email_templates": len(p.get("email_templates") or []),
            "automations": len(p.get("automations") or []),
            "has_branding": bool(p.get("branding")),
            "has_disc": bool(p.get("disc_config")),
            "has_reportes": bool(p.get("reportes_ia_default")),
        }
    return {"items": items}


# ─── 10) POST /snapshots ──────────────────────────────────────────────────────
@router.post(PREFIX + "/snapshots")
async def create_snapshot(body: SnapshotCreateBody, request: Request):
    user = await _require_superadmin(request)
    db = _db(request)
    payload = dict(body.payload or {})
    if body.from_tenant_id:
        try:
            captured = await ff.serialize_tenant_state(db, body.from_tenant_id)
            # User-provided payload overrides captured for any conflicting key
            payload = {**captured, **payload}
        except Exception as e:
            raise HTTPException(500, f"No pude serializar tenant: {e}") from e

    doc = {
        "id": "snap_" + secrets.token_urlsafe(8),
        "name": body.name, "description": body.description or "",
        "scope": body.scope or "developer",
        "payload": payload,
        "captured_from_tenant_id": body.from_tenant_id,
        "created_by": user.user_id, "created_at": _iso(),
    }
    try:
        await db.tenant_snapshots.insert_one(dict(doc))
    except Exception as e:
        if "duplicate" in str(e).lower():
            raise HTTPException(409, "Ya existe un snapshot con ese nombre") from e
        raise HTTPException(500, str(e)) from e
    try:
        from audit_log import log_mutation
        await log_mutation(db, user, "create", "tenant_snapshot", doc["id"],
                           before=None, after={"name": doc["name"], "scope": doc["scope"],
                                                "captured_from": body.from_tenant_id},
                           request=request)
    except Exception:
        pass
    return {"ok": True, "snapshot": {k: v for k, v in doc.items() if k != "_id"}}


# ─── 11) POST /snapshots/{id}/apply/{tenant_id} ───────────────────────────────
@router.post(PREFIX + "/snapshots/{snapshot_id}/apply/{tenant_id}")
async def apply_snapshot_route(snapshot_id: str, tenant_id: str,
                               body: SnapshotApplyBody, request: Request):
    user = await _require_superadmin(request)
    db = _db(request)
    include = {
        "features": body.include_features,
        "pipeline": body.include_pipeline,
        "email_templates": body.include_email_templates,
        "branding": body.include_branding,
        "automations": body.include_automations,
        "disc": body.include_disc,
        "reportes": body.include_reportes,
    }
    try:
        diff = await ff.apply_snapshot(db, snapshot_id, tenant_id, include,
                                       actor_user_id=user.user_id)
    except ValueError as e:
        raise HTTPException(404, str(e)) from e
    try:
        from audit_log import log_mutation
        await log_mutation(db, user, "apply", "snapshot_to_tenant",
                           f"{snapshot_id}:{tenant_id}",
                           before=None, after={"include": include, "diff": diff},
                           request=request)
    except Exception:
        pass
    return {"ok": True, "snapshot_id": snapshot_id, "tenant_id": tenant_id,
            "include": include, "diff": diff}


# ─── 12) GET /trials/expiring ─────────────────────────────────────────────────
@router.get(PREFIX + "/trials/expiring")
async def list_expiring_trials(request: Request, within_days: int = Query(14, ge=1, le=90)):
    await _require_superadmin(request)
    db = _db(request)
    now = datetime.now(timezone.utc)
    horizon = (now + timedelta(days=within_days)).isoformat()
    cur = db.tenant_features.find({
        "enabled": True,
        "expires_at": {"$exists": True, "$ne": None, "$lte": horizon},
    }, {"_id": 0}).sort("expires_at", 1)
    items = []
    async for d in cur:
        items.append(d)
    return {"items": items, "total": len(items),
            "within_days": within_days, "now": now.isoformat()}


# ─── Manual run for trials cron (testing) ─────────────────────────────────────
@router.post(PREFIX + "/trials/run-check")
async def manual_run_trial_check(request: Request):
    await _require_superadmin(request)
    db = _db(request)
    from trial_expiry_cron import run_trial_expiry_check
    return await run_trial_expiry_check(db)


# ─── Self-service: any logged-in user gets their tenant flags ────────────────
# Mounted at /api/me/feature-flags (NOT under PREFIX — no superadmin guard)
me_router = APIRouter(tags=["me_feature_flags"])


@me_router.get("/api/me/feature-flags")
async def my_feature_flags(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    db = _db(request)
    tenant_id = getattr(user, "tenant_id", None) or getattr(user, "user_id", None)
    # W5.FF1 Sub-C · aditivos: tier + cached_at + expires_in_s (backward compat 100%).
    now_iso = datetime.now(timezone.utc).isoformat()
    if not tenant_id:
        return {
            "tenant_id": None, "enabled": [], "all": [], "is_superadmin": False,
            "tier": "free", "cached_at": now_iso, "expires_in_s": 60,
        }
    flags = await ff.get_tenant_flags(db, tenant_id)
    enabled = []
    all_items = []
    for k, d in flags.items():
        all_items.append({"feature_key": k, "enabled": ff._is_active(d),
                          "expires_at": d.get("expires_at"),
                          "plan_tier": d.get("plan_tier")})
        if ff._is_active(d):
            enabled.append(k)
    # Tier derivado: más permisivo entre flags activos · default free.
    from feature_gate_engine import derive_user_tier
    tier = derive_user_tier(flags)
    return {
        "tenant_id": tenant_id,
        "enabled": enabled,
        "all": all_items,
        "is_superadmin": user.role == "superadmin",
        # ─── W5.FF1 aditivos ──────────────────────────────────────────────
        "tier": tier,
        "cached_at": now_iso,
        "expires_in_s": 60,
    }
