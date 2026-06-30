"""Pasada 2 · B3-AUDIT-SWALLOW — safe wrapper for audit-trail writes.

Problema: ~93 sitios escriben auditoría dentro de un `except: pass` mudo.
Si la escritura falla, el rastro de seguridad desaparece SIN dejar señal.

Solución: envolver la escritura de auditoría con `safe_audit(...)`. Si falla,
se registra un `log.warning("[audit] perdido ...")` (NUNCA un `pass` mudo) y
el request continúa (fail-soft): perder un registro de auditoría no debe
tumbar la operación de negocio.

Uso:
    from services.safe_audit import safe_audit

    await safe_audit(
        log_mutation(db, actor, "update", "entity", entity_id, before=..., after=...),
        ctx="whitelist.approve auth_id=...",
    )

También acepta un callable (sync o async) en vez de una coroutine ya creada:

    await safe_audit(lambda: log_mutation(...), ctx="...")
"""
from __future__ import annotations

import inspect
import logging
from typing import Any, Awaitable, Callable, Union

log = logging.getLogger("dmx.safe_audit")


async def safe_audit(
    coro_or_fn: Union[Awaitable[Any], Callable[[], Any]],
    *,
    ctx: str = "",
) -> bool:
    """Ejecuta una escritura de auditoría sin romper el request.

    Acepta:
      - una coroutine ya creada (ej. `log_mutation(...)`), o
      - un callable (sync/async) que produce la escritura al invocarlo.

    En caso de error: registra `log.warning("[audit] perdido ...")` y retorna
    False (NUNCA silencia el fallo). En éxito retorna True.
    """
    try:
        if inspect.isawaitable(coro_or_fn):
            await coro_or_fn
        elif callable(coro_or_fn):
            result = coro_or_fn()
            if inspect.isawaitable(result):
                await result
        else:
            # Ni coroutine ni callable: nada que ejecutar, pero lo señalamos.
            log.warning(f"[audit] perdido {ctx}: objeto no ejecutable {type(coro_or_fn)!r}")
            return False
        return True
    except Exception as e:  # noqa: BLE001 — fail-soft a propósito
        log.warning(f"[audit] perdido {ctx}: {e}")
        return False
