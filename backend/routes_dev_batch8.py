"""Phase 4 Batch 8 — Cash Flow Forecast IA por Proyecto (4.24).

Investor-grade financial forecast engine combining:
  - Pipeline leads × stage probability × ticket
  - Construction milestones (default 4-hito split) + operating costs
  - 12-24 month series with gap detection
  - 3 scenarios sensitivity (pesimista/base/optimista)
  - Claude haiku narratives + AI recommendations cached in doc

ML events: cash_flow_recalculated, cash_flow_pdf_exported,
           cash_flow_recommendation_applied, cash_flow_scenario_viewed
"""
from __future__ import annotations

import asyncio
import base64
import io
import json
import logging
import os
import re
import secrets
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

log = logging.getLogger("dmx.batch8")
router = APIRouter(tags=["batch8"])

# ─────────────────────────────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────────────────────────────
STAGE_PROBABILITIES = {
    "visita_realizada": 0.15,
    "propuesta": 0.40,
    "cerrado_ganado": 1.0,
}
DEFAULT_HORIZON = 12
MAX_HORIZON = 36
DEFAULT_OPERATING_COSTS = 350_000  # MXN/month (marketing + payroll + fees)
DEFAULT_CONSTRUCTION_COST_PER_M2 = 22_000  # MXN/m² baseline LATAM
DEFAULT_MILESTONES = [(1, 0.20), (6, 0.30), (12, 0.30), (18, 0.20)]
GAP_THRESHOLDS = {"mild": -1_000_000, "moderate": -5_000_000}

SCENARIO_DEFS = {
    "pesimista":  {"absorption_modifier": 0.80, "price_modifier": 0.95, "construction_delay_months": 3},
    "base":       {"absorption_modifier": 1.00, "price_modifier": 1.00, "construction_delay_months": 0},
    "optimista":  {"absorption_modifier": 1.15, "price_modifier": 1.05, "construction_delay_months": 0},
}

MONTH_LABELS_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun",
                   "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────
def _now() -> datetime:
    return datetime.now(timezone.utc)


def _now_iso() -> str:
    return _now().isoformat()


def _uid(prefix: str = "cf") -> str:
    return f"{prefix}_{secrets.token_hex(6)}"


def _db(request: Request):
    return request.app.state.db


async def _auth(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    return user


def _is_admin(user) -> bool:
    if user.role == "superadmin":
        return True
    if user.role in ("developer_admin", "developer_director"):
        return True
    if getattr(user, "internal_role", None) in ("admin", "commercial_director"):
        return True
    return False


def _is_admin_only(user) -> bool:
    """Stricter: only developer_admin or superadmin (for export/recalc/recommendation actions)."""
    if user.role == "superadmin":
        return True
    if user.role == "developer_admin":
        return True
    if getattr(user, "internal_role", None) == "admin":
        return True
    return False


async def _safe_audit_ml(db, actor, *, action, entity_type, entity_id,
                        request=None, ml_event=None, ml_context=None):
    try:
        from audit_log import log_mutation
        await log_mutation(db, actor, action, entity_type, entity_id, None, None, request=request)
    except Exception:
        pass
    if ml_event:
        try:
            from observability import emit_ml_event
            uid = getattr(actor, "user_id", None) or "system"
            role = getattr(actor, "role", None) or "system"
            org = getattr(actor, "tenant_id", None) or "dmx"
            await emit_ml_event(db, event_type=ml_event, user_id=uid, org_id=org, role=role,
                                context=ml_context or {}, ai_decision={}, user_action={})
        except Exception:
            pass


def _month_label(start: datetime, offset: int) -> str:
    y = start.year
    m = start.month + offset - 1
    y += m // 12
    m = (m % 12)
    return f"Mes {offset} / {MONTH_LABELS_ES[m]} {y}"


# ─────────────────────────────────────────────────────────────────────────────
# Project + leads aggregation
# ─────────────────────────────────────────────────────────────────────────────
def _project_inputs_from_dev(dev_doc: Dict, override: Dict) -> Dict:
    """Build project_inputs dict from the developments seed + sensible defaults."""
    units_total = int(dev_doc.get("units_total") or 0)
    price_from = int(dev_doc.get("price_from") or 0)
    price_to = int(dev_doc.get("price_to") or 0) or price_from
    target_price_avg = int((price_from + price_to) / 2) if price_to else 5_500_000
    # Construction cost: avg_m2 × $22k/m² × units_total (fallback if unset)
    units = dev_doc.get("units") or []
    avg_m2 = 95
    if units:
        sizes = [u.get("m2_total") or u.get("m2_privative") or 0 for u in units if (u.get("m2_total") or u.get("m2_privative"))]
        if sizes:
            avg_m2 = int(sum(sizes) / len(sizes))
    construction_cost_total = (override.get("construction_cost_total")
                               or units_total * avg_m2 * DEFAULT_CONSTRUCTION_COST_PER_M2)
    target_absorption = override.get("target_absorption_months") or max(units_total // 4, 6)
    milestones = override.get("construction_milestones") or [
        {"month": m, "pct_construction_paid": pct} for m, pct in DEFAULT_MILESTONES
    ]
    return {
        "total_units": units_total,
        "construction_cost_total": int(construction_cost_total),
        "target_price_avg_per_unit": target_price_avg,
        "target_absorption_months": int(target_absorption),
        "construction_milestones": milestones,
        "operating_costs_monthly": int(override.get("operating_costs_monthly") or DEFAULT_OPERATING_COSTS),
        "avg_unit_size_m2": avg_m2,
    }


async def _aggregate_leads(db, project_id: str, dev_org_id: Optional[str]) -> Dict:
    """Aggregate confirmed revenue + pipeline value weighted from leads collection."""
    q: Dict[str, Any] = {"project_id": project_id}
    if dev_org_id and dev_org_id != "default":
        q["dev_org_id"] = dev_org_id
    confirmed_revenue = 0
    pipeline_value_weighted = 0
    pipeline_avg_ticket_sum = 0
    pipeline_count = 0
    visita_count = 0
    propuesta_count = 0
    cerrados_count = 0
    try:
        async for ld in db.leads.find(q, {"_id": 0, "status": 1, "close_price": 1, "ticket_estimate": 1, "heat_score": 1}):
            status = ld.get("status")
            if status == "cerrado_ganado":
                price = int(ld.get("close_price") or ld.get("ticket_estimate") or 0)
                confirmed_revenue += price
                cerrados_count += 1
            elif status in STAGE_PROBABILITIES:
                ticket = int(ld.get("ticket_estimate") or 0)
                heat = float(ld.get("heat_score") or 50) / 100.0
                prob = STAGE_PROBABILITIES.get(status, 0.10)
                weighted = int(ticket * prob * (0.5 + heat))
                pipeline_value_weighted += weighted
                pipeline_avg_ticket_sum += ticket
                pipeline_count += 1
                if status == "visita_realizada":
                    visita_count += 1
                elif status == "propuesta":
                    propuesta_count += 1
    except Exception as e:
        log.warning(f"[batch8] leads agg failed: {e}")
    pipeline_avg_ticket = int(pipeline_avg_ticket_sum / pipeline_count) if pipeline_count else 0
    return {
        "confirmed_revenue": confirmed_revenue,
        "visita_leads_count": visita_count,
        "propuesta_leads_count": propuesta_count,
        "pipeline_avg_ticket": pipeline_avg_ticket,
        "pipeline_value_weighted": pipeline_value_weighted,
        "cerrados_count": cerrados_count,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Engine
# ─────────────────────────────────────────────────────────────────────────────
def _decay_factor(month: int) -> float:
    if month <= 6:
        return 1.10 - (month - 1) * 0.025
    if month <= 12:
        return 0.97 - (month - 6) * 0.04
    return max(0.40, 0.73 - (month - 12) * 0.025)


def _build_series(project_inputs: Dict, pipeline_inputs: Dict, *,
                 horizon: int, absorption_modifier: float = 1.0,
                 price_modifier: float = 1.0, construction_delay_months: int = 0,
                 start: Optional[datetime] = None) -> tuple[List[Dict], Dict]:
    start = start or _now()
    construction_cost = project_inputs["construction_cost_total"]
    operating = project_inputs["operating_costs_monthly"]
    target_absorption = max(project_inputs["target_absorption_months"], 1)
    confirmed = pipeline_inputs["confirmed_revenue"] * price_modifier
    pipeline_value = pipeline_inputs["pipeline_value_weighted"] * price_modifier

    # Distribute confirmed inflow lineally over construction window.
    confirmed_monthly = int(confirmed / max(horizon, 1)) if confirmed else 0

    series: List[Dict] = []
    cumulative = 0
    biggest_gap = None
    breakeven_month = None
    gap_count = 0
    max_neg = 0
    total_inflow = 0
    total_outflow = 0

    # Milestones may be delayed
    delayed_milestones = [
        {"month": m["month"] + construction_delay_months, "pct": m["pct_construction_paid"]}
        for m in project_inputs["construction_milestones"]
    ]

    for m in range(1, horizon + 1):
        # Pipeline inflow with decay, scaled by absorption modifier
        decay = _decay_factor(m) * absorption_modifier
        inflow_pipeline = int((pipeline_value / target_absorption) * decay)
        inflow_total = confirmed_monthly + inflow_pipeline

        # Construction: pay only at milestone months
        outflow_construction = 0
        for mile in delayed_milestones:
            if mile["month"] == m:
                outflow_construction = int(construction_cost * mile["pct"])
                break
        outflow_operating = operating
        outflow_total = outflow_construction + outflow_operating

        monthly_balance = inflow_total - outflow_total
        cumulative += monthly_balance
        total_inflow += inflow_total
        total_outflow += outflow_total
        max_neg = min(max_neg, cumulative)

        # Gap severity
        if cumulative >= 0:
            gap_severity = "none"
        elif cumulative >= GAP_THRESHOLDS["mild"]:
            gap_severity = "mild"
            gap_count += 1
        elif cumulative >= GAP_THRESHOLDS["moderate"]:
            gap_severity = "moderate"
            gap_count += 1
        else:
            gap_severity = "critical"
            gap_count += 1

        if breakeven_month is None and cumulative > 0 and m > 1:
            breakeven_month = m
        if cumulative < 0 and (biggest_gap is None or cumulative < biggest_gap["amount"]):
            biggest_gap = {"month": m, "amount": cumulative}

        series.append({
            "month": m,
            "label": _month_label(start, m),
            "inflow_confirmed": confirmed_monthly,
            "inflow_pipeline": inflow_pipeline,
            "inflow_total": inflow_total,
            "outflow_construction": outflow_construction,
            "outflow_operating": outflow_operating,
            "outflow_total": outflow_total,
            "monthly_balance": monthly_balance,
            "cumulative_balance": cumulative,
            "gap_severity": gap_severity,
        })

    summary = {
        "total_revenue_projected": total_inflow,
        "total_costs": total_outflow,
        "total_balance": total_inflow - total_outflow,
        "breakeven_month": breakeven_month,
        "biggest_gap": biggest_gap,
        "gap_count": gap_count,
        "max_negative_cumulative": max_neg,
    }
    return series, summary


# ─────────────────────────────────────────────────────────────────────────────
# Claude IA narratives + recommendations
# ─────────────────────────────────────────────────────────────────────────────
async def _claude_scenario_narrative(label: str, summary: Dict) -> str:
    fallback = (
        f"Escenario {label}: revenue ${summary['total_revenue_projected'] / 1_000_000:.1f}M, "
        f"balance ${summary['total_balance'] / 1_000_000:.1f}M, "
        f"breakeven mes {summary.get('breakeven_month') or 'fuera horizonte'}, "
        f"{summary['gap_count']} gaps detectados."
    )[:240]
    key = os.environ.get("EMERGENT_LLM_KEY", "")
    if not key:
        return fallback
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=key, session_id=f"cf_scn_{label}_{secrets.token_hex(3)}",
            system_message=(
                "Eres CFO consultor inmobiliario. Genera narrative 180-220 chars es-MX "
                "explicando el escenario. Tono ejecutivo, sin emojis, sin jerga."
            ),
        ).with_model("anthropic", "claude-haiku-4-5-20251001")
        prompt = (
            f"Escenario '{label}'. Revenue total ${summary['total_revenue_projected']:,}, "
            f"costos ${summary['total_costs']:,}, balance ${summary['total_balance']:,}, "
            f"breakeven mes {summary.get('breakeven_month')}, {summary['gap_count']} gaps. "
            f"Max negativo acumulado ${summary['max_negative_cumulative']:,}."
        )
        raw = await chat.send_message(UserMessage(text=prompt))
        return (raw or "").strip()[:240] or fallback
    except Exception as e:
        log.warning(f"[batch8] narrative {label} failed: {e}")
        return fallback


async def _claude_recommendations(*, base_summary: Dict, biggest_gap: Optional[Dict],
                                  pipeline_inputs: Dict, project_inputs: Dict) -> List[Dict]:
    """One Claude call returning 3-5 prioritized recommendations as JSON."""
    fallback: List[Dict] = []
    if base_summary["gap_count"] > 0:
        fallback.append({
            "priority": "critical" if base_summary["max_negative_cumulative"] < GAP_THRESHOLDS["moderate"] else "high",
            "category": "gap_mitigation",
            "title": "Lanza pre-venta dirigida con descuento limitado",
            "detail": f"Brecha máxima de ${abs(base_summary['max_negative_cumulative']):,} en mes {biggest_gap.get('month') if biggest_gap else 'n/a'}. Una pre-venta con 5-7% descuento por 6 unidades cubre el gap antes del hito 2.",
            "estimated_impact_mxn": int(abs(base_summary["max_negative_cumulative"]) * 0.6),
        })
    if pipeline_inputs["pipeline_value_weighted"] < project_inputs["construction_cost_total"] * 0.4:
        fallback.append({
            "priority": "high",
            "category": "pipeline_boost",
            "title": "Refuerza generación de leads con brokers boutique",
            "detail": "Pipeline ponderado <40% del costo construcción. Activa 2-3 brokers boutique con comisión escalonada para inyectar 12-18 leads calificados/mes.",
            "estimated_impact_mxn": project_inputs["target_price_avg_per_unit"] * 4,
        })
    fallback.append({
        "priority": "medium",
        "category": "cost_optimization",
        "title": "Renegocia hito 2 de construcción a 25%",
        "detail": "Bajar el % de pago en mes 6 de 30% a 25% libera $1-2M de presión de caja sin comprometer obra. Coordina con constructora.",
        "estimated_impact_mxn": int(project_inputs["construction_cost_total"] * 0.05),
    })
    fallback = fallback[:5]

    key = os.environ.get("EMERGENT_LLM_KEY", "")
    if not key:
        return fallback
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=key, session_id=f"cf_rec_{secrets.token_hex(3)}",
            system_message=(
                "Eres CFO consultor inmobiliario LATAM. Analiza forecast cash-flow y devuelve "
                "JSON array (sin markdown) con 3-5 recomendaciones priorizadas accionables. "
                "Schema cada item: {priority: 'critical'|'high'|'medium', "
                "category: 'gap_mitigation'|'pipeline_boost'|'cost_optimization'|'pricing_strategy', "
                "title: string ≤80 chars, detail: string ≤250 chars, "
                "estimated_impact_mxn: number|null}. "
                "Tono directo, accionable, español es-MX, sin jerga, sin emojis."
            ),
        ).with_model("anthropic", "claude-haiku-4-5-20251001")
        prompt = (
            f"Forecast (escenario base): revenue ${base_summary['total_revenue_projected']:,}, "
            f"costos ${base_summary['total_costs']:,}, balance ${base_summary['total_balance']:,}, "
            f"breakeven mes {base_summary.get('breakeven_month')}, {base_summary['gap_count']} gaps, "
            f"max negativo ${base_summary['max_negative_cumulative']:,}.\n"
            f"Pipeline: confirmed ${pipeline_inputs['confirmed_revenue']:,}, "
            f"pipeline_value_weighted ${pipeline_inputs['pipeline_value_weighted']:,}, "
            f"visitas {pipeline_inputs['visita_leads_count']}, propuestas {pipeline_inputs['propuesta_leads_count']}.\n"
            f"Project: total_units {project_inputs['total_units']}, "
            f"construction_cost ${project_inputs['construction_cost_total']:,}, "
            f"target_price_avg ${project_inputs['target_price_avg_per_unit']:,}."
        )
        raw = await chat.send_message(UserMessage(text=prompt))
        text = (raw or "").strip()
        if text.startswith("```"):
            text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.S).strip()
        items = json.loads(text)
        if isinstance(items, list) and items:
            cleaned = []
            for it in items[:5]:
                cleaned.append({
                    "priority": str(it.get("priority", "medium"))[:20],
                    "category": str(it.get("category", "gap_mitigation"))[:30],
                    "title": str(it.get("title", ""))[:80],
                    "detail": str(it.get("detail", ""))[:250],
                    "estimated_impact_mxn": (int(it["estimated_impact_mxn"])
                                             if it.get("estimated_impact_mxn") not in (None, "")
                                             else None),
                    "generated_at": _now_iso(),
                })
            return cleaned
    except Exception as e:
        log.warning(f"[batch8] claude recs failed: {e}")
    for f in fallback:
        f["generated_at"] = _now_iso()
    return fallback


# ─────────────────────────────────────────────────────────────────────────────
# Recalc orchestrator
# ─────────────────────────────────────────────────────────────────────────────
async def _recalc_forecast(db, *, project_id: str, dev_org_id: str, user_id: str,
                           horizon_months: int) -> Dict:
    from data_developments import DEVELOPMENTS_BY_ID
    dev = DEVELOPMENTS_BY_ID.get(project_id)
    if not dev:
        raise HTTPException(404, f"Proyecto {project_id} no encontrado")

    project_inputs = _project_inputs_from_dev(dev, override={})
    pipeline_inputs = await _aggregate_leads(db, project_id, dev_org_id)

    # Base scenario series + summary
    base_series, base_summary = _build_series(
        project_inputs, pipeline_inputs, horizon=horizon_months,
        absorption_modifier=1.0, price_modifier=1.0, construction_delay_months=0,
    )
    # 3 scenarios
    scenarios = []
    scn_results = await asyncio.gather(*[
        _build_scenario_with_narrative(project_inputs, pipeline_inputs, label, defs, horizon_months)
        for label, defs in SCENARIO_DEFS.items()
    ])
    scenarios = list(scn_results)

    recommendations = await _claude_recommendations(
        base_summary=base_summary,
        biggest_gap=base_summary.get("biggest_gap"),
        pipeline_inputs=pipeline_inputs,
        project_inputs=project_inputs,
    )

    fid = _uid("cfcst")
    doc = {
        "id": fid,
        "dev_org_id": dev_org_id,
        "project_id": project_id,
        "project_name": dev.get("name"),
        "horizon_months": horizon_months,
        "project_inputs": project_inputs,
        "pipeline_inputs": pipeline_inputs,
        "series": base_series,
        "summary": base_summary,
        "scenarios": scenarios,
        "ai_recommendations": recommendations,
        "applied_recommendations": [],
        "last_calculated_at": _now_iso(),
        "calculated_by": user_id,
    }
    await db.cash_flow_forecasts.insert_one(doc)
    doc.pop("_id", None)
    return doc


async def _build_scenario_with_narrative(project_inputs, pipeline_inputs, label, defs, horizon):
    series, summary = _build_series(
        project_inputs, pipeline_inputs, horizon=horizon,
        absorption_modifier=defs["absorption_modifier"],
        price_modifier=defs["price_modifier"],
        construction_delay_months=defs["construction_delay_months"],
    )
    narrative = await _claude_scenario_narrative(label, summary)
    return {
        "label": label,
        "assumptions": defs,
        "summary": summary,
        "series": series,
        "narrative": narrative,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────────────────────
class RecalcPayload(BaseModel):
    horizon_months: Optional[int] = Field(default=DEFAULT_HORIZON, ge=12, le=MAX_HORIZON)


@router.post("/api/dev/projects/{project_id}/cash-flow/recalc")
async def recalc(project_id: str, request: Request, payload: Optional[RecalcPayload] = None):
    user = await _auth(request)
    if not _is_admin_only(user):
        raise HTTPException(403, "Solo developer_admin / superadmin pueden recalcular")
    db = _db(request)
    org = getattr(user, "tenant_id", None) or "default"
    horizon = (payload.horizon_months if payload else DEFAULT_HORIZON) or DEFAULT_HORIZON
    doc = await _recalc_forecast(
        db, project_id=project_id, dev_org_id=org,
        user_id=getattr(user, "user_id", None) or "system",
        horizon_months=horizon,
    )
    await _safe_audit_ml(
        db, user, action="recalc", entity_type="cash_flow_forecast", entity_id=doc["id"],
        request=request, ml_event="cash_flow_recalculated",
        ml_context={"project_id": project_id, "horizon": horizon,
                    "gap_count": doc["summary"]["gap_count"]},
    )
    return {
        "forecast_id": doc["id"],
        "summary": doc["summary"],
        "gap_count": doc["summary"]["gap_count"],
        "recommendation_count": len(doc["ai_recommendations"]),
        "scenario_count": len(doc["scenarios"]),
    }


async def _latest_forecast(db, project_id: str, org: str, allow_any_org: bool):
    q: Dict[str, Any] = {"project_id": project_id}
    if not allow_any_org:
        q["dev_org_id"] = org
    return await db.cash_flow_forecasts.find_one(q, {"_id": 0}, sort=[("last_calculated_at", -1)])


@router.get("/api/dev/projects/{project_id}/cash-flow/current")
async def get_current(project_id: str, request: Request):
    user = await _auth(request)
    if not _is_admin(user):
        raise HTTPException(403, "Rol no autorizado")
    db = _db(request)
    org = getattr(user, "tenant_id", None) or "default"
    doc = await _latest_forecast(db, project_id, org, user.role == "superadmin")
    if not doc:
        raise HTTPException(404, "No hay forecast calculado para este proyecto. Ejecuta /recalc primero.")
    return doc


@router.get("/api/dev/projects/{project_id}/cash-flow/history")
async def get_history(project_id: str, request: Request, limit: int = 20):
    user = await _auth(request)
    if not _is_admin(user):
        raise HTTPException(403, "Rol no autorizado")
    db = _db(request)
    org = getattr(user, "tenant_id", None) or "default"
    q: Dict[str, Any] = {"project_id": project_id}
    if user.role != "superadmin":
        q["dev_org_id"] = org
    items = await db.cash_flow_forecasts.find(q, {"_id": 0, "series": 0, "scenarios": 0}) \
        .sort("last_calculated_at", -1).limit(min(limit, 50)).to_list(50)
    return {"items": items, "total": len(items)}


@router.get("/api/dev/projects/{project_id}/cash-flow/scenarios")
async def get_scenarios(project_id: str, request: Request):
    user = await _auth(request)
    if not _is_admin(user):
        raise HTTPException(403, "Rol no autorizado")
    db = _db(request)
    org = getattr(user, "tenant_id", None) or "default"
    doc = await _latest_forecast(db, project_id, org, user.role == "superadmin")
    if not doc:
        raise HTTPException(404, "No hay forecast")
    return {"scenarios": doc.get("scenarios") or []}


@router.get("/api/dev/projects/{project_id}/cash-flow/recommendations")
async def get_recs(project_id: str, request: Request):
    user = await _auth(request)
    if not _is_admin(user):
        raise HTTPException(403, "Rol no autorizado")
    db = _db(request)
    org = getattr(user, "tenant_id", None) or "default"
    doc = await _latest_forecast(db, project_id, org, user.role == "superadmin")
    if not doc:
        raise HTTPException(404, "No hay forecast")
    return {"recommendations": doc.get("ai_recommendations") or [],
            "applied": doc.get("applied_recommendations") or []}


class ApplyRecPayload(BaseModel):
    recommendation_index: int = Field(..., ge=0, le=10)
    note: Optional[str] = Field(default=None, max_length=240)


@router.post("/api/dev/projects/{project_id}/cash-flow/recommendations/apply")
async def apply_rec(project_id: str, request: Request, payload: ApplyRecPayload):
    user = await _auth(request)
    if not _is_admin_only(user):
        raise HTTPException(403, "Rol no autorizado")
    db = _db(request)
    org = getattr(user, "tenant_id", None) or "default"
    doc = await _latest_forecast(db, project_id, org, user.role == "superadmin")
    if not doc:
        raise HTTPException(404, "No hay forecast")
    recs = doc.get("ai_recommendations") or []
    if payload.recommendation_index >= len(recs):
        raise HTTPException(422, "Índice fuera de rango")
    rec = recs[payload.recommendation_index]
    applied_entry = {
        "recommendation_index": payload.recommendation_index,
        "title": rec.get("title"),
        "applied_at": _now_iso(),
        "applied_by": getattr(user, "user_id", None),
        "note": payload.note,
    }
    await db.cash_flow_forecasts.update_one(
        {"id": doc["id"]},
        {"$push": {"applied_recommendations": applied_entry}},
    )
    await _safe_audit_ml(
        db, user, action="apply_recommendation", entity_type="cash_flow_forecast",
        entity_id=doc["id"], request=request, ml_event="cash_flow_recommendation_applied",
        ml_context={"project_id": project_id, "rec_title": rec.get("title"),
                    "rec_priority": rec.get("priority"), "rec_category": rec.get("category")},
    )
    return {"ok": True, "applied": applied_entry}


# ─────────────────────────────────────────────────────────────────────────────
# PDF Export (investor-grade, reuses ReportLab patterns from B5/B7)
# ─────────────────────────────────────────────────────────────────────────────
def _build_cash_flow_pdf(doc: Dict) -> bytes:
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.colors import HexColor
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
    from reportlab.lib.units import inch
    from reportlab.lib import colors

    primary = HexColor("#06080F")
    cream = HexColor("#F0EBE0")
    buf = io.BytesIO()
    pdf = SimpleDocTemplate(buf, pagesize=letter, leftMargin=0.6 * inch, rightMargin=0.6 * inch,
                            topMargin=0.6 * inch, bottomMargin=0.6 * inch)
    styles = getSampleStyleSheet()
    eyebrow = ParagraphStyle("eyebrow", parent=styles["Normal"], textColor=colors.grey,
                             fontSize=9, fontName="Helvetica-Bold", spaceAfter=4)
    h1 = ParagraphStyle("H1", parent=styles["Heading1"], fontSize=24, leading=28,
                        textColor=primary, fontName="Helvetica-Bold", spaceAfter=10)
    h2 = ParagraphStyle("H2", parent=styles["Heading2"], fontSize=14, leading=18,
                        textColor=primary, fontName="Helvetica-Bold", spaceAfter=8)
    body = ParagraphStyle("Body", parent=styles["BodyText"], fontSize=10, leading=14,
                          textColor=colors.black, spaceAfter=6)
    small = ParagraphStyle("Small", parent=styles["Normal"], fontSize=8,
                           textColor=colors.grey, spaceAfter=4)

    summary = doc.get("summary") or {}
    project_inputs = doc.get("project_inputs") or {}
    story: List = []

    # Cover
    story.append(Paragraph("DESARROLLOSMX · CASH FLOW FORECAST", eyebrow))
    story.append(Paragraph(f"Proyecto · {doc.get('project_name', doc.get('project_id'))}", h1))
    story.append(Paragraph(f"Generado: {doc.get('last_calculated_at', '')[:19]} · Horizonte: "
                           f"{doc.get('horizon_months')} meses", small))
    story.append(Spacer(1, 0.18 * inch))

    # Executive summary
    story.append(Paragraph("RESUMEN EJECUTIVO", eyebrow))
    rows = [
        ["Revenue total proyectado", f"${summary.get('total_revenue_projected', 0):,} MXN"],
        ["Costos totales", f"${summary.get('total_costs', 0):,} MXN"],
        ["Balance neto", f"${summary.get('total_balance', 0):,} MXN"],
        ["Breakeven", (f"Mes {summary['breakeven_month']}" if summary.get("breakeven_month")
                      else "Fuera del horizonte")],
        ["Gaps detectados", str(summary.get("gap_count", 0))],
        ["Max negativo acumulado", f"${summary.get('max_negative_cumulative', 0):,} MXN"],
        ["Total unidades", f"{project_inputs.get('total_units', 0)}"],
        ["Costo construcción", f"${project_inputs.get('construction_cost_total', 0):,} MXN"],
    ]
    t = Table(rows, colWidths=[2.6 * inch, 4.2 * inch])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), cream),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("BOX", (0, 0), (-1, -1), 0.4, colors.grey),
        ("INNERGRID", (0, 0), (-1, -1), 0.2, colors.lightgrey),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(t)
    story.append(Spacer(1, 0.2 * inch))

    # Monthly table (horizon_months rows)
    story.append(Paragraph("DESGLOSE MENSUAL", eyebrow))
    series = doc.get("series") or []
    mt = [["Mes", "Inflow", "Outflow", "Balance", "Acumulado", "Severidad"]]
    for s in series:
        mt.append([
            str(s["month"]),
            f"${s['inflow_total']:,}",
            f"${s['outflow_total']:,}",
            f"${s['monthly_balance']:,}",
            f"${s['cumulative_balance']:,}",
            s["gap_severity"],
        ])
    rt = Table(mt, colWidths=[0.55 * inch, 1.4 * inch, 1.4 * inch, 1.3 * inch, 1.3 * inch, 0.95 * inch])
    rt.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), primary),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("BOX", (0, 0), (-1, -1), 0.4, colors.grey),
        ("INNERGRID", (0, 0), (-1, -1), 0.2, colors.lightgrey),
        ("ALIGN", (1, 1), (-2, -1), "RIGHT"),
    ]))
    story.append(rt)
    story.append(PageBreak())

    # Scenarios comparison
    story.append(Paragraph("ESCENARIOS · SENSITIVITY", eyebrow))
    for scn in doc.get("scenarios") or []:
        story.append(Paragraph(f"• {scn['label'].upper()}", h2))
        s = scn.get("summary") or {}
        story.append(Paragraph(
            f"Revenue ${s.get('total_revenue_projected', 0):,} · "
            f"Balance ${s.get('total_balance', 0):,} · "
            f"Breakeven mes {s.get('breakeven_month') or 'fuera horizonte'} · "
            f"Gaps: {s.get('gap_count', 0)}.", body))
        story.append(Paragraph(scn.get("narrative", "—"), body))
        story.append(Spacer(1, 0.1 * inch))

    # Recommendations
    story.append(Paragraph("RECOMENDACIONES IA · CLAUDE HAIKU", eyebrow))
    for r in doc.get("ai_recommendations") or []:
        story.append(Paragraph(f"<b>[{r.get('priority', '').upper()}]</b> "
                               f"{r.get('title', '')}", body))
        story.append(Paragraph(r.get("detail", ""), small))
        if r.get("estimated_impact_mxn"):
            story.append(Paragraph(f"Impacto estimado: ${r['estimated_impact_mxn']:,} MXN", small))
        story.append(Spacer(1, 0.06 * inch))

    story.append(Spacer(1, 0.2 * inch))
    story.append(Paragraph(
        "Estimaciones basadas en pipeline actual + benchmarks construcción LATAM. "
        "Recalcula cuando agregues nuevos leads o actualices costos.", small))
    story.append(Paragraph("Generado por DesarrollosMX · Cash Flow Forecast IA · Claude haiku-4-5",
                           small))
    pdf.build(story)
    return buf.getvalue()


@router.post("/api/dev/projects/{project_id}/cash-flow/export-pdf")
async def export_pdf(project_id: str, request: Request):
    user = await _auth(request)
    if not _is_admin_only(user):
        raise HTTPException(403, "Solo developer_admin / superadmin")
    db = _db(request)
    org = getattr(user, "tenant_id", None) or "default"
    doc = await _latest_forecast(db, project_id, org, user.role == "superadmin")
    if not doc:
        raise HTTPException(404, "No hay forecast. Ejecuta /recalc primero.")
    pdf_bytes = _build_cash_flow_pdf(doc)
    file_id = _uid("cfpdf")
    await db.cash_flow_files.insert_one({
        "id": file_id, "forecast_id": doc["id"], "project_id": project_id,
        "dev_org_id": org, "size_bytes": len(pdf_bytes),
        "pdf_b64": base64.b64encode(pdf_bytes).decode("ascii"),
        "created_at": _now_iso(),
    })
    await _safe_audit_ml(
        db, user, action="export", entity_type="cash_flow_forecast", entity_id=doc["id"],
        request=request, ml_event="cash_flow_pdf_exported",
        ml_context={"project_id": project_id, "file_id": file_id,
                    "size_kb": round(len(pdf_bytes) / 1024, 1)},
    )
    return {"file_id": file_id, "size_kb": round(len(pdf_bytes) / 1024, 1),
            "download_url": f"/api/dev/projects/{project_id}/cash-flow/files/{file_id}"}


@router.get("/api/dev/projects/{project_id}/cash-flow/files/{file_id}")
async def download_pdf(project_id: str, file_id: str, request: Request):
    user = await _auth(request)
    if not _is_admin(user):
        raise HTTPException(403, "Rol no autorizado")
    from fastapi.responses import Response
    db = _db(request)
    org = getattr(user, "tenant_id", None) or "default"
    q: Dict[str, Any] = {"id": file_id, "project_id": project_id}
    if user.role != "superadmin":
        q["dev_org_id"] = org
    f = await db.cash_flow_files.find_one(q, {"_id": 0})
    if not f:
        raise HTTPException(404, "Archivo no encontrado")
    pdf = base64.b64decode(f["pdf_b64"])
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="cash-flow-{file_id}.pdf"'})


# ─────────────────────────────────────────────────────────────────────────────
# Scheduler — daily 6am recalc for active projects (silent)
# ─────────────────────────────────────────────────────────────────────────────
async def daily_active_projects_recalc(db, app) -> Dict:
    """Cron job entry point. Called from scheduler_ie at 6am."""
    from data_developments import DEVELOPMENTS
    cutoff = (_now() - timedelta(hours=24)).isoformat()
    recalced = []
    skipped = []
    for dev in DEVELOPMENTS:
        if dev.get("stage") not in ("preventa", "en_construccion"):
            skipped.append(dev["id"])
            continue
        last = await db.cash_flow_forecasts.find_one(
            {"project_id": dev["id"]}, sort=[("last_calculated_at", -1)],
            projection={"_id": 0, "last_calculated_at": 1, "dev_org_id": 1},
        )
        org = (last or {}).get("dev_org_id", "default")
        if last and last.get("last_calculated_at", "") > cutoff:
            skipped.append(dev["id"])
            continue
        try:
            await _recalc_forecast(
                db, project_id=dev["id"], dev_org_id=org,
                user_id="cron_daily", horizon_months=DEFAULT_HORIZON,
            )
            recalced.append(dev["id"])
        except Exception as e:
            log.warning(f"[batch8 cron] recalc {dev['id']} failed: {e}")
    return {"recalced": recalced, "skipped": skipped, "total": len(recalced)}


# ─────────────────────────────────────────────────────────────────────────────
# Indexes
# ─────────────────────────────────────────────────────────────────────────────
async def ensure_batch8_indexes(db) -> None:
    try:
        await db.cash_flow_forecasts.create_index([("id", 1)], unique=True, background=True)
        await db.cash_flow_forecasts.create_index(
            [("dev_org_id", 1), ("project_id", 1), ("last_calculated_at", -1)], background=True,
        )
        await db.cash_flow_files.create_index([("id", 1)], unique=True, background=True)
        await db.cash_flow_files.create_index([("project_id", 1), ("created_at", -1)], background=True)
    except Exception:
        pass
    log.info("[batch8] indexes ensured")
