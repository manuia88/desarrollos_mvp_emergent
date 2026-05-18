"""W5.12 Parte 3 — Helper compartido kg_query() para consumers.

Provee:
  - LRU cache (max 256 entries, TTL 5min) por (template, params, caller_module)
  - Alias mapping para templates "logicos" usados por consumers
    (proyectos_similares, zonas_similares_a, etc.) hacia templates P1/P2 registrados
  - Validacion estricta vs kg_template_registry (NO Cypher libre)
  - Timeout 5s · audit_immutable log con cache_hit + latency
  - Si KG_AVAILABLE=False O template no implementable → retorna shape consistente
    {"kg_unavailable": True, "fallback_required": True, "rows": [], "reason": ...}

Consumers (Atlax, Asistente, BuyerCoach, SmartNotif, SiteSel) deben manejar
`fallback_required=True` y degradar al comportamiento legacy.
"""
from __future__ import annotations

import asyncio
import logging
import time
from collections import OrderedDict
from typing import Any, Dict, Optional

log = logging.getLogger("dmx.kg.consumer")

# ─── Alias mapping ────────────────────────────────────────────────────────────
# Consumer-facing logical template name → (registry_template_name, param_mapper_fn)
# Si el target template no existe semanticamente en el registry, dejamos el
# alias como `None` y el helper degrada a fallback_required=True.

def _ident(p: Dict[str, Any]) -> Dict[str, Any]:
    return dict(p)


def _map_compradores_cross(p: Dict[str, Any]) -> Dict[str, Any]:
    out = {"project_id": p.get("project_id"), "last_days": int(p.get("last_days") or 90)}
    if p.get("zone_subscore_min") is not None:
        out["zone_subscore_min"] = p["zone_subscore_min"]
    return out


def _map_devs_dominantes(p: Dict[str, Any]) -> Dict[str, Any]:
    # devs_dominantes_zona reuse proyectos_dev_por_zona_tier (invertimos lectura cliente-side)
    out = {"dev_org_id": p.get("dev_org_id") or ""}
    if p.get("zone_tier"):
        out["zone_tier"] = p["zone_tier"]
    return out


def _map_proyectos_huerfanos(p: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "no_views_days": int(p.get("no_views_days") or 60),
        "no_leads_days": int(p.get("no_leads_days") or 60),
    }


def _map_proyectos_similares(p: Dict[str, Any]) -> Dict[str, Any]:
    out = {"project_id": p.get("project_id") or ""}
    if p.get("limit") is not None:
        out["limit"] = int(p["limit"])
    return out


def _map_zonas_similares(p: Dict[str, Any]) -> Dict[str, Any]:
    out = {"zone_slug": p.get("zone_slug") or ""}
    if p.get("limit") is not None:
        out["limit"] = int(p["limit"])
    return out


ALIAS_MAP: Dict[str, Optional[tuple]] = {
    # logical_name → (registry_template, params_mapper) | None = fallback only
    "proyectos_similares":         ("proyectos_similares", _map_proyectos_similares),
    "zonas_similares_a":           ("zonas_similares_a", _map_zonas_similares),
    "compradores_cross_project":   ("compradores_por_proyecto_zona", _map_compradores_cross),
    "devs_dominantes_zona":        ("proyectos_dev_por_zona_tier", _map_devs_dominantes),
    "proyectos_huerfanos_zona":    ("proyectos_huerfanos", _map_proyectos_huerfanos),
}


# ─── LRU cache ────────────────────────────────────────────────────────────────

_CACHE: "OrderedDict[tuple, Dict[str, Any]]" = OrderedDict()
_CACHE_MAX = 256
_CACHE_TTL_DEFAULT = 300  # 5 min


def _cache_key(template: str, params: Dict[str, Any]) -> tuple:
    return (template, tuple(sorted((str(k), str(v)) for k, v in (params or {}).items())))


def _cache_get(key: tuple, ttl: int) -> Optional[Dict[str, Any]]:
    entry = _CACHE.get(key)
    if not entry:
        return None
    if (time.time() - entry["ts"]) > ttl:
        _CACHE.pop(key, None)
        return None
    _CACHE.move_to_end(key)
    return entry["val"]


def _cache_set(key: tuple, val: Dict[str, Any]) -> None:
    _CACHE[key] = {"val": val, "ts": time.time()}
    _CACHE.move_to_end(key)
    while len(_CACHE) > _CACHE_MAX:
        _CACHE.popitem(last=False)


def cache_clear() -> None:
    _CACHE.clear()


# ─── Audit helper ────────────────────────────────────────────────────────────

async def _audit(db, *, caller_module: str, template: str, params: Dict[str, Any],
                 result_count: int, latency_ms: float, cache_hit: bool,
                 kg_unavailable: bool, error: Optional[str] = None) -> None:
    try:
        from audit_immutable_engine import log as audit_log
        await audit_log(
            db,
            actor={"user_id": f"kg_consumer:{caller_module}", "role": "system"},
            action="kg_consumer_query",
            entity_type="kg",
            entity_id=template,
            before=None,
            after={
                "template": template,
                "params": params,
                "caller_module": caller_module,
                "result_count": result_count,
                "latency_ms": round(latency_ms, 2),
                "cache_hit": cache_hit,
                "kg_unavailable": kg_unavailable,
                "error": error,
            },
        )
    except Exception as exc:
        log.warning(f"[kg_query] audit log failed: {exc}")


# ─── Main API ────────────────────────────────────────────────────────────────

async def kg_query(
    template_name: str,
    params: Dict[str, Any],
    *,
    caller_module: str,
    cache_ttl: int = _CACHE_TTL_DEFAULT,
    timeout_s: float = 5.0,
    db=None,
) -> Dict[str, Any]:
    """Ejecuta una query del KG con cache + audit + fallback graceful.

    Returns:
        {"rows": [...], "count": N, "cache_hit": bool, "latency_ms": float}
        ó
        {"kg_unavailable": True, "fallback_required": True, "rows": [],
         "reason": "...", "template": template_name}
    """
    started = time.perf_counter()
    params = params or {}

    # Resolve alias if needed
    actual_template = template_name
    mapped_params = params
    if template_name in ALIAS_MAP:
        alias = ALIAS_MAP[template_name]
        if alias is None:
            res = {
                "kg_unavailable": True,
                "fallback_required": True,
                "rows": [],
                "reason": "template_not_implemented",
                "template": template_name,
            }
            await _audit(db, caller_module=caller_module, template=template_name, params=params,
                         result_count=0, latency_ms=(time.perf_counter() - started) * 1000,
                         cache_hit=False, kg_unavailable=True, error="alias_not_implemented")
            return res
        actual_template, mapper = alias
        mapped_params = mapper(params) if mapper else params

    # Cache check
    ckey = _cache_key(actual_template, mapped_params)
    cached = _cache_get(ckey, cache_ttl)
    if cached is not None:
        latency = (time.perf_counter() - started) * 1000
        await _audit(db, caller_module=caller_module, template=template_name, params=params,
                     result_count=len(cached.get("rows") or []), latency_ms=latency,
                     cache_hit=True, kg_unavailable=False)
        return {**cached, "cache_hit": True, "latency_ms": round(latency, 2)}

    # KG availability check
    try:
        from knowledge_graph_engine import KG_AVAILABLE, KGDriver
    except Exception as exc:
        await _audit(db, caller_module=caller_module, template=template_name, params=params,
                     result_count=0, latency_ms=(time.perf_counter() - started) * 1000,
                     cache_hit=False, kg_unavailable=True, error=str(exc)[:200])
        return {"kg_unavailable": True, "fallback_required": True, "rows": [],
                "reason": "engine_import_failed", "template": template_name}

    if not KG_AVAILABLE:
        await _audit(db, caller_module=caller_module, template=template_name, params=params,
                     result_count=0, latency_ms=(time.perf_counter() - started) * 1000,
                     cache_hit=False, kg_unavailable=True, error="kg_unavailable")
        return {"kg_unavailable": True, "fallback_required": True, "rows": [],
                "reason": "kg_unavailable", "template": template_name}

    # Validate template in registry
    try:
        from kg_template_registry import TEMPLATES, validate_params, get_cypher
    except Exception as exc:
        return {"kg_unavailable": True, "fallback_required": True, "rows": [],
                "reason": f"registry_import_failed: {exc}", "template": template_name}

    if actual_template not in TEMPLATES:
        await _audit(db, caller_module=caller_module, template=template_name, params=params,
                     result_count=0, latency_ms=(time.perf_counter() - started) * 1000,
                     cache_hit=False, kg_unavailable=False, error="template_not_in_registry")
        return {"kg_unavailable": True, "fallback_required": True, "rows": [],
                "reason": "template_not_in_registry", "template": template_name}

    ok, errors, norm_params = validate_params(actual_template, mapped_params)
    if not ok:
        await _audit(db, caller_module=caller_module, template=template_name, params=params,
                     result_count=0, latency_ms=(time.perf_counter() - started) * 1000,
                     cache_hit=False, kg_unavailable=False, error=f"invalid_params: {errors}")
        return {"kg_unavailable": True, "fallback_required": True, "rows": [],
                "reason": f"invalid_params: {errors}", "template": template_name}

    cypher = get_cypher(actual_template)
    try:
        drv = await KGDriver.get()
        rows = await asyncio.wait_for(drv.run(cypher, norm_params, retries=1), timeout=timeout_s)
    except asyncio.TimeoutError:
        await _audit(db, caller_module=caller_module, template=template_name, params=params,
                     result_count=0, latency_ms=(time.perf_counter() - started) * 1000,
                     cache_hit=False, kg_unavailable=True, error="timeout")
        return {"kg_unavailable": True, "fallback_required": True, "rows": [],
                "reason": "timeout", "template": template_name}
    except Exception as exc:
        await _audit(db, caller_module=caller_module, template=template_name, params=params,
                     result_count=0, latency_ms=(time.perf_counter() - started) * 1000,
                     cache_hit=False, kg_unavailable=True, error=str(exc)[:200])
        return {"kg_unavailable": True, "fallback_required": True, "rows": [],
                "reason": f"runtime_error: {str(exc)[:120]}", "template": template_name}

    latency_ms = (time.perf_counter() - started) * 1000
    result = {
        "rows": rows or [],
        "count": len(rows or []),
        "cache_hit": False,
        "latency_ms": round(latency_ms, 2),
        "template": template_name,
        "actual_template": actual_template,
    }
    _cache_set(ckey, {"rows": rows or [], "count": len(rows or [])})
    await _audit(db, caller_module=caller_module, template=template_name, params=params,
                 result_count=len(rows or []), latency_ms=latency_ms,
                 cache_hit=False, kg_unavailable=False)
    return result
