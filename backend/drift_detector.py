"""W5.15 Parte 1 Sub-C — Drift detector zone-specific.

check_drift(zone_slug): compara MAPE_30d vs MAPE_180d (baseline). Si delta > 10pp,
dispara retrain del modelo hedonico de la zona (W5.1 retrain_and_maybe_promote)
respetando cooldown idempotente de 7 dias. Notifica al superadmin.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict
from uuid import uuid4

import accuracy_engine

log = logging.getLogger("dmx.drift")

DRIFT_DELTA_PP = 10.0
COOLDOWN_DAYS = 7


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _recent_trigger(db, zone_slug: str) -> bool:
    cutoff = _now() - timedelta(days=COOLDOWN_DAYS)
    doc = await db.drift_triggers_log.find_one(
        {"zone_slug": zone_slug, "triggered_at_dt": {"$gte": cutoff}},
        {"_id": 0, "id": 1},
    )
    return doc is not None


async def check_drift(db, zone_slug: str) -> Dict[str, Any]:
    """Compute MAPE 30d y 180d para la zona. Si delta >10pp y no hay trigger en
    los ultimos 7d, dispara retrain del modelo hedonico de la zona.
    """
    mape_30 = await accuracy_engine.compute_mape_rolling(db, zone_slug, days=30)
    mape_180 = await accuracy_engine.compute_mape_rolling(db, zone_slug, days=180)

    if not mape_30.get("available") or not mape_180.get("available"):
        return {
            "zone_slug": zone_slug,
            "drift_detected": False,
            "reason": "insufficient_sample",
            "mape_30d": mape_30.get("mape_pct"),
            "baseline_180d": mape_180.get("mape_pct"),
        }

    delta_pp = float(mape_30["mape_pct"]) - float(mape_180["mape_pct"])
    drift = delta_pp > DRIFT_DELTA_PP

    if not drift:
        return {
            "zone_slug": zone_slug,
            "drift_detected": False,
            "delta_pp": round(delta_pp, 3),
            "mape_30d": mape_30["mape_pct"],
            "baseline_180d": mape_180["mape_pct"],
        }

    # Idempotencia 7d
    if await _recent_trigger(db, zone_slug):
        log.info(f"[drift] {zone_slug} drift detected but cooldown active · skip retrain")
        return {
            "zone_slug": zone_slug,
            "drift_detected": True,
            "delta_pp": round(delta_pp, 3),
            "retrain_triggered": False,
            "reason": "cooldown_active",
        }

    # Trigger retrain
    retrain_status: Dict[str, Any] = {"triggered": False}
    try:
        from avm_retrain_cron import retrain_and_maybe_promote
        retrain_status = await retrain_and_maybe_promote(db, zone_slug, tier="colonia")
        retrain_status["triggered"] = True
    except Exception as exc:
        log.warning(f"[drift] retrain failed for {zone_slug}: {exc}")
        retrain_status = {"triggered": False, "error": str(exc)}

    now = _now()
    doc = {
        "id": f"drift_{uuid4().hex[:14]}",
        "zone_slug": zone_slug,
        "mape_30d": mape_30["mape_pct"],
        "baseline_180d": mape_180["mape_pct"],
        "delta_pp": round(delta_pp, 3),
        "triggered_at": now.isoformat(),
        "triggered_at_dt": now,
        "retrain_status": retrain_status,
    }
    try:
        await db.drift_triggers_log.insert_one(dict(doc))
    except Exception as exc:
        log.warning(f"[drift] insert log failed: {exc}")

    # Audit
    try:
        from audit_immutable_engine import log as audit_log
        await audit_log(
            db,
            actor={"user_id": "system", "role": "system"},
            action="drift_detected",
            entity_type="zone_accuracy",
            entity_id=zone_slug,
            before=None,
            after={
                "delta_pp": round(delta_pp, 3),
                "mape_30d": mape_30["mape_pct"],
                "baseline_180d": mape_180["mape_pct"],
                "retrain_triggered": retrain_status.get("triggered", False),
            },
        )
    except Exception as exc:
        log.warning(f"[drift] audit failed: {exc}")

    # Notif superadmin
    try:
        import notifications_engine
        sa_cursor = db.users.find({"role": "superadmin"}, {"_id": 0, "user_id": 1, "id": 1})
        async for sa in sa_cursor:
            uid = sa.get("user_id") or sa.get("id")
            if not uid:
                continue
            await notifications_engine.emit_notification(
                db,
                user_id=uid,
                type="accuracy_drift_alert",
                severity="high",
                title=f"Drift de precision en {zone_slug}",
                body=(
                    f"MAPE 30d={mape_30['mape_pct']:.2f}% vs baseline 180d={mape_180['mape_pct']:.2f}% "
                    f"(delta +{delta_pp:.2f}pp). Retrain {'OK' if retrain_status.get('triggered') else 'fallido'}."
                ),
                payload={
                    "zone_slug": zone_slug,
                    "delta_pp": round(delta_pp, 3),
                    "retrain_status": retrain_status,
                },
                action_url=f"/superadmin/accuracy?zone={zone_slug}",
            )
    except Exception as exc:
        log.warning(f"[drift] notify failed: {exc}")

    log.info(f"[drift] {zone_slug} drift detected · delta_pp={delta_pp:.2f} · retrain triggered")
    return {
        "zone_slug": zone_slug,
        "drift_detected": True,
        "delta_pp": round(delta_pp, 3),
        "retrain_triggered": retrain_status.get("triggered", False),
        "retrain_status": retrain_status,
    }


async def ensure_drift_indexes(db) -> None:
    try:
        from pymongo import ASCENDING, DESCENDING
        await db.drift_triggers_log.create_index(
            [("zone_slug", ASCENDING), ("triggered_at_dt", DESCENDING)],
            name="drift_zone_desc",
        )
        await db.drift_triggers_log.create_index("id", unique=True, sparse=True)
        log.info("[drift] indexes OK")
    except Exception as exc:
        log.warning(f"[drift] index creation warning: {exc}")


# ─── Helper: get top zones for drift sweep ────────────────────────────────────

async def list_top_zones_for_drift(db, limit: int = 50) -> list:
    try:
        pipeline = [
            {"$match": {"close_date_dt": {"$gte": _now() - timedelta(days=180)},
                        "zone_slug": {"$nin": [None, ""]}}},
            {"$group": {"_id": "$zone_slug", "n": {"$sum": 1}}},
            {"$match": {"n": {"$gte": accuracy_engine.MIN_SAMPLE}}},
            {"$sort": {"n": -1}},
            {"$limit": limit},
        ]
        rows = await db.prediction_accuracy_log.aggregate(pipeline).to_list(limit)
        return [r["_id"] for r in rows if r.get("_id")]
    except Exception as exc:
        log.warning(f"[drift] list zones failed: {exc}")
        return []
