"""W4.4E.5 — Atlax Engine (formerly Caya, renamed W4.4E.5.2).

atlax_engine es un THIN WRAPPER sobre AsistenteEngine (W4.4E):
- Mantiene endpoints `/api/atlax/query` y `/api/atlax/sessions/{id}/history`
- Persiste en `caya_messages` (legacy DB collection name kept) Y en `asistente_messages` (canonical)
- Mapea legacy session_ids `dmx_caya_*` AND new `dmx_atlax_*` → asistente_token
- Mantiene RAG semantic_search para `citations`
- Combina lead_score heurístico + suggested_lead_capture del Asistente para `hand_off_recommended`
- Nuevos campos en response: `tier`, `asistente_session_token`, `simulated`, `memory_hits`

NOTA: El brand cambió a "Atlax" (W4.4E.5.2) pero las collections DB
(caya_sessions, caya_messages, caya_sessions_migration) mantienen su nombre
para preservar datos históricos sin migración destructiva.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

log = logging.getLogger("dmx.atlax")

router = APIRouter(tags=["atlax"])


class AtlaxQueryIn(BaseModel):
    query: str = Field(..., min_length=2, max_length=500)
    session_id: Optional[str] = None
    channel: str = Field(default="web", pattern=r"^(whatsapp|web|web_bubble)$")
    thread_id: Optional[str] = None  # W4.11a · null = creates new thread auto
    org_id: Optional[str] = None      # W4.7 Y.4A · persona org context (default "dmx")


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def ensure_atlax_indexes(db) -> None:
    """Mantiene indexes legacy + agrega index para tabla de migración.

    NOTA: el nombre de la función cambió de ensure_caya_indexes a ensure_atlax_indexes
    pero las collections DB siguen siendo `caya_sessions`/`caya_messages` para
    preservar back-compat sin migración destructiva.
    """
    try:
        await db.caya_sessions.create_index("session_id", name="idx_caya_session_id", background=True)
        await db.caya_sessions.create_index("created_at", name="idx_caya_created_at", background=True)
        await db.caya_messages.create_index([("session_id", 1), ("created_at", 1)], name="idx_caya_msg_session_time", background=True)
        await db.caya_sessions_migration.create_index("legacy_id", unique=True, name="idx_caya_migration_legacy", background=True)
        await db.caya_sessions_migration.create_index("asistente_token", name="idx_caya_migration_token", background=True)
        # W4.11a · atlax_threads
        await db.atlax_threads.create_index("thread_id", unique=True, name="idx_atlax_thread_id_unique", background=True)
        await db.atlax_threads.create_index([("session_token", 1), ("last_message_at", -1)], name="idx_atlax_thread_session_recent", background=True)
        await db.caya_messages.create_index([("thread_id", 1), ("created_at", 1)], name="idx_caya_msg_thread_time", background=True)
    except Exception as e:
        log.warning(f"[caya] ensure_indexes warning: {e}")


def _estimate_lead_score(query: str) -> int:
    """Heurístico es-MX. Mantener idéntico al original para retrocompatibilidad."""
    q = (query or "").lower()
    score = 30
    keywords_high = ["comprar", "agendar", "visitar", "presupuesto", "financiamiento", "crédito", "credito", "interesa", "precio", "cuánto"]
    keywords_medium = ["polanco", "roma", "condesa", "lomas", "santa fe", "depto", "casa", "amenidades"]
    for kw in keywords_high:
        if kw in q:
            score += 15
    for kw in keywords_medium:
        if kw in q:
            score += 5
    return min(score, 100)


def _extract_ip(request: Request) -> str:
    forwarded = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    return forwarded or (request.client.host if request.client else "unknown")


async def _resolve_asistente_token(
    engine, db, payload_session_id: Optional[str], ip: str, ua: str,
) -> tuple[str, str, bool]:
    """Resuelve session_id legacy → asistente_token.

    Returns: (legacy_session_id, asistente_token, is_new)
    """
    # Caso 1: cliente ya nos manda asistente_token directamente (formato asis_*)
    if payload_session_id and payload_session_id.startswith("asis_"):
        sess = await db.asistente_sessions.find_one({"_id": payload_session_id}, {"_id": 1})
        if sess:
            return payload_session_id, payload_session_id, False
        # token inválido/expirado → caemos a crear nuevo

    # Caso 2: legacy dmx_caya_*
    if payload_session_id:
        token = await engine.get_or_create_from_legacy(payload_session_id, ip, ua)
        return payload_session_id, token, False

    # Caso 3: nueva sesión (prefix dmx_atlax_* en sesiones nuevas post-rename)
    legacy_id = f"dmx_atlax_{uuid.uuid4().hex[:12]}"
    res = await engine.start_session(ip, ua, referral_source="caya_bubble")
    token = res["session_token"]
    await db.caya_sessions_migration.update_one(
        {"legacy_id": legacy_id},
        {"$set": {"legacy_id": legacy_id, "asistente_token": token, "created_at": _now()}},
        upsert=True,
    )
    return legacy_id, token, True


# ─── W4.11a · Thread management ───────────────────────────────────────────────
def _truncate_title(query: str, max_len: int = 60) -> str:
    """Genera título de thread a partir del primer mensaje del usuario.

    Lightweight: trunca a max_len palabras completas, sin LLM call.
    """
    q = (query or "").strip().replace("\n", " ")
    if len(q) <= max_len:
        return q or "Conversación"
    # Recorta a último espacio antes de max_len
    cut = q[:max_len].rsplit(" ", 1)[0]
    return (cut or q[:max_len]).rstrip(",.;:!?") + "…"


async def _resolve_thread(
    db, asistente_token: str, payload_thread_id: Optional[str], query: str,
) -> tuple[str, bool]:
    """Resuelve thread_id existente o crea uno nuevo.

    Returns: (thread_id, is_new)
    """
    if payload_thread_id:
        existing = await db.atlax_threads.find_one(
            {"thread_id": payload_thread_id, "session_token": asistente_token},
            {"_id": 0, "thread_id": 1},
        )
        if existing:
            return payload_thread_id, False
        # thread_id no pertenece a esta sesión → crear nuevo
    thread_id = f"thr_{uuid.uuid4().hex[:14]}"
    title = _truncate_title(query)
    now = _now()
    await db.atlax_threads.insert_one({
        "thread_id": thread_id,
        "session_token": asistente_token,
        "title": title,
        "first_message_at": now,
        "last_message_at": now,
        "message_count": 0,
        "status": "active",
    })
    return thread_id, True


async def _bump_thread(db, thread_id: str, increment: int = 2) -> None:
    """Incrementa message_count y actualiza last_message_at.

    increment=2 = mensaje user + mensaje assistant en una misma transacción atlax_query.
    """
    try:
        await db.atlax_threads.update_one(
            {"thread_id": thread_id},
            {"$set": {"last_message_at": _now()}, "$inc": {"message_count": increment}},
        )
    except Exception as e:
        log.warning(f"[atlax_thread] bump failed {thread_id}: {e}")


@router.post("/api/atlax/query")
async def atlax_query(payload: AtlaxQueryIn, request: Request):
    """W4.4E.5.2 thin-wrapper que orquesta AsistenteEngine + RAG citations + lead scoring."""
    db = request.app.state.db
    ip = _extract_ip(request)
    ua = request.headers.get("user-agent", "")

    # ─── 1. Phase Y check (vía start_session/chat lo hacen, pero adelantamos)
    from asistente_engine import AsistenteEngine, AsistenteDisabledError, AsistenteRateLimitError, AsistenteSessionCapError
    engine = AsistenteEngine(db)

    # ─── 2. Resolver sesión legacy/nueva → asistente_token
    try:
        legacy_session_id, asistente_token, is_new = await _resolve_asistente_token(
            engine, db, payload.session_id, ip, ua,
        )
    except AsistenteDisabledError:
        return {
            "ok": False,
            "session_id": payload.session_id or "",
            "asistente_session_token": None,
            "channel": payload.channel,
            "answer": "Asistente temporalmente fuera de servicio. Te conecto con un asesor humano.",
            "top_results": [],
            "citations": [],
            "hand_off_recommended": True,
            "hand_off_reason": "phase_y_disabled",
            "lead_score": _estimate_lead_score(payload.query),
            "model": "claude-sonnet-4-5-20250929",
            "cost_usd": 0.0,
            "message_id": uuid.uuid4().hex,
            "tier": None,
            "simulated": False,
            "memory_hits": [],
        }
    except AsistenteRateLimitError as e:
        # Distinguir rate limit de mapping legacy vs general
        msg = str(e)
        is_legacy = "legacy mapping" in msg.lower()
        reason = "rate_limit_legacy_mapping" if is_legacy else "rate_limit"
        answer = (
            "Demasiadas solicitudes desde tu conexión. Intenta nuevamente en unos minutos."
            if is_legacy else msg
        )
        return JSONResponse(
            status_code=429,
            content={
                "ok": False,
                "session_id": payload.session_id or "",
                "asistente_session_token": None,
                "channel": payload.channel,
                "answer": answer,
                "top_results": [],
                "citations": [],
                "hand_off_recommended": True,
                "hand_off_reason": reason,
                "lead_score": _estimate_lead_score(payload.query),
                "model": "claude-sonnet-4-5-20250929",
                "cost_usd": 0.0,
                "message_id": uuid.uuid4().hex,
                "tier": None,
                "simulated": False,
                "memory_hits": [],
            },
        )

    # ─── 3. Persist legacy caya_session si no existe
    if is_new:
        await db.caya_sessions.update_one(
            {"session_id": legacy_session_id},
            {"$set": {
                "session_id": legacy_session_id,
                "asistente_token": asistente_token,
                "channel": payload.channel,
                "created_at": _now(),
                "first_query": payload.query[:200],
                "migrated": True,
            }},
            upsert=True,
        )

    # ─── 3b. W4.11a · Resolve thread (auto-create if missing/foreign)
    thread_id, _thread_is_new = await _resolve_thread(
        db, asistente_token, payload.thread_id, payload.query,
    )

    # ─── 4. Persist user message in legacy caya_messages (back-compat)
    user_msg_id = uuid.uuid4().hex
    await db.caya_messages.insert_one({
        "id": user_msg_id,
        "session_id": legacy_session_id,
        "asistente_token": asistente_token,
        "thread_id": thread_id,
        "role": "user",
        "content": payload.query,
        "channel": payload.channel,
        "created_at": _now(),
    })

    # ─── 5. RAG semantic search en paralelo (mantiene citations Caya legacy)
    citations: List[Dict[str, Any]] = []
    chunks: List[Dict[str, Any]] = []
    try:
        from rag_engine import semantic_search
        rag_res = await semantic_search(db, payload.query, top_k=5)
        chunks = rag_res.get("results", []) or []
        citations = [
            {
                "chunk_id": c.get("chunk_id"),
                "label": c.get("title", "")[:80],
                "source_type": c.get("source_type"),
            }
            for c in chunks
        ]
    except Exception as exc:
        log.warning(f"[caya] RAG search failed: {exc}")

    # ─── 6. Llama AsistenteEngine.chat (LLM + 3 tools públicas + persiste asistente_messages)
    try:
        chat_res = await engine.chat(asistente_token, payload.query, org_id=payload.org_id or "dmx")
    except AsistenteSessionCapError as e:
        return _error_response(payload, legacy_session_id, asistente_token, str(e), "session_cap_exceeded")
    except AsistenteRateLimitError as e:
        return _error_response(payload, legacy_session_id, asistente_token, str(e), "rate_limit")
    except AsistenteDisabledError as e:
        return _error_response(payload, legacy_session_id, asistente_token, str(e), "phase_y_disabled")
    except Exception as exc:
        log.warning(f"[caya] chat failed: {exc}")
        return _error_response(payload, legacy_session_id, asistente_token,
                               "No pude procesar tu consulta en este momento. Te conecto con un asesor humano.",
                               "asistente_error")

    answer = chat_res.get("assistant_message", "")
    suggested_capture = bool(chat_res.get("suggested_lead_capture"))
    simulated = bool(chat_res.get("simulated"))
    tier = chat_res.get("tier")
    tool_calls = chat_res.get("tool_calls") or []

    # ─── 7. Lead-score override + hand_off
    lead_score = _estimate_lead_score(payload.query)
    hand_off = suggested_capture or (lead_score >= 70)
    hand_off_reason = (
        chat_res.get("intent_detected") if suggested_capture else
        (f"lead_score={lead_score}" if lead_score >= 70 else None)
    )

    # ─── 8. Cost rough estimate (asistente persiste su propio cost en asistente_messages;
    # aquí calculamos uno legacy para back-compat con el shape Caya)
    in_tokens = max(1, (len(payload.query) + 800) // 4)  # query + system prompt aprox
    out_tokens = max(1, len(answer) // 4)
    cost_usd = round((in_tokens / 1_000_000) * 3.0 + (out_tokens / 1_000_000) * 15.0, 6)

    # ─── 9. Persist assistant message in legacy caya_messages
    msg_id = uuid.uuid4().hex
    await db.caya_messages.insert_one({
        "id": msg_id,
        "session_id": legacy_session_id,
        "asistente_token": asistente_token,
        "thread_id": thread_id,
        "role": "assistant",
        "content": answer,
        "citations": citations,
        "hand_off_recommended": hand_off,
        "lead_score": lead_score,
        "tool_calls": tool_calls,
        "channel": payload.channel,
        "created_at": _now(),
        "model": "claude-sonnet-4-5-20250929",
        "cost_usd": cost_usd,
        "rag_chunks_count": len(chunks),
        "simulated": simulated,
        "tier": tier,
    })

    # ─── 9b. W4.11a · Bump thread metadata (user msg + assistant msg)
    await _bump_thread(db, thread_id, increment=2)

    # ─── 10. Budget tracking (best-effort)
    try:
        from ai_budget import track_ai_call
        await track_ai_call(
            db, "caya", "claude-sonnet-4-5-20250929", 0, "caya_conversation",
            tokens_in=in_tokens, tokens_out=out_tokens, feature_key="copilot_chat",
        )
    except Exception:
        pass

    # ─── 11. Response shape backwards-compatible + nuevos campos opcionales
    return {
        "ok": True,
        "session_id": legacy_session_id,
        "asistente_session_token": asistente_token,
        "thread_id": thread_id,
        "channel": payload.channel,
        "answer": answer,
        "top_results": [
            {
                "chunk_id": c.get("chunk_id"), "score": c.get("score"),
                "source_type": c.get("source_type"), "title": c.get("title"),
                "entity_id": c.get("entity_id"), "snippet": c.get("snippet"),
            }
            for c in chunks
        ],
        "citations": citations,
        "hand_off_recommended": hand_off,
        "hand_off_reason": hand_off_reason,
        "lead_score": lead_score,
        "model": "claude-sonnet-4-5-20250929",
        "cost_usd": cost_usd,
        "message_id": msg_id,
        "tier": tier,
        "simulated": simulated,
        "memory_hits": [],  # placeholder: AsistenteEngine no expone retrieve_memory en chat público
        "tool_calls": tool_calls,
        "intent_detected": chat_res.get("intent_detected"),
    }


def _error_response(
    payload: AtlaxQueryIn, legacy_id: str, asistente_token: str,
    answer: str, reason: str,
) -> Dict[str, Any]:
    return {
        "ok": False,
        "session_id": legacy_id,
        "asistente_session_token": asistente_token,
        "channel": payload.channel,
        "answer": answer,
        "top_results": [],
        "citations": [],
        "hand_off_recommended": True,
        "hand_off_reason": reason,
        "lead_score": _estimate_lead_score(payload.query),
        "model": "claude-sonnet-4-5-20250929",
        "cost_usd": 0.0,
        "message_id": uuid.uuid4().hex,
        "tier": None,
        "simulated": False,
        "memory_hits": [],
    }


@router.get("/api/atlax/sessions/{session_id}/history")
async def atlax_history(session_id: str, request: Request):
    """History endpoint legacy: retorna mensajes de caya_messages para back-compat."""
    db = request.app.state.db
    cursor = db.caya_messages.find({"session_id": session_id}, {"_id": 0}).sort("created_at", 1)
    msgs = []
    async for m in cursor:
        if isinstance(m.get("created_at"), datetime):
            m["created_at"] = m["created_at"].isoformat()
        msgs.append(m)
    return {"session_id": session_id, "count": len(msgs), "messages": msgs}


# ─── W4.11a · Threads endpoints ───────────────────────────────────────────────
@router.get("/api/atlax/threads")
async def atlax_list_threads(request: Request, session_token: str, limit: int = 30):
    """Lista threads de una sesión asistente_token, ordenados por last_message_at desc."""
    db = request.app.state.db
    if not session_token or not session_token.startswith("asis_"):
        return JSONResponse(
            status_code=400,
            content={"ok": False, "error": "session_token requerido (formato asis_*)"},
        )
    limit = max(1, min(int(limit or 30), 100))
    cursor = db.atlax_threads.find(
        {"session_token": session_token},
        {"_id": 0},
    ).sort("last_message_at", -1).limit(limit)
    threads = []
    async for t in cursor:
        for k in ("first_message_at", "last_message_at"):
            if isinstance(t.get(k), datetime):
                t[k] = t[k].isoformat()
        threads.append(t)
    return {"session_token": session_token, "count": len(threads), "threads": threads}


@router.get("/api/atlax/threads/{thread_id}/messages")
async def atlax_thread_messages(thread_id: str, request: Request):
    """Mensajes de un thread, en orden cronológico."""
    db = request.app.state.db
    thread = await db.atlax_threads.find_one({"thread_id": thread_id}, {"_id": 0})
    if not thread:
        return JSONResponse(
            status_code=404,
            content={"ok": False, "error": "Thread no encontrado"},
        )
    for k in ("first_message_at", "last_message_at"):
        if isinstance(thread.get(k), datetime):
            thread[k] = thread[k].isoformat()
    cursor = db.caya_messages.find(
        {"thread_id": thread_id},
        {"_id": 0, "id": 1, "role": 1, "content": 1, "citations": 1, "tool_calls": 1, "created_at": 1, "hand_off_recommended": 1, "simulated": 1, "tier": 1},
    ).sort("created_at", 1)
    msgs = []
    async for m in cursor:
        if isinstance(m.get("created_at"), datetime):
            m["created_at"] = m["created_at"].isoformat()
        msgs.append(m)
    return {"thread": thread, "messages": msgs, "count": len(msgs)}
