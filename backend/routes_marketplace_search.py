"""Phase 4 Batch 24 · Marketplace Search routes.

Endpoints públicos (sin auth):
  POST /api/public/search/by-image  — Búsqueda por imagen (multipart/form-data)

Rate limit: 10 requests / minuto por IP (in-memory, anti-abuso público).
"""
from __future__ import annotations

import hashlib
import logging
import time
from collections import defaultdict, deque
from typing import Optional

from fastapi import APIRouter, File, HTTPException, Request, UploadFile

log = logging.getLogger("dmx.marketplace_search")

router = APIRouter(tags=["public-search"])

# ─── In-memory rate limiter ───────────────────────────────────────────────────
# dict: ip_hash → deque de timestamps (ventana de 60s)
_RATE_WINDOW = 60  # segundos
_RATE_LIMIT = 10   # requests por ventana
_rate_store: dict = defaultdict(deque)


def _check_rate_limit(ip: str) -> bool:
    """Returns True si la petición está dentro del límite."""
    key = hashlib.sha256(ip.encode()).hexdigest()[:16]
    now = time.monotonic()
    window = _rate_store[key]

    # Limpiar entradas fuera de la ventana
    while window and now - window[0] > _RATE_WINDOW:
        window.popleft()

    if len(window) >= _RATE_LIMIT:
        return False

    window.append(now)
    return True


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


# ─── Endpoint ─────────────────────────────────────────────────────────────────

@router.post("/api/public/search/by-image")
async def search_by_image(
    request: Request,
    file: UploadFile = File(...),
):
    """
    Búsqueda de propiedades por imagen.

    - Acepta JPEG/PNG hasta 5 MB
    - Rate limit: 10 req/min por IP
    - Usa Claude Vision para descripción visual
    - Compara contra db.image_embeddings (cosine similarity)
    - Devuelve top 10 matches con similarity_pct
    """
    import time as _time
    start_ms = _time.monotonic()

    # ── Rate limit ────────────────────────────────────────────────────────────
    ip = _get_client_ip(request)
    if not _check_rate_limit(ip):
        raise HTTPException(
            status_code=429,
            detail="Demasiadas solicitudes. Máximo 10 búsquedas por minuto por IP.",
        )

    # ── Validar archivo ───────────────────────────────────────────────────────
    allowed_types = {"image/jpeg", "image/jpg", "image/png", "image/webp"}
    content_type = file.content_type or "image/jpeg"
    if content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"Formato no soportado: {content_type}. Usa JPEG, PNG o WebP.",
        )

    max_size_bytes = 5 * 1024 * 1024  # 5 MB
    image_bytes = await file.read()
    if len(image_bytes) > max_size_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"Imagen demasiado grande ({len(image_bytes) // 1024} KB). Máximo 5 MB.",
        )

    # ── Descripción visual con Claude Vision ──────────────────────────────────
    from services.image_search import compute_image_description, search_similar
    db = request.app.state.db

    embedding_cached = False
    try:
        description = await compute_image_description(image_bytes, content_type)
        log.info(f"[image_search] description OK ({len(description)} chars)")
    except Exception as ex:
        log.warning(f"[image_search] Claude Vision failed: {ex}")
        # Fallback: descripción genérica para no romper el flujo
        description = "propiedad inmobiliaria moderna acabados contemporáneos"

    # ── Verificar si hay embeddings en caché ──────────────────────────────────
    try:
        count = await db.image_embeddings.count_documents({})
        embedding_cached = count > 0
    except Exception:
        embedding_cached = False

    # ── Búsqueda de similares ─────────────────────────────────────────────────
    try:
        matches = await search_similar(db, description, top_n=10)
    except Exception as ex:
        log.error(f"[image_search] similarity search failed: {ex}")
        matches = []

    processing_ms = int((_time.monotonic() - start_ms) * 1000)

    return {
        "query_description": description[:200],
        "matches": matches,
        "embedding_cached": embedding_cached,
        "processing_ms": processing_ms,
        "total_found": len(matches),
    }
