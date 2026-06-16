"""Kill-switch global de IA a nivel del cliente LLM (Tanda seguridad 2026-06-16).

Problema: ~45 motores llaman `chat.send_message()` directo, saltándose
`services/llm_guard`. Así, `AI_DISABLED` (apagador de emergencia) NO los cortaba —
"apagar la IA" no apagaba la IA.

Solución: parchar UNA sola vez `LlmChat.send_message` al arranque para que respete
el apagador de entorno. Cubre TODOS los motores (presentes y futuros) sin tocar
cada call-site, que es frágil y se desincroniza.

Alcance: el corte DURO por entorno (`AI_DISABLED`). El tope por-tenant y el toggle
de plataforma se siguen evaluando en `services/llm_guard.send_with_timeout` para
quien lo use; este parche garantiza el PISO de emergencia para todo el código.
"""
from __future__ import annotations

import logging

log = logging.getLogger("dmx.llm_killswitch")


class AIDisabledError(RuntimeError):
    """Se lanza cuando una llamada LLM se intenta con la IA apagada (AI_DISABLED).

    Los motores con `try/except` alrededor de `send_message` degradan a su heurística
    de respaldo; el resto falla fuerte y visible (correcto en una emergencia de corte)."""


def install_llm_killswitch() -> bool:
    """Idempotente. Devuelve True si quedó instalado (o ya estaba)."""
    try:
        from emergentintegrations.llm.chat import LlmChat  # type: ignore
    except Exception as e:  # la lib puede no estar disponible en algunos entornos
        log.warning(f"[llm_killswitch] LlmChat no importable; kill-switch global NO instalado: {e}")
        return False
    if getattr(LlmChat, "_dmx_killswitch_installed", False):
        return True

    _orig_send = LlmChat.send_message

    async def _guarded_send(self, *args, **kwargs):
        # Import tardío para evitar ciclos de import durante el boot.
        from ai_budget import ai_disabled_env
        if ai_disabled_env():
            raise AIDisabledError("IA apagada globalmente (AI_DISABLED) — llamada LLM bloqueada")
        return await _orig_send(self, *args, **kwargs)

    LlmChat.send_message = _guarded_send
    LlmChat._dmx_killswitch_installed = True
    log.info("[llm_killswitch] kill-switch global de IA instalado sobre LlmChat.send_message")
    return True
