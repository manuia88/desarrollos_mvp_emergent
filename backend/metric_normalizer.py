"""
metric_normalizer — La "regla central" de Señales Honestas de DMX (Tanda B.1).
═══════════════════════════════════════════════════════════════════════════════
PROBLEMA que resuelve (auditoría 2026-06-07): muchos índices se mostraban como un
número falsamente preciso ("Plusvalía 38", "69/100") calculado con TOPES INVENTADOS
(ej. densidad / 3000, 50 + momentum*4). No existe un "valor real" de "gentrificación
38" — es un ranking construido. Mostrarlo como decimal exacto miente.

LA REGLA (una sola, reusable en TODO portal — marketplace · asesor · dev · superadmin):
convierte cualquier número en una BANDA honesta en lenguaje normal
(Muy Baja · Baja · Media · Alta · Muy Alta) comparándolo contra la DISTRIBUCIÓN REAL
de la ciudad (percentiles sobre los datos que YA tenemos), no contra un tope inventado.

- Con población real suficiente → banda por PERCENTIL ("está en el 80% más alto de la ciudad").
- Sin población suficiente → banda orientativa, SIEMPRE marcada "estimado" (cero deuda;
  se autollena al llegar el dato real).
- Para métricas donde "bajo es bueno" (riesgo, crimen) el caller pasa invertir=True:
  se voltea solo el COLOR, nunca la etiqueta (la etiqueta describe el nivel, no el juicio).

Esto NO inventa fuentes nuevas: lee distribuciones de `ie_scores` (scores reales por
colonia) y de cualquier colección de campo (ej. densidad DENUE). Vision IA-first: es la
capa de honestidad que se interpone entre los motores y lo que ve el usuario.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Sequence

log = logging.getLogger("dmx.metric_normalizer")

# ── Referencia ÚNICA de densidad comercial DENUE (negocios/km²) ──
# Antes vivía duplicada y EN CONFLICTO: 3000 en zone_score_engine vs 500 en subscores
# (con nota "Polanco ~400"). El 3000 sub-calificaba todo. Fuente única aquí.
# Heurística de referencia · pendiente upgrade a percentil real (Tanda B.2).
DENUE_DENSITY_REF = 500.0

# Mínimo de zonas reales para hablar de "percentil"; debajo de esto = señal estimada.
MIN_REAL = 8

# Niveles honestos (de menor a mayor) + etiqueta en lenguaje normal.
_NIVELES = ["muy_baja", "baja", "media", "alta", "muy_alta"]
_ETIQUETA = {
    "muy_baja": "Muy Baja", "baja": "Baja", "media": "Media",
    "alta": "Alta", "muy_alta": "Muy Alta",
}
# Color por POSICIÓN (más alto = más verde). Para "bajo es bueno" se usa _COLOR_INV.
_COLOR = {"muy_baja": "rojo", "baja": "rojo", "media": "ambar", "alta": "verde", "muy_alta": "verde"}
_COLOR_INV = {"muy_baja": "verde", "baja": "verde", "media": "ambar", "alta": "rojo", "muy_alta": "rojo"}


# ── Estadística pura (sin dependencias) ──────────────────────────────────────
def percentiles(values: Sequence[float]) -> Dict[str, Any]:
    """Percentiles de una población. Devuelve {n, min, max, p10..p90, _sorted}."""
    vals = sorted(float(v) for v in values if v is not None)
    n = len(vals)
    if n == 0:
        return {"n": 0}

    def _p(p: float) -> float:
        if n == 1:
            return vals[0]
        k = (n - 1) * p
        f = int(k)
        c = min(f + 1, n - 1)
        return vals[f] + (vals[c] - vals[f]) * (k - f)

    return {
        "n": n, "min": vals[0], "max": vals[-1],
        "p10": _p(.10), "p25": _p(.25), "p50": _p(.50), "p75": _p(.75), "p90": _p(.90),
        "_sorted": vals,
    }


def percentile_rank(value: float, sorted_values: Sequence[float]) -> float:
    """Fracción de la población <= value (0..1), con medio-rango para empates."""
    n = len(sorted_values)
    if n == 0:
        return 0.5
    below = sum(1 for v in sorted_values if v < value)
    equal = sum(1 for v in sorted_values if v == value)
    return (below + equal * 0.5) / n


def _nivel_from_frac(frac: float) -> str:
    if frac >= 0.80:
        return "muy_alta"
    if frac >= 0.60:
        return "alta"
    if frac >= 0.40:
        return "media"
    if frac >= 0.20:
        return "baja"
    return "muy_baja"


def leyenda(n: int, es_estimado: bool) -> str:
    """Texto honesto de "de dónde sale" — en lenguaje de persona normal."""
    if es_estimado or not n or n < MIN_REAL:
        return "Señal DMX · guía orientativa (aún con pocos datos), no una medición exacta."
    return f"Señal DMX · comparada con {n} zonas de la ciudad · es una guía, no una medición exacta."


# ── La regla: número → banda honesta ─────────────────────────────────────────
def band_from_dist(dist: Optional[Dict[str, Any]], value: Optional[float], *, invertir: bool = False) -> Dict[str, Any]:
    """value + distribución real → banda por percentil. Sin población → banda estimada."""
    n = (dist or {}).get("n", 0)
    if not dist or n < MIN_REAL or value is None:
        return band_from_abs(value, invertir=invertir, es_estimado=True, comparado_con=n)
    pr = percentile_rank(float(value), dist.get("_sorted") or [])
    nivel = _nivel_from_frac(pr)
    return {
        "nivel": nivel, "etiqueta": _ETIQUETA[nivel],
        "color": (_COLOR_INV if invertir else _COLOR)[nivel],
        "percentil": round(pr * 100),
        "comparado_con": n,
        "es_estimado": False,
        "es_senal": True,
        "leyenda": leyenda(n, False),
    }


def band_from_abs(value: Optional[float], *, lo: float = 0.0, hi: float = 100.0,
                  invertir: bool = False, es_estimado: bool = True, comparado_con: int = 0) -> Dict[str, Any]:
    """Banda sin población real: cortes 20/40/60/80 sobre el rango. Siempre marca estimado."""
    if value is None:
        return {
            "nivel": None, "etiqueta": "Sin Dato Aún", "color": "neutro",
            "percentil": None, "comparado_con": comparado_con, "es_estimado": True,
            "es_senal": True, "leyenda": "Aún no hay dato suficiente para esta señal.",
        }
    frac = (float(value) - lo) / (hi - lo) if hi > lo else 0.5
    frac = max(0.0, min(1.0, frac))
    nivel = _nivel_from_frac(frac)
    return {
        "nivel": nivel, "etiqueta": _ETIQUETA[nivel],
        "color": (_COLOR_INV if invertir else _COLOR)[nivel],
        "percentil": None, "comparado_con": comparado_con,
        "es_estimado": es_estimado, "es_senal": True,
        "leyenda": leyenda(comparado_con, es_estimado),
    }


def band_from_values(value: Optional[float], values: Sequence[float], *, invertir: bool = False) -> Dict[str, Any]:
    """Atajo: calcula la distribución de `values` y bandea `value` contra ella."""
    return band_from_dist(percentiles(values), value, invertir=invertir)


def dist_from_values(values: Sequence[float]) -> Dict[str, Any]:
    return percentiles(values)


# ── Distribuciones desde datos reales (cacheadas en proceso) ─────────────────
_CACHE: Dict[str, Dict[str, Any]] = {}


async def distribution_for_code(db, code: str, *, refresh: bool = False) -> Dict[str, Any]:
    """Percentiles del `value` real (no-stub) de una receta en ie_scores."""
    ck = f"code:{code}"
    if not refresh and ck in _CACHE:
        return _CACHE[ck]
    vals: List[float] = []
    try:
        cur = db.ie_scores.find(
            {"code": code, "is_stub": {"$ne": True}, "value": {"$ne": None}},
            {"_id": 0, "value": 1},
        )
        async for d in cur:
            v = d.get("value")
            if v is not None:
                vals.append(float(v))
    except Exception as e:  # fail-open: sin distribución → banda estimada
        log.warning(f"[normalizer] dist code {code}: {e}")
    dist = percentiles(vals)
    _CACHE[ck] = dist
    return dist


async def distribution_for_field(db, collection: str, field: str, *,
                                 query: Optional[Dict] = None, refresh: bool = False) -> Dict[str, Any]:
    """Percentiles de un campo numérico de cualquier colección (ej. densidad DENUE)."""
    ck = f"field:{collection}.{field}"
    if not refresh and ck in _CACHE:
        return _CACHE[ck]
    vals: List[float] = []
    try:
        cur = db[collection].find(query or {}, {"_id": 0, field: 1})
        async for d in cur:
            v = d.get(field)
            if v is not None:
                vals.append(float(v))
    except Exception as e:
        log.warning(f"[normalizer] dist field {collection}.{field}: {e}")
    dist = percentiles(vals)
    _CACHE[ck] = dist
    return dist


def clear_cache() -> None:
    """Limpia la caché de distribuciones (cron de recálculo / tests)."""
    _CACHE.clear()
