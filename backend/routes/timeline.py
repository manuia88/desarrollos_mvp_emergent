"""PELÍCULA 07-17 — la biografía de cada depto y las métricas de película (superadmin).

  GET /api/superadmin/unidad/{unit_id}/biografia   → línea de tiempo completa de UNA unidad
                                                     (alta, precios, status, planos, señales de venta)
  GET /api/superadmin/desarrollo/{dev_id}/pelicula → velocidad real u/mes, tiempo en lista,
                                                     frescura de listas, unidades estancadas
  GET /api/superadmin/catalogo/frescura            → por desarrollador: días desde su última
                                                     lista vista por el vigía (podrido → fresco)

Motor: unit_timeline.py (solo LEE fuentes ya acumuladas — $0, sin escrituras).
Honestidad: sin historia suficiente se DICE, nunca se inventa un número.
"""
from __future__ import annotations

from fastapi import APIRouter, Request

from permissions import require_superadmin

import unit_timeline

router = APIRouter(prefix="/api/superadmin")


def _db(request: Request):
    return request.app.state.db


@router.get("/unidad/{unit_id}/biografia")
async def get_biografia_unidad(unit_id: str, request: Request):
    await require_superadmin(request)
    return await unit_timeline.biografia(_db(request), unit_id)


@router.get("/desarrollo/{dev_id}/pelicula")
async def get_pelicula_desarrollo(dev_id: str, request: Request):
    await require_superadmin(request)
    return await unit_timeline.metricas_pelicula(_db(request), dev_id)


@router.get("/catalogo/frescura")
async def get_frescura_catalogo(request: Request):
    await require_superadmin(request)
    return await unit_timeline.frescura_catalogo(_db(request))
