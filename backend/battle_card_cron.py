"""W5.23 — Battle Card Cron.

2 jobs:
  1. battle_card_snapshot_cron  @ domingo 23:00 UTC  — computa snapshots T3
  2. battle_card_weekly_email_cron @ lunes 08:00 UTC — email digest dev admins

Idempotency: collection battle_card_emails_sent (TTL 30d) hash sha256(user_id+week_iso).
"""
from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from apscheduler.triggers.cron import CronTrigger

log = logging.getLogger("dmx.battle_card_cron")

EMAIL_TTL_DAYS = 30
RANKING_DELTA_THRESHOLD = 3  # posiciones para notif ranking_change


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso_week(dt: Optional[datetime] = None) -> str:
    d = dt or _now()
    return f"{d.isocalendar()[0]}-W{d.isocalendar()[1]:02d}"


def _idem_hash(user_id: str, week_iso: str) -> str:
    raw = f"{user_id}:{week_iso}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


async def _email_sent_exists(db, idem_hash: str) -> bool:
    doc = await db.battle_card_emails_sent.find_one(
        {"hash": idem_hash}, {"_id": 0, "hash": 1}
    )
    return doc is not None


async def _register_email_sent(db, idem_hash: str, user_id: str, week_iso: str) -> None:
    try:
        await db.battle_card_emails_sent.insert_one({
            "hash": idem_hash,
            "user_id": user_id,
            "week_iso": week_iso,
            "created_at": _now().isoformat(),
            "expire_at": _now() + timedelta(days=EMAIL_TTL_DAYS),
        })
    except Exception:
        pass


async def _battle_card_snapshot_job(db) -> Dict[str, Any]:
    """Snapshot cron: itera todos los proyectos T3, computa y persiste."""
    from battle_card_engine import compute_and_persist_snapshot, ensure_battle_card_indexes
    from data_developments import DEVELOPMENTS
    from notifications_engine import emit_notification

    start = _now()
    await ensure_battle_card_indexes(db)

    # Proyectos disponibles (usamos todos en data_developments para cobertura total)
    projects_snapped = 0
    ranking_alerts = 0
    week_iso = _iso_week()

    for dev in DEVELOPMENTS:
        project_id = dev["id"]
        try:
            result = await compute_and_persist_snapshot(db, project_id)
            if result.get("ok"):
                projects_snapped += 1
                snap = result["snapshot"]

                # Notif ranking_change si delta_position significativo
                delta_pos = abs(snap.get("delta_position") or 0)
                if delta_pos >= RANKING_DELTA_THRESHOLD:
                    # Encontrar dev_org_admin users
                    org_id = snap.get("dev_org_id") or ""
                    if org_id:
                        try:
                            admin_cursor = db.users.find(
                                {"developer_id": org_id, "role": {"$in": ["developer_admin", "developer_director"]}},
                                {"_id": 0, "user_id": 1},
                            )
                            async for u in admin_cursor:
                                uid = u.get("user_id") or ""
                                if uid:
                                    direction = "subio" if snap.get("delta_position", 0) > 0 else "bajo"
                                    await emit_notification(
                                        db,
                                        user_id=uid,
                                        type="battle_card_ranking_change",
                                        severity="normal",
                                        title="Tu ranking en Battle Card cambio esta semana",
                                        body=(
                                            f"Tu proyecto {project_id} "
                                            f"{direction} {abs(snap['delta_position'])} posiciones "
                                            f"en la zona {snap.get('zone_slug','')}. "
                                            f"Score actual: {snap.get('my_score',0):.1f}/100."
                                        ),
                                        payload={
                                            "project_id": project_id,
                                            "delta_position": snap.get("delta_position"),
                                            "rank": snap.get("ranking"),
                                            "week_iso": week_iso,
                                            "link": f"/desarrollador/battle-card/{project_id}",
                                        },
                                        action_url=f"/desarrollador/battle-card/{project_id}",
                                        channels=["in_app"],
                                    )
                                    ranking_alerts += 1
                        except Exception as exc:
                            log.warning(f"[battle_card_cron] ranking notif failed {project_id}: {exc}")

        except Exception as exc:
            log.warning(f"[battle_card_cron] snapshot failed {project_id}: {exc}")

    duration_s = (_now() - start).total_seconds()

    # Audit log
    try:
        from audit_immutable_engine import log as audit_log
        await audit_log(
            db,
            actor={"user_id": "system", "role": "system"},
            action="battle_card_snapshot_cron",
            entity_type="battle_card_cron",
            entity_id=f"snapshot_{week_iso}",
            before=None,
            after={
                "projects_snapped": projects_snapped,
                "ranking_alerts": ranking_alerts,
                "duration_s": round(duration_s, 2),
            },
        )
    except Exception:
        pass

    log.info(
        f"[BattleCard] {projects_snapped} proyectos snapshot · "
        f"{ranking_alerts} ranking alerts · duration_s={round(duration_s, 2)}"
    )
    return {
        "projects_snapped": projects_snapped,
        "ranking_alerts": ranking_alerts,
        "duration_s": round(duration_s, 2),
    }


async def _battle_card_email_job(db) -> Dict[str, Any]:
    """Email digest cron: lunes 08:00 UTC · 1 email por dev_admin por semana."""
    from notifications_engine import emit_notification

    start = _now()
    week_iso = _iso_week()
    emails_dispatched = 0

    # Buscar dev_admin users con snapshots esta semana
    try:
        snap_cursor = db.battle_card_snapshots.find(
            {"week_iso": week_iso},
            {"_id": 0, "project_id": 1, "dev_org_id": 1, "my_score": 1,
             "delta_pp": 1, "ranking": 1, "recommended_action": 1, "delta_position": 1},
        )
        # Agrupar por dev_org_id
        org_snapshots: Dict[str, List[Dict]] = {}
        async for snap in snap_cursor:
            org = snap.get("dev_org_id") or ""
            if org:
                org_snapshots.setdefault(org, []).append(snap)
    except Exception as exc:
        log.warning(f"[battle_card_email] snapshot query failed: {exc}")
        return {"emails_dispatched": 0, "duration_s": 0}

    for org_id, snaps in org_snapshots.items():
        # Ordenar movimientos por |delta_pp| descendente → top 3
        snaps_sorted = sorted(snaps, key=lambda s: abs(s.get("delta_pp") or 0), reverse=True)
        top3 = snaps_sorted[:3]

        # Recomendar acción del proyecto con mayor delta negativo
        recommended_action = None
        for s in snaps_sorted:
            if s.get("delta_pp", 0) < 0:
                recommended_action = s.get("recommended_action")
                break
        if not recommended_action and snaps:
            recommended_action = snaps[0].get("recommended_action")

        # Encontrar admins de esta org
        try:
            admin_cursor = db.users.find(
                {"developer_id": org_id, "role": {"$in": ["developer_admin", "developer_director"]}},
                {"_id": 0, "user_id": 1, "email": 1, "name": 1},
            )
            async for admin in admin_cursor:
                uid = admin.get("user_id") or ""
                if not uid:
                    continue

                # Idempotency
                idem = _idem_hash(uid, week_iso)
                if await _email_sent_exists(db, idem):
                    continue

                # Emitir notificación in_app + email
                movements_str = ", ".join(
                    f"{s['project_id']} ({'+' if s.get('delta_pp',0)>=0 else ''}{s.get('delta_pp',0):.1f}pp)"
                    for s in top3
                )

                await emit_notification(
                    db,
                    user_id=uid,
                    type="battle_card_weekly_digest",
                    severity="normal",
                    title=f"Tu Battle Card · Semana {week_iso}",
                    body=(
                        f"Hola, aqui tu resumen competitivo de la semana. "
                        f"Top movimientos: {movements_str}. "
                        f"Accion recomendada: {recommended_action or 'Revisa tu Battle Card.'}"
                    ),
                    payload={
                        "week_iso": week_iso,
                        "top_movements": [
                            {
                                "project_id": s["project_id"],
                                "score": s.get("my_score"),
                                "delta_pp": s.get("delta_pp"),
                                "ranking": s.get("ranking"),
                            }
                            for s in top3
                        ],
                        "recommended_action_top1": recommended_action,
                        "link": f"/desarrollador/battle-card/{top3[0]['project_id']}" if top3 else "/desarrollador",
                    },
                    action_url="/desarrollador",
                    channels=["in_app", "email"],
                )
                await _register_email_sent(db, idem, uid, week_iso)
                emails_dispatched += 1

        except Exception as exc:
            log.warning(f"[battle_card_email] admin query failed org={org_id}: {exc}")

    duration_s = (_now() - start).total_seconds()

    # Audit log
    try:
        from audit_immutable_engine import log as audit_log
        await audit_log(
            db,
            actor={"user_id": "system", "role": "system"},
            action="battle_card_email_cron",
            entity_type="battle_card_cron",
            entity_id=f"email_{week_iso}",
            before=None,
            after={
                "emails_dispatched": emails_dispatched,
                "duration_s": round(duration_s, 2),
            },
        )
    except Exception:
        pass

    log.info(
        f"[BattleCard] {emails_dispatched} emails dispatched · duration_s={round(duration_s, 2)}"
    )
    return {"emails_dispatched": emails_dispatched, "duration_s": round(duration_s, 2)}


def register_battle_card_jobs(scheduler, db) -> None:
    """Registrar 2 jobs en APScheduler."""
    scheduler.add_job(
        _battle_card_snapshot_job,
        CronTrigger(day_of_week="sun", hour=23, timezone="UTC"),
        id="battle_card_snapshot_cron",
        replace_existing=True,
        max_instances=1,
        kwargs={"db": db},
    )
    scheduler.add_job(
        _battle_card_email_job,
        CronTrigger(day_of_week="mon", hour=8, timezone="UTC"),
        id="battle_card_weekly_email_cron",
        replace_existing=True,
        max_instances=1,
        kwargs={"db": db},
    )
    log.info(
        "[battle_card_cron] Jobs registrados: snapshot @ domingo 23:00 UTC · "
        "email @ lunes 08:00 UTC"
    )
