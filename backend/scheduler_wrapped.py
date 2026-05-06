"""Phase 4 Batch 30 · APScheduler — Wrapped cron jobs.

Jobs:
  • 1ro de cada mes 06:00 UTC → generate_bulk_monthly para mes previo
  • 1 diciembre 08:00 UTC     → send_annual_optin_emails para año actual
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Dict

log = logging.getLogger("dmx.scheduler_wrapped")


def _prev_year_month() -> str:
    """Devuelve el YYYY-MM del mes anterior al actual."""
    today = datetime.now(timezone.utc)
    first_of_month = today.replace(day=1)
    prev = first_of_month - timedelta(days=1)
    return prev.strftime("%Y-%m")


async def run_monthly_wrapped(db) -> Dict:
    """Genera wrappeds del mes anterior para todos los buyers activos."""
    year_month = _prev_year_month()
    from services.wrapped_generator import generate_bulk_monthly
    result = await generate_bulk_monthly(db, year_month)
    log.info(f"[scheduler_wrapped] monthly run: {result}")
    return result


async def run_annual_optin(db) -> Dict:
    """Envía emails de opt-in para wrapped anual (corre el 1 diciembre)."""
    year = datetime.now(timezone.utc).year
    # Solo enviar en diciembre
    if datetime.now(timezone.utc).month != 12:
        log.info("[scheduler_wrapped] annual optin skipped (not December)")
        return {"skipped": True}
    from services.wrapped_generator import send_annual_optin_emails
    result = await send_annual_optin_emails(db, year)
    log.info(f"[scheduler_wrapped] annual optin run: {result}")
    return result


def register_wrapped_jobs(sched, db) -> None:
    """Registra los jobs de wrapped en el APScheduler existente."""
    from apscheduler.triggers.cron import CronTrigger

    # 1ro de cada mes a las 06:00 UTC → wrapped mensual
    sched.add_job(
        run_monthly_wrapped,
        CronTrigger(day=1, hour=6, minute=0),
        id="wrapped_monthly",
        replace_existing=True,
        kwargs={"db": db},
        max_instances=1,
        name="Wrapped — 1ro mes 6am (mensual)",
    )
    log.info("[scheduler_wrapped] monthly job registered @ day=1 06:00 UTC")

    # 1 diciembre a las 08:00 UTC → opt-in anual
    sched.add_job(
        run_annual_optin,
        CronTrigger(month=12, day=1, hour=8, minute=0),
        id="wrapped_annual_optin",
        replace_existing=True,
        kwargs={"db": db},
        max_instances=1,
        name="Wrapped — Annual opt-in 1 Dec 8am",
    )
    log.info("[scheduler_wrapped] annual optin job registered @ Dec-1 08:00 UTC")
