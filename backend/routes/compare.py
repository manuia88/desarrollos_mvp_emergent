"""W5.x F4.2 Sub-C · Comparator routes · POST /api/compare · rate-limit 5/min."""
from __future__ import annotations

import logging
import time
from collections import defaultdict, deque
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from comparator_engine import compare as cmp_compare, ensure_indexes as cmp_ensure_indexes  # noqa: F401

log = logging.getLogger("dmx.routes_compare")

router = APIRouter(prefix="/api/compare", tags=["comparator"])

RATE_LIMIT_PER_MIN = 5
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
    try:
        uid = getattr(request.state, "user_id", None)
        if uid:
            return f"u:{uid}"
    except Exception:
        pass
    # SEGURIDAD (4ª pasada): IP canónica anti-spoofing para la llave de rate-limit (antes XFF[0] falsificable).
    from ratelimit import client_ip as _c
    return f"ip:{_c(request)}"


class CompareBody(BaseModel):
    scope: str = Field(..., pattern=r"^(unit|project)$")
    entity_ids: List[str] = Field(..., min_length=1, max_length=3)
    audience: str = Field("neutral", pattern=r"^(investor|family|first_home|luxury|boutique|urgent|neutral)$")
    language: str = Field("es-MX", pattern=r"^(es-MX|en-US)$")
    force_refresh: bool = False


@router.post("")
async def compare_endpoint(body: CompareBody, request: Request) -> Dict[str, Any]:
    key = _client_key(request)
    if not _rate_check(key):
        raise HTTPException(429, "Rate limit excedido · 5/min")
    db = request.app.state.db
    result = await cmp_compare(
        db,
        scope=body.scope,
        entity_ids=body.entity_ids,
        audience=body.audience,
        language=body.language,
        force_refresh=body.force_refresh,
    )
    if isinstance(result, dict) and result.get("ok") is False:
        raise HTTPException(422, result.get("reason", "compare invalido"))
    return result
