"""
Cerebro DMX — capa de orquestación agéntica (central, multi-tenant, multi-perfil).
UN cerebro · 4 lentes (superadmin · asesor · developer · comprador).

Etapa 0 (cimientos + candados) — lo que vive aquí HOY:
  - contract  : el lenguaje común (estados, acciones, allow-list por rol, metas)
  - guardrails: los candados (aislamiento por org · allow-list · aprobación humana)
  - store     : la cola de tareas de agente (gobernada + auditada)
  - memory    : la memoria gobernada (retención + PII) — sustrato del Modelo del Mundo

Etapas siguientes (no aquí todavía): orquestador (E1) · cableado de motores (E2) ·
Sala de Control UI (E3) · loop de aprendizaje (E4) · QA seguridad (E5) · réplica dev (E6).

Apagado por defecto: el flag CEREBRO_ENABLED controla la EJECUCIÓN de agentes
(Etapa 1+). Los índices/colecciones se crean siempre (vacíos, inofensivos).
"""
import os

from .contract import (
    TaskStatus, ACTION_REGISTRY, DELICATE_ACTIONS, ROLE_ALLOWED_ACTIONS, GOALS,
    CEREBRO_TASKS, CEREBRO_MEMORY,
)
from .guardrails import (
    authorize, is_action_allowed, is_delicate, requires_approval,
    can_view_task, tenant_scope, tenant_of, role_of,
)
from .store import (
    ensure_cerebro_indexes, propose_task, list_tasks, approve_task, reject_task,
    get_task, get_run_tasks, start_execution, complete_task, fail_task, rollback_task,
)
from .memory import ensure_memory_indexes, remember, recall, redact_pii

CEREBRO_ENABLED = os.environ.get("CEREBRO_ENABLED") == "true"

# E2.5 · Personalización (config + confianza que se gana) + recomendaciones + catálogo.
from .contract import catalog_for_role, goals_for, ACTION_AREAS
from .config import (
    get_config, save_config, record_decision, effective_needs_approval,
    graduation_candidates, ensure_config_indexes, trust_level, DEFAULT_CONFIG,
    save_custom_goal, delete_custom_goal, custom_steps,
)
from .recommendations import build_recommendations, apply_recommendation

# E4 · Coach (loop de aprendizaje: calibración + lecciones + reentreno).
from .coach import (
    ensure_learning_indexes, log_prediction, resolve_predictions, calibration,
    recent_lessons, recent_retrains, retrain_signal, on_deal_closed, learning_snapshot,
    PRED_KINDS,
)

# Orquestador (Etapa 1) — se importa AL FINAL para evitar import circular.
from .orchestrator import run_goal, resume_run, get_plan, PLAYBOOKS, STEP_EXECUTORS


async def ensure_cerebro_all_indexes(db):
    """Punto único para el arranque del server: índices de tareas + memoria + config + aprendizaje."""
    await ensure_cerebro_indexes(db)
    await ensure_memory_indexes(db)
    await ensure_config_indexes(db)
    await ensure_learning_indexes(db)


__all__ = [
    "TaskStatus", "ACTION_REGISTRY", "DELICATE_ACTIONS", "ROLE_ALLOWED_ACTIONS", "GOALS",
    "CEREBRO_TASKS", "CEREBRO_MEMORY", "CEREBRO_ENABLED",
    "authorize", "is_action_allowed", "is_delicate", "requires_approval",
    "can_view_task", "tenant_scope", "tenant_of", "role_of",
    "ensure_cerebro_indexes", "ensure_memory_indexes", "ensure_cerebro_all_indexes",
    "propose_task", "list_tasks", "approve_task", "reject_task",
    "get_task", "get_run_tasks", "start_execution", "complete_task", "fail_task", "rollback_task",
    "remember", "recall", "redact_pii",
    "run_goal", "resume_run", "get_plan", "PLAYBOOKS", "STEP_EXECUTORS",
    "catalog_for_role", "goals_for", "ACTION_AREAS", "DEFAULT_CONFIG",
    "get_config", "save_config", "record_decision", "effective_needs_approval",
    "graduation_candidates", "ensure_config_indexes", "trust_level",
    "build_recommendations", "apply_recommendation",
    "ensure_learning_indexes", "log_prediction", "resolve_predictions", "calibration",
    "recent_lessons", "recent_retrains", "retrain_signal", "on_deal_closed", "learning_snapshot", "PRED_KINDS",
]
