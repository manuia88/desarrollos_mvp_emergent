"""W4.14 — Investment Simulator API Routes.

POST /api/investment-simulator/simulate
GET  /api/investment-simulator/colonia/{slug}/baseline
POST /api/investment-simulator/stress-test

Rate limit: 30 req/min/IP. LFPDPPP IP hash log.
"""
from __future__ import annotations

import hashlib
import os
import time
from collections import defaultdict, deque
from typing import Any, Deque, Dict, Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

import investment_simulator_engine as eng

router = APIRouter()

LFPDPPP_SALT = os.environ.get("LFPDPPP_SALT", "dmx_lfpdppp_2026")
_RL_BUCKET: Dict[str, Deque[float]] = defaultdict(deque)
RL_LIMIT = 30
RL_WINDOW_S = 60


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    return fwd or (request.client.host if request.client else "unknown")


def _rate_limit(ip: str) -> None:
    now = time.time()
    bucket = _RL_BUCKET[ip]
    while bucket and (now - bucket[0]) > RL_WINDOW_S:
        bucket.popleft()
    if len(bucket) >= RL_LIMIT:
        raise HTTPException(429, "rate_limit_exceeded")
    bucket.append(now)


def _ip_hash(ip: str) -> str:
    return hashlib.sha256(f"{ip}:{LFPDPPP_SALT}".encode()).hexdigest()[:32]


def _db(request: Request):
    return request.app.state.db


# ─── POST /api/investment-simulator/simulate ─────────────────────────────────

class SimulateBody(BaseModel):
    precio_entrada: float
    plazo_meses: int = 120
    m2: float = 80.0
    colonia_slug: str = "del-valle"
    apreciacion_anual_user_pct: Optional[float] = None
    financiamiento_pct: float = 0.80


@router.post("/api/investment-simulator/simulate")
async def simulate_endpoint(body: SimulateBody, request: Request):
    ip = _client_ip(request)
    _rate_limit(ip)
    if body.precio_entrada <= 0:
        raise HTTPException(422, "precio_entrada_invalid")
    db = _db(request)
    result = await eng.simulate(
        db,
        precio_entrada=body.precio_entrada,
        plazo_meses=body.plazo_meses,
        m2=body.m2,
        colonia_slug=body.colonia_slug,
        apreciacion_anual_user_pct=body.apreciacion_anual_user_pct,
        financiamiento_pct=body.financiamiento_pct,
    )
    # Strip cash_flow_monthly to reduce payload (keep first 36 months for chart)
    for scenario_key in ("conservador", "base", "optimista"):
        s = result.get(scenario_key, {})
        cf = s.get("cash_flow_monthly", [])
        s["cash_flow_monthly"] = cf[:36]
    return JSONResponse({"ok": True, **result})


# ─── GET /api/investment-simulator/colonia/{slug}/baseline ───────────────────

@router.get("/api/investment-simulator/colonia/{slug}/baseline")
async def colonia_baseline(slug: str, request: Request):
    ip = _client_ip(request)
    _rate_limit(ip)
    db = _db(request)
    result = await eng.get_colonia_baseline(db, slug)
    return JSONResponse({"ok": True, **result})


# ─── POST /api/investment-simulator/stress-test ──────────────────────────────

@router.post("/api/investment-simulator/stress-test")
async def stress_test_endpoint(request: Request):
    ip = _client_ip(request)
    _rate_limit(ip)
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(422, "invalid_json")
    result = await eng.stress_test(body)
    return JSONResponse({"ok": True, **result})


# ─── GET /api/investment-simulator/colonia/{slug}/comparables ────────────────

@router.get("/api/investment-simulator/colonia/{slug}/comparables")
async def comparables_endpoint(slug: str, request: Request, precio: float = 3_000_000.0):
    _rate_limit(_client_ip(request))
    db = _db(request)
    alts = await eng.compare_alternatives(db, slug, precio)
    return JSONResponse({"ok": True, "alternatives": alts})
