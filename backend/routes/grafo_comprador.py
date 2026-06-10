"""
DMX · F2.1 — El Grafo del Comprador (rutas cross-portal).
Lado demanda del Modelo del Mundo: por colonia × etapa de vida, qué quiere la demanda.
Un mismo motor (grafo_comprador_engine) sirve a los 4 portales con el grano correcto:
  • GET /api/dev/grafo-comprador[?colonia_id=&dias=]  → dev (su colonia / todas)
  • GET /api/asesor/grafo/contacto/{contacto_id}        → asesor (distintivo de etapa de vida)
  • GET /api/superadmin/grafo-comprador[?colonia_id=]   → superadmin (toda la ciudad, todos los devs)
Anónimo + k-anonimato + banda honesta + FAIL-OPEN. Cero deuda.
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, Query

router = APIRouter(tags=["grafo_comprador"])
log = logging.getLogger("dmx.routes_grafo_comprador")

DEV_ROLES = {"developer_admin", "developer_member", "developer_director", "superadmin"}
ASESOR_ROLES = {"advisor", "asesor_admin", "superadmin"}


def _db(request: Request):
    return request.app.state.db


async def _auth(req: Request, roles: set):
    from server import get_current_user
    user = await get_current_user(req)
    if not user:
        raise HTTPException(401, "No autenticado")
    if user.role not in roles:
        raise HTTPException(403, "Rol no autorizado")
    return user


@router.get("/api/dev/grafo-comprador")
async def dev_grafo(request: Request,
                    colonia_id: Optional[str] = Query(None),
                    dias: int = Query(90, ge=7, le=365)):
    """Qué quiere la demanda (por etapa de vida) en una colonia — o en todas. Vista dev."""
    await _auth(request, DEV_ROLES)
    from grafo_comprador_engine import build_grafo
    return await build_grafo(_db(request), colonia_id=colonia_id, dias=dias)


@router.get("/api/asesor/grafo/contacto/{contacto_id}")
async def asesor_badge(request: Request, contacto_id: str):
    """Etapa de vida inferida de un contacto (distintivo en la ficha del asesor)."""
    user = await _auth(request, ASESOR_ROLES)
    from grafo_comprador_engine import infer_contacto_segment
    return await infer_contacto_segment(_db(request), getattr(user, "id", "") or "", contacto_id)


@router.get("/api/superadmin/grafo-comprador")
async def sa_grafo(request: Request,
                   colonia_id: Optional[str] = Query(None),
                   dias: int = Query(90, ge=7, le=365)):
    """Agregado del Grafo del Comprador de toda la ciudad (todos los devs, anónimo)."""
    await _auth(request, {"superadmin"})
    from grafo_comprador_engine import build_grafo
    return await build_grafo(_db(request), colonia_id=colonia_id, dias=dias)
