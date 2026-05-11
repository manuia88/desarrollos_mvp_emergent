"""W4.16 Sub-B — State of CDMX Report API routes."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse, JSONResponse

import state_of_cdmx_engine as engine

log = logging.getLogger("dmx.routes_state_of_cdmx")
router = APIRouter()


def _db(request: Request):
    return request.app.state.db


@router.get("/api/state-of-cdmx")
async def latest(request: Request):
    db = _db(request)
    metrics = await engine.get_or_compute(db, engine.current_period())
    metrics.pop("_id", None)
    return JSONResponse({"ok": True, "metrics": metrics})


@router.get("/api/state-of-cdmx/og-image/{period}.png")
async def og_image(request: Request, period: str):
    db = _db(request)
    metrics = await engine.get_or_compute(db, period)
    path = engine.render_og_image(period, metrics)
    return FileResponse(
        str(path),
        media_type="image/png",
        headers={
            "Cache-Control": "public, max-age=86400",
            "Access-Control-Allow-Origin": "*",
        },
    )


@router.get("/api/state-of-cdmx/{period}")
async def get_metrics(request: Request, period: str):
    db = _db(request)
    metrics = await engine.get_or_compute(db, period)
    metrics.pop("_id", None)
    return JSONResponse(
        {"ok": True, "metrics": metrics},
        headers={"Cache-Control": "public, max-age=86400"},
    )
