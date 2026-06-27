"""F0.1 Sub-A — Score Inversión routes (public, rate-limited)."""
from __future__ import annotations

import logging
import time
from collections import defaultdict, deque
from typing import Deque, Dict, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import JSONResponse

import score_inversion_engine as engine

log = logging.getLogger("dmx.routes_score_inversion")
router = APIRouter()

_RL_BUCKET: Dict[str, Deque[float]] = defaultdict(deque)
RL_MAX = 30
RL_WINDOW_S = 60


def _db(request: Request):
    return request.app.state.db


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    return fwd or (request.client.host if request.client else "unknown")


def _rate_limit(ip: str) -> None:
    now = time.time()
    q = _RL_BUCKET[ip]
    while q and (now - q[0]) > RL_WINDOW_S:
        q.popleft()
    if len(q) >= RL_MAX:
        raise HTTPException(429, "Too many requests · retry in 1 min",
                            headers={"Retry-After": "60"})
    q.append(now)


@router.get("/api/investment-simulator/score")
async def score_route(
    request: Request,
    colonia_slug: str = Query(..., min_length=1),
    precio: float = Query(..., gt=0),
    plazo: int = Query(24, ge=1, le=240),
    m2: float = Query(80.0, gt=0, le=5000),
    recamaras: int = Query(2, ge=0, le=20),
    banos: int = Query(2, ge=0, le=20),
    antiguedad_anos: int = Query(0, ge=0, le=200),
):
    _rate_limit(_client_ip(request))
    db = _db(request)
    doc = await engine.compute_score(
        db, colonia_slug=colonia_slug, precio=precio,
        plazo_meses=plazo, m2=m2, recamaras=recamaras,
        banos=banos, antiguedad_anos=antiguedad_anos,
    )
    doc.pop("_id", None)
    # Option A (pentest 2026-06-27): quita los PESOS de la fórmula (weight_pct/raw) de cada factor — el público
    # ve el score y la contribución de cada factor, no la receta (los pesos exactos = moat replicable).
    for _f in (doc.get("factors") or {}).values():
        if isinstance(_f, dict):
            _f.pop("weight_pct", None)
            _f.pop("raw", None)
    return JSONResponse({"ok": True, "score": doc})


@router.get("/api/investment-simulator/score/top-colonias")
async def top_colonias_route(
    request: Request,
    period: Optional[str] = Query(None),
    limit: int = Query(10, ge=1, le=50),
):
    _rate_limit(_client_ip(request))
    db = _db(request)
    items = await engine.top_colonias_by_score(db, period=period, limit=limit)
    return JSONResponse(
        {"ok": True, "items": items, "count": len(items), "period": period or ""},
        headers={"Cache-Control": "public, max-age=86400"},
    )
