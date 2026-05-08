"""W1.3 SA1.2 — Cron heartbeat instrumentation helper.

Wraps APScheduler jobs to record start/end markers in `db.cron_heartbeats`.
"""
from __future__ import annotations

import logging
import time
import functools
import inspect
from datetime import datetime, timezone, timedelta
from typing import Any, Callable, Optional

log = logging.getLogger("dmx.cron_heartbeat")


def _now() -> datetime:
    return datetime.now(timezone.utc)


# Map of job_id → schedule_expr (humanized) for display.
SCHEDULE_LABELS = {
    "ie_daily_ingestion": "diario · 00:00 MX",
    "ie_hourly_status": "cada hora",
    "ie_daily_score_recompute": "diario · 02:00 MX",
    "drive_watcher": "cada 6h · :15",
    "drive_webhook_renew": "diario · 03:30 MX",
    "unit_holds_release": "cada 30 min",
    "health_score_snapshots": "diario · 06:00 MX",
    "weekly_brief_generation": "lunes · 08:00 MX",
    "oauth_token_refresh": "cada 30 min",
    "asesor_trust_score_snapshot": "diario · 04:00 MX",
    "wrapped_monthly_first_6am": "mensual · día 1 · 06:00 MX",
    "availability_refresh": "cada 30 min",
    "health_critical_check": "cada 5 min",
    "data_hub_healthcheck_all": "cada 10 min",
    "ai_cost_daily_aggregation": "1am hora CDMX",
    "trial_expiry_check": "8am hora CDMX",
    "metrics_cube_daily_aggregation": "diario · 02:15 MX",
    "founder_anomaly_detection": "diario · 06:00 MX",
    "data_lake_etl_daily": "diario · 03:00 MX",
    "cube_materialized_views_refresh": "diario · 03:30 MX",
    "intelligence_insights_weekly": "lunes · 05:00 MX",
    "denue_sync_weekly":            "lunes · 05:00 MX",
    "construction_costs_monthly":   "mensual · día 1 · 07:00 MX",
    "zone_score_daily_refresh":     "diario · 04:00 MX",
}

# Approx interval seconds per schedule (used for stale detection: stale if last_run > 2× interval ago)
SCHEDULE_INTERVAL_SEC = {
    "ie_daily_ingestion": 86400,
    "ie_hourly_status": 3600,
    "ie_daily_score_recompute": 86400,
    "drive_watcher": 6 * 3600,
    "drive_webhook_renew": 86400,
    "unit_holds_release": 30 * 60,
    "health_score_snapshots": 86400,
    "weekly_brief_generation": 7 * 86400,
    "oauth_token_refresh": 30 * 60,
    "asesor_trust_score_snapshot": 86400,
    "wrapped_monthly_first_6am": 32 * 86400,
    "availability_refresh": 30 * 60,
    "health_critical_check": 5 * 60,
    "data_hub_healthcheck_all": 10 * 60,
    "ai_cost_daily_aggregation": 24 * 60 * 60 + 600,
    "trial_expiry_check": 24 * 60 * 60 + 600,
    "metrics_cube_daily_aggregation": 24 * 60 * 60 + 600,
    "founder_anomaly_detection": 24 * 60 * 60 + 600,
    "data_lake_etl_daily": 24 * 60 * 60 + 600,
    "cube_materialized_views_refresh": 24 * 60 * 60 + 600,
    "intelligence_insights_weekly": 7 * 86400 + 3600,
    "denue_sync_weekly":            7 * 86400 + 3600,
    "construction_costs_monthly":   32 * 86400,
    "zone_score_daily_refresh":     86400 + 600,
}


_DB_REF = None


def set_db(db) -> None:
    """Stash a reference to the Mongo db so wrappers without a db arg can heartbeat."""
    global _DB_REF
    _DB_REF = db


def _resolve_db(args, kwargs):
    """Find a Mongo db instance from the wrapped function args/kwargs."""
    for v in list(args) + list(kwargs.values()):
        # Motor AsyncIOMotorDatabase has `.command` and `.name`
        if hasattr(v, "command") and hasattr(v, "name") and not callable(v):
            return v
    return _DB_REF


async def heartbeat_start(db, job_id: str) -> dict:
    """Mark a job as starting. Returns trace info for end."""
    started_at = _now()
    return {"job_id": job_id, "started_at": started_at, "started_ts": time.monotonic()}


async def heartbeat_end(db, trace: dict, ok: bool, error: Optional[str] = None) -> None:
    if db is None or not trace:
        return
    job_id = trace["job_id"]
    started_ts = trace.get("started_ts") or time.monotonic()
    duration_ms = int((time.monotonic() - started_ts) * 1000)
    last_status = "ok" if ok else "fail"
    schedule_expr = SCHEDULE_LABELS.get(job_id, "")
    now = _now()

    update = {
        "$set": {
            "job_id": job_id,
            "last_run_at": now.isoformat(),
            "last_status": last_status,
            "last_duration_ms": duration_ms,
            "last_error": (error or "")[:500] if error else None,
            "schedule_expr": schedule_expr,
            "updated_at": now.isoformat(),
        },
        "$inc": {"run_count_24h": 1, **({"fail_count_24h": 1} if not ok else {})},
        "$setOnInsert": {"created_at": now.isoformat()},
    }
    try:
        await db.cron_heartbeats.update_one({"job_id": job_id}, update, upsert=True)
    except Exception as e:
        log.warning(f"[heartbeat] persist failed for {job_id}: {e}")


def wrap_apscheduler_job(func: Callable, job_id: str) -> Callable:
    """Decorator: wraps an async APScheduler job to record heartbeat start/end."""
    @functools.wraps(func)
    async def _wrapped(*args, **kwargs):
        db = _resolve_db(args, kwargs)
        trace = await heartbeat_start(db, job_id)
        ok, err = True, None
        try:
            res = func(*args, **kwargs)
            if inspect.isawaitable(res):
                res = await res
            return res
        except Exception as exc:  # noqa: BLE001
            ok, err = False, repr(exc)
            log.exception(f"[cron:{job_id}] failed: {exc}")
            raise
        finally:
            try:
                await heartbeat_end(db, trace, ok=ok, error=err)
            except Exception:
                pass
    return _wrapped


# ─── 24h counter rollover ─────────────────────────────────────────────────────

async def reset_24h_counters(db) -> None:
    """Reset run_count_24h and fail_count_24h for entries older than 24h."""
    cutoff = (_now() - timedelta(hours=24)).isoformat()
    try:
        await db.cron_heartbeats.update_many(
            {"updated_at": {"$lte": cutoff}},
            {"$set": {"run_count_24h": 0, "fail_count_24h": 0}},
        )
    except Exception as e:
        log.warning(f"[heartbeat] reset_24h failed: {e}")


# ─── Stale detection ──────────────────────────────────────────────────────────

def is_stale(hb: dict) -> bool:
    """True if last_run_at is older than 2× the schedule interval."""
    if not hb:
        return True
    job_id = hb.get("job_id") or ""
    interval = SCHEDULE_INTERVAL_SEC.get(job_id, 3600)
    last = hb.get("last_run_at")
    if not last:
        return True
    try:
        last_dt = datetime.fromisoformat(last.replace("Z", "+00:00")) if isinstance(last, str) else last
    except Exception:
        return True
    age_sec = (_now() - last_dt).total_seconds()
    return age_sec > 2 * interval


# ─── Indexes ──────────────────────────────────────────────────────────────────

async def ensure_heartbeat_indexes(db) -> None:
    try:
        await db.cron_heartbeats.create_index("job_id", unique=True)
        await db.system_alerts.create_index([("resolved_at", 1), ("severity", -1)])
        await db.system_alerts.create_index("source")
        await db.system_alerts.create_index([("ts", -1)])
    except Exception as e:
        log.warning(f"[heartbeat] indexes: {e}")
