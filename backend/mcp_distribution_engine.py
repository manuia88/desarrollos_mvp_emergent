"""W4.16 Sub-C — MCP Distribution Channel tracking."""
from __future__ import annotations

import hashlib
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict

log = logging.getLogger("dmx.mcp_distribution")
LFPDPPP_SALT = os.environ.get("LFPDPPP_SALT", "dmx_lfpdppp_2026")

VALID_CLIENT_TYPES = {"claude_desktop", "chatgpt", "perplexity", "cursor", "windsurf", "unknown"}
VALID_SOURCES = {"organic", "tutorial", "mcp_so", "awesome_mcp", "anthropic_registry", "referral"}


def _iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def hash_ip(ip: str) -> str:
    return hashlib.sha256(f"{ip}:{LFPDPPP_SALT}".encode()).hexdigest()[:32]


def detect_client_from_ua(ua: str) -> str:
    ua_l = (ua or "").lower()
    if "claude" in ua_l:
        return "claude_desktop"
    if "chatgpt" in ua_l or "openai" in ua_l:
        return "chatgpt"
    if "perplexity" in ua_l:
        return "perplexity"
    if "cursor" in ua_l:
        return "cursor"
    if "windsurf" in ua_l:
        return "windsurf"
    return "unknown"


async def track_mcp_adoption(db, client_type: str, source: str, ip: str = "",
                              locale: str = "es-MX") -> Dict[str, Any]:
    ct = client_type if client_type in VALID_CLIENT_TYPES else "unknown"
    src = source if source in VALID_SOURCES else "organic"
    ip_h = hash_ip(ip)
    now = _iso()
    existing = None
    try:
        existing = await db.mcp_adoptions.find_one(
            {"ip_hash": ip_h, "client_type": ct, "source": src}, {"_id": 0},
        )
    except Exception:
        existing = None
    if existing:
        try:
            await db.mcp_adoptions.update_one(
                {"adoption_id": existing["adoption_id"]},
                {"$set": {"last_seen_at": now}, "$inc": {"sessions_count": 1}},
            )
        except Exception as exc:
            log.warning(f"[mcp] update failed: {exc}")
        existing.update({"last_seen_at": now,
                         "sessions_count": existing.get("sessions_count", 0) + 1})
        return existing

    doc = {
        "adoption_id": str(uuid.uuid4()),
        "client_type": ct, "source": src,
        "ip_hash": ip_h, "locale": locale,
        "first_seen_at": now, "last_seen_at": now,
        "sessions_count": 1,
    }
    try:
        await db.mcp_adoptions.insert_one(dict(doc))
    except Exception as exc:
        log.warning(f"[mcp] insert failed: {exc}")
    doc.pop("_id", None)
    return doc


async def get_adoption_stats(db) -> Dict[str, Any]:
    by_client: Dict[str, int] = {}
    by_source: Dict[str, int] = {}
    total = 0
    total_sessions = 0
    try:
        async for d in db.mcp_adoptions.find({}, {"_id": 0}):
            total += 1
            total_sessions += int(d.get("sessions_count") or 0)
            ct = d.get("client_type") or "unknown"
            sr = d.get("source") or "organic"
            by_client[ct] = by_client.get(ct, 0) + 1
            by_source[sr] = by_source.get(sr, 0) + 1
    except Exception as exc:
        log.warning(f"[mcp] stats failed: {exc}")
    return {"total_adoptions": total, "total_sessions": total_sessions,
            "by_client": by_client, "by_source": by_source}


async def ensure_mcp_distribution_indexes(db) -> None:
    try:
        await db.mcp_adoptions.create_index("adoption_id", unique=True)
        await db.mcp_adoptions.create_index([("client_type", 1), ("source", 1)])
        await db.mcp_adoptions.create_index([("first_seen_at", -1)])
    except Exception as exc:
        log.warning(f"[mcp] index create failed: {exc}")
