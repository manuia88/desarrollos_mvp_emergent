"""W7.AS.3.F · Conversation Cost — superadmin REST routes.

4 endpoints (todos require_superadmin · rate-limit 30/min por usuario):
  GET /api/superadmin/conversation-cost/tenant-cost?tenant_id=&days=
  GET /api/superadmin/conversation-cost/top-expensive?days=&limit=
  GET /api/superadmin/conversation-cost/model-distribution?days=
  GET /api/superadmin/conversation-cost/stats-summary?days=

Pure module — Terminal D incluye este router en server.py durante su merge.
"""
from __future__ import annotations

import logging
import time
from collections import defaultdict
from typing import Dict, List

from fastapi import APIRouter, HTTPException, Query, Request

from conversation_cost_stats_engine import (
    get_tenant_cost,
    get_top_expensive,
    get_model_distribution,
    get_stats_summary,
)

log = logging.getLogger("dmx.routes_conversation_cost")

router = APIRouter(prefix="/api/superadmin/conversation-cost", tags=["conversation-cost"])

# ─── Rate limit · 30 req/min por usuario (FAIL-OPEN si key ausente) ────────────
RATE_LIMIT = 30
RATE_WINDOW_S = 60
_buckets: Dict[str, List[float]] = defaultdict(list)


def _check_rate(key: str, limit: int = RATE_LIMIT, window_s: int = RATE_WINDOW_S) -> bool:
    """Sliding-window limiter. Returns False when over the cap."""
    if not key:
        return True  # fail-open
    now = time.monotonic()
    _buckets[key] = [t for t in _buckets[key] if now - t < window_s]
    if len(_buckets[key]) >= limit:
        return False
    _buckets[key].append(now)
    return True


async def _require_superadmin(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    if getattr(user, "role", "") != "superadmin":
        raise HTTPException(403, "Solo superadmin")
    # rate limit per superadmin user
    if not _check_rate(getattr(user, "user_id", None) or "sa"):
        raise HTTPException(429, "Demasiadas solicitudes, intenta en un momento")
    return user


# ─── Endpoints ──────────────────────────────────────────────────────────────
@router.get("/tenant-cost")
async def tenant_cost(
    request: Request,
    tenant_id: str = Query(..., min_length=1),
    days: int = Query(30, ge=1, le=365),
):
    await _require_superadmin(request)
    db = request.app.state.db
    return await get_tenant_cost(db, tenant_id, days=days)


@router.get("/top-expensive")
async def top_expensive(
    request: Request,
    days: int = Query(30, ge=1, le=365),
    limit: int = Query(10, ge=1, le=100),
):
    await _require_superadmin(request)
    db = request.app.state.db
    items = await get_top_expensive(db, days=days, limit=limit)
    return {"days": days, "count": len(items), "conversations": items}


@router.get("/model-distribution")
async def model_distribution(
    request: Request,
    days: int = Query(30, ge=1, le=365),
):
    await _require_superadmin(request)
    db = request.app.state.db
    return await get_model_distribution(db, days=days)


@router.get("/stats-summary")
async def stats_summary(
    request: Request,
    days: int = Query(30, ge=1, le=365),
):
    await _require_superadmin(request)
    db = request.app.state.db
    return await get_stats_summary(db, days=days)
