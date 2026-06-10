"""
demanda_demografica_engine — F2.4 · Demanda potencial por demografía (modelo EPRAV).
═══════════════════════════════════════════════════════════════════════════════
Estima cuántas familias al año podrían comprar vivienda vertical en una colonia AUNQUE
no haya búsquedas todavía — la capa que le falta a F2.1 (que necesita búsquedas reales).
Usa el modelo del estudio 4S: demanda anual = crecimiento demográfico (62%) + reubicación
/movilidad (21%) + 2ª vivienda (13%) + migración (4%), filtrada por NSE; luego GAP =
demanda × índice de verticalización − inventario vertical existente; captura = GAP × market share.

Reusa lo que ya existe (cero reinvención): población + NSE por colonia del resolver
demográfico (`routes.dev_batch7_2._deterministic_fallback`, hoy desconectado) e inventario
vertical de DEVELOPMENTS. Doctrina de Datos: es un MODELO → siempre marcado "estimado", con
los supuestos visibles; se afina al llegar INEGI real. FAIL-OPEN.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

log = logging.getLogger("dmx.demanda_demografica")

# Supuestos del modelo (documentados · editables al calibrar). Origen: estudio de mercado 4S + CDMX.
TAMANO_HOGAR = 3.5            # personas por hogar (CDMX)
TASA_CREC_HOGARES = 0.02     # formación de hogares anual (~2%)
EPRAV_SPLIT = {"demografico": 0.62, "movilidad": 0.21, "segunda_vivienda": 0.13, "migracion": 0.04}
INDICE_VERTICALIZACION = 0.30  # % de la demanda que se va a vivienda vertical
MARKET_SHARE = 0.175           # captura objetivo de un proyecto (15-20%)
# Participación NSE objetivo para vivienda vertical residencial (suma de bandas).
_NSE_TARGET = {
    "economica": ("C", "D"),
    "media": ("C+", "C"),
    "premium": ("AB", "C+"),
}


async def estimar_demanda(db, colonia_id: Optional[str], categoria: str = "media") -> Dict[str, Any]:
    """Demanda potencial anual por demografía (EPRAV). FAIL-OPEN · siempre 'estimado'."""
    try:
        from data_seed import COLONIAS_BY_ID
    except Exception:
        COLONIAS_BY_ID = {}
    col = COLONIAS_BY_ID.get(colonia_id) or {}
    name = col.get("name") or (colonia_id or "")
    cat = categoria if categoria in _NSE_TARGET else "media"

    # 1. Demografía (reusa el resolver determinista existente · CDMX = state 09).
    pop = 0
    nse = {}
    try:
        from routes.dev_batch7_2 import _deterministic_fallback
        demo = _deterministic_fallback("09", name)
        pop = int(((demo.get("population") or {}).get("total")) or 0)
        nse = (demo.get("income") or {}).get("nse_distribution") or {}
    except Exception as e:
        log.warning(f"[demanda_demografica] demo fail-open: {e}")

    # 2. Participación NSE objetivo.
    b1, b2 = _NSE_TARGET[cat]
    target_share = (float(nse.get(b1, 0)) + float(nse.get(b2, 0))) / 100.0

    # 3. EPRAV.
    hogares_objetivo = (pop * target_share / TAMANO_HOGAR) if pop else 0
    demografico = hogares_objetivo * TASA_CREC_HOGARES
    total_anual = demografico / EPRAV_SPLIT["demografico"] if demografico else 0
    breakdown = {k: round(total_anual * v) for k, v in EPRAV_SPLIT.items()}

    # 4. Inventario vertical existente en la colonia (DEVELOPMENTS).
    inv_vertical = 0
    try:
        from data_developments import DEVELOPMENTS
        nm = name.strip().lower()
        for d in DEVELOPMENTS:
            if str(d.get("colonia") or "").strip().lower() == nm or d.get("colonia_id") == colonia_id:
                inv_vertical += int(d.get("units_available") or len(d.get("units") or []) or 0)
    except Exception as e:
        log.warning(f"[demanda_demografica] inventario fail-open: {e}")

    # 5. GAP y captura.
    gap = total_anual * INDICE_VERTICALIZACION - inv_vertical
    gap = round(gap)
    captura = round(max(0, gap) * MARKET_SHARE)

    lectura = (f"~{round(total_anual)} familias/año del NSE objetivo en {name}; "
               f"{round(total_anual * INDICE_VERTICALIZACION)} buscarían vertical, "
               f"{'hay hueco para ' + str(gap) if gap > 0 else 'oferta cubre la demanda'}.")
    if not pop:
        lectura = f"Aún sin demografía de {name}: se llena al conectar INEGI. Modelo listo."

    return {
        "colonia_id": colonia_id, "colonia": name, "categoria": cat,
        "poblacion": pop,
        "nse_objetivo": {"bandas": [b1, b2], "participacion_pct": round(target_share * 100, 1)},
        "demanda_anual_total": round(total_anual),
        "demanda_breakdown": breakdown,            # demografico / movilidad / 2a vivienda / migración
        "demanda_vertical": round(total_anual * INDICE_VERTICALIZACION),
        "inventario_vertical": inv_vertical,
        "gap_vertical": gap,
        "captura_objetivo": captura,               # unidades que un proyecto podría colocar/año
        "supuestos": {
            "tamano_hogar": TAMANO_HOGAR, "tasa_crec_hogares": TASA_CREC_HOGARES,
            "indice_verticalizacion": INDICE_VERTICALIZACION, "market_share": MARKET_SHARE,
            "eprav_split": EPRAV_SPLIT,
        },
        "es_estimado": True,
        "lectura": lectura,
        "fuente": "Modelo EPRAV (estudio 4S) · demografía determinista · se calibra con INEGI real",
    }
