"""W5.1 Sub-Chunk E — Cache layer LRU en memoria para AVM público.

Cache thread-safe (lock asyncio) con TTL configurable. Reset automático
cuando se promueve un nuevo modelo hedónico (invalidar todo).

Decisión conservadora: TTL 1h, max 512 entries, LRU eviction.
"""
from __future__ import annotations

import asyncio
import logging
import time
from collections import OrderedDict
from typing import Any, Dict, Optional, Tuple

log = logging.getLogger("dmx.avm_cache")

# Config conservadora
_TTL_SECONDS = 3600         # 1h
_MAX_ENTRIES = 512

_lock = asyncio.Lock()
_store: "OrderedDict[str, Tuple[float, Dict[str, Any]]]" = OrderedDict()

_stats = {"hits": 0, "misses": 0, "evictions": 0, "invalidations": 0}


def _make_key(
    colonia_slug: str, m2: float, recamaras: int, banos: int, antiguedad_anos: int,
) -> str:
    # Redondear m2 a 1 decimal para mejorar hit rate sin sacrificar precisión
    return f"{colonia_slug}|{round(float(m2), 1)}|{int(recamaras)}|{int(banos)}|{int(antiguedad_anos)}"


async def get(
    colonia_slug: str, m2: float, recamaras: int, banos: int, antiguedad_anos: int,
) -> Optional[Dict[str, Any]]:
    """Obtener resultado cacheado. None si miss/expirado."""
    key = _make_key(colonia_slug, m2, recamaras, banos, antiguedad_anos)
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


async def set(  # noqa: A003
    colonia_slug: str, m2: float, recamaras: int, banos: int, antiguedad_anos: int,
    payload: Dict[str, Any],
) -> None:
    key = _make_key(colonia_slug, m2, recamaras, banos, antiguedad_anos)
    async with _lock:
        _store[key] = (time.time(), payload)
        _store.move_to_end(key)
        while len(_store) > _MAX_ENTRIES:
            _store.popitem(last=False)
            _stats["evictions"] += 1


async def invalidate_all() -> int:
    """Vaciar cache completo. Devuelve número de entries eliminadas.
    Se invoca al promover un nuevo modelo."""
    async with _lock:
        n = len(_store)
        _store.clear()
        _stats["invalidations"] += 1
        log.info(f"[avm_cache] cache invalidado · entries removidas={n}")
        return n


def stats() -> Dict[str, Any]:
    total = _stats["hits"] + _stats["misses"]
    hit_rate = (_stats["hits"] / total) if total else 0.0
    return {
        "hits": _stats["hits"],
        "misses": _stats["misses"],
        "evictions": _stats["evictions"],
        "invalidations": _stats["invalidations"],
        "hit_rate": round(hit_rate, 4),
        "size": len(_store),
        "max_entries": _MAX_ENTRIES,
        "ttl_seconds": _TTL_SECONDS,
    }
