"""W5.11 Parte 1 — Entity Resolution Cron Jobs.

Dos crons registrados con APScheduler:
  - dedup_detection_daily @ 06:00 UTC: detecta duplicados en 4 entity_types
  - fraud_pattern_daily   @ 07:00 UTC: detecta patrones de fraude por asesor

Idempotente: no re-inserta pendings que ya existen con status=pending.
"""
from __future__ import annotations

import logging
import secrets
import time
from datetime import datetime, timezone
from typing import Any, Dict, List

from apscheduler.triggers.cron import CronTrigger

log = logging.getLogger("dmx.entity_resolution_cron")

ENTITY_TYPES = ["leads", "contacts", "users", "developments"]


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ─── Cron: Dedup Detection ─────────────────────────────────────────────────────

async def run_dedup_detection(db) -> Dict[str, Any]:
    """Detecta duplicados en todos los entity_types y registra run en dedup_runs."""
    run_id = f"drun_{secrets.token_urlsafe(8)}"
    start = time.monotonic()
    log.info(f"[dedup_cron] START run_id={run_id}")

    total_pending = 0
    total_evaluated = 0
    errors: List[str] = []

    from entity_resolution_engine import detect_duplicates

    for entity_type in ENTITY_TYPES:
        try:
            pending_docs = await detect_duplicates(db, entity_type)
            if pending_docs:
                for doc in pending_docs:
                    try:
                        await db.entity_duplicates_pending.insert_one(dict(doc))
                        doc.pop("_id", None)
                        total_pending += 1
                    except Exception as ins_exc:  # noqa: BLE001
                        # Probable duplicado de index race condition
                        log.debug(f"[dedup_cron] insert skip {entity_type}: {ins_exc}")
            total_evaluated += len(pending_docs)
        except Exception as exc:  # noqa: BLE001
            err_msg = f"{entity_type}: {str(exc)[:100]}"
            log.error(f"[dedup_cron] error entity_type={entity_type}: {exc}")
            errors.append(err_msg)

    duration = round(time.monotonic() - start, 2)

    run_doc = {
        "id": run_id,
        "ran_at": _now().isoformat(),
        "ran_at_dt": _now(),  # Para TTL index
        "entity_types": ENTITY_TYPES,
        "candidates_evaluated": total_evaluated,
        "pending_created": total_pending,
        "auto_merged": 0,  # Auto-merge lo hace la UI en Parte 2 o llamada explícita
        "errors_count": len(errors),
        "errors": errors,
        "duration_seconds": duration,
    }
    try:
        await db.dedup_runs.insert_one(dict(run_doc))
    except Exception as exc:
        log.warning(f"[dedup_cron] run doc insert failed: {exc}")

    log.info(f"[dedup_cron] END run_id={run_id} pending={total_pending} duration={duration}s")
    return run_doc


# ─── Cron: Fraud Pattern Detection ────────────────────────────────────────────

async def run_fraud_pattern_detection(db) -> Dict[str, Any]:
    """Evalúa patrones de fraude por asesor activo en los últimos 30d."""
    start = time.monotonic()
    log.info("[fraud_cron] START")

    from entity_resolution_engine import detect_broker_fraud_pattern

    # Asesores con actividad (tienen leads recientes)
    from datetime import timedelta
    cutoff = (_now() - timedelta(days=30)).isoformat()
    asesor_ids = set()
    async for lead in db.leads.find(
        {"created_at": {"$gte": cutoff}, "merged_into": {"$exists": False}},
        {"_id": 0, "assigned_to": 1, "created_by": 1},
    ).limit(1000):
        if lead.get("assigned_to"):
            asesor_ids.add(lead["assigned_to"])
        if lead.get("created_by"):
            asesor_ids.add(lead["created_by"])

    patterns_detected = 0
    errors = []

    for asesor_id in asesor_ids:
        if not asesor_id:
            continue
        try:
            result = await detect_broker_fraud_pattern(db, asesor_id)
            if result.get("pattern_count", 0) >= 3:
                patterns_detected += 1
        except Exception as exc:  # noqa: BLE001
            log.error(f"[fraud_cron] asesor={asesor_id} error: {exc}")
            errors.append(str(exc)[:80])

    duration = round(time.monotonic() - start, 2)
    log.info(f"[fraud_cron] END asesores_checked={len(asesor_ids)} patterns_detected={patterns_detected} duration={duration}s")
    return {
        "asesores_checked": len(asesor_ids),
        "patterns_detected": patterns_detected,
        "errors_count": len(errors),
        "duration_seconds": duration,
    }


# ─── Registro APScheduler ──────────────────────────────────────────────────────

def register_jobs(scheduler, db) -> None:
    """Registra ambos crons en el scheduler existente."""
    # Dedup detection · diario 06:00 UTC
    scheduler.add_job(
        run_dedup_detection,
        CronTrigger(hour=6, minute=0, timezone="UTC"),
        args=[db],
        id="dedup_detection_daily",
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=3600,
    )
    # Fraud pattern · diario 07:00 UTC
    scheduler.add_job(
        run_fraud_pattern_detection,
        CronTrigger(hour=7, minute=0, timezone="UTC"),
        args=[db],
        id="fraud_pattern_daily",
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=3600,
    )
    log.info("[w5.11] crons registrados: dedup_detection_daily@06:00 + fraud_pattern_daily@07:00 UTC")
