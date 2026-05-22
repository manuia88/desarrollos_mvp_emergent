"""W5.17 · Virtual Staging routes.

POST /api/virtual-staging                 · generate (1-3 styles)
GET  /api/virtual-staging/cache/{image_hash}?room=&styles=

Permission: advisor/asesor_admin/developer_admin/developer_director/superadmin.
Rate-limit: 5/min/user (Replicate calls are expensive).
"""
from __future__ import annotations

import logging
import time
from collections import defaultdict, deque
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field, field_validator

log = logging.getLogger("dmx.routes_virtual_staging")
router = APIRouter(tags=["virtual-staging"])

ALLOWED_ROLES = {
    "advisor", "asesor_admin",
    "developer_admin", "developer_director", "developer_member",
    "superadmin",
}

_RATE_BUCKETS: Dict[str, deque] = defaultdict(lambda: deque(maxlen=5))
_RATE_WINDOW_S = 60
_RATE_LIMIT = 5


def _db(req: Request):
    return req.app.state.db


async def _auth(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    role = getattr(user, "role", None)
    if role not in ALLOWED_ROLES:
        raise HTTPException(
            403, "Sin permiso · solo advisor/asesor_admin/developer_*/superadmin"
        )
    return user


def _rate_limit(user_id: str) -> None:
    now = time.time()
    bkt = _RATE_BUCKETS[user_id]
    while bkt and (now - bkt[0]) > _RATE_WINDOW_S:
        bkt.popleft()
    if len(bkt) >= _RATE_LIMIT:
        raise HTTPException(429, f"Rate limit excedido · {_RATE_LIMIT}/min")
    bkt.append(now)


# ─── body schema ────────────────────────────────────────────────────────────

class StagingBody(BaseModel):
    input_image_url: str = Field(..., min_length=1, max_length=4096)
    room_type: str = Field(..., min_length=1, max_length=32)
    styles: List[str] = Field(..., min_length=1, max_length=3)

    @field_validator("room_type")
    @classmethod
    def _v_room(cls, v: str) -> str:
        from virtual_staging_engine import SUPPORTED_ROOMS
        if v not in SUPPORTED_ROOMS:
            raise ValueError(f"room_type inválido · soportados: {SUPPORTED_ROOMS}")
        return v

    @field_validator("styles")
    @classmethod
    def _v_styles(cls, v: List[str]) -> List[str]:
        from virtual_staging_engine import SUPPORTED_STYLES
        bad = [s for s in v if s not in SUPPORTED_STYLES]
        if bad:
            raise ValueError(f"styles inválidos: {bad} · soportados: {SUPPORTED_STYLES}")
        if len(set(v)) != len(v):
            raise ValueError("styles no pueden repetirse")
        return v


# ─── POST /api/virtual-staging ──────────────────────────────────────────────

@router.post("/api/virtual-staging")
async def post_virtual_staging(request: Request, body: StagingBody):
    user = await _auth(request)
    _rate_limit(user.user_id)
    db = _db(request)

    try:
        from virtual_staging_engine import stage_image
        result = await stage_image(
            db=db,
            input_image_url=body.input_image_url,
            room_type=body.room_type,
            styles=body.styles,
            user_id=getattr(user, "user_id", None),
            dev_org_id=getattr(user, "tenant_id", None),
        )
        return result
    except ValueError as e:
        raise HTTPException(422, str(e))
    except RuntimeError as e:
        # External dep failure (Replicate) → 503
        log.warning(f"[virtual_staging] 503 runtime: {e}")
        raise HTTPException(503, f"Servicio de staging no disponible · {e}")
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"[virtual_staging] unexpected: {e}")
        raise HTTPException(500, f"Error interno · {str(e)[:200]}")


# ─── GET /api/virtual-staging/cache/{image_hash} ────────────────────────────

@router.get("/api/virtual-staging/cache/{image_hash}")
async def get_virtual_staging_cache(
    request: Request,
    image_hash: str,
    room: str = Query(..., min_length=1, max_length=32),
    styles: str = Query(..., min_length=1, max_length=128, description="csv sorted"),
):
    user = await _auth(request)
    _rate_limit(user.user_id)
    db = _db(request)

    try:
        from virtual_staging_engine import (
            get_cached, SUPPORTED_ROOMS, SUPPORTED_STYLES,
        )
        if room not in SUPPORTED_ROOMS:
            raise HTTPException(422, f"room inválido · soportados: {SUPPORTED_ROOMS}")
        # normalize styles_joined: split + dedupe + sorted
        try:
            req_styles = [s.strip() for s in styles.split(",") if s.strip()]
            if not req_styles or len(req_styles) > 3:
                raise ValueError("styles 1-3")
            bad = [s for s in req_styles if s not in SUPPORTED_STYLES]
            if bad:
                raise ValueError(f"styles inválidos: {bad}")
            styles_joined = ",".join(sorted(set(req_styles)))
        except ValueError as ve:
            raise HTTPException(422, str(ve))

        doc = await get_cached(db, image_hash, room, styles_joined)
        if not doc:
            raise HTTPException(404, "cache miss")
        doc["cached"] = True
        return doc
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"[virtual_staging] cache lookup unexpected: {e}")
        raise HTTPException(500, f"Error · {str(e)[:200]}")
