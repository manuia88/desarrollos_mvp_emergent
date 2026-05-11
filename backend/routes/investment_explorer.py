"""W3.3 ZZ.3 — Investment Explorer Routes (AirDNA-style).

Superadmin endpoints (V1; opens to subscribers in W3.5+).

  GET  /api/superadmin/investment-explorer/zones
       Sortable table per buyer_objective:
         - sort: score | yield | growth_30d | risk | dom
         - tier: colonia | alcaldia
         - buyer_objective: cashflow | appreciation | balanced
       Each row joins:
         zone_score (W3.1A), drpi delta (W3.3), risk placeholder (W3.4),
         dom + median_price from price_index_snapshots (W3.2).

  GET  /api/superadmin/investment-explorer/zones/{zone_id}/detail
       Drill-down full scorecard.
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Query, Request

log = logging.getLogger("dmx.routes_investment_explorer")

router = APIRouter(tags=["investment_explorer"])


def _db(request: Request):
    return request.app.state.db


async def _sa(request: Request):
    from permissions import require_superadmin
    return await require_superadmin(request)


def _recommended(buyer_obj: str, row: dict) -> bool:
    yld = row.get("yield_pct") or 0
    growth = row.get("growth_pct_30d") or 0
    risk = row.get("risk_score") or 50
    score = row.get("zone_score_numeric") or 0
    if buyer_obj == "cashflow":
        return yld >= 6 and risk <= 60 and score >= 50
    if buyer_obj == "appreciation":
        return growth >= 0.5 and score >= 60
    # balanced
    return score >= 55 and yld >= 4 and risk <= 65


async def _join_zone_row(db, zone_id: str, tier: str = "colonia") -> dict:
    # Zone Score
    zs = await db.zone_scores.find_one(
        {"zone_id": zone_id},
        {"_id": 0, "score_letter": 1, "score_numeric": 1,
         "components": 1, "zone_name": 1, "computed_at": 1},
        sort=[("computed_at_dt", -1)],
    ) or {}

    # DRPI latest snapshot
    dr = await db.drpi_snapshots.find_one(
        {"zone_id": zone_id, "tier": tier, "available": True},
        {"_id": 0, "index_value": 1, "delta_pct": 1, "period": 1},
        sort=[("computed_at_dt", -1)],
    ) or {}

    # Price Index (last)
    pi = await db.price_index_snapshots.find_one(
        {"zone_id": zone_id, "tier": tier},
        {"_id": 0, "median_price_per_m2": 1, "median_discount_pct": 1, "transactions_count": 1},
        sort=[("computed_at", -1)],
    ) or {}

    # DOM avg from last 30d transactions (cheap aggregate)
    from datetime import datetime, timezone, timedelta
    cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    dom_pipeline = [
        {"$match": {"zone_id": zone_id, "closed_at": {"$gte": cutoff}}},
        {"$group": {"_id": None, "avg": {"$avg": "$days_on_market"}}},
    ]
    dom_res = await db.transactions.aggregate(dom_pipeline).to_list(1)
    dom_avg = round(dom_res[0]["avg"] or 0, 1) if dom_res else None

    # Yield from cube avg_rental_mxn / avg_price (approx)
    cube = await db.cube_aggregations.find_one(
        {"tier_id": zone_id, "period": "current"},
        {"_id": 0, "kpis": 1, "name": 1},
    ) or {}
    kpis = (cube or {}).get("kpis") or {}
    avg_price = kpis.get("avg_price_mxn") or 0
    avg_rental = kpis.get("avg_rental_mxn") or (avg_price * 0.004 if avg_price else 0)
    yield_pct = round((avg_rental * 12 / avg_price) * 100, 2) if avg_price else None

    # Risk Score placeholder (W3.4 will replace) — neutral 50
    risk_score = 50

    return {
        "zone_id": zone_id,
        "tier": tier,
        "zone_name": zs.get("zone_name") or cube.get("name") or zone_id,
        "zone_score_letter": zs.get("score_letter"),
        "zone_score_numeric": zs.get("score_numeric"),
        "yield_pct": yield_pct,
        "growth_pct_30d": dr.get("delta_pct"),
        "drpi_index_value": dr.get("index_value"),
        "drpi_period": dr.get("period"),
        "risk_score": risk_score,
        "risk_score_status": "placeholder_w3_4",
        "dom_avg": dom_avg,
        "median_price_per_m2": pi.get("median_price_per_m2"),
        "transactions_count_30d": pi.get("transactions_count") or 0,
    }


@router.get("/api/superadmin/investment-explorer/zones")
async def investment_explorer_list(
    request: Request,
    sort: str = Query("score", description="score|yield|growth_30d|risk|dom"),
    tier: str = Query("colonia"),
    buyer_objective: str = Query("balanced", description="cashflow|appreciation|balanced"),
    limit: int = Query(50, ge=1, le=200),
    skip: int = Query(0, ge=0),
):
    await _sa(request)
    db = _db(request)

    # Universe of zones from cube
    cursor = db.cube_aggregations.find(
        {"period": "current", "tier": tier}, {"_id": 0, "tier_id": 1},
    ).limit(500)
    zone_ids = [r["tier_id"] async for r in cursor]
    if not zone_ids:
        # Fallback: zones present in transactions
        zone_ids = await db.transactions.distinct("zone_id", {"tier": tier})

    rows = []
    for zid in zone_ids:
        try:
            row = await _join_zone_row(db, zid, tier)
            row["recommended_for_objective"] = _recommended(buyer_objective, row)
            rows.append(row)
        except Exception as e:
            log.warning(f"[investment] join failed {zid}: {e}")

    # Sort
    sort_keys = {
        "score":     ("zone_score_numeric", True),
        "yield":     ("yield_pct", True),
        "growth_30d":("growth_pct_30d", True),
        "risk":      ("risk_score", False),  # lower is better
        "dom":       ("dom_avg", False),     # lower is better
    }
    key, desc = sort_keys.get(sort, ("zone_score_numeric", True))
    rows.sort(key=lambda r: (r.get(key) is None, r.get(key) or 0), reverse=desc)

    total = len(rows)
    paged = rows[skip: skip + limit]
    return {
        "items": paged,
        "count": len(paged),
        "count_total": total,
        "sort": sort,
        "tier": tier,
        "buyer_objective": buyer_objective,
    }


@router.get("/api/superadmin/investment-explorer/zones/{zone_id}/detail")
async def investment_explorer_detail(
    zone_id: str, request: Request,
    tier: str = Query("colonia"),
):
    await _sa(request)
    db = _db(request)
    row = await _join_zone_row(db, zone_id, tier)

    # Augment with full hedonic + zone score components
    zs_full = await db.zone_scores.find_one(
        {"zone_id": zone_id}, {"_id": 0, "computed_at_dt": 0},
        sort=[("computed_at_dt", -1)],
    )
    hedonic_full = await db.hedonic_models.find_one(
        {"zone_id": zone_id, "tier": tier},
        {"_id": 0, "fit_at_dt": 0},
        sort=[("fit_at_dt", -1)],
    )
    drpi_history_cursor = db.drpi_snapshots.find(
        {"zone_id": zone_id, "tier": tier},
        {"_id": 0, "computed_at_dt": 0},
    ).sort("period", -1).limit(12)
    drpi_history = [d async for d in drpi_history_cursor]
    drpi_history.reverse()

    return {
        "zone": row,
        "zone_score_full": zs_full,
        "hedonic_model": hedonic_full,
        "drpi_history": drpi_history,
    }
