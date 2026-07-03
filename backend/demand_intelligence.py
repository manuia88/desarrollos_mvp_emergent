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
from collections import defaultdict, Counter
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


def _time_band(d: dt.datetime, now: Optional[dt.datetime] = None) -> str:
    """Banda de RECENCIA universal: 7d / 30d / 90d / 365d / +1a — para ver si la demanda es fresca o vieja."""
    if not isinstance(d, dt.datetime):
        return "+1a"
    now = now or dt.datetime.utcnow()
    days = (now - d).total_seconds() / 86400
    if days <= 7:
        return "0-7d"
    if days <= 30:
        return "8-30d"
    if days <= 90:
        return "31-90d"
    if days <= 365:
        return "91-365d"
    return "+1a"


def _hour_band(d: dt.datetime) -> str:
    """Franja horaria: madrugada/mañana/tarde/noche — cuándo navega el mercado (UTC, proxy)."""
    if not isinstance(d, dt.datetime):
        return "—"
    h = d.hour
    if h < 6:
        return "madrugada"
    if h < 12:
        return "mañana"
    if h < 18:
        return "tarde"
    return "noche"


def _dow_band(d: dt.datetime) -> str:
    """Día de semana vs fin de semana — el inversionista navega entre semana, la familia el finde (proxy)."""
    if not isinstance(d, dt.datetime):
        return "—"
    return "fin_de_semana" if d.weekday() >= 5 else "entre_semana"


def _signal_segment(s: Dict[str, Any]) -> str:
    """Segmento de intención de UNA señal: vivir / invertir / desconocido (desde meta.intent/uso/tipo o el tipo de señal)."""
    meta = s.get("meta") or {}
    raw = str(meta.get("intent") or meta.get("uso") or s.get("intent") or "").lower()
    # V3-SENSOR-05: la ficha v3 emite el lente en "value" (como intent_split lo lee). Para type=="lens" toma también
    # s.value como fuente de intención, para que el desglose por_segmento NO caiga a "desconocido". Aditivo, fail-soft.
    if not raw and s.get("type") == "lens":
        raw = str(s.get("value") or "").lower()
    seg = _normalize_intent(raw, s.get("type") or "")
    if seg in ("invertir", "invertir-renta", "invertir-plusvalía", "flip"):
        return "invertir"
    if seg in ("vivir", "primera-vivienda", "upgrade", "downsize", "segunda-residencia"):
        return "vivir"
    if s.get("type") in ("roi_explore",):
        return "invertir"
    if s.get("type") in ("payment_explore",):
        return "vivir"
    return "desconocido"


def _device_of(s: Dict[str, Any]) -> str:
    """Dispositivo normalizado (mobile/desktop/tablet/desconocido) desde device o meta.device o channel."""
    meta = s.get("meta") or {}
    raw = str(s.get("device") or meta.get("device") or s.get("channel") or "").lower().strip()
    if not raw:
        return "desconocido"
    if "mob" in raw or raw in ("ios", "android", "phone"):
        return "mobile"
    if "tab" in raw or "ipad" in raw:
        return "tablet"
    if "desk" in raw or raw in ("web", "pc", "mac", "windows"):
        return "desktop"
    return raw


def _price_band(pm) -> Optional[str]:
    """Banda de precio canónica reusable (la misma que usan demand_by_attribute / unmet_demand)."""
    try:
        pm = float(pm)
    except (TypeError, ValueError):
        return None
    if pm <= 0:
        return None
    return "0-3M" if pm <= 3e6 else "3-8M" if pm <= 8e6 else "8-20M" if pm <= 20e6 else "20M+"


def _topn(d: Dict[Any, int], n: int = 10, key_name: str = "k", val_name: str = "n") -> List[Dict[str, Any]]:
    """Ranking top-N genérico de un dict {clave: count} → [{k, n}]."""
    return [{key_name: k, val_name: v} for k, v in sorted(d.items(), key=lambda x: -x[1])[:n]]


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


_DBF_CACHE: Dict[Any, Any] = {}   # PERF A2 · cache TTL del scan de ventana (llave = args)
_DBF_TTL = 300.0                  # 5 min — la demanda por feature cambia por acumulación, no por segundo


async def demand_by_feature(db, colonia: Optional[str] = None, colonias: Optional[List[str]] = None,
                            period: str = "month", since_days: int = 365, top: int = 25) -> Dict[str, Any]:
    """Demanda por FEATURE × colonia × tiempo (señales de engagement → features del dev/unidad).
    colonias (lista) = scope del dev a SUS colonias; colonia (single) = filtro de una.

    PERF A2 (auditoría): el scan no es agregable en Mongo sin romper _attribute() (usa meta/unit_number/
    foto POR señal) → cache TTL 5 min por combinación de args: el full-scan corre a lo más 1 vez por TTL
    aunque lo pidan dev_market/superadmin/granularity a la vez. El dict cacheado se trata como read-only."""
    import time as _time
    _ck = (colonia, tuple(sorted(colonias)) if colonias else None, period, since_days, top)
    _hit = _DBF_CACHE.get(_ck)
    if _hit and (_time.monotonic() - _hit[0]) < _DBF_TTL:
        return _hit[1]
    from data_developments import DEVELOPMENTS_BY_ID
    cutoff = dt.datetime.utcnow() - dt.timedelta(days=since_days)
    q = {"created_at_dt": {"$gte": cutoff}, "type": {"$in": _ENGAGE}}
    if colonia:
        q["colonia"] = colonia
    elif colonias:
        q["colonia"] = {"$in": colonias}
    now = dt.datetime.utcnow()
    by_feature = defaultdict(int)
    series = defaultdict(lambda: defaultdict(int))   # feature -> bucket -> count
    f_by_col = defaultdict(lambda: defaultdict(int))     # feature -> colonia -> count (universo espacial)
    f_recency = defaultdict(lambda: defaultdict(int))    # feature -> banda recencia
    f_segment = defaultdict(lambda: defaultdict(int))    # feature -> vivir/invertir
    f_device = defaultdict(lambda: defaultdict(int))     # feature -> dispositivo
    f_precise = defaultdict(int)                         # feature -> señales precisas a unidad
    col_total = defaultdict(int)                         # colonia -> demanda total (cualquier feature)
    precise = 0; total = 0
    async for s in db.buyer_signals.find(q, {"_id": 0, "entity_id": 1, "colonia": 1, "created_at_dt": 1, "unit_number": 1, "meta": 1, "type": 1, "value": 1, "device": 1, "channel": 1}):
        feats, col, prec = _attribute(s, DEVELOPMENTS_BY_ID.get(s.get("entity_id")))
        if not feats or not col:
            continue
        if prec:
            precise += 1
        b = bucket(s["created_at_dt"], period)
        rb = _time_band(s.get("created_at_dt"), now)
        seg = _signal_segment(s)
        dev_kind = _device_of(s)
        col_total[col] += 1
        for f in feats:
            total += 1
            by_feature[f] += 1
            series[f][b] += 1
            f_by_col[f][col] += 1
            f_recency[f][rb] += 1
            f_segment[f][seg] += 1
            f_device[f][dev_kind] += 1
            if prec:
                f_precise[f] += 1
    ranked = sorted(by_feature.items(), key=lambda x: -x[1])[:top]
    top_features = []
    for f, n in ranked:
        rec = f_recency[f]
        fresca = rec.get("0-7d", 0) + rec.get("8-30d", 0)
        top_features.append({
            "feature": f, "demanda": n,
            "serie": dict(sorted(series[f].items())),
            "share_pct": round(n / total * 100, 1) if total else 0.0,
            "por_colonia": _topn(f_by_col[f], 8, "colonia", "n"),
            "por_recencia": dict(f_recency[f]),
            "por_segmento": dict(f_segment[f]),
            "por_dispositivo": dict(f_device[f]),
            "senales_precisas": f_precise[f],
            "frescura_pct": round(fresca / n * 100) if n else 0,
            "momentum": "calentando" if (rec.get("0-7d", 0) > rec.get("8-30d", 0)) else "estable",
        })
    _out = {
        "colonia": colonia or "todas", "period": period, "since_days": since_days, "senales_precisas_unidad": precise,
        "top_features": top_features,
        "total_senales": total,
        "precision_pct": round(precise / max(total, 1) * 100),
        "colonias_activas": _topn(col_total, 12, "colonia", "demanda"),
        "lectura": "demanda por feature al universo: colonia, recencia, vivir/invertir, dispositivo y momentum por cada feature",
    }
    if len(_DBF_CACHE) > 64:   # reset simple anti-crecimiento (llaves = combos de args, pocos en la práctica)
        _DBF_CACHE.clear()
    _DBF_CACHE[_ck] = (_time.monotonic(), _out)
    return _out


async def demand_by_colonia(db, period: str = "month", since_days: int = 365, top: int = 25) -> Dict[str, Any]:
    """Colonias MÁS SOLICITADAS (señales + búsquedas) × tiempo."""
    from data_developments import DEVELOPMENTS
    now = dt.datetime.utcnow()
    cutoff = now - dt.timedelta(days=since_days)
    col2alc = {d.get("colonia_id"): d.get("alcaldia") for d in DEVELOPMENTS if d.get("colonia_id")}
    by_col = defaultdict(int)
    series = defaultdict(lambda: defaultdict(int))
    from_signal = defaultdict(int); from_search = defaultdict(int)   # señal de navegación vs búsqueda explícita
    recency = defaultdict(lambda: defaultdict(int))                  # colonia -> banda recencia
    by_alc = defaultdict(int)                                        # rollup a alcaldía
    total = 0
    async for s in db.buyer_signals.find({"created_at_dt": {"$gte": cutoff}, "colonia": {"$nin": [None, ""]}},
                                         {"_id": 0, "colonia": 1, "created_at_dt": 1}):
        c = s["colonia"]
        by_col[c] += 1; from_signal[c] += 1; total += 1
        series[c][bucket(s["created_at_dt"], period)] += 1
        recency[c][_time_band(s.get("created_at_dt"), now)] += 1
        by_alc[col2alc.get(c) or "—"] += 1
    async for s in db.marketplace_searches.find({"created_at_dt": {"$gte": cutoff}}, {"_id": 0, "colonias": 1, "created_at_dt": 1}):
        for c in (s.get("colonias") or []):
            by_col[c] += 1; from_search[c] += 1; total += 1
            series[c][bucket(s["created_at_dt"], period)] += 1
            recency[c][_time_band(s.get("created_at_dt"), now)] += 1
            by_alc[col2alc.get(c) or "—"] += 1
    ranked = sorted(by_col.items(), key=lambda x: -x[1])[:top]
    top_colonias = []
    for c, n in ranked:
        rec = recency[c]
        top_colonias.append({
            "colonia": c, "demanda": n, "serie": dict(sorted(series[c].items())),
            "share_pct": round(n / total * 100, 1) if total else 0.0,
            "alcaldia": col2alc.get(c) or "—",
            "de_navegacion": from_signal.get(c, 0), "de_busqueda": from_search.get(c, 0),
            "intencion_pct": round(from_search.get(c, 0) / n * 100) if n else 0,   # % de búsqueda explícita = mayor intento
            "por_recencia": dict(rec),
            "momentum": "calentando" if (rec.get("0-7d", 0) > rec.get("8-30d", 0)) else "estable",
        })
    return {"period": period, "top_colonias": top_colonias,
            "total_senales": total,
            "por_alcaldia": _topn(by_alc, 16, "alcaldia", "demanda"),
            "lectura": "colonias más solicitadas al universo: rollup a alcaldía, recencia, navegación vs búsqueda (intento) y momentum"}


async def financial_demand(db, since_days: int = 180, colonias: Optional[List[str]] = None) -> Dict[str, Any]:
    """EJE FINANCIERO — el bolsillo del comprador: presupuesto, ENGANCHE (recurso propio), CRÉDITO, AÑOS de crédito,
    MENSUALIDAD que puede pagar, intent vivir/invertir, y apetito de retorno (ROI/TIR/cap rate) que explora. + qué
    zonas dan buena rentabilidad. Cruza el cotizador (payment_explore) y la calc de inversión (roi_explore) con el mercado."""
    import statistics
    cutoff = dt.datetime.utcnow() - dt.timedelta(days=since_days)

    def band_precio(p):
        return "0-3M" if p <= 3e6 else "3-5M" if p <= 5e6 else "5-8M" if p <= 8e6 else "8-12M" if p <= 12e6 else "12-20M" if p <= 20e6 else "20M+"

    presupuesto = defaultdict(int); enganche_pct = defaultdict(int); plazo_anos = defaultdict(int)
    mensualidad = []; enganche_montos = []; credito_montos = []
    roi_apetito = defaultdict(int); tir_vals = []; cap_vals = []; vivir = invertir = 0
    # Sub-dimensiones nuevas (principio universo, no ejemplo):
    esquema = defaultdict(int); perfil_fin = defaultdict(int); ltv = defaultdict(int)
    capacidad = []; tipo_credito = defaultdict(int); le_gana_cetes = {"sí": 0, "no": 0}

    # Presupuesto (búsquedas + meta) — filtrado por colonias si se pide (para que finanzas varíe por escala)
    _pq = {"created_at_dt": {"$gte": cutoff}, "precio_max": {"$gt": 0}}
    if colonias:
        _pq["colonias"] = {"$in": list(colonias)}
    async for q in db.marketplace_searches.find(_pq, {"_id": 0, "precio_max": 1}):
        presupuesto[band_precio(q["precio_max"])] += 1
    # Señales financieras (cotizador + ROI + Atlax)
    async for s in db.buyer_signals.find({"created_at_dt": {"$gte": cutoff}, "type": {"$in": ["payment_explore", "roi_explore", "atlax_query", "atlax_profile", "lens"]}},
                                         {"_id": 0, "type": 1, "meta": 1, "value": 1}):
        meta = s.get("meta") or {}
        if meta.get("presupuesto") or meta.get("max_price"):
            try:
                presupuesto[band_precio(float(meta.get("presupuesto") or meta.get("max_price")))] += 1
            except (TypeError, ValueError):
                pass
        # intent
        intent = (meta.get("intent") or "").lower() or (s.get("value") or "").lower()
        if "invert" in intent:
            invertir += 1
        elif "vivir" in intent or "habit" in intent:
            vivir += 1
        # cotizador: enganche / plazo / mensualidad / crédito
        if meta.get("enganche_pct") is not None:
            enganche_pct[f"{int(round(float(meta['enganche_pct'])/5)*5)}%"] += 1
        if meta.get("enganche"):
            try:
                enganche_montos.append(float(meta["enganche"]))
            except (TypeError, ValueError):
                pass
        if meta.get("plazo_anos") or meta.get("plazo"):
            try:
                plazo_anos[f"{int(meta.get('plazo_anos') or (float(meta['plazo'])/12 if float(meta['plazo'])>40 else meta['plazo']))} años"] += 1
            except (TypeError, ValueError):
                pass
        if meta.get("mensualidad"):
            try:
                mensualidad.append(float(meta["mensualidad"]))
            except (TypeError, ValueError):
                pass
        if meta.get("credito"):
            try:
                credito_montos.append(float(meta["credito"]))
            except (TypeError, ValueError):
                pass
        # apetito de retorno (calc de inversión)
        for k, store in (("roi", roi_apetito), ("yield", roi_apetito)):
            if meta.get(k) is not None:
                try:
                    store[f"{int(round(float(meta[k])))}%"] += 1
                except (TypeError, ValueError):
                    pass
        if meta.get("tir") is not None:
            try:
                tir_vals.append(float(meta["tir"]))
            except (TypeError, ValueError):
                pass
        if meta.get("cap_rate") is not None:
            try:
                cap_vals.append(float(meta["cap_rate"]))
            except (TypeError, ValueError):
                pass
        # ── sub-dimensiones nuevas ──
        if meta.get("esquema"):
            esquema[str(meta["esquema"]).lower()] += 1
        ep = meta.get("enganche_pct")
        if ep is not None:
            try:
                ep = float(ep)
                perfil_fin["contado" if ep >= 99 else "crédito (enganche bajo)" if ep < 25 else "mixto (enganche alto)"] += 1
                ltv[f"{int(round((100 - ep) / 10) * 10)}% crédito"] += 1   # loan-to-value
            except (TypeError, ValueError):
                pass
        # capacidad de pago: mensualidad vs presupuesto (stress)
        try:
            mm = float(meta.get("mensualidad") or 0); pp = float(meta.get("presupuesto") or meta.get("precio") or 0)
            if mm and pp:
                capacidad.append(round(mm * 12 * 100 / pp, 1))    # % anual del valor que paga
        except (TypeError, ValueError):
            pass
        for c in _as_feature_list(meta.get("credito_tipo") or meta.get("creditos")):
            tipo_credito[str(c).lower()] += 1
        # apetito vs CETES (¿le gana al banco?)
        try:
            if meta.get("tir") is not None and meta.get("cetes") is not None:
                le_gana_cetes["sí" if float(meta["tir"]) > float(meta["cetes"]) else "no"] += 1
        except (TypeError, ValueError):
            pass

    # intent global (fallback al motor)
    if vivir == 0 and invertir == 0:
        try:
            isp = await intent_split(db, since_days=since_days)
            gl = isp.get("resumen") or isp.get("global", {})
            vivir, invertir = gl.get("vivir", 0), gl.get("invertir", 0)
        except Exception:
            pass

    # rentabilidad por zona (score de inversión)
    rentabilidad = []
    try:
        import score_inversion_engine as sie
        for r in (await sie.top_colonias_by_score(db, limit=12)) or []:
            if not colonias or (r.get("colonia_slug") in colonias):
                rentabilidad.append({"colonia": r.get("colonia_name") or r.get("colonia_slug"),
                                     "score": r.get("score"), "tier": r.get("tier"), "rec": r.get("recommendation")})
    except Exception:
        pass

    med = lambda x: round(statistics.median(x)) if x else None
    return {
        "presupuesto": dict(sorted(presupuesto.items())),
        "intent": {"vivir": vivir, "invertir": invertir},
        "enganche_pct": dict(sorted(enganche_pct.items())),
        "enganche_mediano": med(enganche_montos),
        "credito_mediano": med(credito_montos),
        "plazo_anos": dict(sorted(plazo_anos.items())),
        "mensualidad_mediana": med(mensualidad),
        "mensualidad_n": len(mensualidad),
        "apetito_retorno_pct": dict(sorted(roi_apetito.items())),
        "tir_mediana": med(tir_vals),
        "cap_rate_mediano": round(statistics.median(cap_vals), 1) if cap_vals else None,
        "rentabilidad_por_zona": rentabilidad,
        # sub-dimensiones nuevas (universo, no ejemplo):
        "esquema_preferido": dict(sorted(esquema.items(), key=lambda x: -x[1])),
        "perfil_financiamiento": dict(perfil_fin),                 # contado / crédito / mixto
        "apalancamiento_ltv": dict(sorted(ltv.items())),           # loan-to-value
        "capacidad_pago_pct_anual": med(capacidad),                # % anual del valor que paga
        "tipo_credito": dict(sorted(tipo_credito.items(), key=lambda x: -x[1])),
        "le_gana_a_cetes": le_gana_cetes,
        "cobertura": {"cotizador_con_enganche": len(enganche_montos), "con_mensualidad": len(mensualidad),
                      "con_roi": len(tir_vals) + len(cap_vals)},
        "lectura": "el bolsillo COMPLETO: presupuesto, enganche/crédito/LTV, plazo, mensualidad, capacidad de pago, esquema, "
                   "tipo de crédito, intent, apetito de retorno vs CETES, y rentabilidad por zona",
    }


_PROTO_LABEL = {"a": "tipo A", "b": "tipo B", "c": "tipo C", "ph": "penthouse", "s": "studio",
                "g": "garden", "l1": "loft", "l2": "loft", "loft": "loft", "duplex": "duplex"}


def _m2_band(m2):
    if not m2:
        return None
    return "compacto (<60)" if m2 < 60 else "medio (60-100)" if m2 < 100 else "grande (100-150)" if m2 < 150 else "XL (>150)"


def _piso_band(lvl):
    if lvl is None:
        return None
    return "PB-bajo (1-3)" if lvl <= 3 else "medio (4-10)" if lvl <= 10 else "alto (11-20)" if lvl <= 20 else "muy alto (>20)"


async def attribute_demand(db, since_days: int = 180, colonias: Optional[List[str]] = None) -> Dict[str, Any]:
    """EJE DE ATRIBUTOS DE UNIDAD (universo completo) — cuánta demanda engancha con CADA atributo fino del producto:
    booleanos (balcón/terraza/roof/bodega/pet/estac-indep), vista int/ext, orientación, altura de edificio, m², tipología
    (studio/PH/loft/garden), piso, estacionamiento (cajones + tipo individual/tándem), espacio exterior, amenidades
    específicas (gym/alberca/spa/concierge…), riqueza de amenidades, tamaño de edificio, etapa de entrega, y créditos
    aceptados. Cruza la demanda con los atributos REALES de las unidades/desarrollos que mira."""
    from data_developments import DEVELOPMENTS_BY_ID
    cutoff = dt.datetime.utcnow() - dt.timedelta(days=since_days)
    BOOL_ATTRS = [("balcon", "balcón"), ("terraza", "terraza"), ("roof_garden", "roof garden"),
                  ("bodega", "bodega"), ("pet_friendly", "pet friendly"), ("estacionamiento_independiente", "estac. independiente")]
    booleano = {label: {"si": 0, "total": 0} for _, label in BOOL_ATTRS}
    vista = defaultdict(int); orientacion = defaultdict(int); altura = defaultdict(int)
    amenidades_pedidas = defaultdict(int); banos = defaultdict(int); recamaras = defaultdict(int)
    m2_band = defaultdict(int); tipologia = defaultdict(int); piso = defaultdict(int)
    estac_cajones = defaultdict(int); estac_tipo = defaultdict(int); espacio_ext = {"con terraza/balcón": 0, "sin exterior": 0}
    amen_especificas = defaultdict(int); amen_riqueza = defaultdict(int); tam_edificio = defaultdict(int)
    entrega = defaultdict(int); creditos = defaultdict(int)
    ENG = {"ficha_view", "like", "save", "unit_view", "unit_save", "compare", "intent", "atlax_query", "atlax_profile"}

    async for s in db.buyer_signals.find({"created_at_dt": {"$gte": cutoff}},
                                         {"_id": 0, "type": 1, "entity_id": 1, "meta": 1, "colonia": 1}):
        meta = s.get("meta") or {}
        for a in _as_feature_list(meta.get("amenidades") or meta.get("extras")):
            amenidades_pedidas[a] += 1
        if meta.get("banos"):
            banos[str(meta["banos"])] += 1
        if meta.get("recamaras") or meta.get("beds"):
            recamaras[str(meta.get("recamaras") or meta.get("beds"))] += 1
        if s.get("type") not in ENG:
            continue
        dev = DEVELOPMENTS_BY_ID.get(s.get("entity_id"))
        if not dev or (colonias and dev.get("colonia_id") not in colonias):
            continue
        units = dev.get("units") or []
        if not units:
            continue
        # ── DEV-LEVEL (una vez por enganche) ──
        maxlvl = max((u.get("level") or 0) for u in units)
        altura["bajo (<6 pisos)" if maxlvl < 6 else "medio (6-15)" if maxlvl <= 15 else "alto (>15)"] += 1
        nun = len(units)
        tam_edificio["boutique (<20u)" if nun < 20 else "medio (20-80u)" if nun <= 80 else "torre (>80u)"] += 1
        ams = dev.get("amenities") or dev.get("amenidades") or []
        if isinstance(ams, list):
            na = len(ams)
            amen_riqueza["pocas (<5)" if na < 5 else "medias (5-8)" if na <= 8 else "muchas (>8)"] += 1
            for a in ams:
                amen_especificas[str(a).lower().replace("_", " ")] += 1
        st = str(dev.get("stage") or dev.get("property_type") or "").lower()
        if st:
            entrega["preventa" if "pre" in st else "construcción" if "constr" in st or "obra" in st else "entrega/inmediata" if "entr" in st or "inmed" in st else st] += 1
        for c in _as_feature_list(dev.get("creditos_aceptados")):
            creditos[str(c).lower()] += 1
        for field, label in BOOL_ATTRS:
            booleano[label]["total"] += 1
            if any(u.get(field) for u in units):
                booleano[label]["si"] += 1
        # ── UNIT-LEVEL (set de valores que ofrece el dev) ──
        seen_m2 = set(); seen_tipo = set(); seen_piso = set(); seen_caj = set(); seen_pt = set()
        any_ext = False
        for u in units:
            if u.get("vista"):
                vista[str(u["vista"]).lower()] += 1
            if u.get("orientation"):
                orientacion[str(u["orientation"]).lower()] += 1
            b = _m2_band(u.get("m2_total"))
            if b:
                seen_m2.add(b)
            p = (u.get("prototype") or "").lower()
            if p:
                seen_tipo.add(_PROTO_LABEL.get(p, f"tipo {p.upper()}"))
            pb = _piso_band(u.get("level"))
            if pb:
                seen_piso.add(pb)
            ps = u.get("parking_spots")
            if ps is not None:
                seen_caj.add("0" if ps == 0 else "1" if ps == 1 else "2+")
            if u.get("parking_type"):
                seen_pt.add("tándem" if "bater" in str(u["parking_type"]).lower() or "tand" in str(u["parking_type"]).lower() else "individual")
            if (u.get("m2_terrace") or 0) > 0 or (u.get("m2_balcony") or 0) > 0 or u.get("terraza") or u.get("balcon"):
                any_ext = True
        for b in seen_m2:
            m2_band[b] += 1
        for t in seen_tipo:
            tipologia[t] += 1
        for pp in seen_piso:
            piso[pp] += 1
        for c in seen_caj:
            estac_cajones[c] += 1
        for pt in seen_pt:
            estac_tipo[pt] += 1
        espacio_ext["con terraza/balcón" if any_ext else "sin exterior"] += 1

    def pct(d):
        return [{"atributo": k, "demanda": v["si"], "de": v["total"], "pct": round(100 * v["si"] / v["total"]) if v["total"] else 0}
                for k, v in sorted(d.items(), key=lambda x: -x[1]["si"])]

    def srt(d, lim=20):
        return dict(sorted(d.items(), key=lambda x: -x[1])[:lim])

    return {
        "booleanos": pct(booleano),
        "vista": srt(vista), "orientacion": srt(orientacion), "altura_edificio": dict(altura),
        "m2_band": srt(m2_band), "tipologia": srt(tipologia), "piso": srt(piso),
        "estacionamiento_cajones": dict(sorted(estac_cajones.items())), "estacionamiento_tipo": dict(estac_tipo),
        "espacio_exterior": dict(espacio_ext),
        "amenidades_especificas": [{"amenidad": k, "n": v} for k, v in sorted(amen_especificas.items(), key=lambda x: -x[1])[:18]],
        "amenidades_riqueza": dict(amen_riqueza), "tamano_edificio": dict(tam_edificio),
        "entrega": dict(entrega), "creditos_aceptados": srt(creditos),
        "amenidades_pedidas": [{"amenidad": k, "n": v} for k, v in sorted(amenidades_pedidas.items(), key=lambda x: -x[1])[:15]],
        "banos": dict(sorted(banos.items())), "recamaras": dict(sorted(recamaras.items())),
        "ejes": ["booleanos", "vista", "orientación", "altura edificio", "m²", "tipología", "piso", "estacionamiento",
                 "espacio exterior", "amenidades específicas", "riqueza amenidades", "tamaño edificio", "entrega",
                 "créditos aceptados", "baños", "recámaras"],
        "lectura": "el universo de atributos del producto: 16 ejes de granularidad DENTRO del depa y del edificio",
    }


async def attribute_killer(db, atributo: str, since_days: int = 180) -> Dict[str, Any]:
    """Query asesino de atributo: ¿en qué COLONIAS engancha más la demanda con [atributo]? (balcón en Condesa, etc.)"""
    from data_developments import DEVELOPMENTS_BY_ID
    cutoff = dt.datetime.utcnow() - dt.timedelta(days=since_days)
    a = atributo.lower().strip()
    field_map = {"balcón": "balcon", "balcon": "balcon", "terraza": "terraza", "roof garden": "roof_garden",
                 "roof_garden": "roof_garden", "bodega": "bodega", "pet friendly": "pet_friendly", "pet_friendly": "pet_friendly"}
    field = field_map.get(a)
    now = dt.datetime.utcnow()
    by_col = defaultdict(int); by_alc = defaultdict(int); recency = defaultdict(int)
    by_segment = defaultdict(int); by_period = defaultdict(int); col2alc = {}
    total = 0
    async for s in db.buyer_signals.find({"created_at_dt": {"$gte": cutoff}, "type": {"$in": ["ficha_view", "like", "save", "unit_view", "compare"]}},
                                         {"_id": 0, "entity_id": 1, "colonia": 1, "created_at_dt": 1, "meta": 1, "type": 1}):
        dev = DEVELOPMENTS_BY_ID.get(s.get("entity_id"))
        if not dev:
            continue
        units = dev.get("units") or []
        match = False
        if field:
            match = any(u.get(field) for u in units)
        else:
            match = any(a in str(u.get("vista", "")).lower() or a in str(u.get("orientation", "")).lower() for u in units)
        if match:
            col = s.get("colonia") or dev.get("colonia_id")
            by_col[col] += 1; total += 1
            col2alc[col] = dev.get("alcaldia")
            by_alc[dev.get("alcaldia") or "—"] += 1
            recency[_time_band(s.get("created_at_dt"), now)] += 1
            by_segment[_signal_segment(s)] += 1
            by_period[bucket(s.get("created_at_dt"), "month")] += 1
    ranked = sorted(by_col.items(), key=lambda x: -x[1])[:15]
    return {"atributo": atributo, "total": total,
            "por_colonia": [{"colonia": c, "demanda": n, "share_pct": round(n / total * 100, 1) if total else 0.0,
                             "alcaldia": col2alc.get(c) or "—"} for c, n in ranked],
            "por_alcaldia": _topn(by_alc, 16, "alcaldia", "demanda"),
            "por_recencia": dict(recency), "por_segmento": dict(by_segment),
            "serie": dict(sorted(by_period.items())),
            "lectura": f"dónde la demanda engancha más con '{atributo}' (colonia/alcaldía/recencia/segmento/serie)"}


async def demand_by_attribute(db, since_days: int = 365) -> Dict[str, Any]:
    """Atributos EXPLÍCITOS buscados (recámaras / m² / precio / estacionamiento) — demanda dura de las búsquedas."""
    now = dt.datetime.utcnow()
    cutoff = now - dt.timedelta(days=since_days)
    rec = defaultdict(int); price_bands = defaultdict(int); parking = defaultdict(int)
    banos = defaultdict(int); m2 = defaultdict(int); uso = defaultdict(int); tipo = defaultdict(int)
    esquema = defaultdict(int); mensualidad = defaultdict(int); enganche = defaultdict(int)
    recency = defaultdict(int)
    rec_x_price = defaultdict(int)   # recámaras × precio (cruce que vende: "2 rec en 3-8M")
    n = 0
    async for s in db.marketplace_searches.find({"created_at_dt": {"$gte": cutoff}},
                                                {"_id": 0, "recamaras_min": 1, "precio_max": 1, "estacionamientos_min": 1,
                                                 "banos_min": 1, "m2_min": 1, "uso": 1, "tipo_pedido": 1, "esquema_pedido": 1,
                                                 "mensualidad_max": 1, "enganche_max": 1, "created_at_dt": 1}):
        n += 1
        recency[_time_band(s.get("created_at_dt"), now)] += 1
        rb = f"{s['recamaras_min']}+ rec" if s.get("recamaras_min") else None
        if rb:
            rec[rb] += 1
        pm = s.get("precio_max")
        pband = _price_band(pm)
        if pband:
            price_bands[pband] += 1
        if rb and pband:
            rec_x_price[f"{rb} · {pband}"] += 1
        if s.get("estacionamientos_min"):
            parking[f"{s['estacionamientos_min']}+ estac"] += 1
        if s.get("banos_min"):
            banos[f"{s['banos_min']}+ baños"] += 1
        mm = s.get("m2_min")
        if mm:
            m2[_m2_band(mm)] += 1
        if s.get("uso"):
            uso[str(s["uso"]).lower().strip()] += 1
        if s.get("tipo_pedido"):
            tipo[str(s["tipo_pedido"]).lower().strip()] += 1
        if s.get("esquema_pedido"):
            esquema[str(s["esquema_pedido"]).lower().strip()] += 1
        ms = s.get("mensualidad_max")
        if ms:
            mensualidad["<20k" if ms <= 20000 else "20-40k" if ms <= 40000 else "40-80k" if ms <= 80000 else "80k+"] += 1
        eg = s.get("enganche_max")
        if eg:
            enganche["<500k" if eg <= 5e5 else "500k-1.5M" if eg <= 1.5e6 else "1.5-3M" if eg <= 3e6 else "3M+"] += 1
    return {"busquedas": n, "recamaras": dict(sorted(rec.items())),
            "bandas_precio": dict(sorted(price_bands.items())), "estacionamiento": dict(sorted(parking.items())),
            "banos": dict(sorted(banos.items())), "m2": dict(sorted(m2.items())),
            "uso_intent": dict(sorted(uso.items(), key=lambda x: -x[1])),
            "tipo_propiedad": dict(sorted(tipo.items(), key=lambda x: -x[1])),
            "esquema_pago": dict(sorted(esquema.items(), key=lambda x: -x[1])),
            "mensualidad_buscada": dict(sorted(mensualidad.items())),
            "enganche_disponible": dict(sorted(enganche.items())),
            "recamaras_x_precio": _topn(rec_x_price, 12, "combo", "n"),
            "por_recencia": dict(recency),
            "lectura": "atributos duros buscados al universo: + m²/baños/uso/tipo/esquema/mensualidad/enganche + cruce recámaras×precio"}


async def what_to_build(db, colonia: Optional[str] = None, colonias: Optional[List[str]] = None,
                        since_days: int = 365) -> Dict[str, Any]:
    """QUÉ CONSTRUIR: demanda por feature vs OFERTA (unidades que existen con ese feature) → brecha = oportunidad.
    colonias (lista) = scope del dev a SUS colonias."""
    from data_developments import DEVELOPMENTS
    scope = set(colonias or ([colonia] if colonia else []))
    dem = await demand_by_feature(db, colonia=colonia, colonias=colonias, since_days=since_days, top=50)
    feat_rows = {f["feature"]: f for f in dem["top_features"]}
    demand = {f: row["demanda"] for f, row in feat_rows.items()}
    supply = defaultdict(int)
    supply_by_col = defaultdict(lambda: defaultdict(int))   # feature -> colonia -> unidades en oferta
    supply_devs = defaultdict(int)                          # feature -> # desarrollos que lo ofrecen
    for dev in DEVELOPMENTS:
        if scope and (dev.get("colonia_id") not in scope):
            continue
        feats = _dev_features(dev)
        n_units = len(dev.get("units") or []) or 1
        cid = dev.get("colonia_id")
        for f in feats:
            supply[f] += n_units
            supply_devs[f] += 1
            if cid:
                supply_by_col[f][cid] += 1
    gaps = []
    for f, d in demand.items():
        s = supply.get(f, 0)
        ratio = d / max(s, 1)
        row = feat_rows.get(f, {})
        recency = row.get("por_recencia") or {}
        fresco = recency.get("0-7d", 0) + recency.get("8-30d", 0)
        seg = row.get("por_segmento") or {}
        nivel = "constrúyelo" if ratio >= 1.0 else "considéralo" if ratio >= 0.5 else "cubierto"
        gaps.append({
            "feature": f, "demanda": d, "oferta_unidades": s, "presion": round(ratio, 2),
            "desarrollos_que_lo_ofrecen": supply_devs.get(f, 0),
            "demanda_fresca_30d": fresco,
            "momentum": row.get("momentum", "estable"),
            "segmento_dominante": (max(seg.items(), key=lambda x: x[1])[0] if seg else None),
            "colonias_demanda": row.get("por_colonia", [])[:5],
            "colonias_oferta": _topn(supply_by_col[f], 5, "colonia", "devs"),
            "nivel": nivel,
        })
    gaps.sort(key=lambda x: -x["presion"])
    resumen = Counter(g["nivel"] for g in gaps)
    return {"colonia": colonia or (",".join(colonias) if colonias else "todas"), "oportunidades": gaps[:15],
            "oportunidades_completas": gaps,
            "resumen_niveles": dict(resumen),
            "constru_ya": [g["feature"] for g in gaps if g["nivel"] == "constrúyelo"][:8],
            "lectura": "presion alta = mucha demanda, poca oferta → construir esto (+ dónde está la demanda vs la oferta, frescura y segmento)"}


async def engagement_by_content(db, since_days: int = 365, top: int = 20) -> Dict[str, Any]:
    """RESUCITA señales que se capturaban y morían: section_time/section_view/module_open → qué CONTENIDO de la ficha
    engancha al comprador (secciones, módulos, tiempo). Le dice al dev qué destacar y al superadmin qué le importa al mercado."""
    now = dt.datetime.utcnow()
    cutoff = now - dt.timedelta(days=since_days)
    sec_time = defaultdict(float); sec_views = defaultdict(int); mod_open = defaultdict(int)
    sec_dwell_n = defaultdict(int)                         # # de eventos section_time (para promedio)
    recency = defaultdict(int); by_segment = defaultdict(int); by_device = defaultdict(int)
    n = 0
    async for s in db.buyer_signals.find(
            {"created_at_dt": {"$gte": cutoff}, "type": {"$in": ["section_time", "section_view", "module_open"]}},
            {"_id": 0, "type": 1, "value": 1, "seconds": 1, "meta": 1, "created_at_dt": 1, "device": 1, "channel": 1}):
        n += 1
        recency[_time_band(s.get("created_at_dt"), now)] += 1
        by_segment[_signal_segment(s)] += 1
        by_device[_device_of(s)] += 1
        v = (s.get("value") or "").strip().lower()
        if not v:
            continue
        if s["type"] == "section_time":
            secs = s.get("seconds") or (s.get("meta") or {}).get("seconds") or 0
            sec_time[v] += float(secs or 0)
            sec_dwell_n[v] += 1
        elif s["type"] == "section_view":
            sec_views[v] += 1
        else:
            mod_open[v] += 1
    return {
        "señales_de_contenido": n,
        "secciones_por_tiempo": [{"seccion": k, "segundos_total": round(t),
                                  "segundos_promedio": round(t / max(sec_dwell_n[k], 1), 1)}
                                 for k, t in sorted(sec_time.items(), key=lambda x: -x[1])[:top]],
        "secciones_por_vistas": [{"seccion": k, "vistas": v,
                                  "engagement_pct": round(min(sec_dwell_n.get(k, 0) / v, 1) * 100) if v else 0}
                                 for k, v in sorted(sec_views.items(), key=lambda x: -x[1])[:top]],
        "modulos_abiertos": [{"modulo": k, "aperturas": v} for k, v in sorted(mod_open.items(), key=lambda x: -x[1])[:top]],
        "por_recencia": dict(recency), "por_segmento": dict(by_segment), "por_dispositivo": dict(by_device),
        "seccion_estrella": (max(sec_time.items(), key=lambda x: x[1])[0] if sec_time else None),
        "lectura": "qué contenido de la ficha engancha al universo: segundos promedio por sección, recencia, vivir/invertir, dispositivo",
    }


async def unmet_demand(db, colonias: Optional[List[str]] = None, since_days: int = 365, top: int = 20) -> Dict[str, Any]:
    """DEMANDA NO SATISFECHA — lo que la gente BUSCA y casi no encuentra (unmet=True o results_count<=2). La señal más
    pura de 'qué construir que NO existe'. Por colonia × recámaras × precio."""
    now = dt.datetime.utcnow()
    cutoff = now - dt.timedelta(days=since_days)
    q = {"created_at_dt": {"$gte": cutoff}, "$or": [{"unmet": True}, {"results_count": {"$lte": 2}}]}
    if colonias:
        q["colonias"] = {"$in": colonias}
    by_col = defaultdict(int); by_rec = defaultdict(int); by_price = defaultdict(int); n = 0
    by_m2 = defaultdict(int); by_uso = defaultdict(int); by_esquema = defaultdict(int)
    recency = defaultdict(int); series = defaultdict(int); col_x_price = defaultdict(int)
    zona_no_disp = defaultdict(int); gap_mens = 0; total_unmet_pure = 0
    async for s in db.marketplace_searches.find(q, {"_id": 0, "colonias": 1, "recamaras_min": 1, "precio_max": 1,
                                                    "m2_min": 1, "uso": 1, "esquema_pedido": 1, "created_at_dt": 1,
                                                    "unmet": 1, "zona_no_disponible": 1, "gap_mensualidad": 1}):
        n += 1
        if s.get("unmet"):
            total_unmet_pure += 1
        if s.get("gap_mensualidad"):
            gap_mens += 1
        recency[_time_band(s.get("created_at_dt"), now)] += 1
        series[bucket(s.get("created_at_dt"), "month")] += 1
        pband = _price_band(s.get("precio_max"))
        for c in (s.get("colonias") or []):
            if colonias and c not in colonias:
                continue
            by_col[c] += 1
            if pband:
                col_x_price[f"{c} · {pband}"] += 1
        if s.get("zona_no_disponible"):
            zona_no_disp[str(s["zona_no_disponible"]).lower().strip()] += 1
        if s.get("recamaras_min"):
            by_rec[f"{s['recamaras_min']}+ rec"] += 1
        if pband:
            by_price[pband] += 1
        if s.get("m2_min"):
            by_m2[_m2_band(s["m2_min"])] += 1
        if s.get("uso"):
            by_uso[str(s["uso"]).lower().strip()] += 1
        if s.get("esquema_pedido"):
            by_esquema[str(s["esquema_pedido"]).lower().strip()] += 1
    return {"busquedas_insatisfechas": n,
            "unmet_puro": total_unmet_pure,
            "por_colonia": [{"colonia": c, "n": v} for c, v in sorted(by_col.items(), key=lambda x: -x[1])[:top]],
            "por_recamaras": dict(sorted(by_rec.items())), "por_precio": dict(sorted(by_price.items())),
            "por_m2": dict(sorted(by_m2.items())), "por_uso": dict(sorted(by_uso.items(), key=lambda x: -x[1])),
            "por_esquema": dict(sorted(by_esquema.items(), key=lambda x: -x[1])),
            "colonia_x_precio": _topn(col_x_price, top, "combo", "n"),
            "zonas_sin_oferta": _topn(zona_no_disp, top, "zona", "n"),
            "por_recencia": dict(recency), "serie": dict(sorted(series.items())),
            "brecha_mensualidad": gap_mens,
            "lectura": "demanda no satisfecha al universo: + m²/uso/esquema, cruce colonia×precio, zonas sin oferta y brecha de mensualidad"}


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


async def _window_colonia_demand(db, start, end, colonias=None) -> Dict[str, int]:
    """Demanda total por colonia en una ventana (para tendencia ESPACIAL, no solo de feature)."""
    q = {"created_at_dt": {"$gte": start, "$lt": end}, "type": {"$in": _ENGAGE}, "colonia": {"$nin": [None, ""]}}
    if colonias:
        q["colonia"] = {"$in": colonias}
    counts = defaultdict(int)
    async for s in db.buyer_signals.find(q, {"_id": 0, "colonia": 1}):
        counts[s["colonia"]] += 1
    return dict(counts)


async def trend_alerts(db, window_days: int = 30, colonias: Optional[List[str]] = None, min_recent: int = 3) -> Dict[str, Any]:
    """TENDENCIA/ANOMALÍA — demanda por feature en la ventana reciente vs la anterior → qué SUBE rápido ('terraza 3x este
    mes'). El sensor de 'el mercado está cambiando, muévete'."""
    from data_developments import DEVELOPMENTS_BY_ID
    now = dt.datetime.utcnow()
    b1 = now - dt.timedelta(days=window_days)          # frontera reciente/anterior
    b2 = now - dt.timedelta(days=2 * window_days)      # frontera anterior/anterior_2
    b3 = now - dt.timedelta(days=3 * window_days)      # inicio del rango total
    # UNA sola lectura del rango completo, particionando las 3 ventanas de feature y las 2 de colonia en Python
    # (antes: 5 full-scans independientes). Mismas fronteras $gte/$lt y misma atribución → output idéntico.
    q = {"created_at_dt": {"$gte": b3, "$lt": now}, "type": {"$in": _ENGAGE}}
    if colonias:
        q["colonia"] = {"$in": colonias}
    fwin = [defaultdict(int), defaultdict(int), defaultdict(int)]   # feature: reciente / anterior / anterior_2
    cwin = [defaultdict(int), defaultdict(int)]                     # colonia: reciente / anterior
    async for s in db.buyer_signals.find(q, {"_id": 0, "entity_id": 1, "colonia": 1, "unit_number": 1,
                                             "meta": 1, "type": 1, "value": 1, "created_at_dt": 1}):
        t = s["created_at_dt"]
        w = 0 if t >= b1 else 1 if t >= b2 else 2
        feats, col, _ = _attribute(s, DEVELOPMENTS_BY_ID.get(s.get("entity_id")))
        if feats and col:
            for f in feats:
                fwin[w][f] += 1
        c = s.get("colonia")
        if w < 2 and c:   # demanda espacial solo usa reciente/anterior (mismo $nin [None, ""] de antes)
            cwin[w][c] += 1
    recent, prior, older = dict(fwin[0]), dict(fwin[1]), dict(fwin[2])
    alerts = []; subiendo = bajando = 0
    for f, rc in recent.items():
        if rc < min_recent:
            continue
        pc = prior.get(f, 0)
        oc = older.get(f, 0)
        # aceleración: la tasa reciente vs la anterior está creciendo aún más rápido (2da derivada).
        acelera = (rc - pc) > (pc - oc) and rc > pc
        # anterior=0 → NO inventamos % (sería 'subió 3600%' engañoso). Es 'nuevo' en la ventana reciente.
        if pc == 0:
            subiendo += 1
            alerts.append({"feature": f, "reciente": rc, "anterior": 0, "anterior_2": oc, "crecimiento_pct": None,
                           "nuevo": True, "x": None, "acelerando": True, "direccion": "sube"})
        else:
            growth = round((rc - pc) / pc * 100)
            if growth > 0:
                subiendo += 1
            elif growth < 0:
                bajando += 1
            alerts.append({"feature": f, "reciente": rc, "anterior": pc, "anterior_2": oc, "crecimiento_pct": growth,
                           "nuevo": False, "x": round(rc / pc, 1), "acelerando": acelera,
                           "direccion": "sube" if growth > 0 else "baja" if growth < 0 else "plano"})
    alerts.sort(key=lambda x: -(x["crecimiento_pct"] if x["crecimiento_pct"] is not None else (10 ** 6 + x["reciente"])))
    # tendencia ESPACIAL: qué colonias se calientan/enfrían (ya particionado en la misma lectura)
    c_recent = dict(cwin[0])
    c_prior = dict(cwin[1])
    col_trends = []
    for c, rc in c_recent.items():
        if rc < min_recent:
            continue
        pc = c_prior.get(c, 0)
        col_trends.append({"colonia": c, "reciente": rc, "anterior": pc, "nuevo": pc == 0,
                           "crecimiento_pct": (None if pc == 0 else round((rc - pc) / pc * 100))})
    col_trends.sort(key=lambda x: -(x["crecimiento_pct"] if x["crecimiento_pct"] is not None else 10 ** 6))
    return {"ventana_dias": window_days, "tendencias": alerts[:15],
            "tendencias_colonia": col_trends[:12],
            "acelerando": [a["feature"] for a in alerts if a.get("acelerando")][:8],
            "resumen": {"subiendo": subiendo, "bajando": bajando, "features_en_movimiento": len(alerts)},
            "lectura": "feature creciendo rápido + poca oferta = constrúyelo YA (+ qué acelera y qué colonias se calientan)"}


_CONV_FEATURES = ("terraza", "balcón", "balcon", "roof", "gym", "alberca", "jardín", "jardin", "vista", "bodega",
                  "estacionamiento", "pet", "mascota", "amueblado", "sky", "spa", "jacuzzi", "cava", "seguridad", "elevador")
_CONV_CONCERNS = {"precio": "precio", "caro": "precio", "presupuesto": "precio", "crédito": "crédito", "credito": "crédito",
                  "enganche": "enganche", "mensualidad": "mensualidad", "escritura": "escritura", "entrega": "entrega",
                  "plusvalía": "plusvalía", "plusvalia": "plusvalía", "ruido": "ruido", "mantenimiento": "mantenimiento"}


async def conversation_intel(db, since_days: int = 365, top: int = 15) -> Dict[str, Any]:
    """Analiza la conversación con Atlax TURNO POR TURNO (asistente_messages role=user) → qué FEATURES, COLONIAS y
    OBJECIONES aparecen en el ida-y-vuelta, más allá de la query inicial. Cierra el gap 'conversación no analizada'."""
    from data_developments import DEVELOPMENTS
    cutoff_dt = dt.datetime.utcnow() - dt.timedelta(days=since_days)
    cutoff = cutoff_dt.isoformat()
    known = {d.get("colonia_id"): (d.get("colonia") or "") for d in DEVELOPMENTS if d.get("colonia_id")}
    feats = defaultdict(int); concerns = defaultdict(int); cols = defaultdict(int)
    feat_x_concern = defaultdict(int)        # co-ocurrencia feature+objeción en un mismo turno
    feat_x_col = defaultdict(int)            # feature mencionada junto a colonia
    by_segment = defaultdict(int)            # vivir/invertir inferido del texto
    long_q = 0                               # mensajes "ricos" (>12 palabras) = más intención
    n = 0
    # filtro de fecha EN la query (usa índice role+created_at); $or cubre datetime nativo e ISO-string legado
    async for m in db.asistente_messages.find(
            {"role": "user", "$or": [{"created_at": {"$gte": cutoff_dt}}, {"created_at": {"$gte": cutoff}}]},
            {"_id": 0, "content": 1, "created_at": 1}):
        if str(m.get("created_at") or "") < cutoff:   # cinturón: mismo guard de siempre
            continue
        txt = (m.get("content") or "").lower()
        if not txt:
            continue
        n += 1
        if len(txt.split()) > 12:
            long_q += 1
        seg = _normalize_intent(txt)
        if seg:
            bucket_seg = "invertir" if seg.startswith("invertir") or seg == "flip" else "vivir"
            by_segment[bucket_seg] += 1
        msg_feats = []; msg_concerns = []; msg_cols = []
        for f in _CONV_FEATURES:
            if f in txt:
                key = f.replace("balcón", "balcon").replace("jardín", "jardin")
                feats[key] += 1
                msg_feats.append(key)
        for k, label in _CONV_CONCERNS.items():
            if k in txt:
                concerns[label] += 1
                msg_concerns.append(label)
        for cid, cname in known.items():
            if (cid.replace("-", " ") in txt) or (cname and cname.lower() in txt):
                cols[cid] += 1
                msg_cols.append(cid)
        for f in set(msg_feats):
            for cc in set(msg_concerns):
                feat_x_concern[f"{f} ⨯ {cc}"] += 1
            for c in set(msg_cols):
                feat_x_col[f"{f} en {c}"] += 1
    _rank = lambda d: [{"k": k, "n": v} for k, v in sorted(d.items(), key=lambda x: -x[1])[:top]]
    return {"mensajes_analizados": n, "features_mencionados": _rank(feats), "objeciones": _rank(concerns),
            "colonias_mencionadas": _rank(cols),
            "feature_x_objecion": _topn(feat_x_concern, top, "combo", "n"),
            "feature_x_colonia": _topn(feat_x_col, top, "combo", "n"),
            "por_segmento": dict(by_segment),
            "mensajes_ricos": long_q,
            "intencion_pct": round(long_q / n * 100) if n else 0,
            "lectura": "lo que el comprador realmente DICE en Atlax al universo: co-ocurrencias feature×objeción y feature×colonia, vivir/invertir e intención"}


async def demand_by_geo(db, since_days: int = 365, top: int = 15) -> Dict[str, Any]:
    """Demanda al GEO MÁS FINO posible: CALLE → CP(≈manzana) → COLONIA → ALCALDÍA → CIUDAD. La calle/CP vienen del dev
    (la unidad hereda su dirección). Cierra el gap sub-colonia: 'cuántos exploran propiedades en Moliere 245 / CP 11570'."""
    from data_developments import DEVELOPMENTS_BY_ID
    now = dt.datetime.utcnow()
    cutoff = now - dt.timedelta(days=since_days)
    levels = {"calle": "street", "cp": "postal_code", "colonia": "colonia_id", "alcaldia": "alcaldia", "ciudad": "city"}
    agg = {lvl: defaultdict(int) for lvl in levels}
    recency = {lvl: defaultdict(lambda: defaultdict(int)) for lvl in levels}   # nivel -> geo -> banda recencia
    segment = {lvl: defaultdict(lambda: defaultdict(int)) for lvl in levels}   # nivel -> geo -> vivir/invertir
    direccion = defaultdict(int)            # dirección exacta (calle+CP) = el punto más fino
    total = 0
    async for s in db.buyer_signals.find(
            {"created_at_dt": {"$gte": cutoff}, "type": {"$in": _ENGAGE}, "entity_id": {"$nin": [None, ""]}},
            {"_id": 0, "entity_id": 1, "created_at_dt": 1, "meta": 1, "type": 1}):
        dev = DEVELOPMENTS_BY_ID.get(s.get("entity_id"))
        if not dev:
            continue
        total += 1
        rb = _time_band(s.get("created_at_dt"), now)
        seg = _signal_segment(s)
        for lvl, field in levels.items():
            v = dev.get(field) or ("CDMX" if lvl == "ciudad" else None)
            if v:
                agg[lvl][str(v)] += 1
                recency[lvl][str(v)][rb] += 1
                segment[lvl][str(v)][seg] += 1
        st, cp = dev.get("street"), dev.get("postal_code")
        if st or cp:
            direccion[f"{st or '—'} · CP {cp or '—'}"] += 1
    out = {lvl: [{"geo": g, "demanda": n, "share_pct": round(n / total * 100, 1) if total else 0.0,
                  "por_recencia": dict(recency[lvl][g]), "por_segmento": dict(segment[lvl][g])}
                 for g, n in sorted(d.items(), key=lambda x: -x[1])[:top]]
           for lvl, d in agg.items()}
    out["total_senales"] = total
    out["direccion_exacta"] = _topn(direccion, top, "direccion", "demanda")
    out["lectura"] = "demanda al geo más fino del universo: calle→CP→colonia→alcaldía→ciudad + dirección exacta, recencia y vivir/invertir por nivel"
    return out


async def financial_intent(db, colonias: Optional[List[str]] = None, since_days: int = 365) -> Dict[str, Any]:
    """INTENCIÓN FINANCIERA (antes invisible) — cuántos exploran PAGO (qué enganche/mensualidad/esquema) y RENTABILIDAD
    (qué ROI). Señal de ALTO intento. Que payment_explore/roi_explore no queden capturados-y-muertos."""
    now = dt.datetime.utcnow()
    cutoff = now - dt.timedelta(days=since_days)
    q = {"created_at_dt": {"$gte": cutoff}}
    if colonias:
        q["colonia"] = {"$in": colonias}
    pay = roi = 0
    enganches = []; tirs = []; esquemas = defaultdict(int)
    eng_band = defaultdict(int); tir_band = defaultdict(int)     # distribución, no solo promedio
    mens_band = defaultdict(int); mens_vals = []
    by_col = defaultdict(lambda: {"pago": 0, "roi": 0}); recency = defaultdict(int)
    async for s in db.buyer_signals.find({**q, "type": {"$in": ["payment_explore", "roi_explore"]}},
                                         {"_id": 0, "type": 1, "meta": 1, "colonia": 1, "created_at_dt": 1}):
        meta = s.get("meta") or {}
        col = s.get("colonia")
        recency[_time_band(s.get("created_at_dt"), now)] += 1
        if s["type"] == "payment_explore":
            pay += 1
            if col:
                by_col[col]["pago"] += 1
            ep = meta.get("enganche_pct")
            if isinstance(ep, (int, float)):
                enganches.append(ep)
                eng_band["<10%" if ep < 10 else "10-20%" if ep < 20 else "20-30%" if ep < 30 else "30%+"] += 1
            mp = meta.get("mensualidad") or meta.get("mensualidad_max")
            if isinstance(mp, (int, float)) and mp > 0:
                mens_vals.append(mp)
                mens_band["<20k" if mp <= 20000 else "20-40k" if mp <= 40000 else "40-80k" if mp <= 80000 else "80k+"] += 1
            if meta.get("esquema"):
                esquemas[str(meta["esquema"])] += 1
        else:
            roi += 1
            if col:
                by_col[col]["roi"] += 1
            tp = meta.get("tir_pct")
            if isinstance(tp, (int, float)):
                tirs.append(tp)
                tir_band["<8%" if tp < 8 else "8-12%" if tp < 12 else "12-18%" if tp < 18 else "18%+"] += 1
    total = pay + roi
    col_rows = sorted(by_col.items(), key=lambda x: -(x[1]["pago"] + x[1]["roi"]))[:10]
    return {"exploraron_pago": pay, "exploraron_roi": roi,
            "enganche_promedio_pct": round(sum(enganches) / len(enganches), 1) if enganches else None,
            "tir_buscado_promedio_pct": round(sum(tirs) / len(tirs), 1) if tirs else None,
            "esquemas_preferidos": dict(sorted(esquemas.items(), key=lambda x: -x[1])[:5]),
            "distribucion_enganche": dict(sorted(eng_band.items())),
            "distribucion_tir": dict(sorted(tir_band.items())),
            "distribucion_mensualidad": dict(sorted(mens_band.items())),
            "mensualidad_promedio": round(sum(mens_vals) / len(mens_vals)) if mens_vals else None,
            "por_colonia": [{"colonia": c, "pago": v["pago"], "roi": v["roi"], "total": v["pago"] + v["roi"]} for c, v in col_rows],
            "por_recencia": dict(recency),
            "split_vivir_invertir": {"vivir_pago": pay, "invertir_roi": roi,
                                     "pct_inversionista": round(roi / total * 100) if total else 0},
            "lectura": "alto intento de compra — están corriendo números (+ distribución de enganche/TIR/mensualidad, por colonia y split vivir/invertir)"}


async def demand_alerts(db, colonias: Optional[List[str]] = None, since_days: int = 90, top: int = 5) -> Dict[str, Any]:
    """JUGADAS PROACTIVAS de demanda — combina presión (demanda vs oferta) + tendencia (qué sube) + no-satisfecho →
    '¿qué construir YA?'. Lo proactivo: el dev/superadmin lo ve de un vistazo, sin escarbar la tabla."""
    wtb = await what_to_build(db, colonias=colonias, since_days=since_days)
    trends = await trend_alerts(db, colonias=colonias)
    unmet = await unmet_demand(db, colonias=colonias, since_days=since_days)
    trend_map = {t["feature"]: t for t in trends.get("tendencias", [])}
    acelera_set = set(trends.get("acelerando", []))
    jugadas = []
    for o in wtb.get("oportunidades", []):
        if o["presion"] < 0.5 and o["demanda"] < 5:
            continue
        t = trend_map.get(o["feature"])
        sube = (t or {}).get("crecimiento_pct")
        nuevo = bool((t or {}).get("nuevo"))
        acelera = o["feature"] in acelera_set
        urgencia = round(o["presion"] + (1.0 if ((sube and sube > 50) or nuevo) else 0.0) + (0.5 if acelera else 0.0), 2)
        msg = f"{o['feature']}: {o['demanda']} lo buscan vs {o['oferta_unidades']} unidades en oferta (presión ×{o['presion']})"
        if nuevo:
            msg += " · nuevo en demanda reciente"
        elif sube and sube > 0:
            msg += f" · subiendo {sube:+d}%"
        if acelera:
            msg += " · acelerando"
        col_demanda = o.get("colonias_demanda") or []
        jugadas.append({"feature": o["feature"], "mensaje": msg, "presion": o["presion"], "tendencia_pct": sube,
                        "nuevo": nuevo, "acelerando": acelera, "urgencia": urgencia,
                        "demanda": o["demanda"], "oferta_unidades": o["oferta_unidades"],
                        "demanda_fresca_30d": o.get("demanda_fresca_30d", 0),
                        "segmento": o.get("segmento_dominante"),
                        "donde_construir": [c.get("colonia") for c in col_demanda[:3]],
                        "accion": "construir" if o["presion"] >= 0.7 else "considerar"})
    jugadas.sort(key=lambda x: -x["urgencia"])
    n_construir = sum(1 for j in jugadas if j["accion"] == "construir")
    return {"jugadas": jugadas[:top], "busquedas_no_satisfechas": unmet.get("busquedas_insatisfechas", 0),
            "todas_las_jugadas": jugadas,
            "colonias_sin_oferta": unmet.get("zonas_sin_oferta", [])[:5],
            "resumen": {"jugadas_construir": n_construir, "jugadas_considerar": len(jugadas) - n_construir,
                        "colonias_calientes": [c.get("colonia") for c in trends.get("tendencias_colonia", [])[:3]]},
            "lectura": "ordenado por urgencia (presión + tendencia + aceleración) — construye lo de arriba, en las colonias indicadas"}


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
    now = dt.datetime.utcnow()
    cutoff = now - dt.timedelta(days=since_days)
    counts = defaultdict(int); cols = defaultdict(int)
    devs = defaultdict(int); types = defaultdict(int); segments = defaultdict(int)
    recency = defaultdict(int); total = 0; calor = 0.0; last = None
    async for s in db.buyer_signals.find(
            {"visitor_id": visitor_id, "created_at_dt": {"$gte": cutoff}, "type": {"$in": _ENGAGE}},
            {"_id": 0, "entity_id": 1, "colonia": 1, "unit_number": 1, "meta": 1, "type": 1, "value": 1, "created_at_dt": 1}):
        total += 1
        types[s.get("type")] += 1
        calor += _PROP_WEIGHT.get(s.get("type"), 0.5)
        recency[_time_band(s.get("created_at_dt"), now)] += 1
        segments[_signal_segment(s)] += 1
        t = s.get("created_at_dt")
        if isinstance(t, dt.datetime) and (last is None or t > last):
            last = t
        if s.get("entity_id"):
            devs[s["entity_id"]] += 1
        feats, col, _ = _attribute(s, DEVELOPMENTS_BY_ID.get(s.get("entity_id")))
        for f in (feats or []):
            counts[f] += 1
        if col:
            cols[col] += 1
    seg_dom = max(segments.items(), key=lambda x: x[1])[0] if segments else "desconocido"
    return {"features": [{"feature": f, "n": n} for f, n in sorted(counts.items(), key=lambda x: -x[1])[:top]],
            "colonias": [{"colonia": c, "n": n} for c, n in sorted(cols.items(), key=lambda x: -x[1])[:5]],
            "total_senales": total, "calor": round(calor, 1),
            "tipos_senal": _topn(types, 8, "tipo", "n"),
            "desarrollos_vistos": _topn(devs, 5, "dev", "n"),
            "por_recencia": dict(recency),
            "segmento": seg_dom, "por_segmento": dict(segments),
            "ultima_actividad": last.isoformat() if last else None,
            "estado": "activo" if (recency.get("0-7d", 0) + recency.get("8-30d", 0)) > 0 else "frío",
            "lectura": "lo que enganchó el lead al universo: + tipos de señal, desarrollos vistos, calor, recencia y vivir/invertir"}


async def recommend_for_lead(db, visitor_id: str) -> Dict[str, Any]:
    """Para el ASESOR: dado el gusto REAL del lead (sus features/colonias enganchadas), qué UNIDADES ofrecerle."""
    from data_developments import DEVELOPMENTS
    eng = await lead_engaged_features(db, visitor_id)
    want_f = {x["feature"] for x in eng["features"]}
    want_c = {x["colonia"] for x in eng["colonias"]}
    segmento = eng.get("segmento", "desconocido")
    calor = eng.get("calor", 0)
    if not want_f and not want_c:
        return {"features": [], "colonias": [], "unidades": [], "recomendaciones": [],
                "segmento": segmento, "calor": calor,
                "lectura": "El lead aún no tiene señales — sin recomendación granular."}
    # peso por intensidad: features más vistas pesan más en el score (no solo presencia)
    f_weight = {x["feature"]: x["n"] for x in eng["features"]}
    matches = []
    for dev in DEVELOPMENTS:
        dfeats = _dev_features(dev)
        inter = dfeats & want_f
        en_colonia = dev.get("colonia_id") in want_c
        score = len(inter) + (2 if en_colonia else 0)
        if score > 0:
            score_pond = sum(f_weight.get(f, 1) for f in inter) + (3 if en_colonia else 0)
            falta = sorted(want_f - dfeats)
            matches.append({"dev": dev.get("id"), "name": dev.get("name"), "colonia": dev.get("colonia_id"),
                            "features_match": sorted(inter), "score": score, "score_ponderado": score_pond,
                            "en_su_colonia": en_colonia, "features_que_le_faltan": falta[:4],
                            "razon": f"hace match en {len(inter)} feature(s) que el lead miró" +
                                     (f" y está en {dev.get('colonia_id')}" if en_colonia else "")})
    matches.sort(key=lambda x: (-x["score_ponderado"], -x["score"]))
    top = matches[:6]
    return {"features_del_lead": eng["features"], "colonias_del_lead": eng["colonias"], "recomendaciones": top,
            "segmento": segmento, "calor": calor, "estado": eng.get("estado"),
            "total_candidatos": len(matches),
            "mejor_jugada": (f"Ofrécele {top[0]['name']} — {top[0]['razon']}" if top else None),
            "lectura": "ofrécele estos desarrollos: hacen match con lo que el lead estuvo mirando (rankeado por intensidad de interés)"}


# Taxonomía UNIVERSO de razones de rechazo (normaliza texto libre → 14 categorías canónicas).
_REJECTION_TAXONOMY = [
    ("precio", ["precio", "caro", "costo", "presupuesto", "no me alcanza", "dinero", "enganche", "mensualidad"]),
    ("zona", ["zona", "colonia", "barrio", "ubicacion", "ubicación", "lejos", "no me gusta la zona"]),
    ("tamaño", ["tamaño", "tamano", "chico", "pequeño", "pequeno", "metros", "m2", "espacio", "grande de mas"]),
    ("fotos", ["foto", "imagen", "render", "no se ve", "calidad de foto"]),
    ("amenidades", ["amenidad", "alberca", "gym", "gimnasio", "roof", "areas comunes", "sin amenidades"]),
    ("seguridad", ["seguridad", "inseguro", "peligroso", "robo", "delito"]),
    ("plazo_entrega", ["entrega", "plazo", "preventa", "tardan", "mucho tiempo", "fecha"]),
    ("crédito", ["credito", "crédito", "hipoteca", "infonavit", "banco", "no me prestan", "financiamiento"]),
    ("layout", ["distribucion", "distribución", "layout", "plano", "cocina", "acomodo"]),
    ("vista", ["vista", "interior", "no tiene vista", "ve a la calle"]),
    ("piso_nivel", ["piso", "planta baja", "muy alto", "nivel", "elevador"]),
    ("ruido_entorno", ["ruido", "trafico", "tráfico", "avenida", "ruidoso"]),
    ("estacionamiento", ["estacionamiento", "cajon", "cajón", "parking", "auto"]),
    ("desarrollador", ["desarrollador", "constructora", "marca", "reputacion", "confianza"]),
]


def _normalize_rejection(raw: str) -> str:
    t = (raw or "").lower().strip()
    if not t or t == "otro":
        return "otro"
    for cat, kws in _REJECTION_TAXONOMY:
        if any(k in t for k in kws):
            return cat
    return t if len(t) <= 18 else "otro"   # texto corto desconocido se conserva; largo → otro


async def rejection_intel(db, since_days: int = 365, top: int = 14) -> Dict[str, Any]:
    """EL REVERSO DE LA DEMANDA (universo) — por qué dicen NO, normalizado a 14 razones canónicas (precio, zona, tamaño,
    fotos, amenidades, seguridad, plazo/entrega, crédito, layout, vista, piso, ruido, estacionamiento, desarrollador),
    por colonia. Te dice QUÉ CORREGIR. Antes guardaba el texto crudo sin agrupar."""
    cutoff = dt.datetime.utcnow() - dt.timedelta(days=since_days)
    reasons = defaultdict(int); by_col = defaultdict(lambda: defaultdict(int)); n = 0
    async for s in db.buyer_signals.find({"type": "dismiss", "created_at_dt": {"$gte": cutoff}},
                                         {"_id": 0, "value": 1, "meta": 1, "colonia": 1}):
        r = _normalize_rejection(str(s.get("value") or (s.get("meta") or {}).get("reason") or "otro"))
        reasons[r] += 1; n += 1
        if s.get("colonia"):
            by_col[s["colonia"]][r] += 1
    return {"total_rechazos": n, "razones": [{"razon": k, "n": v} for k, v in sorted(reasons.items(), key=lambda x: -x[1])[:top]],
            "taxonomia": [c for c, _ in _REJECTION_TAXONOMY],
            "por_colonia": {c: dict(r) for c, r in sorted(by_col.items(), key=lambda x: -sum(x[1].values()))[:8]},
            "lectura": "la razón #1 de rechazo = lo que más te cuesta ventas (14 razones canónicas)"}


def _normalize_intent(raw: str, signal_type: str = "") -> Optional[str]:
    """Universo de intenciones: primera-vivienda · upgrade · downsize · segunda-residencia · invertir-renta ·
    invertir-plusvalía · flip · vivir / invertir (genérico)."""
    t = (raw or "").lower().strip()
    if "primera" in t or "primer depa" in t or "first" in t:
        return "primera-vivienda"
    if "upgrade" in t or "más grande" in t or "mas grande" in t or "crecer" in t:
        return "upgrade"
    if "downsize" in t or "más chico" in t or "mas chico" in t or "reducir" in t:
        return "downsize"
    if "segunda" in t or "vacacion" in t or "fin de semana" in t or "descanso" in t:
        return "segunda-residencia"
    if "renta" in t or "rentar" in t or "airbnb" in t or "alquil" in t:
        return "invertir-renta"
    if "plusval" in t or "revaloriz" in t or "apreci" in t:
        return "invertir-plusvalía"
    if "flip" in t or "revender" in t or "remate" in t:
        return "flip"
    if "invert" in t:
        return "invertir-renta" if signal_type == "roi_explore" else "invertir"
    if "vivir" in t or "habit" in t or "mudar" in t or "hogar" in t:
        return "vivir"
    if signal_type == "roi_explore":
        return "invertir"
    if signal_type == "payment_explore":
        return "vivir"
    return None


async def intent_split(db, since_days: int = 365, top: int = 10) -> Dict[str, Any]:
    """DEMANDA POR INTENT (universo) — 8 intenciones inferidas de MÚLTIPLES fuentes (lens · roi_explore · payment_explore ·
    meta de Atlax): primera-vivienda, upgrade, downsize, segunda-residencia, invertir-renta, invertir-plusvalía, flip,
    vivir/invertir. Global + por colonia. Antes solo vivir/invertir del lens."""
    cutoff = dt.datetime.utcnow() - dt.timedelta(days=since_days)
    glob = defaultdict(int); by_col = defaultdict(lambda: defaultdict(int))
    async for s in db.buyer_signals.find(
            {"type": {"$in": ["lens", "roi_explore", "payment_explore", "atlax_query", "atlax_profile"]}, "created_at_dt": {"$gte": cutoff}},
            {"_id": 0, "type": 1, "value": 1, "colonia": 1, "meta": 1}):
        meta = s.get("meta") or {}
        raw = s.get("value") or meta.get("intent") or meta.get("objetivo") or ""
        v = _normalize_intent(str(raw), s.get("type"))
        if v:
            glob[v] += 1
            if s.get("colonia"):
                by_col[s["colonia"]][v] += 1
    # resumen vivir vs invertir (compat con consumidores existentes)
    vivir = sum(n for k, n in glob.items() if k.startswith("vivir") or k in ("primera-vivienda", "upgrade", "downsize", "segunda-residencia"))
    invertir = sum(n for k, n in glob.items() if k.startswith("invertir") or k == "flip")
    def _con_agregados(d):
        dd = dict(d)
        dd["vivir"] = sum(n for k, n in d.items() if str(k).startswith("vivir") or k in ("primera-vivienda", "upgrade", "downsize", "segunda-residencia"))
        dd["invertir"] = sum(n for k, n in d.items() if str(k).startswith("invertir") or k == "flip")
        return dd
    return {"global": dict(glob), "resumen": {"vivir": vivir, "invertir": invertir},
            "taxonomia": ["primera-vivienda", "upgrade", "downsize", "segunda-residencia", "invertir-renta", "invertir-plusvalía", "flip"],
            "por_colonia": [{"colonia": c, **_con_agregados(d)} for c, d in sorted(by_col.items(), key=lambda x: -sum(x[1].values()))[:top]]}


async def co_viewed(db, since_days: int = 365, top: int = 15) -> Dict[str, Any]:
    """QUÉ COMPITE (market basket, universo) — desarrollos vistos por el MISMO comprador = compiten en su mente.
    Pares · RIVAL principal por dev · competencia CROSS-ZONA vs intra-zona · dev más considerado (captura de atención).
    Inteligencia competitiva real."""
    from data_developments import DEVELOPMENTS_BY_ID
    cutoff = dt.datetime.utcnow() - dt.timedelta(days=since_days)
    seen = defaultdict(set)
    async for s in db.buyer_signals.find({"type": {"$in": ["ficha_view", "like", "unit_view", "compare"]},
                                          "created_at_dt": {"$gte": cutoff}, "entity_id": {"$nin": [None, ""]}},
                                         {"_id": 0, "visitor_id": 1, "entity_id": 1}):
        seen[s["visitor_id"]].add(s["entity_id"])
    pairs = Counter(); per_dev = defaultdict(Counter); considerado = Counter()
    cross_zone = 0; intra_zone = 0
    col = lambda d: (DEVELOPMENTS_BY_ID.get(d, {}) or {}).get("colonia_id")
    nm = lambda d: (DEVELOPMENTS_BY_ID.get(d, {}) or {}).get("name") or d
    for devs in seen.values():
        dl = sorted(devs)
        for i in range(len(dl)):
            considerado[dl[i]] += len(dl) - 1
            for j in range(i + 1, len(dl)):
                a, b = dl[i], dl[j]
                pairs[(a, b)] += 1
                per_dev[a][b] += 1; per_dev[b][a] += 1
                if col(a) and col(b) and col(a) != col(b):
                    cross_zone += 1
                else:
                    intra_zone += 1
    rival_principal = [{"dev": nm(d), "rival": nm(rc.most_common(1)[0][0]), "veces": rc.most_common(1)[0][1]}
                       for d, rc in sorted(per_dev.items(), key=lambda x: -sum(x[1].values()))[:top] if rc]
    return {"pares_comparados": [{"a": nm(a), "b": nm(b), "juntos": n} for (a, b), n in pairs.most_common(top)],
            "rival_principal": rival_principal,
            "competencia_cross_zona": cross_zone, "competencia_intra_zona": intra_zone,
            "mas_considerados": [{"dev": nm(d), "apariciones": n} for d, n in considerado.most_common(8)],
            "lectura": "rival #1 de cada dev + si la competencia es dentro de la zona o cruzando zonas + el más considerado"}


async def temporal_demand(db, since_days: int = 90) -> Dict[str, Any]:
    """CUÁNDO buscan (universo) — hora · día · FRANJA (madrugada/mañana/mediodía/tarde/noche) · entre-semana vs fin de
    semana · CUÁNDO ocurre la intención ALTA (intent/lead/apartado/pago) vs el browsing · hora y día pico."""
    cutoff = dt.datetime.utcnow() - dt.timedelta(days=since_days)
    by_hour = defaultdict(int); by_dow = defaultdict(int); by_franja = defaultdict(int)
    semana = {"entre_semana": 0, "fin_de_semana": 0}
    franja_alta = defaultdict(int); franja_browse = defaultdict(int)
    ALTA = {"intent", "lead", "atlax_apartado", "payment_explore", "roi_explore", "unit_save", "save"}

    def franja(h):
        return "madrugada (0-6)" if h < 6 else "mañana (6-12)" if h < 12 else "mediodía (12-15)" if h < 15 else "tarde (15-19)" if h < 19 else "noche (19-24)"

    # agregado en Mongo: hora/día-de-semana/alta-intención por grupo (≤ 24×7×2 buckets) en vez de streamear la ventana
    pipe = [
        {"$match": {"created_at_dt": {"$gte": cutoff}}},
        {"$group": {"_id": {"h": {"$hour": "$created_at_dt"}, "dow": {"$dayOfWeek": "$created_at_dt"},
                            "alta": {"$in": [{"$ifNull": ["$type", ""]}, sorted(ALTA)]}},
                    "n": {"$sum": 1}}},
    ]
    async for g in db.buyer_signals.aggregate(pipe):
        h = g["_id"]["h"]; cnt = g["n"]
        wd = (g["_id"]["dow"] + 5) % 7   # $dayOfWeek: 1=Dom..7=Sáb → weekday(): 0=Lun..6=Dom
        by_hour[h] += cnt; by_dow[wd] += cnt
        fr = franja(h); by_franja[fr] += cnt
        semana["fin_de_semana" if wd >= 5 else "entre_semana"] += cnt
        (franja_alta if g["_id"]["alta"] else franja_browse)[fr] += cnt

    dow = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]
    fr_order = ["madrugada (0-6)", "mañana (6-12)", "mediodía (12-15)", "tarde (15-19)", "noche (19-24)"]
    hora_pico = max(by_hour, key=by_hour.get) if by_hour else None
    dia_pico = max(by_dow, key=by_dow.get) if by_dow else None
    franja_intencion = max(franja_alta, key=franja_alta.get) if franja_alta else None
    return {"por_hora": {str(h): by_hour.get(h, 0) for h in range(24)},
            "por_dia": {dow[i]: by_dow.get(i, 0) for i in range(7)},
            "por_franja": {f: by_franja.get(f, 0) for f in fr_order},
            "semana": semana,
            "intencion_alta_por_franja": {f: franja_alta.get(f, 0) for f in fr_order},
            "hora_pico": hora_pico, "dia_pico": dow[dia_pico] if dia_pico is not None else None,
            "franja_de_mayor_intencion": franja_intencion,
            "lectura": "cuándo navegan vs cuándo deciden (intención alta) — programa contacto/campañas en la franja correcta"}


async def journey_depth(db, since_days: int = 365) -> Dict[str, Any]:
    """PROFUNDIDAD DEL JOURNEY (universo) — toques, % regresa, % convierte + DISTRIBUCIÓN de profundidad (1 toque/2-3/4-6/
    7+), % REBOTE (1 solo toque y se va), VELOCIDAD a lead (días 1er-toque→lead), días activos promedio. Calidad del embudo."""
    import statistics
    cutoff = dt.datetime.utcnow() - dt.timedelta(days=since_days)
    by_v = defaultdict(lambda: {"n": 0, "lead": False, "days": set(), "first": None, "lead_at": None})
    async for s in db.buyer_signals.find({"created_at_dt": {"$gte": cutoff}}, {"_id": 0, "visitor_id": 1, "type": 1, "created_at_dt": 1}):
        v = by_v[s["visitor_id"]]; v["n"] += 1
        t = s.get("created_at_dt")
        if s["type"] == "lead":
            v["lead"] = True
            if isinstance(t, dt.datetime) and (v["lead_at"] is None or t < v["lead_at"]):
                v["lead_at"] = t
        if isinstance(t, dt.datetime):
            v["days"].add(t.date())
            if v["first"] is None or t < v["first"]:
                v["first"] = t
    tot = len(by_v) or 1
    prof = defaultdict(int)
    for v in by_v.values():
        prof["1 toque" if v["n"] == 1 else "2-3" if v["n"] <= 3 else "4-6" if v["n"] <= 6 else "7+"] += 1
    velocidad = [round((v["lead_at"] - v["first"]).total_seconds() / 86400, 1)
                 for v in by_v.values() if v["lead_at"] and v["first"] and v["lead_at"] >= v["first"]]
    return {"visitantes": len(by_v),
            "toques_promedio": round(sum(v["n"] for v in by_v.values()) / tot, 1),
            "regresan_pct": round(100 * sum(1 for v in by_v.values() if len(v["days"]) > 1) / tot),
            "convierten_a_lead_pct": round(100 * sum(1 for v in by_v.values() if v["lead"]) / tot),
            "distribucion_profundidad": {k: prof.get(k, 0) for k in ("1 toque", "2-3", "4-6", "7+")},
            "rebote_pct": round(100 * prof.get("1 toque", 0) / tot),
            "velocidad_a_lead_dias": round(statistics.median(velocidad), 1) if velocidad else None,
            "dias_activos_promedio": round(sum(len(v["days"]) for v in by_v.values()) / tot, 1),
            "lectura": "qué tan profundo exploran, cuántos rebotan, y qué tan rápido se convierten"}


def _col2geo():
    """Mapa colonia_id → {alcaldia, cp} desde la oferta (para escalar búsquedas a macro/micro)."""
    from data_developments import DEVELOPMENTS
    m = {}
    for d in DEVELOPMENTS:
        c = d.get("colonia_id")
        if c and c not in m:
            m[c] = {"alcaldia": d.get("alcaldia"), "cp": d.get("postal_code"), "colonia": d.get("colonia") or c}
    return m


# Corredores inmobiliarios CDMX (escala "grande" = cluster de colonias, entre colonia y alcaldía).
_CORRIDORS = {
    "reforma-centro": ["juarez", "juárez", "cuauhtemoc", "cuauhtémoc", "centro", "tabacalera", "san-rafael", "santa-maria-la-ribera", "roma-norte-centro"],
    "roma-condesa": ["roma-norte", "roma-sur", "condesa", "hipodromo", "hipodromo-condesa", "hipódromo", "cuauhtemoc-roma"],
    "polanco-lomas": ["polanco", "lomas-de-chapultepec", "bosques-de-las-lomas", "anzures", "granada", "ampliacion-granada", "polanco-moderno"],
    "del-valle-napoles": ["del-valle-centro", "del-valle-norte", "del-valle-sur", "napoles", "nápoles", "narvarte", "narvarte-poniente", "actipan", "insurgentes-san-borja"],
    "coyoacan-pedregal": ["del-carmen", "pedregal", "jardines-del-pedregal", "ciudad-universitaria", "copilco", "coyoacan-centro"],
    "santa-fe": ["santa-fe", "lomas-de-santa-fe", "contadero", "cuajimalpa"],
    "mixcoac-insurgentes": ["mixcoac", "san-jose-insurgentes", "insurgentes-mixcoac", "extremadura-insurgentes", "credito-constructor", "noche-buena", "altavista", "san-angel"],
}
_COL2CORRIDOR = {c: name for name, cols in _CORRIDORS.items() for c in cols}


def _corridor(colonia_id, alcaldia):
    if colonia_id and colonia_id in _COL2CORRIDOR:
        return _COL2CORRIDOR[colonia_id]
    return f"zona {alcaldia}" if alcaldia else None


async def zone_dynamics(db, scale: str = "media", since_days: int = 180, colonias: Optional[List[str]] = None, top: int = 20) -> Dict[str, Any]:
    """DINÁMICA DE ZONA por escala — micro(CP) / media(colonia) / grande(corredor) / macro(alcaldía). Por cada zona:
    DEMANDA (señales+búsquedas), OFERTA (unidades), ABSORCIÓN (demanda/oferta) y MOVIMIENTO (mitad reciente vs previa =
    subiendo/enfriando/nuevo). El 'SimCity de la demanda' a 4 zooms."""
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
        if scale == "grande":
            cid = colonia_id or d.get("colonia_id")
            return _corridor(cid, d.get("alcaldia") or (c2g.get(cid, {}) or {}).get("alcaldia"))
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
        k = {"macro": d.get("alcaldia"), "micro": d.get("postal_code"), "media": d.get("colonia_id"),
             "grande": _corridor(d.get("colonia_id"), d.get("alcaldia"))}.get(scale)
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
            if scale == "media":
                k = c
            elif scale == "macro":
                k = (c2g.get(c, {}) or {}).get("alcaldia")
            elif scale == "grande":
                k = _corridor(c, (c2g.get(c, {}) or {}).get("alcaldia"))
            else:  # micro
                k = (c2g.get(c, {}) or {}).get("cp")
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
        "grande": await zone_dynamics(db, "grande", since_days=since_days, colonias=colonias),
        "media": await zone_dynamics(db, "media", since_days=since_days, colonias=colonias),
        "micro": await zone_dynamics(db, "micro", since_days=since_days, colonias=colonias),
    }


async def zone_intelligence(db, since_days: int = 180, colonias: Optional[List[str]] = None, top: int = 14, with_airroi: bool = False, with_underwriting: bool = False) -> Dict[str, Any]:
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

    lift_global = await _feature_lift(db) if with_underwriting else None
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
        # FEEDER LOCAL (sin usar): riesgo natural (sísmico/inundación) + crimen FGJ por zona
        try:
            nr = await db.natural_risk_layers.find_one({"zone_id": cid}, {"_id": 0, "sismic_zone": 1, "sismic_score": 1, "flood_pct": 1, "composite_score": 1})
            if nr:
                prof["riesgo_natural"] = {"sismico_zona": nr.get("sismic_zone"), "sismico_score": nr.get("sismic_score"),
                                          "inundacion_pct": nr.get("flood_pct"), "compuesto": nr.get("composite_score")}
        except Exception:
            pass
        try:
            cz = await db.crime_zone_colonia.find_one({"zone_id": cid}, {"_id": 0, "safety_score": 1, "incidentes_ponderados": 1})
            if cz:
                prof["crimen"] = {"safety_score": cz.get("safety_score"), "incidentes": cz.get("incidentes_ponderados")}
        except Exception:
            pass
        # Score de inversión 0-100 AAA-B
        s2 = inv.get(lc)
        if s2:
            prof["inversion"] = {"score": s2.get("score"), "tier": s2.get("tier"), "rec": s2.get("recommendation")}
        # Ciclo + recomendación (alimentado con la absorción REAL) + feeders locales (catastral + costo construcción)
        try:
            rec = await db.colonias.find_one({"id": cid}, {"_id": 0})
            if rec:
                cyc = zce.compute_zone_cycle(rec, absorcion_pct=absorcion_pct)
                prof["ciclo"] = cyc.get("label") or (cyc.get("ciclo") or {}).get("label") or (cyc.get("ciclo") or {}).get("fase_key")
                try:
                    prof["recomendacion"] = zce.zone_recommendation(cyc)
                except Exception:
                    pass
                # FEEDER LOCAL: valor catastral del suelo (1,391 colonias lo tienen)
                if rec.get("vsuelo_pm2_catastral"):
                    prof["catastral_pm2"] = rec["vsuelo_pm2_catastral"]
                if rec.get("precio_pm2") and not prof.get("precio_m2"):
                    prof["precio_m2"] = rec["precio_pm2"]
        except Exception:
            pass
        # FEEDER LOCAL: costo de construcción por m² (BASE_COSTS, sin tokens externos)
        try:
            _t = (prof.get("tier") or "").lower()
            tier_cc = "luxury" if ("premium" in _t or "lux" in _t) else "entry" if "emerg" in _t else "mid"
            prof["costo_construccion_m2"] = await _construccion_m2(cid, tier_cc)
        except Exception:
            pass
        # FEEDER LOCAL (sin AirROI): cap rate bruto estimado por tier (RENTAL_YIELDS de investment_simulator)
        try:
            _t = (prof.get("tier") or "").lower()
            yld = 4.0 if ("premium" in _t or "lux" in _t or "corp" in _t) else 5.0 if ("emerg" in _t or "trendy" in _t or "revival" in _t) else 4.5
            prof["cap_rate_est"] = yld  # % anual bruto (estimado local, no AirROI)
        except Exception:
            pass
        # FEEDER AIRROI (pagado, cacheado 30d): métricas STR Airbnb REALES + cap rate de renta corta
        if with_airroi:
            try:
                air = await _airroi_zone(db, prof.get("nombre") or cid.title())
                if air and air.get("revenue_anual"):
                    prof["str_airbnb"] = {"ocupacion_pct": round((air.get("occupancy") or 0) * 100),
                                          "adr": air.get("adr"), "revpar": air.get("revpar"),
                                          "revenue_anual_usd": air.get("revenue_anual"), "listings": air.get("listings")}
                    # cap rate STR real = revenue anual (USD) / valor propiedad (MXN→USD, fx 20)
                    m2_typ = (prof.get("spec_pedida") or {}).get("m2") or 80
                    if prof.get("precio_m2") and m2_typ:
                        precio_usd = prof["precio_m2"] * m2_typ / 20.0
                        if precio_usd > 0:
                            prof["cap_rate_str"] = round(100 * air["revenue_anual"] / precio_usd, 1)
            except Exception:
                pass
        # UNDERWRITING (motores locales): valor residual del suelo · upside Norma 3 · lift de feature aprendido
        if with_underwriting:
            try:
                prof["valor_residual_pm2"] = await _valor_residual_m2(db, cid)
            except Exception:
                pass
            try:
                prof["norma3_upside_pct"] = await _norma3_upside(db, cid)
            except Exception:
                pass
            if lift_global:
                prof["feature_lift"] = lift_global
            # BUILD-READY (colecciones existen, se llenan con dato de prod): forecast · clima · fraude · reseñas · brokers
            try:
                fc = await db.drpi_snapshots.find_one({"zone_id": cid, "available": True}, {"_id": 0})
                if fc:
                    prof["forecast_pct"] = fc.get("forecast_12m_pct") or fc.get("drpi_delta_pct") or fc.get("delta_pct")
            except Exception:
                pass
            try:
                clm = await db.climate_migration_patterns.find_one({"$or": [{"zone_id": cid}, {"destino": cid}, {"origin": cid}]}, {"_id": 0})
                if clm:
                    prof["clima_migracion"] = clm.get("magnitud") or clm.get("confianza") or clm.get("score")
            except Exception:
                pass
            try:
                nf = await db.fraud_alerts.count_documents({"zone_id": cid})
                if nf:
                    prof["fraude_n"] = nf
            except Exception:
                pass
            try:
                rv = await db.reviews_residents_cache.find_one({"entity_id": cid, "is_stub": {"$ne": True}}, {"_id": 0})
                if rv:
                    prof["reviews_sentiment"] = rv.get("sentiment_score") or rv.get("positivo_pct") or rv.get("score")
            except Exception:
                pass
            try:
                brk = await db.broker_listings.distinct("broker_id", {"colonia_id": cid})
                if brk:
                    prof["brokers_n"] = len(brk)
            except Exception:
                pass
        out.append(prof)
    return {"zonas": out,
            "lectura": "demanda + absorción real + precio/m² + calidad de vida + riesgo + inversión + ciclo = la foto institucional de la zona",
            "fuentes": ["buyer_signals", "demand_twin_engine", "absorcion_engine", "avm_public_engine",
                        "zone_score_engine", "risk_score_engine", "score_inversion_engine", "zone_cycle_engine"]}


_CC_CACHE: Dict[str, Any] = {}
_AIRROI_TTL_DAYS = 30
_AIRROI_MONTHLY_CAP = 400   # tope de llamadas nuevas/mes (control de costo · ~$40 máx)


async def _airroi_zone(db, zone_name: str):
    """Métricas STR (Airbnb) por zona vía AirROI — REGLA DE COSTO: 1 sola llamada por zona por MES CALENDARIO.
    Si la zona ya se trajo este mes, devuelve el dato guardado y BLOQUEA la llamada a la API (no gasta). Solo llama si no
    hay dato del mes actual. Tope global mensual como segundo candado. AirROI cobra por llamada."""
    if not zone_name:
        return None
    key = str(zone_name).strip().lower()
    mes = dt.datetime.utcnow().strftime("%Y-%m")
    doc = None
    try:
        doc = await db.airroi_cache.find_one({"_id": key})
        # CANDADO 1 — ya se trajo este mes → usar guardado, NO llamar a la API.
        if doc and doc.get("fetched_mes") == mes:
            return doc.get("data")
    except Exception:
        pass
    # CANDADO 2 — tope global de llamadas nuevas este mes (backstop de costo).
    try:
        if await db.airroi_cache.count_documents({"fetched_mes": mes}) >= _AIRROI_MONTHLY_CAP:
            return (doc or {}).get("data") if doc else None
    except Exception:
        pass
    # Solo aquí se gasta una llamada (1ª vez de la zona este mes).
    try:
        import connectors_ie as ci
        conn = ci.AirRoiConnector(source_doc={"source_id": "airroi"}, credentials={})
        obs = await conn.fetch(zone_id=zone_name)
        o = (obs[0] if obs else {}) or {}
        if o.get("is_stub"):
            return (doc or {}).get("data") if doc else None   # falló: conserva el dato viejo, no marca el mes
        p = o.get("payload") or {}
        data = {"occupancy": p.get("occupancy"), "adr": p.get("average_daily_rate"), "revpar": p.get("rev_par"),
                "revenue_anual": p.get("revenue"), "listings": p.get("active_listings_count")}
        await db.airroi_cache.update_one({"_id": key},
            {"$set": {"data": data, "fetched_at": dt.datetime.utcnow(), "fetched_mes": mes}}, upsert=True)
        return data
    except Exception:
        return (doc or {}).get("data") if doc else None


_VR_CACHE: Dict[str, Any] = {}
_N3_CACHE: Dict[str, Any] = {}
_LIFT_CACHE: Dict[str, Any] = {}


async def _feature_lift(db):
    """Lift aprendido (pp) del factor con más señal — del simulador de palancas. Global (mismo para todas las zonas)."""
    if "v" in _LIFT_CACHE:
        return _LIFT_CACHE["v"]
    out = None
    try:
        import simulador_palancas_engine as sp
        s = await sp.simular(db, factor="recamaras", de="2 recámaras", a="3 recámaras")
        ops = (s or {}).get("opciones") or []
        best = max(ops, key=lambda o: o.get("lift_pp", -99)) if ops else None
        if best:
            out = {"factor": "recámaras", "valor": best.get("valor"), "lift_pp": best.get("lift_pp")}
    except Exception:
        out = None
    _LIFT_CACHE["v"] = out
    return out


async def _valor_residual_m2(db, colonia_id: str):
    """Valor residual máximo del suelo por m² (terreno representativo 1000 m²) — calcular_residual, cacheado."""
    if colonia_id in _VR_CACHE:
        return _VR_CACHE[colonia_id]
    val = None
    try:
        import valor_residual_engine as vr
        r = await vr.calcular_residual(db, 1000.0, colonia_id=colonia_id)
        resp = (r or {}).get("respuesta") or {}
        val = resp.get("oferta_pm2_terreno") or resp.get("oferta_maxima_pm2")
    except Exception:
        val = None
    _VR_CACHE[colonia_id] = val
    return val


async def _norma3_upside(db, colonia_id: str):
    """Upside de fusión de predios (Norma 3) por colonia — detectar_fusiones, cacheado."""
    if colonia_id in _N3_CACHE:
        return _N3_CACHE[colonia_id]
    val = None
    try:
        import norma3_engine as n3
        r = await n3.detectar_fusiones(db, colonia_id=colonia_id)
        if isinstance(r, dict) and r.get("disponible") and (r.get("oportunidades") or []):
            top = r["oportunidades"][0]
            val = top.get("delta_valor_pct") or top.get("upside_pct") or len(r["oportunidades"])
    except Exception:
        val = None
    _N3_CACHE[colonia_id] = val
    return val


async def _construccion_m2(colonia_id: str, tier: str):
    """Costo de construcción/m² con caché en proceso (evita pegarle a BANXICO en cada colonia)."""
    key = f"{colonia_id}|{tier}"
    if key in _CC_CACHE:
        return _CC_CACHE[key]
    val = None
    try:
        import inspect as _insp
        import construction_cost_engine as cce
        cr = cce.predict_cost_per_m2(colonia_id, "vertical", tier)
        if _insp.isawaitable(cr):
            cr = await cr
        if isinstance(cr, dict):
            val = cr.get("cost_per_m2_mxn") or cr.get("cost_per_m2")
    except Exception:
        val = None
    _CC_CACHE[key] = val
    return val


async def zone_intelligence_scaled(db, scale: str = "media", since_days: int = 180, top: int = 14, with_airroi: bool = False, with_underwriting: bool = False) -> Dict[str, Any]:
    """LAS 75 MÉTRICAS A LAS 4 ESCALAS — la fusión institucional, agregada al nivel pedido:
    media = colonia (fusión directa) · grande = corredor · macro = alcaldía (rollup ponderado) · micro = CP (subset geo)."""
    import statistics
    if scale == "media":
        return await zone_intelligence(db, since_days=since_days, top=top, with_airroi=with_airroi, with_underwriting=with_underwriting)
    if scale == "micro":
        md = await zone_dynamics(db, "micro", since_days=since_days, top=top)
        return {"escala": "micro", "zonas": md["zonas"], "lectura": "micro (CP): demanda+oferta+absorción+movimiento (subset geo)"}

    # grande/macro: agrega la fusión de colonia → corredor/alcaldía (underwriting local sí; AirROI no, por costo)
    zi = await zone_intelligence(db, since_days=since_days, top=60, with_underwriting=with_underwriting)

    def grupo(z):
        rec = z  # zone_intelligence ya trae alcaldia
        if scale == "macro":
            return z.get("alcaldia") or "—"
        return _corridor(z.get("zona"), z.get("alcaldia")) or "—"

    groups = defaultdict(list)
    for z in zi["zonas"]:
        groups[grupo(z)].append(z)

    def wavg(zs, getter):
        vals = [(getter(z), z.get("demanda") or 1) for z in zs if getter(z) is not None]
        if not vals:
            return None
        num = sum(v * w for v, w in vals); den = sum(w for _, w in vals)
        return round(num / den) if den else None

    def avg(zs, getter):
        vals = [getter(z) for z in zs if getter(z) is not None]
        return round(statistics.mean(vals), 1) if vals else None

    out = []
    for name, zs in groups.items():
        out.append({
            "zona": name, "nombre": name.replace("-", " ").title(), "colonias": len(zs),
            "demanda": sum(z.get("demanda") or 0 for z in zs),
            "busquedas": sum(z.get("busquedas") or 0 for z in zs),
            "oferta_unidades": sum(z.get("oferta_unidades") or 0 for z in zs),
            "precio_m2": wavg(zs, lambda z: z.get("precio_m2")),
            "costo_construccion_m2": avg(zs, lambda z: z.get("costo_construccion_m2")),
            "catastral_pm2": avg(zs, lambda z: z.get("catastral_pm2")),
            "valor_residual_pm2": avg(zs, lambda z: z.get("valor_residual_pm2")),
            "cap_rate_est": avg(zs, lambda z: z.get("cap_rate_est")),
            "absorcion": {"vendido_pct": avg(zs, lambda z: (z.get("absorcion") or {}).get("vendido_pct"))},
            "riesgo": {"num": avg(zs, lambda z: (z.get("riesgo") or {}).get("num"))},
            "inversion": {"score": avg(zs, lambda z: (z.get("inversion") or {}).get("score"))},
            "subscores": {k: avg(zs, lambda z, k=k: (z.get("subscores") or {}).get(k)) for k in ("seguridad", "transporte", "educacion", "amenidades", "lifestyle", "precio", "vibe")},
            "oportunidad": avg(zs, lambda z: z.get("oportunidad")),
            "movimiento": (lambda c: c.most_common(1)[0][0] if c else None)(Counter(z.get("movimiento") for z in zs if z.get("movimiento"))),
        })
    out.sort(key=lambda x: -(x["demanda"] + x["busquedas"]))
    return {"escala": scale, "zonas": out[:top],
            "lectura": f"{scale}: la fusión de 8 motores agregada a nivel {'corredor' if scale == 'grande' else 'alcaldía'} (rollup ponderado por demanda)"}


async def axes_por_escala(db, scale: str = "media", since_days: int = 180, top: int = 8) -> Dict[str, Any]:
    """TODAS LAS ÁREAS A CADA ESCALA — características (atributos), finanzas, créditos e inversión agregadas por la escala
    pedida: media(colonia) · grande(corredor) · macro(alcaldía) · ciudad. Reusa attribute_demand + financial_demand con
    scope de colonias por zona. Cierra: la misma granularidad de áreas que en colonia, también en alcaldía y ciudad."""
    from data_developments import DEVELOPMENTS, DEVELOPMENTS_BY_ID
    # zona de la escala → set de colonias
    groups = defaultdict(set)
    for d in DEVELOPMENTS:
        cid = d.get("colonia_id"); alc = d.get("alcaldia")
        if not cid:
            continue
        key = (alc if scale == "macro" else _corridor(cid, alc) if scale == "grande"
               else (d.get("city") or "CDMX") if scale == "ciudad" else cid)
        if key:
            groups[key].add(cid)
    # rank zonas por demanda (señales)
    dem = defaultdict(int)
    async for s in db.buyer_signals.find({"colonia": {"$nin": [None, ""]}}, {"_id": 0, "colonia": 1, "entity_id": 1}):
        cid = s.get("colonia") or (DEVELOPMENTS_BY_ID.get(s.get("entity_id"), {}) or {}).get("colonia_id")
        for zona, cols in groups.items():
            if cid in cols:
                dem[zona] += 1
                break
    ranked = sorted(groups.items(), key=lambda x: -dem.get(x[0], 0))[:top]

    out = []
    for zona, cols in ranked:
        cl = list(cols)
        try:
            atr = await attribute_demand(db, since_days=since_days, colonias=cl)
        except Exception:
            atr = {}
        try:
            fin = await financial_demand(db, since_days=since_days, colonias=cl)
        except Exception:
            fin = {}
        out.append({
            "zona": zona, "nombre": str(zona).replace("-", " ").title(), "colonias": len(cl), "demanda": dem.get(zona, 0),
            # CARACTERÍSTICAS (top del eje de atributos)
            "caracteristicas": {
                "booleanos": (atr.get("booleanos") or [])[:5],
                "vista": atr.get("vista"), "altura_edificio": atr.get("altura_edificio"),
                "tipologia": atr.get("tipologia"), "amenidades": [a["amenidad"] for a in (atr.get("amenidades_especificas") or [])[:6]],
            },
            # FINANZAS + CRÉDITOS + INVERSIÓN
            "finanzas": {
                "presupuesto": fin.get("presupuesto"), "intent": fin.get("intent"),
                "enganche_mediano": fin.get("enganche_mediano"), "mensualidad_mediana": fin.get("mensualidad_mediana"),
                "perfil_financiamiento": fin.get("perfil_financiamiento"), "tipo_credito": fin.get("tipo_credito"),
                "apetito_retorno": fin.get("apetito_retorno_pct"), "rentabilidad": (fin.get("rentabilidad_por_zona") or [])[:3],
            },
        })
    return {"escala": scale, "zonas": out,
            "lectura": "características + finanzas + créditos + inversión, agregadas a la escala (alcaldía/corredor/ciudad)"}


async def development_intelligence(db, dev_id: Optional[str] = None, since_days: int = 180, top: int = 12) -> Dict[str, Any]:
    """ÍNDICE DE INTELIGENCIA POR DESARROLLO — el equivalente de zone_intelligence pero a nivel PROYECTO. Fusiona los
    motores per-dev en una foto por desarrollo: demanda propia (señales) · absorción real de SUS unidades · margen
    (dmx_margin) · project score (dmx_project_score) · posición competitiva + rivales (battle_card) · anomalías de
    comparables · probabilidad de venta · y el CONTEXTO de su colonia (dev vs zona). Cierra el hueco: la misma
    granularidad del Terminal de Zona, a nivel desarrollo."""
    from data_developments import DEVELOPMENTS, DEVELOPMENTS_BY_ID
    cutoff = dt.datetime.utcnow() - dt.timedelta(days=since_days)

    # demanda por dev (señales con entity_id = dev)
    dem = defaultdict(lambda: defaultdict(int))
    async for s in db.buyer_signals.find({"created_at_dt": {"$gte": cutoff}, "entity_id": {"$nin": [None, ""]}},
                                         {"_id": 0, "entity_id": 1, "type": 1}):
        dem[s["entity_id"]][s["type"]] += 1

    if dev_id:
        dev_ids = [dev_id]
    else:
        ranked = sorted(dem.items(), key=lambda x: -sum(x[1].values()))
        dev_ids = [d for d, _ in ranked[:top]] or [d.get("id") for d in DEVELOPMENTS[:top]]

    # contexto de zona (1 sola vez) para comparar dev vs su colonia — con AirROI + subscores + riesgo natural
    try:
        zmap = {z["zona"]: z for z in (await zone_intelligence(db, top=60, with_airroi=True, with_underwriting=True)).get("zonas", [])}
    except Exception:
        zmap = {}

    out = []
    for did in dev_ids:
        d = DEVELOPMENTS_BY_ID.get(did)
        if not d:
            continue
        units = d.get("units") or []
        d_dem = dem.get(did, {})
        eng = sum(d_dem.get(t, 0) for t in ("ficha_view", "like", "save", "unit_view", "unit_save", "compare", "intent"))
        import statistics as _st
        prof = {"dev_id": did, "nombre": d.get("name") or did, "colonia": d.get("colonia"), "colonia_id": d.get("colonia_id"),
                "alcaldia": d.get("alcaldia"), "stage": d.get("stage"), "entrega": d.get("delivery_estimate"),
                "precio_desde": d.get("price_from"), "precio_hasta": d.get("price_to"), "demanda": eng,
                "señales": {t: d_dem.get(t, 0) for t in ("ficha_view", "like", "save", "intent", "compare", "tour_view", "payment_explore", "roi_explore") if d_dem.get(t)}}

        # ── PRODUCTO / CARACTERÍSTICAS (de SUS unidades) ──
        if units:
            def _pct_u(field):
                return round(100 * sum(1 for u in units if u.get(field)) / len(units))
            m2s = [u.get("m2_total") for u in units if u.get("m2_total")]
            prices = [u.get("price") for u in units if u.get("price")]
            protos = Counter(str(u.get("prototype") or "").upper() for u in units if u.get("prototype"))
            recs = Counter(u.get("bedrooms") for u in units if u.get("bedrooms"))
            banos = Counter(u.get("bathrooms") for u in units if u.get("bathrooms"))
            vista = Counter(str(u.get("vista")).lower() for u in units if u.get("vista"))
            orient = Counter(str(u.get("orientation")).lower() for u in units if u.get("orientation"))
            park = Counter(u.get("parking_spots") for u in units if u.get("parking_spots") is not None)
            outdoor = [round((u.get("m2_terrace") or 0) + (u.get("m2_balcony") or 0) + (u.get("m2_roof_garden") or 0)) for u in units]
            prof["producto"] = {
                "tipologias": dict(protos), "recamaras": {str(k): v for k, v in sorted(recs.items())},
                "banos": {str(k): v for k, v in sorted(banos.items())}, "estacionamiento": {str(k): v for k, v in sorted(park.items())},
                "m2": {"min": min(m2s) if m2s else None, "max": max(m2s) if m2s else None, "mediana": round(_st.median(m2s)) if m2s else None},
                "m2_exterior_prom": round(_st.mean(outdoor)) if outdoor else 0,
                "vista": dict(vista), "orientacion": dict(orient), "altura_edificio_pisos": d.get("max_level"),
                "balcon_pct": _pct_u("balcon"), "terraza_pct": _pct_u("terraza"), "roof_garden_pct": _pct_u("roof_garden"),
                "bodega_pct": _pct_u("bodega"), "pet_friendly_pct": _pct_u("pet_friendly"),
                "precio_unidad": {"min": min(prices) if prices else None, "max": max(prices) if prices else None,
                                  "mediana": round(_st.median(prices)) if prices else None},
            }
            # precio/m² del dev
            pm2 = [u["price"] / u["m2_total"] for u in units if u.get("price") and u.get("m2_total")]
            if pm2:
                prof["precio_m2"] = round(_st.median(pm2))

        # ── AMENIDADES + SERVICIOS + MEDIOS ──
        prof["amenidades"] = d.get("amenities") or []
        if d.get("servicios"):
            prof["servicios"] = d["servicios"]
        prof["medios"] = {"fotos": len(d.get("photos") or []), "video": bool(d.get("video_url")), "tour360": bool(d.get("tour360_url"))}
        if d.get("construction_progress") is not None:
            prof["avance_obra"] = d.get("construction_progress")

        # ── FINANZAS / CRÉDITOS ──
        precio_ref = d.get("price_from") or (prof.get("producto", {}).get("precio_unidad", {}) or {}).get("mediana")
        prof["finanzas"] = {
            "precio_desde": d.get("price_from"), "precio_hasta": d.get("price_to"),
            "creditos_aceptados": d.get("creditos_aceptados") or [],
            "enganche_tipico_20pct": round(precio_ref * 0.2) if precio_ref else None,
            "credito_estimado": round(precio_ref * 0.8) if precio_ref else None,
        }

        # ── ABSORCIÓN REAL de sus unidades (+ por estado) ──
        if units:
            estados = Counter(str(u.get("status") or "disponible").lower() for u in units)
            sold = sum(estados.get(k, 0) for k in ("vendido", "reservado", "sold", "reserved"))
            prof["absorcion"] = {"vendido_pct": round(100 * sold / len(units)), "vendidas": sold, "total": len(units),
                                 "por_estado": dict(estados),
                                 "disponibles": d.get("units_available"), "reservadas": d.get("units_reserved")}
        # margen (dmx_margin)
        try:
            import dmx_margin as dm
            mg = await dm.compute_margins([d])
            m = mg.get(did) or (list(mg.values())[0] if mg else {})
            if m:
                prof["margen"] = {"pct": m.get("margin_pct"), "semaforo": m.get("semaforo") or m.get("veredicto")}
        except Exception:
            pass
        # project score (dmx_project_score)
        try:
            import dmx_project_score as ps
            sc = ps.compute({**d, "demanda": eng})
            if isinstance(sc, dict):
                prof["project_score"] = sc.get("score") or sc.get("total")
        except Exception:
            pass
        # battle card (posición competitiva + rivales)
        try:
            import battle_card_engine as bc
            ms = await bc.get_my_score(db, did)
            if isinstance(ms, dict):
                prof["competitivo"] = {"score": ms.get("score") or ms.get("total"), "ranking": ms.get("ranking") or ms.get("rank")}
            comp = await bc.get_top_competitors(db, did, d.get("colonia_id") or "", limit=3)
            if comp:
                prof["rivales"] = [{"dev": (c.get("nombre") or c.get("name") or c.get("project_id")), "score": c.get("score")} for c in comp[:3]]
        except Exception:
            pass
        # probabilidad de venta total
        try:
            import probability_engine as pe
            pv = await pe.compute_sells_complete(db, did, 12)
            if isinstance(pv, dict):
                prof["prob_venta_12m"] = {"pct": pv.get("probability_pct"), "confianza": pv.get("confidence_lvl")}
        except Exception:
            pass
        # anomalías de comparables (precio/velocidad/lanzamientos cerca)
        try:
            import comparable_anomaly_engine as ca
            al = await ca.detect_anomalies_for_dev(db, did)
            if al:
                prof["alertas_comparables"] = len(al)
        except Exception:
            pass
        # CONTEXTO de su colonia (dev vs zona) + UBICACIÓN + INVERSIÓN
        z = zmap.get(d.get("colonia_id"))
        if z:
            prof["zona"] = {"nombre": z.get("nombre"), "precio_m2_zona": z.get("precio_m2"), "demanda_zona": z.get("demanda"),
                            "absorcion_zona_pct": (z.get("absorcion") or {}).get("vendido_pct"),
                            "riesgo": (z.get("riesgo") or {}).get("letra"), "inversion": (z.get("inversion") or {}).get("score"),
                            "cap_rate_str": z.get("cap_rate_str")}
            # UBICACIÓN (calidad de vida de su colonia)
            prof["ubicacion"] = {"subscores": z.get("subscores") or {},
                                 "riesgo_natural": z.get("riesgo_natural"), "crimen": z.get("crimen"),
                                 "ciclo": z.get("ciclo"), "alcaldia": z.get("alcaldia")}
            # INVERSIÓN (del dev en su zona)
            prof["inversion"] = {"score_zona": (z.get("inversion") or {}).get("score"), "tier": (z.get("inversion") or {}).get("tier"),
                                 "cap_rate_str_airbnb": z.get("cap_rate_str"), "cap_rate_estimado": z.get("cap_rate_est"),
                                 "valor_residual_suelo": z.get("valor_residual_pm2")}
            # premium del dev vs su zona (precio/m² dev vs precio/m² zona)
            if prof.get("precio_m2") and z.get("precio_m2"):
                prof["premium_vs_zona_pct"] = round(100 * (prof["precio_m2"] - z["precio_m2"]) / z["precio_m2"])
            if z.get("demanda"):
                prof["cuota_demanda_zona_pct"] = round(100 * eng / max(z["demanda"], 1))
        out.append(prof)

    out.sort(key=lambda x: -(x.get("demanda") or 0))
    return {"desarrollos": out,
            "lectura": "cada desarrollo: su demanda, absorción, margen, score, competencia, prob. de venta + cómo se compara con su colonia",
            "fuentes": ["buyer_signals", "dmx_margin", "dmx_project_score", "battle_card_engine", "probability_engine",
                        "comparable_anomaly_engine", "zone_intelligence"]}


async def cross_intelligence(db, since_days: int = 180, top: int = 14) -> Dict[str, Any]:
    """MÉTRICAS COMPUESTAS NET-NEW — cruzan el COMPORTAMIENTO del marketplace (buyer_signals/demand) con los MOTORES de
    mercado del superadmin (AVM/riesgo/inversión/absorción). Ninguna existe en un motor solo; nacen del cruce.
    El verdadero 'descubrimiento': lo que la demanda quiere vs lo que el mercado ofrece, ajustado por riesgo y retorno."""
    zi = await zone_intelligence(db, since_days=since_days, top=top)
    out = []
    for z in zi["zonas"]:
        cid = z.get("zona"); precio_m2 = z.get("precio_m2"); spec = z.get("spec_pedida") or {}
        demanda = z.get("demanda") or 0
        riesgo_num = (z.get("riesgo") or {}).get("num")
        inv_score = (z.get("inversion") or {}).get("score")
        absor = (z.get("absorcion") or {}).get("vendido_pct")
        opp = z.get("oportunidad")
        row = {"zona": cid, "nombre": z.get("nombre"), "demanda": demanda}

        # 1· BRECHA DEMANDA-PRECIO (demand_twin × AVM): ¿la demanda puede pagar lo que cuesta?
        #    + = quiere pagar MÁS que el costo (oportunidad de precio) · − = está fuera de su alcance.
        if precio_m2 and spec.get("precio_max_prom") and spec.get("m2"):
            costo = precio_m2 * spec["m2"]
            row["brecha_demanda_precio_pct"] = round(100 * (spec["precio_max_prom"] - costo) / costo) if costo else None
            row["puede_pagar"] = spec["precio_max_prom"] >= costo

        # 2· DEMANDA AJUSTADA A RIESGO (zone_dynamics × risk_score): demanda calidad-de-vida-segura.
        if riesgo_num is not None:
            row["demanda_ajustada_riesgo"] = round(demanda * (riesgo_num / 100), 1)
            row["caliente_pero_riesgosa"] = demanda >= 50 and riesgo_num < 50

        # 3· DEMANDA GRADO-INVERSIÓN (zone_dynamics × score_inversion): dónde la demanda coincide con buen retorno.
        if inv_score is not None:
            row["demanda_grado_inversion"] = round(demanda * (inv_score / 100), 1)

        # 4· PRESIÓN DE ABSORCIÓN (absorcion × oportunidad-demanda): ¿se vende más rápido de lo que llega demanda?
        if absor is not None and opp is not None:
            #  alto = mucha venta poca demanda nueva (se agota) · bajo = mucha demanda poca venta (hambrienta).
            row["presion_absorcion"] = round(absor / max(opp, 1), 2)
            row["estado_mercado"] = ("agotándose" if (absor or 0) > 40 and (opp or 0) < 20
                                     else "hambrienta" if (opp or 0) > 50 and (absor or 0) < 20 else "equilibrada")

        # 5· ÍNDICE DE OPORTUNIDAD REAL (blend net-new): demanda alta + puede pagar + bajo riesgo + buena inversión.
        parts = []
        if demanda:
            parts.append(min(demanda / 150, 1) * 30)
        if row.get("brecha_demanda_precio_pct") is not None:
            parts.append(max(0, min(row["brecha_demanda_precio_pct"], 100)) / 100 * 30)
        if riesgo_num is not None:
            parts.append(riesgo_num / 100 * 20)
        if inv_score is not None:
            parts.append(inv_score / 100 * 20)
        if parts:
            row["indice_oportunidad_real"] = round(sum(parts))
        out.append(row)

    out.sort(key=lambda x: -(x.get("indice_oportunidad_real") or 0))
    return {"zonas": out,
            "lectura": "cruces que NINGÚN motor solo produce: ¿la demanda puede pagar lo que cuesta? ¿es caliente pero "
                       "riesgosa? ¿coincide con buen retorno? ¿se está agotando o está hambrienta?",
            "composites": ["brecha_demanda_precio", "demanda_ajustada_riesgo", "demanda_grado_inversion",
                           "presion_absorcion", "indice_oportunidad_real"]}


async def behavior_profile(db, since_days: int = 365) -> Dict[str, Any]:
    """PERFIL DE COMPORTAMIENTO — device (mobile/desktop/tablet), estilo DISC, engagement de tour/video, profundidad de
    scroll. Consume las dimensiones de captura nueva (que ninguna quede capturada-y-muerta)."""
    now = dt.datetime.utcnow()
    cutoff = now - dt.timedelta(days=since_days)
    devices = defaultdict(int); n_tour = 0; scrolls = []
    scroll_band = defaultdict(int); type_mix = defaultdict(int); segments = defaultdict(int)
    recency = defaultdict(int); dwell_ms = []
    async for s in db.buyer_signals.find({"created_at_dt": {"$gte": cutoff}},
                                         {"_id": 0, "device": 1, "type": 1, "value": 1, "meta": 1, "channel": 1, "created_at_dt": 1, "dwell_ms": 1}):
        devices[_device_of(s)] += 1
        type_mix[s.get("type") or "?"] += 1
        segments[_signal_segment(s)] += 1
        recency[_time_band(s.get("created_at_dt"), now)] += 1
        dm = s.get("dwell_ms")
        if isinstance(dm, (int, float)) and dm > 0:
            dwell_ms.append(dm)
        if s.get("type") in ("tour_view", "video_view"):
            n_tour += 1
        elif s.get("type") == "scroll_depth":
            try:
                v = int(s.get("value") or 0)
                scrolls.append(v)
                scroll_band["0-25%" if v <= 25 else "26-50%" if v <= 50 else "51-75%" if v <= 75 else "76-100%"] += 1
            except (TypeError, ValueError):
                pass
    disc = defaultdict(int)
    try:
        async for c in db.buyer_coach_conversations.find({"inferred_disc": {"$nin": [None, ""]}}, {"_id": 0, "inferred_disc": 1}):
            disc[c["inferred_disc"]] += 1
    except Exception:
        pass
    total_dev = sum(devices.values())
    return {"device": dict(devices), "estilo_disc": dict(disc), "abrieron_tour_video": n_tour,
            "scroll_profundo_promedio_pct": round(sum(scrolls) / len(scrolls)) if scrolls else None,
            "device_share_pct": {k: round(v / total_dev * 100, 1) for k, v in devices.items()} if total_dev else {},
            "distribucion_scroll": dict(sorted(scroll_band.items())),
            "mezcla_senales": _topn(type_mix, 12, "tipo", "n"),
            "por_segmento": dict(segments),
            "disc_dominante": (max(disc.items(), key=lambda x: x[1])[0] if disc else None),
            "por_recencia": dict(recency),
            "dwell_ms_promedio": round(sum(dwell_ms) / len(dwell_ms)) if dwell_ms else None,
            "lectura": "cómo se comporta al universo: dispositivo (+share), DISC dominante, distribución de scroll, mezcla de señales y vivir/invertir"}


async def price_sensitivity(db, since_days: int = 365, top: int = 12) -> Dict[str, Any]:
    """SENSIBILIDAD AL PRECIO — el TECHO de precio que busca el mercado, global y por colonia (mediana/p25/p75). Te dice
    a qué precio construir/listar para no quedar fuera de la búsqueda."""
    import statistics
    now = dt.datetime.utcnow()
    cutoff = now - dt.timedelta(days=since_days)
    glob = []; by_col = defaultdict(list)
    bands = defaultdict(int); by_uso = defaultdict(list); recency = defaultdict(int)
    mens = []; eng = []
    async for s in db.marketplace_searches.find({"created_at_dt": {"$gte": cutoff}, "precio_max": {"$gt": 0}},
                                                {"_id": 0, "precio_max": 1, "colonias": 1, "uso": 1,
                                                 "mensualidad_max": 1, "enganche_max": 1, "created_at_dt": 1}):
        pm = s["precio_max"]
        glob.append(pm)
        recency[_time_band(s.get("created_at_dt"), now)] += 1
        pb = _price_band(pm)
        if pb:
            bands[pb] += 1
        for c in (s.get("colonias") or []):
            by_col[c].append(pm)
        if s.get("uso"):
            by_uso[str(s["uso"]).lower().strip()].append(pm)
        if isinstance(s.get("mensualidad_max"), (int, float)) and s["mensualidad_max"] > 0:
            mens.append(s["mensualidad_max"])
        if isinstance(s.get("enganche_max"), (int, float)) and s["enganche_max"] > 0:
            eng.append(s["enganche_max"])

    def stats(vals):
        v = sorted(vals)
        return {"n": len(v), "mediana": round(statistics.median(v)) if v else None,
                "p25": round(v[len(v) // 4]) if v else None, "p75": round(v[3 * len(v) // 4]) if v else None,
                "min": round(v[0]) if v else None, "max": round(v[-1]) if v else None}
    sweet = max(bands.items(), key=lambda x: x[1])[0] if bands else None
    return {"global": stats(glob),
            "por_colonia": [{"colonia": c, **stats(v)} for c, v in sorted(by_col.items(), key=lambda x: -len(x[1]))[:top]],
            "distribucion_bandas": dict(sorted(bands.items())),
            "banda_dominante": sweet,
            "por_uso": [{"uso": u, **stats(v)} for u, v in sorted(by_uso.items(), key=lambda x: -len(x[1]))],
            "mensualidad": stats(mens), "enganche": stats(eng),
            "por_recencia": dict(recency),
            "lectura": "construye/lista por debajo de la mediana del techo = entras en más búsquedas (+ banda dominante, sensibilidad por uso/mensualidad/enganche)"}


async def funnel_velocity(db, since_days: int = 365) -> Dict[str, Any]:
    """VELOCIDAD DEL EMBUDO — cuánto tarda el comprador: del 1er contacto al LEAD, y del lead al CIERRE. Por intent si
    se puede. 'Inversionistas deciden en días, familias en semanas'."""
    import statistics
    cutoff = dt.datetime.utcnow() - dt.timedelta(days=since_days)
    # 1er señal → lead (consideración) por visitante que tiene lead
    first = {}; lead_at = {}; n_signals = defaultdict(int); v_segment = defaultdict(lambda: defaultdict(int))
    all_visitors = set()
    async for s in db.buyer_signals.find({"created_at_dt": {"$gte": cutoff}},
                                         {"_id": 0, "visitor_id": 1, "type": 1, "created_at_dt": 1, "meta": 1}):
        v, t = s.get("visitor_id"), s.get("created_at_dt")
        if not isinstance(t, dt.datetime):
            continue
        all_visitors.add(v)
        n_signals[v] += 1
        v_segment[v][_signal_segment(s)] += 1
        if v not in first or t < first[v]:
            first[v] = t
        if s.get("type") == "lead":
            if v not in lead_at or t < lead_at[v]:
                lead_at[v] = t
    consider_days = []; consider_by_seg = defaultdict(list)
    for v in lead_at:
        if v in first and lead_at[v] >= first[v]:
            d = round((lead_at[v] - first[v]).total_seconds() / 86400, 1)
            consider_days.append(d)
            seg = max(v_segment[v].items(), key=lambda x: x[1])[0] if v_segment[v] else "desconocido"
            consider_by_seg[seg].append(d)
    # lead creado → cerrado (db.leads)
    close_days = []; close_by_intent = defaultdict(list)
    async for l in db.leads.find({"status_v2": {"$in": ["vendido", "cerrado_ganado"]}},
                                 {"_id": 0, "created_at": 1, "last_activity_at": 1, "intent": 1, "buyer_profile": 1}):
        try:
            c = dt.datetime.fromisoformat(str(l["created_at"]).replace("Z", "")[:26])
            e = dt.datetime.fromisoformat(str(l.get("last_activity_at") or l["created_at"]).replace("Z", "")[:26])
            if e >= c:
                d = round((e - c).total_seconds() / 86400, 1)
                close_days.append(d)
                seg = _normalize_intent(str(l.get("intent") or (l.get("buyer_profile") or {}).get("intent") or "")) or "desconocido"
                bucket_seg = "invertir" if seg.startswith("invertir") or seg == "flip" else "vivir" if seg != "desconocido" else "desconocido"
                close_by_intent[bucket_seg].append(d)
        except Exception:
            continue
    med = lambda x: round(statistics.median(x), 1) if x else None
    pct = lambda x, p: (round(sorted(x)[int(len(x) * p)], 1) if x else None)
    n_visitors = len(all_visitors); n_leads = len(lead_at)
    return {"consideracion_dias": {"n": len(consider_days), "mediana": med(consider_days),
                                   "p25": pct(consider_days, 0.25), "p75": pct(consider_days, 0.75)},
            "lead_a_cierre_dias": {"n": len(close_days), "mediana": med(close_days),
                                   "p25": pct(close_days, 0.25), "p75": pct(close_days, 0.75)},
            "consideracion_por_segmento": {s: {"n": len(v), "mediana": med(v)} for s, v in consider_by_seg.items()},
            "cierre_por_intent": {s: {"n": len(v), "mediana": med(v)} for s, v in close_by_intent.items()},
            "embudo": {"visitantes": n_visitors, "leads": n_leads, "cerrados": len(close_days),
                       "conversion_visitante_a_lead_pct": round(n_leads / n_visitors * 100, 1) if n_visitors else 0.0,
                       "senales_por_visitante": round(sum(n_signals.values()) / n_visitors, 1) if n_visitors else 0.0},
            "lectura": "velocidad real al universo: consideración y cierre con p25/p75, por segmento (inversionista vs familia) y tasa de conversión del embudo"}


_PROP_WEIGHT = {"atlax_apartado": 12, "lead": 10, "intent": 8, "roi_explore": 7, "payment_explore": 7,
                "unit_save": 5, "save": 4, "like": 4, "compare": 3, "unit_view": 3, "atlax_query": 3,
                "photo_dwell": 2, "photo_zoom": 2, "tour_view": 3, "ficha_view": 1, "view": 1, "dwell": 1, "dismiss": -3}


async def hot_visitors(db, since_days: int = 90, top: int = 15) -> Dict[str, Any]:
    """PROPENSIÓN / CALOR POR VISITANTE — puntúa cada visitante anónimo por sus señales (apartado/lead pesan, dismiss
    resta) + qué features/colonias mira. Lo MÁS accionable: 'estos visitantes anónimos se están calentando'."""
    from data_developments import DEVELOPMENTS_BY_ID
    now = dt.datetime.utcnow()
    cutoff = now - dt.timedelta(days=since_days)
    score = defaultdict(float); feats = defaultdict(lambda: defaultdict(int)); cols = defaultdict(lambda: defaultdict(int))
    devs = defaultdict(lambda: defaultdict(int)); seg = defaultdict(lambda: defaultdict(int)); n_sig = defaultdict(int)
    last = {}; converted = set()
    async for s in db.buyer_signals.find({"created_at_dt": {"$gte": cutoff}},
                                         {"_id": 0, "visitor_id": 1, "type": 1, "entity_id": 1, "colonia": 1, "created_at_dt": 1, "meta": 1, "unit_number": 1, "value": 1}):
        v = s.get("visitor_id")
        if not v:
            continue
        n_sig[v] += 1
        score[v] += _PROP_WEIGHT.get(s.get("type"), 0.5)
        seg[v][_signal_segment(s)] += 1
        if s.get("type") == "lead":
            converted.add(v)
        if s.get("colonia"):
            cols[v][s["colonia"]] += 1
        if s.get("entity_id"):
            devs[v][s["entity_id"]] += 1
        f, _c, _p = _attribute(s, DEVELOPMENTS_BY_ID.get(s.get("entity_id")))
        for x in (f or []):
            feats[v][x] += 1
        t = s.get("created_at_dt")
        if isinstance(t, dt.datetime) and (v not in last or t > last[v]):
            last[v] = t
    pool = [(v, sc) for v, sc in score.items() if v not in converted]
    ranked = sorted(pool, key=lambda x: -x[1])[:top]
    out = []
    for v, sc in ranked:
        tf = sorted(feats[v].items(), key=lambda x: -x[1])[:3]
        tc = sorted(cols[v].items(), key=lambda x: -x[1])[:2]
        td = sorted(devs[v].items(), key=lambda x: -x[1])[:2]
        seg_dom = max(seg[v].items(), key=lambda x: x[1])[0] if seg[v] else "desconocido"
        rb = _time_band(last[v], now) if v in last else "+1a"
        out.append({"visitor_id": v, "calor": round(sc, 1),
                    "features": [k for k, _ in tf], "colonias": [k for k, _ in tc],
                    "desarrollos": [k for k, _ in td], "segmento": seg_dom,
                    "n_senales": n_sig[v], "frescura": rb,
                    "urgente": rb in ("0-7d", "8-30d") and sc >= 8,
                    "ultima_actividad": last[v].isoformat() if v in last else None})
    # banda de calor global del pool (para el asesor: cuántos hay en cada nivel)
    bands = defaultdict(int)
    for _v, sc in pool:
        bands["caliente" if sc >= 12 else "tibio" if sc >= 6 else "frío"] += 1
    return {"visitantes_calientes": out,
            "total_visitantes": len(pool), "convertidos": len(converted),
            "bandas_calor": dict(bands),
            "urgentes": [o["visitor_id"] for o in out if o["urgente"]],
            "lectura": "lead anónimo a punto de pedir contacto — el asesor podría adelantarse (+ segmento, frescura, urgencia y bandas de calor)"}


async def killer_query(db, feature: str, colonia: str, period: str = "month") -> Dict[str, Any]:
    """El ejemplo del founder: '¿cuántos clientes engancharon con [feature] en [colonia], y cuándo?'."""
    feature = feature.strip().lower()
    res = await demand_by_feature(db, colonia=colonia, period=period, top=100)
    row = next((f for f in res["top_features"] if f["feature"] == feature), None)
    # contexto: ¿cómo se compara con las demás features de esa colonia? (rank + share)
    ranking = [f["feature"] for f in res["top_features"]]
    rank = (ranking.index(feature) + 1) if feature in ranking else None
    return {"pregunta": f"demanda de '{feature}' en '{colonia}'", "feature": feature, "colonia": colonia,
            "demanda_total": (row or {}).get("demanda", 0), "serie_tiempo": (row or {}).get("serie", {}),
            "respondible": row is not None,
            "share_pct": (row or {}).get("share_pct", 0.0),
            "ranking_en_colonia": rank, "features_en_colonia": len(ranking),
            "por_recencia": (row or {}).get("por_recencia", {}),
            "por_segmento": (row or {}).get("por_segmento", {}),
            "por_dispositivo": (row or {}).get("por_dispositivo", {}),
            "momentum": (row or {}).get("momentum"),
            "frescura_pct": (row or {}).get("frescura_pct", 0),
            "senales_precisas": (row or {}).get("senales_precisas", 0),
            "lectura": f"'{feature}' en '{colonia}': demanda total, momentum, recencia, vivir/invertir y su posición vs otras features"}
