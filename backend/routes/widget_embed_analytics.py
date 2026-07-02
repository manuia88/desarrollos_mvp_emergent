"""W5.25 — Widget Embed Analytics routes.

3 endpoints:
  GET  /api/widgets/{widget_type}/{slug}/track          PÚBLICO · 204 + record_embed
  GET  /api/superadmin/widgets/embed-stats              superadmin · stats agregadas
  GET  /api/superadmin/widgets/embed-new-domains        superadmin · digest feed

Rate limit:
  - Tracking endpoint: 600 req/min/IP (analytics volume)
  - Superadmin endpoints: 60 req/min/IP (CRUD pattern imitado de feature_visibility)
"""
from __future__ import annotations

import logging
import time
from collections import defaultdict, deque
from typing import Dict, Optional

from fastapi import APIRouter, HTTPException, Query, Request, Response

from widget_embed_analytics import (
    record_embed,
    get_embed_stats,
    get_new_domains_last_24h,
)
from permissions import require_superadmin
from audit_immutable_engine import log as audit_log
from ratelimit import client_ip as _dmx_canon_ip  # SEGURIDAD: IP anti-spoofing (pentest 2026-06-27)

log = logging.getLogger("dmx.routes_widget_embed_analytics")

router = APIRouter(tags=["widget_embed_analytics"])

PUBLIC_PREFIX = "/api/widgets"
SUPERADMIN_PREFIX = "/api/superadmin/widgets"

ALLOWED_WIDGET_TYPES = {
    "avm", "score", "risk",
    "notaria_title", "investor_yield", "bank_avm", "insurance_risk",
}


# ─── Rate limiting · 2 buckets (lax tracking · strict superadmin) ─────────────
_RATE_TRACK: Dict[str, deque] = defaultdict(lambda: deque(maxlen=600))
_RATE_SA: Dict[str, deque] = defaultdict(lambda: deque(maxlen=60))
_RATE_WINDOW_S = 60


def _client_ip(request: Request) -> str:
    ip = _dmx_canon_ip(request)
    if not ip and request.client:
        ip = request.client.host
    return ip or "unknown"


def _check_rate(bucket: Dict[str, deque], ip: str, limit: int) -> None:
    bkt = bucket[ip]
    now = time.time()
    while bkt and (now - bkt[0]) > _RATE_WINDOW_S:
        bkt.popleft()
    if len(bkt) >= limit:
        raise HTTPException(status_code=429, detail=f"Rate limit excedido · {limit}/min")
    bkt.append(now)


# 1×1 transparent PNG (43 bytes)
_PIXEL_PNG = bytes([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00,
    0x0D, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49,
    0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
])


# ─── Endpoint 1 · Public tracking pixel ───────────────────────────────────────
@router.get(PUBLIC_PREFIX + "/{widget_type}/{slug}/track")
async def track_embed(
    widget_type: str,
    slug: str,
    request: Request,
):
    """Public tracking endpoint · returns 1×1 PNG. FAIL-SOFT en todo."""
    ip = _client_ip(request)
    try:
        _check_rate(_RATE_TRACK, ip, 600)
    except HTTPException:
        # On rate limit · still return pixel · do not 429 the public client
        return Response(
            content=_PIXEL_PNG,
            media_type="image/png",
            headers={"Cache-Control": "no-store, no-cache, must-revalidate", "Pragma": "no-cache"},
        )

    wt = (widget_type or "").strip().lower()
    if wt not in ALLOWED_WIDGET_TYPES:
        # Silent reject · still return pixel
        return Response(
            content=_PIXEL_PNG,
            media_type="image/png",
            headers={"Cache-Control": "no-store, no-cache, must-revalidate"},
        )

    ref_header = request.headers.get("referer") or request.headers.get("referrer") or ""
    db = request.app.state.db

    try:
        await record_embed(db, widget_type=wt, slug=slug, ref_header=ref_header, request=request)
    except Exception as exc:
        log.warning(f"[widget_embed] track failed (non-fatal): {exc}")

    return Response(
        content=_PIXEL_PNG,
        media_type="image/png",
        headers={"Cache-Control": "no-store, no-cache, must-revalidate", "Pragma": "no-cache"},
    )


# ─── Endpoint 2 · Superadmin stats ────────────────────────────────────────────
@router.get(SUPERADMIN_PREFIX + "/embed-stats")
async def embed_stats(
    request: Request,
    widget_type: Optional[str] = Query(None),
    days: int = Query(30, ge=1, le=365),
    limit: int = Query(50, ge=1, le=200),
    skip: int = Query(0, ge=0),
):
    _check_rate(_RATE_SA, _client_ip(request), 60)
    actor = await require_superadmin(request)
    db = request.app.state.db

    wt = None
    if widget_type:
        wt = widget_type.strip().lower()
        if wt not in ALLOWED_WIDGET_TYPES:
            raise HTTPException(400, f"widget_type inválido · permitidos: {sorted(ALLOWED_WIDGET_TYPES)}")

    stats = await get_embed_stats(db, widget_type=wt, days=days, limit=limit, skip=skip)

    try:
        await audit_log(
            db,
            actor={"user_id": getattr(actor, "user_id", "superadmin"), "role": "superadmin"},
            action="widget_embed_stats_viewed",
            entity_type="widget_embed_stats",
            entity_id=f"{wt or 'all'}:{days}d",
            before=None,
            after={"widget_type": wt, "days": days, "rows": len(stats)},
            request=request,
        )
    except Exception as exc:
        log.warning(f"[widget_embed] audit stats_viewed failed (non-fatal): {exc}")

    return {
        "items": stats,
        "count": len(stats),
        "widget_type": wt,
        "days": days,
        "skip": skip,
        "limit": limit,
    }


# ─── Endpoint 3 · Superadmin new domains (24h feed) ───────────────────────────
@router.get(SUPERADMIN_PREFIX + "/embed-new-domains")
async def embed_new_domains(request: Request):
    _check_rate(_RATE_SA, _client_ip(request), 60)
    await require_superadmin(request)
    db = request.app.state.db
    rows = await get_new_domains_last_24h(db)
    return {"items": rows, "count": len(rows)}
