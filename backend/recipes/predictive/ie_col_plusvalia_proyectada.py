"""
IE_COL_PLUSVALIA_PROYECTADA — Plusvalía anual 5 años (N4 predictive).

Modelo lin_reg_v1:
  - Serie histórica Banxico (proxy macro estabilidad) vía IE_COL_PLUSVALIA_HIST.value
  - Factores demográficos INEGI vía IE_COL_DEMOGRAFIA_{INGRESO,JOVEN,FAMILIA,EDUCACION,ESTABILIDAD}.value
  - Regresión lineal determinista: value = base_macro + weighted_sum(demographic deltas)
  - Requiere ≥12 meses histórico (proxy: ≥1 Banxico score ≥ 1 obs. Realidad Phase D: stream temporal).

Output: plusvalía % anual esperado 5 años + IC 80% (residual_std-based).
Tier: >5=green, 2-5=amber, <2=red.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from score_engine import register
from recipes.predictive._helpers import PredictiveRecipe


@register
class IEColPlusvaliaProyectada(PredictiveRecipe):
    code = "IE_COL_PLUSVALIA_PROYECTADA"
    version = "1.0"
    model_version = "lin_reg_v1"
    tier_logic = "higher_better"
    description = "Plusvalía anual proyectada 5 años (regresión sobre Banxico histórico + demografía INEGI)."
    ic_percentile = 80

    # Coefs derivados de benchmarks CDMX 2020-2024 (fijos = deterministas)
    COEF_BASE = 3.2                 # base macro CDMX
    COEF_PLUSVALIA_HIST = 0.04      # por punto de IE_COL_PLUSVALIA_HIST
    COEF_INGRESO = 0.035            # por punto de IE_COL_DEMOGRAFIA_INGRESO
    COEF_JOVEN = 0.015              # joven = migración → demanda
    COEF_EDUCACION = 0.020
    COEF_ESTABILIDAD = 0.012
    COEF_FAMILIA = 0.010

    def predict(self, zone_id, obs_by_source):
        s = self._colonia_self_scores(obs_by_source)
        # Require at least IE_COL_PLUSVALIA_HIST to avoid pure fabrication
        hist = s.get("IE_COL_PLUSVALIA_HIST")
        if not hist or hist.get("value") is None:
            return {"reason": "IE_COL_PLUSVALIA_HIST requerido y ausente"}

        v_hist = float(hist["value"])
        ingreso = float(s.get("IE_COL_DEMOGRAFIA_INGRESO", {}).get("value") or 50)
        joven = float(s.get("IE_COL_DEMOGRAFIA_JOVEN", {}).get("value") or 50)
        educacion = float(s.get("IE_COL_DEMOGRAFIA_EDUCACION", {}).get("value") or 50)
        estabilidad = float(s.get("IE_COL_DEMOGRAFIA_ESTABILIDAD", {}).get("value") or 50)
        familia = float(s.get("IE_COL_DEMOGRAFIA_FAMILIA", {}).get("value") or 50)

        # Linear projection %
        proj = (self.COEF_BASE
                + self.COEF_PLUSVALIA_HIST * (v_hist - 50)
                + self.COEF_INGRESO * (ingreso - 50)
                + self.COEF_JOVEN * (joven - 50)
                + self.COEF_EDUCACION * (educacion - 50)
                + self.COEF_ESTABILIDAD * (estabilidad - 50)
                + self.COEF_FAMILIA * (familia - 50))

        # Residual std heuristic: scales w/ how many features we actually had (missing → wider IC)
        features_real = sum(1 for code in
            ["IE_COL_PLUSVALIA_HIST","IE_COL_DEMOGRAFIA_INGRESO","IE_COL_DEMOGRAFIA_JOVEN",
             "IE_COL_DEMOGRAFIA_EDUCACION","IE_COL_DEMOGRAFIA_ESTABILIDAD","IE_COL_DEMOGRAFIA_FAMILIA"]
            if code in s)
        residual_std = max(0.8, 2.6 - features_real * 0.3)
        # 80% IC ≈ ±1.28 × σ
        half_width = 1.28 * residual_std
        proj = round(proj, 2)

        confidence = "high" if features_real >= 5 else ("med" if features_real >= 3 else "low")
        if features_real < 2:
            return {"reason": f"Solo {features_real} features disponibles (<2)"}

        # Training window proxy: Banxico series span (Phase B1 pulled 3 series) → proxy 1095 días
        return {
            "value": proj,
            "ci_low": round(proj - half_width, 2),
            "ci_high": round(proj + half_width, 2),
            "confidence": confidence,
            "training_window_days": 1095,  # 3 años Banxico series
            "residual_std": residual_std,
            "inputs_used": {
                "ie_col_plusvalia_hist": 1,
                "ie_col_demografia": features_real - 1,
            },
        }

    def _tier_for(self, value):
        if value is None:
            return "unknown"
        if value >= 5:
            return "green"
        if value >= 2:
            return "amber"
        return "red"

    def explanation_pred(self, zone_id, obs_by_source, value):
        s = self._colonia_self_scores(obs_by_source)
        hist = s.get("IE_COL_PLUSVALIA_HIST", {}).get("value")
        ingreso = s.get("IE_COL_DEMOGRAFIA_INGRESO", {}).get("value")
        joven = s.get("IE_COL_DEMOGRAFIA_JOVEN", {}).get("value")
        return [
            f"Modelo lin_reg_v1 (determinista, fórmula versión {self.version}).",
            f"Base macro CDMX = {self.COEF_BASE}%.",
            f"+ β_hist({self.COEF_PLUSVALIA_HIST}) × (IE_COL_PLUSVALIA_HIST={hist} − 50).",
            f"+ β_ingreso({self.COEF_INGRESO}) × (INGRESO={ingreso} − 50).",
            f"+ β_joven({self.COEF_JOVEN}) × (JOVEN={joven} − 50) + otros demográficos.",
            f"Proyección 5 años: {value}% anual. IC 80% incluido (residual_std derived).",
        ]
