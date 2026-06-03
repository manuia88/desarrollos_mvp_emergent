"""
DMX · Fase 3.2 — LENTE DEL DEV: tu slice vs MERCADO ANÓNIMO
═══════════════════════════════════════════════════════════════════════════════
El dev ve SU desempeño contra el mercado de su zona, SIN ver dato crudo ajeno:
para cada (colonia × tipología) donde el dev tiene unidades, compara TU absorción y
TU $/m² contra el agregado anónimo del mercado ("tu 2-rec vende 14% vs el mercado 18%
→ vas más lento" · "tu $/m² 4% sobre el mercado"). Multi-tenant: el slice = los
desarrollos del usuario (tenant_scope); el mercado = todas las unidades, agregadas.
"""
from __future__ import annotations

import math
from collections import defaultdict
from typing import Any, Dict, List

from dmx_unit_schema import COLLECTIONS
import dmx_cube_feed as feed

UNITS = COLLECTIONS["units"]

_SOLD = {"vendido", "sold", "cerrado", "closed"}
_AVAIL = {"disponible", "available"}


def _mean(v: List[float]):
    return round(sum(v) / len(v)) if v else None


async def benchmark(db, user) -> Dict[str, Any]:
    """Tu desempeño vs mercado anónimo por (colonia × tipología). Solo celdas donde participas."""
    import tenant_scope
    if tenant_scope.is_superadmin(user):
        dev_ids = None                      # superadmin no tiene 'slice'; ve todo
    else:
        dev_ids = set(tenant_scope.user_dev_ids(user))

    cells: Dict[tuple, Dict[str, Any]] = defaultdict(
        lambda: {"mk_total": 0, "mk_sold": 0, "mk_avail": 0, "mk_pm2": [],
                 "my_total": 0, "my_sold": 0, "my_avail": 0, "my_pm2": []})

    async for a in db[UNITS].find({}, {"_id": 0, "development_id": 1, "tipologia": 1,
                                       "geo.colonia_id": 1, "areas": 1, "commercial": 1}):
        z = (a.get("geo") or {}).get("colonia_id") or "—"
        t = a.get("tipologia") or "—"
        com = a.get("commercial") or {}
        areas = a.get("areas") or {}
        st = (com.get("status") or "").lower()
        precio = com.get("precio_cierre_mxn") or com.get("precio_lista_mxn")
        m2 = areas.get("m2_privativo") or areas.get("m2_construido")
        pm2 = (precio / m2) if (precio and m2 and m2 > 0) else None
        c = cells[(z, t)]
        c["mk_total"] += 1
        if st in _SOLD:
            c["mk_sold"] += 1
        elif st in _AVAIL:
            c["mk_avail"] += 1
        if pm2:
            c["mk_pm2"].append(pm2)
        mine = dev_ids is not None and a.get("development_id") in dev_ids
        if mine:
            c["my_total"] += 1
            if st in _SOLD:
                c["my_sold"] += 1
            elif st in _AVAIL:
                c["my_avail"] += 1
            if pm2:
                c["my_pm2"].append(pm2)

    out: List[Dict[str, Any]] = []
    for (z, t), c in cells.items():
        if c["my_total"] == 0:
            continue
        my_abs = round(100 * c["my_sold"] / c["my_total"], 1) if c["my_total"] else 0
        mk_abs = round(100 * c["mk_sold"] / c["mk_total"], 1) if c["mk_total"] else 0
        my_pm2 = _mean(c["my_pm2"]); mk_pm2 = _mean(c["mk_pm2"])
        price_delta = round((my_pm2 / mk_pm2 - 1) * 100, 1) if (my_pm2 and mk_pm2) else None
        abs_delta = round(my_abs - mk_abs, 1)
        # veredicto en lenguaje humano
        if abs_delta >= 5:
            v = f"Vendes más rápido que el mercado (+{abs_delta} pts)"
        elif abs_delta <= -5:
            v = f"Vas más lento que el mercado ({abs_delta} pts) — revisa precio/marketing"
        elif price_delta is not None and price_delta >= 8:
            v = f"Estás {price_delta}% sobre el mercado — justifica o ajusta"
        elif price_delta is not None and price_delta <= -8:
            v = f"Estás {abs(price_delta)}% bajo el mercado — margen para subir"
        else:
            v = "En línea con el mercado"
        out.append({
            "colonia": z, "tipologia": t,
            "tu": {"unidades": c["my_total"], "absorcion_pct": my_abs, "precio_m2": my_pm2,
                   "disponibles": c["my_avail"]},
            "mercado": {"unidades": c["mk_total"], "absorcion_pct": mk_abs, "precio_m2": mk_pm2},
            "abs_delta_pts": abs_delta, "precio_delta_pct": price_delta, "veredicto": v,
        })
    out.sort(key=lambda x: abs(x["abs_delta_pts"]), reverse=True)
    return {"is_superadmin": dev_ids is None, "cells": out, "count": len(out)}
