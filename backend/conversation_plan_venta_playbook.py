"""W7.AS.3.B — Plan Venta IA playbook (máquina de etapas del broker IA).

Módulo puro importable por conversation_engine.py. NO endpoints · NO UI.

Provee:
  - next_action(lead_id, conversation_state) -> dict
        Decide la siguiente etapa y la intención sugerida según el avance de la
        conversación, siguiendo el Plan Venta IA:
            descubrimiento → calificación → demo → objeciones → cierre
        Retorna {stage, suggested_intent, blocked_intents}.

Diseño: máquina de estados determinista y FAIL-OPEN. Lee señales blandas del
`conversation_state` (dict) y nunca asume una etapa más avanzada de la que las
señales justifican. Si el estado es inválido/incompleto → arranca en
descubrimiento (entrada segura).
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.plan_venta")

# Orden canónico de etapas del Plan Venta IA.
STAGES: List[str] = ["descubrimiento", "calificacion", "demo", "objeciones", "cierre"]

# Intención principal sugerida por etapa.
_STAGE_INTENT: Dict[str, str] = {
    "descubrimiento": "discover_needs",
    "calificacion":   "qualify_budget",
    "demo":           "present_units",
    "objeciones":     "handle_objection",
    "cierre":         "propose_close",
}

# Intenciones que NO deben dispararse antes de tiempo en cada etapa.
# (defensa: el engine no ofrece firma/cierre durante descubrimiento, etc.)
_STAGE_BLOCKED: Dict[str, List[str]] = {
    "descubrimiento": ["propose_close", "request_signature", "handle_objection"],
    "calificacion":   ["propose_close", "request_signature"],
    "demo":           ["request_signature"],
    "objeciones":     [],
    "cierre":         [],
}


def _has(state: Dict[str, Any], *keys: str) -> bool:
    """True si alguna de las flags está marcada como verdadera en el estado."""
    for k in keys:
        v = state.get(k)
        if v is True or (isinstance(v, (int, float)) and v > 0) or \
           (isinstance(v, str) and v.lower() in ("true", "yes", "done", "si", "sí")):
            return True
    return False


def _infer_stage(state: Dict[str, Any]) -> str:
    """Deriva la etapa actual desde las señales del conversation_state.

    Precedencia (de más avanzada a menos): cierre > objeciones > demo >
    calificación > descubrimiento. Respeta `current_stage` explícito si es
    válido, pero solo como punto de partida — nunca retrocede de señales reales.
    """
    # 1) Etapa explícita válida tiene prioridad si viene del engine.
    explicit = str(state.get("current_stage") or state.get("stage") or "").strip().lower()
    if explicit in STAGES:
        return explicit

    # 2) Inferencia por señales (de avanzada a inicial).
    if _has(state, "ready_to_close", "closing", "proposal_sent"):
        return "cierre"
    if _has(state, "objection_raised", "has_objections", "needs_objection_handling"):
        return "objeciones"
    if _has(state, "demo_done", "units_presented", "tour_scheduled", "demo_scheduled"):
        return "demo"
    if _has(state, "qualified", "budget_known", "financing_known"):
        return "calificacion"
    return "descubrimiento"


def next_action(lead_id: Optional[str], conversation_state: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Siguiente acción del broker IA para el prospecto.

    Args:
        lead_id: id del prospecto (se eco-devuelve para trazabilidad).
        conversation_state: dict con señales de avance (flags blandas).

    Returns:
        {
          "stage": <etapa actual>,
          "suggested_intent": <intención principal a ejecutar>,
          "blocked_intents": [<intenciones prohibidas en esta etapa>],
          "lead_id": <eco>,
        }
    FAIL-OPEN: ante cualquier error retorna la etapa de entrada segura.
    """
    try:
        state = conversation_state if isinstance(conversation_state, dict) else {}
        stage = _infer_stage(state)
        return {
            "stage": stage,
            "suggested_intent": _STAGE_INTENT[stage],
            "blocked_intents": list(_STAGE_BLOCKED[stage]),
            "lead_id": lead_id,
        }
    except Exception as exc:  # FAIL-OPEN
        log.debug(f"[plan_venta] next_action fail-open: {exc}")
        return {
            "stage": "descubrimiento",
            "suggested_intent": _STAGE_INTENT["descubrimiento"],
            "blocked_intents": list(_STAGE_BLOCKED["descubrimiento"]),
            "lead_id": lead_id,
        }
