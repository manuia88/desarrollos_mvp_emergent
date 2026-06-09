"""C1 Escala · Lectura acotada de cursores con tope EXPLÍCITO y observable.

Problema que resuelve: varios endpoints hacían `.to_list(10000/20000)`, lo que
(a) puede reventar memoria con datos reales y (b) trunca en silencio — el playbook
prohíbe el "tope silencioso". Aquí el tope es explícito y, si se alcanza, se
registra (log + observabilidad opcional) para que NUNCA pase desapercibido.

Uso:
    from services.query_limits import bounded_to_list
    leads = await bounded_to_list(
        db.leads.find(q, proj), cap=5000, label="dev_batch6.leads_by_colonia"
    )
"""
from __future__ import annotations

import logging
from typing import Any, List

log = logging.getLogger("dmx.query_limits")

# Tope por defecto para barridos de agregación en memoria.
DEFAULT_CAP = 5000


async def bounded_to_list(cursor, *, cap: int = DEFAULT_CAP, label: str = "") -> List[Any]:
    """Materializa un cursor con tope. Si se alcanza el tope, lo registra (no
    trunca en silencio). FAIL-OPEN: si algo falla, devuelve lo que haya."""
    try:
        rows = await cursor.limit(cap + 1).to_list(cap + 1)
    except Exception as e:  # pragma: no cover - defensivo
        log.warning(f"[query_limits] {label or 'cursor'} read failed: {e}")
        return []
    if len(rows) > cap:
        # Tope alcanzado: avisar (esto es señal de que toca paginar/agregar de verdad).
        log.warning(
            f"[query_limits] {label or 'cursor'} alcanzó el tope de {cap} filas — "
            f"resultado truncado. Considera paginación o agregación en Mongo."
        )
        try:
            from observability import capture_event  # type: ignore
            capture_event(
                "system",
                "query_cap_reached",
                {"label": label, "cap": cap},
            )
        except Exception:
            pass
        return rows[:cap]
    return rows
