"""W5.x F8 · Predictive Alerts cron jobs.

  - cron_signal_detection · interval 30min · escanea leads + sessions activos
    14d · aggregate_events + detect_signals + create_alert (skip duplicates).
  - cron_email_digest_daily · 08:00 UTC · distinct advisor_id con alertas
    activas últimas 24h · llama email_digest_daily(advisor_id).

FAIL-SOFT por lead/session · auditoría resumen en predictive_alerts_runs.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

from predictive_alerts_engine import (
    COLLECTION_RUNS,
    RUNS_TTL_DAYS,
    aggregate_events,
    assign_advisor_for_alert,
    create_alert,
    detect_signals,
    email_digest_daily,
)

log = logging.getLogger("dmx.predictive_alerts_cron")


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _persist_run(db, cron_type: str, started_at: datetime,
                       leads_scanned: int, alerts_created: int, errors: int) -> None:
    if db is None:
        return
    ended_at = _now()
    doc = {
        "run_id": f"run_{uuid.uuid4().hex[:14]}",
        "cron_type": cron_type,
        "started_at": started_at,
        "ended_at": ended_at,
        "leads_scanned": int(leads_scanned),
        "alerts_created": int(alerts_created),
        "errors": int(errors),
        "ttl_until": ended_at + timedelta(days=RUNS_TTL_DAYS),
    }
    try:
        await db[COLLECTION_RUNS].insert_one(doc)
    except Exception as e:
        log.debug(f"[predictive_alerts_cron] run insert fail: {e}")


async def cron_signal_detection(db) -> Dict[str, Any]:
    """Escanea leads activos (touched últimos 14d) + sessions activos (lead_capture_events 7d).
    Por cada uno: aggregate + detect + create_alert (skip duplicates)."""
    started = _now()
    leads_scanned = 0
    alerts_created = 0
    errors = 0
    if db is None:
        await _persist_run(db, "signal_detection", started, 0, 0, 0)
        return {"leads_scanned": 0, "alerts_created": 0, "errors": 0}

    cutoff_leads = started - timedelta(days=14)
    cutoff_sessions = started - timedelta(days=7)

    # 1) Leads activos
    lead_ids: List[str] = []
    try:
        async for lc in db.lead_captures.find(
            {"created_at": {"$gte": cutoff_leads}},
            {"_id": 0, "lead_id": 1},
        ):
            lid = lc.get("lead_id")
            if lid:
                lead_ids.append(lid)
    except Exception as e:
        log.warning(f"[predictive_alerts_cron] lead scan fail: {e}")
        errors += 1

    for lead_id in lead_ids:
        leads_scanned += 1
        try:
            agg = await aggregate_events(db, lead_id=lead_id, days=14)
            signals = detect_signals(agg)
            if not signals:
                continue
            for sig in signals:
                if sig.get("signal_type") == "trending":
                    continue  # property-level · skip per-lead
                prop_id = sig.get("property_id")
                advisor_id = await assign_advisor_for_alert(db, lead_id, None, prop_id)
                if not advisor_id:
                    continue
                res = await create_alert(db, sig, lead_id, None, prop_id, advisor_id)
                if res and not res.get("duplicate") and res.get("alert_id"):
                    alerts_created += 1
        except Exception as e:
            log.debug(f"[predictive_alerts_cron] lead {lead_id} fail: {e}")
            errors += 1

    # 2) Anonymous sessions activos (lead_capture_events últimos 7d sin lead_id match)
    session_ids: List[str] = []
    try:
        pipe = [
            {"$match": {"captured_at": {"$gte": cutoff_sessions}}},
            {"$group": {"_id": "$visitor_session_id"}},
            {"$limit": 500},
        ]
        async for row in db.lead_capture_events.aggregate(pipe):
            sid = row.get("_id")
            if sid:
                session_ids.append(sid)
    except Exception as e:
        log.warning(f"[predictive_alerts_cron] session scan fail: {e}")
        errors += 1

    # Exclude sessions that already became leads (lead_captures.visitor_session_id)
    leads_by_session: set = set()
    try:
        if session_ids:
            async for lc in db.lead_captures.find(
                {"visitor_session_id": {"$in": session_ids}},
                {"_id": 0, "visitor_session_id": 1},
            ):
                leads_by_session.add(lc.get("visitor_session_id"))
    except Exception:
        pass

    for sid in session_ids:
        if sid in leads_by_session:
            continue
        leads_scanned += 1
        try:
            agg = await aggregate_events(db, session_id=sid, days=7)
            signals = detect_signals(agg)
            if not signals:
                continue
            for sig in signals:
                if sig.get("signal_type") == "trending":
                    continue
                prop_id = sig.get("property_id")
                advisor_id = await assign_advisor_for_alert(db, None, sid, prop_id)
                if not advisor_id:
                    continue
                res = await create_alert(db, sig, None, sid, prop_id, advisor_id)
                if res and not res.get("duplicate") and res.get("alert_id"):
                    alerts_created += 1
        except Exception as e:
            log.debug(f"[predictive_alerts_cron] session {sid} fail: {e}")
            errors += 1

    await _persist_run(db, "signal_detection", started, leads_scanned, alerts_created, errors)
    log.info(
        f"[predictive_alerts_cron] signal_detection · {leads_scanned} scanned · "
        f"{alerts_created} alerts created · {errors} errors"
    )
    return {"leads_scanned": leads_scanned, "alerts_created": alerts_created, "errors": errors}


async def cron_email_digest_daily(db) -> Dict[str, Any]:
    """Distinct advisor_id con alertas activas últimas 24h → email_digest_daily."""
    started = _now()
    sent_count = 0
    errors = 0
    if db is None:
        await _persist_run(db, "email_digest", started, 0, 0, 0)
        return {"advisors_notified": 0, "errors": 0}

    cutoff = started - timedelta(hours=24)
    advisor_ids: List[str] = []
    try:
        pipe = [
            {"$match": {"status": "active", "created_at": {"$gte": cutoff}}},
            {"$group": {"_id": "$advisor_id"}},
        ]
        async for row in db.predictive_alerts.aggregate(pipe):
            aid = row.get("_id")
            if aid:
                advisor_ids.append(aid)
    except Exception as e:
        log.warning(f"[predictive_alerts_cron] digest advisor scan fail: {e}")
        errors += 1

    for aid in advisor_ids:
        try:
            res = await email_digest_daily(db, aid)
            if res and res.get("success") and res.get("alerts_sent_count"):
                sent_count += 1
        except Exception as e:
            log.debug(f"[predictive_alerts_cron] digest {aid} fail: {e}")
            errors += 1

    await _persist_run(db, "email_digest", started, len(advisor_ids), sent_count, errors)
    log.info(
        f"[predictive_alerts_cron] email_digest · {len(advisor_ids)} advisors · "
        f"{sent_count} digests sent · {errors} errors"
    )
    return {"advisors_notified": sent_count, "errors": errors}


def register_predictive_alerts_jobs(scheduler, db) -> None:
    """Registra 2 jobs en APScheduler: signal_detection (30min) + email_digest (08:00 UTC)."""
    if scheduler is None:
        log.warning("[predictive_alerts_cron] no scheduler provided · skip register")
        return
    try:
        from apscheduler.triggers.cron import CronTrigger
        from apscheduler.triggers.interval import IntervalTrigger

        scheduler.add_job(
            cron_signal_detection,
            IntervalTrigger(minutes=30),
            id="predictive_alerts_signal_detection",
            replace_existing=True,
            kwargs={"db": db},
            max_instances=1,
        )
        scheduler.add_job(
            cron_email_digest_daily,
            CronTrigger(hour=8, minute=0),
            id="predictive_alerts_email_digest",
            replace_existing=True,
            kwargs={"db": db},
            max_instances=1,
        )
        log.info("[predictive_alerts_cron] 2 jobs registered · signal_detection (30min) + email_digest (08:00 UTC)")
    except Exception as e:
        log.warning(f"[predictive_alerts_cron] register failed: {e}")
