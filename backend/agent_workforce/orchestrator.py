"""P2 · Agent Workforce · Orchestrator (T1 · owner shared).

Colecta acciones de los 5 agentes puros (Prospector + Nurturer = T1 · Closer + Analyst
+ Coach = T2/T3 importados FAIL-OPEN), cap-ea per-agente, y UPSERTA en
command_center_actions por (user_id, dedup_key) → idempotente, NO duplica al re-correr.

- status=pending solo en $setOnInsert → re-correr NO resucita acciones done/dismissed.
- expires_at se refresca en $set → la acción vigente sigue viva (horizonte de relevancia).
- audit_immutable.log + persistencia en agent_workforce_runs para el endpoint /status.
- register_cron: DAILY 07:00 UTC (01:00 MX) · max_instances=1 · slot LIBRE (no choca).

Los agentes T1 son heurísticos (sin LLM) → no consumen ai_budget directamente. Si un
agente delega a un motor LLM (p.ej. lead_nurture), ese motor trackea su propio costo.
"""
from __future__ import annotations

import importlib
import logging
import uuid
from typing import Any, Dict, List, Optional, Tuple

from .agent_common import (
    AGENT_DAILY_CAP_PER_TENANT,
    AGENT_NAMES,
    run_agent_safe,
    _now,
)

log = logging.getLogger("dmx.agent_workforce.orchestrator")

# (agent_name, module, fn). T1 garantizados · T2/T3 FAIL-OPEN si el módulo no existe aún.
_AGENT_SPECS: List[Tuple[str, str, str]] = [
    ("prospector", "agent_workforce.prospector", "run_prospector"),
    ("nurturer",   "agent_workforce.nurturer",   "run_nurturer"),
    ("closer",     "agent_workforce.closer",     "run_closer"),
    ("analyst",    "agent_workforce.analyst",    "run_analyst"),
    ("coach",      "agent_workforce.coach",      "run_coach"),
]

# Campos de contenido que se refrescan en cada UPSERT (NO status ni created_at).
_CONTENT_FIELDS = (
    "id", "dedup_key", "source_agent", "type", "lead_id", "title", "subtitle",
    "priority", "cta_actions", "icon_hint", "color_hint",
)


def _resolve_agent(module: str, fn: str):
    """Importa fn del módulo · None si no existe (T2/T3 ausente · FAIL-OPEN)."""
    try:
        mod = importlib.import_module(module)
        return getattr(mod, fn, None)
    except Exception as e:
        log.info(f"[orchestrator] agente {module}.{fn} no disponible (skip): {e}")
        return None


async def run_all_agents(
    db, user_id: str, tenant_id: Optional[str], trigger: str = "on-demand",
    only: Optional[str] = None,
) -> Dict[str, Any]:
    """Colecta de los 5 agentes → cap → UPSERT por dedup_key. Retorna summary.

    Cada agente corre aislado (run_agent_safe FAIL-OPEN): uno roto NO tumba el run.
    `only` (E6): corre SOLO ese agente (el botón por-agente ya no corre todos).
    """
    now = _now()
    by_agent: Dict[str, int] = {}
    capped: Dict[str, bool] = {}
    skipped: List[str] = []
    total_upserted = 0
    total_inserted = 0

    if not user_id:
        return {"ok": False, "error": "user_id requerido", "by_agent": {}, "total": 0}

    for name, module, fn in _AGENT_SPECS:
        if only and name != only:
            continue
        agent_fn = _resolve_agent(module, fn)
        if agent_fn is None:
            skipped.append(name)
            continue
        actions = await run_agent_safe(agent_fn, db, user_id, tenant_id, name)
        if len(actions) >= AGENT_DAILY_CAP_PER_TENANT:
            capped[name] = True
        by_agent[name] = 0
        for action in actions:
            try:
                dk = action.get("dedup_key")
                if not dk:
                    continue
                content = {k: action.get(k) for k in _CONTENT_FIELDS if k in action}
                res = await db.command_center_actions.update_one(
                    {"user_id": user_id, "dedup_key": dk},
                    {
                        "$set": {
                            **content,
                            "user_id": user_id,
                            "tenant_id": tenant_id,
                            "expires_at": action.get("expires_at"),
                            "updated_at": now,
                        },
                        "$setOnInsert": {"status": "pending", "created_at": now},
                    },
                    upsert=True,
                )
                by_agent[name] += 1
                total_upserted += 1
                if getattr(res, "upserted_id", None) is not None:
                    total_inserted += 1
            except Exception as e:
                log.warning(f"[orchestrator] upsert {name} falló: {e}")

    summary = {
        "id": f"awrun_{uuid.uuid4().hex[:10]}",
        "user_id": user_id,
        "tenant_id": tenant_id,
        "trigger": trigger,
        "ran_at": now,
        "by_agent": by_agent,
        "skipped_agents": skipped,
        "capped_agents": [k for k, v in capped.items() if v],
        "total_actions": total_upserted,
        "inserted": total_inserted,
    }
    if capped:
        log.info(f"[orchestrator] cap alcanzado ({AGENT_DAILY_CAP_PER_TENANT}) en: {list(capped)}")

    # Persistencia para /status (FAIL-OPEN · no rompe el run).
    try:
        await db.agent_workforce_runs.insert_one(dict(summary))
    except Exception as e:
        log.warning(f"[orchestrator] run summary persist: {e}")

    # Audit inmutable del run (FAIL-OPEN).
    try:
        import audit_immutable_engine
        await audit_immutable_engine.log(
            db, {"user_id": user_id, "role": "system"},
            "agent_workforce_run", "agent_workforce", user_id,
            after={"by_agent": by_agent, "total": total_upserted, "trigger": trigger},
        )
    except Exception as e:
        log.warning(f"[orchestrator] audit log: {e}")

    summary["ok"] = True
    return summary


async def run_cron_all(db) -> Dict[str, Any]:
    """Cron DAILY: corre run_all_agents para cada asesor activo. FAIL-OPEN por asesor."""
    asesores = await db.users.find(
        {"role": {"$in": ["advisor", "asesor", "asesor_admin"]}},
        {"_id": 0, "user_id": 1, "tenant_id": 1},
    ).to_list(5000)
    runs = 0
    total = 0
    for a in asesores:
        uid = a.get("user_id")
        if not uid:
            continue
        try:
            res = await run_all_agents(db, uid, a.get("tenant_id"), trigger="cron")
            runs += 1
            total += res.get("total_actions", 0)
        except Exception as e:
            log.warning(f"[orchestrator] cron run asesor {uid}: {e}")
    log.info(f"[orchestrator] cron daily: {runs} asesores · {total} acciones upserted")
    return {"asesores": runs, "total_actions": total}


def register_cron(scheduler, db=None) -> None:
    """Registra el cron DAILY ~07:00 UTC (01:00 MX) · max_instances=1.

    Firma (scheduler, db) con fallback a (scheduler) — patrón W7.AS.3.E del server.
    Offset minute=10: entity_resolution_cron y external_insights_cron ya disparan a las
    07:00:00 UTC exactas → +10min evita contención del executor (3 crones mismo tick).
    """
    if not scheduler:
        return
    from apscheduler.triggers.cron import CronTrigger
    scheduler.add_job(
        run_cron_all,
        CronTrigger(hour=7, minute=10, timezone="UTC"),
        id="agent_workforce_daily",
        replace_existing=True,
        kwargs={"db": db},
        max_instances=1,
    )
    log.info("[orchestrator] agent_workforce daily cron scheduled @ 07:10 UTC (01:10 MX)")


async def ensure_indexes(db) -> None:
    """Índices: reusa command_center (advisor) + agent_workforce_runs. Idempotente."""
    try:
        from routes.advisor import ensure_command_center_indexes
        await ensure_command_center_indexes(db)
    except Exception as e:
        log.warning(f"[orchestrator] ensure_command_center_indexes: {e}")
    try:
        # Lectura /status: último run por owner.
        await db.agent_workforce_runs.create_index([("user_id", 1), ("ran_at", -1)])
        # TTL: limpia historial de runs a los 30 días (no esencial · housekeeping).
        await db.agent_workforce_runs.create_index("ran_at", expireAfterSeconds=2592000)
    except Exception as e:
        log.warning(f"[orchestrator] ensure agent_workforce_runs indexes: {e}")


def list_agents() -> List[str]:
    """Catálogo canónico de los 5 agentes (orden de display)."""
    return list(AGENT_NAMES)
