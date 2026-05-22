"""W5.15 wire — Superadmin FSD accuracy dashboard route.

Endpoint:
  GET /api/fsd/accuracy?days=30 → {mape_rolling, n_predictions, accuracy_by_property, distribution}

Lee de `prediction_accuracy_log` (poblado por accuracy_engine.record_prediction_accuracy
cuando se cierra un lead con precio real).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List

from fastapi import APIRouter, Request, Query

from permissions import require_superadmin

log = logging.getLogger("dmx.fsd_routes")
router = APIRouter()


def _bucket(mape_pct: float) -> str:
    if mape_pct <= 5:
        return "0-5%"
    if mape_pct <= 10:
        return "5-10%"
    if mape_pct <= 20:
        return "10-20%"
    if mape_pct <= 40:
        return "20-40%"
    return "40%+"


@router.get("/api/fsd/accuracy")
async def fsd_accuracy(
    request: Request,
    days: int = Query(30, ge=1, le=365),
):
    await require_superadmin(request)
    db = request.app.state.db

    cutoff = datetime.now(timezone.utc) - timedelta(days=int(days))
    cursor = db.prediction_accuracy_log.find(
        {"computed_at_dt": {"$gte": cutoff}},
        {"_id": 0},
    ).sort("computed_at_dt", -1)

    rows: List[Dict[str, Any]] = []
    mape_values: List[float] = []
    bucket_counts: Dict[str, int] = {"0-5%": 0, "5-10%": 0, "10-20%": 0, "20-40%": 0, "40%+": 0}

    async for d in cursor:
        try:
            err = float(d.get("error_pct") or 0)
        except (TypeError, ValueError):
            continue
        mape_values.append(err)
        bucket_counts[_bucket(err)] += 1
        rows.append({
            "property_id": d.get("property_id"),
            "predicted_value": d.get("predicted_value"),
            "actual_value": d.get("actual_value"),
            "mape_pct": round(err, 2),
            "was_within_band": bool(d.get("was_within")),
            "computed_at": d.get("computed_at"),
        })

    n = len(mape_values)
    mape_rolling = round(sum(mape_values) / n, 2) if n else None

    rows.sort(key=lambda r: r["mape_pct"] or 0, reverse=True)
    top_worst = rows[:20]

    return {
        "days_window": int(days),
        "n_predictions": n,
        "mape_rolling": mape_rolling,
        "distribution": bucket_counts,
        "accuracy_by_property": top_worst,
    }
