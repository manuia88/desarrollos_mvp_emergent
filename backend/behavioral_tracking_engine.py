"""W4.3 — Sub-Chunk B · Behavioral Tracking Engine.

Ingesta de eventos de comportamiento + aggregation + índices Mongo.
LFPDPPP: IP hasheada con SHA256 + salt + truncate 8 chars. NO se almacena IP raw.
TTL 90 días sobre timestamp.
"""
from __future__ import annotations

import hashlib
import logging
import os
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.behavioral_tracking")

# Salt estático (no confidencial — solo evita rainbow tables de IPs comunes)
_IP_SALT = os.environ.get("BEHAVIORAL_IP_SALT", "dmx_lat_2026_ip_salt")

VALID_EVENT_TYPES = {"page_view", "feature_use", "click", "submit", "scroll_depth"}


def _hash_ip(ip: str) -> str:
    """SHA256 + salt → truncate 8 chars. Cumple LFPDPPP (datos personales no recuperables)."""
    raw = f"{_IP_SALT}:{ip}"
    return hashlib.sha256(raw.encode()).hexdigest()[:8]


def _extract_ip(request) -> str:
    """Extrae IP real ignorando proxies privados."""
    forwarded = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    return forwarded or request.client.host if request.client else "unknown"


async def ingest_event(db, payload: Dict[str, Any], request) -> str:
    """Persiste un evento behavioral. Retorna event_id."""
    event_id = f"evt_{uuid.uuid4().hex[:16]}"
    ip_raw = _extract_ip(request)
    ip_hash = _hash_ip(ip_raw)

    event_type = payload.get("event_type", "page_view")
    if event_type not in VALID_EVENT_TYPES:
        event_type = "page_view"

    doc = {
        "id": event_id,
        "session_id": payload.get("session_id") or "",
        "user_id": payload.get("user_id") or None,
        "org_id": payload.get("org_id") or None,
        "event_type": event_type,
        "page": (payload.get("page") or "/")[:500],
        "feature": payload.get("feature") or None,
        "metadata": payload.get("metadata") or {},
        "user_agent": (request.headers.get("user-agent") or "")[:300],
        "ip_hash": ip_hash,
        "timestamp": datetime.now(timezone.utc),
    }
    try:
        await db.behavioral_events.insert_one(doc)
    except Exception as exc:
        log.warning(f"[behavioral] ingest_event failed: {exc}")
    return event_id


async def aggregate_by_feature(db, org_id: Optional[str], since: Optional[datetime]) -> Dict[str, Any]:
    """Agrega conteos de eventos por feature y por page."""
    match: Dict[str, Any] = {}
    if org_id:
        match["org_id"] = org_id
    if since:
        match["timestamp"] = {"$gte": since}

    pipeline = [
        {"$match": match},
        {"$group": {
            "_id": "$feature",
            "count": {"$sum": 1},
            "unique_users": {"$addToSet": "$user_id"},
        }},
        {"$project": {
            "_id": 0,
            "feature": "$_id",
            "count": 1,
            "unique_users": {"$size": "$unique_users"},
        }},
        {"$sort": {"count": -1}},
    ]
    by_feature_raw = await db.behavioral_events.aggregate(pipeline).to_list(length=100)
    by_feature = [f for f in by_feature_raw if f.get("feature")]

    page_pipeline = [
        {"$match": match},
        {"$group": {"_id": "$page", "count": {"$sum": 1}}},
        {"$project": {"_id": 0, "page": "$_id", "count": 1}},
        {"$sort": {"count": -1}},
        {"$limit": 20},
    ]
    by_page = await db.behavioral_events.aggregate(page_pipeline).to_list(length=20)

    top_3 = [f["feature"] for f in by_feature[:3] if f.get("feature")]
    return {
        "by_feature": by_feature,
        "by_page": by_page,
        "top_3_features": top_3,
        "since": since.isoformat() if since else None,
        "org_id": org_id,
    }


async def ensure_indexes(db) -> None:
    """Crea índices para behavioral_events incluyendo TTL 90 días."""
    try:
        # TTL index — Mongo auto-elimina docs con timestamp > 90 días
        await db.behavioral_events.create_index(
            "timestamp", expireAfterSeconds=90 * 24 * 3600, name="idx_behavioral_ttl"
        )
        await db.behavioral_events.create_index(
            [("org_id", 1), ("timestamp", -1)], name="idx_behavioral_org_time"
        )
        await db.behavioral_events.create_index(
            "session_id", name="idx_behavioral_session"
        )
        await db.behavioral_events.create_index(
            "feature", sparse=True, name="idx_behavioral_feature"
        )
        await db.behavioral_events.create_index(
            "id", unique=True, name="idx_behavioral_id"
        )
        log.info("[behavioral] indexes OK")
    except Exception as exc:
        log.warning(f"[behavioral] ensure_indexes failed: {exc}")
