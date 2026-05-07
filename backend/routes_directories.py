"""Phase 15 · Batch 38 — Directory Routes.

Three directory views:
  GET /api/dev/red-comercial         (auth: developer_admin|director|superadmin)
  GET /api/asesor/mis-aliados        (auth: advisor|asesor_*)
  GET /api/inmobiliaria/red-comercial (auth: inmobiliaria_admin|director|superadmin)

Each endpoint is multi-tenant scoped to the caller's org.
"""
from __future__ import annotations

import logging
from fastapi import APIRouter, HTTPException, Request

log = logging.getLogger("dmx.routes_directories")

router = APIRouter(tags=["directories"])

DEV_ROLES = {"developer_admin", "developer_director", "superadmin"}
ASESOR_ROLES = {"advisor", "asesor_freelance", "asesor_admin",
                "developer_advisor", "inmobiliaria_advisor"}
INM_ROLES = {"inmobiliaria_admin", "inmobiliaria_director", "superadmin"}


async def _auth(request: Request, allowed_roles: set):
    from server import get_current_user
    u = await get_current_user(request)
    if not u:
        raise HTTPException(401, "No autenticado")
    if u.role not in allowed_roles:
        raise HTTPException(403, "Sin permisos para esta vista")
    return u


def _tenant_or_403(user) -> str:
    tid = getattr(user, "tenant_id", None)
    if not tid:
        raise HTTPException(409, "Tu cuenta no está vinculada a una organización")
    return tid


@router.get("/api/dev/red-comercial")
async def dev_red_comercial(request: Request):
    user = await _auth(request, DEV_ROLES)
    db = request.app.state.db
    dev_org_id = _tenant_or_403(user)
    from services.directory_aggregator import get_dev_red_comercial
    return await get_dev_red_comercial(db, dev_org_id)


@router.get("/api/asesor/mis-aliados")
async def asesor_mis_aliados(request: Request):
    user = await _auth(request, ASESOR_ROLES | {"superadmin"})
    db = request.app.state.db
    from services.directory_aggregator import get_asesor_mis_aliados
    return await get_asesor_mis_aliados(db, user.user_id)


@router.get("/api/inmobiliaria/red-comercial")
async def inmobiliaria_red_comercial(request: Request):
    user = await _auth(request, INM_ROLES)
    db = request.app.state.db
    inm_id = _tenant_or_403(user)
    from services.directory_aggregator import get_inmobiliaria_red_comercial
    return await get_inmobiliaria_red_comercial(db, inm_id)
