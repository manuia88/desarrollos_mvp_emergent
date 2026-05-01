"""
IE_COL_CLIMA_* — Climate risk scores (lower_better logic: alto riesgo = rojo).

- IE_COL_CLIMA_INUNDACION: Inundation risk from CENAPRED WFS layers + CONAGUA precipitation.
- IE_COL_CLIMA_SISMO: Seismic microzonification from Atlas Riesgos CDMX (manual upload) + CENAPRED.
- IE_COL_CLIMA_ISLA_CALOR: Urban heat island from NOAA + CONAGUA anomalies.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from score_engine import Recipe, ScoreResult, register
from recipes.colonia._helpers import SimpleHeuristicRecipe, DataPendingRecipe


@register
class IEColClimaInundacion(DataPendingRecipe):
    code = "IE_COL_CLIMA_INUNDACION"
    version = "0.1"
    dependencies = ["cenapred", "conagua_smn", "atlas_riesgos_cdmx"]
    tier_logic = "lower_better"
    description = "Riesgo inundación: capas CENAPRED + precipitación extrema."
    reason = "Phase B2 placeholder: espera capas WFS CENAPRED"


@register
class IEColClimaSismo(DataPendingRecipe):
    code = "IE_COL_CLIMA_SISMO"
    version = "0.1"
    dependencies = ["cenapred", "atlas_riesgos_cdmx"]
    tier_logic = "lower_better"
    description = "Riesgo sísmico: microzonificación geotécnica."
    reason = "Phase B2 placeholder: espera microzonas atlas"


@register
class IEColClimaIslaCalor(SimpleHeuristicRecipe):
    code = "IE_COL_CLIMA_ISLA_CALOR"
    version = "1.0"
    dependencies = ["noaa", "conagua_smn"]
    tier_logic = "lower_better"
    description = "Isla de calor: anomalía de TMAX + humedad relativa baja."
    min_observations = 3
    payload_extractors = {
        "noaa": lambda p: float(p["value"]) / 10.0
            if p.get("datatype") == "TMAX" and p.get("value") is not None else None,
        "conagua_smn": lambda p: p.get("humedad"),
    }

    def apply(self, values_by_source):
        tmax = values_by_source.get("noaa") or []
        humid = values_by_source.get("conagua_smn") or []
        if not tmax:
            return None
        mean_tmax = sum(tmax) / len(tmax)
        # Base 50 + every °C above CDMX TMAX mean (22°C) contributes 5 pts of heat island risk
        risk = 50.0 + max(0.0, (mean_tmax - 22.0)) * 5
        if humid:
            mean_h = sum(humid) / len(humid)
            # Low humidity amplifies heat retention (+1 pt risk per %RH below 50)
            risk += max(0.0, (50 - mean_h)) * 1
        return risk

    def explanation(self, values_by_source, value):
        tmax = values_by_source.get("noaa") or []
        humid = values_by_source.get("conagua_smn") or []
        return [
            f"Base riesgo = 50 (CDMX neutral)",
            f"TMAX media {sum(tmax)/len(tmax):.1f}°C · penalty {max(0.0,(sum(tmax)/len(tmax))-22.0)*5:.1f} pts" if tmax else "Sin TMAX",
            f"Humedad media {sum(humid)/len(humid):.1f}% · riesgo por aridez" if humid else "Sin humedad",
            f"Tier invertido (lower_better): value={value} → más bajo = mejor",
        ]
