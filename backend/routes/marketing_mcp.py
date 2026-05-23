"""W6.MOV.4 · Marketing Distribution MCP routes (superadmin-only).

Endpoints:
  POST   /api/superadmin/marketing-mcp/publish              → publish a 1+ platforms
  POST   /api/superadmin/marketing-mcp/schedule             → cola publish futuro
  GET    /api/superadmin/marketing-mcp/history?days=30      → últimos publishes
  GET    /api/superadmin/marketing-mcp/stats                → KPIs + adapter status
  DELETE /api/superadmin/marketing-mcp/scheduled/{id}       → cancelar scheduled
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from marketing_mcp_engine import (
    publish as engine_publish,
    schedule_publish as engine_schedule,
    cancel_scheduled,
    get_history,
    get_stats,
    VALID_PLATFORMS,
)
from permissions import require_superadmin

log = logging.getLogger("dmx.marketing_mcp_routes")
router = APIRouter()


class PublishBody(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000)
    platforms: Optional[List[str]] = Field(None, max_length=4)
    extras: Optional[Dict[str, Any]] = None


class ScheduleBody(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000)
    platforms: Optional[List[str]] = Field(None, max_length=4)
    scheduled_at: datetime
    extras: Optional[Dict[str, Any]] = None


def _validate_platforms(plats: Optional[List[str]]) -> Optional[List[str]]:
    if not plats:
        return None
    invalid = [p for p in plats if p not in VALID_PLATFORMS]
    if invalid:
        raise HTTPException(400, f"platforms inválidas: {invalid} · valid={sorted(VALID_PLATFORMS)}")
    return plats


def _content_from(body) -> Dict[str, Any]:
    content: Dict[str, Any] = {"text": body.text}
    if body.extras:
        content["extras"] = body.extras
    return content


def _actor(user) -> Dict[str, Any]:
    return {"user_id": getattr(user, "user_id", "superadmin"), "role": "superadmin"}


@router.post("/api/superadmin/marketing-mcp/publish")
async def publish_route(request: Request, body: PublishBody):
    user = await require_superadmin(request)
    plats = _validate_platforms(body.platforms)
    db = request.app.state.db
    result = await engine_publish(db, _content_from(body), target_platforms=plats, actor=_actor(user))
    return {"ok": True, "result": result}


@router.post("/api/superadmin/marketing-mcp/schedule")
async def schedule_route(request: Request, body: ScheduleBody):
    user = await require_superadmin(request)
    plats = _validate_platforms(body.platforms)
    db = request.app.state.db
    doc = await engine_schedule(db, _content_from(body), body.scheduled_at, plats, actor=_actor(user))
    return {"ok": True, "scheduled": doc}


@router.get("/api/superadmin/marketing-mcp/history")
async def history_route(
    request: Request,
    days: int = Query(30, ge=1, le=365),
    limit: int = Query(50, ge=1, le=200),
):
    await require_superadmin(request)
    db = request.app.state.db
    items = await get_history(db, days=days, limit=limit)
    return {"items": items, "count": len(items), "days": days}


@router.get("/api/superadmin/marketing-mcp/stats")
async def stats_route(request: Request):
    await require_superadmin(request)
    db = request.app.state.db
    return await get_stats(db)


@router.delete("/api/superadmin/marketing-mcp/scheduled/{scheduled_id}")
async def cancel_route(request: Request, scheduled_id: str):
    user = await require_superadmin(request)
    db = request.app.state.db
    ok = await cancel_scheduled(db, scheduled_id, actor=_actor(user))
    if not ok:
        raise HTTPException(404, "scheduled item not found or already cancelled")
    return {"ok": True, "scheduled_id": scheduled_id, "status": "cancelled"}
