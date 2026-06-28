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
    from routes.ie_engine import decrypt_credentials
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


# ─── Job: watchlist alerts (W3.9b, 02:30 MX, after daily score recompute) ────
async def run_watchlist_alerts(db):
    """Check active risk_alerts subscribers; fire Resend email if any subscribed
    zone has tier='red' currently. Throttle: 1 email per subscriber per 7 days.
    Runs after run_daily_score_recompute (chained 02:30 MX)."""
    import os
    from datetime import timedelta

    now = datetime.now(timezone.utc)
    cursor = db.watchlist_subscribers.find(
        {"active": True, "scope": {"$in": ["risk_alerts", "both"]}},
        {"_id": 0},
    )
    subs = await cursor.to_list(length=10000)
    _emit("watchlist_alerts_start", subs=len(subs))

    sent = 0
    throttled = 0
    no_match = 0
    errors = 0
    resend_key = os.environ.get("RESEND_API_KEY", "")
    public_url = os.environ.get("DMX_PUBLIC_URL", "https://desarrollosmx.io").rstrip("/")

    for sub in subs:
        try:
            last = sub.get("last_email_sent_at")
            if last and (now - last) < timedelta(days=7):
                throttled += 1
                continue
            zone_ids = sub.get("zone_ids") or []
            if not zone_ids:
                no_match += 1
                continue
            red_zones = await db.ie_scores.distinct(
                "zone_id",
                {"zone_id": {"$in": zone_ids}, "tier": "red", "is_stub": False},
            )
            if not red_zones:
                no_match += 1
                continue

            email = sub.get("email")
            manage_token = sub.get("manage_token", "")
            manage_url = f"{public_url}/watchlist/manage?token={manage_token}"

            if resend_key and email:
                try:
                    import httpx
                    items = "".join(f"<li>{z}</li>" for z in red_zones[:20])
                    html = (
                        f"<div style='font-family:DM Sans,sans-serif;color:#1a1a1a;max-width:540px;margin:0 auto;padding:24px'>"
                        f"<h2 style='font-family:Outfit,sans-serif;font-weight:700'>Alerta de riesgo · DMX Watchlist</h2>"
                        f"<p>Las siguientes zonas en tu watchlist están en tier <strong>rojo</strong>:</p>"
                        f"<ul>{items}</ul>"
                        f"<p style='font-size:12px;color:#666;margin-top:24px'>Gestionar o darse de baja: <a href='{manage_url}'>{manage_url}</a></p>"
                        f"<p style='font-size:11px;color:#999'>LFPDPPP — DMX. Audit trail conservado.</p>"
                        f"</div>"
                    )
                    body = {
                        "from": "DMX Watchlist <no-reply@desarrollosmx.io>",
                        "to": [email],
                        "subject": "Alerta de riesgo en tu watchlist · DMX",
                        "html": html,
                    }
                    async with httpx.AsyncClient() as client:
                        await client.post(
                            "https://api.resend.com/emails",
                            headers={"Authorization": f"Bearer {resend_key}"},
                            json=body,
                            timeout=10,
                        )
                except Exception as e:  # noqa: BLE001
                    _emit("watchlist_alert_email_error", email=email, error=str(e))
                    errors += 1
                    continue
            else:
                _emit("watchlist_alert_stub", email=email, red_zones=len(red_zones))

            await db.watchlist_subscribers.update_one(
                {"manage_token": manage_token},
                {"$set": {"last_email_sent_at": now}},
            )
            sent += 1
        except Exception as e:  # noqa: BLE001
            _emit("watchlist_alert_subscriber_error", email=sub.get("email"), error=str(e))
            errors += 1

    _emit("watchlist_alerts_done", subs=len(subs), sent=sent,
          throttled=throttled, no_match=no_match, errors=errors)
    return {"subs": len(subs), "sent": sent, "throttled": throttled,
            "no_match": no_match, "errors": errors}


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


async def run_rates_update(db):
    """Tasas de inversión: jala CETES vivo de Banxico y actualiza market_rates (la página y la calculadora leen de ahí)."""
    from market_rates_engine import update_rates
    res = await update_rates(db)
    _emit("rates_update_done", actualizados=res.get("actualizados"), fuente=res.get("fuente"))
    return res


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
    # W3.9b — Watchlist alerts (02:30 MX, post score recompute)
    _scheduler.add_job(
        wrap_apscheduler_job(run_watchlist_alerts, "watchlist_alerts"),
        CronTrigger(hour=2, minute=30, timezone=TZ),
        args=[db], id="watchlist_alerts", replace_existing=True,
        misfire_grace_time=3600,
    )
    # F5.3 — Foto diaria de los índices DMX (03:00 MX) para la curva/historial del Modelo del Mundo
    from terminal_mercado_engine import market_index_daily_snapshot
    _scheduler.add_job(
        wrap_apscheduler_job(market_index_daily_snapshot, "market_index_snapshot"),
        CronTrigger(hour=3, minute=0, timezone=TZ),
        args=[db], id="market_index_snapshot", replace_existing=True,
        misfire_grace_time=3600,
    )
    # Tasas de inversión — CETES vivo de Banxico, DIARIO (01:07 MX). Fuentes oficiales: Banxico/cetesdirecto/BMV/GBM/investing.
    _scheduler.add_job(
        wrap_apscheduler_job(run_rates_update, "rates_update"),
        CronTrigger(hour=1, minute=7, timezone=TZ),
        args=[db], id="rates_update", replace_existing=True,
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
    from routes.dev_batch1 import auto_release_expired_holds
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
        from routes.dev_batch14 import generate_weekly_briefs_for_all
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
        from routes.superadmin_health import schedule_health_critical_check
        schedule_health_critical_check(_scheduler, db)
    except Exception as e:
        _emit("scheduler_health_critical_error", error=str(e))

    # W2.1 SA2 — Data Sources Hub healthcheck every 10 min
    try:
        from routes.superadmin_data_hub import schedule_data_hub_healthcheck
        schedule_data_hub_healthcheck(_scheduler, db)
    except Exception as e:
        _emit("scheduler_data_hub_error", error=str(e))

    # W2.3 SA4 — AI cost daily aggregation cron (1am MX)
    try:
        from routes.superadmin_ai_cost import schedule_ai_cost_daily_aggregation
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
        from routes.superadmin_metrics_cube import schedule_metrics_cube_daily_aggregation
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

    # Auditoría Fase 0 — Demanda al cubo: buyer_signals -> facts_buyer_signals (4:00am MX, post cubo de oferta)
    try:
        from cube_olap_engine import schedule_buyer_signals_cron
        schedule_buyer_signals_cron(_scheduler, db)
    except Exception as e:
        _emit("scheduler_cube_buyer_signals_error", error=str(e))

    # Auditoría Fix #4 — Reconciliación etapa(asesor)→status(db.leads) (4:20am MX) para KPIs consistentes
    try:
        from services.lead_bridge import schedule_reconcile_cron
        schedule_reconcile_cron(_scheduler, db)
    except Exception as e:
        _emit("scheduler_lead_reconcile_error", error=str(e))

    # Oportunidad #6 — Re-entrenar temperatura del lead cada 6h (descongela leads que vuelven)
    try:
        from services.lead_bridge import schedule_temp_refresh_cron
        schedule_temp_refresh_cron(_scheduler, db)
    except Exception as e:
        _emit("scheduler_lead_temp_refresh_error", error=str(e))

    # B2 — Auto-reparar leads invisibles (mirror_pending) cada hora (antes: solo en arranque → leads ocultos por horas)
    try:
        from services.lead_bridge import schedule_mirror_retry_cron
        schedule_mirror_retry_cron(_scheduler, db)
    except Exception as e:
        _emit("scheduler_lead_mirror_retry_error", error=str(e))

    # W2.9 Phase Z.2 — Intelligence Hub weekly refresh cron (Mon 05:00 MX)
    try:
        from intelligence_insights_engine import schedule_intelligence_insights_cron
        schedule_intelligence_insights_cron(_scheduler, db)
    except Exception as e:
        _emit("scheduler_intelligence_insights_error", error=str(e))

    # Densidad de negocios: la cubre el cron OSM (zone_data_cron). El cron DENUE se eliminó
    # (la API de DENUE nunca funcionó; OSM es la fuente viva).

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

    # W4.6 Y.3E — Lead Nurture Intelligent (per-org) 04:15 MX
    try:
        from lead_nurture_engine import run_lead_nurture_intelligent_all_orgs
        _scheduler.add_job(
            wrap_apscheduler_job(run_lead_nurture_intelligent_all_orgs, "lead_nurture_intelligent"),
            CronTrigger(hour=4, minute=15, timezone=TZ),
            args=[db], id="lead_nurture_intelligent", replace_existing=True,
            misfire_grace_time=3600,
        )
    except Exception as e:
        _emit("scheduler_lead_nurture_intelligent_error", error=str(e))

    # W4.7 Y.4B — Match Weights auto-tune semanal lunes 03:30 MX
    try:
        from agentic_crm.match_weights_engine import run_match_weights_auto_tune_all_orgs
        _scheduler.add_job(
            wrap_apscheduler_job(run_match_weights_auto_tune_all_orgs, "match_weights_auto_tune"),
            CronTrigger(day_of_week="mon", hour=3, minute=30, timezone=TZ),
            args=[db], id="match_weights_auto_tune", replace_existing=True,
            misfire_grace_time=3600,
        )
    except Exception as e:
        _emit("scheduler_match_weights_error", error=str(e))

    # W4.8 Y.5 — AI ROI per-dev rollup diario 02:00 MX
    try:
        from agentic_crm.observability_engine import run_ai_roi_daily_rollup
        _scheduler.add_job(
            wrap_apscheduler_job(run_ai_roi_daily_rollup, "ai_roi_daily_rollup"),
            CronTrigger(hour=2, minute=0, timezone=TZ),
            args=[db], id="ai_roi_daily_rollup", replace_existing=True,
            misfire_grace_time=3600,
        )
    except Exception as e:
        _emit("scheduler_ai_roi_error", error=str(e))

    # W4.8 Y.5 — ML Accuracy rollup mensual día 1 a las 03:00 MX
    try:
        from agentic_crm.observability_engine import run_ml_accuracy_monthly_rollup
        _scheduler.add_job(
            wrap_apscheduler_job(run_ml_accuracy_monthly_rollup, "ml_accuracy_monthly_rollup"),
            CronTrigger(day=1, hour=3, minute=0, timezone=TZ),
            args=[db], id="ml_accuracy_monthly_rollup", replace_existing=True,
            misfire_grace_time=7200,
        )
    except Exception as e:
        _emit("scheduler_ml_accuracy_error", error=str(e))

    # W4.18 — Data Sources gov MX (6 fuentes oficiales con frecuencias óptimas)
    try:
        from data_sources import (
            run_banxico_daily_cron, run_sigcdmx_monthly_cron,
            run_atlas_yearly_cron, run_catastro_quarterly_cron,
            run_gtfs_monthly_cron, run_gtfs_daily_cron, run_osm_weekly_cron,
        )
        # Banxico diario 06:00 MX
        _scheduler.add_job(
            wrap_apscheduler_job(run_banxico_daily_cron, "ds_banxico_daily"),
            CronTrigger(hour=6, minute=0, timezone=TZ),
            args=[db], id="ds_banxico_daily", replace_existing=True,
            misfire_grace_time=3600,
        )
        # SIGCDMX mensual día 1 04:00 MX
        _scheduler.add_job(
            wrap_apscheduler_job(run_sigcdmx_monthly_cron, "ds_sigcdmx_monthly"),
            CronTrigger(day=1, hour=4, minute=0, timezone=TZ),
            args=[db], id="ds_sigcdmx_monthly", replace_existing=True,
            misfire_grace_time=7200,
        )
        # Atlas Riesgos anual día 1 enero 05:00 MX
        _scheduler.add_job(
            wrap_apscheduler_job(run_atlas_yearly_cron, "ds_atlas_yearly"),
            CronTrigger(month=1, day=1, hour=5, minute=0, timezone=TZ),
            args=[db], id="ds_atlas_yearly", replace_existing=True,
            misfire_grace_time=86400,
        )
        # Catastro trimestral (1 enero/abril/julio/octubre) 04:30 MX
        _scheduler.add_job(
            wrap_apscheduler_job(run_catastro_quarterly_cron, "ds_catastro_quarterly"),
            CronTrigger(month="1,4,7,10", day=1, hour=4, minute=30, timezone=TZ),
            args=[db], id="ds_catastro_quarterly", replace_existing=True,
            misfire_grace_time=14400,
        )
        # GTFS static mensual día 1 03:30 MX
        _scheduler.add_job(
            wrap_apscheduler_job(run_gtfs_monthly_cron, "ds_gtfs_monthly"),
            CronTrigger(day=1, hour=3, minute=30, timezone=TZ),
            args=[db], id="ds_gtfs_monthly", replace_existing=True,
            misfire_grace_time=7200,
        )
        # GTFS afluencia diario 06:30 MX
        _scheduler.add_job(
            wrap_apscheduler_job(run_gtfs_daily_cron, "ds_gtfs_daily"),
            CronTrigger(hour=6, minute=30, timezone=TZ),
            args=[db], id="ds_gtfs_daily", replace_existing=True,
            misfire_grace_time=3600,
        )
        # OSM semanal lunes 02:30 MX
        _scheduler.add_job(
            wrap_apscheduler_job(run_osm_weekly_cron, "ds_osm_weekly"),
            CronTrigger(day_of_week="mon", hour=2, minute=30, timezone=TZ),
            args=[db], id="ds_osm_weekly", replace_existing=True,
            misfire_grace_time=7200,
        )
    except Exception as e:
        _emit("scheduler_data_sources_error", error=str(e))

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

    # W4.18.1 — Apify Google Trends · daily refresh (hot keywords) 05:30 MX
    try:
        from apify_trends_engine import run_trends_daily_refresh
        _scheduler.add_job(
            wrap_apscheduler_job(run_trends_daily_refresh, "apify_trends_daily"),
            CronTrigger(hour=5, minute=30, timezone=TZ),
            args=[db], id="apify_trends_daily", replace_existing=True,
            misfire_grace_time=3600,
        )
    except Exception as e:
        _emit("scheduler_apify_trends_daily_error", error=str(e))

    # W4.18.1 — Apify Google Trends · weekly refresh (zonas + intents) Lun 06:00 MX
    try:
        from apify_trends_engine import run_trends_weekly_refresh
        _scheduler.add_job(
            wrap_apscheduler_job(run_trends_weekly_refresh, "apify_trends_weekly"),
            CronTrigger(day_of_week="mon", hour=6, minute=0, timezone=TZ),
            args=[db], id="apify_trends_weekly", replace_existing=True,
            misfire_grace_time=3600,
        )
    except Exception as e:
        _emit("scheduler_apify_trends_weekly_error", error=str(e))

    # W4.6 Y.3A — Smart Routing · daily routing_metrics refresh 04:30 MX
    try:
        from agentic_crm.smart_routing_engine import run_routing_metrics_cron
        _scheduler.add_job(
            wrap_apscheduler_job(run_routing_metrics_cron, "smart_routing_metrics"),
            CronTrigger(hour=4, minute=30, timezone=TZ),
            args=[db], id="smart_routing_metrics", replace_existing=True,
            misfire_grace_time=3600,
        )
    except Exception as e:
        _emit("scheduler_smart_routing_metrics_error", error=str(e))

    # W4.6 Y.3B — Visit Prep · daily dossier generation + email 06:00 MX
    try:
        from agentic_crm.visit_prep_engine import run_visit_prep_daily
        _scheduler.add_job(
            wrap_apscheduler_job(run_visit_prep_daily, "visit_prep_daily"),
            CronTrigger(hour=6, minute=0, timezone=TZ),
            args=[db], id="visit_prep_daily", replace_existing=True,
            misfire_grace_time=3600,
        )
    except Exception as e:
        _emit("scheduler_visit_prep_daily_error", error=str(e))

    # W4.10 — Newsletter Pulse · cron domingo 18:00 MX (genera)
    try:
        from newsletter_pulse_engine import run_newsletter_generate
        _scheduler.add_job(
            wrap_apscheduler_job(run_newsletter_generate, "newsletter_generate"),
            CronTrigger(day_of_week="sun", hour=18, minute=0, timezone=TZ),
            args=[db], id="newsletter_generate", replace_existing=True,
            misfire_grace_time=3600,
        )
    except Exception as e:
        _emit("scheduler_newsletter_generate_error", error=str(e))

    # W4.10 — Newsletter Pulse · cron lunes 07:00 MX (envía)
    try:
        from newsletter_pulse_engine import run_newsletter_send
        _scheduler.add_job(
            wrap_apscheduler_job(run_newsletter_send, "newsletter_send"),
            CronTrigger(day_of_week="mon", hour=7, minute=0, timezone=TZ),
            args=[db], id="newsletter_send", replace_existing=True,
            misfire_grace_time=3600,
        )
    except Exception as e:
        _emit("scheduler_newsletter_send_error", error=str(e))

    # W4.17 — Notifications digest · cada 4h (08:00 · 12:00 · 16:00 · 20:00 MX)
    try:
        from notifications_engine import digest_pending_notifications
        _scheduler.add_job(
            wrap_apscheduler_job(digest_pending_notifications, "notifications_digest_4h"),
            CronTrigger(hour="8,12,16,20", minute=0, timezone=TZ),
            args=[db], id="notifications_digest_4h", replace_existing=True,
            misfire_grace_time=1800,
        )
    except Exception as e:
        _emit("scheduler_notifications_digest_error", error=str(e))

    # W4.17 — WA pending replies check · cada 30min
    try:
        from whatsapp_engine import check_pending_whatsapp_replies_cron
        _scheduler.add_job(
            wrap_apscheduler_job(check_pending_whatsapp_replies_cron, "wa_pending_replies_check"),
            CronTrigger(minute="*/30", timezone=TZ),
            args=[db], id="wa_pending_replies_check", replace_existing=True,
            misfire_grace_time=600,
        )
    except Exception as e:
        _emit("scheduler_wa_pending_replies_error", error=str(e))

    # W4.17 — Meeting reminders scheduled · cada 30min
    try:
        from oauth_calendar import process_due_meeting_reminders
        _scheduler.add_job(
            wrap_apscheduler_job(process_due_meeting_reminders, "meeting_reminders_check"),
            CronTrigger(minute="*/30", timezone=TZ),
            args=[db], id="meeting_reminders_check", replace_existing=True,
            misfire_grace_time=600,
        )
    except Exception as e:
        _emit("scheduler_meeting_reminders_error", error=str(e))

    _scheduler.start()
    _emit("scheduler_started", tz=TZ, jobs=["ie_daily_ingestion", "ie_hourly_status",
          "ie_daily_score_recompute", "drive_watcher", "drive_webhook_renew",
          "unit_holds_release", "health_score_snapshots", "weekly_brief_generation",
          "oauth_token_refresh", "newsletter_generate", "newsletter_send",
          "notifications_digest_4h", "wa_pending_replies_check", "meeting_reminders_check"])
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
    if job == "watchlist_alerts":
        return await run_watchlist_alerts(db)
    raise ValueError(f"Unknown cron job: {job}")
