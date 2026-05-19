"""W5.25 — Widget Embed Daily Digest Cron.

1 job:
  widget_embed_digest_cron @ daily 09:00 UTC — emit notification to superadmin users
  with the list of new domains seen in the last 24h.

Idempotency: collection widget_embed_digest_sent (TTL 7d) hash sha256(ISO_date).
"""
from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List

from apscheduler.triggers.cron import CronTrigger

log = logging.getLogger("dmx.widget_embed_cron")

DIGEST_TTL_DAYS = 7


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _today_iso() -> str:
    return _now().date().isoformat()


def _idem_hash(date_iso: str) -> str:
    return hashlib.sha256(f"widget_embed_digest:{date_iso}".encode("utf-8")).hexdigest()


async def _digest_sent_exists(db, idem: str) -> bool:
    try:
        doc = await db.widget_embed_digest_sent.find_one({"hash": idem}, {"_id": 0, "hash": 1})
        return doc is not None
    except Exception:
        return False


async def _register_digest_sent(db, idem: str, date_iso: str, count: int) -> None:
    try:
        await db.widget_embed_digest_sent.insert_one({
            "hash": idem,
            "date_iso": date_iso,
            "count": count,
            "created_at": _now().isoformat(),
            "expire_at": _now() + timedelta(days=DIGEST_TTL_DAYS),
        })
    except Exception:
        pass


def _build_email_body(domains: List[Dict[str, Any]]) -> str:
    rows_html = []
    for d in domains[:50]:
        rows_html.append(
            f"<tr>"
            f"<td style='padding:6px 10px;border-bottom:1px solid rgba(0,0,0,0.06)'>{d.get('hostname','')}</td>"
            f"<td style='padding:6px 10px;border-bottom:1px solid rgba(0,0,0,0.06)'>{d.get('widget_type','')}</td>"
            f"<td style='padding:6px 10px;border-bottom:1px solid rgba(0,0,0,0.06)'>{d.get('first_seen_at','')}</td>"
            f"</tr>"
        )
    return (
        f"<table style='border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:13px'>"
        f"<thead><tr>"
        f"<th style='text-align:left;padding:6px 10px;border-bottom:2px solid rgba(0,0,0,0.18)'>Hostname</th>"
        f"<th style='text-align:left;padding:6px 10px;border-bottom:2px solid rgba(0,0,0,0.18)'>Widget</th>"
        f"<th style='text-align:left;padding:6px 10px;border-bottom:2px solid rgba(0,0,0,0.18)'>First seen</th>"
        f"</tr></thead><tbody>" + "".join(rows_html) + "</tbody></table>"
    )


async def _widget_embed_digest_job(db) -> Dict[str, Any]:
    """Daily digest @ 09:00 UTC. Idempotent per date."""
    from widget_embed_analytics import get_new_domains_last_24h
    from notifications_engine import emit_notification
    from audit_immutable_engine import log as audit_log

    date_iso = _today_iso()
    idem = _idem_hash(date_iso)
    if await _digest_sent_exists(db, idem):
        log.info(f"[widget_embed_digest] already sent for {date_iso} · skipping")
        return {"ok": True, "skipped": True, "date_iso": date_iso}

    domains = await get_new_domains_last_24h(db)
    if not domains:
        await _register_digest_sent(db, idem, date_iso, 0)
        return {"ok": True, "domains_count": 0, "users_notified": 0, "date_iso": date_iso}

    # Find superadmin users to notify
    superadmins: List[str] = []
    try:
        cursor = db.users.find({"role": "superadmin"}, {"_id": 0, "user_id": 1})
        async for u in cursor:
            uid = u.get("user_id") or ""
            if uid:
                superadmins.append(uid)
    except Exception as exc:
        log.warning(f"[widget_embed_digest] superadmin query failed: {exc}")

    title = f"DMX · {len(domains)} dominios nuevos embeben widgets"
    body = (
        f"Hoy detectamos {len(domains)} dominios nuevos embebiendo widgets DMX. "
        "Revisa el dashboard de embed analytics para priorizar outreach."
    )

    users_notified = 0
    for uid in superadmins:
        try:
            await emit_notification(
                db,
                user_id=uid,
                type="widget_embed_new_domain",
                severity="normal",
                title=title,
                body=body,
                payload={
                    "date_iso": date_iso,
                    "domains_count": len(domains),
                    "top_domains": [
                        {
                            "hostname": d.get("hostname"),
                            "widget_type": d.get("widget_type"),
                            "first_seen_at": d.get("first_seen_at"),
                        }
                        for d in domains[:10]
                    ],
                },
                action_url="/superadmin/widget-embeds",
                channels=["in_app", "email"],
            )
            users_notified += 1
        except Exception as exc:
            log.warning(f"[widget_embed_digest] emit failed user={uid}: {exc}")

    await _register_digest_sent(db, idem, date_iso, len(domains))

    try:
        await audit_log(
            db,
            actor={"user_id": "system", "role": "system"},
            action="widget_embed_digest",
            entity_type="widget_embed_cron",
            entity_id=f"digest_{date_iso}",
            before=None,
            after={
                "date_iso": date_iso,
                "domains_count": len(domains),
                "users_notified": users_notified,
            },
        )
    except Exception:
        pass

    log.info(
        f"[widget_embed_digest] date={date_iso} domains={len(domains)} notified={users_notified}"
    )
    return {
        "ok": True,
        "date_iso": date_iso,
        "domains_count": len(domains),
        "users_notified": users_notified,
    }


def register_widget_embed_jobs(scheduler, db) -> None:
    """Register the daily digest cron @ 09:00 UTC."""
    scheduler.add_job(
        _widget_embed_digest_job,
        CronTrigger(hour=9, minute=0, timezone="UTC"),
        id="widget_embed_digest_cron",
        replace_existing=True,
        max_instances=1,
        kwargs={"db": db},
    )
    log.info("[widget_embed_cron] Jobs registrados: digest @ 09:00 UTC daily")
