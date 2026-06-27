"""W4.16 Sub-C — MCP Distribution routes."""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

import mcp_distribution_engine as engine
from ratelimit import client_ip as _dmx_canon_ip  # SEGURIDAD: IP anti-spoofing (pentest 2026-06-27)

log = logging.getLogger("dmx.routes_mcp_distribution")
router = APIRouter()


def _db(request: Request):
    return request.app.state.db


def _client_ip(request: Request) -> str:
    fwd =_dmx_canon_ip(request)
    return fwd or (request.client.host if request.client else "unknown")


class TrackRequest(BaseModel):
    client_type: Optional[str] = None
    source: Optional[str] = "organic"
    locale: Optional[str] = "es-MX"


@router.post("/api/mcp/track-adoption")
async def track(request: Request, body: TrackRequest):
    db = _db(request)
    ip = _client_ip(request)
    ct = body.client_type or engine.detect_client_from_ua(request.headers.get("user-agent", ""))
    src = body.source or "organic"
    doc = await engine.track_mcp_adoption(db, ct, src, ip=ip, locale=body.locale or "es-MX")
    return JSONResponse({"ok": True, "adoption": doc})


@router.get("/api/mcp/adoption-stats")
async def stats(request: Request):
    try:
        from server import get_current_user
        u = await get_current_user(request)
        if not u:
            raise HTTPException(401, "auth_required")
        role = u.role if hasattr(u, "role") else u.get("role")
        if role != "superadmin":
            raise HTTPException(403, "superadmin_required")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(401, "auth_required")
    db = _db(request)
    stats = await engine.get_adoption_stats(db)
    return JSONResponse({"ok": True, "stats": stats})
