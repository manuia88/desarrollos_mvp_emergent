"""W7.AS.3.F · Conversation Cost Optimizer — 3-tier model selection.

Picks the cheapest model that fits the task, escalating only when it pays off:

  Haiku  ($0.25/M)  · classification · intent detect · sentiment LLM · saludos cortos
  Sonnet ($3/M)     · conversación default con leads
  Opus   ($15/M)    · handoff/escalation review · self-tuning analysis · lead en riesgo

Pure module (no DB, no shared files). Consumed by the conversation engine in a
custom merge (Terminal D wires it). FAIL-OPEN: ante cualquier error → Sonnet.
"""
from __future__ import annotations

import logging
import os

log = logging.getLogger("dmx.conversation_cost_optimizer")

# Tier model ids (overridable por env · alineados con ai_budget.MODEL_COST_PER_1K)
HAIKU_MODEL = os.environ.get("CONVERSATION_HAIKU_MODEL", "claude-haiku-4-5-20251001")
SONNET_MODEL = os.environ.get("CONVERSATION_SONNET_MODEL", "claude-sonnet-4-5-20250929")
OPUS_MODEL = os.environ.get("CONVERSATION_OPUS_MODEL", "claude-opus-4-1-20250805")

# Thresholds (overridable para tuning sin redeploy)
LONG_HISTORY_THRESHOLD = int(os.environ.get("COST_OPT_LONG_HISTORY", "20"))
SHORT_TEXT_THRESHOLD = int(os.environ.get("COST_OPT_SHORT_TEXT", "50"))

# Intent buckets
_CLASSIFICATION_INTENTS = {
    "classification", "classify", "intent", "intent_detect", "sentiment",
    "email_detect", "tagging", "routing",
}
_ESCALATION_INTENTS = {
    "escalation_review", "escalation", "review", "handoff_review",
    "self_tuning", "analysis", "audit",
}

# Lightweight negative lexicon (lead en riesgo) — self-contained, no engine import
_NEG = (
    "no me interesa", "caro", "carísimo", "carisimo", "molesto", "enojado",
    "mal servicio", "estafa", "queja", "decepcion", "decepción", "pésimo",
    "pesimo", "no sirve", "cancelar", "reclamo", "horrible", "fraude", "engaño",
    "engano", "harto", "frustrado", "terrible",
)

_GREETINGS = (
    "hola", "buenas", "buenos dias", "buenos días", "buen dia", "buen día",
    "buenas tardes", "buenas noches", "que tal", "qué tal", "hey", "hi",
    "hello", "saludos", "ola",
)


def _is_negative(text: str) -> bool:
    t = (text or "").lower()
    return any(k in t for k in _NEG)


def _is_simple_greeting(text: str) -> bool:
    t = (text or "").strip().lower().strip("¡!¿?.,")
    if not t:
        return False
    if t in _GREETINGS:
        return True
    # "hola, buenas tardes" / "hey que tal" — empieza con un saludo y es corto
    return any(t.startswith(g) for g in _GREETINGS)


def select_model(
    user_text: str = "",
    conversation_history_count: int = 0,
    intent_hint: str = "conversation",
) -> str:
    """Returns a model id (haiku|sonnet|opus). FAIL-OPEN → Sonnet.

    Args:
        user_text: último mensaje del usuario.
        conversation_history_count: nº de turnos previos en el hilo.
        intent_hint: classification | conversation | escalation_review.
    """
    try:
        intent = (intent_hint or "conversation").strip().lower()

        # ── Tier base por intent ────────────────────────────────────────────
        if intent in _CLASSIFICATION_INTENTS:
            return HAIKU_MODEL
        if intent in _ESCALATION_INTENTS:
            return OPUS_MODEL

        # ── Default conversation → Sonnet, con heurísticas de ajuste ─────────
        text = user_text or ""
        try:
            history = int(conversation_history_count or 0)
        except (TypeError, ValueError):
            history = 0

        # Upgrade: hilo largo + sentimiento negativo → lead en riesgo → Opus
        if history > LONG_HISTORY_THRESHOLD and _is_negative(text):
            return OPUS_MODEL

        # Downgrade: mensaje corto + saludo simple → Haiku
        if len(text.strip()) < SHORT_TEXT_THRESHOLD and _is_simple_greeting(text):
            return HAIKU_MODEL

        return SONNET_MODEL
    except Exception as exc:  # FAIL-OPEN
        log.warning(f"[cost_optimizer] select_model failed, defaulting Sonnet: {exc}")
        return SONNET_MODEL


def model_tier(model: str) -> str:
    """Map a model id to its tier label: haiku | sonnet | opus | other."""
    m = (model or "").lower()
    if "haiku" in m:
        return "haiku"
    if "sonnet" in m:
        return "sonnet"
    if "opus" in m:
        return "opus"
    return "other"
