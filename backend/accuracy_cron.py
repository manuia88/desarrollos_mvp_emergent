"""W5.15 Parte 1 — Accuracy cron registrar.

3 jobs:
  - accuracy_compute_cron: daily 04:30 UTC · MAPE rolling global + top 50 zonas · snapshots
  - drift_detection_cron: daily 05:00 UTC · check_drift en top 50 zonas
  - zone_weights_optimization_cron: weekly domingo 03:00 UTC · optimize 50 zonas top
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict

from apscheduler.triggers.cron import CronTrigger

import accuracy_engine
import drift_detector
import weight_optimizer

log = logging.getLogger("dmx.accuracy_cron")


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ─── Jobs ─────────────────────────────────────────────────────────────────────

async def _accuracy_compute_job(db) -> Dict[str, Any]:
    start = _now()
    # Global
    glob_30 = await accuracy_engine.compute_mape_rolling(db, None, days=30)
    glob_90 = await accuracy_engine.compute_mape_rolling(db, None, days=90)
    glob_365 = await accuracy_engine.compute_mape_rolling(db, None, days=365)
    hit_30 = await accuracy_engine.compute_hit_rate(db, None, days=30)
    pct_30 = await accuracy_engine.compute_percentile_errors(db, None, days=30)
    await accuracy_engine.persist_accuracy_snapshot(db, {
        "scope": "global",
        "mape_30d": glob_30,
        "mape_90d": glob_90,
        "mape_365d": glob_365,
        "hit_rate_30d": hit_30,
        "percentile_errors_30d": pct_30,
    })

    # Per-zone (top 50)
    zones = await drift_detector.list_top_zones_for_drift(db, limit=50)
    zone_results: Dict[str, Any] = {}
    for z in zones:
        try:
            zone_results[z] = {
                "mape_30d": await accuracy_engine.compute_mape_rolling(db, z, days=30),
                "hit_rate_30d": await accuracy_engine.compute_hit_rate(db, z, days=30),
            }
            await accuracy_engine.persist_accuracy_snapshot(db, {
                "scope": "zone",
                "zone_slug": z,
                **zone_results[z],
            })
        except Exception as exc:
            log.warning(f"[accuracy_cron] zone {z} failed: {exc}")

    duration_s = (_now() - start).total_seconds()
    # Audit
    try:
        from audit_immutable_engine import log as audit_log
        await audit_log(
            db,
            actor={"user_id": "system", "role": "system"},
            action="accuracy_compute",
            entity_type="accuracy_snapshot",
            entity_id=f"cron_{int(start.timestamp())}",
            before=None,
            after={
                "global_mape_30d": glob_30.get("mape_pct"),
                "zones_count": len(zone_results),
                "duration_s": round(duration_s, 2),
            },
        )
    except Exception as exc:
        log.warning(f"[accuracy_cron] audit failed: {exc}")

    log.info(
        f"[Accuracy] {len(zone_results)} zonas computed · "
        f"global_mape={glob_30.get('mape_pct')} · duration_s={duration_s:.2f}"
    )
    return {
        "zones_count": len(zone_results),
        "global_mape_30d": glob_30.get("mape_pct"),
        "duration_s": round(duration_s, 2),
    }


async def _drift_detection_job(db) -> Dict[str, Any]:
    start = _now()
    zones = await drift_detector.list_top_zones_for_drift(db, limit=50)
    drift_detected = 0
    retrains_triggered = 0
    for z in zones:
        try:
            res = await drift_detector.check_drift(db, z)
            if res.get("drift_detected"):
                drift_detected += 1
                if res.get("retrain_triggered"):
                    retrains_triggered += 1
        except Exception as exc:
            log.warning(f"[drift_cron] zone {z} failed: {exc}")
    duration_s = (_now() - start).total_seconds()
    log.info(
        f"[Drift] {len(zones)} zonas scanned · drift={drift_detected} · "
        f"retrains={retrains_triggered} · duration_s={duration_s:.2f}"
    )
    return {
        "zones_scanned": len(zones),
        "drift_detected": drift_detected,
        "retrains_triggered": retrains_triggered,
        "duration_s": round(duration_s, 2),
    }


async def _zone_weights_optimization_job(db) -> Dict[str, Any]:
    start = _now()
    zones = await weight_optimizer.list_top_zones_for_optimization(db, limit=50)
    optimized = 0
    for z in zones:
        try:
            res = await weight_optimizer.optimize_zone_weights(db, z)
            if res:
                optimized += 1
        except Exception as exc:
            log.warning(f"[weights_cron] zone {z} failed: {exc}")
    duration_s = (_now() - start).total_seconds()
    log.info(
        f"[ZoneWeights] {len(zones)} zonas sweeped · optimized={optimized} · "
        f"duration_s={duration_s:.2f}"
    )
    return {
        "zones_sweeped": len(zones),
        "optimized": optimized,
        "duration_s": round(duration_s, 2),
    }


def register_accuracy_jobs(scheduler, db) -> None:
    """Registra los 3 jobs en el scheduler."""
    if scheduler is None:
        log.warning("[Accuracy] scheduler is None · skip register")
        return
    scheduler.add_job(
        _accuracy_compute_job,
        trigger=CronTrigger(hour=4, minute=30, timezone="UTC"),
        id="accuracy_compute_cron",
        kwargs={"db": db},
        replace_existing=True,
        max_instances=1,
    )
    scheduler.add_job(
        _drift_detection_job,
        trigger=CronTrigger(hour=5, minute=0, timezone="UTC"),
        id="drift_detection_cron",
        kwargs={"db": db},
        replace_existing=True,
        max_instances=1,
    )
    scheduler.add_job(
        _zone_weights_optimization_job,
        trigger=CronTrigger(day_of_week="sun", hour=3, minute=0, timezone="UTC"),
        id="zone_weights_optimization_cron",
        kwargs={"db": db},
        replace_existing=True,
        max_instances=1,
    )
    log.info("[Accuracy] 3 crons registered (accuracy 04:30 · drift 05:00 · weights Sun 03:00)")
