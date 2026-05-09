"""W2.4 SA5 — Trial expiry cron.

Daily 8am MX:
  - For features with `expires_at` in (now, now+7d]: send "trial expira en N días" email at thresholds 7/3/1
  - For features with `expires_at <= now` and `enabled=True`: set `enabled=false` + email "trial expirado"
Throttle: store last_alert_at per (tenant, feature_key, threshold_days) in `db.trial_alerts_sent`.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Any, Dict

import httpx

log = logging.getLogger("dmx.trial_expiry_cron")

THRESHOLD_DAYS = (7, 3, 1)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_iso(s: Any) -> datetime:
    if isinstance(s, datetime):
        return s if s.tzinfo else s.replace(tzinfo=timezone.utc)
    return datetime.fromisoformat(str(s).replace("Z", "+00:00"))


async def _send_resend_email(to_email: str, subject: str, text: str) -> bool:
    api_key = os.environ.get("RESEND_API_KEY")
    if not api_key:
        log.info(f"[trial_cron] (no RESEND_API_KEY) would email {to_email}: {subject}")
        return False
    body = {
        "from": "DMX Platform <no-reply@desarrollosmx.io>",
        "to": [to_email],
        "subject": subject,
        "text": text,
    }
    try:
        async with httpx.AsyncClient(timeout=10) as cli:
            r = await cli.post("https://api.resend.com/emails",
                               headers={"Authorization": f"Bearer {api_key}"},
                               json=body)
        return r.status_code == 200
    except Exception as e:
        log.warning(f"[trial_cron] email send failed: {e}")
        return False


async def _resolve_admin_email(db, tenant_id: str) -> str:
    try:
        org = await db.developer_organizations.find_one(
            {"id": tenant_id}, {"_id": 0, "admin_email": 1, "contact_email": 1, "name": 1},
        )
        if org and (org.get("admin_email") or org.get("contact_email")):
            return org.get("admin_email") or org.get("contact_email")
    except Exception:
        pass
    return os.environ.get("ALERT_EMAIL", "admin@desarrollosmx.io")


async def _was_alerted_today(db, tenant_id: str, feature_key: str, threshold_days: int) -> bool:
    cutoff = _now() - timedelta(hours=23)
    doc = await db.trial_alerts_sent.find_one({
        "tenant_id": tenant_id, "feature_key": feature_key,
        "threshold_days": threshold_days,
        "sent_at": {"$gte": cutoff.isoformat()},
    })
    return bool(doc)


async def _record_alert(db, tenant_id: str, feature_key: str, threshold_days: int) -> None:
    try:
        await db.trial_alerts_sent.insert_one({
            "tenant_id": tenant_id, "feature_key": feature_key,
            "threshold_days": threshold_days, "sent_at": _now().isoformat(),
        })
    except Exception as e:
        log.warning(f"[trial_cron] record_alert failed: {e}")


async def run_trial_expiry_check(db) -> Dict[str, Any]:
    """Main entry — usable as cron job and manual run."""
    summary: Dict[str, Any] = {
        "alerts_sent": 0, "expired_revoked": 0, "errors": [],
        "checked_at": _now().isoformat(),
    }
    now = _now()
    horizon = (now + timedelta(days=max(THRESHOLD_DAYS) + 1)).isoformat()

    cursor = db.tenant_features.find(
        {"enabled": True, "expires_at": {"$exists": True, "$ne": None, "$lt": horizon}},
        {"_id": 0},
    )
    async for tf in cursor:
        try:
            exp_dt = _parse_iso(tf["expires_at"])
        except Exception as e:
            summary["errors"].append(f"{tf.get('id')}: bad expires_at: {e}")
            continue
        delta_sec = (exp_dt - now).total_seconds()
        delta_days = delta_sec / 86400.0
        feat_key = tf.get("feature_key")
        tenant_id = tf.get("tenant_id")

        # Expired → revoke
        if delta_sec <= 0:
            try:
                await db.tenant_features.update_one(
                    {"tenant_id": tenant_id, "feature_key": feat_key},
                    {"$set": {"enabled": False, "expired_at": _iso_now(),
                              "expired_reason": "trial_expired"}},
                )
                summary["expired_revoked"] += 1
                # Email revocation
                if not await _was_alerted_today(db, tenant_id, feat_key, 0):
                    to_email = await _resolve_admin_email(db, tenant_id)
                    sent = await _send_resend_email(
                        to_email,
                        f"[DMX] Trial expirado: {feat_key}",
                        f"El trial del feature '{feat_key}' para tu cuenta ({tenant_id}) ha "
                        f"expirado y fue desactivado automáticamente.\n\n"
                        f"Para recuperar acceso, contrata el plan correspondiente desde el "
                        f"panel de configuración.",
                    )
                    if sent or True:  # record even if email skipped (no key)
                        await _record_alert(db, tenant_id, feat_key, 0)
                # Audit
                try:
                    from audit_log import log_mutation
                    fake_user = type("U", (), {"user_id": "system_trial_cron",
                                                "role": "superadmin", "tenant_id": None,
                                                "name": "Trial Cron"})()
                    await log_mutation(db, fake_user, "trial_expired",
                                       "tenant_feature", f"{tenant_id}:{feat_key}",
                                       before={"enabled": True}, after={"enabled": False})
                except Exception:
                    pass
            except Exception as e:
                summary["errors"].append(f"revoke {tenant_id}:{feat_key}: {e}")
            continue

        # Threshold alerts
        for thr in THRESHOLD_DAYS:
            # Trigger when delta_days is in (thr-1, thr]
            if (thr - 1) < delta_days <= thr:
                if await _was_alerted_today(db, tenant_id, feat_key, thr):
                    break
                to_email = await _resolve_admin_email(db, tenant_id)
                await _send_resend_email(
                    to_email,
                    f"[DMX] Trial expira en {thr} {'día' if thr == 1 else 'días'}: {feat_key}",
                    f"El trial del feature '{feat_key}' expira en aproximadamente {thr} "
                    f"{'día' if thr == 1 else 'días'}.\n\n"
                    f"Tenant: {tenant_id}\n"
                    f"Fecha exacta: {tf.get('expires_at')}\n\n"
                    f"Contrata antes de la expiración para mantener el acceso.",
                )
                await _record_alert(db, tenant_id, feat_key, thr)
                summary["alerts_sent"] += 1
                break  # only one threshold per run
    return summary


def _iso_now() -> str:
    return _now().isoformat()


def schedule_trial_expiry_cron(scheduler, db) -> None:
    try:
        from cron_heartbeat import wrap_apscheduler_job
        from apscheduler.triggers.cron import CronTrigger
        scheduler.add_job(
            wrap_apscheduler_job(run_trial_expiry_check, "trial_expiry_check"),
            CronTrigger(hour=8, minute=0, timezone="America/Mexico_City"),
            args=[db], id="trial_expiry_check",
            replace_existing=True, misfire_grace_time=600,
        )
    except Exception as e:
        log.warning(f"[trial_cron] schedule failed: {e}")


async def ensure_trial_alerts_indexes(db) -> None:
    try:
        await db.trial_alerts_sent.create_index(
            [("tenant_id", 1), ("feature_key", 1), ("threshold_days", 1), ("sent_at", -1)],
            background=True,
        )
        await db.trial_alerts_sent.create_index(
            [("sent_at", 1)], background=True,
            expireAfterSeconds=60 * 60 * 24 * 30,  # auto-prune 30d
        )
    except Exception as e:
        log.warning(f"[trial_cron] indexes: {e}")
