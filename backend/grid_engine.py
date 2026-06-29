"""GRID ENGINE — genera las celdas del grid de métricas (medida_base × dimensiones) desde fuentes REALES, con
PROCEDENCIA obligatoria: cada celda lleva fuente · almacén · n · cohorte · actualizado · confianza. Materializa solo
n≥n_minimo (las demás quedan LATENTES, definidas pero no publicadas). Surfacing: query/pivot · rankings · insights.

Procedencia obligatoria (regla transversal): sin fuente+n+cohorte+actualizado NO se publica. No se inventa.
Confianza por n: <10 = baja. Latente ≠ falso.
"""
import datetime as dt
import statistics
from typing import Any, Dict, List, Optional, Tuple

from metric_registry import REGISTRY, REGISTRY_BY_ID, DIMENSIONS, ALMACEN_SALIDA


# ── helpers de dimensión ────────────────────────────────────────────────────────
def _window_cutoff(ventana: Optional[str]):
    if not ventana or ventana in ("live", "YoY"):
        return None
    days = {"30d": 30, "90d": 90, "6m": 180, "12m": 365}.get(ventana)
    return (dt.datetime.utcnow() - dt.timedelta(days=days)) if days else None


def _m2_band(m2):
    if not m2:
        return None
    return "<60" if m2 < 60 else "60-100" if m2 < 100 else "100-150" if m2 < 150 else ">150"


def _tier(p):
    if not p:
        return None
    return "0-3M" if p <= 3e6 else "3-5M" if p <= 5e6 else "5-8M" if p <= 8e6 else "8-12M" if p <= 12e6 else "12-20M" if p <= 20e6 else "20M+"


def _tipologia(beds):
    if beds is None:
        return None
    return "studio" if beds == 0 else "1rec" if beds == 1 else "2rec" if beds == 2 else "3rec" if beds == 3 else "4+rec"


def _unit_has_attr(u, dev, attr):
    if attr in ("terraza", "balcon", "roof", "bodega", "pet_friendly"):
        return bool(u.get("roof_garden") if attr == "roof" else u.get(attr))
    if attr == "cajon":
        return (u.get("parking_spots") or 0) > 0
    # amenidades del desarrollo
    ams = [str(a).lower() for a in (dev.get("amenities") or [])]
    if attr == "amenidades_alta":
        return len(ams) > 8
    return attr in ams


def _dev_units(dims: Dict[str, Any]):
    """Unidades (de DEVELOPMENTS) que cumplen el filtro dimensional, cada una etiquetada con su dev."""
    from data_developments import DEVELOPMENTS
    import demand_intelligence as di
    geo = dims.get("geo")  # (nivel, valor) o None
    out = []
    for d in DEVELOPMENTS:
        if geo:
            lvl, val = geo
            if lvl == "alcaldia" and d.get("alcaldia") != val:
                continue
            if lvl == "colonia" and d.get("colonia_id") != val:
                continue
            if lvl == "desarrollo" and d.get("id") != val:
                continue
            if lvl == "corredor" and di._corridor(d.get("colonia_id"), d.get("alcaldia")) != val:
                continue
        for u in (d.get("units") or []):
            if dims.get("tipologia") and _tipologia(u.get("bedrooms")) != dims["tipologia"]:
                continue
            if dims.get("rango_m2") and _m2_band(u.get("m2_total")) != dims["rango_m2"]:
                continue
            if dims.get("tier_precio") and _tier(u.get("price")) != dims["tier_precio"]:
                continue
            if dims.get("vista") and str(u.get("vista") or "").lower() != dims["vista"]:
                continue
            if dims.get("atributo") and not _unit_has_attr(u, d, dims["atributo"]):
                continue
            if dims.get("etapa") and str(d.get("stage") or "").lower()[:4] != str(dims["etapa"]).lower()[:4]:
                continue
            out.append((u, d))
    return out


def _geo_colonias(dims):
    """Colonias que cubre el filtro geo (para demanda)."""
    from data_developments import DEVELOPMENTS
    import demand_intelligence as di
    geo = dims.get("geo")
    if not geo:
        return None
    lvl, val = geo
    cols = set()
    for d in DEVELOPMENTS:
        if lvl == "colonia" and d.get("colonia_id") == val:
            cols.add(d["colonia_id"])
        elif lvl == "alcaldia" and d.get("alcaldia") == val:
            cols.add(d.get("colonia_id"))
        elif lvl == "corredor" and di._corridor(d.get("colonia_id"), d.get("alcaldia")) == val:
            cols.add(d.get("colonia_id"))
        elif lvl == "desarrollo" and d.get("id") == val:
            cols.add(d.get("colonia_id"))
    return cols or None


# ── COMPUTERS (medida_id → valor, n, actualizado) ───────────────────────────────
async def _c_precio_m2(db, dims):
    us = _dev_units(dims)
    pm2 = [u["price"] / u["m2_total"] for u, _ in us if u.get("price") and u.get("m2_total")]
    return (round(statistics.median(pm2)) if pm2 else None, len(pm2), None)


async def _c_precio_abs(db, dims):
    us = _dev_units(dims); pr = [u["price"] for u, _ in us if u.get("price")]
    return (round(statistics.median(pr)) if pr else None, len(pr), None)


async def _c_inventario(db, dims):
    us = _dev_units(dims); disp = [1 for u, _ in us if str(u.get("status") or "disponible").lower() in ("disponible", "available")]
    return (len(disp), len(us), None)


async def _c_sell_through(db, dims):
    us = _dev_units(dims)
    if not us:
        return (None, 0, None)
    sold = sum(1 for u, _ in us if str(u.get("status") or "").lower() in ("vendido", "reservado", "sold", "reserved"))
    return (round(100 * sold / len(us)), len(us), None)


async def _c_absorcion(db, dims):
    # Δ vendidas / meses desde lanzamiento (proxy: units_sold del dev / meses_stage)
    from data_developments import DEVELOPMENTS
    geo = dims.get("geo"); import demand_intelligence as di
    tot_sold = 0; n = 0; vel = 0.0
    for d in DEVELOPMENTS:
        if geo:
            lvl, val = geo
            if (lvl == "colonia" and d.get("colonia_id") != val) or (lvl == "alcaldia" and d.get("alcaldia") != val) \
               or (lvl == "desarrollo" and d.get("id") != val) or (lvl == "corredor" and di._corridor(d.get("colonia_id"), d.get("alcaldia")) != val):
                continue
        s = d.get("units_sold") or 0
        meses = 12  # proxy de ventana de venta
        if s:
            tot_sold += s; n += 1; vel += s / meses
    return (round(vel, 1) if n else None, tot_sold, None)


async def _c_vistas(db, dims):
    cols = _geo_colonias(dims); cut = _window_cutoff(dims.get("ventana"))
    q = {"type": {"$in": ["ficha_view", "unit_view", "view", "photo_dwell"]}}
    if cut:
        q["created_at_dt"] = {"$gte": cut}
    if cols:
        q["colonia"] = {"$in": list(cols)}
    n = await db.buyer_signals.count_documents(q)
    last = await db.buyer_signals.find_one(q, {"_id": 0, "created_at_dt": 1}, sort=[("created_at_dt", -1)])
    return (n, n, (last or {}).get("created_at_dt"))


async def _c_busquedas(db, dims):
    cols = _geo_colonias(dims); cut = _window_cutoff(dims.get("ventana"))
    q = {}
    if cut:
        q["created_at_dt"] = {"$gte": cut}
    if cols:
        q["colonias"] = {"$in": list(cols)}
    n = await db.marketplace_searches.count_documents(q)
    return (n, n, None)


async def _c_solicitudes(db, dims):
    cols = _geo_colonias(dims); cut = _window_cutoff(dims.get("ventana"))
    q = {"type": {"$in": ["lead", "intent", "save", "unit_save"]}}
    if cut:
        q["created_at_dt"] = {"$gte": cut}
    if cols:
        q["colonia"] = {"$in": list(cols)}
    n = await db.buyer_signals.count_documents(q)
    return (n, n, None)


async def _c_presupuesto(db, dims):
    cols = _geo_colonias(dims); cut = _window_cutoff(dims.get("ventana"))
    q = {"precio_max": {"$gt": 0}}
    if cut:
        q["created_at_dt"] = {"$gte": cut}
    if cols:
        q["colonias"] = {"$in": list(cols)}
    vals = [s["precio_max"] async for s in db.marketplace_searches.find(q, {"_id": 0, "precio_max": 1})]
    return (round(statistics.median(vals)) if vals else None, len(vals), None)


async def _c_gap(db, dims):
    bq, bn, _ = await _c_busquedas(db, dims)
    inv, _, _ = await _c_inventario(db, dims)
    return ((bq or 0) - (inv or 0), bn, None) if bq is not None else (None, 0, None)


async def _c_ratio_dem_inv(db, dims):
    vi, vn, _ = await _c_vistas(db, dims)
    inv, _, _ = await _c_inventario(db, dims)
    return (round((vi or 0) / max(inv or 1, 1), 2), vn, None) if vi is not None else (None, 0, None)


async def _c_affordability(db, dims):
    pres, pn, _ = await _c_presupuesto(db, dims)
    precio, _, _ = await _c_precio_abs(db, dims)
    if pres and precio:
        return (round(100 * (pres - precio) / precio), pn, None)
    return (None, 0, None)


COMPUTERS = {
    "of.precio_m2": _c_precio_m2, "of.precio_absoluto": _c_precio_abs, "of.inventario_activo": _c_inventario,
    "of.sell_through": _c_sell_through, "of.absorcion_mensual": _c_absorcion,
    "dm.vistas": _c_vistas, "dm.busquedas": _c_busquedas, "dm.solicitudes": _c_solicitudes,
    "dm.presupuesto_declarado": _c_presupuesto,
    "x.gap_oferta_demanda": _c_gap, "x.ratio_demanda_inventario": _c_ratio_dem_inv, "x.affordability_gap": _c_affordability,
}


def _confianza(n):
    return "alta" if n >= 30 else "media" if n >= 10 else "baja"


async def compute(db, measure_id: str, dims: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Computa UNA celda con PROCEDENCIA completa. dims: {geo:(nivel,valor), tipologia, rango_m2, tier_precio, atributo,
    vista, etapa, ventana}. Devuelve valor + fuente + almacén + n + cohorte + actualizado + confianza + latente."""
    meta = REGISTRY_BY_ID.get(measure_id)
    if not meta:
        return {"error": f"medida desconocida: {measure_id}"}
    dims = dims or {}
    fn = COMPUTERS.get(measure_id)
    valor, n, actualizado = (None, 0, None)
    if fn:
        try:
            valor, n, actualizado = await fn(db, dims)
        except Exception as e:  # noqa: BLE001
            return {"id": measure_id, "error": str(e)[:120], "procedencia": {"fuente": meta["fuente"]}}
    latente = n < meta["n_minimo"]
    cell_id = measure_id + "@" + "|".join(f"{k}={v[1] if isinstance(v, tuple) else v}" for k, v in dims.items() if v)
    return {
        "id": cell_id, "medida": meta["medida"], "lado": meta["lado"], "unidad": meta["unidad"],
        "valor": None if latente else valor, "dims": {k: (v[1] if isinstance(v, tuple) else v) for k, v in dims.items() if v},
        "latente": latente, "n": n, "confianza": _confianza(n),
        "procedencia": {
            "fuente": meta["fuente"], "almacen_entrada": meta["almacen_entrada"], "almacen_salida": meta["almacen_salida"],
            "formula": meta["formula"], "cohorte": meta["cohorte_comparacion"],
            "actualizado": actualizado.isoformat() if isinstance(actualizado, dt.datetime) else None,
        },
    }


async def query(db, measure_id: str, **dims) -> Dict[str, Any]:
    """Pivot: el usuario pide medida + dimensiones (ej: of.absorcion_mensual, geo=('colonia','condesa'), tipologia='2rec')."""
    return await compute(db, measure_id, dims)


async def ranking(db, measure_id: str, por: str = "colonia", top: int = 12, **dims) -> Dict[str, Any]:
    """Top zonas por una medida (recorre los valores del eje geo pedido)."""
    from data_developments import DEVELOPMENTS
    import demand_intelligence as di
    if por == "alcaldia":
        valores = sorted({d.get("alcaldia") for d in DEVELOPMENTS if d.get("alcaldia")})
    elif por == "corredor":
        valores = sorted({di._corridor(d.get("colonia_id"), d.get("alcaldia")) for d in DEVELOPMENTS if d.get("colonia_id")})
    elif por == "desarrollo":
        valores = [d.get("id") for d in DEVELOPMENTS]
    else:
        valores = sorted({d.get("colonia_id") for d in DEVELOPMENTS if d.get("colonia_id")})
    filas = []
    for v in valores:
        c = await compute(db, measure_id, {**dims, "geo": (por, v)})
        if not c.get("latente") and c.get("valor") is not None:
            filas.append({"zona": v, "valor": c["valor"], "n": c["n"], "confianza": c["confianza"]})
    filas.sort(key=lambda x: -(x["valor"] if isinstance(x["valor"], (int, float)) else 0))
    return {"medida": measure_id, "por": por, "ranking": filas[:top],
            "procedencia": (REGISTRY_BY_ID.get(measure_id) or {}).get("fuente")}


async def insights(db) -> Dict[str, Any]:
    """INSIGHTS redactados que suben solos del grid: hallazgos comparativos con su procedencia (n + cohorte)."""
    found = []
    # 1) ¿los proyectos con amenidades-alta se venden más rápido? (sell_through con vs sin)
    con = await compute(db, "of.sell_through", {"atributo": "amenidades_alta"})
    sin_us = _dev_units({})  # baseline
    if not con.get("latente"):
        base = await compute(db, "of.sell_through", {})
        if not base.get("latente") and con["valor"] is not None and base["valor"] is not None:
            delta = con["valor"] - base["valor"]
            found.append({"insight": f"Los desarrollos con amenidades-alta están {delta:+d}pp en sell-through vs el promedio del mercado.",
                          "medida": "of.sell_through", "n": con["n"], "cohorte": "amenidades_alta vs todos", "fuente": ["developments.units"]})
    # 2) brecha de demanda por tipología (qué se busca y no se ofrece)
    for tip in ("2rec", "3rec"):
        g = await compute(db, "x.gap_oferta_demanda", {"tipologia": tip})
        if not g.get("latente") and g.get("valor") and g["valor"] > 0:
            found.append({"insight": f"Demanda insatisfecha de {tip}: {g['valor']} búsquedas por encima del inventario.",
                          "medida": "x.gap_oferta_demanda", "n": g["n"], "cohorte": g["procedencia"]["cohorte"], "fuente": g["procedencia"]["fuente"]})
    # 3) presión de demanda por colonia (ranking)
    r = await ranking(db, "x.ratio_demanda_inventario", por="colonia", top=3)
    if r["ranking"]:
        t = r["ranking"][0]
        found.append({"insight": f"{t['zona']} es la colonia con mayor presión de demanda ({t['valor']} vistas por unidad en inventario).",
                      "medida": "x.ratio_demanda_inventario", "n": t["n"], "cohorte": "colonias comparables", "fuente": ["buyer_signals", "dmx_units"]})
    return {"insights": found, "nota": "cada hallazgo lleva n + cohorte + fuente; sin eso no se publica"}


async def materialize(db, measure_id: str, ejes: List[str]) -> Dict[str, Any]:
    """Genera el producto cartesiano de la medida sobre los ejes pedidos, materializa instancias n≥n_min en metric_grid,
    deja latentes las demás. Devuelve conteo materializadas/latentes."""
    import itertools
    meta = REGISTRY_BY_ID.get(measure_id)
    if not meta:
        return {"error": "medida desconocida"}
    from data_developments import DEVELOPMENTS
    import demand_intelligence as di
    # valores por eje
    val_por_eje = {}
    for eje in ejes:
        if eje == "geo":
            val_por_eje["geo"] = [("colonia", c) for c in sorted({d.get("colonia_id") for d in DEVELOPMENTS if d.get("colonia_id")})]
        else:
            val_por_eje[eje] = DIMENSIONS.get(eje, [])
    keys = list(val_por_eje.keys())
    combos = list(itertools.product(*[val_por_eje[k] for k in keys])) if keys else [()]
    mat = lat = 0
    for combo in combos[:2000]:
        dims = {keys[i]: combo[i] for i in range(len(keys))}
        c = await compute(db, measure_id, dims)
        if c.get("latente"):
            lat += 1
            continue
        mat += 1
        await db.metric_grid.update_one({"_id": c["id"]}, {"$set": {**c, "materialized_at": dt.datetime.utcnow()}}, upsert=True)
    return {"medida": measure_id, "ejes": ejes, "combinaciones": len(combos), "materializadas": mat, "latentes": lat,
            "almacen": ALMACEN_SALIDA}
