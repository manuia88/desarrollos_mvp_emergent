"""Phase 4 Batch 29 · APScheduler — Buyer Alerts cron.

Jobs:
  • cada 5 min (instant) → evaluate_alerts frequency='instant'
  • diario 08:00 UTC     → evaluate_alerts frequency='daily'
  • lunes 08:00 UTC      → evaluate_alerts frequency='weekly'
"""
from __future__ import annotations

import logging
from typing import Dict

log = logging.getLogger("dmx.scheduler_buyer_alerts")


async def run_instant_alerts(db) -> Dict:
    from services.buyer_alerts import evaluate_alerts
    result = await evaluate_alerts(db, frequency="instant")
    log.info(f"[buyer_alerts_instant] {result}")
    return result


async def run_daily_alerts(db) -> Dict:
    from services.buyer_alerts import evaluate_alerts
    result = await evaluate_alerts(db, frequency="daily")
    log.info(f"[buyer_alerts_daily] {result}")
    return result


async def run_weekly_alerts(db) -> Dict:
    from services.buyer_alerts import evaluate_alerts
    result = await evaluate_alerts(db, frequency="weekly")
    log.info(f"[buyer_alerts_weekly] {result}")
    return result


def register_buyer_alerts_jobs(sched, db) -> None:
    """Registra los 3 jobs de buyer alerts en el APScheduler existente."""
    from apscheduler.triggers.cron import CronTrigger
    from apscheduler.triggers.interval import IntervalTrigger

    # Instant — cada 5 minutos
    sched.add_job(
        run_instant_alerts,
        IntervalTrigger(minutes=5),
        id="buyer_alerts_instant",
        replace_existing=True,
        kwargs={"db": db},
        max_instances=1,
        name="Buyer Alerts — Instant (cada 5min)",
    )
    log.info("[scheduler_buyer_alerts] instant job registered (5min interval)")

    # Daily — 08:00 UTC
    sched.add_job(
        run_daily_alerts,
        CronTrigger(hour=8, minute=0),
        id="buyer_alerts_daily",
        replace_existing=True,
        kwargs={"db": db},
        max_instances=1,
        name="Buyer Alerts — Daily 8am",
    )
    log.info("[scheduler_buyer_alerts] daily job registered @ 08:00 UTC")

    # Weekly — lunes 08:00 UTC
    sched.add_job(
        run_weekly_alerts,
        CronTrigger(day_of_week="mon", hour=8, minute=0),
        id="buyer_alerts_weekly",
        replace_existing=True,
        kwargs={"db": db},
        max_instances=1,
        name="Buyer Alerts — Weekly Monday 8am",
    )
    log.info("[scheduler_buyer_alerts] weekly job registered @ Mon 08:00 UTC")
