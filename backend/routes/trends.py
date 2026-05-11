"""W4.18.1 — Apify Google Trends · Superadmin REST routes.

Endpoints (todos /api/superadmin/trends/* requieren rol superadmin):
  GET    /api/superadmin/trends/lookup        — lookup con cache 7d
  GET    /api/superadmin/trends/cache/stats   — métricas del cache
  GET    /api/superadmin/trends/cache         — lista entries recientes
  DELETE /api/superadmin/trends/cache/{cache_key} — invalidate manual
  POST   /api/superadmin/trends/refresh       — fuerza refresh batch (curated)
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request

from apify_trends_engine import (
    ApifyTrendsEngine,
    CURATED_HOT_KEYWORDS,
    CURATED_WEEKLY_KEYWORDS,
    DEFAULT_GEO,
    DEFAULT_TIMEFRAME,
)

log = logging.getLogger("dmx.routes_trends")

router = APIRouter(prefix="/api/superadmin/trends", tags=["superadmin-trends"])


async def _require_superadmin(request: Request):
    from permissions import require_superadmin
    await require_superadmin(request)


@router.get("/lookup")
async def trends_lookup(
    request: Request,
    query: str = Query(..., min_length=2, max_length=120),
    geo: str = Query(DEFAULT_GEO, max_length=12),
    timeframe: str = Query(DEFAULT_TIMEFRAME, max_length=24),
    category: Optional[str] = Query(None, max_length=24),
    force_refresh: bool = Query(False),
    wait_for_result: bool = Query(True),
):
    await _require_superadmin(request)
    db = request.app.state.db
    engine = ApifyTrendsEngine(db)
    try:
        result = await engine.get_trends_for_query(
            query=query, geo=geo, timeframe=timeframe,
            category=category, force_refresh=force_refresh,
            wait_for_result=wait_for_result,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"ok": True, "result": result}


@router.get("/cache/stats")
async def trends_cache_stats(request: Request):
    await _require_superadmin(request)
    db = request.app.state.db
    engine = ApifyTrendsEngine(db)
    return {"ok": True, "stats": await engine.cache_stats()}


@router.get("/cache")
async def trends_cache_list(
    request: Request,
    limit: int = Query(50, ge=1, le=200),
):
    await _require_superadmin(request)
    db = request.app.state.db
    engine = ApifyTrendsEngine(db)
    rows = await engine.list_recent(limit=limit)
    return {"ok": True, "count": len(rows), "entries": rows}


@router.delete("/cache/{cache_key}")
async def trends_cache_invalidate(cache_key: str, request: Request):
    """Invalidación manual de un entry del cache.

    cache_key es el SHA1 derivado de "{query}|{geo}|{timeframe}". El cliente
    lo recibe en el response del lookup vía la lista (`/cache`).
    """
    await _require_superadmin(request)
    db = request.app.state.db
    engine = ApifyTrendsEngine(db)
    deleted = await engine.invalidate(cache_key)
    if not deleted:
        raise HTTPException(404, "cache_key no encontrado")
    return {"ok": True, "cache_key": cache_key, "deleted": True}


@router.post("/refresh")
async def trends_refresh_batch(
    request: Request,
    scope: str = Query("daily", pattern=r"^(daily|weekly)$"),
):
    """Dispara refresh manual del batch curated (daily=hot keywords, weekly=zonas)."""
    await _require_superadmin(request)
    db = request.app.state.db
    from apify_trends_engine import run_trends_daily_refresh, run_trends_weekly_refresh
    if scope == "daily":
        result = await run_trends_daily_refresh(db)
    else:
        result = await run_trends_weekly_refresh(db)
    return {"ok": True, **result}


@router.get("/keywords")
async def trends_keywords(request: Request):
    """Devuelve listas curated de keywords (read-only para UI)."""
    await _require_superadmin(request)
    return {
        "ok": True,
        "daily_hot": CURATED_HOT_KEYWORDS,
        "weekly_zones": CURATED_WEEKLY_KEYWORDS,
        "default_geo": DEFAULT_GEO,
        "default_timeframe": DEFAULT_TIMEFRAME,
    }
