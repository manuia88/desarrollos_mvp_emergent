"""W3.1A Phase 5 Foundation — Routes.

Prefix: /api/superadmin/phase5
Guards: require_superadmin for all endpoints EXCEPT:
  GET /api/public/zone-score/{zone_id}  — public, no auth, score letter only

Endpoints:
  DENUE:
    GET  /denue/zone/{zone_id}/density     — density + SCIAN breakdown
    GET  /denue/business/lookup?empresa=   — business search (lead enrichment)
    POST /denue/sync/zone/{zone_id}        — manual trigger fetch

  Construction Costs:
    GET  /construction-cost/zone/{zone_id}?type=&tier=  — prediction + sources + confidence
    POST /construction-cost/forecast                    — total cost + monthly evolution

  Zone Scores:
    GET  /zone-score/{zone_id}             — score + 6 components
    GET  /zone-score/all?tier=&limit=50    — paginated top zones
    GET  /zone-score/{zone_id}/history?days=90 — time series
    GET  /api/public/zone-score/{zone_id}  — PUBLIC score letter only (no breakdown)
"""
from __future__ import annotations

import logging
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

import osm_engine as denue  # DENUE muerto → OSM (misma firma: compute_zone_density/get_zone_density)
import construction_cost_engine as cost_engine
import zone_score_engine as score_engine

log = logging.getLogger("dmx.routes_phase5_foundation")

router = APIRouter(tags=["phase5_foundation"])
pub_router = APIRouter(tags=["phase5_public"])

PHASE5_PREFIX = "/api/superadmin/phase5"
PUBLIC_PREFIX = "/api/public"


def _db(request: Request):
    return request.app.state.db


async def _require_superadmin(request: Request):
    from permissions import require_superadmin
    return await require_superadmin(request)


# ══════════════════════════════════════════════════════════════════════════════
#  DENUE
# ══════════════════════════════════════════════════════════════════════════════

@router.get(PHASE5_PREFIX + "/denue/zone/{zone_id}/density")
async def denue_zone_density(zone_id: str, request: Request, force: bool = False):
    """Return DENUE business density for zone. Hits cache unless ?force=true."""
    await _require_superadmin(request)
    db = _db(request)
    if not force:
        cached = await denue.get_zone_density(db, zone_id)
        if cached:
            return {**cached, "cache": "hit"}
    result = await denue.compute_zone_density(db, zone_id)
    return {**result, "cache": "miss"}


@router.get(PHASE5_PREFIX + "/denue/business/lookup")
async def denue_business_lookup(
    request: Request,
    empresa: str = Query(..., min_length=2),
    limit: int = Query(20, ge=1, le=100),
):
    """Search DENUE businesses by name (lead enrichment)."""
    await _require_superadmin(request)
    db = _db(request)
    results = await denue.lookup_business(db, empresa, limit)
    return {"results": results, "count": len(results), "query": empresa}


@router.post(PHASE5_PREFIX + "/denue/sync/zone/{zone_id}")
async def denue_sync_zone(zone_id: str, request: Request):
    """Manually trigger DENUE fetch for zone."""
    user = await _require_superadmin(request)
    db = _db(request)
    result = await denue.compute_zone_density(db, zone_id)
    try:
        from audit_log import log_mutation
        await log_mutation(
            db, user, "create", "denue_sync", zone_id,
            before=None,
            after={"zone_id": zone_id, "total": result.get("businesses_count_total")},
            request=request,
        )
    except Exception:
        pass
    return result


# ══════════════════════════════════════════════════════════════════════════════
#  Construction Costs
# ══════════════════════════════════════════════════════════════════════════════

class ForecastBody(BaseModel):
    zone_id: str
    m2: float
    tier: Literal["entry", "mid", "luxury"] = "mid"
    building_type: Literal["vertical", "horizontal"] = "vertical"


@router.get(PHASE5_PREFIX + "/construction-cost/zone/{zone_id}")
async def construction_cost_zone(
    zone_id: str, request: Request,
    type: str = Query("vertical", alias="type"),
    tier: str = Query("mid"),
):
    """Return cost/m² prediction for zone + building type + tier."""
    await _require_superadmin(request)
    db = _db(request)
    return await cost_engine.get_or_compute_cost(db, zone_id, type, tier)


@router.post(PHASE5_PREFIX + "/construction-cost/forecast")
async def construction_cost_forecast(body: ForecastBody, request: Request):
    """Forecast total construction cost for zone + m² + tier."""
    await _require_superadmin(request)
    db = _db(request)
    return await cost_engine.forecast_total(
        db, body.zone_id, body.m2, body.tier, body.building_type,
    )


# ══════════════════════════════════════════════════════════════════════════════
#  Zone Scores
# ══════════════════════════════════════════════════════════════════════════════

@router.get(PHASE5_PREFIX + "/zone-score/all")
async def zone_score_all(
    request: Request,
    tier: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    """List paginated top zones by score."""
    await _require_superadmin(request)
    db = _db(request)
    zones = await score_engine.list_all_scores(db, tier=tier, limit=limit)
    return {"zones": zones, "count": len(zones)}


@router.get(PHASE5_PREFIX + "/zone-score/{zone_id}/history")
async def zone_score_history(
    zone_id: str, request: Request,
    days: int = Query(90, ge=1, le=365),
):
    """Return score time series for zone."""
    await _require_superadmin(request)
    db = _db(request)
    history = await score_engine.get_score_history(db, zone_id, days)
    return {"zone_id": zone_id, "days": days, "history": history, "count": len(history)}


@router.get(PHASE5_PREFIX + "/zone-score/{zone_id}")
async def zone_score_get(zone_id: str, request: Request, force: bool = False):
    """Return zone score with 6-component breakdown."""
    await _require_superadmin(request)
    db = _db(request)
    if force:
        # Determine tier from cube
        cube = await db.cube_aggregations.find_one(
            {"tier_id": zone_id, "period": "current"}, {"_id": 0, "tier": 1},
        )
        tier = (cube or {}).get("tier") or "colonia"
        return await score_engine.compute_zone_score(db, zone_id, tier)
    return await score_engine.get_score_or_compute(db, zone_id)


# ══════════════════════════════════════════════════════════════════════════════
#  PUBLIC — score letter only (no breakdown), no auth
# ══════════════════════════════════════════════════════════════════════════════

@pub_router.get(PUBLIC_PREFIX + "/zone-score/{zone_id}")
async def public_zone_score(zone_id: str, request: Request):
    """PUBLIC no-auth endpoint: returns score letter + numeric only.
    No component breakdown exposed. Source: 'via DMX'.
    Used for MCP W4 free tier.
    """
    db = _db(request)
    doc = await score_engine.get_score_or_compute(db, zone_id)
    return {
        "zone_id": zone_id,
        "score_letter": doc.get("score_letter"),
        "score_numeric": doc.get("score_numeric"),
        "zone_name": doc.get("zone_name"),
        "computed_at": doc.get("computed_at"),
        "source": "via DMX",
    }
