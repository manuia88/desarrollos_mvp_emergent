"""
IE Engine — Phase C / N4 Predictive base recipe.

PredictiveRecipe extends Recipe with forecasting semantics:
  - value     → prediction in recipe's output units (%, days, etc.) — NOT 0-100
  - confidence_interval {low, high, percentile}
  - model_version
  - training_window_days

Recipes stay pure: if dependencies are missing → is_stub=True. No hallucination.
Conversion to 0-100 tier uses `_tier_for_prediction(value)` (each subclass may override).
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from score_engine import Recipe, ScoreResult


class PredictiveRecipe(Recipe):
    layer: str = "predictive"
    model_version: str = "v1.0"
    # Default IC percentile when not set by subclass
    ic_percentile: int = 80

    def _helper_scores(self, obs_by_source: Dict[str, List[Dict[str, Any]]], key: str) -> Dict[str, Dict[str, Any]]:
        """Map of {code: score_doc} from injected DMX scores."""
        docs = [o.get("payload") for o in obs_by_source.get(key) or []]
        return {d["code"]: d for d in docs if d.get("code")}

    def _colonia_self_scores(self, obs_by_source):
        return self._helper_scores(obs_by_source, "_dmx_own_colonia_scores")

    def _project_self_scores(self, obs_by_source):
        return self._helper_scores(obs_by_source, "_dmx_own_proj_scores")

    def _project_colonia_scores(self, obs_by_source):
        return self._helper_scores(obs_by_source, "_dmx_colonia_scores")

    def _dev(self, obs_by_source):
        lst = obs_by_source.get("_dmx_dev") or []
        return lst[0].get("payload") if lst else None

    # ─── Subclass contract ────────────────────────────────────────────────
    def predict(self, zone_id: str, obs_by_source: Dict[str, List[Dict[str, Any]]]) -> Optional[Dict[str, Any]]:
        """Return dict: {value, ci_low, ci_high, confidence, training_window_days, residual_std, inputs_used}
        or None if insufficient data."""
        raise NotImplementedError

    def explanation_pred(self, zone_id, obs_by_source, value):
        return [f"Recipe {self.code} v{self.version} model={self.model_version}"]

    def compute(self, zone_id: str, obs_by_source: Dict[str, List[Dict[str, Any]]]) -> ScoreResult:
        try:
            out = self.predict(zone_id, obs_by_source)
        except Exception as e:  # noqa: BLE001
            return self._stub_result(zone_id, reason=f"predict error: {e}")
        if not out or out.get("value") is None:
            return self._stub_result(zone_id, reason=out.get("reason", "insufficient signal") if out else "insufficient signal")

        value = float(out["value"])
        return ScoreResult(
            code=self.code, zone_id=zone_id, value=round(value, 2),
            tier=self._tier_for(value),
            confidence=out.get("confidence", "med"),
            is_stub=False,
            inputs_used=out.get("inputs_used", {}),
            formula_version=self.version,
            model_version=self.model_version,
            confidence_interval={
                "low": round(float(out.get("ci_low", value)), 2),
                "high": round(float(out.get("ci_high", value)), 2),
                "percentile": self.ic_percentile,
            },
            training_window_days=out.get("training_window_days"),
            residual_std=round(float(out["residual_std"]), 3) if out.get("residual_std") is not None else None,
        )

    # Compat with /explain endpoint's introspection path
    def _real_values(self, obs_by_source):
        return obs_by_source

    def explanation(self, values_by_source, value):
        try:
            return self.explanation_pred(None, values_by_source if isinstance(values_by_source, dict) else {}, value)
        except Exception as e:  # noqa: BLE001
            return [f"Explain failed: {e}"]


# ─── Project-scope predictive base (auto-provides project context) ───────────
class ProjectPredictiveRecipe(PredictiveRecipe):
    scope = "proyecto"
    dependencies = []
