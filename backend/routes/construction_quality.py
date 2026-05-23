"""W6.MOV.5 · Construction Quality Index routes.

Endpoints:
  GET /api/construction-quality/{development_id} → score + breakdown 4 dims (público T0)
  GET /api/construction-quality                  → lista con filtros min_score, tier
  GET /api/superadmin/construction-quality/stats → stats globales (superadmin)
  POST /api/superadmin/construction-quality/refresh/{development_id} → force recompute
  POST /api/superadmin/construction-quality/manual-override → pin score manual
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Query, Request, Body
from pydantic import BaseModel, Field

from construction_quality_engine import (
    compute_quality_index,
    get_stats,
    list_developments_by_quality,
)
from permissions import require_superadmin

log = logging.getLogger("dmx.construction_quality_routes")
router = APIRouter()


class ManualOverrideBody(BaseModel):
    development_id: str = Field(..., min_length=1, max_length=128)
    score: Optional[float] = Field(None, ge=0, le=100, description="Override 0-100 · None elimina override")
    reason: Optional[str] = Field(None, max_length=500)


@router.get("/api/construction-quality/{development_id}")
async def get_quality(request: Request, development_id: str):
    """Público T0. Retorna índice + breakdown si disponible."""
    db = request.app.state.db
    result = await compute_quality_index(db, development_id, use_cache=True)
    if result.get("score") is None:
        # Still 200 with reason · permite UI mostrar "sin datos"
        return result
    return result


@router.get("/api/construction-quality")
async def list_quality(
    request: Request,
    min_score: Optional[float] = Query(None, ge=0, le=100),
    tier: Optional[str] = Query(None, regex="^(excelente|bueno|regular|deficiente)$"),
    limit: int = Query(50, ge=1, le=200),
    skip: int = Query(0, ge=0),
):
    """Público T0. Filtra por min_score o tier · sort desc por score."""
    db = request.app.state.db
    items = await list_developments_by_quality(db, min_score=min_score, tier=tier, limit=limit, skip=skip)
    return {"items": items, "count": len(items), "skip": skip, "limit": limit}


@router.get("/api/superadmin/construction-quality/stats")
async def stats(request: Request):
    """Superadmin. Stats globales coverage + tier distribution."""
    await require_superadmin(request)
    db = request.app.state.db
    return await get_stats(db)


@router.post("/api/superadmin/construction-quality/refresh/{development_id}")
async def refresh(request: Request, development_id: str):
    """Superadmin. Force recompute ignorando cache."""
    await require_superadmin(request)
    db = request.app.state.db
    result = await compute_quality_index(db, development_id, use_cache=False)

    try:
        import audit_immutable_engine
        user = getattr(request.state, "user", None)
        actor = {
            "user_id": getattr(user, "id", "superadmin") if user else "superadmin",
            "role": "superadmin",
        }
        await audit_immutable_engine.log(
            db, actor, "construction_quality.refresh", "development", development_id,
            before=None, after={"score": result.get("score"), "tier": result.get("tier")},
        )
    except Exception as exc:
        log.warning(f"audit log skipped: {exc}")

    return result


@router.post("/api/superadmin/construction-quality/manual-override")
async def manual_override(request: Request, body: ManualOverrideBody):
    """Superadmin. Pin manual del score · None remueve override.

    Cuando hay override, recompute siempre lo retorna sin tocar 4 dims.
    """
    user = await require_superadmin(request)
    db = request.app.state.db

    update_doc: Dict[str, Any] = {}
    if body.score is None:
        update_doc["$unset"] = {"construction_quality_manual_override": "", "construction_quality_manual_reason": ""}
    else:
        update_doc["$set"] = {
            "construction_quality_manual_override": float(body.score),
            "construction_quality_manual_reason": body.reason or "",
        }

    res = await db.developments.update_one({"id": body.development_id}, update_doc)
    if res.matched_count == 0:
        raise HTTPException(404, f"development {body.development_id} not found")

    # Recompute para refrescar denormalized
    result = await compute_quality_index(db, body.development_id, use_cache=False)

    try:
        import audit_immutable_engine
        actor = {"user_id": getattr(user, "id", "superadmin"), "role": "superadmin"}
        await audit_immutable_engine.log(
            db, actor, "construction_quality.manual_override", "development", body.development_id,
            before=None,
            after={"score": body.score, "reason": body.reason},
        )
    except Exception as exc:
        log.warning(f"audit log skipped: {exc}")

    return {"ok": True, "result": result}
