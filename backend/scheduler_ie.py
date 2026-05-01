"""
IE Engine — APScheduler-driven cron jobs (Phase A4).

Two recurring jobs:
- daily_ingestion at 00:00 America/Mexico_City: walks every source whose
  status=active and access_mode ∈ {api_key, ckan_resource, keyless_url, wms_wfs}.
  Skips manual_upload sources entirely (they update only when an operator uploads).
- hourly_status_check at minute 0: pings test_connection() on every active source
  and updates last_status / status accordingly.

All cron actions emit structured JSON log lines with prefix "ie_cron" so they
can be filtered later (Stackdriver / Datadog).

The scheduler is started as part of FastAPI's startup hook in server.py and
shut down on shutdown. All DB access uses the same Motor client.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from connectors_ie import get_connector, new_job_id

logger = logging.getLogger("ie_cron")
logger.setLevel(logging.INFO)
if not logger.handlers:
    h = logging.StreamHandler()
    h.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(h)


CRON_AUTO_INGEST_MODES = {"api_key", "ckan_resource", "keyless_url", "wms_wfs"}
TZ = "America/Mexico_City"


def _emit(event: str, **fields):
    """Structured JSON log line with timestamp."""
    payload = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "ie_cron": event,
        **fields,
    }
    logger.info(json.dumps(payload, default=str))


def _decrypt_creds(encrypted: Optional[str]) -> Dict[str, str]:
    """Local copy that avoids circular import with routes_ie_engine."""
    from routes_ie_engine import decrypt_credentials
    return decrypt_credentials(encrypted)


# ─── Job: daily ingestion ────────────────────────────────────────────────────
async def run_daily_ingestion(db):
    sources = await db.ie_data_sources.find(
        {"status": "active", "access_mode": {"$in": list(CRON_AUTO_INGEST_MODES)}},
        {"_id": 0},
    ).to_list(length=200)

    _emit("daily_ingestion_start", source_count=len(sources))
    summary: List[Dict[str, Any]] = []

    for src in sources:
        creds = _decrypt_creds(src.get("credentials"))
        connector = get_connector(src, creds)
        job_id = new_job_id()
        started = datetime.now(timezone.utc)
        await db.ie_ingestion_jobs.insert_one({
            "id": job_id, "source_id": src["id"], "trigger": "cron",
            "status": "running", "started_at": started, "finished_at": None,
            "records_ingested": 0, "error_message": None,
        })

        error_msg: Optional[str] = None
        obs: List[Dict[str, Any]] = []
        try:
            obs = await connector.fetch()
        except Exception as e:  # noqa: BLE001
            error_msg = f"Connector exception: {e}"

        is_stub = bool(obs) and all(o.get("is_stub") for o in obs)
        n = len(obs)

        if obs:
            for o in obs:
                o["job_id"] = job_id
            await db.ie_raw_observations.insert_many(obs)

        finished = datetime.now(timezone.utc)
        job_status = "ok" if (n > 0 and not error_msg) else "error" if error_msg else "ok"
        await db.ie_ingestion_jobs.update_one({"id": job_id}, {"$set": {
            "status": job_status,
            "finished_at": finished,
            "records_ingested": n,
            "error_message": error_msg,
        }})
        await db.ie_data_sources.update_one({"id": src["id"]}, {"$set": {
            "last_sync": finished,
            "last_status": "ok" if (n > 0 and not error_msg) else "error",
            "updated_at": finished,
        }, "$inc": {"records_total": n}})

        summary.append({"source_id": src["id"], "records": n, "is_stub": is_stub, "status": job_status})
        _emit("daily_ingestion_source", source_id=src["id"], job_id=job_id,
              records=n, is_stub=is_stub, status=job_status, error=error_msg)

    _emit("daily_ingestion_done", processed=len(sources), summary=summary)
    return summary


# ─── Job: hourly status check ────────────────────────────────────────────────
async def run_hourly_status_check(db):
    sources = await db.ie_data_sources.find(
        {"status": "active", "access_mode": {"$in": list(CRON_AUTO_INGEST_MODES)}},
        {"_id": 0},
    ).to_list(length=200)

    _emit("hourly_status_check_start", source_count=len(sources))
    results: List[Dict[str, Any]] = []
    for src in sources:
        creds = _decrypt_creds(src.get("credentials"))
        connector = get_connector(src, creds)
        try:
            ok, msg = await connector.test_connection()
        except Exception as e:  # noqa: BLE001
            ok, msg = False, f"Exception: {e}"

        update = {
            "last_status": "ok" if ok else "error",
            "updated_at": datetime.now(timezone.utc),
        }
        if not ok:
            err_log = (src.get("error_log") or []) + [{
                "ts": datetime.now(timezone.utc),
                "scope": "hourly_status_check",
                "message": msg,
            }]
            update["error_log"] = err_log[-10:]

        await db.ie_data_sources.update_one({"id": src["id"]}, {"$set": update})
        results.append({"source_id": src["id"], "ok": ok, "message": msg})
        _emit("hourly_status_check_source", source_id=src["id"], ok=ok, message=msg)

    _emit("hourly_status_check_done", checked=len(sources))
    return results


# ─── Scheduler boot/teardown ────────────────────────────────────────────────
_scheduler: Optional[AsyncIOScheduler] = None


def start_scheduler(db):
    global _scheduler
    if _scheduler is not None:
        return _scheduler
    if os.environ.get("IE_DISABLE_CRON") == "1":
        _emit("scheduler_disabled", reason="IE_DISABLE_CRON=1")
        return None

    _scheduler = AsyncIOScheduler(timezone=TZ)
    _scheduler.add_job(
        run_daily_ingestion, CronTrigger(hour=0, minute=0, timezone=TZ),
        args=[db], id="ie_daily_ingestion", replace_existing=True,
        misfire_grace_time=3600,
    )
    _scheduler.add_job(
        run_hourly_status_check, CronTrigger(minute=0, timezone=TZ),
        args=[db], id="ie_hourly_status", replace_existing=True,
        misfire_grace_time=600,
    )
    _scheduler.start()
    _emit("scheduler_started", tz=TZ, jobs=["ie_daily_ingestion", "ie_hourly_status"])
    return _scheduler


def stop_scheduler():
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
        _emit("scheduler_stopped")


async def trigger_now(db, job: str):
    """Manually fire a cron job (used by the superadmin UI). Returns the run summary."""
    if job == "daily_ingestion":
        return await run_daily_ingestion(db)
    if job == "hourly_status":
        return await run_hourly_status_check(db)
    raise ValueError(f"Unknown cron job: {job}")
