"""W5.3 Parte 1 Sub-B — LRU cache para respuestas de forecast público.

Mismo patrón que `avm_cache.py`. TTL 6h, max 1024 entries.
"""
from __future__ import annotations

import asyncio
import logging
import time
from collections import OrderedDict
from typing import Any, Dict, Optional, Tuple

log = logging.getLogger("dmx.forecast_cache")

_TTL_SECONDS = 6 * 3600
_MAX_ENTRIES = 1024

_lock = asyncio.Lock()
_store: "OrderedDict[str, Tuple[float, Dict[str, Any]]]" = OrderedDict()

_stats = {"hits": 0, "misses": 0, "evictions": 0, "invalidations": 0}


async def get(key: str) -> Optional[Dict[str, Any]]:
    async with _lock:
        entry = _store.get(key)
        if entry is None:
            _stats["misses"] += 1
            return None
        ts, payload = entry
        if (time.time() - ts) > _TTL_SECONDS:
            _store.pop(key, None)
            _stats["misses"] += 1
            return None
        _store.move_to_end(key)
        _stats["hits"] += 1
        return payload


async def set(key: str, payload: Dict[str, Any]) -> None:  # noqa: A003
    async with _lock:
        _store[key] = (time.time(), payload)
        _store.move_to_end(key)
        while len(_store) > _MAX_ENTRIES:
            _store.popitem(last=False)
            _stats["evictions"] += 1


async def invalidate_all() -> int:
    async with _lock:
        n = len(_store)
        _store.clear()
        _stats["invalidations"] += 1
        log.info(f"[forecast_cache] invalidated · removed={n}")
        return n


def stats() -> Dict[str, Any]:
    total = _stats["hits"] + _stats["misses"]
    return {
        "hits": _stats["hits"],
        "misses": _stats["misses"],
        "evictions": _stats["evictions"],
        "invalidations": _stats["invalidations"],
        "hit_rate": round(_stats["hits"] / total, 4) if total else 0.0,
        "size": len(_store),
        "max_entries": _MAX_ENTRIES,
        "ttl_seconds": _TTL_SECONDS,
    }
