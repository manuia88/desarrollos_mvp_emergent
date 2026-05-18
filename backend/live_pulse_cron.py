"""W5.5 Parte 1 — Live Pulse Cron (frecuencia configurable via LIVE_PULSE_FREQUENCY).

Jobs registrados:
  - live_pulse_compute_cron: ejecuta compute_pulse para top 50 zonas y dispara alertas.
  - live_pulse_readiness_cron: registra snapshot diario de readiness (05:30 UTC).

Frecuencias soportadas: weekly | biweekly | monthly | daily | hourly | */15min.
Reschedule en caliente via reschedule_live_pulse_cron(scheduler, new_frequency).
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List
from uuid import uuid4

from apscheduler.triggers.cron import CronTrigger

import live_pulse_engine
import live_pulse_readiness

log = logging.getLogger("dmx.live_pulse_cron")

VALID_FREQUENCIES = {"weekly", "biweekly", "monthly", "daily", "hourly", "*/15min"}
COMPUTE_JOB_ID = "live_pulse_compute_cron"
READINESS_JOB_ID = "live_pulse_readiness_cron"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _build_trigger(frequency: str) -> CronTrigger:
    mapping = {
        "weekly":   CronTrigger(day_of_week="mon", hour=6, minute=0, timezone="UTC"),
        "biweekly": CronTrigger(day="1,15", hour=6, minute=0, timezone="UTC"),
        "monthly":  CronTrigger(day=1, hour=6, minute=0, timezone="UTC"),
        "daily":    CronTrigger(hour=6, minute=0, timezone="UTC"),
        "hourly":   CronTrigger(minute=0, timezone="UTC"),
        "*/15min":  CronTrigger(minute="*/15", timezone="UTC"),
    }
    if frequency not in mapping:
        log.warning(f"[LivePulse] frecuencia invalida '{frequency}' · fallback a weekly")
        return mapping["weekly"]
    return mapping[frequency]


def register_live_pulse_jobs(scheduler, db) -> None:
    """Registra ambos jobs (compute + readiness)."""
    if scheduler is None:
        log.warning("[LivePulse] scheduler is None · skip register")
        return
    freq = os.environ.get("LIVE_PULSE_FREQUENCY", "weekly")
    scheduler.add_job(
        _run_live_pulse_compute,
        trigger=_build_trigger(freq),
        id=COMPUTE_JOB_ID,
        kwargs={"db": db},
        replace_existing=True,
        max_instances=1,
    )
    scheduler.add_job(
        live_pulse_readiness.record_readiness_snapshot,
        trigger=CronTrigger(hour=5, minute=30, timezone="UTC"),
        id=READINESS_JOB_ID,
        kwargs={"db": db},
        replace_existing=True,
        max_instances=1,
    )
    log.info(f"[LivePulse] cron registered with frequency={freq}")


def reschedule_live_pulse_cron(scheduler, new_frequency: str) -> None:
    if new_frequency not in VALID_FREQUENCIES:
        raise ValueError(f"frequency invalida: {new_frequency}")
    scheduler.reschedule_job(
        job_id=COMPUTE_JOB_ID,
        trigger=_build_trigger(new_frequency),
    )
    log.info(f"[LivePulse] cron rescheduled to {new_frequency}")


# ─── Compute job ─────────────────────────────────────────────────────────────

async def _top_zones(db, limit: int = 50) -> List[str]:
    cutoff = (_now() - timedelta(days=90)).isoformat()
    pipeline = [
        {"$match": {"created_at": {"$gte": cutoff}, "zone_slug": {"$nin": [None, ""]}}},
        {"$group": {"_id": "$zone_slug", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": limit},
    ]
    try:
        rows = await db.leads.aggregate(pipeline).to_list(limit)
        return [r["_id"] for r in rows if r.get("_id")]
    except Exception as exc:
        log.warning(f"[LivePulse] top_zones failed: {exc}")
        return []


async def _run_live_pulse_compute(db) -> Dict[str, Any]:
    start = _now()
    zone_slugs = await _top_zones(db, limit=50)
    log.info(f"[LivePulse] computing {len(zone_slugs)} zonas")

    sem = asyncio.Semaphore(10)

    async def _bounded(zs: str):
        async with sem:
            try:
                return await live_pulse_engine.compute_pulse(db, zs)
            except Exception as exc:
                log.warning(f"[LivePulse] compute_pulse {zs} failed: {exc}")
                return None

    pulses = await asyncio.gather(*[_bounded(zs) for zs in zone_slugs])
    snapshots = [p for p in pulses if p]

    # Persist en bulk
    if snapshots:
        try:
            docs = [
                {
                    "id": f"pulse_{uuid4().hex[:14]}",
                    "zone_slug": s["zone_slug"],
                    "score": s["score"],
                    "bucket": s.get("bucket"),
                    "signals": s["signals"],
                    "computed_at": s["computed_at"],
                    "stub_flags": s.get("stub_flags") or {},
                }
                for s in snapshots
            ]
            await db.live_pulse_snapshots.insert_many(docs)
        except Exception as exc:
            log.warning(f"[LivePulse] insert_many failed: {exc}")

    # Dispatch alerts
    alerts_sent = 0
    for snap in snapshots:
        if snap["score"] > 80:
            try:
                alerts_sent += await _dispatch_alerts(db, snap)
            except Exception as exc:
                log.warning(f"[LivePulse] dispatch_alerts failed {snap.get('zone_slug')}: {exc}")

    duration_s = (_now() - start).total_seconds()
    # Audit
    try:
        from audit_immutable_engine import log as audit_log
        await audit_log(
            db,
            actor={"user_id": "system", "role": "system"},
            action="live_pulse_cron",
            entity_type="live_pulse",
            entity_id=f"cron_{int(start.timestamp())}",
            before=None,
            after={
                "zones_count": len(snapshots),
                "alerts_dispatched": alerts_sent,
                "duration_s": round(duration_s, 2),
                "frequency": os.environ.get("LIVE_PULSE_FREQUENCY", "weekly"),
            },
        )
    except Exception as exc:
        log.warning(f"[LivePulse] audit log failed: {exc}")

    log.info(
        f"[LivePulse] {len(snapshots)} zonas computed · {alerts_sent} alerts · "
        f"duration_s={round(duration_s, 2)}"
    )
    return {
        "zones_count": len(snapshots),
        "alerts_dispatched": alerts_sent,
        "duration_s": round(duration_s, 2),
    }


async def _dispatch_alerts(db, snapshot: Dict[str, Any]) -> int:
    """Envia notificaciones a suscripciones activas con threshold <= score.
    Idempotente 7d via hash(user_id|zone_slug|iso_week)."""
    iso_week = _now().strftime("%G-W%V")
    cursor = db.live_pulse_subscriptions.find(
        {
            "zone_slug": snapshot["zone_slug"],
            "active": True,
            "threshold_score": {"$lte": snapshot["score"]},
        },
        {"_id": 0},
    )
    subs = [s async for s in cursor]
    if not subs:
        return 0

    try:
        import notifications_engine
    except Exception as exc:
        log.warning(f"[LivePulse] notifications_engine import failed: {exc}")
        return 0

    sent = 0
    for sub in subs:
        uid = sub.get("user_id")
        if not uid:
            continue
        idem_hash = hashlib.sha256(
            f"{uid}_{snapshot['zone_slug']}_{iso_week}".encode("utf-8")
        ).hexdigest()
        try:
            exists = await db.live_pulse_alerts_sent.find_one({"hash": idem_hash}, {"_id": 1})
            if exists:
                continue
        except Exception:
            pass

        summary = live_pulse_engine.summarize_signals(snapshot.get("signals", {}))
        await notifications_engine.emit_notification(
            db,
            user_id=uid,
            type="live_pulse_alert",
            severity="high",
            title=f"Pulso alto en {snapshot['zone_slug']}",
            body=f"Score {snapshot['score']} ({snapshot.get('bucket')}). "
                 f"Senales: {', '.join(f'{k}:{v:+.0f}%' for k,v in summary.items())}.",
            payload={
                "zone_slug": snapshot["zone_slug"],
                "score": snapshot["score"],
                "bucket": snapshot.get("bucket"),
                "signals_summary": summary,
                "link": f"/zona/{snapshot['zone_slug']}",
            },
            action_url=f"/zona/{snapshot['zone_slug']}",
        )
        now = _now()
        try:
            await db.live_pulse_alerts_sent.insert_one({
                "hash": idem_hash,
                "user_id": uid,
                "zone_slug": snapshot["zone_slug"],
                "sent_at": now.isoformat(),
                "sent_at_dt": now,
            })
        except Exception:
            pass
        sent += 1
    return sent
