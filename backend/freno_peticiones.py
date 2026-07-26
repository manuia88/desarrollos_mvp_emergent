"""Freno de peticiones para las rutas públicas: que nadie se lleve el catálogo completo de un jalón.

POR QUÉ (auditoría A–Z 2026-07-24): con 117 peticiones y 6.4 segundos cualquiera se baja el catálogo
entero — 116 desarrollos y 5,603 unidades con precio. Ese catálogo es el activo del negocio, y estaba
servido sin ningún límite ni tope de paginación.

CRITERIO: frenar al robot sin estorbarle a la persona. Preferimos dejar pasar a un robot lento que
cortarle la navegación a un cliente real.

CORRECCIÓN DE MI PROPIO ERROR (auditoría A–Z 2026-07-26). La primera versión contaba TODO lo que
empezara con `/api/developments` en un solo cubo de 180 por minuto, y eso rompía el marketplace:

    · el front pide 2 datos extra por tarjeta (posición y distintivo de cumplimiento),
    · con 113 tarjetas eso son 227 peticiones para UNA sola vista del catálogo,
    · o sea que el tope estaba POR DEBAJO del costo de abrir la página una vez.

Medido en vivo: al cargar el catálogo, 47 peticiones se bloqueaban y **después el comprador ya no
podía abrir ninguna ficha** — recibía 429 en todas. El guardián se había vuelto el problema: quien
más navega es a quien más se le rompe.

La raíz del disparate estaba en medir por prefijo de URL en vez de por lo que hay DETRÁS:

    /api/developments?limit=200                    212,537 bytes   ← el catálogo entero
    /api/developments/{id}                         158,895 bytes   ← ficha con precios
    /api/developments/{id}/units                   109,009 bytes   ← todas las unidades
    /api/developments/{id}/rank                         41 bytes
    /api/developments/{id}/compliance-badge             33 bytes

Cinco mil veces de diferencia en el mismo cubo. Ahora hay dos, y cada uno pesa lo que protege:
lo PESADO (los datos que son el activo) va corto, y lo LIGERO (distintivos de decenas de bytes, que
no revelan nada) va holgado. Un comprador navega sin tocar el freno; un robot que quiera el catálogo
necesita minutos en vez de seis segundos.

Ventana deslizante en memoria, por IP. No necesita Redis ni nada externo: si el proceso se reinicia,
el contador se limpia, y eso es aceptable para lo que protege.

PENDIENTE ANOTADO (no es de este archivo): que el front pida 226 peticiones para dibujar una página
es un derroche en sí mismo. La solución de fondo es que esos dos datos vengan dentro de la tarjeta,
o en una sola petición para todas. Mientras eso no exista, el freno no puede ser quien lo castigue.
"""
from __future__ import annotations

import os
import re
import time
from collections import defaultdict, deque

from fastapi import Request
from fastapi.responses import JSONResponse

# ── LO PESADO: los datos que son el activo del negocio ────────────────────────
# El listado completo, la ficha con sus precios, las unidades, el catastro y los polígonos.
# Aquí sí se frena en serio: es exactamente lo que se llevaría quien quiera copiar el catálogo.
RUTAS_PESADAS = ("/api/units", "/api/colonias-geojson", "/api/catastro")
# `/api/developments` y `/api/developments/{id}` (sin sub-ruta) también son pesadas.
_FICHA_O_LISTADO = re.compile(r"^/api/developments(/[^/]+)?/?$")

# ── LO LIGERO: sub-recursos de una tarjeta, de decenas de bytes ───────────────
# No exponen el catálogo (una posición, un distintivo). El front pide dos por tarjeta, así que el
# tope tiene que dar para varias vistas completas de la página, no para una a medias.
_SUB_LIGERA = re.compile(r"^/api/developments/[^/]+/(rank|compliance-badge|ticker|asesor)/?$")

VENTANA_SEG = int(os.environ.get("FRENO_VENTANA_SEG", "60"))
# 40 respuestas pesadas por minuto = una persona abriendo fichas a buen ritmo sin notarlo nunca;
# quien quiera bajarse los 113 desarrollos necesita ~3 minutos en vez de 6 segundos.
TOPE_PESADO = int(os.environ.get("FRENO_TOPE", "40"))
# 700 ligeras por minuto ≈ tres vistas completas del catálogo (227 c/u). Sobra para navegar.
TOPE_LIGERO = int(os.environ.get("FRENO_TOPE_LIGERO", "700"))

_hist: dict[str, deque] = defaultdict(deque)


def _ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for") or ""
    if fwd:
        return fwd.split(",")[0].strip()
    return getattr(request.client, "host", "") or "desconocida"


def _cubo(ruta: str) -> tuple[str, int] | None:
    """Qué cubo le toca a esta ruta y con qué tope. `None` = no se frena."""
    if _SUB_LIGERA.match(ruta):
        return "ligero", TOPE_LIGERO
    if _FICHA_O_LISTADO.match(ruta) or ruta.startswith(RUTAS_PESADAS):
        return "pesado", TOPE_PESADO
    return None


def _excede(ip: str, cubo: str, tope: int) -> tuple[bool, int]:
    ahora = time.time()
    q = _hist[f"{cubo}:{ip}"]
    limite = ahora - VENTANA_SEG
    while q and q[0] < limite:
        q.popleft()
    if len(q) >= tope:
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
    if request.method == "GET":
        destino = _cubo(request.url.path)
        if destino:
            cubo, tope = destino
            excede, espera = _excede(_ip(request), cubo, tope)
            if excede:
                return JSONResponse(
                    status_code=429,
                    headers={"Retry-After": str(espera)},
                    content={"detail": f"Demasiadas peticiones. Intenta de nuevo en {espera} segundos."},
                )
    return await call_next(request)
