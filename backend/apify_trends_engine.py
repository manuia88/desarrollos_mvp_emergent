"""W4.18.1 — Apify Google Trends Integration.

Engine que consulta Google Trends vía Apify Actor (`emastra/google-trends-scraper`)
con cache MongoDB de 7 días (TTL automático). Expone un único método público
`get_trends_for_query` consumido por:
  - asistente_engine.py (`get_trends_for_query` tool pública)
  - atlax_engine.py    (mismo tool, vía AsistenteEngine)
  - routes_trends.py   (`/api/superadmin/trends/lookup` para Superadmin)
  - scheduler_ie.py    (2 crons: refresh diario keywords hot, weekly keywords curadas)

Resilencia:
  - Si Apify call falla → busca cache aunque esté expirada (`stale=True`).
  - Si no hay cache stale → fallback heurístico (rows vacíos, source="heuristic").
  - Circuit breaker via `sub_agents/resilience.py`.

Schema en `trends_cache`:
  _id (auto)
  cache_key (str, unique idx)        — "{query}|{geo}|{timeframe}"
  query (str), geo (str), timeframe (str), category (str|None)
  response (dict)                     — payload normalizado
  source (str)                        — "apify" | "heuristic"
  cached_at (datetime utc)
  expires_at (datetime utc)            — TTL idx
  hit_count (int)
  last_hit_at (datetime utc)
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import time
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.apify_trends")

# ─── Config ───────────────────────────────────────────────────────────────────
APIFY_TOKEN = os.environ.get("APIFY_TOKEN", "")
APIFY_ACTOR = os.environ.get("APIFY_GOOGLE_TRENDS_ACTOR", "apify/google-trends-scraper")
CACHE_TTL_DAYS = int(os.environ.get("APIFY_TRENDS_CACHE_DAYS", "7"))
APIFY_TIMEOUT_SECS = int(os.environ.get("APIFY_TIMEOUT_SECS", "240"))
APIFY_MEMORY_MB = int(os.environ.get("APIFY_MEMORY_MB", "1024"))

DEFAULT_GEO = "MX"  # actor solo acepta ISO country; CDMX se filtra por interestByRegion
DMX_FOCUS_REGION = "MX-CMX"  # tag lógico solo para metadata
DEFAULT_TIMEFRAME = "today 3-m"  # 90d — universalmente aceptado por actores GT

# Mapeo de geos: aceptamos sinónimos y subdivisiones; siempre devolvemos ISO country
_GEO_ALIASES = {
    "MX-CMX": "MX", "MX-CDMX": "MX", "CDMX": "MX", "CMX": "MX",
    "mx-cmx": "MX", "mx-cdmx": "MX", "cdmx": "MX", "cmx": "MX", "mx": "MX",
}


def _coerce_geo(geo: Optional[str]) -> str:
    raw = (geo or "").strip()
    if not raw:
        return DEFAULT_GEO
    if raw in _GEO_ALIASES:
        return _GEO_ALIASES[raw]
    if len(raw) == 2 and raw.isalpha():
        return raw.upper()
    return DEFAULT_GEO

# Valores aceptados por la mayoría de actores Google Trends.
# `today 12-m` NO es aceptado por apify/* ni emastra/* (por contradictorio que parezca).
# El default real del actor para 12m es timeRange="" (vacío).
_ALLOWED_TIMEFRAMES = {"", "now 1-H", "now 4-H", "now 1-d", "now 7-d",
                       "today 1-m", "today 3-m", "today 5-y", "all"}
_TIMEFRAME_ALIASES = {
    "today 12-m": "",
    "1y": "",
    "12m": "",
    "3m": "today 3-m",
    "1m": "today 1-m",
    "5y": "today 5-y",
    "7d": "now 7-d",
    "1d": "now 1-d",
    "all": "all",
}


def _coerce_timeframe(tf: Optional[str]) -> str:
    raw = (tf or "").strip()
    if not raw:
        return DEFAULT_TIMEFRAME
    if raw in _ALLOWED_TIMEFRAMES:
        return raw
    if raw in _TIMEFRAME_ALIASES:
        return _TIMEFRAME_ALIASES[raw]
    return DEFAULT_TIMEFRAME
# Hot keywords curadas para refresh automático (CDMX real estate intent)
CURATED_HOT_KEYWORDS = [
    "departamento polanco",
    "casa condesa",
    "departamento roma norte",
    "lofts narvarte",
    "credito infonavit cdmx",
    "preventa cdmx",
]

CURATED_WEEKLY_KEYWORDS = [
    "polanco",
    "condesa",
    "roma norte",
    "santa fe cdmx",
    "coyoacan",
    "del valle cdmx",
    "napoles cdmx",
    "escandon",
    "comprar departamento cdmx",
    "casa nueva cdmx",
    "credito hipotecario cdmx",
    "preventa departamento",
]


# ─── Errors ───────────────────────────────────────────────────────────────────
class ApifyTrendsError(Exception):
    """Apify call failed and no usable cache available."""


# ─── Circuit breaker (evita burn de ACU si Apify rechaza repetidamente) ──────
from sub_agents.resilience import CircuitBreaker  # noqa: E402

_apify_cb = CircuitBreaker("apify_trends", failure_threshold=3, recovery_seconds=900)


# ─── Helpers ──────────────────────────────────────────────────────────────────
def _now() -> datetime:
    return datetime.now(timezone.utc)


def _normalize(query: str) -> str:
    return (query or "").strip().lower()[:120]


def _build_cache_key(query: str, geo: str, timeframe: str) -> str:
    raw = f"{_normalize(query)}|{geo or DEFAULT_GEO}|{timeframe or DEFAULT_TIMEFRAME}"
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()


def _ensure_utc(dt: Any) -> Optional[datetime]:
    """MongoDB stored datetimes vienen tz-naive desde Motor por default.
    Re-aplica tz=UTC para comparaciones con `_now()`."""
    if not isinstance(dt, datetime):
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _serialize_doc(doc: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(doc)
    out.pop("_id", None)
    for k in ("cached_at", "expires_at", "last_hit_at"):
        v = out.get(k)
        if isinstance(v, datetime):
            out[k] = v.isoformat()
    return out


# ─── Apify Actor call ─────────────────────────────────────────────────────────
def _build_actor_input(
    query: str, geo: str, timeframe: str, category: Optional[str],
) -> Dict[str, Any]:
    """Construye el input adecuado según el actor configurado.

    - data_xplorer/google-trends-fast-scraper (default, pytrends-based, FAST)
    - apify/google-trends-scraper / emastra/google-trends-scraper (Puppeteer-based, SLOW)
    """
    geo_iso = _coerce_geo(geo)
    tf = _coerce_timeframe(timeframe)
    actor = APIFY_ACTOR.lower()

    if "data_xplorer" in actor or "fast-scraper" in actor:
        # pytrends-based: schema con `keyword` (singular) + predefinedTimeframe
        return {
            "keyword": query,
            "predefinedTimeframe": tf or DEFAULT_TIMEFRAME,
            "geo": geo_iso,
            "fetchRegionalData": True,
            "proxyConfiguration": {"useApifyProxy": True},
        }

    # Puppeteer-based default (apify/* y emastra/*)
    inp: Dict[str, Any] = {
        "searchTerms": [query],
        "geo": geo_iso,
        "timeRange": tf,
        "maxItems": 1,
        "proxyConfiguration": {
            "useApifyProxy": True,
            "apifyProxyGroups": ["BUYPROXIES94952"],
        },
    }
    if category:
        inp["category"] = category
    return inp


async def _call_apify_actor(
    query: str,
    geo: str,
    timeframe: str,
    category: Optional[str] = None,
) -> Dict[str, Any]:
    """Llama al Apify Actor y retorna payload normalizado.

    Raises ApifyTrendsError si falla.
    """
    if not APIFY_TOKEN:
        raise ApifyTrendsError("APIFY_TOKEN no configurado")

    # Circuit breaker: si Apify ha fallado 3 veces en 15min, no quemamos más ACU
    if _apify_cb.is_open():
        raise ApifyTrendsError("Apify circuit breaker abierto (fallas consecutivas)")

    try:
        from apify_client import ApifyClientAsync
    except ImportError as e:
        raise ApifyTrendsError(f"apify-client no disponible: {e}")

    # Adapter por actor — distintos actores tienen schemas distintos
    actor_input = _build_actor_input(query, geo, timeframe, category)

    client = ApifyClientAsync(token=APIFY_TOKEN)
    t0 = time.monotonic()
    try:
        run = await asyncio.wait_for(
            client.actor(APIFY_ACTOR).call(
                run_input=actor_input,
                memory_mbytes=APIFY_MEMORY_MB,
                timeout_secs=APIFY_TIMEOUT_SECS,
            ),
            timeout=APIFY_TIMEOUT_SECS + 10,
        )
    except asyncio.TimeoutError as e:
        _apify_cb.record_failure()
        raise ApifyTrendsError(f"Apify timeout ({APIFY_TIMEOUT_SECS}s)") from e
    except Exception as e:  # noqa: BLE001
        _apify_cb.record_failure()
        raise ApifyTrendsError(f"Apify actor.call falló: {e}") from e
    finally:
        try:
            # apify-client no expone close en todas las versiones; best-effort
            close_fn = getattr(client, "close", None)
            if callable(close_fn):
                maybe = close_fn()
                if asyncio.iscoroutine(maybe):
                    await maybe
        except Exception:
            pass

    if not run or not run.get("defaultDatasetId"):
        _apify_cb.record_failure()
        raise ApifyTrendsError("Apify run sin defaultDatasetId")
    run_status = (run.get("status") or "").upper()
    if run_status not in {"SUCCEEDED", "READY"}:
        _apify_cb.record_failure()
        raise ApifyTrendsError(f"Apify run status={run_status} (no SUCCEEDED)")

    try:
        items = await client.dataset(run["defaultDatasetId"]).list_items()
        raw_items: List[Dict[str, Any]] = list(getattr(items, "items", []) or [])
    except Exception as e:  # noqa: BLE001
        _apify_cb.record_failure()
        raise ApifyTrendsError(f"Apify dataset.list_items falló: {e}") from e

    latency_ms = int((time.monotonic() - t0) * 1000)
    payload = _normalize_actor_output(raw_items, query, geo, timeframe)
    payload["latency_ms"] = latency_ms
    payload["actor"] = APIFY_ACTOR
    payload["run_id"] = run.get("id")
    _apify_cb.record_success()
    return payload


def _normalize_actor_output(
    items: List[Dict[str, Any]], query: str, geo: str, timeframe: str,
) -> Dict[str, Any]:
    """Normaliza output de cualquier actor soportado a un shape estable.

    Soporta:
    - data_xplorer/google-trends-fast-scraper: {keyword, timeline_data: {date:value}, region_data:[{name,value}]}
    - apify/google-trends-scraper / emastra/...: {searchTerm, interestOverTime:[...], interestByRegion:[...], relatedQueries, relatedTopics}
    """
    empty = {
        "query": query, "geo": geo, "timeframe": timeframe,
        "interest_over_time": [], "interest_by_region": [],
        "related_queries_top": [], "related_queries_rising": [],
        "related_topics_top": [], "related_topics_rising": [],
        "average_interest": None, "peak_interest": None,
        "trend_direction": "flat",
    }
    if not items:
        return empty

    it = items[0] or {}

    # Detect schema A: data_xplorer (pytrends-style)
    if "timeline_data" in it or "region_data" in it:
        timeline = it.get("timeline_data") or {}
        iot_norm = []
        if isinstance(timeline, dict):
            for k, v in timeline.items():
                try:
                    iot_norm.append({"time": str(k), "value": int(v)})
                except (ValueError, TypeError):
                    continue
        elif isinstance(timeline, list):
            for p in timeline:
                if not isinstance(p, dict):
                    continue
                try:
                    iot_norm.append({
                        "time": str(p.get("date") or p.get("time") or ""),
                        "value": int(p.get("value") or p.get("interest") or 0),
                    })
                except (ValueError, TypeError):
                    continue
        iot_norm = iot_norm[-80:]  # cap

        region = it.get("region_data") or it.get("regionData") or []
        region_norm = []
        for r in region[:30]:
            if not isinstance(r, dict):
                continue
            try:
                region_norm.append({
                    "name": str(r.get("name") or r.get("geoName") or "?"),
                    "value": int(r.get("value") or 0),
                })
            except (ValueError, TypeError):
                continue

        rq = it.get("related_queries") or it.get("relatedQueries") or {}
        rt = it.get("related_topics") or it.get("relatedTopics") or {}

    else:
        # Schema B: Puppeteer-style (interestOverTime, interestByRegion, relatedQueries, relatedTopics)
        iot = it.get("interestOverTime") or []
        iot_norm = []
        for p in iot[:80]:
            try:
                iot_norm.append({
                    "time": p.get("formattedTime") or p.get("time"),
                    "value": int(p.get("value") or 0),
                })
            except (ValueError, TypeError):
                continue

        region = it.get("interestByRegion") or []
        region_norm = []
        for r in region[:30]:
            try:
                region_norm.append({
                    "name": r.get("geoName") or r.get("geoCode") or "?",
                    "value": int(r.get("value") or 0),
                })
            except (ValueError, TypeError):
                continue

        rq = it.get("relatedQueries") or {}
        rt = it.get("relatedTopics") or {}

    def _slim(rows: Any, key: str = "query", limit: int = 10) -> List[Dict[str, Any]]:
        out = []
        if not rows:
            return out
        if isinstance(rows, dict):
            # data_xplorer puede devolver dict; ignorar
            rows = list(rows.values()) if all(isinstance(v, list) for v in rows.values()) else []
        if not isinstance(rows, list):
            return out
        for r in rows[:limit]:
            if not isinstance(r, dict):
                continue
            label = r.get(key) or r.get("topic_title") or r.get("title") or r.get("query")
            val = r.get("value")
            if not label:
                continue
            out.append({"label": str(label)[:80], "value": int(val) if isinstance(val, (int, float)) else val})
        return out

    values = [p["value"] for p in iot_norm if isinstance(p.get("value"), int)]
    avg_int = round(sum(values) / len(values), 2) if values else None
    peak = max(values) if values else None

    direction = "flat"
    if len(values) >= 4:
        first_third = values[: max(1, len(values) // 3)]
        last_third = values[-max(1, len(values) // 3):]
        a = sum(first_third) / len(first_third)
        b = sum(last_third) / len(last_third)
        if b > a * 1.10:
            direction = "rising"
        elif b < a * 0.90:
            direction = "falling"

    return {
        "query": query,
        "geo": geo,
        "timeframe": timeframe,
        "interest_over_time": iot_norm,
        "interest_by_region": region_norm,
        "related_queries_top": _slim(rq.get("top") if isinstance(rq, dict) else None, "query", 10),
        "related_queries_rising": _slim(rq.get("rising") if isinstance(rq, dict) else None, "query", 10),
        "related_topics_top": _slim(rt.get("top") if isinstance(rt, dict) else None, "topic_title", 10),
        "related_topics_rising": _slim(rt.get("rising") if isinstance(rt, dict) else None, "topic_title", 10),
        "average_interest": avg_int,
        "peak_interest": peak,
        "trend_direction": direction,
    }


# ─── Engine ───────────────────────────────────────────────────────────────────
class ApifyTrendsEngine:
    def __init__(self, db):
        self.db = db

    async def get_trends_for_query(
        self,
        query: str,
        geo: str = DEFAULT_GEO,
        timeframe: str = DEFAULT_TIMEFRAME,
        category: Optional[str] = None,
        force_refresh: bool = False,
        wait_for_result: bool = True,
    ) -> Dict[str, Any]:
        """Punto de entrada único.

        Flujo:
          1. Si cache live (no expirada) y no force_refresh → cache hit.
          2. Si wait_for_result=True → llama Apify Actor sincrónico (puede tardar 1-3min).
          3. Si wait_for_result=False (Atlax LLM tool) → fire-and-forget refresh en background
             y devuelve cache stale o heurística para no bloquear el chat.
          4. Si Apify falla → cache stale → si tampoco, heuristic vacío.
        """
        query = (query or "").strip()
        if not query:
            raise ValueError("query requerida")
        geo = geo or DEFAULT_GEO
        timeframe = timeframe or DEFAULT_TIMEFRAME

        cache_key = _build_cache_key(query, geo, timeframe)
        now = _now()

        # 1) Cache live
        if not force_refresh:
            doc = await self.db.trends_cache.find_one({"cache_key": cache_key})
            if doc:
                expires_at = _ensure_utc(doc.get("expires_at"))
                if expires_at and expires_at > now:
                    await self.db.trends_cache.update_one(
                        {"cache_key": cache_key},
                        {"$inc": {"hit_count": 1}, "$set": {"last_hit_at": now}},
                    )
                    cached_at = _ensure_utc(doc.get("cached_at"))
                    return {
                        **doc.get("response", {}),
                        "cache_status": "hit",
                        "source": doc.get("source", "apify"),
                        "cached_at": cached_at.isoformat() if cached_at else None,
                        "expires_at": expires_at.isoformat() if expires_at else None,
                    }

        # 2/3) Wait sync vs background
        if not wait_for_result:
            # Fire-and-forget — devolvemos lo mejor que tenemos AHORA
            asyncio.create_task(self._background_refresh(cache_key, query, geo, timeframe, category))
            stale = await self.db.trends_cache.find_one({"cache_key": cache_key})
            if stale:
                cached_at = _ensure_utc(stale.get("cached_at"))
                expires_at = _ensure_utc(stale.get("expires_at"))
                return {
                    **stale.get("response", {}),
                    "cache_status": "stale_refreshing",
                    "source": stale.get("source", "apify"),
                    "cached_at": cached_at.isoformat() if cached_at else None,
                    "expires_at": expires_at.isoformat() if expires_at else None,
                }
            heuristic_payload = _normalize_actor_output([], query, geo, timeframe)
            return {
                **heuristic_payload,
                "cache_status": "miss_refreshing_background",
                "source": "heuristic",
                "cached_at": None,
                "expires_at": None,
            }

        # 2) Apify sync call
        try:
            payload = await _call_apify_actor(query, geo, timeframe, category)
            source = "apify"
            await self._persist_cache(cache_key, query, geo, timeframe, category, payload, source)
            return {
                **payload,
                "cache_status": "miss_refreshed",
                "source": source,
                "cached_at": now.isoformat(),
                "expires_at": (now + timedelta(days=CACHE_TTL_DAYS)).isoformat(),
            }
        except ApifyTrendsError as e:
            log.warning(f"[apify_trends] apify failed for query={query!r}: {e}")

            # 3a) Cache stale
            stale = await self.db.trends_cache.find_one({"cache_key": cache_key})
            if stale:
                cached_at = _ensure_utc(stale.get("cached_at"))
                expires_at = _ensure_utc(stale.get("expires_at"))
                return {
                    **stale.get("response", {}),
                    "cache_status": "stale_apify_error",
                    "source": stale.get("source", "apify"),
                    "error": str(e),
                    "cached_at": cached_at.isoformat() if cached_at else None,
                    "expires_at": expires_at.isoformat() if expires_at else None,
                }

            # 3b) Heurística vacía
            heuristic_payload = _normalize_actor_output([], query, geo, timeframe)
            return {
                **heuristic_payload,
                "cache_status": "miss_no_cache",
                "source": "heuristic",
                "error": str(e),
                "cached_at": None,
                "expires_at": None,
            }

    async def _background_refresh(
        self, cache_key: str, query: str, geo: str, timeframe: str, category: Optional[str],
    ) -> None:
        """Background refresh — best-effort, no propaga excepciones."""
        try:
            payload = await _call_apify_actor(query, geo, timeframe, category)
            await self._persist_cache(cache_key, query, geo, timeframe, category, payload, "apify")
            log.info(f"[apify_trends] bg refresh OK key={cache_key[:8]} q={query!r}")
        except Exception as e:  # noqa: BLE001
            log.warning(f"[apify_trends] bg refresh failed key={cache_key[:8]} q={query!r}: {e}")

    async def _persist_cache(
        self, cache_key: str, query: str, geo: str, timeframe: str,
        category: Optional[str], payload: Dict[str, Any], source: str,
    ) -> None:
        now = _now()
        expires = now + timedelta(days=CACHE_TTL_DAYS)
        await self.db.trends_cache.update_one(
            {"cache_key": cache_key},
            {
                "$set": {
                    "cache_key": cache_key,
                    "query": _normalize(query),
                    "geo": geo,
                    "timeframe": timeframe,
                    "category": category,
                    "response": payload,
                    "source": source,
                    "cached_at": now,
                    "expires_at": expires,
                    "last_hit_at": now,
                },
                "$setOnInsert": {"created_at": now, "hit_count": 0},
            },
            upsert=True,
        )

    async def cache_stats(self) -> Dict[str, Any]:
        now = _now()
        total = await self.db.trends_cache.count_documents({})
        live = await self.db.trends_cache.count_documents({"expires_at": {"$gt": now}})
        stale = total - live
        sources_pipeline = [
            {"$group": {"_id": "$source", "count": {"$sum": 1}, "hits": {"$sum": "$hit_count"}}},
            {"$sort": {"count": -1}},
        ]
        sources = []
        async for s in self.db.trends_cache.aggregate(sources_pipeline):
            sources.append({"source": s.get("_id") or "?", "count": s["count"], "hits": s["hits"]})

        top_pipeline = [
            {"$sort": {"hit_count": -1, "cached_at": -1}},
            {"$limit": 10},
            {"$project": {"_id": 0, "cache_key": 1, "query": 1, "geo": 1, "timeframe": 1,
                          "source": 1, "hit_count": 1, "cached_at": 1, "expires_at": 1}},
        ]
        top = []
        async for t in self.db.trends_cache.aggregate(top_pipeline):
            for k in ("cached_at", "expires_at"):
                if isinstance(t.get(k), datetime):
                    t[k] = t[k].isoformat()
            top.append(t)

        return {
            "total_entries": total,
            "live_entries": live,
            "stale_entries": stale,
            "ttl_days": CACHE_TTL_DAYS,
            "actor": APIFY_ACTOR,
            "by_source": sources,
            "top_queries": top,
        }

    async def list_recent(self, limit: int = 50) -> List[Dict[str, Any]]:
        cur = self.db.trends_cache.find(
            {}, {"_id": 0, "response.interest_over_time": 0, "response.interest_by_region": 0,
                 "response.related_queries_top": 0, "response.related_queries_rising": 0,
                 "response.related_topics_top": 0, "response.related_topics_rising": 0},
        ).sort("cached_at", -1).limit(int(limit))
        rows: List[Dict[str, Any]] = []
        async for d in cur:
            for k in ("cached_at", "expires_at", "last_hit_at"):
                if isinstance(d.get(k), datetime):
                    d[k] = d[k].isoformat()
            rows.append(d)
        return rows

    async def invalidate(self, cache_key: str) -> bool:
        res = await self.db.trends_cache.delete_one({"cache_key": cache_key})
        return res.deleted_count > 0


# ─── Cron jobs ────────────────────────────────────────────────────────────────
async def run_trends_daily_refresh(db) -> Dict[str, Any]:
    """Refresca CURATED_HOT_KEYWORDS forzando bypass de cache.
    Falla suave por keyword (no aborta el batch)."""
    engine = ApifyTrendsEngine(db)
    refreshed: List[str] = []
    failed: List[Dict[str, Any]] = []
    for kw in CURATED_HOT_KEYWORDS:
        try:
            r = await engine.get_trends_for_query(kw, DEFAULT_GEO, DEFAULT_TIMEFRAME, force_refresh=True)
            if r.get("source") == "apify":
                refreshed.append(kw)
            else:
                failed.append({"keyword": kw, "source": r.get("source"), "error": r.get("error")})
        except Exception as e:  # noqa: BLE001
            failed.append({"keyword": kw, "error": str(e)})
    log.info(f"[apify_trends] daily_refresh ok={len(refreshed)} failed={len(failed)}")
    return {"job": "trends_daily_refresh", "refreshed": refreshed, "failed": failed,
            "ts": _now().isoformat()}


async def run_trends_weekly_refresh(db) -> Dict[str, Any]:
    """Refresca CURATED_WEEKLY_KEYWORDS (zonas + intents long-tail)."""
    engine = ApifyTrendsEngine(db)
    refreshed: List[str] = []
    failed: List[Dict[str, Any]] = []
    for kw in CURATED_WEEKLY_KEYWORDS:
        try:
            r = await engine.get_trends_for_query(kw, DEFAULT_GEO, DEFAULT_TIMEFRAME, force_refresh=True)
            if r.get("source") == "apify":
                refreshed.append(kw)
            else:
                failed.append({"keyword": kw, "source": r.get("source"), "error": r.get("error")})
        except Exception as e:  # noqa: BLE001
            failed.append({"keyword": kw, "error": str(e)})
    log.info(f"[apify_trends] weekly_refresh ok={len(refreshed)} failed={len(failed)}")
    return {"job": "trends_weekly_refresh", "refreshed": refreshed, "failed": failed,
            "ts": _now().isoformat()}


# ─── Indexes ──────────────────────────────────────────────────────────────────
async def ensure_trends_indexes(db) -> None:
    try:
        await db.trends_cache.create_index("cache_key", unique=True, name="idx_trends_cache_key_unique", background=True)
        # MongoDB TTL index — purga automáticamente docs expirados
        await db.trends_cache.create_index("expires_at", expireAfterSeconds=0, name="idx_trends_ttl", background=True)
        await db.trends_cache.create_index([("query", 1), ("geo", 1), ("timeframe", 1)], name="idx_trends_qgt", background=True)
        await db.trends_cache.create_index([("cached_at", -1)], name="idx_trends_cached_at", background=True)
        log.info("[apify_trends] indexes OK")
    except Exception as exc:
        log.warning(f"[apify_trends] ensure_indexes failed: {exc}")
