"""ratelimit — limitador de ráfaga COMPARTIDO (in-memory, sliding window).

Reusable por todos los endpoints públicos (antes cada archivo tenía su propio bucket o
no tenía nada — p.ej. la API pública v1 NO tenía rate-limit). Defiende de scraping/abuso
sin tocar al usuario legítimo. Para multi-instancia → mover a Redis.
"""
from __future__ import annotations

import os
import time
from collections import defaultdict, deque
from typing import Deque, Dict

from fastapi import Request, HTTPException

# scope → ip → timestamps
_BUCKETS: Dict[str, Dict[str, Deque[float]]] = defaultdict(lambda: defaultdict(deque))


def _trusted_hops() -> int:
    """Saltos de proxy DE CONFIANZA delante del backend. Default: 1 en prod (el ingress de K8s), 0 en dev
    (acceso directo). Si se mete Cloudflare delante del ingress → poner TRUSTED_PROXY_HOPS=2 en el env."""
    v = os.environ.get("TRUSTED_PROXY_HOPS")
    if v is not None:
        try:
            return max(0, int(v))
        except ValueError:
            pass
    return 1 if os.environ.get("DMX_ENV", "").lower() in ("prod", "production") else 0


def client_ip(request: Request) -> str:
    """IP REAL del cliente, A PRUEBA DE SPOOFING (pentest 2026-06-27).

    El cliente puede FALSIFICAR X-Forwarded-For prependiendo valores, pero NO controla el salto que añade
    NUESTRO proxy de confianza. Tomamos la IP en la posición -hops (la que puso el proxy de confianza más externo);
    todo lo de la izquierda es controlado por el cliente → se ignora. Sin proxy de confianza (dev) → la IP del
    socket real (request.client.host). Antes tomaba el PRIMER hop = el falsificable (bug del pentest)."""
    hops = _trusted_hops()
    if hops > 0:
        parts = [p.strip() for p in (request.headers.get("x-forwarded-for") or "").split(",") if p.strip()]
        if len(parts) >= hops:
            return parts[-hops]
    return request.client.host if request.client else "unknown"


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
