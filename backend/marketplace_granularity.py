"""GRANULARIDAD AVANZADA DEL MARKETPLACE — 20 dimensiones de nivel profundo (análisis del dato YA capturado).

10 NUEVAS (no mencionadas antes) + 10 del 'mapa profundo'. Cada una es una agregación REAL sobre buyer_signals /
marketplace_searches / asistente_messages / leads. Las predictivas son HEURÍSTICAS honestas (revealed, no ML aún).
Conectadas: superadmin (todas, /deep-plus) · dev (oferta/precio, scope colonias) · asesor (lead, por visitante).
"""
import datetime as dt
import statistics
from collections import defaultdict, Counter
from typing import Any, Dict, List, Optional


def _cut(days):
    return dt.datetime.utcnow() - dt.timedelta(days=days)


def _rank(d, top=12, kname="k", vname="n"):
    return [{kname: k, vname: v} for k, v in sorted(d.items(), key=lambda x: -x[1])[:top]]


# ═══════════════════ 10 NUEVAS (no mencionadas) ═══════════════════

async def seasonality(db, since_days: int = 540) -> Dict[str, Any]:
    """1· ESTACIONALIDAD — demanda por mes (ciclos de temporada). 'pico en marzo, valle en diciembre'."""
    by_m = defaultdict(int)
    async for s in db.buyer_signals.find({"created_at_dt": {"$gte": _cut(since_days)}}, {"_id": 0, "created_at_dt": 1}):
        d = s.get("created_at_dt")
        if isinstance(d, dt.datetime):
            by_m[d.strftime("%Y-%m")] += 1
    return {"por_mes": dict(sorted(by_m.items())), "lectura": "planea lanzamientos/campañas en los meses pico"}


async def supply_demand_balance(db, colonias: Optional[List[str]] = None, since_days: int = 365) -> Dict[str, Any]:
    """2· BALANCE OFERTA-DEMANDA por colonia — señales de demanda vs unidades en oferta = saturación o hueco."""
    from data_developments import DEVELOPMENTS
    dem = defaultdict(int)
    async for s in db.buyer_signals.find({"created_at_dt": {"$gte": _cut(since_days)}, "colonia": {"$nin": [None, ""]}}, {"_id": 0, "colonia": 1}):
        if not colonias or s["colonia"] in colonias:
            dem[s["colonia"]] += 1
    sup = defaultdict(int)
    for d in DEVELOPMENTS:
        c = d.get("colonia_id")
        if c and (not colonias or c in colonias):
            sup[c] += len(d.get("units") or []) or 1
    rows = []
    for c in set(dem) | set(sup):
        de, su = dem.get(c, 0), sup.get(c, 0)
        rows.append({"colonia": c, "demanda": de, "oferta_unidades": su, "balance": round(de / max(su, 1), 2)})
    rows.sort(key=lambda x: -x["balance"])
    return {"colonias": rows[:15], "lectura": "balance alto = mucha demanda, poca oferta (hueco); bajo = saturado"}


async def absorption_signal(db, colonias: Optional[List[str]] = None, since_days: int = 365, top: int = 12) -> Dict[str, Any]:
    """3· VELOCIDAD DE ABSORCIÓN por feature — qué features acumulan más demanda por unidad ofertada = lo que se desplaza."""
    import demand_intelligence as di
    feat = await di.demand_by_feature(db, colonias=colonias, since_days=since_days, top=50)
    demand = {f["feature"]: f["demanda"] for f in feat["top_features"]}
    from data_developments import DEVELOPMENTS
    sup = defaultdict(int)
    for d in DEVELOPMENTS:
        if colonias and d.get("colonia_id") not in colonias:
            continue
        for f in di._dev_features(d):
            sup[f] += len(d.get("units") or []) or 1
    rows = [{"feature": f, "demanda": de, "oferta": sup.get(f, 0), "absorcion": round(de / max(sup.get(f, 1), 1), 2)} for f, de in demand.items()]
    rows.sort(key=lambda x: -x["absorcion"])
    return {"features": rows[:top], "lectura": "absorción alta = se desplaza rápido (construye más); baja = ya saturado"}


async def rfm_segments(db, since_days: int = 365) -> Dict[str, Any]:
    """4· SEGMENTOS RFM — visitantes por Recencia (días desde última señal), Frecuencia (# señales), Valor (intención).
    Clasifica en campeones / prometedores / en-riesgo / dormidos."""
    import demand_intelligence as di
    now = dt.datetime.utcnow()
    agg = defaultdict(lambda: {"n": 0, "last": None, "val": 0.0})
    async for s in db.buyer_signals.find({"created_at_dt": {"$gte": _cut(since_days)}}, {"_id": 0, "visitor_id": 1, "type": 1, "created_at_dt": 1}):
        v = s.get("visitor_id")
        if not v:
            continue
        a = agg[v]; a["n"] += 1; a["val"] += di._PROP_WEIGHT.get(s.get("type"), 0.5)
        t = s.get("created_at_dt")
        if isinstance(t, dt.datetime) and (a["last"] is None or t > a["last"]):
            a["last"] = t
    seg = defaultdict(int)
    for v, a in agg.items():
        rec = (now - a["last"]).days if a["last"] else 999
        hot = a["val"] >= 8 or a["n"] >= 5
        if rec <= 7 and hot:
            seg["campeones"] += 1
        elif rec <= 14:
            seg["prometedores"] += 1
        elif rec <= 45:
            seg["en_riesgo"] += 1
        else:
            seg["dormidos"] += 1
    return {"segmentos": dict(seg), "total_visitantes": len(agg), "lectura": "campeones=actívalos ya · en_riesgo/dormidos=win-back"}


async def price_elasticity(db, since_days: int = 365) -> Dict[str, Any]:
    """5· ELASTICIDAD PRECIO-DEMANDA — cuántas búsquedas en cada banda de precio = la curva de demanda."""
    bands = defaultdict(int)
    async for s in db.marketplace_searches.find({"created_at_dt": {"$gte": _cut(since_days)}, "precio_max": {"$gt": 0}}, {"_id": 0, "precio_max": 1}):
        pm = s["precio_max"]
        b = "0-3M" if pm <= 3e6 else "3-5M" if pm <= 5e6 else "5-8M" if pm <= 8e6 else "8-12M" if pm <= 12e6 else "12-20M" if pm <= 20e6 else "20M+"
        bands[b] += 1
    order = ["0-3M", "3-5M", "5-8M", "8-12M", "12-20M", "20M+"]
    return {"curva": {b: bands.get(b, 0) for b in order}, "lectura": "dónde se concentra la demanda = el sweet spot de precio"}


async def viral_shares(db, since_days: int = 365, top: int = 10) -> Dict[str, Any]:
    """6· COEFICIENTE VIRAL — quién comparte qué (señal share) = alcance orgánico + qué desarrollos se comparten más."""
    from data_developments import DEVELOPMENTS_BY_ID
    by_dev = defaultdict(int); sharers = set(); n = 0
    async for s in db.buyer_signals.find({"type": "share", "created_at_dt": {"$gte": _cut(since_days)}}, {"_id": 0, "entity_id": 1, "visitor_id": 1}):
        n += 1
        if s.get("entity_id"):
            by_dev[s["entity_id"]] += 1
        if s.get("visitor_id"):
            sharers.add(s["visitor_id"])
    nm = lambda d: (DEVELOPMENTS_BY_ID.get(d, {}) or {}).get("name") or d
    return {"total_compartidos": n, "compartidores_unicos": len(sharers),
            "mas_compartidos": [{"dev": nm(d), "n": v} for d, v in sorted(by_dev.items(), key=lambda x: -x[1])[:top]],
            "lectura": "lo más compartido = tu mejor anzuelo orgánico"}


async def funnel_dropoff(db, since_days: int = 365) -> Dict[str, Any]:
    """7· FUGAS DEL EMBUDO — tasas de conversión etapa a etapa (vio→guardó→intención→lead). Dónde se pierde la gente."""
    stages = {"vio": ["ficha_view", "view", "unit_view"], "guardo": ["save", "unit_save", "like"],
              "intencion": ["intent", "payment_explore", "roi_explore", "atlax_apartado"], "lead": ["lead"]}
    reached = {k: set() for k in stages}
    async for s in db.buyer_signals.find({"created_at_dt": {"$gte": _cut(since_days)}}, {"_id": 0, "visitor_id": 1, "type": 1}):
        v = s.get("visitor_id")
        if not v:
            continue
        for st, types in stages.items():
            if s.get("type") in types:
                reached[st].add(v)
    order = ["vio", "guardo", "intencion", "lead"]
    counts = {k: len(reached[k]) for k in order}
    rates = {}
    for i in range(1, len(order)):
        prev = counts[order[i - 1]]
        rates[f"{order[i-1]}→{order[i]}"] = round(100 * counts[order[i]] / prev) if prev else 0
    return {"por_etapa": counts, "conversion_pct": rates, "lectura": "la caída más grande = donde arreglar el embudo"}


async def competitor_mentions(db, since_days: int = 365, top: int = 12) -> Dict[str, Any]:
    """8· MENCIONES DE COMPETIDOR — proyectos/zonas externas que el comprador nombra en la conversación (lo que evalúa
    contra ti). Heurística: nombres con mayúscula no-DMX + keywords de competencia."""
    cutoff = _cut(since_days).isoformat()
    kws = ("be grand", "artigas", "be tower", "reforma", "live", "park", "residencial", "torre", "be ")
    hits = defaultdict(int); n = 0
    async for m in db.asistente_messages.find({"role": "user"}, {"_id": 0, "content": 1, "created_at": 1}):
        if str(m.get("created_at") or "") < cutoff:
            continue
        txt = (m.get("content") or "").lower()
        if not txt:
            continue
        n += 1
        for k in kws:
            if k in txt:
                hits[k.strip()] += 1
    return {"mensajes": n, "menciones": _rank(hits, top, "termino", "n"), "lectura": "contra quién/qué te comparan (señal de competencia)"}


async def locale_split(db, since_days: int = 365) -> Dict[str, Any]:
    """9· LOCALE / CANAL del comprador — idioma + canal de entrada (web/bubble/whatsapp) = de dónde viene la demanda."""
    locales = defaultdict(int); channels = defaultdict(int)
    async for c in db.buyer_coach_conversations.find({}, {"_id": 0, "locale": 1}):
        if c.get("locale"):
            locales[c["locale"]] += 1
    async for s in db.asistente_sessions.find({}, {"_id": 0, "channel": 1, "referral_source": 1}):
        if s.get("channel"):
            channels[s["channel"]] += 1
    return {"idiomas": dict(locales), "canales": dict(channels), "lectura": "de dónde y en qué idioma llega el comprador"}


async def reengagement(db, since_days: int = 365) -> Dict[str, Any]:
    """10· RE-ENGAGEMENT / WIN-BACK — visitantes que volvieron tras un hueco (≥3 días) = interés sostenido, candidatos a
    reactivar."""
    days_by_v = defaultdict(set)
    async for s in db.buyer_signals.find({"created_at_dt": {"$gte": _cut(since_days)}}, {"_id": 0, "visitor_id": 1, "created_at_dt": 1}):
        v, t = s.get("visitor_id"), s.get("created_at_dt")
        if v and isinstance(t, dt.datetime):
            days_by_v[v].add(t.date())
    multi = [v for v, ds in days_by_v.items() if len(ds) >= 2]
    gap_returners = 0
    for v in multi:
        ds = sorted(days_by_v[v])
        if any((ds[i] - ds[i - 1]).days >= 3 for i in range(1, len(ds))):
            gap_returners += 1
    return {"visitantes": len(days_by_v), "regresaron_multi_dia": len(multi), "tras_hueco_3d": gap_returners,
            "lectura": "volvieron tras pensarlo = interés real, mándales algo"}


# ═══════════════════ 10 del MAPA PROFUNDO ═══════════════════

async def decision_criteria(db, since_days: int = 365) -> Dict[str, Any]:
    """11· CRITERIOS DE DECISIÓN — con qué filtran (precio/recámaras/m²/zona/amenidad) = qué prioriza el mercado."""
    crit = defaultdict(int)
    async for s in db.marketplace_searches.find({"created_at_dt": {"$gte": _cut(since_days)}},
                                                {"_id": 0, "precio_max": 1, "recamaras_min": 1, "m2_min": 1, "colonias": 1, "banos_min": 1, "estacionamientos_min": 1}):
        if s.get("precio_max"):
            crit["precio"] += 1
        if s.get("recamaras_min"):
            crit["recámaras"] += 1
        if s.get("m2_min"):
            crit["m²"] += 1
        if s.get("colonias"):
            crit["zona"] += 1
        if s.get("banos_min"):
            crit["baños"] += 1
        if s.get("estacionamientos_min"):
            crit["estacionamiento"] += 1
    return {"criterios": _rank(crit, 10, "criterio", "n"), "lectura": "el criterio #1 = lo que NO negocian"}


async def urgency_signals(db, since_days: int = 365) -> Dict[str, Any]:
    """12· URGENCIA — lenguaje de prisa en la conversación ('me mudo en', 'ya', 'urgente', 'este mes')."""
    cutoff = _cut(since_days).isoformat()
    kws = ("urgente", "ya", "rápido", "rapido", "este mes", "lo antes posible", "me mudo", "pronto", "inmediato", "esta semana")
    n = hit = 0
    found = defaultdict(int)
    async for m in db.asistente_messages.find({"role": "user"}, {"_id": 0, "content": 1, "created_at": 1}):
        if str(m.get("created_at") or "") < cutoff:
            continue
        txt = (m.get("content") or "").lower()
        if not txt:
            continue
        n += 1
        h = [k for k in kws if k in txt]
        if h:
            hit += 1
            for k in h:
                found[k] += 1
    return {"mensajes": n, "con_urgencia": hit, "urgencia_pct": round(100 * hit / max(n, 1)), "señales": _rank(found, 8, "frase", "n")}


async def sentiment_proxy(db, since_days: int = 365) -> Dict[str, Any]:
    """13· SENTIMIENTO (proxy) — ratio de señales positivas (save/like/intent) vs negativas (dismiss) = clima del mercado."""
    pos = neg = 0
    async for s in db.buyer_signals.find({"created_at_dt": {"$gte": _cut(since_days)}, "type": {"$in": ["save", "unit_save", "like", "intent", "atlax_apartado", "dismiss", "unlike", "unsave"]}}, {"_id": 0, "type": 1}):
        if s["type"] in ("dismiss", "unlike", "unsave"):
            neg += 1
        else:
            pos += 1
    tot = pos + neg
    return {"positivas": pos, "negativas": neg, "ratio_positivo_pct": round(100 * pos / max(tot, 1)),
            "lectura": "ratio alto = mercado entusiasta; bajo = fricción (revisa precio/oferta)"}


async def predicted_budget(db, since_days: int = 365, top: int = 12) -> Dict[str, Any]:
    """14· PRESUPUESTO PREDICHO (heurística revealed) — la banda de precio de los DEVS que el visitante realmente mira
    (vs lo que declara). Por visitante con señales."""
    from data_developments import DEVELOPMENTS_BY_ID
    by_v = defaultdict(list)
    async for s in db.buyer_signals.find({"created_at_dt": {"$gte": _cut(since_days)}, "type": {"$in": ["ficha_view", "unit_view", "like", "save", "unit_save", "compare"]}, "entity_id": {"$nin": [None, ""]}}, {"_id": 0, "visitor_id": 1, "entity_id": 1}):
        d = DEVELOPMENTS_BY_ID.get(s.get("entity_id"))
        if d and d.get("price_from"):
            by_v[s["visitor_id"]].append(d["price_from"])
    out = [{"visitor_id": v, "presupuesto_revelado": round(statistics.median(p)), "señales": len(p)} for v, p in by_v.items() if p]
    out.sort(key=lambda x: -x["señales"])
    return {"por_visitante": out[:top], "lectura": "lo que MIRAN > lo que dicen — el presupuesto real para el asesor"}


async def predicted_timeline(db, since_days: int = 365) -> Dict[str, Any]:
    """15· TIMELINE PREDICHO (heurística) — clasifica visitantes por velocidad de señales: 'caliente-rápido' (compra
    pronto) vs 'explorando' (largo plazo). Basado en densidad de señales en el tiempo."""
    by_v = defaultdict(lambda: {"n": 0, "first": None, "last": None})
    async for s in db.buyer_signals.find({"created_at_dt": {"$gte": _cut(since_days)}}, {"_id": 0, "visitor_id": 1, "created_at_dt": 1}):
        v, t = s.get("visitor_id"), s.get("created_at_dt")
        if not v or not isinstance(t, dt.datetime):
            continue
        a = by_v[v]; a["n"] += 1
        if a["first"] is None or t < a["first"]:
            a["first"] = t
        if a["last"] is None or t > a["last"]:
            a["last"] = t
    seg = defaultdict(int)
    for v, a in by_v.items():
        span = (a["last"] - a["first"]).total_seconds() / 86400 + 0.01
        rate = a["n"] / span
        if a["n"] >= 5 and rate >= 3:
            seg["compra_pronto"] += 1
        elif a["n"] >= 3:
            seg["evaluando"] += 1
        else:
            seg["explorando"] += 1
    return {"segmentos_timeline": dict(seg), "lectura": "'compra pronto' = prioriza el contacto YA"}


async def close_probability(db, since_days: int = 90, top: int = 12) -> Dict[str, Any]:
    """16· PROBABILIDAD DE CIERRE (heurística) — normaliza el calor del visitante a una probabilidad 0-100. Para priorizar."""
    import demand_intelligence as di
    hv = await di.hot_visitors(db, since_days=since_days, top=200)
    rows = hv.get("visitantes_calientes", [])
    mx = max((r["calor"] for r in rows), default=1) or 1
    out = [{"visitor_id": r["visitor_id"], "prob_cierre_pct": min(95, round(100 * r["calor"] / mx)), "features": r["features"]} for r in rows[:top]]
    return {"por_visitante": out, "lectura": "prioriza a los de mayor probabilidad (calor normalizado)"}


async def feature_cooccurrence(db, since_days: int = 365, top: int = 12) -> Dict[str, Any]:
    """17· CO-OCURRENCIA DE FEATURES (trade-off/bundle) — qué amenidades se buscan JUNTAS (de meta.amenidades). 'terraza
    + gym van de la mano'."""
    pairs = Counter()
    async for s in db.buyer_signals.find({"type": {"$in": ["atlax_query", "atlax_profile"]}, "created_at_dt": {"$gte": _cut(since_days)}}, {"_id": 0, "meta": 1}):
        import demand_intelligence as di
        fl = di._as_feature_list((s.get("meta") or {}).get("amenidades") or (s.get("meta") or {}).get("features"))
        fl = sorted(set(fl))
        for i in range(len(fl)):
            for j in range(i + 1, len(fl)):
                pairs[(fl[i], fl[j])] += 1
    return {"pares": [{"a": a, "b": b, "juntos": n} for (a, b), n in pairs.most_common(top)],
            "lectura": "se piden juntas = empaquétalas en el mismo producto"}


async def willingness_to_pay(db, since_days: int = 365, top: int = 12) -> Dict[str, Any]:
    """18· WILLINGNESS-TO-PAY por feature (revealed) — precio promedio de los devs que el comprador mira POR cada feature
    que tienen. 'la gente que mira terraza ve devs de ~12M'."""
    from data_developments import DEVELOPMENTS_BY_ID
    import demand_intelligence as di
    by_feat = defaultdict(list)
    async for s in db.buyer_signals.find({"created_at_dt": {"$gte": _cut(since_days)}, "type": {"$in": ["ficha_view", "unit_view", "like", "save"]}, "entity_id": {"$nin": [None, ""]}}, {"_id": 0, "entity_id": 1}):
        d = DEVELOPMENTS_BY_ID.get(s.get("entity_id"))
        if d and d.get("price_from"):
            for f in di._dev_features(d):
                by_feat[f].append(d["price_from"])
    rows = [{"feature": f, "precio_medio_visto": round(statistics.median(p)), "n": len(p)} for f, p in by_feat.items() if len(p) >= 2]
    rows.sort(key=lambda x: -x["precio_medio_visto"])
    return {"features": rows[:top], "lectura": "precio que asocian a cada feature = cuánto vale para el mercado"}


async def substitution(db, since_days: int = 365, top: int = 10) -> Dict[str, Any]:
    """19· SUSTITUCIÓN / CROSS-ZONE — cuando no hay match en la colonia pedida, a qué OTRAS colonias migran (de atlax_query
    meta.cross_zone + las colonias que terminan viendo). 'piden Roma, terminan en Condesa'."""
    cross = 0; n = 0
    async for s in db.buyer_signals.find({"type": "atlax_query", "created_at_dt": {"$gte": _cut(since_days)}}, {"_id": 0, "meta": 1}):
        n += 1
        if (s.get("meta") or {}).get("cross_zone"):
            cross += 1
    # visitantes que vieron 2+ colonias distintas
    by_v = defaultdict(set)
    async for s in db.buyer_signals.find({"created_at_dt": {"$gte": _cut(since_days)}, "colonia": {"$nin": [None, ""]}}, {"_id": 0, "visitor_id": 1, "colonia": 1}):
        by_v[s.get("visitor_id")].add(s["colonia"])
    multi_zone = sum(1 for cols in by_v.values() if len(cols) >= 2)
    return {"queries_con_cross_zone": cross, "queries": n, "visitantes_multi_colonia": multi_zone,
            "lectura": "muchos cruzan de zona = la oferta de su 1ª opción no alcanza (oportunidad en la vecina)"}


async def attribution(db, since_days: int = 365) -> Dict[str, Any]:
    """20· ATRIBUCIÓN — por canal/fuente (referral_source) cuántas sesiones y cuántas capturan lead = qué canal convierte."""
    by_src = defaultdict(lambda: {"sesiones": 0, "leads": 0})
    async for s in db.asistente_sessions.find({}, {"_id": 0, "referral_source": 1, "channel": 1, "captured_lead_id": 1}):
        k = s.get("referral_source") or s.get("channel") or "directo"
        by_src[k]["sesiones"] += 1
        if s.get("captured_lead_id"):
            by_src[k]["leads"] += 1
    rows = [{"fuente": k, **v, "conversion_pct": round(100 * v["leads"] / max(v["sesiones"], 1))} for k, v in by_src.items()]
    rows.sort(key=lambda x: -x["sesiones"])
    return {"por_fuente": rows[:12], "lectura": "el canal con mayor conversión = dónde invertir en adquisición"}


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
