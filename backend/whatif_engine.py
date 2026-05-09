"""W4.4D — Phase Y.1D · What-if Simulator Engine.

4 escenarios soportados:
  • price_change → cambio de precio/m² + horizonte (3/6/12 meses)
  • promo → descuento / regalo / financiamiento + duración semanas
  • delay → retraso en entrega (1-12 meses)
  • mix → ejecuta múltiples y combina deltas

Multi-tenant safety: org_id obligatorio. Phase Y master switch + tier ≥ T1.
Caps diarios: T1=100/día/org · T2=500 · T3+=ilimitado.
Persistencia en db.whatif_scenarios.

Si no hay data suficiente (comparables=0, behavioral_events<50), fallback a
benchmark sectorial conservador y confidence band ampliado.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.whatif")


# ─── Constants ────────────────────────────────────────────────────────────────
SCENARIO_TYPES = {"price_change", "promo", "delay", "mix"}

DAILY_CAPS_BY_TIER = {"off": 0, "T1": 100, "T2": 500, "T3": None, "T4": None}

# Benchmark sectorial LATAM real estate (fallback cuando no hay data)
BENCHMARK = {
    "price_elasticity_per_pct": -0.6,   # cada +1% precio → -0.6% velocidad
    "promo_lift_per_pct_discount": 1.4,  # cada 1% descuento → +1.4% conversión
    "promo_finance_lift": 18.0,          # financiamiento sin enganche → +18%
    "promo_gift_lift": 6.0,              # regalo (mueble, escritura) → +6%
    "monthly_holding_cost_pct": 0.012,   # 1.2% del valor anual del proyecto/mes
    "monthly_drpi_decay": -0.4,          # cada mes de retraso → -0.4 puntos DRPI
    "monthly_ie_score_decay": -0.6,      # cada mes → -0.6 IE_PROY
}


# ─── Custom errors ────────────────────────────────────────────────────────────
class PhaseYDisabledError(Exception):
    """Phase Y master switch OFF o tier < T1."""


class WhatIfCapExceededError(Exception):
    """Cap diario de simulaciones del tier alcanzado."""


class WhatIfInputError(Exception):
    """Input inválido de simulación."""


# ─── Helpers ──────────────────────────────────────────────────────────────────
def _now() -> datetime:
    return datetime.now(timezone.utc)


def _scenario_id() -> str:
    return f"wif_{uuid.uuid4().hex[:16]}"


def _round(v: Optional[float], digits: int = 2) -> Optional[float]:
    if v is None:
        return None
    try:
        return round(float(v), digits)
    except Exception:
        return None


def _get_dev(project_id: str) -> Optional[Dict[str, Any]]:
    """Lookup en DEVELOPMENTS in-memory."""
    from data_developments import DEVELOPMENTS_BY_ID
    return DEVELOPMENTS_BY_ID.get(project_id)


def _project_avg_price_per_m2(dev: Dict[str, Any]) -> Optional[float]:
    """Estima precio/m² promedio del proyecto."""
    if not dev:
        return None
    pf = dev.get("price_from") or 0
    pt = dev.get("price_to") or pf
    m2_rng = dev.get("m2_range") or []
    if not m2_rng or len(m2_rng) != 2 or m2_rng[1] <= 0:
        return None
    avg_price = (pf + pt) / 2.0
    avg_m2 = (m2_rng[0] + m2_rng[1]) / 2.0
    return avg_price / avg_m2 if avg_m2 > 0 else None


def _confidence_band(point: float, sample_size: int) -> tuple[float, float]:
    """Banda de confianza ± basada en sample size: pocos datos → banda más ancha."""
    if sample_size <= 0:
        spread = abs(point) * 0.55 + 1.5
    elif sample_size < 5:
        spread = abs(point) * 0.40 + 1.0
    elif sample_size < 20:
        spread = abs(point) * 0.25 + 0.5
    else:
        spread = abs(point) * 0.15 + 0.25
    return (_round(point - spread), _round(point + spread))


# ─── Phase Y gating ───────────────────────────────────────────────────────────
async def _check_phase_y(db, org_id: str) -> Dict[str, Any]:
    """Lee phase_y_settings, valida master switch + tier whatif_simulator/diagnostic_engine.

    Returns settings dict. Raises PhaseYDisabledError si no aplica.
    """
    from routes_phase_y_controls import get_phase_y_settings
    settings = await get_phase_y_settings(db, org_id)
    if not settings.get("agentic_enabled", False):
        raise PhaseYDisabledError("Phase Y disabled by superadmin")

    tiers = settings.get("feature_tiers") or {}
    # Tier whatif_simulator (si existe) prevalece, sino fallback a diagnostic_engine
    tier = tiers.get("whatif_simulator") or tiers.get("diagnostic_engine", "off")
    if tier == "off":
        raise PhaseYDisabledError("What-if requires T1+ (current tier: off)")

    return {**settings, "_resolved_tier": tier}


async def _check_daily_cap(db, org_id: str, tier: str) -> int:
    """Cuenta simulaciones del día y bloquea si excede cap del tier."""
    cap = DAILY_CAPS_BY_TIER.get(tier)
    if cap is None:
        return 0  # ilimitado

    today_start = _now().replace(hour=0, minute=0, second=0, microsecond=0)
    used = await db.whatif_scenarios.count_documents({
        "org_id": org_id,
        "created_at": {"$gte": today_start},
        "deleted": {"$ne": True},
    })
    if used >= cap:
        raise WhatIfCapExceededError(
            f"Cap diario de simulaciones alcanzado ({used}/{cap}) para tier {tier}"
        )
    return used


# ─── Engine ───────────────────────────────────────────────────────────────────
class WhatIfEngine:
    def __init__(self, db, org_id: str, user_id: Optional[str] = None):
        self.db = db
        self.org_id = org_id
        self.user_id = user_id or "system"

    # ── PRICE CHANGE ─────────────────────────────────────────────────────────
    async def simulate_price_change(
        self,
        project_id: str,
        proposed_delta_pct: float,
        horizon_months: int = 6,
        current_price_per_m2: Optional[float] = None,
    ) -> Dict[str, Any]:
        if not project_id:
            raise WhatIfInputError("project_id requerido")
        if proposed_delta_pct < -50 or proposed_delta_pct > 50:
            raise WhatIfInputError("proposed_delta_pct fuera de rango (-50, +50)")
        if horizon_months not in (3, 6, 12):
            horizon_months = 6

        dev = _get_dev(project_id)
        base_price_m2 = current_price_per_m2 or _project_avg_price_per_m2(dev)

        # Comparables: otros desarrollos misma colonia
        comps_used: List[str] = []
        elasticity = BENCHMARK["price_elasticity_per_pct"]
        sample_size = 0
        if dev:
            from data_developments import DEVELOPMENTS
            same_colonia = [
                d for d in DEVELOPMENTS
                if d.get("colonia_id") == dev.get("colonia_id") and d["id"] != project_id
            ]
            comps_used = [d["id"] for d in same_colonia[:5]]
            sample_size = len(comps_used)
            # Si hay data histórica de price_history en colonia, usa para elasticidad
            if same_colonia:
                deltas: List[float] = []
                for d in same_colonia:
                    ph = d.get("price_history") or []
                    if len(ph) >= 2:
                        first = ph[0].get("price") or 0
                        last = ph[-1].get("price") or 0
                        if first > 0 and last > 0:
                            deltas.append((last - first) / first * 100.0)
                if deltas:
                    avg_delta = sum(deltas) / len(deltas)
                    if abs(avg_delta) > 0.5:
                        # Calibra elasticidad: si colonia subió X% y velocidad bajó Y, ratio
                        elasticity = max(-1.5, min(-0.2, BENCHMARK["price_elasticity_per_pct"] - abs(avg_delta) * 0.01))

        # Velocidad (% change) ≈ elasticity * delta_pct
        velocity_change_pct = elasticity * proposed_delta_pct

        # Revenue delta ≈ price_change * volume_change (simplified: 1+delta_p)*(1+delta_v)-1
        delta_p = proposed_delta_pct / 100.0
        delta_v = velocity_change_pct / 100.0
        revenue_delta_factor = (1 + delta_p) * (1 + delta_v) - 1
        units_total = (dev or {}).get("units_total") or (
            len((dev or {}).get("units") or []) if (dev or {}).get("units") else 50
        )
        if not units_total:
            units_total = 50
        pf = (dev or {}).get("price_from") or 0
        pt = (dev or {}).get("price_to") or pf
        avg_price = ((pf + pt) / 2.0) or 5_000_000
        baseline_revenue = avg_price * units_total
        revenue_delta_mxn = baseline_revenue * revenue_delta_factor * (horizon_months / 12.0)

        cl, ch = _confidence_band(velocity_change_pct, sample_size)

        # Recommendation
        if proposed_delta_pct > 3 and velocity_change_pct < -3:
            rec = (
                f"Subir el precio {proposed_delta_pct:+.1f}% reduce velocidad ~{velocity_change_pct:.1f}% "
                f"en {horizon_months}m. Considera promociones puntuales para compensar."
            )
        elif proposed_delta_pct < -3:
            rec = (
                f"Bajar precio {proposed_delta_pct:+.1f}% acelera ventas ~{abs(velocity_change_pct):.1f}% pero "
                f"reduce ingresos netos. Evalúa si el cash flow lo justifica."
            )
        else:
            rec = (
                f"Cambio de precio {proposed_delta_pct:+.1f}% impacto neutro a moderado en {horizon_months} meses."
            )

        return {
            "scenario_type": "price_change",
            "inputs": {
                "project_id": project_id,
                "proposed_delta_pct": proposed_delta_pct,
                "horizon_months": horizon_months,
                "current_price_per_m2": _round(base_price_m2),
            },
            "outputs": {
                "projected_velocity_change_pct": _round(velocity_change_pct),
                "projected_revenue_delta_mxn": _round(revenue_delta_mxn, 0),
                "confidence_low": cl,
                "confidence_high": ch,
                "comparables_used": comps_used,
                "elasticity_used": _round(elasticity, 3),
                "recommendation_text": rec,
                "data_quality": "high" if sample_size >= 5 else ("medium" if sample_size >= 1 else "low"),
            },
            "base_metrics": {
                "baseline_avg_price_mxn": _round(avg_price, 0),
                "units_total": units_total,
                "baseline_revenue_mxn": _round(baseline_revenue, 0),
                "comparables_in_sample": sample_size,
            },
        }

    # ── PROMO ────────────────────────────────────────────────────────────────
    async def simulate_promo(
        self,
        project_id: str,
        promo_type: str,
        promo_value: float,
        duration_weeks: int,
    ) -> Dict[str, Any]:
        if not project_id:
            raise WhatIfInputError("project_id requerido")
        if promo_type not in ("discount", "gift", "financing"):
            raise WhatIfInputError("promo_type debe ser discount|gift|financing")
        if duration_weeks < 1 or duration_weeks > 52:
            raise WhatIfInputError("duration_weeks fuera de rango (1, 52)")

        dev = _get_dev(project_id)

        # Behavioral events últimos 90d para estimar baseline conversion
        since = _now() - timedelta(days=90)
        beh_q: Dict[str, Any] = {
            "org_id": self.org_id,
            "timestamp": {"$gte": since},
            "$or": [
                {"metadata.project_id": project_id},
                {"page": {"$regex": project_id}},
            ],
        }
        try:
            total_events = await self.db.behavioral_events.count_documents(beh_q)
        except Exception:
            total_events = 0

        try:
            high_intent = await self.db.behavioral_events.count_documents({
                **beh_q, "metadata.tier": "high_intent",
            })
        except Exception:
            high_intent = 0

        # Lift estimate
        if promo_type == "discount":
            lift_pct = BENCHMARK["promo_lift_per_pct_discount"] * promo_value
        elif promo_type == "financing":
            lift_pct = BENCHMARK["promo_finance_lift"] + (promo_value * 0.1)
        else:  # gift
            lift_pct = BENCHMARK["promo_gift_lift"] + (promo_value * 1e-6)

        # Sample size determines confidence
        if total_events < 50:
            data_quality = "low"
            sample = total_events
            # Reduce magnitud por low confidence (regression toward mean)
            lift_pct *= 0.75
        elif total_events < 200:
            data_quality = "medium"
            sample = high_intent
            lift_pct *= 0.9
        else:
            data_quality = "high"
            sample = high_intent

        # Convert lift to leads/closes deltas
        baseline_leads_per_week = max(2, total_events / 12.0) if total_events else 4
        projected_leads_delta = baseline_leads_per_week * (lift_pct / 100.0) * duration_weeks
        baseline_close_rate = 0.04 if data_quality != "high" else max(0.04, high_intent / max(total_events, 1) * 0.10)
        projected_close_delta = projected_leads_delta * baseline_close_rate

        # Revenue delta
        pf = (dev or {}).get("price_from") or 0
        pt = (dev or {}).get("price_to") or pf
        avg_price = ((pf + pt) / 2.0) or 5_000_000
        # Discount comeria del avg_price per close
        discount_cost = 0.0
        if promo_type == "discount":
            discount_cost = avg_price * (promo_value / 100.0)
        elif promo_type == "gift":
            discount_cost = promo_value
        elif promo_type == "financing":
            discount_cost = avg_price * 0.015  # costo financiero ~1.5%
        revenue_delta_mxn = (projected_close_delta * (avg_price - discount_cost))

        cl, ch = _confidence_band(lift_pct, sample)

        if lift_pct > 25:
            rec = (
                f"Promo {promo_type} ({promo_value}{'%' if promo_type=='discount' else ''}) "
                f"genera lift estimado +{lift_pct:.1f}% durante {duration_weeks} semanas. "
                f"Recomendación: ejecutar con tracking diario de conversión."
            )
        elif lift_pct > 10:
            rec = (
                f"Lift moderado +{lift_pct:.1f}%. Justificable si CAC actual es alto. "
                f"Acompaña con campaña pagada para amplificar."
            )
        else:
            rec = (
                f"Lift bajo +{lift_pct:.1f}%. Evalúa si la promo compensa el costo de oportunidad."
            )

        return {
            "scenario_type": "promo",
            "inputs": {
                "project_id": project_id,
                "promo_type": promo_type,
                "promo_value": promo_value,
                "duration_weeks": duration_weeks,
            },
            "outputs": {
                "projected_lift_pct": _round(lift_pct),
                "projected_leads_delta": _round(projected_leads_delta, 1),
                "projected_close_delta": _round(projected_close_delta, 2),
                "projected_revenue_delta_mxn": _round(revenue_delta_mxn, 0),
                "confidence_low": cl,
                "confidence_high": ch,
                "comparables_used": [],
                "recommendation_text": rec,
                "data_quality": data_quality,
            },
            "base_metrics": {
                "behavioral_events_90d": total_events,
                "high_intent_events_90d": high_intent,
                "baseline_leads_per_week": _round(baseline_leads_per_week, 1),
                "estimated_close_rate": _round(baseline_close_rate, 3),
                "avg_price_mxn": _round(avg_price, 0),
                "discount_cost_per_close_mxn": _round(discount_cost, 0),
            },
        }

    # ── DELAY ────────────────────────────────────────────────────────────────
    async def simulate_delay(
        self,
        project_id: str,
        delay_months: int,
    ) -> Dict[str, Any]:
        if not project_id:
            raise WhatIfInputError("project_id requerido")
        if delay_months < 1 or delay_months > 12:
            raise WhatIfInputError("delay_months fuera de rango (1, 12)")

        dev = _get_dev(project_id)

        # Trae IE_PROY actuales del proyecto
        ie_docs = await self.db.ie_scores.find(
            {"zone_id": project_id, "code": {"$regex": "^IE_PROY_"}},
            {"_id": 0, "code": 1, "value": 1, "tier": 1},
        ).to_list(length=20)
        ie_values = [(d.get("value") or 0) for d in ie_docs]
        current_ie = (sum(ie_values) / len(ie_values)) if ie_values else 50.0
        sample_size = len(ie_docs)

        # Decay simple
        ie_score_delta = BENCHMARK["monthly_ie_score_decay"] * delay_months
        drpi_change = BENCHMARK["monthly_drpi_decay"] * delay_months

        # Holding cost: 1.2% del valor del proyecto / mes durante el retraso
        pf = (dev or {}).get("price_from") or 0
        pt = (dev or {}).get("price_to") or pf
        avg_price = ((pf + pt) / 2.0) or 5_000_000
        units_total = (dev or {}).get("units_total") or 50
        proj_value = avg_price * units_total
        holding_cost_mxn = proj_value * BENCHMARK["monthly_holding_cost_pct"] * delay_months

        cl, ch = _confidence_band(ie_score_delta, sample_size)

        rec = (
            f"Retraso de {delay_months} meses · IE_PROY ~{ie_score_delta:+.1f} · "
            f"DRPI ~{drpi_change:+.1f} · holding cost MXN {holding_cost_mxn:,.0f}. "
        )
        if delay_months >= 6:
            rec += "Considera revisar GANTT y publicar update transparente a leads activos."
        elif delay_months >= 3:
            rec += "Comunica preventivamente y refuerza upsell de unidades de mayor margen."
        else:
            rec += "Impacto bajo. Ajuste menor en marketing."

        return {
            "scenario_type": "delay",
            "inputs": {
                "project_id": project_id,
                "delay_months": delay_months,
            },
            "outputs": {
                "projected_ie_score_delta": _round(ie_score_delta),
                "projected_drpi_change": _round(drpi_change),
                "projected_holding_cost_mxn": _round(holding_cost_mxn, 0),
                "confidence_low": cl,
                "confidence_high": ch,
                "comparables_used": [],
                "recommendation_text": rec,
                "data_quality": "high" if sample_size >= 5 else ("medium" if sample_size >= 1 else "low"),
            },
            "base_metrics": {
                "current_ie_avg": _round(current_ie),
                "ie_components_sample": sample_size,
                "project_value_mxn": _round(proj_value, 0),
                "delivery_estimate": (dev or {}).get("delivery_estimate"),
            },
        }

    # ── MIX ──────────────────────────────────────────────────────────────────
    async def simulate_mix(
        self,
        project_id: str,
        scenarios: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        if not project_id:
            raise WhatIfInputError("project_id requerido")
        if not scenarios or not isinstance(scenarios, list):
            raise WhatIfInputError("scenarios debe ser lista no vacía")
        if len(scenarios) > 5:
            raise WhatIfInputError("máximo 5 escenarios en un mix")

        sub_results: List[Dict[str, Any]] = []
        revenue_delta_total = 0.0
        cl_intersect: Optional[float] = None
        ch_intersect: Optional[float] = None
        recs: List[str] = []

        for sc in scenarios:
            stype = sc.get("type")
            params = sc.get("params") or {}
            if stype == "price_change":
                res = await self.simulate_price_change(
                    project_id=project_id,
                    proposed_delta_pct=float(params.get("proposed_delta_pct", 0)),
                    horizon_months=int(params.get("horizon_months", 6)),
                    current_price_per_m2=params.get("current_price_per_m2"),
                )
            elif stype == "promo":
                res = await self.simulate_promo(
                    project_id=project_id,
                    promo_type=params.get("promo_type", "discount"),
                    promo_value=float(params.get("promo_value", 0)),
                    duration_weeks=int(params.get("duration_weeks", 4)),
                )
            elif stype == "delay":
                res = await self.simulate_delay(
                    project_id=project_id,
                    delay_months=int(params.get("delay_months", 1)),
                )
            else:
                continue
            sub_results.append(res)
            outs = res["outputs"]
            revenue_delta_total += outs.get("projected_revenue_delta_mxn") or 0
            recs.append(outs.get("recommendation_text", ""))
            cl = outs.get("confidence_low")
            ch = outs.get("confidence_high")
            if cl is not None and ch is not None:
                cl_intersect = cl if cl_intersect is None else max(cl_intersect, cl)
                ch_intersect = ch if ch_intersect is None else min(ch_intersect, ch)

        return {
            "scenario_type": "mix",
            "inputs": {
                "project_id": project_id,
                "scenarios": scenarios,
            },
            "outputs": {
                "projected_revenue_delta_mxn": _round(revenue_delta_total, 0),
                "confidence_low": _round(cl_intersect) if cl_intersect is not None else None,
                "confidence_high": _round(ch_intersect) if ch_intersect is not None else None,
                "comparables_used": [],
                "recommendation_text": " · ".join([r for r in recs if r])[:600],
                "sub_scenarios": sub_results,
                "data_quality": "mixed",
            },
            "base_metrics": {
                "scenarios_count": len(sub_results),
            },
        }

    # ── PERSIST ──────────────────────────────────────────────────────────────
    async def persist(
        self,
        scenario_result: Dict[str, Any],
        developer_id: Optional[str] = None,
        project_id: Optional[str] = None,
        simulated_flag: bool = False,
    ) -> str:
        sid = _scenario_id()
        now = _now()
        await self.db.whatif_scenarios.insert_one({
            "_id": sid,
            "org_id": self.org_id,
            "developer_id": developer_id or self.org_id,
            "project_id": project_id,
            "user_id": self.user_id,
            "scenario_type": scenario_result.get("scenario_type"),
            "inputs": scenario_result.get("inputs") or {},
            "outputs": {**(scenario_result.get("outputs") or {}), "simulated": simulated_flag},
            "base_metrics": scenario_result.get("base_metrics") or {},
            "simulated_at_tier": scenario_result.get("_tier_at_run"),
            "created_at": now,
            "deleted": False,
        })
        return sid


# ─── Public API ──────────────────────────────────────────────────────────────
async def run_simulation(
    db,
    org_id: str,
    user_id: str,
    project_id: str,
    scenario_type: str,
    inputs: Dict[str, Any],
    persist: bool = True,
) -> Dict[str, Any]:
    """Wrapper público con phase-y check, cap check y persistencia."""
    if scenario_type not in SCENARIO_TYPES:
        raise WhatIfInputError(f"scenario_type debe ser uno de {sorted(SCENARIO_TYPES)}")

    settings = await _check_phase_y(db, org_id)
    tier = settings.get("_resolved_tier", "off")
    sim_mode = bool(settings.get("simulation_mode", False))
    await _check_daily_cap(db, org_id, tier)

    engine = WhatIfEngine(db, org_id=org_id, user_id=user_id)

    if scenario_type == "price_change":
        result = await engine.simulate_price_change(
            project_id=project_id,
            proposed_delta_pct=float(inputs.get("proposed_delta_pct", 0)),
            horizon_months=int(inputs.get("horizon_months", 6)),
            current_price_per_m2=inputs.get("current_price_per_m2"),
        )
    elif scenario_type == "promo":
        result = await engine.simulate_promo(
            project_id=project_id,
            promo_type=inputs.get("promo_type", "discount"),
            promo_value=float(inputs.get("promo_value", 0)),
            duration_weeks=int(inputs.get("duration_weeks", 4)),
        )
    elif scenario_type == "delay":
        result = await engine.simulate_delay(
            project_id=project_id,
            delay_months=int(inputs.get("delay_months", 1)),
        )
    else:  # mix
        result = await engine.simulate_mix(
            project_id=project_id,
            scenarios=inputs.get("scenarios") or [],
        )

    result["_tier_at_run"] = tier

    scenario_id: Optional[str] = None
    if persist:
        dev = _get_dev(project_id)
        developer_id = (dev or {}).get("developer_id") or org_id
        scenario_id = await engine.persist(
            result,
            developer_id=developer_id,
            project_id=project_id,
            simulated_flag=sim_mode,
        )

    out = dict(result)
    out["scenario_id"] = scenario_id
    out["tier"] = tier
    out["simulation_mode"] = sim_mode
    out["outputs"]["simulated"] = sim_mode
    return out


# ─── Indexes ──────────────────────────────────────────────────────────────────
async def ensure_indexes(db) -> None:
    try:
        await db.whatif_scenarios.create_index(
            [("org_id", 1), ("created_at", -1)],
            name="idx_whatif_org_time", background=True,
        )
        await db.whatif_scenarios.create_index(
            [("developer_id", 1), ("scenario_type", 1), ("created_at", -1)],
            name="idx_whatif_dev_type_time", background=True,
        )
        await db.whatif_scenarios.create_index(
            [("project_id", 1), ("created_at", -1)],
            name="idx_whatif_project_time", background=True,
        )
        log.info("[whatif] indexes OK")
    except Exception as exc:
        log.warning(f"[whatif] ensure_indexes failed: {exc}")
