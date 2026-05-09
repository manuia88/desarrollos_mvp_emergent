"""W4.5 Y.2A — PricingAgent: detecta unidades con pricing sub-óptimo y propone ajustes.

3 capas resilience:
  Layer 1 (LLM primary):       Claude Sonnet via emergentintegrations + 4 tools
  Layer 2 (cached similar):    pricing_recommendations recientes (<7d) de proyectos similares
  Layer 3 (static heuristic):  price_per_m2 > comparable_median × 1.15 → sugiere median

Concurrency caps: 1 run/min/org · 5 runs/hora T1 · 20 runs/hora T3+
Phase Y guards:   master switch + pricing_agent tier + simulation_mode
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

from sub_agents.resilience import CircuitBreaker, CircuitOpenError, FallbackChain, LocalCache

log = logging.getLogger("dmx.sub_agents.pricing")

# ─── Constants ────────────────────────────────────────────────────────────────
PRICING_MODEL = os.environ.get("DIRECTOR_MODEL", "claude-sonnet-4-5-20250929")
PRICE_IN_PER_TOK  = 3.0 / 1_000_000
PRICE_OUT_PER_TOK = 15.0 / 1_000_000

# Concurrency tracking (in-process)
_org_minute_buckets: Dict[str, List[float]] = {}
_org_hour_buckets:   Dict[str, List[float]] = {}

HOUR_CAPS = {"T1": 5, "T2": 10, "T3": 20, "T4": 100}

# Shared caches / circuit breakers (one per process)
_llm_cache: LocalCache = LocalCache(ttl_seconds=3600)
_circuit_breakers: Dict[str, CircuitBreaker] = {}

_TOOL_CALL_RE = re.compile(r"<tool_call>(.*?)</tool_call>", re.DOTALL)


def _get_cb(org_id: str) -> CircuitBreaker:
    key = f"pricing_{org_id}"
    if key not in _circuit_breakers:
        _circuit_breakers[key] = CircuitBreaker(agent_type=key, failure_threshold=5, recovery_seconds=60)
    return _circuit_breakers[key]


# ─── Concurrency helpers ───────────────────────────────────────────────────────
def _check_concurrency(org_id: str, tier: str) -> bool:
    """Returns True if under cap, False if exceeded."""
    now = time.monotonic()
    # 1 run/min
    mins = _org_minute_buckets.setdefault(org_id, [])
    _org_minute_buckets[org_id] = [t for t in mins if now - t < 60]
    if len(_org_minute_buckets[org_id]) >= 1:
        return False
    # N runs/hour per tier
    hour_cap = HOUR_CAPS.get(tier, 5)
    hrs = _org_hour_buckets.setdefault(org_id, [])
    _org_hour_buckets[org_id] = [t for t in hrs if now - t < 3600]
    if len(_org_hour_buckets[org_id]) >= hour_cap:
        return False
    return True


def _record_run_start(org_id: str) -> None:
    now = time.monotonic()
    _org_minute_buckets.setdefault(org_id, []).append(now)
    _org_hour_buckets.setdefault(org_id, []).append(now)


# ─── Internal tool implementations ────────────────────────────────────────────
async def _exec_pricing_tool(db, tool_name: str, params: Dict[str, Any], org_id: str) -> Dict[str, Any]:
    try:
        if tool_name == "get_comparables":
            return await _pricing_tool_get_comparables(db, params)
        elif tool_name == "get_ie_score":
            return await _pricing_tool_get_ie_score(db, params)
        elif tool_name == "get_unit_score":
            return await _pricing_tool_get_unit_score(db, params)
        elif tool_name == "get_behavioral_demand":
            return await _pricing_tool_get_behavioral_demand(db, params, org_id)
        else:
            return {"error": f"Tool '{tool_name}' no reconocida"}
    except Exception as exc:
        return {"error": str(exc)}


async def _pricing_tool_get_comparables(db, params: Dict[str, Any]) -> Dict[str, Any]:
    from data_developments import DEVELOPMENTS_BY_ID, ALL_UNITS
    project_id = params.get("project_id", "")
    dev = DEVELOPMENTS_BY_ID.get(project_id) or await db.developments.find_one({"id": project_id}, {"_id": 0})
    if not dev:
        return {"error": f"Proyecto '{project_id}' no encontrado"}

    colonia_id = dev.get("colonia_id", "")
    # Peer projects in same colonia
    peers = [d for d in DEVELOPMENTS_BY_ID.values() if d["id"] != project_id and d.get("colonia_id") == colonia_id]
    comparable_units = []
    for peer in peers[:5]:
        for u in peer.get("units", []):
            m2 = u.get("m2_total") or u.get("m2_privative") or 1
            price = u.get("price", 0)
            if m2 > 0 and price > 0:
                comparable_units.append({
                    "comp_id": u["id"],
                    "development_id": peer["id"],
                    "development_name": peer["name"],
                    "price_m2": round(price / m2, 2),
                    "bedrooms": u.get("bedrooms"),
                    "m2": m2,
                })
    if not comparable_units:
        return {"project_id": project_id, "comparables": [], "note": "Sin comparables en colonia"}
    prices = [c["price_m2"] for c in comparable_units]
    prices.sort()
    median = prices[len(prices) // 2]
    return {
        "project_id": project_id,
        "colonia_id": colonia_id,
        "comparable_median_price_m2": round(median, 2),
        "comparables_count": len(comparable_units),
        "comparables": comparable_units[:10],
    }


async def _pricing_tool_get_ie_score(db, params: Dict[str, Any]) -> Dict[str, Any]:
    entity_id = params.get("developer_id") or params.get("project_id", "")
    doc = await db.ie_scores.find_one({"entity_id": entity_id}, {"_id": 0})
    if not doc:
        return {"entity_id": entity_id, "ie_score": None, "note": "Sin score IE disponible"}
    return {"entity_id": entity_id, "ie_score": doc.get("score"), "category": doc.get("category")}


async def _pricing_tool_get_unit_score(db, params: Dict[str, Any]) -> Dict[str, Any]:
    unit_id = params.get("unit_id", "")
    from data_developments import ALL_UNITS
    unit = next((u for u in ALL_UNITS if u["id"] == unit_id), None)
    if not unit:
        unit = await db.units.find_one({"id": unit_id}, {"_id": 0})
    if not unit:
        return {"error": f"Unidad '{unit_id}' no encontrada"}
    m2 = unit.get("m2_total") or unit.get("m2_privative") or 1
    price = unit.get("price", 0)
    return {
        "unit_id": unit_id,
        "price_mxn": price,
        "m2": m2,
        "price_per_m2": round(price / m2, 2) if m2 > 0 else None,
        "bedrooms": unit.get("bedrooms"),
        "status": unit.get("status"),
    }


async def _pricing_tool_get_behavioral_demand(db, params: Dict[str, Any], org_id: str) -> Dict[str, Any]:
    project_id = params.get("project_id", "")
    try:
        from behavioral_tracking_engine import get_demand_signals
        signals = await get_demand_signals(db, project_id=project_id, org_id=org_id)
        return signals or {"project_id": project_id, "demand_score": None, "note": "Sin datos de demanda"}
    except Exception:
        pass
    # Fallback: count leads
    since = datetime.now(timezone.utc) - timedelta(days=30)
    count = await db.leads.count_documents({"development_id": project_id, "created_at": {"$gte": since}})
    return {"project_id": project_id, "leads_30d": count, "demand_score": min(100, count * 5)}


# ─── LLM tool-call helpers ─────────────────────────────────────────────────────
def _extract_tool_calls(text: str) -> List[Dict[str, Any]]:
    calls = []
    for m in _TOOL_CALL_RE.finditer(text):
        raw = m.group(1).strip()
        try:
            calls.append(json.loads(raw))
        except json.JSONDecodeError:
            log.warning(f"[pricing_agent] tool_call JSON inválido: {raw[:200]}")
    return calls


def _strip_tool_calls(text: str) -> str:
    return _TOOL_CALL_RE.sub("", text).strip()


def _estimate_tokens(text: str) -> int:
    return max(1, len(text or "") // 4)


# ─── Layer implementations ─────────────────────────────────────────────────────
async def _layer_llm(db, org_id: str, project_id: str, sim_mode: bool) -> Optional[Dict[str, Any]]:
    """Layer 1: Claude Sonnet agentic loop with 4 pricing tools."""
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise RuntimeError("EMERGENT_LLM_KEY no configurado")

    cb = _get_cb(org_id)
    if cb.is_open():
        raise CircuitOpenError(f"Circuit abierto para org {org_id}")

    from emergentintegrations.llm.chat import LlmChat, UserMessage as LlmUserMsg

    system_prompt = f"""Eres un agente especializado en optimización de pricing inmobiliario para DesarrollosMX (México).
Organización: {org_id}
Proyecto a analizar: {project_id}

TOOLS DISPONIBLES:
<tool_call>{{"tool": "get_comparables", "params": {{"project_id": "string", "radius_km": 2.0}}}}</tool_call>
<tool_call>{{"tool": "get_unit_score", "params": {{"unit_id": "string"}}}}</tool_call>
<tool_call>{{"tool": "get_ie_score", "params": {{"project_id": "string"}}}}</tool_call>
<tool_call>{{"tool": "get_behavioral_demand", "params": {{"project_id": "string"}}}}</tool_call>

REGLAS:
- Identifica unidades con price_per_m2 desviado >10% del comparable_median en radio 2km
- Para cada anomalía propón ajuste con rationale citando comparable_ids específicos
- Output DEBE ser JSON válido (array) con campos: unit_id, current_price_per_m2, suggested_price_per_m2, delta_pct, confidence_score (0-100), rationale (máx 200 chars), comparables_used (lista de comp_ids)
- confidence_score: 80-95 si hay ≥3 comparables, 50-79 si 1-2 comparables, <50 si heurística
- NO inventes datos. Si no hay comparables suficientes, marca confidence_score < 50 y data_quality="low"
- Responde SOLO el JSON array, sin texto adicional

IDIOMA: es-MX. Tono técnico-ejecutivo, sin anglicismos.
"""
    user_msg = (
        f"Analiza el pricing de todas las unidades disponibles del proyecto '{project_id}'. "
        f"Primero obtén comparables, luego evalúa cada unidad disponible. "
        f"Retorna JSON array con recomendaciones para unidades sub-optimizadas."
    )

    session_id = f"pa_{uuid.uuid4().hex[:12]}"
    chat = LlmChat(
        api_key=api_key,
        session_id=session_id,
        system_message=system_prompt,
    ).with_model("anthropic", PRICING_MODEL)

    tok_in = _estimate_tokens(user_msg)
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
            params = spec.get("params") or {}
            result = await _exec_pricing_tool(db, tool_name, params, org_id)
            result_str = json.dumps(result, ensure_ascii=False)
            results_parts.append(f"<tool_result tool=\"{tool_name}\">{result_str}</tool_result>")
            tok_in += _estimate_tokens(result_str)

        current_message = (
            "RESULTADOS DE TOOLS:\n" + "\n".join(results_parts) +
            "\n\nAhora retorna el JSON array de recomendaciones."
        )

    # Parse JSON array from response
    clean = _strip_tool_calls(raw_resp).strip()
    # Try to extract JSON array from response
    json_match = re.search(r"\[.*\]", clean, re.DOTALL)
    if not json_match:
        raise ValueError(f"LLM no retornó JSON array válido. Respuesta: {clean[:300]}")

    recommendations_raw = json.loads(json_match.group(0))
    cost = tok_in * PRICE_IN_PER_TOK + tok_out * PRICE_OUT_PER_TOK
    return {
        "recommendations": recommendations_raw,
        "tokens_in": tok_in,
        "tokens_out": tok_out,
        "cost_usd": round(cost, 8),
    }


async def _layer_cached_similar(db, org_id: str, project_id: str) -> Optional[Dict[str, Any]]:
    """Layer 2: busca recomendaciones recientes de proyectos similares."""
    from data_developments import DEVELOPMENTS_BY_ID

    dev = DEVELOPMENTS_BY_ID.get(project_id) or await db.developments.find_one({"id": project_id}, {"_id": 0})
    if not dev:
        return None

    colonia_id = dev.get("colonia_id")
    bedrooms_range = dev.get("bedrooms_range", [])
    _ = bedrooms_range  # reserved for future proximity filters

    since_7d = datetime.now(timezone.utc) - timedelta(days=7)

    # Find similar project IDs in same colonia
    peer_ids = [d["id"] for d in DEVELOPMENTS_BY_ID.values() if d["id"] != project_id and d.get("colonia_id") == colonia_id]

    if not peer_ids:
        return None

    cursor = db.pricing_recommendations.find(
        {
            "project_id": {"$in": peer_ids},
            "status": "pending",
            "generated_at": {"$gte": since_7d},
        },
        {"_id": 0}
    ).sort("confidence_score", -1).limit(10)

    docs = await cursor.to_list(length=10)
    if not docs:
        return None

    # Adapt for the current project context
    adapted = []
    for d in docs:
        adapted.append({
            "unit_id": d.get("unit_id"),
            "current_price_per_m2": d.get("current_price_per_m2"),
            "suggested_price_per_m2": d.get("suggested_price_per_m2"),
            "delta_pct": d.get("delta_pct"),
            "confidence_score": max(10, (d.get("confidence_score") or 50) - 20),  # reduce confidence for transfer
            "rationale": f"[Adaptado de proyecto similar {d.get('project_id')}] {d.get('rationale_text', '')}",
            "comparables_used": d.get("comparables_used", []),
        })

    return {"recommendations": adapted, "tokens_in": 0, "tokens_out": 0, "cost_usd": 0.0}


async def _layer_heuristic(db, org_id: str, project_id: str) -> Optional[Dict[str, Any]]:
    """Layer 3: static heuristic — si price_per_m2 > comparable_median * 1.15 → sugiere median."""
    from data_developments import DEVELOPMENTS_BY_ID

    dev = DEVELOPMENTS_BY_ID.get(project_id) or await db.developments.find_one({"id": project_id}, {"_id": 0})
    if not dev:
        return {"recommendations": [], "tokens_in": 0, "tokens_out": 0, "cost_usd": 0.0}

    # Get comparable median via tool
    comp_result = await _pricing_tool_get_comparables(db, {"project_id": project_id, "radius_km": 2.0})
    median = comp_result.get("comparable_median_price_m2")
    if not median:
        return {"recommendations": [], "tokens_in": 0, "tokens_out": 0, "cost_usd": 0.0}

    recommendations = []
    units = dev.get("units", [])
    for unit in units:
        if unit.get("status") not in ("disponible", "available", None):
            continue
        m2 = unit.get("m2_total") or unit.get("m2_privative") or 1
        price = unit.get("price", 0)
        if m2 <= 0 or price <= 0:
            continue
        current_pm2 = price / m2
        threshold = median * 1.15
        if current_pm2 > threshold:
            delta_pct = round(((median - current_pm2) / current_pm2) * 100, 1)
            recommendations.append({
                "unit_id": unit["id"],
                "current_price_per_m2": round(current_pm2, 2),
                "suggested_price_per_m2": round(median, 2),
                "delta_pct": delta_pct,
                "confidence_score": 30,
                "rationale": f"Precio/m2 ({round(current_pm2)}) supera 15% el mediano comparable ({round(median)}). Ajuste heurístico sin comparables específicos.",
                "comparables_used": comp_result.get("comparables", [])[:3],
                "data_quality": "low",
            })

    return {"recommendations": recommendations, "tokens_in": 0, "tokens_out": 0, "cost_usd": 0.0}


# ─── PricingAgent ──────────────────────────────────────────────────────────────
class PricingAgent:
    """Specialist sub-agent for pricing optimization.

    Usage:
        agent = PricingAgent(db, org_id)
        result = await agent.analyze_project(project_id)
    """

    def __init__(self, db, org_id: str):
        self.db = db
        self.org_id = org_id

    async def _validate_phase_y(self, sim_override: bool = False) -> Tuple[str, bool]:
        """Validates Phase Y settings. Returns (tier, simulation_mode).
        Raises 403-equivalent PricingAgentDisabledError if not allowed.
        """
        from routes_phase_y_controls import get_phase_y_settings
        settings = await get_phase_y_settings(self.db, self.org_id)

        if not settings.get("agentic_enabled", False):
            raise PricingAgentDisabledError("Phase Y master switch desactivado")

        tier = (settings.get("feature_tiers") or {}).get("pricing_agent", "off")
        if tier == "off":
            raise PricingAgentDisabledError("Pricing Agent requiere tier T1 o superior")

        sim_mode = sim_override or settings.get("simulation_mode", False)
        return tier, sim_mode

    async def analyze_project(
        self,
        project_id: str,
        simulation_mode: bool = False,
    ) -> Dict[str, Any]:
        """
        Main entry point. Executes 3-layer FallbackChain and persists results.
        Returns {run_id, recommendations, layer_used, latency_ms, cost_usd}.
        """
        db = self.db
        org_id = self.org_id
        run_id = f"pa_run_{uuid.uuid4().hex[:14]}"
        t_start = time.monotonic()

        # Phase Y validation
        tier, sim_mode = await self._validate_phase_y(simulation_mode)

        # Concurrency check
        if not _check_concurrency(org_id, tier):
            raise PricingAgentRateLimitError("Demasiadas ejecuciones simultáneas. Intenta en 60 segundos.")
        _record_run_start(org_id)

        # Build input hash
        input_hash = hashlib.sha256(f"{org_id}:{project_id}".encode()).hexdigest()[:16]

        # Simulation mode → layer 3 only
        if sim_mode:
            heuristic_result = await _layer_heuristic(db, org_id, project_id)
            layer_used = "heuristic"
            recs_raw = (heuristic_result or {}).get("recommendations", [])
            for r in recs_raw:
                r["data_quality"] = "simulated"
            final_result = heuristic_result or {"recommendations": [], "tokens_in": 0, "tokens_out": 0, "cost_usd": 0.0}
        else:
            # 3-layer FallbackChain
            async def _llm_layer(data: Any) -> Optional[Dict[str, Any]]:
                return await _layer_llm(db, org_id, project_id, sim_mode)

            async def _cache_layer(data: Any) -> Optional[Dict[str, Any]]:
                return await _layer_cached_similar(db, org_id, project_id)

            async def _heuristic_layer(data: Any) -> Optional[Dict[str, Any]]:
                return await _layer_heuristic(db, org_id, project_id)

            chain = FallbackChain(layers=[_llm_layer, _cache_layer, _heuristic_layer])
            chain_result = await chain.execute(input_data={"org_id": org_id, "project_id": project_id})
            final_result = chain_result.get("result") or {"recommendations": [], "tokens_in": 0, "tokens_out": 0, "cost_usd": 0.0}
            layer_used = chain_result.get("layer_used", "none")

        latency_ms = int((time.monotonic() - t_start) * 1000)
        recs_raw = final_result.get("recommendations", [])
        tok_in = final_result.get("tokens_in", 0)
        tok_out = final_result.get("tokens_out", 0)
        cost_usd = final_result.get("cost_usd", 0.0)

        # Determine data_quality per recommendation
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(days=30)

        # Persist recommendations
        persisted = []
        for r in recs_raw:
            if not r.get("unit_id"):
                continue
            rec_id = f"pricing_rec_{uuid.uuid4().hex[:14]}"
            confidence = int(r.get("confidence_score") or 30)
            dq = r.get("data_quality") or (
                "high" if confidence >= 75 else
                "medium" if confidence >= 50 else
                "low"
            )
            comparables_used = r.get("comparables_used") or []
            # normalize comparables_used to list of strings
            if comparables_used and isinstance(comparables_used[0], dict):
                comparables_used = [c.get("comp_id") or c.get("id", "") for c in comparables_used]

            doc = {
                "_id": rec_id,
                "org_id": org_id,
                "project_id": project_id,
                "unit_id": r.get("unit_id"),
                "current_price_per_m2": r.get("current_price_per_m2"),
                "suggested_price_per_m2": r.get("suggested_price_per_m2"),
                "delta_pct": r.get("delta_pct"),
                "rationale_text": (r.get("rationale") or "")[:400],
                "confidence_score": confidence,
                "data_quality": dq,
                "expected_velocity_lift_pct": r.get("expected_velocity_lift_pct"),
                "comparables_used": comparables_used,
                "generated_at": now,
                "applied_at": None,
                "applied_by_user_id": None,
                "status": "pending",
                "expires_at": expires_at,
                "run_id": run_id,
                "layer_used": layer_used,
            }
            try:
                await db.pricing_recommendations.insert_one(doc)
                doc_out = {k: v for k, v in doc.items() if k != "_id"}
                doc_out["id"] = rec_id
                # Serialize datetime objects for JSON
                for field in ("generated_at", "expires_at", "applied_at"):
                    if isinstance(doc_out.get(field), datetime):
                        doc_out[field] = doc_out[field].isoformat()
                persisted.append(doc_out)
            except Exception as exc:
                log.warning(f"[pricing_agent] insert rec failed: {exc}")

        # Persist run metadata
        try:
            await db.subagent_runs.insert_one({
                "_id": run_id,
                "agent_type": "pricing",
                "org_id": org_id,
                "project_id": project_id,
                "status": "success" if persisted or layer_used != "none" else "fallback",
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
            log.warning(f"[pricing_agent] insert run failed: {exc}")

        # Track AI cost if LLM was used
        if layer_used == "llm" and cost_usd > 0:
            try:
                from ai_budget import track_ai_call
                await track_ai_call(
                    db, org_id, PRICING_MODEL, tok_in + tok_out,
                    call_type="pricing_agent",
                    feature_key="pricing_agent",
                )
            except Exception as exc:
                log.warning(f"[pricing_agent] track_ai_call failed: {exc}")

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


# ─── Custom errors ─────────────────────────────────────────────────────────────
class PricingAgentDisabledError(Exception):
    """Phase Y master switch OFF o tier=off para pricing_agent."""


class PricingAgentRateLimitError(Exception):
    """Concurrency cap exceeded."""


# ─── Indexes ──────────────────────────────────────────────────────────────────
async def ensure_pricing_indexes(db) -> None:
    try:
        await db.pricing_recommendations.create_index(
            [("org_id", 1), ("project_id", 1), ("status", 1)],
            name="idx_pricing_rec_org_proj_status",
        )
        await db.pricing_recommendations.create_index(
            [("unit_id", 1), ("generated_at", -1)],
            name="idx_pricing_rec_unit_time",
        )
        await db.pricing_recommendations.create_index(
            "expires_at",
            expireAfterSeconds=0,
            name="idx_pricing_rec_ttl",
        )
        await db.subagent_runs.create_index(
            [("agent_type", 1), ("org_id", 1), ("created_at", -1)],
            name="idx_subagent_runs_type_org_time",
        )
        await db.subagent_runs.create_index(
            [("status", 1), ("created_at", -1)],
            name="idx_subagent_runs_status_time",
        )
        log.info("[pricing_agent] indexes OK")
    except Exception as exc:
        log.warning(f"[pricing_agent] ensure_indexes failed: {exc}")
