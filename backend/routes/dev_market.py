"""
DMX · Fase 3.2 — LENTE DEL DEV sobre el cubo (su slice + mercado anónimo)
Prefix /api/dev/market · auth developer/superadmin. Expone la inteligencia del cubo
al dev SIN dato crudo ajeno: benchmark (tú vs mercado), amenity ranker, demand-gap.
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, Query

router = APIRouter(prefix="/api/dev/market", tags=["dev_market"])
log = logging.getLogger("dmx.routes_dev_market")


def _db(request: Request):
    return request.app.state.db


async def _auth(req: Request):
    from server import get_current_user
    user = await get_current_user(req)
    if not user:
        raise HTTPException(401, "No autenticado")
    if user.role not in ("developer_admin", "developer_member", "superadmin"):
        raise HTTPException(403, "Rol no autorizado")
    return user


@router.get("/benchmark")
async def benchmark(request: Request):
    """Tu absorción y $/m² vs el mercado anónimo, por (colonia × tipología). El moat:
    'tu 2-rec vende 14% vs el mercado 18%'. Solo celdas donde tienes unidades."""
    user = await _auth(request)
    import dmx_dev_benchmark
    return await dmx_dev_benchmark.benchmark(_db(request), user)


@router.get("/amenity-ranker")
async def amenity_ranker(request: Request, colonia: Optional[str] = Query(None)):
    """¿Qué atributo sube el precio/m²? (hedónico · inteligencia de mercado anónima)."""
    await _auth(request)
    import dmx_hedonic_atom
    scope = {"geo.colonia_id": colonia} if colonia else None
    return await dmx_hedonic_atom.fit_and_rank(_db(request), scope)


@router.get("/demand-gap")
async def demand_gap(request: Request, top: int = Query(15, ge=1, le=100)):
    """Dónde hay demanda y poco/cero inventario de una tipología = dónde construir."""
    await _auth(request)
    import dmx_demand
    return await dmx_demand.demand_gap(_db(request), top=top)
