"""
DMX · F2.4 — Demanda Demográfica (modelo EPRAV · ruta dev/superadmin).
GET /api/dev/demanda-demografica?colonia_id=&categoria=  → demanda potencial anual + GAP vertical
+ captura objetivo, AUNQUE no haya búsquedas. Auth developer/superadmin. FAIL-OPEN. Cero deuda.
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, Query

router = APIRouter(tags=["demanda_demografica"])
log = logging.getLogger("dmx.routes_demanda_demografica")

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


@router.get("/api/dev/demanda-demografica")
async def demanda_demografica(request: Request,
                              colonia_id: Optional[str] = Query(None),
                              categoria: str = Query("media")):
    """Demanda potencial por demografía (EPRAV) — para terrenos sin señal de búsqueda."""
    await _auth(request)
    from demanda_demografica_engine import estimar_demanda
    return await estimar_demanda(_db(request), colonia_id, categoria)
