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
import dmx_plans  # capa de planes/snapshots GoHighLevel (sobre el feature-gate)
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


# ═══════════════════════════════════════════════════════════════════════════════
# W5.FF5 · A/B Testing endpoints + Bulk CSV import (appended · NO touch above)
# ═══════════════════════════════════════════════════════════════════════════════

from datetime import datetime as _dt, timezone as _tz, timedelta as _td  # noqa: E402


class CreateExperimentBody(BaseModel):
    feature_key: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1, max_length=200)
    split_pct: int = Field(50, ge=0, le=100)
    hypothesis: str = Field("", max_length=500)
    expires_in_days: Optional[int] = Field(None, ge=1, le=365)


@router.post(PREFIX + "/ab-experiments")
async def ab_create_experiment(request: Request, body: CreateExperimentBody):
    _rate_limit(request)
    actor = await require_superadmin(request)
    db = _db(request)
    from ab_testing_engine import create_experiment, ensure_indexes
    await ensure_indexes(db)
    expires_at = None
    if body.expires_in_days:
        expires_at = (_dt.now(_tz.utc) + _td(days=int(body.expires_in_days))).isoformat()
    doc = await create_experiment(
        db,
        feature_key=body.feature_key,
        name=body.name,
        split_pct=body.split_pct,
        hypothesis=body.hypothesis,
        expires_at=expires_at,
        actor_user_id=getattr(actor, "user_id", None),
    )
    return {"ok": True, "experiment": doc}


@router.get(PREFIX + "/ab-experiments")
async def ab_list_experiments(
    request: Request,
    status: Optional[str] = Query(None, pattern=r"^(active|stopped)$"),
    feature_key: Optional[str] = Query(None),
):
    _rate_limit(request)
    await require_superadmin(request)
    db = _db(request)
    from ab_testing_engine import list_experiments
    items = await list_experiments(db, status=status, feature_key=feature_key)
    return {"items": items, "count": len(items)}


@router.get(PREFIX + "/ab-experiments/{experiment_id}/stats")
async def ab_get_experiment_stats(request: Request, experiment_id: str):
    _rate_limit(request)
    await require_superadmin(request)
    db = _db(request)
    from ab_testing_engine import compute_experiment_stats
    stats = await compute_experiment_stats(db, experiment_id)
    return stats


@router.post(PREFIX + "/ab-experiments/{experiment_id}/stop")
async def ab_stop_experiment(request: Request, experiment_id: str):
    _rate_limit(request)
    actor = await require_superadmin(request)
    db = _db(request)
    from ab_testing_engine import stop_experiment
    res = await stop_experiment(
        db, experiment_id, actor_user_id=getattr(actor, "user_id", None)
    )
    return res


# ─── W5.FF5 Sub-B · Bulk CSV import ───────────────────────────────────────────
# Separate rate-limit bucket for bulk (5 req/hour/IP · expensive op).
_BULK_RATE_BUCKET: Dict[str, deque] = defaultdict(lambda: deque(maxlen=5))
_BULK_RATE_WINDOW_S = 3600


def _bulk_rate_limit(request: Request, limit: int = 5) -> None:
    ip = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    if not ip and request.client:
        ip = request.client.host
    ip = ip or "unknown"
    bkt = _BULK_RATE_BUCKET[ip]
    now = time.time()
    while bkt and (now - bkt[0]) > _BULK_RATE_WINDOW_S:
        bkt.popleft()
    if len(bkt) >= limit:
        raise HTTPException(status_code=429, detail=f"Bulk CSV rate limit · {limit}/hora por IP")
    bkt.append(now)


_MAX_BULK_SIZE_BYTES = 1 * 1024 * 1024  # 1 MB
_MAX_BULK_ROWS = 200
_VALID_BOOL = {
    "1": True, "true": True, "True": True, "TRUE": True, "yes": True, "y": True,
    "0": False, "false": False, "False": False, "FALSE": False, "no": False, "n": False,
}


@router.post(PREFIX + "/bulk-csv")
async def ab_bulk_csv_upload(request: Request):
    """Bulk CSV import · multipart/form-data field `file` · header obligatorio.

    Schema: user_id, feature_key, enabled (header line required, order flexible).
    Transactional: any invalid row → 422 con detail.rows_with_errors · CERO writes.
    """
    _bulk_rate_limit(request)
    actor = await require_superadmin(request)
    db = _db(request)

    # Parse multipart (FastAPI Request.form is async)
    form = await request.form()
    file_field = form.get("file")
    if file_field is None or not hasattr(file_field, "read"):
        raise HTTPException(400, "file field requerido (multipart/form-data)")

    raw = await file_field.read()
    if not raw:
        raise HTTPException(400, "file vacío")
    if len(raw) > _MAX_BULK_SIZE_BYTES:
        raise HTTPException(413, f"file > {_MAX_BULK_SIZE_BYTES} bytes")

    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            text = raw.decode("latin-1")
        except Exception:
            raise HTTPException(400, "encoding no soportado · usa UTF-8")

    import csv as _csv
    from io import StringIO
    reader = _csv.DictReader(StringIO(text))
    headers = set(h.strip().lower() for h in (reader.fieldnames or []))
    required = {"user_id", "feature_key", "enabled"}
    if not required.issubset(headers):
        raise HTTPException(
            400,
            f"header inválido · requeridos: {sorted(required)} · recibidos: {sorted(headers) or 'none'}",
        )

    # Validate all rows BEFORE any writes (transactional intent)
    rows: List[Dict[str, Any]] = []
    errors: List[Dict[str, Any]] = []
    extended_keys = {f["key"] for f in ff.get_extended_catalog()}

    for idx, raw_row in enumerate(reader, start=2):  # start=2: header is line 1
        if idx - 1 > _MAX_BULK_ROWS:
            errors.append({"row": idx, "error": f"max rows {_MAX_BULK_ROWS} excedido"})
            break
        row = {(k or "").strip().lower(): (v or "").strip() for k, v in raw_row.items() if k}
        user_id = row.get("user_id", "")
        feature_key = row.get("feature_key", "")
        enabled_raw = row.get("enabled", "")
        if not user_id:
            errors.append({"row": idx, "error": "user_id vacío"})
            continue
        if not feature_key:
            errors.append({"row": idx, "error": "feature_key vacío"})
            continue
        if feature_key not in extended_keys:
            errors.append({"row": idx, "error": f"feature_key desconocida: {feature_key}"})
            continue
        if enabled_raw not in _VALID_BOOL:
            errors.append({"row": idx, "error": f"enabled inválido: '{enabled_raw}' (use 0/1/true/false)"})
            continue
        rows.append({
            "row": idx,
            "user_id": user_id,
            "feature_key": feature_key,
            "enabled": _VALID_BOOL[enabled_raw],
        })

    if errors:
        raise HTTPException(
            status_code=422,
            detail={
                "error": "validation_failed",
                "rows_with_errors": errors,
                "valid_rows_skipped": len(rows),
            },
        )

    # Resolve tenant_id per user_id (lookup users collection · fallback to user_id)
    user_ids = list({r["user_id"] for r in rows})
    tenant_by_user: Dict[str, str] = {}
    try:
        cursor = db.users.find({"user_id": {"$in": user_ids}}, {"_id": 0, "user_id": 1, "tenant_id": 1})
        async for u in cursor:
            tenant_by_user[u.get("user_id")] = u.get("tenant_id") or u.get("user_id")
    except Exception as exc:
        log.warning(f"[bulk_csv] users lookup failed (non-fatal): {exc}")

    actor_id = getattr(actor, "user_id", None)
    now_iso = _dt.now(_tz.utc).isoformat()
    import secrets as _secrets

    rows_succeeded = 0
    row_errors: List[Dict[str, Any]] = []

    for r in rows:
        uid = r["user_id"]
        fk = r["feature_key"]
        enabled = r["enabled"]
        tid = tenant_by_user.get(uid) or uid
        try:
            await db.tenant_features.update_one(
                {"tenant_id": tid, "feature_key": fk},
                {
                    "$set": {
                        "tenant_id": tid,
                        "feature_key": fk,
                        "enabled": enabled,
                        "enabled_at": now_iso if enabled else None,
                        "enabled_by": actor_id,
                        "source": "bulk_csv",
                        "updated_at": now_iso,
                    },
                    "$setOnInsert": {
                        "id": "tf_" + _secrets.token_urlsafe(8),
                        "created_at": now_iso,
                    },
                },
                upsert=True,
            )
            rows_succeeded += 1
            # Audit per row (best-effort)
            try:
                await audit_log(
                    db,
                    actor={"user_id": actor_id or "superadmin", "role": "superadmin"},
                    action="feature_visibility_change",
                    entity_type="tenant_feature",
                    entity_id=f"{tid}:{fk}",
                    before=None,
                    after={
                        "by": actor_id,
                        "user_id": uid,
                        "tenant_id": tid,
                        "feature_key": fk,
                        "enabled": enabled,
                        "source": "bulk_csv",
                    },
                    request=request,
                )
            except Exception:
                pass
        except Exception as exc:
            row_errors.append({"row": r["row"], "error": str(exc)[:160]})

    # Invalidate caches for affected tenants + users
    affected_tenants = set(tenant_by_user.get(uid, uid) for uid in user_ids)
    for tid in affected_tenants:
        try:
            ff.cache_invalidate(tid)
        except Exception:
            pass
    for uid in user_ids:
        try:
            fg.cache_invalidate(user_id=uid)
        except Exception:
            pass

    return {
        "ok": True,
        "rows_processed": len(rows),
        "rows_succeeded": rows_succeeded,
        "errors": row_errors,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# PLANES / SNAPSHOTS estilo GoHighLevel (capa sobre el feature-gate · dmx_plans)
# Superadmin provisiona un tenant asignándole un PLAN; aplicar = snapshot que prende
# todas las features del plan de un jalón. Reusa guard + rate-limit + auditoría.
# ═══════════════════════════════════════════════════════════════════════════════

class AssignPlanBody(BaseModel):
    tenant_id: str = Field(..., min_length=1)
    plan_id: str = Field(..., pattern=r"^(starter|pro|enterprise)$")
    replace: bool = True


@router.get(PREFIX + "/plans")
async def list_plans(request: Request):
    """Catálogo de planes (bundles) con sus features resueltas + precio."""
    _rate_limit(request)
    await require_superadmin(request)
    return {"plans": dmx_plans.get_plans()}


@router.get(PREFIX + "/plans/tenant/{tenant_id}")
async def tenant_plan(tenant_id: str, request: Request):
    """Plan actual de un tenant + sus features activas."""
    _rate_limit(request)
    await require_superadmin(request)
    return await dmx_plans.get_tenant_plan(_db(request), tenant_id)


@router.post(PREFIX + "/plans/assign")
async def assign_plan(body: AssignPlanBody, request: Request):
    """Asigna (snapshot) un plan a un tenant: prende todas sus features de un jalón."""
    _rate_limit(request)
    actor = await require_superadmin(request)
    db = _db(request)
    try:
        result = await dmx_plans.apply_plan(
            db, body.tenant_id, body.plan_id,
            actor_user_id=getattr(actor, "user_id", None), replace=body.replace,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    try:
        await audit_log(
            db,
            actor={"user_id": getattr(actor, "user_id", "superadmin"), "role": "superadmin"},
            action="plan_assign", entity_type="tenant", entity_id=body.tenant_id,
            before=None,
            after={"plan_id": body.plan_id, "tier": result.get("tier"),
                   "enabled": len(result.get("enabled", [])), "disabled": result.get("disabled", [])},
        )
    except Exception:
        pass  # auditoría best-effort · no bloquea la asignación
    return {"ok": True, **result}
