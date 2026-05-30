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
import time
from collections import defaultdict, deque
from typing import Any, Deque, Dict, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from conversation_engine import ConversationEngine, ensure_indexes  # noqa: F401 (re-export)
from conversation_channels import get_adapter

log = logging.getLogger("dmx.routes_conversation")

router = APIRouter(prefix="/api/conversation", tags=["conversation"])
sa_router = APIRouter(prefix="/api/superadmin/conversations", tags=["conversation-admin"])


# F2 fix · rate-limit IP buckets para endpoints públicos (in-memory · prod=Redis)
_RL_START: Dict[str, Deque[float]] = defaultdict(deque)
_RL_MSG: Dict[str, Deque[float]] = defaultdict(deque)
_RL_LIMIT_START = 5     # 5 starts/min/IP (abuse: bot spawning conversations)
_RL_LIMIT_MSG = 30      # 30 msg/min/IP (un humano no manda más de 1/2s sostenido)
_RL_WINDOW_S = 60

# D3 audit recheck · daily cap anon (in-memory · prod=Redis)
_RL_ANON_DAILY: Dict[str, Deque[float]] = defaultdict(deque)
_RL_ANON_DAILY_LIMIT = 100   # 100 mensajes/día/IP sin auth (humano normal ≤30)
_RL_DAILY_WINDOW_S = 86400

# D4 audit recheck · evita memory leak · cleanup periódico de IPs viejas + size cap
_RL_MAX_BUCKETS = 10000          # cap defensivo · ≥10k IPs distintas activas = anomalía
_RL_LAST_CLEANUP = [0.0]         # timestamp del último cleanup global (1 por proceso)
_RL_CLEANUP_INTERVAL_S = 600     # cleanup global cada 10 min


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    if fwd:
        return fwd
    return request.client.host if request.client else "unknown"


def _gc_bucket(bucket_dict: Dict[str, Deque[float]], window_s: int) -> None:
    """D4 · global GC: borra IPs cuyos buckets están vacíos tras cleanup
    + drena el bucket de cada IP a su ventana. O(N) pero solo cada 10 min."""
    now = time.time()
    if now - _RL_LAST_CLEANUP[0] < _RL_CLEANUP_INTERVAL_S:
        return
    _RL_LAST_CLEANUP[0] = now
    dead_keys = []
    for ip, bucket in bucket_dict.items():
        while bucket and (now - bucket[0]) > window_s:
            bucket.popleft()
        if not bucket:
            dead_keys.append(ip)
    for k in dead_keys:
        bucket_dict.pop(k, None)


def _rate_limit_check(bucket_dict: Dict[str, Deque[float]], ip: str, limit: int,
                     window_s: int = _RL_WINDOW_S) -> None:
    now = time.time()
    # D4 · cap defensivo (DDoS protection): si el diccionario crece de más,
    # forzamos GC inmediato. Si tras GC sigue sobre el cap → 429 generalizado
    # (protege memoria del worker · prefiero degradar a permitir leak).
    if len(bucket_dict) >= _RL_MAX_BUCKETS:
        _gc_bucket(bucket_dict, window_s)
        if len(bucket_dict) >= _RL_MAX_BUCKETS:
            raise HTTPException(429, "rate_limit_pressure")
    else:
        _gc_bucket(bucket_dict, window_s)
    bucket = bucket_dict[ip]
    while bucket and (now - bucket[0]) > window_s:
        bucket.popleft()
    if len(bucket) >= limit:
        raise HTTPException(429, "rate_limit_exceeded")
    bucket.append(now)


# ─── Pydantic models ──────────────────────────────────────────────────────────
class StartIn(BaseModel):
    lead_id: Optional[str] = None
    asesor_id: Optional[str] = None
    channel: str = "web"
    system_prompt: Optional[str] = None
    initial_context: Optional[str] = None
    session_key: Optional[str] = None  # F12 · idempotency by session


class MessageIn(BaseModel):
    conversation_id: str
    message: str
    role: str = "user"
    channel: Optional[str] = None
    to: Optional[str] = None  # recipient (email/phone) for adapter delivery
    client_msg_id: Optional[str] = None  # F5 · idempotency key


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
    # F2 · rate-limit IP (público anon)
    _rate_limit_check(_RL_START, _client_ip(request), _RL_LIMIT_START)
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
            session_key=body.session_key,                      # F12
            is_anon=user is None,                              # F9
            caller_role=getattr(user, "role", None) if user else None,  # D7
        )
    except Exception as exc:
        log.error(f"[conversation] start failed: {exc}")
        raise HTTPException(500, "Error al iniciar conversación")
    return JSONResponse(result, status_code=201)


@router.post("/message", status_code=201)
async def post_message(body: MessageIn, request: Request):
    # F2 · rate-limit IP per-min (público anon)
    ip = _client_ip(request)
    _rate_limit_check(_RL_MSG, ip, _RL_LIMIT_MSG)
    user = await _optional_user(request)  # public-friendly (widget en landings Z.8)

    # D3 audit recheck · daily cap por IP cuando anon (quota engine no protege
    # IPs porque no son user_ids registrados). Cap 100/día/IP sin auth.
    if user is None:
        _rate_limit_check(_RL_ANON_DAILY, ip, _RL_ANON_DAILY_LIMIT,
                          window_s=_RL_DAILY_WINDOW_S)

    db = request.app.state.db
    engine = ConversationEngine(db)
    if not body.message or not body.message.strip():
        raise HTTPException(422, "Mensaje vacío")

    # F2 · pre-LLM quota check (FAIL-OPEN si quota engine ausente).
    # Si autenticado, quota engine aplica per-user/per-tenant cap real.
    # Si anon, el daily cap por IP (D3 arriba) ya es la barrera.
    if user is not None:
        try:
            from ai_budget import check_quota_or_raise
            await check_quota_or_raise(db, getattr(user, "user_id", None),
                                       estimated_tokens=1500)
        except HTTPException:
            raise
        except Exception as exc:
            log.warning(f"[conversation] quota check skipped: {exc}")

    try:
        result = await engine.send_message(
            body.conversation_id, body.message, role=body.role or "user", channel=body.channel,
            client_msg_id=body.client_msg_id,  # F5
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
    user = await _require_user(request)
    db = request.app.state.db
    engine = ConversationEngine(db)
    is_sa = getattr(user, "role", "") == "superadmin"
    items = await engine.list_lead_conversations(
        lead_id, caller_tenant_id=_tenant_of(user), is_superadmin=is_sa,  # F1
    )
    return {"lead_id": lead_id, "count": len(items), "conversations": items}


@router.get("/asesor/inbox")
async def asesor_inbox(
    request: Request,
    sentiment: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
):
    """B2 fix · Bandeja del asesor: SUS propias conversaciones (asesor_id = usuario actual).
    Reusa el motor (superadmin_list) forzando el scope al asesor → NO toca el router superadmin.
    Antes la UI pegaba a /api/superadmin/conversations/list (superadmin-only) → 403 siempre vacía."""
    user = await _require_user(request)
    db = request.app.state.db
    engine = ConversationEngine(db)
    items = await engine.superadmin_list(
        asesor_id=getattr(user, "user_id", None),
        sentiment=sentiment, status=status, limit=limit,
        caller_tenant_id=None, is_superadmin=False,
    )
    return {"count": len(items), "conversations": items}


@router.get("/{conversation_id}")
async def get_conversation(conversation_id: str, request: Request):
    user = await _require_user(request)
    db = request.app.state.db
    engine = ConversationEngine(db)
    is_sa = getattr(user, "role", "") == "superadmin"
    conv = await engine.get_conversation(
        conversation_id, caller_tenant_id=_tenant_of(user), is_superadmin=is_sa,  # F1
    )
    if not conv:
        raise HTTPException(404, "Conversación no encontrada")
    return conv


@router.post("/handoff", status_code=201)
async def handoff(body: HandoffIn, request: Request):
    user = await _require_user(request)
    db = request.app.state.db
    engine = ConversationEngine(db)
    is_sa = getattr(user, "role", "") == "superadmin"
    try:
        result = await engine.request_handoff(
            body.conversation_id, reason=body.reason,
            actor_id=getattr(user, "user_id", None),
            caller_tenant_id=_tenant_of(user),  # F3
            is_superadmin=is_sa,                 # F3
        )
    except ValueError as exc:
        # F3 · 403 si owner mismatch, 404 si no existe
        if "permiso" in str(exc).lower() or "owner" in str(exc).lower():
            raise HTTPException(403, str(exc))
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
