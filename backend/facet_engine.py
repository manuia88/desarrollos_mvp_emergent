"""FACET ENGINE — conteo faceteado universal (estilo OLAP / filtros con conteos). Pregunta '¿cuántos [población]
cumplen [filtros], agrupados por [facet], en [geo], en [ventana]?' y devuelve conteo + distribución + share + su
contraparte de DEMANDA + cross-tabs + series de tiempo + 'lo que no existe'. Cada número con su procedencia (población+n).

Poblaciones: unidades (DEVELOPMENTS.units) · desarrollos (DEVELOPMENTS) · demanda (buyer_signals/marketplace_searches).
Facets: cualquier atributo del schema. Geo: colonia/alcaldia/corredor/ciudad. Ventana: día/semana/quincena/mes.
"""
import datetime as dt
from collections import Counter, defaultdict
from typing import Any, Callable, Dict, Optional


# ── extractores de facet por población ──────────────────────────────────────────
def _band_m2(v):
    return None if not v else "<60" if v < 60 else "60-100" if v < 100 else "100-150" if v < 150 else ">150"


def _band_tier(p):
    return None if not p else "0-3M" if p <= 3e6 else "3-5M" if p <= 5e6 else "5-8M" if p <= 8e6 else "8-12M" if p <= 12e6 else "12-20M" if p <= 20e6 else "20M+"


def _band_piso(lvl):
    return None if lvl is None else "PB-bajo(1-3)" if lvl <= 3 else "medio(4-10)" if lvl <= 10 else "alto(11-20)" if lvl <= 20 else "muy-alto(>20)"


def _band_recamaras(b):
    return None if b is None else "studio" if b == 0 else f"{b}rec" if b < 4 else "4+rec"


def _band_cajones(p):
    return None if p is None else "0" if p == 0 else "1" if p == 1 else "2+"


def _band_unidades(d):
    n = d.get("units_total") or len(d.get("units") or [])
    return "<10" if n < 10 else "10-20" if n <= 20 else "20-50" if n <= 50 else "50+"


def _band_altura(d):
    lvl = d.get("max_level") or max((u.get("level") or 0) for u in (d.get("units") or [{}])) or 0
    return "1-3 pisos" if lvl <= 3 else "4-10" if lvl <= 10 else "11-20" if lvl <= 20 else "20+"


def _band_amenidades(d):
    n = len(d.get("amenities") or [])
    return "pocas (<5)" if n < 5 else "medias (5-8)" if n <= 8 else "muchas (>8)"


def _entrega(d):
    st = str(d.get("stage") or d.get("property_type") or "").lower()
    de = str(d.get("delivery_estimate") or "").lower()
    if "inmed" in st + de or "entrega" in st:
        return "entrega inmediata"
    if "constr" in st or "obra" in st:
        return "construcción"
    if "pre" in st:
        return "preventa"
    return st or "—"


# facets de UNIDADES: extractor(unit, dev) -> valor de facet
_UNIT_FACETS: Dict[str, Callable] = {
    "terraza": lambda u, d: "con terraza" if u.get("terraza") else "sin terraza",
    "balcon": lambda u, d: "con balcón" if u.get("balcon") else "sin balcón",
    "roof_garden": lambda u, d: "con roof" if u.get("roof_garden") else "sin roof",
    "bodega": lambda u, d: "con bodega" if u.get("bodega") else "sin bodega",
    "pet_friendly": lambda u, d: "pet friendly" if u.get("pet_friendly") else "no pet",
    "vista": lambda u, d: str(u.get("vista") or "—").lower(),
    "orientacion": lambda u, d: str(u.get("orientation") or "—").lower(),
    "recamaras": lambda u, d: _band_recamaras(u.get("bedrooms")),
    "banos": lambda u, d: str(u.get("bathrooms")) + " baños" if u.get("bathrooms") else None,
    "m2": lambda u, d: _band_m2(u.get("m2_total")),
    "piso": lambda u, d: _band_piso(u.get("level")),
    "cajones": lambda u, d: _band_cajones(u.get("parking_spots")),
    "prototipo": lambda u, d: str(u.get("prototype") or "—").upper(),
    "status": lambda u, d: str(u.get("status") or "disponible").lower(),
    "tier_precio": lambda u, d: _band_tier(u.get("price")),
    "colonia": lambda u, d: d.get("colonia") or d.get("colonia_id"),
    "alcaldia": lambda u, d: d.get("alcaldia"),
    "desarrollo": lambda u, d: d.get("name") or d.get("id"),
}

# facets de DESARROLLOS: extractor(dev) -> valor
_DEV_FACETS: Dict[str, Callable] = {
    "entrega": _entrega,
    "tamaño_edificio": _band_unidades,
    "altura": _band_altura,
    "amenidades_nivel": _band_amenidades,
    "tier_precio": lambda d: _band_tier(d.get("price_from")),
    "property_type": lambda d: str(d.get("property_type") or "—").lower(),
    "creditos": lambda d: ", ".join(d.get("creditos_aceptados") or []) or "—",
    "colonia": lambda d: d.get("colonia") or d.get("colonia_id"),
    "alcaldia": lambda d: d.get("alcaldia"),
    "desarrollador": lambda d: d.get("developer_id") or "—",
}


def facets_catalog() -> Dict[str, Any]:
    """Catálogo de facets disponibles por población."""
    return {
        "poblaciones": ["unidades", "desarrollos", "demanda"],
        "facets": {"unidades": sorted(_UNIT_FACETS.keys()), "desarrollos": sorted(_DEV_FACETS.keys()),
                   "demanda": ["intencion", "atributo_buscado", "tier_buscado", "tipologia_buscada", "colonia", "alcaldia"]},
        "ventanas": ["live", "1d", "7d", "15d", "30d", "90d", "6m", "12m"],
        "series": ["dia", "semana", "quincena", "mes"],
    }


def _geo_match(d, geo):
    if not geo:
        return True
    import demand_intelligence as di
    lvl, val = geo
    return (lvl == "colonia" and d.get("colonia_id") == val) or (lvl == "alcaldia" and d.get("alcaldia") == val) \
        or (lvl == "corredor" and di._corridor(d.get("colonia_id"), d.get("alcaldia")) == val) or (lvl == "desarrollo" and d.get("id") == val) \
        or (lvl == "ciudad")


def _unit_pass(u, d, filtros):
    for fid, want in (filtros or {}).items():
        fn = _UNIT_FACETS.get(fid)
        if fn and str(fn(u, d)) != str(want):
            return False
    return True


def _dev_pass(d, filtros):
    for fid, want in (filtros or {}).items():
        fn = _DEV_FACETS.get(fid)
        if fn and str(fn(d)) != str(want):
            return False
    return True


# ── conteo faceteado (supply) ───────────────────────────────────────────────────
def _supply_count(poblacion, filtros, group_by, geo):
    from data_developments import DEVELOPMENTS
    total = 0; brk = Counter()
    if poblacion == "unidades":
        gfn = _UNIT_FACETS.get(group_by)
        for d in DEVELOPMENTS:
            if not _geo_match(d, geo):
                continue
            for u in (d.get("units") or []):
                if not _unit_pass(u, d, filtros):
                    continue
                total += 1
                if gfn:
                    v = gfn(u, d)
                    if v is not None:
                        brk[v] += 1
    else:  # desarrollos
        gfn = _DEV_FACETS.get(group_by)
        for d in DEVELOPMENTS:
            if not _geo_match(d, geo) or not _dev_pass(d, filtros):
                continue
            total += 1
            if gfn:
                v = gfn(d)
                if v is not None:
                    brk[v] += 1
    return total, brk


def _geo_cols(geo):
    if not geo:
        return None
    from data_developments import DEVELOPMENTS
    import demand_intelligence as di
    lvl, val = geo
    return {d.get("colonia_id") for d in DEVELOPMENTS
            if (lvl == "colonia" and d.get("colonia_id") == val) or (lvl == "alcaldia" and d.get("alcaldia") == val)
            or (lvl == "corredor" and di._corridor(d.get("colonia_id"), d.get("alcaldia")) == val)} or None


_BOOL_ATTRS = ("terraza", "balcon", "roof_garden", "bodega", "pet_friendly")


async def _demand_breakdown(db, group_by, geo, cutoff):
    """DEMANDA por facet — cuántas señales/búsquedas piden cada valor (paralelo a la oferta). Devuelve (total, Counter)."""
    cols = _geo_cols(geo)
    qs = {}
    if cutoff:
        qs["created_at_dt"] = {"$gte": cutoff}
    if cols:
        qs["colonias"] = {"$in": list(cols)}
    total = await db.marketplace_searches.count_documents(qs)
    brk = Counter()
    if group_by == "recamaras":
        async for s in db.marketplace_searches.find(qs, {"_id": 0, "recamaras_min": 1}):
            v = _band_recamaras(s.get("recamaras_min")) if s.get("recamaras_min") else None
            if v:
                brk[v] += 1
    elif group_by == "tier_precio":
        async for s in db.marketplace_searches.find(qs, {"_id": 0, "precio_max": 1}):
            v = _band_tier(s.get("precio_max")) if s.get("precio_max") else None
            if v:
                brk[v] += 1
    elif group_by in ("colonia", "alcaldia"):
        async for s in db.marketplace_searches.find(qs, {"_id": 0, "colonias": 1}):
            for c in (s.get("colonias") or []):
                brk[c] += 1
    elif group_by in _BOOL_ATTRS or group_by in ("vista",):
        # demanda revelada: señales que enganchan con devs que tienen ese atributo
        from data_developments import DEVELOPMENTS_BY_ID
        import demand_intelligence as di
        qsig = {"type": {"$in": ["ficha_view", "like", "save", "unit_view", "intent", "atlax_query"]}}
        if cutoff:
            qsig["created_at_dt"] = {"$gte": cutoff}
        if cols:
            qsig["colonia"] = {"$in": list(cols)}
        async for s in db.buyer_signals.find(qsig, {"_id": 0, "entity_id": 1, "meta": 1}):
            d = DEVELOPMENTS_BY_ID.get(s.get("entity_id"))
            metaam = [str(a).lower() for a in di._as_feature_list((s.get("meta") or {}).get("amenidades"))]
            if group_by == "vista":
                if d:
                    for u in (d.get("units") or []):
                        if u.get("vista"):
                            brk[str(u["vista"]).lower()] += 1
                            break
            else:
                tiene = (group_by in metaam) or (d and any(u.get("roof_garden" if group_by == "roof_garden" else group_by) for u in (d.get("units") or [])))
                brk[f"con {group_by}" if tiene else f"sin {group_by}"] += 1
    return total, brk


# ── API pública ─────────────────────────────────────────────────────────────────
async def facet_query(db, poblacion: str = "unidades", filtros: Optional[Dict] = None, group_by: Optional[str] = None,
                      geo: Optional[tuple] = None, ventana: Optional[str] = None) -> Dict[str, Any]:
    """¿Cuántos [población] cumplen [filtros], agrupados por [group_by], en [geo], en [ventana]? + demanda + share."""
    filtros = filtros or {}
    cutoff = None
    if ventana and ventana not in ("live",):
        days = {"1d": 1, "7d": 7, "15d": 15, "30d": 30, "90d": 90, "6m": 180, "12m": 365}.get(ventana)
        if days:
            cutoff = dt.datetime.utcnow() - dt.timedelta(days=days)

    if poblacion in ("unidades", "desarrollos"):
        total, brk = _supply_count(poblacion, filtros, group_by, geo)
        dem_total, dem_brk = await _demand_breakdown(db, group_by, geo, cutoff)
        fuente_of = "DEVELOPMENTS.units" if poblacion == "unidades" else "DEVELOPMENTS"
        # INDEPENDIENTE — cada lado solo
        of_breakdown = [{"valor": k, "n": v, "pct": round(100 * v / max(total, 1))} for k, v in brk.most_common(30)]
        dm_breakdown = [{"valor": k, "n": v, "pct": round(100 * v / max(dem_total, 1))} for k, v in dem_brk.most_common(30)]
        # RELACIONAL — oferta vs demanda en cada valor + gap + tensión
        valores = sorted(set(brk) | set(dem_brk), key=lambda x: -(brk.get(x, 0) + dem_brk.get(x, 0)))[:30]
        por_valor = []
        for k in valores:
            of, dm = brk.get(k, 0), dem_brk.get(k, 0)
            tension = "demanda>oferta" if dm > of else "oferta>demanda" if of > dm else "equilibrado"
            por_valor.append({"valor": k, "oferta": of, "demanda": dm, "gap": dm - of, "tension": tension})
        return {"poblacion": poblacion, "filtros": filtros, "group_by": group_by, "geo": list(geo) if geo else None, "ventana": ventana,
                "independiente": {
                    "oferta": {"total": total, "fuente": fuente_of, "breakdown": of_breakdown},
                    "demanda": {"total": dem_total, "fuente": "marketplace_searches/buyer_signals", "breakdown": dm_breakdown},
                },
                "relacional": {
                    "gap_total": dem_total - total, "ratio_demanda_oferta": round(dem_total / max(total, 1), 2),
                    "por_valor": por_valor,
                    "lectura": f"OFERTA {total} vs DEMANDA {dem_total}" + (f" · por {group_by}" if group_by else "") + " — gap>0 = se busca más de lo que hay",
                },
                "procedencia": {"oferta": fuente_of, "demanda": "marketplace_searches/buyer_signals"}}

    # población = demanda
    cols = None
    if geo:
        from data_developments import DEVELOPMENTS
        import demand_intelligence as di
        lvl, val = geo
        cols = {d.get("colonia_id") for d in DEVELOPMENTS
                if (lvl == "colonia" and d.get("colonia_id") == val) or (lvl == "alcaldia" and d.get("alcaldia") == val)
                or (lvl == "corredor" and di._corridor(d.get("colonia_id"), d.get("alcaldia")) == val)} or None
    q = {}
    if cutoff:
        q["created_at_dt"] = {"$gte": cutoff}
    if cols:
        q["colonias"] = {"$in": list(cols)}
    total = await db.marketplace_searches.count_documents(q)
    brk = Counter()
    if group_by in ("tier_buscado", "tipologia_buscada"):
        field = "precio_max" if group_by == "tier_buscado" else "recamaras_min"
        async for s in db.marketplace_searches.find(q, {"_id": 0, field: 1}):
            v = _band_tier(s.get(field)) if group_by == "tier_buscado" else (_band_recamaras(s.get(field)) if s.get(field) else None)
            if v:
                brk[v] += 1
    breakdown = [{"valor": k, "n": v, "pct": round(100 * v / max(total, 1))} for k, v in brk.most_common(30)]
    return {"poblacion": "demanda", "filtros": filtros, "group_by": group_by, "geo": list(geo) if geo else None,
            "ventana": ventana, "total": total, "breakdown": breakdown,
            "lectura": f"{total} búsquedas en el corte", "procedencia": {"fuente": "marketplace_searches", "n": total}}


async def facet_crosstab(db, poblacion: str, facet_a: str, facet_b: str, geo: Optional[tuple] = None) -> Dict[str, Any]:
    """Cross-tab: conteo de [población] por facet_a × facet_b (tabla 2D). El upgrade — no un número, una matriz."""
    from data_developments import DEVELOPMENTS
    grid = defaultdict(lambda: defaultdict(int)); va = set(); vb = set()
    if poblacion == "unidades":
        fa, fb = _UNIT_FACETS.get(facet_a), _UNIT_FACETS.get(facet_b)
        for d in DEVELOPMENTS:
            if not _geo_match(d, geo):
                continue
            for u in (d.get("units") or []):
                a, b = fa(u, d), fb(u, d)
                if a is not None and b is not None:
                    grid[a][b] += 1; va.add(a); vb.add(b)
    else:
        fa, fb = _DEV_FACETS.get(facet_a), _DEV_FACETS.get(facet_b)
        for d in DEVELOPMENTS:
            if not _geo_match(d, geo):
                continue
            a, b = fa(d), fb(d)
            if a is not None and b is not None:
                grid[a][b] += 1; va.add(a); vb.add(b)
    cols = sorted(vb)
    filas = [{"fila": a, **{c: grid[a].get(c, 0) for c in cols}, "total": sum(grid[a].values())} for a in sorted(va, key=lambda x: -sum(grid[x].values()))]
    return {"poblacion": poblacion, "facet_a": facet_a, "facet_b": facet_b, "columnas": cols, "filas": filas,
            "lectura": f"{poblacion} por {facet_a} × {facet_b}"}


async def serie_temporal(db, poblacion: str = "demanda", filtros: Optional[Dict] = None, geo: Optional[tuple] = None,
                         granularidad: str = "semana", periodos: int = 12) -> Dict[str, Any]:
    """Serie de tiempo del conteo (día/semana/quincena/mes) — cómo cambia. Sobre demanda (señales con timestamp)."""
    cols = None
    if geo:
        from data_developments import DEVELOPMENTS
        import demand_intelligence as di
        lvl, val = geo
        cols = {d.get("colonia_id") for d in DEVELOPMENTS
                if (lvl == "colonia" and d.get("colonia_id") == val) or (lvl == "alcaldia" and d.get("alcaldia") == val)
                or (lvl == "corredor" and di._corridor(d.get("colonia_id"), d.get("alcaldia")) == val)} or None
    days = {"dia": 1, "semana": 7, "quincena": 15, "mes": 30}.get(granularidad, 7)
    cutoff = dt.datetime.utcnow() - dt.timedelta(days=days * periodos)
    q = {"created_at_dt": {"$gte": cutoff}}
    if cols:
        q["colonias"] = {"$in": list(cols)}
    buckets = Counter()
    async for s in db.marketplace_searches.find(q, {"_id": 0, "created_at_dt": 1}):
        t = s.get("created_at_dt")
        if isinstance(t, dt.datetime):
            b = int((dt.datetime.utcnow() - t).days // days)
            buckets[b] += 1
    serie = [{"periodo_atras": i, "n": buckets.get(i, 0)} for i in range(periodos)]
    return {"poblacion": poblacion, "granularidad": granularidad, "geo": list(geo) if geo else None, "serie": serie,
            "lectura": f"búsquedas por {granularidad}, últimos {periodos} periodos"}


async def unmet_combos(db, top: int = 12) -> Dict[str, Any]:
    """LO QUE NO EXISTE — combinaciones (colonia × tipología × tier) que se BUSCAN pero tienen 0 oferta. La oportunidad invisible."""
    from data_developments import DEVELOPMENTS
    # oferta: set de (colonia, recamaras, tier)
    oferta = set()
    for d in DEVELOPMENTS:
        for u in (d.get("units") or []):
            oferta.add((d.get("colonia_id"), _band_recamaras(u.get("bedrooms")), _band_tier(u.get("price"))))
    # demanda: búsquedas por (colonia, recamaras, tier)
    huecos = Counter()
    async for s in db.marketplace_searches.find({"colonias": {"$nin": [None, []]}}, {"_id": 0, "colonias": 1, "recamaras_min": 1, "precio_max": 1}):
        rec = _band_recamaras(s.get("recamaras_min")) if s.get("recamaras_min") else None
        tier = _band_tier(s.get("precio_max")) if s.get("precio_max") else None
        for c in (s.get("colonias") or []):
            combo = (c, rec, tier)
            if rec and tier and combo not in oferta:
                huecos[combo] += 1
    return {"huecos": [{"colonia": k[0], "recamaras": k[1], "tier": k[2], "busquedas": v} for k, v in huecos.most_common(top)],
            "lectura": "se busca pero NO existe oferta — la oportunidad invisible (demanda con 0 supply)"}
