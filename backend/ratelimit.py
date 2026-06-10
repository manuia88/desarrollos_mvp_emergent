"""ratelimit — limitador de ráfaga COMPARTIDO (in-memory, sliding window).

Reusable por todos los endpoints públicos (antes cada archivo tenía su propio bucket o
no tenía nada — p.ej. la API pública v1 NO tenía rate-limit). Defiende de scraping/abuso
sin tocar al usuario legítimo. Para multi-instancia → mover a Redis.
"""
from __future__ import annotations

import time
from collections import defaultdict, deque
from typing import Deque, Dict

from fastapi import Request, HTTPException

# scope → ip → timestamps
_BUCKETS: Dict[str, Dict[str, Deque[float]]] = defaultdict(lambda: defaultdict(deque))


def client_ip(request: Request) -> str:
    fwd = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    return fwd or (request.client.host if request.client else "unknown")


def check(request: Request, *, scope: str = "default", limit: int = 60, window: int = 60) -> None:
    """Lanza 429 si la IP excede `limit` peticiones en `window` segundos para ese `scope`."""
    now = time.time()
    b = _BUCKETS[scope][client_ip(request)]
    while b and (now - b[0]) > window:
        b.popleft()
    if len(b) >= limit:
        raise HTTPException(429, "rate_limit_exceeded")
    b.append(now)


def dependency(scope: str = "default", limit: int = 60, window: int = 60):
    """Devuelve una dependencia FastAPI para aplicar el límite a un router o endpoint."""
    async def _dep(request: Request):
        check(request, scope=scope, limit=limit, window=window)
    return _dep
