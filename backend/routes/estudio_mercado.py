"""
DMX · F2.6 — El Estudio de Mercado Vivo (ruta dev/superadmin).
GET /api/dev/estudio-mercado?colonia_id=&categoria=  → estudio completo fusionando los motores F2.
Auth developer/superadmin. FAIL-OPEN. Cero deuda.
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, Query

router = APIRouter(tags=["estudio_mercado"])
log = logging.getLogger("dmx.routes_estudio_mercado")

ROLES = {"developer_admin", "developer_member", "developer_director", "superadmin"}


def _db(request: Request):
    return request.app.state.db


async def _auth(req: Request):
    from server import get_current_user
    user = await get_current_user(req)
    if not user:
        raise HTTPException(401, "No autenticado")
    if user.role not in ROLES:
        raise HTTPException(403, "Rol no autorizado")
    return user


@router.get("/api/dev/estudio-mercado")
async def estudio_mercado(request: Request,
                          colonia_id: Optional[str] = Query(None),
                          categoria: str = Query("media")):
    """Estudio de Mercado Vivo de una colonia — fusiona demanda, producto, oferta y zona."""
    await _auth(request)
    from estudio_mercado_engine import generar_estudio
    return await generar_estudio(_db(request), colonia_id, categoria)
