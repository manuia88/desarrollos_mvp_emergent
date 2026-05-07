"""W2.7 Phase Z.0 — Model validation engine (R², RMSE, MAPE).

Public methodology metrics for V1 models:
  • cube_avg_price — predicted avg price per zone vs observed avg
  • metrics_cube_kpis — N vs N-1 day consistency

V2 models deferred to Wave 3 (drpi_hedonic, risk_score, construction_cost).
"""
from __future__ import annotations

import logging
import math
import secrets
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple

log = logging.getLogger("dmx.model_validation_engine")

REGISTERED_MODELS = ("cube_avg_price", "metrics_cube_kpis")


def _iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id() -> str:
    return "mv_" + secrets.token_urlsafe(10)


# ─── Statistical helpers ──────────────────────────────────────────────────────

def compute_metrics(predictions: List[float], actuals: List[float]) -> Dict[str, Any]:
    """Returns {r_squared, rmse, mape, sample_size, ci_95}."""
    n = min(len(predictions), len(actuals))
    if n < 2:
        return {"r_squared": None, "rmse": None, "mape": None, "sample_size": n,
                "confidence_interval_95": None}
    pairs = [(p, a) for p, a in zip(predictions[:n], actuals[:n])
             if p is not None and a is not None and not math.isnan(p) and not math.isnan(a)]
    n = len(pairs)
    if n < 2:
        return {"r_squared": None, "rmse": None, "mape": None, "sample_size": n,
                "confidence_interval_95": None}

    preds = [p for p, _ in pairs]  # noqa: F841 (kept for symmetry/debug)
    acts = [a for _, a in pairs]
    mean_a = sum(acts) / n

    ss_res = sum((a - p) ** 2 for p, a in pairs)
    ss_tot = sum((a - mean_a) ** 2 for a in acts)
    r2 = 1 - (ss_res / ss_tot) if ss_tot > 0 else None
    rmse = math.sqrt(ss_res / n)

    mape_vals = [abs((a - p) / a) for p, a in pairs if a != 0]
    mape = (sum(mape_vals) / len(mape_vals)) * 100 if mape_vals else None

    # Bootstrap 95% CI on R² (simple t-based approx)
    ci_95: Optional[List[float]] = None
    if r2 is not None and n >= 5:
        # Standard error approximation
        try:
            se_r2 = math.sqrt((1 - r2 ** 2) / (n - 2)) if r2 < 1 else 0
            ci_95 = [round(max(-1.0, r2 - 1.96 * se_r2), 4),
                     round(min(1.0, r2 + 1.96 * se_r2), 4)]
        except Exception:
            ci_95 = None

    return {
        "r_squared": round(r2, 4) if r2 is not None else None,
        "rmse": round(rmse, 4),
        "mape": round(mape, 4) if mape is not None else None,
        "sample_size": n,
        "confidence_interval_95": ci_95,
    }


# ─── Validators per model ─────────────────────────────────────────────────────

async def _validate_cube_avg_price(db) -> Tuple[List[float], List[float]]:
    """Predicted = colonia avg (period 90d) — Actual = colonia avg (current).
    Tests stability of cube prediction vs near-real-time observation.
    """
    preds: List[float] = []
    acts: List[float] = []
    cur_rows: Dict[str, float] = {}
    try:
        async for r in db.cube_aggregations.find(
            {"tier": "colonia", "period": "current"},
            {"_id": 0, "tier_id": 1, "kpis.avg_price_per_m2": 1},
        ):
            v = (r.get("kpis") or {}).get("avg_price_per_m2")
            if v is not None:
                cur_rows[r.get("tier_id")] = float(v)
        async for r in db.cube_aggregations.find(
            {"tier": "colonia", "period": "90d"},
            {"_id": 0, "tier_id": 1, "kpis.avg_price_per_m2": 1},
        ):
            tid = r.get("tier_id")
            base = (r.get("kpis") or {}).get("avg_price_per_m2")
            cur = cur_rows.get(tid)
            if base is not None and cur is not None:
                preds.append(float(base))
                acts.append(float(cur))
    except Exception as e:
        log.warning(f"[validate] cube_avg_price failed: {e}")
    return preds, acts


async def _validate_metrics_cube_kpis(db) -> Tuple[List[float], List[float]]:
    """Predicted = facts_daily_zone yesterday units_total — Actual = today.
    Tests day-to-day consistency of cube snapshots.
    """
    preds: List[float] = []
    acts: List[float] = []
    now = datetime.now(timezone.utc)
    yesterday = (now - timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)

    try:
        # Group by zone_id
        rows_y: Dict[str, float] = {}
        rows_t: Dict[str, float] = {}
        async for r in db.facts_daily_zone.find({
            "ts": {"$gte": yesterday, "$lt": today},
            "tier": "colonia",
        }, {"_id": 0, "zone_id": 1, "kpis.units_total": 1}):
            v = (r.get("kpis") or {}).get("units_total")
            if v is not None:
                rows_y[r.get("zone_id")] = float(v)
        async for r in db.facts_daily_zone.find({
            "ts": {"$gte": today},
            "tier": "colonia",
        }, {"_id": 0, "zone_id": 1, "kpis.units_total": 1}):
            v = (r.get("kpis") or {}).get("units_total")
            if v is not None:
                rows_t[r.get("zone_id")] = float(v)
        for zid in rows_y.keys() & rows_t.keys():
            preds.append(rows_y[zid])
            acts.append(rows_t[zid])
    except Exception as e:
        log.warning(f"[validate] metrics_cube_kpis failed: {e}")
    return preds, acts


VALIDATORS = {
    "cube_avg_price": _validate_cube_avg_price,
    "metrics_cube_kpis": _validate_metrics_cube_kpis,
}


# ─── Public API ───────────────────────────────────────────────────────────────

async def validate_model(db, model_name: str,
                         predictions: Optional[List[float]] = None,
                         actuals: Optional[List[float]] = None) -> Dict[str, Any]:
    """Validate a single model. If predictions/actuals not provided, runs the
    registered validator from VALIDATORS map.
    """
    if model_name not in REGISTERED_MODELS:
        raise ValueError(f"Modelo no registrado: {model_name}")
    if predictions is None or actuals is None:
        validator = VALIDATORS.get(model_name)
        if not validator:
            raise ValueError(f"Validator ausente: {model_name}")
        predictions, actuals = await validator(db)

    metrics = compute_metrics(predictions, actuals)
    doc = {
        "id": _new_id(),
        "run_at": _iso(),
        "model_name": model_name,
        "training_window_days": 90,
        "training_split": "live-snapshot",
        "validation_method": "snapshot-comparison",
        **metrics,
    }
    try:
        await db.model_validation_runs.insert_one(dict(doc))
    except Exception as e:
        log.warning(f"[validate] insert failed: {e}")
    # Strip any mongo-injected _id before returning
    doc.pop("_id", None)
    return doc


async def run_all_validations(db) -> Dict[str, Any]:
    """Run all V1 model validators. Returns summary."""
    started = datetime.now(timezone.utc)
    out: Dict[str, Any] = {}
    for m in REGISTERED_MODELS:
        try:
            r = await validate_model(db, m)
            out[m] = {k: r.get(k) for k in ("r_squared", "rmse", "mape", "sample_size")}
        except Exception as e:
            log.warning(f"[validate] {m} failed: {e}")
            out[m] = {"error": str(e)[:100]}
    elapsed = (datetime.now(timezone.utc) - started).total_seconds()
    return {"ok": True, "models_validated": len(REGISTERED_MODELS),
            "results": out, "elapsed_s": round(elapsed, 2),
            "completed_at": _iso()}


async def latest_per_model(db) -> List[Dict[str, Any]]:
    """Latest validation run per model."""
    out: List[Dict[str, Any]] = []
    for m in REGISTERED_MODELS:
        last = await db.model_validation_runs.find_one(
            {"model_name": m}, {"_id": 0}, sort=[("run_at", -1)],
        )
        if last:
            out.append(last)
        else:
            out.append({"model_name": m, "r_squared": None, "rmse": None,
                        "mape": None, "sample_size": 0, "run_at": None,
                        "no_data": True})
    return out
