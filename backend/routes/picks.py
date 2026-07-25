"""DMX Picks IA — endpoints (founder 07-09). Público: picks vigentes por estrategia + track record.
Superadmin: generar (cron mensual) + evaluar (cierra horizontes → construye el track record)."""
from __future__ import annotations

import re

from fastapi import APIRouter, Request, Query
from typing import Optional

import picks_engine as pe

router = APIRouter(tags=["picks"])


def _db(request: Request):
    return request.app.state.db


async def _resolver_colonia_doc(db, slug: str, proj: dict):
    """Resuelve el doc de colonia_valoracion desde un slug de forma robusta (fix auditoría): prefiere el doc que
    SÍ tiene AVM (hay colonias hermanas, unas sin precio), y ESCAPA el slug para el $regex (anti-inyección)."""
    if not slug:
        return None
    esc = re.escape(str(slug))
    cv = await db.colonia_valoracion.find_one(
        {"colonia_id": {"$regex": f"^{esc}$", "$options": "i"}, "market_m2.valor": {"$ne": None}}, proj)
    if cv:
        return cv
    cv = await db.colonia_valoracion.find_one(
        {"colonia_id": {"$regex": f"^{esc}", "$options": "i"}, "market_m2.valor": {"$ne": None}}, proj)
    if cv:
        return cv
    return await db.colonia_valoracion.find_one({"colonia_id": {"$regex": f"^{esc}", "$options": "i"}}, proj)


@router.get("/api/picks")
async def get_picks(request: Request, estrategia: Optional[str] = Query(None),
                    alcaldia: Optional[str] = Query(None), presupuesto: Optional[float] = Query(None)):
    """Picks vigentes (público, imán de leads). Con estrategia filtra; sin ella, agrupa las 5.
    Segmentable por alcaldía y presupuesto (una unidad típica que quepa en el monto)."""
    db = _db(request)
    if estrategia:
        return {"estrategia": estrategia,
                "picks": await pe.picks_vigentes(db, estrategia, alcaldia=alcaldia, presupuesto=presupuesto)}
    out = {}
    for e in pe.ESTRATEGIAS:
        out[e] = {"label": pe._LABEL[e],
                  "picks": await pe.picks_vigentes(db, e, limit=8, alcaldia=alcaldia, presupuesto=presupuesto)}
    return {"estrategias": out}


@router.get("/api/picks/track-record")
async def get_track_record(request: Request):
    """Ganadoras anteriores con transparencia radical (aciertos Y fallos). El moat de credibilidad."""
    return await pe.track_record(_db(request))


@router.get("/api/picks/para-ti")
async def picks_para_ti(request: Request, visitor_id: str = Query(...), n: int = Query(4, ge=1, le=8)):
    """SEGMENTACIÓN POR PERSONA: cruza lo que TÚ exploras (buyer_signals por visitor_id) con lo que la IA
    recomienda (picks). Tus zonas más vistas, marcadas si son DMX Pick + su precio/plusvalía. Cero costo."""
    db = _db(request)
    pipe = [{"$match": {"visitor_id": visitor_id, "colonia": {"$ne": None}}},
            {"$group": {"_id": "$colonia", "n": {"$sum": 1}}}, {"$sort": {"n": -1}}, {"$limit": n}]
    rows = [r async for r in db.buyer_signals.aggregate(pipe)]
    proj = {"_id": 0, "name": 1, "alcaldia": 1, "market_m2": 1, "plusvalia": 1, "colonia_id": 1}
    out, vistos = [], set()
    for r in rows:
        slug = r["_id"]
        cv = await _resolver_colonia_doc(db, slug, proj)
        cid = (cv or {}).get("colonia_id") or slug
        if cid in vistos:      # dedup: dos slugs ('granada','granada-ampl-...') resuelven al mismo colonia_id
            continue
        vistos.add(cid)
        lk = await pe.pick_de_entidad(db, colonia_id=cid)
        z = lk.get("por_zona") or {}
        serie = ((cv or {}).get("plusvalia") or {}).get("series") or []
        out.append({
            "colonia_slug": slug, "colonia_id": cid,
            "name": (cv or {}).get("name") or " ".join(w.capitalize() for w in str(slug).replace("-", " ").split()),
            "alcaldia": (cv or {}).get("alcaldia"), "veces_explorada": r["n"],
            "precio_m2": ((cv or {}).get("market_m2") or {}).get("valor"),
            "plusvalia_yoy": (serie[-1].get("yoy_pct") if serie else None),
            "es_pick": bool(z), "pick_estrategia": z.get("estrategia_label"),
        })
    return {"personalizado": len(out) > 0, "zonas": out}


@router.get("/api/picks/unidades")
async def get_picks_unidades(request: Request, estrategia: str = Query("oportunidad"),
                             presupuesto: Optional[float] = Query(None), alcaldia: Optional[str] = Query(None),
                             recamaras: Optional[int] = Query(None), n: int = Query(12, ge=1, le=40)):
    """Picks a nivel UNIDAD (el átomo): los mejores departamentos disponibles, no solo la mejor colonia."""
    est = estrategia if estrategia in pe.ESTRATEGIAS_UNIDAD else "oportunidad"   # fix auditoría: eco de la usada
    picks = await pe.picks_unidades(_db(request), estrategia=est, n=n,
                                    presupuesto=presupuesto, alcaldia=alcaldia, recamaras=recamaras)
    return {"estrategia": est, "label": pe._ULABEL.get(est), "picks": picks,
            "estrategias": [{"key": k, "label": pe._ULABEL[k]} for k in pe.ESTRATEGIAS_UNIDAD]}


@router.get("/api/picks/backtest")
async def picks_backtest(request: Request, monto: float = Query(1_000_000, ge=100_000, le=100_000_000),
                         estrategia: Optional[str] = Query(None)):
    """Simulado en $X (default $1M): histórico real de cerrados + asignación viva entre los picks vigentes."""
    return await pe.backtest_1m(_db(request), monto=monto, estrategia=estrategia)


@router.get("/api/picks/lookup")
async def picks_lookup(request: Request, entity_id: Optional[str] = Query(None), colonia_id: Optional[str] = Query(None)):
    """¿Este activo/zona es un DMX Pick vigente? Base de 'Dev: ¿soy pick?' y munición del asesor."""
    return await pe.pick_de_entidad(_db(request), entity_id=entity_id, colonia_id=colonia_id)


@router.get("/api/screener")
async def get_screener(
    request: Request,
    orden: str = Query("plusvalia"),
    plusvalia_min: Optional[float] = Query(None),
    yield_min: Optional[float] = Query(None),
    risk_max: Optional[float] = Query(None),
    precio_max: Optional[float] = Query(None),
    precio_min: Optional[float] = Query(None),
    gentrif_min: Optional[float] = Query(None),
    alcaldia: Optional[str] = Query(None),
    limit: int = Query(40, ge=1, le=100),
):
    """SCREENER inmobiliario por métricas de inversión (inédito): filtra colonias por plusvalía/yield/riesgo/
    precio/gentrificación. Descubrimiento → lead."""
    db = _db(request)
    filtros = {"plusvalia_min": plusvalia_min, "yield_min": yield_min, "risk_max": risk_max,
               "precio_max": precio_max, "precio_min": precio_min, "gentrif_min": gentrif_min, "alcaldia": alcaldia}
    res = await pe.screener(db, {k: v for k, v in filtros.items() if v is not None}, orden=orden, limit=limit)
    bench = await pe.benchmark_cdmx(db)
    return {"total": len(res), "orden": orden, "resultados": res, "benchmark_cdmx": bench}


@router.get("/api/benchmark")
async def get_benchmark(request: Request):
    """El benchmark CDMX (mediana $/m² + plusvalía) — el 'mercado' contra el que todo se mide."""
    return await pe.benchmark_cdmx(_db(request))


@router.get("/api/indice")
async def get_indice(request: Request, days: int = Query(3650, ge=2, le=3650)):
    """EL ÍNDICE DMX público (tipo S&P): nivel del índice maestro de mercado + serie histórica (foto diaria
    que ya se acumula) + el benchmark de precio CDMX. La jugada de autoridad — dato ya generado, ahora visible."""
    db = _db(request)
    serie = []
    maestro = None
    try:
        from terminal_mercado_engine import historial_indices
        h = await historial_indices(db, days=days)
        rows = (h or {}).get("serie") or []
        por_dia = {}
        for r in rows:
            v = r.get("indice_maestro")
            if v is not None and r.get("fecha"):
                por_dia[r["fecha"]] = round(float(v), 1)   # dedup: última foto del día
        serie = [{"fecha": f, "valor": v} for f, v in sorted(por_dia.items())]
        # Quita puntos cold-start (índice sin calibrar al arranque) para no inflar el delta: <70% de la mediana.
        if len(serie) >= 4:
            vals = sorted(p["valor"] for p in serie)
            med = vals[len(vals) // 2]
            serie = [p for p in serie if p["valor"] >= 0.7 * med]
        if serie:
            maestro = serie[-1]["valor"]
    except Exception:
        pass
    bench = await pe.benchmark_cdmx(db)
    delta = None
    if len(serie) >= 2:
        delta = round(serie[-1]["valor"] - serie[0]["valor"], 1)
    return {
        "indice_maestro": {"valor": maestro, "letra": _letra_idm(maestro), "nombre": "Índice de Mercado DMX"},
        "serie": serie, "delta_periodo": delta, "puntos": len(serie),
        "benchmark_cdmx": bench,
        "nota": "Índice de salud del mercado (obra + absorción + gestión), foto diaria. Serie en construcción.",
    }


def _letra_idm(v):
    if v is None:
        return None
    return "A" if v >= 80 else "B" if v >= 65 else "C" if v >= 50 else "D" if v >= 35 else "E"


@router.get("/api/precio-contexto")
async def precio_contexto(request: Request, colonia_id: Optional[str] = Query(None),
                          colonia: Optional[str] = Query(None), alcaldia: Optional[str] = Query(None)):
    """Las 4 capas del precio (hipergranularidad): devuelve el $/m² de la COLONIA (AVM) y de CDMX (mediana).
    El front compara la unidad y su edificio contra estas dos. Cierra 'unidad → edificio → colonia → ciudad'."""
    db = _db(request)
    colonia_m2 = None
    try:
        from ingested_reader import _resolver_cv
        cv = await _resolver_cv(db, colonia_id, colonia, alcaldia)
        colonia_m2 = ((cv or {}).get("market_m2") or {}).get("valor")
    except Exception:
        pass
    bench = await pe.benchmark_cdmx(db)
    return {"colonia_m2": colonia_m2, "cdmx_m2": (bench or {}).get("precio_m2_mediana")}


@router.get("/api/zona/{slug}/fundamentales")
async def zona_fundamentales(slug: str, request: Request):
    """FUNDAMENTALES DE ZONA (hoja de datos dura, pública): precio + plusvalía (serie) + gentrificación (con
    fuentes) + subscores + señal transaccional real. Compone datos que ya existen — el CMA del comprador."""
    db = _db(request)
    # fix auditoría: resolución robusta (prefiere doc con AVM, escapa slug) en vez de regex prefijo suelto
    cv = await _resolver_colonia_doc(db, slug, {"_id": 0, "name": 1, "alcaldia": 1, "market_m2": 1,
                                                "plusvalia": 1, "gentrification": 1, "colonia_id": 1})
    zs = await db.zone_scores.find_one({"zone_id": slug}, {"_id": 0, "components": 1, "score_letter": 1,
                                                           "score_numeric": 1, "placeholder_flags": 1})
    comp = (zs or {}).get("components") or {}
    # RELLENO ≠ MEDICIÓN (auditoría A–Z 07-24). El documento YA trae `placeholder_flags` diciendo qué
    # componentes son valor neutro por falta de dato, pero se publicaban igual: Condesa salía con
    # "Calificación C" y liquidez/demanda/oferta/yield en 50, sin una sola medición detrás. Son 819
    # de 4,936 zonas con TODOS sus componentes en 50. Un 50 inventado presentado como calificación
    # es peor que no decir nada: el comprador lo lee como "esta zona está en la media" y no lo está.
    _flags = (zs or {}).get("placeholder_flags") or {}

    def _real(clave):
        """Valor del componente sólo si está medido; None si es relleno.

        Dos señales, porque ninguna basta sola:
        · `placeholder_flags` lo dice cuando lo sabe, pero está incompleto y a veces miente
          (en Condesa marca risk=False y el valor es 50.0 exacto).
        · **50.0 EXACTO es el valor neutro por falta de dato.** Las mediciones reales caen en
          68.8, 74.4, 30.1, 57.3… Que una medición legítima aterrice en 50.000 es rarísimo, y
          esconder ese caso aislado cuesta muchísimo menos que publicar 819 zonas de 50 inventados.
        """
        v = comp.get(clave)
        if v is None or _flags.get(clave) is True:
            return None
        if isinstance(v, (int, float)) and abs(v - 50) < 0.001:
            return None
        return v

    _medidos = sum(1 for k in ("liquidez", "demand", "supply", "risk", "yield_score") if _real(k) is not None)
    # Señal transaccional real (cierres) de la zona. Fix auditoría: si un promedio no existe → null (NO "0",
    # que se leería como 'se vende en 0 días' — placeholder presentado como hecho).
    tx = {"n": 0}
    try:
        pipe = [{"$match": {"zone_id": slug, "closing_price_mxn": {"$gt": 0}, "m2": {"$gt": 0}}},
                {"$group": {"_id": None, "n": {"$sum": 1},
                            "dom": {"$avg": "$days_on_market"}, "desc": {"$avg": "$discount_pct"},
                            "ppm2": {"$avg": {"$divide": ["$closing_price_mxn", "$m2"]}}}}]
        r = await db.transactions.aggregate(pipe).to_list(1)
        if r:
            r0 = r[0]
            tx = {"n": r0["n"],
                  "dom_prom": round(r0["dom"]) if r0.get("dom") is not None else None,
                  "descuento_prom": round(r0["desc"], 1) if r0.get("desc") is not None else None,
                  "precio_m2_cierres": round(r0["ppm2"]) if r0.get("ppm2") else None}
    except Exception:
        pass
    plus = (cv or {}).get("plusvalia") or {}
    serie = [{"anio": s.get("anio"), "yoy": s.get("yoy_pct")} for s in (plus.get("series") or [])]
    gent = (cv or {}).get("gentrification") or {}
    def _riesgo(v):
        return None if v is None else ("Bajo" if v <= 40 else "Alto" if v >= 60 else "Medio")
    return {
        "slug": slug,
        "name": (cv or {}).get("name") or " ".join(w.capitalize() for w in slug.replace("-", " ").split()),
        "alcaldia": (cv or {}).get("alcaldia"),
        # Sin al menos 3 fundamentos medidos NO se publica letra: una "C" construida con puros
        # valores neutros no informa, engaña.
        "calificacion": (zs or {}).get("score_letter") if _medidos >= 3 else None,
        "calificacion_fundamentos_medidos": _medidos,
        "calificacion_nota": (None if _medidos >= 3 else
                              "Aún no hay datos suficientes de esta colonia para calificarla"),
        "precio_m2": ((cv or {}).get("market_m2") or {}).get("valor"),
        "precio_muestra_n": ((cv or {}).get("market_m2") or {}).get("muestra_n"),
        "plusvalia_yoy": (serie[-1]["yoy"] if serie else None),
        "plusvalia_serie": serie,
        "gentrificacion": {"score": gent.get("score"), "nivel": gent.get("nivel"),
                           "componentes": [{"nombre": c.get("nombre"), "valor": c.get("valor"), "fuente": c.get("fuente")}
                                           for c in (gent.get("componentes") or [])]},
        "fundamentos": {
            "liquidez": _real("liquidez"), "demanda": _real("demand"), "oferta": _real("supply"),
            "riesgo": _riesgo(_real("risk")), "yield_score": _real("yield_score"),
            "servicios_cercanos": _real("denue_density"),
        },
        "transaccional": tx,
    }


def _grade_ticker(v):
    return "A" if v >= 80 else "B" if v >= 68 else "C" if v >= 55 else "D" if v >= 42 else "E"


@router.get("/api/developments/{dev_id}/asesor")
async def dev_asesor(dev_id: str, request: Request):
    """ASESOR que te atiende (checklist: asesor destacado buyer-facing): el mejor asesor para la zona del
    desarrollo (perfil real + score de confianza medido). REUSA asesor_profiles + asesor_trust_scores — no
    duplica. build-for-endstate: se prende conforme entran asesores; sin match devuelve disponible=False."""
    db = _db(request)
    from data_developments import DEVELOPMENTS_BY_ID, colonia_slug
    dev = DEVELOPMENTS_BY_ID.get(dev_id) or await db.developments.find_one({"id": dev_id}, {"_id": 0}) or {}
    colonia = (dev.get("colonia") or "").lower()
    cslug = colonia_slug(dev.get("colonia")) if dev.get("colonia") else ""
    # scores por asesor
    scores = {}
    async for t in db.asesor_trust_scores.find({}, {"_id": 0, "asesor_id": 1, "score": 1}):
        scores[t.get("asesor_id")] = t.get("score")
    mejor, mejor_zona = None, False
    async for p in db.asesor_profiles.find({"profile_completed": {"$ne": False}}, {"_id": 0}):
        cols = [str(c).lower() for c in (p.get("colonias") or [])]
        en_zona = bool(colonia and any(colonia in c or cslug in colonia_slug(c) for c in cols))
        sc = scores.get(p.get("user_id")) or 0
        # prioriza especialista de la zona; a igualdad, mayor score
        cand_key = (1 if en_zona else 0, sc)
        best_key = (1 if mejor_zona else 0, (scores.get((mejor or {}).get("user_id")) or 0)) if mejor else (-1, -1)
        if cand_key > best_key:
            mejor, mejor_zona = p, en_zona
    if not mejor:
        return {"disponible": False}
    return {
        "disponible": True,
        "nombre": mejor.get("full_name") or "Asesor verificado",
        "brokerage": mejor.get("brokerage"),
        "colonias": (mejor.get("colonias") or [])[:4],
        "confianza": scores.get(mejor.get("user_id")),
        "especialista_zona": mejor_zona,
        "nota": "Asesor verificado por DMX. La asignación final se confirma al contactar.",
    }


@router.get("/api/developers/{developer_id}/track-record")
async def developer_track_record(developer_id: str, request: Request):
    """Track record VERIFICABLE del desarrollador (checklist devs destacados): % en tiempo + plusvalía durante
    obra, medido de datos reales del sistema (no auto-reportado). Se prende con más proyectos/entregas."""
    from developer_track_record_engine import compute_developer_track_record
    return await compute_developer_track_record(_db(request), developer_id)


@router.get("/api/developments/{dev_id}/ticker")
async def asset_ticker(dev_id: str, request: Request):
    """TICKER DE CALIFICACIÓN DMX por activo (público): el 'número tipo bolsa' del desarrollo — calificación
    A–E + desglose multi-factor (precio justo / plusvalía / riesgo / rendimiento / demanda) con su 'por qué'.
    ENSAMBLADOR: reúne motores que YA existen (colonia_valoracion, zone_scores, units), no duplica. Fail-open
    por factor: se prende solo conforme cada dato entra."""
    db = _db(request)
    from data_developments import DEVELOPMENTS_BY_ID, colonia_slug
    dev = DEVELOPMENTS_BY_ID.get(dev_id) or await db.developments.find_one({"id": dev_id}, {"_id": 0}) or {}
    colonia, cid, alc = dev.get("colonia"), dev.get("colonia_id"), dev.get("alcaldia")
    cv = await _resolver_colonia_doc(db, cid or (colonia_slug(colonia) if colonia else ""),
                                     {"_id": 0, "market_m2": 1, "plusvalia": 1, "colonia_id": 1})
    ref = ((cv or {}).get("market_m2") or {}).get("valor")
    # $/m² mediano del desarrollo (db.units o seed embebido)
    ppm2s = []
    async for u in db.units.find({"development_id": dev_id, "price": {"$gt": 0}, "m2_total": {"$gt": 0}},
                                 {"_id": 0, "price": 1, "m2_total": 1}):
        ppm2s.append(u["price"] / u["m2_total"])
    if not ppm2s:
        for u in (dev.get("units") or []):
            p, m = u.get("price"), (u.get("m2_total") or u.get("m2_privative"))
            if p and m:
                ppm2s.append(p / m)
    med = sorted(ppm2s)[len(ppm2s) // 2] if ppm2s else None
    sobre = round((med / ref - 1) * 100, 1) if (med and ref) else None
    # factores de zona
    czs = (cv or {}).get("colonia_id")
    zs = await db.zone_scores.find_one({"zone_id": {"$in": [czs, cid, colonia_slug(colonia) if colonia else ""]}},
                                       {"_id": 0, "components": 1}) if (czs or cid or colonia) else None
    comp = (zs or {}).get("components") or {}
    serie = ((cv or {}).get("plusvalia") or {}).get("series") or []
    yoy = serie[-1].get("yoy_pct") if serie else None

    def _clamp(x):
        return max(0, min(100, x))
    factores = []
    if sobre is not None:
        factores.append({"factor": "Precio justo", "valor": round(_clamp(60 - sobre * 2)),
                         "porque": (f"{abs(sobre):.0f}% {'bajo' if sobre < 0 else 'sobre'} el mercado de la colonia")})
    if yoy is not None:
        factores.append({"factor": "Plusvalía", "valor": round(_clamp(40 + yoy * 20)),
                         "porque": f"la colonia aprecia {yoy}% al año"})
    if comp.get("risk") is not None:
        factores.append({"factor": "Riesgo (menor = mejor)", "valor": round(_clamp(100 - comp["risk"])),
                         "porque": "riesgo de zona medido"})
    if comp.get("yield_score") is not None:
        factores.append({"factor": "Rendimiento de renta", "valor": round(_clamp(comp["yield_score"])),
                         "porque": "potencial de renta de la zona"})
    if comp.get("demand") is not None:
        factores.append({"factor": "Demanda", "valor": round(_clamp(comp["demand"])),
                         "porque": "interés de compradores en la zona"})
    if not factores:
        return {"dev_id": dev_id, "disponible": False,
                "nota": "Aún sin datos suficientes para calificar este activo."}
    score = round(sum(f["valor"] for f in factores) / len(factores))
    return {"dev_id": dev_id, "name": dev.get("name"), "colonia": colonia, "alcaldia": alc,
            "disponible": True, "score": score, "grade": _grade_ticker(score),
            "n_factores": len(factores), "factores": factores,
            "nota": "Calificación multi-factor sobre datos de mercado. Análisis, no asesoría."}


@router.get("/api/ideas")
async def get_ideas(request: Request, limit: int = Query(12, ge=1, le=30)):
    """FEED DE IDEAS — muro de oportunidades vivas: zonas emergentes (gentrificación en ascenso) + zonas bajo
    el mercado CDMX. Cada idea = zona + tesis + qué la disparó + link a fundamentales. Reusa el screener (no
    duplica motor). Se prende solo con las ~2788 colonias ya cargadas."""
    db = _db(request)
    ideas, vistos = [], set()

    def _push(r, tipo, tesis, disparo):
        cid = r.get("colonia_id")
        if not cid or cid in vistos:
            return
        vistos.add(cid)
        ideas.append({
            "colonia_id": cid, "name": r.get("name"), "alcaldia": r.get("alcaldia"),
            "tipo": tipo, "tesis": tesis, "disparo": disparo,
            "precio_m2": r.get("precio_m2"), "plusvalia_yoy": r.get("yoy"),
            "vs_cdmx_precio_pct": r.get("vs_cdmx_precio_pct"), "gentrif": r.get("gentrif"),
        })
    try:
        # 1) Emergentes: gentrificación en ascenso
        emg = await pe.screener(db, {"gentrif_min": 45}, orden="emergentes", limit=limit)
        for r in emg[: max(3, limit // 2)]:
            g = round(r.get("gentrif") or 0)
            _push(r, "emergente", f"{r.get('name')}: gentrificación en ascenso (score {g}) — entra antes de que suba.",
                  f"Gentrificación {g}")
        # 2) Bajo el mercado: precio por debajo de la mediana CDMX
        baj = await pe.screener(db, {}, orden="plusvalia", limit=80)
        baj = [r for r in baj if (r.get("vs_cdmx_precio_pct") or 0) < -5]
        baj.sort(key=lambda r: (r.get("vs_cdmx_precio_pct") or 0))
        for r in baj[: max(3, limit // 2)]:
            v = r.get("vs_cdmx_precio_pct")
            _push(r, "oportunidad", f"{r.get('name')}: {v}% bajo el mercado CDMX y aún apreciando — posible entrada.",
                  f"{v}% vs CDMX")
    except Exception:
        pass
    return {"ideas": ideas[:limit], "total": len(ideas[:limit])}


@router.get("/api/lo-mas-buscado")
async def lo_mas_buscado(request: Request, limit: int = Query(6, ge=1, le=20)):
    """LO MÁS BUSCADO EN DMX (social proof real): top colonias por señales de demanda (buyer_signals).
    Da sensación de mercado vivo y demanda. Dato propietario ya capturado, ahora visible."""
    db = _db(request)
    proj = {"_id": 0, "name": 1, "market_m2": 1, "plusvalia": 1, "alcaldia": 1, "colonia_id": 1}
    agg: dict = {}
    try:
        # trae más crudos para poder CANONICALIZAR (variantes del mismo lugar) antes de tomar el top
        pipe = [{"$match": {"colonia": {"$ne": None}}},
                {"$group": {"_id": "$colonia", "n": {"$sum": 1}}},
                {"$sort": {"n": -1}}, {"$limit": limit * 4}]
        for r in [x async for x in db.buyer_signals.aggregate(pipe)]:
            slug = r["_id"]
            cv = await _resolver_colonia_doc(db, slug, proj)
            cid = (cv or {}).get("colonia_id") or slug
            if cid not in agg:
                agg[cid] = {
                    "colonia_slug": (cv or {}).get("colonia_id") or slug,
                    "name": (cv or {}).get("name") or " ".join(w.capitalize() for w in str(slug).replace("-", " ").split()),
                    "alcaldia": (cv or {}).get("alcaldia"), "senales": 0,
                    "precio_m2": ((cv or {}).get("market_m2") or {}).get("valor"),
                    "plusvalia": (cv or {}).get("plusvalia")}
            agg[cid]["senales"] += r["n"]
    except Exception:
        pass
    out = sorted(agg.values(), key=lambda x: -x["senales"])[:limit]
    return {"top": out, "total_senales": sum(x["senales"] for x in out)}


async def _backtest_cierres_reales(db):
    """Backtest del modelo contra CIERRES DE VENTA REALES (db.transactions) — $0, pura aritmética, sin IA:
    compara el $/m² de cierre vs el $/m² de mercado (AVM) de su colonia. El Espejo con dato real, no golden."""
    market = {}
    async for c in db.colonia_valoracion.find({"market_m2.valor": {"$ne": None}}, {"_id": 0, "colonia_id": 1, "market_m2": 1}):
        market[c["colonia_id"]] = float(c["market_m2"]["valor"])
    todos, errs = [], []
    async for t in db.transactions.find({"closing_price_mxn": {"$gt": 0}, "m2": {"$gt": 0}, "zone_id": {"$ne": None}},
                                        {"_id": 0, "zone_id": 1, "closing_price_mxn": 1, "m2": 1}):
        ref = market.get(t["zone_id"])
        if not ref:
            continue
        e = abs((t["closing_price_mxn"] / t["m2"]) / ref - 1) * 100
        todos.append(e)
        if e <= 60:   # descarta outliers de referencia mala (colonia mal cruzada)
            errs.append(e)
    if not errs:
        return None
    # Fix auditoría (transparencia radical): declaramos el recorte — publicamos el MAPE recortado Y el crudo.
    return {"mape_pct": round(sum(errs) / len(errs), 2), "n": len(errs),
            "dentro_10_pct": round(100 * sum(1 for e in errs if e <= 10) / len(errs)),
            "dentro_20_pct": round(100 * sum(1 for e in errs if e <= 20) / len(errs)),
            "mape_sin_recorte_pct": round(sum(todos) / len(todos), 2), "n_total": len(todos),
            "excluidos": len(todos) - len(errs)}


@router.get("/api/modelo/espejo")
async def get_espejo(request: Request):
    """EL ESPEJO DEL MODELO (público): qué tan acertado es nuestro AVM. Dos pruebas: contra casos de control
    (golden) y contra CIERRES DE VENTA REALES (transactions). Transparencia radical — publicamos el error. Sin IA."""
    db = _db(request)
    out = {"mape_pct": None, "evaluados": 0}
    try:
        from golden_avm_data import validate_against_engine
        r = await validate_against_engine(db)
        ev = r.get("evaluated") or 0
        out = {
            "mape_pct": r.get("mape_pct"),
            "dentro_10_pct": round(100 * (r.get("within_10pct") or 0) / ev) if ev else None,
            "dentro_20_pct": round(100 * (r.get("within_20pct") or 0) / ev) if ev else None,
            "evaluados": ev, "total_casos": r.get("total_cases"),
            "fuente": "validación contra dataset de control (golden)",
        }
    except Exception:
        pass
    try:
        cr = await _backtest_cierres_reales(db)
        if cr:
            out["cierres_reales"] = cr
    except Exception:
        pass
    return out


async def _require_superadmin(request: Request):
    from routes.bulk_ingest import _require_superadmin as req
    return await req(request)


@router.post("/api/superadmin/picks/generate")
async def generate_picks(request: Request, n: int = Query(5, ge=1, le=20)):
    """Congela los picks del mes (las 5 estrategias). Idempotente por mes. Cron mensual lo llama."""
    await _require_superadmin(request)
    return await pe.generar_todos(_db(request), n=n)


@router.post("/api/superadmin/picks/evaluate")
async def evaluate_picks(request: Request):
    """Cierra los picks cuyo horizonte venció → resultado (acierto/fallo). Construye el track record."""
    await _require_superadmin(request)
    return await pe.evaluar_picks(_db(request))
