"""Phase 4 Batch 20 · APScheduler — daily 6am asesor metric snapshots.

Trigger: every day @ 06:00 UTC. For each active asesor, compute today's metrics
and upsert into asesor_metrics_snapshots. Fires a notification to inmobiliaria_admin
if activity_score_7d dropped >20pp vs the snapshot taken 7 days ago.
"""
from __future__ import annotations
import logging
from datetime import datetime, timezone, timedelta

from services.asesor_metrics import compute_asesor_metrics

log = logging.getLogger("dmx.scheduler_asesor")


async def run_daily_snapshots(db) -> int:
    """Compute snapshots for every active asesor. Returns count written."""
    asesores = await db.users.find(
        {"role": {"$in": ["advisor", "asesor_admin"]}},
        {"_id": 0, "user_id": 1, "tenant_id": 1, "name": 1},
    ).to_list(2000)

    written = 0
    for a in asesores:
        aid = a.get("user_id")
        if not aid:
            continue
        try:
            metrics = await compute_asesor_metrics(db, aid, "30d")
            await db.asesor_metrics_snapshots.update_one(
                {"asesor_id": aid, "snapshot_date": metrics["snapshot_date"]},
                {"$set": metrics}, upsert=True,
            )
            written += 1

            # ── Notification trigger: activity_score drop >20pp ──────────────
            previous_date = (
                datetime.fromisoformat(metrics["snapshot_date"])
                - timedelta(days=7)
            ).date().isoformat()
            prev = await db.asesor_metrics_snapshots.find_one(
                {"asesor_id": aid, "snapshot_date": previous_date},
                {"_id": 0, "activity_score_7d": 1},
            )
            if prev:
                drop = (prev.get("activity_score_7d", 0)
                         - metrics.get("activity_score_7d", 0))
                if drop >= 20:
                    # Find inmobiliaria_admin/developer_admin in same tenant
                    admins = await db.users.find(
                        {"tenant_id": a.get("tenant_id", ""),
                         "role": {"$in": ["inmobiliaria_admin", "developer_admin",
                                            "asesor_admin", "superadmin"]}},
                        {"_id": 0, "user_id": 1},
                    ).to_list(20)
                    try:
                        from routes.dev_batch14 import create_notification
                        for adm in admins:
                            await create_notification(
                                db, adm["user_id"], "asesor_performance_drop",
                                f"Performance asesor {a.get('name', aid)} bajó",
                                f"Activity score 7d cayó {drop} puntos vs hace 7 días.",
                                action_url=f"/desarrollador/crm/asesores-metrics?asesor={aid}",
                                priority="high",
                                org_id=a.get("tenant_id", "default"),
                            )
                    except Exception as e:
                        log.warning(f"[scheduler_asesor] notif failed: {e}")
        except Exception as e:
            log.warning(f"[scheduler_asesor] snapshot failed for {aid}: {e}")
    log.info(f"[scheduler_asesor] daily snapshots written: {written}")
    return written


def schedule_daily_snapshots(scheduler, db):
    """Register the cron job. To be called from server.py startup."""
    if not scheduler:
        return
    from apscheduler.triggers.cron import CronTrigger
    scheduler.add_job(
        run_daily_snapshots,
        CronTrigger(hour=6, minute=0),
        id="asesor_snapshots_daily",
        replace_existing=True,
        kwargs={"db": db},
        max_instances=1,
    )
    log.info("[scheduler_asesor] daily snapshots cron scheduled @ 06:00 UTC")
