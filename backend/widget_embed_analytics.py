"""W5.25 — Widget Embed Analytics engine.

Tracks external domains that embed DMX public widgets (score/risk/avm + 4 verticals).

Collection: widget_embeds
  Schema: {
    id, widget_type, slug, hostname,
    ref_full_url, first_seen_at, last_seen_at, count
  }
  Compound unique index: (widget_type, slug, hostname) → upsert idempotent.
  No TTL · analytical data (historical retention).

API:
  derive_widget_slug(widget_type, slug=None, api_key=None) → str
  record_embed(db, widget_type, slug, ref_header, request=None) → Dict
  get_embed_stats(db, widget_type=None, days=30, limit=50, skip=0) → List[Dict]
  get_new_domains_last_24h(db) → List[Dict]
"""
from __future__ import annotations

import hashlib
import logging
import secrets
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

log = logging.getLogger("dmx.widget_embed_analytics")

SELF_DOMAINS = {"desarrollosmx.io", "desarrollosmx.com", "www.desarrollosmx.io", "www.desarrollosmx.com", "localhost"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso() -> str:
    return _now().isoformat()


def _uid() -> str:
    return f"emb_{secrets.token_urlsafe(10)}"


def _parse_hostname(ref_header: Optional[str]) -> Optional[str]:
    if not ref_header:
        return None
    try:
        host = urlparse(ref_header).hostname
        if not host:
            return None
        host = host.lower().strip()
        # Strip port if present (urlparse already does it via .hostname, defensive)
        return host or None
    except Exception:
        return None


def derive_widget_slug(
    widget_type: str,
    slug: Optional[str] = None,
    api_key: Optional[str] = None,
) -> str:
    """Slug seguro para tracking · NO expone credentials.

    - Widgets con slug nativo (avm/score/risk): retorna slug tal cual
    - Widgets API-keyed (vertical B2B): sha256(api_key)[:16]
    - Fallback: 'anon'
    """
    if slug:
        s = slug.strip()
        if s:
            return s
    if api_key:
        k = api_key.strip()
        if k:
            return hashlib.sha256(k.encode("utf-8")).hexdigest()[:16]
    return "anon"


async def record_embed(
    db,
    widget_type: str,
    slug: str,
    ref_header: Optional[str],
    request=None,
) -> Dict[str, Any]:
    """Upsert idempotente sobre (widget_type, slug, hostname).

    Skips self-embeds. FAIL-SOFT: any failure → {ok: False, reason}.
    """
    hostname = _parse_hostname(ref_header)
    if not hostname:
        return {"ok": False, "reason": "no_referrer"}
    if hostname in SELF_DOMAINS:
        return {"ok": False, "reason": "self_embed", "hostname": hostname}

    widget_type = (widget_type or "").strip()
    slug = (slug or "").strip()
    if not widget_type or not slug:
        return {"ok": False, "reason": "invalid_params"}

    now_iso = _iso()
    key = {"widget_type": widget_type, "slug": slug, "hostname": hostname}

    try:
        # Check first-seen BEFORE upsert (for new_domain audit log)
        existing = await db.widget_embeds.find_one(key, {"_id": 0, "id": 1, "first_seen_at": 1})
        is_new = existing is None

        update_doc: Dict[str, Any] = {
            "$set": {
                "widget_type": widget_type,
                "slug": slug,
                "hostname": hostname,
                "ref_full_url": (ref_header or "")[:512],
                "last_seen_at": now_iso,
            },
            "$inc": {"count": 1},
            "$setOnInsert": {
                "id": _uid(),
                "first_seen_at": now_iso,
            },
        }
        await db.widget_embeds.update_one(key, update_doc, upsert=True)

        if is_new:
            try:
                from audit_immutable_engine import log as audit_log
                await audit_log(
                    db,
                    actor={"user_id": "system", "role": "system"},
                    action="widget_embed_new_domain",
                    entity_type="widget_embed",
                    entity_id=f"{widget_type}:{slug}:{hostname}",
                    before=None,
                    after={
                        "widget_type": widget_type,
                        "slug": slug,
                        "hostname": hostname,
                        "first_seen_at": now_iso,
                    },
                    request=request,
                )
            except Exception as exc:
                log.warning(f"[widget_embed] audit log new_domain failed (non-fatal): {exc}")

        return {"ok": True, "hostname": hostname, "is_new": is_new}
    except Exception as exc:
        log.warning(f"[widget_embed] record_embed failed: {exc}")
        return {"ok": False, "reason": "db_error"}


async def get_embed_stats(
    db,
    widget_type: Optional[str] = None,
    days: int = 30,
    limit: int = 50,
    skip: int = 0,
) -> List[Dict[str, Any]]:
    """Aggregated stats per (hostname, widget_type) within last N days.

    Returns rows sorted by total_embeds desc.
    """
    days = max(1, min(days, 365))
    limit = max(1, min(limit, 200))
    skip = max(0, skip)

    since_iso = (_now() - timedelta(days=days)).isoformat()
    match: Dict[str, Any] = {"last_seen_at": {"$gte": since_iso}}
    if widget_type:
        match["widget_type"] = widget_type

    pipeline: List[Dict[str, Any]] = [
        {"$match": match},
        {
            "$group": {
                "_id": {"hostname": "$hostname", "widget_type": "$widget_type"},
                "total_embeds": {"$sum": "$count"},
                "slugs_count": {"$addToSet": "$slug"},
                "last_seen": {"$max": "$last_seen_at"},
                "first_seen": {"$min": "$first_seen_at"},
            }
        },
        {
            "$project": {
                "_id": 0,
                "hostname": "$_id.hostname",
                "widget_type": "$_id.widget_type",
                "total_embeds": 1,
                "slugs_count": {"$size": "$slugs_count"},
                "last_seen": 1,
                "first_seen": 1,
            }
        },
        {"$sort": {"total_embeds": -1}},
        {"$skip": skip},
        {"$limit": limit},
    ]

    out: List[Dict[str, Any]] = []
    try:
        async for row in db.widget_embeds.aggregate(pipeline):
            out.append(row)
    except Exception as exc:
        log.warning(f"[widget_embed] get_embed_stats failed: {exc}")
    return out


async def get_new_domains_last_24h(db) -> List[Dict[str, Any]]:
    """Domains seen for the FIRST time in the last 24h. Used by daily digest."""
    since_iso = (_now() - timedelta(hours=24)).isoformat()
    try:
        cursor = db.widget_embeds.find(
            {"first_seen_at": {"$gte": since_iso}},
            {"_id": 0, "widget_type": 1, "slug": 1, "hostname": 1, "first_seen_at": 1, "count": 1},
        ).sort("first_seen_at", -1)
        return [r async for r in cursor]
    except Exception as exc:
        log.warning(f"[widget_embed] get_new_domains_last_24h failed: {exc}")
        return []

# W5.FF6 register_feature marker · NO duplicate
from feature_registry import register_feature as _w5ff6_register_feature
_w5ff6_register_feature("widget_embeds_analytics", plan_tier="enterprise", monthly_price_mxn=0, category="operations", name="Widget Embeds Analytics")
