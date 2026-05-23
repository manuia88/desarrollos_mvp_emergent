"""W6.MOV.4 · Marketing Distribution MCP Engine.

Adapter unificado para publicación de contenido marketing a 4 platforms:
    1. Twitter/X        (free API · X_BEARER_TOKEN)
    2. LinkedIn         (Marketing API · LINKEDIN_OAUTH)
    3. Telegram Bot     (Bot API · TG_BOT_TOKEN + TG_CHAT_ID)
    4. Discord webhook  (DISCORD_WEBHOOK_URL)

Stub-aware:
  - Sin keys → status="skipped" · resto continúa (FAIL-OPEN partial_success).

Cache 24h por (platform, content_hash) en `marketing_mcp_cache`:
  - Evita re-publicar mismo contenido a la misma platform.

Rate-limits soft (in-memory contador por process · usar Redis en prod):
  - Twitter:  1500/día
  - LinkedIn: 100/día
  - Telegram: 30/sec
  - Discord:  5/sec

Schedule:
  - schedule_publish(content, scheduled_at, platforms) → guarda en marketing_mcp_scheduled
  - cron/worker externo debe leer y disparar a tiempo (no incluido aquí).

Audit:
  - Toda publish y delete loggea vía audit_immutable_engine.log.

NO LLM · 100% deterministic adapter layer.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

import httpx

log = logging.getLogger("dmx.marketing_mcp_engine")

CACHE_TTL_HOURS = 24
ENGINE_VERSION = "1.0.0"

VALID_PLATFORMS = {"twitter", "linkedin", "telegram", "discord"}

RATE_LIMITS = {
    "twitter": {"window_sec": 86400, "max": 1500},
    "linkedin": {"window_sec": 86400, "max": 100},
    "telegram": {"window_sec": 1, "max": 30},
    "discord": {"window_sec": 1, "max": 5},
}

# In-memory counters (process-local). Tuple: (window_start_epoch, count).
_rate_state: Dict[str, Tuple[float, int]] = {}


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _now() -> datetime:
    return datetime.now(timezone.utc)


def _uid() -> str:
    return f"mmcp_{secrets.token_urlsafe(10)}"


def _content_hash(content: Dict[str, Any]) -> str:
    raw = json.dumps(content, sort_keys=True, default=str, ensure_ascii=False)
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def _check_rate_limit(platform: str) -> bool:
    cfg = RATE_LIMITS.get(platform)
    if not cfg:
        return True
    now_ts = _now().timestamp()
    win_start, count = _rate_state.get(platform, (now_ts, 0))
    if now_ts - win_start > cfg["window_sec"]:
        _rate_state[platform] = (now_ts, 1)
        return True
    if count >= cfg["max"]:
        return False
    _rate_state[platform] = (win_start, count + 1)
    return True


def _normalize_platforms(platforms: Optional[List[str]]) -> List[str]:
    if not platforms:
        return sorted(VALID_PLATFORMS)
    return [p for p in platforms if p in VALID_PLATFORMS]


# ─── Adapters ─────────────────────────────────────────────────────────────────

class _BaseAdapter:
    name = "base"
    env_keys: Tuple[str, ...] = ()

    @classmethod
    def configured(cls) -> bool:
        return all(os.environ.get(k) for k in cls.env_keys)

    @classmethod
    async def publish(cls, content: Dict[str, Any]) -> Dict[str, Any]:
        raise NotImplementedError


class TwitterAdapter(_BaseAdapter):
    name = "twitter"
    env_keys = ("X_BEARER_TOKEN",)

    @classmethod
    async def publish(cls, content: Dict[str, Any]) -> Dict[str, Any]:
        token = os.environ.get("X_BEARER_TOKEN", "")
        text = (content.get("text") or "")[:280]
        try:
            async with httpx.AsyncClient(timeout=10.0) as c:
                r = await c.post(
                    "https://api.twitter.com/2/tweets",
                    json={"text": text},
                    headers={"Authorization": f"Bearer {token}"},
                )
            if r.status_code in (200, 201):
                data = r.json().get("data") or {}
                tid = data.get("id")
                return {"status": "ok", "url": f"https://x.com/i/web/status/{tid}" if tid else None, "id": tid}
            return {"status": "error", "error": f"http_{r.status_code}", "detail": r.text[:200]}
        except Exception as exc:
            return {"status": "error", "error": "exception", "detail": str(exc)[:200]}


class LinkedInAdapter(_BaseAdapter):
    name = "linkedin"
    env_keys = ("LINKEDIN_OAUTH", "LINKEDIN_AUTHOR_URN")

    @classmethod
    async def publish(cls, content: Dict[str, Any]) -> Dict[str, Any]:
        token = os.environ.get("LINKEDIN_OAUTH", "")
        author = os.environ.get("LINKEDIN_AUTHOR_URN", "")
        text = content.get("text") or ""
        payload = {
            "author": author,
            "lifecycleState": "PUBLISHED",
            "specificContent": {
                "com.linkedin.ugc.ShareContent": {
                    "shareCommentary": {"text": text},
                    "shareMediaCategory": "NONE",
                }
            },
            "visibility": {"com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"},
        }
        try:
            async with httpx.AsyncClient(timeout=10.0) as c:
                r = await c.post(
                    "https://api.linkedin.com/v2/ugcPosts",
                    json=payload,
                    headers={
                        "Authorization": f"Bearer {token}",
                        "X-Restli-Protocol-Version": "2.0.0",
                    },
                )
            if r.status_code in (200, 201):
                pid = (r.json() or {}).get("id") or r.headers.get("x-restli-id")
                return {"status": "ok", "url": f"https://www.linkedin.com/feed/update/{pid}" if pid else None, "id": pid}
            return {"status": "error", "error": f"http_{r.status_code}", "detail": r.text[:200]}
        except Exception as exc:
            return {"status": "error", "error": "exception", "detail": str(exc)[:200]}


class TelegramAdapter(_BaseAdapter):
    name = "telegram"
    env_keys = ("TG_BOT_TOKEN", "TG_CHAT_ID")

    @classmethod
    async def publish(cls, content: Dict[str, Any]) -> Dict[str, Any]:
        token = os.environ.get("TG_BOT_TOKEN", "")
        chat_id = os.environ.get("TG_CHAT_ID", "")
        text = content.get("text") or ""
        try:
            async with httpx.AsyncClient(timeout=10.0) as c:
                r = await c.post(
                    f"https://api.telegram.org/bot{token}/sendMessage",
                    json={"chat_id": chat_id, "text": text, "parse_mode": "HTML"},
                )
            if r.status_code == 200 and (r.json() or {}).get("ok"):
                msg = (r.json() or {}).get("result", {})
                mid = msg.get("message_id")
                return {"status": "ok", "url": None, "id": str(mid) if mid else None}
            return {"status": "error", "error": f"http_{r.status_code}", "detail": r.text[:200]}
        except Exception as exc:
            return {"status": "error", "error": "exception", "detail": str(exc)[:200]}


class DiscordAdapter(_BaseAdapter):
    name = "discord"
    env_keys = ("DISCORD_WEBHOOK_URL",)

    @classmethod
    async def publish(cls, content: Dict[str, Any]) -> Dict[str, Any]:
        url = os.environ.get("DISCORD_WEBHOOK_URL", "")
        text = content.get("text") or ""
        try:
            async with httpx.AsyncClient(timeout=10.0) as c:
                r = await c.post(url, json={"content": text})
            if r.status_code in (200, 204):
                return {"status": "ok", "url": None, "id": None}
            return {"status": "error", "error": f"http_{r.status_code}", "detail": r.text[:200]}
        except Exception as exc:
            return {"status": "error", "error": "exception", "detail": str(exc)[:200]}


ADAPTERS: Dict[str, type] = {
    "twitter": TwitterAdapter,
    "linkedin": LinkedInAdapter,
    "telegram": TelegramAdapter,
    "discord": DiscordAdapter,
}


def adapter_status() -> Dict[str, Dict[str, Any]]:
    out: Dict[str, Dict[str, Any]] = {}
    for name, cls in ADAPTERS.items():
        out[name] = {
            "configured": cls.configured(),
            "env_keys": list(cls.env_keys),
            "rate_limit": RATE_LIMITS.get(name, {}),
        }
    return out


# ─── Public API ───────────────────────────────────────────────────────────────

async def publish(
    db,
    content: Dict[str, Any],
    target_platforms: Optional[List[str]] = None,
    actor: Optional[Dict[str, Any]] = None,
    use_cache: bool = True,
) -> Dict[str, Any]:
    """Publica content a las platforms indicadas (default: todas).

    Retorna {success_per_platform: {p: {status,url,...}}, urls: [...], cache_hits: [...]}.
    """
    platforms = _normalize_platforms(target_platforms)
    chash = _content_hash(content)
    results: Dict[str, Dict[str, Any]] = {}
    urls: List[str] = []
    cache_hits: List[str] = []

    for p in platforms:
        cls = ADAPTERS[p]
        if not cls.configured():
            results[p] = {"status": "skipped", "reason": "no_credentials"}
            continue

        if use_cache:
            cached = await _get_cache(db, p, chash)
            if cached:
                results[p] = {"status": "cached", "url": cached.get("url"), "id": cached.get("id")}
                cache_hits.append(p)
                if cached.get("url"):
                    urls.append(cached["url"])
                continue

        if not _check_rate_limit(p):
            results[p] = {"status": "error", "error": "rate_limited"}
            continue

        out = await cls.publish(content)
        results[p] = out
        if out.get("status") == "ok":
            if out.get("url"):
                urls.append(out["url"])
            await _set_cache(db, p, chash, out)

    record_id = await _record_publish(db, content, platforms, results, actor)

    try:
        import audit_immutable_engine
        await audit_immutable_engine.log(
            db, actor or {"user_id": "system", "role": "system"},
            "marketing_mcp.publish", "marketing_mcp", record_id,
            before=None, after={"platforms": platforms, "results": results, "content_hash": chash},
        )
    except Exception as exc:
        log.warning(f"audit publish skipped: {exc}")

    return {
        "record_id": record_id,
        "content_hash": chash,
        "success_per_platform": results,
        "urls": urls,
        "cache_hits": cache_hits,
    }


async def schedule_publish(
    db,
    content: Dict[str, Any],
    scheduled_at: datetime,
    platforms: Optional[List[str]] = None,
    actor: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    plats = _normalize_platforms(platforms)
    sid = _uid()
    doc = {
        "scheduled_id": sid,
        "content": content,
        "platforms": plats,
        "scheduled_at": scheduled_at.isoformat() if isinstance(scheduled_at, datetime) else scheduled_at,
        "status": "pending",
        "created_at": _now().isoformat(),
        "created_by": (actor or {}).get("user_id", "system"),
    }
    try:
        await db.marketing_mcp_scheduled.insert_one(dict(doc))
    except Exception as exc:
        log.warning(f"schedule insert failed: {exc}")
    doc.pop("_id", None)
    return doc


async def cancel_scheduled(db, scheduled_id: str, actor: Optional[Dict[str, Any]] = None) -> bool:
    res = await db.marketing_mcp_scheduled.update_one(
        {"scheduled_id": scheduled_id, "status": "pending"},
        {"$set": {"status": "cancelled", "cancelled_at": _now().isoformat()}},
    )
    if res.modified_count:
        try:
            import audit_immutable_engine
            await audit_immutable_engine.log(
                db, actor or {"user_id": "system", "role": "system"},
                "marketing_mcp.cancel_scheduled", "marketing_mcp_scheduled", scheduled_id,
                before=None, after={"cancelled_at": _now().isoformat()},
            )
        except Exception as exc:
            log.warning(f"audit cancel skipped: {exc}")
        return True
    return False


async def get_history(db, days: int = 30, limit: int = 50) -> List[Dict[str, Any]]:
    cutoff = _now() - timedelta(days=days)
    out: List[Dict[str, Any]] = []
    cursor = db.marketing_mcp_log.find(
        {"created_at": {"$gte": cutoff.isoformat()}}, {"_id": 0},
    ).sort("created_at", -1).limit(limit)
    async for d in cursor:
        out.append(d)
    return out


async def get_stats(db) -> Dict[str, Any]:
    total = 0
    by_platform: Dict[str, Dict[str, int]] = {p: {"ok": 0, "error": 0, "skipped": 0, "cached": 0} for p in VALID_PLATFORMS}
    scheduled_pending = 0
    cache_entries = 0
    try:
        cursor = db.marketing_mcp_log.find({}, {"_id": 0})
        async for d in cursor:
            total += 1
            for p, r in (d.get("results") or {}).items():
                st = (r or {}).get("status") or "error"
                if p in by_platform:
                    by_platform[p][st] = by_platform[p].get(st, 0) + 1
    except Exception as exc:
        log.warning(f"stats log scan failed: {exc}")
    try:
        scheduled_pending = await db.marketing_mcp_scheduled.count_documents({"status": "pending"})
    except Exception:
        pass
    try:
        cache_entries = await db.marketing_mcp_cache.count_documents({})
    except Exception:
        pass
    return {
        "total_publishes": total,
        "by_platform": by_platform,
        "scheduled_pending": scheduled_pending,
        "cache_entries": cache_entries,
        "adapters": adapter_status(),
        "version": ENGINE_VERSION,
    }


# ─── Internals ────────────────────────────────────────────────────────────────

async def _get_cache(db, platform: str, chash: str) -> Optional[Dict[str, Any]]:
    try:
        doc = await db.marketing_mcp_cache.find_one(
            {"platform": platform, "content_hash": chash}, {"_id": 0},
        )
        if not doc:
            return None
        exp = doc.get("expires_at")
        if exp and exp < _now().isoformat():
            return None
        return doc
    except Exception:
        return None


async def _set_cache(db, platform: str, chash: str, out: Dict[str, Any]) -> None:
    expires_at = (_now() + timedelta(hours=CACHE_TTL_HOURS)).isoformat()
    doc = {
        "platform": platform,
        "content_hash": chash,
        "url": out.get("url"),
        "id": out.get("id"),
        "created_at": _now().isoformat(),
        "expires_at": expires_at,
    }
    try:
        await db.marketing_mcp_cache.update_one(
            {"platform": platform, "content_hash": chash},
            {"$set": doc}, upsert=True,
        )
    except Exception as exc:
        log.warning(f"cache set failed: {exc}")


async def _record_publish(db, content, platforms, results, actor) -> str:
    rid = _uid()
    doc = {
        "record_id": rid,
        "content": content,
        "platforms": platforms,
        "results": results,
        "created_at": _now().isoformat(),
        "created_by": (actor or {}).get("user_id", "system"),
    }
    try:
        await db.marketing_mcp_log.insert_one(dict(doc))
    except Exception as exc:
        log.warning(f"record insert failed: {exc}")
    return rid


async def ensure_indexes(db) -> None:
    try:
        await db.marketing_mcp_log.create_index("record_id", unique=True)
        await db.marketing_mcp_log.create_index([("created_at", -1)])
        await db.marketing_mcp_cache.create_index(
            [("platform", 1), ("content_hash", 1)], unique=True,
        )
        await db.marketing_mcp_cache.create_index("expires_at")
        await db.marketing_mcp_scheduled.create_index("scheduled_id", unique=True)
        await db.marketing_mcp_scheduled.create_index([("status", 1), ("scheduled_at", 1)])
    except Exception as exc:
        log.warning(f"ensure_indexes warning: {exc}")
