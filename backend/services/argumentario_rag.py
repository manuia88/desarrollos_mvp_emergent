"""Phase 3 Batch 31 · services — Argumentario AI RAG.

Pipeline:
  1. Asesor envía pregunta (objeción del cliente, situación de venta).
  2. Embedding determinista 1536-dim (feature hashing) sobre la pregunta.
  3. Top-K (5) más similares de db.argumentario_knowledge por cosine.
  4. Claude Sonnet 4.5 genera respuesta corta (≤180 palabras) en es-MX,
     citando los KB sources usados (kb_id + título).

Reusa el patrón de image_embeddings.py (B25) para vectores deterministas.
"""
from __future__ import annotations

import hashlib
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

log = logging.getLogger("dmx.argumentario_rag")

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
EMBEDDING_DIMS = 1536
SONNET_MODEL = "claude-sonnet-4-5-20250929"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt else None


# ─── Embeddings (feature hashing determinista, mismo patrón B25) ──────────────

def _embed_text(text: str, dims: int = EMBEDDING_DIMS) -> List[float]:
    """Vector determinista: misma entrada → mismo vector. Normalizado L2."""
    words = (text or "").lower().split()
    vec = np.zeros(dims, dtype=np.float32)
    for w in words:
        h = int(hashlib.sha256(w.encode()).hexdigest(), 16)
        idx = h % dims
        sign = 1 if (h // dims) % 2 == 0 else -1
        vec[idx] += sign
    norm = np.linalg.norm(vec)
    if norm > 0:
        vec /= norm
    return vec.tolist()


def _cosine(a: List[float], b: List[float]) -> float:
    av = np.asarray(a, dtype=np.float32)
    bv = np.asarray(b, dtype=np.float32)
    an = float(np.linalg.norm(av))
    bn = float(np.linalg.norm(bv))
    if an == 0.0 or bn == 0.0:
        return 0.0
    return float(np.dot(av, bv) / (an * bn))


# ─── Vector search ────────────────────────────────────────────────────────────

async def search_kb(
    db,
    question: str,
    top_k: int = 5,
    category: Optional[str] = None,
) -> List[Dict[str, Any]]:
    q_vec = _embed_text(question)

    query: Dict[str, Any] = {}
    if category:
        query["category"] = category

    docs = await db.argumentario_knowledge.find(
        query, {"_id": 0, "embedding": 1, "kb_id": 1, "title": 1,
                "content": 1, "category": 1, "tags": 1},
    ).limit(500).to_list(500)

    scored: List[Tuple[float, Dict[str, Any]]] = []
    for d in docs:
        emb = d.get("embedding")
        if not emb:
            continue
        sim = _cosine(q_vec, emb)
        scored.append((sim, d))

    scored.sort(key=lambda x: x[0], reverse=True)
    out = []
    for sim, d in scored[:top_k]:
        out.append({
            "kb_id": d.get("kb_id"),
            "title": d.get("title"),
            "category": d.get("category"),
            "content": d.get("content"),
            "tags": d.get("tags", []),
            "similarity_pct": int(sim * 100),
        })
    return out


# ─── Claude RAG generation ────────────────────────────────────────────────────

async def _generate_answer(
    question: str,
    context_chunks: List[Dict[str, Any]],
    tone: str = "asesor_consultivo",
) -> str:
    """
    Llama Claude Sonnet 4.5 con la pregunta + chunks como contexto.
    Devuelve respuesta markdown ≤180 palabras en es-MX.
    """
    if not EMERGENT_LLM_KEY:
        # Fallback: concatenar chunks como respuesta plana
        return "\n\n".join(
            f"**{c['title']}**\n\n{c['content']}" for c in context_chunks[:2]
        )

    if not context_chunks:
        return "Sin información disponible en la base de conocimiento para esa pregunta. Consulta a tu líder o agrega la objeción al equipo."

    context_text = "\n\n---\n\n".join(
        f"### {c['title']} (categoría: {c['category']})\n{c['content']}"
        for c in context_chunks
    )

    system_msg = (
        "Eres un coach de ventas inmobiliarias LATAM con 20 años de experiencia. "
        "Tu trabajo es darle al asesor un guion conciso y accionable para responder "
        "a la objeción o situación. REGLAS ESTRICTAS:\n"
        "1) Máximo 180 palabras. Sin excepciones.\n"
        "2) Idioma: español es-MX. Sin emojis.\n"
        "3) Estructura: respuesta directa + 2-3 frases listas para decir al cliente.\n"
        "4) Si el contexto KB no aplica, sé honesto y sugiere escalar.\n"
        "5) Tono: profesional, empático, sin jerga corporativa.\n"
        "6) Cita información del contexto, no inventes datos numéricos.\n"
        "7) Formato markdown ligero: **bold** para puntos clave."
    )

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage  # type: ignore

        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"argumentario_{uuid.uuid4().hex[:10]}",
            system_message=system_msg,
        ).with_model("anthropic", SONNET_MODEL)

        prompt = (
            f"PREGUNTA DEL ASESOR:\n{question}\n\n"
            f"CONTEXTO DEL ARGUMENTARIO (top-{len(context_chunks)} más relevantes):\n\n"
            f"{context_text}\n\n"
            f"Genera la respuesta siguiendo las reglas. Comienza directo, sin saludos."
        )

        response = await chat.send_message(UserMessage(text=prompt))
        return (response or "").strip()
    except Exception as e:
        log.warning(f"[argumentario_rag] Claude exception: {e}")
        return "\n\n".join(
            f"**{c['title']}**\n\n{c['content']}" for c in context_chunks[:2]
        )


# ─── Main entry ───────────────────────────────────────────────────────────────

async def query_argumentario(
    db,
    asesor_id: str,
    question: str,
    category: Optional[str] = None,
    top_k: int = 5,
) -> Dict[str, Any]:
    """
    Endpoint principal: busca KB + genera respuesta con Claude.
    Persiste en db.argumentario_queries para analytics y reuso.
    """
    chunks = await search_kb(db, question, top_k=top_k, category=category)
    answer = await _generate_answer(question, chunks)

    sources = [
        {"kb_id": c["kb_id"], "title": c["title"],
         "similarity_pct": c["similarity_pct"]}
        for c in chunks
    ]

    query_id = str(uuid.uuid4())
    doc = {
        "query_id": query_id,
        "asesor_id": asesor_id,
        "question": question,
        "category": category,
        "response_markdown": answer,
        "kb_sources": sources,
        "created_at": _now(),
    }

    try:
        await db.argumentario_queries.insert_one(dict(doc))
    except Exception as e:
        log.warning(f"[argumentario_rag] persist failed: {e}")

    doc["created_at"] = _iso(doc["created_at"])
    doc.pop("_id", None)
    return doc


async def get_recent_queries(
    db,
    asesor_id: str,
    limit: int = 20,
) -> List[Dict[str, Any]]:
    docs = await db.argumentario_queries.find(
        {"asesor_id": asesor_id},
        {"_id": 0},
    ).sort("created_at", -1).limit(limit).to_list(limit)

    for d in docs:
        if isinstance(d.get("created_at"), datetime):
            d["created_at"] = _iso(d["created_at"])
    return docs


async def ensure_argumentario_indexes(db) -> None:
    await db.argumentario_knowledge.create_index("kb_id", unique=True)
    await db.argumentario_knowledge.create_index("category")
    await db.argumentario_queries.create_index([("asesor_id", 1), ("created_at", -1)])
    await db.argumentario_queries.create_index("query_id", unique=True)
    log.info("[argumentario_rag] indexes ensured")
