"""W4.4E — Phase Y.1E · Asistente público REST routes.

Endpoints:
  POST /api/asistente/sessions                          (público, sin auth)
  POST /api/asistente/sessions/{token}/messages         (público)
  POST /api/asistente/sessions/{token}/capture-lead     (público)
  GET  /api/superadmin/asistente/usage                   (superadmin)
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from asistente_engine import (
    AsistenteEngine,
    AsistenteDisabledError,
    AsistenteRateLimitError,
    AsistenteSessionCapError,
)

log = logging.getLogger("dmx.routes_asistente")

router = APIRouter(prefix="/api/asistente", tags=["asistente"])
sa_router = APIRouter(prefix="/api/superadmin/asistente", tags=["asistente-admin"])


def _extract_ip(request: Request) -> str:
    forwarded = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    return forwarded or (request.client.host if request.client else "unknown")


# ─── Pydantic models ──────────────────────────────────────────────────────────
class StartSessionIn(BaseModel):
    referral_source: Optional[str] = None


class SendMessageIn(BaseModel):
    message: str


class CaptureLeadIn(BaseModel):
    nombre: str
    whatsapp: str
    email: Optional[str] = None
    mensaje: Optional[str] = None


# ─── Public endpoints ─────────────────────────────────────────────────────────
@router.post("/sessions", status_code=201)
async def start_session(body: StartSessionIn, request: Request):
    db = request.app.state.db
    engine = AsistenteEngine(db)
    ip = _extract_ip(request)
    ua = request.headers.get("user-agent", "")
    try:
        result = await engine.start_session(ip, ua, referral_source=body.referral_source)
    except AsistenteDisabledError as e:
        raise HTTPException(503, str(e))
    except AsistenteRateLimitError as e:
        raise HTTPException(429, str(e))
    except Exception as e:
        log.error(f"[asistente] start_session failed: {e}")
        raise HTTPException(500, "Error al iniciar sesión")
    return JSONResponse(result, status_code=201)


@router.post("/sessions/{session_token}/messages", status_code=201)
async def send_message(session_token: str, body: SendMessageIn, request: Request):
    db = request.app.state.db
    engine = AsistenteEngine(db)
    if not body.message or not body.message.strip():
        raise HTTPException(422, "Mensaje vacío")
    try:
        result = await engine.chat(session_token, body.message)
    except AsistenteDisabledError as e:
        raise HTTPException(503, str(e))
    except AsistenteRateLimitError as e:
        raise HTTPException(429, str(e))
    except AsistenteSessionCapError as e:
        raise HTTPException(429, str(e))
    except ValueError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        log.error(f"[asistente] send_message failed session={session_token}: {e}")
        raise HTTPException(500, "Error al procesar mensaje")
    return JSONResponse(result, status_code=201)


@router.post("/sessions/{session_token}/capture-lead", status_code=201)
async def capture_lead(session_token: str, body: CaptureLeadIn, request: Request):
    db = request.app.state.db
    engine = AsistenteEngine(db)
    if not body.nombre or not body.nombre.strip():
        raise HTTPException(422, "Nombre requerido")
    if not body.whatsapp or not body.whatsapp.strip():
        raise HTTPException(422, "WhatsApp requerido")
    try:
        result = await engine.capture_lead(
            session_token,
            nombre=body.nombre, whatsapp=body.whatsapp,
            email=body.email, mensaje=body.mensaje,
        )
    except ValueError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        log.error(f"[asistente] capture_lead failed session={session_token}: {e}")
        raise HTTPException(500, "Error al guardar el contacto")
    return JSONResponse(result, status_code=201)


# ─── Superadmin usage ─────────────────────────────────────────────────────────
@sa_router.get("/usage")
async def asistente_usage(request: Request, days: int = Query(30, ge=1, le=365)):
    from permissions import require_superadmin
    await require_superadmin(request)
    db = request.app.state.db

    since = datetime.now(timezone.utc) - timedelta(days=days)

    sessions_count = await db.asistente_sessions.count_documents({"created_at": {"$gte": since}})
    messages_count = await db.asistente_messages.count_documents({"created_at": {"$gte": since}})
    leads_captured = await db.asistente_sessions.count_documents({
        "created_at": {"$gte": since},
        "captured_lead_id": {"$ne": None},
    })

    # Avg session length (messages per session)
    avg_pipe = [
        {"$match": {"created_at": {"$gte": since}}},
        {"$group": {"_id": None, "avg": {"$avg": "$message_count"}}},
    ]
    avg_agg = await db.asistente_sessions.aggregate(avg_pipe).to_list(length=1)
    avg_session_length = round(avg_agg[0]["avg"], 2) if avg_agg else 0

    # Intent breakdown
    intent_pipe = [
        {"$match": {"created_at": {"$gte": since}, "role": "user", "intent_detected": {"$ne": None}}},
        {"$group": {"_id": "$intent_detected", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    intent_breakdown = [
        {"intent": r["_id"], "count": r["count"]}
        async for r in db.asistente_messages.aggregate(intent_pipe)
    ]

    # Cost
    cost_pipe = [
        {"$match": {"created_at": {"$gte": since}, "role": "assistant"}},
        {"$group": {"_id": None, "total_cost": {"$sum": "$cost_usd"}, "total_tokens_in": {"$sum": "$tokens_in"}, "total_tokens_out": {"$sum": "$tokens_out"}}},
    ]
    cost_agg = await db.asistente_messages.aggregate(cost_pipe).to_list(length=1)
    totals = cost_agg[0] if cost_agg else {"total_cost": 0, "total_tokens_in": 0, "total_tokens_out": 0}
    totals.pop("_id", None)

    conversion_rate = round((leads_captured / sessions_count) * 100, 2) if sessions_count else 0

    return JSONResponse({
        "days": days,
        "sessions_count": sessions_count,
        "messages_count": messages_count,
        "leads_captured": leads_captured,
        "conversion_rate_pct": conversion_rate,
        "avg_session_length_messages": avg_session_length,
        "intent_breakdown": intent_breakdown,
        **totals,
    })
