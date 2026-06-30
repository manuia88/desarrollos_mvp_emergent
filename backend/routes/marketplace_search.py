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
from typing import Any, Dict, Optional

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
    # SEGURIDAD (3ª ola): delega al canónico anti-spoofing (antes XFF[0] = falsificable).
    from ratelimit import client_ip as _c
    return _c(request)


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


# W5.x F4.2 — Search developments por texto · usado por ComparatorPicker
import re as _re

_DEV_SEARCH_PROJ = {
    "_id": 0, "id": 1, "name": 1, "title": 1, "project_name": 1,
    "colonia": 1, "alcaldia": 1, "price_from": 1, "price_raw": 1,
    "photo_url": 1, "hero_image": 1, "cover_url": 1,
}


@router.get("/api/marketplace/developments")
async def search_developments(request: Request, q: str = "", limit: int = 8):
    """Busca developments por nombre/colonia/alcaldía · retorna shape minimal para picker."""
    db = request.app.state.db
    lim = max(1, min(int(limit or 8), 25))

    query: Dict[str, Any] = {}
    if q and q.strip():
        safe = _re.escape(q.strip())
        query = {
            "$or": [
                {"name": {"$regex": safe, "$options": "i"}},
                {"title": {"$regex": safe, "$options": "i"}},
                {"project_name": {"$regex": safe, "$options": "i"}},
                {"colonia": {"$regex": safe, "$options": "i"}},
                {"alcaldia": {"$regex": safe, "$options": "i"}},
            ]
        }

    try:
        cursor = db.developments.find(query, _DEV_SEARCH_PROJ).limit(lim)
        items: list = []
        async for d in cursor:
            items.append({
                "entity_id": d.get("id"),
                "title": d.get("name") or d.get("title") or d.get("project_name") or d.get("id"),
                "colonia": d.get("colonia") or d.get("alcaldia") or "",
                "price": d.get("price_from") or d.get("price_raw"),
                "photo_url": d.get("photo_url") or d.get("hero_image") or d.get("cover_url"),
            })
        # P2.6 · captura la búsqueda del comprador (demanda revelada ANÓNIMA) → alimenta
        # location_intel (count por colonia) y el Grafo del Comprador. Fire-and-forget, LFPDPPP.
        if q and q.strip():
            try:
                import uuid as _u, hashlib as _h
                from datetime import datetime as _dt, timezone as _tz
                from data_developments import colonia_slug as _cslug  # MOAT: id canónico (linaje cross-engine)
                _now = _dt.now(_tz.utc)
                _cols = list({_cslug(it.get("colonia"))
                              for it in items if it.get("colonia") and _cslug(it.get("colonia"))})
                from ratelimit import client_ip as _c  # SEGURIDAD anti-spoofing (pentest 2026-06-27)
                _ip = _c(request)
                await db.marketplace_searches.insert_one({
                    "id": f"mks_{_u.uuid4().hex[:12]}",
                    "query": q.strip()[:200],
                    "colonia_id": _cols[0] if _cols else None,
                    "colonias": _cols,
                    "results_count": len(items),
                    "source": "marketplace_picker",
                    "ip_hash": _h.sha256(f"{_ip}:dmx_mks".encode()).hexdigest()[:16] if _ip else None,
                    "created_at": _now.isoformat(), "created_at_dt": _now,
                })
            except Exception:
                pass
        return items
    except Exception as exc:  # noqa: BLE001
        log.warning(f"[marketplace_search] developments failed: {exc}")
        return []


# W5.FF4 register_feature marker · NO duplicate
from feature_registry import register_feature as _w5ff4_register_feature
_w5ff4_register_feature("compradores_search", plan_tier="free",       monthly_price_mxn=0,   category="growth",      name="Marketplace Search")
