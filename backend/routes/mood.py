"""W5.x F10 · Mood Engine routes.

POST /api/mood/quiz/submit                     · público T0 · rate 10/min/IP
GET  /api/mood/property/{property_id}/profile  · público T0
GET  /api/mood/user/{visitor_session_id}/latest · público T0
"""
from __future__ import annotations

import logging
import time
from collections import defaultdict, deque
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, validator
from ratelimit import client_ip as _dmx_canon_ip  # SEGURIDAD: IP anti-spoofing (pentest 2026-06-27)

log = logging.getLogger("dmx.routes_mood")
router = APIRouter(tags=["mood"])

REQUIRED_QIDS = {"q1", "q2", "q3", "q4", "q5", "q6"}
VALID_VALUES = {"a", "b"}

_RATE_QUIZ: Dict[str, deque] = defaultdict(lambda: deque(maxlen=10))
_RATE_WINDOW_S = 60


def _db(req: Request):
    return req.app.state.db


def _client_ip(req: Request) -> str:
    ip = _dmx_canon_ip(req)
    if not ip and req.client:
        ip = req.client.host
    return ip or "unknown"


def _rate_quiz(req: Request) -> None:
    ip = _client_ip(req)
    bkt = _RATE_QUIZ[ip]
    now = time.time()
    while bkt and (now - bkt[0]) > _RATE_WINDOW_S:
        bkt.popleft()
    if len(bkt) >= 10:
        raise HTTPException(429, "Rate limit excedido · 10/min")
    bkt.append(now)


class QuizBody(BaseModel):
    visitor_session_id: str = Field(..., min_length=1, max_length=120)
    answers: Dict[str, str] = Field(...)

    @validator("answers")
    def _val_answers(cls, v):
        if not isinstance(v, dict):
            raise ValueError("answers debe ser dict")
        missing = REQUIRED_QIDS - set(v.keys())
        if missing:
            raise ValueError(f"faltan respuestas: {sorted(missing)}")
        for qid, val in v.items():
            if qid not in REQUIRED_QIDS:
                raise ValueError(f"qid inválido: {qid}")
            if val not in VALID_VALUES:
                raise ValueError(f"value inválido para {qid}: {val}")
        return v


# ─── POST quiz/submit ────────────────────────────────────────────────────────

@router.post("/api/mood/quiz/submit")
async def quiz_submit(body: QuizBody, request: Request):
    _rate_quiz(request)
    db = _db(request)
    from mood_engine import submit_quiz

    res = await submit_quiz(db, body.visitor_session_id, body.answers)
    if not res.get("ok"):
        raise HTTPException(422, res.get("reason") or "validation_error")
    return {
        "mood_vector": res.get("mood_vector"),
        "mood_label": res.get("mood_label"),
        "matches": res.get("matches"),
        "result_id": res.get("result_id"),
    }


# ─── GET property/{id}/profile ───────────────────────────────────────────────

@router.get("/api/mood/property/{property_id}/profile")
async def property_profile(property_id: str, request: Request):
    db = _db(request)
    from mood_property_profiler import get_or_build_profile

    res = await get_or_build_profile(db, property_id)
    if not res:
        raise HTTPException(404, "Propiedad no encontrada")
    # Strip datetimes for JSON
    out = {
        "property_id": res.get("property_id"),
        "name": res.get("name"),
        "mood_tags": res.get("mood_tags"),
        "vibe_summary": res.get("vibe_summary"),
        "photo_url": res.get("photo_url"),
    }
    return out


# ─── GET user/{sid}/latest ───────────────────────────────────────────────────

@router.get("/api/mood/user/{visitor_session_id}/latest")
async def user_latest(visitor_session_id: str, request: Request):
    if not visitor_session_id or len(visitor_session_id) > 120:
        raise HTTPException(422, "visitor_session_id inválido")
    db = _db(request)
    try:
        doc = await db.mood_quiz_results.find_one(
            {"visitor_session_id": visitor_session_id},
            {"_id": 0},
            sort=[("created_at", -1)],
        )
    except Exception as e:
        log.warning(f"[mood] user_latest query fail: {e}")
        doc = None
    if not doc:
        raise HTTPException(404, "El visitor no ha completado el quiz")
    ts = doc.get("created_at")
    if isinstance(ts, datetime):
        doc["created_at"] = ts.isoformat()
    ttl = doc.get("ttl_until")
    if isinstance(ttl, datetime):
        doc["ttl_until"] = ttl.isoformat()
    return {
        "visitor_session_id": visitor_session_id,
        "mood_vector": doc.get("mood_vector"),
        "mood_label": doc.get("mood_label"),
        "top_matches": doc.get("top_matches") or [],
        "created_at": doc.get("created_at"),
    }
