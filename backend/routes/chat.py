"""Phase 4 Batch 29 · routes — Chat Asesor In-App.

Endpoints:
  POST /api/chat/threads                       → start_thread (auth buyer)
  GET  /api/chat/threads                       → list user's threads (buyer o asesor)
  GET  /api/chat/threads/{id}/messages         → paginated messages
  POST /api/chat/threads/{id}/messages         → send_message
  POST /api/chat/threads/{id}/read             → mark_thread_read
  GET  /api/chat/unread                        → global unread count (badge poll)
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, Depends, Query
from pydantic import BaseModel

log = logging.getLogger("dmx.routes_chat")

router = APIRouter(tags=["chat"])


def _db(request: Request):
    return request.app.state.db


async def _require_authenticated(request: Request):
    from server import require_auth
    user = await require_auth(request)
    return user


async def _require_buyer(request: Request):
    from server import require_auth
    user = await require_auth(request)
    if user.role not in ("buyer", "superadmin"):
        raise HTTPException(status_code=403, detail="Acceso solo para compradores")
    return user


def _get_role(user) -> str:
    if user.role in ("advisor", "asesor_admin", "asesor_freelance"):
        return "asesor"
    if user.role in ("developer_admin", "developer_member", "developer_director"):
        return "asesor"
    if user.role == "superadmin":
        return "asesor"
    return "buyer"


# ─── Pydantic models ─────────────────────────────────────────────────────────

class StartThreadBody(BaseModel):
    asesor_id: str
    project_id: Optional[str] = None


class SendMessageBody(BaseModel):
    text: str


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/api/chat/threads", status_code=201)
async def start_thread_endpoint(body: StartThreadBody, request: Request, user=Depends(_require_buyer)):
    db = _db(request)
    from services.chat_engine import start_thread
    thread = await start_thread(db, buyer_id=user.user_id, asesor_id=body.asesor_id, project_id=body.project_id)
    return thread


@router.get("/api/chat/threads")
async def list_threads_endpoint(request: Request, user=Depends(_require_authenticated)):
    db = _db(request)
    from services.chat_engine import list_threads
    role = _get_role(user)
    threads = await list_threads(db, user_id=user.user_id, role=role)
    return threads


@router.get("/api/chat/threads/{thread_id}/messages")
async def get_messages(
    thread_id: str,
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
    before: Optional[str] = Query(default=None),
    user=Depends(_require_authenticated),
):
    db = _db(request)
    # Verify user is part of this thread
    thread = await db.chat_threads.find_one(
        {"thread_id": thread_id},
        {"_id": 0, "buyer_id": 1, "asesor_id": 1},
    )
    if not thread:
        raise HTTPException(404, "Thread no encontrado")
    if user.user_id not in (thread.get("buyer_id"), thread.get("asesor_id")) and user.role != "superadmin":
        raise HTTPException(403, "Acceso denegado")

    from services.chat_engine import get_thread_messages
    msgs = await get_thread_messages(db, thread_id=thread_id, limit=limit, before=before)
    return msgs


@router.post("/api/chat/threads/{thread_id}/messages", status_code=201)
async def send_message_endpoint(
    thread_id: str,
    body: SendMessageBody,
    request: Request,
    user=Depends(_require_authenticated),
):
    db = _db(request)
    # Verify user is part of this thread
    thread = await db.chat_threads.find_one(
        {"thread_id": thread_id},
        {"_id": 0, "buyer_id": 1, "asesor_id": 1, "status": 1},
    )
    if not thread:
        raise HTTPException(404, "Thread no encontrado")
    if user.user_id not in (thread.get("buyer_id"), thread.get("asesor_id")) and user.role != "superadmin":
        raise HTTPException(403, "Acceso denegado")

    role = _get_role(user)
    from services.chat_engine import send_message
    try:
        msg = await send_message(db, thread_id=thread_id, sender_id=user.user_id, sender_role=role, text=body.text)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return msg


@router.post("/api/chat/threads/{thread_id}/read")
async def mark_read_endpoint(thread_id: str, request: Request, user=Depends(_require_authenticated)):
    db = _db(request)
    from services.chat_engine import mark_thread_read
    ok = await mark_thread_read(db, thread_id=thread_id, user_id=user.user_id)
    if not ok:
        raise HTTPException(404, "Thread no encontrado o sin acceso")
    return {"read": True}


@router.get("/api/chat/unread")
async def get_unread(request: Request, user=Depends(_require_authenticated)):
    db = _db(request)
    from services.chat_engine import get_unread_count
    role = _get_role(user)
    count = await get_unread_count(db, user_id=user.user_id, role=role)
    return {"unread": count}
