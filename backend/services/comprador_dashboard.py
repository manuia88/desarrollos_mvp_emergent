"""Phase 4 Batch 28 · services — Comprador Dashboard aggregator.

Calcula KPIs del dashboard del comprador autenticado.
Cache 15 min en `db.comprador_dashboards`.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List

log = logging.getLogger("dmx.comprador_dashboard")

CACHE_TTL_MIN = 15


def _completion_pct(user_doc: Dict[str, Any], consents: Dict[str, Any]) -> int:
    """Calcula % de perfil completo (0-100)."""
    pts = 0
    if user_doc.get("name"): pts += 25
    if user_doc.get("email"): pts += 25
    if user_doc.get("phone"): pts += 25
    if consents:  # tiene al menos un consent registrado
        pts += 25
    return pts


async def _enrich_dev(db, dev_id: str) -> Dict[str, Any]:
    """Enriquece un dev_id con cover/name/colonia desde DEVELOPMENTS_BY_ID en memoria."""
    if not dev_id:
        return {}
    try:
        from data_developments import DEVELOPMENTS_BY_ID
        d = DEVELOPMENTS_BY_ID.get(dev_id)
        if not d:
            return {"id": dev_id}
        return {
            "id": d.get("id"),
            "name": d.get("name"),
            "colonia": d.get("colonia"),
            "cover_photo": d.get("cover_photo") or (d.get("photos") or [None])[0],
            "price_from": d.get("price_from"),
        }
    except Exception:
        return {"id": dev_id}


async def compute_dashboard(db, user_id: str, email: str) -> Dict[str, Any]:
    """Aggregate KPIs para un comprador específico."""
    # Cache hit
    try:
        cached = await db.comprador_dashboards.find_one({"user_id": user_id}, {"_id": 0})
        if cached:
            ts = cached.get("last_refreshed_at")
            if isinstance(ts, datetime):
                ts = ts.replace(tzinfo=ts.tzinfo or timezone.utc)
                if datetime.now(timezone.utc) - ts < timedelta(minutes=CACHE_TTL_MIN):
                    cached["from_cache"] = True
                    cached["last_refreshed_at"] = ts.isoformat()
                    return cached
    except Exception:
        pass

    now = datetime.now(timezone.utc)
    seven_days_ago = now - timedelta(days=7)

    # Saved searches: link by user_id OR fallback by email
    saved_q = {"$or": [{"user_id": user_id}, {"email": email, "user_id": {"$exists": False}}]}
    saved_total = await db.saved_searches.count_documents(saved_q)
    saved_recent = []
    async for s in db.saved_searches.find(saved_q, {"_id": 0, "search_id": 1, "filters": 1,
                                                     "alert_frequency": 1, "created_at": 1,
                                                     "last_alert_sent": 1}).sort("created_at", -1).limit(3):
        saved_recent.append(s)

    # Alerts pending = saved_searches con last_alert_sent en últimos 7d (proxy)
    alerts_pending = await db.saved_searches.count_documents({
        **saved_q,
        "last_alert_sent": {"$gte": seven_days_ago},
    })

    # Favorites
    fav_total = await db.buyer_favorites.count_documents({"user_id": user_id})
    fav_recent: List[Dict[str, Any]] = []
    async for f in db.buyer_favorites.find({"user_id": user_id}, {"_id": 0}).sort("added_at", -1).limit(3):
        if f.get("item_type") == "project":
            f["thumb"] = await _enrich_dev(db, f.get("item_id"))
        fav_recent.append(f)

    # History (last 5 views)
    history: List[Dict[str, Any]] = []
    async for v in db.buyer_views.find({"user_id": user_id}, {"_id": 0}).sort("viewed_at", -1).limit(5):
        if v.get("item_type") == "project":
            v["thumb"] = await _enrich_dev(db, v.get("item_id"))
        history.append(v)

    # User + consents para profile completion
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0}) or {}
    consents = await db.privacy_consents.find_one({"user_id": user_id}, {"_id": 0}) or {}
    completion_pct = _completion_pct(user_doc, consents.get("consents") or {})

    payload = {
        "user_id": user_id,
        "name": user_doc.get("name") or "Comprador",
        "kpis": {
            "saved_searches": {
                "total": saved_total,
                "recent": _serialize(saved_recent),
            },
            "alerts": {"pending": alerts_pending},
            "favorites": {
                "total": fav_total,
                "recent": _serialize(fav_recent),
            },
            "history": {
                "recent": _serialize(history),
            },
        },
        "profile_completion_pct": completion_pct,
        "last_refreshed_at": now.isoformat(),
        "from_cache": False,
    }

    # Cache write
    try:
        cache_doc = {**payload, "last_refreshed_at": now}
        await db.comprador_dashboards.update_one(
            {"user_id": user_id}, {"$set": cache_doc}, upsert=True,
        )
    except Exception:
        pass

    return payload


def _serialize(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Convierte datetimes a iso strings para JSON."""
    out = []
    for it in items:
        d = dict(it)
        for k, v in list(d.items()):
            if isinstance(v, datetime):
                d[k] = v.replace(tzinfo=v.tzinfo or timezone.utc).isoformat()
        out.append(d)
    return out
