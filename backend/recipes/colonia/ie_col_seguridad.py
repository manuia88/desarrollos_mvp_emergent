"""
IE_COL_SEGURIDAD + IE_COL_LOCATEL — alimentadas por CKAN (FGJ + Locatel).

Ambas usan `lower_better` tier logic: alto número de carpetas / alertas = rojo.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from score_engine import Recipe, ScoreResult, register
from recipes.colonia._helpers import SimpleHeuristicRecipe


def _count(payload: Dict[str, Any]) -> float:
    # Cada observation FGJ/Locatel representa 1 evento → contamos ocurrencias vía len()
    return 1.0


@register
class IEColSeguridad(SimpleHeuristicRecipe):
    code = "IE_COL_SEGURIDAD"
    version = "1.0"
    dependencies = ["fgj_cdmx"]
    tier_logic = "lower_better"
    description = "Seguridad: densidad de carpetas de investigación FGJ por colonia."
    min_observations = 3
    payload_extractors = {"fgj_cdmx": _count}

    def apply(self, values_by_source):
        n = len(values_by_source.get("fgj_cdmx") or [])
        if n == 0:
            return None
        # Mapeo logarítmico: 0-5 eventos = 20 (bajo riesgo), 5-20 = 40, 20-50 = 60, >50 = 80+
        import math
        risk = 10.0 + math.log10(max(n, 1)) * 25
        return risk

    def explanation(self, values_by_source, value):
        n = len(values_by_source.get("fgj_cdmx") or [])
        return [
            f"Carpetas FGJ observadas: {n}",
            f"Escala log: 10 + log10({n}) × 25 = {value}",
            "Tier invertido (lower_better)",
        ]


@register
class IEColLocatel(SimpleHeuristicRecipe):
    code = "IE_COL_LOCATEL"
    version = "1.0"
    dependencies = ["locatel"]
    tier_logic = "lower_better"
    description = "Locatel 0311: densidad de reportes ciudadanos (baches, luz, agua)."
    min_observations = 3
    payload_extractors = {"locatel": _count}

    def apply(self, values_by_source):
        n = len(values_by_source.get("locatel") or [])
        if n == 0:
            return None
        import math
        return 10.0 + math.log10(max(n, 1)) * 22

    def explanation(self, values_by_source, value):
        return [f"Reportes Locatel: {len(values_by_source.get('locatel') or [])}",
                f"Escala log → {value}",
                "Tier invertido"]


@register
class IEColAguaConfiabilidad(SimpleHeuristicRecipe):
    code = "IE_COL_AGUA_CONFIABILIDAD"
    version = "1.0"
    dependencies = ["sacmex"]
    tier_logic = "higher_better"  # alto = confiable
    description = "Confiabilidad del agua: inversamente proporcional a cortes SACMEX."
    min_observations = 1
    payload_extractors = {"sacmex": _count}

    def apply(self, values_by_source):
        cortes = len(values_by_source.get("sacmex") or [])
        if cortes == 0:
            return 85.0  # Si CKAN no reporta cortes, asumimos alta confiabilidad
        import math
        # Más cortes → menor score. Invertido de Locatel/Seguridad.
        return max(0.0, 90.0 - math.log10(cortes + 1) * 25)

    def explanation(self, values_by_source, value):
        return [f"Cortes reportados SACMEX: {len(values_by_source.get('sacmex') or [])}",
                f"Fórmula: 90 − log10(cortes+1) × 25 = {value}"]
