"""W4.4 — Phase Y.1A · Director Agent REST routes.

Prefijos:
  /api/director/...              → developer / inmobiliaria roles (own org)
  /api/superadmin/director/...   → superadmin

Rate limits:
  5 sessions/hora/user   (en-process TTL)
  30 messages/min/user   (en-process TTL)
"""
from __future__ import annotations

import logging
import time
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from director_agent_engine import (
    DirectorAgent,
    PhaseYDisabledError,
    SessionEndedError,
    TierCapExceededError,
)

log = logging.getLogger("dmx.routes_director")

# ─── Rate limiters ────────────────────────────────────────────────────────────
_session_buckets: Dict[str, list] = defaultdict(list)   # user_id → [timestamps]
_message_buckets: Dict[str, list] = defaultdict(list)

def _check_rate(buckets: Dict[str, list], key: str, limit: int, window_s: int) -> bool:
    now = time.monotonic()
    buckets[key] = [t for t in buckets[key] if now - t < window_s]
    if len(buckets[key]) >= limit:
        return False
    buckets[key].append(now)
    return True

# ─── Auth helpers ─────────────────────────────────────────────────────────────
DIRECTOR_ROLES = {"desarrollador", "inmobiliaria", "advisor", "developer_admin", "superadmin"}


async def _get_user(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    return user


async def _require_director_access(request: Request, session_org_id: Optional[str] = None):
    """developer/inmobiliaria → solo su org · superadmin → cualquier org."""
    user = await _get_user(request)
    role = getattr(user, "role", "")
    if role not in DIRECTOR_ROLES:
        raise HTTPException(403, "Tu rol no tiene acceso al Director AI")
    if session_org_id and role != "superadmin":
        tenant_id = getattr(user, "tenant_id", None)
        if tenant_id != session_org_id:
            raise HTTPException(403, "Acceso denegado a esta sesión")
    return user


# ─── Pydantic models ──────────────────────────────────────────────────────────
class SendMessageIn(BaseModel):
    content: str


# ─── Router ───────────────────────────────────────────────────────────────────
router = APIRouter(prefix="/api/director", tags=["director"])
sa_router = APIRouter(prefix="/api/superadmin/director", tags=["director-admin"])


def _session_to_dict(doc: Dict[str, Any]) -> Dict[str, Any]:
    d = dict(doc)
    d.pop("_id", None)
    for k in ("created_at", "last_message_at"):
        v = d.get(k)
        if isinstance(v, datetime):
            d[k] = v.isoformat()
    return d


def _msg_to_dict(doc: Dict[str, Any]) -> Dict[str, Any]:
    d = dict(doc)
    d.pop("_id", None)
    ts = d.get("created_at")
    if isinstance(ts, datetime):
        d["created_at"] = ts.isoformat()
    return d


# POST /api/director/sessions — iniciar sesión
@router.post("/sessions", status_code=201)
async def start_session(request: Request):
    user = await _require_director_access(request)
    user_id = getattr(user, "user_id", "unknown")
    org_id = getattr(user, "tenant_id", None)
    role = getattr(user, "role", "unknown")

    if not org_id:
        raise HTTPException(422, "user sin tenant_id")

    # Rate limit: 5 sessions/hora/user
    if not _check_rate(_session_buckets, user_id, 5, 3600):
        raise HTTPException(429, "Límite de sesiones alcanzado (5/hora). Intenta más tarde.")

    agent = DirectorAgent(request.app.state.db, org_id, user_id, role)
    try:
        session_id = await agent.start_session()
    except PhaseYDisabledError as e:
        raise HTTPException(403, f"Phase Y desactivada: {e}")

    return JSONResponse(
        {"session_id": session_id, "org_id": org_id, "user_id": user_id, "status": "active"},
        status_code=201,
    )


# GET /api/director/sessions/{session_id} — metadata
@router.get("/sessions/{session_id}")
async def get_session(session_id: str, request: Request):
    db = request.app.state.db
    doc = await db.director_sessions.find_one({"_id": session_id})
    if not doc:
        raise HTTPException(404, "Sesión no encontrada")
    await _require_director_access(request, doc.get("org_id"))
    return JSONResponse(_session_to_dict(doc))


# POST /api/director/sessions/{session_id}/messages — enviar mensaje
@router.post("/sessions/{session_id}/messages", status_code=201)
async def send_message(session_id: str, body: SendMessageIn, request: Request):
    db = request.app.state.db
    sess = await db.director_sessions.find_one({"_id": session_id})
    if not sess:
        raise HTTPException(404, "Sesión no encontrada")
    await _require_director_access(request, sess.get("org_id"))

    if sess.get("status") == "ended":
        raise HTTPException(410, "Sesión terminada (Gone). Inicia una nueva sesión.")

    user = await _get_user(request)
    user_id = getattr(user, "user_id", "unknown")

    # Rate limit: 30 mensajes/min/user
    if not _check_rate(_message_buckets, user_id, 30, 60):
        raise HTTPException(429, "Límite de mensajes alcanzado (30/min). Intenta en un momento.")

    if not body.content or not body.content.strip():
        raise HTTPException(422, "El contenido del mensaje no puede estar vacío")

    agent = DirectorAgent(
        db,
        org_id=sess["org_id"],
        user_id=sess["user_id"],
        role=sess["role"],
    )
    try:
        result = await agent.chat(session_id, body.content.strip())
    except SessionEndedError:
        raise HTTPException(410, "Sesión terminada (Gone). Inicia una nueva sesión.")
    except TierCapExceededError as e:
        raise HTTPException(403, f"Cap de tokens del tier alcanzado: {e}")
    except PhaseYDisabledError as e:
        raise HTTPException(403, f"Phase Y desactivada: {e}")
    except Exception as exc:
        log.error(f"[director] chat error session={session_id}: {exc}")
        raise HTTPException(500, "Error interno del Director AI. Intenta de nuevo.")

    return JSONResponse(
        {
            "message_id": result["message_id"],
            "assistant_message": result["assistant_message"],
            "tool_calls": result.get("tool_calls", []),
            "tokens_in": result["tokens_in"],
            "tokens_out": result["tokens_out"],
            "cost_usd": result["cost_usd"],
            "simulated": result.get("simulated", False),
            "memory_hits": result.get("memory_hits", []),
        },
        status_code=201,
    )


# GET /api/director/sessions/{session_id}/messages — historial
@router.get("/sessions/{session_id}/messages")
async def list_messages(session_id: str, request: Request, page: int = 1, limit: int = 50):
    db = request.app.state.db
    doc = await db.director_sessions.find_one({"_id": session_id})
    if not doc:
        raise HTTPException(404, "Sesión no encontrada")
    await _require_director_access(request, doc.get("org_id"))

    if limit > 100:
        limit = 100
    skip = (page - 1) * limit

    msgs = await db.director_messages.find(
        {"session_id": session_id},
        {"_id": 0},
    ).sort("created_at", 1).skip(skip).limit(limit).to_list(length=limit)

    return JSONResponse({"items": [_msg_to_dict(m) for m in msgs], "page": page, "limit": limit})


# DELETE /api/director/sessions/{session_id} — cerrar sesión
@router.delete("/sessions/{session_id}")
async def end_session(session_id: str, request: Request):
    db = request.app.state.db
    sess = await db.director_sessions.find_one({"_id": session_id})
    if not sess:
        raise HTTPException(404, "Sesión no encontrada")
    await _require_director_access(request, sess.get("org_id"))

    agent = DirectorAgent(db, sess["org_id"], sess["user_id"], sess["role"])
    try:
        await agent.end_session(session_id)
    except ValueError:
        raise HTTPException(404, "Sesión no encontrada")

    return JSONResponse({"ok": True, "session_id": session_id, "status": "ended"})


# ─── Superadmin usage metrics ─────────────────────────────────────────────────
@sa_router.get("/usage")
async def director_usage(
    request: Request,
    org_id: Optional[str] = None,
    days: int = 30,
):
    from permissions import require_superadmin
    await require_superadmin(request)
    db = request.app.state.db

    since = datetime.now(timezone.utc) - timedelta(days=days)
    sess_q: Dict[str, Any] = {"created_at": {"$gte": since}}
    if org_id:
        sess_q["org_id"] = org_id

    sessions_count = await db.director_sessions.count_documents(sess_q)

    agg = await db.director_sessions.aggregate([
        {"$match": sess_q},
        {"$group": {
            "_id": None,
            "total_tokens_in":  {"$sum": "$total_tokens_in"},
            "total_tokens_out": {"$sum": "$total_tokens_out"},
            "total_cost_usd":   {"$sum": "$total_cost_usd"},
        }},
    ]).to_list(length=1)
    totals = agg[0] if agg else {"total_tokens_in": 0, "total_tokens_out": 0, "total_cost_usd": 0}
    totals.pop("_id", None)

    # Tool calls breakdown
    tc_since = datetime.now(timezone.utc) - timedelta(days=days)
    tc_q: Dict[str, Any] = {"created_at": {"$gte": tc_since}}
    tool_agg = await db.director_tool_calls.aggregate([
        {"$match": tc_q},
        {"$group": {"_id": "$tool_name", "count": {"$sum": 1}, "errors": {"$sum": {"$cond": [{"$ifNull": ["$error", False]}, 1, 0]}}}},
        {"$sort": {"count": -1}},
    ]).to_list(length=20)
    tool_breakdown = [{"tool_name": t["_id"], "count": t["count"], "errors": t["errors"]} for t in tool_agg]

    return JSONResponse({
        "days": days,
        "org_id": org_id,
        "sessions_count": sessions_count,
        **totals,
        "tool_calls_breakdown": tool_breakdown,
    })
