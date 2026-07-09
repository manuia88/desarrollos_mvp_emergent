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
async def get_picks(request: Request, estrategia: Optional[str] = Query(None)):
    """Picks vigentes (público, imán de leads). Con estrategia filtra; sin ella, agrupa las 5."""
    db = _db(request)
    if estrategia:
        return {"estrategia": estrategia, "picks": await pe.picks_vigentes(db, estrategia)}
    out = {}
    for e in pe.ESTRATEGIAS:
        out[e] = {"label": pe._LABEL[e], "picks": await pe.picks_vigentes(db, e, limit=8)}
    return {"estrategias": out}


@router.get("/api/picks/track-record")
async def get_track_record(request: Request):
    """Ganadoras anteriores con transparencia radical (aciertos Y fallos). El moat de credibilidad."""
    return await pe.track_record(_db(request))


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
