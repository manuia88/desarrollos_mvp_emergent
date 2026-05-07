"""W2.4 SA5 — Feature Flags Engine.

Central registry of commercial feature flags + per-tenant flag resolution.
Stores flags in `db.tenant_features` keyed by `(tenant_id, feature_key)` unique.
Cache 60s in-memory.
"""
from __future__ import annotations

import logging
import secrets
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.feature_flags_engine")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso() -> str:
    return _now().isoformat()


# ─── Feature catalog ──────────────────────────────────────────────────────────
FEATURE_CATALOG: List[Dict[str, Any]] = [
    {"key": "demanda",            "name": "Demanda IE",              "category": "intelligence", "default_plan_tier": "pro",        "monthly_price_mxn": 199, "requires_features": []},
    {"key": "pricing_ai",         "name": "Pricing AI",              "category": "ai",           "default_plan_tier": "pro",        "monthly_price_mxn": 299, "requires_features": []},
    {"key": "site_selection",     "name": "Site Selection",          "category": "intelligence", "default_plan_tier": "enterprise", "monthly_price_mxn": 499, "requires_features": ["demanda"]},
    {"key": "competidores",       "name": "Análisis Competidores",   "category": "intelligence", "default_plan_tier": "enterprise", "monthly_price_mxn": 399, "requires_features": []},
    {"key": "reportes_ia",        "name": "Reportes IA",             "category": "ai",           "default_plan_tier": "pro",        "monthly_price_mxn": 199, "requires_features": []},
    {"key": "cross_partnerships", "name": "Cross Partnerships",      "category": "marketing",    "default_plan_tier": "enterprise", "monthly_price_mxn": 299, "requires_features": []},
    {"key": "studio",             "name": "Studio (assets gen)",     "category": "marketing",    "default_plan_tier": "pro",        "monthly_price_mxn": 249, "requires_features": []},
    {"key": "bulk_drive_sync",    "name": "Sync masivo Drive",       "category": "data",         "default_plan_tier": "enterprise", "monthly_price_mxn": 399, "requires_features": []},
    {"key": "api_access",         "name": "Acceso API REST",         "category": "data",         "default_plan_tier": "enterprise", "monthly_price_mxn": 599, "requires_features": []},
    {"key": "advanced_analytics", "name": "Analytics avanzado",      "category": "intelligence", "default_plan_tier": "enterprise", "monthly_price_mxn": 449, "requires_features": []},
]
_BY_KEY: Dict[str, Dict[str, Any]] = {f["key"]: f for f in FEATURE_CATALOG}


def get_catalog() -> List[Dict[str, Any]]:
    return [dict(f) for f in FEATURE_CATALOG]


def get_feature(key: str) -> Optional[Dict[str, Any]]:
    return _BY_KEY.get(key)


# ─── Cache ────────────────────────────────────────────────────────────────────
_CACHE_TTL = 60.0
_cache: Dict[str, Dict[str, Any]] = {}  # tenant_id -> {ts, flags:{key: doc}}


def _cache_get(tenant_id: str) -> Optional[Dict[str, Any]]:
    e = _cache.get(tenant_id)
    if not e:
        return None
    if (time.monotonic() - e["ts"]) > _CACHE_TTL:
        _cache.pop(tenant_id, None)
        return None
    return e["flags"]


def _cache_set(tenant_id: str, flags: Dict[str, Any]) -> None:
    _cache[tenant_id] = {"ts": time.monotonic(), "flags": flags}


def cache_invalidate(tenant_id: Optional[str] = None) -> None:
    if tenant_id:
        _cache.pop(tenant_id, None)
    else:
        _cache.clear()


# ─── Resolution ───────────────────────────────────────────────────────────────
def _is_active(doc: Dict[str, Any]) -> bool:
    if not doc.get("enabled"):
        return False
    exp = doc.get("expires_at")
    if exp:
        try:
            exp_dt = datetime.fromisoformat(exp.replace("Z", "+00:00")) if isinstance(exp, str) else exp
            if exp_dt < _now():
                return False
        except Exception:
            pass
    return True


async def get_tenant_flags(db, tenant_id: str) -> Dict[str, Any]:
    cached = _cache_get(tenant_id)
    if cached is not None:
        return cached
    flags: Dict[str, Any] = {}
    async for d in db.tenant_features.find({"tenant_id": tenant_id}, {"_id": 0}):
        flags[d["feature_key"]] = d
    _cache_set(tenant_id, flags)
    return flags


async def is_feature_enabled(db, tenant_id: str, feature_key: str) -> bool:
    flags = await get_tenant_flags(db, tenant_id)
    doc = flags.get(feature_key)
    if not doc:
        return False
    return _is_active(doc)


# ─── Mutations ────────────────────────────────────────────────────────────────
async def upsert_feature(db, tenant_id: str, feature_key: str, *,
                         enabled: bool, plan_tier: Optional[str] = None,
                         expires_at: Optional[str] = None,
                         source: str = "manual",
                         actor_user_id: Optional[str] = None) -> Dict[str, Any]:
    if feature_key not in _BY_KEY:
        raise ValueError(f"feature_key desconocido: {feature_key}")
    now = _iso()
    doc = {
        "tenant_id": tenant_id,
        "feature_key": feature_key,
        "enabled": bool(enabled),
        "enabled_at": now if enabled else None,
        "enabled_by": actor_user_id,
        "plan_tier": plan_tier,
        "expires_at": expires_at,
        "source": source,
        "updated_at": now,
    }
    await db.tenant_features.update_one(
        {"tenant_id": tenant_id, "feature_key": feature_key},
        {"$set": doc, "$setOnInsert": {"id": "tf_" + secrets.token_urlsafe(8), "created_at": now}},
        upsert=True,
    )
    cache_invalidate(tenant_id)
    return doc


async def bulk_upsert_features(db, tenant_id: str,
                               items: List[Dict[str, Any]],
                               actor_user_id: Optional[str] = None,
                               source: str = "manual") -> Dict[str, Any]:
    applied = []
    skipped = []
    for it in items:
        try:
            await upsert_feature(
                db, tenant_id, it["feature_key"],
                enabled=bool(it.get("enabled")),
                plan_tier=it.get("plan_tier"),
                expires_at=it.get("expires_at"),
                source=source, actor_user_id=actor_user_id,
            )
            applied.append(it["feature_key"])
        except Exception as e:
            skipped.append({"feature_key": it.get("feature_key"), "error": str(e)})
    return {"applied": applied, "skipped": skipped, "total": len(items)}


# ─── Templates ────────────────────────────────────────────────────────────────
async def apply_template(db, template_id: str, tenant_id: str,
                         actor_user_id: Optional[str] = None) -> Dict[str, Any]:
    tpl = await db.plan_templates.find_one({"id": template_id}, {"_id": 0})
    if not tpl:
        raise ValueError("Plan template no encontrado")

    target_features = set(tpl.get("features") or [])
    # Current enabled features for this tenant (manual or from previous template)
    current = await get_tenant_flags(db, tenant_id)
    enabled_now = {k for k, d in current.items() if _is_active(d)}

    to_enable = target_features - enabled_now
    to_disable = {k for k in enabled_now
                  if (current[k].get("source") in ("template", "manual"))
                  and k not in target_features}

    items_enable = [{"feature_key": k, "enabled": True, "plan_tier": tpl.get("plan_tier")}
                    for k in to_enable]
    items_disable = [{"feature_key": k, "enabled": False} for k in to_disable]
    await bulk_upsert_features(db, tenant_id, items_enable + items_disable,
                               actor_user_id=actor_user_id, source="template")

    return {
        "template_id": template_id,
        "template_name": tpl.get("name"),
        "tenant_id": tenant_id,
        "applied": sorted(list(to_enable)),
        "removed": sorted(list(to_disable)),
        "kept": sorted(list(target_features & enabled_now)),
    }


# ─── Snapshots ────────────────────────────────────────────────────────────────
SNAPSHOT_COMPONENTS = ("features", "pipeline", "email_templates", "branding",
                       "automations", "disc", "reportes")


async def serialize_tenant_state(db, tenant_id: str) -> Dict[str, Any]:
    """Capture current tenant state across the snapshot-able dimensions."""
    payload: Dict[str, Any] = {}

    # Features
    cur = await db.tenant_features.find({"tenant_id": tenant_id, "enabled": True},
                                        {"_id": 0, "feature_key": 1, "expires_at": 1}).to_list(length=200)
    payload["features"] = [{"feature_key": f["feature_key"], "expires_at": f.get("expires_at")} for f in cur]

    # Pipeline (best-effort: pipeline_stages collection)
    try:
        stages = await db.pipeline_stages.find({"tenant_id": tenant_id}, {"_id": 0}).to_list(length=50)
        if stages:
            payload["pipeline_default"] = stages
    except Exception:
        pass

    # Email templates
    try:
        emails = await db.email_templates.find({"tenant_id": tenant_id}, {"_id": 0}).to_list(length=50)
        if emails:
            payload["email_templates"] = emails
    except Exception:
        pass

    # Branding
    try:
        org = await db.developer_organizations.find_one(
            {"id": tenant_id}, {"_id": 0, "branding": 1, "logo_url": 1, "color_palette": 1},
        )
        if org and (org.get("branding") or org.get("logo_url")):
            payload["branding"] = {k: v for k, v in org.items() if k != "_id"}
    except Exception:
        pass

    # Automations
    try:
        autos = await db.automations.find({"tenant_id": tenant_id}, {"_id": 0}).to_list(length=50)
        if autos:
            payload["automations"] = autos
    except Exception:
        pass

    # DISC config
    try:
        disc = await db.disc_configs.find_one({"tenant_id": tenant_id}, {"_id": 0})
        if disc:
            payload["disc_config"] = disc
    except Exception:
        pass

    # Reportes IA defaults
    try:
        rep = await db.reportes_ia_config.find_one({"tenant_id": tenant_id}, {"_id": 0})
        if rep:
            payload["reportes_ia_default"] = rep
    except Exception:
        pass

    return payload


async def apply_snapshot(db, snapshot_id: str, tenant_id: str,
                         include: Dict[str, bool],
                         actor_user_id: Optional[str] = None) -> Dict[str, Any]:
    snap = await db.tenant_snapshots.find_one({"id": snapshot_id}, {"_id": 0})
    if not snap:
        raise ValueError("Snapshot no encontrado")
    payload = snap.get("payload") or {}

    diff: Dict[str, Any] = {"applied_components": [], "skipped_components": []}

    if include.get("features", True) and payload.get("features"):
        items = [{"feature_key": f["feature_key"], "enabled": True,
                  "expires_at": f.get("expires_at")}
                 for f in payload["features"]
                 if f.get("feature_key") in _BY_KEY]
        r = await bulk_upsert_features(db, tenant_id, items,
                                       actor_user_id=actor_user_id, source="snapshot")
        diff["features"] = r
        diff["applied_components"].append("features")
    elif "features" in include and not include["features"]:
        diff["skipped_components"].append("features")

    if include.get("pipeline", True) and payload.get("pipeline_default"):
        try:
            await db.pipeline_stages.delete_many({"tenant_id": tenant_id})
            for st in payload["pipeline_default"]:
                st_copy = {k: v for k, v in st.items() if k not in ("_id", "id")}
                st_copy["tenant_id"] = tenant_id
                st_copy["id"] = "ps_" + secrets.token_urlsafe(8)
                await db.pipeline_stages.insert_one(st_copy)
            diff["applied_components"].append("pipeline")
        except Exception as e:
            diff["pipeline_error"] = str(e)[:200]

    if include.get("email_templates", True) and payload.get("email_templates"):
        try:
            for em in payload["email_templates"]:
                em_copy = {k: v for k, v in em.items() if k != "_id"}
                em_copy["tenant_id"] = tenant_id
                em_copy["id"] = em.get("id") or ("em_" + secrets.token_urlsafe(8))
                await db.email_templates.update_one(
                    {"tenant_id": tenant_id, "id": em_copy["id"]},
                    {"$set": em_copy}, upsert=True,
                )
            diff["applied_components"].append("email_templates")
        except Exception as e:
            diff["email_templates_error"] = str(e)[:200]

    if include.get("branding", False) and payload.get("branding"):
        try:
            await db.developer_organizations.update_one(
                {"id": tenant_id},
                {"$set": {k: v for k, v in payload["branding"].items()
                          if k in ("branding", "logo_url", "color_palette")}},
            )
            diff["applied_components"].append("branding")
        except Exception as e:
            diff["branding_error"] = str(e)[:200]

    if include.get("automations", True) and payload.get("automations"):
        try:
            for a in payload["automations"]:
                a_copy = {k: v for k, v in a.items() if k != "_id"}
                a_copy["tenant_id"] = tenant_id
                a_copy["id"] = a.get("id") or ("auto_" + secrets.token_urlsafe(8))
                await db.automations.update_one(
                    {"tenant_id": tenant_id, "id": a_copy["id"]},
                    {"$set": a_copy}, upsert=True,
                )
            diff["applied_components"].append("automations")
        except Exception as e:
            diff["automations_error"] = str(e)[:200]

    if include.get("disc", True) and payload.get("disc_config"):
        try:
            cfg = {k: v for k, v in payload["disc_config"].items() if k != "_id"}
            cfg["tenant_id"] = tenant_id
            await db.disc_configs.update_one(
                {"tenant_id": tenant_id}, {"$set": cfg}, upsert=True,
            )
            diff["applied_components"].append("disc")
        except Exception as e:
            diff["disc_error"] = str(e)[:200]

    if include.get("reportes", True) and payload.get("reportes_ia_default"):
        try:
            cfg = {k: v for k, v in payload["reportes_ia_default"].items() if k != "_id"}
            cfg["tenant_id"] = tenant_id
            await db.reportes_ia_config.update_one(
                {"tenant_id": tenant_id}, {"$set": cfg}, upsert=True,
            )
            diff["applied_components"].append("reportes")
        except Exception as e:
            diff["reportes_error"] = str(e)[:200]

    cache_invalidate(tenant_id)
    return diff


# ─── Indexes + seeds ──────────────────────────────────────────────────────────
async def ensure_commercial_indexes(db) -> None:
    try:
        await db.tenant_features.create_index([("tenant_id", 1), ("feature_key", 1)], unique=True, background=True)
        await db.tenant_features.create_index([("expires_at", 1)], background=True,
                                              partialFilterExpression={"expires_at": {"$exists": True}})
        await db.plan_templates.create_index("name", unique=True, background=True)
        await db.plan_templates.create_index("id", unique=True, background=True)
        await db.tenant_snapshots.create_index("name", unique=True, background=True)
        await db.tenant_snapshots.create_index("id", unique=True, background=True)
    except Exception as e:
        log.warning(f"[commercial] indexes: {e}")


PLAN_TEMPLATES_SEED = [
    {
        "id": "tpl_basic", "name": "Basic", "description": "Plan gratuito · core CRM + dashboard",
        "plan_tier": "basic", "features": [], "price_mxn": 0,
    },
    {
        "id": "tpl_pro", "name": "Pro", "description": "Plan Pro · IA + reportes inteligentes",
        "plan_tier": "pro", "features": ["demanda", "pricing_ai", "reportes_ia"], "price_mxn": 499,
    },
    {
        "id": "tpl_enterprise", "name": "Enterprise", "description": "Plan Enterprise · suite completa",
        "plan_tier": "enterprise",
        "features": ["demanda", "pricing_ai", "reportes_ia", "site_selection", "competidores",
                     "cross_partnerships", "bulk_drive_sync"],
        "price_mxn": 1499,
    },
]

SNAPSHOTS_SEED = [
    {
        "id": "snap_solo", "name": "Dev Solo", "description": "Desarrollador independiente · 1-3 proyectos",
        "scope": "developer",
        "payload": {"features": [], "pipeline_default": [
            {"id": "st1", "name": "Lead", "order": 1},
            {"id": "st2", "name": "Calificación", "order": 2},
            {"id": "st3", "name": "Visita", "order": 3},
            {"id": "st4", "name": "Apartado", "order": 4},
            {"id": "st5", "name": "Cierre", "order": 5},
        ], "branding": {"logo_url": None, "color_palette": "default"}},
    },
    {
        "id": "snap_mid", "name": "Dev Mid 5-15", "description": "Desarrollador medio · 5-15 proyectos activos",
        "scope": "developer",
        "payload": {"features": [{"feature_key": k} for k in ["demanda", "pricing_ai", "reportes_ia"]],
                    "pipeline_default": [
                        {"id": "st1", "name": "Lead", "order": 1},
                        {"id": "st2", "name": "Contacto", "order": 2},
                        {"id": "st3", "name": "Calificación", "order": 3},
                        {"id": "st4", "name": "Visita", "order": 4},
                        {"id": "st5", "name": "Propuesta", "order": 5},
                        {"id": "st6", "name": "Apartado", "order": 6},
                        {"id": "st7", "name": "Cierre", "order": 7}],
                    "email_templates": [
                        {"id": "em_welcome", "name": "Bienvenida", "subject": "Bienvenido a {{org_name}}",
                         "body": "Gracias por registrarte..."},
                        {"id": "em_followup", "name": "Follow-up 48h", "subject": "Sigues interesado?",
                         "body": "Hola {{name}}, queríamos saber..."},
                        {"id": "em_proposal", "name": "Propuesta", "subject": "Tu propuesta lista",
                         "body": "Adjunto encontrarás..."}]},
    },
    {
        "id": "snap_enterprise", "name": "Dev Enterprise 30+", "description": "Desarrollador grande · 30+ proyectos",
        "scope": "developer",
        "payload": {"features": [{"feature_key": k} for k in
                                  ["demanda", "pricing_ai", "reportes_ia", "site_selection",
                                   "competidores", "cross_partnerships", "bulk_drive_sync"]],
                    "automations": [
                        {"id": "auto_assign", "trigger": "lead_created", "action": "assign_round_robin"},
                        {"id": "auto_followup", "trigger": "lead_inactive_72h", "action": "send_followup_email"}],
                    "disc_config": {"enabled": True, "auto_classify": True},
                    "reportes_ia_default": {"weekly_brief": True, "competitor_alert": True}},
    },
]


async def seed_commercial(db) -> Dict[str, int]:
    """Idempotent seed of plan templates + snapshots."""
    tpl_inserted = 0
    snap_inserted = 0
    now = _iso()
    for t in PLAN_TEMPLATES_SEED:
        res = await db.plan_templates.update_one(
            {"id": t["id"]},
            {"$setOnInsert": {**t, "created_at": now, "updated_at": now, "created_by": "system_seed"}},
            upsert=True,
        )
        if res.upserted_id:
            tpl_inserted += 1
    for s in SNAPSHOTS_SEED:
        res = await db.tenant_snapshots.update_one(
            {"id": s["id"]},
            {"$setOnInsert": {**s, "created_at": now, "created_by": "system_seed"}},
            upsert=True,
        )
        if res.upserted_id:
            snap_inserted += 1
    return {"plan_templates_inserted": tpl_inserted, "snapshots_inserted": snap_inserted}
