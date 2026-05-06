"""Phase 4 Batch 28 · services — Buyer history (favorites + view tracking).

Schemas:
  db.buyer_favorites: { fav_id, user_id, item_type, item_id, tags[], notes?, added_at }
  db.buyer_views:     { view_id, user_id, item_type, item_id, source, viewed_at }
                      TTL 90 días (índice creado on first call).
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.buyer_history")

VALID_ITEM_TYPES = {"project", "colonia", "unit"}
VALID_VIEW_SOURCES = {"marketplace", "comparator", "quiz", "report", "favorites"}
VIEW_TTL_DAYS = 90

_INDEXES_DONE = False


async def _ensure_indexes(db) -> None:
    """TTL index sobre buyer_views.viewed_at + único user_id+item compuesto en favorites."""
    global _INDEXES_DONE
    if _INDEXES_DONE:
        return
    try:
        await db.buyer_views.create_index(
            "viewed_at",
            expireAfterSeconds=VIEW_TTL_DAYS * 86400,
        )
        await db.buyer_favorites.create_index(
            [("user_id", 1), ("item_type", 1), ("item_id", 1)],
            unique=True,
        )
        _INDEXES_DONE = True
    except Exception as ex:
        log.debug(f"[buyer_history] index setup: {ex}")


# ─── Favorites ────────────────────────────────────────────────────────────────

async def add_favorite(
    db,
    user_id: str,
    item_type: str,
    item_id: str,
    tags: Optional[List[str]] = None,
    notes: Optional[str] = None,
) -> Dict[str, Any]:
    """Upsert un favorito. Si existe, devuelve el existente (o actualiza tags/notes)."""
    await _ensure_indexes(db)

    if item_type not in VALID_ITEM_TYPES:
        raise ValueError(f"item_type inválido: {item_type}")
    if not item_id:
        raise ValueError("item_id requerido")

    now = datetime.now(timezone.utc)
    set_doc: Dict[str, Any] = {
        "user_id": user_id, "item_type": item_type, "item_id": item_id,
    }
    if tags is not None:
        set_doc["tags"] = list(tags)[:10]
    if notes is not None:
        set_doc["notes"] = (notes or "")[:500]

    insert_only: Dict[str, Any] = {
        "fav_id": f"fav_{uuid.uuid4().hex[:12]}", "added_at": now,
    }
    # tags/notes solo se ponen en $setOnInsert si NO están en $set (evita conflicto Mongo)
    if "tags" not in set_doc:
        insert_only["tags"] = []
    if "notes" not in set_doc:
        insert_only["notes"] = ""

    try:
        await db.buyer_favorites.update_one(
            {"user_id": user_id, "item_type": item_type, "item_id": item_id},
            {"$set": set_doc, "$setOnInsert": insert_only},
            upsert=True,
        )
    except Exception as ex:
        log.warning(f"[buyer_history] add_favorite upsert failed: {ex}")
        raise

    fav = await db.buyer_favorites.find_one(
        {"user_id": user_id, "item_type": item_type, "item_id": item_id},
        {"_id": 0},
    )
    return fav or set_doc


async def remove_favorite(db, user_id: str, fav_id: str) -> bool:
    r = await db.buyer_favorites.delete_one({"user_id": user_id, "fav_id": fav_id})
    return r.deleted_count > 0


async def get_favorites(db, user_id: str, item_type: Optional[str] = None) -> List[Dict[str, Any]]:
    q: Dict[str, Any] = {"user_id": user_id}
    if item_type:
        q["item_type"] = item_type
    out: List[Dict[str, Any]] = []
    async for f in db.buyer_favorites.find(q, {"_id": 0}).sort("added_at", -1).limit(200):
        out.append(_iso(f))
    return out


# ─── Views ────────────────────────────────────────────────────────────────────

async def track_view(
    db,
    user_id: str,
    item_type: str,
    item_id: str,
    source: str = "marketplace",
) -> Dict[str, Any]:
    await _ensure_indexes(db)
    if item_type not in VALID_ITEM_TYPES:
        raise ValueError(f"item_type inválido: {item_type}")
    if source not in VALID_VIEW_SOURCES:
        source = "marketplace"

    now = datetime.now(timezone.utc)
    doc = {
        "view_id": f"view_{uuid.uuid4().hex[:12]}",
        "user_id": user_id, "item_type": item_type, "item_id": item_id,
        "source": source, "viewed_at": now,
    }
    # Dedup: si la última vista de este item es <60s, no duplicar
    cutoff = now - timedelta(seconds=60)
    recent = await db.buyer_views.find_one(
        {"user_id": user_id, "item_type": item_type, "item_id": item_id,
         "viewed_at": {"$gte": cutoff}},
        {"_id": 0, "view_id": 1},
    )
    if recent:
        return _iso({**doc, "view_id": recent["view_id"], "deduped": True})

    try:
        await db.buyer_views.insert_one(dict(doc))
    except Exception as ex:
        log.warning(f"[buyer_history] track_view insert failed: {ex}")
        return _iso(doc)
    return _iso(doc)


async def get_history(db, user_id: str, limit: int = 50) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    async for v in db.buyer_views.find(
        {"user_id": user_id}, {"_id": 0}
    ).sort("viewed_at", -1).limit(limit):
        out.append(_iso(v))
    return out


async def clear_history(db, user_id: str) -> int:
    r = await db.buyer_views.delete_many({"user_id": user_id})
    return r.deleted_count


def _iso(doc: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(doc)
    for k, v in list(out.items()):
        if isinstance(v, datetime):
            out[k] = v.replace(tzinfo=v.tzinfo or timezone.utc).isoformat()
    return out
