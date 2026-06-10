"""
unidad_insights_engine — F2.3 · Prende los campos vacíos del átomo de unidad.
═══════════════════════════════════════════════════════════════════════════════
Por unidad, calcula y "enciende" lo que el esquema ya tenía pero vacío:
  • prob_venta v2 — precio/demanda/tamaño + ENCAJE de producto con el Grafo (F2.1).
  • inversión — renta mensual + yield + plusvalía + ROI, reusando el baseline del
    simulador (zone_score → tier → RENTAL_YIELDS + plusvalía AVM/zona).
  • días en mercado — desde la fecha de alta comercial de la unidad.
Reusa motores existentes (cero reinvención), bandas honestas, FAIL-OPEN. Cierra ciclo:
la demanda real (Grafo) afina la probabilidad de venta de cada unidad.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

log = logging.getLogger("dmx.unidad_insights")


def _to_dt(v):
    if not v:
        return None
    if isinstance(v, datetime):
        return v if v.tzinfo else v.replace(tzinfo=timezone.utc)
    try:
        d = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except Exception:
        return None


def _unit_price(u):
    c = u.get("commercial") or {}
    return (c.get("precio_cierre_mxn") or c.get("precio_lista_mxn")
            or u.get("price") or u.get("price_mxn") or u.get("precio"))


def _unit_m2(u):
    a = u.get("areas") or {}
    return (a.get("m2_privativo") or a.get("m2_construido")
            or u.get("m2") or u.get("m2_construido") or u.get("area_total") or u.get("area"))


def _unit_rec(u):
    i = u.get("interior") or {}
    r = i.get("recamaras")
    if r is None:
        r = u.get("recamaras")
    if r is None:
        r = u.get("bedrooms")
    return r


def _band_prob(p):
    if p >= 0.70:
        return ("alta", "Muy Probable", "verde")
    if p >= 0.50:
        return ("media", "Probable", "verde")
    if p >= 0.35:
        return ("media", "Posible", "ambar")
    return ("baja", "Difícil", "rojo")


async def unit_insights(db, dev: dict, unit: dict) -> Dict[str, Any]:
    """Enriquece UNA unidad con prob_venta v2 + inversión + días en mercado. FAIL-OPEN."""
    colonia_id = (unit.get("colonia_id") or (unit.get("geo") or {}).get("colonia_id")
                  or dev.get("colonia_id") or "")
    price = _unit_price(unit)
    m2 = _unit_m2(unit)
    rec = _unit_rec(unit)

    # ── prob_venta v2 (con ENCAJE de producto del Grafo) ──
    p = 0.45
    factores = []
    demanda_total = 0
    try:
        from grafo_comprador_engine import build_grafo
        g = await build_grafo(db, colonia_id=colonia_id)
        cols = g.get("colonias") or []
        if cols:
            col = cols[0]
            demanda_total = col.get("demanda_total") or 0
            segs = col.get("segmentos") or []
            tot = sum(s.get("demanda", 0) for s in segs)
            if tot and rec is not None:
                match = sum(s.get("demanda", 0) for s in segs
                            if (s.get("producto") or {}).get("recamaras") == rec)
                product_fit = match / tot
                p += (product_fit - 0.4) * 0.4
                factores.append(f"Encaja con el {int(product_fit * 100)}% de la demanda de la zona")
            if demanda_total > 0:
                p += min(0.15, demanda_total / 100 * 0.15)
                factores.append(f"{demanda_total} búsquedas activas en la colonia")
    except Exception as e:
        log.warning(f"[unit_insights] grafo fail-open: {e}")
    if m2:
        if m2 < 90:
            p += 0.08
            factores.append("Tamaño líquido (menos de 90 m²)")
        elif m2 > 150:
            p -= 0.05
            factores.append("Tamaño grande (menos líquido)")
    p = max(0.05, min(0.95, round(p, 3)))
    nivel, etiqueta, color = _band_prob(p)
    prob = {"valor": round(p * 100), "nivel": nivel, "etiqueta": etiqueta, "color": color,
            "factores": factores, "es_estimado": demanda_total < 3, "metodo": "heuristic_v2_grafo"}

    # ── inversión (renta + plusvalía, reusa baseline del simulador) ──
    inversion = None
    try:
        if price and colonia_id:
            from investment_simulator_engine import get_colonia_baseline, RENTAL_YIELDS, DEFAULT_RENTAL_YIELD
            base = await get_colonia_baseline(db, colonia_id)
            tier = base.get("tier_zona") or "B"
            yld = RENTAL_YIELDS.get(tier, DEFAULT_RENTAL_YIELD)   # fracción anual bruta
            plus = base.get("base_aprec_anual_pct")               # ya en %
            inversion = {
                "renta_mensual_estimada": round(price * yld / 12),
                "yield_bruto_anual_pct": round(yld * 100, 1),
                "plusvalia_anual_pct": plus,
                "roi_anual_pct": round(yld * 100 + (plus or 0), 1),
                "tier_zona": tier,
                "es_estimado": base.get("zone_score") is None,
            }
    except Exception as e:
        log.warning(f"[unit_insights] inversión fail-open: {e}")

    # ── días en mercado ──
    dias = None
    c = unit.get("commercial") or {}
    alta = _to_dt(c.get("fecha_alta"))
    if alta:
        dias = max(0, (datetime.now(timezone.utc) - alta).days)

    return {
        "unit_id": unit.get("unit_id") or unit.get("id"),
        "prob_venta": prob,
        "inversion": inversion,
        "dias_en_mercado": dias,
        "colonia_id": colonia_id,
    }
