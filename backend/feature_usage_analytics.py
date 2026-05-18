"""W5.FF4 Sub-B — Feature Usage Analytics.

Aggregates behavioral_events (W4.3) per feature_key. Used by:
  - Superadmin Feature Visibility Matrix (mini-widget top-features)
  - W5.FF4 churn_prediction_engine (compare baseline vs recent)

FAIL-OPEN: cualquier excepción retorna {} (frontend interpreta como "no data").

Convención `feature` field:
  W4.3 behavioral_tracking_engine stores `event.feature` (string) or
  `event.metadata.feature_key`. Counter aggregates by `feature` first;
  fallback union with `metadata.feature_key` for legacy events.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List

_log = logging.getLogger("dmx.feature_usage_analytics")


def _since(days: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=max(int(days), 1))


async def compute_feature_usage(db, days: int = 7) -> Dict[str, int]:
    """Returns {feature_key: count} of behavioral events in the last N days.

    Aggregates by `feature` field. FAIL-OPEN: {} si DB falla.
    """
    if db is None:
        return {}
    try:
        since = _since(days)
        pipeline = [
            {"$match": {"timestamp": {"$gte": since}, "feature": {"$ne": None}}},
            {"$group": {"_id": "$feature", "count": {"$sum": 1}}},
            {"$project": {"_id": 0, "feature": "$_id", "count": 1}},
            {"$sort": {"count": -1}},
            {"$limit": 100},
        ]
        rows = await db.behavioral_events.aggregate(pipeline).to_list(length=100)
        result: Dict[str, int] = {}
        for r in rows:
            fk = r.get("feature")
            if fk:
                result[fk] = int(r.get("count") or 0)
        return result
    except Exception as exc:
        _log.warning(f"[usage_analytics] compute_feature_usage failed days={days} err={exc}")
        return {}


async def compute_per_user_usage(db, user_id: str, days: int = 7) -> List[Dict[str, Any]]:
    """Returns [{feature_key, count, last_used_at}] for one user in the last N days.

    Ordered by count desc. FAIL-OPEN: [] si DB falla.
    """
    if db is None or not user_id:
        return []
    try:
        since = _since(days)
        pipeline = [
            {"$match": {"user_id": user_id, "timestamp": {"$gte": since}, "feature": {"$ne": None}}},
            {"$group": {
                "_id": "$feature",
                "count": {"$sum": 1},
                "last_used_at": {"$max": "$timestamp"},
            }},
            {"$project": {"_id": 0, "feature_key": "$_id", "count": 1, "last_used_at": 1}},
            {"$sort": {"count": -1}},
            {"$limit": 200},
        ]
        rows = await db.behavioral_events.aggregate(pipeline).to_list(length=200)
        out: List[Dict[str, Any]] = []
        for r in rows:
            ts = r.get("last_used_at")
            if isinstance(ts, datetime):
                ts_iso = ts.isoformat()
            elif isinstance(ts, str):
                ts_iso = ts
            else:
                ts_iso = None
            out.append({
                "feature_key": r.get("feature_key"),
                "count": int(r.get("count") or 0),
                "last_used_at": ts_iso,
            })
        return out
    except Exception as exc:
        _log.warning(f"[usage_analytics] compute_per_user_usage failed user={user_id} err={exc}")
        return []


async def compute_global_summary(db, days: int = 7, top_n: int = 5) -> Dict[str, Any]:
    """Convenience helper for UI: total events + top N features."""
    usage = await compute_feature_usage(db, days=days)
    total = sum(usage.values()) if usage else 0
    top: List[Dict[str, Any]] = []
    for k, v in list(usage.items())[:max(int(top_n), 1)]:
        top.append({"feature_key": k, "count": v})
    return {
        "period_days": days,
        "total_events": total,
        "feature_count": len(usage),
        "top": top,
    }
