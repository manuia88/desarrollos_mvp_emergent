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


def metricas_de_molde(molde: Dict[str, Any], units: List[Dict[str, Any]],
                      eventos: List[Dict[str, Any]]) -> Dict[str, Any]:
    return {
        "prototype_id": molde.get("prototype_id"), "nombre": molde.get("nombre"),
        "huella": molde.get("huella"), "estado": molde.get("estado") or "activo",
        "biografia": {"nacio": molde.get("nacio_at"), "agoto": molde.get("agoto_at"),
                      "revivio": molde.get("revivio_at")},
        "colocacion": colocacion(units),
        "absorcion": absorcion(eventos),
        "curva_precio": curva_precio(eventos),
        "premium_piso": premium_por_piso(units),
    }


# ─── acceso a datos (única función con Mongo) ─────────────────────────────────
async def metricas_desarrollo(db, development_id: str) -> Dict[str, Any]:
    """Todas las métricas de todos los moldes de un desarrollo, en una llamada.
    Consumidores: Expediente (UI), Precio de Equilibrio (comps por molde), El Parte."""
    moldes = await db.dmx_prototypes.find({"development_id": development_id},
                                          {"_id": 0}).to_list(200)
    units = await db.units.find({"development_id": development_id}, {"_id": 0}).to_list(2000)
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
    return {"development_id": development_id, "moldes": out, "n_moldes": len(out)}


# ─── LA ESCALERA (07-15, orden founder: "por unidad, desarrollo, microzona, colonia,
# alcaldía, ciudad... TODAS las dimensiones") ─────────────────────────────────────────
# El mismo dato de molde, agregado en cada peldaño geográfico. La serie temporal fina
# (hora→año, cortes hipersegmentados) ya vive en market_timeline.evolucion() — aquí va
# el CORTE ACTUAL por nivel, con mix por tipo y premium por piso promedio.
NIVELES = ("desarrollo", "colonia", "alcaldia", "ciudad")


def _agrega_peldano(filas: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Suma un grupo de moldes (de uno o varios desarrollos) en un peldaño."""
    tot = sum((f.get("colocacion") or {}).get("total") or 0 for f in filas)
    ven = sum((f.get("colocacion") or {}).get("vendidas") or 0 for f in filas)
    upms = [f["absorcion"]["unidades_mes"] for f in filas
            if (f.get("absorcion") or {}).get("unidades_mes") is not None]
    pm2s = [f["curva_precio"][-1]["pm2"] for f in filas if f.get("curva_precio")]
    prems = [p["premium_pct"] for f in filas for p in (f.get("premium_piso") or [])
             if p.get("premium_pct")]
    mix: Dict[str, int] = {}
    agotados = 0
    for f in filas:
        rec = (f.get("huella") or "?").split("r_")[0]
        mix[f"{rec}R"] = mix.get(f"{rec}R", 0) + ((f.get("colocacion") or {}).get("total") or 0)
        if f.get("estado") == "agotado":
            agotados += 1
    return {"moldes": len(filas), "moldes_agotados": agotados,
            "unidades": tot, "vendidas": ven,
            "colocacion_pct": round(ven * 100 / tot, 1) if tot else None,
            "absorcion_u_mes": round(sum(upms), 2) if upms else None,
            "pm2_prom": round(sum(pm2s) / len(pm2s)) if pm2s else None,
            "premium_piso_prom_pct": round(sum(prems) / len(prems), 1) if prems else None,
            "mix_por_tipo": dict(sorted(mix.items()))}


async def escalera_mercado(db) -> Dict[str, Any]:
    """Todos los peldaños en una llamada: desarrollo → colonia → alcaldía → ciudad.
    (El peldaño unidad/molde vive en el Expediente; la microzona hereda de colonia_id.)"""
    devs = await db.developments.find({}, {"_id": 0, "id": 1, "name": 1, "colonia_name": 1,
                                           "colonia": 1, "colonia_id": 1,
                                           "alcaldia": 1}).to_list(500)
    por_nivel: Dict[str, Dict[str, List[Dict[str, Any]]]] = {n: {} for n in NIVELES}
    for d in devs:
        met = await metricas_desarrollo(db, d["id"])
        if not met["moldes"]:
            continue
        llaves = {"desarrollo": d.get("name") or d["id"],
                  "colonia": d.get("colonia_name") or d.get("colonia") or "sin colonia",
                  "alcaldia": d.get("alcaldia") or "sin alcaldía",
                  "ciudad": "CDMX"}
        for nivel, llave in llaves.items():
            por_nivel[nivel].setdefault(llave, []).extend(met["moldes"])
    out = {n: [{"nombre": k, **_agrega_peldano(v)} for k, v in sorted(g.items())]
           for n, g in por_nivel.items()}
    return {"niveles": out, "nota_temporalidad": "series hora→año: market_timeline.evolucion()"}
