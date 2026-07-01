"""
colonia_valoracion_engine — Valoración por colonia (Fase 2 del mapa de valores).
═══════════════════════════════════════════════════════════════════════════════
Alimenta el panel del mapa con DOS números honestos por colonia:

  1. PRECIO DE MERCADO ($/m²) — la mejor capa disponible, con sello de fuente/confianza:
       market_comps (Monopolio, dato observado) → market_estimate_engine (mini-AVM)
       → catastro (valor de suelo, último recurso). REUSA market_for_colonia y colonia_catastro.
  2. PLUSVALÍA anual (%) — DERIVADA del índice SHF OFICIAL de la ALCALDÍA de la colonia.
       CDMX solo tiene índice SHF propio en 5 alcaldías; las demás heredan el factor estatal CDMX.
       La plusvalía NO existe por colonia en ninguna fuente → se marca `es_estimado=True`
       (derivada de la alcaldía) para no fingir dato granular que no tenemos. REUSA shf_engine.

NO inventa: cada campo trae fuente + confianza + es_estimado. Fail-soft por campo (si falta
uno, los demás siguen). La colección `colonia_valoracion` (un doc por colonia) es la estructura
que se puebla con el tiempo (seed en scripts/seed_colonia_valoracion.py).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.colonia_valoracion")

# Años mínimos que la serie de plusvalía debe cubrir para el panel (el requerimiento pide 2020-2023).
_MIN_ANIO = 2020


def _iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _colonia_meta(db, colonia_id: str) -> Dict[str, Any]:
    """id/name/alcaldia de la colonia (cualquiera de las 1,811 con geometría)."""
    c = await db.colonias.find_one(
        {"id": colonia_id}, {"_id": 0, "id": 1, "name": 1, "alcaldia": 1, "scores_reales": 1})
    return c or {}


def _annual_from_quarterly(pts: List[Dict[str, Any]], desde_anio: int = _MIN_ANIO) -> List[Dict[str, Any]]:
    """Serie ANUAL de plusvalía desde la serie trimestral SHF: por cada año toma el ÚLTIMO trimestre
    disponible como el nivel del índice de ese año, y calcula el yoy vs el año previo. Honesto: si un
    año no tiene su previo, yoy_pct = None (no se inventa)."""
    by_year: Dict[int, Dict[str, Any]] = {}
    for p in pts:
        try:
            anio, tri, idx = int(p["anio"]), int(p["trimestre"]), float(p["indice"])
        except (TypeError, ValueError, KeyError):
            continue
        cur = by_year.get(anio)
        if cur is None or tri > cur["_tri"]:
            by_year[anio] = {"_tri": tri, "valor_m2": round(idx, 2)}
    serie: List[Dict[str, Any]] = []
    for anio in sorted(by_year):
        if anio < desde_anio:
            continue
        val = by_year[anio]["valor_m2"]
        prev = by_year.get(anio - 1)
        yoy = round((val / prev["valor_m2"] - 1) * 100, 1) if prev else None
        serie.append({"anio": anio, "valor_m2": val, "yoy_pct": yoy})
    return serie


async def _plusvalia_alcaldia(db, alcaldia: Optional[str]) -> Dict[str, Any]:
    """Serie anual de plusvalía de la ALCALDÍA (índice SHF trimestral → anual). REUSA shf_engine:
    resuelve la alcaldía propia (5 con índice) o hereda CDMX estatal, exactamente como get_series."""
    try:
        from shf_engine import get_series, _norm_alc, _CDMX_ESTATAL
    except Exception as e:
        log.warning(f"[valoracion] shf import: {e}")
        return {"series": [], "fuente": "shf_alcaldia", "es_estimado": True, "es_propio": None}
    # get_series ya siembra shf_series si está vacía, normaliza la alcaldía y elige propia/estatal.
    gs = await get_series(db, alcaldia=alcaldia, desde_anio=_MIN_ANIO)
    target = gs.get("alcaldia") or _CDMX_ESTATAL
    # Re-lee la serie trimestral cruda de la alcaldía elegida para armar la serie ANUAL con yoy.
    cur = db.shf_series.find(
        {"alcaldia": target, "anio": {"$gte": _MIN_ANIO - 1}},   # -1 para poder calcular el yoy del primer año
        {"_id": 0, "anio": 1, "trimestre": 1, "indice": 1})
    pts = [p async for p in cur]
    serie = _annual_from_quarterly(pts, desde_anio=_MIN_ANIO)
    return {
        "series": serie,
        "fuente": "shf_alcaldia",
        "es_estimado": True,  # es índice de la ALCALDÍA, no de la colonia (no existe granular)
        "es_propio": bool(gs.get("es_propio")),
        "alcaldia_indice": target,
        "plusvalia_anual_pct": gs.get("plusvalia_anual_pct"),
    }


async def _market_m2(db, colonia_id: str, valor_suelo_m2: Optional[float],
                     calidad: Optional[float]) -> Dict[str, Any]:
    """Precio de mercado $/m² con la mejor capa (Monopolio → mini-AVM → catastro). REUSA
    market_for_colonia (que ya prioriza market_comps → semilla → estimado)."""
    try:
        from market_estimate_engine import market_for_colonia
        m = await market_for_colonia(db, colonia_id, valor_suelo_m2, calidad)
        if m and m.get("precio_venta_m2"):
            return {
                "valor": round(m["precio_venta_m2"]),
                "fuente": m.get("source"),               # "mercado" | "estimado"
                "confianza": m.get("confianza"),         # alta | media | baja
                "es_estimado": bool(m.get("es_estimado")),
                "muestra_n": m.get("muestra_n"),
            }
    except Exception as e:
        log.warning(f"[valoracion] market {colonia_id}: {e}")
    # Último recurso honesto: valor de suelo catastral (NO es precio de venta, se marca).
    if valor_suelo_m2:
        return {"valor": round(valor_suelo_m2), "fuente": "catastro_suelo",
                "confianza": "baja", "es_estimado": True,
                "nota": "valor de suelo catastral (no precio de venta)"}
    return {"valor": None, "fuente": None, "confianza": None, "es_estimado": True}


async def get_valoracion(db, colonia_id: str) -> Dict[str, Any]:
    """Valoración pública de una colonia para el panel del mapa (Fase 2).

    Devuelve precio de mercado $/m² (con fuente+confianza), valor catastral del suelo, y la
    plusvalía anual derivada del índice SHF de su ALCALDÍA (serie + serie de referencia de la
    alcaldía). Fail-soft: cualquier campo puede ser None sin tumbar el resto.
    """
    meta = await _colonia_meta(db, colonia_id)
    name = meta.get("name")
    alcaldia = meta.get("alcaldia")

    # Calidad de zona (promedio de scores_reales) — insumo del mini-AVM.
    calidad: Optional[float] = None
    sr = meta.get("scores_reales") or {}
    vals = [v for v in sr.values() if isinstance(v, (int, float))]
    if vals:
        calidad = round(sum(vals) / len(vals))

    # Valor catastral del suelo $/m² (oficial SIGCDMX, ya precomputado por colonia_id).
    valor_catastral_m2: Optional[float] = None
    try:
        vc = await db.colonia_catastro_byid.find_one(
            {"colonia_id": colonia_id}, {"_id": 0, "valor_suelo_m2": 1})
        valor_catastral_m2 = (vc or {}).get("valor_suelo_m2")
    except Exception as e:
        log.warning(f"[valoracion] catastro {colonia_id}: {e}")

    # Precio de mercado $/m² (mejor capa disponible).
    market = await _market_m2(db, colonia_id, valor_catastral_m2, calidad)

    # Plusvalía anual derivada del índice SHF de la alcaldía (misma serie sirve de referencia).
    pv = await _plusvalia_alcaldia(db, alcaldia)
    plusvalia = {
        "series": pv.get("series") or [],
        "fuente": pv.get("fuente"),
        "es_estimado": pv.get("es_estimado", True),
    }
    # La plusvalía de la colonia se DERIVA de la de su alcaldía → misma serie, marcada como referencia.
    alcaldia_plusvalia = {
        "alcaldia": pv.get("alcaldia_indice"),
        "es_propio": pv.get("es_propio"),
        "series": pv.get("series") or [],
        "plusvalia_anual_pct": pv.get("plusvalia_anual_pct"),
        "fuente": pv.get("fuente"),
    }

    return {
        "colonia_id": colonia_id,
        "name": name,
        "alcaldia": alcaldia,
        "market_m2": market,                        # {valor, fuente, confianza, es_estimado, ...}
        "valor_catastral_m2": valor_catastral_m2,   # $/m² de suelo (oficial) o None
        "plusvalia": plusvalia,                      # serie anual derivada de la alcaldía
        "alcaldia_plusvalia": alcaldia_plusvalia,    # referencia explícita del índice de la alcaldía
        "computed_at": _iso(),
    }


async def upsert_valoracion(db, colonia_id: str) -> Optional[Dict[str, Any]]:
    """Calcula y persiste la valoración de una colonia en `colonia_valoracion` (idempotente)."""
    doc = await get_valoracion(db, colonia_id)
    if not doc.get("name"):
        return None  # colonia inexistente / sin metadata → no sembrar basura
    await db.colonia_valoracion.update_one(
        {"colonia_id": colonia_id}, {"$set": doc}, upsert=True)
    return doc
