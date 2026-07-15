"""UNIDADES EFECTIVAS — la fusión canónica de las 3 puertas de entrada del inventario.

Una unidad puede nacer/cambiar por: (1) carga masiva (Drive/Vigía → units),
(2) edición superadmin (Torre → units directo), (3) PORTAL DEV (developer_unit_overrides,
capa aparte que el marketplace ya fusionaba pero los motores del catálogo NO — hueco de
universalidad cazado 07-15). Este helper es la ÚNICA fusión: todo motor que lea unidades
del catálogo (corte, ficha, métricas de molde, semáforo, torre) pasa por aquí, y el dato
que el dev editó en su portal se refleja en todos lados.
"""
from __future__ import annotations

from typing import Any, Dict, List

# los campos que el portal dev puede pisar (mismo contrato que routes/developer)
CAMPOS_OVERRIDE = ("status", "bodega", "parking_type", "parking_spots", "vista",
                   "m2_privative", "m2_balcony", "m2_terrace", "m2_roof_garden",
                   "m2_total", "bedrooms", "bathrooms", "price", "price_mxn",
                   "prototype", "level", "orientacion")


def fusionar(units: List[Dict[str, Any]],
             overrides: Dict[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Pura: units + {unit_id: override} → unidades efectivas (override gana campo a campo)."""
    if not overrides:
        return units
    out = []
    for u in units:
        ov = overrides.get(u.get("id"))
        if not ov:
            out.append(u)
            continue
        m = {**u}
        for f in CAMPOS_OVERRIDE:
            if ov.get(f) is not None:
                m[f] = ov[f]
        if ov.get("price") is not None and ov.get("price_mxn") is None:
            m["price_mxn"] = ov["price"]
        m["_editado_por_dev"] = True
        out.append(m)
    return out


async def unidades_efectivas(db, q: Dict[str, Any], limite: int = 20000) -> List[Dict[str, Any]]:
    """units(q) con los overrides del portal dev YA fusionados. Fail-open."""
    units = await db.units.find(q, {"_id": 0}).to_list(limite)
    if not units:
        return units
    try:
        dev_ids = list({u.get("development_id") for u in units if u.get("development_id")})
        overrides = {ov.get("unit_id"): ov async for ov in db.developer_unit_overrides.find(
            {"$or": [{"dev_id": {"$in": dev_ids}}, {"development_id": {"$in": dev_ids}}]},
            {"_id": 0})}
    except Exception:  # noqa: BLE001
        return units
    return fusionar(units, overrides)
