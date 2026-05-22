"""W5.9 — Climate Migration Cron Jobs.

2 jobs:
  1. cron_detect_patterns_weekly @ lunes 03:00 UTC  — detect_migration_patterns
  2. cron_compute_heatmap_daily  @ todos los días 04:00 UTC — compute_heatmap_snapshot

Idempotency a nivel pair (PAIR_LOOKBACK_DAYS=7) está en el engine.
Cada run se persiste en climate_migration_runs (TTL 30d).
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict

from apscheduler.triggers.cron import CronTrigger

from climate_migration_engine import (
    COLLECTION_RUNS,
    RUNS_TTL_DAYS,
    compute_heatmap_snapshot,
    detect_migration_patterns,
)

log = logging.getLogger("dmx.climate_migration_cron")


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _persist_run(
    db, cron_type: str, started_at: datetime,
    zones_processed: int, patterns_new: int, errors: int,
) -> None:
    if db is None:
        return
    ended_at = _now()
    doc = {
        "run_id": f"run_{uuid.uuid4().hex[:14]}",
        "cron_type": cron_type,
        "started_at": started_at,
        "ended_at": ended_at,
        "zones_processed": int(zones_processed),
        "patterns_new": int(patterns_new),
        "errors": int(errors),
        "ttl_until": ended_at + timedelta(days=RUNS_TTL_DAYS),
    }
    try:
        await db[COLLECTION_RUNS].insert_one(doc)
    except Exception as e:
        log.debug(f"[climate_migration_cron] run insert fail: {e}")


async def cron_detect_patterns_weekly(db) -> Dict[str, Any]:
    """Cron weekly: detect_migration_patterns + persist run."""
    started = _now()
    patterns_new = 0
    errors = 0
    try:
        result = await detect_migration_patterns(db, lookback_days=90)
        patterns_new = len(result or [])
    except Exception as e:
        log.warning(f"[climate_migration_cron] detect_weekly fail: {e}")
        errors = 1
    await _persist_run(db, "detect_patterns_weekly", started, 0, patterns_new, errors)
    log.info(
        f"[climate_migration_cron] detect_patterns_weekly done · "
        f"patterns_new={patterns_new} errors={errors}"
    )
    return {"patterns_new": patterns_new, "errors": errors}


async def cron_compute_heatmap_daily(db) -> Dict[str, Any]:
    """Cron daily: compute_heatmap_snapshot + persist run."""
    started = _now()
    zones_processed = 0
    errors = 0
    try:
        result = await compute_heatmap_snapshot(db)
        zones_processed = int((result or {}).get("zones_processed") or 0)
    except Exception as e:
        log.warning(f"[climate_migration_cron] heatmap_daily fail: {e}")
        errors = 1
    await _persist_run(db, "compute_heatmap_daily", started, zones_processed, 0, errors)
    log.info(
        f"[climate_migration_cron] compute_heatmap_daily done · "
        f"zones_processed={zones_processed} errors={errors}"
    )
    return {"zones_processed": zones_processed, "errors": errors}


def register_climate_migration_jobs(scheduler, db) -> None:
    """Registra 2 jobs en APScheduler:
      - lunes 03:00 UTC · detect_patterns_weekly
      - todos los días 04:00 UTC · compute_heatmap_daily
    """
    scheduler.add_job(
        cron_detect_patterns_weekly,
        CronTrigger(day_of_week="mon", hour=3, minute=0, timezone="UTC"),
        id="climate_migration_detect_weekly",
        replace_existing=True,
        max_instances=1,
        kwargs={"db": db},
    )
    scheduler.add_job(
        cron_compute_heatmap_daily,
        CronTrigger(hour=4, minute=0, timezone="UTC"),
        id="climate_migration_heatmap_daily",
        replace_existing=True,
        max_instances=1,
        kwargs={"db": db},
    )
    log.info(
        "[climate_migration_cron] Jobs registrados: detect @ lunes 03:00 UTC · "
        "heatmap @ diario 04:00 UTC"
    )
