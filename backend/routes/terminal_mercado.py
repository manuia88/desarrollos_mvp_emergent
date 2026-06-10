"""
DMX · F2.12 — La Terminal de Mercado CDMX (ruta superadmin · data utility vendible).
GET /api/superadmin/terminal-mercado  → oferta (cubo) + 3 índices vendibles + demanda (grafo) + aprendizaje.
Auth superadmin. FAIL-OPEN. Cero deuda. k-anónimo.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Request, Query

router = APIRouter(tags=["terminal_mercado"])
log = logging.getLogger("dmx.routes_terminal_mercado")


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


@router.get("/api/superadmin/terminal-mercado")
async def terminal_mercado_ep(request: Request, top: int = Query(8, ge=3, le=30)):
    """Terminal de Mercado CDMX: fusiona Cubo + Índices + Grafo + Cerebro, k-anónimo."""
    await _auth(request)
    from terminal_mercado_engine import terminal_mercado
    return await terminal_mercado(_db(request), top_colonias=top)


@router.get("/api/superadmin/indices-historial")
async def indices_historial_ep(request: Request, days: int = Query(90, ge=2, le=365)):
    """F5.3 · Curva (historial diario) de los 3 índices DMX + maestro."""
    await _auth(request)
    from terminal_mercado_engine import historial_indices
    return await historial_indices(_db(request), days=days)


@router.post("/api/superadmin/indices-historial/snapshot")
async def indices_snapshot_ep(request: Request):
    """F5.3 · Guarda la foto de hoy (build-for-endstate: arranca la curva sin esperar al cron)."""
    await _auth(request)
    from terminal_mercado_engine import snapshot_indices
    return await snapshot_indices(_db(request))


@router.get("/api/superadmin/bancabilidad")
async def bancabilidad_ranking_ep(request: Request, top: int = Query(50, ge=1, le=200)):
    """F5.1 · Ranking de Bancabilidad de todos los proyectos (producto de datos para bancos/fondos)."""
    await _auth(request)
    from bancabilidad_engine import ranking_bancabilidad
    return await ranking_bancabilidad(_db(request), top=top)
