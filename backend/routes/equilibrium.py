"""
Rutas del motor de Precio de Equilibrio + Gap de mercado (dato real 4S).

Endpoints:
  GET  /api/dev/precio-equilibrio     ?estudio=&zona=&clasificacion=&meses=   (logueado)
  GET  /api/dev/gap-mercado           ?estudio=                               (logueado)
  GET  /api/dev/market-intelligence   ?estudio=&zona=&meses=                  (logueado)  ← input del Gap Radar
  POST /api/superadmin/market-4s/load                                          (superadmin) ← carga/refresca el dato 4S
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, Query

from permissions import require_superadmin

log = logging.getLogger("dmx.equilibrium.routes")
router = APIRouter(tags=["equilibrium"])


def _db(request: Request):
    return request.app.state.db


async def _auth(request: Request):
    from server import get_current_user
    u = await get_current_user(request)
    if not u:
        raise HTTPException(401, "No autenticado")
    return u


@router.get("/api/dev/precio-equilibrio")
async def r_precio_equilibrio(
    request: Request,
    estudio: Optional[str] = Query(None),
    zona: Optional[str] = Query(None),
    clasificacion: Optional[str] = Query(None),
    meses: int = Query(12, ge=1, le=120),
):
    await _auth(request)
    from equilibrium_engine import precio_equilibrio
    return await precio_equilibrio(_db(request), zona=zona, estudio=estudio,
                                   clasificacion=clasificacion, meses_objetivo=meses)


@router.get("/api/dev/gap-mercado")
async def r_gap_mercado(request: Request, estudio: Optional[str] = Query(None)):
    await _auth(request)
    from equilibrium_engine import gap_por_rango
    return await gap_por_rango(_db(request), estudio=estudio)


@router.get("/api/dev/market-intelligence")
async def r_market_intelligence(
    request: Request,
    estudio: Optional[str] = Query(None),
    zona: Optional[str] = Query(None),
    meses: int = Query(12, ge=1, le=120),
):
    await _auth(request)
    from equilibrium_engine import market_intelligence
    return await market_intelligence(_db(request), zona=zona, estudio=estudio, meses_objetivo=meses)


@router.post("/api/superadmin/market-4s/load")
async def r_load_market_4s(request: Request):
    await require_superadmin(request)
    from market_4s_loader import load_market_4s
    return await load_market_4s(_db(request))
