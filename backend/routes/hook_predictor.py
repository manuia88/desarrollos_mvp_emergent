"""W5.22 Z.5 — Hook Predictor REST routes.

Endpoints:
  POST  /api/hook-predictor/score                        (T2+ advisor)
  GET   /api/hook-predictor/stats?days=30                (T2+ advisor · own stats)
  GET   /api/superadmin/hook-predictor/stats-global      (superadmin)

Rate limit per user: 30/min (in-process bucket).
"""
from __future__ import annotations

import logging
import time
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from hook_predictor_engine import (
    DEFAULT_THRESHOLD,
    get_stats,
    get_stats_global,
    predict_hook_score,
)

log = logging.getLogger("dmx.routes_hook_predictor")

router = APIRouter(tags=["hook-predictor"])

ADVISOR_ROLES = {
    "advisor", "asesor", "asesor_admin", "asesor_freelance",
    "inmobiliaria_admin", "inmobiliaria_director", "inmobiliaria_member",
    "developer_admin", "developer_member",
    "superadmin",
}

# In-process rate limit per user · 30 calls/min
_USER_BUCKETS: Dict[str, List[float]] = {}
_USER_CAP = 30


def _check_rate(user_id: str) -> bool:
    now = time.monotonic()
    bucket = _USER_BUCKETS.setdefault(user_id, [])
    _USER_BUCKETS[user_id] = [t for t in bucket if now - t < 60]
    if len(_USER_BUCKETS[user_id]) >= _USER_CAP:
        return False
    _USER_BUCKETS[user_id].append(now)
    return True


async def _get_user(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    return user


async def _require_advisor(request: Request):
    user = await _get_user(request)
    role = getattr(user, "role", "") or ""
    if role not in ADVISOR_ROLES:
        raise HTTPException(403, "Rol no autorizado")
    if not _check_rate(getattr(user, "user_id", "anon")):
        raise HTTPException(429, "Rate limit (30 calls/min). Intenta más tarde.")
    return user


async def _require_superadmin(request: Request):
    user = await _get_user(request)
    if getattr(user, "role", "") != "superadmin":
        raise HTTPException(403, "Solo superadmin")
    if not _check_rate(getattr(user, "user_id", "anon")):
        raise HTTPException(429, "Rate limit (30 calls/min). Intenta más tarde.")
    return user


# ─── Schemas ──────────────────────────────────────────────────────────────────
class ScoreIn(BaseModel):
    text: str = Field(..., min_length=1, max_length=500)
    target_audience: Optional[str] = Field(default=None, max_length=200)


# ─── Endpoints ────────────────────────────────────────────────────────────────
@router.post("/api/hook-predictor/score")
async def post_score(payload: ScoreIn, request: Request):
    user = await _require_advisor(request)
    db = request.app.state.db
    result = await predict_hook_score(
        db,
        text=payload.text,
        target_audience=payload.target_audience,
        user=user,
        request=request,
    )
    return result


@router.get("/api/hook-predictor/stats")
async def get_my_stats(request: Request, days: int = Query(default=30, ge=1, le=365)):
    user = await _require_advisor(request)
    db = request.app.state.db
    user_id = getattr(user, "user_id", None)
    stats = await get_stats(db, user_id=user_id, days=days)
    stats["threshold"] = DEFAULT_THRESHOLD
    return stats


@router.get("/api/superadmin/hook-predictor/stats-global")
async def get_global_stats(request: Request, days: int = Query(default=30, ge=1, le=365)):
    await _require_superadmin(request)
    db = request.app.state.db
    stats = await get_stats_global(db, days=days)
    stats["threshold"] = DEFAULT_THRESHOLD
    return stats
