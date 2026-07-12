"""W1.3 SA1.2 — Superadmin System Health Dashboard.

Endpoints (require_superadmin):
  GET  /api/superadmin/health/overview   — dashboard aggregate (uptime, probes, crons, alerts, services)
  GET  /api/superadmin/health/crons      — list cron heartbeats
  GET  /api/superadmin/health/alerts     — list system alerts (filter status/severity)
  POST /api/superadmin/health/alerts/{id}/resolve — mark alert resolved
  POST /api/superadmin/health/alerts/test         — insert test alert

Background job: `health_critical_check` runs every 5 min (registered in startup),
detects stale crons or fail spikes, opens system_alert(critical), emails ADMIN_EMAIL
via Resend with throttle 1/hour per source.
"""
from __future__ import annotations

import logging
import os
import re
import secrets
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, HTTPException, Request, Query

from cron_heartbeat import (
    SCHEDULE_LABELS,
    is_stale,
)

log = logging.getLogger("dmx.routes_superadmin_health")

router = APIRouter(tags=["superadmin_health"])
PREFIX = "/api/superadmin/health"

ETL_JOB_IDS = [
    "ie_daily_score_recompute",
    "drive_watcher",
    "health_score_snapshots",
    "weekly_brief_generation",
]
SERVICE_NAMES = ["backend_api", "mongodb", "apscheduler", "resend",
                 "claude_haiku", "claude_sonnet"]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(v) -> Optional[str]:
    if isinstance(v, datetime):
        return v.isoformat()
    return v


def _db(request: Request):
    return request.app.state.db


async def _require_superadmin(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    if user.role != "superadmin":
        raise HTTPException(403, "Solo superadmin")
    return user


# ─── Service health checks ────────────────────────────────────────────────────

async def _check_services(db) -> List[Dict[str, Any]]:
    services = []
    now_iso = _now().isoformat()

    # backend_api: always reachable since we are processing this request
    services.append({"name": "backend_api", "status": "ok", "last_check_at": now_iso})

    # mongodb
    try:
        await db.command("ping")
        services.append({"name": "mongodb", "status": "ok", "last_check_at": now_iso})
    except Exception as e:
        services.append({"name": "mongodb", "status": "fail",
                         "last_check_at": now_iso, "error": str(e)[:200]})

    # apscheduler — running if at least one heartbeat fresh (<2h) OR scheduler instance present
    try:
        recent = await db.cron_heartbeats.find_one(
            {"last_run_at": {"$gte": (_now() - timedelta(hours=2)).isoformat()}},
            {"_id": 0, "job_id": 1, "last_run_at": 1},
            sort=[("last_run_at", -1)],
        )
        sched_status = "ok" if recent else "stale"
        services.append({"name": "apscheduler", "status": sched_status,
                         "last_check_at": (recent or {}).get("last_run_at") or now_iso})
    except Exception:
        services.append({"name": "apscheduler", "status": "fail", "last_check_at": now_iso})

    # resend
    services.append({
        "name": "resend",
        "status": "ok" if os.environ.get("RESEND_API_KEY") else "stale",
        "last_check_at": now_iso,
    })

    # claude_haiku / claude_sonnet — emergent llm key presence + recent successful ai_usage
    has_emergent = bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_API_KEY"))
    for model_name, label in [("haiku", "claude_haiku"), ("sonnet", "claude_sonnet")]:
        recent_ok = None
        model_regex = re.escape((model_name or "").strip()[:128])
        try:
            recent_ok = await db.ai_usage.find_one(
                {"model": {"$regex": model_regex, "$options": "i"},
                 "ts": {"$gte": (_now() - timedelta(hours=24)).isoformat()}},
                {"_id": 0, "ts": 1},
                sort=[("ts", -1)],
            )
        except Exception:
            pass
        if recent_ok:
            services.append({"name": label, "status": "ok",
                             "last_check_at": recent_ok.get("ts")})
        else:
            services.append({"name": label,
                             "status": "ok" if has_emergent else "stale",
                             "last_check_at": now_iso})

    return services


# ─── 1) GET overview ──────────────────────────────────────────────────────────

@router.get(PREFIX + "/overview")
async def get_overview(request: Request):
    await _require_superadmin(request)
    db = _db(request)

    # uptime_24h_pct — best-effort: compute from observability_events availability or default 99
    uptime_24h_pct = 99.0
    try:
        cutoff = _now() - timedelta(hours=24)
        total = await db.observability_events.count_documents(
            {"ts": {"$gte": cutoff.isoformat()}, "event_type": "probe_run"},
        )
        fails = await db.observability_events.count_documents(
            {"ts": {"$gte": cutoff.isoformat()}, "event_type": "probe_run",
             "context.status": "fail"},
        )
        if total > 0:
            uptime_24h_pct = round(((total - fails) / total) * 100, 1)
    except Exception:
        pass

    # probe_pass_rate_7d — use diagnostic system_map last 7d aggregate
    probe_pass_rate_7d = 99.0
    try:
        cutoff = _now() - timedelta(days=7)
        total = await db.diagnostic_probe_runs.count_documents(
            {"ts": {"$gte": cutoff.isoformat()}},
        )
        passes = await db.diagnostic_probe_runs.count_documents(
            {"ts": {"$gte": cutoff.isoformat()}, "status": {"$in": ["pass", "ok"]}},
        )
        if total > 0:
            probe_pass_rate_7d = round((passes / total) * 100, 1)
    except Exception:
        pass

    # ETL status — worst across ETL_JOB_IDS
    etl_last_run_at = None
    etl_status = "ok"
    for jid in ETL_JOB_IDS:
        try:
            hb = await db.cron_heartbeats.find_one({"job_id": jid}, {"_id": 0})
        except Exception:
            hb = None
        if not hb:
            etl_status = "stale"
            continue
        if is_stale(hb):
            etl_status = "stale"
        elif hb.get("last_status") == "fail" and etl_status != "stale":
            etl_status = "fail"
        last = hb.get("last_run_at")
        if last and (etl_last_run_at is None or last > etl_last_run_at):
            etl_last_run_at = last

    # Crons summary
    crons_total = 0
    crons_failing = 0
    try:
        crons_total = await db.cron_heartbeats.count_documents({})
        async for hb in db.cron_heartbeats.find({}, {"_id": 0, "job_id": 1, "last_status": 1, "last_run_at": 1, "fail_count_24h": 1}):
            if hb.get("last_status") == "fail" or is_stale(hb) or (hb.get("fail_count_24h") or 0) >= 3:
                crons_failing += 1
    except Exception:
        pass

    # Alerts open counters
    try:
        alerts_open_critical = await db.system_alerts.count_documents(
            {"resolved_at": None, "severity": "critical"},
        )
        alerts_open_warning = await db.system_alerts.count_documents(
            {"resolved_at": None, "severity": "warning"},
        )
        last_critical = await db.system_alerts.find_one(
            {"severity": "critical"},
            {"_id": 0, "id": 1, "source": 1, "message": 1, "ts": 1, "resolved_at": 1},
            sort=[("ts", -1)],
        )
    except Exception:
        alerts_open_critical = alerts_open_warning = 0
        last_critical = None

    services = await _check_services(db)

    return {
        "uptime_24h_pct": uptime_24h_pct,
        "probe_pass_rate_7d": probe_pass_rate_7d,
        "etl_last_run_at": etl_last_run_at,
        "etl_status": etl_status,
        "crons_total": crons_total,
        "crons_failing": crons_failing,
        "alerts_open_critical": alerts_open_critical,
        "alerts_open_warning": alerts_open_warning,
        "last_critical_alert": last_critical,
        "services": services,
        "ts": _now().isoformat(),
    }


# ─── 2) GET crons ─────────────────────────────────────────────────────────────

@router.get(PREFIX + "/crons")
async def list_crons(request: Request):
    await _require_superadmin(request)
    db = _db(request)
    items = []
    async for hb in db.cron_heartbeats.find({}, {"_id": 0}).sort("job_id", 1):
        stale = is_stale(hb)
        items.append({
            **hb,
            "schedule_expr": hb.get("schedule_expr") or SCHEDULE_LABELS.get(hb.get("job_id", ""), ""),
            "stale": stale,
            "computed_status": "stale" if stale else hb.get("last_status") or "ok",
        })
    # Also include job_ids that have no heartbeat yet (display as "pending")
    seen = {it["job_id"] for it in items}
    for jid, label in SCHEDULE_LABELS.items():
        if jid in seen:
            continue
        items.append({
            "job_id": jid,
            "schedule_expr": label,
            "last_run_at": None,
            "last_status": None,
            "last_duration_ms": 0,
            "run_count_24h": 0,
            "fail_count_24h": 0,
            "stale": True,
            "computed_status": "pending",
        })
    return {"items": sorted(items, key=lambda x: x["job_id"]), "total": len(items)}


# ─── 3) GET alerts ────────────────────────────────────────────────────────────

@router.get(PREFIX + "/alerts")
async def list_alerts(
    request: Request,
    status: Literal["open", "resolved", "all"] = Query("open"),
    severity: Optional[Literal["critical", "warning", "info"]] = None,
    limit: int = Query(50, ge=1, le=200),
    skip: int = Query(0, ge=0),
):
    await _require_superadmin(request)
    db = _db(request)
    q: Dict[str, Any] = {}
    if status == "open":
        q["resolved_at"] = None
    elif status == "resolved":
        q["resolved_at"] = {"$ne": None}
    if severity:
        q["severity"] = severity

    cursor = db.system_alerts.find(q, {"_id": 0}).sort("ts", -1).skip(skip).limit(limit)
    items = [a async for a in cursor]
    total = await db.system_alerts.count_documents(q)
    return {"items": items, "total": total, "skip": skip, "limit": limit}


# ─── 4) POST resolve ──────────────────────────────────────────────────────────

@router.post(PREFIX + "/alerts/{alert_id}/resolve")
async def resolve_alert(alert_id: str, request: Request):
    user = await _require_superadmin(request)
    db = _db(request)

    existing = await db.system_alerts.find_one({"id": alert_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Alerta no encontrada")
    if existing.get("resolved_at"):
        # Idempotent
        return {"ok": True, "already_resolved": True}

    now = _now().isoformat()
    await db.system_alerts.update_one(
        {"id": alert_id},
        {"$set": {"resolved_at": now, "resolved_by": user.user_id}},
    )
    try:
        await db.audit_log.insert_one({
            "action": "alert_resolved",
            "ts": now,
            "actor": {"user_id": user.user_id, "role": "superadmin"},
            "entity_type": "system_alert",
            "entity_id": alert_id,
            "before": {"resolved_at": None},
            "after": {"resolved_at": now},
        })
    except Exception:
        pass
    return {"ok": True, "resolved_at": now}


# ─── 5) POST test alert ───────────────────────────────────────────────────────

@router.post(PREFIX + "/alerts/test")
async def trigger_test_alert(request: Request):
    user = await _require_superadmin(request)
    db = _db(request)
    alert = {
        "id": secrets.token_urlsafe(10),
        "severity": "info",
        "source": "founder_test",
        "message": "Alerta de prueba generada manualmente.",
        "ts": _now().isoformat(),
        "resolved_at": None,
        "metadata": {"triggered_by": user.user_id},
    }
    await db.system_alerts.insert_one(dict(alert))
    alert.pop("_id", None)
    try:
        await db.audit_log.insert_one({
            "action": "alert_test_triggered",
            "ts": alert["ts"],
            "actor": {"user_id": user.user_id, "role": "superadmin"},
            "entity_type": "system_alert",
            "entity_id": alert["id"],
        })
    except Exception:
        pass
    return alert


# ─── Critical check engine (background job) ───────────────────────────────────

ADMIN_EMAIL_ENV = "ADMIN_EMAIL"
RESEND_API_KEY_ENV = "RESEND_API_KEY"


async def _send_critical_email(source: str, message: str) -> bool:
    admin = os.environ.get(ADMIN_EMAIL_ENV)
    key = os.environ.get(RESEND_API_KEY_ENV)
    if not admin or not key:
        log.info(f"[health-critical] skip email (admin={bool(admin)}, key={bool(key)})")
        return False
    try:
        import resend  # type: ignore
        resend.api_key = key
        resend.Emails.send({
            "from": "DMX Platform <noreply@desarrollosmx.io>",
            "to": admin,
            "subject": f"[DMX CRITICAL] {source} down",
            "html": (
                f"<div style='font-family:Outfit,sans-serif;background:#06080F;color:#F0EBE0;padding:32px'>"
                f"<h2 style='color:#EC4899;margin:0 0 12px'>Alerta crítica</h2>"
                f"<p style='font-size:14px;margin:0 0 8px'><strong>Fuente:</strong> {source}</p>"
                f"<p style='font-size:14px;margin:0 0 16px'><strong>Mensaje:</strong> {message}</p>"
                f"<p style='font-size:12px;color:#8F897A;margin:24px 0 0'>"
                f"DMX System Health · {_now().isoformat()}</p></div>"
            ),
        })
        return True
    except Exception as e:
        log.warning(f"[health-critical] resend failed: {e}")
        return False


async def health_critical_check(db) -> None:
    """Scan cron heartbeats for stale or failing jobs; open critical alerts + email founder."""
    now = _now()
    # Aggregate problematic jobs
    problems: List[Dict[str, Any]] = []
    async for hb in db.cron_heartbeats.find({}, {"_id": 0}):
        job_id = hb.get("job_id", "")
        is_st = is_stale(hb)
        fail_spike = (hb.get("fail_count_24h") or 0) >= 3
        if is_st or fail_spike:
            reason = "stale" if is_st else "fail_spike"
            problems.append({"job_id": job_id, "reason": reason,
                             "last_run_at": hb.get("last_run_at"),
                             "fail_count_24h": hb.get("fail_count_24h", 0)})

    for p in problems:
        source = f"cron:{p['job_id']}"
        # Already an open alert for this source?
        existing = await db.system_alerts.find_one(
            {"source": source, "resolved_at": None}, {"_id": 0, "id": 1, "ts": 1},
        )
        if existing:
            continue

        message = (
            f"Cron {p['job_id']} marcado como '{p['reason']}'. "
            f"Última ejecución: {p['last_run_at'] or 'nunca'}. "
            f"Fails 24h: {p['fail_count_24h']}."
        )
        alert = {
            "id": secrets.token_urlsafe(10),
            "severity": "critical",
            "source": source,
            "message": message,
            "ts": now.isoformat(),
            "resolved_at": None,
            "metadata": p,
        }
        await db.system_alerts.insert_one(dict(alert))

        # Email throttle: 1 per source per hour
        try:
            recent_email = await db.system_alerts.find_one(
                {"source": source,
                 "metadata.email_sent_at": {"$gte": (now - timedelta(hours=1)).isoformat()}},
                {"_id": 0},
            )
        except Exception:
            recent_email = None
        if not recent_email:
            sent = await _send_critical_email(source, message)
            if sent:
                await db.system_alerts.update_one(
                    {"id": alert["id"]},
                    {"$set": {"metadata.email_sent_at": now.isoformat()}},
                )


def schedule_health_critical_check(scheduler, db) -> None:
    """Register the 5-min critical check in APScheduler."""
    try:
        from apscheduler.triggers.interval import IntervalTrigger
        from cron_heartbeat import wrap_apscheduler_job
        scheduler.add_job(
            wrap_apscheduler_job(health_critical_check, "health_critical_check"),
            IntervalTrigger(minutes=5),
            args=[db],
            id="health_critical_check",
            replace_existing=True,
            misfire_grace_time=120,
        )
    except Exception as e:
        log.warning(f"[health-critical] schedule failed: {e}")
