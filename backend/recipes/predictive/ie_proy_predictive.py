"""
IE_PROY_DAYS_TO_SELLOUT & IE_PROY_ROI_BUYER — N4 predictive project recipes.

Both pure + deterministic + versioned.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from score_engine import register
from recipes.predictive._helpers import ProjectPredictiveRecipe


# ─── IE_PROY_DAYS_TO_SELLOUT ────────────────────────────────────────────────
@register
class IEProyDaysToSellout(ProjectPredictiveRecipe):
    code = "IE_PROY_DAYS_TO_SELLOUT"
    version = "1.0"
    model_version = "absorp_linreg_v1"
    tier_logic = "lower_better"
    description = "Días estimados para vender inventario restante (regresión sobre absorción + preventa + listing)."
    ic_percentile = 70

    # Assumed "launched N months ago" lookup — proxy: dev.progress as % construction.
    # v1: We use a fixed ramp-up (12-24 months depending on stage) to derive velocity.
    STAGE_RAMPUP_DAYS = {
        "preventa": 540,            # ~18 meses típico desde launch hasta delivery
        "en_construccion": 730,     # ya llevan más tiempo vendiendo
        "entrega_inmediata": 270,
        "exclusiva": 540,
    }

    def predict(self, zone_id, obs_by_source):
        dev = self._dev(obs_by_source)
        if not dev:
            return {"reason": "development not found"}
        ps = self._project_self_scores(obs_by_source)

        absorp = ps.get("IE_PROY_ABSORCION_VELOCIDAD")
        if not absorp or absorp.get("value") is None:
            return {"reason": "IE_PROY_ABSORCION_VELOCIDAD requerido"}
        absorbed_pct = float(absorp["value"])          # % unidades absorbidas (vendido+reservado)

        units = dev.get("units") or []
        total = len(units)
        if total == 0:
            return {"reason": "dev sin unidades"}
        available = sum(1 for u in units if u.get("status") == "disponible")
        if available == 0:
            return {"value": 0.0, "ci_low": 0, "ci_high": 0, "confidence": "high",
                    "training_window_days": 0, "residual_std": 0,
                    "inputs_used": {"units": total}}

        ramp = self.STAGE_RAMPUP_DAYS.get(dev.get("stage"), 540)
        units_absorbed = total - available
        if units_absorbed <= 0:
            return {"reason": "0 unidades absorbidas — sin velocidad histórica"}

        velocity_per_day = units_absorbed / ramp       # unidades/día
        base_days = available / velocity_per_day

        # Ajuste listing_health: boost si > 80, penalty si < 50
        lh = ps.get("IE_PROY_LISTING_HEALTH", {}).get("value") or 70
        lh_factor = 1.30 - 0.006 * lh  # 100 → 0.7; 50 → 1.0; 0 → 1.3
        days = base_days * lh_factor

        # IC 70%: ±20% si confidence high, ±35% si med, ±50% si low
        # Proxy confidence: high si absorbed_pct ≥ 40 (suficiente señal), med 15-39, low <15
        if absorbed_pct >= 40:
            confidence = "high"
            half_w = days * 0.20
        elif absorbed_pct >= 15:
            confidence = "med"
            half_w = days * 0.35
        else:
            confidence = "low"
            half_w = days * 0.50

        residual_std = half_w / 1.04  # 70% IC ≈ ±1.04 σ

        return {
            "value": round(days, 1),
            "ci_low": max(0.0, round(days - half_w, 1)),
            "ci_high": round(days + half_w, 1),
            "confidence": confidence,
            "training_window_days": ramp,
            "residual_std": residual_std,
            "inputs_used": {
                "units_total": total,
                "units_available": available,
                "absorption_score": 1,
                "listing_health_score": 1 if "IE_PROY_LISTING_HEALTH" in ps else 0,
            },
        }

    def _tier_for(self, value):
        if value is None:
            return "unknown"
        if value <= 180:
            return "green"
        if value <= 365:
            return "amber"
        return "red"

    def explanation_pred(self, zone_id, obs_by_source, value):
        dev = self._dev(obs_by_source)
        ps = self._project_self_scores(obs_by_source)
        absorp = ps.get("IE_PROY_ABSORCION_VELOCIDAD", {}).get("value")
        lh = ps.get("IE_PROY_LISTING_HEALTH", {}).get("value") or 70
        units = dev.get("units") or [] if dev else []
        available = sum(1 for u in units if u.get("status") == "disponible")
        return [
            f"Modelo absorp_linreg_v1 sobre {dev.get('name') if dev else '?'}.",
            f"Unidades disponibles: {available} / {len(units)}.",
            f"Absorción actual: {absorp}% (IE_PROY_ABSORCION_VELOCIDAD).",
            "Velocidad = absorbidas / rampup_stage = unidades/día.",
            f"Ajuste listing_health ({lh}): factor 1.30 − 0.006×lh.",
            f"Proyección: {value} días hasta sellout. IC 70% incluido.",
        ]


# ─── IE_PROY_ROI_BUYER ───────────────────────────────────────────────────────
@register
class IEProyRoiBuyer(ProjectPredictiveRecipe):
    code = "IE_PROY_ROI_BUYER"
    version = "1.0"
    model_version = "compound_v1"
    tier_logic = "higher_better"
    description = "ROI estimado 5 años para el comprador (plusvalía proyectada + renta neta − costos)."
    ic_percentile = 80
    # Consume AirROI indirectly via IE_COL_ROI_AIRBNB → that upstream recipe is_paid.
    # Our ROI_BUYER itself is NOT paid (reads stored scores). AirROI recipes are skipped on cron.
    is_paid = False

    TX_COSTS_PCT = 0.10              # notarial + ISR + comisión
    OPP_COST_ANNUAL = 0.085          # CETES 28d promedio 2024

    def predict(self, zone_id, obs_by_source):
        cs = self._project_colonia_scores(obs_by_source)
        proj = cs.get("IE_COL_PLUSVALIA_PROYECTADA")
        if not proj or proj.get("value") is None:
            return {"reason": "IE_COL_PLUSVALIA_PROYECTADA (colonia) requerido"}
        plusvalia_annual = float(proj["value"]) / 100.0  # a decimal

        # Renta Airbnb si el colonia score existe (puede ser stub si no allow_paid)
        airbnb = cs.get("IE_COL_ROI_AIRBNB", {}).get("value")
        airbnb_annual_pct = float(airbnb) / 100.0 * 0.5 if airbnb else 0.0  # conservador: 50% del AirROI score

        # Compound 5y
        appreciation_5y = (1 + plusvalia_annual) ** 5 - 1
        rent_5y = airbnb_annual_pct * 5 * 0.65  # neto tras vacancia + mantenimiento
        opp_5y = (1 + self.OPP_COST_ANNUAL) ** 5 - 1
        roi_5y = (appreciation_5y + rent_5y - self.TX_COSTS_PCT) - opp_5y
        roi_pct = roi_5y * 100

        # IC 80%: hereda incertidumbre de la plusvalía proyectada + buffer
        proj_ci = proj.get("confidence_interval") or {}
        proj_low = float(proj_ci.get("low") if proj_ci.get("low") is not None else proj["value"]) / 100.0
        proj_high = float(proj_ci.get("high") if proj_ci.get("high") is not None else proj["value"]) / 100.0

        roi_low = ((1 + proj_low) ** 5 - 1 + rent_5y - self.TX_COSTS_PCT - opp_5y) * 100
        roi_high = ((1 + proj_high) ** 5 - 1 + rent_5y - self.TX_COSTS_PCT - opp_5y) * 100

        confidence = proj.get("confidence", "med")
        if airbnb:
            # señal adicional refuerza
            if confidence == "med":
                confidence = "high"

        residual_std = (roi_high - roi_low) / (2 * 1.28)

        return {
            "value": round(roi_pct, 2),
            "ci_low": round(roi_low, 2),
            "ci_high": round(roi_high, 2),
            "confidence": confidence,
            "training_window_days": proj.get("training_window_days", 1095),
            "residual_std": residual_std,
            "inputs_used": {
                "ie_col_plusvalia_proyectada": 1,
                "ie_col_roi_airbnb": 1 if airbnb else 0,
            },
        }

    def _tier_for(self, value):
        if value is None:
            return "unknown"
        if value >= 40:
            return "green"
        if value >= 15:
            return "amber"
        return "red"

    def explanation_pred(self, zone_id, obs_by_source, value):
        cs = self._project_colonia_scores(obs_by_source)
        pl = cs.get("IE_COL_PLUSVALIA_PROYECTADA", {}).get("value")
        airbnb = cs.get("IE_COL_ROI_AIRBNB", {}).get("value")
        return [
            "Modelo compound_v1 (fórmula composición 5 años).",
            f"Plusvalía anual colonia (IE_COL_PLUSVALIA_PROYECTADA): {pl}%",
            f"Renta neta anual (AirROI ajustado 50% + vacancia 35%): {airbnb or 'no disponible'}",
            f"Appreciation 5y + rent 5y − tx_costs {int(self.TX_COSTS_PCT*100)}% − opp_cost ({int(self.OPP_COST_ANNUAL*100)}% CETES × 5).",
            f"ROI estimado 5 años: {value}%. IC 80% derivado de la IC de plusvalía proyectada.",
        ]
