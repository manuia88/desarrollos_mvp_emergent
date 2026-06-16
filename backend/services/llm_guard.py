"""C1 Escala · Timeout + tope de costo para llamadas de IA (LlmChat).

Problema que resuelve: `await chat.send_message(...)` puede colgarse 30s+ y
bloquear un worker; y se llamaba sin un tope de costo ANTES de gastar.
Este wrapper único:
  - aplica `asyncio.wait_for` (timeout configurable),
  - opcionalmente verifica presupuesto ANTES de gastar (si se pasa db+tenant),
  - FAIL-OPEN al fallback que dé quien llama (nunca tumba el endpoint).

Uso:
    from services.llm_guard import send_with_timeout
    raw = await send_with_timeout(chat, user_message, label="weekly_brief", timeout=25)
    if raw is None:  # timeout o presupuesto agotado → usar heurística/copy de respaldo
        ...
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Optional

log = logging.getLogger("dmx.llm_guard")

DEFAULT_TIMEOUT = 25.0  # segundos


async def within_budget(db, tenant_id: Optional[str]) -> bool:
    """Gobernanza de IA ANTES de gastar (regla 6): (1) kill-switch global, (2) tope por tenant.
    FAIL-CLOSED (regla 5): un estado desconocido NO autoriza gasto de IA. Reusa ai_budget."""
    # (1) Kill-switch global (env AI_DISABLED o flag de plataforma) — corta todo.
    try:
        from ai_budget import ai_kill_switch_active  # type: ignore
        if await ai_kill_switch_active(db):
            return False
    except Exception as e:
        log.error(f"[llm_guard] kill-switch no verificable; bloqueando por seguridad: {e}")
        return False
    # (2) Sin tenant: no hay tope por-tenant que evaluar (llamada de sistema); el kill-switch ya corrió.
    if not tenant_id:
        return True
    try:
        from ai_budget import is_within_budget  # type: ignore
        return bool(await is_within_budget(db, tenant_id))
    except Exception as e:
        log.error(f"[llm_guard] presupuesto no verificable para {tenant_id}; bloqueando por seguridad: {e}")
        return False


async def send_with_timeout(
    chat,
    message,
    *,
    label: str = "",
    timeout: float = DEFAULT_TIMEOUT,
    db=None,
    tenant_id: Optional[str] = None,
    fallback: Any = None,
) -> Any:
    """Envía a la IA con timeout y gobernanza (kill-switch + tope). Devuelve la respuesta
    cruda, o `fallback` si hay timeout / IA cortada / presupuesto agotado / error."""
    # Apagador de IA por entorno (corte duro): aplica incluso a llamadas sin tenant.
    try:
        from ai_budget import ai_disabled_env  # type: ignore
        if ai_disabled_env():
            log.warning(f"[llm_guard] {label or 'call'} omitida: IA apagada globalmente (AI_DISABLED)")
            return fallback
    except Exception:
        pass
    if db is not None and tenant_id is not None:
        ok = await within_budget(db, tenant_id)
        if not ok:
            log.info(f"[llm_guard] {label or 'call'} omitida: IA cortada o presupuesto agotado ({tenant_id})")
            return fallback
    try:
        return await asyncio.wait_for(chat.send_message(message), timeout=timeout)
    except asyncio.TimeoutError:
        log.warning(f"[llm_guard] {label or 'call'} timeout tras {timeout}s")
        return fallback
    except Exception as e:
        log.warning(f"[llm_guard] {label or 'call'} falló: {e}")
        return fallback
