"""
DMX · PLANES + SNAPSHOTS estilo GoHighLevel (capa sobre W5.FF feature-gate)
═══════════════════════════════════════════════════════════════════════════════
Molde multi-tenant: superadmin (único) provisiona N tenants (devs/asesores) y les
asigna un PLAN. Aplicar un plan = SNAPSHOT: prende de un jalón todas las features
del plan para ese tenant. Construido SOBRE lo que ya existe:
  · feature_flags_engine.FEATURE_CATALOG / get_extended_catalog (catálogo + tiers)
  · feature_flags_engine.bulk_upsert_features / upsert_feature (grants → tenant_features)
  · feature_gate_engine (gate FAIL-OPEN que lee esos grants)

No duplica nada: define los PLANES (bundles nombrados) y la operación de aplicarlos.
Los planes se derivan del catálogo por tier (free<pro<enterprise) → al registrar una
feature nueva, cae sola en el plan correcto (self-maintaining). Las dependencias
(requires_features) se expanden al aplicar. Founder ruling: construir el molde de
una empresa de 1B usuarios; activar features por plan como snapshots.
"""
from __future__ import annotations

from typing import List, Dict, Any, Optional, Set
from datetime import datetime, timezone

import feature_flags_engine as ff

TENANT_PLANS = "dmx_tenant_plans"        # registro del plan actual por tenant

_TIER_ORDER = {"free": 0, "basic": 0, "pro": 1, "enterprise": 2}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ─── Catálogo de PLANES (bundles nombrados) ──────────────────────────────────
# Cada plan = un tier base (incluye todas las features <= ese tier) + extras opcionales.
PLAN_CATALOG: List[Dict[str, Any]] = [
    {"plan_id": "starter",    "name": "Starter",    "tier": "free",
     "description": "Base operativa: inventario, leads, panel. Sin IA premium.", "extra_keys": []},
    {"plan_id": "pro",        "name": "Pro",        "tier": "pro",
     "description": "Inteligencia IA: demanda, pricing AI, reportes, studio.", "extra_keys": []},
    {"plan_id": "enterprise", "name": "Enterprise", "tier": "enterprise",
     "description": "Todo el arsenal: site selection, competidores, API, analytics, partnerships.", "extra_keys": []},
]
_PLAN_BY_ID: Dict[str, Dict[str, Any]] = {p["plan_id"]: p for p in PLAN_CATALOG}


def get_plans() -> List[Dict[str, Any]]:
    """Catálogo de planes con sus features resueltas + precio mensual estimado."""
    out = []
    for p in PLAN_CATALOG:
        keys = plan_feature_keys(p["plan_id"])
        price = _plan_price(keys)
        out.append({**p, "feature_keys": keys, "feature_count": len(keys), "monthly_price_mxn": price})
    return out


def get_plan(plan_id: str) -> Optional[Dict[str, Any]]:
    return _PLAN_BY_ID.get(plan_id)


def _features_up_to_tier(tier: str) -> List[str]:
    """Features del catálogo cuyo default_plan_tier <= tier dado."""
    cap = _TIER_ORDER.get((tier or "free").lower(), 0)
    keys = []
    for f in ff.get_catalog():
        ft = _TIER_ORDER.get((f.get("default_plan_tier") or "free").lower(), 0)
        if ft <= cap:
            keys.append(f["key"])
    return keys


def _expand_dependencies(keys: List[str]) -> List[str]:
    """Agrega las requires_features (transitivo) de cada feature del plan."""
    by_key = {f["key"]: f for f in ff.get_catalog()}
    seen: Set[str] = set()
    stack = list(keys)
    while stack:
        k = stack.pop()
        if k in seen:
            continue
        seen.add(k)
        dep = (by_key.get(k) or {}).get("requires_features") or []
        for d in dep:
            if d not in seen:
                stack.append(d)
    return list(seen)


def plan_feature_keys(plan_id: str) -> List[str]:
    """Features que prende un plan = (todas <= su tier) + extras, con dependencias expandidas."""
    p = _PLAN_BY_ID.get(plan_id)
    if not p:
        return []
    keys = set(_features_up_to_tier(p["tier"])) | set(p.get("extra_keys") or [])
    return sorted(_expand_dependencies(list(keys)))


def _plan_price(keys: List[str]) -> int:
    by_key = {f["key"]: f for f in ff.get_catalog()}
    return int(sum((by_key.get(k) or {}).get("monthly_price_mxn", 0) or 0 for k in keys))


# ─── Aplicar PLAN = SNAPSHOT ─────────────────────────────────────────────────
async def apply_plan(db, tenant_id: str, plan_id: str, *,
                     actor_user_id: Optional[str] = None, replace: bool = True) -> Dict[str, Any]:
    """
    Aplica un plan a un tenant (snapshot): prende todas sus features.
    replace=True → además APAGA las features de plan previas que no estén en este
    plan (downgrade limpio); respeta grants manuales (source != 'plan:*').
    """
    p = _PLAN_BY_ID.get(plan_id)
    if not p:
        raise ValueError(f"plan desconocido: {plan_id}")
    keys = plan_feature_keys(plan_id)
    source = f"plan:{plan_id}"

    # 1) prender features del plan
    items = [{"feature_key": k, "enabled": True, "plan_tier": p["tier"]} for k in keys]
    await ff.bulk_upsert_features(db, tenant_id, items, actor_user_id=actor_user_id, source=source)

    disabled: List[str] = []
    if replace:
        # 2) apagar features de PLAN previo que ya no aplican (no tocar grants manuales)
        target = set(keys)
        async for d in db.tenant_features.find({"tenant_id": tenant_id, "enabled": True}, {"_id": 0}):
            fk = d.get("feature_key")
            src = d.get("source") or ""
            if fk and fk not in target and src.startswith("plan:"):
                await ff.upsert_feature(db, tenant_id, fk, enabled=False,
                                        actor_user_id=actor_user_id, source=source)
                disabled.append(fk)

    # 3) registrar plan actual del tenant
    now = _now_iso()
    await db[TENANT_PLANS].update_one(
        {"tenant_id": tenant_id},
        {"$set": {"tenant_id": tenant_id, "plan_id": plan_id, "tier": p["tier"],
                  "assigned_at": now, "assigned_by": actor_user_id},
         "$setOnInsert": {"created_at": now}},
        upsert=True,
    )
    ff.cache_invalidate(tenant_id)
    return {"tenant_id": tenant_id, "plan_id": plan_id, "tier": p["tier"],
            "enabled": keys, "disabled": disabled, "feature_count": len(keys)}


async def get_tenant_plan(db, tenant_id: str) -> Dict[str, Any]:
    """Plan actual del tenant + features activas (default starter si nunca se asignó)."""
    rec = await db[TENANT_PLANS].find_one({"tenant_id": tenant_id}, {"_id": 0})
    plan_id = (rec or {}).get("plan_id", "starter")
    flags = await ff.get_tenant_flags(db, tenant_id)
    active = [k for k, d in flags.items() if ff._is_active(d)]
    return {"tenant_id": tenant_id, "plan_id": plan_id,
            "tier": (rec or {}).get("tier", "free"),
            "assigned_at": (rec or {}).get("assigned_at"),
            "active_features": active, "active_count": len(active)}
