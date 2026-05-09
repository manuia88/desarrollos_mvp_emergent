"""IE Engine — helpers para recipes de UNIT (W3.1B-3).

Los recipes de unit operan sobre una unidad individual dentro de un dev
(zone_id = unit.id, ej. 'altavista-polanco-02A'). Reciben contexto DMX-internal
inyectado por ScoreEngine._build_unit_context vía pseudo source ids:

  - "_dmx_unit"            → [{payload: unit_doc}]
  - "_dmx_unit_dev"         → [{payload: dev_doc enriquecido (price_m2_avg, type, launch_date)}]
  - "_dmx_unit_same_proto"  → [{payload: unit_peer del mismo prototype}, ...] (excluye self)
  - "_dmx_unit_dev_peers"   → [{payload: cualquier unit_peer del dev}, ...] (excluye self)

Cada UnitRecipe implementa apply_unit(unit, ctx) → Optional[float] + explanation_unit.
Si la unidad no existe (zone_id no reconocido) → stub automático.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from score_engine import Recipe, ScoreResult


class UnitRecipe(Recipe):
    """Base para recipes IE_UNIT_*.

    Convenciones:
      - zone_id === unit.id (ej. 'altavista-polanco-02A')
      - dependencies SIEMPRE = [] (no usan ie_raw_observations)
      - scope = 'unit'
    """
    scope: str = "unit"
    dependencies: List[str] = []

    def _unit(self, obs_by_source: Dict[str, List[Dict[str, Any]]]) -> Optional[Dict[str, Any]]:
        lst = obs_by_source.get("_dmx_unit") or []
        if not lst:
            return None
        return lst[0].get("payload")

    def _dev(self, obs_by_source: Dict[str, List[Dict[str, Any]]]) -> Optional[Dict[str, Any]]:
        lst = obs_by_source.get("_dmx_unit_dev") or []
        if not lst:
            return None
        return lst[0].get("payload")

    def _same_proto(self, obs_by_source: Dict[str, List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
        return [o.get("payload") for o in obs_by_source.get("_dmx_unit_same_proto") or []]

    def _dev_peers(self, obs_by_source: Dict[str, List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
        return [o.get("payload") for o in obs_by_source.get("_dmx_unit_dev_peers") or []]

    # ─── Overrides ────────────────────────────────────────────────────────────
    def apply_unit(self, unit: Dict[str, Any], ctx: Dict[str, Any]) -> Optional[float]:
        raise NotImplementedError

    def explanation_unit(self, unit: Dict[str, Any], ctx: Dict[str, Any], value: Optional[float]) -> List[str]:
        return [f"Recipe {self.code} v{self.version} aplicado a {unit.get('id')}"]

    def compute(self, zone_id: str, obs_by_source: Dict[str, List[Dict[str, Any]]]) -> ScoreResult:
        unit = self._unit(obs_by_source)
        if not unit:
            return self._stub_result(zone_id, reason="unit not found")
        ctx = {
            "unit": unit,
            "dev": self._dev(obs_by_source),
            "same_proto": self._same_proto(obs_by_source),
            "dev_peers": self._dev_peers(obs_by_source),
        }
        try:
            val = self.apply_unit(unit, ctx)
        except Exception as e:  # noqa: BLE001
            return self._stub_result(zone_id, reason=f"apply_unit error: {e}")
        if val is None:
            return self._stub_result(zone_id, reason="insufficient signal")
        val = max(0.0, min(100.0, float(val)))
        inputs = {
            "dmx_unit_same_proto": len(ctx["same_proto"]),
            "dmx_unit_dev_peers": len(ctx["dev_peers"]),
        }
        conf = "high" if len(ctx["same_proto"]) >= 3 else "med"
        return ScoreResult(
            code=self.code, zone_id=zone_id, value=round(val, 2),
            tier=self._tier_for(val), confidence=conf, is_stub=False,
            inputs_used=inputs, formula_version=self.version,
        )

    def explanation(self, values_by_source, value):  # compat with /explain endpoint
        unit = self._unit(values_by_source) if isinstance(values_by_source, dict) else None
        if not unit:
            return [f"Recipe {self.code} sin contexto de unidad."]
        ctx = {
            "unit": unit,
            "dev": self._dev(values_by_source),
            "same_proto": self._same_proto(values_by_source),
            "dev_peers": self._dev_peers(values_by_source),
        }
        return self.explanation_unit(unit, ctx, value)

    # Let /explain endpoint's `_real_values` call work without crashing:
    def _real_values(self, obs_by_source):
        return obs_by_source
