"""
DMX · Fase 2.2 — DEMANDA: demand-gap por zona×tipología + prob. de venta por unidad
═══════════════════════════════════════════════════════════════════════════════
Cierra el ciclo "dónde construir y qué unidad mover":
  · demand_gap()  — cruza la DEMANDA de cada colonia (behavioral_events view_zone,
    fallback proxy) con la OFERTA por (colonia × TIPOLOGÍA) del cubo. Responde la
    visión del founder: "dónde hay demanda de 1-rec y CERO inventario = construir".
    Granular por tipología (el demand_supply_gap existente es solo por colonia).
  · score_close_probabilities() — prob_venta heurística por unidad disponible y la
    escribe en el átomo (demand.prob_venta). Alimenta al Cerebro (2.4) y al cockpit.
    Heurística v1 que se reemplaza por ML cuando lleguen cierres reales (2.3).

Dormant-aware: si no hay eventos de demanda, marca demand_source='proxy'.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from dmx_unit_schema import COLLECTIONS
import cube_olap_engine as olap

UNITS = COLLECTIONS["units"]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso() -> str:
    return _now().isoformat()


async def _zone_demand(db) -> tuple:
    """Demanda por colonia (vistas de zona últimos 30d). Fallback proxy COLONIAS.inventory → is_proxy=True.
    P1.5 · reconexión a la forma canónica de behavioral_events (timestamp Date + metadata.zone_slug |
    page público /colonia/<slug>); antes leía event_type='view_zone'/'ts' (campos inexistentes) → SIEMPRE
    caía al proxy de inventario (mezclaba stock con flujo)."""
    demand: Dict[str, float] = {}
    try:
        zone_expr = {"$ifNull": ["$metadata.zone_slug", {"$ifNull": ["$metadata.colonia_slug",
            {"$let": {
                "vars": {"m": {"$regexFind": {"input": {"$ifNull": ["$page", ""]},
                                              "regex": "/colonia/([a-z0-9-]+)"}}},
                "in": {"$arrayElemAt": [{"$ifNull": ["$$m.captures", []]}, 0]},
            }}]}]}
        cur = db.behavioral_events.aggregate([
            {"$match": {"timestamp": {"$gte": _now() - timedelta(days=30)}}},
            {"$group": {"_id": zone_expr, "n": {"$sum": 1}}},
            {"$match": {"_id": {"$nin": [None, ""]}}},
        ])
        async for r in cur:
            if r.get("_id"):
                demand[r["_id"]] = float(r["n"])
    except Exception:
        pass
    is_proxy = not demand
    if is_proxy:
        try:
            from data_seed import COLONIAS
            for c in COLONIAS:
                demand[c["id"]] = float(c.get("inventory", 50))
        except Exception:
            pass
    return demand, is_proxy


async def demand_gap(db, top: int = 25) -> Dict[str, Any]:
    """Gap demanda-oferta por (colonia × tipología). Rankea oportunidades de construcción."""
    cc = await olap.query_cross_cut(db, dimensions=["zone", "tipologia"], filters={})
    demand, is_proxy = await _zone_demand(db)
    dmax = max(demand.values()) if demand else 1.0

    colonia_supply: Dict[str, int] = defaultdict(int)
    cells: List[Dict[str, Any]] = []
    for c in cc["matrix"]:
        z, t, k = c["zone"], c["tipologia"], c["kpis"]
        avail = k.get("units_available") or 0
        colonia_supply[z] += avail
        cells.append({"colonia": z, "tipologia": t, "available": avail,
                      "sold": k.get("units_sold") or 0, "absorcion_pct": k.get("absorcion_pct")})

    out: List[Dict[str, Any]] = []
    for cell in cells:
        z = cell["colonia"]
        dem_norm = (demand.get(z, 0) / dmax) if dmax else 0.0
        sup_share = cell["available"] / (colonia_supply[z] or 1)
        gap = round(dem_norm - sup_share, 3)           # alto = demanda alta, poca oferta de esta tipología
        avail = cell["available"]
        ab = cell["absorcion_pct"] or 0
        if avail == 0 and dem_norm > 0.3:
            verdict = "Demanda sin inventario → construir"
        elif ab >= 20 and avail <= 3:
            verdict = "Se agota rápido → ventana para construir/subir"
        elif sup_share > 0.5:
            verdict = "Sobreoferta de esta tipología"
        else:
            verdict = "Sostener"
        out.append({**cell, "zone_demand": demand.get(z, 0), "gap_score": gap, "verdict": verdict})

    out.sort(key=lambda x: x["gap_score"], reverse=True)
    return {"demand_source": "proxy" if is_proxy else "behavioral_events",
            # Honestidad: si aún no hay búsquedas/vistas reales, la demanda es un estimado
            # (proxy de inventario) y se auto-cambia al llegar eventos reales de la zona.
            "es_estimado": is_proxy,
            "lectura_datos": ("Demanda estimada — aún sin búsquedas reales en estas zonas"
                              if is_proxy else "Demanda con datos reales de búsqueda/vistas"),
            "cells": out[:top], "total_cells": len(out), "computed_at": _iso()}


async def _colonia_median_pm2(db) -> Dict[str, float]:
    """Mediana de precio/m² por colonia (desde el átomo) para comparar precio de unidad."""
    by_zone: Dict[str, List[float]] = defaultdict(list)
    async for a in db[UNITS].find({}, {"_id": 0, "geo.colonia_id": 1, "areas": 1, "commercial": 1}):
        com = a.get("commercial") or {}
        areas = a.get("areas") or {}
        precio = com.get("precio_lista_mxn")
        m2 = areas.get("m2_privativo") or areas.get("m2_construido")
        z = (a.get("geo") or {}).get("colonia_id")
        if precio and m2 and m2 > 0 and z:
            by_zone[z].append(precio / m2)
    med: Dict[str, float] = {}
    for z, vals in by_zone.items():
        vals.sort()
        med[z] = vals[len(vals) // 2]
    return med


def _unit_prob(a: Dict[str, Any], medians: Dict[str, float], demand: Dict[str, float], dmax: float) -> float:
    """Prob. de venta heurística (0-1): + barato vs zona, + demanda de zona, + chico (líquido)."""
    com = a.get("commercial") or {}
    areas = a.get("areas") or {}
    geo = a.get("geo") or {}
    precio = com.get("precio_lista_mxn")
    m2 = areas.get("m2_privativo") or areas.get("m2_construido")
    z = geo.get("colonia_id")
    p = 0.45
    if precio and m2 and m2 > 0 and z and medians.get(z):
        pm2 = precio / m2
        ratio = pm2 / medians[z]                 # <1 = más barato que la mediana → más probable
        p += max(-0.25, min(0.25, (1 - ratio) * 0.6))
    if z and dmax:
        p += (demand.get(z, 0) / dmax) * 0.2     # zona caliente → más probable
    if m2:
        p += 0.1 if m2 < 90 else (-0.05 if m2 > 150 else 0)  # chico = más líquido
    return round(max(0.05, min(0.95, p)), 3)


async def score_close_probabilities(db, development_id: Optional[str] = None) -> Dict[str, Any]:
    """Calcula prob_venta por unidad DISPONIBLE y la escribe en el átomo (demand.prob_venta)."""
    medians = await _colonia_median_pm2(db)
    demand, _ = await _zone_demand(db)
    dmax = max(demand.values()) if demand else 1.0
    q: Dict[str, Any] = {"commercial.status": "disponible"}
    if development_id:
        q["development_id"] = development_id
    n = 0
    dist = {"alta": 0, "media": 0, "baja": 0}
    async for a in db[UNITS].find(q, {"_id": 0}):
        prob = _unit_prob(a, medians, demand, dmax)
        await db[UNITS].update_one(
            {"unit_id": a["unit_id"]},
            {"$set": {"demand.prob_venta": prob, "demand._prob_method": "heuristic_v1",
                      "demand._scored_at": _iso()}},
        )
        n += 1
        dist["alta" if prob >= 0.6 else "media" if prob >= 0.4 else "baja"] += 1
    return {"scored": n, "distribution": dist, "method": "heuristic_v1", "development_id": development_id}
