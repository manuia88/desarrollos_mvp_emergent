"""
DMX · F2.5 — El Cerebro del Mercado (ruta superadmin · panel "Cómo Aprende El Mercado").
GET /api/superadmin/cerebro-mercado  → calibración (predicción↔realidad) + palancas + lecciones.
Auth superadmin. FAIL-OPEN. Cero deuda.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Request

router = APIRouter(tags=["cerebro_mercado"])
log = logging.getLogger("dmx.routes_cerebro_mercado")


def _db(request: Request):
    return request.app.state.db


async def _auth(req: Request):
    from server import get_current_user
    user = await get_current_user(req)
    if not user:
        raise HTTPException(401, "No autenticado")
    if user.role != "superadmin":
        raise HTTPException(403, "Solo superadmin")
    return user


@router.get("/api/superadmin/cerebro-mercado")
async def cerebro_mercado(request: Request):
    """Cómo aprende el Cerebro del Mercado: se califica vs la realidad y descubre palancas."""
    await _auth(request)
    from cerebro_mercado_engine import aprendizaje_mercado
    return await aprendizaje_mercado(_db(request))
