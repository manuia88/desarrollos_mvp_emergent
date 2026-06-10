"""
perfil_zona_engine — F2.8 · Perfil de Zona Unificado + "Qué Le Falta".
═══════════════════════════════════════════════════════════════════════════════
FUSIONA (no recalcula) lo que ya existe disperso en motores de zona:
  • zone_score_engine.get_score_or_compute → 6 dimensiones (liquidez/supply/demanda/riesgo/yield/DENUE)
  • zone_cycle_engine.compute_zone_cycle   → ciclo / gentrificación / renta
  • denue_engine.get_zone_density          → densidad de servicios por giro (by_category)
Y agrega lo ÚNICO nuevo: **"qué le falta a la zona"** = giros cuya densidad está por debajo de la
mediana de la ciudad (inverso de densidad), con banda honesta (metric_normalizer). Cierra el "por qué
se compra aquí" del estudio. Reusa motores (regla grep-antes-de-construir). FAIL-OPEN.
"""
from __future__ import annotations

import logging
from collections import defaultdict
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.perfil_zona")

_GIRO_LABEL = {
    "restaurants": "Restaurantes", "gyms": "Gimnasios", "markets": "Supermercados",
    "schools": "Escuelas", "hospitals": "Hospitales", "pharmacies": "Farmacias", "banks": "Bancos",
}


async def _que_le_falta(db, by_category: Dict[str, Any]) -> Dict[str, Any]:
    """Giros sub-atendidos vs la distribución real de la ciudad (inverso de densidad). NUEVO."""
    try:
        import metric_normalizer as mn
    except Exception:
        mn = None
    # Distribución por giro a partir de TODAS las zonas con densidad (dato real).
    cats: Dict[str, List[float]] = defaultdict(list)
    try:
        async for d in db.denue_zone_density.find({}, {"_id": 0, "by_category": 1}):
            for k, v in (d.get("by_category") or {}).items():
                if v is not None:
                    cats[k].append(float(v))
    except Exception as e:
        log.warning(f"[perfil_zona] dist denue fail-open: {e}")

    faltan = []
    n_zonas = max((len(v) for v in cats.values()), default=0)
    hay_detalle = any(any(v > 0 for v in vals) for vals in cats.values())
    if hay_detalle and mn:
        # Solo se marca "falta" cuando HAY distribución real (otras zonas sí tienen) y esta está baja.
        for k, label in _GIRO_LABEL.items():
            vals = cats.get(k, [])
            if not vals or not any(v > 0 for v in vals):
                continue
            mine = float((by_category or {}).get(k, 0) or 0)
            band = mn.band_from_values(mine, vals)
            if band.get("nivel") in ("muy_baja", "baja"):
                faltan.append({"giro": label, "tienes": int(mine),
                               "nivel": band.get("nivel"), "percentil": band.get("percentil")})
        faltan.sort(key=lambda x: (x.get("percentil") if x.get("percentil") is not None else -1))
    if not hay_detalle:
        lectura = "DENUE por giro aún no ingerido — se prende solo al llegar el dato."
    elif n_zonas < 8:
        lectura = "Aún con pocas zonas para comparar — se afina con más densidad ingerida."
    else:
        lectura = f"Comparado contra {n_zonas} zonas de la ciudad."
    return {"faltan": faltan, "es_estimado": (not hay_detalle) or n_zonas < 8, "lectura": lectura}


async def perfil_zona(db, colonia_id: Optional[str]) -> Dict[str, Any]:
    """Perfil de zona unificado + qué le falta. FUSIONA motores existentes. FAIL-OPEN."""
    try:
        from data_seed import COLONIAS_BY_ID
    except Exception:
        COLONIAS_BY_ID = {}
    col = COLONIAS_BY_ID.get(colonia_id) or {}
    name = col.get("name") or (colonia_id or "")

    # 1 · Score de zona (6 dimensiones) — reusa zone_score_engine.
    score = None
    try:
        from zone_score_engine import get_score_or_compute
        score = await get_score_or_compute(db, colonia_id, tier="colonia")
    except Exception as e:
        log.warning(f"[perfil_zona] zone_score fail-open: {e}")

    # 2 · Ciclo / gentrificación / renta — reusa zone_cycle_engine.
    ciclo = None
    try:
        if col:
            from zone_cycle_engine import compute_zone_cycle
            ciclo = compute_zone_cycle(col)
    except Exception as e:
        log.warning(f"[perfil_zona] zone_cycle fail-open: {e}")

    # 3 · Densidad de servicios por giro — reusa denue_engine.
    by_category = {}
    densidad = None
    try:
        from denue_engine import get_zone_density
        denue = await get_zone_density(db, colonia_id)
        if denue:
            by_category = denue.get("by_category") or {}
            densidad = denue.get("businesses_per_km2")
    except Exception as e:
        log.warning(f"[perfil_zona] denue fail-open: {e}")

    # 4 · NUEVO · qué le falta a la zona.
    falta = await _que_le_falta(db, by_category)

    # Scores reales de la colonia (seguridad/plusvalía/etc), si existen en el catálogo.
    scores_col = col.get("scores") or {}

    return {
        "colonia_id": colonia_id, "colonia": name,
        "zone_score": score,
        "ciclo": ciclo,
        "servicios": {"densidad_km2": densidad,
                      "por_giro": {_GIRO_LABEL.get(k, k): v for k, v in by_category.items()}},
        "scores_colonia": scores_col,
        "que_le_falta": falta,
        "fuente": "Perfil de Zona DMX · fusiona zone_score + zone_cycle + DENUE (reuso) + gap de giros (nuevo)",
    }
