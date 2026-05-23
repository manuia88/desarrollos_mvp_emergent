"""W6.MOV.1 · SOC Franchise routes.

Endpoints:
  GET  /api/soc-franchise/leaderboard            → top 20 visible (público T0)
  GET  /api/soc-franchise/my-score               → self (T2+ advisor logged)
  GET  /api/soc-franchise/user/{user_id}         → own only (advisor) · superadmin cualquier
  GET  /api/superadmin/soc-franchise/stats       → stats globales (superadmin)
  POST /api/superadmin/soc-franchise/certify     → pin level (superadmin · body {user_id, level, reason})
  POST /api/superadmin/soc-franchise/revoke      → remove override (superadmin · body {user_id, reason})
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from soc_franchise_engine import (
    compute_soc_score,
    list_franchisees,
    get_stats,
    certify,
    revoke,
    VALID_LEVELS,
)
from permissions import require_superadmin

log = logging.getLogger("dmx.soc_franchise_routes")
router = APIRouter()

ADVISOR_ROLES = {"advisor", "asesor_admin", "asesor_freelance"}


async def _auth_optional(request: Request):
    try:
        from server import get_current_user
        return await get_current_user(request)
    except Exception:
        return None


async def _auth_required(request: Request):
    from server import get_current_user
    u = await get_current_user(request)
    if not u:
        raise HTTPException(401, "No autenticado")
    return u


class CertifyBody(BaseModel):
    user_id: str = Field(..., min_length=1, max_length=128)
    level: str = Field(..., pattern="^(bronze|silver|gold|platinum)$")
    reason: str = Field(..., min_length=10, max_length=500)


class RevokeBody(BaseModel):
    user_id: str = Field(..., min_length=1, max_length=128)
    reason: str = Field(..., min_length=10, max_length=500)


@router.get("/api/soc-franchise/leaderboard")
async def leaderboard(
    request: Request,
    level: Optional[str] = Query(None, pattern="^(bronze|silver|gold|platinum)$"),
    limit: int = Query(20, ge=1, le=100),
    skip: int = Query(0, ge=0),
):
    """Público T0. Top N franquiciatarios por score.

    Audit forense G.90 fix · public_safe=True elimina PII (email · tenant_id · manual_override).
    Superadmin endpoint separado puede usar list_franchisees(public_safe=False) si necesita full data.
    """
    db = request.app.state.db
    items = await list_franchisees(db, level=level, limit=limit, skip=skip, public_safe=True)
    return {"items": items, "count": len(items), "skip": skip, "limit": limit}


@router.get("/api/soc-franchise/my-score")
async def my_score(request: Request):
    """T2+ advisor logged. Retorna self SOC score + breakdown."""
    user = await _auth_required(request)
    if user.role not in ADVISOR_ROLES and user.role != "superadmin":
        raise HTTPException(403, "Solo asesores pueden consultar mi score")
    db = request.app.state.db
    return await compute_soc_score(db, user.user_id, use_cache=True)


@router.get("/api/soc-franchise/user/{user_id}")
async def user_score(request: Request, user_id: str):
    """Advisor: own only · superadmin: cualquier."""
    user = await _auth_required(request)
    is_self = (user.user_id == user_id)
    is_admin = (user.role == "superadmin")
    if not (is_self or is_admin):
        raise HTTPException(403, "Sin permiso para consultar este score")
    db = request.app.state.db
    return await compute_soc_score(db, user_id, use_cache=True)


@router.get("/api/superadmin/soc-franchise/stats")
async def stats(request: Request):
    """Superadmin. Stats globales + tier distribution + top/bottom movers."""
    await require_superadmin(request)
    db = request.app.state.db
    return await get_stats(db)


@router.post("/api/superadmin/soc-franchise/certify")
async def certify_route(request: Request, body: CertifyBody):
    """Superadmin. Pin manual level + reason ≥10 chars · audit log."""
    user = await require_superadmin(request)
    db = request.app.state.db
    actor = {"user_id": getattr(user, "user_id", "superadmin"), "role": "superadmin"}
    try:
        result = await certify(db, body.user_id, body.level, body.reason, actor)
    except ValueError as ve:
        raise HTTPException(400, str(ve))
    return {"ok": True, "result": result}


@router.post("/api/superadmin/soc-franchise/revoke")
async def revoke_route(request: Request, body: RevokeBody):
    """Superadmin. Remove manual override · reason ≥10 chars · audit log."""
    user = await require_superadmin(request)
    db = request.app.state.db
    actor = {"user_id": getattr(user, "user_id", "superadmin"), "role": "superadmin"}
    try:
        result = await revoke(db, body.user_id, body.reason, actor)
    except ValueError as ve:
        raise HTTPException(400, str(ve))
    return {"ok": True, "result": result}
