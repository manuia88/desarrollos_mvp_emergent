"""PLAYBOOK DE PRECIOS — la huella comercial de cada desarrollador.

De la bitácora (oferta_timeline) se leen los AJUSTES: días en que el dev movió precios
(varias unidades el mismo día = decisión comercial, no ruido). Cruzado con las ventas
acumuladas antes de cada ajuste sale su política: "sube ~X% cada ~N ventas".

Sirve doble: al comprador ("el próximo ajuste viene pronto") y al dev (benchmark de su
política vs la zona). Honesto por diseño: con 1 sola lista responde "se activa con la
2ª lista" — nunca inventa una regla sin ≥2 ajustes observados.

Lógica pura (testeable); Mongo solo en playbook_desarrollo(). $0, sin IA.
"""
from __future__ import annotations

from collections import defaultdict
from typing import Any, Dict, List


def detectar_ajustes(eventos: List[Dict[str, Any]], min_unidades: int = 2) -> List[Dict[str, Any]]:
    """Cambios de precio por unidad, agrupados por día. Un día con ≥min_unidades
    unidades movidas = un AJUSTE del dev (mismo % ≈ decisión de lista)."""
    por_unidad: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for e in eventos:
        if e.get("unit_id") and e.get("precio"):
            por_unidad[e["unit_id"]].append(e)
    cambios_por_dia: Dict[str, List[float]] = defaultdict(list)
    for evs in por_unidad.values():
        evs.sort(key=lambda e: str(e.get("ts")))
        for prev, act in zip(evs, evs[1:]):
            if prev["precio"] and act["precio"] and act["precio"] != prev["precio"]:
                pct = (act["precio"] - prev["precio"]) * 100 / prev["precio"]
                cambios_por_dia[str(act.get("ts"))[:10]].append(pct)
    ajustes = []
    for dia, pcts in sorted(cambios_por_dia.items()):
        if len(pcts) >= min_unidades:
            ajustes.append({"fecha": dia, "unidades": len(pcts),
                            "delta_pct": round(sum(pcts) / len(pcts), 2)})
    return ajustes


def ventas_antes_de(eventos: List[Dict[str, Any]], fecha: str) -> int:
    """Ventas acumuladas (disponible→no disponible) ANTES de esa fecha."""
    por_unidad: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for e in eventos:
        if e.get("unit_id"):
            por_unidad[e["unit_id"]].append(e)
    n = 0
    for evs in por_unidad.values():
        evs.sort(key=lambda e: str(e.get("ts")))
        for prev, act in zip(evs, evs[1:]):
            if prev.get("disponible") and not act.get("disponible") \
                    and str(act.get("ts"))[:10] < fecha:
                n += 1
    return n


def regla_del_dev(eventos: List[Dict[str, Any]]) -> Dict[str, Any]:
    """La política estimada: % promedio por ajuste y cada cuántas ventas. Honesta:
    sin ≥2 ajustes no hay regla, hay una nota."""
    ajustes = detectar_ajustes(eventos)
    if len(ajustes) < 2:
        return {"ajustes": ajustes, "regla": None,
                "nota": ("1 ajuste observado — la regla se estima con el 2º"
                         if ajustes else "aún sin ajustes de precio en la bitácora — "
                                         "se activa cuando llegue la 2ª lista")}
    subidas = [a for a in ajustes if a["delta_pct"] > 0]
    delta_prom = round(sum(a["delta_pct"] for a in subidas) / len(subidas), 2) if subidas else 0
    ventas_entre = []
    for a, b in zip(ajustes, ajustes[1:]):
        ventas_entre.append(ventas_antes_de(eventos, b["fecha"]) -
                            ventas_antes_de(eventos, a["fecha"]))
    ventas_prom = round(sum(ventas_entre) / len(ventas_entre), 1) if ventas_entre else None
    return {"ajustes": ajustes, "nota": None,
            "regla": {"sube_pct_prom": delta_prom, "cada_ventas": ventas_prom,
                      "n_ajustes": len(ajustes),
                      "humano": (f"sube ~{delta_prom}% por ajuste"
                                 + (f", aprox. cada {ventas_prom} ventas"
                                    if ventas_prom else ""))}}


async def playbook_desarrollo(db, development_id: str) -> Dict[str, Any]:
    eventos = await db.oferta_timeline.find({"dev_id": development_id},
                                            {"_id": 0}).sort("ts", 1).to_list(20000)
    return {"development_id": development_id, "n_eventos": len(eventos),
            **regla_del_dev(eventos)}
