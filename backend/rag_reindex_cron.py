"""W5.x F2 Sub-E · Cron diario para re-indexación RAG + cleanup director_memory.

Pattern reusa apscheduler ya configurado en server.py (sched).
- 03:00 MX · rag_reindex_daily: hash-diff incremental sobre todo el corpus
- 03:30 MX · director_memory_cleanup: expire entradas >180 días (todos orgs)

Cero breaking · si reindex_all/expire_all_orgs fallan · log warning y continúa.
"""
from __future__ import annotations

import logging

log = logging.getLogger("dmx.rag_reindex_cron")


async def rag_reindex_daily(db) -> dict:
    """Hash-diff incremental · solo re-embed chunks cuyo hash cambió."""
    try:
        from rag_engine import reindex_all
        result = await reindex_all(db, incremental=True)
        log.info(f"[rag_reindex_daily] {result}")
        return result
    except Exception as exc:
        log.warning(f"[rag_reindex_daily] failed: {exc}")
        return {"error": str(exc)[:240]}


async def director_memory_cleanup(db, days: int = 180) -> int:
    """Soft-delete director_memory_index entries >N días no accedidas."""
    try:
        from director_memory_engine import expire_all_orgs
        deleted = await expire_all_orgs(db, days=days)
        log.info(f"[director_memory_cleanup] deleted={deleted}")
        return deleted
    except Exception as exc:
        log.warning(f"[director_memory_cleanup] failed: {exc}")
        return 0


def register_rag_reindex_jobs(sched, db) -> None:
    """Llamar desde server.py startup tras sched.start().

    Cron timezone: America/Mexico_City (consistente con resto del scheduler).
    """
    try:
        from apscheduler.triggers.cron import CronTrigger
        sched.add_job(
            rag_reindex_daily,
            CronTrigger(hour=3, minute=0, timezone="America/Mexico_City"),
            id="rag_reindex_daily",
            replace_existing=True,
            kwargs={"db": db},
            max_instances=1,
            misfire_grace_time=900,
        )
        sched.add_job(
            director_memory_cleanup,
            CronTrigger(hour=3, minute=30, timezone="America/Mexico_City"),
            id="director_memory_cleanup",
            replace_existing=True,
            kwargs={"db": db, "days": 180},
            max_instances=1,
            misfire_grace_time=900,
        )
        log.info("[F2] RAG reindex + memory cleanup crons scheduled (03:00 / 03:30 MX)")
    except Exception as exc:
        log.warning(f"[F2] register_rag_reindex_jobs failed: {exc}")
