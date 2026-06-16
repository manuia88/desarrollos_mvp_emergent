"""W4.5 Y.2C — LeadAgent: analiza el funnel de leads y propone optimizaciones.

3 capas resilience (reusa sub_agents/resilience.py de Y.2A):
  Layer 1 (LLM primary):       Claude Sonnet + 5 tools
  Layer 2 (cached similar):    lead_recommendations recientes <7d de orgs similares
  Layer 3 (static heuristic):  stale leads >14d · asesores con conversion < org_avg*0.5

Concurrency caps: 1 run/min/org · 5 runs/hora T1 · 20 runs/hora T3+
Phase Y guards:   master switch + lead_agent tier ≥ T1 + simulation_mode
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

log = logging.getLogger("dmx.sub_agents.lead")

LEAD_MODEL         = os.environ.get("DIRECTOR_MODEL", "claude-sonnet-4-5-20250929")
PRICE_IN_PER_TOK   = 3.0 / 1_000_000
PRICE_OUT_PER_TOK  = 15.0 / 1_000_000

_org_minute_buckets_lead: Dict[str, List[float]] = {}
_org_hour_buckets_lead:   Dict[str, List[float]] = {}
HOUR_CAPS = {"T1": 5, "T2": 10, "T3": 20, "T4": 100}

_circuit_breakers_lead: Dict[str, CircuitBreaker] = {}
_TOOL_CALL_RE = re.compile(r"<tool_call>(.*?)</tool_call>", re.DOTALL)


def _get_cb(org_id: str) -> CircuitBreaker:
    key = f"lead_{org_id}"
    if key not in _circuit_breakers_lead:
        _circuit_breakers_lead[key] = CircuitBreaker(agent_type=key, failure_threshold=5, recovery_seconds=60)
    return _circuit_breakers_lead[key]


def _check_concurrency(org_id: str, tier: str) -> bool:
    now = time.monotonic()
    mins = _org_minute_buckets_lead.setdefault(org_id, [])
    _org_minute_buckets_lead[org_id] = [t for t in mins if now - t < 60]
    if len(_org_minute_buckets_lead[org_id]) >= 1:
        return False
    hour_cap = HOUR_CAPS.get(tier, 5)
    hrs = _org_hour_buckets_lead.setdefault(org_id, [])
    _org_hour_buckets_lead[org_id] = [t for t in hrs if now - t < 3600]
    if len(_org_hour_buckets_lead[org_id]) >= hour_cap:
        return False
    return True


def _record_run_start(org_id: str) -> None:
    now = time.monotonic()
    _org_minute_buckets_lead.setdefault(org_id, []).append(now)
    _org_hour_buckets_lead.setdefault(org_id, []).append(now)


def _estimate_tokens(text: str) -> int:
    return max(1, len(text or "") // 4)


def _extract_tool_calls(text: str) -> List[Dict[str, Any]]:
    calls = []
    for m in _TOOL_CALL_RE.finditer(text):
        raw = m.group(1).strip()
        try:
            calls.append(json.loads(raw))
        except json.JSONDecodeError:
            log.warning(f"[lead_agent] tool_call JSON inválido: {raw[:200]}")
    return calls


def _strip_tool_calls(text: str) -> str:
    return _TOOL_CALL_RE.sub("", text).strip()


# ─── Internal tools ──────────────────────────────────────────────────────────
async def _exec_lead_tool(db, tool_name: str, params: Dict[str, Any], org_id: str) -> Dict[str, Any]:
    try:
        if tool_name == "get_leads_by_status":
            return await _lead_tool_by_status(db, params, org_id)
        elif tool_name == "get_asesor_conversion_metrics":
            return await _lead_tool_asesor_metrics(db, params, org_id)
        elif tool_name == "get_funnel_dropoff":
            return await _lead_tool_funnel_dropoff(db, params, org_id)
        elif tool_name == "get_segment_response_rates":
            return await _lead_tool_segment_rates(db, params, org_id)
        elif tool_name == "get_lead_age_distribution":
            return await _lead_tool_age_dist(db, params, org_id)
        else:
            return {"error": f"Tool '{tool_name}' no reconocida"}
    except Exception as exc:
        return {"error": str(exc)}


async def _lead_tool_by_status(db, params: Dict[str, Any], org_id: str) -> Dict[str, Any]:
    period_days = int(params.get("period_days", 30))
    since = datetime.now(timezone.utc) - timedelta(days=period_days)

    pipeline = [
        {"$match": {"dev_org_id": org_id, "created_at": {"$gte": since}}},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
    ]
    results = await db.leads.aggregate(pipeline).to_list(length=20)
    by_status = {r["_id"]: r["count"] for r in results}

    # Stale active leads (>14d without activity, heat_score >= 60)
    stale_cutoff = datetime.now(timezone.utc) - timedelta(days=14)
    stale_count = await db.leads.count_documents({
        "dev_org_id": org_id,
        "status": {"$in": ["active", "new", "contacted"]},
        "last_activity_at": {"$lt": stale_cutoff},
        "heat_score": {"$gte": 60},
    })

    return {
        "org_id": org_id,
        "period_days": period_days,
        "by_status": by_status,
        "total": sum(by_status.values()),
        "stale_high_score_count": stale_count,
    }


async def _lead_tool_asesor_metrics(db, params: Dict[str, Any], org_id: str) -> Dict[str, Any]:
    period_days = int(params.get("period_days", 30))
    since = datetime.now(timezone.utc) - timedelta(days=period_days)

    pipeline = [
        {"$match": {"dev_org_id": org_id, "created_at": {"$gte": since}, "assigned_to": {"$exists": True, "$ne": None}}},
        {"$group": {
            "_id": "$assigned_to",
            "total": {"$sum": 1},
            "closed": {"$sum": {"$cond": [{"$eq": ["$status", "closed"]}, 1, 0]}},
            "lost":   {"$sum": {"$cond": [{"$eq": ["$status", "lost"]},   1, 0]}},
        }},
    ]
    results = await db.leads.aggregate(pipeline).to_list(length=50)

    asesores = []
    for r in results:
        total = r.get("total", 0)
        closed = r.get("closed", 0)
        conv_rate = round((closed / total * 100) if total > 0 else 0, 1)
        asesores.append({
            "asesor_id": r["_id"],
            "total_leads": total,
            "closed": closed,
            "lost": r.get("lost", 0),
            "conversion_pct": conv_rate,
        })

    if not asesores:
        return {"org_id": org_id, "asesores": [], "org_avg_conversion_pct": 0}

    org_avg = round(sum(a["conversion_pct"] for a in asesores) / len(asesores), 1)
    # Flag underperforming asesores
    for a in asesores:
        a["underperforming"] = a["conversion_pct"] < org_avg * 0.5

    return {
        "org_id": org_id,
        "asesores_count": len(asesores),
        "org_avg_conversion_pct": org_avg,
        "asesores": sorted(asesores, key=lambda x: x["conversion_pct"]),
    }


async def _lead_tool_funnel_dropoff(db, params: Dict[str, Any], org_id: str) -> Dict[str, Any]:
    period_days = int(params.get("period_days", 30))
    since = datetime.now(timezone.utc) - timedelta(days=period_days)

    # Approximate funnel: new → contacted → qualified → proposal → closed
    stages = ["new", "contacted", "qualified", "proposal", "closed"]
    counts: Dict[str, int] = {}
    for stage in stages:
        counts[stage] = await db.leads.count_documents({
            "dev_org_id": org_id,
            "status": stage,
            "created_at": {"$gte": since},
        })

    # Compute drop-off per stage transition
    dropoffs = []
    for i in range(len(stages) - 1):
        curr = counts.get(stages[i], 0)
        nxt  = counts.get(stages[i + 1], 0)
        drop_pct = round(((curr - nxt) / curr * 100) if curr > 0 else 0, 1)
        dropoffs.append({
            "from_stage": stages[i],
            "to_stage": stages[i + 1],
            "from_count": curr,
            "to_count": nxt,
            "drop_pct": drop_pct,
        })

    # Max dropoff stage
    max_drop = max(dropoffs, key=lambda x: x["drop_pct"]) if dropoffs else None
    return {
        "org_id": org_id,
        "funnel_counts": counts,
        "dropoffs": dropoffs,
        "max_dropoff_stage": max_drop,
    }


async def _lead_tool_segment_rates(db, params: Dict[str, Any], org_id: str) -> Dict[str, Any]:
    period_days = int(params.get("period_days", 30))
    since = datetime.now(timezone.utc) - timedelta(days=period_days)

    pipeline = [
        {"$match": {"dev_org_id": org_id, "created_at": {"$gte": since}}},
        {"$group": {
            "_id": "$source",
            "total": {"$sum": 1},
            "closed": {"$sum": {"$cond": [{"$eq": ["$status", "closed"]}, 1, 0]}},
        }},
    ]
    results = await db.leads.aggregate(pipeline).to_list(length=20)
    segments = [
        {
            "segment": r["_id"] or "unknown",
            "total": r["total"],
            "closed": r["closed"],
            "conversion_pct": round((r["closed"] / r["total"] * 100) if r["total"] > 0 else 0, 1),
        }
        for r in results
    ]

    if not segments:
        return {"org_id": org_id, "segments": [], "note": "Sin datos de segmentos en período"}

    avg_conv = round(sum(s["conversion_pct"] for s in segments) / len(segments), 1)
    for s in segments:
        s["below_avg"] = s["conversion_pct"] < avg_conv * 0.6

    return {
        "org_id": org_id,
        "segments": sorted(segments, key=lambda x: x["conversion_pct"]),
        "avg_conversion_pct": avg_conv,
    }


async def _lead_tool_age_dist(db, params: Dict[str, Any], org_id: str) -> Dict[str, Any]:
    now = datetime.now(timezone.utc)
    cutoffs = [
        ("0-7d",  now - timedelta(days=7), now),
        ("8-14d", now - timedelta(days=14), now - timedelta(days=7)),
        ("15-30d",now - timedelta(days=30), now - timedelta(days=14)),
        ("30d+",  now - timedelta(days=365),now - timedelta(days=30)),
    ]
    dist: Dict[str, int] = {}
    for label, start, end in cutoffs:
        dist[label] = await db.leads.count_documents({
            "dev_org_id": org_id,
            "status": {"$in": ["active", "new", "contacted"]},
            "last_activity_at": {"$gte": start, "$lt": end},
        })

    total_active = sum(dist.values())
    stale_pct = round((dist.get("30d+", 0) / total_active * 100) if total_active > 0 else 0, 1)
    return {
        "org_id": org_id,
        "age_distribution": dist,
        "total_active": total_active,
        "stale_30d_plus_pct": stale_pct,
    }


# ─── Layer 1: LLM ─────────────────────────────────────────────────────────────
async def _layer_llm(db, org_id: str, period_days: int) -> Optional[Dict[str, Any]]:
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise RuntimeError("EMERGENT_LLM_KEY no configurado")

    cb = _get_cb(org_id)
    if cb.is_open():
        raise CircuitOpenError(f"Circuit abierto lead para org {org_id}")

    from emergentintegrations.llm.chat import LlmChat, UserMessage as LlmUserMsg

    system_prompt = f"""Eres un agente especializado en optimización de funnel de leads inmobiliarios para DesarrollosMX (México).
Organización: {org_id}
Período de análisis: {period_days} días

TOOLS DISPONIBLES:
<tool_call>{{"tool": "get_leads_by_status", "params": {{"period_days": {period_days}}}}}</tool_call>
<tool_call>{{"tool": "get_asesor_conversion_metrics", "params": {{"period_days": {period_days}}}}}</tool_call>
<tool_call>{{"tool": "get_funnel_dropoff", "params": {{"period_days": {period_days}}}}}</tool_call>
<tool_call>{{"tool": "get_segment_response_rates", "params": {{"period_days": {period_days}}}}}</tool_call>
<tool_call>{{"tool": "get_lead_age_distribution", "params": {{"period_days": {period_days}}}}}</tool_call>

TAREA: Analiza el funnel de leads de los últimos {period_days} días. Identifica:
1. Leads stale >14d sin contacto con heat_score>=60 (issue: stale_lead, severity: high)
2. Asesores con conversion <50% del promedio org (issue: low_conversion_asesor)
3. Etapa del funnel con mayor drop-off (issue: drop_at_stage)
4. Segmentos demográficos/fuente con conversion diferencial >40% debajo del avg (issue: underperforming_segment)
5. Leads sin seguimiento programado con actividad reciente (issue: missing_followup)

Para CADA issue, propón acción concreta. Output JSON array con campos:
- target_id: ID del lead, asesor, etapa o segmento afectado
- target_type: "lead" | "asesor" | "funnel_stage" | "segment"
- issue_detected: uno de los 5 issues de arriba
- severity: "high" | "medium" | "low"
- suggested_action_text: acción concreta máx 200 chars, en es-MX
- expected_lift_pct: % mejora esperada (0-100)
- confidence_score: 0-100 (80-95 si datos abundantes, 50-79 parciales, <50 estimados)
- funnel_metrics_used: dict con métricas concretas del análisis

Si no hay issues, retorna []. Responde SOLO el JSON array. IDIOMA: es-MX.
"""

    user_msg = (
        f"Analiza el funnel de leads de la organización '{org_id}' en los últimos {period_days} días. "
        "Usa las tools para obtener datos reales. Identifica todos los issues y retorna el JSON array."
    )

    session_id = f"ld_{uuid.uuid4().hex[:12]}"
    chat = LlmChat(
        api_key=api_key,
        session_id=session_id,
        system_message=system_prompt,
    ).with_model("anthropic", LEAD_MODEL)

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
        for spec in tool_calls[:5]:
            tool_name = spec.get("tool", "")
            p = spec.get("params") or {}
            result = await _exec_lead_tool(db, tool_name, p, org_id)
            result_str = json.dumps(result, ensure_ascii=False)
            results_parts.append(f'<tool_result tool="{tool_name}">{result_str}</tool_result>')
            tok_in += _estimate_tokens(result_str)

        current_message = (
            "RESULTADOS DE TOOLS:\n" + "\n".join(results_parts) +
            "\n\nRetorna el JSON array de recomendaciones del funnel."
        )

    clean = _strip_tool_calls(raw_resp).strip()
    json_match = re.search(r"\[.*\]", clean, re.DOTALL)
    if not json_match:
        return {"recommendations": [], "tokens_in": tok_in, "tokens_out": tok_out,
                "cost_usd": round(tok_in * PRICE_IN_PER_TOK + tok_out * PRICE_OUT_PER_TOK, 8)}

    recommendations_raw = json.loads(json_match.group(0))
    cost = tok_in * PRICE_IN_PER_TOK + tok_out * PRICE_OUT_PER_TOK
    return {"recommendations": recommendations_raw, "tokens_in": tok_in, "tokens_out": tok_out,
            "cost_usd": round(cost, 8)}


# ─── Layer 2: cached similar ──────────────────────────────────────────────────
async def _layer_cached_similar(db, org_id: str) -> Optional[Dict[str, Any]]:
    """Adapta lead_recommendations recientes (<7d) de orgs con volumen similar."""
    since_7d = datetime.now(timezone.utc) - timedelta(days=7)

    # Count current org's lead volume
    total_leads = await db.leads.count_documents({"dev_org_id": org_id})
    # Band: low=0-50, mid=51-200, high=200+
    if total_leads <= 50:
        band = "low"
    elif total_leads <= 200:
        band = "mid"
    else:
        band = "high"

    # Find orgs with similar volume band (rough heuristic via count ranges)
    band_ranges = {"low": (0, 50), "mid": (51, 200), "high": (201, 99999)}
    lo, hi = band_ranges[band]

    # Get recent lead_recommendations from other orgs in same band
    cursor = db.lead_recommendations.find(
        {
            "org_id": {"$ne": org_id},
            "status": "pending",
            "generated_at": {"$gte": since_7d},
        },
        {"_id": 0},
    ).sort("confidence_score", -1).limit(8)
    docs = await cursor.to_list(length=8)

    if not docs:
        return None

    adapted = []
    for d in docs:
        adapted.append({
            "target_id": d.get("target_id"),
            "target_type": d.get("target_type", "funnel_stage"),
            "issue_detected": d.get("issue_detected", "stale_lead"),
            "severity": d.get("severity", "medium"),
            "suggested_action_text": (
                f"[Patrón de org similar · banda {band}] "
                f"{(d.get('suggested_action_text') or '')[:140]}"
            )[:200],
            "expected_lift_pct": d.get("expected_lift_pct", 5),
            "confidence_score": max(10, (d.get("confidence_score") or 40) - 25),
            "funnel_metrics_used": {"source": "cached_similar_org", "volume_band": band},
            "data_quality": "low",
        })

    return {"recommendations": adapted, "tokens_in": 0, "tokens_out": 0, "cost_usd": 0.0}


# ─── Layer 3: static heuristic ────────────────────────────────────────────────
async def _layer_heuristic(db, org_id: str, period_days: int) -> Optional[Dict[str, Any]]:
    """Heurística: stale leads >14d + asesores con conversion < org_avg*0.5."""
    stale_cutoff  = datetime.now(timezone.utc) - timedelta(days=14)
    period_start  = datetime.now(timezone.utc) - timedelta(days=period_days)
    recommendations: List[Dict[str, Any]] = []

    # 1. Stale high-score leads
    stale_leads = await db.leads.find(
        {
            "dev_org_id": org_id,
            "status": {"$in": ["active", "new", "contacted"]},
            "last_activity_at": {"$lt": stale_cutoff},
            "heat_score": {"$gte": 60},
        },
        {"_id": 0, "id": 1, "heat_score": 1, "last_activity_at": 1, "assigned_to": 1},
    ).limit(20).to_list(length=20)

    for lead in stale_leads:
        last = lead.get("last_activity_at")
        days_stale = (datetime.now(timezone.utc) - last).days if last else 99
        recommendations.append({
            "target_id": lead.get("id") or "unknown",
            "target_type": "lead",
            "issue_detected": "stale_lead",
            "severity": "high" if days_stale > 21 else "medium",
            "suggested_action_text": (
                f"Lead con score {lead.get('heat_score', 0)} sin actividad hace {days_stale}d. "
                "Reasignar a asesor disponible o enviar seguimiento automatizado urgente."
            )[:200],
            "expected_lift_pct": 25,
            "confidence_score": 35,
            "funnel_metrics_used": {"days_stale": days_stale, "heat_score": lead.get("heat_score")},
            "data_quality": "low",
        })

    # 2. Low-conversion asesores
    pipeline = [
        {"$match": {"dev_org_id": org_id, "created_at": {"$gte": period_start}, "assigned_to": {"$exists": True, "$ne": None}}},
        {"$group": {
            "_id": "$assigned_to",
            "total": {"$sum": 1},
            "closed": {"$sum": {"$cond": [{"$eq": ["$status", "closed"]}, 1, 0]}},
        }},
    ]
    results = await db.leads.aggregate(pipeline).to_list(length=50)
    asesores = [
        {"asesor_id": r["_id"], "total": r["total"], "closed": r["closed"],
         "rate": round((r["closed"] / r["total"] * 100) if r["total"] > 0 else 0, 1)}
        for r in results if r.get("total", 0) >= 3
    ]

    if asesores:
        org_avg = sum(a["rate"] for a in asesores) / len(asesores)
        for a in asesores:
            if a["rate"] < org_avg * 0.5:
                recommendations.append({
                    "target_id": a["asesor_id"],
                    "target_type": "asesor",
                    "issue_detected": "low_conversion_asesor",
                    "severity": "high" if a["rate"] < org_avg * 0.25 else "medium",
                    "suggested_action_text": (
                        f"Asesor con {a['rate']}% conversión vs promedio org {round(org_avg, 1)}%. "
                        "Revisar calidad de seguimiento y ofrecer capacitación o reasignar leads."
                    )[:200],
                    "expected_lift_pct": 15,
                    "confidence_score": 40,
                    "funnel_metrics_used": {
                        "asesor_conversion_pct": a["rate"],
                        "org_avg_conversion_pct": round(org_avg, 1),
                        "total_leads": a["total"],
                    },
                    "data_quality": "low",
                })

    return {"recommendations": recommendations[:20], "tokens_in": 0, "tokens_out": 0, "cost_usd": 0.0}


# ─── LeadAgent ────────────────────────────────────────────────────────────────
class LeadAgent:
    """Specialist sub-agent for lead funnel optimization.

    Usage:
        agent = LeadAgent(db, org_id)
        result = await agent.analyze_funnel(period_days=30)
    """

    def __init__(self, db, org_id: str):
        self.db = db
        self.org_id = org_id

    async def _validate_phase_y(self, sim_override: bool = False) -> Tuple[str, bool]:
        from routes.phase_y_controls import get_phase_y_settings
        settings = await get_phase_y_settings(self.db, self.org_id)
        if not settings.get("agentic_enabled", False):
            raise LeadAgentDisabledError("Phase Y master switch desactivado")
        tier = (settings.get("feature_tiers") or {}).get("lead_agent", "off")
        if tier == "off":
            raise LeadAgentDisabledError("Lead Agent requiere tier T1 o superior")
        sim_mode = sim_override or settings.get("simulation_mode", False)
        return tier, sim_mode

    async def analyze_funnel(self, period_days: int = 30, simulation_mode: bool = False) -> Dict[str, Any]:
        db = self.db
        org_id = self.org_id
        run_id = f"la_run_{uuid.uuid4().hex[:14]}"
        t_start = time.monotonic()

        tier, sim_mode = await self._validate_phase_y(simulation_mode)

        if not _check_concurrency(org_id, tier):
            raise LeadAgentRateLimitError("Demasiadas ejecuciones simultáneas. Intenta en 60 segundos.")
        _record_run_start(org_id)

        input_hash = hashlib.sha256(f"lead:{org_id}:{period_days}".encode()).hexdigest()[:16]

        if sim_mode:
            heuristic_result = await _layer_heuristic(db, org_id, period_days)
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
                return await _layer_llm(db, org_id, period_days)

            async def _cache_layer(data: Any) -> Optional[Dict[str, Any]]:
                return await _layer_cached_similar(db, org_id)

            async def _heuristic_layer(data: Any) -> Optional[Dict[str, Any]]:
                return await _layer_heuristic(db, org_id, period_days)

            chain = FallbackChain(layers=[_llm_layer, _cache_layer, _heuristic_layer])
            chain_result = await chain.execute(input_data={"org_id": org_id, "period_days": period_days})
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
            rec_id = f"lead_rec_{uuid.uuid4().hex[:14]}"
            confidence = int(r.get("confidence_score") or 30)
            dq = r.get("data_quality") or (
                "high" if confidence >= 75 else "medium" if confidence >= 50 else "low"
            )
            fm = r.get("funnel_metrics_used") or {}
            if not isinstance(fm, dict):
                fm = {}

            doc = {
                "_id": rec_id,
                "org_id": org_id,
                "target_type": r.get("target_type", "lead"),
                "target_id": str(r.get("target_id")),
                "issue_detected": r.get("issue_detected", "stale_lead"),
                "severity": r.get("severity", "medium"),
                "suggested_action_text": (r.get("suggested_action_text") or "")[:400],
                "expected_lift_pct": r.get("expected_lift_pct"),
                "confidence_score": confidence,
                "data_quality": dq,
                "funnel_metrics_used": fm,
                "generated_at": now,
                "applied_at": None,
                "status": "pending",
                "expires_at": expires_at,
                "run_id": run_id,
                "layer_used": layer_used,
                "period_days": period_days,
            }
            try:
                await db.lead_recommendations.insert_one(doc)
                doc_out = {k: v for k, v in doc.items() if k != "_id"}
                doc_out["id"] = rec_id
                for field in ("generated_at", "expires_at", "applied_at"):
                    if isinstance(doc_out.get(field), datetime):
                        doc_out[field] = doc_out[field].isoformat()
                persisted.append(doc_out)
            except Exception as exc:
                log.warning(f"[lead_agent] insert rec failed: {exc}")

        try:
            await db.subagent_runs.insert_one({
                "_id": run_id,
                "agent_type": "lead",
                "org_id": org_id,
                "project_id": None,
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
            log.warning(f"[lead_agent] insert run failed: {exc}")

        if layer_used == "llm" and cost_usd > 0:
            try:
                from ai_budget import track_ai_call
                await track_ai_call(
                    db, org_id, LEAD_MODEL, tok_in + tok_out,
                    call_type="lead_agent",
                    feature_key="lead_agent",
                )
            except Exception as exc:
                log.warning(f"[lead_agent] track_ai_call failed: {exc}")

        return {
            "run_id": run_id,
            "org_id": org_id,
            "period_days": period_days,
            "recommendations": persisted,
            "recommendations_count": len(persisted),
            "layer_used": layer_used,
            "latency_ms": latency_ms,
            "cost_usd": cost_usd,
            "simulation_mode": sim_mode,
        }


class LeadAgentDisabledError(Exception):
    pass


class LeadAgentRateLimitError(Exception):
    pass


async def ensure_lead_indexes(db) -> None:
    try:
        await db.lead_recommendations.create_index(
            [("org_id", 1), ("target_type", 1), ("status", 1)],
            name="idx_lead_rec_org_type_status",
        )
        await db.lead_recommendations.create_index(
            [("target_id", 1), ("generated_at", -1)],
            name="idx_lead_rec_target_time",
        )
        await db.lead_recommendations.create_index(
            "expires_at",
            expireAfterSeconds=0,
            name="idx_lead_rec_ttl",
        )
        log.info("[lead_agent] indexes OK")
    except Exception as exc:
        log.warning(f"[lead_agent] ensure_indexes failed: {exc}")
