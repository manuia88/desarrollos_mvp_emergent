"""W5.4 — Buyer Score Cron · recomputa scores diario a las 02:45 UTC.

Corre después de zone_subscores (02:30) · antes de AVM retrain (03:00).
"""
from __future__ import annotations

import logging
import secrets
import time
from datetime import datetime, timezone
from typing import Any, Dict

from apscheduler.triggers.cron import CronTrigger

log = logging.getLogger("dmx.buyer_score_cron")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _run_id() -> str:
    return f"bsrun_{secrets.token_urlsafe(8)}"


async def recompute_all_buyers(db) -> Dict[str, Any]:
    """Itera todos los users con role=buyer · computa score · upserta · dispara alertas."""
    from buyer_score_engine import compute_user_score, upsert_score
    from notifications_engine import rule_buyer_hot_jump

    started_at = _now()
    t0 = time.monotonic()

    buyers_evaluated = 0
    buyers_ok = 0
    errors_count = 0
    hot_jump_count = 0

    # Iterar usuarios con role=buyer
    cursor = db.users.find({"role": "buyer"}, {"_id": 0, "user_id": 1})
    user_ids = [u["user_id"] async for u in cursor if u.get("user_id")]

    log.info(f"[buyer_score_cron] start · buyers={len(user_ids)}")

    for uid in user_ids:
        buyers_evaluated += 1
        try:
            score_data = await compute_user_score(db, uid)
            result = await upsert_score(db, uid, score_data)
            buyers_ok += 1

            # Sub-D — si delta_pct >= 10 puntos, disparar notif hot jump
            if result.get("delta_pct", 0) >= 10:
                try:
                    await rule_buyer_hot_jump(
                        db,
                        buyer_user_id=uid,
                        prev_score=result["prev_score"],
                        new_score=result["score"],
                        tier=result["tier"],
                    )
                    hot_jump_count += 1
                except Exception as exc:
                    log.warning(f"[buyer_score_cron] hot_jump rule failed for {uid}: {exc}")
        except Exception as exc:
            errors_count += 1
            log.warning(f"[buyer_score_cron] failed for {uid}: {exc}")

    duration = round(time.monotonic() - t0, 2)
    run_doc = {
        "id": _run_id(),
        "ran_at": started_at,
        "buyers_evaluated": buyers_evaluated,
        "buyers_computed_ok": buyers_ok,
        "errors_count": errors_count,
        "hot_jump_alerts": hot_jump_count,
        "duration_seconds": duration,
    }
    await db.buyer_score_runs.insert_one(run_doc)

    log.info(
        f"[buyer_score_cron] done · evaluated={buyers_evaluated} ok={buyers_ok} "
        f"errors={errors_count} hot_jumps={hot_jump_count} secs={duration}"
    )
    return {k: v for k, v in run_doc.items() if k != "_id"}


def register_buyer_score_job(scheduler, db) -> None:
    """Registra cron diario 02:45 UTC en el APScheduler compartido."""
    scheduler.add_job(
        recompute_all_buyers,
        CronTrigger(hour=2, minute=45, timezone="UTC"),
        args=[db],
        id="buyer_score_recompute_daily",
        replace_existing=True,
        max_instances=1,
    )
    log.info("[buyer_score_cron] job registered @ 02:45 UTC daily")
