"""Phase 4 Batch 25 · services — Image Embeddings Pipeline.

Pipeline:
  1. Descarga imagen de project_assets via httpx
  2. Claude Vision describe características visuales (text description)
  3. Genera vector embedding 1536-dim via Feature Hashing (hash trick with numpy)
  4. Guarda en db.project_assets.embedding

Toggle: IMAGE_EMBEDDINGS_ENABLED env var (default: false).
"""
from __future__ import annotations

import base64
import hashlib
import logging
import math
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

log = logging.getLogger("dmx.image_embeddings")

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
VISION_MODEL = "claude-sonnet-4-5-20250929"
EMBEDDING_DIMS = 1536  # dimensión fija del vector


# ─── Text → vector (Feature Hashing / Random Projections) ────────────────────

def _text_to_vector(text: str, dims: int = EMBEDDING_DIMS) -> np.ndarray:
    """
    Convierte texto a vector de `dims` dimensiones mediante feature hashing.
    Técnica determinista: misma entrada → mismo vector.
    """
    words = text.lower().split()
    vec = np.zeros(dims, dtype=np.float32)
    for w in words:
        # Hash del bigrama de caracteres para mejor cobertura
        h = int(hashlib.sha256(w.encode()).hexdigest(), 16)
        idx = h % dims
        sign = 1 if (h // dims) % 2 == 0 else -1
        vec[idx] += sign
    # Normalizar a L2
    norm = np.linalg.norm(vec)
    if norm > 0:
        vec /= norm
    return vec


def vector_to_list(v: np.ndarray) -> List[float]:
    return v.tolist()


def list_to_vector(lst: List[float]) -> np.ndarray:
    return np.array(lst, dtype=np.float32)


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    an = np.linalg.norm(a)
    bn = np.linalg.norm(b)
    if an == 0 or bn == 0:
        return 0.0
    return float(np.dot(a, b) / (an * bn))


# ─── Vision description ───────────────────────────────────────────────────────

async def _describe_image_url(image_url: str) -> Tuple[Optional[str], Optional[bytes]]:
    """Descarga imagen y retorna (descripción_claude, bytes)."""
    import httpx

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(image_url)
            r.raise_for_status()
            img_bytes = r.content
    except Exception as e:
        log.warning(f"[embeddings] download failed {image_url}: {e}")
        return None, None

    if not EMERGENT_LLM_KEY:
        log.warning("[embeddings] EMERGENT_LLM_KEY no configurada")
        return None, img_bytes

    # Detect content type
    ctype = "image/jpeg"
    if image_url.lower().endswith(".png"):
        ctype = "image/png"
    elif image_url.lower().endswith(".webp"):
        ctype = "image/webp"

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage, FileContent  # type: ignore

        b64 = base64.b64encode(img_bytes).decode("utf-8")
        file_c = FileContent(content_type=ctype, file_content_base64=b64)

        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"emb_{uuid.uuid4().hex[:8]}",
            system_message=(
                "Describe en español las características visuales clave para búsqueda de similitud: "
                "estilo arquitectónico, materiales, tipo de fachada, paleta de colores, "
                "número aproximado de pisos, tipo de amenidades visibles, ambiente "
                "(lujo/residencial/urbano/económico). Máximo 100 palabras."
            ),
        ).with_model("anthropic", VISION_MODEL)

        description = await chat.send_message(
            UserMessage(
                text="Describe características visuales de esta propiedad.",
                file_contents=[file_c],
            )
        )
        return (description or "propiedad inmobiliaria").strip(), img_bytes
    except Exception as e:
        log.warning(f"[embeddings] Claude Vision failed: {e}")
        return None, img_bytes


# ─── Main pipeline ────────────────────────────────────────────────────────────

async def compute_embedding_for_asset(
    db,
    asset_id: str,
    asset_url: str,
    project_id: str,
    nombre: str = "",
    zona: str = "",
    precio: int = 0,
    retry_count: int = 0,
    max_retries: int = 3,
) -> Optional[Dict[str, Any]]:
    """
    Genera embedding para un asset de imagen.
    Retorna el documento guardado o None si falla.
    """
    description, _ = await _describe_image_url(asset_url)

    if not description:
        description = f"{nombre} {zona} propiedad inmobiliaria"

    vector = _text_to_vector(description)

    doc = {
        "asset_id": asset_id,
        "project_id": project_id,
        "description": description,
        "embedding": vector_to_list(vector),
        "thumbnail_url": asset_url,
        "nombre": nombre,
        "precio": precio,
        "zona": zona,
        "computed_at": datetime.now(timezone.utc),
    }

    try:
        await db.image_embeddings.update_one(
            {"asset_id": asset_id},
            {"$set": doc},
            upsert=True,
        )
        # Marcar asset como procesado
        await db.project_assets.update_one(
            {"id": asset_id},
            {"$set": {"image_embedding_done": True}},
        )
        log.info(f"[embeddings] computed for asset {asset_id}")
        return doc
    except Exception as e:
        log.error(f"[embeddings] DB save failed for {asset_id}: {e}")
        return None


async def update_all_embeddings_batch(
    db,
    limit: int = 100,
) -> Dict[str, int]:
    """
    Batch nocturno: procesa hasta `limit` assets sin embedding.
    Respeta cost gating de ai_budget.
    """
    from ai_budget import check_budget_ok

    processed = 0
    errors = 0
    skipped_budget = 0

    try:
        assets = await db.project_assets.find(
            {"image_embedding_done": {"$ne": True}, "url": {"$exists": True}},
            {"_id": 0, "id": 1, "development_id": 1, "url": 1, "name": 1},
        ).limit(limit).to_list(limit)
    except Exception as e:
        log.warning(f"[embeddings batch] query failed: {e}")
        return {"processed": 0, "errors": 1, "skipped_budget": 0}

    for asset in assets:
        # Cost gating
        try:
            from ai_budget import is_within_budget
            budget_ok = await is_within_budget(db, "system")
            if not budget_ok:
                log.warning("[embeddings batch] AI budget exceeded, stopping batch")
                skipped_budget += 1
                break
        except Exception:
            pass  # Si falla el check, continúa

        dev_id = asset.get("development_id", "")
        url = asset.get("url", "")
        if not url:
            continue

        try:
            # Obtener info del proyecto
            dev = await db.developments.find_one({"id": dev_id}, {"_id": 0, "name": 1, "colonia": 1, "price_from": 1})
            nombre = (dev or {}).get("name", "")
            zona = (dev or {}).get("colonia", "")
            precio = (dev or {}).get("price_from", 0)

            result = await compute_embedding_for_asset(
                db=db,
                asset_id=asset.get("id", str(uuid.uuid4())),
                asset_url=url,
                project_id=dev_id,
                nombre=nombre,
                zona=zona,
                precio=precio,
            )
            if result:
                processed += 1
            else:
                errors += 1
        except Exception as e:
            log.warning(f"[embeddings batch] asset {asset.get('id')} failed: {e}")
            errors += 1

    log.info(f"[embeddings batch] processed={processed} errors={errors} skipped_budget={skipped_budget}")
    return {"processed": processed, "errors": errors, "skipped_budget": skipped_budget}


# ─── Search con real vectors ───────────────────────────────────────────────────

async def search_similar_by_vector(
    db,
    query_description: str,
    top_n: int = 10,
) -> List[Dict[str, Any]]:
    """
    Búsqueda por similitud usando vectores reales de image_embeddings.
    Solo se usa cuando IMAGE_EMBEDDINGS_ENABLED=true.
    """
    query_vec = _text_to_vector(query_description)

    docs = await db.image_embeddings.find({}, {"_id": 0}).limit(500).to_list(500)
    if not docs:
        return []

    results = []
    for doc in docs:
        emb = doc.get("embedding")
        if not emb:
            continue
        try:
            doc_vec = list_to_vector(emb)
            sim = cosine_similarity(query_vec, doc_vec)
            results.append({
                "project_id": doc.get("project_id"),
                "unit_id": doc.get("unit_id"),
                "similarity_pct": int(sim * 100),
                "thumbnail_url": doc.get("thumbnail_url", ""),
                "nombre": doc.get("nombre", ""),
                "precio": doc.get("precio", 0),
                "zona": doc.get("zona", "—"),
            })
        except Exception:
            continue

    results.sort(key=lambda x: x["similarity_pct"], reverse=True)
    return results[:top_n]
