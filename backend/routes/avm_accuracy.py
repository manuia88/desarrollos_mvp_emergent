"""W5.1 Sub-Chunk B — Superadmin AVM accuracy dashboard routes.

Endpoints:
  GET  /api/superadmin/avm-accuracy/summary       · KPIs + drift por colonia
  GET  /api/superadmin/avm-accuracy/promotions    · Log de promociones
  POST /api/superadmin/avm-accuracy/trigger-retrain · Disparar cron manual
  GET  /api/superadmin/avm-accuracy/golden-validation · Validar contra dataset golden
  GET  /api/superadmin/avm-accuracy/cache-stats   · Stats del LRU cache

Todas requieren superadmin.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException, Request, Query
from fastapi.responses import JSONResponse

from permissions import require_superadmin

log = logging.getLogger("dmx.avm_accuracy_routes")
router = APIRouter()


def _strip(doc: Dict[str, Any]) -> Dict[str, Any]:
    d = dict(doc)
    d.pop("_id", None)
    for k in ("fit_at_dt", "promoted_at_dt"):
        d.pop(k, None)
    return d


@router.get("/api/superadmin/avm-accuracy/summary")
async def avm_accuracy_summary(request: Request):
    await require_superadmin(request)
    db = request.app.state.db

    # Modelos promovidos actuales (más reciente por zone+tier)
    promoted_cursor = db.hedonic_models.find(
        {"available": True, "promoted_at": {"$exists": True}},
        {"_id": 0},
    ).sort("promoted_at_dt", -1)

    promoted_by_zone: Dict[str, Dict[str, Any]] = {}
    async for d in promoted_cursor:
        key = f"{d.get('zone_id')}|{d.get('tier')}"
        if key not in promoted_by_zone:
            promoted_by_zone[key] = _strip(d)

    # Latest fit por zone (independiente de promoción)
    latest_fits: Dict[str, Dict[str, Any]] = {}
    latest_cursor = db.hedonic_models.find({}, {"_id": 0}).sort("fit_at_dt", -1)
    async for d in latest_cursor:
        key = f"{d.get('zone_id')}|{d.get('tier')}"
        if key not in latest_fits:
            latest_fits[key] = _strip(d)

    # Drift: delta R² entre último fit y modelo promovido
    drift_rows: List[Dict[str, Any]] = []
    r2_values: List[float] = []
    sample_values: List[int] = []
    for key, latest in latest_fits.items():
        promo = promoted_by_zone.get(key)
        latest_r2 = float(latest.get("r_squared") or 0) if latest.get("available") else None
        promo_r2 = float(promo.get("r_squared") or 0) if promo else None
        if promo_r2 is not None:
            r2_values.append(promo_r2)
        if latest.get("sample_size"):
            sample_values.append(int(latest["sample_size"]))
        drift_rows.append({
            "zone_id": latest.get("zone_id"),
            "tier": latest.get("tier"),
            "latest_r2": round(latest_r2, 4) if latest_r2 is not None else None,
            "promoted_r2": round(promo_r2, 4) if promo_r2 is not None else None,
            "delta_r2": round((latest_r2 or 0) - (promo_r2 or 0), 4) if latest_r2 is not None and promo_r2 is not None else None,
            "latest_sample_size": latest.get("sample_size"),
            "promoted_at": (promo or {}).get("promoted_at"),
            "latest_fit_at": latest.get("fit_at"),
            "available": bool(latest.get("available")),
        })

    # Sort: drift más negativo primero (más urgente revisar)
    drift_rows.sort(key=lambda r: (r["delta_r2"] is None, r["delta_r2"] or 0))

    avg_r2 = round(sum(r2_values) / len(r2_values), 4) if r2_values else None
    avg_sample = int(sum(sample_values) / len(sample_values)) if sample_values else None

    # Promotions last 30d
    cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    promotions_30d = await db.hedonic_promotion_log.count_documents(
        {"promoted_at": {"$gte": cutoff}}
    )

    # Última corrida del cron
    last_run = await db.hedonic_retrain_runs.find_one(
        {}, {"_id": 0, "results_sample": 0}, sort=[("finished_at", -1)],
    )
    if last_run:
        last_run = _strip(last_run)

    # Cache stats
    cache_stats: Dict[str, Any]
    try:
        import avm_cache
        cache_stats = avm_cache.stats()
    except Exception:
        cache_stats = {}

    return JSONResponse({
        "ok": True,
        "kpis": {
            "total_zones_modeled": len(latest_fits),
            "total_zones_promoted": len(promoted_by_zone),
            "avg_promoted_r2": avg_r2,
            "avg_sample_size": avg_sample,
            "promotions_last_30d": promotions_30d,
        },
        "drift_by_zone": drift_rows,
        "last_retrain_run": last_run,
        "cache_stats": cache_stats,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    })


@router.get("/api/superadmin/avm-accuracy/promotions")
async def avm_accuracy_promotions(
    request: Request,
    limit: int = Query(100, ge=1, le=500),
):
    await require_superadmin(request)
    db = request.app.state.db

    cursor = db.hedonic_promotion_log.find({}, {"_id": 0}).sort("promoted_at_dt", -1).limit(limit)
    rows: List[Dict[str, Any]] = []
    async for d in cursor:
        rows.append(_strip(d))

    return JSONResponse({"ok": True, "promotions": rows, "count": len(rows)})


@router.post("/api/superadmin/avm-accuracy/trigger-retrain")
async def avm_accuracy_trigger_retrain(request: Request):
    await require_superadmin(request)
    db = request.app.state.db

    from avm_retrain_cron import run_nightly_retrain
    log.info("[avm-accuracy] manual retrain triggered by superadmin")
    summary = await run_nightly_retrain(db)
    # Strip non-JSON-serializable dt fields
    summary = {k: v for k, v in summary.items() if k != "results_sample"} | {
        "results_sample": summary.get("results_sample") or [],
    }
    return JSONResponse({"ok": True, "run_summary": summary})


@router.get("/api/superadmin/avm-accuracy/golden-validation")
async def avm_accuracy_golden_validation(request: Request):
    await require_superadmin(request)
    db = request.app.state.db

    from golden_avm_data import validate_against_engine
    result = await validate_against_engine(db)
    return JSONResponse({"ok": True, **result, "generated_at": datetime.now(timezone.utc).isoformat()})


@router.get("/api/superadmin/avm-accuracy/cache-stats")
async def avm_accuracy_cache_stats(request: Request):
    await require_superadmin(request)
    try:
        import avm_cache
        return JSONResponse({"ok": True, **avm_cache.stats()})
    except Exception as exc:
        raise HTTPException(500, f"cache_stats_error:{exc}")


@router.post("/api/superadmin/avm-accuracy/cache-invalidate")
async def avm_accuracy_cache_invalidate(request: Request):
    await require_superadmin(request)
    try:
        import avm_cache
        n = await avm_cache.invalidate_all()
        return JSONResponse({"ok": True, "entries_removed": n})
    except Exception as exc:
        raise HTTPException(500, f"cache_invalidate_error:{exc}")
