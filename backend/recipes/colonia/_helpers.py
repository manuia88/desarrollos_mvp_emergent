"""
IE Engine — helpers compartidos por recipes de colonia.

Mantiene cada archivo de recipe corto (<50 líneas cuando se pueda).
Los helpers implementan los patrones repetidos: agregaciones simples sobre
ie_raw_observations, tiering estándar, y degradación limpia si faltan datos.
"""
from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional

from score_engine import Recipe, ScoreResult


class SimpleHeuristicRecipe(Recipe):
    """
    Recipes que tienen forma 'base + sum(deltas)'. Si faltan obs reales, degrada limpio.

    Subclasses must set:
      - code, version, dependencies, tier_logic, description
      - base: float (e.g., 70)
      - payload_extractors: Dict[source_id, Callable[payload] -> Optional[float]]
      - apply(values_by_source: Dict[source_id, List[float]]) -> Optional[float]
      - explanation(values_by_source, value) -> List[str]  (optional)
    """
    base: float = 70.0
    payload_extractors: Dict[str, Callable[[Dict[str, Any]], Optional[float]]] = {}

    def _real_values(self, obs_by_source: Dict[str, List[Dict[str, Any]]]) -> Dict[str, List[float]]:
        out: Dict[str, List[float]] = {}
        for sid, extractor in self.payload_extractors.items():
            values: List[float] = []
            for o in obs_by_source.get(sid, []):
                if o.get("is_stub"):
                    continue
                v = extractor(o.get("payload", {}))
                if v is not None:
                    try:
                        values.append(float(v))
                    except (TypeError, ValueError):
                        pass
            out[sid] = values
        return out

    def apply(self, values_by_source: Dict[str, List[float]]) -> Optional[float]:
        """Override me. Return the 0-100 score or None."""
        return None

    def explanation(self, values_by_source: Dict[str, List[float]], value: Optional[float]) -> List[str]:
        """Override me. Return human-readable operations list for /explain."""
        return [f"Fórmula v{self.version} aplicada sobre {sum(len(v) for v in values_by_source.values())} observaciones."]

    def compute(self, zone_id: str, obs_by_source: Dict[str, List[Dict[str, Any]]]) -> ScoreResult:
        values = self._real_values(obs_by_source)
        total_real = sum(len(v) for v in values.values())
        if total_real < self.min_observations:
            return self._stub_result(zone_id, reason=f"{total_real} obs reales")
        val = self.apply(values)
        if val is None:
            return self._stub_result(zone_id, reason="insufficient signal")
        val = max(0.0, min(100.0, float(val)))

        # Confidence heuristic: ≥2 sources with data = high, 1 source = med
        sources_with_data = sum(1 for vs in values.values() if vs)
        if sources_with_data >= 2:
            conf = "high"
        elif total_real >= 10:
            conf = "med"
        else:
            conf = "low"

        inputs_used = {sid: len(vs) for sid, vs in values.items() if vs}
        return ScoreResult(
            code=self.code, zone_id=zone_id, value=round(val, 2),
            tier=self._tier_for(val),
            confidence=conf, is_stub=False,
            inputs_used=inputs_used, formula_version=self.version,
        )


class DataPendingRecipe(Recipe):
    """
    Placeholder recipe for scores whose data feed is still blocked / not yet wired.
    Always returns stub=True with a reason so the UI knows to fall back to seed.
    Every one of the 34 codes is registered so the engine can surface coverage gaps.
    """
    reason: str = "data source pending"

    def compute(self, zone_id: str, obs_by_source: Dict[str, List[Dict[str, Any]]]) -> ScoreResult:
        # If a source suddenly has real data, promote to a soft baseline score (50)
        real_counts = {sid: sum(1 for o in obs if not o.get("is_stub"))
                       for sid, obs in obs_by_source.items()}
        total_real = sum(real_counts.values())
        if total_real < self.min_observations:
            return self._stub_result(zone_id, reason=self.reason)
        # Data exists but no heuristic yet → return a neutral placeholder at med confidence.
        return ScoreResult(
            code=self.code, zone_id=zone_id, value=50.0,
            tier=self._tier_for(50.0), confidence="low", is_stub=False,
            inputs_used=real_counts, formula_version=self.version,
        )
