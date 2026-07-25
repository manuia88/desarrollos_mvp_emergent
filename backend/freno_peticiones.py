"""Freno de peticiones para las rutas públicas: que nadie se lleve el catálogo completo de un jalón.

POR QUÉ (auditoría A–Z 2026-07-24): con 117 peticiones y 6.4 segundos cualquiera se baja el catálogo
entero — 116 desarrollos y 5,603 unidades con precio. Ese catálogo es el activo del negocio, y estaba
servido sin ningún límite ni tope de paginación.

CRITERIO: frenar al robot sin estorbarle a la persona. Un comprador navegando hace decenas de
peticiones por minuto (ficha, fotos, filtros); un script hace cientos. El tope va holgado a propósito:
preferimos dejar pasar a un robot lento que cortarle la navegación a un cliente real.

Ventana deslizante en memoria, por IP. No necesita Redis ni nada externo: si el proceso se reinicia,
el contador se limpia, y eso es aceptable para lo que protege.
"""
from __future__ import annotations

import os
import time
from collections import defaultdict, deque

from fastapi import Request
from fastapi.responses import JSONResponse

# Solo se frena lo que expone catálogo. El resto (login, señales, salud) no pasa por aquí.
RUTAS_PROTEGIDAS = ("/api/developments", "/api/units", "/api/colonias-geojson", "/api/catastro")

VENTANA_SEG = int(os.environ.get("FRENO_VENTANA_SEG", "60"))
TOPE = int(os.environ.get("FRENO_TOPE", "180"))          # peticiones por IP por ventana
_hist: dict[str, deque] = defaultdict(deque)


def _ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for") or ""
    if fwd:
        return fwd.split(",")[0].strip()
    return getattr(request.client, "host", "") or "desconocida"


def _excede(ip: str) -> tuple[bool, int]:
    ahora = time.time()
    q = _hist[ip]
    limite = ahora - VENTANA_SEG
    while q and q[0] < limite:
        q.popleft()
    if len(q) >= TOPE:
        espera = int(q[0] + VENTANA_SEG - ahora) + 1
        return True, max(espera, 1)
    q.append(ahora)
    # higiene: no dejar crecer el diccionario con IPs que ya no vuelven
    if len(_hist) > 5000:
        for k in [k for k, v in list(_hist.items())[:1000] if not v]:
            _hist.pop(k, None)
    return False, 0


async def freno_publico(request: Request, call_next):
    """Middleware: cuenta las peticiones al catálogo por IP y frena al que abusa."""
    ruta = request.url.path
    if request.method == "GET" and ruta.startswith(RUTAS_PROTEGIDAS):
        excede, espera = _excede(_ip(request))
        if excede:
            return JSONResponse(
                status_code=429,
                headers={"Retry-After": str(espera)},
                content={"detail": f"Demasiadas peticiones. Intenta de nuevo en {espera} segundos."},
            )
    return await call_next(request)
