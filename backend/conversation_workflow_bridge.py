"""W7.AS.3.C · Conversation → Workflow bridge (cycle-closer).

Módulo puro standalone, importable por conversation_engine.py.
Permite que el asistente dispare o pause workflows de automatización
(workflow_engine · W6.AS.1) desde el contexto conversacional, respetando
idempotencia y FAIL-OPEN.

Funciones:
    - agent_triggers_workflow(workflow_id, lead_id, db)
        Carga el workflow activo y lo ejecuta vía workflow_engine.execute_workflow
        con execution_id determinístico (idempotente · 1 disparo por hora-bucket).
    - agent_pauses_workflow(workflow_id, lead_id, reason, db)
        Marca el workflow como pausado en la lead state machine (upsert idempotente)
        y suspende los workflow_runs activos del par (workflow, lead).

Collections:
    - conversation_workflow_pauses   (estado de pausa por workflow+lead · idempotente)
    - workflows / workflow_runs       (propiedad de workflow_engine · solo lectura/mark)

FAIL-OPEN: si el engine subyacente falla, retorna shape neutro sin crash.
"""
from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

log = logging.getLogger("dmx.conversation_workflow_bridge")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _exec_seed(workflow_id: str, lead_id: Optional[str]) -> str:
    """execution_id determinístico → idempotency por hora-bucket."""
    bucket = _now().strftime("%Y%m%d%H")
    seed = f"agentwf|{workflow_id}|{lead_id}|{bucket}"
    return "wfexec_" + hashlib.sha1(seed.encode("utf-8")).hexdigest()[:16]


def _pause_id(workflow_id: str, lead_id: Optional[str]) -> str:
    seed = f"pause|{workflow_id}|{lead_id}"
    return "wfpause_" + hashlib.sha1(seed.encode("utf-8")).hexdigest()[:16]


async def agent_triggers_workflow(workflow_id: str, lead_id: Optional[str], db) -> Dict[str, Any]:
    """Dispara un workflow desde la conversación. Idempotente · FAIL-OPEN.

    Returns:
        {ok, triggered, idempotent, workflow_id, lead_id, run_id, execution_id, reason?}
    """
    if not workflow_id:
        return {"ok": False, "triggered": False, "idempotent": False, "reason": "missing_workflow_id"}
    if db is None:
        return {"ok": False, "triggered": False, "idempotent": False, "reason": "no_db",
                "workflow_id": workflow_id, "lead_id": lead_id}

    exec_id = _exec_seed(workflow_id, lead_id)
    try:
        wf = await db.workflows.find_one(
            {"id": workflow_id, "deleted_at": None}, {"_id": 0}
        )
        if not wf:
            return {"ok": False, "triggered": False, "idempotent": False,
                    "reason": "workflow_not_found", "workflow_id": workflow_id, "lead_id": lead_id}
        if wf.get("status") != "active":
            return {"ok": False, "triggered": False, "idempotent": False,
                    "reason": "workflow_not_active", "workflow_id": workflow_id, "lead_id": lead_id}

        # No disparar si está pausado para este lead
        if await _is_paused(db, workflow_id, lead_id):
            return {"ok": True, "triggered": False, "idempotent": True,
                    "reason": "paused", "workflow_id": workflow_id, "lead_id": lead_id,
                    "execution_id": exec_id}

        # Import perezoso → módulo standalone sin dependencia dura al engine en import-time
        from workflow_engine import execute_workflow

        result = await execute_workflow(db, wf, lead_id=lead_id, execution_id=exec_id)
        if not result.get("ok"):
            return {"ok": False, "triggered": False, "idempotent": False,
                    "reason": result.get("error", "execute_failed"),
                    "workflow_id": workflow_id, "lead_id": lead_id, "execution_id": exec_id}

        was_idempotent = result.get("skipped") == "idempotent"
        return {
            "ok": True,
            "triggered": not was_idempotent,
            "idempotent": was_idempotent,
            "workflow_id": workflow_id,
            "lead_id": lead_id,
            "run_id": result.get("run_id"),
            "execution_id": exec_id,
        }
    except Exception as exc:  # FAIL-OPEN
        log.warning(f"[conversation_workflow] trigger failed: {exc}")
        return {"ok": False, "triggered": False, "idempotent": False,
                "reason": "engine_error", "error": str(exc),
                "workflow_id": workflow_id, "lead_id": lead_id, "execution_id": exec_id}


async def agent_pauses_workflow(
    workflow_id: str, lead_id: Optional[str], reason: str, db
) -> Dict[str, Any]:
    """Pausa un workflow para un lead en la lead state machine. Idempotente · FAIL-OPEN.

    Returns:
        {ok, paused, idempotent, pause_id, workflow_id, lead_id, reason, runs_suspended}
    """
    if not workflow_id:
        return {"ok": False, "paused": False, "idempotent": False, "reason": "missing_workflow_id"}
    if db is None:
        return {"ok": False, "paused": False, "idempotent": False, "reason": "no_db",
                "workflow_id": workflow_id, "lead_id": lead_id}

    pid = _pause_id(workflow_id, lead_id)
    doc = {
        "pause_id": pid,
        "workflow_id": workflow_id,
        "lead_id": lead_id,
        "reason": reason or "",
        "paused_at": _now(),
        "active": True,
    }
    try:
        res = await db.conversation_workflow_pauses.update_one(
            {"pause_id": pid},
            {"$setOnInsert": doc},
            upsert=True,
        )
        was_new = getattr(res, "upserted_id", None) is not None

        # Suspende runs activos del par (workflow, lead) en la state machine
        runs_suspended = 0
        try:
            run_filter: Dict[str, Any] = {"workflow_id": workflow_id, "status": "running"}
            if lead_id is not None:
                run_filter["lead_id"] = lead_id
            upd = await db.workflow_runs.update_many(
                run_filter,
                {"$set": {"status": "paused", "paused_reason": reason or "", "paused_at": _now()}},
            )
            runs_suspended = getattr(upd, "modified_count", 0) or 0
        except Exception as exc:
            log.warning(f"[conversation_workflow] suspend runs failed: {exc}")

        return {
            "ok": True,
            "paused": was_new,
            "idempotent": not was_new,
            "pause_id": pid,
            "workflow_id": workflow_id,
            "lead_id": lead_id,
            "reason": reason or "",
            "runs_suspended": runs_suspended,
        }
    except Exception as exc:  # FAIL-OPEN
        log.warning(f"[conversation_workflow] pause failed: {exc}")
        return {"ok": False, "paused": False, "idempotent": False,
                "reason": "persist_error", "error": str(exc),
                "workflow_id": workflow_id, "lead_id": lead_id}


async def _is_paused(db, workflow_id: str, lead_id: Optional[str]) -> bool:
    try:
        pid = _pause_id(workflow_id, lead_id)
        found = await db.conversation_workflow_pauses.find_one(
            {"pause_id": pid, "active": True}, {"_id": 1}
        )
        return found is not None
    except Exception:
        return False  # FAIL-OPEN → no bloquear disparo si la check falla


async def ensure_indexes(db) -> None:
    try:
        await db.conversation_workflow_pauses.create_index("pause_id", unique=True)
        await db.conversation_workflow_pauses.create_index(
            [("workflow_id", 1), ("lead_id", 1)], name="idx_cwf_pause_pair", background=True
        )
    except Exception as exc:
        log.warning(f"[conversation_workflow] ensure_indexes failed: {exc}")
