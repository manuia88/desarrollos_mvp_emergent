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


# ─── Job: daily score recompute (Phase B3, 02:00 MX) ─────────────────────────
async def run_daily_score_recompute(db):
    """Recomputes IE scores for zones with new observations in the last 24h.
    Also recomputes project scores for all developments (data is DMX-internal, fast).
    AirROI-backed recipes are SKIPPED automatically (is_paid=True without allow_paid)."""
    from score_engine import ScoreEngine, all_recipes
    from datetime import timedelta

    since = datetime.now(timezone.utc) - timedelta(hours=24)
    zones_with_new_obs = await db.ie_raw_observations.distinct("zone_id", {
        "fetched_at": {"$gte": since}, "is_stub": False,
    })
    # distinct(None) is allowed; filter them out to avoid computing for global obs
    colonia_zones = set(z for z in zones_with_new_obs if z)

    # Always include ALL 16 seeded colonias so coverage stays fresh across the grid,
    # not just the 4 pilot zones. Global obs (zone_id=None) already propagate to
    # every zone via the score engine's $or query.
    try:
        from data_seed import COLONIAS
        for c in COLONIAS:
            colonia_zones.add(c["id"].replace("-", "_"))
    except ImportError:
        pass

    colonia_zones = sorted(colonia_zones)

    # All developments — cheap because recipes work on in-memory DMX data
    try:
        from data_developments import DEVELOPMENTS_BY_ID
        proyecto_zones = list(DEVELOPMENTS_BY_ID.keys())
    except ImportError:
        proyecto_zones = []

    # All units — DMX-internal, ~450 units universe
    try:
        from data_developments import ALL_UNITS
        unit_zones = [u["id"] for u in ALL_UNITS if u.get("id")]
    except ImportError:
        unit_zones = []

    _emit("daily_score_recompute_start", colonia=len(colonia_zones),
          proyecto=len(proyecto_zones), unit=len(unit_zones))
    engine = ScoreEngine(db)

    col_codes = [c for c, r in all_recipes().items() if getattr(r, "scope", "colonia") == "colonia"]
    proy_codes = [c for c, r in all_recipes().items() if getattr(r, "scope", "colonia") == "proyecto"]
    unit_codes = [c for c, r in all_recipes().items() if getattr(r, "scope", "colonia") == "unit"]

    stats = {"colonia": {"zones": 0, "real": 0, "stub": 0},
             "proyecto": {"zones": 0, "real": 0, "stub": 0},
             "unit": {"zones": 0, "real": 0, "stub": 0}}

    for z in colonia_zones:
        try:
            results = await engine.compute_many(z, col_codes, allow_paid=False)
            stats["colonia"]["zones"] += 1
            stats["colonia"]["real"] += sum(1 for r in results if not r.is_stub and r.value is not None)
            stats["colonia"]["stub"] += sum(1 for r in results if r.is_stub)
        except Exception as e:  # noqa: BLE001
            _emit("daily_score_recompute_zone_error", zone=z, scope="colonia", error=str(e))

    for z in proyecto_zones:
        try:
            results = await engine.compute_many(z, proy_codes, allow_paid=False)
            stats["proyecto"]["zones"] += 1
            stats["proyecto"]["real"] += sum(1 for r in results if not r.is_stub and r.value is not None)
            stats["proyecto"]["stub"] += sum(1 for r in results if r.is_stub)
        except Exception as e:  # noqa: BLE001
            _emit("daily_score_recompute_zone_error", zone=z, scope="proyecto", error=str(e))

    for z in unit_zones:
        try:
            results = await engine.compute_many(z, unit_codes, allow_paid=False)
            stats["unit"]["zones"] += 1
            stats["unit"]["real"] += sum(1 for r in results if not r.is_stub and r.value is not None)
            stats["unit"]["stub"] += sum(1 for r in results if r.is_stub)
        except Exception as e:  # noqa: BLE001
            _emit("daily_score_recompute_zone_error", zone=z, scope="unit", error=str(e))

    _emit("daily_score_recompute_done", stats=stats)
    return stats


# ─── Helper: initial recompute on first boot (W3.1B-5) ───────────────────────
async def run_initial_recompute_if_empty(db):
    """One-shot: si ie_scores collection está vacía (nunca corrió cron), ejecuta recompute completo.
    Garantiza que ui_mode='real' esté disponible en primer deploy sin esperar 02:00 AM."""
    try:
        existing = await db.ie_scores.count_documents({}, limit=1)
    except Exception as e:  # noqa: BLE001
        _emit("initial_recompute_check_error", error=str(e))
        return
    if existing > 0:
        _emit("initial_recompute_skip", reason="ie_scores collection ya tiene docs")
        return
    _emit("initial_recompute_start")
    try:
        stats = await run_daily_score_recompute(db)
        _emit("initial_recompute_done", stats=stats)
    except Exception as e:  # noqa: BLE001
        _emit("initial_recompute_error", error=str(e))


# ─── Scheduler boot/teardown ────────────────────────────────────────────────
_scheduler: Optional[AsyncIOScheduler] = None


# W4.1D — Comparable anomaly detection (cron 03:00 MX)
async def run_comparable_anomaly_detection(db):
    """Iterate all DEVELOPMENTS and fire detect_anomalies_for_dev for each."""
    from data_developments import DEVELOPMENTS_BY_ID
    from comparable_anomaly_engine import detect_anomalies_for_dev

    total_alerts = 0
    for dev_id in DEVELOPMENTS_BY_ID:
        try:
            alerts = await detect_anomalies_for_dev(db, dev_id)
            total_alerts += len(alerts)
        except Exception as e:
            _emit("comparable_anomaly_error", dev=dev_id, error=str(e))
    _emit("comparable_anomaly_done", total=total_alerts)
    return {"total_alerts": total_alerts}


def start_scheduler(db):
    global _scheduler
    if _scheduler is not None:
        return _scheduler
    if os.environ.get("IE_DISABLE_CRON") == "1":
        _emit("scheduler_disabled", reason="IE_DISABLE_CRON=1")
        return None

    _scheduler = AsyncIOScheduler(timezone=TZ)
    # W1.3 SA1.2 — heartbeat instrumentation
    try:
        from cron_heartbeat import wrap_apscheduler_job, set_db
        set_db(db)
    except Exception:
        def wrap_apscheduler_job(fn, _job_id):  # noqa: ARG001
            return fn

    _scheduler.add_job(
        wrap_apscheduler_job(run_daily_ingestion, "ie_daily_ingestion"),
        CronTrigger(hour=0, minute=0, timezone=TZ),
        args=[db], id="ie_daily_ingestion", replace_existing=True,
        misfire_grace_time=3600,
    )
    _scheduler.add_job(
        wrap_apscheduler_job(run_hourly_status_check, "ie_hourly_status"),
        CronTrigger(minute=0, timezone=TZ),
        args=[db], id="ie_hourly_status", replace_existing=True,
        misfire_grace_time=600,
    )
    _scheduler.add_job(
        wrap_apscheduler_job(run_daily_score_recompute, "ie_daily_score_recompute"),
        CronTrigger(hour=2, minute=0, timezone=TZ),
        args=[db], id="ie_daily_score_recompute", replace_existing=True,
        misfire_grace_time=3600,
    )
    # Phase 7.11 — Drive watcher every 6h (FALLBACK; webhooks are realtime)
    from drive_engine import run_drive_watcher_once, renew_expiring_webhooks
    _scheduler.add_job(
        wrap_apscheduler_job(run_drive_watcher_once, "drive_watcher"),
        CronTrigger(hour="*/6", minute=15, timezone=TZ),
        args=[db], id="drive_watcher", replace_existing=True,
        misfire_grace_time=1800,
    )
    # Phase 7.11 upgrade — renew webhooks expiring within 24h (Google caps ~7d)
    _scheduler.add_job(
        wrap_apscheduler_job(renew_expiring_webhooks, "drive_webhook_renew"),
        CronTrigger(hour=3, minute=30, timezone=TZ),
        args=[db], id="drive_webhook_renew", replace_existing=True,
        misfire_grace_time=3600,
    )
    # Phase 4 Batch 1 — Unit holds auto-release (every 30min)
    from routes_dev_batch1 import auto_release_expired_holds
    _scheduler.add_job(
        wrap_apscheduler_job(auto_release_expired_holds, "unit_holds_release"),
        CronTrigger(minute="*/30", timezone=TZ),
        args=[db], id="unit_holds_release", replace_existing=True,
        misfire_grace_time=300,
    )
    # Phase 4 Batch 14 — Health Score daily snapshots at 6am MX
    try:
        from health_score import take_health_snapshots
        _scheduler.add_job(
            wrap_apscheduler_job(take_health_snapshots, "health_score_snapshots"),
            CronTrigger(hour=6, minute=0, timezone=TZ),
            args=[db], id="health_score_snapshots", replace_existing=True,
            misfire_grace_time=3600,
        )
    except Exception as e:
        _emit("scheduler_health_score_error", error=str(e))

    # Phase 4 Batch 14 — Weekly brief generation every Monday at 8am MX
    try:
        from routes_dev_batch14 import generate_weekly_briefs_for_all
        _scheduler.add_job(
            wrap_apscheduler_job(generate_weekly_briefs_for_all, "weekly_brief_generation"),
            CronTrigger(day_of_week="mon", hour=8, minute=0, timezone=TZ),
            args=[db], id="weekly_brief_generation", replace_existing=True,
            misfire_grace_time=3600,
        )
    except Exception as e:
        _emit("scheduler_weekly_brief_error", error=str(e))

    # Phase 4 Batch 15 — Refresh expiring OAuth tokens every 30 min
    try:
        from oauth_calendar import refresh_all_expiring_tokens
        _scheduler.add_job(
            wrap_apscheduler_job(refresh_all_expiring_tokens, "oauth_token_refresh"),
            "interval", minutes=30,
            args=[db], id="oauth_token_refresh", replace_existing=True,
            misfire_grace_time=300,
        )
    except Exception as e:
        _emit("scheduler_oauth_refresh_error", error=str(e))

    # W1.3 SA1.2 — health critical check every 5 min
    try:
        from routes_superadmin_health import schedule_health_critical_check
        schedule_health_critical_check(_scheduler, db)
    except Exception as e:
        _emit("scheduler_health_critical_error", error=str(e))

    # W2.1 SA2 — Data Sources Hub healthcheck every 10 min
    try:
        from routes_superadmin_data_hub import schedule_data_hub_healthcheck
        schedule_data_hub_healthcheck(_scheduler, db)
    except Exception as e:
        _emit("scheduler_data_hub_error", error=str(e))

    # W2.3 SA4 — AI cost daily aggregation cron (1am MX)
    try:
        from routes_superadmin_ai_cost import schedule_ai_cost_daily_aggregation
        schedule_ai_cost_daily_aggregation(_scheduler, db)
    except Exception as e:
        _emit("scheduler_ai_cost_error", error=str(e))

    # W2.4 SA5 — Trial expiry check cron (8am MX)
    try:
        from trial_expiry_cron import schedule_trial_expiry_cron
        schedule_trial_expiry_cron(_scheduler, db)
    except Exception as e:
        _emit("scheduler_trial_expiry_error", error=str(e))

    # W2.5 SA6 — Metrics Cube daily aggregation cron (2:15am MX)
    try:
        from routes_superadmin_metrics_cube import schedule_metrics_cube_daily_aggregation
        schedule_metrics_cube_daily_aggregation(_scheduler, db)
    except Exception as e:
        _emit("scheduler_metrics_cube_error", error=str(e))

    # W2.6 SA8 — Founder anomaly detection cron (6am MX)
    try:
        from anomaly_detection_engine import schedule_anomaly_detection_cron
        schedule_anomaly_detection_cron(_scheduler, db)
    except Exception as e:
        _emit("scheduler_anomaly_detection_error", error=str(e))

    # W2.7 Phase Z.0 — Data Lake daily ETL cron (3am MX, after metrics-cube 02:15)
    try:
        from data_lake_etl import schedule_data_lake_etl_cron
        schedule_data_lake_etl_cron(_scheduler, db)
    except Exception as e:
        _emit("scheduler_data_lake_etl_error", error=str(e))

    # W2.8 Phase Z.1 — Materialized views refresh cron (3:30am MX, post ETL)
    try:
        from cube_olap_engine import schedule_materialized_views_cron
        schedule_materialized_views_cron(_scheduler, db)
    except Exception as e:
        _emit("scheduler_cube_materialized_error", error=str(e))

    # W2.9 Phase Z.2 — Intelligence Hub weekly refresh cron (Mon 05:00 MX)
    try:
        from intelligence_insights_engine import schedule_intelligence_insights_cron
        schedule_intelligence_insights_cron(_scheduler, db)
    except Exception as e:
        _emit("scheduler_intelligence_insights_error", error=str(e))

    # W3.1A Phase 5 — DENUE sync weekly (Mon 05:00 MX)
    try:
        from denue_engine import schedule_denue_sync_cron
        schedule_denue_sync_cron(_scheduler, db)
    except Exception as e:
        _emit("scheduler_denue_sync_error", error=str(e))

    # W3.1A Phase 5 — Construction Costs monthly (1ro mes 07:00 MX)
    try:
        from construction_cost_engine import schedule_construction_costs_cron
        schedule_construction_costs_cron(_scheduler, db)
    except Exception as e:
        _emit("scheduler_construction_costs_error", error=str(e))

    # W3.1A Phase 5 — Zone Score daily refresh (04:00 MX post-ETL 03:00)
    try:
        from zone_score_engine import schedule_zone_score_cron
        schedule_zone_score_cron(_scheduler, db)
    except Exception as e:
        _emit("scheduler_zone_score_error", error=str(e))

    # W3.2 Transaction Network — price index daily refresh (04:30 MX)
    try:
        from transaction_network_engine import schedule_price_index_cron
        schedule_price_index_cron(_scheduler, db)
    except Exception as e:
        _emit("scheduler_transaction_price_index_error", error=str(e))

    # W3.3 ZZ.3 — DRPI monthly snapshot (1ro mes 06:00 MX)
    try:
        from drpi_engine import schedule_drpi_monthly_cron
        schedule_drpi_monthly_cron(_scheduler, db)
    except Exception as e:
        _emit("scheduler_drpi_monthly_error", error=str(e))

    # W3.3 ZZ.3 — Bulletins monthly generate (1ro mes 07:00 MX, post DRPI)
    try:
        from bulletins_engine import schedule_bulletins_monthly_cron
        schedule_bulletins_monthly_cron(_scheduler, db)
    except Exception as e:
        _emit("scheduler_bulletins_monthly_error", error=str(e))

    # W3.4A — SESNSP monthly ingest (1ro mes 08:00 MX)
    try:
        from crime_data_engine import schedule_sesnsp_monthly_cron
        schedule_sesnsp_monthly_cron(_scheduler, db)
    except Exception as e:
        _emit("scheduler_sesnsp_monthly_error", error=str(e))

    # W3.4A — Fraud detection daily (03:00 MX)
    try:
        from fraud_detection_engine import schedule_fraud_detection_cron
        schedule_fraud_detection_cron(_scheduler, db)
    except Exception as e:
        _emit("scheduler_fraud_detection_error", error=str(e))

    # W3.4A — Risk Score zone daily (05:00 MX, post zone_score 04:00)
    try:
        from risk_score_engine import schedule_risk_score_cron
        schedule_risk_score_cron(_scheduler, db)
    except Exception as e:
        _emit("scheduler_risk_score_error", error=str(e))

    # W3.4B — CENAPRED + Atlas CDMX quarterly ingest (1ro mes 09:00 MX, jan/abr/jul/oct)
    try:
        from natural_risk_engine import schedule_atlas_quarterly_cron
        schedule_atlas_quarterly_cron(_scheduler, db)
    except Exception as e:
        _emit("scheduler_atlas_quarterly_error", error=str(e))

    # W3.7 — Compliance audit retention check (1ro mes 10:00 MX)
    try:
        from compliance_engine import schedule_compliance_audit_retention_cron
        schedule_compliance_audit_retention_cron(_scheduler, db)
    except Exception as e:
        _emit("scheduler_compliance_retention_error", error=str(e))

    # W4.1D — Comparable anomaly detection 03:00 MX (después de score recompute 02:00)
    try:
        from comparable_anomaly_engine import detect_anomalies_for_dev
        _scheduler.add_job(
            wrap_apscheduler_job(run_comparable_anomaly_detection, "comparable_anomalies"),
            CronTrigger(hour=3, minute=0, timezone=TZ),
            args=[db], id="comparable_anomalies", replace_existing=True,
            misfire_grace_time=3600,
        )
    except Exception as e:
        _emit("scheduler_comparable_anomaly_error", error=str(e))

    # W4.2D3.5 — Lead nurture matching 04:00 MX (after risk + watchlist alerts)
    try:
        from lead_nurture_engine import run_lead_nurture_match
        _scheduler.add_job(
            wrap_apscheduler_job(run_lead_nurture_match, "lead_nurture"),
            CronTrigger(hour=4, minute=0, timezone=TZ),
            args=[db], id="lead_nurture", replace_existing=True,
            misfire_grace_time=3600,
        )
    except Exception as e:
        _emit("scheduler_lead_nurture_error", error=str(e))

    # W4.4B — Director Memory daily ingest 04:30 MX (post lead_nurture)
    try:
        from director_memory_engine import run_memory_daily_ingest
        _scheduler.add_job(
            wrap_apscheduler_job(run_memory_daily_ingest, "director_memory_ingest"),
            CronTrigger(hour=4, minute=30, timezone=TZ),
            args=[db], id="director_memory_ingest", replace_existing=True,
            misfire_grace_time=3600,
        )
    except Exception as e:
        _emit("scheduler_director_memory_ingest_error", error=str(e))

    # W4.4B — Director Memory expire weekly Sunday 05:00 MX
    try:
        from director_memory_engine import expire_all_orgs
        _scheduler.add_job(
            wrap_apscheduler_job(expire_all_orgs, "director_memory_expire"),
            CronTrigger(day_of_week="sun", hour=5, minute=0, timezone=TZ),
            args=[db], id="director_memory_expire", replace_existing=True,
            misfire_grace_time=3600,
        )
    except Exception as e:
        _emit("scheduler_director_memory_expire_error", error=str(e))

    # W4.4E — Asistente público expire 03:30 MX diario
    try:
        from asistente_engine import expire_old_sessions_cron
        _scheduler.add_job(
            wrap_apscheduler_job(expire_old_sessions_cron, "asistente_expire"),
            CronTrigger(hour=3, minute=30, timezone=TZ),
            args=[db], id="asistente_expire", replace_existing=True,
            misfire_grace_time=3600,
        )
    except Exception as e:
        _emit("scheduler_asistente_expire_error", error=str(e))

    _scheduler.start()
    _emit("scheduler_started", tz=TZ, jobs=["ie_daily_ingestion", "ie_hourly_status",
          "ie_daily_score_recompute", "drive_watcher", "drive_webhook_renew",
          "unit_holds_release", "health_score_snapshots", "weekly_brief_generation",
          "oauth_token_refresh"])
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
    if job == "daily_score_recompute":
        return await run_daily_score_recompute(db)
    raise ValueError(f"Unknown cron job: {job}")
