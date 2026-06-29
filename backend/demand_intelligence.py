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
           "atlax_profile", "zone_profile", "lens", "module_open", "section_view",
           "atlax_query", "atlax_apartado"]   # + señales explícitas (amenidades/filtros de CADA pregunta a Atlax)


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
        # anterior=0 → NO inventamos % (sería 'subió 3600%' engañoso). Es 'nuevo' en la ventana reciente.
        if pc == 0:
            alerts.append({"feature": f, "reciente": rc, "anterior": 0, "crecimiento_pct": None, "nuevo": True, "x": None})
        else:
            alerts.append({"feature": f, "reciente": rc, "anterior": pc, "crecimiento_pct": round((rc - pc) / pc * 100),
                           "nuevo": False, "x": round(rc / pc, 1)})
    alerts.sort(key=lambda x: -(x["crecimiento_pct"] if x["crecimiento_pct"] is not None else (10 ** 6 + x["reciente"])))
    return {"ventana_dias": window_days, "tendencias": alerts[:15],
            "lectura": "feature creciendo rápido + poca oferta = constrúyelo YA"}


_CONV_FEATURES = ("terraza", "balcón", "balcon", "roof", "gym", "alberca", "jardín", "jardin", "vista", "bodega",
                  "estacionamiento", "pet", "mascota", "amueblado", "sky", "spa", "jacuzzi", "cava", "seguridad", "elevador")
_CONV_CONCERNS = {"precio": "precio", "caro": "precio", "presupuesto": "precio", "crédito": "crédito", "credito": "crédito",
                  "enganche": "enganche", "mensualidad": "mensualidad", "escritura": "escritura", "entrega": "entrega",
                  "plusvalía": "plusvalía", "plusvalia": "plusvalía", "ruido": "ruido", "mantenimiento": "mantenimiento"}


async def conversation_intel(db, since_days: int = 365, top: int = 15) -> Dict[str, Any]:
    """Analiza la conversación con Atlax TURNO POR TURNO (asistente_messages role=user) → qué FEATURES, COLONIAS y
    OBJECIONES aparecen en el ida-y-vuelta, más allá de la query inicial. Cierra el gap 'conversación no analizada'."""
    from data_developments import DEVELOPMENTS
    cutoff = (dt.datetime.utcnow() - dt.timedelta(days=since_days)).isoformat()
    known = {d.get("colonia_id"): (d.get("colonia") or "") for d in DEVELOPMENTS if d.get("colonia_id")}
    feats = defaultdict(int); concerns = defaultdict(int); cols = defaultdict(int)
    n = 0
    async for m in db.asistente_messages.find({"role": "user"}, {"_id": 0, "content": 1, "created_at": 1}):
        if str(m.get("created_at") or "") < cutoff:
            continue
        txt = (m.get("content") or "").lower()
        if not txt:
            continue
        n += 1
        for f in _CONV_FEATURES:
            if f in txt:
                feats[f.replace("balcón", "balcon").replace("jardín", "jardin")] += 1
        for k, label in _CONV_CONCERNS.items():
            if k in txt:
                concerns[label] += 1
        for cid, cname in known.items():
            if (cid.replace("-", " ") in txt) or (cname and cname.lower() in txt):
                cols[cid] += 1
    _rank = lambda d: [{"k": k, "n": v} for k, v in sorted(d.items(), key=lambda x: -x[1])[:top]]
    return {"mensajes_analizados": n, "features_mencionados": _rank(feats), "objeciones": _rank(concerns),
            "colonias_mencionadas": _rank(cols),
            "lectura": "lo que el comprador realmente DICE en la conversación (intención + objeciones), no solo lo que filtra"}


async def demand_by_geo(db, since_days: int = 365, top: int = 15) -> Dict[str, Any]:
    """Demanda al GEO MÁS FINO posible: CALLE → CP(≈manzana) → COLONIA → ALCALDÍA → CIUDAD. La calle/CP vienen del dev
    (la unidad hereda su dirección). Cierra el gap sub-colonia: 'cuántos exploran propiedades en Moliere 245 / CP 11570'."""
    from data_developments import DEVELOPMENTS_BY_ID
    cutoff = dt.datetime.utcnow() - dt.timedelta(days=since_days)
    levels = {"calle": "street", "cp": "postal_code", "colonia": "colonia_id", "alcaldia": "alcaldia", "ciudad": "city"}
    agg = {lvl: defaultdict(int) for lvl in levels}
    async for s in db.buyer_signals.find(
            {"created_at_dt": {"$gte": cutoff}, "type": {"$in": _ENGAGE}, "entity_id": {"$nin": [None, ""]}},
            {"_id": 0, "entity_id": 1}):
        dev = DEVELOPMENTS_BY_ID.get(s.get("entity_id"))
        if not dev:
            continue
        for lvl, field in levels.items():
            v = dev.get(field) or ("CDMX" if lvl == "ciudad" else None)
            if v:
                agg[lvl][str(v)] += 1
    return {lvl: [{"geo": g, "demanda": n} for g, n in sorted(d.items(), key=lambda x: -x[1])[:top]]
            for lvl, d in agg.items()}


async def financial_intent(db, colonias: Optional[List[str]] = None, since_days: int = 365) -> Dict[str, Any]:
    """INTENCIÓN FINANCIERA (antes invisible) — cuántos exploran PAGO (qué enganche/mensualidad/esquema) y RENTABILIDAD
    (qué ROI). Señal de ALTO intento. Que payment_explore/roi_explore no queden capturados-y-muertos."""
    cutoff = dt.datetime.utcnow() - dt.timedelta(days=since_days)
    q = {"created_at_dt": {"$gte": cutoff}}
    if colonias:
        q["colonia"] = {"$in": colonias}
    pay = roi = 0
    enganches = []; tirs = []; esquemas = defaultdict(int)
    async for s in db.buyer_signals.find({**q, "type": {"$in": ["payment_explore", "roi_explore"]}},
                                         {"_id": 0, "type": 1, "meta": 1}):
        meta = s.get("meta") or {}
        if s["type"] == "payment_explore":
            pay += 1
            if isinstance(meta.get("enganche_pct"), (int, float)):
                enganches.append(meta["enganche_pct"])
            if meta.get("esquema"):
                esquemas[str(meta["esquema"])] += 1
        else:
            roi += 1
            if isinstance(meta.get("tir_pct"), (int, float)):
                tirs.append(meta["tir_pct"])
    return {"exploraron_pago": pay, "exploraron_roi": roi,
            "enganche_promedio_pct": round(sum(enganches) / len(enganches), 1) if enganches else None,
            "tir_buscado_promedio_pct": round(sum(tirs) / len(tirs), 1) if tirs else None,
            "esquemas_preferidos": dict(sorted(esquemas.items(), key=lambda x: -x[1])[:5]),
            "lectura": "alto intento de compra — están corriendo números"}


async def demand_alerts(db, colonias: Optional[List[str]] = None, since_days: int = 90, top: int = 5) -> Dict[str, Any]:
    """JUGADAS PROACTIVAS de demanda — combina presión (demanda vs oferta) + tendencia (qué sube) + no-satisfecho →
    '¿qué construir YA?'. Lo proactivo: el dev/superadmin lo ve de un vistazo, sin escarbar la tabla."""
    wtb = await what_to_build(db, colonias=colonias, since_days=since_days)
    trends = await trend_alerts(db, colonias=colonias)
    unmet = await unmet_demand(db, colonias=colonias, since_days=since_days)
    trend_map = {t["feature"]: t for t in trends.get("tendencias", [])}
    jugadas = []
    for o in wtb.get("oportunidades", []):
        if o["presion"] < 0.5 and o["demanda"] < 5:
            continue
        t = trend_map.get(o["feature"])
        sube = (t or {}).get("crecimiento_pct")
        nuevo = bool((t or {}).get("nuevo"))
        urgencia = round(o["presion"] + (1.0 if ((sube and sube > 50) or nuevo) else 0.0), 2)
        msg = f"{o['feature']}: {o['demanda']} lo buscan vs {o['oferta_unidades']} unidades en oferta (presión ×{o['presion']})"
        if nuevo:
            msg += " · nuevo en demanda reciente"
        elif sube and sube > 0:
            msg += f" · subiendo {sube:+d}%"
        jugadas.append({"feature": o["feature"], "mensaje": msg, "presion": o["presion"], "tendencia_pct": sube,
                        "nuevo": nuevo, "urgencia": urgencia, "accion": "construir" if o["presion"] >= 0.7 else "considerar"})
    jugadas.sort(key=lambda x: -x["urgencia"])
    return {"jugadas": jugadas[:top], "busquedas_no_satisfechas": unmet.get("busquedas_insatisfechas", 0),
            "lectura": "ordenado por urgencia (presión + tendencia) — construye lo de arriba"}


async def notify_demand_alerts(db) -> Dict[str, Any]:
    """CRON · PUSH proactivo (cierra la deuda del 'dispara solo alerta'): por cada dev, si hay una jugada de 'construir'
    en sus colonias, le manda una NOTIFICACIÓN real (campana/email), no solo el dashboard. Deduped: máx 1 por
    (dev, feature) cada 7 días. Idempotente, fail-soft."""
    from types import SimpleNamespace
    from notifications_engine import emit_notification
    from tenant_scope import user_dev_ids
    from data_developments import DEVELOPMENTS_BY_ID
    cutoff = (dt.datetime.utcnow() - dt.timedelta(days=7)).isoformat()
    sent = att = 0
    async for u in db.users.find({"role": "developer_admin"}, {"_id": 0}):
        att += 1
        try:
            uid = u.get("id") or u.get("user_id")
            dev_ids = list(user_dev_ids(SimpleNamespace(**u)) or [])
            cols = sorted({DEVELOPMENTS_BY_ID[d]["colonia_id"] for d in dev_ids
                           if d in DEVELOPMENTS_BY_ID and DEVELOPMENTS_BY_ID[d].get("colonia_id")})
            if not uid or not cols:
                continue
            alerts = await demand_alerts(db, colonias=cols)
            top = next((j for j in alerts.get("jugadas", []) if j.get("accion") == "construir"), None)
            if not top:
                continue
            # dedup: ¿ya le mandé esta jugada en 7 días?
            dup = await db.notifications.find_one({"user_id": uid, "type": "demand_build_alert",
                                                   "payload.feature": top["feature"], "created_at": {"$gte": cutoff}})
            if dup:
                continue
            await emit_notification(db, user_id=uid, type="demand_build_alert", severity="high",
                                    title="Qué construir: el mercado lo está pidiendo", body=top["mensaje"],
                                    payload={"feature": top["feature"], "urgencia": top["urgencia"], "colonias": cols},
                                    action_url="/desarrollador/demanda")
            sent += 1
        except Exception:
            continue
    return {"devs": att, "notificaciones_enviadas": sent}


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


async def rejection_intel(db, since_days: int = 365, top: int = 12) -> Dict[str, Any]:
    """EL REVERSO DE LA DEMANDA — por qué dicen NO (dismiss → precio/zona/tamaño/fotos/amenidad/entrega), por colonia.
    Te dice QUÉ CORREGIR, no solo qué quieren."""
    cutoff = dt.datetime.utcnow() - dt.timedelta(days=since_days)
    reasons = defaultdict(int); by_col = defaultdict(lambda: defaultdict(int)); n = 0
    async for s in db.buyer_signals.find({"type": "dismiss", "created_at_dt": {"$gte": cutoff}},
                                         {"_id": 0, "value": 1, "meta": 1, "colonia": 1}):
        r = str(s.get("value") or (s.get("meta") or {}).get("reason") or "otro")
        reasons[r] += 1; n += 1
        if s.get("colonia"):
            by_col[s["colonia"]][r] += 1
    return {"total_rechazos": n, "razones": [{"razon": k, "n": v} for k, v in sorted(reasons.items(), key=lambda x: -x[1])[:top]],
            "por_colonia": {c: dict(r) for c, r in sorted(by_col.items(), key=lambda x: -sum(x[1].values()))[:8]},
            "lectura": "la razón #1 de rechazo = lo que más te cuesta ventas"}


async def intent_split(db, since_days: int = 365, top: int = 10) -> Dict[str, Any]:
    """DEMANDA POR INTENT — vivir vs invertir (lens) global y por colonia. 'En Polanco el 60% es inversionista'."""
    cutoff = dt.datetime.utcnow() - dt.timedelta(days=since_days)
    glob = defaultdict(int); by_col = defaultdict(lambda: defaultdict(int))
    async for s in db.buyer_signals.find({"type": "lens", "created_at_dt": {"$gte": cutoff}}, {"_id": 0, "value": 1, "colonia": 1}):
        v = s.get("value")
        if v:
            glob[v] += 1
            if s.get("colonia"):
                by_col[s["colonia"]][v] += 1
    return {"global": dict(glob),
            "por_colonia": [{"colonia": c, **dict(d)} for c, d in sorted(by_col.items(), key=lambda x: -sum(x[1].values()))[:top]]}


async def co_viewed(db, since_days: int = 365, top: int = 15) -> Dict[str, Any]:
    """QUÉ COMPITE (market basket) — desarrollos vistos por el MISMO comprador = compiten en su mente. Inteligencia
    competitiva real ('quien ve Altavista también ve Tamaulipas 89')."""
    from collections import Counter
    from data_developments import DEVELOPMENTS_BY_ID
    cutoff = dt.datetime.utcnow() - dt.timedelta(days=since_days)
    seen = defaultdict(set)
    async for s in db.buyer_signals.find({"type": {"$in": ["ficha_view", "like", "unit_view", "compare"]},
                                          "created_at_dt": {"$gte": cutoff}, "entity_id": {"$nin": [None, ""]}},
                                         {"_id": 0, "visitor_id": 1, "entity_id": 1}):
        seen[s["visitor_id"]].add(s["entity_id"])
    pairs = Counter()
    for devs in seen.values():
        dl = sorted(devs)
        for i in range(len(dl)):
            for j in range(i + 1, len(dl)):
                pairs[(dl[i], dl[j])] += 1
    nm = lambda d: (DEVELOPMENTS_BY_ID.get(d, {}) or {}).get("name") or d
    return {"pares_comparados": [{"a": nm(a), "b": nm(b), "juntos": n} for (a, b), n in pairs.most_common(top)],
            "lectura": "estos desarrollos compiten por el mismo comprador"}


async def temporal_demand(db, since_days: int = 90) -> Dict[str, Any]:
    """CUÁNDO buscan — hora del día + día de la semana. 'Lujo de noche, familias en fin de semana'."""
    cutoff = dt.datetime.utcnow() - dt.timedelta(days=since_days)
    by_hour = defaultdict(int); by_dow = defaultdict(int)
    async for s in db.buyer_signals.find({"created_at_dt": {"$gte": cutoff}}, {"_id": 0, "created_at_dt": 1}):
        d = s.get("created_at_dt")
        if isinstance(d, dt.datetime):
            by_hour[d.hour] += 1; by_dow[d.weekday()] += 1
    dow = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]
    return {"por_hora": {str(h): by_hour.get(h, 0) for h in range(24)},
            "por_dia": {dow[i]: by_dow.get(i, 0) for i in range(7)}}


async def journey_depth(db, since_days: int = 365) -> Dict[str, Any]:
    """PROFUNDIDAD DEL JOURNEY — toques antes del lead, % que regresa, % que convierte. Calidad del embudo."""
    cutoff = dt.datetime.utcnow() - dt.timedelta(days=since_days)
    by_v = defaultdict(lambda: {"n": 0, "lead": False, "days": set()})
    async for s in db.buyer_signals.find({"created_at_dt": {"$gte": cutoff}}, {"_id": 0, "visitor_id": 1, "type": 1, "created_at_dt": 1}):
        v = by_v[s["visitor_id"]]; v["n"] += 1
        if s["type"] == "lead":
            v["lead"] = True
        if isinstance(s.get("created_at_dt"), dt.datetime):
            v["days"].add(s["created_at_dt"].date())
    tot = len(by_v) or 1
    return {"visitantes": len(by_v),
            "toques_promedio": round(sum(v["n"] for v in by_v.values()) / tot, 1),
            "regresan_pct": round(100 * sum(1 for v in by_v.values() if len(v["days"]) > 1) / tot),
            "convierten_a_lead_pct": round(100 * sum(1 for v in by_v.values() if v["lead"]) / tot)}


def _col2geo():
    """Mapa colonia_id → {alcaldia, cp} desde la oferta (para escalar búsquedas a macro/micro)."""
    from data_developments import DEVELOPMENTS
    m = {}
    for d in DEVELOPMENTS:
        c = d.get("colonia_id")
        if c and c not in m:
            m[c] = {"alcaldia": d.get("alcaldia"), "cp": d.get("postal_code"), "colonia": d.get("colonia") or c}
    return m


async def zone_dynamics(db, scale: str = "media", since_days: int = 180, colonias: Optional[List[str]] = None, top: int = 20) -> Dict[str, Any]:
    """DINÁMICA DE ZONA por escala — micro(CP) / media(colonia) / macro(alcaldía). Por cada zona: DEMANDA (señales+
    búsquedas), OFERTA (unidades), ABSORCIÓN (demanda/oferta) y MOVIMIENTO (mitad reciente vs previa = subiendo/enfriando/
    nuevo). El 'SimCity de la demanda' a 3 zooms."""
    from data_developments import DEVELOPMENTS, DEVELOPMENTS_BY_ID
    now = dt.datetime.utcnow()
    cutoff = now - dt.timedelta(days=since_days)
    mid = now - dt.timedelta(days=since_days // 2)
    c2g = _col2geo()

    def key_for(colonia_id, dev):
        d = dev or {}
        if scale == "macro":
            return d.get("alcaldia") or (c2g.get(colonia_id, {}) or {}).get("alcaldia")
        if scale == "micro":
            return d.get("postal_code") or (c2g.get(colonia_id, {}) or {}).get("cp")
        return colonia_id or d.get("colonia_id")  # media

    def in_scope(colonia_id, dev):
        if not colonias:
            return True
        if scale == "media":
            return (colonia_id or (dev or {}).get("colonia_id")) in colonias
        return True  # macro/micro: no se filtra por colonia individual

    # OFERTA por zona
    sup = defaultdict(int)
    for d in DEVELOPMENTS:
        if colonias and scale == "media" and d.get("colonia_id") not in colonias:
            continue
        k = {"macro": d.get("alcaldia"), "micro": d.get("postal_code"), "media": d.get("colonia_id")}.get(scale)
        if k:
            sup[k] += len(d.get("units") or []) or 1

    # DEMANDA (señales) + MOVIMIENTO
    dem = defaultdict(int); rec = defaultdict(int); pri = defaultdict(int)
    async for s in db.buyer_signals.find({"created_at_dt": {"$gte": cutoff}}, {"_id": 0, "colonia": 1, "entity_id": 1, "created_at_dt": 1}):
        dev = DEVELOPMENTS_BY_ID.get(s.get("entity_id"))
        if not in_scope(s.get("colonia"), dev):
            continue
        k = key_for(s.get("colonia"), dev)
        if not k:
            continue
        dem[k] += 1
        t = s.get("created_at_dt")
        if isinstance(t, dt.datetime):
            (rec if t >= mid else pri)[k] += 1

    # BÚSQUEDAS por zona (escaladas)
    srch = defaultdict(int)
    async for q in db.marketplace_searches.find({"created_at_dt": {"$gte": cutoff}, "colonias": {"$nin": [None, []]}}, {"_id": 0, "colonias": 1}):
        for c in (q.get("colonias") or []):
            k = c if scale == "media" else (c2g.get(c, {}) or {}).get("alcaldia" if scale == "macro" else "cp")
            if k and (not colonias or scale != "media" or c in colonias):
                srch[k] += 1

    def movimiento(k):
        r, p = rec.get(k, 0), pri.get(k, 0)
        if p == 0 and r > 0:
            return ("nuevo", None)
        if p == 0:
            return ("sin_dato", None)
        ch = round(100 * (r - p) / p)
        return ("subiendo" if ch >= 20 else "enfriando" if ch <= -20 else "estable", ch)

    zonas = []
    for k in set(dem) | set(sup) | set(srch):
        de, su = dem.get(k, 0), sup.get(k, 0)
        mv, ch = movimiento(k)
        zonas.append({"zona": k, "demanda": de, "busquedas": srch.get(k, 0), "oferta_unidades": su,
                      "absorcion": round(de / max(su, 1), 2), "movimiento": mv, "cambio_pct": ch})
    zonas.sort(key=lambda x: -(x["demanda"] + x["busquedas"]))
    return {"escala": scale, "zonas": zonas[:top],
            "lectura": "absorción alta + movimiento 'subiendo' = zona caliente con poca oferta (oportunidad)"}


async def market_movement(db, since_days: int = 180, colonias: Optional[List[str]] = None) -> Dict[str, Any]:
    """Las 3 escalas de una: macro (alcaldía) → media (colonia) → micro (CP). Demanda+oferta+absorción+movimiento."""
    return {
        "macro": await zone_dynamics(db, "macro", since_days=since_days, colonias=colonias),
        "media": await zone_dynamics(db, "media", since_days=since_days, colonias=colonias),
        "micro": await zone_dynamics(db, "micro", since_days=since_days, colonias=colonias),
    }


async def zone_intelligence(db, since_days: int = 180, colonias: Optional[List[str]] = None, top: int = 14) -> Dict[str, Any]:
    """ÍNDICE DE INTELIGENCIA DE ZONA — FUSIONA 9 motores vivos en UNA foto por colonia (lo que hoy vive en silos):
      · demanda + movimiento (buyer_signals)        · demanda pedida + oportunidad (demand_twin_engine)
      · ABSORCIÓN real por cohorte (absorcion_engine) · precio/m² + tier (AVM)
      · score A-F + subscores calidad de vida (zone_score) · RIESGO (risk_score_engine)
      · SCORE DE INVERSIÓN 0-100 AAA-B (score_inversion_engine) · ciclo + recomendación (zone_cycle_engine).
    El 'HouseCanary de MX' por zona — la data deja de estar muerta y se mide."""
    import avm_public_engine as ave
    import zone_score_engine as zse
    import zone_cycle_engine as zce
    import absorcion_engine as abse
    import demand_twin_engine as dte
    import risk_score_engine as rse
    import score_inversion_engine as sie

    dyn = await zone_dynamics(db, "media", since_days=since_days, colonias=colonias, top=top * 2)
    # one-shot (devuelven listas) → indexar por colonia
    twin = {}
    try:
        for t in (await dte.build_demand_twin(db, limit=140)) or []:
            twin[(t.get("colonia") or "").lower()] = t
    except Exception:
        pass
    inv = {}
    try:
        for s in (await sie.top_colonias_by_score(db, limit=140)) or []:
            inv[(s.get("colonia_slug") or "").lower()] = s
    except Exception:
        pass

    out = []
    for z in dyn["zonas"][:top]:
        cid = z["zona"]; lc = (cid or "").lower()
        prof = {k: z.get(k) for k in ("zona", "demanda", "busquedas", "oferta_unidades", "movimiento", "cambio_pct")}
        absorcion_pct = None
        # AVM — precio/m² + tier
        try:
            a = ave.colonia_stats(cid)
            if isinstance(a, dict) and not a.get("error"):
                prof.update({"precio_m2": a.get("price_m2"), "tier": a.get("tier"),
                             "alcaldia": a.get("alcaldia"), "nombre": a.get("name")})
        except Exception:
            pass
        # ABSORCIÓN real por cohorte (vendido% · velocidad · meses para agotar)
        try:
            ab = await abse.curva_absorcion(db, colonia_id=cid)
            cur = ab.get("curva") or []
            if cur:
                tot = sum(c.get("unidades_total", 0) for c in cur)
                sold = sum(c.get("vendidas", 0) for c in cur)
                vel = round(sum(c.get("velocidad_mensual", 0) for c in cur), 1)
                absorcion_pct = round(100 * sold / tot) if tot else None
                prof["absorcion"] = {"vendido_pct": absorcion_pct, "velocidad_mensual": vel,
                                     "meses_agotar": round((tot - sold) / vel, 1) if vel else None}
        except Exception:
            pass
        # Demanda pedida + oportunidad (Gemelo de Demanda)
        t = twin.get(lc)
        if t:
            prof["oportunidad"] = t.get("interes") or t.get("oportunidad_score")
            prof["spec_pedida"] = t.get("spec")
        # Score A-F + subscores de calidad de vida
        try:
            s = await zse.get_zone_with_subscores(db, cid)
            if isinstance(s, dict):
                prof["score_zona"] = s.get("score_letter")
                prof["subscores"] = s.get("subscores") or {}
                prof.setdefault("nombre", s.get("name"))
        except Exception:
            pass
        # Riesgo (crimen + natural + título + percepción)
        try:
            r = await rse.compute_risk_score_v2(db, cid)
            if isinstance(r, dict):
                prof["riesgo"] = {"letra": r.get("score_letter"), "num": r.get("score_numeric")}
        except Exception:
            pass
        # Score de inversión 0-100 AAA-B
        s2 = inv.get(lc)
        if s2:
            prof["inversion"] = {"score": s2.get("score"), "tier": s2.get("tier"), "rec": s2.get("recommendation")}
        # Ciclo + recomendación (alimentado con la absorción REAL)
        try:
            rec = await db.colonias.find_one({"id": cid}, {"_id": 0})
            if rec:
                cyc = zce.compute_zone_cycle(rec, absorcion_pct=absorcion_pct)
                prof["ciclo"] = cyc.get("label") or (cyc.get("ciclo") or {}).get("label") or (cyc.get("ciclo") or {}).get("fase_key")
                try:
                    prof["recomendacion"] = zce.zone_recommendation(cyc)
                except Exception:
                    pass
        except Exception:
            pass
        out.append(prof)
    return {"zonas": out,
            "lectura": "demanda + absorción real + precio/m² + calidad de vida + riesgo + inversión + ciclo = la foto institucional de la zona",
            "fuentes": ["buyer_signals", "demand_twin_engine", "absorcion_engine", "avm_public_engine",
                        "zone_score_engine", "risk_score_engine", "score_inversion_engine", "zone_cycle_engine"]}


async def behavior_profile(db, since_days: int = 365) -> Dict[str, Any]:
    """PERFIL DE COMPORTAMIENTO — device (mobile/desktop/tablet), estilo DISC, engagement de tour/video, profundidad de
    scroll. Consume las dimensiones de captura nueva (que ninguna quede capturada-y-muerta)."""
    cutoff = dt.datetime.utcnow() - dt.timedelta(days=since_days)
    devices = defaultdict(int); n_tour = 0; scrolls = []
    async for s in db.buyer_signals.find({"created_at_dt": {"$gte": cutoff}}, {"_id": 0, "device": 1, "type": 1, "value": 1}):
        if s.get("device"):
            devices[s["device"]] += 1
        if s.get("type") == "tour_view":
            n_tour += 1
        elif s.get("type") == "scroll_depth":
            try:
                scrolls.append(int(s.get("value") or 0))
            except (TypeError, ValueError):
                pass
    disc = defaultdict(int)
    try:
        async for c in db.buyer_coach_conversations.find({"inferred_disc": {"$nin": [None, ""]}}, {"_id": 0, "inferred_disc": 1}):
            disc[c["inferred_disc"]] += 1
    except Exception:
        pass
    return {"device": dict(devices), "estilo_disc": dict(disc), "abrieron_tour_video": n_tour,
            "scroll_profundo_promedio_pct": round(sum(scrolls) / len(scrolls)) if scrolls else None,
            "lectura": "cómo se comporta: dispositivo, estilo de decisión (DISC), y qué tan a fondo explora"}


async def price_sensitivity(db, since_days: int = 365, top: int = 12) -> Dict[str, Any]:
    """SENSIBILIDAD AL PRECIO — el TECHO de precio que busca el mercado, global y por colonia (mediana/p25/p75). Te dice
    a qué precio construir/listar para no quedar fuera de la búsqueda."""
    import statistics
    cutoff = dt.datetime.utcnow() - dt.timedelta(days=since_days)
    glob = []; by_col = defaultdict(list)
    async for s in db.marketplace_searches.find({"created_at_dt": {"$gte": cutoff}, "precio_max": {"$gt": 0}},
                                                {"_id": 0, "precio_max": 1, "colonias": 1}):
        glob.append(s["precio_max"])
        for c in (s.get("colonias") or []):
            by_col[c].append(s["precio_max"])

    def stats(vals):
        v = sorted(vals)
        return {"n": len(v), "mediana": round(statistics.median(v)) if v else None,
                "p25": round(v[len(v) // 4]) if v else None, "p75": round(v[3 * len(v) // 4]) if v else None}
    return {"global": stats(glob),
            "por_colonia": [{"colonia": c, **stats(v)} for c, v in sorted(by_col.items(), key=lambda x: -len(x[1]))[:top]],
            "lectura": "construye/lista por debajo de la mediana del techo = entras en más búsquedas"}


async def funnel_velocity(db, since_days: int = 365) -> Dict[str, Any]:
    """VELOCIDAD DEL EMBUDO — cuánto tarda el comprador: del 1er contacto al LEAD, y del lead al CIERRE. Por intent si
    se puede. 'Inversionistas deciden en días, familias en semanas'."""
    import statistics
    cutoff = dt.datetime.utcnow() - dt.timedelta(days=since_days)
    # 1er señal → lead (consideración) por visitante que tiene lead
    first = {}; lead_at = {}
    async for s in db.buyer_signals.find({"created_at_dt": {"$gte": cutoff}}, {"_id": 0, "visitor_id": 1, "type": 1, "created_at_dt": 1}):
        v, t = s.get("visitor_id"), s.get("created_at_dt")
        if not isinstance(t, dt.datetime):
            continue
        if v not in first or t < first[v]:
            first[v] = t
        if s.get("type") == "lead":
            if v not in lead_at or t < lead_at[v]:
                lead_at[v] = t
    consider_days = [round((lead_at[v] - first[v]).total_seconds() / 86400, 1) for v in lead_at if v in first and lead_at[v] >= first[v]]
    # lead creado → cerrado (db.leads)
    close_days = []
    async for l in db.leads.find({"status_v2": {"$in": ["vendido", "cerrado_ganado"]}}, {"_id": 0, "created_at": 1, "last_activity_at": 1}):
        try:
            c = dt.datetime.fromisoformat(str(l["created_at"]).replace("Z", "")[:26])
            e = dt.datetime.fromisoformat(str(l.get("last_activity_at") or l["created_at"]).replace("Z", "")[:26])
            if e >= c:
                close_days.append(round((e - c).total_seconds() / 86400, 1))
        except Exception:
            continue
    med = lambda x: round(statistics.median(x), 1) if x else None
    return {"consideracion_dias": {"n": len(consider_days), "mediana": med(consider_days)},
            "lead_a_cierre_dias": {"n": len(close_days), "mediana": med(close_days)},
            "lectura": "mide la velocidad real: cuánto tardan en convertirse y en cerrar"}


_PROP_WEIGHT = {"atlax_apartado": 12, "lead": 10, "intent": 8, "roi_explore": 7, "payment_explore": 7,
                "unit_save": 5, "save": 4, "like": 4, "compare": 3, "unit_view": 3, "atlax_query": 3,
                "photo_dwell": 2, "photo_zoom": 2, "tour_view": 3, "ficha_view": 1, "view": 1, "dwell": 1, "dismiss": -3}


async def hot_visitors(db, since_days: int = 90, top: int = 15) -> Dict[str, Any]:
    """PROPENSIÓN / CALOR POR VISITANTE — puntúa cada visitante anónimo por sus señales (apartado/lead pesan, dismiss
    resta) + qué features/colonias mira. Lo MÁS accionable: 'estos visitantes anónimos se están calentando'."""
    from data_developments import DEVELOPMENTS_BY_ID
    cutoff = dt.datetime.utcnow() - dt.timedelta(days=since_days)
    score = defaultdict(float); feats = defaultdict(lambda: defaultdict(int)); cols = defaultdict(lambda: defaultdict(int))
    last = {}; converted = set()
    async for s in db.buyer_signals.find({"created_at_dt": {"$gte": cutoff}},
                                         {"_id": 0, "visitor_id": 1, "type": 1, "entity_id": 1, "colonia": 1, "created_at_dt": 1, "meta": 1, "unit_number": 1, "value": 1}):
        v = s.get("visitor_id")
        if not v:
            continue
        score[v] += _PROP_WEIGHT.get(s.get("type"), 0.5)
        if s.get("type") == "lead":
            converted.add(v)
        if s.get("colonia"):
            cols[v][s["colonia"]] += 1
        f, _c, _p = _attribute(s, DEVELOPMENTS_BY_ID.get(s.get("entity_id")))
        for x in (f or []):
            feats[v][x] += 1
        t = s.get("created_at_dt")
        if isinstance(t, dt.datetime) and (v not in last or t > last[v]):
            last[v] = t
    ranked = sorted(((v, sc) for v, sc in score.items() if v not in converted), key=lambda x: -x[1])[:top]
    out = []
    for v, sc in ranked:
        tf = sorted(feats[v].items(), key=lambda x: -x[1])[:3]
        tc = sorted(cols[v].items(), key=lambda x: -x[1])[:2]
        out.append({"visitor_id": v, "calor": round(sc, 1),
                    "features": [k for k, _ in tf], "colonias": [k for k, _ in tc],
                    "ultima_actividad": last[v].isoformat() if v in last else None})
    return {"visitantes_calientes": out, "lectura": "lead anónimo a punto de pedir contacto — el asesor podría adelantarse"}


async def killer_query(db, feature: str, colonia: str, period: str = "month") -> Dict[str, Any]:
    """El ejemplo del founder: '¿cuántos clientes engancharon con [feature] en [colonia], y cuándo?'."""
    feature = feature.strip().lower()
    res = await demand_by_feature(db, colonia=colonia, period=period, top=100)
    row = next((f for f in res["top_features"] if f["feature"] == feature), None)
    return {"pregunta": f"demanda de '{feature}' en '{colonia}'", "feature": feature, "colonia": colonia,
            "demanda_total": (row or {}).get("demanda", 0), "serie_tiempo": (row or {}).get("serie", {}),
            "respondible": row is not None}
