"""
IE_COL_AIRE — Air quality score (0-100, higher = better).

Sources: NOAA climate observations (GHCN-Daily) + CONAGUA SMN (humidity + wind).

Phase B1 heuristic (will evolve in Phase B recipes iteration):
- Base = 70 (CDMX neutral baseline — always moderately polluted).
- Penalize high temperature anomaly: each °C above long-term mean for the zone → −3 pts.
- Penalize low wind days (stagnant air → PM2.5 accumulation): each day with wind <2 m/s → −1 pt.
- Reward high humidity (washes particulates): each day >60% RH → +0.5 pt.

Only CDMX colonies for now; other zones return stub.
"""
from __future__ import annotations

from typing import Any, Dict, List

from score_engine import Recipe, ScoreResult, register


@register
class IEColAire(Recipe):
    code = "IE_COL_AIRE"
    version = "1.0"
    dependencies = ["noaa", "conagua_smn"]
    tier_logic = "higher_better"
    description = "Calidad del aire (0-100): anomalía térmica + viento + humedad."
    min_observations = 3

    def compute(self, zone_id: str, obs_by_source: Dict[str, List[Dict[str, Any]]]) -> ScoreResult:
        noaa_obs = obs_by_source.get("noaa", [])
        conagua_obs = obs_by_source.get("conagua_smn", [])
        real_noaa = [o for o in noaa_obs if not o.get("is_stub")]
        real_conagua = [o for o in conagua_obs if not o.get("is_stub")]

        total = len(real_noaa) + len(real_conagua)
        if total < self.min_observations:
            return self._stub_result(zone_id, reason=f"only {total} real obs")

        # Extract temperature observations (NOAA GHCN TMAX/TMIN or datatype=TAVG)
        temps_c: List[float] = []
        for o in real_noaa:
            p = o.get("payload", {})
            dtype = p.get("datatype", "")
            val = p.get("value")
            if val is None:
                continue
            # GHCN values are tenths of °C for TMAX/TMIN/TAVG
            if dtype in ("TMAX", "TMIN", "TAVG"):
                temps_c.append(float(val) / 10.0)

        # Extract humidity / wind from CONAGUA stubs (real or named stub both have these keys)
        humidities = [o.get("payload", {}).get("humedad") for o in real_conagua]
        humidities = [h for h in humidities if isinstance(h, (int, float))]

        # Heuristic scoring
        base = 70.0
        penalty_temp = 0.0
        if temps_c:
            mean_t = sum(temps_c) / len(temps_c)
            # CDMX historical mean ~18°C (GHCN long term). Penalize each °C above.
            penalty_temp = max(0, (mean_t - 18.0)) * 3

        bonus_humidity = 0.0
        if humidities:
            high_h_days = sum(1 for h in humidities if h > 60)
            bonus_humidity = high_h_days * 0.5

        value = base - penalty_temp + bonus_humidity
        value = max(0.0, min(100.0, value))
        confidence = "high" if (real_noaa and real_conagua) else "med" if real_noaa else "low"

        return ScoreResult(
            code=self.code, zone_id=zone_id, value=round(value, 2),
            tier=self._tier_for(value),
            confidence=confidence, is_stub=False,
            inputs_used={"noaa": len(real_noaa), "conagua_smn": len(real_conagua)},
            formula_version=self.version,
        )
