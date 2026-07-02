"""P2 · Agent Workforce · API (4 endpoints).

GET  /api/agent-workforce/status            asesor · último run + acciones/agente (own)
POST /api/agent-workforce/run-now           asesor · on-demand (rate-limit 3/h)
GET  /api/agent-workforce/agents            asesor · 5 agentes + last_run + count
GET  /api/superadmin/agent-workforce/stats  superadmin · global + cost

Reusa require_advisor/get_db de routes.advisor. _assert owner: /status y /agents solo
leen acciones del caller (user_id) · stats es superadmin global.
"""
from __future__ import annotations

import logging
import time
from typing import Dict

from fastapi import APIRouter, HTTPException, Request

from routes.advisor import require_advisor, get_db
from agent_workforce.agent_common import AGENT_NAMES, AGENT_LABELS
from agent_workforce import orchestrator

log = logging.getLogger("dmx.routes.agent_workforce")

router = APIRouter(tags=["agent-workforce"])

# Rate-limit run-now: 3 por hora por usuario (in-memory · best-effort · FAIL-OPEN abierto).
_RUN_NOW_LIMIT = 3
_RUN_NOW_WINDOW_S = 3600
_run_now_buckets: Dict[str, list] = {}


def _check_run_now_rate(user_id: str) -> bool:
    """True si permitido. Limpia timestamps fuera de ventana."""
    now = time.time()
    bucket = [t for t in _run_now_buckets.get(user_id, []) if now - t < _RUN_NOW_WINDOW_S]
    if len(bucket) >= _RUN_NOW_LIMIT:
        _run_now_buckets[user_id] = bucket
        return False
    bucket.append(now)
    _run_now_buckets[user_id] = bucket
    return True


async def _pending_counts_by_agent(db, user_id: str) -> Dict[str, int]:
    """Acciones pending por source_agent del owner. FAIL-OPEN {}."""
    out: Dict[str, int] = {}
    try:
        async for row in db.command_center_actions.aggregate([
            {"$match": {"user_id": user_id, "status": "pending", "source_agent": {"$ne": None}}},
            {"$group": {"_id": "$source_agent", "n": {"$sum": 1}}},
        ]):
            if row.get("_id"):
                out[row["_id"]] = row.get("n", 0)
    except Exception as e:
        log.warning(f"[agent_workforce] pending_counts: {e}")
    return out


def _iso(v):
    try:
        return v.isoformat() if hasattr(v, "isoformat") else v
    except Exception:
        return v


@router.get("/api/agent-workforce/status")
async def status(request: Request):
    """Último run del asesor + conteo de acciones pending por agente."""
    user = await require_advisor(request)
    db = get_db(request)
    owner = user.user_id

    last_run = None
    try:
        rows = await db.agent_workforce_runs.find(
            {"user_id": owner}, {"_id": 0},
        ).sort("ran_at", -1).limit(1).to_list(1)
        if rows:
            last_run = rows[0]
            last_run["ran_at"] = _iso(last_run.get("ran_at"))
    except Exception as e:
        log.warning(f"[agent_workforce] status last_run: {e}")

    pending = await _pending_counts_by_agent(db, owner)
    return {
        "last_run": last_run,
        "pending_by_agent": pending,
        "total_pending": sum(pending.values()),
    }


@router.post("/api/agent-workforce/run-now")
async def run_now(request: Request, agent: str = None):
    """Corre los agentes on-demand para el asesor caller. Rate-limit 3/h.
    E6 · `agent` opcional → corre SOLO ese agente (el botón por-agente ya no corre todos)."""
    user = await require_advisor(request)
    db = get_db(request)
    if not _check_run_now_rate(user.user_id):
        raise HTTPException(429, "Límite alcanzado: máximo 3 ejecuciones por hora.")
    tenant_id = getattr(user, "tenant_id", None)
    summary = await orchestrator.run_all_agents(db, user.user_id, tenant_id, trigger="on-demand", only=agent)
    summary["ran_at"] = _iso(summary.get("ran_at"))
    return summary


@router.get("/api/agent-workforce/agents")
async def agents(request: Request):
    """Catálogo de los 5 agentes + acciones pending por agente + disponibilidad."""
    user = await require_advisor(request)
    db = get_db(request)
    pending = await _pending_counts_by_agent(db, user.user_id)

    # Determina qué agentes están disponibles (T2/T3 pueden no existir aún).
    available = set()
    for name, module, fn in orchestrator._AGENT_SPECS:
        if orchestrator._resolve_agent(module, fn) is not None:
            available.add(name)

    out = []
    for name in AGENT_NAMES:
        out.append({
            "name": name,
            "label": AGENT_LABELS.get(name, name),
            "available": name in available,
            "pending_actions": pending.get(name, 0),
        })
    return {"agents": out, "total": len(out)}


@router.get("/api/superadmin/agent-workforce/stats")
async def superadmin_stats(request: Request):
    """Global: runs, acciones por agente, costo AI (si los agentes delegan LLM)."""
    user = await require_advisor(request)
    if user.role != "superadmin":
        raise HTTPException(403, "Solo superadmin")
    db = get_db(request)

    total_runs = 0
    try:
        total_runs = await db.agent_workforce_runs.count_documents({})
    except Exception:
        pass

    by_agent: Dict[str, int] = {}
    try:
        async for row in db.command_center_actions.aggregate([
            {"$match": {"status": "pending", "source_agent": {"$ne": None}}},
            {"$group": {"_id": "$source_agent", "n": {"$sum": 1}}},
        ]):
            if row.get("_id"):
                by_agent[row["_id"]] = row.get("n", 0)
    except Exception as e:
        log.warning(f"[agent_workforce] stats by_agent: {e}")

    # Costo AI atribuible al workforce (feature_key prefijo). 0 mientras agentes sean heurísticos.
    ai_cost_mxn = 0.0
    ai_calls = 0
    try:
        async for ev in db.ai_call_events.aggregate([
            {"$match": {"feature_key": {"$regex": "^agent_workforce"}}},
            {"$group": {"_id": None, "cost": {"$sum": "$cost_mxn"}, "calls": {"$sum": 1}}},
        ]):
            ai_cost_mxn = round(ev.get("cost", 0) or 0, 2)
            ai_calls = ev.get("calls", 0)
    except Exception as e:
        log.warning(f"[agent_workforce] stats ai_cost: {e}")

    return {
        "total_runs": total_runs,
        "pending_by_agent": by_agent,
        "total_pending": sum(by_agent.values()),
        "agents_total": len(AGENT_NAMES),
        "ai_cost_mxn": ai_cost_mxn,
        "ai_calls": ai_calls,
    }
