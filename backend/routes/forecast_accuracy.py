"""W5.3 Parte 2A Sub-B — Forecast accuracy dashboard endpoints (superadmin).

Endpoints:
  GET  /api/superadmin/forecast-accuracy/summary
  GET  /api/superadmin/forecast-accuracy/per-zone?horizon=12
  POST /api/superadmin/forecast-accuracy/run-backtest

Schema `forecast_accuracy_snapshots`:
  { id, snapshot_dt, zone_slug, horizon_months, forecast_value_then,
    actual_value_now, abs_pct_error, fitted_at_original }
"""
from __future__ import annotations

import asyncio
import logging
import secrets
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException, Request, Query
from fastapi.responses import JSONResponse

from permissions import require_superadmin

log = logging.getLogger("dmx.forecast_accuracy")
router = APIRouter()

_backtest_lock = asyncio.Lock()


def _new_id(prefix: str = "fa_snap") -> str:
    return f"{prefix}_{secrets.token_urlsafe(8)}"


def _strip(doc: Dict[str, Any]) -> Dict[str, Any]:
    d = dict(doc)
    d.pop("_id", None)
    for k in ("snapshot_dt", "fitted_at_dt"):
        d.pop(k, None)
    return d


# ─── Backtest helpers ─────────────────────────────────────────────────────────

async def _drpi_at_or_before(db, zone_slug: str, dt) -> float:
    """Devuelve el index_value DRPI más cercano (≤ dt). Si no hay, 0."""
    period = dt.strftime("%Y-%m")
    snap = await db.drpi_snapshots.find_one(
        {"zone_id": zone_slug, "available": True, "period": {"$lte": period}},
        {"_id": 0, "index_value": 1, "period": 1},
        sort=[("period", -1)],
    )
    return float((snap or {}).get("index_value") or 0)


async def _backtest_zone_forecast(db, zone_slug: str) -> int:
    """Genera snapshots de accuracy comparando forecasts pasados con DRPI actual.

    Estrategia conservadora: por cada forecast persistido en `zone_forecasts`,
    si `fitted_at` es ≥ 6 / 12 / 24 meses atrás, se compara el valor que el
    forecast predijo para ese horizonte con el DRPI actual.
    """
    fc = await db.zone_forecasts.find_one({"zone_slug": zone_slug, "available": True}, {"_id": 0})
    if not fc:
        return 0

    fitted_at = fc.get("fitted_at")
    if not fitted_at:
        return 0
    try:
        fitted_dt = datetime.fromisoformat(fitted_at.replace("Z", "+00:00"))
    except Exception:
        return 0

    now = datetime.now(timezone.utc)
    inserted = 0
    horizons = fc.get("horizons") or {}
    for h_label, band in horizons.items():
        try:
            h_months = int(h_label.replace("m", ""))
        except Exception:
            continue
        target_dt = fitted_dt + timedelta(days=h_months * 30)
        if target_dt > now:
            continue  # horizonte futuro, aún no se puede medir

        actual = await _drpi_at_or_before(db, zone_slug, target_dt)
        if actual <= 0:
            continue
        forecast_value = float(band.get("value") or 0)
        if forecast_value <= 0:
            continue
        abs_pct_error = round(abs(forecast_value - actual) / actual * 100.0, 2)
        doc = {
            "id": _new_id("fa_snap"),
            "snapshot_dt": now,
            "snapshot_iso": now.isoformat(),
            "zone_slug": zone_slug,
            "horizon_months": h_months,
            "forecast_value_then": round(forecast_value, 2),
            "actual_value_now": round(actual, 2),
            "abs_pct_error": abs_pct_error,
            "fitted_at_original": fitted_at,
        }
        try:
            await db.forecast_accuracy_snapshots.insert_one(dict(doc))
            inserted += 1
        except Exception as e:
            log.warning(f"[fa] insert snapshot failed {zone_slug}/{h_months}m: {e}")
    return inserted


async def _run_backtest_all(db) -> Dict[str, Any]:
    started_at = datetime.now(timezone.utc)
    cursor = db.zone_forecasts.find({"available": True}, {"_id": 0, "zone_slug": 1})
    slugs = [d["zone_slug"] async for d in cursor]
    total_inserted = 0
    zones_with_data = 0
    for slug in slugs:
        try:
            n = await _backtest_zone_forecast(db, slug)
            total_inserted += n
            if n > 0:
                zones_with_data += 1
        except Exception as e:
            log.warning(f"[fa] backtest error {slug}: {e}")

    finished_at = datetime.now(timezone.utc)
    summary = {
        "started_at": started_at.isoformat(),
        "finished_at": finished_at.isoformat(),
        "duration_s": round((finished_at - started_at).total_seconds(), 2),
        "zones_evaluated": len(slugs),
        "zones_with_new_snapshots": zones_with_data,
        "snapshots_inserted": total_inserted,
    }
    try:
        await db.forecast_accuracy_runs.insert_one({**summary, "ran_at_dt": started_at})
    except Exception as e:
        log.warning(f"[fa] insert run summary failed: {e}")
    return summary


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/api/superadmin/forecast-accuracy/summary")
async def fa_summary(request: Request):
    await require_superadmin(request)
    db = request.app.state.db

    # MAPE por horizonte (global)
    mape_by_horizon: Dict[str, Any] = {}
    for h in (6, 12, 24):
        pipeline = [
            {"$match": {"horizon_months": h}},
            {"$group": {"_id": None, "avg": {"$avg": "$abs_pct_error"}, "count": {"$sum": 1}}},
        ]
        rows = await db.forecast_accuracy_snapshots.aggregate(pipeline).to_list(1)
        if rows:
            mape_by_horizon[f"{h}m"] = {
                "mape_pct": round(float(rows[0]["avg"]), 2),
                "sample_size": int(rows[0]["count"]),
            }
        else:
            mape_by_horizon[f"{h}m"] = {"mape_pct": None, "sample_size": 0}

    zones_modeled = await db.zone_forecasts.count_documents({"available": True})
    total_snapshots = await db.forecast_accuracy_snapshots.count_documents({})

    last_run = await db.forecast_accuracy_runs.find_one(
        {}, {"_id": 0, "ran_at_dt": 0}, sort=[("ran_at_dt", -1)],
    )

    # Tendencia 30d (MAPE 12m por día agregado)
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    trend_pipeline = [
        {"$match": {"horizon_months": 12, "snapshot_dt": {"$gte": cutoff}}},
        {"$group": {
            "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$snapshot_dt"}},
            "mape": {"$avg": "$abs_pct_error"},
            "count": {"$sum": 1},
        }},
        {"$sort": {"_id": 1}},
    ]
    trend_rows = await db.forecast_accuracy_snapshots.aggregate(trend_pipeline).to_list(60)
    accuracy_30d_trend = [
        {"date": r["_id"], "mape_pct": round(float(r["mape"]), 2), "sample_size": int(r["count"])}
        for r in trend_rows
    ]

    return JSONResponse({
        "ok": True,
        "zones_modeled": zones_modeled,
        "mape_by_horizon": mape_by_horizon,
        "total_snapshots": total_snapshots,
        "last_run": last_run,
        "accuracy_30d_trend": accuracy_30d_trend,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    })


@router.get("/api/superadmin/forecast-accuracy/per-zone")
async def fa_per_zone(
    request: Request,
    horizon: int = Query(12, ge=1, le=36),
    limit: int = Query(50, ge=1, le=200),
):
    await require_superadmin(request)
    db = request.app.state.db

    pipeline = [
        {"$match": {"horizon_months": horizon}},
        {"$group": {
            "_id": "$zone_slug",
            "mape": {"$avg": "$abs_pct_error"},
            "sample_size": {"$sum": 1},
            "fitted_at_original": {"$last": "$fitted_at_original"},
            "last_snapshot": {"$max": "$snapshot_iso"},
        }},
        {"$match": {"sample_size": {"$gte": 3}}},  # excluir zonas con <3 muestras
        {"$sort": {"mape": -1}},
        {"$limit": limit},
        {"$project": {
            "_id": 0,
            "zone_slug": "$_id",
            "mape_pct": {"$round": ["$mape", 2]},
            "sample_size": 1,
            "fitted_at_original": 1,
            "last_snapshot": 1,
        }},
    ]
    rows = await db.forecast_accuracy_snapshots.aggregate(pipeline).to_list(limit)
    return JSONResponse({"ok": True, "horizon_months": horizon, "rows": rows, "count": len(rows)})


@router.post("/api/superadmin/forecast-accuracy/run-backtest")
async def fa_run_backtest(request: Request):
    await require_superadmin(request)
    db = request.app.state.db
    if _backtest_lock.locked():
        raise HTTPException(409, "backtest_already_running")
    async with _backtest_lock:
        summary = await _run_backtest_all(db)
    return JSONResponse({"ok": True, "summary": summary})


async def ensure_indexes(db) -> None:
    try:
        await db.forecast_accuracy_snapshots.create_index(
            [("zone_slug", 1), ("horizon_months", 1), ("snapshot_dt", -1)],
            name="fa_zone_h_ts",
        )
        await db.forecast_accuracy_snapshots.create_index(
            "snapshot_dt", expireAfterSeconds=730 * 86400, name="fa_ttl_2y",
        )
        await db.forecast_accuracy_runs.create_index("ran_at_dt", name="fa_runs_ts")
    except Exception as e:
        log.warning(f"[fa] ensure_indexes failed: {e}")
