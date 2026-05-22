"""W5.x F7 · Marketplace Lead Capture routes.

POST /api/lead-capture/score       · público T0 · rate 30/min/IP
POST /api/lead-capture             · público T0 · rate 5/min/IP
GET  /api/lead-capture/pdf/{id}    · público T0 · sirve PDF base64 desde mongo

NOTA: Existe ya `routes/lead_capture.py` (W5.ASR.5 · email/FB webhooks). Este
módulo se llama `routes/lead_capture_marketplace.py` para evitar colisión de
nombre de archivo. Los paths de endpoints NO colisionan (ASR.5 usa
/api/webhooks/* y /api/asesor/lead-capture/*).
"""
from __future__ import annotations

import base64
import logging
import re
import time
from collections import defaultdict, deque
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field, validator

log = logging.getLogger("dmx.routes_lead_capture_marketplace")
router = APIRouter(tags=["lead-capture-marketplace"])


# ─── Rate limiting ────────────────────────────────────────────────────────────

_RATE_SCORE: Dict[str, deque] = defaultdict(lambda: deque(maxlen=30))
_RATE_CAPTURE: Dict[str, deque] = defaultdict(lambda: deque(maxlen=5))
_RATE_WINDOW_S = 60


def _client_ip(request: Request) -> str:
    ip = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    if not ip and request.client:
        ip = request.client.host
    return ip or "unknown"


def _rate_limit(request: Request, bucket: Dict[str, deque], limit: int) -> None:
    ip = _client_ip(request)
    bkt = bucket[ip]
    now = time.time()
    while bkt and (now - bkt[0]) > _RATE_WINDOW_S:
        bkt.popleft()
    if len(bkt) >= limit:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit excedido · {limit}/min por IP",
        )
    bkt.append(now)


# ─── Payloads ─────────────────────────────────────────────────────────────────

VALID_AUDIENCES = {"family", "investor", "first_home", "luxury", "boutique", "neutral"}
VALID_SCOPES = {"project", "unit"}
WHATSAPP_RE = re.compile(r"^(\+52)?\d{10}$")


class ScoreBody(BaseModel):
    visitor_session_id: str = Field(..., min_length=1, max_length=120)
    scroll_depth_pct: int = Field(..., ge=0, le=100)
    time_on_page_sec: int = Field(..., ge=0, le=86400)
    properties_viewed_count: int = Field(..., ge=0, le=1000)
    exit_intent_triggered: bool = False


class CaptureBody(BaseModel):
    name: str = Field(..., min_length=2, max_length=80)
    whatsapp: str = Field(..., min_length=10, max_length=15)
    property_id: str = Field(..., min_length=1, max_length=120)
    property_scope: str = Field(default="project")
    audience: str = Field(default="neutral")
    source_page: Optional[str] = Field(default="", max_length=200)
    visitor_session_id: Optional[str] = None
    behavioral_score: Optional[int] = Field(default=0, ge=0, le=100)
    utm: Optional[Dict[str, Any]] = None

    @validator("whatsapp")
    def _wa_format(cls, v):
        cleaned = re.sub(r"[\s\-\(\)]", "", str(v or ""))
        if not WHATSAPP_RE.match(cleaned):
            raise ValueError("whatsapp debe ser 10 dígitos MX o +52XXXXXXXXXX")
        return cleaned

    @validator("audience")
    def _aud_valid(cls, v):
        v = (v or "neutral").lower().strip()
        if v not in VALID_AUDIENCES:
            raise ValueError(f"audience debe ser uno de {sorted(VALID_AUDIENCES)}")
        return v

    @validator("property_scope")
    def _scope_valid(cls, v):
        v = (v or "project").lower().strip()
        if v not in VALID_SCOPES:
            raise ValueError(f"property_scope debe ser uno de {sorted(VALID_SCOPES)}")
        return v


# ─── Endpoint 1 · POST /score ────────────────────────────────────────────────

@router.post("/api/lead-capture/score")
async def post_score(body: ScoreBody, request: Request):
    _rate_limit(request, _RATE_SCORE, 30)
    db = request.app.state.db

    from lead_capture_marketplace_engine import (
        compute_behavioral_score,
        infer_audience_from_session,
        record_score_event,
    )

    s = compute_behavioral_score(
        body.scroll_depth_pct,
        body.time_on_page_sec,
        body.properties_viewed_count,
        body.exit_intent_triggered,
    )
    suggested = await infer_audience_from_session(db, body.visitor_session_id)

    await record_score_event(
        db,
        visitor_session_id=body.visitor_session_id,
        scroll_depth_pct=body.scroll_depth_pct,
        time_on_page_sec=body.time_on_page_sec,
        properties_viewed_count=body.properties_viewed_count,
        exit_intent_triggered=body.exit_intent_triggered,
        score=s["score"],
        should_trigger=s["should_trigger"],
        suggested_audience=suggested,
    )

    return JSONResponse({
        "score": s["score"],
        "should_trigger": s["should_trigger"],
        "suggested_audience": suggested,
    })


# ─── Endpoint 2 · POST / (create lead) ───────────────────────────────────────

@router.post("/api/lead-capture")
async def post_capture(body: CaptureBody, request: Request):
    _rate_limit(request, _RATE_CAPTURE, 5)
    db = request.app.state.db

    from lead_capture_marketplace_engine import create_lead

    payload = body.dict()
    try:
        result = await create_lead(db, payload, request=request)
    except Exception as e:  # noqa: BLE001
        log.warning(f"[lead_capture] create_lead exception: {e}")
        raise HTTPException(status_code=503, detail="lead_capture_failed")

    if not result.get("success"):
        err = result.get("error") or "lead_capture_failed"
        status = 422 if err in {"whatsapp_invalid", "name_invalid"} else 503
        raise HTTPException(status_code=status, detail=err)

    return JSONResponse(result)


# ─── Endpoint 3 · GET pdf/{file_id} ──────────────────────────────────────────

@router.get("/api/lead-capture/pdf/{file_id}")
async def get_pdf(file_id: str, request: Request):
    db = request.app.state.db
    if db is None:
        raise HTTPException(status_code=503, detail="db_unavailable")
    try:
        doc = await db.lead_capture_pdfs.find_one({"file_id": file_id}, {"_id": 0})
    except Exception as e:  # noqa: BLE001
        log.warning(f"[lead_capture] pdf lookup failed: {e}")
        raise HTTPException(status_code=503, detail="pdf_lookup_failed")
    if not doc:
        raise HTTPException(status_code=404, detail="pdf_not_found")
    try:
        pdf_bytes = base64.b64decode(doc.get("bytes_b64") or "")
    except Exception:
        raise HTTPException(status_code=503, detail="pdf_decode_failed")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="lead_{file_id}.pdf"',
            "Cache-Control": "private, max-age=86400",
        },
    )
