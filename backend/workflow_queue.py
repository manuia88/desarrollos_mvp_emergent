"""W6.AS.1 · Workflow Queue · APScheduler async queue + retry logic.

Maneja delays entre nodes del workflow. Persiste tareas en
`workflow_queue` collection con `run_at` timestamp. Worker tick cada
60s consume ready items y reanuda execution.

Idempotent: cada `queue_id` único · al pickear marca status=picked
antes de procesar para evitar doble worker.
"""
from __future__ import annotations

import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.workflow_queue")

TICK_INTERVAL_SECONDS = 60
MAX_BATCH_PER_TICK = 50


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _q_id() -> str:
    return f"wfq_{secrets.token_urlsafe(10)}"


async def schedule_continuation(
    db,
    workflow_id: str,
    lead_id: Optional[str],
    execution_id: str,
    run_id: str,
    from_node_ids: List[str],
    run_at: datetime,
) -> str:
    """Encola continuation tras delay node. Retorna queue_id."""
    qid = _q_id()
    doc = {
        "id": qid,
        "workflow_id": workflow_id,
        "lead_id": lead_id,
        "execution_id": execution_id,
        "run_id": run_id,
        "from_node_ids": from_node_ids,
        "run_at": run_at,
        "status": "pending",
        "attempts": 0,
        "last_error": None,
        "created_at": _now(),
        "picked_at": None,
        "finished_at": None,
    }
    try:
        await db.workflow_queue.insert_one(doc)
        log.info(f"[workflow_queue] scheduled qid={qid} run_at={run_at.isoformat()}")
    except Exception as exc:
        log.warning(f"[workflow_queue] insert failed: {exc}")
    return qid


async def _pick_ready_items(db) -> List[Dict[str, Any]]:
    """Pickea items con run_at <= now y status=pending."""
    cutoff = _now()
    out: List[Dict[str, Any]] = []
    cursor = db.workflow_queue.find(
        {"status": "pending", "run_at": {"$lte": cutoff}},
        {"_id": 0},
    ).sort("run_at", 1).limit(MAX_BATCH_PER_TICK)
    async for item in cursor:
        # Claim atómico: set status=picked si todavía pending
        res = await db.workflow_queue.update_one(
            {"id": item["id"], "status": "pending"},
            {"$set": {"status": "picked", "picked_at": _now()}, "$inc": {"attempts": 1}},
        )
        if res.modified_count == 1:
            out.append(item)
    return out


async def _process_item(db, item: Dict[str, Any]) -> Dict[str, Any]:
    try:
        from workflow_engine import continue_execution
        r = await continue_execution(
            db,
            workflow_id=item["workflow_id"],
            lead_id=item.get("lead_id"),
            execution_id=item["execution_id"],
            run_id=item["run_id"],
            from_node_ids=item.get("from_node_ids") or [],
        )
        await db.workflow_queue.update_one(
            {"id": item["id"]},
            {"$set": {"status": "done", "finished_at": _now()}},
        )
        return {"ok": True, "qid": item["id"], "result": r}
    except Exception as exc:
        log.warning(f"[workflow_queue] process error qid={item.get('id')}: {exc}")
        attempts = int(item.get("attempts") or 0)
        if attempts >= 3:
            await db.workflow_queue.update_one(
                {"id": item["id"]},
                {"$set": {"status": "failed", "last_error": str(exc), "finished_at": _now()}},
            )
        else:
            # Exponential reagenda: 2^attempts minutos
            next_at = _now() + timedelta(minutes=2 ** attempts)
            await db.workflow_queue.update_one(
                {"id": item["id"]},
                {"$set": {"status": "pending", "run_at": next_at, "last_error": str(exc)}},
            )
        return {"ok": False, "qid": item.get("id"), "error": str(exc)}


async def tick_workflow_queue(db) -> Dict[str, Any]:
    """Llama cada TICK_INTERVAL_SECONDS · pickea + procesa hasta MAX_BATCH."""
    started = _now()
    items = await _pick_ready_items(db)
    results: List[Dict[str, Any]] = []
    for it in items:
        results.append(await _process_item(db, it))
    duration = (_now() - started).total_seconds()
    success = sum(1 for r in results if r.get("ok"))
    failed = sum(1 for r in results if not r.get("ok"))
    log.info(f"[workflow_queue] tick · picked={len(items)} ok={success} fail={failed} secs={duration:.2f}")
    return {"picked": len(items), "success": success, "failed": failed, "duration_s": duration}


def register_workflow_queue_job(scheduler, db) -> None:
    """Registra cron interval cada 60s. Idempotent (replace_existing)."""
    try:
        from apscheduler.triggers.interval import IntervalTrigger
        scheduler.add_job(
            tick_workflow_queue,
            IntervalTrigger(seconds=TICK_INTERVAL_SECONDS),
            args=[db],
            id="workflow_queue_tick",
            replace_existing=True,
            max_instances=1,
            coalesce=True,
        )
        log.info(f"[workflow_queue] job registered · tick every {TICK_INTERVAL_SECONDS}s")
    except Exception as exc:
        log.warning(f"[workflow_queue] register failed: {exc}")


async def ensure_indexes(db) -> None:
    try:
        await db.workflow_queue.create_index("id", unique=True)
        await db.workflow_queue.create_index([("status", 1), ("run_at", 1)], name="idx_wfq_ready", background=True)
        await db.workflow_queue.create_index([("workflow_id", 1), ("created_at", -1)], background=True)
        # TTL 30d para limpiar items done/failed
        await db.workflow_queue.create_index("finished_at", expireAfterSeconds=30 * 86400, background=True, sparse=True, name="ttl_wfq_30d")
        log.info("[workflow_queue] indexes OK")
    except Exception as exc:
        log.warning(f"[workflow_queue] ensure_indexes warning: {exc}")
