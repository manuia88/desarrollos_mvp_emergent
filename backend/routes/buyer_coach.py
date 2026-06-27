"""W4.14 — Buyer Coach API Routes.

POST /api/buyer-coach/start
POST /api/buyer-coach/{conversation_id}/message
GET  /api/buyer-coach/{conversation_id}/stage/{n}/checklist
POST /api/buyer-coach/{conversation_id}/advance
GET  /api/buyer-coach/{conversation_id}/zone-recommendations
POST /api/buyer-coach/{conversation_id}/capture-lead

Rate limit: 30 req/min/IP (in-memory bucket).
LFPDPPP: IP hash logging.
"""
from __future__ import annotations

import hashlib
import os
import time
from collections import defaultdict, deque
from typing import Deque, Dict, Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr

import buyer_coach_engine as eng
from ratelimit import client_ip as _dmx_canon_ip  # SEGURIDAD: IP anti-spoofing (pentest 2026-06-27)

router = APIRouter()

LFPDPPP_SALT = os.environ.get("LFPDPPP_SALT", "dmx_lfpdppp_2026")
_RL_BUCKET: Dict[str, Deque[float]] = defaultdict(deque)
RL_LIMIT = 30
RL_WINDOW_S = 60


def _client_ip(request: Request) -> str:
    fwd =_dmx_canon_ip(request)
    return fwd or (request.client.host if request.client else "unknown")


def _rate_limit(ip: str) -> None:
    now = time.time()
    bucket = _RL_BUCKET[ip]
    while bucket and (now - bucket[0]) > RL_WINDOW_S:
        bucket.popleft()
    if len(bucket) >= RL_LIMIT:
        raise HTTPException(429, "rate_limit_exceeded")
    bucket.append(now)


def _ip_hash(ip: str) -> str:
    return hashlib.sha256(f"{ip}:{LFPDPPP_SALT}".encode()).hexdigest()[:32]


def _db(request: Request):
    return request.app.state.db


# ─── POST /api/buyer-coach/start ─────────────────────────────────────────────

@router.post("/api/buyer-coach/start")
async def start_coach(request: Request):
    ip = _client_ip(request)
    _rate_limit(ip)
    db = _db(request)
    result = await eng.start_conversation(db, ip_hash=_ip_hash(ip))
    return JSONResponse({"ok": True, **result})


# ─── POST /api/buyer-coach/{conversation_id}/message ─────────────────────────

class MessageBody(BaseModel):
    message: str


@router.post("/api/buyer-coach/{conversation_id}/message")
async def send_message(conversation_id: str, body: MessageBody, request: Request):
    ip = _client_ip(request)
    _rate_limit(ip)
    if not body.message.strip():
        raise HTTPException(422, "message_required")
    db = _db(request)
    result = await eng.respond(db, conversation_id, body.message.strip()[:500])
    if "error" in result:
        raise HTTPException(404, result["error"])
    return JSONResponse({"ok": True, **result})


# ─── GET /api/buyer-coach/{conversation_id}/stage/{n}/checklist ──────────────

@router.get("/api/buyer-coach/{conversation_id}/stage/{n}/checklist")
async def stage_checklist(conversation_id: str, n: int, request: Request):
    if n < 1 or n > 7:
        raise HTTPException(422, "stage_must_be_1_to_7")
    items = eng.get_stage_checklist(n)
    return JSONResponse({
        "ok": True,
        "stage": n,
        "stage_label": eng.STAGE_LABELS.get(n, ""),
        "items": items,
        "count": len(items),
    })


# ─── POST /api/buyer-coach/{conversation_id}/advance ─────────────────────────

class AdvanceBody(BaseModel):
    force_stage: Optional[int] = None


@router.post("/api/buyer-coach/{conversation_id}/advance")
async def advance_stage(conversation_id: str, body: AdvanceBody, request: Request):
    ip = _client_ip(request)
    _rate_limit(ip)
    db = _db(request)
    result = await eng.advance_stage(db, conversation_id, body.force_stage)
    if "error" in result:
        raise HTTPException(404, result["error"])
    return JSONResponse({"ok": True, **result})


# ─── GET /api/buyer-coach/{conversation_id}/zone-recommendations ──────────────

@router.get("/api/buyer-coach/{conversation_id}/zone-recommendations")
async def zone_recommendations(conversation_id: str, request: Request):
    db = _db(request)
    zones = await eng.get_zone_recommendations(db, conversation_id)
    return JSONResponse({"ok": True, "zones": zones, "count": len(zones)})


# ─── POST /api/buyer-coach/{conversation_id}/capture-lead ────────────────────

class CaptureLeadBody(BaseModel):
    email: str
    whatsapp: Optional[str] = None
    consent: bool = False


@router.post("/api/buyer-coach/{conversation_id}/capture-lead")
async def capture_lead(conversation_id: str, body: CaptureLeadBody, request: Request):
    ip = _client_ip(request)
    _rate_limit(ip)
    if not body.consent:
        raise HTTPException(422, "consent_required_lfpdppp")
    db = _db(request)
    result = await eng.capture_lead(
        db, conversation_id, body.email,
        body.whatsapp, body.consent, _ip_hash(ip)
    )
    if "error" in result:
        raise HTTPException(422, result["error"])
    return JSONResponse(result)


# ─── W5.12 Parte 3 · GET /api/buyer-coach/similar-projects ────────────────────

@router.get("/api/buyer-coach/similar-projects")
async def similar_projects(project_id: str, limit: int = 5, request: Request = None):
    if not project_id:
        raise HTTPException(422, "project_id required")
    limit = max(1, min(20, limit))
    db = _db(request)
    result = await eng.similar_projects_via_kg(db, project_id=project_id, limit=limit)
    return JSONResponse(result)
