"""W6.MOV.3 · Reviews Residentes Engine.

Aggrega + analiza reseñas residentes sobre zonas y desarrollos CDMX desde 3 fuentes:
    1. Google Places API (search por lat/lng radius · filter min_rating · max 100/source)
    2. Foursquare Places v3 (FOURSQUARE_API_KEY · stub-aware)
    3. Web scrape Atlas Reseñas CDMX (BeautifulSoup · stub-aware)

Sentiment via Claude Sonnet 4.5 via EMERGENT_LLM_KEY (mismo patrón briefing/storyteller).

Cache 7d en `reviews_residents_cache` por (entity_type, entity_id, source).
FAIL-OPEN: si LLM falla → sentiment="neutral" + confidence=0.5 · NO crash.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
from collections import Counter
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import httpx

log = logging.getLogger("dmx.reviews_residents_engine")

ENGINE_VERSION = "1.0.0"
CACHE_TTL_DAYS = int(os.environ.get("REVIEWS_RESIDENTS_CACHE_TTL_DAYS", "7"))

SOURCES = ("google_places", "foursquare", "atlas_resenas")
SENTIMENTS = ("positive", "neutral", "negative")

# Max per source/entity per scrape
MAX_REVIEWS_PER_SOURCE = 100

# Sentiment LLM model
SENTIMENT_MODEL = "claude-sonnet-4-5-20250929"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _idem_hash(entity_id: str, source: str) -> str:
    raw = f"{entity_id}:{source}:{_now().strftime('%Y-%m-%d')}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def _stub_enabled() -> bool:
    return not bool(os.environ.get("GOOGLE_PLACES_API_KEY"))


# ── Source connectors ─────────────────────────────────────────────────────────

async def _fetch_google_places(entity_type: str, entity_id: str, lat: Optional[float], lng: Optional[float]) -> Tuple[List[Dict[str, Any]], bool]:
    """Google Places Nearby Search + Place Details reviews. Returns (reviews, is_stub)."""
    api_key = os.environ.get("GOOGLE_PLACES_API_KEY")
    if not api_key or lat is None or lng is None:
        return [], True
    reviews: List[Dict[str, Any]] = []
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            nearby_url = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"
            r = await client.get(nearby_url, params={
                "location": f"{lat},{lng}",
                "radius": 500,
                "key": api_key,
            })
            data = r.json() or {}
            place_ids = [p.get("place_id") for p in (data.get("results") or [])[:10] if p.get("place_id")]
            for pid in place_ids:
                details_url = "https://maps.googleapis.com/maps/api/place/details/json"
                rd = await client.get(details_url, params={
                    "place_id": pid,
                    "fields": "reviews,name,rating",
                    "key": api_key,
                })
                dd = (rd.json() or {}).get("result") or {}
                for rv in (dd.get("reviews") or []):
                    if len(reviews) >= MAX_REVIEWS_PER_SOURCE:
                        break
                    reviews.append({
                        "external_id": f"google:{pid}:{rv.get('time', 0)}",
                        "author": rv.get("author_name") or "anónimo",
                        "rating": float(rv.get("rating") or 0),
                        "text": (rv.get("text") or "").strip()[:2000],
                        "language": rv.get("language") or "es",
                        "reported_at": _now(),
                        "place_name": dd.get("name"),
                    })
                if len(reviews) >= MAX_REVIEWS_PER_SOURCE:
                    break
    except Exception as exc:
        log.warning(f"_fetch_google_places failed for {entity_id}: {exc}")
        return [], False
    return reviews, False


async def _fetch_foursquare(entity_type: str, entity_id: str, lat: Optional[float], lng: Optional[float]) -> Tuple[List[Dict[str, Any]], bool]:
    """Foursquare Places v3 tips (proxy for reviews). Stub-aware."""
    api_key = os.environ.get("FOURSQUARE_API_KEY")
    if not api_key or lat is None or lng is None:
        return [], True
    reviews: List[Dict[str, Any]] = []
    try:
        async with httpx.AsyncClient(timeout=15.0, headers={"Authorization": api_key, "accept": "application/json"}) as client:
            search_url = "https://api.foursquare.com/v3/places/search"
            r = await client.get(search_url, params={"ll": f"{lat},{lng}", "radius": 500, "limit": 20})
            data = r.json() or {}
            for place in (data.get("results") or [])[:10]:
                fsq_id = place.get("fsq_id")
                if not fsq_id:
                    continue
                tips_url = f"https://api.foursquare.com/v3/places/{fsq_id}/tips"
                rt = await client.get(tips_url, params={"limit": 20})
                for tip in (rt.json() or []):
                    if len(reviews) >= MAX_REVIEWS_PER_SOURCE:
                        break
                    reviews.append({
                        "external_id": f"fsq:{tip.get('id', '')}",
                        "author": (tip.get("user") or {}).get("first_name", "anónimo"),
                        "rating": 0.0,
                        "text": (tip.get("text") or "").strip()[:2000],
                        "language": "es",
                        "reported_at": _now(),
                        "place_name": place.get("name"),
                    })
                if len(reviews) >= MAX_REVIEWS_PER_SOURCE:
                    break
    except Exception as exc:
        log.warning(f"_fetch_foursquare failed for {entity_id}: {exc}")
        return [], False
    return reviews, False


async def _fetch_atlas_resenas(entity_type: str, entity_id: str) -> Tuple[List[Dict[str, Any]], bool]:
    """Web scrape Atlas Reseñas CDMX (alcaldía/colonia listings). Stub-aware."""
    enabled = os.environ.get("ATLAS_RESENAS_ENABLED", "false").lower() == "true"
    if not enabled:
        return [], True
    reviews: List[Dict[str, Any]] = []
    try:
        from bs4 import BeautifulSoup
        base = os.environ.get("ATLAS_RESENAS_BASE_URL", "https://atlasresenascdmx.example/")
        url = f"{base.rstrip('/')}/{entity_type}/{entity_id}"
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(url)
            if r.status_code != 200:
                return [], False
            soup = BeautifulSoup(r.text, "html.parser")
            for card in soup.select(".review-card")[:MAX_REVIEWS_PER_SOURCE]:
                text_el = card.select_one(".review-text")
                author_el = card.select_one(".review-author")
                rating_el = card.select_one(".review-rating")
                if not text_el:
                    continue
                try:
                    rating_val = float(rating_el.get("data-rating", "0")) if rating_el else 0.0
                except (ValueError, TypeError):
                    rating_val = 0.0
                reviews.append({
                    "external_id": f"atlas:{entity_id}:{hashlib.md5(text_el.get_text().encode()).hexdigest()[:10]}",
                    "author": (author_el.get_text().strip() if author_el else "anónimo"),
                    "rating": rating_val,
                    "text": text_el.get_text().strip()[:2000],
                    "language": "es",
                    "reported_at": _now(),
                    "place_name": entity_id,
                })
    except Exception as exc:
        log.warning(f"_fetch_atlas_resenas failed for {entity_id}: {exc}")
        return [], False
    return reviews, False


# ── Sentiment LLM ─────────────────────────────────────────────────────────────

async def sentiment_classify(text: str) -> Dict[str, Any]:
    """LLM sentiment + themes extraction. FAIL-OPEN neutral 0.5 on error."""
    if not text or len(text.strip()) < 5:
        return {"sentiment": "neutral", "themes": [], "confidence": 0.5}
    try:
        from llm_client import LlmChat, UserMessage
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            return {"sentiment": "neutral", "themes": [], "confidence": 0.5, "stub": True}
        session_key = f"sentiment_{hashlib.md5(text.encode()).hexdigest()[:10]}"
        system_prompt = (
            "Eres analista de sentimiento de reseñas residenciales en CDMX. "
            "Clasifica el texto y extrae temas. Responde JSON estricto:\n"
            '{"sentiment": "positive"|"neutral"|"negative", '
            '"themes": ["seguridad","ruido","tráfico","limpieza","servicios","convivencia","precio","ubicación"], '
            '"confidence": 0.0-1.0}'
        )
        chat = LlmChat(api_key=api_key, session_id=session_key, system_message=system_prompt).with_model("anthropic", SENTIMENT_MODEL)
        resp = await chat.send_message(UserMessage(text=f"Reseña: {text[:1500]}\n\nResponde solo JSON."))
        raw = (resp or "").strip()
        if raw.startswith("```"):
            raw = raw.split("```", 2)[1].lstrip("json").lstrip("\n").strip()
            if raw.endswith("```"):
                raw = raw.rsplit("```", 1)[0].strip()
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            try:
                start = raw.index("{")
                end = raw.rindex("}")
                parsed = json.loads(raw[start:end + 1])
            except Exception:
                return {"sentiment": "neutral", "themes": [], "confidence": 0.5}
        sent = parsed.get("sentiment", "neutral")
        if sent not in SENTIMENTS:
            sent = "neutral"
        themes = parsed.get("themes") or []
        if not isinstance(themes, list):
            themes = []
        conf = float(parsed.get("confidence") or 0.5)
        return {"sentiment": sent, "themes": themes[:8], "confidence": max(0.0, min(1.0, conf))}
    except Exception as exc:
        log.warning(f"sentiment_classify failed: {exc}")
        return {"sentiment": "neutral", "themes": [], "confidence": 0.5}


# ── Scrape + persist ──────────────────────────────────────────────────────────

async def _persist_reviews(db, entity_type: str, entity_id: str, source: str, reviews: List[Dict[str, Any]]) -> int:
    """Upsert reviews + run sentiment for each. Returns persisted count."""
    persisted = 0
    for rv in reviews:
        try:
            ext_id = rv.get("external_id")
            existing = await db.reviews_residents.find_one({"external_id": ext_id})
            if existing:
                continue
            sent = await sentiment_classify(rv.get("text", ""))
            doc = {
                "entity_type": entity_type,
                "entity_id": entity_id,
                "source": source,
                "external_id": ext_id,
                "author": rv.get("author"),
                "rating": float(rv.get("rating") or 0),
                "text": rv.get("text") or "",
                "language": rv.get("language") or "es",
                "place_name": rv.get("place_name"),
                "sentiment": sent.get("sentiment"),
                "themes": sent.get("themes"),
                "confidence": sent.get("confidence"),
                "reported_at": rv.get("reported_at") or _now(),
                "ingested_at": _now(),
                "version": ENGINE_VERSION,
            }
            await db.reviews_residents.insert_one(doc)
            persisted += 1
        except Exception as exc:
            log.warning(f"_persist_reviews item failed: {exc}")
    return persisted


async def scrape_entity(
    db, entity_type: str, entity_id: str,
    lat: Optional[float] = None, lng: Optional[float] = None,
    force: bool = False,
) -> Dict[str, Any]:
    """Scrape 3 sources in parallel + persist + return summary.

    Idempotency: cache TTL 7d per (entity_id, source) gates re-scrape.
    """
    # Defensive lat/lng lookup from entity if missing
    if lat is None or lng is None:
        if entity_type == "development":
            dev = await db.developments.find_one({"id": entity_id}, {"_id": 0, "lat": 1, "lng": 1})
            if dev:
                lat = lat if lat is not None else dev.get("lat")
                lng = lng if lng is not None else dev.get("lng")
        elif entity_type == "zone":
            zone = await db.zones.find_one({"id": entity_id}, {"_id": 0, "lat": 1, "lng": 1})
            if zone:
                lat = lat if lat is not None else zone.get("lat")
                lng = lng if lng is not None else zone.get("lng")

    summary: Dict[str, Any] = {"entity_type": entity_type, "entity_id": entity_id, "sources": {}, "is_stub": False}

    # Cache gate per source
    sources_to_run: List[str] = []
    for src in SOURCES:
        if force:
            sources_to_run.append(src)
            continue
        cached = await db.reviews_residents_cache.find_one({"entity_type": entity_type, "entity_id": entity_id, "source": src})
        if cached and cached.get("computed_at"):
            ca = cached["computed_at"]
            if ca.tzinfo is None:
                ca = ca.replace(tzinfo=timezone.utc)
            if (_now() - ca).days < CACHE_TTL_DAYS:
                summary["sources"][src] = {"cached": True, "count": cached.get("count", 0), "is_stub": cached.get("is_stub", False)}
                continue
        sources_to_run.append(src)

    # Parallel fetch
    fetch_tasks = []
    for src in sources_to_run:
        if src == "google_places":
            fetch_tasks.append(_fetch_google_places(entity_type, entity_id, lat, lng))
        elif src == "foursquare":
            fetch_tasks.append(_fetch_foursquare(entity_type, entity_id, lat, lng))
        elif src == "atlas_resenas":
            fetch_tasks.append(_fetch_atlas_resenas(entity_type, entity_id))

    if fetch_tasks:
        results = await asyncio.gather(*fetch_tasks, return_exceptions=True)
        for src, res in zip(sources_to_run, results):
            if isinstance(res, Exception):
                summary["sources"][src] = {"error": str(res), "count": 0, "is_stub": False}
                continue
            reviews, is_stub = res
            persisted = await _persist_reviews(db, entity_type, entity_id, src, reviews) if reviews else 0
            summary["sources"][src] = {"count": persisted, "is_stub": is_stub, "fetched": len(reviews)}
            try:
                await db.reviews_residents_cache.update_one(
                    {"entity_type": entity_type, "entity_id": entity_id, "source": src},
                    {"$set": {
                        "entity_type": entity_type, "entity_id": entity_id, "source": src,
                        "count": persisted, "is_stub": is_stub,
                        "idem_hash": _idem_hash(entity_id, src),
                        "computed_at": _now(),
                        "version": ENGINE_VERSION,
                    }},
                    upsert=True,
                )
            except Exception as exc:
                log.warning(f"cache upsert failed for {entity_id}/{src}: {exc}")

    summary["is_stub"] = all(s.get("is_stub", False) for s in summary["sources"].values()) if summary["sources"] else True
    return summary


# ── Aggregation + ranking ─────────────────────────────────────────────────────

async def aggregate_by_entity(db, entity_type: str, entity_id: str) -> Dict[str, Any]:
    """Sentiment breakdown + avg rating + top themes + n_reviews + top quotes."""
    cursor = db.reviews_residents.find({"entity_type": entity_type, "entity_id": entity_id})
    n = 0
    rating_sum = 0.0
    rating_count = 0
    sentiment_counts = {"positive": 0, "neutral": 0, "negative": 0}
    theme_counter: Counter = Counter()
    quotes_by_sent: Dict[str, List[Dict[str, Any]]] = {"positive": [], "neutral": [], "negative": []}

    async for rv in cursor:
        n += 1
        r = float(rv.get("rating") or 0)
        if r > 0:
            rating_sum += r
            rating_count += 1
        sent = rv.get("sentiment") or "neutral"
        if sent in sentiment_counts:
            sentiment_counts[sent] += 1
        for t in (rv.get("themes") or []):
            if isinstance(t, str):
                theme_counter[t] += 1
        # capture quote (sorted later by confidence)
        if sent in quotes_by_sent and (rv.get("text") or "").strip():
            quotes_by_sent[sent].append({
                "text": rv["text"][:280],
                "author": rv.get("author") or "anónimo",
                "rating": r,
                "sentiment": sent,
                "confidence": float(rv.get("confidence") or 0.5),
                "source": rv.get("source"),
            })

    avg_rating = round(rating_sum / rating_count, 2) if rating_count else None
    total_classified = sum(sentiment_counts.values()) or 1
    breakdown = {k: round(v / total_classified * 100, 1) for k, v in sentiment_counts.items()}

    # Top 3 quotes prioritizing positive→neutral→negative ordered by confidence desc
    top_quotes: List[Dict[str, Any]] = []
    for sent in ("positive", "negative", "neutral"):
        bucket = sorted(quotes_by_sent[sent], key=lambda q: q["confidence"], reverse=True)
        for q in bucket:
            if len(top_quotes) >= 3:
                break
            top_quotes.append(q)
        if len(top_quotes) >= 3:
            break

    return {
        "entity_type": entity_type,
        "entity_id": entity_id,
        "n_reviews": n,
        "avg_rating": avg_rating,
        "sentiment_breakdown_pct": breakdown,
        "sentiment_counts": sentiment_counts,
        "top_themes": [{"theme": t, "count": c} for t, c in theme_counter.most_common(5)],
        "top_quotes": top_quotes,
        "computed_at": _now(),
        "version": ENGINE_VERSION,
    }


async def rank_by_quality(db, entity_type: str, limit: int = 50) -> List[Dict[str, Any]]:
    """Composite score = avg_rating × log(n_reviews+1) × positive_ratio."""
    import math
    pipeline = [
        {"$match": {"entity_type": entity_type}},
        {"$group": {
            "_id": "$entity_id",
            "n": {"$sum": 1},
            "avg_rating": {"$avg": "$rating"},
            "positives": {"$sum": {"$cond": [{"$eq": ["$sentiment", "positive"]}, 1, 0]}},
        }},
        {"$match": {"n": {"$gte": 1}}},
    ]
    items: List[Dict[str, Any]] = []
    async for row in db.reviews_residents.aggregate(pipeline):
        n = int(row.get("n") or 0)
        avg = float(row.get("avg_rating") or 0)
        pos_ratio = (float(row.get("positives") or 0) / n) if n else 0
        composite = round((avg if avg > 0 else 3.0) * math.log(n + 1) * (0.5 + pos_ratio), 2)
        items.append({
            "entity_id": row["_id"],
            "n_reviews": n,
            "avg_rating": round(avg, 2) if avg else None,
            "positive_ratio_pct": round(pos_ratio * 100, 1),
            "composite_score": composite,
        })
    items.sort(key=lambda x: x["composite_score"], reverse=True)
    return items[:limit]


async def get_stats(db) -> Dict[str, Any]:
    """Superadmin stats: total reviews · top zones · top devs · cron health."""
    total = await db.reviews_residents.count_documents({})
    sentiment_pipeline = [{"$group": {"_id": "$sentiment", "n": {"$sum": 1}}}]
    sent_counts = {"positive": 0, "neutral": 0, "negative": 0}
    async for r in db.reviews_residents.aggregate(sentiment_pipeline):
        if r["_id"] in sent_counts:
            sent_counts[r["_id"]] = int(r["n"])

    top_zones = await rank_by_quality(db, "zone", limit=10)
    top_devs = await rank_by_quality(db, "development", limit=10)

    last_run = await db.reviews_residents_runs.find_one(sort=[("ended_at", -1)])
    cron_health = {
        "last_run": (last_run or {}).get("ended_at"),
        "last_processed": (last_run or {}).get("entities_processed", 0),
        "last_errors": (last_run or {}).get("errors", 0),
    } if last_run else {"last_run": None, "last_processed": 0, "last_errors": 0}

    return {
        "total_reviews": total,
        "sentiment_counts": sent_counts,
        "top_zones": top_zones,
        "top_developments": top_devs,
        "cron_health": cron_health,
        "version": ENGINE_VERSION,
        "computed_at": _now(),
    }


async def delete_entity_reviews(db, entity_type: str, entity_id: str) -> Dict[str, Any]:
    """Superadmin delete · removes reviews + cache for one entity."""
    rv_res = await db.reviews_residents.delete_many({"entity_type": entity_type, "entity_id": entity_id})
    cache_res = await db.reviews_residents_cache.delete_many({"entity_type": entity_type, "entity_id": entity_id})
    return {"reviews_deleted": rv_res.deleted_count, "cache_deleted": cache_res.deleted_count}


async def ensure_indexes(db) -> None:
    """Idempotent index creation."""
    try:
        await db.reviews_residents.create_index([("entity_type", 1), ("entity_id", 1)])
        await db.reviews_residents.create_index("external_id", unique=True, sparse=True)
        await db.reviews_residents.create_index([("source", 1)])
        await db.reviews_residents.create_index("reported_at")
        await db.reviews_residents_cache.create_index(
            [("entity_type", 1), ("entity_id", 1), ("source", 1)], unique=True
        )
        await db.reviews_residents_cache.create_index("computed_at")
        await db.reviews_residents_runs.create_index([("ended_at", -1)])
    except Exception as exc:
        log.warning(f"ensure_indexes warning: {exc}")
