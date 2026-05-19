"""W5.20 — External Insights routes.

Public endpoints (T0 anonymous):
  GET /api/insights/global/{source_id}        single-source cached payload
  GET /api/insights/global/all-sources        12 sources status + last_updated
  GET /api/insights/methodology/sources       transparency · source metadata

Superadmin endpoint:
  GET /api/superadmin/insights/cron-status    weekly + macro_alert KPIs
  POST /api/superadmin/insights/refresh/{source_id}  manual fetch trigger

Rate limit:
  Public:    300/min/IP (high volume potential · press embeds)
  Superadmin: 60/min/IP
"""
from __future__ import annotations

import logging
import time
from collections import defaultdict, deque
from typing import Any, Dict

from fastapi import APIRouter, HTTPException, Request

from external_insights_engine import (
    fetch_source,
    list_sources_status,
    SOURCE_METADATA,
    ALL_SOURCES,
    ensure_external_insights_indexes,
)
from permissions import require_superadmin
from audit_immutable_engine import log as audit_log

log = logging.getLogger("dmx.routes_external_insights")

router = APIRouter(tags=["external_insights"])
PUBLIC_PREFIX = "/api/insights"
SUPERADMIN_PREFIX = "/api/superadmin/insights"

# ─── Rate limiting (2 buckets) ────────────────────────────────────────────────
_RATE_PUBLIC: Dict[str, deque] = defaultdict(lambda: deque(maxlen=300))
_RATE_SA: Dict[str, deque] = defaultdict(lambda: deque(maxlen=60))
_RATE_WINDOW_S = 60


def _client_ip(request: Request) -> str:
    ip = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
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


# ─── Public endpoints ────────────────────────────────────────────────────────
@router.get(PUBLIC_PREFIX + "/global/{source_id}")
async def get_global_source(source_id: str, request: Request):
    _check_rate(_RATE_PUBLIC, _client_ip(request), 300)
    db = request.app.state.db
    sid = (source_id or "").strip().lower()
    if sid not in ALL_SOURCES:
        raise HTTPException(404, f"source_id desconocido · disponibles: {sorted(ALL_SOURCES)}")
    res = await fetch_source(db, sid)
    return {
        "source_id": sid,
        "status": res.get("status"),
        "fetched_at": res.get("fetched_at"),
        "expires_at": res.get("expires_at"),
        "http_status": res.get("http_status"),
        "payload": res.get("payload"),
    }


@router.get(PUBLIC_PREFIX + "/global/all-sources")
async def get_all_sources_status(request: Request):
    _check_rate(_RATE_PUBLIC, _client_ip(request), 300)
    db = request.app.state.db
    items = await list_sources_status(db)
    return {"items": items, "count": len(items)}


@router.get(PUBLIC_PREFIX + "/methodology/sources")
async def get_methodology_sources(request: Request):
    """Transparency endpoint · returns 12 sources + URLs + frequency + tier."""
    _check_rate(_RATE_PUBLIC, _client_ip(request), 300)
    db = request.app.state.db
    statuses = await list_sources_status(db)
    status_map = {s["source_id"]: s for s in statuses}
    enriched = []
    for meta in SOURCE_METADATA:
        sid = meta["source_id"]
        st = status_map.get(sid, {})
        enriched.append({
            **meta,
            "last_status": st.get("status", "never_fetched"),
            "last_seen": st.get("fetched_at"),
        })
    return {"items": enriched, "count": len(enriched)}


# ─── Superadmin endpoints ────────────────────────────────────────────────────
@router.get(SUPERADMIN_PREFIX + "/cron-status")
async def get_cron_status(request: Request):
    _check_rate(_RATE_SA, _client_ip(request), 60)
    actor = await require_superadmin(request)
    db = request.app.state.db
    statuses = await list_sources_status(db)
    ok = sum(1 for s in statuses if s.get("status") == "ok")
    error = sum(1 for s in statuses if s.get("status") == "error")
    skipped = sum(1 for s in statuses if s.get("status") == "skipped")
    never = sum(1 for s in statuses if s.get("status") == "never_fetched")

    # Macro alerts sent in last 7d
    try:
        alerts_7d = await db.macro_alert_sent.count_documents({}) or 0
    except Exception:
        alerts_7d = 0

    try:
        await audit_log(
            db,
            actor={"user_id": getattr(actor, "user_id", "superadmin"), "role": "superadmin"},
            action="external_insights_status_viewed",
            entity_type="external_insights_cron",
            entity_id="status",
            before=None,
            after={"ok": ok, "error": error, "skipped": skipped, "never": never},
        )
    except Exception:
        pass

    return {
        "summary": {"ok": ok, "error": error, "skipped": skipped, "never_fetched": never,
                    "total": len(statuses)},
        "alerts_7d": alerts_7d,
        "sources": statuses,
    }


@router.post(SUPERADMIN_PREFIX + "/refresh/{source_id}")
async def refresh_source(source_id: str, request: Request):
    _check_rate(_RATE_SA, _client_ip(request), 60)
    actor = await require_superadmin(request)
    db = request.app.state.db
    sid = (source_id or "").strip().lower()
    if sid not in ALL_SOURCES:
        raise HTTPException(404, f"source_id desconocido")

    # Force-expire the cache entry so next fetch refreshes from origin
    try:
        await db.external_insights_cache.update_one(
            {"source_id": sid},
            {"$set": {"expires_at": "1970-01-01T00:00:00+00:00"}},
        )
    except Exception:
        pass

    res = await fetch_source(db, sid)

    try:
        await audit_log(
            db,
            actor={"user_id": getattr(actor, "user_id", "superadmin"), "role": "superadmin"},
            action="external_insights_manual_refresh",
            entity_type="external_insight",
            entity_id=sid,
            before=None,
            after={"source_id": sid, "status": res.get("status"), "http_status": res.get("http_status")},
        )
    except Exception:
        pass

    return {"ok": True, "source_id": sid, "result": {
        "status": res.get("status"),
        "fetched_at": res.get("fetched_at"),
        "http_status": res.get("http_status"),
        "error": res.get("error"),
    }}


# Startup hook helper (called from server.py · keeps imports tidy)
async def ensure_indexes(db) -> None:
    await ensure_external_insights_indexes(db)
