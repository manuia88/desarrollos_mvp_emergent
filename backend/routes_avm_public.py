"""W4.18.2B Sub-D — AVM público routes + rate limit IP.

Rate limit 30/min/IP (in-memory bucket). Para prod cambiar a Redis.
"""
from __future__ import annotations

import time
from collections import defaultdict, deque
from typing import Deque, Dict
from fastapi import APIRouter, HTTPException, Request, Query
from fastapi.responses import JSONResponse

import avm_public_engine as eng

router = APIRouter()

# In-memory rate-limit bucket
_RL_BUCKET: Dict[str, Deque[float]] = defaultdict(deque)
RL_LIMIT = 30
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


@router.get("/api/avm-public/quick")
async def avm_quick_endpoint(
    request: Request,
    colonia_slug: str = Query(...),
    m2: float = Query(..., gt=0, le=10000),
    recamaras: int = Query(..., ge=0, le=15),
    banos: int = Query(..., ge=0, le=15),
    antiguedad_anos: int = Query(..., ge=0, le=200),
):
    _rate_limit_check(_client_ip(request))
    out = eng.avm_quick(colonia_slug, m2, recamaras, banos, antiguedad_anos)
    if "error" in out:
        raise HTTPException(404, out["error"])
    return JSONResponse({"ok": True, **out})


@router.get("/api/avm-public/colonia/{slug}")
async def colonia_stats_endpoint(slug: str, request: Request):
    _rate_limit_check(_client_ip(request))
    out = eng.colonia_stats(slug)
    if "error" in out:
        raise HTTPException(404, out["error"])
    return JSONResponse({"ok": True, **out})


@router.get("/api/avm-public/colonias/top")
async def top_colonias(limit: int = Query(30, ge=1, le=100)):
    return JSONResponse({"ok": True, "colonias": eng.list_top_colonias(limit), "limit": limit})
