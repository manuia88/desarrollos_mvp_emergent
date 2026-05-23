"""W6.MOV.5 · Construction Quality Index · Cron weekly.

Job:
  cron_recompute_quality_weekly @ lunes 02:00 UTC
  Re-calcula índice 0-100 para TODOS los developments activos.
  Refresca cache + denormaliza score en developments collection.

Idempotency: cache TTL 7d gates re-compute (force=True para superadmin manual refresh).
Cada run se persiste en construction_quality_runs (TTL 30d).
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict

from apscheduler.triggers.cron import CronTrigger

from construction_quality_engine import compute_quality_index

log = logging.getLogger("dmx.construction_quality_cron")

COLLECTION_RUNS = "construction_quality_runs"
RUNS_TTL_DAYS = 30


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _persist_run(
    db, started_at: datetime,
    developments_processed: int, errors: int, summary: Dict[str, Any],
) -> None:
    if db is None:
        return
    ended_at = _now()
    doc = {
        "run_id": f"cq_run_{uuid.uuid4().hex[:14]}",
        "started_at": started_at,
        "ended_at": ended_at,
        "developments_processed": int(developments_processed),
        "errors": int(errors),
        "summary": summary,
        "ttl_until": ended_at + timedelta(days=RUNS_TTL_DAYS),
    }
    try:
        await db[COLLECTION_RUNS].insert_one(doc)
        await db[COLLECTION_RUNS].create_index("ttl_until", expireAfterSeconds=0)
    except Exception as exc:
        log.warning(f"_persist_run failed: {exc}")


async def cron_recompute_quality_weekly(db) -> Dict[str, Any]:
    """Recompute quality index for all active developments.

    Activos = status != 'archived' (defensive: developments sin status también included).
    """
    started = _now()
    processed = 0
    errors = 0
    tier_counts = {"excelente": 0, "bueno": 0, "regular": 0, "deficiente": 0}

    try:
        cursor = db.developments.find(
            {"status": {"$ne": "archived"}},
            {"id": 1, "_id": 0},
        )
        async for doc in cursor:
            dev_id = doc.get("id")
            if not dev_id:
                continue
            try:
                # force re-compute by skipping cache
                result = await compute_quality_index(db, dev_id, use_cache=False)
                processed += 1
                tier = result.get("tier")
                if tier in tier_counts:
                    tier_counts[tier] += 1
            except Exception as exc:
                log.warning(f"cron_recompute fail for {dev_id}: {exc}")
                errors += 1
    except Exception as exc:
        log.warning(f"cron_recompute outer fail: {exc}")
        errors += 1

    summary = {"tier_counts": tier_counts}
    await _persist_run(db, started, processed, errors, summary)
    log.info(
        f"[construction_quality_cron] recompute_weekly done · "
        f"processed={processed} errors={errors} tiers={tier_counts}"
    )
    return {"processed": processed, "errors": errors, "summary": summary}


def register_construction_quality_jobs(scheduler, db) -> None:
    """Registra job semanal lunes 02:00 UTC.

    Hora elegida: lunes temprano UTC = domingo noche CDMX = bajo tráfico web.
    """
    scheduler.add_job(
        cron_recompute_quality_weekly,
        CronTrigger(day_of_week="mon", hour=2, minute=0, timezone="UTC"),
        id="construction_quality_recompute_weekly",
        replace_existing=True,
        max_instances=1,
        kwargs={"db": db},
    )
    log.info(
        "[construction_quality_cron] Job registrado: recompute @ lunes 02:00 UTC"
    )
