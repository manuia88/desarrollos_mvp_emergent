"""W5.12 Parte 1 — KG cron: nightly rebuild + event hooks registration."""
from __future__ import annotations

import logging
from typing import Any

log = logging.getLogger("dmx.kg.cron")


async def _run_kg_rebuild_full(db) -> None:
    """Job wrapper for APScheduler."""
    try:
        from kg_etl import rebuild_full
        summary = await rebuild_full(db)
        log.info(f"[KG cron] rebuild_full done · {summary}")
    except Exception as exc:
        log.error(f"[KG cron] rebuild_full failed: {exc}")


async def _run_kg_anomaly_detection(db) -> None:
    """W5.12 P2 · Anomaly detection cron job wrapper."""
    try:
        from kg_anomaly_detector import run_anomaly_detection
        summary = await run_anomaly_detection(db)
        log.info(f"[KG anomaly cron] done · {summary}")
    except Exception as exc:
        log.error(f"[KG anomaly cron] failed: {exc}")


def register_kg_jobs(scheduler, db) -> Any:
    """Registra los jobs KG en el scheduler APScheduler ya inicializado.

    Jobs:
      - kg_rebuild_full_cron     @ 02:00 UTC daily
      - kg_anomaly_detection_cron @ 03:00 UTC daily (post-rebuild)
    """
    try:
        from apscheduler.triggers.cron import CronTrigger
        scheduler.add_job(
            _run_kg_rebuild_full,
            CronTrigger(hour=2, minute=0, timezone="UTC"),
            id="kg_rebuild_full_cron",
            replace_existing=True,
            kwargs={"db": db},
            max_instances=1,
            misfire_grace_time=3600,
        )
        scheduler.add_job(
            _run_kg_anomaly_detection,
            CronTrigger(hour=3, minute=0, timezone="UTC"),
            id="kg_anomaly_detection_cron",
            replace_existing=True,
            kwargs={"db": db},
            max_instances=1,
            misfire_grace_time=3600,
        )
        log.info("[KG cron] kg_rebuild_full_cron @ 02:00 UTC + kg_anomaly_detection_cron @ 03:00 UTC scheduled")
        return True
    except Exception as exc:
        log.warning(f"[KG cron] register_kg_jobs failed: {exc}")
        return False
