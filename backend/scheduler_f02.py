"""F0.2 · APScheduler jobs.

  • lunes 09:00 (America/Mexico_City) → digest_semanal_asesor
  • diario 06:00 (America/Mexico_City) → top_colonias_pre_compute

Both jobs are best-effort: errors are logged but never re-raised so the
scheduler keeps running.
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from typing import Any, Dict

log = logging.getLogger("dmx.scheduler_f02")
TZ = "America/Mexico_City"
_RETRIES = 3
_BACKOFF = 4  # seconds


async def _audit(db, action: str, payload: Dict[str, Any]) -> None:
    try:
        await db.audit_log.insert_one({
            "action": action,
            "resource": "scheduler_f02",
            "payload": payload,
            "ts": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as exc:
        log.warning(f"[f02] audit failed action={action} · {exc}")


# ─── Digest semanal asesor (Sub-A) ────────────────────────────────────────────

async def run_digest_semanal(db) -> Dict[str, Any]:
    """Itera asesores activos y envía digest semanal."""
    import asyncio
    from lead_journey_engine import journey_stats, top_3_leads_active
    from resend_engine import send_digest_semanal_asesor

    sent = 0
    skipped = 0
    failed = 0
    start = time.time()
    try:
        cursor = db.users.find(
            {"role": {"$in": ["advisor", "asesor", "asesor_admin"]}},
            {"_id": 0, "user_id": 1, "email": 1, "full_name": 1, "tenant_id": 1, "last_login_at": 1},
        )
        async for u in cursor:
            email = u.get("email")
            if not email:
                skipped += 1
                continue
            try:
                tenant = u.get("tenant_id") or "dmx"
                stats = await journey_stats(db, tenant_id=tenant, period_days=7)
                top_leads = await top_3_leads_active(
                    db, asesor_id=u["user_id"], period_days=7,
                )
                ok = send_digest_semanal_asesor(
                    asesor_email=email,
                    asesor_name=u.get("full_name") or email.split("@")[0],
                    week_data={"stats": stats, "top_leads": top_leads},
                )
                if ok:
                    sent += 1
                else:
                    skipped += 1
            except Exception as exc:
                failed += 1
                log.warning(f"[f02·digest] failed for {email}: {exc}")
            await asyncio.sleep(0)
    except Exception as exc:
        log.exception(f"[f02·digest] outer fail · {exc}")

    result = {
        "job": "digest_semanal_asesor",
        "sent": sent, "skipped": skipped, "failed": failed,
        "duration_ms": int((time.time() - start) * 1000),
    }
    log.info(f"[f02·digest] {result}")
    await _audit(db, "f02.digest_semanal", result)
    return result


# ─── Top colonias pre-compute (Sub-F) ────────────────────────────────────────

async def run_top_colonias_pre_compute(db) -> Dict[str, Any]:
    """Force-recomputa scores top colonias para pre-popular cache 24h."""
    import asyncio
    from score_inversion_engine import top_colonias_by_score

    last_exc = None
    for attempt in range(_RETRIES):
        start = time.time()
        try:
            items = await top_colonias_by_score(db, limit=10)
            result = {
                "job": "top_colonias_pre_compute",
                "count_computed": len(items),
                "duration_ms": int((time.time() - start) * 1000),
                "attempt": attempt + 1,
            }
            log.info(f"[f02·top_colonias] {result}")
            await _audit(db, "f02.top_colonias_pre_compute", result)
            return result
        except Exception as exc:
            last_exc = exc
            log.warning(f"[f02·top_colonias] attempt {attempt + 1} failed · {exc}")
            await asyncio.sleep(_BACKOFF * (2 ** attempt))
    failure = {"job": "top_colonias_pre_compute", "error": str(last_exc), "attempts": _RETRIES}
    await _audit(db, "f02.top_colonias_pre_compute_failed", failure)
    return failure


# ─── Registration ────────────────────────────────────────────────────────────

def register_f02_jobs(sched, db) -> None:
    from apscheduler.triggers.cron import CronTrigger

    # Digest semanal asesor — Lunes 09:00 (America/Mexico_City)
    sched.add_job(
        run_digest_semanal,
        CronTrigger(day_of_week="mon", hour=9, minute=0, timezone=TZ),
        id="f02_digest_semanal_asesor",
        replace_existing=True,
        kwargs={"db": db},
        max_instances=1,
        name="F0.2 · Digest semanal asesor (Lun 09:00 MX)",
    )
    log.info("[f02] digest_semanal_asesor cron registered (Mon 09:00 MX)")

    # Top colonias pre-compute — Diario 06:00 (America/Mexico_City)
    sched.add_job(
        run_top_colonias_pre_compute,
        CronTrigger(hour=6, minute=0, timezone=TZ),
        id="f02_top_colonias_pre_compute",
        replace_existing=True,
        kwargs={"db": db},
        max_instances=1,
        name="F0.2 · Top colonias pre-compute (06:00 MX)",
    )
    log.info("[f02] top_colonias_pre_compute cron registered (daily 06:00 MX)")
