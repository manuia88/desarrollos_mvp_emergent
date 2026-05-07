"""W2.5 SA6 — Granular Metrics Cube routes.

Prefix: /api/superadmin/metrics-cube · all require_superadmin.

Tier hierarchy: city → alcaldia → colonia → development → unit
H1 scope: MX-CDMX only (single city root).

Route order is critical: static paths (heatmap, comparables, unit, refresh, tiers)
are registered BEFORE the dynamic /{tier} route to avoid path-shadowing.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, HTTPException, Query, Request

import metrics_cube_aggregations as cube

log = logging.getLogger("dmx.routes_superadmin_metrics_cube")

router = APIRouter(tags=["superadmin_metrics_cube"])
PREFIX = "/api/superadmin/metrics-cube"

PeriodLit = Literal["current", "7d", "30d", "90d"]
TierLit = Literal["city", "alcaldia", "colonia", "development", "unit"]


def _db(request: Request):
    return request.app.state.db


async def _require_superadmin(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    if user.role != "superadmin":
        raise HTTPException(403, "Solo superadmin")
    return user


async def _get_or_compute(db, tier: str, tier_id: str, period: str) -> Optional[Dict[str, Any]]:
    row = await db.cube_aggregations.find_one(
        {"tier": tier, "tier_id": tier_id, "period": period}, {"_id": 0},
    )
    if row:
        return row
    try:
        await cube.aggregate_tier(db, tier, period)
        return await db.cube_aggregations.find_one(
            {"tier": tier, "tier_id": tier_id, "period": period}, {"_id": 0},
        )
    except Exception as e:
        log.warning(f"[cube] on-demand compute failed: {e}")
        return None


# ─── 1) GET /tiers — hierarchy summary with counts ────────────────────────────
@router.get(PREFIX + "/tiers")
async def tiers_route(request: Request):
    await _require_superadmin(request)
    db = _db(request)
    await cube.aggregate_tier(db, "alcaldia", "current")
    await cube.aggregate_tier(db, "colonia", "current")
    await cube.aggregate_tier(db, "development", "current")

    counts = []
    for tier in ("city", "alcaldia", "colonia", "development"):
        if tier == "city":
            n = 1
        else:
            n = await db.cube_aggregations.count_documents(
                {"tier": tier, "period": "current"},
            )
        counts.append({"tier": tier, "count": n})
    # Units: aggregate seed + mongo
    seed_units = 0
    try:
        from data_developments import ALL_UNITS
        seed_units = len(ALL_UNITS)
    except Exception:
        pass
    mongo_units = await db.units.count_documents({})
    counts.append({"tier": "unit", "count": seed_units + mongo_units})
    return {"hierarchy": ["city", "alcaldia", "colonia", "development", "unit"],
            "counts": counts, "city_root": {"tier_id": cube.CITY_ROOT_ID,
                                            "name": cube.CITY_ROOT_NAME}}


# ─── 2) GET /heatmap — geo dots for Mapbox (BEFORE /{tier}) ───────────────────
@router.get(PREFIX + "/heatmap")
async def heatmap_route(
    request: Request,
    metric: Literal["avg_price_per_m2", "avg_price_mxn", "leads_count",
                    "conversion_rate", "units_total"] = "avg_price_per_m2",
    tier: Literal["alcaldia", "colonia", "development"] = "colonia",
    period: PeriodLit = "current",
    bbox: Optional[str] = Query(None, description="lng_min,lat_min,lng_max,lat_max"),
):
    await _require_superadmin(request)
    db = _db(request)
    existing = await db.cube_aggregations.count_documents({"tier": tier, "period": period})
    if existing == 0:
        await cube.aggregate_tier(db, tier, period)

    cur = db.cube_aggregations.find({"tier": tier, "period": period}, {"_id": 0})
    points: List[Dict[str, Any]] = []
    bb = None
    if bbox:
        try:
            bb = [float(x) for x in bbox.split(",")]
            if len(bb) != 4:
                bb = None
        except Exception:
            bb = None

    async for r in cur:
        geo = r.get("geo") or {}
        lat = geo.get("lat")
        lng = geo.get("lng")
        if lat is None or lng is None:
            continue
        if bb and not (bb[0] <= lng <= bb[2] and bb[1] <= lat <= bb[3]):
            continue
        val = (r.get("kpis") or {}).get(metric)
        if val is None:
            continue
        points.append({
            "tier_id": r.get("tier_id"), "name": r.get("name"),
            "lat": lat, "lng": lng, "value": val, "tier": tier,
            "units_total": (r.get("kpis") or {}).get("units_total") or 0,
            "kpis": r.get("kpis") or {},
        })

    if len(points) > 500 and not bb:
        raise HTTPException(400, "Demasiados puntos. Aplica un bbox para limitar.")

    return {"items": points, "metric": metric, "tier": tier, "period": period,
            "total": len(points), "bbox": bbox}


# ─── 3) GET /comparables (BEFORE /{tier}) ─────────────────────────────────────
@router.get(PREFIX + "/comparables")
async def comparables_route(
    request: Request,
    tier_id: str = Query(...),
    radius_km: float = Query(2.0, gt=0, le=20),
    limit: int = Query(20, ge=1, le=50),
):
    await _require_superadmin(request)
    db = _db(request)
    items = await cube.find_comparables(db, tier_id, radius_km=radius_km, limit=limit)
    return {"items": items, "tier_id": tier_id, "radius_km": radius_km, "total": len(items)}


# ─── 4) GET /unit/:unit_id — micro detail (BEFORE /{tier}) ────────────────────
@router.get(PREFIX + "/unit/{unit_id}")
async def unit_detail_route(unit_id: str, request: Request):
    await _require_superadmin(request)
    db = _db(request)
    unit = await db.units.find_one(
        {"$or": [{"id": unit_id}, {"unit_id": unit_id}]}, {"_id": 0},
    )
    dev = None
    if not unit:
        # Search seed (data_developments.ALL_UNITS) + embedded units in db.developments
        try:
            from data_developments import ALL_UNITS, DEVELOPMENTS_BY_ID
            for u in ALL_UNITS:
                if u.get("id") == unit_id or u.get("unit_id") == unit_id:
                    unit = dict(u)
                    dev_id_seed = u.get("development_id") or u.get("project_id")
                    if dev_id_seed and dev_id_seed in DEVELOPMENTS_BY_ID:
                        dev = DEVELOPMENTS_BY_ID[dev_id_seed]
                        unit["development_id"] = dev_id_seed
                    break
        except Exception:
            pass
    if not unit:
        async for d in db.developments.find({"units.id": unit_id}, {"_id": 0}):
            for u in (d.get("units") or []):
                if u.get("id") == unit_id:
                    unit = u
                    unit["development_id"] = d.get("id")
                    break
            if unit:
                break
    if not unit:
        raise HTTPException(404, "Unidad no encontrada")

    dev_id = unit.get("development_id") or unit.get("project_id")
    if not dev and dev_id:
        dev = await db.developments.find_one({"id": dev_id}, {"_id": 0})
        if not dev:
            try:
                from data_developments import DEVELOPMENTS_BY_ID
                dev = DEVELOPMENTS_BY_ID.get(dev_id)
            except Exception:
                dev = None

    # Price history from units_history (if exists) + dev-level price_history fallback
    price_history: List[Dict[str, Any]] = []
    try:
        async for h in db.units_history.find(
            {"unit_id": unit.get("id") or unit.get("unit_id")}, {"_id": 0},
        ).sort([("ts", 1)]).limit(50):
            price_history.append(h)
    except Exception:
        pass
    if not price_history and dev:
        price_history = (dev.get("price_history") or [])[-12:]

    leads: List[Dict[str, Any]] = []
    try:
        cur = db.leads.find(
            {"$or": [{"unit_id": unit_id}, {"interested_unit_id": unit_id}]}, {"_id": 0},
        ).sort([("created_at", -1)]).limit(20)
        async for ld in cur:
            leads.append(ld)
    except Exception:
        pass

    ie_score = None
    if dev:
        ie_score = dev.get("ie_score") or dev.get("score_global")

    return {
        "unit": unit,
        "development": dev,
        "price_history": price_history,
        "leads": leads,
        "leads_count": len(leads),
        "ie_score_zone": ie_score,
    }


# ─── 5) POST /refresh — manual recompute (BEFORE /{tier}) ─────────────────────
@router.post(PREFIX + "/refresh")
async def refresh_aggregations(request: Request):
    await _require_superadmin(request)
    db = _db(request)
    return await cube.aggregate_all(db)


# ─── 6) GET /:tier — list nodes ───────────────────────────────────────────────
@router.get(PREFIX + "/{tier}")
async def list_tier_route(
    tier: TierLit,
    request: Request,
    parent_id: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    sort: Literal["units_desc", "name_asc", "leads_desc", "price_desc"] = "units_desc",
    period: PeriodLit = "current",
    limit: int = Query(50, ge=1, le=200),
    skip: int = Query(0, ge=0),
):
    await _require_superadmin(request)
    db = _db(request)
    if tier == "unit":
        raise HTTPException(400, "Use /metrics-cube/unit/{unit_id} para detalle de unidad")

    existing = await db.cube_aggregations.count_documents({"tier": tier, "period": period})
    if existing == 0:
        await cube.aggregate_tier(db, tier, period)

    q: Dict[str, Any] = {"tier": tier, "period": period}
    if parent_id:
        q["parent_tier_id"] = parent_id
    if search:
        q["name"] = {"$regex": search, "$options": "i"}

    sort_spec: List[tuple] = []
    if sort == "units_desc":
        sort_spec = [("kpis.units_total", -1)]
    elif sort == "name_asc":
        sort_spec = [("name", 1)]
    elif sort == "leads_desc":
        sort_spec = [("kpis.leads_count", -1)]
    elif sort == "price_desc":
        sort_spec = [("kpis.avg_price_mxn", -1)]

    cur = db.cube_aggregations.find(q, {"_id": 0}).sort(sort_spec).skip(skip).limit(limit)
    items: List[Dict[str, Any]] = []
    async for r in cur:
        if tier == "city":
            r["children_count"] = await db.cube_aggregations.count_documents(
                {"tier": "alcaldia", "period": period},
            )
        elif tier == "alcaldia":
            r["children_count"] = await db.cube_aggregations.count_documents(
                {"tier": "colonia", "parent_tier_id": r["tier_id"], "period": period},
            )
        elif tier == "colonia":
            r["children_count"] = await db.cube_aggregations.count_documents(
                {"tier": "development", "parent_tier_id": r["tier_id"], "period": period},
            )
        elif tier == "development":
            r["children_count"] = int((r.get("kpis") or {}).get("units_total") or 0)
        items.append(r)

    total = await db.cube_aggregations.count_documents(q)
    return {"items": items, "total": total, "tier": tier, "period": period,
            "parent_id": parent_id}


# ─── 7) GET /:tier/:tier_id/children — children with mini-KPIs ────────────────
@router.get(PREFIX + "/{tier}/{tier_id}/children")
async def children_route(
    tier: TierLit, tier_id: str,
    request: Request,
    period: PeriodLit = "current",
):
    await _require_superadmin(request)
    db = _db(request)
    next_tier = {"city": "alcaldia", "alcaldia": "colonia",
                 "colonia": "development", "development": "unit"}.get(tier)
    if not next_tier:
        return {"items": [], "next_tier": None}

    if next_tier == "unit":
        items: List[Dict[str, Any]] = []
        # Try seed first
        try:
            from data_developments import DEVELOPMENTS_BY_ID
            dev = DEVELOPMENTS_BY_ID.get(tier_id)
            if dev:
                for u in (dev.get("units") or [])[:500]:
                    items.append({
                        "tier": "unit",
                        "tier_id": u.get("id") or u.get("unit_id"),
                        "name": u.get("unit_number") or u.get("name") or u.get("id"),
                        "kpis": {
                            "price_mxn": u.get("price") or u.get("price_mxn"),
                            "m2": u.get("m2_privative") or u.get("size_m2"),
                            "status": u.get("status"),
                            "bedrooms": u.get("bedrooms"),
                            "bathrooms": u.get("bathrooms"),
                        },
                    })
        except Exception:
            pass
        if not items:
            async for u in db.units.find({"development_id": tier_id}, {"_id": 0}).limit(500):
                items.append({
                    "tier": "unit",
                    "tier_id": u.get("id") or u.get("unit_id"),
                    "name": u.get("unit_number") or u.get("name") or u.get("id"),
                    "kpis": {
                        "price_mxn": u.get("price") or u.get("price_mxn"),
                        "m2": u.get("m2_privative") or u.get("size_m2"),
                        "status": u.get("status"),
                    },
                })
        return {"items": items, "next_tier": "unit", "total": len(items)}

    existing = await db.cube_aggregations.count_documents(
        {"tier": next_tier, "parent_tier_id": tier_id, "period": period},
    )
    if existing == 0:
        await cube.aggregate_tier(db, next_tier, period)
    cur = db.cube_aggregations.find(
        {"tier": next_tier, "parent_tier_id": tier_id, "period": period}, {"_id": 0},
    ).sort([("kpis.units_total", -1)])
    items = [r async for r in cur]
    return {"items": items, "next_tier": next_tier, "total": len(items)}


# ─── 8) GET /:tier/:tier_id — detail node + KPIs + children ───────────────────
@router.get(PREFIX + "/{tier}/{tier_id}")
async def detail_tier_route(
    tier: TierLit, tier_id: str,
    request: Request,
    period: PeriodLit = "current",
):
    await _require_superadmin(request)
    db = _db(request)
    if tier == "unit":
        raise HTTPException(400, "Use /metrics-cube/unit/{unit_id}")

    node = await _get_or_compute(db, tier, tier_id, period)
    if not node:
        raise HTTPException(404, "Nodo no encontrado")

    next_tier = {"city": "alcaldia", "alcaldia": "colonia",
                 "colonia": "development", "development": "unit"}.get(tier)
    children: List[Dict[str, Any]] = []
    if next_tier and next_tier != "unit":
        existing = await db.cube_aggregations.count_documents(
            {"tier": next_tier, "parent_tier_id": tier_id, "period": period},
        )
        if existing == 0:
            await cube.aggregate_tier(db, next_tier, period)
        cur = db.cube_aggregations.find(
            {"tier": next_tier, "parent_tier_id": tier_id, "period": period}, {"_id": 0},
        ).sort([("kpis.units_total", -1)]).limit(200)
        async for r in cur:
            children.append(r)
    elif next_tier == "unit":
        try:
            from data_developments import DEVELOPMENTS_BY_ID
            dev = DEVELOPMENTS_BY_ID.get(tier_id)
            if dev:
                for u in (dev.get("units") or [])[:200]:
                    children.append({
                        "tier": "unit",
                        "tier_id": u.get("id") or u.get("unit_id"),
                        "name": u.get("unit_number") or u.get("name") or u.get("id"),
                        "kpis": {
                            "price_mxn": u.get("price") or u.get("price_mxn"),
                            "m2": u.get("m2_privative") or u.get("size_m2"),
                            "status": u.get("status"),
                            "bedrooms": u.get("bedrooms"),
                            "bathrooms": u.get("bathrooms"),
                        },
                    })
        except Exception:
            pass
        if not children:
            cur = db.units.find({"development_id": tier_id}, {"_id": 0}).limit(200)
            async for u in cur:
                children.append({
                    "tier": "unit", "tier_id": u.get("id") or u.get("unit_id"),
                    "name": u.get("unit_number") or u.get("name") or u.get("id"),
                    "kpis": {
                        "price_mxn": u.get("price") or u.get("price_mxn"),
                        "m2": u.get("m2_privative") or u.get("size_m2"),
                        "status": u.get("status"),
                    },
                })

    return {"node": node, "next_tier": next_tier, "children": children,
            "children_count": len(children)}


# ─── Cron registration helper ─────────────────────────────────────────────────
def schedule_metrics_cube_daily_aggregation(scheduler, db) -> None:
    """Register daily 2:15am MX cron with cron_heartbeat instrumentation."""
    try:
        from cron_heartbeat import wrap_apscheduler_job
        from apscheduler.triggers.cron import CronTrigger
        scheduler.add_job(
            wrap_apscheduler_job(cube.metrics_cube_daily_aggregation,
                                 "metrics_cube_daily_aggregation"),
            CronTrigger(hour=2, minute=15, timezone="America/Mexico_City"),
            args=[db], id="metrics_cube_daily_aggregation",
            replace_existing=True, misfire_grace_time=1800,
        )
    except Exception as e:
        log.warning(f"[cube] schedule daily cron failed: {e}")
