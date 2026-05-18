"""W5.15 Parte 1 Sub-B — Accuracy engine.

- match_prediction_to_close(db, lead_id): cuando un lead pasa a cerrado_ganado,
  busca el AVM prediction mas reciente del property del lead y registra error
  vs actual_value en `prediction_accuracy_log`. Emite notificacion lead_close_accuracy.

- compute_mape_rolling / compute_hit_rate / compute_percentile_errors:
  metricas rolling per-zone o globales. Fallback "insufficient_sample" si <20.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional
from uuid import uuid4

log = logging.getLogger("dmx.accuracy")

MIN_SAMPLE = 20  # umbral global "insufficient_sample"
ACCURACY_LOG_TTL_DAYS = 365 * 5  # 5 years


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def _accuracy_id() -> str:
    return f"acc_{uuid4().hex[:14]}"


async def match_prediction_to_close(db, lead_id: str) -> Optional[Dict[str, Any]]:
    """Si lead.status == cerrado_ganado y hay property + precio de cierre, busca
    el avm_prediction mas reciente y persiste la entrada en prediction_accuracy_log.

    Devuelve el doc creado o None si no aplica.
    """
    try:
        lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    except Exception as exc:
        log.warning(f"[accuracy] match: lead fetch failed {lead_id}: {exc}")
        return None
    if not lead:
        return None
    if lead.get("status") != "cerrado_ganado":
        return None

    # Resolver property_id
    property_id = (
        lead.get("property_id")
        or lead.get("interested_property_id")
        or lead.get("matched_property_id")
    )
    actual_value = (
        lead.get("close_price")
        or lead.get("final_price")
        or lead.get("deal_value")
    )
    if not property_id or not actual_value:
        log.info(f"[accuracy] match skip · lead={lead_id} missing property_id/actual")
        return None

    # Buscar avm_prediction mas reciente del property
    pred = await db.avm_predictions.find_one(
        {"property_id": property_id},
        {"_id": 0},
        sort=[("prediction_date_dt", -1)],
    )
    if not pred:
        log.info(f"[accuracy] match skip · no prediction for property {property_id}")
        return None

    predicted_value = float(pred.get("fsd_value") or pred.get("predicted_value") or 0)
    actual_value_f = float(actual_value)
    if predicted_value <= 0 or actual_value_f <= 0:
        return None

    error_abs = abs(predicted_value - actual_value_f)
    error_pct = (error_abs / actual_value_f) * 100.0
    low = float(pred.get("low_estimate") or 0)
    high = float(pred.get("high_estimate") or 0)
    was_within = (low <= actual_value_f <= high) if (low and high) else False

    # Idempotency: no doble-registrar si ya existe entry para este lead_id
    existing = await db.prediction_accuracy_log.find_one({"lead_id": lead_id}, {"_id": 0, "id": 1})
    if existing:
        return None

    now = _now()
    doc = {
        "id": _accuracy_id(),
        "lead_id": lead_id,
        "property_id": property_id,
        "zone_slug": lead.get("zone_slug") or pred.get("zone_slug"),
        "predicted_value": predicted_value,
        "actual_value": actual_value_f,
        "error_abs": round(error_abs, 2),
        "error_pct": round(error_pct, 4),
        "prediction_date": pred.get("prediction_date"),
        "close_date": _iso(now),
        "close_date_dt": now,
        "fsd_pct_at_prediction": pred.get("fsd_pct"),
        "confidence_lvl": pred.get("confidence_lvl"),
        "was_within_range": was_within,
        "model_id": pred.get("model_id"),
    }
    try:
        await db.prediction_accuracy_log.insert_one(dict(doc))
    except Exception as exc:
        log.warning(f"[accuracy] insert log failed: {exc}")
        return None

    # Notificacion al asesor del lead
    try:
        import notifications_engine
        asesor_id = lead.get("assigned_to") or lead.get("asesor_id") or lead.get("owner_id")
        if asesor_id:
            await notifications_engine.emit_notification(
                db,
                user_id=asesor_id,
                tenant_id=lead.get("tenant_id"),
                type="lead_close_accuracy",
                severity="normal",
                title="Cierre vs AVM",
                body=(
                    f"Vendiste ${actual_value_f:,.0f} · AVM predijo ${predicted_value:,.0f} "
                    f"· error {error_pct:.1f}% (precision {max(0.0, 100.0 - error_pct):.1f}%)"
                ),
                payload={
                    "lead_id": lead_id,
                    "property_id": property_id,
                    "predicted_value": predicted_value,
                    "actual_value": actual_value_f,
                    "error_pct": round(error_pct, 2),
                    "was_within_range": was_within,
                },
                action_url=f"/asesor/contactos?lead={lead_id}",
            )
    except Exception as exc:
        log.warning(f"[accuracy] notify failed: {exc}")

    log.info(
        f"[accuracy] matched lead={lead_id} property={property_id} "
        f"predicted={predicted_value:.0f} actual={actual_value_f:.0f} "
        f"err_pct={error_pct:.2f} within={was_within}"
    )
    return doc


# ─── Rolling metrics ──────────────────────────────────────────────────────────

async def _fetch_window(
    db, days: int, zone_slug: Optional[str] = None,
) -> List[Dict[str, Any]]:
    cutoff = _now() - timedelta(days=days)
    q: Dict[str, Any] = {"close_date_dt": {"$gte": cutoff}}
    if zone_slug:
        q["zone_slug"] = zone_slug
    try:
        cursor = db.prediction_accuracy_log.find(q, {"_id": 0})
        return [r async for r in cursor]
    except Exception as exc:
        log.warning(f"[accuracy] fetch window failed: {exc}")
        return []


async def compute_mape_rolling(
    db, zone_slug: Optional[str] = None, days: int = 30,
) -> Dict[str, Any]:
    rows = await _fetch_window(db, days, zone_slug)
    n = len(rows)
    if n < MIN_SAMPLE:
        return {
            "available": False,
            "state": "insufficient_sample",
            "sample_size": n,
            "min_required": MIN_SAMPLE,
            "zone_slug": zone_slug,
            "days": days,
        }
    errs = [float(r.get("error_pct") or 0.0) for r in rows]
    mape = sum(errs) / n
    return {
        "available": True,
        "mape_pct": round(mape, 3),
        "sample_size": n,
        "zone_slug": zone_slug,
        "days": days,
    }


async def compute_hit_rate(
    db, zone_slug: Optional[str] = None, days: int = 30,
) -> Dict[str, Any]:
    rows = await _fetch_window(db, days, zone_slug)
    n = len(rows)
    if n < MIN_SAMPLE:
        return {"available": False, "state": "insufficient_sample", "sample_size": n}
    hits = sum(1 for r in rows if r.get("was_within_range"))
    return {
        "available": True,
        "hit_rate": round(hits / n, 4),
        "hits": hits,
        "sample_size": n,
        "zone_slug": zone_slug,
        "days": days,
    }


async def compute_percentile_errors(
    db, zone_slug: Optional[str] = None, days: int = 30,
) -> Dict[str, Any]:
    rows = await _fetch_window(db, days, zone_slug)
    n = len(rows)
    if n < MIN_SAMPLE:
        return {"available": False, "state": "insufficient_sample", "sample_size": n}
    errs = sorted(float(r.get("error_pct") or 0.0) for r in rows)

    def _pct(p: float) -> float:
        if not errs:
            return 0.0
        idx = max(0, min(len(errs) - 1, int(round(p * (len(errs) - 1)))))
        return errs[idx]

    return {
        "available": True,
        "p50": round(_pct(0.50), 3),
        "p90": round(_pct(0.90), 3),
        "p95": round(_pct(0.95), 3),
        "sample_size": n,
    }


async def calibration_curve(db, days: int = 90, bins: int = 10) -> Dict[str, Any]:
    """Reliability diagram: bucketea predicciones por confidence (1 - fsd_pct/100)
    y mide accuracy real (1 - error_pct/100) en cada bucket."""
    rows = await _fetch_window(db, days)
    if len(rows) < MIN_SAMPLE:
        return {"available": False, "state": "insufficient_sample", "sample_size": len(rows)}
    edges = [i / bins for i in range(bins + 1)]
    buckets: List[Dict[str, Any]] = []
    cal_err_sum = 0.0
    for i in range(bins):
        lo, hi = edges[i], edges[i + 1]
        bin_rows = [
            r for r in rows
            if lo <= max(0.0, 1.0 - (float(r.get("fsd_pct_at_prediction") or 100) / 100.0)) < hi
        ] if i < bins - 1 else [
            r for r in rows
            if lo <= max(0.0, 1.0 - (float(r.get("fsd_pct_at_prediction") or 100) / 100.0)) <= hi
        ]
        sample = len(bin_rows)
        if sample == 0:
            buckets.append({"predicted_confidence": round((lo + hi) / 2, 3), "actual_accuracy": None, "sample": 0})
            continue
        avg_pred = sum(
            max(0.0, 1.0 - (float(r.get("fsd_pct_at_prediction") or 100) / 100.0)) for r in bin_rows
        ) / sample
        avg_actual = sum(
            max(0.0, 1.0 - (float(r.get("error_pct") or 0.0) / 100.0)) for r in bin_rows
        ) / sample
        buckets.append({
            "predicted_confidence": round(avg_pred, 3),
            "actual_accuracy": round(avg_actual, 3),
            "sample": sample,
        })
        cal_err_sum += abs(avg_pred - avg_actual) * sample
    cal_error = cal_err_sum / len(rows)
    return {
        "available": True,
        "bins": buckets,
        "calibration_error": round(cal_error, 4),
        "sample_size": len(rows),
        "days": days,
    }


# ─── Persist daily snapshot ───────────────────────────────────────────────────

async def persist_accuracy_snapshot(db, snap: Dict[str, Any]) -> Optional[str]:
    now = _now()
    doc = {
        "id": f"accsnap_{uuid4().hex[:14]}",
        "computed_at": _iso(now),
        "computed_at_dt": now,
        **snap,
    }
    try:
        await db.accuracy_snapshots.insert_one(dict(doc))
        return doc["id"]
    except Exception as exc:
        log.warning(f"[accuracy] persist snapshot failed: {exc}")
        return None


async def ensure_accuracy_indexes(db) -> None:
    try:
        from pymongo import ASCENDING, DESCENDING
        await db.prediction_accuracy_log.create_index(
            [("zone_slug", ASCENDING), ("close_date_dt", DESCENDING)],
            name="zone_close_desc",
        )
        await db.prediction_accuracy_log.create_index(
            [("property_id", ASCENDING)], name="prop_idx",
        )
        await db.prediction_accuracy_log.create_index("id", unique=True, sparse=True)
        await db.prediction_accuracy_log.create_index("lead_id", unique=True, sparse=True)
        try:
            await db.prediction_accuracy_log.create_index(
                "close_date_dt", name="acc_ttl",
                expireAfterSeconds=ACCURACY_LOG_TTL_DAYS * 86400,
            )
        except Exception:
            pass
        await db.accuracy_snapshots.create_index(
            [("computed_at_dt", DESCENDING)], name="snap_computed_desc",
        )
        try:
            await db.accuracy_snapshots.create_index(
                "computed_at_dt", name="snap_ttl", expireAfterSeconds=365 * 86400,
            )
        except Exception:
            pass
        log.info("[accuracy] indexes OK")
    except Exception as exc:
        log.warning(f"[accuracy] index creation warning: {exc}")
