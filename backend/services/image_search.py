"""Phase 4 Batch 24 · services — Image Search via Claude Vision + similarity.

Pipeline:
  1. Upload foto → Claude Vision describe características visuales clave
  2. Comparar descripción contra db.image_embeddings (text descriptions cached)
  3. Devolver top N unidades/proyectos por similitud Jaccard/TF-IDF

Nightly cron: pre-computar descriptions para assets de db.dev_assets.

Batch 25 enhancement:
  EMBEDDINGS_ENABLED=true → usa vectores reales (1536-dim) de image_embeddings service.
"""
from __future__ import annotations

import base64
import hashlib
import logging
import math
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import numpy as np

log = logging.getLogger("dmx.image_search")

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
VISION_MODEL = "claude-sonnet-4-5-20250929"

# Batch 25: toggle para usar vectores reales vs TF-IDF fallback
EMBEDDINGS_ENABLED = os.getenv("IMAGE_EMBEDDINGS_ENABLED", "false").lower() == "true"

# ─── Vision description ───────────────────────────────────────────────────────

async def compute_image_description(image_bytes: bytes, content_type: str = "image/jpeg") -> str:
    """
    Llama a Claude Vision para describir características visuales clave
    de una propiedad inmobiliaria. Devuelve texto en español.
    """
    if not EMERGENT_LLM_KEY:
        raise RuntimeError("EMERGENT_LLM_KEY no configurada")

    from emergentintegrations.llm.chat import LlmChat, UserMessage, FileContent  # type: ignore

    b64 = base64.b64encode(image_bytes).decode("utf-8")
    file_c = FileContent(content_type=content_type, file_content_base64=b64)

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"img_search_{uuid.uuid4().hex[:10]}",
        system_message=(
            "Eres un experto en análisis visual de propiedades inmobiliarias en LATAM. "
            "Describe SOLAMENTE características visuales clave para búsqueda de similitud: "
            "tipo de fachada, materiales, estilo arquitectónico, número de pisos, "
            "acabados, paleta de colores, tipo de amenidades visibles, ambiente "
            "(urbano/residencial/lujo/económico). Máximo 120 palabras. Sin emojis."
        ),
    ).with_model("anthropic", VISION_MODEL)

    description = await chat.send_message(
        UserMessage(
            text="Describe las características visuales de esta propiedad para búsqueda de similitud.",
            file_contents=[file_c],
        )
    )
    return (description or "").strip()


# ─── Text similarity (TF-IDF-like Jaccard) ───────────────────────────────────

def _tokenize(text: str) -> set:
    """Tokeniza texto a un set de n-grams de palabras."""
    words = re.findall(r'\b[a-záéíóúüñ]{3,}\b', text.lower())
    unigrams = set(words)
    bigrams = {f"{words[i]}_{words[i+1]}" for i in range(len(words) - 1)}
    return unigrams | bigrams


def _jaccard(a: str, b: str) -> float:
    sa, sb = _tokenize(a), _tokenize(b)
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


def _tfidf_cosine(query: str, candidates: List[str]) -> List[float]:
    """Cosine similarity TF-IDF entre query y cada candidato."""
    all_docs = [query] + candidates
    # Construir vocabulario
    vocab: Dict[str, int] = {}
    for doc in all_docs:
        for w in _tokenize(doc):
            if w not in vocab:
                vocab[w] = len(vocab)
    if not vocab:
        return [0.0] * len(candidates)

    n = len(all_docs)
    vectors = np.zeros((n, len(vocab)), dtype=np.float32)

    for di, doc in enumerate(all_docs):
        tokens = list(_tokenize(doc))
        for w in tokens:
            if w in vocab:
                tf = tokens.count(w) / len(tokens)
                idf = math.log(n / (1 + sum(1 for d in all_docs if w in _tokenize(d))))
                vectors[di, vocab[w]] = tf * idf

    # Cosine similarity query vs each candidate
    q_vec = vectors[0]
    q_norm = np.linalg.norm(q_vec) or 1.0
    scores = []
    for ci in range(1, n):
        c_vec = vectors[ci]
        c_norm = np.linalg.norm(c_vec) or 1.0
        sim = float(np.dot(q_vec, c_vec) / (q_norm * c_norm))
        scores.append(max(0.0, sim))
    return scores


# ─── Search pipeline ──────────────────────────────────────────────────────────

async def search_similar(
    db,
    description: str,
    top_n: int = 10,
) -> List[Dict[str, Any]]:
    """
    Busca unidades/proyectos similares a la descripción dada.
    - EMBEDDINGS_ENABLED=true → cosine similarity con vectores reales (B25)
    - EMBEDDINGS_ENABLED=false → TF-IDF sobre text descriptions (B24 fallback)
    """
    # Branch B25: real vector similarity
    if EMBEDDINGS_ENABLED:
        try:
            from services.image_embeddings import search_similar_by_vector
            results = await search_similar_by_vector(db, description, top_n=top_n)
            if results:
                return results
        except Exception as ex:
            log.warning(f"[image_search] real vector search failed, falling back: {ex}")

    # Branch B24 fallback: TF-IDF over text descriptions
    try:
        docs = await db.image_embeddings.find(
            {}, {"_id": 0}
        ).limit(500).to_list(500)
    except Exception as ex:
        log.warning(f"[image_search] DB query failed: {ex}")
        docs = []

    if not docs:
        return await _fallback_search(db, description, top_n)

    # Calcular similitud
    texts = [d.get("description", "") for d in docs]
    scores = _tfidf_cosine(description, texts)

    ranked = sorted(
        zip(scores, docs),
        key=lambda x: x[0],
        reverse=True,
    )[:top_n]

    results = []
    for score, doc in ranked:
        similarity_pct = int(score * 100)
        results.append({
            "project_id": doc.get("project_id"),
            "unit_id": doc.get("unit_id"),
            "similarity_pct": similarity_pct,
            "thumbnail_url": doc.get("thumbnail_url", ""),
            "nombre": doc.get("nombre", "Proyecto sin nombre"),
            "precio": doc.get("precio", 0),
            "zona": doc.get("zona", "—"),
        })
    return results


async def _fallback_search(db, description: str, top_n: int) -> List[Dict[str, Any]]:
    """Fallback cuando no hay embeddings pre-computados: usa datos estáticos."""
    from data_developments import DEVELOPMENTS

    desc_tokens = _tokenize(description)
    is_property_query = bool(desc_tokens)

    results = []
    for dev in DEVELOPMENTS[:top_n * 2]:
        dev_text = (
            f"{dev.get('name', '')} {dev.get('colonia', '')} "
            f"{dev.get('description_es', '')} {dev.get('tier', '')} "
            f"{dev.get('typology', '')}"
        )
        jac = _jaccard(description, dev_text) if is_property_query else 0.2
        # Base score: propiedad-relevante siempre tiene al menos 5%
        base = max(0.05, jac)
        # Desenfatizar si la query no parece una propiedad
        if not is_property_query:
            base = min(base, 0.15)

        units = dev.get("units", [])
        thumb = ""
        if units:
            thumb = units[0].get("photos", [""])[0] if units[0].get("photos") else ""
        if not thumb:
            thumb = dev.get("cover_photo", "")

        results.append({
            "project_id": dev.get("id"),
            "unit_id": None,
            "similarity_pct": int(base * 100),
            "thumbnail_url": thumb,
            "nombre": dev.get("name", ""),
            "precio": dev.get("price_from", 0),
            "zona": dev.get("colonia", "—"),
        })

    results.sort(key=lambda x: x["similarity_pct"], reverse=True)
    return results[:top_n]


# ─── Nightly cron: pre-compute embeddings ────────────────────────────────────

async def nightly_embed_assets(db) -> Dict[str, Any]:
    """
    Genera descriptions para assets que aún no las tienen.
    Se ejecuta como job nocturno. Procesa en batches de 50.
    """
    if not EMERGENT_LLM_KEY:
        log.warning("[image_search] EMERGENT_LLM_KEY no configurada, skip cron")
        return {"processed": 0, "errors": 0}

    processed = 0
    errors = 0

    try:
        # Assets sin embedding
        assets = await db.dev_assets.find(
            {"image_embedding_done": {"$ne": True}, "mime_type": {"$regex": "^image/"}},
            {"_id": 0, "id": 1, "development_id": 1, "url": 1, "name": 1},
        ).limit(50).to_list(50)

        for asset in assets:
            try:
                # No descargamos la URL en el cron aquí (requeriría httpx y acceso a URLs externas)
                # Registramos el asset como pendiente con descripción placeholder
                await db.image_embeddings.update_one(
                    {"asset_id": asset.get("id")},
                    {"$setOnInsert": {
                        "asset_id": asset.get("id"),
                        "project_id": asset.get("development_id"),
                        "unit_id": None,
                        "description": f"asset {asset.get('name', '')}",
                        "thumbnail_url": asset.get("url", ""),
                        "nombre": f"Proyecto {asset.get('development_id', '')}",
                        "precio": 0,
                        "zona": "—",
                        "created_at": datetime.now(timezone.utc),
                    }},
                    upsert=True,
                )
                processed += 1
            except Exception as ex:
                log.warning(f"[image_search cron] asset {asset.get('id')} failed: {ex}")
                errors += 1
    except Exception as ex:
        log.warning(f"[image_search cron] query failed: {ex}")

    return {"processed": processed, "errors": errors}
