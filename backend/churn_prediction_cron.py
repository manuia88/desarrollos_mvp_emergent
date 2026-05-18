"""W5.FF4 Sub-D — Churn Prediction Cron (daily 04:00 UTC).

Detect cold users (>60 score), emit:
  - churn_risk_alert → sales team (in_app + email)
  - user_re_engagement → user mismo (in_app · suave)

Idempotency: hash(user_id + iso_week) en collection churn_alerts_sent · TTL 30d.
Audit chain action="churn_detection_run" con summary count alerts.
"""
from __future__ import annotations

import hashlib
import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict

from apscheduler.triggers.cron import CronTrigger

from churn_prediction_engine import detect_cold_users

_log = logging.getLogger("dmx.churn_prediction_cron")

NOTIF_TYPE_SALES = "churn_risk_alert"
NOTIF_TYPE_USER = "user_re_engagement"

# Sales team userIds env-config (fallback empty list → no sales emit)
_SALES_USER_IDS = [u.strip() for u in os.environ.get("CHURN_SALES_USER_IDS", "").split(",") if u.strip()]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso_week(d: datetime) -> str:
    y, w, _ = d.isocalendar()
    return f"{y}-W{w:02d}"


def _alert_hash(user_id: str, period: str) -> str:
    return hashlib.sha256(f"{user_id}::{period}".encode()).hexdigest()[:24]


async def _already_alerted(db, user_id: str, period: str) -> bool:
    h = _alert_hash(user_id, period)
    try:
        existing = await db.churn_alerts_sent.find_one({"hash": h}, {"_id": 0})
        return existing is not None
    except Exception:
        return False


async def _mark_alerted(db, user_id: str, period: str, risk: Dict[str, Any]) -> None:
    h = _alert_hash(user_id, period)
    try:
        await db.churn_alerts_sent.update_one(
            {"hash": h},
            {
                "$setOnInsert": {
                    "hash": h,
                    "user_id": user_id,
                    "period": period,
                    "churn_risk_score": risk.get("churn_risk_score"),
                    "features_dropped_count": len(risk.get("features_dropped") or []),
                    "created_at": _now(),
                },
            },
            upsert=True,
        )
    except Exception as exc:
        _log.warning(f"[churn_cron] _mark_alerted failed user={user_id} err={exc}")


async def _emit_alerts(db, risk: Dict[str, Any]) -> Dict[str, int]:
    """Emite alerts a sales (in_app+email) + user (in_app). FAIL-SOFT cada uno."""
    sent = {"sales": 0, "user": 0}
    try:
        from notifications_engine import emit_notification
    except Exception as exc:
        _log.warning(f"[churn_cron] notifications import failed: {exc}")
        return sent

    user_id = risk.get("user_id")
    user_email = risk.get("email") or ""
    user_name = risk.get("name") or user_id
    score = risk.get("churn_risk_score", 0)
    dropped = risk.get("features_dropped") or []
    dropped_keys = ", ".join([d.get("feature_key", "") for d in dropped[:3]]) or "—"

    # Sales team (in_app + email) — only if env-configured
    for sid in _SALES_USER_IDS:
        try:
            await emit_notification(
                db,
                user_id=sid,
                type=NOTIF_TYPE_SALES,
                severity="high" if score >= 80 else "normal",
                title=f"Churn risk · {user_name} ({score}/100)",
                body=(
                    f"{user_email} muestra drop >70% en: {dropped_keys}. "
                    f"Recomendación: {risk.get('recommendation', 'contactar')}."
                ),
                payload={
                    "target_user_id": user_id,
                    "churn_risk_score": score,
                    "features_dropped": [d.get("feature_key") for d in dropped[:10]],
                },
                channels=["in_app", "email"],
            )
            sent["sales"] += 1
        except Exception as exc:
            _log.warning(f"[churn_cron] sales emit failed sid={sid} err={exc}")

    # User mismo (in_app suave)
    if user_id:
        try:
            await emit_notification(
                db,
                user_id=user_id,
                type=NOTIF_TYPE_USER,
                severity="low",
                title="¿Necesitas ayuda con DesarrollosMX?",
                body=(
                    f"Notamos que no has usado {dropped_keys} recientemente. "
                    "¿Quieres una demo o que te ayudemos con onboarding?"
                ),
                payload={"churn_risk_score": score},
                channels=["in_app"],
            )
            sent["user"] += 1
        except Exception as exc:
            _log.warning(f"[churn_cron] user emit failed user={user_id} err={exc}")

    return sent


async def _churn_detection_job(db) -> Dict[str, Any]:
    start = _now()
    period = _iso_week(start)
    cold = await detect_cold_users(db)

    alerts_sent_count = 0
    skipped_dup = 0
    for risk in cold:
        uid = risk.get("user_id")
        if not uid:
            continue
        if await _already_alerted(db, uid, period):
            skipped_dup += 1
            continue
        sent = await _emit_alerts(db, risk)
        if sent["sales"] > 0 or sent["user"] > 0:
            alerts_sent_count += 1
            await _mark_alerted(db, uid, period, risk)

    # Index ensure (idempotent)
    try:
        await db.churn_alerts_sent.create_index("hash", unique=True, background=True)
        await db.churn_alerts_sent.create_index(
            "created_at", expireAfterSeconds=30 * 24 * 3600, background=True,
        )
    except Exception as exc:
        _log.warning(f"[churn_cron] index ensure non-fatal: {exc}")

    duration_s = (_now() - start).total_seconds()
    summary = {
        "period": period,
        "cold_users_detected": len(cold),
        "alerts_emitted": alerts_sent_count,
        "skipped_duplicate": skipped_dup,
        "duration_s": round(duration_s, 2),
    }
    _log.info(f"[churn_cron] {summary}")

    # Audit
    try:
        from audit_immutable_engine import log as audit_log
        await audit_log(
            db,
            actor={"user_id": "system", "role": "system"},
            action="churn_detection_run",
            entity_type="churn_detection",
            entity_id=f"cron_{int(start.timestamp())}",
            before=None,
            after=summary,
        )
    except Exception as exc:
        _log.warning(f"[churn_cron] audit failed: {exc}")

    return summary


def register_churn_jobs(scheduler, db) -> None:
    if scheduler is None:
        _log.warning("[churn_cron] scheduler is None · skip register")
        return
    scheduler.add_job(
        _churn_detection_job,
        trigger=CronTrigger(hour=4, minute=0, timezone="UTC"),
        id="churn_detection_cron",
        kwargs={"db": db},
        replace_existing=True,
        max_instances=1,
    )
    _log.info("[churn_cron] 1 cron registered (daily 04:00 UTC)")
