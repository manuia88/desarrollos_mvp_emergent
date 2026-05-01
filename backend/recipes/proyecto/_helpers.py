"""
IE Engine — helpers para recipes de PROYECTO.

Los recipes de proyecto NO dependen de ie_raw_observations. En su lugar, reciben
contexto DMX-internal via pseudo-sources inyectadas por ScoreEngine._build_project_context:

  - "_dmx_dev"                 → [{payload: dev_doc}]
  - "_dmx_colonia_scores"      → [{payload: ie_scores doc de la colonia del dev}, ...]
  - "_dmx_same_colonia_devs"   → [{payload: otro_dev}, ...] (mismo colonia_id, excluye self)
  - "_dmx_all_devs"            → [{payload: dev}, ...] (universo)

Cada ProjectRecipe implementa apply_proj(dev, ctx) -> Optional[float] + explanation_proj.
Si el dev no existe (zone_id no reconocido) → stub automático.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from score_engine import Recipe, ScoreResult


class ProjectRecipe(Recipe):
    """Base para recipes IE_PROY_*.

    Convenciones:
      - zone_id === development.id (slug, ej. 'altavista-polanco')
      - dependencies SIEMPRE = [] (no usan ie_raw_observations)
      - scope = 'proyecto'
    """
    scope: str = "proyecto"
    dependencies: List[str] = []

    def _dev(self, obs_by_source: Dict[str, List[Dict[str, Any]]]) -> Optional[Dict[str, Any]]:
        lst = obs_by_source.get("_dmx_dev") or []
        if not lst:
            return None
        return lst[0].get("payload")

    def _colonia_scores(self, obs_by_source: Dict[str, List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
        return [o.get("payload") for o in obs_by_source.get("_dmx_colonia_scores") or []]

    def _same_colonia_devs(self, obs_by_source: Dict[str, List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
        return [o.get("payload") for o in obs_by_source.get("_dmx_same_colonia_devs") or []]

    def _all_devs(self, obs_by_source: Dict[str, List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
        return [o.get("payload") for o in obs_by_source.get("_dmx_all_devs") or []]

    # ─── Overrides ────────────────────────────────────────────────────────────
    def apply_proj(self, dev: Dict[str, Any], ctx: Dict[str, Any]) -> Optional[float]:
        raise NotImplementedError

    def explanation_proj(self, dev: Dict[str, Any], ctx: Dict[str, Any], value: Optional[float]) -> List[str]:
        return [f"Recipe {self.code} v{self.version} aplicado a {dev.get('name')}"]

    def compute(self, zone_id: str, obs_by_source: Dict[str, List[Dict[str, Any]]]) -> ScoreResult:
        dev = self._dev(obs_by_source)
        if not dev:
            return self._stub_result(zone_id, reason="development not found")
        ctx = {
            "colonia_scores": self._colonia_scores(obs_by_source),
            "same_colonia_devs": self._same_colonia_devs(obs_by_source),
            "all_devs": self._all_devs(obs_by_source),
        }
        try:
            val = self.apply_proj(dev, ctx)
        except Exception as e:  # noqa: BLE001
            return self._stub_result(zone_id, reason=f"apply_proj error: {e}")
        if val is None:
            return self._stub_result(zone_id, reason="insufficient signal")
        val = max(0.0, min(100.0, float(val)))
        inputs = {
            "dmx_colonia_scores": len(ctx["colonia_scores"]),
            "dmx_same_colonia_devs": len(ctx["same_colonia_devs"]),
        }
        conf = "high" if len(ctx["colonia_scores"]) >= 5 or len(ctx["same_colonia_devs"]) >= 2 else "med"
        return ScoreResult(
            code=self.code, zone_id=zone_id, value=round(val, 2),
            tier=self._tier_for(val), confidence=conf, is_stub=False,
            inputs_used=inputs, formula_version=self.version,
        )

    def explanation(self, values_by_source, value):  # compat with /explain endpoint
        dev = self._dev(values_by_source) if isinstance(values_by_source, dict) else None
        if not dev:
            return [f"Recipe {self.code} sin contexto de desarrollo."]
        ctx = {
            "colonia_scores": self._colonia_scores(values_by_source),
            "same_colonia_devs": self._same_colonia_devs(values_by_source),
            "all_devs": self._all_devs(values_by_source),
        }
        return self.explanation_proj(dev, ctx, value)

    # Let /explain endpoint's `_real_values` call work without crashing:
    def _real_values(self, obs_by_source):
        return obs_by_source


class ProjectDataPendingRecipe(ProjectRecipe):
    """Placeholder for project recipes whose data feeds are not wired yet."""
    reason: str = "data source pending"

    def compute(self, zone_id: str, obs_by_source: Dict[str, List[Dict[str, Any]]]) -> ScoreResult:
        return self._stub_result(zone_id, reason=self.reason)
