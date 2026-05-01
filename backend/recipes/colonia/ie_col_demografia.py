"""
IE_COL_DEMOGRAFIA_* + IE_COL_EDUCACION* + IE_COL_SALUD — alimentadas por INEGI BISE.

INEGI devuelve valores nacionales para la mayoría de indicadores; scores se
calibran contra baselines CDMX cuando están disponibles. Mientras tanto, los
recipes que no tienen mapping zone_id directo permanecen como DataPending.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from score_engine import register
from recipes.colonia._helpers import SimpleHeuristicRecipe, DataPendingRecipe


def _inegi_value(payload: Dict[str, Any]) -> Optional[float]:
    v = payload.get("valor")
    try:
        return float(v) if v is not None else None
    except (TypeError, ValueError):
        return None


# Demografía — 5 sub-scores. Los 5 usan INEGI como fuente primaria.
@register
class IEColDemografiaFamilia(SimpleHeuristicRecipe):
    code = "IE_COL_DEMOGRAFIA_FAMILIA"
    version = "1.0"
    dependencies = ["inegi"]
    tier_logic = "higher_better"
    description = "Concentración de hogares con niños + tamaño familiar (INEGI ENIGH/Censo)."
    payload_extractors = {"inegi": _inegi_value}

    def apply(self, values_by_source):
        vals = values_by_source.get("inegi") or []
        if not vals:
            return None
        # Placeholder heurística: media normalizada vs. baseline nacional
        return min(100.0, 50.0 + (sum(vals) / len(vals)) % 30)

    def explanation(self, values_by_source, value):
        return [f"Indicadores INEGI usados: {len(values_by_source.get('inegi') or [])}",
                f"Heurística preliminar v{self.version} → {value}"]


@register
class IEColDemografiaJoven(DataPendingRecipe):
    code = "IE_COL_DEMOGRAFIA_JOVEN"
    version = "0.1"
    dependencies = ["inegi"]
    tier_logic = "higher_better"
    description = "Población 20-35 años + tasa de formación hogares jóvenes."
    reason = "Phase B2: pendiente mapeo ageb → colonia"


@register
class IEColDemografiaIngreso(SimpleHeuristicRecipe):
    code = "IE_COL_DEMOGRAFIA_INGRESO"
    version = "1.0"
    dependencies = ["inegi"]
    tier_logic = "higher_better"
    description = "Ingreso promedio por hogar (ENIGH)."
    payload_extractors = {"inegi": _inegi_value}

    def apply(self, values_by_source):
        vals = values_by_source.get("inegi") or []
        if not vals:
            return None
        # Heurística log del ingreso medio vs mediana nacional ~$15k MXN
        import math
        mean = sum(vals) / len(vals)
        return min(100.0, 40.0 + math.log10(max(mean, 1)) * 8)

    def explanation(self, values_by_source, value):
        vals = values_by_source.get("inegi") or []
        mean = sum(vals) / len(vals) if vals else 0
        return [f"Media de valores: {mean:.0f}",
                f"Escala logarítmica vs mediana MX",
                f"Score {value}"]


@register
class IEColDemografiaEducacion(DataPendingRecipe):
    code = "IE_COL_DEMOGRAFIA_EDUCACION"
    version = "0.1"
    dependencies = ["inegi"]
    tier_logic = "higher_better"
    description = "Años promedio escolaridad + % universitario."
    reason = "Phase B2: pendiente indicador específico por colonia"


@register
class IEColDemografiaEstabilidad(DataPendingRecipe):
    code = "IE_COL_DEMOGRAFIA_ESTABILIDAD"
    version = "0.1"
    dependencies = ["inegi"]
    tier_logic = "higher_better"
    description = "Estabilidad residencial: % hogares >5 años en la vivienda."
    reason = "Phase B2: pendiente cruce Censo × vivienda"


# Educación — infraestructura + calidad
@register
class IEColEducacion(DataPendingRecipe):
    code = "IE_COL_EDUCACION"
    version = "0.1"
    dependencies = ["inegi", "osm_overpass"]
    tier_logic = "higher_better"
    description = "Densidad de escuelas (pre-K a universidad) por colonia (DENUE + OSM)."
    reason = "Phase B2: pendiente query DENUE específica por clase SCIAN"


@register
class IEColEducacionCalidad(DataPendingRecipe):
    code = "IE_COL_EDUCACION_CALIDAD"
    version = "0.1"
    dependencies = []
    tier_logic = "higher_better"
    description = "Calidad escolar: % escuelas privadas + rankings ENLACE/PLANEA."
    reason = "Phase B2: pendiente fuente SEP rankings"


# Salud
@register
class IEColSalud(DataPendingRecipe):
    code = "IE_COL_SALUD"
    version = "0.1"
    dependencies = ["dgis", "osm_overpass"]
    tier_logic = "higher_better"
    description = "Densidad hospitales + clínicas + tiempo al hospital 3er nivel."
    reason = "Phase B2: requiere upload manual DGIS"
