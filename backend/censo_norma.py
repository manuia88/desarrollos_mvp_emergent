"""CENSO COMO NORMA — el juez muestral (20 unidades) queda de respaldo; la norma es
censar el 100% al peso, determinista y $0, cada vez que hay materia para censar.

La materia: vigia_listas_snapshot (el peek guarda CADA versión de CADA lista con sus
unidades y precios). El censo compara ese snapshot contra la BD, unidad por unidad:
precio al peso (±$1) y coherencia de estado (la lista ofrece → disponible; sombreada →
apartada). Un censo con fallas > 0 es ERROR de salud, no aviso.
"""
from __future__ import annotations

import secrets
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from lista_peek import norm_unidad


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def comparar(snapshot_unidades: Dict[str, Any],
             bd_unidades: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Puro y testeable: snapshot {norm: {unidad, precio, status}} vs unidades de BD."""
    bd = {norm_unidad(u.get("unit_number")): u for u in bd_unidades}
    fallas, cotejadas = [], 0
    for k, s in snapshot_unidades.items():
        u = bd.get(k)
        if u is None:
            continue                    # la lista puede cubrir solo una torre
        cotejadas += 1
        precio_lista = s.get("precio")
        if precio_lista is not None:
            if u.get("price") is None or abs(float(u["price"]) - float(precio_lista)) > 1:
                fallas.append({"unidad": s.get("unidad") or k, "campo": "precio",
                               "lista": precio_lista, "bd": u.get("price")})
            # la lista la OFRECE con precio → en BD no puede estar vendida
            if (u.get("status") or "") == "vendido":
                fallas.append({"unidad": s.get("unidad") or k, "campo": "estado",
                               "lista": "en oferta", "bd": "vendido"})
        if s.get("status") == "no_disponible" and \
                (u.get("status") or "disponible") == "disponible":
            fallas.append({"unidad": s.get("unidad") or k, "campo": "estado",
                           "lista": "sombreada/apartada", "bd": "disponible"})
    return {"cotejadas": cotejadas, "fallas": fallas}


async def censo_dev(db, development_id: str) -> Optional[Dict[str, Any]]:
    """Censa un desarrollo contra el snapshot MÁS RECIENTE de cada lista que le
    corresponda (≥3 unidades en común). Registra la corrida en db.censos."""
    bd_unidades = await db.units.find(
        {"development_id": development_id},
        {"_id": 0, "unit_number": 1, "price": 1, "status": 1}).to_list(3000)
    if not bd_unidades:
        return None
    llaves_bd = {norm_unidad(u.get("unit_number")) for u in bd_unidades}
    # snapshot más reciente por archivo
    vistos, resultados = set(), {"cotejadas": 0, "fallas": []}
    n_listas = 0
    async for s in db.vigia_listas_snapshot.find({}, {"_id": 0}).sort("ts", -1):
        if s["archivo_id"] in vistos:
            continue                    # solo la versión más nueva de cada lista
        vistos.add(s["archivo_id"])
        unidades = s.get("unidades") or {}
        if len(set(unidades) & llaves_bd) < 3:
            continue                    # esa lista no es de este desarrollo
        r = comparar(unidades, bd_unidades)
        resultados["cotejadas"] += r["cotejadas"]
        resultados["fallas"] += [{**f, "archivo": s.get("nombre")} for f in r["fallas"]]
        n_listas += 1
    if not n_listas:
        return None                     # sin lista vigilada aún: no hay materia
    doc = {"id": f"censo_{secrets.token_urlsafe(8)}", "development_id": development_id,
           "ts": _now(), "listas": n_listas, "cotejadas": resultados["cotejadas"],
           "n_fallas": len(resultados["fallas"]), "fallas": resultados["fallas"][:50]}
    await db.censos.insert_one(dict(doc))
    return doc


async def censo_catalogo(db) -> Dict[str, Any]:
    """El censo de TODO lo censable. Corre tras cada ronda con cambios y tras ingestas."""
    out = {"devs_censados": 0, "cotejadas": 0, "con_fallas": []}
    async for d in db.developments.find({}, {"_id": 0, "id": 1, "name": 1}):
        r = await censo_dev(db, d["id"])
        if not r:
            continue
        out["devs_censados"] += 1
        out["cotejadas"] += r["cotejadas"]
        if r["n_fallas"]:
            out["con_fallas"].append({"dev": d.get("name"), "fallas": r["n_fallas"]})
    return out
