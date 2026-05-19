"""W5.20 — External Insights Cron jobs.

2 jobs:
  1. external_insights_weekly_cron @ Sunday 03:00 UTC · fetch_all_sources (12 connectors)
  2. macro_alert_check_cron        @ Daily 07:00 UTC · detect significant changes per source

Macro alert thresholds (configurable):
  - BIS · OECD · INEGI: ±2% MoM index → alert
  - FRED Case-Shiller: ±3% MoM      → alert
  - BMV FIBRAs:        ±5% daily    → alert

Notifications:
  - NOTIF_TYPE macro_alert sent to founder + CHURN_SALES_USER_IDS env (reuse W5.FF4 pattern)
  - Email digest summary
  - Idempotency hash sha256(source_id+date+direction) TTL 7d
"""
from __future__ import annotations

import hashlib
import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from apscheduler.triggers.cron import CronTrigger

log = logging.getLogger("dmx.external_insights_cron")

IDEM_TTL_DAYS = 7
THRESHOLDS = {
    "bis_property_prices": 2.0,    # ±2% MoM
    "oecd_housing": 2.0,
    "inegi_vivienda": 2.0,
    "fred_us_housing": 3.0,
    "bmv_fibras": 5.0,             # ±5% daily
}

FOUNDER_EMAIL = os.environ.get("FOUNDER_ALERT_EMAIL", "founder@desarrollosmx.io")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _today_iso() -> str:
    return _now().date().isoformat()


def _idem_hash(source_id: str, date_iso: str, direction: str) -> str:
    raw = f"macro_alert:{source_id}:{date_iso}:{direction}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


async def _idem_exists(db, idem: str) -> bool:
    try:
        doc = await db.macro_alert_sent.find_one({"hash": idem}, {"_id": 0, "hash": 1})
        return doc is not None
    except Exception:
        return False


async def _idem_register(db, idem: str, source_id: str, direction: str, value: float) -> None:
    try:
        await db.macro_alert_sent.insert_one({
            "hash": idem,
            "source_id": source_id,
            "direction": direction,
            "value": value,
            "created_at": _now().isoformat(),
            "expire_at": _now() + timedelta(days=IDEM_TTL_DAYS),
        })
    except Exception:
        pass


# ─── Weekly cron · refetch all 12 sources ────────────────────────────────────
async def _weekly_fetch_job(db) -> Dict[str, Any]:
    from external_insights_engine import (
        ensure_external_insights_indexes,
        fetch_all_sources,
        ALL_SOURCES,
    )
    from audit_immutable_engine import log as audit_log

    start = _now()
    await ensure_external_insights_indexes(db)

    results = await fetch_all_sources(db)
    ok_count = sum(1 for r in results.values() if (r or {}).get("status") == "ok")
    error_count = sum(1 for r in results.values() if (r or {}).get("status") == "error")
    skipped_count = sum(1 for r in results.values() if (r or {}).get("status") == "skipped")
    duration_s = (_now() - start).total_seconds()

    summary = {
        "total": len(ALL_SOURCES),
        "ok": ok_count,
        "error": error_count,
        "skipped": skipped_count,
        "duration_s": round(duration_s, 2),
    }

    try:
        await audit_log(
            db,
            actor={"user_id": "system", "role": "system"},
            action="external_insights_cron_run",
            entity_type="external_insights_cron",
            entity_id=f"weekly_{_today_iso()}",
            before=None,
            after=summary,
        )
    except Exception:
        pass

    log.info(f"[external_insights_weekly] {summary}")
    return summary


# ─── Macro alert daily cron ──────────────────────────────────────────────────
def _extract_latest_numeric(source_id: str, payload: Any) -> Optional[float]:
    """Best-effort: pull the latest numeric value from a payload shape.

    Each source has its own structure · we try common patterns. Returns None
    if we can't safely extract a single recent value (alert just skipped).
    """
    if payload is None:
        return None
    try:
        if source_id == "fred_us_housing":
            obs = (payload or {}).get("observations") or []
            for row in obs:
                v = row.get("value")
                try:
                    return float(v)
                except (TypeError, ValueError):
                    continue
        if source_id == "worldbank_doing_business":
            # payload is [meta, [rows...]]
            if isinstance(payload, list) and len(payload) >= 2 and isinstance(payload[1], list):
                for row in payload[1]:
                    if isinstance(row, dict) and row.get("value") is not None:
                        return float(row["value"])
        # Generic dict with 'value' or 'series' fields
        if isinstance(payload, dict):
            for k in ("value", "latest", "current"):
                v = payload.get(k)
                if v is not None:
                    try:
                        return float(v)
                    except (TypeError, ValueError):
                        pass
    except Exception:
        return None
    return None


async def _detect_macro_alerts(db) -> List[Dict[str, Any]]:
    """Compare current cached value vs previous tracked value in macro_alert_history."""
    alerts: List[Dict[str, Any]] = []
    try:
        for source_id, threshold_pct in THRESHOLDS.items():
            doc = await db.external_insights_cache.find_one(
                {"source_id": source_id}, {"_id": 0, "payload": 1, "status": 1}
            )
            if not doc or doc.get("status") != "ok":
                continue
            current = _extract_latest_numeric(source_id, doc.get("payload"))
            if current is None:
                continue

            prev_doc = await db.macro_alert_history.find_one(
                {"source_id": source_id}, {"_id": 0, "value": 1, "recorded_at": 1}
            )
            prev_value = (prev_doc or {}).get("value")
            try:
                if prev_value is not None and float(prev_value) != 0:
                    delta_pct = (current - float(prev_value)) / abs(float(prev_value)) * 100.0
                    if abs(delta_pct) >= threshold_pct:
                        alerts.append({
                            "source_id": source_id,
                            "current": current,
                            "previous": float(prev_value),
                            "delta_pct": round(delta_pct, 2),
                            "direction": "up" if delta_pct > 0 else "down",
                            "threshold_pct": threshold_pct,
                        })
            except Exception:
                pass

            # Update history record (always · regardless of alert)
            try:
                await db.macro_alert_history.update_one(
                    {"source_id": source_id},
                    {"$set": {
                        "source_id": source_id,
                        "value": current,
                        "recorded_at": _now().isoformat(),
                    }},
                    upsert=True,
                )
            except Exception:
                pass
    except Exception as exc:
        log.warning(f"[macro_alert] detect failed: {exc}")
    return alerts


async def _notify_superadmins(db, alerts: List[Dict[str, Any]]) -> int:
    if not alerts:
        return 0
    from notifications_engine import emit_notification

    # Collect superadmin user_ids + churn-sales list (reuse W5.FF4 env pattern)
    target_ids: List[str] = []
    try:
        cursor = db.users.find({"role": "superadmin"}, {"_id": 0, "user_id": 1})
        async for u in cursor:
            uid = u.get("user_id") or ""
            if uid:
                target_ids.append(uid)
    except Exception as exc:
        log.warning(f"[macro_alert] superadmin query failed: {exc}")

    churn_csv = os.environ.get("CHURN_SALES_USER_IDS", "").strip()
    if churn_csv:
        for uid in churn_csv.split(","):
            uid = uid.strip()
            if uid and uid not in target_ids:
                target_ids.append(uid)

    title = f"Macro alert · {len(alerts)} indicador(es) cruzaron umbral"
    summary = " · ".join(
        f"{a['source_id']} {a['direction']} {a['delta_pct']:+.1f}%"
        for a in alerts[:4]
    )
    body = (
        f"Detectamos {len(alerts)} indicadores macro que cruzaron umbrales: {summary}. "
        "Revisa el dashboard /superadmin/insights/cron-status."
    )

    notified = 0
    for uid in target_ids:
        try:
            await emit_notification(
                db,
                user_id=uid,
                type="macro_alert",
                severity="high",
                title=title,
                body=body,
                payload={"alerts": alerts},
                action_url="/superadmin/insights/cron-status",
                channels=["in_app", "email"],
            )
            notified += 1
        except Exception as exc:
            log.warning(f"[macro_alert] emit failed user={uid}: {exc}")
    return notified


async def _macro_alert_job(db) -> Dict[str, Any]:
    from audit_immutable_engine import log as audit_log

    start = _now()
    date_iso = _today_iso()
    alerts = await _detect_macro_alerts(db)

    # Filter by idempotency hash · skip already-notified today
    final_alerts: List[Dict[str, Any]] = []
    for a in alerts:
        idem = _idem_hash(a["source_id"], date_iso, a["direction"])
        if await _idem_exists(db, idem):
            continue
        final_alerts.append(a)
        await _idem_register(db, idem, a["source_id"], a["direction"], a.get("current") or 0.0)

    notified = await _notify_superadmins(db, final_alerts)

    summary = {
        "alerts_detected": len(alerts),
        "alerts_new": len(final_alerts),
        "users_notified": notified,
        "duration_s": round((_now() - start).total_seconds(), 2),
    }

    try:
        await audit_log(
            db,
            actor={"user_id": "system", "role": "system"},
            action="macro_alert_cron_run",
            entity_type="macro_alert_cron",
            entity_id=f"daily_{date_iso}",
            before=None,
            after=summary,
        )
    except Exception:
        pass

    log.info(f"[macro_alert] {summary}")
    return summary


def register_external_insights_jobs(scheduler, db) -> None:
    """Register weekly fetch + daily macro alert jobs."""
    scheduler.add_job(
        _weekly_fetch_job,
        CronTrigger(day_of_week="sun", hour=3, minute=0, timezone="UTC"),
        id="external_insights_weekly_cron",
        replace_existing=True,
        max_instances=1,
        kwargs={"db": db},
    )
    scheduler.add_job(
        _macro_alert_job,
        CronTrigger(hour=7, minute=0, timezone="UTC"),
        id="macro_alert_check_cron",
        replace_existing=True,
        max_instances=1,
        kwargs={"db": db},
    )
    log.info(
        "[external_insights_cron] Jobs registrados: weekly @ dom 03:00 UTC · "
        "macro_alert @ daily 07:00 UTC"
    )
