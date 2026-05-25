"""W7.AS.3.D · Round 2 · Knowledge-Base Gaps REST routes (superadmin-only).

3 endpoints:
  GET  /api/superadmin/kb-gaps/list          (?status=open&limit=50&detect=true)
  POST /api/superadmin/kb-gaps/add-faq       {gap_id, question, answer, source_url?}
  POST /api/superadmin/kb-gaps/dismiss-gap   {gap_id}

Todos require_superadmin. Cada acción mutadora deja audit_immutable.log.
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

from conversation_kb_gaps_engine import (  # noqa: F401 (ensure_indexes re-export)
    detect_gaps, list_gaps, gap_stats, add_faq, dismiss_gap, ensure_indexes,
)

log = logging.getLogger("dmx.routes_kb_gaps")

router = APIRouter(prefix="/api/superadmin/kb-gaps", tags=["conversation-kb-gaps"])


# ─── models ───────────────────────────────────────────────────────────────────
class AddFaqIn(BaseModel):
    gap_id: str
    question: str
    answer: str
    source_url: Optional[str] = None


class DismissIn(BaseModel):
    gap_id: str


# ─── auth ─────────────────────────────────────────────────────────────────────
async def _require_superadmin(request: Request):
    try:
        from server import get_current_user
        user = await get_current_user(request)
    except HTTPException:
        raise
    except Exception:
        user = None
    if not user:
        raise HTTPException(401, "No autenticado")
    if getattr(user, "role", "") != "superadmin":
        raise HTTPException(403, "Solo superadmin")
    return user


def _actor(user) -> dict:
    return {"user_id": getattr(user, "user_id", "superadmin"),
            "role": getattr(user, "role", "superadmin")}


# ─── endpoints ──────────────────────────────────────────────────────────────────
@router.get("/list")
async def kb_gaps_list(
    request: Request,
    status: str = Query("open"),
    limit: int = Query(50, ge=1, le=200),
    detect: bool = Query(False),
):
    await _require_superadmin(request)
    db = request.app.state.db
    if detect:
        # corre detección on-demand (cron-cached internamente · 7d)
        await detect_gaps(db)
    gaps = await list_gaps(db, status=status, limit=limit)
    stats = await gap_stats(db)
    return {**gaps, "stats": stats}


@router.post("/add-faq", status_code=201)
async def kb_gaps_add_faq(body: AddFaqIn, request: Request):
    user = await _require_superadmin(request)
    db = request.app.state.db
    if not body.question.strip() or not body.answer.strip():
        raise HTTPException(422, "question y answer requeridos")
    result = await add_faq(
        db, body.gap_id, body.question, body.answer,
        source_url=body.source_url, actor=_actor(user),
    )
    if not result.get("ok"):
        reason = result.get("reason", "error")
        if reason == "gap_not_found":
            raise HTTPException(404, "Gap no encontrado")
        raise HTTPException(400, reason)
    return result


@router.post("/dismiss-gap", status_code=201)
async def kb_gaps_dismiss(body: DismissIn, request: Request):
    user = await _require_superadmin(request)
    db = request.app.state.db
    result = await dismiss_gap(db, body.gap_id, actor=_actor(user))
    if not result.get("ok"):
        reason = result.get("reason", "error")
        if reason == "gap_not_found":
            raise HTTPException(404, "Gap no encontrado")
        raise HTTPException(400, reason)
    return result
