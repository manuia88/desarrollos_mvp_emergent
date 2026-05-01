"""IE_PROY_* — Phase 7.3 Document Intelligence recipes.

Three project-level recipes consuming the cross-check engine results:

  - IE_PROY_RISK_LEGAL       lower_better, custom: critical→0, warning→50, clean→100
  - IE_PROY_COMPLIANCE_SCORE higher_better: passed/applicable × 100
  - IE_PROY_QUALITY_DOCS     higher_better: docs_extracted_count / 10 canonical × 100

Inputs available in ctx via ProjectRecipe.compute → obs_by_source:
  _dmx_cross_checks: [{payload: cross_check_doc}]
  _dmx_extracted_docs: [{payload: {doc_type, id}}]
"""

from __future__ import annotations
from typing import Any, Dict, List, Optional

from score_engine import register, ScoreResult
from recipes.proyecto._helpers import ProjectRecipe


CANONICAL_DOC_TYPES = [
    "lp", "brochure", "escritura", "permiso_seduvi", "estudio_suelo",
    "licencia_construccion", "predial", "plano_arquitectonico",
    "contrato_cv", "constancia_fiscal",
]


def _cross_checks(obs):
    return [o.get("payload") for o in obs.get("_dmx_cross_checks") or []]


def _extracted_docs(obs):
    return [o.get("payload") for o in obs.get("_dmx_extracted_docs") or []]


@register
class IEProyRiskLegal(ProjectRecipe):
    code = "IE_PROY_RISK_LEGAL"
    version = "1.0"
    tier_logic = "higher_better"  # 100 limpio, 0 critical
    description = "Riesgo legal según cross-check de documentos. 100 = sin issues, 50 = warnings, 0 = críticos activos."

    def compute(self, zone_id: str, obs_by_source: Dict[str, List[Dict[str, Any]]]) -> ScoreResult:
        dev = self._dev(obs_by_source)
        if not dev:
            return self._stub_result(zone_id, reason="development not found")
        cc = _cross_checks(obs_by_source)
        if not cc:
            return self._stub_result(zone_id, reason="cross_check no ejecutado aún")

        criticals = [r for r in cc if r.get("severity") == "critical" and r.get("result") == "fail"]
        warnings = [r for r in cc if r.get("severity") == "warning" and r.get("result") == "fail"]

        if criticals:
            value = 0.0
        elif warnings:
            value = 50.0
        else:
            value = 100.0
        return ScoreResult(
            code=self.code, zone_id=zone_id, value=value,
            tier=self._tier_for(value), confidence="high", is_stub=False,
            inputs_used={"criticals": len(criticals), "warnings": len(warnings), "total_rules_eval": len(cc)},
            formula_version=self.version,
        )

    def explanation_proj(self, dev, ctx, value):
        return [f"Recipe {self.code}: 100 limpio · 50 con warnings · 0 con críticos"]


@register
class IEProyComplianceScore(ProjectRecipe):
    code = "IE_PROY_COMPLIANCE_SCORE"
    version = "1.0"
    tier_logic = "higher_better"
    description = "% de reglas cross-check aprobadas vs reglas aplicables (con datos suficientes)."

    def compute(self, zone_id: str, obs_by_source: Dict[str, List[Dict[str, Any]]]) -> ScoreResult:
        dev = self._dev(obs_by_source)
        if not dev:
            return self._stub_result(zone_id, reason="development not found")
        cc = _cross_checks(obs_by_source)
        if not cc:
            return self._stub_result(zone_id, reason="cross_check no ejecutado aún")

        applicable = [r for r in cc if r.get("result") in ("pass", "fail")]
        if not applicable:
            return self._stub_result(zone_id, reason="ninguna regla aplicable (faltan documentos)")

        passed = [r for r in applicable if r.get("result") == "pass"]
        value = len(passed) / len(applicable) * 100.0
        return ScoreResult(
            code=self.code, zone_id=zone_id, value=round(value, 2),
            tier=self._tier_for(value), confidence="high", is_stub=False,
            inputs_used={"passed": len(passed), "applicable": len(applicable)},
            formula_version=self.version,
        )

    def explanation_proj(self, dev, ctx, value):
        return [f"Recipe {self.code}: passed/applicable × 100"]


@register
class IEProyQualityDocs(ProjectRecipe):
    code = "IE_PROY_QUALITY_DOCS"
    version = "1.0"
    tier_logic = "higher_better"
    description = "% de documentos canónicos del desarrollo con OCR + extracción exitosa (10 tipos esperados)."

    def compute(self, zone_id: str, obs_by_source: Dict[str, List[Dict[str, Any]]]) -> ScoreResult:
        dev = self._dev(obs_by_source)
        if not dev:
            return self._stub_result(zone_id, reason="development not found")
        extracted = _extracted_docs(obs_by_source)
        present_types = {d.get("doc_type") for d in extracted if d.get("doc_type") in CANONICAL_DOC_TYPES}
        value = len(present_types) / len(CANONICAL_DOC_TYPES) * 100.0
        return ScoreResult(
            code=self.code, zone_id=zone_id, value=round(value, 2),
            tier=self._tier_for(value), confidence="high", is_stub=False,
            inputs_used={"present_canonical_types": sorted(present_types), "total_canonical": len(CANONICAL_DOC_TYPES)},
            formula_version=self.version,
        )

    def explanation_proj(self, dev, ctx, value):
        return [f"Recipe {self.code}: docs canónicos extraídos / 10 × 100"]
