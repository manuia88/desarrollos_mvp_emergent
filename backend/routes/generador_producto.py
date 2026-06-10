"""
DMX · F2.2 — El Generador de Producto (ruta dev).
GET /api/dev/generador-producto?colonia_id=&terreno_m2=&categoria=  → mezcla óptima de producto
calibrada con el Grafo del Comprador + CUS. Auth developer/superadmin. FAIL-OPEN. Cero deuda.
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, Query

router = APIRouter(tags=["generador_producto"])
log = logging.getLogger("dmx.routes_generador_producto")

DEV_ROLES = {"developer_admin", "developer_member", "developer_director", "superadmin"}


def _db(request: Request):
    return request.app.state.db


async def _auth(req: Request):
    from server import get_current_user
    user = await get_current_user(req)
    if not user:
        raise HTTPException(401, "No autenticado")
    if user.role not in DEV_ROLES:
        raise HTTPException(403, "Rol no autorizado")
    return user


@router.get("/api/dev/generador-producto")
async def generador(request: Request,
                    terreno_m2: float = Query(..., gt=0, le=1_000_000),
                    colonia_id: Optional[str] = Query(None),
                    categoria: str = Query("media"),
                    cus_manual: Optional[float] = Query(None, ge=0, le=30)):
    """Qué construir en este terreno: mezcla de tipologías calibrada por la demanda real."""
    await _auth(request)
    from generador_producto_engine import generar_producto
    return await generar_producto(_db(request), colonia_id, terreno_m2, categoria, cus_manual)
