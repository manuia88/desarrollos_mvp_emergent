"""W5.ASR.3 Parte 2 · Auto-Nurture Cron daily 05:00 UTC.

Identifica leads stalled (>14d sin actividad · status_v2 activo · sin nurture)
y los activa en nurture + dispara secuencia stalled-recovery.

Idempotente · circuit-breaker · audit completo en db.auto_nurture_runs.
"""
from __future__ import annotations

import logging
import secrets
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from apscheduler.triggers.cron import CronTrigger

log = logging.getLogger("dmx.auto_nurture_cron")

ACTIVE_STATUSES = ["contactado", "calificado", "visita", "negociacion"]
STALL_DAYS = 14


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _run_id() -> str:
    return f"anrun_{secrets.token_urlsafe(8)}"


def _ts_of(field_value: Any) -> Optional[datetime]:
    """Parse field como datetime (ISO string o datetime). None si vacío."""
    if not field_value:
        return None
    if isinstance(field_value, datetime):
        return field_value if field_value.tzinfo else field_value.replace(tzinfo=timezone.utc)
    if isinstance(field_value, str):
        try:
            dt = datetime.fromisoformat(field_value.replace("Z", "+00:00"))
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except Exception:
            return None
    return None


async def _identify_candidates(db) -> List[Dict[str, Any]]:
    """Devuelve leads que cumplen los criterios para auto-nurture."""
    cutoff = _now() - timedelta(days=STALL_DAYS)
    cutoff_iso = cutoff.isoformat()

    # Query: dos condiciones equivalentes para last_activity_at:
    #   1. last_activity_at existente y < cutoff
    #   2. last_activity_at null → usar created_at < cutoff
    query = {
        "status_v2": {"$in": ACTIVE_STATUSES},
        "nurture_active": {"$ne": True},
        "lost_at": None,
        "$or": [
            {"last_activity_at": {"$lt": cutoff_iso}},
            {
                "last_activity_at": None,
                "created_at": {"$lt": cutoff_iso},
            },
        ],
    }
    projection = {
        "_id": 0, "id": 1, "status_v2": 1, "last_activity_at": 1,
        "created_at": 1, "assigned_to": 1, "tenant_id": 1, "dev_org_id": 1,
        "contact": 1, "heat_score": 1,
    }
    out: List[Dict[str, Any]] = []
    cursor = db.leads.find(query, projection).limit(5000)
    async for ld in cursor:
        # Doble verificación del umbral por si last_activity_at viene como
        # datetime nativo (BSON Date) ignorado por filtro string.
        last_dt = _ts_of(ld.get("last_activity_at")) or _ts_of(ld.get("created_at"))
        if not last_dt:
            continue
        if (_now() - last_dt) < timedelta(days=STALL_DAYS):
            continue
        out.append(ld)
    return out


async def _trigger_stalled_recovery_seq(db, lead: Dict[str, Any]) -> str:
    """Inserta nurture_sequence stalled-recovery si no existe ya.

    4 touches: 0h · 48h · 168h · 336h (último con asesor_handoff).
    """
    from lead_nurture_engine import start_stalled_recovery_for_lead
    return await start_stalled_recovery_for_lead(db, lead)


async def run_auto_nurture(db) -> Dict[str, Any]:
    """Ejecuta el ciclo completo: identifica · activa · agenda secuencia · audit."""
    started_at = _now()
    t0 = time.monotonic()

    candidates = await _identify_candidates(db)
    evaluated = len(candidates)
    activated = 0
    sequence_started = 0
    errors_count = 0

    log.info(f"[auto_nurture_cron] start · candidates_evaluated={evaluated}")

    for ld in candidates:
        lead_id = ld.get("id")
        if not lead_id:
            continue
        try:
            from pipeline_engine import set_parallel_state
            await set_parallel_state(
                db, lead_id, "nurture", True, reason="auto_14d_no_activity",
            )
            # Track timestamp de auto-activación (no toca nurture_active porque
            # ya lo seteó set_parallel_state).
            await db.leads.update_one(
                {"id": lead_id},
                {"$set": {"auto_nurture_activated_at": started_at.isoformat()}},
            )
            activated += 1

            # Disparar secuencia stalled-recovery (idempotent)
            try:
                seq_status = await _trigger_stalled_recovery_seq(db, ld)
                if seq_status in ("created", "reactivated"):
                    sequence_started += 1
            except Exception as exc:
                log.warning(
                    f"[auto_nurture_cron] stalled-recovery seq failed · "
                    f"lead={lead_id} · {exc}"
                )
                errors_count += 1

            # Audit
            try:
                await db.activity_log.insert_one({
                    "id": f"act_{secrets.token_urlsafe(8)}",
                    "type": "auto_nurture.activated",
                    "lead_id": lead_id,
                    "tenant_id": ld.get("tenant_id") or ld.get("dev_org_id"),
                    "asesor_id": ld.get("assigned_to"),
                    "reason": "auto_14d_no_activity",
                    "created_at": started_at,
                })
            except Exception:
                pass
        except Exception as exc:
            log.warning(f"[auto_nurture_cron] activate failed · lead={lead_id} · {exc}")
            errors_count += 1

    duration = round(time.monotonic() - t0, 2)
    run_doc = {
        "id": _run_id(),
        "ran_at": started_at.isoformat(),
        "candidates_evaluated": evaluated,
        "candidates_activated": activated,
        "sequence_started": sequence_started,
        "errors_count": errors_count,
        "duration_seconds": duration,
    }
    try:
        await db.auto_nurture_runs.insert_one(dict(run_doc))
    except Exception as exc:
        log.warning(f"[auto_nurture_cron] persist run failed · {exc}")

    log.info(
        f"[auto_nurture_cron] done · evaluated={evaluated} activated={activated} "
        f"seq_started={sequence_started} errors={errors_count} secs={duration}"
    )
    return run_doc


def register_auto_nurture_job(scheduler, db) -> None:
    """Cron diario 05:00 UTC (post AVM 03:00 · post forecast 04:00)."""
    scheduler.add_job(
        run_auto_nurture,
        CronTrigger(hour=5, minute=0, timezone="UTC"),
        args=[db],
        id="auto_nurture_daily",
        replace_existing=True,
        max_instances=1,
    )
    log.info("[auto_nurture_cron] job registered @ 05:00 UTC daily")


async def ensure_indexes(db) -> None:
    try:
        await db.auto_nurture_runs.create_index("id", unique=True)
        await db.auto_nurture_runs.create_index([("ran_at", -1)])
        await db.leads.create_index("auto_nurture_activated_at", sparse=True)
        log.info("[auto_nurture_cron] indexes OK")
    except Exception as exc:
        log.warning(f"[auto_nurture_cron] ensure_indexes warning · {exc}")
