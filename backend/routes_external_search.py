"""Phase 4 Batch 25 · External Search + Saved Search routes.

Endpoints públicos (sin auth):
  POST /api/public/search/by-url          — Parsear URL externa + buscar matches
  POST /api/public/saved-search           — Guardar búsqueda + enviar confirmación
  GET  /api/public/saved-search/confirm/{token}  — Confirmar suscripción
  GET  /api/public/saved-search/unsubscribe/{token} — Cancelar suscripción
"""
from __future__ import annotations

import hashlib
import logging
import time
from collections import defaultdict, deque
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse, JSONResponse
from pydantic import BaseModel, EmailStr, Field

log = logging.getLogger("dmx.external_search")

router = APIRouter(tags=["public-search-ext"])

# ─── Rate limiters ────────────────────────────────────────────────────────────
_RATE_WINDOW = 60
_URL_RATE_LIMIT = 20    # 20 req/min para URL search
_SAVE_RATE_LIMIT = 5    # 5 req/min para save search

_url_store: dict = defaultdict(deque)
_save_store: dict = defaultdict(deque)


def _check_rl(store: dict, ip: str, limit: int) -> bool:
    key = hashlib.sha256(ip.encode()).hexdigest()[:16]
    now = time.monotonic()
    window = store[key]
    while window and now - window[0] > _RATE_WINDOW:
        window.popleft()
    if len(window) >= limit:
        return False
    window.append(now)
    return True


def _get_ip(request: Request) -> str:
    fwd = request.headers.get("X-Forwarded-For")
    if fwd:
        return fwd.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


def _get_db(request: Request):
    return request.app.state.db


# ─── Pydantic models ──────────────────────────────────────────────────────────

class UrlSearchRequest(BaseModel):
    url: str


class SaveSearchRequest(BaseModel):
    email: str
    filters: Dict[str, Any] = Field(default_factory=dict)
    alert_frequency: str = "weekly"


# ─── URL search helpers ───────────────────────────────────────────────────────

async def _find_similar_in_db(db, external: Dict) -> list:
    """Busca desarrollos similares por zona y precio."""
    from data_developments import DEVELOPMENTS

    price = external.get("price_mxn") or 0
    loc = external.get("location") or {}
    m2 = external.get("m2_total") or 0

    query: Dict[str, Any] = {}
    filters = []

    if price > 0:
        filters.append({
            "price_from": {
                "$gte": int(price * 0.85),
                "$lte": int(price * 1.15),
            }
        })
    if loc.get("colonia"):
        filters.append({"colonia": {"$regex": loc["colonia"], "$options": "i"}})

    if filters:
        query = {"$and": filters}

    try:
        db_results = await db.developments.find(query, {"_id": 0}).limit(5).to_list(5)
        if db_results:
            # Calcular similarity_pct
            result = []
            for d in db_results:
                pct = 70  # base
                if price > 0 and d.get("price_from"):
                    ratio = min(d["price_from"], price) / max(d["price_from"], price)
                    pct = int(60 + ratio * 30)
                result.append({
                    "project_id": d.get("id"),
                    "similarity_pct": pct,
                    "thumbnail_url": d.get("cover_photo", ""),
                    "nombre": d.get("name", ""),
                    "precio": d.get("price_from", 0),
                    "zona": d.get("colonia", "—"),
                })
            return result
    except Exception as ex:
        log.debug(f"[url_search] DB query failed: {ex}")

    # Fallback a datos estáticos
    candidates = []
    for dev in DEVELOPMENTS:
        score = 50
        if price > 0 and dev.get("price_from"):
            diff_pct = abs(dev["price_from"] - price) / price
            if diff_pct < 0.15:
                score += 30
            elif diff_pct < 0.30:
                score += 15
        if loc.get("colonia") and loc["colonia"].lower() in (dev.get("colonia", "")).lower():
            score += 20

        candidates.append({
            "project_id": dev.get("id"),
            "similarity_pct": min(95, score),
            "thumbnail_url": dev.get("cover_photo", ""),
            "nombre": dev.get("name", ""),
            "precio": dev.get("price_from", 0),
            "zona": dev.get("colonia", "—"),
        })

    candidates.sort(key=lambda x: x["similarity_pct"], reverse=True)
    return candidates[:5]


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/api/public/search/by-url")
async def search_by_url(body: UrlSearchRequest, request: Request):
    """
    Parsea una URL de portal inmobiliario externo y busca propiedades similares.
    Rate limit: 20 req/min por IP.
    """
    import time as _time
    start = _time.monotonic()

    ip = _get_ip(request)
    if not _check_rl(_url_store, ip, _URL_RATE_LIMIT):
        raise HTTPException(
            status_code=429,
            detail="Demasiadas solicitudes. Máximo 20 búsquedas por minuto.",
        )

    from services.url_parser import parse_external_url, SUPPORTED_SOURCES

    url = (body.url or "").strip()
    if not url:
        raise HTTPException(status_code=400, detail="URL requerida")

    external = await parse_external_url(url)
    processing_ms = int((_time.monotonic() - start) * 1000)

    if external.get("error"):
        return JSONResponse(
            status_code=422,
            content={
                "error": external["error"],
                "supported": SUPPORTED_SOURCES,
                "processing_ms": processing_ms,
            },
        )

    db = _get_db(request)
    matches = await _find_similar_in_db(db, external)

    return {
        "external_property": external,
        "matches": matches,
        "processing_ms": processing_ms,
        "total_found": len(matches),
    }


@router.post("/api/public/saved-search")
async def save_search_endpoint(body: SaveSearchRequest, request: Request):
    """
    Guarda una búsqueda y envía email de confirmación.
    Rate limit: 5 req/min por IP.
    """
    import hashlib as _h

    ip = _get_ip(request)
    if not _check_rl(_save_store, ip, _SAVE_RATE_LIMIT):
        raise HTTPException(
            status_code=429,
            detail="Demasiadas solicitudes. Intenta en 1 minuto.",
        )

    email = (body.email or "").strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Email inválido")

    if not body.filters:
        raise HTTPException(
            status_code=400,
            detail="Debes aplicar al menos un filtro antes de guardar la búsqueda",
        )

    if body.alert_frequency not in ("daily", "weekly"):
        raise HTTPException(status_code=400, detail="alert_frequency debe ser 'daily' o 'weekly'")

    ip_hash = _h.sha256(ip.encode()).hexdigest()[:20]
    db = _get_db(request)

    from services.saved_searches import save_search
    result = await save_search(
        db=db,
        email=email,
        filters=body.filters,
        alert_frequency=body.alert_frequency,
        ip_hash=ip_hash,
    )

    return result


@router.get("/api/public/saved-search/confirm/{token}")
async def confirm_saved_search(token: str, request: Request):
    """Confirma una suscripción de alerta."""
    db = _get_db(request)
    from services.saved_searches import confirm_search
    confirmed = await confirm_search(db, token)

    # Redirigir al marketplace
    frontend_url = "https://desarrollosmx.com/marketplace?confirmed=ok"
    return RedirectResponse(url=frontend_url, status_code=302)


@router.get("/api/public/saved-search/unsubscribe/{token}")
async def unsubscribe_saved_search(token: str, request: Request):
    """Cancela una suscripción de alerta."""
    db = _get_db(request)
    from services.saved_searches import unsubscribe
    deleted = await unsubscribe(db, token)

    frontend_url = "https://desarrollosmx.com/marketplace?unsubscribed=ok"
    return RedirectResponse(url=frontend_url, status_code=302)
