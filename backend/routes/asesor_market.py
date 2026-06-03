"""
DMX · Fase 3.3 — LENTE DEL ASESOR sobre el cubo (inteligencia de mercado para vender)
Prefix /api/asesor/market · auth advisor/asesor_admin/superadmin. El asesor vende across
developments, así que su vista del cubo es la INTELIGENCIA DE MERCADO anónima que le
sirve para su pitch: qué atributo sube el precio (argumento de valor) + zonas calientes.
Reusa los motores del cubo (mismo patrón que la lente del dev).
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, Query

router = APIRouter(prefix="/api/asesor/market", tags=["asesor_market"])
log = logging.getLogger("dmx.routes_asesor_market")

ADVISOR_ROLES = {"advisor", "asesor_admin", "superadmin"}


def _db(request: Request):
    return request.app.state.db


async def _auth(req: Request):
    from server import get_current_user
    user = await get_current_user(req)
    if not user:
        raise HTTPException(401, "No autenticado")
    if user.role not in ADVISOR_ROLES:
        raise HTTPException(403, "Acceso restringido al portal de asesores")
    return user


@router.get("/amenity-ranker")
async def amenity_ranker(request: Request, colonia: Optional[str] = Query(None)):
    """¿Qué atributo sube el precio/m²? — argumento de valor para tu pitch (hedónico)."""
    await _auth(request)
    import dmx_hedonic_atom
    scope = {"geo.colonia_id": colonia} if colonia else None
    return await dmx_hedonic_atom.fit_and_rank(_db(request), scope)


@router.get("/demand-gap")
async def demand_gap(request: Request, top: int = Query(10, ge=1, le=50)):
    """Zonas y tipologías con demanda alta y poco inventario — dónde hay compradores."""
    await _auth(request)
    import dmx_demand
    return await dmx_demand.demand_gap(_db(request), top=top)
