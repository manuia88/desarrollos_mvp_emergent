"""W2.8 Phase Z.1 — In-process TTL cache for hot cube queries.

NOT Redis. `cachetools.TTLCache` in single backend process.
Trade-off: multi-instance no shared cache — acceptable for single backend
deployment hoy. When scaled horizontally → swap to Redis.
"""
from __future__ import annotations

import hashlib
import json
import logging
from typing import Any, Iterable, Optional

try:
    from cachetools import TTLCache  # type: ignore
    _cache: Any = TTLCache(maxsize=500, ttl=300)  # 500 hot queries, 5min TTL
except Exception:  # pragma: no cover
    _cache = {}  # fallback dict (no eviction)

log = logging.getLogger("dmx.cube_cache")

_HITS = 0
_MISSES = 0


def _key_of(prefix: str, params: dict) -> str:
    """Deterministic key from prefix + params dict."""
    blob = json.dumps(params, sort_keys=True, default=str)
    h = hashlib.sha1(blob.encode()).hexdigest()[:16]
    return f"{prefix}:{h}"


def cache_get(prefix: str, params: dict) -> Optional[Any]:
    global _HITS, _MISSES
    key = _key_of(prefix, params)
    v = _cache.get(key)
    if v is not None:
        _HITS += 1
        return v
    _MISSES += 1
    return None


def cache_set(prefix: str, params: dict, value: Any) -> None:
    key = _key_of(prefix, params)
    try:
        _cache[key] = value
    except Exception as e:
        log.warning(f"[cube_cache] set failed: {e}")


def cache_invalidate_prefix(prefix: str) -> int:
    """Evict all entries whose key starts with `prefix:`. Returns count evicted."""
    if isinstance(_cache, dict):
        keys = list(_cache.keys())
    else:
        try:
            keys = list(_cache.keys())
        except Exception:
            return 0
    n = 0
    for k in keys:
        if k.startswith(prefix + ":"):
            try:
                del _cache[k]
                n += 1
            except Exception:
                pass
    return n


def cache_invalidate_zones(zone_ids: Iterable[str]) -> int:
    """Invalidate every entry — ETL changed underlying data, blow whole cache."""
    n = 0
    try:
        n = len(_cache)
        _cache.clear()
    except Exception:
        pass
    return n


def cache_stats() -> dict:
    return {
        "hits": _HITS,
        "misses": _MISSES,
        "size": len(_cache),
        "maxsize": getattr(_cache, "maxsize", None),
        "ttl": getattr(_cache, "ttl", None),
        "hit_rate": (_HITS / (_HITS + _MISSES)) if (_HITS + _MISSES) else None,
    }
