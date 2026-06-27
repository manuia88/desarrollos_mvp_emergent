"""W5.16 — Social Cards routes.

3 public endpoints (no auth · viral growth):
  GET /api/social-cards/og/{entity_type}/{slug}.png     1200×630
  GET /api/social-cards/feed/{entity_type}/{slug}.png   1080×1080
  GET /api/social-cards/story/{entity_type}/{slug}.png  1080×1920

1 superadmin endpoint:
  GET /api/superadmin/social-cards/stats                cache + render counters

Cache strategy:
  1. In-memory LRU 24h (social_cards_engine._CACHE)
  2. Disk cache 24h (storage/social_cards/{layout}_{type}_{slug}.png)
  3. Render fresh on miss · persist to both

Rate limiting:
  Public:  600/min/IP (high volume social shares)
  Stats:   60/min/IP
"""
from __future__ import annotations

import logging
import time
from collections import defaultdict, deque
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Request, Response

from social_cards_engine import (
    compose_card,
    cache_stats as engine_cache_stats,
    ALLOWED_LAYOUTS,
    ALLOWED_ENTITY_TYPES,
    _fallback_png,
)
from social_cards_cache import disk_get, disk_set, disk_stats
from permissions import require_superadmin
from audit_immutable_engine import log as audit_log
from ratelimit import client_ip as _dmx_canon_ip  # SEGURIDAD: IP anti-spoofing (pentest 2026-06-27)

log = logging.getLogger("dmx.routes_social_cards")

router = APIRouter(tags=["social_cards"])
PUBLIC_PREFIX = "/api/social-cards"
SUPERADMIN_PREFIX = "/api/superadmin/social-cards"

# ─── Rate limiting · 2 buckets ────────────────────────────────────────────────
_RATE_PUBLIC: Dict[str, deque] = defaultdict(lambda: deque(maxlen=600))
_RATE_SA: Dict[str, deque] = defaultdict(lambda: deque(maxlen=60))
_RATE_WINDOW_S = 60

# ─── Render counters (in-memory · last 24h sliding) ──────────────────────────
_RENDER_LOG: deque = deque(maxlen=10000)  # (ts, layout, entity_type) tuples


def _client_ip(request: Request) -> str:
    ip = _dmx_canon_ip(request)
    if not ip and request.client:
        ip = request.client.host
    return ip or "unknown"


def _check_rate(bucket: Dict[str, deque], ip: str, limit: int) -> bool:
    """Returns True if request allowed · False if over limit."""
    bkt = bucket[ip]
    now = time.time()
    while bkt and (now - bkt[0]) > _RATE_WINDOW_S:
        bkt.popleft()
    if len(bkt) >= limit:
        return False
    bkt.append(now)
    return True


def _png_response(png: bytes, cache_max_age: int = 86400) -> Response:
    return Response(
        content=png,
        media_type="image/png",
        headers={
            "Cache-Control": f"public, max-age={cache_max_age}, s-maxage={cache_max_age}",
            "Content-Disposition": "inline",
        },
    )


async def _fetch_entity_data(db, entity_type: str, slug: str) -> Optional[Dict[str, Any]]:
    """Pull minimal entity data from DB for rendering. Returns None if not found."""
    try:
        if entity_type == "zone":
            doc = await db.zones.find_one(
                {"slug": slug},
                {"_id": 0, "slug": 1, "name": 1, "alcaldia": 1, "lat": 1, "lng": 1,
                 "ie_score_avg": 1, "drpi_value": 1, "total_devs_active": 1},
            )
            if doc:
                return {
                    "slug": doc.get("slug"),
                    "title": doc.get("name") or doc.get("slug"),
                    "alcaldia": doc.get("alcaldia"),
                    "lat": doc.get("lat"),
                    "lng": doc.get("lng"),
                    "ie_score_avg": doc.get("ie_score_avg"),
                    "drpi_value": doc.get("drpi_value"),
                    "total_devs_active": doc.get("total_devs_active"),
                }
        elif entity_type == "development":
            doc = await db.developments.find_one(
                {"id": slug},
                {"_id": 0, "id": 1, "name": 1, "alcaldia": 1, "lat": 1, "lng": 1,
                 "preventa_pct": 1, "entrega": 1, "desde_mxn": 1},
            )
            if not doc:
                doc = await db.developments.find_one(
                    {"slug": slug},
                    {"_id": 0, "id": 1, "slug": 1, "name": 1, "alcaldia": 1, "lat": 1, "lng": 1,
                     "preventa_pct": 1, "entrega": 1, "desde_mxn": 1},
                )
            if doc:
                return {
                    "slug": doc.get("slug") or doc.get("id"),
                    "title": doc.get("name") or doc.get("id"),
                    "alcaldia": doc.get("alcaldia"),
                    "lat": doc.get("lat"),
                    "lng": doc.get("lng"),
                    "preventa_pct": doc.get("preventa_pct"),
                    "entrega": doc.get("entrega"),
                    "desde_mxn": doc.get("desde_mxn"),
                }
        elif entity_type == "property":
            doc = await db.properties.find_one(
                {"id": slug}, {"_id": 0, "id": 1, "title": 1, "lat": 1, "lng": 1, "valor_mxn": 1, "m2": 1, "alcaldia": 1},
            )
            if doc:
                return {
                    "slug": doc.get("id"),
                    "title": doc.get("title") or doc.get("id"),
                    "alcaldia": doc.get("alcaldia"),
                    "lat": doc.get("lat"),
                    "lng": doc.get("lng"),
                    "valor_mxn": doc.get("valor_mxn"),
                    "m2": doc.get("m2"),
                }
        elif entity_type == "asesor":
            doc = await db.users.find_one(
                {"$or": [{"user_id": slug}, {"slug": slug}]},
                {"_id": 0, "user_id": 1, "name": 1, "rating": 1, "ventas_anual": 1},
            )
            if doc:
                return {
                    "slug": doc.get("user_id") or slug,
                    "title": doc.get("name") or doc.get("user_id") or slug,
                    "rating": doc.get("rating"),
                    "ventas_anual": doc.get("ventas_anual"),
                }
        elif entity_type == "insights":
            # W5.21 · long-tail topics · static title map (synced w/ InsightsCompare.js TOPICS)
            insights_titles = {
                "mortgage-rates": "Tasas hipotecarias MX vs Mundo",
                "home-prices": "Precios vivienda MX vs Mundo",
                "rental-yields": "Gross yields · CDMX vs mundo",
                "construction-cost": "Costo construcción MX vs Mundo",
                "doing-business": "Doing Business · registrar propiedad",
                "housing-affordability": "Affordability MX vs OECD",
                "fibras-vs-reits": "FIBRAs MX vs REITs USA",
                "us-metros-vs-cdmx": "Top metros USA vs CDMX",
                "global": "MX vs Mundo · indicadores macro",
                "insights-global": "MX vs Mundo · indicadores macro",
            }
            title = insights_titles.get(slug) or slug.replace("-", " ").title()
            return {
                "slug": slug,
                "title": title,
                "subtitle": "12 fuentes globales · MX vs Mundo",
            }
    except Exception as exc:
        log.warning(f"[social_cards] entity fetch failed type={entity_type} slug={slug}: {exc}")
    return None


async def _render_or_cache(
    request: Request,
    layout: str,
    entity_type: str,
    slug: str,
) -> bytes:
    """Layered cache: disk → memory (via engine) → render fresh.

    Audit logs only on first-time render (cache miss).
    """
    # 1. Disk cache (24h mtime)
    cached = disk_get(layout, entity_type, slug)
    if cached:
        return cached

    # 2. Render (engine handles its own LRU)
    db = request.app.state.db
    data = await _fetch_entity_data(db, entity_type, slug)
    if data is None:
        # Render fallback with slug as title
        data = {"slug": slug, "title": slug.replace("-", " ").title()}

    png = compose_card(layout, entity_type, data)
    if png and len(png) > 1000:
        disk_set(layout, entity_type, slug, png)

    # Record render counter (24h sliding via _RENDER_LOG deque maxlen)
    try:
        _RENDER_LOG.append((time.time(), layout, entity_type))
    except Exception:
        pass

    # Audit log first-time render (best-effort)
    try:
        await audit_log(
            db,
            actor={"user_id": "system", "role": "system"},
            action="social_card_rendered",
            entity_type="social_card",
            entity_id=f"{layout}:{entity_type}:{slug}",
            before=None,
            after={"layout": layout, "type": entity_type, "slug": slug, "bytes": len(png)},
            request=request,
        )
    except Exception:
        pass

    return png


async def _handle_card_request(
    request: Request,
    layout: str,
    entity_type: str,
    slug: str,
) -> Response:
    """Common public endpoint handler. Always returns 200 + PNG (placeholder on error)."""
    ip = _client_ip(request)
    if not _check_rate(_RATE_PUBLIC, ip, 600):
        return _png_response(_fallback_png(layout))

    et = (entity_type or "").strip().lower()
    if et not in ALLOWED_ENTITY_TYPES:
        return _png_response(_fallback_png(layout))

    s = (slug or "").strip()
    if not s:
        return _png_response(_fallback_png(layout))

    try:
        png = await _render_or_cache(request, layout, et, s)
        return _png_response(png)
    except Exception as exc:
        log.warning(f"[social_cards] handler failed layout={layout} type={et} slug={s}: {exc}")
        return _png_response(_fallback_png(layout))


# ─── Public endpoints ────────────────────────────────────────────────────────
@router.get(PUBLIC_PREFIX + "/og/{entity_type}/{slug}.png")
async def og_card(entity_type: str, slug: str, request: Request):
    return await _handle_card_request(request, "og", entity_type, slug)


@router.get(PUBLIC_PREFIX + "/feed/{entity_type}/{slug}.png")
async def feed_card(entity_type: str, slug: str, request: Request):
    return await _handle_card_request(request, "feed", entity_type, slug)


@router.get(PUBLIC_PREFIX + "/story/{entity_type}/{slug}.png")
async def story_card(entity_type: str, slug: str, request: Request):
    return await _handle_card_request(request, "story", entity_type, slug)


# ─── Superadmin stats ────────────────────────────────────────────────────────
@router.get(SUPERADMIN_PREFIX + "/stats")
async def social_cards_stats(request: Request):
    if not _check_rate(_RATE_SA, _client_ip(request), 60):
        raise HTTPException(429, "Rate limit excedido · 60/min")
    await require_superadmin(request)

    # Compute 24h render counters from sliding deque
    now = time.time()
    cutoff = now - 86400
    counts_by_layout: Dict[str, int] = {"og": 0, "feed": 0, "story": 0}
    counts_by_type: Dict[str, int] = {k: 0 for k in ALLOWED_ENTITY_TYPES}
    total_24h = 0
    for ts, layout, et in _RENDER_LOG:
        if ts < cutoff:
            continue
        total_24h += 1
        counts_by_layout[layout] = counts_by_layout.get(layout, 0) + 1
        counts_by_type[et] = counts_by_type.get(et, 0) + 1

    return {
        "memory_cache": engine_cache_stats(),
        "disk_cache": disk_stats(),
        "renders_24h": {
            "total": total_24h,
            "by_layout": counts_by_layout,
            "by_entity_type": counts_by_type,
        },
        "allowed_layouts": sorted(ALLOWED_LAYOUTS),
        "allowed_entity_types": sorted(ALLOWED_ENTITY_TYPES),
    }
