"""
Cerebro DMX · Etapa 0 — STORE (la cola de tareas de agente, gobernada)
======================================================================
Toda acción que un agente propone vive aquí como una "tarea", SIEMPRE atada a
una org (tenant) y con rastro de auditoría. La Sala de Control (Etapa 3) lee de
aquí. Atomicidad sin transacciones (Mongo standalone): aprobar/rechazar usa CAS
(filtro por estado actual + check de modified_count). Etapa 0 = el almacén + sus
índices + auditoría; NO ejecuta acciones todavía.
"""
import uuid
from datetime import datetime, timezone, timedelta

from .contract import CEREBRO_TASKS, TaskStatus
from .guardrails import authorize, can_view_task, tenant_of, role_of

# TTL de tareas terminadas (limpieza · 90 días)
_DONE_TTL_DAYS = 90


def _now():
    return datetime.now(timezone.utc)


def _uid():
    return f"ctask_{uuid.uuid4().hex[:12]}"


async def ensure_cerebro_indexes(db):
    """Índices de la cola de tareas. Aislamiento + Sala de Control rápidos."""
    col = db[CEREBRO_TASKS]
    await col.create_index([("tenant_id", 1), ("status", 1), ("created_at", -1)])
    await col.create_index([("tenant_id", 1), ("user_id", 1), ("status", 1)])
    await col.create_index([("tenant_id", 1), ("goal_id", 1)])
    await col.create_index("id", unique=True)
    # TTL: barre tareas terminadas viejas (expires_at lo fija mark_done/reject)
    try:
        await col.create_index("expires_at", expireAfterSeconds=0)
    except Exception:
        pass


def _uid_of(user):
    return getattr(user, "user_id", None) or (user.get("user_id") if isinstance(user, dict) else None)


async def propose_task(db, user, *, action, goal_id=None, params=None, proposed_by="cerebro",
                       reason="", run_id=None, step_index=None, needs_approval_override=None):
    """Un agente PROPONE una acción. Pasa por los candados (authorize). Si es
    delicada/irreversible queda en AWAITING_APPROVAL (espera OK humano).
    needs_approval_override: lo calcula el orquestador con la config personalizada
    (autonomía + 'mi delicado' + confianza ganada). Si None, usa la regla base."""
    auth = authorize(user, action)
    if not auth["ok"]:
        return {"ok": False, "reason": auth["reason"]}
    na = auth["needs_approval"] if needs_approval_override is None else bool(needs_approval_override)
    status = TaskStatus.AWAITING_APPROVAL if na else TaskStatus.PROPOSED
    now = _now()
    task = {
        "id": _uid(),
        "tenant_id": auth["tenant_id"],          # candado #1: atada a la org
        "role": auth["role"],
        "user_id": _uid_of(user),
        "goal_id": goal_id,
        "run_id": run_id,                        # encadenamiento: a qué corrida de meta pertenece
        "step_index": step_index,                # orden dentro del plan
        "action": action,
        "params": params or {},
        "status": status,
        "delicate": auth["delicate"],
        "needs_approval": na,
        "reversible": auth.get("delicate") is False,
        "proposed_by": proposed_by,
        "reason": reason,
        "decision": None,
        "result": None,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
        "audit": [{"at": now.isoformat(), "event": "proposed", "by": proposed_by, "detail": action}],
    }
    await db[CEREBRO_TASKS].insert_one(dict(task))
    task.pop("_id", None)
    return {"ok": True, "task": task}


async def get_task(db, user, task_id):
    """Lee una tarea SOLO si es visible para el usuario (candado #1)."""
    t = await db[CEREBRO_TASKS].find_one({"id": task_id}, {"_id": 0})
    return t if (t and can_view_task(user, t)) else None


async def get_run_tasks(db, user, run_id):
    """Tareas de una corrida de meta, ordenadas por paso (scopeado a la org)."""
    cur = db[CEREBRO_TASKS].find(
        {"tenant_id": tenant_of(user), "run_id": run_id}, {"_id": 0}
    ).sort("step_index", 1)
    return [t async for t in cur]


async def _transition(db, user, task_id, from_status, to_status, extra=None, event=None):
    """CAS genérico de estado (atómico, scopeado a la org)."""
    now = _now()
    set_doc = {"status": to_status, "updated_at": now.isoformat()}
    if extra:
        set_doc.update(extra)
    res = await db[CEREBRO_TASKS].update_one(
        {"id": task_id, "tenant_id": tenant_of(user), "status": from_status},
        {"$set": set_doc,
         "$push": {"audit": {"at": now.isoformat(), "event": event or to_status, "by": _uid_of(user)}}},
    )
    return res.modified_count == 1


async def start_execution(db, user, task_id):
    """proposed/approved → executing (CAS). Solo si era auto (proposed) o ya aprobada."""
    for src in (TaskStatus.PROPOSED, TaskStatus.APPROVED):
        if await _transition(db, user, task_id, src, TaskStatus.EXECUTING, event="executing"):
            return {"ok": True}
    return {"ok": False, "reason": "no estaba lista para ejecutar"}


async def complete_task(db, user, task_id, result):
    """executing → done (CAS) + guarda resultado + TTL."""
    extra = {"result": result, "expires_at": _now() + timedelta(days=_DONE_TTL_DAYS)}
    ok = await _transition(db, user, task_id, TaskStatus.EXECUTING, TaskStatus.DONE, extra, "done")
    return {"ok": ok}


async def fail_task(db, user, task_id, error):
    ok = await _transition(db, user, task_id, TaskStatus.EXECUTING, TaskStatus.FAILED,
                           {"error": str(error)[:500]}, "failed")
    return {"ok": ok}


async def rollback_task(db, user, task_id):
    """done → rolled_back (deshacer). En E1 marca el estado; el 'compensate' real
    de cada acción se cablea en E2 junto con su executor."""
    ok = await _transition(db, user, task_id, TaskStatus.DONE, TaskStatus.ROLLED_BACK, None, "rolled_back")
    return {"ok": ok}


async def list_tasks(db, user, *, status=None, limit=100):
    """Tareas VISIBLES para este usuario (candado #1 + por-rol). Para la Sala de Control."""
    q = {"tenant_id": tenant_of(user)}
    if role_of(user) != "superadmin":
        uid = getattr(user, "user_id", None) or (user.get("user_id") if isinstance(user, dict) else None)
        q["user_id"] = uid
    if status:
        q["status"] = status if isinstance(status, str) else {"$in": list(status)}
    cur = db[CEREBRO_TASKS].find(q, {"_id": 0}).sort("created_at", -1).limit(limit)
    return [t async for t in cur]


async def _decide(db, user, task_id, *, approve: bool, edits=None):
    """Aprobar/rechazar una tarea DELICADA. CAS: solo si sigue AWAITING_APPROVAL
    y es de la org del usuario (no se puede decidir sobre otra org)."""
    task = await db[CEREBRO_TASKS].find_one({"id": task_id}, {"_id": 0})
    if not task or not can_view_task(user, task):
        return {"ok": False, "reason": "no encontrada o fuera de tu alcance"}
    new_status = TaskStatus.APPROVED if approve else TaskStatus.REJECTED
    uid = getattr(user, "user_id", None) or (user.get("user_id") if isinstance(user, dict) else None)
    now = _now()
    decision = {"by": uid, "at": now.isoformat(), "action": "approve" if approve else "reject", "edits": edits or {}}
    set_doc = {"status": new_status, "updated_at": now.isoformat(), "decision": decision}
    if not approve:
        set_doc["expires_at"] = now + timedelta(days=_DONE_TTL_DAYS)
    res = await db[CEREBRO_TASKS].update_one(
        {"id": task_id, "tenant_id": tenant_of(user), "status": TaskStatus.AWAITING_APPROVAL},
        {"$set": set_doc,
         "$push": {"audit": {"at": now.isoformat(), "event": decision["action"], "by": uid}}},
    )
    if res.modified_count != 1:
        return {"ok": False, "reason": "ya no estaba pendiente de aprobación (carrera)"}
    return {"ok": True, "status": new_status}


async def approve_task(db, user, task_id, edits=None):
    return await _decide(db, user, task_id, approve=True, edits=edits)


async def reject_task(db, user, task_id):
    return await _decide(db, user, task_id, approve=False)
