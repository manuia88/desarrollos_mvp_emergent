"""W7.AS.3.E (R2) — Conversation Confidence Score (ML loop).

Módulo PURO importable por conversation_engine (opcional). NO toca
server/engine/asistente/UI.

Idea: tras cada respuesta del agente, un LLM barato (Claude Haiku) se
auto-evalúa: recibe (user query + respuesta del agente) y devuelve un
confidence 0-100 + reason. Si confidence < 50 → marca la conversación para
handoff humano y loguea una alerta.

FAIL-OPEN: si Haiku falla / no hay key → confidence=70 (default seguro, NO
dispara falsa alarma de handoff) con fallback=true. track_ai_call tras la
llamada LLM exitosa.

Función pública:
  - score_reply(user_text, assistant_text, context) -> dict
        context (dict, opcional) puede traer: db, conversation_id, tenant_id.
        Si confidence<50 y hay db+conversation_id → set thread.status="handoff".
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, Optional

log = logging.getLogger("dmx.conversation_confidence")

HANDOFF_THRESHOLD = 50          # confidence < 50 → handoff
FALLBACK_CONFIDENCE = 70        # default seguro si LLM falla
CLAUDE_HAIKU_MODEL = "claude-haiku-4-5-20251001"

_SYSTEM = (
    "Eres un evaluador de calidad de un asesor inmobiliario IA. Recibes la "
    "pregunta del usuario y la respuesta del asesor. Devuelve SOLO un JSON: "
    '{"confidence": <0-100>, "reason": "<motivo breve es-MX>"}. confidence alto '
    "= la respuesta es correcta, útil y bien fundamentada; bajo = vaga, "
    "potencialmente incorrecta o evasiva."
)


def _fallback(reason: str = "llm_unavailable") -> Dict[str, Any]:
    return {"confidence": FALLBACK_CONFIDENCE, "reason": reason,
            "fallback": True, "handoff": False}


def _parse_llm(raw: str) -> Optional[Dict[str, Any]]:
    """Extrae {confidence, reason} del texto del LLM. None si no parseable."""
    if not raw:
        return None
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.S).strip()
    try:
        data = json.loads(text)
    except Exception:
        m = re.search(r"\{.*\}", text, flags=re.S)
        if not m:
            return None
        try:
            data = json.loads(m.group(0))
        except Exception:
            return None
    if not isinstance(data, dict) or "confidence" not in data:
        return None
    try:
        conf = max(0, min(100, int(round(float(data["confidence"])))))
    except Exception:
        return None
    return {"confidence": conf, "reason": str(data.get("reason") or "")[:240]}


async def _set_handoff(context: Dict[str, Any], confidence: int, reason: str) -> None:
    """Marca thread.status='handoff' + loguea alerta. Best-effort (no raise)."""
    db = context.get("db")
    conversation_id = context.get("conversation_id") or context.get("thread_id")
    if db is None or not conversation_id:
        return
    try:
        await db.conversation_threads.update_one(
            {"_id": conversation_id},
            {"$set": {"status": "handoff", "handoff_reason": "low_confidence",
                      "handoff_confidence": confidence}},
        )
    except Exception as exc:
        log.debug(f"[confidence] set handoff skip: {exc}")
    try:
        await db.conversation_confidence_alerts.insert_one({
            "conversation_id": conversation_id,
            "tenant_id": context.get("tenant_id"),
            "confidence": confidence, "reason": reason,
        })
    except Exception as exc:
        log.debug(f"[confidence] alert log skip: {exc}")


async def score_reply(user_text: str, assistant_text: str,
                      context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Auto-evalúa la respuesta del agente. Retorna:
        {"confidence": 0-100, "reason": str, "fallback": bool, "handoff": bool}

    FAIL-OPEN: ante cualquier fallo del LLM → confidence=70, fallback=true,
    handoff=false (no dispara falsa alarma).
    """
    ctx = context if isinstance(context, dict) else {}

    import os
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return _fallback("no_llm_key")

    try:
        from llm_client import LlmChat, UserMessage
        import secrets
        chat = LlmChat(
            api_key=api_key,
            session_id=f"confidence_{secrets.token_urlsafe(6)}",
            system_message=_SYSTEM,
        ).with_model("anthropic", CLAUDE_HAIKU_MODEL)
        user = (f"PREGUNTA DEL USUARIO:\n{(user_text or '')[:2000]}\n\n"
                f"RESPUESTA DEL ASESOR:\n{(assistant_text or '')[:2000]}")
        raw = await chat.send_message(UserMessage(text=user[:5000]))

        parsed = _parse_llm(str(raw) if raw is not None else "")
        if parsed is None:
            return _fallback("llm_unparseable")

        # track_ai_call post-LLM (best-effort)
        try:
            from ai_budget import track_ai_call
            db = ctx.get("db")
            if db is not None:
                t_in = (len(_SYSTEM) + len(user[:5000])) // 4
                t_out = len(str(raw)) // 4
                await track_ai_call(
                    db, dev_org_id=ctx.get("tenant_id") or "unknown",
                    model=CLAUDE_HAIKU_MODEL, tokens=0,
                    call_type="conversation_confidence",
                    tokens_in=t_in, tokens_out=t_out,
                    feature_key="conversation_confidence",
                )
        except Exception as exc:
            log.debug(f"[confidence] track_ai_call skip: {exc}")

        confidence = parsed["confidence"]
        handoff = confidence < HANDOFF_THRESHOLD
        if handoff:
            await _set_handoff(ctx, confidence, parsed["reason"])

        return {"confidence": confidence, "reason": parsed["reason"],
                "fallback": False, "handoff": handoff}

    except Exception as exc:  # FAIL-OPEN
        log.warning(f"[confidence] score_reply fail-open: {exc}")
        return _fallback("llm_error")
