"""W5.x F4 Sub-E · Narrative Layer routes · 3 endpoints publicos/privados.

Prefix: /api/narrative
Rate-limit: 10/min/user (deque pattern por user_id o IP).
"""
from __future__ import annotations

import logging
import time
from collections import defaultdict, deque
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from narrative_layer_engine import generate as nl_generate, ensure_indexes as nl_ensure_indexes  # noqa: F401

log = logging.getLogger("dmx.routes_narrative")

router = APIRouter(prefix="/api/narrative", tags=["narrative_layer"])

RATE_LIMIT_PER_MIN = 10
_RATE: Dict[str, deque] = defaultdict(lambda: deque(maxlen=RATE_LIMIT_PER_MIN * 4))


def _rate_check(key: str) -> bool:
    now = time.time()
    dq = _RATE[key]
    while dq and now - dq[0] > 60:
        dq.popleft()
    if len(dq) >= RATE_LIMIT_PER_MIN:
        return False
    dq.append(now)
    return True


def _client_key(request: Request) -> str:
    # Best-effort: user_id en sesion · luego X-Forwarded-For · finalmente client.host
    try:
        uid = getattr(request.state, "user_id", None)
        if uid:
            return f"u:{uid}"
    except Exception:
        pass
    xff = request.headers.get("x-forwarded-for") if request.headers else None
    if xff:
        return f"ip:{xff.split(',')[0].strip()}"
    return f"ip:{(request.client.host if request.client else 'anon')}"


def _db(request: Request):
    return request.app.state.db


# ─── Bodies ─────────────────────────────────────────────────────────────────
class GenerateBody(BaseModel):
    scope: str = Field(..., pattern=r"^(unit|project|colonia|lead_property)$")
    entity_id: str = Field(..., min_length=1, max_length=160)
    audience: str = Field("neutral", pattern=r"^(investor|family|first_home|luxury|boutique|urgent|neutral)$")
    language: str = Field("es-MX", pattern=r"^(es-MX|en-US)$")
    disc: Optional[str] = Field(None, pattern=r"^(D|I|S|C)$")
    force_refresh: bool = False


class FeedbackBody(BaseModel):
    narrative_id: str = Field(..., min_length=1)
    helpful: bool
    comment: Optional[str] = Field(None, max_length=500)


# ─── Endpoints ──────────────────────────────────────────────────────────────
@router.post("/generate")
async def generate_endpoint(body: GenerateBody, request: Request) -> Dict[str, Any]:
    key = _client_key(request)
    if not _rate_check(key):
        raise HTTPException(429, "Rate limit excedido · 10/min")
    db = _db(request)
    user_id = key.split(":", 1)[1] if key.startswith("u:") else None
    result = await nl_generate(
        db,
        scope=body.scope,
        entity_id=body.entity_id,
        audience=body.audience,
        language=body.language,
        disc=body.disc,
        force_refresh=body.force_refresh,
        user_id=user_id,
    )
    return result


@router.get("/cached/{scope}/{entity_id}")
async def get_cached(
    scope: str,
    entity_id: str,
    request: Request,
    audience: str = Query("neutral"),
    language: str = Query("es-MX"),
    disc: Optional[str] = Query(None),
) -> Dict[str, Any]:
    db = _db(request)
    doc = await db["narrative_cache"].find_one(
        {"scope": scope, "entity_id": entity_id, "audience": audience, "language": language, "disc_overlay": disc},
        {"_id": 0},
    )
    if not doc:
        raise HTTPException(404, "Narrative no encontrada en cache")
    return doc


@router.post("/feedback")
async def feedback(body: FeedbackBody, request: Request) -> Dict[str, Any]:
    db = _db(request)
    try:
        await db["narrative_feedback"].update_one(
            {"narrative_id": body.narrative_id},
            {"$set": {
                "narrative_id": body.narrative_id,
                "helpful": body.helpful,
                "comment": body.comment,
                "updated_at": time.time(),
            }},
            upsert=True,
        )
    except Exception as e:  # noqa: BLE001
        raise HTTPException(500, f"feedback persist failed: {e}")
    return {"ok": True, "narrative_id": body.narrative_id}
