"""
IE_COL_AIRE — Air quality score 0-100 (higher = better).
Source: NOAA GHCN-Daily + CONAGUA SMN.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from score_engine import Recipe, ScoreResult, register
from recipes.colonia._helpers import SimpleHeuristicRecipe


def _noaa_temp_tenths(payload: Dict[str, Any]) -> Optional[float]:
    if payload.get("datatype") in ("TMAX", "TMIN", "TAVG"):
        v = payload.get("value")
        return float(v) / 10.0 if v is not None else None
    return None


def _conagua_humidity(payload: Dict[str, Any]) -> Optional[float]:
    return payload.get("humedad")


@register
class IEColAire(SimpleHeuristicRecipe):
    code = "IE_COL_AIRE"
    version = "1.1"
    dependencies = ["noaa", "conagua_smn"]
    tier_logic = "higher_better"
    description = "Calidad del aire: anomalía térmica (NOAA) + humedad (CONAGUA)."
    min_observations = 3
    base = 70.0
    payload_extractors = {
        "noaa": _noaa_temp_tenths,
        "conagua_smn": _conagua_humidity,
    }

    def apply(self, values_by_source: Dict[str, List[float]]) -> Optional[float]:
        temps = values_by_source.get("noaa") or []
        humid = values_by_source.get("conagua_smn") or []
        penalty_temp = 0.0
        if temps:
            mean_t = sum(temps) / len(temps)
            penalty_temp = max(0.0, mean_t - 18.0) * 3
        bonus_h = sum(0.5 for h in humid if h > 60)
        return self.base - penalty_temp + bonus_h

    def explanation(self, values_by_source, value):
        temps = values_by_source.get("noaa") or []
        humid = values_by_source.get("conagua_smn") or []
        mean_t = sum(temps) / len(temps) if temps else None
        return [
            f"Base neutra CDMX = {self.base}",
            f"Penalty temperatura: max(0, {mean_t:.1f}°C − 18°C) × 3 pts" if mean_t is not None
                else "Penalty temperatura: sin obs NOAA",
            f"Bonus humedad: {sum(1 for h in humid if h > 60)} días > 60% RH × 0.5 pts",
            f"Clamp 0-100 → value={value}",
        ]
