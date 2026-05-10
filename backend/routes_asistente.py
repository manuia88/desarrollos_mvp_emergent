"""W4.4E — Phase Y.1E · Asistente público REST routes.

Endpoints:
  POST /api/asistente/sessions                          (público, sin auth)
  POST /api/asistente/sessions/{token}/messages         (público)
  POST /api/asistente/sessions/{token}/capture-lead     (público)
  GET  /api/superadmin/asistente/usage                   (superadmin)
"""
from __future__ import annotations

import logging
from collections import defaultdict
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

# W4.4E.5.2 · Rate limit capture-lead: 3 leads/hora/ip_hash
_lead_capture_buckets: Dict[str, list] = defaultdict(list)


def _check_capture_rate(ip_hash: str, limit: int = 3, window_s: int = 3600) -> bool:
    import time
    now = time.monotonic()
    _lead_capture_buckets[ip_hash] = [t for t in _lead_capture_buckets[ip_hash] if now - t < window_s]
    if len(_lead_capture_buckets[ip_hash]) >= limit:
        return False
    _lead_capture_buckets[ip_hash].append(now)
    return True


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
    map_context: Optional[str] = None  # W4.18.2A — contexto mapa inyectado desde /mapa


class CaptureLeadIn(BaseModel):
    nombre: str
    whatsapp: str
    email: Optional[str] = None
    mensaje: Optional[str] = None
    source: Optional[str] = None  # override: "caya_bubble" o "asistente_publico" (default)


# ─── Public endpoints ─────────────────────────────────────────────────────────
@router.get("/sessions/{session_token}")
async def get_session(session_token: str, request: Request):
    """Hidrata sesión existente: retorna mensajes user/assistant orden cronológico."""
    db = request.app.state.db
    sess = await db.asistente_sessions.find_one({"_id": session_token}, {"_id": 0})
    if not sess:
        raise HTTPException(404, "Sesión no encontrada")
    if sess.get("status") == "expired":
        raise HTTPException(410, "Sesión expirada")

    msgs = await db.asistente_messages.find(
        {"session_token": session_token, "role": {"$in": ["user", "assistant"]}},
        {"_id": 0, "role": 1, "content": 1, "tool_calls": 1, "intent_detected": 1, "simulated": 1, "created_at": 1},
    ).sort("created_at", 1).to_list(length=200)
    for m in msgs:
        ts = m.get("created_at")
        if isinstance(ts, datetime):
            m["created_at"] = ts.isoformat()
    sess_ts = sess.get("created_at")
    if isinstance(sess_ts, datetime):
        sess["created_at"] = sess_ts.isoformat()
    last_ts = sess.get("last_message_at")
    if isinstance(last_ts, datetime):
        sess["last_message_at"] = last_ts.isoformat()

    return JSONResponse({
        "session_token": session_token,
        "status": sess.get("status"),
        "channel": sess.get("channel", "web"),
        "message_count": sess.get("message_count", 0),
        "messages": msgs,
    })


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
        result = await engine.chat(session_token, body.message, map_context=body.map_context or "")
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

    # W4.4E.5.2 · Rate limit 3 leads/hora/ip_hash
    from behavioral_tracking_engine import _hash_ip
    ip_raw = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip() or (request.client.host if request.client else "unknown")
    ip_hash = _hash_ip(ip_raw)
    if not _check_capture_rate(ip_hash, limit=3, window_s=3600):
        try:
            await db.activity_log.insert_one({
                "type": "asistente.lead_capture_rate_limited",
                "ip_hash": ip_hash,
                "session_token": session_token,
                "created_at": datetime.now(timezone.utc),
            })
        except Exception:
            pass
        raise HTTPException(429, detail={
            "ok": False,
            "error": "rate_limit_capture_lead",
            "retry_after_seconds": 3600,
        })

    try:
        result = await engine.capture_lead(
            session_token,
            nombre=body.nombre, whatsapp=body.whatsapp,
            email=body.email, mensaje=body.mensaje,
            source=body.source,
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
