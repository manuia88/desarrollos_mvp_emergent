"""W5.2 Sub-A — Zone Score público desagregado.

Endpoints:
  GET /api/zones-public/{slug}          · zone + 6 sub-scores + narratives
  GET /api/zones-public/top?subscore=X  · top N colonias por sub-score

Rate-limit 60/min/IP (in-memory).
"""
from __future__ import annotations

import time
from collections import defaultdict, deque
from typing import Deque, Dict, List

from fastapi import APIRouter, HTTPException, Request, Query
from fastapi.responses import JSONResponse

from zone_score_engine import (
    get_zone_with_subscores,
    list_top_zones_by_subscore,
    SUBSCORE_KEYS,
)

router = APIRouter()

_RL_BUCKET: Dict[str, Deque[float]] = defaultdict(deque)
RL_LIMIT = 60
RL_WINDOW_S = 60


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    if fwd:
        return fwd
    return request.client.host if request.client else "unknown"


def _rate_limit_check(ip: str) -> None:
    now = time.time()
    bucket = _RL_BUCKET[ip]
    while bucket and (now - bucket[0]) > RL_WINDOW_S:
        bucket.popleft()
    if len(bucket) >= RL_LIMIT:
        raise HTTPException(429, "rate_limit_exceeded")
    bucket.append(now)


@router.get("/api/zones-public/top")
async def zones_top_by_subscore(
    request: Request,
    subscore: str = Query(...),
    limit: int = Query(20, ge=1, le=50),
):
    _rate_limit_check(_client_ip(request))
    if subscore not in SUBSCORE_KEYS:
        raise HTTPException(400, f"invalid_subscore · must be one of {list(SUBSCORE_KEYS)}")
    items = await list_top_zones_by_subscore(request.app.state.db, subscore, limit)
    return JSONResponse({
        "ok": True,
        "theme": subscore,
        "items": items,
        "count": len(items),
    })


@router.get("/api/zones-public/{slug}")
async def zone_public_detail(slug: str, request: Request):
    _rate_limit_check(_client_ip(request))
    out = await get_zone_with_subscores(request.app.state.db, slug)
    return JSONResponse({"ok": True, **out})
