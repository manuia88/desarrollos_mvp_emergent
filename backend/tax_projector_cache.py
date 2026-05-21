"""W5.x F6 Sub-A · Tax projector cache helpers.

Cache MongoDB para resultados del tax_projector_engine.
Pattern imitado de routes/dev_batch7_2.py · collection `tax_projector_cache`.
TTL 30 dias via campo `expires_at` (consultado en cache_get).
"""
from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

log = logging.getLogger("dmx.tax_projector_cache")

CACHE_TTL_DAYS = 30
COLLECTION = "tax_projector_cache"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def make_cache_key(tipo: str, payload: Dict[str, Any]) -> str:
    """Hash deterministico de la entrada · tipo + payload normalizado."""
    norm = json.dumps(payload, sort_keys=True, default=str)
    h = hashlib.sha256(f"{tipo}|{norm}".encode()).hexdigest()[:24]
    return f"{tipo}:{h}"


async def cache_get(db, key: str) -> Optional[Dict[str, Any]]:
    """Retorna el payload si existe y no expiro · None si miss o stale."""
    try:
        doc = await db[COLLECTION].find_one({"cache_key": key}, {"_id": 0})
        if not doc:
            return None
        exp = doc.get("expires_at")
        if isinstance(exp, str):
            try:
                exp_dt = datetime.fromisoformat(exp.replace("Z", "+00:00"))
            except Exception:
                return None
        else:
            exp_dt = exp
        if exp_dt and exp_dt < _now():
            return None
        return doc.get("payload")
    except Exception as e:  # noqa: BLE001
        log.warning(f"[tax_cache] get failed: {e}")
        return None


async def cache_set(db, key: str, tipo: str, payload: Dict[str, Any], ttl_days: int = CACHE_TTL_DAYS) -> bool:
    """Upsert del documento de cache · fail-soft."""
    try:
        now = _now()
        expires_at = (now + timedelta(days=ttl_days)).isoformat()
        doc = {
            "cache_key": key,
            "tipo": tipo,
            "payload": payload,
            "computed_at": now.isoformat(),
            "expires_at": expires_at,
        }
        await db[COLLECTION].update_one({"cache_key": key}, {"$set": doc}, upsert=True)
        return True
    except Exception as e:  # noqa: BLE001
        log.warning(f"[tax_cache] set failed: {e}")
        return False


async def ensure_indexes(db) -> None:
    """Asegura indexes unique + TTL · llamar en startup (best-effort)."""
    try:
        await db[COLLECTION].create_index("cache_key", unique=True)
        # TTL index sobre expires_at (Mongo NO interpreta string ISO en TTL · usamos query-side check)
        await db[COLLECTION].create_index("computed_at")
    except Exception as e:  # noqa: BLE001
        log.warning(f"[tax_cache] ensure_indexes failed: {e}")
