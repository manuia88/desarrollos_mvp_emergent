"""
Cerebro DMX · Etapa 0 — CANDADOS (las reglas de seguridad)
==========================================================
Defense-in-depth ANTES de que cualquier agente actúe. Tres candados:
  1) AISLAMIENTO por org (tenant): un agente NUNCA toca data de otra org.
  2) ALLOW-LIST por rol: un perfil solo dispara las acciones de su rol.
  3) APROBACIÓN humana: las acciones DELICADAS siempre piden OK.
Todo lo que el Cerebro haga pasa por aquí. Si la regla no aplica → se NIEGA
(fail-closed), no se asume permiso.
"""
from .contract import (
    ROLE_ALLOWED_ACTIONS, DELICATE_ACTIONS, ACTION_REGISTRY, TaskStatus,
)


def tenant_of(user) -> str:
    """Org del usuario (mismo helper que el resto del backend)."""
    return getattr(user, "tenant_id", None) or (user.get("tenant_id") if isinstance(user, dict) else None) or "default_org"


def role_of(user) -> str:
    return getattr(user, "role", None) or (user.get("role") if isinstance(user, dict) else None) or "buyer"


def tenant_scope(user) -> dict:
    """Filtro Mongo que ATA cualquier query a la org del usuario. Candado #1.
    Toda lectura/escritura del Cerebro debe incluir este filtro."""
    return {"tenant_id": tenant_of(user)}


def is_action_known(action: str) -> bool:
    return action in ACTION_REGISTRY


def is_action_allowed(role: str, action: str) -> bool:
    """Candado #2: ¿el rol puede disparar esta acción? Fail-closed."""
    if not is_action_known(action):
        return False
    return action in ROLE_ALLOWED_ACTIONS.get(role, set())


def is_delicate(action: str) -> bool:
    """Candado #3: ¿toca el mundo real (dinero/envío/firma/dato personal)?"""
    return action in DELICATE_ACTIONS


def requires_approval(action: str) -> bool:
    """Una acción necesita OK humano si es delicada O si es irreversible."""
    meta = ACTION_REGISTRY.get(action, {})
    return is_delicate(action) or not meta.get("reversible", False)


def initial_status(action: str) -> str:
    """Estado inicial de la tarea según si necesita aprobación."""
    return TaskStatus.AWAITING_APPROVAL if requires_approval(action) else TaskStatus.PROPOSED


def authorize(user, action: str) -> dict:
    """Punto ÚNICO de autorización. Devuelve {ok, reason, delicate, status, tenant_id}.
    Si ok=False, el Cerebro NO crea ni corre la tarea."""
    role = role_of(user)
    if not is_action_known(action):
        return {"ok": False, "reason": f"acción desconocida: {action}"}
    if not is_action_allowed(role, action):
        return {"ok": False, "reason": f"rol '{role}' no autorizado para '{action}'"}
    return {
        "ok": True,
        "reason": "",
        "delicate": is_delicate(action),
        "needs_approval": requires_approval(action),
        "status": initial_status(action),
        "tenant_id": tenant_of(user),
        "role": role,
    }


def can_view_task(user, task: dict) -> bool:
    """¿Este usuario puede VER esta tarea? (para la Sala de Control)
    - Distinta org → NUNCA (candado #1).
    - Superadmin → ve toda su org (agregado gobernado).
    - Resto → solo sus propias tareas."""
    if not task or task.get("tenant_id") != tenant_of(user):
        return False
    if role_of(user) == "superadmin":
        return True
    uid = getattr(user, "user_id", None) or (user.get("user_id") if isinstance(user, dict) else None)
    return task.get("user_id") == uid
