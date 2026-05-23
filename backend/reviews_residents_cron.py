"""W6.MOV.3 · Reviews Residentes · Cron weekly.

Job:
  cron_scrape_reviews_weekly @ lunes 03:00 UTC (NO choca con MOV.5 02:00)
  Scrape paralelo 3 sources por cada entidad (zonas activas + developments).
  Idempotency: cache TTL 7d per (entity_id, source) gates re-scrape.

Cada run se persiste en reviews_residents_runs (TTL 30d).
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict

from apscheduler.triggers.cron import CronTrigger

from reviews_residents_engine import scrape_entity

log = logging.getLogger("dmx.reviews_residents_cron")

COLLECTION_RUNS = "reviews_residents_runs"
RUNS_TTL_DAYS = 30
MAX_CONCURRENT = 4  # bound LLM + HTTP fanout


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _persist_run(db, started_at: datetime, processed: int, errors: int, summary: Dict[str, Any]) -> None:
    if db is None:
        return
    ended_at = _now()
    doc = {
        "run_id": f"rr_run_{uuid.uuid4().hex[:14]}",
        "started_at": started_at,
        "ended_at": ended_at,
        "entities_processed": int(processed),
        "errors": int(errors),
        "summary": summary,
        "ttl_until": ended_at + timedelta(days=RUNS_TTL_DAYS),
    }
    try:
        await db[COLLECTION_RUNS].insert_one(doc)
        await db[COLLECTION_RUNS].create_index("ttl_until", expireAfterSeconds=0)
    except Exception as exc:
        log.warning(f"_persist_run failed: {exc}")


async def _scrape_one_safe(sem: asyncio.Semaphore, db, entity_type: str, entity_id: str, lat, lng) -> Dict[str, Any]:
    async with sem:
        try:
            return await scrape_entity(db, entity_type, entity_id, lat=lat, lng=lng, force=False)
        except Exception as exc:
            log.warning(f"_scrape_one_safe fail {entity_type}/{entity_id}: {exc}")
            return {"entity_type": entity_type, "entity_id": entity_id, "error": str(exc)}


async def cron_scrape_reviews_weekly(db) -> Dict[str, Any]:
    """Scrape reviews for active zones + developments. Idempotent vía cache TTL."""
    started = _now()
    processed = 0
    errors = 0
    sem = asyncio.Semaphore(MAX_CONCURRENT)
    tasks = []

    try:
        # Zones (active = has lat/lng)
        async for z in db.zones.find({}, {"id": 1, "lat": 1, "lng": 1, "_id": 0}):
            if not z.get("id"):
                continue
            tasks.append(_scrape_one_safe(sem, db, "zone", z["id"], z.get("lat"), z.get("lng")))
    except Exception as exc:
        log.warning(f"zones cursor failed: {exc}")
        errors += 1

    try:
        async for d in db.developments.find({"status": {"$ne": "archived"}}, {"id": 1, "lat": 1, "lng": 1, "_id": 0}):
            if not d.get("id"):
                continue
            tasks.append(_scrape_one_safe(sem, db, "development", d["id"], d.get("lat"), d.get("lng")))
    except Exception as exc:
        log.warning(f"developments cursor failed: {exc}")
        errors += 1

    if tasks:
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for r in results:
            if isinstance(r, Exception):
                errors += 1
                continue
            if isinstance(r, dict) and r.get("error"):
                errors += 1
                continue
            processed += 1

    summary = {"total_tasks": len(tasks), "processed": processed, "errors": errors}
    await _persist_run(db, started, processed, errors, summary)
    log.info(f"[reviews_residents_cron] weekly done · processed={processed} errors={errors}")
    return summary


def register_reviews_residents_jobs(scheduler, db) -> None:
    """Job semanal lunes 03:00 UTC. NO choca con MOV.5 02:00."""
    scheduler.add_job(
        cron_scrape_reviews_weekly,
        CronTrigger(day_of_week="mon", hour=3, minute=0, timezone="UTC"),
        id="reviews_residents_scrape_weekly",
        replace_existing=True,
        max_instances=1,
        kwargs={"db": db},
    )
    log.info("[reviews_residents_cron] Job registrado: scrape @ lunes 03:00 UTC")
