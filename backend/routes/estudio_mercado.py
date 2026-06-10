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


@router.get("/api/dev/absorcion")
async def absorcion(request: Request, colonia_id: str = Query(...)):
    """Curva de absorción por cohorte + comparables de una colonia (F2.7 · reusable)."""
    await _auth(request)
    from absorcion_engine import curva_absorcion
    return await curva_absorcion(_db(request), colonia_id=colonia_id)


@router.get("/api/dev/perfil-zona")
async def perfil_zona_ep(request: Request, colonia_id: str = Query(...)):
    """Perfil de zona unificado (score+ciclo+servicios) + qué le falta (F2.8 · reusable)."""
    await _auth(request)
    from perfil_zona_engine import perfil_zona
    return await perfil_zona(_db(request), colonia_id)


@router.get("/api/dev/amenidades-ranker")
async def amenidades_ranker_ep(request: Request, colonia_id: Optional[str] = Query(None)):
    """Ranker de amenidades en 2 ejes (precio hedónico + deseo de la demanda) (F2.9)."""
    await _auth(request)
    from amenidades_engine import ranker_amenidades
    return await ranker_amenidades(_db(request), colonia_id)


@router.get("/api/dev/cuota-recomendada")
async def cuota_recomendada_ep(request: Request,
                               m2: float = Query(..., gt=0, le=2000),
                               amenidades: Optional[str] = Query(None),
                               colonia_id: Optional[str] = Query(None)):
    """Cuota de mantenimiento sugerida desde el paquete de amenidades, vs disposición real (F2.9)."""
    await _auth(request)
    from amenidades_engine import recomendar_cuota
    amen = [a.strip() for a in (amenidades or "").split(",") if a.strip()]
    return await recomendar_cuota(_db(request), m2, amen, colonia_id)


@router.get("/api/dev/estudio-mercado/radio")
async def estudio_mercado_radio(request: Request,
                                lat: float = Query(..., ge=-90, le=90),
                                lng: float = Query(..., ge=-180, le=180),
                                radio_m: float = Query(1000, ge=100, le=10000),
                                categoria: str = Query("media")):
    """Estudio de microzona a la medida (punto + radio): compone las colonias del círculo.
    Solo representativo si junta dato suficiente; si no, lo dice (oculto)."""
    await _auth(request)
    from estudio_mercado_engine import generar_estudio_radio
    return await generar_estudio_radio(_db(request), lat, lng, radio_m, categoria)
