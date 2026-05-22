"""W5.x F5 · Reverse Search routes.

Endpoint público T0 · rate-limit 20/min/IP.
POST /api/reverse-search → {parsed, results, cached, generated_at, ms_elapsed}
"""
from __future__ import annotations

import logging
import time
from collections import defaultdict, deque
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, validator

log = logging.getLogger("dmx.routes_reverse_search")

router = APIRouter(tags=["reverse-search"])

# ─── Rate limit (deque sliding window) ────────────────────────────────────────

_RATE_BUCKET: Dict[str, deque] = defaultdict(lambda: deque(maxlen=20))
_RATE_LIMIT = 20  # 20/min/IP
_RATE_WINDOW_S = 60


def _client_ip(request: Request) -> str:
    ip = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    if not ip and request.client:
        ip = request.client.host
    return ip or "unknown"


def _rate_limit(request: Request) -> None:
    ip = _client_ip(request)
    bkt = _RATE_BUCKET[ip]
    now = time.time()
    while bkt and (now - bkt[0]) > _RATE_WINDOW_S:
        bkt.popleft()
    if len(bkt) >= _RATE_LIMIT:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit excedido · {_RATE_LIMIT}/min por IP",
        )
    bkt.append(now)


# ─── Payload ──────────────────────────────────────────────────────────────────

VALID_AUDIENCES = {"family", "investor", "first_home", "luxury", "boutique", "neutral"}


class ReverseSearchBody(BaseModel):
    text: str = Field(..., min_length=1, max_length=500)
    audience: Optional[str] = None
    language: Optional[str] = "es-MX"
    limit: Optional[int] = Field(default=10, ge=1, le=20)
    force_refresh: Optional[bool] = False

    @validator("audience")
    def _audience_in_valid(cls, v):
        if v is None or v == "":
            return None
        v = v.lower().strip()
        if v not in VALID_AUDIENCES:
            raise ValueError(f"audience debe ser uno de {sorted(VALID_AUDIENCES)}")
        return v

    @validator("text")
    def _text_strip(cls, v):
        v = (v or "").strip()
        if not v:
            raise ValueError("text vacío")
        return v


# ─── Endpoint ─────────────────────────────────────────────────────────────────

@router.post("/api/reverse-search")
async def reverse_search_endpoint(body: ReverseSearchBody, request: Request):
    _rate_limit(request)
    db = request.app.state.db

    # user_id opcional para budget tracking (no auth required)
    user_id: Optional[str] = None
    try:
        u = getattr(request.state, "user", None)
        if u:
            user_id = getattr(u, "user_id", None) or u.get("user_id")
    except Exception:
        user_id = None

    from reverse_search_engine import generate as rs_generate

    try:
        result = await rs_generate(
            db,
            text=body.text,
            audience=body.audience,
            language=body.language or "es-MX",
            limit=int(body.limit or 10),
            force_refresh=bool(body.force_refresh),
            user_id=user_id,
        )
    except Exception as e:  # noqa: BLE001
        log.warning(f"[reverse_search] endpoint failed: {e}")
        raise HTTPException(status_code=500, detail="reverse_search_failed")

    return JSONResponse(result)
