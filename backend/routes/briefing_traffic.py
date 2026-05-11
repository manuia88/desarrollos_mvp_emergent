"""Phase 3 Batch 31 · routes — Briefing Tráfico + Clima para Asesor.

Endpoints:
  POST /api/asesor/briefing/traffic        → genera briefing on-demand
  GET  /api/asesor/briefing/traffic/recent → últimos 10 briefings del asesor
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

log = logging.getLogger("dmx.routes_briefing_traffic")

router = APIRouter(tags=["asesor-briefing-traffic"])

ASESOR_ROLES = {"advisor", "asesor_admin", "developer_admin",
                "developer_director", "developer_member",
                "inmobiliaria_admin", "superadmin"}


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


class TrafficBriefingBody(BaseModel):
    origin_lat: float = Field(..., ge=-90, le=90)
    origin_lng: float = Field(..., ge=-180, le=180)
    destination_lat: float = Field(..., ge=-90, le=90)
    destination_lng: float = Field(..., ge=-180, le=180)
    origin_label: Optional[str] = ""
    destination_label: Optional[str] = ""
    project_id: Optional[str] = None


@router.post("/api/asesor/briefing/traffic")
async def post_briefing_traffic(
    body: TrafficBriefingBody,
    request: Request,
):
    user = await _auth_asesor(request)
    db = _db(request)

    from services.traffic_briefing import build_briefing
    doc = await build_briefing(
        db,
        origin=(body.origin_lat, body.origin_lng),
        destination=(body.destination_lat, body.destination_lng),
        origin_label=body.origin_label or "",
        destination_label=body.destination_label or "",
        project_id=body.project_id,
    )

    # Log uso (no PII)
    try:
        await db.traffic_briefings_log.insert_one({
            "asesor_id": user.user_id,
            "briefing_id": doc.get("briefing_id"),
            "project_id": body.project_id,
            "is_stale": doc.get("is_stale", False),
            "source": doc.get("source", "live"),
            "ts": doc.get("generated_at"),
        })
    except Exception:
        pass

    return doc


@router.get("/api/asesor/briefing/traffic/recent")
async def get_recent_briefings(request: Request, limit: int = 10):
    user = await _auth_asesor(request)
    db = _db(request)
    limit = max(1, min(50, limit))

    docs: List[Dict[str, Any]] = await db.traffic_briefings_log.find(
        {"asesor_id": user.user_id},
        {"_id": 0},
    ).sort("ts", -1).limit(limit).to_list(limit)

    return {"items": docs, "total": len(docs)}
