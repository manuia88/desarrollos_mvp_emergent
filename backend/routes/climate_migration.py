"""W5.9 — Climate Migration Routes.

Endpoints REST:
  - GET /api/climate-migration/heatmap         (T0 público · rate-limit 30/min/IP)
  - GET /api/climate-migration/zone/{zone_slug} (T0 público · rate-limit 60/min/IP)
  - GET /api/climate-migration/patterns         (T0 público · rate-limit 60/min/IP)

Cache 24h via TTL en climate_migration_heatmap. Si heatmap vacío al consultar →
trigger compute inline + warning log (best-effort).
"""
from __future__ import annotations

import logging
import time
from collections import defaultdict, deque
from typing import Any, Deque, Dict, List

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import JSONResponse

from climate_migration_engine import (
    COLLECTION_HEATMAP,
    COLLECTION_PATTERNS,
    compute_heatmap_snapshot,
    generate_pattern_narrative,
)

log = logging.getLogger("dmx.routes.climate_migration")

router = APIRouter()

# Rate-limit buckets in-memory (per endpoint)
_RL_BUCKET_HEATMAP: Dict[str, Deque[float]] = defaultdict(deque)
_RL_BUCKET_ZONE: Dict[str, Deque[float]] = defaultdict(deque)
_RL_BUCKET_PATTERNS: Dict[str, Deque[float]] = defaultdict(deque)

RL_WINDOW_S = 60
RL_LIMIT_HEATMAP = 30
RL_LIMIT_ZONE = 60
RL_LIMIT_PATTERNS = 60


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    if fwd:
        return fwd
    return request.client.host if request.client else "unknown"


def _rate_limit(
    request: Request, bucket: Dict[str, Deque[float]], limit: int,
) -> None:
    ip = _client_ip(request)
    now = time.time()
    bkt = bucket[ip]
    while bkt and (now - bkt[0]) > RL_WINDOW_S:
        bkt.popleft()
    if len(bkt) >= limit:
        raise HTTPException(status_code=429, detail="rate_limit_exceeded")
    bkt.append(now)


def _db(request: Request):
    return request.app.state.db


# ─── GET /heatmap ──────────────────────────────────────────────────────────────

@router.get("/api/climate-migration/heatmap")
async def get_heatmap(request: Request):
    _rate_limit(request, _RL_BUCKET_HEATMAP, RL_LIMIT_HEATMAP)
    db = _db(request)

    zones: List[Dict[str, Any]] = []
    try:
        cursor = db[COLLECTION_HEATMAP].find(
            {}, {"_id": 0}
        ).limit(100)
        async for d in cursor:
            zones.append(d)
    except Exception as e:
        log.warning(f"[climate_migration_route] heatmap query fail: {e}")

    # Si cache vacío → trigger compute inline (best-effort)
    if not zones:
        log.warning("[climate_migration_route] heatmap cache empty · triggering compute inline")
        try:
            await compute_heatmap_snapshot(db)
            cursor = db[COLLECTION_HEATMAP].find(
                {}, {"_id": 0}
            ).limit(100)
            async for d in cursor:
                zones.append(d)
        except Exception as e:
            log.warning(f"[climate_migration_route] inline heatmap compute fail: {e}")

    # ISO-ify datetimes
    for z in zones:
        for k in ("last_updated", "ttl_until"):
            v = z.get(k)
            if hasattr(v, "isoformat"):
                z[k] = v.isoformat()

    generated_at = None
    if zones:
        try:
            generated_at = max(
                (z.get("last_updated") for z in zones if z.get("last_updated")),
                default=None,
            )
        except Exception:
            generated_at = None

    return JSONResponse({
        "zones": zones,
        "total_zones": len(zones),
        "generated_at": generated_at,
    })


# ─── GET /zone/{zone_slug} ─────────────────────────────────────────────────────

@router.get("/api/climate-migration/zone/{zone_slug}")
async def get_zone(request: Request, zone_slug: str):
    _rate_limit(request, _RL_BUCKET_ZONE, RL_LIMIT_ZONE)
    db = _db(request)

    if not zone_slug:
        raise HTTPException(404, "zone_slug required")

    # Heatmap entry
    try:
        entry = await db[COLLECTION_HEATMAP].find_one({"zone_slug": zone_slug}, {"_id": 0})
    except Exception as e:
        log.warning(f"[climate_migration_route] zone heatmap fail: {e}")
        entry = None

    if not entry:
        # Check zone exists in dim_zones; if no, 404. If yes, return computed-on-the-fly with insufficient data warning.
        try:
            z = await db.dim_zones.find_one(
                {"zone_id": zone_slug}, {"_id": 0, "name": 1, "zone_id": 1, "tier": 1},
            )
        except Exception:
            z = None
        if not z:
            raise HTTPException(404, f"zone {zone_slug} not found")
        entry = {
            "zone_slug": zone_slug,
            "zone_name": z.get("name") or zone_slug,
            "outflow_score": 0,
            "inflow_score": 0,
            "net_score": 0,
            "centroid": {},
            "climate_drivers": [],
            "last_updated": None,
            "note": "heatmap_not_computed_yet",
        }

    # Last pattern (origin or destination = zone)
    last_pattern = None
    behavioral_evidence = {}
    demographic_signal = {}
    try:
        last_pattern = await db[COLLECTION_PATTERNS].find_one(
            {
                "$or": [
                    {"origin_zone": zone_slug},
                    {"destination_zone": zone_slug},
                ],
            },
            {"_id": 0},
            sort=[("detected_at", -1)],
        )
        if last_pattern:
            behavioral_evidence = last_pattern.get("behavioral_evidence") or {}
            demographic_signal = last_pattern.get("demographic_signal") or {}
    except Exception as e:
        log.warning(f"[climate_migration_route] last_pattern fail: {e}")

    # Narrative: if pattern existe pero sin narrative_long → trigger generate
    narrative = ""
    if last_pattern:
        narrative = (last_pattern.get("narrative_long")
                     or last_pattern.get("narrative_short") or "").strip()
        if not narrative:
            try:
                narrative = await generate_pattern_narrative(db, last_pattern)
                # best-effort update doc
                try:
                    await db[COLLECTION_PATTERNS].update_one(
                        {"pattern_id": last_pattern.get("pattern_id")},
                        {"$set": {
                            "narrative_long": narrative,
                            "narrative_short": narrative[:280],
                        }},
                    )
                except Exception:
                    pass
            except Exception as e:
                log.debug(f"[climate_migration_route] narrative inline fail: {e}")

    # Recommendation simple
    net = int(entry.get("net_score") or 0)
    if net >= 30:
        recommendation = (
            "Zona muestra señal de INFLOW: oportunidad de adquirir antes "
            "de que precios ajusten."
        )
    elif net <= -30:
        recommendation = (
            "Zona muestra señal de OUTFLOW: revisar diversificación · evaluar "
            "venta si horizonte corto."
        )
    else:
        recommendation = "Zona estable · sin señal de migración climática significativa."

    # ISO-ify datetimes
    for k in ("last_updated", "ttl_until"):
        v = entry.get(k)
        if hasattr(v, "isoformat"):
            entry[k] = v.isoformat()
    if last_pattern:
        v = last_pattern.get("detected_at")
        if hasattr(v, "isoformat"):
            last_pattern["detected_at"] = v.isoformat()
        v = last_pattern.get("ttl_until")
        if hasattr(v, "isoformat"):
            last_pattern["ttl_until"] = v.isoformat()

    return JSONResponse({
        "zone_slug": zone_slug,
        "zone_name": entry.get("zone_name"),
        "outflow_score": int(entry.get("outflow_score") or 0),
        "inflow_score": int(entry.get("inflow_score") or 0),
        "net_score": net,
        "climate_drivers": entry.get("climate_drivers") or [],
        "behavioral_evidence": behavioral_evidence,
        "demographic_signal": demographic_signal,
        "narrative": narrative,
        "recommendation": recommendation,
        "last_pattern": last_pattern,
    })


# ─── GET /patterns ─────────────────────────────────────────────────────────────

@router.get("/api/climate-migration/patterns")
async def get_patterns(
    request: Request,
    days: int = Query(90, ge=1, le=365),
    limit: int = Query(20, ge=1, le=100),
):
    _rate_limit(request, _RL_BUCKET_PATTERNS, RL_LIMIT_PATTERNS)
    db = _db(request)

    from datetime import datetime, timedelta, timezone
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    patterns: List[Dict[str, Any]] = []
    try:
        cursor = db[COLLECTION_PATTERNS].find(
            {"detected_at": {"$gte": cutoff}},
            {"_id": 0},
        ).sort("detected_at", -1).limit(limit)
        async for p in cursor:
            for k in ("detected_at", "ttl_until"):
                v = p.get(k)
                if hasattr(v, "isoformat"):
                    p[k] = v.isoformat()
            patterns.append(p)
    except Exception as e:
        log.warning(f"[climate_migration_route] patterns query fail: {e}")

    return JSONResponse({"patterns": patterns, "total": len(patterns)})
