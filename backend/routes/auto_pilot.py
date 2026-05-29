"""P5.A · Auto-pilot · endpoints (config + log + kill switch + run-now).

Router propio · reusa require_advisor/get_db de routes.advisor (import · NO modifica).
Todos _assert owner (require_advisor + scope user_id). run-now rate-limit 3/h.
"""
from __future__ import annotations

import logging
import time
from typing import Dict

from fastapi import APIRouter, HTTPException, Request

from routes.advisor import require_advisor, get_db
import auto_pilot_engine as ap

log = logging.getLogger("dmx.routes.auto_pilot")

router = APIRouter(prefix="/api/asesor/autopilot", tags=["autopilot"])

# Rate-limit run-now: 3/h/usuario (in-memory · best-effort).
_run_buckets: Dict[str, list] = {}


def _check_run_rate(user_id: str, limit: int = 3, window_s: int = 3600) -> bool:
    now = time.monotonic()
    bucket = [t for t in _run_buckets.get(user_id, []) if now - t < window_s]
    if len(bucket) >= limit:
        _run_buckets[user_id] = bucket
        return False
    bucket.append(now)
    _run_buckets[user_id] = bucket
    return True


@router.get("/config")
async def get_config(request: Request):
    user = await require_advisor(request)
    db = get_db(request)
    return await ap.get_autopilot_config(db, user.user_id)


@router.patch("/config")
async def patch_config(request: Request):
    user = await require_advisor(request)
    db = get_db(request)
    try:
        patch = await request.json()
        if not isinstance(patch, dict):
            patch = {}
    except Exception:
        patch = {}
    return await ap.set_autopilot_config(db, user.user_id, patch)


@router.get("/log")
async def get_log(request: Request, days: int = 7):
    user = await require_advisor(request)
    db = get_db(request)
    return await ap.get_autopilot_log(db, user.user_id, days=days)


@router.post("/pause")
async def pause(request: Request):
    """Kill switch · toggle paused. Body opcional {paused:bool} · default True (pausar)."""
    user = await require_advisor(request)
    db = get_db(request)
    try:
        body = await request.json()
        paused = bool(body.get("paused", True)) if isinstance(body, dict) else True
    except Exception:
        paused = True
    return await ap.set_autopilot_config(db, user.user_id, {"paused": paused})


@router.post("/run-now")
async def run_now(request: Request):
    """Corre el piloto on-demand para el caller (mismos guardrails). Rate-limit 3/h."""
    user = await require_advisor(request)
    db = get_db(request)
    if not _check_run_rate(user.user_id):
        raise HTTPException(429, "Límite alcanzado: máximo 3 ejecuciones por hora.")
    return await ap.run_autopilot(db, user.user_id, getattr(user, "tenant_id", None))
