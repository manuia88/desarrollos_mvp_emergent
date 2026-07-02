"""Phase 4 Batch 23 · services — Copilot engine (Claude Sonnet 4.5)."""
from __future__ import annotations
import json
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.copilot")

EMERGENT_LLM_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
SONNET_MODEL = "claude-sonnet-4-5-20250929"
HISTORY_LIMIT = 10  # last N messages sent to Claude

SYSTEM_PROMPT = (
    "Eres Copilot DMX, un asistente experto en bienes raíces LATAM dentro de "
    "DesarrollosMX (plataforma de Spatial Decision Intelligence). Respondes "
    "SIEMPRE en español de México (es-MX), tono profesional, accionable, sin "
    "emojis. Puedes usar markdown (encabezados, listas, **negrita**, tablas). "
    "Basas tus respuestas EXCLUSIVAMENTE en el JSON de contexto que te envío. "
    "Si la información no está en el contexto, dilo abiertamente. Nunca "
    "inventes números, leads ni proyectos. Mantén tus respuestas cortas "
    "(≤300 palabras) salvo que el usuario pida un análisis profundo. Usa "
    "viñetas y tablas cuando ayuden a la legibilidad."
)


def _now():
    return datetime.now(timezone.utc)


def _now_iso():
    return _now().isoformat()


# ─── Persistence ─────────────────────────────────────────────────────────────

async def ensure_copilot_indexes(db) -> None:
    try:
        await db.copilot_conversations.create_index(
            [("user_id", 1), ("updated_at", -1)])
        # TTL on updated_at: 60 days
        await db.copilot_conversations.create_index(
            "updated_at", expireAfterSeconds=60 * 24 * 3600)
    except Exception as ex:
        log.warning(f"[copilot] index ensure failed: {ex}")


def _new_conversation_doc(user_id: str) -> Dict[str, Any]:
    return {
        "id": f"cv_{uuid.uuid4().hex[:14]}",
        "user_id": user_id,
        "messages": [],
        "last_topic": None,
        "created_at": _now(),
        "updated_at": _now(),
    }


async def _load_or_create(db, user_id: str, conversation_id: Optional[str]) -> Dict[str, Any]:
    if conversation_id:
        doc = await db.copilot_conversations.find_one(
            {"id": conversation_id, "user_id": user_id}, {"_id": 0})
        if doc:
            return doc
    return _new_conversation_doc(user_id)


# ─── Engine ──────────────────────────────────────────────────────────────────

async def _call_claude(system: str, history: List[Dict[str, str]],
                        user_msg: str) -> Dict[str, Any]:
    """Returns {text, tokens_in_est, tokens_out_est}. Raises RuntimeError on failure."""
    if not EMERGENT_LLM_KEY:
        raise RuntimeError("EMERGENT_LLM_KEY no configurada")
    from llm_client import LlmChat, UserMessage  # type: ignore
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"copilot_{uuid.uuid4().hex[:10]}",
        system_message=system,
    ).with_model("anthropic", SONNET_MODEL)
    # Replay history as alternating turns into the conversation buffer.
    # LlmChat creates a fresh session, so we condense history into the
    # transcript appended to the user message below.
    _ = history  # consumed via transcript construction further down

    transcript = "\n\n".join(
        f"[{m.get('role','user').upper()}]: {(m.get('content') or '')[:800]}"
        for m in history[-HISTORY_LIMIT:]
    )
    payload = (transcript + "\n\n[USER]: " + user_msg) if transcript else user_msg
    text = await chat.send_message(UserMessage(text=payload[:7000]))
    # Approx token estimation: 4 chars ≈ 1 token
    tokens_in = max(1, (len(system) + len(payload)) // 4)
    tokens_out = max(1, len(text or "") // 4)
    return {"text": (text or "").strip(), "tokens_in": tokens_in,
            "tokens_out": tokens_out}


async def ask_copilot(db, user, question: str,
                      conversation_id: Optional[str] = None) -> Dict[str, Any]:
    """Ask Claude grounded on user-role context. Returns dict with response."""
    from services.copilot_context import aggregate_user_context
    from ai_budget import is_within_budget, track_ai_call

    org = getattr(user, "tenant_id", None) or "default"
    if not await is_within_budget(db, org):
        return {
            "response_markdown": (
                "Copilot temporalmente no disponible: el presupuesto mensual de "
                "IA fue alcanzado. Intenta de nuevo el próximo periodo o "
                "incrementa el cap en Configuración → IA."
            ),
            "conversation_id": conversation_id,
            "tokens_used": 0,
            "cost_estimated_usd": 0.0,
            "fallback": True,
        }

    conv = await _load_or_create(db, user.user_id, conversation_id)
    history = list(conv.get("messages") or [])

    ctx = await aggregate_user_context(db, user)
    # Bus de memoria cross-feature (director_memory) → Copilot deja de ser CIEGO: ve lo que Atlax y el
    # Conversation Agent aprendieron del mismo usuario. Fail-soft (nunca rompe la respuesta).
    try:
        from director_memory_engine import DirectorMemoryEngine
        _mem = await DirectorMemoryEngine(db, org).retrieve_for_user(user.user_id, question, top_k=5)
        if _mem:
            ctx["memoria_reciente"] = [
                {"tipo": m.get("source_type"), "resumen": m.get("content_summary")} for m in _mem
            ]
    except Exception:
        pass
    system = (
        SYSTEM_PROMPT
        + "\n\nCONTEXTO DEL USUARIO (JSON):\n"
        + json.dumps(ctx, ensure_ascii=False, default=str)[:6000]
    )

    try:
        out = await _call_claude(system, history, question)
        response_text = out["text"] or "No se pudo generar respuesta."
        tokens_in = out["tokens_in"]
        tokens_out = out["tokens_out"]
    except Exception as e:
        log.warning(f"[copilot] Claude error: {e}")
        return {
            "response_markdown": (
                "Hubo un problema temporal con el modelo de IA. Intenta "
                "reformular tu pregunta o vuelve a intentar en unos segundos."
            ),
            "conversation_id": conv["id"],
            "tokens_used": 0,
            "cost_estimated_usd": 0.0,
            "fallback": True,
        }

    # Budget tracking
    try:
        await track_ai_call(
            db, dev_org_id=org, model=SONNET_MODEL,
            tokens=tokens_in + tokens_out, call_type="copilot",
            tokens_in=tokens_in, tokens_out=tokens_out,
        )
    except Exception:
        pass

    user_msg_doc = {
        "role": "user", "content": question[:4000],
        "timestamp": _now_iso(),
    }
    asst_msg_doc = {
        "role": "assistant", "content": response_text[:8000],
        "timestamp": _now_iso(),
        "tokens_used": tokens_in + tokens_out,
    }

    is_new = not (await db.copilot_conversations.find_one({"id": conv["id"]}, {"_id": 0, "id": 1}))
    last_topic = (question[:80].rsplit(" ", 1)[0] if len(question) > 80 else question)[:120]
    if is_new:
        conv["messages"] = [user_msg_doc, asst_msg_doc]
        conv["last_topic"] = last_topic
        conv["created_at"] = _now()
        conv["updated_at"] = _now()
        await db.copilot_conversations.insert_one({**conv})
    else:
        await db.copilot_conversations.update_one(
            {"id": conv["id"], "user_id": user.user_id},
            {
                "$push": {"messages": {"$each": [user_msg_doc, asst_msg_doc]}},
                "$set": {"updated_at": _now(), "last_topic": last_topic},
            },
        )

    # Audit log fire-and-forget
    try:
        from audit_log import log_mutation
        await log_mutation(
            db, actor=user, action="copilot_query",
            entity_type="copilot_conversation", entity_id=conv["id"],
            after={"question_len": len(question),
                   "tokens_used": tokens_in + tokens_out},
        )
    except Exception as _e:
        log.warning("[audit] log_mutation perdido (copilot_query copilot_conversation %s): %s", conv["id"], _e)

    # Cost estimate (Sonnet ~ $0.003/1k input)
    cost_usd = round((tokens_in / 1000.0) * 0.003 + (tokens_out / 1000.0) * 0.015, 6)

    return {
        "response_markdown": response_text,
        "conversation_id": conv["id"],
        "tokens_used": tokens_in + tokens_out,
        "tokens_in": tokens_in,
        "tokens_out": tokens_out,
        "cost_estimated_usd": cost_usd,
        "model": SONNET_MODEL,
    }


# ─── Conversation listing ────────────────────────────────────────────────────

async def list_conversations(db, user_id: str, limit: int = 10) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    cur = db.copilot_conversations.find(
        {"user_id": user_id},
        {"_id": 0, "id": 1, "last_topic": 1, "updated_at": 1, "messages": 1},
    ).sort("updated_at", -1).limit(limit)
    async for d in cur:
        out.append({
            "id": d["id"],
            "last_topic": d.get("last_topic") or "Conversación",
            "updated_at": (d.get("updated_at").isoformat()
                            if isinstance(d.get("updated_at"), datetime)
                            else d.get("updated_at")),
            "message_count": len(d.get("messages") or []),
        })
    return out


async def get_conversation(db, user_id: str, conversation_id: str) -> Optional[Dict[str, Any]]:
    d = await db.copilot_conversations.find_one(
        {"id": conversation_id, "user_id": user_id}, {"_id": 0})
    if not d:
        return None
    if isinstance(d.get("created_at"), datetime):
        d["created_at"] = d["created_at"].isoformat()
    if isinstance(d.get("updated_at"), datetime):
        d["updated_at"] = d["updated_at"].isoformat()
    return d


async def delete_conversation(db, user_id: str, conversation_id: str) -> bool:
    r = await db.copilot_conversations.delete_one(
        {"id": conversation_id, "user_id": user_id})
    return (r.deleted_count or 0) > 0
