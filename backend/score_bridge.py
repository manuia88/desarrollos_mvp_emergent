"""
score_bridge — Scores REALES por colonia (EX.2 · vision IA-first / data-driven).
═══════════════════════════════════════════════════════════════════════════════
Las 16 colonias semilla tienen scores PUESTOS A MANO. Para escalar a ~1,800 (y a otras
ciudades) los scores deben salir del DATO real. Este puente REUSA el motor que ya existe
(`zone_subscores_compute.compute_all_subscores`, que lee SESNSP/DENUE/DRPI) y lo traduce a
las 7 dimensiones que esperan los índices y el ciclo:

  vida ← lifestyle (DENUE recreativo) · movilidad ← transporte · seguridad ← seguridad (SESNSP)
  comercio ← amenidades (DENUE densidad) · plusvalia ← precio (DRPI) · riesgo ← seguridad
  educacion ← (aún sin fuente fina → pendiente, NO se inventa)

Honesto: una dimensión solo cuenta como REAL si su fuente no es 'stub'. Lo que falte queda
'pendiente' y se autollena al ingestar el dato (cero deuda). No reemplaza la mano: el caller
decide usar lo real cuando lo hay y caer a la semilla/estimado cuando no.
"""
from __future__ import annotations

import logging
from typing import Any, Dict

log = logging.getLogger("dmx.score_bridge")

# dimensión de índice  ←  clave del subscore real
_DIM_MAP = {
    "vida": "lifestyle",
    "movilidad": "transporte",
    "seguridad": "seguridad",
    "comercio": "amenidades",
    "plusvalia": "precio",
    "educacion": "educacion",
    "riesgo": "seguridad",   # zona segura → riesgo (score, mayor=mejor) alto
}
# Las 7 dimensiones que consume el motor de índices.
_DIMS = ["vida", "movilidad", "seguridad", "comercio", "plusvalia", "educacion", "riesgo"]

# Fuentes que NO cuentan como "real": 'stub' (sin dato) y 'seed_proxy' (el valor a mano de la
# semilla — es justo lo que EX.2 busca reemplazar, no aporta dato nuevo).
_NO_REAL = {"stub", "seed_proxy"}


async def real_scores_for(db, zone_slug: str) -> Dict[str, Any]:
    """Calcula los scores reales de una colonia desde el dato (SESNSP/DENUE/DRPI).

    Devuelve:
      scores      → {dim: valor}  solo las dimensiones con dato REAL (no stub)
      fuentes     → {dim: 'sesnsp'|'denue'|'drpi'|…}
      reales      → cuántas de las 7 dimensiones tienen dato real
      cobertura_pct → reales / 7
      es_estimado → True si falta alguna (siempre que < 7)
    """
    try:
        from zone_subscores_compute import compute_all_subscores
        sub = await compute_all_subscores(db, zone_slug)
    except Exception as e:  # fail-open: sin motor/datos → todo pendiente, honesto
        log.warning(f"[score_bridge] {zone_slug}: {e}")
        sub = {}
    return map_subscores(sub)


def map_subscores(sub: Dict[str, Any]) -> Dict[str, Any]:
    """Parte PURA (testeable sin DB): subscores → scores reales por dimensión."""
    scores: Dict[str, float] = {}
    fuentes: Dict[str, str] = {}
    for dim in _DIMS:
        subkey = _DIM_MAP.get(dim)
        s = sub.get(subkey) if subkey else None
        if not s:
            continue
        val, src = s.get("value"), s.get("source")
        if val is not None and src and src not in _NO_REAL:
            scores[dim] = round(float(val))
            fuentes[dim] = src
    reales = len(scores)
    return {
        "scores": scores,
        "fuentes": fuentes,
        "reales": reales,
        "total": len(_DIMS),
        "cobertura_pct": round(reales / len(_DIMS) * 100),
        "es_estimado": reales < len(_DIMS),
    }
