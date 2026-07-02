"""W4.18 — Data Sources gov MX REST routes.

12 endpoints superadmin: 6 lookups + 6 stats + 1 dashboard + 1 sync_now.
Permission: superadmin only. Rate-limited 30/min/user (lookup) y 1/hour (sync_now).
"""
from __future__ import annotations

import logging
import time
from typing import Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import JSONResponse

from data_sources.banxico_engine import BanxicoEngine, run_banxico_daily_cron, ALL_SERIES
from data_sources.sigcdmx_engine import SIGCDMXEngine, run_sigcdmx_monthly_cron
from data_sources.atlas_riesgos_engine import AtlasRiesgosEngine, run_atlas_yearly_cron
from data_sources.catastro_engine import CatastroEngine, run_catastro_quarterly_cron
from data_sources.gtfs_engine import GTFSEngine, run_gtfs_monthly_cron
from data_sources.osm_engine import OSMEngine, run_osm_weekly_cron

log = logging.getLogger("dmx.routes_data_sources")

router = APIRouter(prefix="/api/superadmin/data-sources-gov-mx", tags=["data-sources-gov-mx"])

_buckets: Dict[str, List[float]] = {}
_sync_buckets: Dict[str, float] = {}
LOOKUP_CAP = 60
SYNC_COOLDOWN_S = 3600


def _check_rate(user_id: str, cap: int = LOOKUP_CAP) -> bool:
    now = time.monotonic()
    bucket = _buckets.setdefault(user_id, [])
    _buckets[user_id] = [t for t in bucket if now - t < 60]
    if len(_buckets[user_id]) >= cap:
        return False
    _buckets[user_id].append(now)
    return True


def _check_sync(source: str) -> bool:
    now = time.monotonic()
    last = _sync_buckets.get(source, 0)
    if now - last < SYNC_COOLDOWN_S:
        return False
    _sync_buckets[source] = now
    return True


async def _require_superadmin(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    if getattr(user, "role", "") != "superadmin":
        raise HTTPException(403, "Requiere rol superadmin")
    if not _check_rate(getattr(user, "user_id", "anon")):
        raise HTTPException(429, "Rate limit data-sources (60 calls/min)")
    return user


def _engine_factory(source: str, db):
    factories = {
        "banxico": BanxicoEngine,
        "sigcdmx": SIGCDMXEngine,
        "atlas_riesgos": AtlasRiesgosEngine,
        "catastro": CatastroEngine,
        "gtfs": GTFSEngine,
        "osm": OSMEngine,
    }
    f = factories.get(source)
    if not f:
        raise HTTPException(404, f"source desconocido: {source}")
    return f(db)


# ─── 6 LOOKUPS ────────────────────────────────────────────────────────────────
@router.get("/banxico/lookup")
async def banxico_lookup(
    request: Request,
    series_id: str = Query(..., min_length=2, max_length=20),
):
    await _require_superadmin(request)
    engine = BanxicoEngine(request.app.state.db)
    return JSONResponse(await engine.lookup(series_id))


@router.get("/sigcdmx/lookup")
async def sigcdmx_lookup(
    request: Request,
    cuenta_catastral: str = Query(..., min_length=2, max_length=300),
):
    await _require_superadmin(request)
    engine = SIGCDMXEngine(request.app.state.db)
    return JSONResponse(await engine.lookup(cuenta_catastral))


@router.get("/atlas-riesgos/lookup")
async def atlas_lookup(
    request: Request,
    ageb_id: str = Query(..., min_length=2, max_length=40),
):
    await _require_superadmin(request)
    engine = AtlasRiesgosEngine(request.app.state.db)
    return JSONResponse(await engine.lookup(ageb_id))


@router.get("/catastro/lookup")
async def catastro_lookup(
    request: Request,
    cuenta_catastral: str = Query(..., min_length=2, max_length=40),
):
    await _require_superadmin(request)
    engine = CatastroEngine(request.app.state.db)
    return JSONResponse(await engine.lookup(cuenta_catastral))


@router.get("/gtfs/transit-accessibility")
async def gtfs_lookup(
    request: Request,
    lat: float = Query(...),
    lng: float = Query(...),
    radius_m: int = Query(500, ge=50, le=5000),
):
    await _require_superadmin(request)
    engine = GTFSEngine(request.app.state.db)
    return JSONResponse(await engine.get_transit_accessibility(lat, lng, radius_m))


@router.get("/osm/amenities-radius")
async def osm_lookup(
    request: Request,
    lat: float = Query(...),
    lng: float = Query(...),
    radius_m: int = Query(500, ge=50, le=5000),
    categories: Optional[str] = Query(None),
):
    await _require_superadmin(request)
    cats = (categories or "").split(",") if categories else None
    cats = [c.strip() for c in cats if c.strip()] if cats else None
    engine = OSMEngine(request.app.state.db)
    return JSONResponse(await engine.get_amenities_radius(lat, lng, radius_m, cats))


# ─── 1 STATS GLOBAL + 1 DASHBOARD ────────────────────────────────────────────
@router.get("/stats")
async def stats_global(request: Request):
    """Stats agregadas de las 6 fuentes."""
    await _require_superadmin(request)
    db = request.app.state.db
    out = {"ok": True, "sources": {}}
    for name, factory in {
        "banxico": BanxicoEngine, "sigcdmx": SIGCDMXEngine,
        "atlas_riesgos": AtlasRiesgosEngine, "catastro": CatastroEngine,
        "gtfs": GTFSEngine, "osm": OSMEngine,
    }.items():
        try:
            out["sources"][name] = _serialize(await factory(db).stats())
        except Exception as exc:
            out["sources"][name] = {"source": name, "error": str(exc)}
    return JSONResponse(out)


def _serialize(obj):
    """Convierte datetime → iso recursivamente (responses safe)."""
    from datetime import datetime as _dt
    if isinstance(obj, _dt):
        return obj.isoformat()
    if isinstance(obj, dict):
        return {k: _serialize(v) for k, v in obj.items() if k != "_id"}
    if isinstance(obj, list):
        return [_serialize(x) for x in obj]
    return obj


# ─── SYNC NOW (per source · rate-limited 1/hour) ─────────────────────────────
@router.post("/{source}/sync-now")
async def sync_now(source: str, request: Request):
    """Ejecuta cron correspondiente a la fuente. Rate limit 1/hour/source."""
    await _require_superadmin(request)
    db = request.app.state.db
    if not _check_sync(source):
        raise HTTPException(
            429,
            "Rate limit sync. Espera 1h entre syncs de la misma fuente.",
        )
    crons = {
        "banxico":       run_banxico_daily_cron,
        "sigcdmx":       run_sigcdmx_monthly_cron,
        "atlas_riesgos": run_atlas_yearly_cron,
        "catastro":      run_catastro_quarterly_cron,
        "gtfs":          run_gtfs_monthly_cron,
        "osm":           run_osm_weekly_cron,
    }
    cron = crons.get(source)
    if not cron:
        raise HTTPException(404, f"source desconocido: {source}")
    try:
        result = await cron(db)
    except Exception as exc:
        log.warning(f"[sync_now/{source}] failed: {exc}")
        # remove rate limit on failure
        _sync_buckets.pop(source, None)
        raise HTTPException(500, f"Sync falló: {exc}")
    return JSONResponse({"ok": True, "source": source, "result": _serialize(result)})


# ─── METADATA EXPORT ─────────────────────────────────────────────────────────
@router.get("/banxico/series-list")
async def banxico_series_list(request: Request):
    await _require_superadmin(request)
    return JSONResponse({"ok": True, "series": ALL_SERIES})
