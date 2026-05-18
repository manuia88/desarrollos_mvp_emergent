"""W5.19 — Probability Cron: weekly threshold crossing detector.

Job: probability_crossing_cron
Trigger: CronTrigger(day_of_week="sun", hour=6, timezone="UTC")

Logica:
1. Query db.saved_zones todas activas (zone_id, user_id)
2. Dedup zonas unicas
3. Por cada zona: compute_zone_drpi_up(zone_slug, months=3) actual
4. Comparar vs ultimo snapshot en probability_snapshots
5. Si delta >= 15pp: notificar a usuarios saved con idempotencia sha256(user+zone+iso_week)
6. Persistir snapshot nuevo (TTL 90d)
7. Audit log
"""
from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List

from apscheduler.triggers.cron import CronTrigger

log = logging.getLogger("dmx.probability_cron")

CROSSING_DELTA_PP = 15.0  # umbral: 15 pp de subida significativa
SNAPSHOT_TTL_DAYS = 90
ALERT_TTL_DAYS = 30


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso_week(dt: datetime) -> str:
    """Semana ISO: YYYY-Www"""
    return f"{dt.isocalendar()[0]}-W{dt.isocalendar()[1]:02d}"


def _idempotency_hash(user_id: str, zone_slug: str, iso_week: str) -> str:
    raw = f"{user_id}:{zone_slug}:{iso_week}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


async def _get_prev_snapshot(db, zone_slug: str, snapshot_type: str) -> Dict[str, Any]:
    doc = await db.probability_snapshots.find_one(
        {"zone_slug": zone_slug, "type": snapshot_type},
        {"_id": 0},
        sort=[("computed_at", -1)],
    )
    return doc or {}


async def _persist_snapshot(db, zone_slug: str, snapshot_type: str, prob_result: Dict[str, Any]) -> None:
    expire_at = _now() + timedelta(days=SNAPSHOT_TTL_DAYS)
    await db.probability_snapshots.insert_one({
        "zone_slug": zone_slug,
        "type": snapshot_type,
        "probability_pct": prob_result.get("probability_pct"),
        "sources_breakdown": prob_result.get("sources_breakdown"),
        "insufficient_data": prob_result.get("insufficient_data", False),
        "computed_at": _now().isoformat(),
        "expire_at": expire_at,
    })


async def _alert_sent_exists(db, idempotency_hash: str) -> bool:
    doc = await db.probability_alerts_sent.find_one(
        {"hash": idempotency_hash},
        {"_id": 0, "hash": 1},
    )
    return doc is not None


async def _register_alert_sent(db, idempotency_hash: str) -> None:
    expire_at = _now() + timedelta(days=ALERT_TTL_DAYS)
    try:
        await db.probability_alerts_sent.insert_one({
            "hash": idempotency_hash,
            "created_at": _now().isoformat(),
            "expire_at": expire_at,
        })
    except Exception:
        pass


async def _probability_crossing_job(db) -> Dict[str, Any]:
    from probability_engine import compute_zone_drpi_up
    from notifications_engine import emit_notification

    start = _now()
    iso_week = _iso_week(start)

    # 1. Recopilar todas las zonas con usuarios que las guardaron
    zones_users: Dict[str, List[str]] = {}
    cursor = db.saved_zones.find({}, {"_id": 0, "zone_id": 1, "user_id": 1})
    async for doc in cursor:
        zone_id = doc.get("zone_id") or ""
        user_id = doc.get("user_id") or ""
        if zone_id and user_id:
            zones_users.setdefault(zone_id, []).append(user_id)

    zones_checked = len(zones_users)
    alerts_dispatched = 0

    for zone_slug, user_ids in zones_users.items():
        try:
            # 2. Calcular probabilidad actual
            curr_result = await compute_zone_drpi_up(db, zone_slug, months=3)
            if curr_result.get("insufficient_data"):
                continue

            curr_pct = float(curr_result.get("probability_pct") or 0)

            # 3. Obtener snapshot previo
            prev_doc = await _get_prev_snapshot(db, zone_slug, "drpi_up")
            prev_pct = float(prev_doc.get("probability_pct") or 0)

            delta_pp = curr_pct - prev_pct

            # 4. Persistir snapshot nuevo
            await _persist_snapshot(db, zone_slug, "drpi_up", curr_result)

            # 5. Si delta >= umbral, notificar usuarios unicos
            if delta_pp >= CROSSING_DELTA_PP:
                unique_users = list(set(user_ids))
                for user_id in unique_users:
                    idem_hash = _idempotency_hash(user_id, zone_slug, iso_week)
                    if await _alert_sent_exists(db, idem_hash):
                        continue  # ya enviado esta semana

                    await emit_notification(
                        db,
                        user_id=user_id,
                        type="probability_threshold_crossed",
                        severity="normal",
                        title="Probabilidad de subida DRPI cruzó umbral",
                        body=(
                            f"La probabilidad de que el DRPI de {zone_slug} suba en 3 meses "
                            f"pasó de {round(prev_pct, 1)}% a {round(curr_pct, 1)}% "
                            f"(+{round(delta_pp, 1)} pp). Revisa la zona."
                        ),
                        payload={
                            "zone_slug": zone_slug,
                            "prev_pct": round(prev_pct, 1),
                            "curr_pct": round(curr_pct, 1),
                            "delta_pp": round(delta_pp, 1),
                            "sources_breakdown": curr_result.get("sources_breakdown"),
                            "link": f"/zona/{zone_slug}",
                        },
                        action_url=f"/zona/{zone_slug}",
                        channels=["in_app"],
                    )
                    await _register_alert_sent(db, idem_hash)
                    alerts_dispatched += 1

        except Exception as exc:
            log.warning(f"[probability_cron] error zona {zone_slug}: {exc}")

    duration_s = (_now() - start).total_seconds()

    # 6. Audit log
    try:
        from audit_immutable_engine import log as audit_log
        await audit_log(
            db,
            actor={"user_id": "system", "role": "system"},
            action="probability_crossing_cron",
            entity_type="probability_cron",
            entity_id=f"cron_{int(start.timestamp())}",
            before=None,
            after={
                "zones_checked": zones_checked,
                "alerts_dispatched": alerts_dispatched,
                "duration_s": round(duration_s, 2),
            },
        )
    except Exception as exc:
        log.warning(f"[probability_cron] audit log failed: {exc}")

    log.info(
        f"[Probability] {zones_checked} zonas checked · "
        f"{alerts_dispatched} alerts dispatched · "
        f"duration_s={round(duration_s, 2)}"
    )
    return {
        "zones_checked": zones_checked,
        "alerts_dispatched": alerts_dispatched,
        "duration_s": round(duration_s, 2),
    }


async def ensure_probability_indexes(db) -> None:
    """Crear indexes para probability_snapshots y probability_alerts_sent."""
    try:
        await db.probability_snapshots.create_index(
            [("zone_slug", 1), ("type", 1), ("computed_at", -1)]
        )
        await db.probability_snapshots.create_index(
            "expire_at", expireAfterSeconds=0
        )
    except Exception as exc:
        log.warning(f"[probability_cron] snapshot index failed: {exc}")

    try:
        await db.probability_alerts_sent.create_index("hash", unique=True)
        await db.probability_alerts_sent.create_index(
            "expire_at", expireAfterSeconds=0
        )
    except Exception as exc:
        log.warning(f"[probability_cron] alerts_sent index failed: {exc}")


def register_probability_jobs(scheduler, db) -> None:
    """Registrar job semanal en el APScheduler existente."""
    def _wrap():
        import asyncio
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import asyncio as _a
            _a.create_task(_probability_crossing_job(db))
        else:
            loop.run_until_complete(_probability_crossing_job(db))

    async def _async_job():
        await _probability_crossing_job(db)

    scheduler.add_job(
        _probability_crossing_job,
        CronTrigger(day_of_week="sun", hour=6, timezone="UTC"),
        id="probability_crossing_cron",
        replace_existing=True,
        max_instances=1,
        kwargs={"db": db},
    )
    log.info("[probability_cron] Job 'probability_crossing_cron' registrado @ domingo 06:00 UTC")
