"""
market_4s_loader.py — Ingesta del dato REAL de mercado de los estudios de demanda vertical 4S (CDMX).

Alimenta las colecciones que leen los motores:
  · market_comps_4s   — proyectos competidores con ABSORCIÓN REAL (vendidas/tiempo_en_mercado) →
                        reemplaza el proxy _MESES_STAGE de absorcion_engine y da anclas al equilibrium_engine.
  · demanda_4s        — estimación de demanda EPRAV por zona×segmento×rango de precio (demanda, inventario, GAP).
  · wtp_4s            — willingness-to-pay (elevautos, bodega, mantenimiento, tolerancia +8%) por zona.

Procedencia: cada doc lleva fuente='4s_2026-05' → dmx_indices/equilibrium marcan el dato como REAL (no estimado).
Idempotente (upsert por clave natural). Cero costo de API — solo lee un JSON del repo e inserta en Mongo.

Uso:  from market_4s_loader import load_market_4s; await load_market_4s(db)
      o  python scripts/load_market_4s.py
"""
from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, Optional

log = logging.getLogger("dmx.market_4s")

_DEFAULT_PATH = os.path.join(os.path.dirname(__file__), "data_sources", "market_4s_cdmx_2026_05.json")
FUENTE = "4s_2026-05"


def _norm(s: Optional[str]) -> str:
    return (s or "").strip().lower()


def _velocidad(vendidas: Optional[float], meses: Optional[float]) -> Optional[float]:
    """Velocidad de absorción REAL: unidades vendidas / meses en mercado. Es el dato que el
    proxy _MESES_STAGE de absorcion_engine solo estimaba. None si no hay meses."""
    try:
        v = float(vendidas or 0)
        m = float(meses or 0)
        if m <= 0:
            return None
        return round(v / m, 2)
    except Exception:
        return None


def _read_json(path: Optional[str]) -> Dict[str, Any]:
    with open(path or _DEFAULT_PATH, encoding="utf-8") as f:
        return json.load(f)


async def load_market_4s(db, path: Optional[str] = None) -> Dict[str, Any]:
    """Carga el JSON 4S a Mongo (idempotente). Devuelve resumen de conteos."""
    data = _read_json(path)
    meta = data.get("_meta", {})
    n_proj = n_dem = n_wtp = 0

    # 1) Proyectos competidores → market_comps_4s (con velocidad real derivada)
    for p in data.get("proyectos", []):
        vel = _velocidad(p.get("unidades_vendidas"), p.get("tiempo_en_mercado_meses"))
        tot = p.get("unidades_totales") or 0
        absor_pct = round(100.0 * (p.get("unidades_vendidas") or 0) / tot, 1) if tot else None
        doc = {
            **p,
            "velocidad_mensual_real": vel,          # unidades/mes REAL
            "absorcion_pct": absor_pct,             # % vendido
            "fuente": FUENTE,
            "es_estimado": False,                   # dato REAL → los motores lo marcan 'real'
            "zona_norm": _norm(p.get("zona")),
        }
        key = {"proyecto": p.get("proyecto"), "estudio": p.get("estudio")}
        await db.market_comps_4s.update_one(key, {"$set": doc}, upsert=True)
        n_proj += 1

    # 2) Estimación de demanda EPRAV → demanda_4s (por zona×segmento×rango de precio)
    for z in data.get("demanda_estimacion", []):
        estudio = z.get("estudio")
        for seg in z.get("segmentos", []):
            doc = {
                "estudio": estudio,
                "zona_influencia": z.get("zona_influencia"),
                **seg,
                "eprav_split": meta.get("eprav_split"),
                "indice_verticalizacion": meta.get("indice_verticalizacion"),
                "fuente": FUENTE,
                "es_estimado": False,
            }
            key = {"estudio": estudio, "nse": seg.get("nse"), "segmento": seg.get("segmento")}
            await db.demanda_4s.update_one(key, {"$set": doc}, upsert=True)
            n_dem += 1

    # 3) Willingness-to-pay + preferencias → wtp_4s (un doc agregado)
    wtp_doc = {
        "willingness_to_pay": data.get("willingness_to_pay"),
        "preferencias_producto": data.get("preferencias_producto"),
        "sustentabilidad_factor_decision_si_pct": data.get("sustentabilidad_factor_decision_si_pct"),
        "nse_zona": data.get("nse_zona"),
        "avaluos_reventa": data.get("avaluos_reventa"),
        "fuente": FUENTE,
    }
    await db.wtp_4s.update_one({"fuente": FUENTE}, {"$set": wtp_doc}, upsert=True)
    n_wtp = 1

    # Índices (idempotentes) para las consultas del equilibrium_engine
    try:
        await db.market_comps_4s.create_index("zona_norm")
        await db.market_comps_4s.create_index("clasificacion")
        await db.demanda_4s.create_index("estudio")
    except Exception as e:
        log.warning("[market_4s] index fail-open: %s", e)

    summary = {"proyectos": n_proj, "demanda_segmentos": n_dem, "wtp": n_wtp, "fuente": FUENTE}
    log.info("[market_4s] cargado: %s", summary)
    return summary
