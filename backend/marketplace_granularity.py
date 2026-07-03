"""GRANULARIDAD AVANZADA DEL MARKETPLACE — 20 dimensiones de nivel profundo (análisis del dato YA capturado).

10 NUEVAS (no mencionadas antes) + 10 del 'mapa profundo'. Cada una es una agregación REAL sobre buyer_signals /
marketplace_searches / asistente_messages / leads. Las predictivas son HEURÍSTICAS honestas (revealed, no ML aún).
Conectadas: superadmin (todas, /deep-plus) · dev (oferta/precio, scope colonias) · asesor (lead, por visitante).

LLEVADO 'AL UNIVERSO' (2026-06): cada función conserva 100% de sus claves históricas (los consumidores —
demand_intelligence.zone_intelligence, composite_metrics.py, run_all — las leen por nombre) y SOLO AGREGA nuevas
dimensiones: desglose por colonia / banda de tiempo / segmento (intent·device·tier·uso·canal), distribución por buckets,
rankings, un campo derivado accionable y una clave 'insight' (lectura de negocio del universo completo de la métrica).
"""
import datetime as dt
import statistics
from collections import defaultdict, Counter
from typing import Any, Dict, List, Optional


def _cut(days):
    return dt.datetime.utcnow() - dt.timedelta(days=days)


def _rank(d, top=12, kname="k", vname="n"):
    return [{kname: k, vname: v} for k, v in sorted(d.items(), key=lambda x: -x[1])[:top]]


def _pct(part, whole):
    return round(100 * part / whole) if whole else 0


def _month(d):
    return d.strftime("%Y-%m") if isinstance(d, dt.datetime) else None


def _week(d):
    if not isinstance(d, dt.datetime):
        return None
    iso = d.isocalendar()
    return f"{iso[0]}-W{iso[1]:02d}"


def _price_band(pm):
    """Banda de precio canónica (mismas fronteras que price_elasticity)."""
    if pm <= 3e6:
        return "0-3M"
    if pm <= 5e6:
        return "3-5M"
    if pm <= 8e6:
        return "5-8M"
    if pm <= 12e6:
        return "8-12M"
    if pm <= 20e6:
        return "12-20M"
    return "20M+"


PRICE_ORDER = ["0-3M", "3-5M", "5-8M", "8-12M", "12-20M", "20M+"]

# Pesos de tipo de señal → "valor" / intención (alineado con demand_intelligence._PROP_WEIGHT, con fallback propio).
_POS_TYPES = {"save", "unit_save", "like", "intent", "atlax_apartado", "compare", "zone_intent"}
_NEG_TYPES = {"dismiss", "unlike", "unsave"}
_INTENT_TYPES = {"intent", "payment_explore", "roi_explore", "atlax_apartado", "lead", "zone_intent"}


def _tier_of_price(p):
    """Tier de mercado por precio 'from' del dev (para segmentar demanda por gama)."""
    if not p:
        return "sin_precio"
    if p <= 4e6:
        return "entrada"
    if p <= 9e6:
        return "medio"
    if p <= 18e6:
        return "alto"
    return "lujo"


# ═══════════════════ 10 NUEVAS (no mencionadas) ═══════════════════

async def seasonality(db, since_days: int = 540) -> Dict[str, Any]:
    """1· ESTACIONALIDAD — demanda por mes (ciclos de temporada). 'pico en marzo, valle en diciembre'.
    Universo: + por_semana, + por_dia_de_semana, + estacionalidad por colonia (cada zona tiene su propio ciclo),
    + por tipo de señal, + pico/valle/tendencia derivados."""
    by_m = defaultdict(int)
    by_w = defaultdict(int)
    by_dow = defaultdict(int)             # día de semana (0=lun..6=dom)
    by_type_m = defaultdict(lambda: defaultdict(int))   # tipo -> mes
    by_col_m = defaultdict(lambda: defaultdict(int))    # colonia -> mes
    DOW = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
    async for s in db.buyer_signals.find({"created_at_dt": {"$gte": _cut(since_days)}},
                                         {"_id": 0, "created_at_dt": 1, "type": 1, "colonia": 1}):
        d = s.get("created_at_dt")
        if not isinstance(d, dt.datetime):
            continue
        m = d.strftime("%Y-%m")
        by_m[m] += 1
        by_w[_week(d)] += 1
        by_dow[DOW[d.weekday()]] += 1
        if s.get("type"):
            by_type_m[s["type"]][m] += 1
        if s.get("colonia"):
            by_col_m[s["colonia"]][m] += 1
    por_mes = dict(sorted(by_m.items()))
    # pico / valle / tendencia (último mes vs promedio)
    pico = max(por_mes.items(), key=lambda x: x[1])[0] if por_mes else None
    valle = min(por_mes.items(), key=lambda x: x[1])[0] if por_mes else None
    vals = list(por_mes.values())
    ult = vals[-1] if vals else 0
    prom = round(statistics.mean(vals)) if vals else 0
    tendencia = "subiendo" if ult > prom * 1.1 else "bajando" if ult < prom * 0.9 else "estable"
    # colonia con la estacionalidad más marcada (mayor coef. de variación)
    col_swing = []
    for c, mm in by_col_m.items():
        cv = sorted(mm.values())
        if len(cv) >= 2 and statistics.mean(cv):
            col_swing.append({"colonia": c, "variacion": round(statistics.pstdev(cv) / statistics.mean(cv), 2)})
    col_swing.sort(key=lambda x: -x["variacion"])
    return {
        "por_mes": por_mes,
        "lectura": "planea lanzamientos/campañas en los meses pico",
        # ── universo ──
        "por_semana": dict(sorted(by_w.items())),
        "por_dia_semana": {d: by_dow.get(d, 0) for d in DOW},
        "por_tipo_mes": {t: dict(sorted(mm.items())) for t, mm in by_type_m.items()},
        "por_colonia_mes": {c: dict(sorted(mm.items())) for c, mm in sorted(by_col_m.items(), key=lambda x: -sum(x[1].values()))[:10]},
        "pico_mes": pico, "valle_mes": valle, "tendencia": tendencia, "promedio_mensual": prom,
        "colonias_mas_estacionales": col_swing[:6],
        "insight": f"pico en {pico}, valle en {valle}; el mercado va {tendencia} vs su promedio",
    }


async def supply_demand_balance(db, colonias: Optional[List[str]] = None, since_days: int = 365) -> Dict[str, Any]:
    """2· BALANCE OFERTA-DEMANDA por colonia — señales de demanda vs unidades en oferta = saturación o hueco.
    Universo: + clasificación hueco/equilibrio/saturado, + demanda con intención (no solo views), + tier de oferta,
    + ranking de huecos y saturados, + resumen del mercado."""
    from data_developments import DEVELOPMENTS
    dem = defaultdict(int)
    dem_intent = defaultdict(int)        # demanda con intención (más valiosa)
    async for s in db.buyer_signals.find({"created_at_dt": {"$gte": _cut(since_days)}, "colonia": {"$nin": [None, ""]}},
                                         {"_id": 0, "colonia": 1, "type": 1}):
        if not colonias or s["colonia"] in colonias:
            dem[s["colonia"]] += 1
            if s.get("type") in _INTENT_TYPES:
                dem_intent[s["colonia"]] += 1
    sup = defaultdict(int)
    sup_devs = defaultdict(int)
    tier_by_col = {}
    for d in DEVELOPMENTS:
        c = d.get("colonia_id")
        if c and (not colonias or c in colonias):
            sup[c] += len(d.get("units") or []) or 1
            sup_devs[c] += 1
            tier_by_col[c] = _tier_of_price(d.get("price_from"))
    rows = []
    huecos = []
    saturados = []
    for c in set(dem) | set(sup):
        de, su = dem.get(c, 0), sup.get(c, 0)
        bal = round(de / max(su, 1), 2)
        clase = "hueco" if bal >= 1.5 else "saturado" if bal <= 0.4 else "equilibrio"
        row = {"colonia": c, "demanda": de, "oferta_unidades": su, "balance": bal,
               "demanda_con_intencion": dem_intent.get(c, 0), "desarrollos": sup_devs.get(c, 0),
               "tier": tier_by_col.get(c, "sin_precio"), "clase": clase}
        rows.append(row)
        if clase == "hueco":
            huecos.append(row)
        elif clase == "saturado":
            saturados.append(row)
    rows.sort(key=lambda x: -x["balance"])
    huecos.sort(key=lambda x: -x["balance"])
    saturados.sort(key=lambda x: x["balance"])
    return {
        "colonias": rows[:15],
        "lectura": "balance alto = mucha demanda, poca oferta (hueco); bajo = saturado",
        # ── universo ──
        "huecos": huecos[:8], "saturados": saturados[:8],
        "resumen": {"huecos": len(huecos), "equilibrio": len(rows) - len(huecos) - len(saturados), "saturados": len(saturados)},
        "insight": (f"{len(huecos)} colonias con hueco (construye), {len(saturados)} saturadas (no entres)"
                    if rows else "sin señales de demanda en el periodo"),
    }


async def absorption_signal(db, colonias: Optional[List[str]] = None, since_days: int = 365, top: int = 12) -> Dict[str, Any]:
    """3· VELOCIDAD DE ABSORCIÓN por feature — qué features acumulan más demanda por unidad ofertada = lo que se desplaza.
    Universo: + clasificación se_desplaza/normal/saturado, + cuántos devs ofrecen cada feature, + top huecos de feature
    (alta demanda sin oferta), + features sobre-ofertados, + serie temporal de la demanda del top feature."""
    import demand_intelligence as di
    feat = await di.demand_by_feature(db, colonias=colonias, since_days=since_days, top=50)
    demand = {f["feature"]: f["demanda"] for f in feat["top_features"]}
    serie_by_feat = {f["feature"]: f.get("serie", {}) for f in feat["top_features"]}
    from data_developments import DEVELOPMENTS
    sup = defaultdict(int)
    devs_with = defaultdict(int)
    for d in DEVELOPMENTS:
        if colonias and d.get("colonia_id") not in colonias:
            continue
        for f in di._dev_features(d):
            sup[f] += len(d.get("units") or []) or 1
            devs_with[f] += 1
    rows = []
    huecos_feature = []     # demanda alta, oferta nula/baja
    sobreofertados = []     # oferta alta, demanda baja
    for f, de in demand.items():
        su = sup.get(f, 0)
        ab = round(de / max(su, 1), 2)
        clase = "se_desplaza" if ab >= 2 else "saturado" if ab <= 0.5 else "normal"
        row = {"feature": f, "demanda": de, "oferta": su, "absorcion": ab,
               "desarrollos_que_lo_ofrecen": devs_with.get(f, 0), "clase": clase}
        rows.append(row)
        if su == 0 and de > 0:
            huecos_feature.append({"feature": f, "demanda": de})
        elif clase == "saturado":
            sobreofertados.append(row)
    rows.sort(key=lambda x: -x["absorcion"])
    huecos_feature.sort(key=lambda x: -x["demanda"])
    top_feature = rows[0]["feature"] if rows else None
    return {
        "features": rows[:top],
        "lectura": "absorción alta = se desplaza rápido (construye más); baja = ya saturado",
        # ── universo ──
        "huecos_feature": huecos_feature[:8], "sobreofertados": sobreofertados[:8],
        "serie_top_feature": serie_by_feat.get(top_feature, {}) if top_feature else {},
        "insight": (f"'{top_feature}' es lo que más se desplaza; {len(huecos_feature)} features con demanda y SIN oferta"
                    if top_feature else "sin demanda por feature en el periodo"),
    }


async def rfm_segments(db, since_days: int = 365) -> Dict[str, Any]:
    """4· SEGMENTOS RFM — visitantes por Recencia (días desde última señal), Frecuencia (# señales), Valor (intención).
    Clasifica en campeones / prometedores / en-riesgo / dormidos.
    Universo: + promedios R/F/M por segmento, + distribución de recencia (buckets), + distribución de frecuencia,
    + lista de campeones (para activar), + % accionable."""
    import demand_intelligence as di
    now = dt.datetime.utcnow()
    agg = defaultdict(lambda: {"n": 0, "last": None, "val": 0.0})
    # $group en Mongo por (visitante, tipo): count + max(created_at_dt) → el RFM se arma sobre el agregado
    # (mismo resultado: val = peso×conteo, pesos exactos en binario; antes streameaba TODA la ventana)
    pipe = [
        {"$match": {"created_at_dt": {"$gte": _cut(since_days)}}},
        {"$group": {"_id": {"v": "$visitor_id", "t": "$type"},
                    "n": {"$sum": 1}, "last": {"$max": "$created_at_dt"}}},
    ]
    async for g in db.buyer_signals.aggregate(pipe):
        v = g["_id"].get("v")
        if not v:
            continue
        a = agg[v]; a["n"] += g["n"]; a["val"] += di._PROP_WEIGHT.get(g["_id"].get("t"), 0.5) * g["n"]
        t = g.get("last")
        if isinstance(t, dt.datetime) and (a["last"] is None or t > a["last"]):
            a["last"] = t
    seg = defaultdict(int)
    seg_stats = defaultdict(lambda: {"rec": [], "freq": [], "val": []})
    rec_dist = defaultdict(int)       # 0-7 / 8-14 / 15-45 / 46+
    freq_dist = defaultdict(int)      # 1 / 2-4 / 5-9 / 10+
    campeones = []
    for v, a in agg.items():
        rec = (now - a["last"]).days if a["last"] else 999
        hot = a["val"] >= 8 or a["n"] >= 5
        if rec <= 7 and hot:
            name = "campeones"
        elif rec <= 14:
            name = "prometedores"
        elif rec <= 45:
            name = "en_riesgo"
        else:
            name = "dormidos"
        seg[name] += 1
        st = seg_stats[name]; st["rec"].append(rec); st["freq"].append(a["n"]); st["val"].append(round(a["val"], 1))
        rec_dist["0-7" if rec <= 7 else "8-14" if rec <= 14 else "15-45" if rec <= 45 else "46+"] += 1
        freq_dist["1" if a["n"] == 1 else "2-4" if a["n"] <= 4 else "5-9" if a["n"] <= 9 else "10+"] += 1
        if name == "campeones":
            campeones.append({"visitor_id": v, "señales": a["n"], "valor": round(a["val"], 1), "recencia_dias": rec})
    campeones.sort(key=lambda x: -x["valor"])
    perfil = {k: {"n": len(st["rec"]),
                  "recencia_media": round(statistics.mean(st["rec"])) if st["rec"] else 0,
                  "frecuencia_media": round(statistics.mean(st["freq"]), 1) if st["freq"] else 0,
                  "valor_medio": round(statistics.mean(st["val"]), 1) if st["val"] else 0}
              for k, st in seg_stats.items()}
    accionables = seg.get("campeones", 0) + seg.get("en_riesgo", 0) + seg.get("dormidos", 0)
    return {
        "segmentos": dict(seg), "total_visitantes": len(agg),
        "lectura": "campeones=actívalos ya · en_riesgo/dormidos=win-back",
        # ── universo ──
        "perfil_por_segmento": perfil,
        "distribucion_recencia": dict(rec_dist), "distribucion_frecuencia": dict(freq_dist),
        "campeones_lista": campeones[:12],
        "pct_accionable": _pct(accionables, len(agg)),
        "insight": f"{seg.get('campeones', 0)} campeones para activar YA · {seg.get('en_riesgo', 0) + seg.get('dormidos', 0)} para win-back",
    }


async def price_elasticity(db, since_days: int = 365) -> Dict[str, Any]:
    """5· ELASTICIDAD PRECIO-DEMANDA — cuántas búsquedas en cada banda de precio = la curva de demanda.
    Universo: + sweet spot (banda con más demanda), + % por banda, + curva por USO (vivir vs invertir),
    + curva revelada (precio de los devs que MIRAN, no el que declaran), + búsquedas sin resultados por banda (unmet)."""
    bands = defaultdict(int)
    bands_uso = defaultdict(lambda: defaultdict(int))   # uso -> banda
    bands_unmet = defaultdict(int)                       # banda -> búsquedas con 0 resultados
    async for s in db.marketplace_searches.find({"created_at_dt": {"$gte": _cut(since_days)}, "precio_max": {"$gt": 0}},
                                                {"_id": 0, "precio_max": 1, "uso": 1, "results_count": 1, "unmet": 1}):
        b = _price_band(s["precio_max"])
        bands[b] += 1
        bands_uso[s.get("uso") or "sin_uso"][b] += 1
        if s.get("unmet") or (s.get("results_count") == 0):
            bands_unmet[b] += 1
    # curva REVELADA: precio_from de los devs que el visitante realmente mira
    from data_developments import DEVELOPMENTS_BY_ID
    revealed = defaultdict(int)
    async for s in db.buyer_signals.find({"created_at_dt": {"$gte": _cut(since_days)},
                                          "type": {"$in": ["ficha_view", "unit_view", "like", "save", "unit_save", "compare"]},
                                          "entity_id": {"$nin": [None, ""]}}, {"_id": 0, "entity_id": 1}):
        d = DEVELOPMENTS_BY_ID.get(s.get("entity_id"))
        if d and d.get("price_from"):
            revealed[_price_band(d["price_from"])] += 1
    curva = {b: bands.get(b, 0) for b in PRICE_ORDER}
    tot = sum(curva.values())
    sweet = max(curva.items(), key=lambda x: x[1])[0] if tot else None
    return {
        "curva": curva,
        "lectura": "dónde se concentra la demanda = el sweet spot de precio",
        # ── universo ──
        "sweet_spot": sweet, "total_busquedas": tot,
        "curva_pct": {b: _pct(curva[b], tot) for b in PRICE_ORDER},
        "curva_por_uso": {u: {b: bb.get(b, 0) for b in PRICE_ORDER} for u, bb in bands_uso.items()},
        "curva_revelada": {b: revealed.get(b, 0) for b in PRICE_ORDER},
        "sin_resultados_por_banda": {b: bands_unmet.get(b, 0) for b in PRICE_ORDER},
        "insight": f"el sweet spot declarado es {sweet}; compara con la curva revelada (lo que de verdad miran)",
    }


async def viral_shares(db, since_days: int = 365, top: int = 10) -> Dict[str, Any]:
    """6· COEFICIENTE VIRAL — quién comparte qué (señal share) = alcance orgánico + qué desarrollos se comparten más.
    Universo: + coeficiente viral (shares/compartidor), + por colonia, + serie mensual, + compartidores top,
    + proxy de viralidad cuando aún no hay 'share' (señales de alta intención que suelen preceder al compartir)."""
    from data_developments import DEVELOPMENTS_BY_ID
    by_dev = defaultdict(int); sharers = Counter(); n = 0
    by_col = defaultdict(int); by_month = defaultdict(int)
    async for s in db.buyer_signals.find({"type": "share", "created_at_dt": {"$gte": _cut(since_days)}},
                                         {"_id": 0, "entity_id": 1, "visitor_id": 1, "colonia": 1, "created_at_dt": 1}):
        n += 1
        if s.get("entity_id"):
            by_dev[s["entity_id"]] += 1
        if s.get("visitor_id"):
            sharers[s["visitor_id"]] += 1
        if s.get("colonia"):
            by_col[s["colonia"]] += 1
        if isinstance(s.get("created_at_dt"), dt.datetime):
            by_month[_month(s["created_at_dt"])] += 1
    nm = lambda d: (DEVELOPMENTS_BY_ID.get(d, {}) or {}).get("name") or d
    coef = round(n / max(len(sharers), 1), 2)
    # proxy: si no hay shares, usa 'compare' (comparar es señal pre-compartir/recomendar)
    proxy = {}
    if n == 0:
        pc = defaultdict(int)
        async for s in db.buyer_signals.find({"type": "compare", "created_at_dt": {"$gte": _cut(since_days)}},
                                             {"_id": 0, "entity_id": 1}):
            if s.get("entity_id"):
                pc[s["entity_id"]] += 1
        proxy = {"señal": "compare", "mas_comparados": [{"dev": nm(d), "n": v} for d, v in sorted(pc.items(), key=lambda x: -x[1])[:top]]}
    return {
        "total_compartidos": n, "compartidores_unicos": len(sharers),
        "mas_compartidos": [{"dev": nm(d), "n": v} for d, v in sorted(by_dev.items(), key=lambda x: -x[1])[:top]],
        "lectura": "lo más compartido = tu mejor anzuelo orgánico",
        # ── universo ──
        "coeficiente_viral": coef,
        "por_colonia": _rank(by_col, top, "colonia", "n"),
        "serie_mensual": dict(sorted(by_month.items())),
        "compartidores_top": [{"visitor_id": v, "shares": c} for v, c in sharers.most_common(top)],
        "proxy_sin_shares": proxy,
        "insight": (f"cada compartidor genera ~{coef} shares" if n else "aún no hay 'share'; usa el proxy 'compare' como pre-señal viral"),
    }


async def funnel_dropoff(db, since_days: int = 365) -> Dict[str, Any]:
    """7· FUGAS DEL EMBUDO — tasas de conversión etapa a etapa (vio→guardó→intención→lead). Dónde se pierde la gente.
    Universo: + conversión global vio→lead, + mayor fuga (cuello de botella), + embudo por colonia top, + embudo por mes,
    + caídas absolutas (cuánta gente se pierde en cada paso)."""
    stages = {"vio": ["ficha_view", "view", "unit_view"], "guardo": ["save", "unit_save", "like"],
              "intencion": ["intent", "payment_explore", "roi_explore", "atlax_apartado", "zone_intent"], "lead": ["lead"]}
    reached = {k: set() for k in stages}
    by_col = defaultdict(lambda: {k: set() for k in stages})
    by_month = defaultdict(lambda: {k: set() for k in stages})
    async for s in db.buyer_signals.find({"created_at_dt": {"$gte": _cut(since_days)}},
                                         {"_id": 0, "visitor_id": 1, "type": 1, "colonia": 1, "created_at_dt": 1}):
        v = s.get("visitor_id")
        if not v:
            continue
        col = s.get("colonia"); mo = _month(s.get("created_at_dt"))
        for st, types in stages.items():
            if s.get("type") in types:
                reached[st].add(v)
                if col:
                    by_col[col][st].add(v)
                if mo:
                    by_month[mo][st].add(v)
    order = ["vio", "guardo", "intencion", "lead"]
    counts = {k: len(reached[k]) for k in order}
    rates = {}
    perdidas = {}
    for i in range(1, len(order)):
        prev = counts[order[i - 1]]
        rates[f"{order[i-1]}→{order[i]}"] = _pct(counts[order[i]], prev)
        perdidas[f"{order[i-1]}→{order[i]}"] = max(prev - counts[order[i]], 0)
    mayor_fuga = min(rates.items(), key=lambda x: x[1])[0] if rates else None
    col_funnels = {c: {k: len(d[k]) for k in order} for c, d in
                   sorted(by_col.items(), key=lambda x: -len(x[1]["vio"]))[:8]}
    month_funnels = {m: {k: len(d[k]) for k in order} for m, d in sorted(by_month.items())}
    return {
        "por_etapa": counts, "conversion_pct": rates,
        "lectura": "la caída más grande = donde arreglar el embudo",
        # ── universo ──
        "conversion_global_pct": _pct(counts["lead"], counts["vio"]),
        "perdidas_absolutas": perdidas, "mayor_fuga": mayor_fuga,
        "por_colonia": col_funnels, "por_mes": month_funnels,
        "insight": f"la mayor fuga es {mayor_fuga}; de cada 100 que ven, {_pct(counts['lead'], counts['vio'])} llegan a lead",
    }


async def competitor_mentions(db, since_days: int = 365, top: int = 12) -> Dict[str, Any]:
    """8· MENCIONES DE COMPETIDOR — proyectos/zonas externas que el comprador nombra en la conversación (lo que evalúa
    contra ti). Heurística: nombres con mayúscula no-DMX + keywords de competencia.
    Universo: + share of voice (% de menciones por término), + serie mensual, + co-mención con zonas DMX,
    + share-of-conversation (% de mensajes que mencionan competencia), + competidor #1."""
    cutoff_dt = _cut(since_days)
    cutoff = cutoff_dt.isoformat()
    kws = ("be grand", "artigas", "be tower", "reforma", "live", "park", "residencial", "torre", "be ")
    zonas = ("polanco", "roma", "condesa", "del valle", "narvarte", "juárez", "juarez", "nápoles", "napoles", "anzures")
    hits = defaultdict(int); n = 0; msgs_con_comp = 0
    by_month = defaultdict(int)
    co_zona = defaultdict(int)        # término competidor co-mencionado con zona DMX
    # filtro de fecha EN la query (índice role+created_at); $or cubre datetime nativo e ISO-string legado
    async for m in db.asistente_messages.find(
            {"role": "user", "$or": [{"created_at": {"$gte": cutoff_dt}}, {"created_at": {"$gte": cutoff}}]},
            {"_id": 0, "content": 1, "created_at": 1}):
        ca = str(m.get("created_at") or "")
        if ca < cutoff:
            continue
        txt = (m.get("content") or "").lower()
        if not txt:
            continue
        n += 1
        found = [k for k in kws if k in txt]
        if found:
            msgs_con_comp += 1
            mo = ca[:7]
            for k in found:
                hits[k.strip()] += 1
                by_month[mo] += 1
            for z in zonas:
                if z in txt:
                    for k in found:
                        co_zona[f"{k.strip()} × {z}"] += 1
    tot_menciones = sum(hits.values())
    sov = [{"termino": k, "n": v, "share_pct": _pct(v, tot_menciones)} for k, v in sorted(hits.items(), key=lambda x: -x[1])[:top]]
    top1 = sov[0]["termino"] if sov else None
    return {
        "mensajes": n, "menciones": _rank(hits, top, "termino", "n"),
        "lectura": "contra quién/qué te comparan (señal de competencia)",
        # ── universo ──
        "share_of_voice": sov, "competidor_1": top1,
        "serie_mensual": dict(sorted(by_month.items())),
        "co_mencion_zona": _rank(co_zona, top, "par", "n"),
        "share_of_conversation_pct": _pct(msgs_con_comp, n),
        "insight": (f"te comparan más contra '{top1}'; aparece en {_pct(msgs_con_comp, n)}% de los mensajes"
                    if top1 else "sin menciones de competencia en la conversación"),
    }


async def locale_split(db, since_days: int = 365) -> Dict[str, Any]:
    """9· LOCALE / CANAL del comprador — idioma + canal de entrada (web/bubble/whatsapp) = de dónde viene la demanda.
    Universo: + referral_source (la fuente exacta), + device (de user_agent_hash, móvil vs desktop heurístico),
    + uso (vivir vs invertir) de las búsquedas, + % por dimensión, + canal dominante, + cruce canal×lead (conversión)."""
    locales = defaultdict(int); channels = defaultdict(int)
    referrals = defaultdict(int); device = defaultdict(int)
    canal_lead = defaultdict(lambda: {"sesiones": 0, "leads": 0})
    async for c in db.buyer_coach_conversations.find({}, {"_id": 0, "locale": 1}):
        if c.get("locale"):
            locales[c["locale"]] += 1
    # cutoff de since_days EN la query (antes leía TODAS las sesiones); $or cubre datetime nativo e ISO-string legado
    _sc = _cut(since_days)
    async for s in db.asistente_sessions.find(
            {"$or": [{"created_at": {"$gte": _sc}}, {"created_at": {"$gte": _sc.isoformat()}}]},
            {"_id": 0, "channel": 1, "referral_source": 1, "user_agent_hash": 1, "captured_lead_id": 1}):
        ch = s.get("channel")
        if ch:
            channels[ch] += 1
        referrals[s.get("referral_source") or "directo"] += 1
        # device heurístico: bubble/whatsapp suelen ser móvil
        dv = "movil" if (ch and ("bubble" in ch or "whats" in ch)) else "desktop_o_web"
        device[dv] += 1
        k = s.get("channel") or "directo"
        canal_lead[k]["sesiones"] += 1
        if s.get("captured_lead_id"):
            canal_lead[k]["leads"] += 1
    uso = defaultdict(int)
    async for q in db.marketplace_searches.find({"created_at_dt": {"$gte": _cut(since_days)}}, {"_id": 0, "uso": 1}):
        uso[q.get("uso") or "sin_uso"] += 1
    tot_ch = sum(channels.values())
    canal_dom = max(channels.items(), key=lambda x: x[1])[0] if channels else None
    return {
        "idiomas": dict(locales), "canales": dict(channels),
        "lectura": "de dónde y en qué idioma llega el comprador",
        # ── universo ──
        "referral_source": dict(sorted(referrals.items(), key=lambda x: -x[1])),
        "device": dict(device), "uso_busqueda": dict(uso),
        "canales_pct": {k: _pct(v, tot_ch) for k, v in channels.items()},
        "canal_dominante": canal_dom,
        "conversion_por_canal": {k: {**v, "conversion_pct": _pct(v["leads"], v["sesiones"])} for k, v in canal_lead.items()},
        "insight": f"el canal dominante es {canal_dom}; revisa qué canal convierte mejor en conversion_por_canal",
    }


async def reengagement(db, since_days: int = 365) -> Dict[str, Any]:
    """10· RE-ENGAGEMENT / WIN-BACK — visitantes que volvieron tras un hueco (≥3 días) = interés sostenido, candidatos a
    reactivar.
    Universo: + distribución de # días activos, + hueco medio/máximo, + visitantes una-sola-vez (la fuga real),
    + lista de los que volvieron tras hueco (para mandarles algo), + % que regresa."""
    days_by_v = defaultdict(set)
    async for s in db.buyer_signals.find({"created_at_dt": {"$gte": _cut(since_days)}},
                                         {"_id": 0, "visitor_id": 1, "created_at_dt": 1}):
        v, t = s.get("visitor_id"), s.get("created_at_dt")
        if v and isinstance(t, dt.datetime):
            days_by_v[v].add(t.date())
    multi = [v for v, ds in days_by_v.items() if len(ds) >= 2]
    dist_dias = defaultdict(int)
    gap_returners = 0
    gaps = []
    returner_list = []
    for v, ds in days_by_v.items():
        nd = len(ds)
        dist_dias["1" if nd == 1 else "2" if nd == 2 else "3-4" if nd <= 4 else "5+"] += 1
        if nd >= 2:
            sd = sorted(ds)
            vgaps = [(sd[i] - sd[i - 1]).days for i in range(1, len(sd))]
            mx = max(vgaps)
            gaps.append(mx)
            if mx >= 3:
                gap_returners += 1
                returner_list.append({"visitor_id": v, "dias_activos": nd, "mayor_hueco_dias": mx})
    returner_list.sort(key=lambda x: -x["mayor_hueco_dias"])
    one_shot = dist_dias.get("1", 0)
    return {
        "visitantes": len(days_by_v), "regresaron_multi_dia": len(multi), "tras_hueco_3d": gap_returners,
        "lectura": "volvieron tras pensarlo = interés real, mándales algo",
        # ── universo ──
        "distribucion_dias_activos": dict(dist_dias),
        "hueco_medio_dias": round(statistics.mean(gaps), 1) if gaps else 0,
        "hueco_maximo_dias": max(gaps) if gaps else 0,
        "visitantes_una_vez": one_shot, "pct_regresa": _pct(len(multi), len(days_by_v)),
        "winback_lista": returner_list[:12],
        "insight": f"{_pct(len(multi), len(days_by_v))}% regresa; {one_shot} entraron una vez (esa es la fuga a recuperar)",
    }


# ═══════════════════ 10 del MAPA PROFUNDO ═══════════════════

async def decision_criteria(db, since_days: int = 365) -> Dict[str, Any]:
    """11· CRITERIOS DE DECISIÓN — con qué filtran (precio/recámaras/m²/zona/amenidad) = qué prioriza el mercado.
    Universo: + % de uso de cada criterio, + nº de criterios por búsqueda (qué tan exigentes), + criterios por USO
    (vivir vs invertir priorizan distinto), + valores típicos (mediana de recámaras/m²/precio pedidos), + criterio #1."""
    crit = defaultdict(int)
    crit_uso = defaultdict(lambda: defaultdict(int))
    n_crit_dist = defaultdict(int)          # cuántos filtros aplica cada búsqueda
    vals = {"precio_max": [], "recamaras_min": [], "m2_min": [], "banos_min": []}
    total = 0
    async for s in db.marketplace_searches.find({"created_at_dt": {"$gte": _cut(since_days)}},
                                                {"_id": 0, "precio_max": 1, "recamaras_min": 1, "m2_min": 1,
                                                 "colonias": 1, "banos_min": 1, "estacionamientos_min": 1, "uso": 1}):
        total += 1
        uso = s.get("uso") or "sin_uso"
        nfilt = 0
        for field, label in (("precio_max", "precio"), ("recamaras_min", "recámaras"), ("m2_min", "m²"),
                             ("colonias", "zona"), ("banos_min", "baños"), ("estacionamientos_min", "estacionamiento")):
            if s.get(field):
                crit[label] += 1
                crit_uso[uso][label] += 1
                nfilt += 1
            if field in vals and s.get(field):
                try:
                    vals[field].append(float(s[field]))
                except (TypeError, ValueError):
                    pass
        n_crit_dist["0" if nfilt == 0 else "1" if nfilt == 1 else "2-3" if nfilt <= 3 else "4+"] += 1
    ranked = _rank(crit, 10, "criterio", "n")
    typ = {k: round(statistics.median(v)) for k, v in vals.items() if v}
    return {
        "criterios": ranked,
        "lectura": "el criterio #1 = lo que NO negocian",
        # ── universo ──
        "criterios_pct": {r["criterio"]: _pct(r["n"], total) for r in ranked},
        "criterios_por_uso": {u: _rank(cc, 10, "criterio", "n") for u, cc in crit_uso.items()},
        "filtros_por_busqueda": dict(n_crit_dist),
        "valores_tipicos": typ, "total_busquedas": total,
        "criterio_1": ranked[0]["criterio"] if ranked else None,
        "insight": (f"el criterio #1 es {ranked[0]['criterio']}; mediana pedida: {typ}" if ranked else "sin búsquedas con criterios"),
    }


async def urgency_signals(db, since_days: int = 365) -> Dict[str, Any]:
    """12· URGENCIA — lenguaje de prisa en la conversación ('me mudo en', 'ya', 'urgente', 'este mes').
    Universo: + serie mensual de la tasa de urgencia, + nivel (alta/media/baja según frases acumuladas),
    + frase #1, + co-ocurrencia urgencia×competencia (compran rápido Y comparan = caliente), + termómetro derivado."""
    cutoff_dt = _cut(since_days)
    cutoff = cutoff_dt.isoformat()
    kws = ("urgente", "ya", "rápido", "rapido", "este mes", "lo antes posible", "me mudo", "pronto", "inmediato", "esta semana")
    comp_kws = ("be grand", "artigas", "reforma", "torre", "residencial")
    n = hit = 0
    found = defaultdict(int)
    by_month = defaultdict(lambda: {"msgs": 0, "urg": 0})
    urg_y_comp = 0
    # filtro de fecha EN la query (índice role+created_at); $or cubre datetime nativo e ISO-string legado
    async for m in db.asistente_messages.find(
            {"role": "user", "$or": [{"created_at": {"$gte": cutoff_dt}}, {"created_at": {"$gte": cutoff}}]},
            {"_id": 0, "content": 1, "created_at": 1}):
        ca = str(m.get("created_at") or "")
        if ca < cutoff:
            continue
        txt = (m.get("content") or "").lower()
        if not txt:
            continue
        n += 1
        mo = ca[:7]; by_month[mo]["msgs"] += 1
        h = [k for k in kws if k in txt]
        if h:
            hit += 1
            by_month[mo]["urg"] += 1
            for k in h:
                found[k] += 1
            if any(c in txt for c in comp_kws):
                urg_y_comp += 1
    pct = _pct(hit, n)
    nivel = "alta" if pct >= 25 else "media" if pct >= 10 else "baja"
    ranked = _rank(found, 8, "frase", "n")
    return {
        "mensajes": n, "con_urgencia": hit, "urgencia_pct": pct, "señales": ranked,
        # ── universo ──
        "nivel": nivel, "frase_1": ranked[0]["frase"] if ranked else None,
        "serie_mensual_pct": {m: _pct(v["urg"], v["msgs"]) for m, v in sorted(by_month.items())},
        "urgencia_y_competencia": urg_y_comp,
        "termometro": "🔥 caliente" if nivel == "alta" else "🌡️ templado" if nivel == "media" else "❄️ frío",
        "insight": f"urgencia {nivel} ({pct}%); {urg_y_comp} mensajes mezclan prisa + comparar competencia (leads calientes)",
    }


async def sentiment_proxy(db, since_days: int = 365) -> Dict[str, Any]:
    """13· SENTIMIENTO (proxy) — ratio de señales positivas (save/like/intent) vs negativas (dismiss) = clima del mercado.
    Universo: + desglose por tipo de señal, + sentimiento por colonia (qué zona gusta/fricciona), + serie mensual,
    + colonias más negativas (fricción de precio/oferta), + clima derivado."""
    pos = neg = 0
    by_type = defaultdict(int)
    by_col = defaultdict(lambda: {"pos": 0, "neg": 0})
    by_month = defaultdict(lambda: {"pos": 0, "neg": 0})
    types = ["save", "unit_save", "like", "intent", "atlax_apartado", "zone_intent", "compare", "dismiss", "unlike", "unsave"]
    async for s in db.buyer_signals.find({"created_at_dt": {"$gte": _cut(since_days)}, "type": {"$in": types}},
                                         {"_id": 0, "type": 1, "colonia": 1, "created_at_dt": 1}):
        t = s["type"]
        by_type[t] += 1
        is_neg = t in _NEG_TYPES
        mo = _month(s.get("created_at_dt")); col = s.get("colonia")
        if is_neg:
            neg += 1
            if col:
                by_col[col]["neg"] += 1
            if mo:
                by_month[mo]["neg"] += 1
        else:
            pos += 1
            if col:
                by_col[col]["pos"] += 1
            if mo:
                by_month[mo]["pos"] += 1
    tot = pos + neg
    ratio = _pct(pos, tot)
    col_rows = [{"colonia": c, "positivo_pct": _pct(d["pos"], d["pos"] + d["neg"]), "señales": d["pos"] + d["neg"]}
                for c, d in by_col.items()]
    col_rows.sort(key=lambda x: x["positivo_pct"])
    clima = "entusiasta" if ratio >= 80 else "neutral" if ratio >= 60 else "con fricción"
    return {
        "positivas": pos, "negativas": neg, "ratio_positivo_pct": ratio,
        "lectura": "ratio alto = mercado entusiasta; bajo = fricción (revisa precio/oferta)",
        # ── universo ──
        "por_tipo": dict(by_type),
        "por_colonia": sorted(col_rows, key=lambda x: -x["positivo_pct"])[:10],
        "colonias_mas_friccion": col_rows[:6],
        "serie_mensual_pct": {m: _pct(v["pos"], v["pos"] + v["neg"]) for m, v in sorted(by_month.items())},
        "clima": clima,
        "insight": f"clima {clima} ({ratio}% positivo); revisa colonias_mas_friccion para precio/oferta",
    }


async def predicted_budget(db, since_days: int = 365, top: int = 12) -> Dict[str, Any]:
    """14· PRESUPUESTO PREDICHO (heurística revealed) — la banda de precio de los DEVS que el visitante realmente mira
    (vs lo que declara). Por visitante con señales.
    Universo: + banda por visitante, + rango min-max mirado, + distribución del mercado por banda, + dispersión
    (visitantes 'focalizados' vs 'explorando rangos'), + presupuesto mediano del mercado."""
    from data_developments import DEVELOPMENTS_BY_ID
    by_v = defaultdict(list)
    async for s in db.buyer_signals.find({"created_at_dt": {"$gte": _cut(since_days)},
                                          "type": {"$in": ["ficha_view", "unit_view", "like", "save", "unit_save", "compare"]},
                                          "entity_id": {"$nin": [None, ""]}}, {"_id": 0, "visitor_id": 1, "entity_id": 1}):
        d = DEVELOPMENTS_BY_ID.get(s.get("entity_id"))
        if d and d.get("price_from"):
            by_v[s["visitor_id"]].append(d["price_from"])
    out = []
    market_dist = defaultdict(int)
    focalizados = dispersos = 0
    medians = []
    for v, p in by_v.items():
        if not p:
            continue
        med = round(statistics.median(p))
        medians.append(med)
        band = _price_band(med)
        market_dist[band] += 1
        spread = (max(p) - min(p)) / max(med, 1)
        if spread <= 0.5:
            focalizados += 1
        else:
            dispersos += 1
        out.append({"visitor_id": v, "presupuesto_revelado": med, "señales": len(p),
                    "banda": band, "min_visto": round(min(p)), "max_visto": round(max(p)),
                    "perfil": "focalizado" if spread <= 0.5 else "explorando_rangos"})
    out.sort(key=lambda x: -x["señales"])
    return {
        "por_visitante": out[:top],
        "lectura": "lo que MIRAN > lo que dicen — el presupuesto real para el asesor",
        # ── universo ──
        "distribucion_mercado": {b: market_dist.get(b, 0) for b in PRICE_ORDER},
        "presupuesto_mediano_mercado": round(statistics.median(medians)) if medians else 0,
        "focalizados": focalizados, "explorando_rangos": dispersos,
        "visitantes_con_presupuesto": len(out),
        "insight": (f"presupuesto mediano revelado ≈ {round(statistics.median(medians)):,} MXN; "
                    f"{focalizados} ya saben su rango, {dispersos} aún exploran" if medians else "sin presupuesto revelado aún"),
    }


async def predicted_timeline(db, since_days: int = 365) -> Dict[str, Any]:
    """15· TIMELINE PREDICHO (heurística) — clasifica visitantes por velocidad de señales: 'caliente-rápido' (compra
    pronto) vs 'explorando' (largo plazo). Basado en densidad de señales en el tiempo.
    Universo: + % por segmento, + lista de 'compra pronto' (para el asesor), + densidad media de señales,
    + span medio de actividad, + reparto por nº de días activos."""
    by_v = defaultdict(lambda: {"n": 0, "first": None, "last": None})
    async for s in db.buyer_signals.find({"created_at_dt": {"$gte": _cut(since_days)}},
                                         {"_id": 0, "visitor_id": 1, "created_at_dt": 1}):
        v, t = s.get("visitor_id"), s.get("created_at_dt")
        if not v or not isinstance(t, dt.datetime):
            continue
        a = by_v[v]; a["n"] += 1
        if a["first"] is None or t < a["first"]:
            a["first"] = t
        if a["last"] is None or t > a["last"]:
            a["last"] = t
    seg = defaultdict(int)
    pronto = []
    rates = []
    spans = []
    for v, a in by_v.items():
        span = (a["last"] - a["first"]).total_seconds() / 86400 + 0.01
        rate = a["n"] / span
        rates.append(rate); spans.append(span)
        if a["n"] >= 5 and rate >= 3:
            seg["compra_pronto"] += 1
            pronto.append({"visitor_id": v, "señales": a["n"], "densidad_dia": round(rate, 1),
                           "span_dias": round(span, 1)})
        elif a["n"] >= 3:
            seg["evaluando"] += 1
        else:
            seg["explorando"] += 1
    pronto.sort(key=lambda x: -x["densidad_dia"])
    tot = len(by_v)
    return {
        "segmentos_timeline": dict(seg),
        "lectura": "'compra pronto' = prioriza el contacto YA",
        # ── universo ──
        "segmentos_pct": {k: _pct(v, tot) for k, v in seg.items()},
        "compra_pronto_lista": pronto[:12],
        "densidad_media_senales_dia": round(statistics.mean(rates), 2) if rates else 0,
        "span_medio_dias": round(statistics.mean(spans), 1) if spans else 0,
        "total_visitantes": tot,
        "insight": f"{seg.get('compra_pronto', 0)} de {tot} visitantes ({_pct(seg.get('compra_pronto', 0), tot)}%) compran pronto — contáctalos YA",
    }


async def close_probability(db, since_days: int = 90, top: int = 12) -> Dict[str, Any]:
    """16· PROBABILIDAD DE CIERRE (heurística) — normaliza el calor del visitante a una probabilidad 0-100. Para priorizar.
    Universo: + banda de prioridad (A/B/C), + distribución por banda, + probabilidad media, + nº de leads de alta
    prioridad, + features que más correlacionan con calor (qué miran los calientes)."""
    import demand_intelligence as di
    hv = await di.hot_visitors(db, since_days=since_days, top=200)
    rows = hv.get("visitantes_calientes", [])
    mx = max((r["calor"] for r in rows), default=1) or 1
    out = []
    band_dist = defaultdict(int)
    feat_heat = Counter()
    probs = []
    for r in rows:
        prob = min(95, round(100 * r["calor"] / mx))
        banda = "A" if prob >= 70 else "B" if prob >= 40 else "C"
        band_dist[banda] += 1
        probs.append(prob)
        for f in (r.get("features") or []):
            feat_heat[f] += 1
        out.append({"visitor_id": r["visitor_id"], "prob_cierre_pct": prob, "features": r["features"], "prioridad": banda})
    return {
        "por_visitante": out[:top],
        "lectura": "prioriza a los de mayor probabilidad (calor normalizado)",
        # ── universo ──
        "distribucion_prioridad": dict(band_dist),
        "prob_media_pct": round(statistics.mean(probs)) if probs else 0,
        "leads_prioridad_A": band_dist.get("A", 0),
        "features_de_calientes": [{"feature": f, "n": n} for f, n in feat_heat.most_common(10)],
        "total_evaluados": len(out),
        "insight": f"{band_dist.get('A', 0)} leads en prioridad A (≥70% prob) — esos primero",
    }


async def feature_cooccurrence(db, since_days: int = 365, top: int = 12) -> Dict[str, Any]:
    """17· CO-OCURRENCIA DE FEATURES (trade-off/bundle) — qué amenidades se buscan JUNTAS (de meta.amenidades). 'terraza
    + gym van de la mano'.
    Universo: + features individuales más pedidas, + para cada feature top su 'mejor compañera' (lift), + tamaño medio
    del set pedido, + nº de queries con amenidades, + bundle sugerido (las 3 que más se piden juntas)."""
    import demand_intelligence as di
    pairs = Counter()
    singles = Counter()
    set_sizes = []
    nq = 0
    async for s in db.buyer_signals.find({"type": {"$in": ["atlax_query", "atlax_profile"]}, "created_at_dt": {"$gte": _cut(since_days)}},
                                         {"_id": 0, "meta": 1}):
        fl = di._as_feature_list((s.get("meta") or {}).get("amenidades") or (s.get("meta") or {}).get("features"))
        fl = sorted(set(fl))
        if fl:
            nq += 1
            set_sizes.append(len(fl))
        for f in fl:
            singles[f] += 1
        for i in range(len(fl)):
            for j in range(i + 1, len(fl)):
                pairs[(fl[i], fl[j])] += 1
    # mejor compañera de cada feature top (lift = juntos / pedidos de la feature)
    companions = {}
    for feat, _cnt in singles.most_common(8):
        best = None; best_n = 0
        for (a, b), n in pairs.items():
            if feat in (a, b) and n > best_n:
                best_n = n; best = b if a == feat else a
        if best:
            companions[feat] = {"compañera": best, "juntos": best_n}
    bundle = [a for pair, _ in pairs.most_common(2) for a in pair]
    bundle = list(dict.fromkeys(bundle))[:3]
    return {
        "pares": [{"a": a, "b": b, "juntos": n} for (a, b), n in pairs.most_common(top)],
        "lectura": "se piden juntas = empaquétalas en el mismo producto",
        # ── universo ──
        "features_individuales": [{"feature": f, "n": n} for f, n in singles.most_common(top)],
        "mejor_compañera": companions,
        "tamaño_medio_set": round(statistics.mean(set_sizes), 1) if set_sizes else 0,
        "queries_con_amenidades": nq,
        "bundle_sugerido": bundle,
        "insight": (f"empaqueta {' + '.join(bundle)} en un mismo producto" if bundle else "aún no hay sets de amenidades para cruzar"),
    }


async def willingness_to_pay(db, since_days: int = 365, top: int = 12) -> Dict[str, Any]:
    """18· WILLINGNESS-TO-PAY por feature (revealed) — precio promedio de los devs que el comprador mira POR cada feature
    que tienen. 'la gente que mira terraza ve devs de ~12M'.
    Universo: + premium vs baseline (cuánto suma cada feature sobre el precio medio del mercado), + tier asociado,
    + rango (min-max) por feature, + features 'premium' ordenadas por sobreprecio, + baseline del mercado."""
    from data_developments import DEVELOPMENTS_BY_ID
    import demand_intelligence as di
    by_feat = defaultdict(list)
    all_prices = []
    async for s in db.buyer_signals.find({"created_at_dt": {"$gte": _cut(since_days)},
                                          "type": {"$in": ["ficha_view", "unit_view", "like", "save"]},
                                          "entity_id": {"$nin": [None, ""]}}, {"_id": 0, "entity_id": 1}):
        d = DEVELOPMENTS_BY_ID.get(s.get("entity_id"))
        if d and d.get("price_from"):
            all_prices.append(d["price_from"])
            for f in di._dev_features(d):
                by_feat[f].append(d["price_from"])
    baseline = round(statistics.median(all_prices)) if all_prices else 0
    rows = []
    for f, p in by_feat.items():
        if len(p) < 2:
            continue
        med = round(statistics.median(p))
        rows.append({"feature": f, "precio_medio_visto": med, "n": len(p),
                     "premium_vs_mercado": med - baseline,
                     "premium_pct": _pct(med - baseline, baseline) if baseline else 0,
                     "tier": _tier_of_price(med), "min": round(min(p)), "max": round(max(p))})
    rows.sort(key=lambda x: -x["precio_medio_visto"])
    premium_feats = sorted([r for r in rows if r["premium_vs_mercado"] > 0], key=lambda x: -x["premium_vs_mercado"])
    return {
        "features": rows[:top],
        "lectura": "precio que asocian a cada feature = cuánto vale para el mercado",
        # ── universo ──
        "baseline_mercado": baseline,
        "features_premium": premium_feats[:8],
        "feature_mas_cara": rows[0]["feature"] if rows else None,
        "insight": (f"sobre un baseline de {baseline:,} MXN, '{premium_feats[0]['feature']}' suma "
                    f"~{premium_feats[0]['premium_vs_mercado']:,} MXN" if premium_feats else "sin premium de feature detectable aún"),
    }


_SUB_CACHE: Dict[Any, Any] = {}   # PERF A8 · cache TTL del scan de secuencias (no agregable en Mongo sin $push global)
_SUB_TTL = 300.0


async def substitution(db, since_days: int = 365, top: int = 10) -> Dict[str, Any]:
    """19· SUSTITUCIÓN / CROSS-ZONE — cuando no hay match en la colonia pedida, a qué OTRAS colonias migran (de atlax_query
    meta.cross_zone + las colonias que terminan viendo). 'piden Roma, terminan en Condesa'.
    Universo: + flujos de migración A→B (de qué colonia a cuál), + colonias 'imán' (las más receptoras), + colonias
    'fuga' (las que más pierden), + nº medio de colonias por visitante, + par de sustitución #1.

    PERF A8 (auditoría): la reconstrucción de secuencias por visitante requiere el orden temporal doc a doc
    (no expresable con $group sin cargar todo en RAM del server) → cache TTL 5 min: el scan corre a lo más
    1 vez por TTL para todos los callers. El dict cacheado se trata como read-only."""
    import time as _time
    _ck = (since_days, top)
    _hit = _SUB_CACHE.get(_ck)
    if _hit and (_time.monotonic() - _hit[0]) < _SUB_TTL:
        return _hit[1]
    cross = 0; n = 0
    async for s in db.buyer_signals.find({"type": "atlax_query", "created_at_dt": {"$gte": _cut(since_days)}}, {"_id": 0, "meta": 1}):
        n += 1
        if (s.get("meta") or {}).get("cross_zone"):
            cross += 1
    # visitantes y la SECUENCIA de colonias que vieron (para flujos A→B)
    seq_by_v = defaultdict(list)
    set_by_v = defaultdict(set)
    # filtro de visitante EN la query (antes se descartaba en Python) + proyección mínima ya presente
    async for s in db.buyer_signals.find({"created_at_dt": {"$gte": _cut(since_days)}, "colonia": {"$nin": [None, ""]},
                                          "visitor_id": {"$nin": [None, ""]}},
                                         {"_id": 0, "visitor_id": 1, "colonia": 1, "created_at_dt": 1}).sort("created_at_dt", 1):
        v = s.get("visitor_id")
        if not v:
            continue
        col = s["colonia"]
        set_by_v[v].add(col)
        if not seq_by_v[v] or seq_by_v[v][-1] != col:
            seq_by_v[v].append(col)
    multi_zone = sum(1 for cols in set_by_v.values() if len(cols) >= 2)
    flujos = Counter()
    iman = Counter(); fuga = Counter()
    for v, seq in seq_by_v.items():
        for i in range(1, len(seq)):
            a, b = seq[i - 1], seq[i]
            if a != b:
                flujos[f"{a} → {b}"] += 1
                fuga[a] += 1
                iman[b] += 1
    sizes = [len(s) for s in set_by_v.values()]
    par1 = flujos.most_common(1)[0][0] if flujos else None
    _out = {
        "queries_con_cross_zone": cross, "queries": n, "visitantes_multi_colonia": multi_zone,
        "lectura": "muchos cruzan de zona = la oferta de su 1ª opción no alcanza (oportunidad en la vecina)",
        # ── universo ──
        "flujos_migracion": [{"par": p, "n": c} for p, c in flujos.most_common(top)],
        "colonias_iman": [{"colonia": c, "recibe": n_} for c, n_ in iman.most_common(top)],
        "colonias_fuga": [{"colonia": c, "pierde": n_} for c, n_ in fuga.most_common(top)],
        "colonias_por_visitante_media": round(statistics.mean(sizes), 1) if sizes else 0,
        "par_sustitucion_1": par1,
        "insight": (f"el flujo más fuerte es '{par1}' — pon oferta en la receptora" if par1
                    else "aún no hay migración entre colonias observable"),
    }
    if len(_SUB_CACHE) > 32:
        _SUB_CACHE.clear()
    _SUB_CACHE[_ck] = (_time.monotonic(), _out)
    return _out


async def attribution(db, since_days: int = 365) -> Dict[str, Any]:
    """20· ATRIBUCIÓN — por canal/fuente (referral_source) cuántas sesiones y cuántas capturan lead = qué canal convierte.
    Universo: + mejor canal por conversión (no por volumen), + serie mensual de leads, + profundidad media (mensajes
    por sesión) por fuente, + canal × idioma, + total embudo (sesiones→leads global)."""
    by_src = defaultdict(lambda: {"sesiones": 0, "leads": 0, "msgs": 0})
    by_month = defaultdict(lambda: {"sesiones": 0, "leads": 0})
    canal_locale = defaultdict(lambda: defaultdict(int))
    # cutoff de since_days EN la query (antes leía TODAS las sesiones); $or cubre datetime nativo e ISO-string legado
    _sc = _cut(since_days)
    async for s in db.asistente_sessions.find(
            {"$or": [{"created_at": {"$gte": _sc}}, {"created_at": {"$gte": _sc.isoformat()}}]},
            {"_id": 0, "referral_source": 1, "channel": 1, "captured_lead_id": 1,
             "message_count": 1, "created_at": 1, "locale": 1}):
        k = s.get("referral_source") or s.get("channel") or "directo"
        d = by_src[k]
        d["sesiones"] += 1
        d["msgs"] += int(s.get("message_count") or 0)
        if s.get("captured_lead_id"):
            d["leads"] += 1
        mo = str(s.get("created_at") or "")[:7]
        if mo:
            by_month[mo]["sesiones"] += 1
            if s.get("captured_lead_id"):
                by_month[mo]["leads"] += 1
        if s.get("locale"):
            canal_locale[k][s["locale"]] += 1
    rows = [{"fuente": k, "sesiones": v["sesiones"], "leads": v["leads"],
             "conversion_pct": _pct(v["leads"], v["sesiones"]),
             "msgs_por_sesion": round(v["msgs"] / max(v["sesiones"], 1), 1)} for k, v in by_src.items()]
    rows.sort(key=lambda x: -x["sesiones"])
    tot_sesiones = sum(v["sesiones"] for v in by_src.values())
    tot_leads = sum(v["leads"] for v in by_src.values())
    # mejor por conversión, exigiendo un mínimo de volumen para que sea creíble
    con_volumen = [r for r in rows if r["sesiones"] >= 3] or rows
    mejor_conv = max(con_volumen, key=lambda x: x["conversion_pct"]) if con_volumen else None
    return {
        "por_fuente": rows[:12],
        "lectura": "el canal con mayor conversión = dónde invertir en adquisición",
        # ── universo ──
        "mejor_canal_conversion": mejor_conv["fuente"] if mejor_conv else None,
        "serie_mensual_leads": {m: v["leads"] for m, v in sorted(by_month.items())},
        "embudo_global": {"sesiones": tot_sesiones, "leads": tot_leads, "conversion_pct": _pct(tot_leads, tot_sesiones)},
        "canal_por_idioma": {k: dict(v) for k, v in canal_locale.items()},
        "insight": (f"el canal que más convierte es '{mejor_conv['fuente']}' ({mejor_conv['conversion_pct']}%); "
                    f"global {_pct(tot_leads, tot_sesiones)}%" if mejor_conv else "sin sesiones para atribuir"),
    }


# Registro para correr todas / wirear
ALL = {
    "estacionalidad": seasonality, "balance_oferta_demanda": supply_demand_balance, "absorcion": absorption_signal,
    "segmentos_rfm": rfm_segments, "elasticidad_precio": price_elasticity, "viral": viral_shares,
    "fugas_embudo": funnel_dropoff, "competidores": competitor_mentions, "locale": locale_split, "reengagement": reengagement,
    "criterios_decision": decision_criteria, "urgencia": urgency_signals, "sentimiento": sentiment_proxy,
    "presupuesto_predicho": predicted_budget, "timeline_predicho": predicted_timeline, "prob_cierre": close_probability,
    "cooc_features": feature_cooccurrence, "willingness_to_pay": willingness_to_pay, "sustitucion": substitution,
    "atribucion": attribution,
}
# Subconjunto para el DEV (oferta/precio/demanda en SUS colonias)
DEV_KEYS = ["balance_oferta_demanda", "absorcion", "elasticidad_precio", "estacionalidad", "cooc_features",
            "willingness_to_pay", "sustitucion", "criterios_decision"]
# Subconjunto para el ASESOR (señales de lead/visitante)
ASESOR_KEYS = ["presupuesto_predicho", "timeline_predicho", "prob_cierre", "urgencia"]


async def run_all(db, keys=None, **kw) -> Dict[str, Any]:
    out = {}
    for k, fn in ALL.items():
        if keys and k not in keys:
            continue
        try:
            import inspect
            sig = inspect.signature(fn)
            out[k] = await (fn(db, **{a: v for a, v in kw.items() if a in sig.parameters}) if kw else fn(db))
        except Exception as e:  # noqa: BLE001
            out[k] = {"error": str(e)[:120]}
    return out
