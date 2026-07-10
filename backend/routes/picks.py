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
