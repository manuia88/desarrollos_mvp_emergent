"""W7.AS.6 · Reputation Monitor Routes (superadmin only).

5 endpoints:
  - GET  /api/superadmin/reputation/mentions
  - GET  /api/superadmin/reputation/stats
  - POST /api/superadmin/reputation/scan-now             (rate-limit 5/h superadmin)
  - GET  /api/superadmin/reputation/alerts-history
  - POST /api/superadmin/reputation/mark-mention/{id}
"""
from __future__ import annotations

import logging
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from typing import Any, Deque, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from reputation_monitor_engine import (
    COLLECTION_ALERTS,
    COLLECTION_MENTIONS,
    SENTIMENTS,
    SOURCES,
    aggregate_stats,
    scan_mentions,
    update_mention_status,
)

log = logging.getLogger("dmx.routes.reputation_monitor")

router = APIRouter(tags=["reputation_monitor"])
PREFIX = "/api/superadmin/reputation"

# Rate-limit scan-now: 5/h per superadmin user
_RL_BUCKET_SCAN: Dict[str, Deque[float]] = defaultdict(deque)
RL_WINDOW_SEC = 3600
RL_LIMIT_SCAN = 5


def _db(request: Request):
    return request.app.state.db


async def _require_superadmin(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    if getattr(user, "role", None) != "superadmin":
        raise HTTPException(403, "Solo superadmin")
    return user


def _rate_limit_scan(user_id: str) -> None:
    now = time.time()
    bkt = _RL_BUCKET_SCAN[user_id]
    while bkt and (now - bkt[0]) > RL_WINDOW_SEC:
        bkt.popleft()
    if len(bkt) >= RL_LIMIT_SCAN:
        raise HTTPException(429, "rate_limit_exceeded · max 5/hora")
    bkt.append(now)


def _iso(d: Any) -> Optional[str]:
    if isinstance(d, datetime):
        return d.isoformat()
    return d


def _serialize(doc: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(doc)
    out.pop("_id", None)
    for k in ("found_at", "ingested_at", "reviewed_at", "ttl_until", "triggered_at"):
        if k in out:
            out[k] = _iso(out[k])
    return out


# ─── GET /mentions ────────────────────────────────────────────────────────────

@router.get(f"{PREFIX}/mentions")
async def get_mentions(
    request: Request,
    days: int = Query(30, ge=1, le=365),
    sentiment: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    limit: int = Query(50, ge=1, le=200),
    skip: int = Query(0, ge=0),
):
    await _require_superadmin(request)
    db = _db(request)
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    q: Dict[str, Any] = {"found_at": {"$gte": cutoff}}
    if sentiment and sentiment in SENTIMENTS:
        q["sentiment"] = sentiment
    if source and source in SOURCES:
        q["source"] = source
    if status_filter and status_filter in ("new", "reviewed", "dismissed"):
        q["status"] = status_filter

    items: List[Dict[str, Any]] = []
    total = 0
    try:
        total = await db[COLLECTION_MENTIONS].count_documents(q)
        cursor = db[COLLECTION_MENTIONS].find(q, {"_id": 0}).sort(
            "found_at", -1,
        ).skip(skip).limit(limit)
        async for d in cursor:
            items.append(_serialize(d))
    except Exception as exc:
        log.warning(f"[reputation_routes] mentions query fail: {exc}")

    return JSONResponse({
        "items": items,
        "total": int(total),
        "limit": limit,
        "skip": skip,
        "days": days,
    })


# ─── GET /stats ───────────────────────────────────────────────────────────────

@router.get(f"{PREFIX}/stats")
async def get_stats(request: Request, days: int = Query(30, ge=1, le=365)):
    await _require_superadmin(request)
    db = _db(request)
    stats = await aggregate_stats(db, days=days)

    # Alerts count last 7d
    try:
        cutoff_7d = datetime.now(timezone.utc) - timedelta(days=7)
        alerts_7d = await db[COLLECTION_ALERTS].count_documents(
            {"triggered_at": {"$gte": cutoff_7d}},
        )
        stats["alerts_triggered_7d"] = int(alerts_7d or 0)
    except Exception as exc:
        log.debug(f"[reputation_routes] alerts_7d count fail: {exc}")
        stats["alerts_triggered_7d"] = 0

    return JSONResponse(stats)


# ─── POST /scan-now ───────────────────────────────────────────────────────────

class ScanNowBody(BaseModel):
    brand_keywords: Optional[List[str]] = None
    sources: Optional[List[str]] = None


@router.post(f"{PREFIX}/scan-now")
async def post_scan_now(request: Request, body: Optional[ScanNowBody] = None):
    user = await _require_superadmin(request)
    _rate_limit_scan(getattr(user, "user_id", None) or getattr(user, "id", "unknown"))
    db = _db(request)

    bk = body.brand_keywords if body else None
    srcs = body.sources if body else None
    if srcs:
        srcs = [s for s in srcs if s in SOURCES]

    try:
        result = await scan_mentions(db, brand_keywords=bk, sources=srcs)
    except Exception as exc:
        log.warning(f"[reputation_routes] scan_now fail: {exc}")
        raise HTTPException(500, f"scan_failed: {exc}")

    return JSONResponse({"status": "ok", **(result or {})})


# ─── GET /alerts-history ──────────────────────────────────────────────────────

@router.get(f"{PREFIX}/alerts-history")
async def get_alerts_history(request: Request, days: int = Query(30, ge=1, le=365)):
    await _require_superadmin(request)
    db = _db(request)
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    alerts: List[Dict[str, Any]] = []
    try:
        cursor = db[COLLECTION_ALERTS].find(
            {"triggered_at": {"$gte": cutoff}}, {"_id": 0},
        ).sort("triggered_at", -1).limit(100)
        async for d in cursor:
            alerts.append(_serialize(d))
    except Exception as exc:
        log.warning(f"[reputation_routes] alerts-history fail: {exc}")
    return JSONResponse({"items": alerts, "total": len(alerts), "days": days})


# ─── POST /mark-mention/{id} ──────────────────────────────────────────────────

class MarkBody(BaseModel):
    status: str  # "reviewed" | "dismissed"


@router.post(f"{PREFIX}/mark-mention/{{mention_id}}")
async def post_mark_mention(request: Request, mention_id: str, body: MarkBody):
    user = await _require_superadmin(request)
    if body.status not in ("reviewed", "dismissed"):
        raise HTTPException(400, "status must be reviewed or dismissed")
    db = _db(request)
    ok = await update_mention_status(
        db, mention_id, body.status,
        actor_user_id=getattr(user, "user_id", None) or getattr(user, "id", "system"),
    )
    if not ok:
        raise HTTPException(404, "mention not found or no change")
    return JSONResponse({"status": "ok", "mention_id": mention_id, "new_status": body.status})
