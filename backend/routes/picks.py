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
