"""Phase D2 · Caya prep stub (chatbot infraestructura).

Endpoint base que será usado por C11 Caya WhatsApp/web futuro.
Solo backend + tests. NO UI. NO WhatsApp wiring.

Pipeline:
- Semantic search top-5 vía rag_engine
- Claude conversational con context retrieved + system prompt es-MX honest
- hand_off_recommended=true si lead_score>70 (placeholder logic)
- Persiste session para multi-turn futuro
"""
from __future__ import annotations

import os
import uuid
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

log = logging.getLogger("dmx.caya")

router = APIRouter(tags=["caya"])

CAYA_SYS_PROMPT = """Eres Caya, asistente conversacional de DesarrollosMX. Hablas español de México (es-MX), profesional y cercano.

REGLAS INMUTABLES:
- Solo respondes con datos del CONTEXTO RAG. Si no encuentras data sobre algo, di "No tengo información verificada sobre eso. Te conecto con un asesor humano".
- Cita los chunks por su chunk_id en el campo citations.
- Si la consulta sugiere alta intención de compra (presupuesto definido, urgencia, datos personales), sugiere hand_off al asesor humano (`hand_off_recommended=true`).
- Sin emojis. Sin frases de marketing vacío. Tono honesto.
- Si menciones precios o datos legales, SIEMPRE cita la fuente.
- Output: SOLO JSON válido (sin markdown) con keys: answer (string ≤500 chars), hand_off_recommended (bool), hand_off_reason (string si true, null si false), citations (array de {chunk_id, label, source_type}).
"""


class CayaQueryIn(BaseModel):
    query: str = Field(..., min_length=2, max_length=500)
    session_id: Optional[str] = None
    channel: str = Field(default="web", pattern=r"^(whatsapp|web)$")


def _now():
    return datetime.now(timezone.utc)


async def ensure_caya_indexes(db):
    await db.caya_sessions.create_index("session_id")
    await db.caya_sessions.create_index("created_at")
    await db.caya_messages.create_index([("session_id", 1), ("created_at", 1)])


def _estimate_lead_score(query: str) -> int:
    """Placeholder lead-scoring heurístico. C11 real reemplazará con NLP intent classifier."""
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


@router.post("/api/caya/query")
async def caya_query(payload: CayaQueryIn, request: Request):
    db = request.app.state.db
    session_id = payload.session_id or uuid.uuid4().hex
    now = _now()

    # Persist session if new
    if not payload.session_id:
        await db.caya_sessions.insert_one({
            "session_id": session_id,
            "channel": payload.channel,
            "created_at": now,
            "first_query": payload.query[:200],
        })

    # Persist incoming message
    await db.caya_messages.insert_one({
        "id": uuid.uuid4().hex,
        "session_id": session_id,
        "role": "user",
        "content": payload.query,
        "channel": payload.channel,
        "created_at": now,
    })

    # RAG retrieval
    from rag_engine import semantic_search
    rag_res = await semantic_search(db, payload.query, top_k=5)
    chunks = rag_res.get("results", []) or []

    # Build user prompt
    rag_lines = ["CONTEXTO RAG (cita estos por chunk_id):"]
    if not chunks:
        rag_lines.append("  (vacío — no se encontraron chunks relevantes)")
    for i, c in enumerate(chunks, 1):
        snip = (c.get("snippet") or "")[:240].replace("\n", " ")
        rag_lines.append(
            f"  [{i}] chunk_id={c.get('chunk_id')} · type={c.get('source_type')} · {c.get('title','')} → {snip}"
        )
    user_prompt = (
        f"Pregunta del usuario (canal {payload.channel}): {payload.query}\n\n"
        + "\n".join(rag_lines)
        + "\n\nResponde en es-MX con JSON válido. Si no hay context relevante, indica hand_off_recommended=true."
    )

    # Claude call
    answer_payload: Dict[str, Any] = {}
    cost_usd = 0.0
    in_tokens = (len(user_prompt) + len(CAYA_SYS_PROMPT)) // 4
    out_tokens = 0
    error: Optional[str] = None
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=os.environ.get("EMERGENT_LLM_KEY"),
            session_id=f"caya_{session_id}",
            system_message=CAYA_SYS_PROMPT,
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")
        raw = await chat.send_message(UserMessage(text=user_prompt))
        text = (raw or "").strip()
        if text.startswith("```"):
            lines = text.splitlines()
            if lines and lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].startswith("```"):
                lines = lines[:-1]
            text = "\n".join(lines).strip()
        try:
            answer_payload = json.loads(text)
        except Exception:
            s = text.find("{")
            e = text.rfind("}")
            answer_payload = json.loads(text[s:e+1]) if s >= 0 and e > s else {"answer": text[:500], "hand_off_recommended": True, "hand_off_reason": "fallback parser"}
        out_tokens = len(text) // 4
        cost_usd = (in_tokens / 1000.0) * 0.003 + (out_tokens / 1000.0) * 0.015
        # Budget tracking
        try:
            from ai_budget import track_ai_call
            await track_ai_call(db, "caya", "claude-sonnet-4-5-20250929", 0, "caya_conversation",
                                tokens_in=in_tokens, tokens_out=out_tokens)
        except Exception:
            pass
    except Exception as e:
        log.warning(f"Caya Claude error: {e}")
        error = str(e)
        answer_payload = {
            "answer": "No pude procesar tu consulta en este momento. Te conecto con un asesor humano.",
            "hand_off_recommended": True,
            "hand_off_reason": "claude_error",
            "citations": [],
        }

    # Lead-score override
    lead_score = _estimate_lead_score(payload.query)
    hand_off = bool(answer_payload.get("hand_off_recommended")) or (lead_score >= 70)
    answer_payload["hand_off_recommended"] = hand_off
    if hand_off and not answer_payload.get("hand_off_reason"):
        answer_payload["hand_off_reason"] = f"lead_score={lead_score}"

    # Persist assistant message
    msg_id = uuid.uuid4().hex
    await db.caya_messages.insert_one({
        "id": msg_id,
        "session_id": session_id,
        "role": "assistant",
        "content": answer_payload.get("answer", ""),
        "citations": answer_payload.get("citations", []) or [],
        "hand_off_recommended": hand_off,
        "lead_score": lead_score,
        "channel": payload.channel,
        "created_at": _now(),
        "model": "claude-sonnet-4-5-20250929",
        "cost_usd": round(cost_usd, 6),
        "rag_chunks_count": len(chunks),
        "error": error,
    })

    return {
        "ok": True,
        "session_id": session_id,
        "channel": payload.channel,
        "answer": answer_payload.get("answer", ""),
        "top_results": [
            {"chunk_id": c.get("chunk_id"), "score": c.get("score"),
             "source_type": c.get("source_type"), "title": c.get("title"),
             "entity_id": c.get("entity_id"), "snippet": c.get("snippet")}
            for c in chunks
        ],
        "citations": answer_payload.get("citations", []) or [],
        "hand_off_recommended": hand_off,
        "hand_off_reason": answer_payload.get("hand_off_reason"),
        "lead_score": lead_score,
        "model": "claude-sonnet-4-5-20250929",
        "cost_usd": round(cost_usd, 6),
        "message_id": msg_id,
    }


@router.get("/api/caya/sessions/{session_id}/history")
async def caya_history(session_id: str, request: Request):
    db = request.app.state.db
    cursor = db.caya_messages.find({"session_id": session_id}, {"_id": 0}).sort("created_at", 1)
    msgs = []
    async for m in cursor:
        if isinstance(m.get("created_at"), datetime):
            m["created_at"] = m["created_at"].isoformat()
        msgs.append(m)
    return {"session_id": session_id, "count": len(msgs), "messages": msgs}
