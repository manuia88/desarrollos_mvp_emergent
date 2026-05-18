"""W5.15 Parte 1 Sub-E — Accuracy routes (8 endpoints + notif hooks).

Publicos T0:
  GET /api/avm/fsd/{property_id}
  GET /api/accuracy/meta-dashboard
  GET /api/accuracy/export.csv?period=30d|90d|365d

Superadmin:
  GET  /api/accuracy/per-zone
  GET  /api/accuracy/calibration-curve
  GET  /api/superadmin/accuracy/debug
  GET  /api/superadmin/accuracy/zone-weights
  POST /api/superadmin/accuracy/trigger-drift-check
"""
from __future__ import annotations

import csv
import io
import logging
import time
from collections import defaultdict, deque
from datetime import datetime, timezone, timedelta
from typing import Any, Dict

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response

import accuracy_engine
import drift_detector

log = logging.getLogger("dmx.routes.accuracy")

router = APIRouter()


def _db(request: Request):
    return request.app.state.db


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ─── Rate-limit (60 req/min/IP para endpoints publicos pesados) ──────────────

_RATE_BUCKET: Dict[str, deque] = defaultdict(lambda: deque(maxlen=60))
_RATE_WINDOW_S = 60


def _rate_limit(request: Request, key: str) -> None:
    ip = request.client.host if request.client else "anon"
    bucket_key = f"{key}:{ip}"
    bucket = _RATE_BUCKET[bucket_key]
    now = time.time()
    while bucket and (now - bucket[0]) > _RATE_WINDOW_S:
        bucket.popleft()
    if len(bucket) >= 60:
        raise HTTPException(status_code=429, detail="Rate limit excedido · 60/min")
    bucket.append(now)


# ─── Endpoint 1 — FSD per-property (publico) ─────────────────────────────────

@router.get("/api/avm/fsd/{property_id}")
async def get_fsd(property_id: str, request: Request):
    _rate_limit(request, "fsd")
    db = _db(request)
    pred = await db.avm_predictions.find_one(
        {"property_id": property_id}, {"_id": 0},
        sort=[("prediction_date_dt", -1)],
    )
    if not pred:
        return {"available": False, "reason": "no_prediction", "property_id": property_id}
    return {
        "available": True,
        "property_id": property_id,
        "zone_slug": pred.get("zone_slug"),
        "value": pred.get("fsd_value") or pred.get("predicted_value"),
        "low_estimate": pred.get("low_estimate"),
        "high_estimate": pred.get("high_estimate"),
        "fsd_pct": pred.get("fsd_pct"),
        "confidence_lvl": pred.get("confidence_lvl"),
        "feature_breakdown": pred.get("feature_breakdown") or {},
        "model_id": pred.get("model_id"),
        "prediction_date": pred.get("prediction_date"),
    }


# ─── Endpoint 2 — Meta dashboard (publico Fitch-style) ───────────────────────

@router.get("/api/accuracy/meta-dashboard")
async def meta_dashboard(request: Request):
    _rate_limit(request, "meta")
    db = _db(request)
    mape = await accuracy_engine.compute_mape_rolling(db, None, days=30)
    if not mape.get("available"):
        # ETA: dias para llegar a 20 cierres a ritmo actual (rough)
        n = int(mape.get("sample_size") or 0)
        eta = max(1, (accuracy_engine.MIN_SAMPLE - n) * 7)
        return {
            "state": "insufficient_data",
            "message": "Data acumulandose",
            "sample_size": n,
            "min_required": accuracy_engine.MIN_SAMPLE,
            "eta_days": eta,
            "last_updated": _now().isoformat(),
        }
    hit = await accuracy_engine.compute_hit_rate(db, None, days=30)
    cal = await accuracy_engine.calibration_curve(db, days=90, bins=10)
    mape_pct = float(mape.get("mape_pct") or 0.0)
    if mape_pct < 8:
        conf_label = "ALTA"
    elif mape_pct < 15:
        conf_label = "MEDIA"
    else:
        conf_label = "BAJA"
    return {
        "state": "available",
        "global_mape_30d": mape["mape_pct"],
        "hit_rate": hit.get("hit_rate") if hit.get("available") else None,
        "sample_size": mape["sample_size"],
        "confidence_label": conf_label,
        "calibration_curve_data": cal.get("bins") if cal.get("available") else [],
        "calibration_error": cal.get("calibration_error"),
        "last_updated": _now().isoformat(),
    }


# ─── Endpoint 3 — Per-zone (superadmin) ──────────────────────────────────────

@router.get("/api/accuracy/per-zone")
async def per_zone(request: Request):
    from permissions import require_superadmin
    await require_superadmin(request)
    db = _db(request)
    zones = await drift_detector.list_top_zones_for_drift(db, limit=50)
    out = []
    for z in zones:
        mape = await accuracy_engine.compute_mape_rolling(db, z, days=30)
        hit = await accuracy_engine.compute_hit_rate(db, z, days=30)
        zw = await db.zone_weights.find_one(
            {"zone_slug": z}, {"_id": 0, "version": 1, "r2_score": 1, "sample_size": 1},
        )
        mape_pct = mape.get("mape_pct") if mape.get("available") else None
        if mape_pct is None:
            conf = "BAJA"
        elif mape_pct < 8:
            conf = "ALTA"
        elif mape_pct < 15:
            conf = "MEDIA"
        else:
            conf = "BAJA"
        out.append({
            "zone_slug": z,
            "mape_30d": mape_pct,
            "hit_rate": hit.get("hit_rate") if hit.get("available") else None,
            "sample_size": mape.get("sample_size") or 0,
            "confidence_label": conf,
            "weights_version": (zw or {}).get("version"),
            "weights_r2": (zw or {}).get("r2_score"),
        })
    return {"zones": out, "count": len(out)}


# ─── Endpoint 4 — Calibration curve (superadmin) ─────────────────────────────

@router.get("/api/accuracy/calibration-curve")
async def calibration_curve_endpoint(request: Request, days: int = 90, bins: int = 10):
    from permissions import require_superadmin
    await require_superadmin(request)
    db = _db(request)
    days = max(1, min(int(days), 365))
    bins = max(2, min(int(bins), 20))
    return await accuracy_engine.calibration_curve(db, days=days, bins=bins)


# ─── Endpoint 5 — Debug per-property (superadmin) ────────────────────────────

@router.get("/api/superadmin/accuracy/debug")
async def debug_property(request: Request, property_id: str, days: int = 30):
    from permissions import require_superadmin
    await require_superadmin(request)
    days = max(1, min(int(days), 365))
    db = _db(request)
    cutoff = _now() - timedelta(days=days)
    rows = await db.prediction_accuracy_log.find(
        {"property_id": property_id, "close_date_dt": {"$gte": cutoff}},
        {"_id": 0},
    ).sort("close_date_dt", -1).to_list(100)
    pred = await db.avm_predictions.find_one(
        {"property_id": property_id}, {"_id": 0},
        sort=[("prediction_date_dt", -1)],
    )
    return {
        "property_id": property_id,
        "days": days,
        "latest_prediction": pred,
        "accuracy_log": rows,
        "count": len(rows),
    }


# ─── Endpoint 6 — Zone weights aprendidos (superadmin) ──────────────────────

@router.get("/api/superadmin/accuracy/zone-weights")
async def zone_weights_list(request: Request):
    from permissions import require_superadmin
    await require_superadmin(request)
    db = _db(request)
    rows = []
    cursor = db.zone_weights.find({}, {"_id": 0}).sort("optimized_at_dt", -1)
    async for r in cursor:
        rows.append({
            "zone_slug": r.get("zone_slug"),
            "weights": r.get("weights"),
            "intercept": r.get("intercept"),
            "r2_score": r.get("r2_score"),
            "sample_size": r.get("sample_size"),
            "optimized_at": r.get("optimized_at"),
            "version": r.get("version"),
        })
    return {"zones": rows, "count": len(rows)}


# ─── Endpoint 7 — Trigger drift manual (superadmin) ──────────────────────────

@router.post("/api/superadmin/accuracy/trigger-drift-check")
async def trigger_drift_check(request: Request, zone_slug: str):
    from permissions import require_superadmin
    user = await require_superadmin(request)
    if not zone_slug:
        raise HTTPException(status_code=422, detail="zone_slug es requerido")
    db = _db(request)
    result = await drift_detector.check_drift(db, zone_slug)
    try:
        from audit_immutable_engine import log as audit_log
        await audit_log(
            db,
            actor={"user_id": getattr(user, "user_id", "superadmin"), "role": "superadmin"},
            action="accuracy_trigger_drift_check",
            entity_type="zone_accuracy",
            entity_id=zone_slug,
            before=None,
            after=result,
            request=request,
        )
    except Exception as exc:
        log.warning(f"[accuracy.trigger_drift] audit failed: {exc}")
    return result


# ─── Endpoint 8 — CSV export ─────────────────────────────────────────────────

@router.get("/api/accuracy/export.csv")
async def export_csv(request: Request, period: str = "30d"):
    _rate_limit(request, "export")
    days_map = {"30d": 30, "90d": 90, "365d": 365}
    if period not in days_map:
        raise HTTPException(status_code=422, detail="period debe ser 30d, 90d o 365d")
    days = days_map[period]
    db = _db(request)
    cutoff = _now() - timedelta(days=days)
    cursor = db.prediction_accuracy_log.find(
        {"close_date_dt": {"$gte": cutoff}}, {"_id": 0},
    ).sort("close_date_dt", -1)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "close_date", "zone_slug", "property_id", "predicted_value", "actual_value",
        "error_abs", "error_pct", "fsd_pct_at_prediction", "confidence_lvl", "was_within_range",
    ])
    n = 0
    async for r in cursor:
        writer.writerow([
            (r.get("close_date") or "")[:10],
            r.get("zone_slug") or "",
            r.get("property_id") or "",
            r.get("predicted_value") or 0,
            r.get("actual_value") or 0,
            r.get("error_abs") or 0,
            r.get("error_pct") or 0,
            r.get("fsd_pct_at_prediction") or "",
            r.get("confidence_lvl") or "",
            "1" if r.get("was_within_range") else "0",
        ])
        n += 1
    log.info(f"[accuracy] export.csv period={period} rows={n}")
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="accuracy_{period}.csv"'},
    )
