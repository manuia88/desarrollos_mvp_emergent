"""W4.5 Y.2B — MarketingAgent: detecta performance digital sub-óptima y propone optimizaciones.

3 capas resilience (reusa sub_agents/resilience.py de Y.2A):
  Layer 1 (LLM primary):       Claude Sonnet + 4 tools (get_behavioral_aggregates, get_unit_assets,
                                get_comparable_marketing_perf, get_zone_avg_metrics)
  Layer 2 (cached similar):    adapta pricing_recommendations recientes (<7d) de proyectos similares
  Layer 3 (static heuristic):  page_views < median*0.5 → low_views · assets<5 → missing_assets

Concurrency caps: 1 run/min/org · 5 runs/hora T1 · 20 runs/hora T3+
Phase Y guards:   master switch + marketing_agent tier ≥ T1 + simulation_mode
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import time
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple

from sub_agents.resilience import CircuitBreaker, CircuitOpenError, FallbackChain

log = logging.getLogger("dmx.sub_agents.marketing")

MARKETING_MODEL     = os.environ.get("DIRECTOR_MODEL", "claude-sonnet-4-5-20250929")
PRICE_IN_PER_TOK    = 3.0 / 1_000_000
PRICE_OUT_PER_TOK   = 15.0 / 1_000_000

# Concurrency tracking — separate namespaces from pricing (mkt suffix)
_org_minute_buckets_mkt: Dict[str, List[float]] = {}
_org_hour_buckets_mkt:   Dict[str, List[float]] = {}

HOUR_CAPS = {"T1": 5, "T2": 10, "T3": 20, "T4": 100}

_circuit_breakers_mkt: Dict[str, CircuitBreaker] = {}
_TOOL_CALL_RE = re.compile(r"<tool_call>(.*?)</tool_call>", re.DOTALL)


# ─── Circuit breaker helpers ──────────────────────────────────────────────────
def _get_cb(org_id: str) -> CircuitBreaker:
    key = f"marketing_{org_id}"
    if key not in _circuit_breakers_mkt:
        _circuit_breakers_mkt[key] = CircuitBreaker(agent_type=key, failure_threshold=5, recovery_seconds=60)
    return _circuit_breakers_mkt[key]


# ─── Concurrency helpers ───────────────────────────────────────────────────────
def _check_concurrency(org_id: str, tier: str) -> bool:
    now = time.monotonic()
    mins = _org_minute_buckets_mkt.setdefault(org_id, [])
    _org_minute_buckets_mkt[org_id] = [t for t in mins if now - t < 60]
    if len(_org_minute_buckets_mkt[org_id]) >= 1:
        return False
    hour_cap = HOUR_CAPS.get(tier, 5)
    hrs = _org_hour_buckets_mkt.setdefault(org_id, [])
    _org_hour_buckets_mkt[org_id] = [t for t in hrs if now - t < 3600]
    if len(_org_hour_buckets_mkt[org_id]) >= hour_cap:
        return False
    return True


def _record_run_start(org_id: str) -> None:
    now = time.monotonic()
    _org_minute_buckets_mkt.setdefault(org_id, []).append(now)
    _org_hour_buckets_mkt.setdefault(org_id, []).append(now)


# ─── Internal tool implementations ────────────────────────────────────────────
async def _exec_marketing_tool(db, tool_name: str, params: Dict[str, Any], org_id: str) -> Dict[str, Any]:
    try:
        if tool_name == "get_behavioral_aggregates":
            return await _mkt_tool_behavioral_aggregates(db, params, org_id)
        elif tool_name == "get_unit_assets":
            return await _mkt_tool_unit_assets(db, params)
        elif tool_name == "get_comparable_marketing_perf":
            return await _mkt_tool_comparable_perf(db, params)
        elif tool_name == "get_zone_avg_metrics":
            return await _mkt_tool_zone_avg_metrics(db, params, org_id)
        else:
            return {"error": f"Tool '{tool_name}' no reconocida"}
    except Exception as exc:
        return {"error": str(exc)}


async def _mkt_tool_behavioral_aggregates(db, params: Dict[str, Any], org_id: str) -> Dict[str, Any]:
    """Agrega métricas de comportamiento digital de los últimos 30 días."""
    project_id = params.get("project_id", "")
    since = datetime.now(timezone.utc) - timedelta(days=30)

    try:
        # Count page views
        views = await db.behavioral_events.count_documents({
            "development_id": project_id,
            "event_type": {"$in": ["page_view", "unit_view", "detail_view"]},
            "created_at": {"$gte": since},
        })
        # Count chip clicks → detail (CTR proxy)
        chip_clicks = await db.behavioral_events.count_documents({
            "development_id": project_id,
            "event_type": {"$in": ["chip_click", "card_click", "thumbnail_click"]},
            "created_at": {"$gte": since},
        })
        # Count leads generated (conversion)
        leads = await db.leads.count_documents({
            "development_id": project_id,
            "created_at": {"$gte": since},
        })
    except Exception:
        views = chip_clicks = leads = 0

    ctr_pct = round((chip_clicks / views * 100) if views > 0 else 0, 2)
    conv_pct = round((leads / views * 100) if views > 0 else 0, 2)

    # Per-unit breakdown (up to 20 units)
    units_breakdown: List[Dict[str, Any]] = []
    try:
        pipeline = [
            {"$match": {
                "development_id": project_id,
                "unit_id": {"$exists": True, "$ne": None},
                "created_at": {"$gte": since},
            }},
            {"$group": {"_id": "$unit_id", "views": {"$sum": 1}}},
            {"$sort": {"views": 1}},
            {"$limit": 20},
        ]
        results = await db.behavioral_events.aggregate(pipeline).to_list(length=20)
        units_breakdown = [{"unit_id": r["_id"], "views": r["views"]} for r in results]
    except Exception:
        pass

    median_views = 0
    if units_breakdown:
        sorted_views = sorted(u["views"] for u in units_breakdown)
        median_views = sorted_views[len(sorted_views) // 2]

    return {
        "project_id": project_id,
        "period_days": 30,
        "total_views": views,
        "chip_clicks": chip_clicks,
        "leads_generated": leads,
        "ctr_pct": ctr_pct,
        "conversion_pct": conv_pct,
        "unit_median_views": median_views,
        "units_breakdown": units_breakdown[:10],
    }


async def _mkt_tool_unit_assets(db, params: Dict[str, Any]) -> Dict[str, Any]:
    """Retorna conteo de assets (fotos, video, tour360) por unidad/proyecto."""
    project_id = params.get("project_id", "")
    unit_id    = params.get("unit_id")

    from data_developments import DEVELOPMENTS_BY_ID, ALL_UNITS

    dev = DEVELOPMENTS_BY_ID.get(project_id)
    if not dev:
        dev = await db.developments.find_one({"id": project_id}, {"_id": 0})

    units_to_check = []
    if unit_id:
        unit = next((u for u in ALL_UNITS if u["id"] == unit_id), None)
        if unit:
            units_to_check = [unit]
    elif dev:
        units_to_check = dev.get("units", [])[:20]

    assets_summary = []
    for unit in units_to_check:
        photos = unit.get("photos") or unit.get("images") or []
        video  = unit.get("video_url") or unit.get("video")
        tour   = unit.get("tour_360_url") or unit.get("tour_360")
        assets_summary.append({
            "unit_id": unit.get("id"),
            "photos_count": len(photos) if isinstance(photos, list) else (1 if photos else 0),
            "has_video": bool(video),
            "has_tour_360": bool(tour),
        })

    # Count units with fewer than 5 photos
    missing_photo_units = [a for a in assets_summary if a["photos_count"] < 5]

    dev_photos = []
    if dev:
        dev_photos = dev.get("photos") or dev.get("images") or []

    return {
        "project_id": project_id,
        "project_photos_count": len(dev_photos) if isinstance(dev_photos, list) else 0,
        "units_checked": len(assets_summary),
        "units_with_missing_photos": len(missing_photo_units),
        "assets": assets_summary,
    }


async def _mkt_tool_comparable_perf(db, params: Dict[str, Any]) -> Dict[str, Any]:
    """Métricas de marketing de proyectos comparables en la misma zona."""
    project_id = params.get("project_id", "")
    since = datetime.now(timezone.utc) - timedelta(days=30)

    from data_developments import DEVELOPMENTS_BY_ID
    dev = DEVELOPMENTS_BY_ID.get(project_id)
    colonia_id = dev.get("colonia_id", "") if dev else ""

    peers = [d for d in DEVELOPMENTS_BY_ID.values() if d["id"] != project_id and d.get("colonia_id") == colonia_id]
    peer_ids = [p["id"] for p in peers[:5]]

    if not peer_ids:
        return {"project_id": project_id, "comparables": [], "note": "Sin comparables en colonia"}

    peer_metrics = []
    for pid in peer_ids:
        views = await db.behavioral_events.count_documents({
            "development_id": pid,
            "event_type": {"$in": ["page_view", "unit_view"]},
            "created_at": {"$gte": since},
        })
        leads = await db.leads.count_documents({"development_id": pid, "created_at": {"$gte": since}})
        peer_metrics.append({"project_id": pid, "views_30d": views, "leads_30d": leads})

    avg_views = round(sum(p["views_30d"] for p in peer_metrics) / len(peer_metrics)) if peer_metrics else 0
    avg_conv  = 0
    if peer_metrics:
        convs = [p["leads_30d"] / p["views_30d"] * 100 for p in peer_metrics if p["views_30d"] > 0]
        avg_conv = round(sum(convs) / len(convs), 2) if convs else 0

    return {
        "project_id": project_id,
        "colonia_id": colonia_id,
        "comparables_count": len(peer_metrics),
        "avg_views_30d": avg_views,
        "avg_conversion_pct": avg_conv,
        "comparables": peer_metrics,
    }


async def _mkt_tool_zone_avg_metrics(db, params: Dict[str, Any], org_id: str) -> Dict[str, Any]:
    """Promedio de métricas digitales por zona/colonia."""
    colonia_id = params.get("colonia_id", "")
    since = datetime.now(timezone.utc) - timedelta(days=30)

    from data_developments import DEVELOPMENTS_BY_ID
    zone_devs = [d for d in DEVELOPMENTS_BY_ID.values() if d.get("colonia_id") == colonia_id]

    if not zone_devs:
        return {"colonia_id": colonia_id, "avg_views": 0, "note": "Sin proyectos en zona"}

    acc = 0
    for dev in zone_devs[:10]:
        views = await db.behavioral_events.count_documents({
            "development_id": dev["id"],
            "created_at": {"$gte": since},
        })
        acc += views

    avg_views = round(acc / len(zone_devs[:10]))
    return {
        "colonia_id": colonia_id,
        "projects_in_zone": len(zone_devs),
        "avg_views_30d": avg_views,
    }


# ─── LLM helpers (shared pattern from pricing_agent) ─────────────────────────
def _extract_tool_calls(text: str) -> List[Dict[str, Any]]:
    calls = []
    for m in _TOOL_CALL_RE.finditer(text):
        raw = m.group(1).strip()
        try:
            calls.append(json.loads(raw))
        except json.JSONDecodeError:
            log.warning(f"[marketing_agent] tool_call JSON inválido: {raw[:200]}")
    return calls


def _strip_tool_calls(text: str) -> str:
    return _TOOL_CALL_RE.sub("", text).strip()


def _estimate_tokens(text: str) -> int:
    return max(1, len(text or "") // 4)


# ─── Layer 1: LLM ─────────────────────────────────────────────────────────────
async def _layer_llm(db, org_id: str, project_id: str) -> Optional[Dict[str, Any]]:
    """Layer 1: Claude Sonnet con 4 tools de marketing digital."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("EMERGENT_LLM_KEY no configurado")

    cb = _get_cb(org_id)
    if cb.is_open():
        raise CircuitOpenError(f"Circuit abierto marketing para org {org_id}")

    from llm_client import LlmChat, UserMessage as LlmUserMsg

    system_prompt = f"""Eres un agente especializado en optimización de marketing digital inmobiliario para DesarrollosMX (México).
Organización: {org_id}
Proyecto a analizar: {project_id}

TOOLS DISPONIBLES:
<tool_call>{{"tool": "get_behavioral_aggregates", "params": {{"project_id": "string"}}}}</tool_call>
<tool_call>{{"tool": "get_unit_assets", "params": {{"project_id": "string"}}}}</tool_call>
<tool_call>{{"tool": "get_comparable_marketing_perf", "params": {{"project_id": "string"}}}}</tool_call>
<tool_call>{{"tool": "get_zone_avg_metrics", "params": {{"colonia_id": "string"}}}}</tool_call>

TAREA: Analiza la performance digital del proyecto en los últimos 30 días. Identifica:
1. Unidades con page_views < 50% del promedio del proyecto (issue: low_views)
2. CTR chip→detalle < 2% (issue: low_ctr)
3. Conversión visita→lead < 5% (issue: low_conversion)
4. Assets faltantes: fotos < 5, sin video, sin tour 360 (issue: missing_assets)
5. Copy > 90 días sin actualizar (issue: stale_copy — verifica si el proyecto tiene más de 90 días activo)

Para CADA issue encontrado, propón una acción concreta. Output JSON array con campos:
- target_id: ID de la unidad o proyecto afectado
- target_type: "project" | "unit" | "channel"
- issue_detected: "low_views" | "low_ctr" | "low_conversion" | "missing_assets" | "stale_copy"
- severity: "high" (>50% debajo del promedio o CTR<1%) | "medium" (20-50% debajo) | "low" (<20% debajo)
- suggested_action_text: acción concreta máx 200 chars, en es-MX
- expected_lift_pct: estimado % de mejora esperado (0-100)
- confidence_score: 0-100 (80-95 si datos abundantes, 50-79 si parciales, <50 si estimados)
- behavioral_metrics_used: dict con métricas concretas usadas en el análisis

Si no hay problemas detectables, retorna array vacío [].
Responde SOLO el JSON array. IDIOMA: es-MX.
"""

    user_msg = (
        f"Analiza la performance digital del proyecto '{project_id}' de los últimos 30 días. "
        f"Usa las tools para obtener datos reales. Identifica todos los issues y retorna el JSON array."
    )

    session_id = f"mkt_{uuid.uuid4().hex[:12]}"
    chat = LlmChat(
        api_key=api_key,
        session_id=session_id,
        system_message=system_prompt,
    ).with_model("anthropic", MARKETING_MODEL)

    tok_in  = _estimate_tokens(user_msg)
    tok_out = 0
    current_message = user_msg
    raw_resp = ""

    for _round in range(3):
        try:
            raw_resp_obj = await cb.call(chat.send_message, LlmUserMsg(text=current_message))
        except CircuitOpenError:
            raise
        raw_resp = raw_resp_obj or ""
        tok_out += _estimate_tokens(raw_resp)

        tool_calls = _extract_tool_calls(raw_resp)
        if not tool_calls:
            break

        results_parts = []
        for spec in tool_calls[:4]:
            tool_name = spec.get("tool", "")
            p = spec.get("params") or {}
            result = await _exec_marketing_tool(db, tool_name, p, org_id)
            result_str = json.dumps(result, ensure_ascii=False)
            results_parts.append(f'<tool_result tool="{tool_name}">{result_str}</tool_result>')
            tok_in += _estimate_tokens(result_str)

        current_message = (
            "RESULTADOS DE TOOLS:\n" + "\n".join(results_parts) +
            "\n\nRetorna el JSON array de recomendaciones de marketing."
        )

    clean = _strip_tool_calls(raw_resp).strip()
    json_match = re.search(r"\[.*\]", clean, re.DOTALL)
    if not json_match:
        # LLM returned empty or no JSON → treat as no issues (not a layer failure)
        return {"recommendations": [], "tokens_in": tok_in, "tokens_out": tok_out,
                "cost_usd": round(tok_in * PRICE_IN_PER_TOK + tok_out * PRICE_OUT_PER_TOK, 8)}

    recommendations_raw = json.loads(json_match.group(0))
    cost = tok_in * PRICE_IN_PER_TOK + tok_out * PRICE_OUT_PER_TOK
    return {"recommendations": recommendations_raw, "tokens_in": tok_in, "tokens_out": tok_out,
            "cost_usd": round(cost, 8)}


# ─── Layer 2: cached similar ──────────────────────────────────────────────────
async def _layer_cached_similar(db, org_id: str, project_id: str) -> Optional[Dict[str, Any]]:
    """Adapta pricing_recommendations recientes (<7d) de proyectos similares como proxy marketing."""
    from data_developments import DEVELOPMENTS_BY_ID

    dev = DEVELOPMENTS_BY_ID.get(project_id) or await db.developments.find_one({"id": project_id}, {"_id": 0})
    if not dev:
        return None

    colonia_id = dev.get("colonia_id", "")
    peer_ids = [d["id"] for d in DEVELOPMENTS_BY_ID.values()
                if d["id"] != project_id and d.get("colonia_id") == colonia_id]
    if not peer_ids:
        return None

    since_7d = datetime.now(timezone.utc) - timedelta(days=7)
    cursor = db.pricing_recommendations.find(
        {"project_id": {"$in": peer_ids}, "status": "pending", "generated_at": {"$gte": since_7d}},
        {"_id": 0},
    ).sort("confidence_score", -1).limit(8)
    docs = await cursor.to_list(length=8)
    if not docs:
        return None

    # Adapt pricing recs → marketing recs
    adapted: List[Dict[str, Any]] = []
    for d in docs:
        adapted.append({
            "target_id": d.get("unit_id") or project_id,
            "target_type": "unit" if d.get("unit_id") else "project",
            "issue_detected": "low_views",
            "severity": "medium",
            "suggested_action_text": (
                f"[Proxy de proyecto similar {d.get('project_id')}] "
                f"Revisar visibilidad de unidades con pricing ajustado. "
                f"{(d.get('rationale_text') or '')[:100]}"
            )[:200],
            "expected_lift_pct": 10,
            "confidence_score": max(10, (d.get("confidence_score") or 40) - 25),
            "behavioral_metrics_used": {"source": "pricing_recommendations_proxy"},
            "data_quality": "low",
        })

    return {"recommendations": adapted, "tokens_in": 0, "tokens_out": 0, "cost_usd": 0.0}


# ─── Layer 3: static heuristic ────────────────────────────────────────────────
async def _layer_heuristic(db, org_id: str, project_id: str) -> Optional[Dict[str, Any]]:
    """Heurística estática basada en page_views vs mediana y conteo de assets."""
    from data_developments import DEVELOPMENTS_BY_ID

    dev = DEVELOPMENTS_BY_ID.get(project_id) or await db.developments.find_one({"id": project_id}, {"_id": 0})
    since = datetime.now(timezone.utc) - timedelta(days=30)
    recommendations: List[Dict[str, Any]] = []

    # Check total views (used for context, not directly in recs)
    _total_views = await db.behavioral_events.count_documents({"development_id": project_id, "created_at": {"$gte": since}})
    log.debug(f"[marketing_agent] heuristic total_views={_total_views} project={project_id}")

    # Per-unit views
    unit_views: Dict[str, int] = {}
    if dev:
        try:
            pipeline = [
                {"$match": {"development_id": project_id, "unit_id": {"$exists": True}, "created_at": {"$gte": since}}},
                {"$group": {"_id": "$unit_id", "cnt": {"$sum": 1}}},
            ]
            results = await db.behavioral_events.aggregate(pipeline).to_list(length=50)
            unit_views = {r["_id"]: r["cnt"] for r in results if r["_id"]}
        except Exception:
            pass

    # Compute median
    view_counts = list(unit_views.values())
    if view_counts:
        view_counts.sort()
        median_v = view_counts[len(view_counts) // 2]
    else:
        median_v = 0

    # low_views heuristic
    for uid, views in unit_views.items():
        if median_v > 0 and views < median_v * 0.5:
            recommendations.append({
                "target_id": uid,
                "target_type": "unit",
                "issue_detected": "low_views",
                "severity": "high" if views < median_v * 0.25 else "medium",
                "suggested_action_text": (
                    f"Unidad con {views} visitas vs mediana {median_v} en 30 días. "
                    "Verificar visibilidad en marketplace y agregar mínimo 3 fotos de calidad."
                )[:200],
                "expected_lift_pct": 20,
                "confidence_score": 30,
                "behavioral_metrics_used": {"views": views, "median": median_v},
                "data_quality": "low",
            })

    # missing_assets heuristic
    if dev:
        for unit in (dev.get("units") or [])[:30]:
            uid = unit.get("id", "")
            photos = unit.get("photos") or unit.get("images") or []
            n_photos = len(photos) if isinstance(photos, list) else 0
            if n_photos < 5:
                recommendations.append({
                    "target_id": uid,
                    "target_type": "unit",
                    "issue_detected": "missing_assets",
                    "severity": "high" if n_photos == 0 else "medium",
                    "suggested_action_text": (
                        f"Solo {n_photos} foto(s) disponibles. Subir mínimo 5 para cumplir estándar DMX."
                    ),
                    "expected_lift_pct": 15,
                    "confidence_score": 25,
                    "behavioral_metrics_used": {"photos_count": n_photos},
                    "data_quality": "low",
                })

    # Deduplicate by target_id + issue
    seen: set = set()
    deduped: List[Dict[str, Any]] = []
    for r in recommendations:
        key = f"{r['target_id']}:{r['issue_detected']}"
        if key not in seen:
            seen.add(key)
            deduped.append(r)

    return {"recommendations": deduped[:15], "tokens_in": 0, "tokens_out": 0, "cost_usd": 0.0}


# ─── MarketingAgent ───────────────────────────────────────────────────────────
class MarketingAgent:
    """Specialist sub-agent for marketing digital optimization.

    Usage:
        agent = MarketingAgent(db, org_id)
        result = await agent.analyze_project(project_id)
    """

    def __init__(self, db, org_id: str):
        self.db = db
        self.org_id = org_id

    async def _validate_phase_y(self, sim_override: bool = False) -> Tuple[str, bool]:
        from routes.phase_y_controls import get_phase_y_settings
        settings = await get_phase_y_settings(self.db, self.org_id)
        if not settings.get("agentic_enabled", False):
            raise MarketingAgentDisabledError("Phase Y master switch desactivado")
        tier = (settings.get("feature_tiers") or {}).get("marketing_agent", "off")
        if tier == "off":
            raise MarketingAgentDisabledError("Marketing Agent requiere tier T1 o superior")
        sim_mode = sim_override or settings.get("simulation_mode", False)
        return tier, sim_mode

    async def analyze_project(self, project_id: str, simulation_mode: bool = False) -> Dict[str, Any]:
        db = self.db
        org_id = self.org_id
        run_id = f"ma_run_{uuid.uuid4().hex[:14]}"
        t_start = time.monotonic()

        tier, sim_mode = await self._validate_phase_y(simulation_mode)

        if not _check_concurrency(org_id, tier):
            raise MarketingAgentRateLimitError("Demasiadas ejecuciones simultáneas. Intenta en 60 segundos.")
        _record_run_start(org_id)

        input_hash = hashlib.sha256(f"mkt:{org_id}:{project_id}".encode()).hexdigest()[:16]

        if sim_mode:
            heuristic_result = await _layer_heuristic(db, org_id, project_id)
            layer_used = "heuristic"
            recs_raw = (heuristic_result or {}).get("recommendations", [])
            for r in recs_raw:
                r["data_quality"] = "simulated"
            final_result = heuristic_result or {"recommendations": [], "tokens_in": 0, "tokens_out": 0, "cost_usd": 0.0}
        else:
            async def _llm_layer(data: Any) -> Optional[Dict[str, Any]]:
                # Gobernanza IA ANTES de gastar (regla 6): presupuesto + kill-switch → si no, cae a caché/heurística.
                from services.llm_guard import within_budget
                if not await within_budget(db, org_id):
                    return None
                return await _layer_llm(db, org_id, project_id)

            async def _cache_layer(data: Any) -> Optional[Dict[str, Any]]:
                return await _layer_cached_similar(db, org_id, project_id)

            async def _heuristic_layer(data: Any) -> Optional[Dict[str, Any]]:
                return await _layer_heuristic(db, org_id, project_id)

            chain = FallbackChain(layers=[_llm_layer, _cache_layer, _heuristic_layer])
            chain_result = await chain.execute(input_data={"org_id": org_id, "project_id": project_id})
            final_result = chain_result.get("result") or {"recommendations": [], "tokens_in": 0, "tokens_out": 0, "cost_usd": 0.0}
            layer_used = chain_result.get("layer_used", "none")

        latency_ms = int((time.monotonic() - t_start) * 1000)
        recs_raw   = final_result.get("recommendations", [])
        tok_in     = final_result.get("tokens_in", 0)
        tok_out    = final_result.get("tokens_out", 0)
        cost_usd   = final_result.get("cost_usd", 0.0)

        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(days=30)
        persisted: List[Dict[str, Any]] = []

        for r in recs_raw:
            if not r.get("target_id"):
                continue
            rec_id = f"mkt_rec_{uuid.uuid4().hex[:14]}"
            confidence = int(r.get("confidence_score") or 30)
            dq = r.get("data_quality") or (
                "high" if confidence >= 75 else "medium" if confidence >= 50 else "low"
            )
            bm = r.get("behavioral_metrics_used") or {}
            if not isinstance(bm, dict):
                bm = {}

            doc = {
                "_id": rec_id,
                "org_id": org_id,
                "project_id": project_id,
                "target_type": r.get("target_type", "unit"),
                "target_id": r.get("target_id"),
                "issue_detected": r.get("issue_detected", "low_views"),
                "severity": r.get("severity", "medium"),
                "suggested_action_text": (r.get("suggested_action_text") or "")[:400],
                "expected_lift_pct": r.get("expected_lift_pct"),
                "confidence_score": confidence,
                "data_quality": dq,
                "behavioral_metrics_used": bm,
                "generated_at": now,
                "applied_at": None,
                "status": "pending",
                "expires_at": expires_at,
                "run_id": run_id,
                "layer_used": layer_used,
            }
            try:
                await db.marketing_recommendations.insert_one(doc)
                doc_out = {k: v for k, v in doc.items() if k != "_id"}
                doc_out["id"] = rec_id
                for field in ("generated_at", "expires_at", "applied_at"):
                    if isinstance(doc_out.get(field), datetime):
                        doc_out[field] = doc_out[field].isoformat()
                persisted.append(doc_out)
            except Exception as exc:
                log.warning(f"[marketing_agent] insert rec failed: {exc}")

        # Persist run
        try:
            await db.subagent_runs.insert_one({
                "_id": run_id,
                "agent_type": "marketing",
                "org_id": org_id,
                "project_id": project_id,
                "status": "success" if (persisted or layer_used != "none") else "fallback",
                "input_hash": input_hash,
                "output_summary": f"{len(persisted)} recomendaciones · layer={layer_used}",
                "latency_ms": latency_ms,
                "fallback_layer": layer_used if layer_used != "llm" else None,
                "tokens_in": tok_in,
                "tokens_out": tok_out,
                "cost_usd": cost_usd,
                "simulation_mode": sim_mode,
                "created_at": now,
            })
        except Exception as exc:
            log.warning(f"[marketing_agent] insert run failed: {exc}")

        if layer_used == "llm" and cost_usd > 0:
            try:
                from ai_budget import track_ai_call
                await track_ai_call(
                    db, org_id, MARKETING_MODEL, tok_in + tok_out,
                    call_type="marketing_agent",
                    feature_key="marketing_agent",
                )
            except Exception as exc:
                log.warning(f"[marketing_agent] track_ai_call failed: {exc}")

        return {
            "run_id": run_id,
            "project_id": project_id,
            "recommendations": persisted,
            "recommendations_count": len(persisted),
            "layer_used": layer_used,
            "latency_ms": latency_ms,
            "cost_usd": cost_usd,
            "simulation_mode": sim_mode,
        }


# ─── Custom errors ────────────────────────────────────────────────────────────
class MarketingAgentDisabledError(Exception):
    pass


class MarketingAgentRateLimitError(Exception):
    pass


# ─── Indexes ──────────────────────────────────────────────────────────────────
async def ensure_marketing_indexes(db) -> None:
    try:
        await db.marketing_recommendations.create_index(
            [("org_id", 1), ("project_id", 1), ("status", 1)],
            name="idx_mkt_rec_org_proj_status",
        )
        await db.marketing_recommendations.create_index(
            [("target_id", 1), ("generated_at", -1)],
            name="idx_mkt_rec_target_time",
        )
        await db.marketing_recommendations.create_index(
            "expires_at",
            expireAfterSeconds=0,
            name="idx_mkt_rec_ttl",
        )
        log.info("[marketing_agent] indexes OK")
    except Exception as exc:
        log.warning(f"[marketing_agent] ensure_indexes failed: {exc}")
