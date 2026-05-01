"""Phase D1 — Vector embeddings + semantic search RAG.

Indexa OCR text, extractions, narratives AI, scores snapshots, dev/colonia metadata
en colección `dmx_embeddings` con vectores OpenAI text-embedding-3-small (1536 dim).

Cosine similarity in-memory (Mongo Community no soporta $vectorSearch). Caché en RAM
del corpus completo para latencia <100ms en queries.

Cero invención: cada chunk indexado tiene `source_doc_id` o `source_entity_id` y
todas las citas regresan con `score`, `source_type` y referencia auditable.
"""
from __future__ import annotations

import os
import math
import logging
import hashlib
import asyncio
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Query, Request, HTTPException

log = logging.getLogger("dmx.rag")

EMBED_MODEL = "text-embedding-3-small"
EMBED_DIM = 1536
EMBED_PROMPT_VERSION = "1.0"
EMBED_BATCH = 96
EMBED_MAX_CHARS = 7500  # ~ 1 token / 4 chars; safe under 8191 token cap

# OpenAI per-1M token cost for text-embedding-3-small
EMBED_COST_PER_1M = 0.02

# In-memory corpus cache: list of dicts (one per chunk).
# Loaded at startup + after batch reindex.
_CORPUS: List[Dict[str, Any]] = []
_CORPUS_LOCK = asyncio.Lock()


# ─── OpenAI client (sync via thread) ──────────────────────────────────────────
def _client():
    from openai import OpenAI  # lazy import
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        raise RuntimeError("OPENAI_API_KEY not configured")
    return OpenAI(api_key=key)


async def _embed_batch(texts: List[str]) -> Tuple[List[List[float]], int]:
    """Returns (vectors, total_tokens). Runs blocking SDK in thread pool."""
    if not texts:
        return [], 0
    def call():
        c = _client()
        r = c.embeddings.create(model=EMBED_MODEL, input=texts)
        return [d.embedding for d in r.data], r.usage.total_tokens
    return await asyncio.to_thread(call)


async def embed_one(text: str) -> List[float]:
    vecs, _ = await _embed_batch([text[:EMBED_MAX_CHARS]])
    return vecs[0]


# ─── Cosine ───────────────────────────────────────────────────────────────────
def cosine(a: List[float], b: List[float]) -> float:
    s = 0.0
    na = 0.0
    nb = 0.0
    for x, y in zip(a, b):
        s += x * y
        na += x * x
        nb += y * y
    if na == 0 or nb == 0:
        return 0.0
    return s / (math.sqrt(na) * math.sqrt(nb))


# ─── Mongo indexes ────────────────────────────────────────────────────────────
async def ensure_rag_indexes(db) -> None:
    coll = db.dmx_embeddings
    await coll.create_index("chunk_id", unique=True)
    await coll.create_index([("scope", 1), ("entity_id", 1)])
    await coll.create_index("source_type")
    await coll.create_index("hash")


# ─── Chunk builders ───────────────────────────────────────────────────────────
def _hash_text(t: str) -> str:
    return hashlib.sha256(t.encode("utf-8")).hexdigest()[:24]


def _now():
    return datetime.now(timezone.utc)


def _truncate(t: Optional[str], n: int = EMBED_MAX_CHARS) -> str:
    if not t:
        return ""
    return t[:n]


def _scores_to_lines(scores_list: List[Dict[str, Any]]) -> str:
    """Compact human-readable summary of scores for embedding."""
    lines = []
    for s in scores_list[:30]:
        code = s.get("score_code") or s.get("code")
        v = s.get("value")
        tier = s.get("tier") or ""
        if code is None or v is None:
            continue
        try:
            vstr = f"{float(v):.2f}"
        except Exception:
            vstr = str(v)
        lines.append(f"{code}={vstr} {tier}")
    return " · ".join(lines)


async def _build_dev_chunks(db) -> List[Dict[str, Any]]:
    """One chunk per development with: name, address, colonia, stage, score summary,
    narrative AI text, key extractions text. Cero invención: solo data persistida."""
    from data_developments import DEVELOPMENTS
    chunks: List[Dict[str, Any]] = []
    for dev in DEVELOPMENTS:
        dev_id = dev["id"]
        name = dev.get("name", "")
        addr = dev.get("address", "")
        colonia_id = dev.get("colonia_id", "")
        developer_name = (dev.get("developer") or {}).get("name", "")
        stage = dev.get("stage", "")
        amenities = dev.get("amenities", []) or []
        description = dev.get("description", "")
        keywords = dev.get("search_keywords", []) or []
        # Scores
        scores = [s async for s in db.ie_scores.find(
            {"scope": "proyecto", "entity_id": dev_id},
            {"_id": 0, "score_code": 1, "value": 1, "tier": 1},
        ).limit(40)]
        # Narrative AI
        nar = await db.ie_narratives.find_one(
            {"scope": "proyecto", "entity_id": dev_id},
            {"_id": 0, "narrative": 1, "model": 1},
            sort=[("generated_at", -1)],
        )
        nar_text = (nar or {}).get("narrative", "")
        text = (
            f"Desarrollo: {name}. Dirección: {addr}. Colonia: {colonia_id}. "
            f"Desarrollador: {developer_name}. Etapa: {stage}. "
            f"Amenidades: {', '.join(amenities[:18])}. "
            f"Descripción: {description}. "
            f"Keywords: {', '.join(keywords[:12])}. "
            f"Scores IE: {_scores_to_lines(scores)}. "
            f"Narrativa AI: {nar_text}"
        )
        text = _truncate(text)
        chunks.append({
            "chunk_id": f"dev::{dev_id}::card",
            "scope": "development",
            "entity_id": dev_id,
            "source_type": "development_card",
            "title": name,
            "text": text,
            "metadata": {
                "colonia_id": colonia_id, "stage": stage,
                "developer_name": developer_name,
            },
            "hash": _hash_text(text),
        })
    return chunks


async def _build_colonia_chunks(db) -> List[Dict[str, Any]]:
    from data_seed import COLONIAS
    chunks: List[Dict[str, Any]] = []
    for col in COLONIAS:
        cid = col["id"]
        name = col.get("name", "")
        alcaldia = col.get("alcaldia", "")
        scores = [s async for s in db.ie_scores.find(
            {"scope": "colonia", "entity_id": cid},
            {"_id": 0, "score_code": 1, "value": 1, "tier": 1},
        ).limit(40)]
        nar = await db.ie_narratives.find_one(
            {"scope": "colonia", "entity_id": cid},
            {"_id": 0, "narrative": 1},
            sort=[("generated_at", -1)],
        )
        nar_text = (nar or {}).get("narrative", "")
        text = (
            f"Colonia: {name}. Alcaldía: {alcaldia}. "
            f"Scores IE: {_scores_to_lines(scores)}. "
            f"Narrativa AI: {nar_text}"
        )
        text = _truncate(text)
        chunks.append({
            "chunk_id": f"col::{cid}::card",
            "scope": "colonia",
            "entity_id": cid,
            "source_type": "colonia_card",
            "title": name,
            "text": text,
            "metadata": {"alcaldia": alcaldia},
            "hash": _hash_text(text),
        })
    return chunks


async def _build_doc_chunks(db) -> List[Dict[str, Any]]:
    """One chunk per Document Intelligence document (OCR text, ya descifrado).
    Excluye predial / constancia_fiscal (privados → no indexar para search público)."""
    from document_intelligence import decrypt_text
    PRIVATE_TYPES = {"predial", "constancia_fiscal"}
    chunks: List[Dict[str, Any]] = []
    cursor = db.di_documents.find(
        {"status": {"$in": ["ocr_done", "extracted"]}, "doc_type": {"$nin": list(PRIVATE_TYPES)}},
        {"_id": 0, "id": 1, "development_id": 1, "doc_type": 1, "ocr_text_enc": 1, "filename": 1},
    )
    async for d in cursor:
        try:
            ocr = decrypt_text(d.get("ocr_text_enc")) if d.get("ocr_text_enc") else ""
        except Exception:
            ocr = ""
        ocr = _truncate(ocr, 4000)
        if not ocr:
            continue
        text = f"Documento {d.get('doc_type','')} de desarrollo {d.get('development_id','')}: {ocr}"
        chunks.append({
            "chunk_id": f"doc::{d['id']}",
            "scope": "development",
            "entity_id": d["development_id"],
            "source_type": "di_document",
            "title": f"{d.get('doc_type','')}::{d.get('filename','')}",
            "text": text,
            "metadata": {"doc_type": d.get("doc_type"), "doc_id": d["id"]},
            "hash": _hash_text(text),
        })
    return chunks


async def _build_extraction_chunks(db) -> List[Dict[str, Any]]:
    """Extraction structured data → human readable text for embedding."""
    import json as _json
    from document_intelligence import decrypt_text
    chunks: List[Dict[str, Any]] = []
    cursor = db.di_extractions.find({"ok": True}, {"_id": 0})
    PRIVATE_TYPES = {"predial", "constancia_fiscal"}
    async for e in cursor:
        if e.get("doc_type") in PRIVATE_TYPES:
            continue
        enc = e.get("extracted_data_enc")
        if not enc:
            continue
        try:
            data = _json.loads(decrypt_text(enc))
        except Exception:
            continue
        if not data:
            continue
        # Flatten dict to "k: v" lines
        lines: List[str] = []
        def walk(obj, prefix=""):
            if isinstance(obj, dict):
                for k, v in obj.items():
                    walk(v, f"{prefix}{k}.")
            elif isinstance(obj, list):
                for i, item in enumerate(obj[:10]):
                    walk(item, f"{prefix}{i}.")
            elif obj is None:
                return
            else:
                lines.append(f"{prefix.rstrip('.')}: {obj}")
        walk(data)
        if not lines:
            continue
        # Find development_id via document
        doc = await db.di_documents.find_one({"id": e.get("document_id")}, {"_id": 0, "development_id": 1})
        dev_id = (doc or {}).get("development_id", "")
        text = f"Extracción {e.get('doc_type','')} de {dev_id}: " + " | ".join(lines[:60])
        text = _truncate(text)
        chunks.append({
            "chunk_id": f"extract::{e.get('id') or e.get('document_id')}",
            "scope": "development",
            "entity_id": dev_id,
            "source_type": "extraction",
            "title": f"{e.get('doc_type','')}::extract",
            "text": text,
            "metadata": {"doc_type": e.get("doc_type"), "extraction_id": e.get("id"), "document_id": e.get("document_id")},
            "hash": _hash_text(text),
        })
    return chunks


# ─── Reindex ──────────────────────────────────────────────────────────────────
async def reindex_all(db) -> Dict[str, Any]:
    """Compute all chunks, embed those whose hash changed, persist."""
    builders = [
        _build_dev_chunks(db),
        _build_colonia_chunks(db),
        _build_doc_chunks(db),
        _build_extraction_chunks(db),
    ]
    chunks_lists = await asyncio.gather(*builders)
    all_chunks: List[Dict[str, Any]] = [c for cl in chunks_lists for c in cl]
    if not all_chunks:
        return {"ok": True, "total": 0, "updated": 0, "tokens": 0, "cost_usd": 0.0}

    # Diff vs persisted hashes — only re-embed changed
    persisted = {}
    cursor = db.dmx_embeddings.find({}, {"_id": 0, "chunk_id": 1, "hash": 1})
    async for p in cursor:
        persisted[p["chunk_id"]] = p["hash"]

    to_embed: List[Dict[str, Any]] = []
    for c in all_chunks:
        if persisted.get(c["chunk_id"]) != c["hash"]:
            to_embed.append(c)

    total_tokens = 0
    # Batch embed
    for i in range(0, len(to_embed), EMBED_BATCH):
        batch = to_embed[i:i + EMBED_BATCH]
        texts = [b["text"] for b in batch]
        vecs, tokens = await _embed_batch(texts)
        total_tokens += tokens
        for b, v in zip(batch, vecs):
            b["vector"] = v
            b["model"] = EMBED_MODEL
            b["dim"] = EMBED_DIM
            b["prompt_version"] = EMBED_PROMPT_VERSION
            b["created_at"] = _now()

    # Persist
    for b in to_embed:
        await db.dmx_embeddings.update_one(
            {"chunk_id": b["chunk_id"]},
            {"$set": b},
            upsert=True,
        )

    # Cleanup stale chunks (chunks present in db but not built this round)
    built_ids = {c["chunk_id"] for c in all_chunks}
    stale_ids = [cid for cid in persisted.keys() if cid not in built_ids]
    if stale_ids:
        await db.dmx_embeddings.delete_many({"chunk_id": {"$in": stale_ids}})

    cost = (total_tokens / 1_000_000.0) * EMBED_COST_PER_1M

    # Refresh in-memory cache
    await load_corpus_cache(db)

    return {
        "ok": True,
        "total_chunks": len(all_chunks),
        "updated": len(to_embed),
        "skipped": len(all_chunks) - len(to_embed),
        "stale_deleted": len(stale_ids),
        "tokens": total_tokens,
        "cost_usd": round(cost, 6),
        "model": EMBED_MODEL,
    }


# ─── Corpus cache ─────────────────────────────────────────────────────────────
async def load_corpus_cache(db) -> int:
    """Load all embeddings into memory for fast cosine search."""
    global _CORPUS
    async with _CORPUS_LOCK:
        items = []
        cursor = db.dmx_embeddings.find({}, {"_id": 0})
        async for c in cursor:
            items.append(c)
        _CORPUS = items
    log.info(f"[rag] corpus cache loaded: {len(items)} chunks")
    return len(_CORPUS)


# ─── Search ───────────────────────────────────────────────────────────────────
async def semantic_search(
    db,
    query: str,
    *,
    top_k: int = 10,
    scope: Optional[str] = None,
    entity_id: Optional[str] = None,
    source_types: Optional[List[str]] = None,
) -> Dict[str, Any]:
    if not query or not query.strip():
        raise HTTPException(400, "query vacía")
    if not _CORPUS:
        await load_corpus_cache(db)
    qvec = await embed_one(query.strip())
    # Filter
    pool = _CORPUS
    if scope:
        pool = [c for c in pool if c.get("scope") == scope]
    if entity_id:
        pool = [c for c in pool if c.get("entity_id") == entity_id]
    if source_types:
        st = set(source_types)
        pool = [c for c in pool if c.get("source_type") in st]
    # Cosine
    scored: List[Tuple[float, Dict[str, Any]]] = []
    for c in pool:
        v = c.get("vector")
        if not v:
            continue
        scored.append((cosine(qvec, v), c))
    scored.sort(key=lambda t: t[0], reverse=True)
    top = scored[:top_k]
    return {
        "ok": True,
        "query": query,
        "model": EMBED_MODEL,
        "corpus_size": len(_CORPUS),
        "filtered_size": len(pool),
        "results": [
            {
                "chunk_id": c["chunk_id"],
                "scope": c.get("scope"),
                "entity_id": c.get("entity_id"),
                "source_type": c.get("source_type"),
                "title": c.get("title"),
                "score": round(float(s), 4),
                "snippet": (c.get("text") or "")[:300],
                "metadata": c.get("metadata", {}),
            }
            for (s, c) in top
        ],
    }


# ─── Routers ──────────────────────────────────────────────────────────────────
public_router = APIRouter(tags=["rag_public"])
admin_router = APIRouter(tags=["rag_admin"])


@public_router.get("/api/search/semantic")
async def search_semantic(
    request: Request,
    q: str = Query(..., min_length=2, description="Consulta libre"),
    top_k: int = Query(10, ge=1, le=30),
    scope: Optional[str] = Query(None, description="development | colonia"),
    entity_id: Optional[str] = Query(None),
    source_types: Optional[str] = Query(None, description="Lista separada por coma"),
):
    db = request.app.state.db
    st = [s.strip() for s in source_types.split(",")] if source_types else None
    return await semantic_search(db, q, top_k=top_k, scope=scope, entity_id=entity_id, source_types=st)


@admin_router.post("/api/superadmin/rag/reindex")
async def admin_reindex(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user or getattr(user, "role", None) != "superadmin":
        raise HTTPException(403, "Solo superadmin")
    db = request.app.state.db
    return await reindex_all(db)


@admin_router.get("/api/superadmin/rag/stats")
async def admin_stats(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user or getattr(user, "role", None) != "superadmin":
        raise HTTPException(403, "Solo superadmin")
    db = request.app.state.db
    by_type: Dict[str, int] = {}
    cursor = db.dmx_embeddings.aggregate([
        {"$group": {"_id": "$source_type", "n": {"$sum": 1}}},
    ])
    async for row in cursor:
        by_type[row["_id"]] = row["n"]
    total = await db.dmx_embeddings.count_documents({})
    return {
        "ok": True,
        "total": total,
        "by_source_type": by_type,
        "model": EMBED_MODEL,
        "dim": EMBED_DIM,
        "corpus_cache_size": len(_CORPUS),
    }
