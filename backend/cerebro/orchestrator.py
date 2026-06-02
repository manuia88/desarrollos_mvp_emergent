"""
Cerebro DMX · Etapa 1 — ORQUESTADOR MÍNIMO (el cerebro que dirige)
==================================================================
El salto de "AI Agents" → "Agentic": recibe una META, la parte en un PLAN ordenado,
corre los pasos ENCADENADOS (el resultado de uno alimenta al siguiente), PAUSA en lo
delicado para tu OK, y todo es reversible/auditable.

Diferencia vs `agent_workforce/orchestrator.py` (que es un fan-out ciego a una cola plana):
aquí hay META + orden + encadenamiento + gate de aprobación + reversibilidad. Y REUSA a
los 5 agentes/motores como "músculo" (cada ejecutor llama al motor real en Etapa 2).

Apagado por defecto: solo corre si CEREBRO_ENABLED. En E1 los ejecutores son STUB
(producen un resultado creíble + escriben memoria) para PROBAR el loop sin tocar el
mundo real; en E2 se cambian por los motores reales (enrichment, DISC, nurturer, pricing…).
"""
import os
import logging
from .contract import TaskStatus
from . import store
from .config import effective_needs_approval, custom_steps

log = logging.getLogger("dmx.cerebro.orchestrator")


def _enabled():
    return os.environ.get("CEREBRO_ENABLED") == "true"

# ─── PLAYBOOKS: meta (por rol) → plan ORDENADO de acciones ────────────────────
# El último paso suele ser DELICADO (envío/oferta) → ahí pausa para tu OK.
PLAYBOOKS = {
    "advisor": {
        "work_lead": [
            "advisor.enrich_lead", "advisor.classify_lead", "advisor.propose_angle",
            "advisor.draft_message", "advisor.route_lead",
            "comm.send_external",   # DELICADA → pausa para aprobación
        ],
    },
    "asesor_admin": {"work_lead": None},   # hereda de advisor (resuelto abajo)
    "asesor_freelance": {"work_lead": None},
    "buyer": {
        "find_home": [
            "buyer.search", "buyer.vet_property", "buyer.simulate_finance",
            "buyer.shortlist", "buyer.request_visit",
        ],
    },
    "comprador": {"find_home": None},
    "developer": {
        "sell_project": [
            "dev.competitor_scan", "dev.forecast", "dev.price_suggest", "dev.generate_marketing",
            "content.publish_public",   # DELICADA → pausa
        ],
        "price_project": [
            "dev.competitor_scan", "dev.forecast", "dev.price_suggest",
            "deal.change_price",        # DELICADA → pausa
        ],
        "check_competition": ["dev.competitor_scan"],
        "forecast_sales":    ["dev.forecast"],
        "zone_intel":        ["dev.market_pulse", "dev.zone_price", "dev.zone_risk", "dev.competitor_scan"],
        "make_marketing":    ["dev.generate_marketing", "dev.update_landing"],
        "attract_buyers":    ["dev.generate_marketing", "dev.social_cards", "dev.auto_content",
                              "content.publish_public"],  # DELICADA → pausa
        "project_health":    ["dev.health_alert", "dev.inventory_check", "dev.cashflow"],
        "where_next":        ["dev.where_to_build", "dev.zone_risk", "dev.zone_price"],
        "money_review":      ["dev.cashflow"],
        "investor_report":   ["dev.forecast", "dev.cashflow", "dev.weekly_report"],
        "team_review":       ["dev.team_metrics", "dev.assign_advisors"],
        # game-changers (consulta directa · lo que solo DMX sabe)
        "real_prices":       ["dev.closing_prices"],
        "time_to_sell":      ["dev.days_on_market"],
        "true_value":        ["dev.avm_value"],
        "what_if":           ["dev.what_if"],
        "who_buys":          ["dev.who_buys"],
        "winning_amenity":   ["dev.best_amenity"],
        "value_check":       ["dev.value_index"],
        "price_timing":      ["dev.price_timing"],
        "hot_leads":         ["dev.hot_leads"],
        "rising_zone":       ["dev.zone_trend"],
        "my_profit":         ["dev.profit_projection"],
        "beat_competition":  ["dev.lookalike"],
        "compare_projects":  ["dev.compare_projects"],
    },
    "developer_admin": {"sell_project": None},
    "superadmin": {
        "monitor_network": ["admin.network_pulse", "admin.model_health"],
    },
}
# Alias de roles que comparten plan
_PLAN_ALIASES = {
    "asesor_admin": "advisor", "asesor_freelance": "advisor",
    "comprador": "buyer", "developer_admin": "developer", "developer_member": "developer",
}


def get_plan(role, goal_id):
    base_role = _PLAN_ALIASES.get(role, role)
    return (PLAYBOOKS.get(base_role) or {}).get(goal_id)


# ─── EJECUTORES (E2 · motores reales defensivos · cerebro/executors.py) ───────
# Firma: async fn(db, user, params, context) → dict. Cada uno llama su motor real
# con fallback heurístico (fail-open) y alimenta la memoria gobernada.
from .executors import REGISTRY as STEP_EXECUTORS


async def _generic(action):
    """Ejecutor genérico para acciones del catálogo sin uno específico: devuelve un
    resultado limpio con la etiqueta del catálogo (la frase humana la pone el frontend)."""
    from .contract import ACTION_REGISTRY
    return {"engine": "auto", "summary": ACTION_REGISTRY.get(action, {}).get("label", "Paso hecho")}


async def _execute_step(db, user, task):
    """Corre el ejecutor de un paso (start→exec→complete/fail). Devuelve el result."""
    action = task["action"]
    fn = STEP_EXECUTORS.get(action)
    started = await store.start_execution(db, user, task["id"])
    if not started["ok"]:
        return {"ok": False, "reason": started["reason"]}
    try:
        result = await fn(db, user, task.get("params", {}), task.get("_ctx", {})) if fn else await _generic(action)
        await store.complete_task(db, user, task["id"], result)
        return {"ok": True, "result": result}
    except Exception as e:
        log.warning(f"[orchestrator] paso {action} falló: {e}")
        await store.fail_task(db, user, task["id"], e)
        return {"ok": False, "reason": str(e)}


async def run_goal(db, user, goal_id, context=None):
    """Corre una meta: plan ordenado, encadena, pausa en lo delicado.
    Devuelve {status: done|paused|error, run_id, results, awaiting?}."""
    if not _enabled():
        return {"ok": False, "status": "disabled", "reason": "CEREBRO_ENABLED off"}
    from .guardrails import role_of
    role = role_of(user)
    plan = get_plan(role, goal_id) or await custom_steps(db, user, goal_id)   # incluye tarjetas propias
    if not plan:
        return {"ok": False, "status": "error", "reason": f"sin plan para {role}/{goal_id}"}
    run_id = store._uid().replace("ctask_", "crun_")
    ctx = dict(context or {})
    results = []
    for i, action in enumerate(plan):
        na = await effective_needs_approval(db, user, action)   # candado personalizado
        pr = await store.propose_task(db, user, action=action, goal_id=goal_id,
                                      params=ctx, proposed_by="orchestrator",
                                      run_id=run_id, step_index=i, needs_approval_override=na)
        if not pr["ok"]:
            return {"ok": False, "status": "error", "run_id": run_id, "reason": pr["reason"], "results": results}
        task = pr["task"]
        if task["needs_approval"]:
            # GATE: lo delicado pausa hasta tu OK. resume_run continúa después.
            return {"ok": True, "status": "paused", "run_id": run_id,
                    "awaiting": {"task_id": task["id"], "action": action, "step": i},
                    "results": results}
        task["_ctx"] = ctx
        ex = await _execute_step(db, user, task)
        if not ex["ok"]:
            return {"ok": False, "status": "error", "run_id": run_id, "reason": ex["reason"], "results": results}
        ctx[f"step_{i}"] = ex["result"]
        results.append({"step": i, "action": action, "result": ex["result"]})
    return {"ok": True, "status": "done", "run_id": run_id, "results": results}


async def resume_run(db, user, run_id):
    """Continúa una corrida después de que el humano APROBÓ el paso delicado.
    Ejecuta el paso aprobado y sigue con los pasos restantes del plan."""
    if not _enabled():
        return {"ok": False, "status": "disabled"}
    tasks = await store.get_run_tasks(db, user, run_id)
    if not tasks:
        return {"ok": False, "status": "error", "reason": "corrida no encontrada"}
    role = tasks[0].get("role")
    goal_id = tasks[0].get("goal_id")
    plan = get_plan(role, goal_id) or await custom_steps(db, user, goal_id) or []
    done_idx = {t["step_index"] for t in tasks if t["status"] in (TaskStatus.DONE,)}
    ctx = {}
    for t in tasks:
        if t["status"] == TaskStatus.DONE and t.get("result"):
            ctx[f"step_{t['step_index']}"] = t["result"]
    results = []
    # 1) ejecutar el paso aprobado (si lo hay)
    approved = [t for t in tasks if t["status"] == TaskStatus.APPROVED]
    for t in approved:
        t["_ctx"] = ctx
        ex = await _execute_step(db, user, t)
        if not ex["ok"]:
            return {"ok": False, "status": "error", "run_id": run_id, "reason": ex["reason"]}
        ctx[f"step_{t['step_index']}"] = ex["result"]
        done_idx.add(t["step_index"])
        results.append({"step": t["step_index"], "action": t["action"], "result": ex["result"]})
    # 2) seguir con los pasos restantes del plan
    for i in range(len(plan)):
        if i in done_idx:
            continue
        action = plan[i]
        na = await effective_needs_approval(db, user, action)
        pr = await store.propose_task(db, user, action=action, goal_id=goal_id, params=ctx,
                                      proposed_by="orchestrator", run_id=run_id, step_index=i,
                                      needs_approval_override=na)
        if not pr["ok"]:
            return {"ok": False, "status": "error", "run_id": run_id, "reason": pr["reason"]}
        task = pr["task"]
        if task["needs_approval"]:
            return {"ok": True, "status": "paused", "run_id": run_id,
                    "awaiting": {"task_id": task["id"], "action": action, "step": i}, "results": results}
        task["_ctx"] = ctx
        ex = await _execute_step(db, user, task)
        if not ex["ok"]:
            return {"ok": False, "status": "error", "run_id": run_id, "reason": ex["reason"]}
        ctx[f"step_{i}"] = ex["result"]
        results.append({"step": i, "action": action, "result": ex["result"]})
    return {"ok": True, "status": "done", "run_id": run_id, "results": results}
