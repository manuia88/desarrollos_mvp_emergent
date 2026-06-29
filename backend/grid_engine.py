"""GRID ENGINE — genera las celdas del grid de métricas (medida_base × dimensiones) desde fuentes REALES, con
PROCEDENCIA obligatoria: cada celda lleva fuente · almacén · n · cohorte · actualizado · confianza. Materializa solo
n≥n_minimo (las demás quedan LATENTES, definidas pero no publicadas). Surfacing: query/pivot · rankings · insights.

Procedencia obligatoria (regla transversal): sin fuente+n+cohorte+actualizado NO se publica. No se inventa.
Confianza por n: <10 = baja. Latente ≠ falso.
"""
import datetime as dt
import statistics
from typing import Any, Dict, List, Optional

from metric_registry import REGISTRY_BY_ID, DIMENSIONS, ALMACEN_SALIDA


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


def _pctl(vals, q):
    v = sorted(vals)
    return round(v[int(q * len(v))]) if v else None


async def _c_precio_p25(db, dims):
    pm2 = [u["price"] / u["m2_total"] for u, _ in _dev_units(dims) if u.get("price") and u.get("m2_total")]
    return (_pctl(pm2, 0.25), len(pm2), None)


async def _c_precio_p75(db, dims):
    pm2 = [u["price"] / u["m2_total"] for u, _ in _dev_units(dims) if u.get("price") and u.get("m2_total")]
    return (_pctl(pm2, 0.75), len(pm2), None)


async def _c_unidades_tot(db, dims):
    us = _dev_units(dims)
    return (len(us), len(us), None)


async def _c_unidades_vend(db, dims):
    us = _dev_units(dims)
    s = sum(1 for u, _ in us if str(u.get("status") or "").lower() in ("vendido", "reservado", "sold", "reserved"))
    return (s, len(us), None)


async def _c_premium_vista(db, dims):
    us = _dev_units({k: v for k, v in dims.items() if k != "vista"})
    ext = [u["price"] / u["m2_total"] for u, _ in us if str(u.get("vista") or "").lower() == "exterior" and u.get("price") and u.get("m2_total")]
    inte = [u["price"] / u["m2_total"] for u, _ in us if str(u.get("vista") or "").lower() == "interior" and u.get("price") and u.get("m2_total")]
    if ext and inte:
        return (round(100 * (statistics.median(ext) - statistics.median(inte)) / statistics.median(inte)), len(ext) + len(inte), None)
    return (None, len(ext) + len(inte), None)


async def _c_vistas_proto(db, dims):
    cols = _geo_colonias(dims)
    q = {"type": "unit_view"}
    if cols:
        q["colonia"] = {"$in": list(cols)}
    n = await db.buyer_signals.count_documents(q)
    return (n, n, None)


async def _c_tipologia_buscada(db, dims):
    cols = _geo_colonias(dims); cut = _window_cutoff(dims.get("ventana"))
    q = {"recamaras_min": {"$gt": 0}}
    if cols:
        q["colonias"] = {"$in": list(cols)}
    if cut:
        q["created_at_dt"] = {"$gte": cut}
    from collections import Counter
    c = Counter()
    async for s in db.marketplace_searches.find(q, {"_id": 0, "recamaras_min": 1}):
        c[s["recamaras_min"]] += 1
    n = sum(c.values())
    return (f"{c.most_common(1)[0][0]}rec" if c else None, n, None)


async def _c_demanda_atributo(db, dims):
    attr = dims.get("atributo")
    cols = _geo_colonias(dims); cut = _window_cutoff(dims.get("ventana"))
    if not attr:
        return (None, 0, None)
    q = {"type": {"$in": ["ficha_view", "like", "save", "unit_view", "intent", "atlax_query"]}}
    if cols:
        q["colonia"] = {"$in": list(cols)}
    if cut:
        q["created_at_dt"] = {"$gte": cut}
    from data_developments import DEVELOPMENTS_BY_ID
    n = 0
    async for s in db.buyer_signals.find(q, {"_id": 0, "entity_id": 1, "meta": 1}):
        d = DEVELOPMENTS_BY_ID.get(s.get("entity_id"))
        meta = s.get("meta") or {}
        ams = [str(a).lower() for a in (meta.get("amenidades") or [])]
        if attr in ams:
            n += 1
        elif d and any(_unit_has_attr(u, d, attr) for u in (d.get("units") or [])):
            n += 1
    return (n, n, None)


async def _c_recurrencia(db, dims):
    cols = _geo_colonias(dims)
    q = {}
    if cols:
        q["colonia"] = {"$in": list(cols)}
    from collections import defaultdict
    byv = defaultdict(int)
    async for s in db.buyer_signals.find(q, {"_id": 0, "visitor_id": 1}):
        if s.get("visitor_id"):
            byv[s["visitor_id"]] += 1
    return (round(sum(byv.values()) / len(byv), 1) if byv else None, len(byv), None)


async def _c_conv_vista_sol(db, dims):
    vi, vn, _ = await _c_vistas(db, dims)
    so, _, _ = await _c_solicitudes(db, dims)
    return (round(100 * (so or 0) / vi) if vi else None, vn, None)


async def _c_arbitraje(db, dims):
    bq, bn, _ = await _c_busquedas(db, dims)
    inv, _, _ = await _c_inventario(db, dims)
    return ((bq or 0) - (inv or 0), bn, None) if bq is not None else (None, 0, None)


async def _c_sobreoferta(db, dims):
    inv, _, _ = await _c_inventario(db, dims)
    vi, vn, _ = await _c_vistas(db, dims)
    return (round((inv or 0) / max(vi or 1, 1), 2), vn, None) if inv is not None else (None, 0, None)


async def _c_indice_revelada(db, dims):
    vi, vn, _ = await _c_vistas(db, dims)
    so, _, _ = await _c_solicitudes(db, dims)
    rec, _, _ = await _c_recurrencia(db, dims)
    if vn < 8:
        return (None, vn, None)
    idx = min((vi or 0) / 50, 1) * 40 + min((so or 0) / 10, 1) * 40 + min((rec or 0) / 5, 1) * 20
    return (round(idx), vn, None)


# ── computers restantes (las 32 que faltaban — cableadas; latentes donde el dato es thin) ──
async def _c_mix_tipologia(db, dims):
    from collections import Counter
    us = _dev_units(dims); c = Counter(_tipologia(u.get("bedrooms")) for u, _ in us if u.get("bedrooms") is not None)
    return (dict(c) if c else None, len(us), None)


async def _c_premium_attr_generic(db, dims, attr_dim):
    us = _dev_units({k: v for k, v in dims.items() if k != attr_dim})
    val = dims.get(attr_dim)
    if not val:
        return (None, 0, None)
    if attr_dim == "atributo":
        con = [u["price"] / u["m2_total"] for u, d in us if _unit_has_attr(u, d, val) and u.get("price") and u.get("m2_total")]
        sin = [u["price"] / u["m2_total"] for u, d in us if not _unit_has_attr(u, d, val) and u.get("price") and u.get("m2_total")]
    else:  # piso / orientacion
        key = "level" if attr_dim == "piso" else "orientation"
        def _match(u):
            if attr_dim == "piso":
                lvl = u.get("level") or 0
                return ("PB-bajo(1-3)" if lvl <= 3 else "medio(4-10)" if lvl <= 10 else "alto(11-20)" if lvl <= 20 else "muy-alto(>20)") == val
            return str(u.get(key) or "").lower() == val
        con = [u["price"] / u["m2_total"] for u, _ in us if _match(u) and u.get("price") and u.get("m2_total")]
        sin = [u["price"] / u["m2_total"] for u, _ in us if not _match(u) and u.get("price") and u.get("m2_total")]
    if con and sin:
        return (round(100 * (statistics.median(con) - statistics.median(sin)) / statistics.median(sin)), len(con) + len(sin), None)
    return (None, len(con) + len(sin), None)


async def _c_premium_atributo(db, dims):
    return await _c_premium_attr_generic(db, dims, "atributo")


async def _c_premium_piso(db, dims):
    return await _c_premium_attr_generic(db, dims, "piso")


async def _c_premium_orient(db, dims):
    return await _c_premium_attr_generic(db, dims, "orientacion")


async def _c_meses_inventario(db, dims):
    inv, n, _ = await _c_inventario(db, dims)
    vel, _, _ = await _c_absorcion(db, dims)
    return (round(inv / vel, 1) if inv and vel else None, n, None)


async def _c_ticket(db, dims):
    us = _dev_units(dims)
    pr = [u["price"] for u, _ in us if u.get("price") and str(u.get("status") or "").lower() in ("vendido", "reservado", "sold", "reserved")]
    return (round(statistics.mean(pr)) if pr else None, len(pr), None)


async def _c_dias_mercado(db, dims):
    us = _dev_units(dims)
    disp = [u for u, _ in us if str(u.get("status") or "disponible").lower() in ("disponible", "available")]
    return (None, len(disp), None)  # latente: units no tienen fecha de listado (se activa cuando se capture)


async def _c_meses_venta(db, dims):
    from data_developments import DEVELOPMENTS
    import demand_intelligence as di
    import launch_dates as ld
    lm = await ld.dev_launch_map(db)
    geo = dims.get("geo"); meses = []
    for d in DEVELOPMENTS:
        if geo and not _geo_match(d, geo, di):
            continue
        lt = lm.get(d.get("id"))                              # capturado o estimado por avance de obra
        if lt and lt[0]:
            meses.append(round((dt.datetime.utcnow() - lt[0]).days / 30))
    return (round(statistics.median(meses)) if meses else None, len(meses), None)


async def _c_ritmo_lanz(db, dims):
    from data_developments import DEVELOPMENTS
    import demand_intelligence as di
    import launch_dates as ld
    lm = await ld.dev_launch_map(db)
    geo = dims.get("geo"); cut = _window_cutoff(dims.get("ventana")); n = 0
    for d in DEVELOPMENTS:
        if geo and not _geo_match(d, geo, di):
            continue
        lt = lm.get(d.get("id"))
        if lt and lt[0] and (not cut or lt[0] >= cut):
            n += 1
    return (n, n, None)


async def _c_split_intencion(db, dims):
    cols = _geo_colonias(dims)
    import demand_intelligence as di
    isp = await di.intent_split(db)
    if cols:
        for c in isp.get("por_colonia", []):
            if c.get("colonia") in cols:
                v, i = c.get("vivir", 0), c.get("invertir", 0)
                return (f"{v}viv/{i}inv", v + i, None)
    r = isp.get("resumen", {})
    return (f"{r.get('vivir',0)}viv/{r.get('invertir',0)}inv", r.get("vivir", 0) + r.get("invertir", 0), None)


async def _c_atributo_buscado(db, dims):
    from collections import Counter
    cols = _geo_colonias(dims); c = Counter()
    q = {"meta.amenidades": {"$exists": True}}
    if cols:
        q["colonia"] = {"$in": list(cols)}
    import demand_intelligence as di
    async for s in db.buyer_signals.find(q, {"_id": 0, "meta": 1}):
        for a in di._as_feature_list((s.get("meta") or {}).get("amenidades")):
            c[str(a).lower()] += 1
    n = sum(c.values())
    return (c.most_common(1)[0][0] if c else None, n, None)


async def _c_share_demanda(db, dims):
    geo = dims.get("geo")
    if not geo or geo[0] != "desarrollo":
        return (None, 0, None)
    from data_developments import DEVELOPMENTS_BY_ID
    did = geo[1]; d = DEVELOPMENTS_BY_ID.get(did)
    if not d:
        return (None, 0, None)
    cid = d.get("colonia_id")
    dev_n = await db.buyer_signals.count_documents({"entity_id": did})
    col_n = await db.buyer_signals.count_documents({"colonia": cid})
    return (round(100 * dev_n / max(col_n, 1)), dev_n, None) if col_n else (None, dev_n, None)


async def _c_filtros_atributo(db, dims):
    cols = _geo_colonias(dims); n = 0
    q = {}
    if cols:
        q["colonias"] = {"$in": list(cols)}
    async for s in db.marketplace_searches.find(q, {"_id": 0, "estacionamientos_min": 1, "banos_min": 1}):
        if s.get("estacionamientos_min") or s.get("banos_min"):
            n += 1
    return (n, n, None)


async def _c_rango_precio_buscado(db, dims):
    from collections import Counter
    cols = _geo_colonias(dims); c = Counter()
    q = {"precio_max": {"$gt": 0}}
    if cols:
        q["colonias"] = {"$in": list(cols)}
    async for s in db.marketplace_searches.find(q, {"_id": 0, "precio_max": 1}):
        c[_tier(s["precio_max"])] += 1
    n = sum(c.values())
    return (c.most_common(1)[0][0] if c else None, n, None)


async def _c_heat_index(db, dims):
    vi, vn, _ = await _c_vistas(db, dims)
    inv, _, _ = await _c_inventario(db, dims)
    return (round((vi or 0) / max(inv or 1, 1) * 10) / 10, vn, None) if vi is not None else (None, 0, None)


async def _c_dap_atributo(db, dims):
    dem, dn, _ = await _c_demanda_atributo(db, dims)
    prem, _, _ = await _c_premium_atributo(db, dims)
    if dem is not None and prem is not None:
        return (f"demanda {dem} × premium {prem}%", dn, None)
    return (None, dn or 0, None)


async def _c_elasticidad(db, dims):
    # absorción por banda de precio (curva) — necesita venta por banda; thin → latente
    us = _dev_units(dims)
    return (None, len(us), None)


async def _c_match_score(db, dims):
    vi, vn, _ = await _c_vistas(db, dims)
    inv, _, _ = await _c_inventario(db, dims)
    if vn < 6:
        return (None, vn, None)
    return (round(min((vi or 0) / max(inv or 1, 1), 3) / 3 * 100), vn, None)


def _geo_match(d, geo, di):
    lvl, val = geo
    return (lvl == "colonia" and d.get("colonia_id") == val) or (lvl == "alcaldia" and d.get("alcaldia") == val) \
        or (lvl == "desarrollo" and d.get("id") == val) or (lvl == "corredor" and di._corridor(d.get("colonia_id"), d.get("alcaldia")) == val)


def _c_calc_field(field):
    async def _fn(db, dims):
        cols = _geo_colonias(dims); cut = _window_cutoff(dims.get("ventana"))
        q = {"type": {"$in": ["payment_explore", "roi_explore"]}}
        if cols:
            q["colonia"] = {"$in": list(cols)}
        if cut:
            q["created_at_dt"] = {"$gte": cut}
        if field is None:
            n = await db.buyer_signals.count_documents(q)
            return (n, n, None)
        vals = []
        async for s in db.buyer_signals.find(q, {"_id": 0, "meta": 1}):
            v = (s.get("meta") or {}).get(field)
            if v is not None:
                try:
                    vals.append(float(v))
                except (TypeError, ValueError):
                    pass
        return (round(statistics.median(vals)) if vals else None, len(vals), None)
    return _fn


async def _c_latent_tx(db, dims):
    # medidas de transacción (descuento/precio_cerrado/tiempo_decision/conv_cierre) — transactions thin → latente
    n = await db.transactions.count_documents({})
    return (None, n if n else 0, None)


COMPUTERS = {
    # OFERTA
    "of.precio_m2": _c_precio_m2, "of.precio_absoluto": _c_precio_abs, "of.inventario_activo": _c_inventario,
    "of.sell_through": _c_sell_through, "of.absorcion_mensual": _c_absorcion, "of.precio_p25": _c_precio_p25,
    "of.precio_p75": _c_precio_p75, "of.unidades_totales": _c_unidades_tot, "of.unidades_vendidas": _c_unidades_vend,
    "of.velocidad_venta": _c_absorcion, "of.premium_vista": _c_premium_vista, "of.mix_tipologia": _c_mix_tipologia,
    "of.premium_atributo": _c_premium_atributo, "of.premium_piso": _c_premium_piso, "of.premium_orientacion": _c_premium_orient,
    "of.meses_inventario": _c_meses_inventario, "of.ticket_promedio": _c_ticket, "of.dias_en_mercado": _c_dias_mercado,
    "of.meses_venta": _c_meses_venta, "of.ritmo_lanzamientos": _c_ritmo_lanz, "of.precio_cerrado_m2": _c_latent_tx,
    "of.descuento_negociacion": _c_latent_tx, "of.posicion_precio_cohorte": _c_match_score,
    # DEMANDA
    "dm.vistas": _c_vistas, "dm.busquedas": _c_busquedas, "dm.solicitudes": _c_solicitudes,
    "dm.presupuesto_declarado": _c_presupuesto, "dm.vistas_prototipo": _c_vistas_proto, "dm.tipologia_buscada": _c_tipologia_buscada,
    "dm.demanda_por_atributo": _c_demanda_atributo, "dm.recurrencia_busqueda": _c_recurrencia, "dm.conv_vista_solicitud": _c_conv_vista_sol,
    "dm.split_intencion": _c_split_intencion, "dm.atributo_buscado": _c_atributo_buscado, "dm.share_demanda": _c_share_demanda,
    "dm.filtros_atributo": _c_filtros_atributo, "dm.rango_precio_buscado": _c_rango_precio_buscado, "dm.heat_index": _c_heat_index,
    # CRUCE
    "x.gap_oferta_demanda": _c_gap, "x.ratio_demanda_inventario": _c_ratio_dem_inv, "x.affordability_gap": _c_affordability,
    "x.arbitraje": _c_arbitraje, "x.sobreoferta_subdemanda": _c_sobreoferta, "x.indice_demanda_revelada": _c_indice_revelada,
    "x.dap_atributo": _c_dap_atributo, "x.elasticidad_precio": _c_elasticidad, "x.match_score": _c_match_score,
}

# medidas de cotizador (calculadora) — cableadas; latentes hasta que se use el cotizador
for _mid, _field in [("dm.sesiones_calculadora", None), ("dm.enganche_declarado", "enganche"), ("dm.capacidad_credito", "credito"),
                     ("dm.aforo_ltv", "credito"), ("dm.plazo_target", "plazo_anos"), ("dm.mensualidad_target", "mensualidad"),
                     ("dm.tir_target", "tir"), ("dm.cap_rate_target", "cap_rate")]:
    COMPUTERS[_mid] = _c_calc_field(_field)
# medidas de transacción → latente (transactions thin; cableadas para cuando lleguen cierres)
for _mid in ("dm.tiempo_decision", "dm.conv_cotizacion_cierre", "x.forecast_absorcion"):
    COMPUTERS[_mid] = _c_latent_tx


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
