"""W4.18.2B — Maps Cross-features Routes.

9 endpoints + tier_gate T3 para battle_card.
"""
from __future__ import annotations

from typing import Any, Dict, Optional
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

import maps_cross_engine as eng

router = APIRouter()

TIER_RANK = eng.TIER_RANK


def _db(request: Request):
    return request.app.state.db


async def _current_user(request: Request) -> Optional[Dict[str, Any]]:
    """Resuelve usuario desde server.get_current_user (cookie session/JWT)."""
    try:
        from server import get_current_user
        u = await get_current_user(request)
        if u:
            return u.model_dump() if hasattr(u, "model_dump") else dict(u)
    except Exception:
        pass
    return None


# ─── Sub-A · Funnel inverso (público) ─────────────────────────────────────────
@router.get("/api/maps-cross/funnel-inverso/{listing_id}")
async def funnel_inverso(listing_id: str, request: Request):
    db = _db(request)
    result = await eng.funnel_inverso(db, listing_id)
    return JSONResponse({"ok": True, **result})


# ─── Sub-A · Match Catastro→Preventa (auth T1+) ──────────────────────────────
@router.get("/api/maps-cross/match-catastro/me")
async def match_catastro_me(request: Request):
    user = await _current_user(request)
    if not user:
        raise HTTPException(401, "auth_required")
    db = _db(request)
    result = await eng.match_catastro_to_preventa(db, user["user_id"], force=False)
    return JSONResponse({"ok": True, **result})


@router.post("/api/maps-cross/match-catastro/refresh")
async def match_catastro_refresh(request: Request):
    user = await _current_user(request)
    if not user:
        raise HTTPException(401, "auth_required")
    db = _db(request)
    result = await eng.match_catastro_to_preventa(db, user["user_id"], force=True)
    return JSONResponse({"ok": True, **result})


# ─── Sub-B · Demand vs Supply Gap (público) ───────────────────────────────────
@router.get("/api/maps-cross/demand-gap")
async def demand_gap(request: Request):
    db = _db(request)
    geojson = await eng.demand_supply_gap_geojson(db)
    return JSONResponse({"ok": True, **geojson})


# ─── Sub-B · Saved Zones CRUD ─────────────────────────────────────────────────
class SaveZoneIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    polygon_geojson: Dict[str, Any]
    alert_triggers: Optional[Dict[str, Any]] = None


@router.post("/api/maps-cross/saved-zones")
async def create_saved_zone(body: SaveZoneIn, request: Request):
    user = await _current_user(request)
    if not user:
        raise HTTPException(401, "auth_required")
    poly = body.polygon_geojson
    if not isinstance(poly, dict) or poly.get("type") != "Polygon":
        raise HTTPException(422, "polygon_geojson must be type=Polygon")
    db = _db(request)
    doc = await eng.save_zone(db, user["user_id"], body.name, poly, body.alert_triggers or {})
    return JSONResponse({"ok": True, "zone": doc}, status_code=201)


@router.get("/api/maps-cross/saved-zones")
async def list_saved_zones(request: Request):
    user = await _current_user(request)
    if not user:
        raise HTTPException(401, "auth_required")
    db = _db(request)
    zones = await eng.list_zones(db, user["user_id"])
    return JSONResponse({"ok": True, "zones": zones, "count": len(zones)})


@router.delete("/api/maps-cross/saved-zones/{zone_id}")
async def delete_saved_zone(zone_id: str, request: Request):
    user = await _current_user(request)
    if not user:
        raise HTTPException(401, "auth_required")
    db = _db(request)
    ok = await eng.delete_zone(db, user["user_id"], zone_id)
    if not ok:
        raise HTTPException(404, "zone_not_found_or_not_owner")
    return JSONResponse({"ok": True, "zone_id": zone_id})


# ─── Sub-C · Battle Card (tier T3+) ───────────────────────────────────────────
@router.get("/api/maps-cross/battle-card/{dev_id}")
async def battle_card_endpoint(dev_id: str, request: Request):
    user = await _current_user(request)
    if not user:
        raise HTTPException(401, "auth_required")
    user_tier = (user.get("tier") or user.get("plan_tier") or "free").lower()
    rank = TIER_RANK.get(user_tier, 0)
    if rank < TIER_RANK["T3"]:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "tier_locked",
                "required_tier": "T3",
                "current_tier": user_tier,
                "message": "Battle Card requiere tier T3+ (Enterprise).",
            },
        )
    from tenant_scope import assert_dev_project
    assert_dev_project(user, dev_id)   # 403 si el dev es de otro tenant (cierra IDOR P0)
    db = _db(request)
    result = await eng.battle_card(db, dev_id)
    if "error" in result:
        raise HTTPException(404, result["error"])
    return JSONResponse({"ok": True, **result})


# ─── Sub-B · Cron trigger manual (superadmin only) ────────────────────────────
@router.post("/api/maps-cross/saved-zones/cron-evaluate")
async def cron_eval_saved_zones(request: Request, dry_run: bool = True):
    user = await _current_user(request)
    if not user:
        raise HTTPException(401, "auth_required")
    if (user.get("role") or "").lower() != "superadmin":
        raise HTTPException(403, "superadmin_required")
    db = _db(request)
    out = await eng.cron_evaluate_saved_zones(db, dry_run=dry_run)
    return JSONResponse({"ok": True, **out})
