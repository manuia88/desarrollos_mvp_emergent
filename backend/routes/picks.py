"""DMX Picks IA — endpoints (founder 07-09). Público: picks vigentes por estrategia + track record.
Superadmin: generar (cron mensual) + evaluar (cierra horizontes → construye el track record)."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, Query
from typing import Optional

import picks_engine as pe

router = APIRouter(tags=["picks"])


def _db(request: Request):
    return request.app.state.db


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


@router.get("/api/picks/unidades")
async def get_picks_unidades(request: Request, estrategia: str = Query("oportunidad"),
                             presupuesto: Optional[float] = Query(None), alcaldia: Optional[str] = Query(None),
                             recamaras: Optional[int] = Query(None), n: int = Query(12, ge=1, le=40)):
    """Picks a nivel UNIDAD (el átomo): los mejores departamentos disponibles, no solo la mejor colonia."""
    picks = await pe.picks_unidades(_db(request), estrategia=estrategia, n=n,
                                    presupuesto=presupuesto, alcaldia=alcaldia, recamaras=recamaras)
    return {"estrategia": estrategia, "label": pe._ULABEL.get(estrategia), "picks": picks,
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
    _RISK_LBL = {"bajo": "Bajo", "medio": "Medio", "alto": "Alto"}
    cv = await db.colonia_valoracion.find_one(
        {"colonia_id": {"$regex": f"^{slug}", "$options": "i"}},
        {"_id": 0, "name": 1, "alcaldia": 1, "market_m2": 1, "plusvalia": 1, "gentrification": 1, "colonia_id": 1})
    zs = await db.zone_scores.find_one({"zone_id": slug}, {"_id": 0, "components": 1, "score_letter": 1, "score_numeric": 1})
    comp = (zs or {}).get("components") or {}
    # Señal transaccional real (cierres) de la zona
    tx = {"n": 0}
    try:
        pipe = [{"$match": {"zone_id": slug, "closing_price_mxn": {"$gt": 0}, "m2": {"$gt": 0}}},
                {"$group": {"_id": None, "n": {"$sum": 1},
                            "dom": {"$avg": "$days_on_market"}, "desc": {"$avg": "$discount_pct"},
                            "ppm2": {"$avg": {"$divide": ["$closing_price_mxn", "$m2"]}}}}]
        r = await db.transactions.aggregate(pipe).to_list(1)
        if r:
            tx = {"n": r[0]["n"], "dom_prom": round(r[0]["dom"] or 0), "descuento_prom": round(r[0]["desc"] or 0, 1),
                  "precio_m2_cierres": round(r[0]["ppm2"] or 0)}
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
        "calificacion": (zs or {}).get("score_letter"),
        "precio_m2": ((cv or {}).get("market_m2") or {}).get("valor"),
        "precio_muestra_n": ((cv or {}).get("market_m2") or {}).get("muestra_n"),
        "plusvalia_yoy": (serie[-1]["yoy"] if serie else None),
        "plusvalia_serie": serie,
        "gentrificacion": {"score": gent.get("score"), "nivel": gent.get("nivel"),
                           "componentes": [{"nombre": c.get("nombre"), "valor": c.get("valor"), "fuente": c.get("fuente")}
                                           for c in (gent.get("componentes") or [])]},
        "fundamentos": {
            "liquidez": comp.get("liquidez"), "demanda": comp.get("demand"), "oferta": comp.get("supply"),
            "riesgo": _riesgo(comp.get("risk")), "yield_score": comp.get("yield_score"),
            "servicios_cercanos": comp.get("denue_density"),
        },
        "transaccional": tx,
    }


@router.get("/api/lo-mas-buscado")
async def lo_mas_buscado(request: Request, limit: int = Query(6, ge=1, le=20)):
    """LO MÁS BUSCADO EN DMX (social proof real): top colonias por señales de demanda (buyer_signals).
    Da sensación de mercado vivo y demanda. Dato propietario ya capturado, ahora visible."""
    db = _db(request)
    out = []
    try:
        pipe = [{"$match": {"colonia": {"$ne": None}}},
                {"$group": {"_id": "$colonia", "n": {"$sum": 1}}},
                {"$sort": {"n": -1}}, {"$limit": limit}]
        rows = [r async for r in db.buyer_signals.aggregate(pipe)]
        for r in rows:
            slug = r["_id"]
            nombre = " ".join(w.capitalize() for w in str(slug).replace("-", " ").split())
            cv = await db.colonia_valoracion.find_one(
                {"colonia_id": {"$regex": f"^{slug}", "$options": "i"}},
                {"_id": 0, "name": 1, "market_m2": 1, "plusvalia": 1, "alcaldia": 1})
            out.append({
                "colonia_slug": slug,
                "name": (cv or {}).get("name") or nombre,
                "alcaldia": (cv or {}).get("alcaldia"),
                "senales": r["n"],
                "precio_m2": ((cv or {}).get("market_m2") or {}).get("valor"),
                "plusvalia": (cv or {}).get("plusvalia"),
            })
    except Exception:
        pass
    return {"top": out, "total_senales": sum(x["senales"] for x in out)}


@router.get("/api/modelo/espejo")
async def get_espejo(request: Request):
    """EL ESPEJO DEL MODELO (público): qué tan acertado es nuestro AVM contra casos reales de control (golden).
    Transparencia radical — publicamos nuestro margen de error. Corre el AVM (sin IA), no expone los casos."""
    try:
        from golden_avm_data import validate_against_engine
        r = await validate_against_engine(_db(request))
        ev = r.get("evaluated") or 0
        return {
            "mape_pct": r.get("mape_pct"),
            "dentro_10_pct": round(100 * (r.get("within_10pct") or 0) / ev) if ev else None,
            "dentro_20_pct": round(100 * (r.get("within_20pct") or 0) / ev) if ev else None,
            "evaluados": ev, "total_casos": r.get("total_cases"),
            "fuente": "validación contra dataset de control (casos reales) — no cierres de venta aún",
        }
    except Exception:
        return {"mape_pct": None, "evaluados": 0, "nota": "espejo no disponible"}


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
