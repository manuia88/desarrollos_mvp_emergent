"""W5.3 Parte 1 Sub-B — Routes públicas para forecast.

Endpoints:
  GET /api/forecast-public/zone/{slug}?horizons=6,12,24
  GET /api/forecast-public/property?colonia=...&m2=...&rec=...&ban=...&age=...&horizons=12

Rate-limit en memoria.
"""
from __future__ import annotations

import time
import logging
from collections import defaultdict, deque
from typing import Deque, Dict

from fastapi import APIRouter, HTTPException, Request, Query
from fastapi.responses import JSONResponse

import forecast_cache
from forecast_engine import (
    get_zone_forecast,
    predict_property_forecast,
    build_narrative,
    HORIZONS_MONTHS,
    _parse_horizons_list,
)

log = logging.getLogger("dmx.forecast_public")
router = APIRouter()

_RL_BUCKET_ZONE: Dict[str, Deque[float]] = defaultdict(deque)
_RL_BUCKET_PROP: Dict[str, Deque[float]] = defaultdict(deque)
_RL_WINDOW_S = 60
_RL_LIMIT_ZONE = 60
_RL_LIMIT_PROP = 30


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    if fwd:
        return fwd
    return request.client.host if request.client else "unknown"


def _rate_check(bucket: Dict[str, Deque[float]], ip: str, limit: int) -> None:
    now = time.time()
    q = bucket[ip]
    while q and (now - q[0]) > _RL_WINDOW_S:
        q.popleft()
    if len(q) >= limit:
        raise HTTPException(429, "rate_limit_exceeded")
    q.append(now)


@router.get("/api/forecast-public/zone/{slug}")
async def forecast_zone(
    slug: str,
    request: Request,
    horizons: str = Query("6,12,24"),
):
    _rate_check(_RL_BUCKET_ZONE, _client_ip(request), _RL_LIMIT_ZONE)

    cache_key = f"zone|{slug}|{horizons}"
    cached = await forecast_cache.get(cache_key)
    if cached is not None:
        return JSONResponse({**cached, "cache_hit": True})

    db = request.app.state.db
    zf = await get_zone_forecast(db, slug)
    if not zf:
        raise HTTPException(404, {"error": "forecast_unavailable", "reason": "insufficient_history"})

    requested = _parse_horizons_list(horizons)
    horizons_arr = []
    baseline = float(zf.get("baseline_index") or 0)
    for h in HORIZONS_MONTHS:
        if h not in requested:
            continue
        band = (zf.get("horizons") or {}).get(f"{h}m")
        if not band:
            continue
        horizons_arr.append({
            "months": h,
            "value": band["value"],
            "low95": band["low95"],
            "high95": band["high95"],
            "delta_pct": band.get("delta_pct"),
        })

    # Get colonia name (best-effort)
    name = slug
    try:
        from data_seed import COLONIAS_BY_ID
        rec = COLONIAS_BY_ID.get(slug)
        if rec:
            name = rec.get("name", slug)
    except Exception:
        pass

    payload = {
        "ok": True,
        "slug": slug,
        "name": name,
        "baseline": baseline,
        "horizons": horizons_arr,
        "narrative": build_narrative(zf.get("horizons") or {}),
        "model_type": zf.get("model_type"),
        "arima_order": zf.get("arima_order"),
        "mape_test": zf.get("mape_test"),
        "model_fitted_at": zf.get("fitted_at"),
        "cache_hit": False,
    }
    await forecast_cache.set(cache_key, payload)
    return JSONResponse(payload)


@router.get("/api/forecast-public/property")
async def forecast_property(
    request: Request,
    colonia: str = Query(...),
    m2: float = Query(..., gt=0, le=10000),
    rec: int = Query(..., ge=0, le=15),
    ban: int = Query(..., ge=0, le=15),
    age: int = Query(..., ge=0, le=200),
    horizons: str = Query("6,12,24"),
):
    _rate_check(_RL_BUCKET_PROP, _client_ip(request), _RL_LIMIT_PROP)

    cache_key = f"prop|{colonia}|{m2}|{rec}|{ban}|{age}|{horizons}"
    cached = await forecast_cache.get(cache_key)
    if cached is not None:
        return JSONResponse({**cached, "cache_hit": True})

    db = request.app.state.db
    requested = _parse_horizons_list(horizons)
    out = await predict_property_forecast(db, colonia, m2, rec, ban, age, requested)
    if not out.get("available"):
        raise HTTPException(404, {"error": "forecast_unavailable", "reason": out.get("reason")})

    # Filtrar a los horizons pedidos (ya filtrado por predict_property_forecast)
    filtered_horizons = out.get("horizons") or []

    # Narrative (basado en 12m si está, sino el primero)
    narrative_band = None
    for h in filtered_horizons:
        if h["months"] == 12:
            narrative_band = h
            break
    if not narrative_band and filtered_horizons:
        narrative_band = filtered_horizons[0]
    if narrative_band:
        delta = float(narrative_band.get("delta_pct") or 0)
        months = narrative_band["months"]
        if delta >= 5:
            narrative = f"Tendencia alcista +{delta:.1f}% en {months} meses."
        elif delta <= -5:
            narrative = f"Tendencia bajista {delta:.1f}% en {months} meses."
        else:
            narrative = f"Tendencia estable a {months} meses."
    else:
        narrative = "Sin proyección de zona disponible."

    payload = {
        "ok": True,
        "colonia": colonia,
        "input": {"m2": m2, "recamaras": rec, "banos": ban, "antiguedad_anos": age},
        "avm_now": out.get("avm_now"),
        "avm_low": out.get("avm_low"),
        "avm_high": out.get("avm_high"),
        "pricing_model": out.get("pricing_model"),
        "horizons": filtered_horizons,
        "narrative": narrative,
        "zone_forecast_fitted_at": out.get("zone_forecast_fitted_at"),
        "cache_hit": False,
    }
    await forecast_cache.set(cache_key, payload)
    return JSONResponse(payload)


@router.get("/api/forecast-public/cache-stats")
async def cache_stats():
    return JSONResponse({"ok": True, **forecast_cache.stats()})
