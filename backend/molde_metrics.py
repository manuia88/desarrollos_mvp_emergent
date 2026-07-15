"""MÉTRICAS POR MOLDE — el agregador que convierte el Catálogo de Moldes en series de tiempo.

El molde (dmx_prototypes, permanente desde el conciliador v3) es el nivel entre la unidad y el
proyecto — y es donde vive el dato que nadie más tiene:
  · VELOCIDAD por tipo: qué molde se vende más rápido (colocación = foto de stock;
    absorción = flujo, SOLO con ≥2 fotos en el tiempo — regla founder: no confundirlas).
  · CURVA DE PRECIO por molde: precio/m² promedio por fecha (de oferta_timeline).
  · PREMIUM POR PISO: dentro de un molde el plano es idéntico → la diferencia de $/m²
    entre pisos es SOLO altura/vista. La variable limpia de la ecuación del precio.
  · BIOGRAFÍA: nació / se agotó / revivió (fechas del conciliador).

Lógica pura en funciones testeables; el acceso a Mongo vive solo en metricas_desarrollo().
Cero IA, cero llamadas externas: $0.
"""
from __future__ import annotations

from collections import defaultdict
from typing import Any, Dict, List, Optional

VENDIDO = {"vendida", "vendido", "sold", "no_disponible"}


# ─── lógica pura (aquí viven los tests) ───────────────────────────────────────
def colocacion(units: List[Dict[str, Any]]) -> Dict[str, Any]:
    """FOTO de stock (1 lista basta): cuántas del molde ya no están disponibles."""
    total = len(units)
    vendidas = sum(1 for u in units if (u.get("status") or "").lower() in VENDIDO)
    return {"total": total, "vendidas": vendidas,
            "pct": round(vendidas * 100 / total, 1) if total else None}


def absorcion(eventos: List[Dict[str, Any]]) -> Dict[str, Any]:
    """FLUJO (requiere ≥2 fotos): transiciones disponible→no disponible por unidad,
    expresadas en unidades/mes. Con una sola foto se responde honesto: None."""
    por_unidad: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for e in eventos:
        if e.get("unit_id"):
            por_unidad[e["unit_id"]].append(e)
    ventas: List[Any] = []       # timestamps de transición a vendida
    fechas = set()
    for evs in por_unidad.values():
        evs.sort(key=lambda e: str(e.get("ts")))
        for prev, act in zip(evs, evs[1:]):
            fechas.add(str(prev.get("ts"))[:10]); fechas.add(str(act.get("ts"))[:10])
            if prev.get("disponible") and not act.get("disponible"):
                ventas.append(act.get("ts"))
    if len(fechas) < 2:
        return {"ventas_observadas": 0, "unidades_mes": None,
                "nota": "se activa con la 2ª lista (flujo ≠ foto)"}
    dias = _dias_entre(min(fechas), max(fechas))
    upm = round(len(ventas) * 30 / dias, 2) if dias >= 1 else None
    return {"ventas_observadas": len(ventas), "unidades_mes": upm,
            "ventana_dias": dias, "nota": None}


def dias_para_vender(eventos: List[Dict[str, Any]]) -> Dict[str, Any]:
    """SUPERVIVENCIA (Kaplan-Meier): cuántos días tarda en venderse una unidad.
    El promedio simple MIENTE (ignora a las que siguen sin venderse); aquí las
    no-vendidas cuentan como censura, que es la forma honesta. Requiere ≥2 fotos."""
    por_unidad: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    fechas = set()
    for e in eventos:
        if e.get("unit_id"):
            por_unidad[e["unit_id"]].append(e)
            fechas.add(str(e.get("ts"))[:10])
    if len(fechas) < 2:
        return {"mediana_dias": None, "vendidas": 0, "en_venta": len(por_unidad),
                "nota": "se activa con la 2ª lista (necesita ver pasar el tiempo)"}
    fin_ventana = max(fechas)
    duraciones: List[Any] = []            # (días, se_vendió)
    for evs in por_unidad.values():
        evs.sort(key=lambda e: str(e.get("ts")))
        inicio = str(evs[0].get("ts"))[:10]
        vendida = None
        for prev, act in zip(evs, evs[1:]):
            if prev.get("disponible") and not act.get("disponible"):
                vendida = str(act.get("ts"))[:10]
                break
        fin = vendida or fin_ventana
        duraciones.append((max(_dias_entre(inicio, fin), 0), vendida is not None))
    # Kaplan-Meier: la curva cae solo cuando hay venta, pesada por cuántas seguían
    # "en riesgo" (sin vender) ese día. En EMPATE de fecha las ventas se procesan
    # ANTES que las censuras (convención KM — si no, la curva colapsa falsamente).
    n_riesgo, s, mediana = len(duraciones), 1.0, None
    for dias, se_vendio in sorted(duraciones, key=lambda d: (d[0], not d[1])):
        if se_vendio:
            s *= (1 - 1 / n_riesgo)
            if s <= 0.5 and mediana is None:
                mediana = dias
        n_riesgo -= 1
    vendidas = sum(1 for _, v in duraciones if v)
    return {"mediana_dias": mediana, "vendidas": vendidas,
            "en_venta": len(duraciones) - vendidas,
            "nota": None if mediana is not None else
            ("aún no se estima: más de la mitad sigue disponible"
             if duraciones else "sin unidades observadas")}


def curva_precio(eventos: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Precio/m² promedio del molde por día (los puntos de la curva)."""
    por_dia: Dict[str, List[float]] = defaultdict(list)
    for e in eventos:
        if e.get("pm2"):
            por_dia[str(e.get("ts"))[:10]].append(float(e["pm2"]))
    return [{"fecha": d, "pm2": round(sum(v) / len(v)), "n": len(v)}
            for d, v in sorted(por_dia.items())]


def premium_por_piso(units: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Dentro del molde: $/m² promedio por piso y su % vs el piso más bajo con dato.
    Plano idéntico → el delta es pura altura/vista."""
    por_piso: Dict[int, List[float]] = defaultdict(list)
    for u in units:
        piso, precio = u.get("level"), u.get("price_mxn") or u.get("price")
        m2 = u.get("size_m2") or u.get("m2_total")
        if piso is not None and precio and m2:
            por_piso[int(piso)].append(float(precio) / float(m2))
    if len(por_piso) < 2:
        return []
    filas = [{"piso": p, "pm2": round(sum(v) / len(v)), "n": len(v)}
             for p, v in sorted(por_piso.items())]
    base = filas[0]["pm2"]
    for f in filas:
        f["premium_pct"] = round((f["pm2"] - base) * 100 / base, 1) if base else None
    return filas


def _dias_entre(iso_a: str, iso_b: str) -> int:
    from datetime import date
    a = date.fromisoformat(iso_a[:10]); b = date.fromisoformat(iso_b[:10])
    return abs((b - a).days)


def yield_bruto(units: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """RENTAS (rieles 07-15): cuando el catálogo traiga renta_mxn (el inventario de rentas
    de CLASS ya existe en su Drive), el yield REAL nace solo: renta anual ÷ precio."""
    pares = [(u.get("renta_mxn"), u.get("price_mxn") or u.get("price")) for u in units
             if u.get("renta_mxn") and (u.get("price_mxn") or u.get("price"))]
    if not pares:
        return None
    ys = [r * 12 / p * 100 for r, p in pares]
    return {"n": len(pares), "yield_bruto_pct": round(sum(ys) / len(ys), 2),
            "renta_prom": round(sum(r for r, _ in pares) / len(pares))}


def metricas_de_molde(molde: Dict[str, Any], units: List[Dict[str, Any]],
                      eventos: List[Dict[str, Any]]) -> Dict[str, Any]:
    return {
        "prototype_id": molde.get("prototype_id"), "nombre": molde.get("nombre"),
        "huella": molde.get("huella"), "estado": molde.get("estado") or "activo",
        "biografia": {"nacio": molde.get("nacio_at"), "agoto": molde.get("agoto_at"),
                      "revivio": molde.get("revivio_at")},
        "colocacion": colocacion(units),
        "absorcion": absorcion(eventos),
        "dias_para_vender": dias_para_vender(eventos),
        "curva_precio": curva_precio(eventos),
        "premium_piso": premium_por_piso(units),
        "renta": yield_bruto(units),
    }


# ─── acceso a datos (única función con Mongo) ─────────────────────────────────
async def metricas_desarrollo(db, development_id: str) -> Dict[str, Any]:
    """Todas las métricas de todos los moldes de un desarrollo, en una llamada.
    Consumidores: Expediente (UI), Precio de Equilibrio (comps por molde), El Parte."""
    moldes = await db.dmx_prototypes.find({"development_id": development_id},
                                          {"_id": 0}).to_list(200)
    from unidades_efectivas import unidades_efectivas
    units = await unidades_efectivas(db, {"development_id": development_id})
    eventos = await db.oferta_timeline.find({"dev_id": development_id},
                                            {"_id": 0}).sort("ts", 1).to_list(20000)
    ev_por_unidad: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for e in eventos:
        ev_por_unidad[e.get("unit_id") or ""].append(e)
    out = []
    for m in sorted(moldes, key=lambda x: x.get("prototype_id") or ""):
        us = [u for u in units if u.get("prototype_id") == m.get("prototype_id")]
        evs = [e for u in us for e in ev_por_unidad.get(u.get("id") or "", [])]
        out.append(metricas_de_molde(m, us, evs))
    return {"development_id": development_id, "moldes": out, "n_moldes": len(out),
            "supervivencia": dias_para_vender(eventos)}   # el dev completo, no solo por molde
