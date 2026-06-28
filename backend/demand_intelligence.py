"""INTELIGENCIA DE DEMANDA — convierte las interacciones de los compradores en data de mercado consultable.

Responde la pregunta núcleo de la plataforma: "¿cuántos clientes buscan/clickean [feature] en [colonia], y cuándo?".
Cruza las señales de comportamiento (buyer_signals: ficha_view/like/unit_view/compare/photo_dwell) con las features del
desarrollo, y las búsquedas explícitas (marketplace_searches: recámaras/m²/precio/colonia), agregando por:
  - feature (terraza, roof, gym…) × colonia × tiempo
  - colonia (las más solicitadas) × tiempo
  - atributo explícito (recámaras/m²/precio) × tiempo
  - demanda vs OFERTA (qué construir: lo que se busca y no existe)
con buckets day/week/month/quarter/year (created_at_dt).

NOTA de precisión: hoy la demanda por feature se DERIVA del dev (el dev que vio tiene esas features). Cuando el front
empiece a mandar unit_id en cada interacción de unidad, la señal será exacta (este motor ya lo usa si está presente).
"""
import datetime as dt
from collections import defaultdict
from typing import Any, Dict, List, Optional

_ENGAGE = ["ficha_view", "like", "unit_view", "unit_save", "compare", "photo_dwell", "photo_zoom", "intent", "save",
           "atlax_profile", "zone_profile", "lens", "module_open", "section_view"]   # + señales explícitas (amenidades)


def _as_feature_list(v):
    """meta.amenidades llega como lista O como string 'gym, alberca' (atlax_profile) → normaliza a lista."""
    if isinstance(v, list):
        return [str(x).strip().lower() for x in v if x]
    if isinstance(v, str) and v.strip():
        return [p.strip().lower() for p in v.split(",") if p.strip()]
    return []


def bucket(d: dt.datetime, period: str) -> str:
    if not isinstance(d, dt.datetime):
        return "—"
    if period == "day":
        return d.strftime("%Y-%m-%d")
    if period == "week":
        iso = d.isocalendar()
        return f"{iso[0]}-W{iso[1]:02d}"
    if period == "quarter":
        return f"{d.year}-Q{(d.month - 1) // 3 + 1}"
    if period == "year":
        return str(d.year)
    return d.strftime("%Y-%m")  # month (default)


def _dev_features(dev: Dict[str, Any]) -> set:
    feats = set(dev.get("amenities") or []) | set(dev.get("unit_features") or [])
    return {str(f).strip().lower() for f in feats if f}


def _unit_features(unit: Dict[str, Any]) -> set:
    out = set()
    for k in ("terraza", "balcon", "roof", "roof_garden", "vista", "estudio"):
        if unit.get(k):
            out.add(k)
    for f in (unit.get("features") or []):
        out.add(str(f).strip().lower())
    return out


def _photo_features(dev: Dict[str, Any], value) -> set:
    """photo_dwell/photo_zoom: el `value` es el ÍNDICE de la foto → tagea esa foto (photo_tagger) → features REALES que
    el comprador estuvo mirando. Cierra el gap 'foto de terraza = interés en terraza'."""
    try:
        idx = int(value)
    except (TypeError, ValueError):
        return set()
    photos = dev.get("photos") or []
    if not (0 <= idx < len(photos)):
        return set()
    try:
        from photo_tagger import tag_from_url
        tg = tag_from_url(photos[idx]) or {}
        out = {str(f).strip().lower() for f in (tg.get("features") or []) if f}
        room = tg.get("room")
        if room and room not in ("interior", "otro"):
            out.add(str(room).strip().lower())
        return out
    except Exception:
        return set()


def _attribute(s: Dict[str, Any], dev: Optional[Dict[str, Any]]):
    """Atribuye una señal a sus FEATURES con precisión de 3 niveles → (feats:set, colonia:str, preciso:bool).
    1) meta.amenidades (explícito) · 2) unit_number→features de la unidad / photo_dwell→features de la foto · 3) dev (proxy)."""
    meta = s.get("meta") or {}
    ame = _as_feature_list(meta.get("amenidades") or meta.get("features"))
    col = s.get("colonia") or (dev or {}).get("colonia_id") or (meta.get("zona") or "").strip().lower() or None
    if ame:
        return set(ame), col, True
    if not dev:
        return None, col, False
    un = s.get("unit_number")
    if un:
        unit = next((u for u in (dev.get("units") or []) if u.get("unit_number") == un or str(u.get("id", "")).endswith(f"-{un}")), None)
        if unit:
            return _unit_features(unit), col, True
    if s.get("type") in ("photo_dwell", "photo_zoom"):
        pf = _photo_features(dev, s.get("value"))
        if pf:
            return pf, col, True
    return _dev_features(dev), col, False


async def demand_by_feature(db, colonia: Optional[str] = None, colonias: Optional[List[str]] = None,
                            period: str = "month", since_days: int = 365, top: int = 25) -> Dict[str, Any]:
    """Demanda por FEATURE × colonia × tiempo (señales de engagement → features del dev/unidad).
    colonias (lista) = scope del dev a SUS colonias; colonia (single) = filtro de una."""
    from data_developments import DEVELOPMENTS_BY_ID
    cutoff = dt.datetime.utcnow() - dt.timedelta(days=since_days)
    q = {"created_at_dt": {"$gte": cutoff}, "type": {"$in": _ENGAGE}}
    if colonia:
        q["colonia"] = colonia
    elif colonias:
        q["colonia"] = {"$in": colonias}
    by_feature = defaultdict(int)
    series = defaultdict(lambda: defaultdict(int))   # feature -> bucket -> count
    precise = 0
    async for s in db.buyer_signals.find(q, {"_id": 0, "entity_id": 1, "colonia": 1, "created_at_dt": 1, "unit_number": 1, "meta": 1, "type": 1, "value": 1}):
        feats, col, prec = _attribute(s, DEVELOPMENTS_BY_ID.get(s.get("entity_id")))
        if not feats or not col:
            continue
        if prec:
            precise += 1
        b = bucket(s["created_at_dt"], period)
        for f in feats:
            by_feature[f] += 1
            series[f][b] += 1
    ranked = sorted(by_feature.items(), key=lambda x: -x[1])[:top]
    return {
        "colonia": colonia or "todas", "period": period, "since_days": since_days, "senales_precisas_unidad": precise,
        "top_features": [{"feature": f, "demanda": n,
                          "serie": dict(sorted(series[f].items()))} for f, n in ranked],
    }


async def demand_by_colonia(db, period: str = "month", since_days: int = 365, top: int = 25) -> Dict[str, Any]:
    """Colonias MÁS SOLICITADAS (señales + búsquedas) × tiempo."""
    cutoff = dt.datetime.utcnow() - dt.timedelta(days=since_days)
    by_col = defaultdict(int)
    series = defaultdict(lambda: defaultdict(int))
    async for s in db.buyer_signals.find({"created_at_dt": {"$gte": cutoff}, "colonia": {"$nin": [None, ""]}},
                                         {"_id": 0, "colonia": 1, "created_at_dt": 1}):
        by_col[s["colonia"]] += 1
        series[s["colonia"]][bucket(s["created_at_dt"], period)] += 1
    async for s in db.marketplace_searches.find({"created_at_dt": {"$gte": cutoff}}, {"_id": 0, "colonias": 1, "created_at_dt": 1}):
        for c in (s.get("colonias") or []):
            by_col[c] += 1
            series[c][bucket(s["created_at_dt"], period)] += 1
    ranked = sorted(by_col.items(), key=lambda x: -x[1])[:top]
    return {"period": period, "top_colonias": [{"colonia": c, "demanda": n, "serie": dict(sorted(series[c].items()))} for c, n in ranked]}


async def demand_by_attribute(db, since_days: int = 365) -> Dict[str, Any]:
    """Atributos EXPLÍCITOS buscados (recámaras / m² / precio / estacionamiento) — demanda dura de las búsquedas."""
    cutoff = dt.datetime.utcnow() - dt.timedelta(days=since_days)
    rec = defaultdict(int); price_bands = defaultdict(int); parking = defaultdict(int)
    n = 0
    async for s in db.marketplace_searches.find({"created_at_dt": {"$gte": cutoff}},
                                                {"_id": 0, "recamaras_min": 1, "precio_max": 1, "estacionamientos_min": 1}):
        n += 1
        if s.get("recamaras_min"):
            rec[f"{s['recamaras_min']}+ rec"] += 1
        pm = s.get("precio_max")
        if pm:
            band = "0-3M" if pm <= 3e6 else "3-8M" if pm <= 8e6 else "8-20M" if pm <= 20e6 else "20M+"
            price_bands[band] += 1
        if s.get("estacionamientos_min"):
            parking[f"{s['estacionamientos_min']}+ estac"] += 1
    return {"busquedas": n, "recamaras": dict(sorted(rec.items())),
            "bandas_precio": dict(sorted(price_bands.items())), "estacionamiento": dict(sorted(parking.items()))}


async def what_to_build(db, colonia: Optional[str] = None, colonias: Optional[List[str]] = None,
                        since_days: int = 365) -> Dict[str, Any]:
    """QUÉ CONSTRUIR: demanda por feature vs OFERTA (unidades que existen con ese feature) → brecha = oportunidad.
    colonias (lista) = scope del dev a SUS colonias."""
    from data_developments import DEVELOPMENTS
    scope = set(colonias or ([colonia] if colonia else []))
    dem = await demand_by_feature(db, colonia=colonia, colonias=colonias, since_days=since_days, top=50)
    demand = {f["feature"]: f["demanda"] for f in dem["top_features"]}
    supply = defaultdict(int)
    for dev in DEVELOPMENTS:
        if scope and (dev.get("colonia_id") not in scope):
            continue
        feats = _dev_features(dev)
        n_units = len(dev.get("units") or []) or 1
        for f in feats:
            supply[f] += n_units
    gaps = []
    for f, d in demand.items():
        s = supply.get(f, 0)
        ratio = d / max(s, 1)
        gaps.append({"feature": f, "demanda": d, "oferta_unidades": s, "presion": round(ratio, 2)})
    gaps.sort(key=lambda x: -x["presion"])
    return {"colonia": colonia or (",".join(colonias) if colonias else "todas"), "oportunidades": gaps[:15],
            "lectura": "presion alta = mucha demanda, poca oferta → construir esto"}


async def engagement_by_content(db, since_days: int = 365, top: int = 20) -> Dict[str, Any]:
    """RESUCITA señales que se capturaban y morían: section_time/section_view/module_open → qué CONTENIDO de la ficha
    engancha al comprador (secciones, módulos, tiempo). Le dice al dev qué destacar y al superadmin qué le importa al mercado."""
    cutoff = dt.datetime.utcnow() - dt.timedelta(days=since_days)
    sec_time = defaultdict(float); sec_views = defaultdict(int); mod_open = defaultdict(int)
    n = 0
    async for s in db.buyer_signals.find(
            {"created_at_dt": {"$gte": cutoff}, "type": {"$in": ["section_time", "section_view", "module_open"]}},
            {"_id": 0, "type": 1, "value": 1, "seconds": 1, "meta": 1}):
        n += 1
        v = (s.get("value") or "").strip().lower()
        if not v:
            continue
        if s["type"] == "section_time":
            secs = s.get("seconds") or (s.get("meta") or {}).get("seconds") or 0
            sec_time[v] += float(secs or 0)
        elif s["type"] == "section_view":
            sec_views[v] += 1
        else:
            mod_open[v] += 1
    return {
        "señales_de_contenido": n,
        "secciones_por_tiempo": [{"seccion": k, "segundos_total": round(t)} for k, t in sorted(sec_time.items(), key=lambda x: -x[1])[:top]],
        "secciones_por_vistas": [{"seccion": k, "vistas": v} for k, v in sorted(sec_views.items(), key=lambda x: -x[1])[:top]],
        "modulos_abiertos": [{"modulo": k, "aperturas": v} for k, v in sorted(mod_open.items(), key=lambda x: -x[1])[:top]],
    }


async def unmet_demand(db, colonias: Optional[List[str]] = None, since_days: int = 365, top: int = 20) -> Dict[str, Any]:
    """DEMANDA NO SATISFECHA — lo que la gente BUSCA y casi no encuentra (unmet=True o results_count<=2). La señal más
    pura de 'qué construir que NO existe'. Por colonia × recámaras × precio."""
    cutoff = dt.datetime.utcnow() - dt.timedelta(days=since_days)
    q = {"created_at_dt": {"$gte": cutoff}, "$or": [{"unmet": True}, {"results_count": {"$lte": 2}}]}
    if colonias:
        q["colonias"] = {"$in": colonias}
    by_col = defaultdict(int); by_rec = defaultdict(int); by_price = defaultdict(int); n = 0
    async for s in db.marketplace_searches.find(q, {"_id": 0, "colonias": 1, "recamaras_min": 1, "precio_max": 1}):
        n += 1
        for c in (s.get("colonias") or []):
            if colonias and c not in colonias:
                continue
            by_col[c] += 1
        if s.get("recamaras_min"):
            by_rec[f"{s['recamaras_min']}+ rec"] += 1
        pm = s.get("precio_max")
        if pm:
            by_price["0-3M" if pm <= 3e6 else "3-8M" if pm <= 8e6 else "8-20M" if pm <= 20e6 else "20M+"] += 1
    return {"busquedas_insatisfechas": n,
            "por_colonia": [{"colonia": c, "n": v} for c, v in sorted(by_col.items(), key=lambda x: -x[1])[:top]],
            "por_recamaras": dict(sorted(by_rec.items())), "por_precio": dict(sorted(by_price.items())),
            "lectura": "alta demanda insatisfecha = oportunidad de construir lo que el mercado pide y no encuentra"}


async def _window_feature_counts(db, start, end, colonias=None) -> Dict[str, int]:
    from data_developments import DEVELOPMENTS_BY_ID
    q = {"created_at_dt": {"$gte": start, "$lt": end}, "type": {"$in": _ENGAGE}}
    if colonias:
        q["colonia"] = {"$in": colonias}
    counts = defaultdict(int)
    async for s in db.buyer_signals.find(q, {"_id": 0, "entity_id": 1, "colonia": 1, "unit_number": 1, "meta": 1, "type": 1, "value": 1}):
        feats, col, _ = _attribute(s, DEVELOPMENTS_BY_ID.get(s.get("entity_id")))
        if feats and col:
            for f in feats:
                counts[f] += 1
    return dict(counts)


async def trend_alerts(db, window_days: int = 30, colonias: Optional[List[str]] = None, min_recent: int = 3) -> Dict[str, Any]:
    """TENDENCIA/ANOMALÍA — demanda por feature en la ventana reciente vs la anterior → qué SUBE rápido ('terraza 3x este
    mes'). El sensor de 'el mercado está cambiando, muévete'."""
    now = dt.datetime.utcnow()
    recent = await _window_feature_counts(db, now - dt.timedelta(days=window_days), now, colonias)
    prior = await _window_feature_counts(db, now - dt.timedelta(days=2 * window_days), now - dt.timedelta(days=window_days), colonias)
    alerts = []
    for f, rc in recent.items():
        if rc < min_recent:
            continue
        pc = prior.get(f, 0)
        growth = (rc - pc) / max(pc, 1)
        alerts.append({"feature": f, "reciente": rc, "anterior": pc, "crecimiento_pct": round(growth * 100),
                       "x": round(rc / pc, 1) if pc else None})
    alerts.sort(key=lambda x: -x["crecimiento_pct"])
    return {"ventana_dias": window_days, "tendencias": alerts[:15],
            "lectura": "feature creciendo rápido + poca oferta = constrúyelo YA"}


async def lead_engaged_features(db, visitor_id: str, since_days: int = 365, top: int = 8) -> Dict[str, Any]:
    """Las FEATURES y COLONIAS con las que un lead/visitante ENGANCHÓ (sus propias señales) → para que el ASESOR le
    ofrezca lo correcto. Cierra el loop comprador→asesor: 'este lead miró terraza/gym en Polanco → ofrécele eso'."""
    from data_developments import DEVELOPMENTS_BY_ID
    cutoff = dt.datetime.utcnow() - dt.timedelta(days=since_days)
    counts = defaultdict(int); cols = defaultdict(int)
    async for s in db.buyer_signals.find(
            {"visitor_id": visitor_id, "created_at_dt": {"$gte": cutoff}, "type": {"$in": _ENGAGE}},
            {"_id": 0, "entity_id": 1, "colonia": 1, "unit_number": 1, "meta": 1, "type": 1, "value": 1}):
        feats, col, _ = _attribute(s, DEVELOPMENTS_BY_ID.get(s.get("entity_id")))
        for f in (feats or []):
            counts[f] += 1
        if col:
            cols[col] += 1
    return {"features": [{"feature": f, "n": n} for f, n in sorted(counts.items(), key=lambda x: -x[1])[:top]],
            "colonias": [{"colonia": c, "n": n} for c, n in sorted(cols.items(), key=lambda x: -x[1])[:5]]}


async def recommend_for_lead(db, visitor_id: str) -> Dict[str, Any]:
    """Para el ASESOR: dado el gusto REAL del lead (sus features/colonias enganchadas), qué UNIDADES ofrecerle."""
    from data_developments import DEVELOPMENTS
    eng = await lead_engaged_features(db, visitor_id)
    want_f = {x["feature"] for x in eng["features"]}
    want_c = {x["colonia"] for x in eng["colonias"]}
    if not want_f and not want_c:
        return {"features": [], "colonias": [], "unidades": [], "lectura": "El lead aún no tiene señales — sin recomendación granular."}
    matches = []
    for dev in DEVELOPMENTS:
        dfeats = _dev_features(dev)
        score = len(dfeats & want_f) + (2 if dev.get("colonia_id") in want_c else 0)
        if score > 0:
            matches.append({"dev": dev.get("id"), "name": dev.get("name"), "colonia": dev.get("colonia_id"),
                            "features_match": sorted(dfeats & want_f), "score": score})
    matches.sort(key=lambda x: -x["score"])
    return {"features_del_lead": eng["features"], "colonias_del_lead": eng["colonias"], "recomendaciones": matches[:6],
            "lectura": "ofrécele estos desarrollos: hacen match con lo que el lead estuvo mirando"}


async def killer_query(db, feature: str, colonia: str, period: str = "month") -> Dict[str, Any]:
    """El ejemplo del founder: '¿cuántos clientes engancharon con [feature] en [colonia], y cuándo?'."""
    feature = feature.strip().lower()
    res = await demand_by_feature(db, colonia=colonia, period=period, top=100)
    row = next((f for f in res["top_features"] if f["feature"] == feature), None)
    return {"pregunta": f"demanda de '{feature}' en '{colonia}'", "feature": feature, "colonia": colonia,
            "demanda_total": (row or {}).get("demanda", 0), "serie_tiempo": (row or {}).get("serie", {}),
            "respondible": row is not None}
