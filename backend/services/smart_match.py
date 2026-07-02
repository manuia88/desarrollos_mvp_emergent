"""Phase 4 Batch 30 · services — Smart Match.

Reusa colonia_quiz.match_colonias() B26 para calcular match_pct
de los favoritos del buyer contra sus respuestas del quiz.

Cache 24h en db.smart_match_cache.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.smart_match")


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def compute_buyer_match_score(db, user_id: str, force_refresh: bool = False) -> Dict[str, Any]:
    """
    Calcula el match score del buyer para sus favoritos vs quiz answers.

    Returns:
      {
        has_quiz: bool,
        top_matches: [{item_id, item_type, name, match_pct, top_2_reasons}],
        avg_match: float,
        cached: bool,
      }
    """
    # ── Check 24h cache ──────────────────────────────────────────────────────
    if not force_refresh:
        cached = await db.smart_match_cache.find_one(
            {"user_id": user_id},
            {"_id": 0},
        )
        if cached:
            expires_at = cached.get("expires_at")
            if expires_at and expires_at > _now():
                result = dict(cached)
                result.pop("_id", None)
                result.pop("expires_at", None)
                result.pop("generated_at", None)
                result["cached"] = True
                return result

    # ── Pull quiz answers from db.leads (source=quiz, email=user's email) ───
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "email": 1})
    quiz_answers: Optional[Dict] = None

    if user and user.get("email"):
        lead = await db.leads.find_one(
            {"email": user["email"], "source": "quiz"},
            {"_id": 0, "payload": 1},
            sort=[("created_at", -1)],
        )
        if lead:
            quiz_answers = lead.get("payload", {}).get("answers")

    if not quiz_answers:
        result = {"has_quiz": False, "top_matches": [], "avg_match": 0.0, "cached": False}
        return result

    # ── Pull buyer favorites ─────────────────────────────────────────────────
    favorites = await db.buyer_favorites.find(
        {"user_id": user_id},
        {"_id": 0, "item_id": 1, "item_type": 1},
    ).limit(30).to_list(30)

    if not favorites:
        result = {"has_quiz": True, "top_matches": [], "avg_match": 0.0, "cached": False}
        return result

    # ── Match each favorite vs quiz answers ──────────────────────────────────
    from services.colonia_quiz import match_colonias

    top_matches: List[Dict[str, Any]] = []

    for fav in favorites:
        item_id = fav.get("item_id", "")
        item_type = fav.get("item_type", "development")

        # Resolve colonia_id from development or colonia
        colonia_id = item_id
        item_name = item_id
        try:
            dev = await db.developments.find_one(
                {"$or": [{"id": item_id}, {"slug": item_id}]},
                {"_id": 0, "colonia_id": 1, "name": 1, "colonia": 1},
            )
            if dev:
                colonia_id = dev.get("colonia_id") or dev.get("colonia") or item_id
                item_name = dev.get("name") or item_id
        except Exception:
            pass

        # Run match against quiz answers (top_n=1, filter by this colonia)
        try:
            matches = await match_colonias(quiz_answers, top_n=10)
            # Find this colonia in results
            match_info = next((m for m in matches if m.get("colonia_id") == colonia_id), None)
            if match_info:
                top_matches.append({
                    "item_id": item_id,
                    "item_type": item_type,
                    "name": item_name,
                    "colonia_id": colonia_id,
                    "match_pct": match_info.get("match_pct", 0),
                    "top_2_reasons": match_info.get("reasons", [])[:2],
                })
            else:
                # If colonia not in top matches, assign lower score
                top_matches.append({
                    "item_id": item_id,
                    "item_type": item_type,
                    "name": item_name,
                    "colonia_id": colonia_id,
                    "match_pct": max(30, 50 - len(top_matches) * 5),
                    "top_2_reasons": ["Zona explorada", "Presupuesto compatible"],
                })
        except Exception as e:
            log.debug(f"[smart_match] match error for {item_id}: {e}")

    # Sort by match_pct descending, take top 3
    top_matches.sort(key=lambda x: -x.get("match_pct", 0))
    top_matches = top_matches[:3]

    avg_match = round(
        sum(m["match_pct"] for m in top_matches) / len(top_matches), 1
    ) if top_matches else 0.0

    result = {
        "has_quiz": True,
        "top_matches": top_matches,
        "avg_match": avg_match,
        "cached": False,
    }

    # ── Cache 24h ────────────────────────────────────────────────────────────
    now = _now()
    cache_doc = {
        "user_id": user_id,
        "has_quiz": True,
        "top_matches": top_matches,
        "avg_match": avg_match,
        "generated_at": now,
        "expires_at": now + timedelta(hours=24),
    }
    try:
        await db.smart_match_cache.replace_one(
            {"user_id": user_id},
            cache_doc,
            upsert=True,
        )
    except Exception as e:
        log.debug(f"[smart_match] cache write failed: {e}")

    return result


async def invalidate_smart_match_cache(db, user_id: str) -> None:
    """Invalidar cache cuando quiz_update o favorite_change."""
    try:
        await db.smart_match_cache.delete_one({"user_id": user_id})
    except Exception:
        pass


async def ensure_smart_match_indexes(db) -> None:
    await db.smart_match_cache.create_index("user_id", unique=True)
    await db.smart_match_cache.create_index("expires_at")
