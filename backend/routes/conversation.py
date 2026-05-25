"""W7.AS.3.A · Conversation AI Agent REST routes (GHL-style).

8 endpoints:
  POST /api/conversation/start                              (asesor)
  POST /api/conversation/message                            (asesor / widget)
  GET  /api/conversation/lead/{lead_id}/conversations       (asesor)
  GET  /api/conversation/{conversation_id}                  (asesor / widget)
  POST /api/conversation/handoff                            (asesor)
  GET  /api/superadmin/conversations/list                   (superadmin)
  GET  /api/superadmin/conversations/stats                  (superadmin)
  POST /api/superadmin/conversations/takeover               (superadmin)

NOTE order: /lead/... is declared before /{conversation_id} so the static prefix
wins over the path param.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from conversation_engine import ConversationEngine, ensure_indexes  # noqa: F401 (re-export)
from conversation_channels import get_adapter

log = logging.getLogger("dmx.routes_conversation")

router = APIRouter(prefix="/api/conversation", tags=["conversation"])
sa_router = APIRouter(prefix="/api/superadmin/conversations", tags=["conversation-admin"])


# ─── Pydantic models ──────────────────────────────────────────────────────────
class StartIn(BaseModel):
    lead_id: Optional[str] = None
    asesor_id: Optional[str] = None
    channel: str = "web"
    system_prompt: Optional[str] = None
    initial_context: Optional[str] = None


class MessageIn(BaseModel):
    conversation_id: str
    message: str
    role: str = "user"
    channel: Optional[str] = None
    to: Optional[str] = None  # recipient (email/phone) for adapter delivery


class HandoffIn(BaseModel):
    conversation_id: str
    reason: Optional[str] = None


class TakeoverIn(BaseModel):
    conversation_id: str


# ─── auth helpers ───────────────────────────────────────────────────────────
async def _optional_user(request: Request):
    """Returns the user if a valid token is present, else None (public-friendly).

    The ChatWidget embeds in public Z.8 landings, so start/message accept anon.
    """
    try:
        from server import get_current_user
        return await get_current_user(request)
    except Exception:
        return None


async def _require_user(request: Request):
    user = await _optional_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    return user


async def _require_superadmin(request: Request):
    user = await _require_user(request)
    if getattr(user, "role", "") != "superadmin":
        raise HTTPException(403, "Solo superadmin")
    return user


def _tenant_of(user) -> str:
    return getattr(user, "tenant_id", None) or getattr(user, "user_id", None) or "default"


# ─── Asesor endpoints ─────────────────────────────────────────────────────────
@router.post("/start", status_code=201)
async def start_conversation(body: StartIn, request: Request):
    user = await _optional_user(request)  # public-friendly (widget en landings Z.8)
    db = request.app.state.db
    engine = ConversationEngine(db)
    try:
        result = await engine.start_conversation(
            lead_id=body.lead_id,
            asesor_id=body.asesor_id or getattr(user, "user_id", None),
            tenant_id=_tenant_of(user) if user else "default",
            channel=body.channel or "web",
            system_prompt=body.system_prompt,
            initial_context=body.initial_context,
        )
    except Exception as exc:
        log.error(f"[conversation] start failed: {exc}")
        raise HTTPException(500, "Error al iniciar conversación")
    return JSONResponse(result, status_code=201)


@router.post("/message", status_code=201)
async def post_message(body: MessageIn, request: Request):
    await _optional_user(request)  # public-friendly (widget en landings Z.8)
    db = request.app.state.db
    engine = ConversationEngine(db)
    if not body.message or not body.message.strip():
        raise HTTPException(422, "Mensaje vacío")
    try:
        result = await engine.send_message(
            body.conversation_id, body.message, role=body.role or "user", channel=body.channel,
        )
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    except Exception as exc:
        log.error(f"[conversation] message failed conv={body.conversation_id}: {exc}")
        raise HTTPException(500, "Error al procesar mensaje")

    # Channel delivery (stub-aware for whatsapp/email)
    delivery: Dict[str, Any] = {"delivered": False}
    if result.get("assistant_message"):
        try:
            adapter = get_adapter(body.channel or "web")
            delivery = await adapter(
                db, {"conversation_id": body.conversation_id}, result["assistant_message"],
                to=body.to,
            )
        except Exception as exc:
            log.warning(f"[conversation] adapter deliver failed silent: {exc}")
            delivery = {"delivered": False, "detail": "adapter_error"}
    result["delivery"] = delivery
    return JSONResponse(result, status_code=201)


@router.get("/lead/{lead_id}/conversations")
async def lead_conversations(lead_id: str, request: Request):
    await _require_user(request)
    db = request.app.state.db
    engine = ConversationEngine(db)
    items = await engine.list_lead_conversations(lead_id)
    return {"lead_id": lead_id, "count": len(items), "conversations": items}


@router.get("/{conversation_id}")
async def get_conversation(conversation_id: str, request: Request):
    await _require_user(request)
    db = request.app.state.db
    engine = ConversationEngine(db)
    conv = await engine.get_conversation(conversation_id)
    if not conv:
        raise HTTPException(404, "Conversación no encontrada")
    return conv


@router.post("/handoff", status_code=201)
async def handoff(body: HandoffIn, request: Request):
    user = await _require_user(request)
    db = request.app.state.db
    engine = ConversationEngine(db)
    try:
        result = await engine.request_handoff(
            body.conversation_id, reason=body.reason,
            actor_id=getattr(user, "user_id", None),
        )
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    except Exception as exc:
        log.error(f"[conversation] handoff failed: {exc}")
        raise HTTPException(500, "Error al solicitar handoff")
    return JSONResponse(result, status_code=201)


# ─── Superadmin endpoints ─────────────────────────────────────────────────────
@sa_router.get("/list")
async def superadmin_list(
    request: Request,
    asesor_id: Optional[str] = Query(None),
    sentiment: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
):
    await _require_superadmin(request)
    db = request.app.state.db
    engine = ConversationEngine(db)
    items = await engine.superadmin_list(
        asesor_id=asesor_id, sentiment=sentiment, status=status, limit=limit)
    return {"count": len(items), "conversations": items}


@sa_router.get("/stats")
async def superadmin_stats(request: Request):
    await _require_superadmin(request)
    db = request.app.state.db
    engine = ConversationEngine(db)
    return await engine.superadmin_stats()


@sa_router.post("/takeover", status_code=201)
async def superadmin_takeover(body: TakeoverIn, request: Request):
    user = await _require_superadmin(request)
    db = request.app.state.db
    engine = ConversationEngine(db)
    try:
        result = await engine.superadmin_takeover(
            body.conversation_id, by_user=getattr(user, "user_id", "superadmin"))
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    except Exception as exc:
        log.error(f"[conversation] takeover failed: {exc}")
        raise HTTPException(500, "Error al tomar conversación")
    return JSONResponse(result, status_code=201)
