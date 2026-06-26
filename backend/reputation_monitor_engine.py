"""W7.AS.6 · Reputation Monitor Engine (Brand24-style).

Monitorea menciones de la marca DMX en 4 fuentes externas:
    1. Google Search (Custom Search API · GOOGLE_CSE_KEY + GOOGLE_CSE_CX)
    2. Twitter/X (X_BEARER_TOKEN · v2 recent search · free tier)
    3. Reddit (subreddits MX real estate · public JSON · no key)
    4. News web scraping (httpx + BeautifulSoup · stub-aware)

Sentiment LLM Claude Sonnet 4.5 vía EMERGENT_LLM_KEY (mismo patrón W6.MOV.3).

Cache 24h en `reputation_monitor_cache` por (source, query_hash).
Alert trigger ≥3 mentions negativas en 24h → emit_notification superadmin via
`notifications_engine`.

FAIL-SOFT por fuente: keys ausentes → status="skipped" + 0 mentions · NO crash.
Audit `audit_immutable_engine.log` en scan run + alert trigger.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

import httpx

log = logging.getLogger("dmx.reputation_monitor_engine")

ENGINE_VERSION = "1.0.0"

# ─── Collections ──────────────────────────────────────────────────────────────
COLLECTION_MENTIONS = "reputation_monitor_mentions"
COLLECTION_CACHE = "reputation_monitor_cache"
COLLECTION_RUNS = "reputation_monitor_runs"
COLLECTION_ALERTS = "reputation_monitor_alerts"

# TTL / config
CACHE_TTL_HOURS = 24
RUNS_TTL_DAYS = 30
MENTIONS_TTL_DAYS = 180
ALERT_THRESHOLD = int(os.environ.get("REPUTATION_ALERT_THRESHOLD", "3"))
ALERT_WINDOW_HOURS = 24

SOURCES = ("google_search", "twitter_x", "reddit", "news_web")
SENTIMENTS = ("positive", "neutral", "negative")
SENTIMENT_MODEL = "claude-sonnet-4-5-20250929"

# Brand keywords default (env REPUTATION_BRAND_KEYWORDS csv override)
DEFAULT_BRAND_KEYWORDS = ["desarrollosmx", "DMX inmobiliaria", "desarrollos mx"]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _uid(prefix: str = "rmn") -> str:
    return f"{prefix}_{uuid.uuid4().hex[:14]}"


def _query_hash(query: str) -> str:
    return hashlib.sha256(query.strip().lower().encode()).hexdigest()[:16]


def _brand_keywords() -> List[str]:
    raw = os.environ.get("REPUTATION_BRAND_KEYWORDS", "").strip()
    if raw:
        kws = [k.strip() for k in raw.split(",") if k.strip()]
        if kws:
            return kws
    return list(DEFAULT_BRAND_KEYWORDS)


# ─── Cache helpers ────────────────────────────────────────────────────────────

async def _cache_get(db, source: str, qhash: str) -> Optional[List[Dict[str, Any]]]:
    if db is None:
        return None
    try:
        doc = await db[COLLECTION_CACHE].find_one(
            {"source": source, "query_hash": qhash}, {"_id": 0}
        )
        if not doc:
            return None
        exp = doc.get("expires_at")
        if isinstance(exp, datetime) and exp < _now():
            return None
        return doc.get("items") or []
    except Exception as exc:
        log.debug(f"[reputation_monitor] cache_get fail: {exc}")
        return None


async def _cache_set(db, source: str, qhash: str, items: List[Dict[str, Any]]) -> None:
    if db is None:
        return
    try:
        now = _now()
        await db[COLLECTION_CACHE].update_one(
            {"source": source, "query_hash": qhash},
            {
                "$set": {
                    "source": source,
                    "query_hash": qhash,
                    "items": items,
                    "computed_at": now,
                    "expires_at": now + timedelta(hours=CACHE_TTL_HOURS),
                },
            },
            upsert=True,
        )
    except Exception as exc:
        log.debug(f"[reputation_monitor] cache_set fail: {exc}")


# ─── Connectors (FAIL-SOFT) ───────────────────────────────────────────────────

async def _scan_google(query: str) -> Tuple[List[Dict[str, Any]], str]:
    """Google Custom Search API. Stub if no key."""
    key = os.environ.get("GOOGLE_CSE_KEY", "").strip()
    cx = os.environ.get("GOOGLE_CSE_CX", "").strip()
    if not key or not cx:
        return [], "skipped"
    url = "https://www.googleapis.com/customsearch/v1"
    params = {"key": key, "cx": cx, "q": query, "num": 10, "lr": "lang_es"}
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(url, params=params)
            if r.status_code != 200:
                return [], "error"
            data = r.json() or {}
            items = []
            for it in (data.get("items") or [])[:10]:
                items.append({
                    "source": "google_search",
                    "url": it.get("link") or "",
                    "title": it.get("title") or "",
                    "snippet": it.get("snippet") or "",
                    "author": it.get("displayLink") or "",
                    "external_id": (it.get("cacheId") or it.get("link") or _uid("g"))[:80],
                })
            return items, "ok"
    except Exception as exc:
        log.warning(f"[reputation_monitor] google scan fail: {exc}")
        return [], "error"


async def _scan_twitter(query: str) -> Tuple[List[Dict[str, Any]], str]:
    """Twitter/X v2 recent search. Stub if no bearer token."""
    token = os.environ.get("X_BEARER_TOKEN", "").strip()
    if not token:
        return [], "skipped"
    url = "https://api.twitter.com/2/tweets/search/recent"
    params = {
        "query": f"{query} lang:es -is:retweet",
        "max_results": 20,
        "tweet.fields": "created_at,author_id,public_metrics",
    }
    headers = {"Authorization": f"Bearer {token}"}
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(url, params=params, headers=headers)
            if r.status_code != 200:
                return [], "error"
            data = r.json() or {}
            items = []
            for tw in (data.get("data") or [])[:20]:
                tid = tw.get("id")
                items.append({
                    "source": "twitter_x",
                    "url": f"https://twitter.com/i/web/status/{tid}" if tid else "",
                    "title": "",
                    "snippet": tw.get("text") or "",
                    "author": str(tw.get("author_id") or ""),
                    "external_id": f"tw_{tid}" if tid else _uid("tw"),
                })
            return items, "ok"
    except Exception as exc:
        log.warning(f"[reputation_monitor] twitter scan fail: {exc}")
        return [], "error"


REDDIT_SUBREDDITS = ["mexico", "MexicoCity", "Inmobiliaria", "bienesraices"]


async def _scan_reddit(query: str) -> Tuple[List[Dict[str, Any]], str]:
    """Reddit public JSON search across MX real estate subs. No key needed."""
    items: List[Dict[str, Any]] = []
    status = "ok"
    headers = {"User-Agent": "DMX-ReputationMonitor/1.0"}
    try:
        async with httpx.AsyncClient(timeout=15.0, headers=headers) as client:
            for sub in REDDIT_SUBREDDITS:
                try:
                    url = f"https://www.reddit.com/r/{sub}/search.json"
                    params = {"q": query, "restrict_sr": 1, "sort": "new", "limit": 10}
                    r = await client.get(url, params=params)
                    if r.status_code != 200:
                        continue
                    data = r.json() or {}
                    for ch in (data.get("data") or {}).get("children") or []:
                        d = ch.get("data") or {}
                        rid = d.get("id")
                        title = d.get("title") or ""
                        body = d.get("selftext") or ""
                        items.append({
                            "source": "reddit",
                            "url": f"https://reddit.com{d.get('permalink', '')}",
                            "title": title,
                            "snippet": (body[:400] if body else title)[:600],
                            "author": d.get("author") or "",
                            "external_id": f"rd_{rid}" if rid else _uid("rd"),
                        })
                except Exception as exc:
                    log.debug(f"[reputation_monitor] reddit sub={sub} fail: {exc}")
                    continue
    except Exception as exc:
        log.warning(f"[reputation_monitor] reddit scan fail: {exc}")
        status = "error"
    return items[:30], status


NEWS_SITES_QUERY_TEMPLATE = (
    "https://news.google.com/rss/search?q={q}+CDMX+inmobiliaria&hl=es-419&gl=MX&ceid=MX:es-419"
)


async def _scan_news(query: str) -> Tuple[List[Dict[str, Any]], str]:
    """Google News RSS scrape. No key needed."""
    items: List[Dict[str, Any]] = []
    try:
        import urllib.parse
        url = NEWS_SITES_QUERY_TEMPLATE.format(q=urllib.parse.quote(query))
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(url)
            if r.status_code != 200:
                return [], "error"
            xml = r.text or ""
            # Naive regex parsing — avoid heavy deps
            for m in list(re.finditer(r"<item>(.*?)</item>", xml, re.DOTALL))[:15]:
                block = m.group(1)
                t = re.search(r"<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</title>", block, re.DOTALL)
                lnk = re.search(r"<link>(.*?)</link>", block, re.DOTALL)
                desc = re.search(
                    r"<description>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</description>",
                    block, re.DOTALL,
                )
                src = re.search(r"<source[^>]*>(.*?)</source>", block, re.DOTALL)
                guid = re.search(r"<guid[^>]*>(.*?)</guid>", block, re.DOTALL)
                title = (t.group(1) if t else "").strip()
                link = (lnk.group(1) if lnk else "").strip()
                # strip HTML tags from description
                snippet = re.sub(r"<[^>]+>", " ", (desc.group(1) if desc else "")).strip()
                author = (src.group(1) if src else "").strip()
                ext = (guid.group(1) if guid else link or _uid("nw")).strip()[:120]
                if not title:
                    continue
                items.append({
                    "source": "news_web",
                    "url": link,
                    "title": title,
                    "snippet": snippet[:600],
                    "author": author,
                    "external_id": f"nw_{hashlib.md5(ext.encode()).hexdigest()[:14]}",
                })
        return items, "ok"
    except Exception as exc:
        log.warning(f"[reputation_monitor] news scan fail: {exc}")
        return [], "error"


SOURCE_CONNECTORS = {
    "google_search": _scan_google,
    "twitter_x": _scan_twitter,
    "reddit": _scan_reddit,
    "news_web": _scan_news,
}


# ─── Sentiment classification ─────────────────────────────────────────────────

async def classify_sentiment(text: str) -> Dict[str, Any]:
    """LLM sentiment 3-tier. FAIL-OPEN neutral on error / no key."""
    txt = (text or "").strip()
    if len(txt) < 5:
        return {"sentiment": "neutral", "score": 0.5, "stub": True}
    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        return {"sentiment": "neutral", "score": 0.5, "stub": True}
    try:
        from llm_client import LlmChat, UserMessage
        session_key = f"rep_sentiment_{hashlib.md5(txt.encode()).hexdigest()[:10]}"
        system_prompt = (
            "Eres analista de sentimiento de menciones de marca inmobiliaria CDMX. "
            "Clasifica el texto. Responde JSON estricto:\n"
            '{"sentiment": "positive"|"neutral"|"negative", "score": 0.0-1.0}'
        )
        chat = LlmChat(
            api_key=api_key, session_id=session_key, system_message=system_prompt,
        ).with_model("anthropic", SENTIMENT_MODEL)
        resp = await chat.send_message(UserMessage(text=f"Mención: {txt[:1500]}\n\nResponde solo JSON."))
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
                return {"sentiment": "neutral", "score": 0.5}
        sent = parsed.get("sentiment", "neutral")
        if sent not in SENTIMENTS:
            sent = "neutral"
        score = float(parsed.get("score") or 0.5)
        return {"sentiment": sent, "score": max(0.0, min(1.0, score))}
    except Exception as exc:
        log.warning(f"[reputation_monitor] sentiment_classify fail: {exc}")
        return {"sentiment": "neutral", "score": 0.5}


# ─── Scan + persist ───────────────────────────────────────────────────────────

async def scan_mentions(
    db, brand_keywords: Optional[List[str]] = None,
    sources: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Ejecuta scan multi-source + sentiment + persist + alert trigger.

    Returns {total_new, by_source, by_status, items_new[]}.
    """
    keywords = brand_keywords or _brand_keywords()
    selected_sources = list(sources or SOURCES)
    by_source: Dict[str, int] = {}
    by_status: Dict[str, str] = {}
    items_new: List[Dict[str, Any]] = []
    total_new = 0

    for kw in keywords:
        qhash = _query_hash(kw)
        for src in selected_sources:
            if src not in SOURCE_CONNECTORS:
                continue
            # Cache check
            cached = await _cache_get(db, src, qhash)
            if cached is not None:
                raw_items = cached
                status = "cached"
            else:
                connector = SOURCE_CONNECTORS[src]
                try:
                    raw_items, status = await connector(kw)
                except Exception as exc:
                    log.warning(f"[reputation_monitor] connector {src} crash: {exc}")
                    raw_items, status = [], "error"
                if status == "ok":
                    await _cache_set(db, src, qhash, raw_items)

            by_status[f"{src}:{kw}"] = status
            by_source[src] = by_source.get(src, 0) + len(raw_items)

            # Persist new mentions only (dedup by external_id)
            for it in raw_items:
                ext_id = it.get("external_id")
                if not ext_id or db is None:
                    continue
                try:
                    existing = await db[COLLECTION_MENTIONS].find_one(
                        {"external_id": ext_id}, {"_id": 0, "id": 1},
                    )
                    if existing:
                        continue
                    # Classify sentiment on title+snippet
                    text_for_sent = f"{it.get('title', '')} {it.get('snippet', '')}".strip()
                    sent_info = await classify_sentiment(text_for_sent)
                    now = _now()
                    doc = {
                        "id": _uid("mnt"),
                        "external_id": ext_id,
                        "source": src,
                        "brand_keyword": kw,
                        "url": it.get("url") or "",
                        "title": it.get("title") or "",
                        "snippet": it.get("snippet") or "",
                        "author": it.get("author") or "",
                        "sentiment": sent_info.get("sentiment"),
                        "score": sent_info.get("score"),
                        "status": "new",
                        "found_at": now,
                        "ingested_at": now,
                        "ttl_until": now + timedelta(days=MENTIONS_TTL_DAYS),
                        "version": ENGINE_VERSION,
                    }
                    await db[COLLECTION_MENTIONS].insert_one(dict(doc))
                    total_new += 1
                    items_new.append({k: v for k, v in doc.items()
                                       if k not in ("ttl_until", "version")})
                except Exception as exc:
                    log.debug(f"[reputation_monitor] persist mention fail: {exc}")
                    continue

    # Alert trigger after scan
    try:
        await trigger_alerts(db, threshold=ALERT_THRESHOLD)
    except Exception as exc:
        log.debug(f"[reputation_monitor] trigger_alerts fail: {exc}")

    return {
        "total_new": total_new,
        "by_source": by_source,
        "by_status": by_status,
        "items_new": items_new[:20],
    }


# ─── Aggregations ─────────────────────────────────────────────────────────────

async def aggregate_stats(db, days: int = 30) -> Dict[str, Any]:
    """Aggregated stats: total · by_source · by_sentiment · top_negative_urls · trend_7d."""
    out: Dict[str, Any] = {
        "total_mentions": 0,
        "by_source": {},
        "by_sentiment": {"positive": 0, "neutral": 0, "negative": 0},
        "top_negative_urls": [],
        "trend_7d": [],
        "days": days,
    }
    if db is None:
        return out
    cutoff = _now() - timedelta(days=max(1, min(days, 365)))
    try:
        cursor = db[COLLECTION_MENTIONS].find(
            {"found_at": {"$gte": cutoff}}, {"_id": 0},
        )
        async for d in cursor:
            out["total_mentions"] += 1
            src = d.get("source") or "unknown"
            out["by_source"][src] = out["by_source"].get(src, 0) + 1
            sent = d.get("sentiment") or "neutral"
            if sent in out["by_sentiment"]:
                out["by_sentiment"][sent] += 1
    except Exception as exc:
        log.warning(f"[reputation_monitor] aggregate find fail: {exc}")

    # Top negative URLs (last 30d max 5)
    try:
        cursor = db[COLLECTION_MENTIONS].find(
            {"sentiment": "negative", "found_at": {"$gte": cutoff}, "status": {"$ne": "dismissed"}},
            {"_id": 0, "id": 1, "url": 1, "title": 1, "snippet": 1, "source": 1, "found_at": 1},
        ).sort("found_at", -1).limit(5)
        async for d in cursor:
            v = d.get("found_at")
            if hasattr(v, "isoformat"):
                d["found_at"] = v.isoformat()
            out["top_negative_urls"].append(d)
    except Exception as exc:
        log.debug(f"[reputation_monitor] top_negative fail: {exc}")

    # Trend 7d daily count
    try:
        for i in range(6, -1, -1):
            day_start = _now() - timedelta(days=i + 1)
            day_end = _now() - timedelta(days=i)
            count = await db[COLLECTION_MENTIONS].count_documents({
                "found_at": {"$gte": day_start, "$lt": day_end},
            })
            out["trend_7d"].append({
                "date": day_end.date().isoformat(),
                "count": int(count or 0),
            })
    except Exception as exc:
        log.debug(f"[reputation_monitor] trend_7d fail: {exc}")

    return out


# ─── Alerts ───────────────────────────────────────────────────────────────────

async def trigger_alerts(db, threshold: int = ALERT_THRESHOLD) -> Dict[str, Any]:
    """If ≥threshold negative mentions in last ALERT_WINDOW_HOURS → emit notification."""
    if db is None:
        return {"triggered": False}
    cutoff = _now() - timedelta(hours=ALERT_WINDOW_HOURS)
    try:
        n_neg = await db[COLLECTION_MENTIONS].count_documents({
            "sentiment": "negative",
            "found_at": {"$gte": cutoff},
        })
    except Exception as exc:
        log.warning(f"[reputation_monitor] count_neg fail: {exc}")
        return {"triggered": False, "error": str(exc)}

    if n_neg < threshold:
        return {"triggered": False, "negative_count": n_neg}

    # Dedup: only trigger once per ALERT_WINDOW_HOURS
    try:
        last_alert = await db[COLLECTION_ALERTS].find_one(
            {}, {"_id": 0}, sort=[("triggered_at", -1)],
        )
        if last_alert:
            la = last_alert.get("triggered_at")
            if isinstance(la, datetime) and (_now() - la) < timedelta(hours=ALERT_WINDOW_HOURS):
                return {"triggered": False, "reason": "throttled", "negative_count": n_neg}
    except Exception as exc:
        log.debug(f"[reputation_monitor] alerts dedup check fail: {exc}")

    alert_id = _uid("alr")
    now = _now()
    doc = {
        "id": alert_id,
        "triggered_at": now,
        "negative_count": int(n_neg),
        "threshold": threshold,
        "window_hours": ALERT_WINDOW_HOURS,
        "ttl_until": now + timedelta(days=RUNS_TTL_DAYS),
    }
    try:
        await db[COLLECTION_ALERTS].insert_one(dict(doc))
    except Exception as exc:
        log.warning(f"[reputation_monitor] alert insert fail: {exc}")

    # Emit notification to all superadmins
    try:
        from notifications_engine import emit_notification
        cursor = db.users.find({"role": "superadmin"}, {"_id": 0, "id": 1, "user_id": 1})
        async for u in cursor:
            uid = u.get("user_id") or u.get("id")
            if not uid:
                continue
            try:
                await emit_notification(
                    db,
                    user_id=uid,
                    type="generic",
                    severity="high",
                    title="Reputación · alerta de menciones negativas",
                    body=(
                        f"Se detectaron {n_neg} menciones negativas de DMX en las últimas "
                        f"{ALERT_WINDOW_HOURS}h (umbral={threshold})."
                    ),
                    action_url="/superadmin/reputation-monitor",
                    payload={"alert_id": alert_id, "negative_count": n_neg},
                )
            except Exception as exc:
                log.debug(f"[reputation_monitor] emit_notification fail user={uid}: {exc}")
    except Exception as exc:
        log.warning(f"[reputation_monitor] notify superadmins fail: {exc}")

    # Audit
    try:
        from audit_immutable_engine import log as audit_log
        await audit_log(
            db,
            actor={"user_id": "system", "role": "system"},
            action="reputation_alert_triggered",
            entity_type="reputation_alert",
            entity_id=alert_id,
            before=None,
            after={"negative_count": n_neg, "threshold": threshold},
        )
    except Exception as exc:
        log.debug(f"[reputation_monitor] audit alert fail: {exc}")

    return {"triggered": True, "alert_id": alert_id, "negative_count": n_neg}


# ─── Mention CRUD ─────────────────────────────────────────────────────────────

async def update_mention_status(
    db, mention_id: str, status: str, actor_user_id: str = "system",
) -> bool:
    """Mark mention reviewed|dismissed."""
    if status not in ("reviewed", "dismissed", "new"):
        return False
    if db is None or not mention_id:
        return False
    try:
        res = await db[COLLECTION_MENTIONS].update_one(
            {"id": mention_id},
            {"$set": {"status": status, "reviewed_at": _now(), "reviewed_by": actor_user_id}},
        )
        return bool(res.modified_count)
    except Exception as exc:
        log.warning(f"[reputation_monitor] update_mention_status fail: {exc}")
        return False


# ─── Index setup ──────────────────────────────────────────────────────────────

async def ensure_indexes(db) -> None:
    """Idempotent index creation."""
    if db is None:
        return
    try:
        await db[COLLECTION_MENTIONS].create_index("id", unique=True)
        await db[COLLECTION_MENTIONS].create_index("external_id", unique=True, sparse=True)
        await db[COLLECTION_MENTIONS].create_index([("source", 1)])
        await db[COLLECTION_MENTIONS].create_index([("sentiment", 1)])
        await db[COLLECTION_MENTIONS].create_index([("status", 1)])
        await db[COLLECTION_MENTIONS].create_index("found_at")
        await db[COLLECTION_MENTIONS].create_index(
            "ttl_until", expireAfterSeconds=0,
        )
        await db[COLLECTION_CACHE].create_index(
            [("source", 1), ("query_hash", 1)], unique=True,
        )
        await db[COLLECTION_CACHE].create_index(
            "expires_at", expireAfterSeconds=0,
        )
        await db[COLLECTION_RUNS].create_index("ended_at")
        await db[COLLECTION_RUNS].create_index(
            "ttl_until", expireAfterSeconds=0,
        )
        await db[COLLECTION_ALERTS].create_index("triggered_at")
        await db[COLLECTION_ALERTS].create_index(
            "ttl_until", expireAfterSeconds=0,
        )
    except Exception as exc:
        log.warning(f"[reputation_monitor] ensure_indexes warning: {exc}")
