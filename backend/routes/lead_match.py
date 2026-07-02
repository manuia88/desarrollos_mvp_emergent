"""Phase 4 Batch 34 · routes — Lead-to-Asesor Match + Asesor Daily Feed.

Endpoints:
  Smart Match:
    POST /api/lead-match/compute             (auth admin)
    GET  /api/lead-match/{match_id}          (auth)
    GET  /api/lead-match/lead/{lead_id}/recent (auth)

  Daily Feed:
    GET  /api/asesor/daily-feed              (auth asesor)
    POST /api/asesor/daily-feed/{lead_id}/execute (auth asesor)
"""
from __future__ import annotations

import logging
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Request, Query
from pydantic import BaseModel, Field

log = logging.getLogger("dmx.routes_lead_match")

router = APIRouter(tags=["lead-match"])

ASESOR_ROLES = {"advisor", "asesor_admin", "developer_admin",
                "developer_director", "developer_member",
                "inmobiliaria_admin", "superadmin"}
ADMIN_ROLES = {"superadmin", "asesor_admin", "inmobiliaria_admin",
               "developer_admin", "developer_director"}


def _db(req: Request):
    return req.app.state.db


async def _auth_asesor(request: Request):
    from server import get_current_user
    u = await get_current_user(request)
    if not u:
        raise HTTPException(401, "No autenticado")
    if u.role not in ASESOR_ROLES:
        raise HTTPException(403, "Acceso solo para asesores y administradores")
    return u


async def _auth_admin(request: Request):
    from server import get_current_user
    u = await get_current_user(request)
    if not u:
        raise HTTPException(401, "No autenticado")
    if u.role not in ADMIN_ROLES:
        raise HTTPException(403, "Solo administradores")
    return u


class MatchComputeBody(BaseModel):
    lead_id: str = Field(..., min_length=4, max_length=120)
    project_id: Optional[str] = None
    asesor_pool: Optional[List[str]] = None
    force: bool = False


class FeedExecuteBody(BaseModel):
    action_type: str = Field(..., pattern="^(call|whatsapp|email|schedule_visit)$")


# ═══ Smart Match ═════════════════════════════════════════════════════════════

@router.post("/api/lead-match/compute")
async def lead_match_compute(body: MatchComputeBody, request: Request):
    user = await _auth_admin(request)
    db = _db(request)
    from tenant_scope import assert_lead_owner
    await assert_lead_owner(db, user, body.lead_id)   # no calcular match sobre lead de otra cuenta
    from services.lead_to_asesor_match import compute_match
    try:
        return await compute_match(
            db, body.lead_id, body.project_id, body.asesor_pool, force=body.force,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/api/lead-match/{match_id}")
async def lead_match_get(match_id: str, request: Request):
    user = await _auth_asesor(request)
    db = _db(request)
    from services.lead_to_asesor_match import get_match
    doc = await get_match(db, match_id)
    if not doc:
        raise HTTPException(404, "Match no encontrado")
    if doc.get("lead_id"):
        from tenant_scope import assert_lead_owner
        await assert_lead_owner(db, user, doc["lead_id"])   # el match es de un lead ajeno → 403
    return doc


# (GET /api/lead-match/lead/{id}/recent borrado 2026-06-16 · 0 callers · la UI solo usa /compute)


# ═══ Daily Feed ══════════════════════════════════════════════════════════════

@router.get("/api/asesor/daily-feed")
async def asesor_daily_feed(
    request: Request,
    force_refresh: bool = Query(False),
    top_n: int = Query(5, ge=1, le=20),
):
    user = await _auth_asesor(request)
    db = _db(request)
    from services.asesor_daily_feed import generate_daily_feed
    return await generate_daily_feed(
        db, user.user_id, top_n=top_n, force=force_refresh,
    )


@router.post("/api/asesor/daily-feed/{lead_id}/execute")
async def asesor_daily_feed_execute(
    lead_id: str, body: FeedExecuteBody, request: Request,
):
    user = await _auth_asesor(request)
    db = _db(request)
    from services.asesor_daily_feed import execute_action
    try:
        return await execute_action(db, user.user_id, lead_id, body.action_type)
    except ValueError as e:
        raise HTTPException(400, str(e))
