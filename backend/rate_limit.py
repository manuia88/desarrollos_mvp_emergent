"""Rate-limit en memoria (ventana deslizante por IP+clave) para endpoints públicos.

Frena flood/abuso (spam de leads, reseñas, votos) en endpoints sin auth. Lanza 429
al exceder el límite.

LIMITACIONES (documentadas a propósito · al escalar mover a Redis):
- Es POR-PROCESO: con N workers uvicorn el límite efectivo es ~N×limit.
- La IP sale de X-Forwarded-For, que es spoofeable si el proxy no lo sanea.
Aun así, es un freno real al abuso casual/automatizado y mejor que no tener nada.
"""
import time
import logging
from collections import defaultdict, deque

from fastapi import Request, HTTPException

log = logging.getLogger("dmx.rate_limit")

_BUCKETS: dict = defaultdict(deque)
_MAX_KEYS = 100_000  # backstop de memoria


def client_ip(request: Request) -> str:
    # SEGURIDAD (pentest 2026-06-27): reusa el helper canónico a prueba de spoofing (salto de confianza en prod,
    # socket en dev). Antes tomaba el PRIMER hop de X-Forwarded-For = el falsificable por el cliente.
    try:
        from ratelimit import client_ip as _canonical
        return _canonical(request)
    except Exception:
        return request.client.host if request.client else "unknown"


def check_rate(request: Request, key: str, limit: int, window_sec: int = 60) -> None:
    """Lanza HTTPException(429) si (ip, key) excede `limit` solicitudes en `window_sec`."""
    ip = client_ip(request)
    bucket_key = f"{key}:{ip}"
    now = time.monotonic()
    cutoff = now - window_sec
    win = _BUCKETS[bucket_key]
    while win and win[0] < cutoff:
        win.popleft()
    if len(win) >= limit:
        raise HTTPException(429, "Demasiadas solicitudes · intenta de nuevo en un momento")
    win.append(now)
    if len(_BUCKETS) > _MAX_KEYS:  # limpieza dura para acotar memoria
        _BUCKETS.clear()
