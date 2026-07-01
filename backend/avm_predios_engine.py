"""
AVM DE MERCADO POR PREDIO — estima el precio de MERCADO $/m² de cada predio de catastro.

Hoy db.catastro_predios (1.08M) trae SOLO el valor de SUELO catastral oficial (SIGCDMX).
Este motor sube ese predio al nivel de MERCADO reusando el AVM de colonia ya calibrado:

  avm_predio(pred) =
     1. Toma la colonia del predio (colonia_iecm == colonias.id == la llave que ya usan todos los índices).
     2. Aplica el AVM DE MERCADO de esa colonia vía market_estimate_engine.market_for_colonia
        (capa mercado real → semilla → mini-AVM catastral+calidad, con su sello source/confianza).
     3. Si el predio tiene características propias (sup_construccion, valor_suelo del predio),
        ajusta ese $/m² de colonia por el AVM hedónico por-propiedad (avm_base + avm_property)
        y por cuánto se desvía el suelo del predio del suelo mediano de su colonia.

NO inventa datos: cada predio hereda el source/confianza de su colonia y marca es_estimado.
Si un predio no tiene con qué estimarse (sin colonia con dato, sin valor de suelo) → avm_m2=None,
fuente="sin_dato", confianza="baja". El front decide si lo pinta gris.

REUSA (no duplica) market_estimate_engine: market_for_colonia, avm_base_estimate, avm_property.
"""
from __future__ import annotations

import math
from typing import Any, Dict, Optional

from market_estimate_engine import (
    market_for_colonia,
    avm_base_estimate,
    avm_property,
)

# Cotas sanas de $/m² de mercado en CDMX (mismas que el motor de colonia).
_FLOOR, _CEIL = 12000.0, 220000.0
# Cuánto puede el predio desviarse del $/m² de su colonia por su suelo propio (banda de sanidad).
_PREDIO_MIN_FACTOR, _PREDIO_MAX_FACTOR = 0.60, 1.80


# ─── caches por colonia (se llenan una vez por corrida, no por predio) ─────────
class ColoniaAvmCache:
    """Memoiza el AVM de mercado + suelo mediano + calidad de cada colonia dentro de UNA corrida
    (seed o request). Evita re-consultar Mongo por cada uno de los miles de predios de la colonia."""

    def __init__(self, db):
        self.db = db
        self._market: Dict[str, Dict[str, Any]] = {}      # colonia_id → dict de market_for_colonia
        self._suelo_med: Dict[str, Optional[float]] = {}  # colonia_id → valor_suelo_m2 mediano (colonia_catastro_byid)
        self._calidad: Dict[str, Optional[float]] = {}    # colonia_id → calidad 0-100 (media de scores_reales)

    async def _colonia_suelo(self, colonia_id: str) -> Optional[float]:
        if colonia_id in self._suelo_med:
            return self._suelo_med[colonia_id]
        v = await self.db.colonia_catastro_byid.find_one(
            {"colonia_id": colonia_id}, {"_id": 0, "valor_suelo_m2": 1})
        val = (v or {}).get("valor_suelo_m2")
        self._suelo_med[colonia_id] = float(val) if val else None
        return self._suelo_med[colonia_id]

    async def _colonia_calidad(self, colonia_id: str) -> Optional[float]:
        if colonia_id in self._calidad:
            return self._calidad[colonia_id]
        c = await self.db.colonias.find_one({"id": colonia_id}, {"_id": 0, "scores_reales": 1})
        cal = None
        if c:
            sr = c.get("scores_reales") or {}
            vals = [v for v in sr.values() if isinstance(v, (int, float))]
            cal = round(sum(vals) / len(vals)) if vals else None
        self._calidad[colonia_id] = cal
        return cal

    async def market(self, colonia_id: str) -> Dict[str, Any]:
        """AVM de mercado de la colonia (reusa market_estimate_engine.market_for_colonia con su sello)."""
        if colonia_id in self._market:
            return self._market[colonia_id]
        suelo = await self._colonia_suelo(colonia_id)
        calidad = await self._colonia_calidad(colonia_id)
        mkt = await market_for_colonia(self.db, colonia_id, suelo, calidad)
        # anexamos suelo/calidad/avm_base de la colonia para el ajuste por-predio
        mkt = dict(mkt or {})
        mkt["_suelo_colonia"] = suelo
        mkt["_calidad_colonia"] = calidad
        if mkt.get("avm_base") is None:
            mkt["avm_base"] = avm_base_estimate(suelo, calidad)
        self._market[colonia_id] = mkt
        return mkt


def _predio_factor(suelo_predio: Optional[float], suelo_colonia: Optional[float]) -> float:
    """Cuánto ajustar el $/m² de colonia por el suelo PROPIO del predio.
    Si el suelo catastral del predio está por encima/debajo del mediano de su colonia, su valor de
    mercado se mueve en la misma dirección (amortiguado: raíz, para no sobre-reaccionar al catastro)."""
    if not suelo_predio or not suelo_colonia or suelo_colonia <= 0 or suelo_predio <= 0:
        return 1.0
    ratio = suelo_predio / suelo_colonia
    # amortiguar con sqrt: el catastro es ruidoso, no queremos duplicar el $/m² por un predio caro de suelo.
    factor = math.sqrt(ratio)
    return max(_PREDIO_MIN_FACTOR, min(_PREDIO_MAX_FACTOR, factor))


async def avm_predio(db, pred: Dict[str, Any], cache: Optional[ColoniaAvmCache] = None) -> Dict[str, Any]:
    """Estima el precio de MERCADO $/m² de UN predio de db.catastro_predios.

    `pred` = doc de catastro_predios (necesita al menos colonia_iecm; usa valor_unitario_suelo/valor_suelo
    y sup_terreno si están para el ajuste por-predio).

    Devuelve:
      {avm_m2, fuente, confianza, es_estimado, colonia_id, factor_predio, avm_m2_colonia}
    - fuente/confianza/es_estimado se HEREDAN del AVM de la colonia (no se inventan).
    - avm_m2=None + fuente="sin_dato" si no hay con qué estimar.
    """
    if cache is None:
        cache = ColoniaAvmCache(db)

    colonia_id = pred.get("colonia_iecm") or pred.get("colonia_id")
    base = {
        "avm_m2": None,
        "colonia_id": colonia_id,
        "fuente": "sin_dato",
        "confianza": "baja",
        "es_estimado": True,
        "factor_predio": 1.0,
        "avm_m2_colonia": None,
    }
    if not colonia_id:
        return base

    mkt = await cache.market(colonia_id)
    colonia_m2 = (mkt or {}).get("precio_venta_m2")
    if not colonia_m2:
        # la colonia no tiene AVM (ni mercado ni catastro-suelo) → no fabricamos número
        base["fuente"] = (mkt or {}).get("source") or "sin_dato"
        return base

    # $/m² de mercado por PROPIEDAD dentro de la colonia (AVM hedónico) si el predio tiene m² de construcción.
    # Ancla el $/m² promedio de colonia al tamaño real del predio; si no hay m², usa el $/m² de colonia tal cual.
    avm_base = (mkt or {}).get("avm_base")
    m2_constr = pred.get("sup_construccion")
    colonia_ref_m2 = float(colonia_m2)
    try:
        if avm_base is not None and m2_constr and float(m2_constr) >= 15:
            precio_prop = avm_property(avm_base, float(m2_constr), None, None, None)
            if precio_prop and float(m2_constr) > 0:
                colonia_ref_m2 = precio_prop / float(m2_constr)
    except Exception:
        colonia_ref_m2 = float(colonia_m2)

    # Ajuste por el suelo propio del predio vs la mediana de su colonia.
    suelo_predio = pred.get("valor_unitario_suelo")
    if not suelo_predio:
        # derivar $/m² de suelo del predio desde valor_suelo / sup_terreno si hace falta
        vs, st = pred.get("valor_suelo"), pred.get("sup_terreno")
        try:
            if vs and st and float(st) > 0:
                suelo_predio = float(vs) / float(st)
        except Exception:
            suelo_predio = None
    factor = _predio_factor(
        float(suelo_predio) if suelo_predio else None,
        (mkt or {}).get("_suelo_colonia"),
    )

    avm_m2 = round(max(_FLOOR, min(_CEIL, colonia_ref_m2 * factor)))
    return {
        "avm_m2": avm_m2,
        "colonia_id": colonia_id,
        # el sello honesto viene del AVM de la colonia
        "fuente": (mkt or {}).get("source") or "estimado",
        "confianza": (mkt or {}).get("confianza") or "baja",
        "es_estimado": bool((mkt or {}).get("es_estimado", True)),
        "factor_predio": round(factor, 3),
        "avm_m2_colonia": round(float(colonia_m2)),
    }
