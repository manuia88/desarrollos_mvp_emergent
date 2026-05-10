"""W4.4 — Phase Y.1A · Director Agent core orchestration engine.
W4.4B — Phase Y.1B · Memory Layer RAG integration.

LLM: claude-sonnet-4-6 vía emergentintegrations.LlmChat
Tool calling: structured prompt + <tool_call> tag parsing (2-pass agentic loop)
Session caps: T1=50k/10k · T2=100k/20k · T3=200k/40k · T4=unlimited
Simulation mode: full logic, zero Anthropic calls, response prefixed [SIM]
Memory: auto-inject en start_session (tier ≥ T2) + retrieve antes de cada chat + 5to tool
"""
from __future__ import annotations

import json
import logging
import os
import re
import time
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple

log = logging.getLogger("dmx.director_agent")

# ─── Constants ────────────────────────────────────────────────────────────────
DIRECTOR_MODEL = os.environ.get("DIRECTOR_MODEL", "claude-sonnet-4-5-20250929")

# Input/output token caps per tier
TIER_CAPS: Dict[str, Tuple[Optional[int], Optional[int]]] = {
    "off": (0, 0),
    "T1": (
        int(os.environ.get("DIRECTOR_MAX_TOKENS_IN_T1", 50000)),
        int(os.environ.get("DIRECTOR_MAX_TOKENS_OUT_T1", 10000)),
    ),
    "T2": (100_000, 20_000),
    "T3": (200_000, 40_000),
    "T4": (None, None),  # unlimited
}

# Approximate cost per token (Claude Sonnet 4.x pricing)
PRICE_IN_PER_TOK  = 3.0 / 1_000_000   # $3 / 1M input
PRICE_OUT_PER_TOK = 15.0 / 1_000_000  # $15 / 1M output

# Tool call regex
_TOOL_CALL_RE = re.compile(r"<tool_call>(.*?)</tool_call>", re.DOTALL)

# Tiers que activan memory injection
_MEMORY_TIERS = {"T2", "T3", "T4"}

# ─── Custom exceptions ────────────────────────────────────────────────────────
class PhaseYDisabledError(Exception):
    """Phase Y master switch OFF o tier=off para este org."""

class SessionEndedError(Exception):
    """La sesión ya fue cerrada (status=ended)."""

class TierCapExceededError(Exception):
    """La sesión superó el cap de tokens del tier."""

# ─── System prompt builder ─────────────────────────────────────────────────────
def _build_system_prompt(
    org_id: str,
    role: str,
    tier: str,
    sim_mode: bool,
    memory_context: Optional[str] = None,
) -> str:
    now_mx = datetime.now(timezone(timedelta(hours=-6))).strftime("%d %b %Y, %H:%M hora CDMX")
    sim_note = "\n\n⚠️  SIMULATION MODE: esta es una sesión de prueba. Tu lógica se ejecuta normalmente pero la sesión NO produce acciones reales." if sim_mode else ""

    tools_section = """
═══ TOOLS DISPONIBLES ═══
Cuando necesites datos del sistema, incluye EXACTAMENTE este formato en tu respuesta (una línea separada):

<tool_call>{"tool": "NOMBRE_TOOL", "params": {PARAMS_JSON}}</tool_call>

TOOLS Y PARAMS:

1. get_ie_score
   params: { "developer_id": str }
   devuelve: score IE actual (0-100), percentile en su categoría, ranking

2. get_unit_score
   params: { "unit_id": str }
   devuelve: score IE_UNIT, breakdown de 5 factores (ubicación, precio, demanda, riesgo, yield)

3. get_comparables
   params: { "unit_id": str, "radius_km": float (default 2.0) }
   devuelve: top 5 comparables con price/m2, distancia, delta% vs subject

4. get_org_kpis
   params: { "org_id": str, "period_days": int (default 30) }
   devuelve: leads_count, matches_count, conversion_rate, avg_response_time_hours

5. retrieve_memory
   params: { "query": str, "top_k": int (default 5), "source_types": list[str] | null }
   devuelve: lista de memorias relevantes (diagnósticos, scores, sesiones previas)
   source_types válidos: "diagnostic", "ie_score", "behavioral", "director_summary"

6. whatif_simulate
   params: { "project_id": str, "scenario_type": "price_change"|"promo"|"delay"|"mix", "inputs": dict }
   devuelve: outputs con forecast, confidence_low/high, comparables_used, recommendation_text
   inputs por tipo:
     • price_change: { "proposed_delta_pct": float, "horizon_months": 3|6|12 }
     • promo:        { "promo_type": "discount"|"gift"|"financing", "promo_value": float, "duration_weeks": int }
     • delay:        { "delay_months": int (1-12) }
     • mix:          { "scenarios": [{ "type": str, "params": dict }, ...] (max 5) }

7. delegate_pricing_optimization
   params: { "project_id": str }
   devuelve: lista de recomendaciones de ajuste de precios con confidence_score, delta_pct, rationale
   Úsalo cuando el usuario pregunta sobre precios sub-óptimos, "¿qué precios ajustar?", oportunidades de pricing

8. delegate_marketing_optimization
   params: { "project_id": str }
   devuelve: lista de recomendaciones de marketing digital con issue_detected, severity, suggested_action_text, expected_lift_pct
   Úsalo cuando el usuario pregunta "¿por qué no se ven mis unidades?", "¿qué mejoro en marketing?", baja conversión, falta de leads

9. delegate_lead_optimization
   params: { "period_days": int (default 30) }
   devuelve: lista de recomendaciones del funnel de leads con issue_detected, target_type, severity, suggested_action_text
   Úsalo cuando user pregunta "¿qué pasa con mis leads?", "¿qué asesor está performeando peor?", "¿dónde pierdo leads?", funnel, conversión

10. delegate_lead_routing
    params: { "lead_id": str (requerido) }
    devuelve: { routing_id, suggested_asesor_id, fit_score, fit_breakdown, rationale_text, routing_layer }
    Úsalo cuando user pregunta "¿quién debería atender este lead?", "asigna lead X al mejor asesor", "rutea este lead", o cuando llega un lead nuevo y necesita ruteo manual.

11. delegate_visit_prep
    params: { "lead_id": str, "asesor_id": str, "project_id": str, "visit_at": str ISO (todos requeridos) }
    devuelve: { dossier_id, dossier_content {buyer_profile, top_3_comparables_likely_asked, likely_objections, talking_points, key_project_data, recommended_units}, layer_used, latency_ms, cost_usd }
    Úsalo cuando user pregunta "prepárame para mi visita con X mañana", "qué debería saber para visita Y", "dame el briefing de la cita Z".

12. delegate_classify_reply
    params: { "reply_id": str (requerido) }
    devuelve: { reply_id, classification {category, confidence_score, urgency, key_phrases, recommended_action_text, next_best_action_type}, layer_used, latency_ms, dispatch }
    Úsalo cuando user pregunta "qué dice esta respuesta?", "clasifica reply X", "qué tan urgente es esto?".

13. delegate_disc_inference
    params: { "lead_id": str (requerido), "force_refresh": bool (opcional, default false) }
    devuelve: { lead_id, scores {dominante, influyente, estable, concienzudo}, predominant_type "D"|"I"|"S"|"C", confidence_score, communication_preferences {tone, length_preference, urgency_response, preferred_channel}, recommended_approach_text, evidence, layer_used }
    Úsalo cuando user pregunta "qué tipo de comprador es X", "cómo debo hablarle a este lead", "perfil DISC de Y", "qué approach uso con Z".

14. delegate_lead_nurture
    params: { "lead_id": str (requerido), "dry_run": bool (opcional, default false) }
    devuelve: { lead_id, sequence_type, total_steps, touches: [{step, channel, offset_hours, subject, body, cta, rationale}], layer_used, status }
    Úsalo cuando user pregunta "diseña secuencia de nurture para este lead", "qué emails mando a Y", "secuencia personalizada para Z".

15. delegate_match_weights_tune
    params: { "action": str (requerido, uno de: "get"|"auto_tune"|"manual_set"), "weights": dict (solo con action="manual_set", ej: {"zona":0.35,"precio":0.25,"segment":0.20,"amenidades":0.10,"timing":0.10}) }
    devuelve: { org_id, weights, confidence, training_sample_size, applied, reason, is_default }
    Úsalo cuando user pregunta "muéstrame los pesos de matching", "afina los pesos del sistema", "actualiza el peso de zona a 40%", "qué tan confiables son mis pesos".

16. delegate_argumentario_generate
    params: { "lead_id": str (requerido), "asesor_id": str (requerido) }
    devuelve: { lead_id, disc_type, content.opening_script, content.value_pitch, content.objection_responses, content.closing_technique, content.discovery_questions, content.followup_cadence, layer_used }
    Úsalo cuando user pregunta "cómo le hablo a este lead", "scripts para la visita con X", "qué técnica de cierre usar con Y", "preguntas de descubrimiento para Z".

REGLAS DE TOOLS:
- Puedes incluir hasta 5 tool_calls en una respuesta
- Solo incluye <tool_call> si realmente necesitas los datos para responder
- Después de recibir los resultados, da tu respuesta final COMPLETA (sin más tool_calls)
- Si el sistema retorna {"error": "..."}, explica que el dato no está disponible y continúa
"""

    memory_section = ""
    if memory_context:
        memory_section = f"\n## Memorias recientes relevantes:\n{memory_context}\n"

    return f"""Eres el Director AI de DesarrollosMX (DMX), asistente inteligente de decisión para un desarrollador inmobiliario en México.

Fecha actual: {now_mx}
Organización: {org_id}
Rol del usuario: {role}
Tier Phase Y activo: {tier}
{sim_note}
{memory_section}
Tu función es ayudar al equipo a tomar mejores decisiones sobre su portafolio: pricing, comparables, KPIs operativos, alertas de riesgo y oportunidades de mercado.

TONO: Directo, profesional, en español (es-MX). Nada de anglicismos innecesarios. Respuestas concisas pero completas. Usa datos concretos cuando los tengas.
{tools_section}"""


# ─── Tools implementation ──────────────────────────────────────────────────────
async def _exec_tool(db, tool_name: str, params: Dict[str, Any], org_id: str) -> Dict[str, Any]:
    """Ejecuta una tool interna. Retorna dict con resultado o {"error": "..."}."""
    try:
        if tool_name == "get_ie_score":
            return await _tool_get_ie_score(db, params.get("developer_id", ""))
        elif tool_name == "get_unit_score":
            return await _tool_get_unit_score(db, params.get("unit_id", ""))
        elif tool_name == "get_comparables":
            return await _tool_get_comparables(db, params.get("unit_id", ""), float(params.get("radius_km", 2.0)))
        elif tool_name == "get_org_kpis":
            return await _tool_get_org_kpis(db, params.get("org_id", org_id), int(params.get("period_days", 30)))
        elif tool_name == "retrieve_memory":
            return await _tool_retrieve_memory(
                db, org_id,
                query=str(params.get("query", "")),
                top_k=int(params.get("top_k", 5)),
                source_types=params.get("source_types"),
            )
        elif tool_name == "whatif_simulate":
            return await _tool_whatif_simulate(
                db, org_id,
                project_id=str(params.get("project_id", "")),
                scenario_type=str(params.get("scenario_type", "")),
                inputs=params.get("inputs") or {},
            )
        elif tool_name == "delegate_pricing_optimization":
            return await _tool_delegate_pricing_optimization(
                db, org_id,
                project_id=str(params.get("project_id", "")),
            )
        elif tool_name == "delegate_marketing_optimization":
            return await _tool_delegate_marketing_optimization(
                db, org_id,
                project_id=str(params.get("project_id", "")),
            )
        elif tool_name == "delegate_lead_optimization":
            return await _tool_delegate_lead_optimization(
                db, org_id,
                period_days=int(params.get("period_days", 30)),
            )
        elif tool_name == "delegate_lead_routing":
            return await _tool_delegate_lead_routing(
                db, org_id,
                lead_id=str(params.get("lead_id", "")),
            )
        elif tool_name == "delegate_visit_prep":
            return await _tool_delegate_visit_prep(
                db, org_id,
                lead_id=str(params.get("lead_id", "")),
                asesor_id=str(params.get("asesor_id", "")),
                project_id=str(params.get("project_id", "")),
                visit_at=str(params.get("visit_at", "")),
            )
        elif tool_name == "delegate_classify_reply":
            return await _tool_delegate_classify_reply(
                db, org_id,
                reply_id=str(params.get("reply_id", "")),
            )
        elif tool_name == "delegate_disc_inference":
            return await _tool_delegate_disc_inference(
                db, org_id,
                lead_id=str(params.get("lead_id", "")),
                force_refresh=bool(params.get("force_refresh", False)),
            )
        elif tool_name == "delegate_lead_nurture":
            return await _tool_delegate_lead_nurture(
                db, org_id,
                lead_id=str(params.get("lead_id", "")),
                dry_run=bool(params.get("dry_run", False)),
            )
        elif tool_name == "delegate_match_weights_tune":
            return await _tool_delegate_match_weights_tune(
                db, org_id,
                action=str(params.get("action", "get")),
                weights=params.get("weights") or {},
            )
        elif tool_name == "delegate_argumentario_generate":
            return await _tool_delegate_argumentario_generate(
                db, org_id,
                lead_id=str(params.get("lead_id", "")),
                asesor_id=str(params.get("asesor_id", "")),
            )
        else:
            return {"error": f"Tool '{tool_name}' no existe. Tools válidas: get_ie_score, get_unit_score, get_comparables, get_org_kpis, retrieve_memory, whatif_simulate, delegate_pricing_optimization, delegate_marketing_optimization, delegate_lead_optimization, delegate_lead_routing, delegate_visit_prep, delegate_classify_reply, delegate_disc_inference, delegate_lead_nurture, delegate_match_weights_tune, delegate_argumentario_generate"}
    except Exception as exc:
        log.warning(f"[director_tool] {tool_name} error: {exc}")
        return {"error": str(exc)}


async def _tool_get_ie_score(db, developer_id: str) -> Dict[str, Any]:
    if not developer_id:
        return {"error": "developer_id requerido"}
    doc = await db.ie_scores.find_one({"entity_id": developer_id}, {"_id": 0})
    if not doc:
        # Fallback: try developments collection
        dev = await db.developments.find_one({"id": developer_id}, {"_id": 0, "ie_score": 1, "name": 1})
        if dev and dev.get("ie_score") is not None:
            return {
                "developer_id": developer_id,
                "ie_score": dev["ie_score"],
                "percentile": None,
                "ranking": "Sin ranking (datos insuficientes)",
                "note": "Score desde desarrollo directo",
            }
        return {"error": f"No se encontró score para developer_id='{developer_id}'"}
    return {
        "developer_id": developer_id,
        "ie_score": doc.get("score"),
        "percentile": doc.get("percentile"),
        "ranking": doc.get("ranking"),
        "category": doc.get("category"),
        "updated_at": doc.get("updated_at"),
    }


async def _tool_get_unit_score(db, unit_id: str) -> Dict[str, Any]:
    if not unit_id:
        return {"error": "unit_id requerido"}
    doc = await db.units.find_one({"id": unit_id}, {"_id": 0}) or \
          await db.ie_unit_scores.find_one({"unit_id": unit_id}, {"_id": 0})
    if not doc:
        return {"error": f"Unidad '{unit_id}' no encontrada"}
    return {
        "unit_id": unit_id,
        "ie_unit_score": doc.get("ie_unit_score") or doc.get("score"),
        "factors": {
            "ubicacion":  doc.get("factor_ubicacion"),
            "precio":     doc.get("factor_precio"),
            "demanda":    doc.get("factor_demanda"),
            "riesgo":     doc.get("factor_riesgo"),
            "yield":      doc.get("factor_yield"),
        },
        "price_mxn": doc.get("price_mxn"),
        "area_m2": doc.get("area_m2"),
    }


async def _tool_get_comparables(db, unit_id: str, radius_km: float = 2.0) -> Dict[str, Any]:
    if not unit_id:
        return {"error": "unit_id requerido"}
    comps = await db.comparables.find(
        {"subject_unit_id": unit_id},
        {"_id": 0}
    ).sort("distance_km", 1).limit(5).to_list(length=5)
    if not comps:
        # Fallback genérico — busca en units si hay datos de zona
        return {
            "unit_id": unit_id,
            "radius_km": radius_km,
            "comparables": [],
            "note": "Sin comparables registrados para esta unidad aún."
        }
    return {
        "unit_id": unit_id,
        "radius_km": radius_km,
        "comparables": [
            {
                "comp_id": c.get("comparable_id"),
                "name": c.get("name"),
                "price_m2": c.get("price_per_m2"),
                "distance_km": c.get("distance_km"),
                "delta_pct": c.get("delta_pct_vs_subject"),
            }
            for c in comps
        ],
    }


async def _tool_get_org_kpis(db, org_id: str, period_days: int = 30) -> Dict[str, Any]:
    if not org_id:
        return {"error": "org_id requerido"}
    since = datetime.now(timezone.utc) - timedelta(days=period_days)
    since_q = {"$gte": since}

    # Leads
    leads_q = {"tenant_id": org_id, "created_at": since_q}
    leads_count = await db.leads.count_documents(leads_q)
    matches_count = await db.matches.count_documents({"org_id": org_id, "created_at": since_q}) if leads_count == 0 else 0

    # Conversion rate (leads with status=converted)
    converted = await db.leads.count_documents({**leads_q, "status": "convertido"})
    conversion_rate = round((converted / leads_count) * 100, 1) if leads_count > 0 else 0.0

    # Avg response time
    pipeline = [
        {"$match": {**leads_q, "first_response_at": {"$exists": True}}},
        {"$project": {"delta": {"$subtract": ["$first_response_at", "$created_at"]}}},
        {"$group": {"_id": None, "avg_ms": {"$avg": "$delta"}}},
    ]
    agg = await db.leads.aggregate(pipeline).to_list(length=1)
    avg_resp_hours = round(agg[0]["avg_ms"] / 3_600_000, 1) if agg else None

    return {
        "org_id": org_id,
        "period_days": period_days,
        "leads_count": leads_count,
        "matches_count": matches_count,
        "conversion_rate_pct": conversion_rate,
        "avg_response_time_hours": avg_resp_hours,
        "converted_count": converted,
    }


async def _tool_retrieve_memory(
    db,
    org_id: str,
    query: str,
    top_k: int = 5,
    source_types: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Tool 5: retrieval explícito de memoria desde el LLM."""
    if not query:
        return {"error": "query requerido para retrieve_memory"}
    if top_k > 10:
        top_k = 10
    from director_memory_engine import DirectorMemoryEngine
    engine = DirectorMemoryEngine(db, org_id)
    hits = await engine.retrieve(query_text=query, top_k=top_k, source_types=source_types, recency_weight=0.3)
    return {
        "query": query,
        "hits_count": len(hits),
        "memories": [
            {
                "memory_id": h["memory_id"],
                "source_type": h["source_type"],
                "summary": h.get("content_summary", "")[:200],
                "created_at": h.get("created_at"),
                "score": round(h.get("final_score", 0), 3),
            }
            for h in hits
        ],
    }


async def _tool_whatif_simulate(
    db,
    org_id: str,
    project_id: str,
    scenario_type: str,
    inputs: Dict[str, Any],
) -> Dict[str, Any]:
    """Tool 6: ejecuta WhatIfEngine y persiste el resultado."""
    if not project_id or not scenario_type:
        return {"error": "project_id y scenario_type son requeridos"}
    from whatif_engine import (
        run_simulation, PhaseYDisabledError, WhatIfCapExceededError, WhatIfInputError,
    )
    try:
        result = await run_simulation(
            db, org_id=org_id, user_id="director_agent",
            project_id=project_id, scenario_type=scenario_type,
            inputs=inputs or {}, persist=True,
        )
    except PhaseYDisabledError as e:
        return {"error": f"Phase Y disabled: {e}"}
    except WhatIfCapExceededError as e:
        return {"error": f"Cap diario alcanzado: {e}"}
    except WhatIfInputError as e:
        return {"error": f"Input inválido: {e}"}
    except Exception as e:
        log.warning(f"[director_tool] whatif_simulate failed: {e}")
        return {"error": f"Simulador falló: {e}"}

    # Compact response (LLM no necesita sub_scenarios completos)
    outs = result.get("outputs") or {}
    return {
        "scenario_id": result.get("scenario_id"),
        "scenario_type": result.get("scenario_type"),
        "tier": result.get("tier"),
        "simulated": outs.get("simulated", False),
        "outputs_summary": {
            "projected_revenue_delta_mxn": outs.get("projected_revenue_delta_mxn"),
            "projected_velocity_change_pct": outs.get("projected_velocity_change_pct"),
            "projected_lift_pct": outs.get("projected_lift_pct"),
            "projected_ie_score_delta": outs.get("projected_ie_score_delta"),
            "projected_drpi_change": outs.get("projected_drpi_change"),
            "projected_holding_cost_mxn": outs.get("projected_holding_cost_mxn"),
            "confidence_low": outs.get("confidence_low"),
            "confidence_high": outs.get("confidence_high"),
            "data_quality": outs.get("data_quality"),
            "recommendation_text": outs.get("recommendation_text"),
        },
        "comparables_used": outs.get("comparables_used") or [],
    }


async def _tool_delegate_lead_optimization(db, org_id: str, period_days: int = 30) -> Dict[str, Any]:
    """Tool 9: invoca LeadAgent para detectar issues en el funnel de leads."""
    try:
        from sub_agents.lead_agent import (
            LeadAgent, LeadAgentDisabledError, LeadAgentRateLimitError,
        )
        agent = LeadAgent(db=db, org_id=org_id)
        result = await agent.analyze_funnel(period_days=period_days)
    except LeadAgentDisabledError as e:
        return {"error": f"Lead Agent desactivado: {e}"}
    except LeadAgentRateLimitError as e:
        return {"error": f"Rate limit lead agent: {e}"}
    except Exception as e:
        log.warning(f"[director_tool] delegate_lead_optimization failed: {e}")
        return {"error": str(e)}

    recs = result.get("recommendations") or []
    return {
        "org_id": org_id,
        "run_id": result.get("run_id"),
        "layer_used": result.get("layer_used"),
        "recommendations_count": result.get("recommendations_count", len(recs)),
        "top_recommendations": [
            {
                "target_id": r.get("target_id"),
                "target_type": r.get("target_type"),
                "issue_detected": r.get("issue_detected"),
                "severity": r.get("severity"),
                "suggested_action_text": (r.get("suggested_action_text") or "")[:150],
                "expected_lift_pct": r.get("expected_lift_pct"),
                "confidence_score": r.get("confidence_score"),
            }
            for r in recs[:5]
        ],
        "cost_usd": result.get("cost_usd"),
    }


# Tool 10 — Smart Routing (W4.6 Y.3A)
async def _tool_delegate_lead_routing(db, org_id: str, lead_id: str) -> Dict[str, Any]:
    """Tool 10: invoca SmartRoutingEngine para asignar lead al mejor asesor."""
    if not lead_id:
        return {"error": "lead_id requerido para delegate_lead_routing"}
    try:
        from agentic_crm.smart_routing_engine import (
            SmartRoutingEngine, SmartRoutingDisabledError,
            SmartRoutingRateLimitError, SmartRoutingNotFoundError,
            SmartRoutingForbiddenError,
        )
        engine = SmartRoutingEngine(db, org_id)
        result = await engine.route_lead(lead_id)
    except SmartRoutingDisabledError as e:
        return {"error": f"Smart Routing desactivado: {e}"}
    except SmartRoutingRateLimitError as e:
        return {"error": f"Rate limit smart routing: {e}"}
    except SmartRoutingNotFoundError as e:
        return {"error": str(e)}
    except SmartRoutingForbiddenError as e:
        return {"error": str(e)}
    except Exception as e:  # noqa: BLE001
        log.warning(f"[director_tool] delegate_lead_routing failed: {e}")
        return {"error": str(e)}

    return {
        "org_id": org_id,
        "lead_id": lead_id,
        "routing_id": result.get("routing_id"),
        "suggested_asesor_id": result.get("suggested_asesor_id"),
        "suggested_asesor_name": result.get("suggested_asesor_name"),
        "fit_score": result.get("fit_score"),
        "fit_breakdown": result.get("fit_breakdown") or {},
        "rationale_text": result.get("rationale_text"),
        "routing_layer": result.get("routing_layer"),
        "latency_ms": result.get("latency_ms"),
        "cost_usd": result.get("cost_usd"),
    }


# Tool 11 — Visit Prep Dossier (W4.6 Y.3B)
async def _tool_delegate_visit_prep(db, org_id: str, lead_id: str, asesor_id: str,
                                    project_id: str, visit_at: str) -> Dict[str, Any]:
    if not (lead_id and asesor_id and project_id and visit_at):
        return {"error": "lead_id, asesor_id, project_id, visit_at son requeridos para delegate_visit_prep"}
    try:
        from agentic_crm.visit_prep_engine import (
            VisitPrepEngine, VisitPrepDisabledError,
            VisitPrepRateLimitError, VisitPrepNotFoundError,
            VisitPrepForbiddenError,
        )
        engine = VisitPrepEngine(db, org_id)
        result = await engine.generate_dossier(lead_id, asesor_id, project_id, visit_at)
    except VisitPrepDisabledError as e:
        return {"error": f"Visit Prep desactivado: {e}"}
    except VisitPrepRateLimitError as e:
        return {"error": f"Rate limit visit prep: {e}"}
    except VisitPrepNotFoundError as e:
        return {"error": str(e)}
    except VisitPrepForbiddenError as e:
        return {"error": str(e)}
    except Exception as e:  # noqa: BLE001
        log.warning(f"[director_tool] delegate_visit_prep failed: {e}")
        return {"error": str(e)}

    return {
        "org_id": org_id,
        "lead_id": lead_id,
        "asesor_id": asesor_id,
        "project_id": project_id,
        "dossier_id": result.get("dossier_id"),
        "dossier_content": result.get("dossier_content") or {},
        "layer_used": result.get("layer_used"),
        "latency_ms": result.get("latency_ms"),
        "cost_usd": result.get("cost_usd"),
        "data_quality": result.get("data_quality"),
    }


# Tool 12 — Reply Classifier (W4.6 Y.3C)
async def _tool_delegate_classify_reply(db, org_id: str, reply_id: str) -> Dict[str, Any]:
    if not reply_id:
        return {"error": "reply_id requerido para delegate_classify_reply"}
    try:
        from agentic_crm.reply_classifier_engine import (
            ReplyClassifierEngine, ReplyClassifierDisabledError,
            ReplyClassifierRateLimitError, ReplyClassifierNotFoundError,
            ReplyClassifierForbiddenError,
        )
        engine = ReplyClassifierEngine(db, org_id)
        result = await engine.classify_reply(reply_id)
    except ReplyClassifierDisabledError as e:
        return {"error": f"Reply Classifier desactivado: {e}"}
    except ReplyClassifierRateLimitError as e:
        return {"error": f"Rate limit reply classifier: {e}"}
    except ReplyClassifierNotFoundError as e:
        return {"error": str(e)}
    except ReplyClassifierForbiddenError as e:
        return {"error": str(e)}
    except Exception as e:  # noqa: BLE001
        log.warning(f"[director_tool] delegate_classify_reply failed: {e}")
        return {"error": str(e)}

    return {
        "org_id": org_id,
        "reply_id": reply_id,
        "classification": result.get("classification") or {},
        "layer_used": result.get("layer_used"),
        "latency_ms": result.get("latency_ms"),
        "dispatch": result.get("dispatch") or {},
    }


async def _tool_delegate_disc_inference(db, org_id: str, lead_id: str,
                                         force_refresh: bool = False) -> Dict[str, Any]:
    """Tool 13 (Y.3D): invoca DISCInferencer para inferir perfil DISC de un lead."""
    if not lead_id:
        return {"error": "lead_id requerido para delegate_disc_inference"}
    try:
        from agentic_crm.disc_inferencer_engine import (
            DISCInferencer, DISCInferencerDisabledError,
            DISCInferencerRateLimitError, DISCInferencerNotFoundError,
            DISCInferencerForbiddenError,
        )
        engine = DISCInferencer(db, org_id)
        result = await engine.infer_profile(lead_id, force_refresh=force_refresh)
    except DISCInferencerDisabledError as e:
        return {"error": f"DISC Inferencer desactivado: {e}"}
    except DISCInferencerRateLimitError as e:
        return {"error": f"Rate limit DISC: {e}"}
    except DISCInferencerNotFoundError as e:
        return {"error": str(e)}
    except DISCInferencerForbiddenError as e:
        return {"error": str(e)}
    except Exception as e:  # noqa: BLE001
        log.warning(f"[director_tool] delegate_disc_inference failed: {e}")
        return {"error": str(e)}

    return {
        "org_id": org_id,
        "lead_id": lead_id,
        "scores": result.get("scores") or {},
        "predominant_type": result.get("predominant_type"),
        "confidence_score": result.get("confidence_score"),
        "communication_preferences": result.get("communication_preferences") or {},
        "recommended_approach_text": result.get("recommended_approach_text"),
        "evidence": result.get("evidence") or {},
        "layer_used": result.get("layer_used"),
        "data_quality": result.get("data_quality"),
        "from_cache": result.get("from_cache", False),
    }


async def _tool_delegate_lead_nurture(db, org_id: str, lead_id: str,
                                       dry_run: bool = False) -> Dict[str, Any]:
    """Tool 14 (Y.3E): invoca NurtureIntelligentEngine para diseñar secuencia personalizada."""
    if not lead_id:
        return {"error": "lead_id requerido para delegate_lead_nurture"}
    try:
        from lead_nurture_engine import (
            NurtureIntelligentEngine, NurtureIntelligentDisabledError,
            NurtureIntelligentRateLimitError, NurtureIntelligentNotFoundError,
            NurtureIntelligentForbiddenError,
        )
        engine = NurtureIntelligentEngine(db, org_id)
        result = await engine.design_sequence(lead_id, dry_run=dry_run)
    except NurtureIntelligentDisabledError as e:
        return {"error": f"Nurture Intelligent desactivado: {e}"}
    except NurtureIntelligentRateLimitError as e:
        return {"error": f"Rate limit nurture: {e}"}
    except NurtureIntelligentNotFoundError as e:
        return {"error": str(e)}
    except NurtureIntelligentForbiddenError as e:
        return {"error": str(e)}
    except Exception as e:  # noqa: BLE001
        log.warning(f"[director_tool] delegate_lead_nurture failed: {e}")
        return {"error": str(e)}

    return {
        "org_id": org_id,
        "lead_id": lead_id,
        "sequence_type": result.get("sequence_type"),
        "total_steps": result.get("total_steps"),
        "touches": result.get("touches") or [],
        "layer_used": result.get("layer_used"),
        "data_quality": result.get("data_quality"),
        "status": result.get("status"),
        "dry_run": dry_run,
    }


# ─── Tool 15 — Match Weights Adaptive (W4.7 Y.4B) ───────────────────────────
async def _tool_delegate_match_weights_tune(
    db, org_id: str, action: str, weights: Dict[str, Any],
) -> Dict[str, Any]:
    """Tool 15 (Y.4B): MatchWeightsEngine — get / auto_tune / manual_set."""
    from agentic_crm.match_weights_engine import (
        MatchWeightsEngine, MatchWeightsDisabledError,
        MatchWeightsValidationError, MatchWeightsRateLimitError,
    )
    engine = MatchWeightsEngine(db, org_id)
    try:
        if action == "get":
            result = await engine.get_weights()
            return {
                "org_id": org_id,
                "weights": result.get("weights"),
                "is_default": result.get("is_default"),
                "tuning_confidence": result.get("tuning_confidence"),
                "training_sample_size": result.get("training_sample_size"),
                "last_tuned_at": result.get("last_tuned_at"),
                "version": result.get("version"),
                "tier": result.get("tier"),
            }
        elif action == "auto_tune":
            result = await engine.auto_tune()
            return {
                "org_id": org_id,
                "learned_weights": result.get("learned_weights"),
                "confidence": result.get("confidence"),
                "training_sample_size": result.get("training_sample_size"),
                "reason": result.get("reason"),
                "applied": result.get("applied"),
            }
        elif action == "manual_set":
            if not weights:
                return {"error": "weights dict requerido para action=manual_set"}
            clean_weights = {k: float(v) for k, v in weights.items()}
            result = await engine.manual_set_weights(clean_weights, user_id="director_ai")
            return {
                "org_id": org_id,
                "weights": result.get("weights"),
                "version": result.get("version"),
                "ok": True,
            }
        else:
            return {"error": f"action inválido: {action}. Válidos: get, auto_tune, manual_set"}
    except MatchWeightsDisabledError as e:
        return {"error": f"Match Weights desactivado: {e}"}
    except MatchWeightsValidationError as e:
        return {"error": f"Validación de pesos fallida: {e}"}
    except MatchWeightsRateLimitError as e:
        return {"error": f"Rate limit: {e}"}
    except Exception as exc:
        log.warning(f"[director_tool] delegate_match_weights_tune failed: {exc}")
        return {"error": str(exc)}


# ─── Tool 16 — Argumentario Tone Behavioral-Driven (W4.7 Y.4C) ───────────────
async def _tool_delegate_argumentario_generate(
    db, org_id: str, lead_id: str, asesor_id: str,
) -> Dict[str, Any]:
    """Tool 16 (Y.4C): ArgumentarioEngine — genera scripts DISC-adaptados."""
    if not lead_id:
        return {"error": "lead_id requerido"}
    if not asesor_id:
        asesor_id = "director_ai"
    from agentic_crm.argumentario_engine import (
        ArgumentarioEngine, ArgumentarioDisabledError, ArgumentarioRateLimitError,
    )
    engine = ArgumentarioEngine(db, org_id)
    try:
        result = await engine.generate_argumentario(lead_id, asesor_id)
        content = result.get("content") or {}
        return {
            "ok": True,
            "lead_id": lead_id,
            "disc_type": result.get("disc_type"),
            "layer_used": result.get("layer_used"),
            "opening_script": content.get("opening_script"),
            "value_pitch": content.get("value_pitch"),
            "objection_responses": content.get("objection_responses"),
            "closing_technique": content.get("closing_technique"),
            "discovery_questions": content.get("discovery_questions"),
            "followup_cadence": content.get("followup_cadence"),
            "cost_usd": result.get("cost_usd"),
        }
    except ArgumentarioDisabledError as e:
        return {"error": f"Argumentario desactivado: {e}"}
    except ArgumentarioRateLimitError as e:
        return {"error": f"Rate limit: {e}"}
    except Exception as exc:
        log.warning(f"[director_tool] delegate_argumentario_generate failed: {exc}")
        return {"error": str(exc)}


async def _tool_delegate_marketing_optimization(db, org_id: str, project_id: str) -> Dict[str, Any]:
    """Tool 8: invoca MarketingAgent para detectar performance digital sub-óptima."""
    if not project_id:
        return {"error": "project_id requerido para delegate_marketing_optimization"}
    try:
        from sub_agents.marketing_agent import (
            MarketingAgent, MarketingAgentDisabledError, MarketingAgentRateLimitError,
        )
        agent = MarketingAgent(db=db, org_id=org_id)
        result = await agent.analyze_project(project_id=project_id)
    except MarketingAgentDisabledError as e:
        return {"error": f"Marketing Agent desactivado: {e}"}
    except MarketingAgentRateLimitError as e:
        return {"error": f"Rate limit marketing agent: {e}"}
    except Exception as e:
        log.warning(f"[director_tool] delegate_marketing_optimization failed: {e}")
        return {"error": str(e)}

    recs = result.get("recommendations") or []
    return {
        "project_id": project_id,
        "run_id": result.get("run_id"),
        "layer_used": result.get("layer_used"),
        "recommendations_count": result.get("recommendations_count", len(recs)),
        "top_recommendations": [
            {
                "target_id": r.get("target_id"),
                "issue_detected": r.get("issue_detected"),
                "severity": r.get("severity"),
                "suggested_action_text": (r.get("suggested_action_text") or "")[:150],
                "expected_lift_pct": r.get("expected_lift_pct"),
                "confidence_score": r.get("confidence_score"),
            }
            for r in recs[:5]
        ],
        "cost_usd": result.get("cost_usd"),
    }


async def _tool_delegate_pricing_optimization(db, org_id: str, project_id: str) -> Dict[str, Any]:
    """Tool 7: invoca PricingAgent para detectar unidades sub-optimizadas."""
    if not project_id:
        return {"error": "project_id requerido para delegate_pricing_optimization"}
    try:
        from sub_agents.pricing_agent import (
            PricingAgent, PricingAgentDisabledError, PricingAgentRateLimitError,
        )
        agent = PricingAgent(db=db, org_id=org_id)
        result = await agent.analyze_project(project_id=project_id)
    except PricingAgentDisabledError as e:
        return {"error": f"Pricing Agent desactivado: {e}"}
    except PricingAgentRateLimitError as e:
        return {"error": f"Rate limit pricing agent: {e}"}
    except Exception as e:
        log.warning(f"[director_tool] delegate_pricing_optimization failed: {e}")
        return {"error": str(e)}

    recs = result.get("recommendations") or []
    return {
        "project_id": project_id,
        "run_id": result.get("run_id"),
        "layer_used": result.get("layer_used"),
        "recommendations_count": result.get("recommendations_count", len(recs)),
        "top_recommendations": [
            {
                "unit_id": r.get("unit_id"),
                "current_price_per_m2": r.get("current_price_per_m2"),
                "suggested_price_per_m2": r.get("suggested_price_per_m2"),
                "delta_pct": r.get("delta_pct"),
                "confidence_score": r.get("confidence_score"),
                "rationale": (r.get("rationale_text") or "")[:150],
            }
            for r in recs[:5]
        ],
        "cost_usd": result.get("cost_usd"),
    }


# ─── Conversation history helpers ─────────────────────────────────────────────
def _estimate_tokens(text: str) -> int:
    """Estimación: 4 chars ≈ 1 token (heurística estándar)."""
    return max(1, len(text or "") // 4)


async def _load_history_as_openai(db, session_id: str, limit: int = 40) -> List[Dict[str, Any]]:
    """Carga los últimos N mensajes como array OpenAI-format."""
    docs = await db.director_messages.find(
        {"session_id": session_id, "role": {"$in": ["user", "assistant"]}},
        {"_id": 0, "role": 1, "content": 1},
    ).sort("created_at", 1).limit(limit).to_list(length=limit)
    return [{"role": d["role"], "content": d["content"] or ""} for d in docs]


# ─── Agentic tool loop ────────────────────────────────────────────────────────
def _extract_tool_calls(text: str) -> List[Dict[str, Any]]:
    """Parsea <tool_call>{...}</tool_call> tags del texto de Claude."""
    calls = []
    for match in _TOOL_CALL_RE.finditer(text):
        raw = match.group(1).strip()
        try:
            calls.append(json.loads(raw))
        except json.JSONDecodeError:
            log.warning(f"[director] tool_call JSON inválido: {raw[:200]}")
    return calls


def _strip_tool_calls(text: str) -> str:
    """Elimina los tags <tool_call> del texto para mostrar al usuario."""
    return _TOOL_CALL_RE.sub("", text).strip()


async def _agentic_loop(
    db,
    chat_obj,
    user_message: str,
    org_id: str,
    max_tool_rounds: int = 3,
) -> Tuple[str, List[Dict[str, Any]], int, int]:
    """
    Ejecuta el loop agentic: send → parse tool_calls → exec → reinject → final response.
    Returns: (final_text, tool_calls_list, total_in_tokens, total_out_tokens)
    """
    from emergentintegrations.llm.chat import UserMessage as LlmUserMsg

    total_in = _estimate_tokens(user_message)
    total_out = 0
    all_tool_calls: List[Dict[str, Any]] = []
    current_message = user_message

    for _round in range(max_tool_rounds):
        raw_resp = await chat_obj.send_message(LlmUserMsg(text=current_message))
        total_out += _estimate_tokens(raw_resp or "")

        tool_call_specs = _extract_tool_calls(raw_resp or "")
        if not tool_call_specs:
            # No hay tool calls — respuesta final
            return _strip_tool_calls(raw_resp or ""), all_tool_calls, total_in, total_out

        # Ejecutar todas las tools de este round
        results_parts = []
        for spec in tool_call_specs[:5]:  # max 5 tools por round (incluyendo retrieve_memory)
            tool_name = spec.get("tool", "")
            params = spec.get("params") or {}
            t0 = time.monotonic()
            result = await _exec_tool(db, tool_name, params, org_id)
            latency_ms = int((time.monotonic() - t0) * 1000)
            all_tool_calls.append({
                "tool_name": tool_name,
                "input": params,
                "output": result,
                "latency_ms": latency_ms,
            })
            result_str = json.dumps(result, ensure_ascii=False)
            results_parts.append(f"<tool_result tool=\"{tool_name}\">{result_str}</tool_result>")
            total_in += _estimate_tokens(result_str)

        # Reinjectar resultados como mensaje del sistema
        current_message = (
            "RESULTADOS DE TOOLS:\n" + "\n".join(results_parts) +
            "\n\nAhora da tu respuesta final completa al usuario basándote en estos datos."
        )

    # Si llegamos aquí sin respuesta final, usar el último raw_resp limpio
    last_resp = await chat_obj.send_message(LlmUserMsg(text=current_message))
    total_out += _estimate_tokens(last_resp or "")
    return _strip_tool_calls(last_resp or ""), all_tool_calls, total_in, total_out


# ─── DirectorAgent ────────────────────────────────────────────────────────────
class DirectorAgent:
    def __init__(self, db, org_id: str, user_id: str, role: str):
        self.db = db
        self.org_id = org_id
        self.user_id = user_id
        self.role = role

    async def start_session(self) -> str:
        """Crea sesión nueva. Valida master switch + tier. Returns session_id."""
        from routes_phase_y_controls import get_phase_y_settings
        settings = await get_phase_y_settings(self.db, self.org_id)

        if not settings.get("agentic_enabled", False):
            raise PhaseYDisabledError("Phase Y master switch desactivado para esta organización")

        tier = (settings.get("feature_tiers") or {}).get("diagnostic_engine", "off")
        if tier == "off":
            raise PhaseYDisabledError("diagnostic_engine tier está en 'off'")

        session_id = f"dses_{uuid.uuid4().hex[:16]}"
        now = datetime.now(timezone.utc)

        # W4.4B — Memory injection for tier ≥ T2
        initial_memory_ids: List[str] = []
        if tier in _MEMORY_TIERS:
            try:
                from director_memory_engine import DirectorMemoryEngine
                mem_engine = DirectorMemoryEngine(self.db, self.org_id)
                recent_mems = await mem_engine.retrieve(
                    query_text="contexto reciente organización",
                    top_k=3,
                    recency_weight=0.7,
                )
                initial_memory_ids = [m["memory_id"] for m in recent_mems]
            except Exception as e:
                log.warning(f"[director] memory retrieval on start_session failed: {e}")

        await self.db.director_sessions.insert_one({
            "_id": session_id,
            "org_id": self.org_id,
            "user_id": self.user_id,
            "role": self.role,
            "created_at": now,
            "last_message_at": now,
            "status": "active",
            "tier_at_start": tier,
            "simulation_mode": settings.get("simulation_mode", False),
            "total_tokens_in": 0,
            "total_tokens_out": 0,
            "total_cost_usd": 0.0,
            "initial_memory_ids": initial_memory_ids,
        })
        log.info(f"[director] session started: {session_id} org={self.org_id} tier={tier} memories={len(initial_memory_ids)}")
        return session_id

    async def chat(self, session_id: str, user_message: str) -> Dict[str, Any]:
        """Envía mensaje y retorna respuesta del director. Persiste en DB."""
        db = self.db

        # Load + validate session
        sess = await db.director_sessions.find_one({"_id": session_id}, {"_id": 0})
        if not sess:
            raise ValueError(f"Sesión '{session_id}' no existe")
        if sess.get("status") == "ended":
            raise SessionEndedError(f"La sesión '{session_id}' ya fue cerrada")

        tier = sess.get("tier_at_start", "T1")
        sim_mode = sess.get("simulation_mode", False)
        cap_in, cap_out = TIER_CAPS.get(tier, (50000, 10000))

        # Token cap check
        if cap_in is not None and sess.get("total_tokens_in", 0) >= cap_in:
            raise TierCapExceededError(f"Cap de tokens de entrada alcanzado ({cap_in}) para tier {tier}")
        if cap_out is not None and sess.get("total_tokens_out", 0) >= cap_out:
            raise TierCapExceededError(f"Cap de tokens de salida alcanzado ({cap_out}) para tier {tier}")

        msg_id_user = f"dmsg_{uuid.uuid4().hex[:12]}"
        msg_id_asst = f"dmsg_{uuid.uuid4().hex[:12]}"
        now = datetime.now(timezone.utc)
        tokens_user = _estimate_tokens(user_message)

        # Persist user message
        await db.director_messages.insert_one({
            "_id": msg_id_user,
            "session_id": session_id,
            "role": "user",
            "content": user_message,
            "tool_calls": None,
            "tool_results": None,
            "tokens_in": tokens_user,
            "tokens_out": 0,
            "cost_usd": 0.0,
            "latency_ms": 0,
            "simulated": False,
            "created_at": now,
        })

        # ── Simulation mode: bypass Anthropic ────────────────────────────────
        if sim_mode:
            sim_text = f"[SIM] Esta es una respuesta simulada para '{user_message[:80]}...'. En producción, el Director AI analizaría tu pregunta con datos reales de la plataforma."
            await db.director_messages.insert_one({
                "_id": msg_id_asst,
                "session_id": session_id,
                "role": "assistant",
                "content": sim_text,
                "tool_calls": None,
                "tool_results": None,
                "tokens_in": 0,
                "tokens_out": _estimate_tokens(sim_text),
                "cost_usd": 0.0,
                "latency_ms": 0,
                "simulated": True,
                "created_at": datetime.now(timezone.utc),
            })
            await db.director_sessions.update_one(
                {"_id": session_id},
                {"$set": {"last_message_at": datetime.now(timezone.utc)}}
            )
            return {
                "message_id": msg_id_asst,
                "assistant_message": sim_text,
                "tool_calls": [],
                "tokens_in": 0,
                "tokens_out": _estimate_tokens(sim_text),
                "cost_usd": 0.0,
                "simulated": True,
            }

        # ── Real LLM call ─────────────────────────────────────────────────────
        from emergentintegrations.llm.chat import LlmChat

        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            raise RuntimeError("EMERGENT_LLM_KEY no configurado")

        # W4.4B — Retrieve relevant memories for this message (tier ≥ T2)
        message_memory_hits: List[Dict[str, Any]] = []
        memory_context_str: Optional[str] = None
        if tier in _MEMORY_TIERS and len(user_message) >= 10:
            try:
                from director_memory_engine import DirectorMemoryEngine
                mem_engine = DirectorMemoryEngine(db, self.org_id)
                memory_hits = await mem_engine.retrieve(
                    query_text=user_message,
                    top_k=5,
                    recency_weight=0.3,
                )
                message_memory_hits = memory_hits
                if memory_hits:
                    ctx_lines = []
                    for h in memory_hits:
                        ctx_lines.append(f"- [{h['source_type']}] {h.get('content_summary', '')[:150]}")
                    memory_context_str = "\n".join(ctx_lines)
            except Exception as e:
                log.warning(f"[director] memory retrieval in chat failed: {e}")

        system_prompt = _build_system_prompt(
            self.org_id, self.role, tier, sim_mode,
            memory_context=memory_context_str,
        )

        # Load conversation history
        history = await _load_history_as_openai(db, session_id, limit=40)
        initial_messages = [{"role": "system", "content": system_prompt}] + history

        chat = LlmChat(
            api_key=api_key,
            session_id=session_id,
            system_message=system_prompt,
            initial_messages=initial_messages,
        ).with_model("anthropic", DIRECTOR_MODEL)

        t0 = time.monotonic()
        assistant_text, tool_calls_log, tok_in, tok_out = await _agentic_loop(
            db, chat, user_message, self.org_id
        )
        latency_ms = int((time.monotonic() - t0) * 1000)
        cost = tok_in * PRICE_IN_PER_TOK + tok_out * PRICE_OUT_PER_TOK

        # Check if retrieve_memory was called explicitly in tool loop
        explicit_memory_calls = [tc for tc in tool_calls_log if tc["tool_name"] == "retrieve_memory"]

        # Merge memory hits (auto + explicit)
        all_memory_used = list(message_memory_hits)
        for tc in explicit_memory_calls:
            output = tc.get("output") or {}
            for m in (output.get("memories") or []):
                if not any(x.get("memory_id") == m.get("memory_id") for x in all_memory_used):
                    all_memory_used.append({
                        "memory_id": m.get("memory_id"),
                        "source_type": m.get("source_type"),
                        "content_summary": m.get("summary", ""),
                    })

        # Persist assistant message
        await db.director_messages.insert_one({
            "_id": msg_id_asst,
            "session_id": session_id,
            "role": "assistant",
            "content": assistant_text,
            "tool_calls": [tc["tool_name"] for tc in tool_calls_log] or None,
            "tool_results": None,
            "tokens_in": tok_in,
            "tokens_out": tok_out,
            "cost_usd": round(cost, 8),
            "latency_ms": latency_ms,
            "simulated": False,
            "memory_hits": [
                {"memory_id": m.get("memory_id"), "source_type": m.get("source_type"), "content_summary": m.get("content_summary", "")[:80]}
                for m in all_memory_used
            ] or None,
            "created_at": datetime.now(timezone.utc),
        })

        # Persist tool call records
        for tc in tool_calls_log:
            tc_id = f"dtc_{uuid.uuid4().hex[:12]}"
            await db.director_tool_calls.insert_one({
                "_id": tc_id,
                "session_id": session_id,
                "message_id": msg_id_asst,
                "tool_name": tc["tool_name"],
                "input": tc["input"],
                "output": tc["output"],
                "latency_ms": tc["latency_ms"],
                "error": tc["output"].get("error") if isinstance(tc["output"], dict) else None,
                "created_at": datetime.now(timezone.utc),
            })

        # Update session totals
        await db.director_sessions.update_one(
            {"_id": session_id},
            {
                "$set": {"last_message_at": datetime.now(timezone.utc)},
                "$inc": {
                    "total_tokens_in": tok_in,
                    "total_tokens_out": tok_out,
                    "total_cost_usd": round(cost, 8),
                },
            }
        )

        return {
            "message_id": msg_id_asst,
            "assistant_message": assistant_text,
            "tool_calls": tool_calls_log,
            "tokens_in": tok_in,
            "tokens_out": tok_out,
            "cost_usd": round(cost, 8),
            "simulated": False,
            "memory_hits": all_memory_used,
        }

    async def end_session(self, session_id: str) -> None:
        """Cierra la sesión. Status → ended."""
        res = await self.db.director_sessions.update_one(
            {"_id": session_id},
            {"$set": {"status": "ended"}},
        )
        if res.matched_count == 0:
            raise ValueError(f"Sesión '{session_id}' no existe")


# ─── Indexes ──────────────────────────────────────────────────────────────────
async def ensure_indexes(db) -> None:
    try:
        await db.director_sessions.create_index(
            [("org_id", 1), ("status", 1)], name="idx_dir_sess_org_status"
        )
        await db.director_sessions.create_index(
            [("user_id", 1), ("last_message_at", -1)], name="idx_dir_sess_user_time"
        )
        await db.director_messages.create_index(
            [("session_id", 1), ("created_at", 1)], name="idx_dir_msg_sess_time"
        )
        await db.director_tool_calls.create_index(
            [("session_id", 1), ("created_at", 1)], name="idx_dir_tc_sess_time"
        )
        await db.director_tool_calls.create_index(
            [("tool_name", 1), ("created_at", -1)], name="idx_dir_tc_tool_time"
        )
        log.info("[director] indexes OK")
    except Exception as exc:
        log.warning(f"[director] ensure_indexes failed: {exc}")
