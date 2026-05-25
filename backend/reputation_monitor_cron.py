"""W7.AS.6 · Reputation Monitor Cron.

1 job:
  - cron_scan_daily @ todos los días 05:00 UTC — scan_mentions(brand_keywords_default)

Idempotency a nivel mention via external_id (engine).
Persiste runs en `reputation_monitor_runs` (TTL 30d).
Audit run via audit_immutable_engine.log.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict

from apscheduler.triggers.cron import CronTrigger

from reputation_monitor_engine import (
    COLLECTION_RUNS,
    RUNS_TTL_DAYS,
    scan_mentions,
)

log = logging.getLogger("dmx.reputation_monitor_cron")


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _persist_run(
    db, cron_type: str, started_at: datetime,
    total_new: int, sources_ok: int, sources_error: int, sources_skipped: int,
) -> None:
    if db is None:
        return
    ended_at = _now()
    doc = {
        "run_id": f"run_{uuid.uuid4().hex[:14]}",
        "cron_type": cron_type,
        "started_at": started_at,
        "ended_at": ended_at,
        "total_new": int(total_new),
        "sources_ok": int(sources_ok),
        "sources_error": int(sources_error),
        "sources_skipped": int(sources_skipped),
        "ttl_until": ended_at + timedelta(days=RUNS_TTL_DAYS),
    }
    try:
        await db[COLLECTION_RUNS].insert_one(doc)
    except Exception as exc:
        log.debug(f"[reputation_monitor_cron] run insert fail: {exc}")


def _count_statuses(by_status: Dict[str, str]) -> Dict[str, int]:
    counters = {"ok": 0, "cached": 0, "error": 0, "skipped": 0}
    for v in (by_status or {}).values():
        if v in counters:
            counters[v] += 1
    return counters


async def cron_scan_daily(db) -> Dict[str, Any]:
    """Cron daily: scan_mentions + persist run + audit."""
    started = _now()
    total_new = 0
    counters = {"ok": 0, "cached": 0, "error": 0, "skipped": 0}
    try:
        result = await scan_mentions(db)
        total_new = int((result or {}).get("total_new") or 0)
        counters = _count_statuses((result or {}).get("by_status") or {})
    except Exception as exc:
        log.warning(f"[reputation_monitor_cron] scan_daily fail: {exc}")

    await _persist_run(
        db, "scan_daily", started,
        total_new=total_new,
        sources_ok=counters["ok"] + counters["cached"],
        sources_error=counters["error"],
        sources_skipped=counters["skipped"],
    )

    # Audit immutable
    try:
        from audit_immutable_engine import log as audit_log
        await audit_log(
            db,
            actor={"user_id": "system", "role": "system"},
            action="reputation_scan_run",
            entity_type="reputation_monitor_run",
            entity_id=started.isoformat(),
            before=None,
            after={
                "total_new": total_new,
                "sources_ok": counters["ok"] + counters["cached"],
                "sources_error": counters["error"],
                "sources_skipped": counters["skipped"],
            },
        )
    except Exception as exc:
        log.debug(f"[reputation_monitor_cron] audit fail: {exc}")

    log.info(
        f"[reputation_monitor_cron] scan_daily done · "
        f"total_new={total_new} ok={counters['ok'] + counters['cached']} "
        f"err={counters['error']} skip={counters['skipped']}"
    )
    return {
        "total_new": total_new,
        "sources_ok": counters["ok"] + counters["cached"],
        "sources_error": counters["error"],
        "sources_skipped": counters["skipped"],
    }


def register_reputation_monitor_jobs(scheduler, db) -> None:
    """Registra 1 job en APScheduler:
      - todos los días 05:00 UTC · scan_daily
    """
    scheduler.add_job(
        cron_scan_daily,
        CronTrigger(hour=5, minute=0, timezone="UTC"),
        id="reputation_monitor_scan_daily",
        replace_existing=True,
        max_instances=1,
        kwargs={"db": db},
    )
    log.info(
        "[reputation_monitor_cron] Jobs registrados: scan @ diario 05:00 UTC"
    )
