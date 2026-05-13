"""Tenant → Developer mapping helper (centralized).

W4.1C++ tech-debt fix · 2026-05-13 · consolida 4 hardcoded copies de TENANT_DEV_MAP
que vivían en routes_documents · routes_recommendations · routes_diagnostic ·
routes_comparable_alerts.

Política de resolución (priority order):
1. Look up `developer_organizations` collection (field `allowed_dev_ids`)
2. Fallback a hardcoded legacy (backward compat con producción actual)
3. Si nada match → return None (caller decide cómo gatear · típicamente 403)

Valores especiales:
- `"*"` (str) → tenant es superadmin · ve TODO sin filtro
- `List[str]` → tenant ve solo esos developer_ids
- `None` → tenant no registrado · no tiene acceso

Cache in-memory 5 min para evitar querear Mongo cada request.

Uso:
    from tenant_dev_map import get_allowed_dev_ids
    allowed = await get_allowed_dev_ids(db, user.tenant_id)
    if allowed == "*":
        return all_devs
    if isinstance(allowed, list):
        return [d for d in all_devs if d["developer_id"] in allowed]
    raise HTTPException(403, "tenant no autorizado")
"""
from __future__ import annotations

import time
import logging
from typing import Optional, Union, List, Dict, Any

log = logging.getLogger("dmx.tenant_dev_map")


# ─── Fallback hardcoded · backward compat con producción 2026-05-13 ─────────
#
# Cualquier tenant_id que viva aquí queda funcionando idéntico aunque la
# collection `developer_organizations` esté vacía. Cuando founder seed la
# collection con datos · este fallback queda como red de seguridad.

_LEGACY_FALLBACK: Dict[str, Union[str, List[str]]] = {
    "dmx": "*",  # superadmin · ve todo
    "constructora_ariel": ["quattro", "habitare-capital", "agora-urbana"],  # demo
}


# ─── In-memory cache · 5 min TTL ─────────────────────────────────────────────

_CACHE_TTL_SEC = 5 * 60  # 5 minutos
_cache: Dict[str, tuple] = {}  # {tenant_id: (value, fetched_at_epoch)}


def _cache_get(tenant_id: str) -> Optional[Union[str, List[str], object]]:
    """Devuelve valor cacheado si fresh · None si stale o ausente."""
    entry = _cache.get(tenant_id)
    if not entry:
        return None
    value, ts = entry
    if (time.time() - ts) > _CACHE_TTL_SEC:
        return None
    return value


def _cache_set(tenant_id: str, value: Union[str, List[str], None]) -> None:
    _cache[tenant_id] = (value, time.time())


def invalidate_cache(tenant_id: Optional[str] = None) -> None:
    """Borra cache · útil después de migration o updates manuales.

    Si tenant_id=None → borra TODO. Si tenant_id dado → solo ese.
    """
    if tenant_id is None:
        _cache.clear()
        log.info("[tenant_dev_map] cache full clear")
    else:
        _cache.pop(tenant_id, None)
        log.info(f"[tenant_dev_map] cache invalidate · {tenant_id}")


# ─── Public API ──────────────────────────────────────────────────────────────


async def get_allowed_dev_ids(
    db: Any, tenant_id: Optional[str]
) -> Optional[Union[str, List[str]]]:
    """Resuelve qué developer_ids puede ver el tenant.

    Args:
        db: Mongo async client (motor) · viene de `request.app.state.db`
        tenant_id: string del tenant · puede ser None/empty

    Returns:
        - `"*"` si tenant es superadmin (ve todo)
        - `List[str]` con developer_ids permitidos
        - `None` si tenant no registrado (caller debe denegar acceso)
    """
    if not tenant_id:
        return None

    # 1. Cache hit
    cached = _cache_get(tenant_id)
    if cached is not None:
        return cached  # type: ignore[return-value]

    # 2. Query Mongo · developer_organizations.allowed_dev_ids
    try:
        doc = await db.developer_organizations.find_one(
            {"tenant_id": tenant_id, "active": {"$ne": False}},
            {"_id": 0, "allowed_dev_ids": 1, "is_superadmin": 1},
        )
        if doc:
            if doc.get("is_superadmin"):
                value: Union[str, List[str]] = "*"
            else:
                allowed = doc.get("allowed_dev_ids")
                if isinstance(allowed, list) and all(isinstance(x, str) for x in allowed):
                    value = allowed
                elif allowed == "*":
                    value = "*"
                else:
                    log.warning(
                        f"[tenant_dev_map] tenant '{tenant_id}' has invalid "
                        f"allowed_dev_ids · falling back to legacy"
                    )
                    value = _LEGACY_FALLBACK.get(tenant_id)  # type: ignore[assignment]
            _cache_set(tenant_id, value)
            return value
    except Exception as e:
        log.warning(f"[tenant_dev_map] Mongo lookup failed for '{tenant_id}': {e}")
        # Fall through al legacy fallback

    # 3. Legacy hardcoded fallback
    value = _LEGACY_FALLBACK.get(tenant_id)
    _cache_set(tenant_id, value)
    return value


def get_allowed_dev_ids_sync(tenant_id: Optional[str]) -> Optional[Union[str, List[str]]]:
    """Synchronous fallback · solo legacy hardcoded · sin Mongo lookup.

    Útil para contextos donde no hay async/db disponible (rare).
    """
    if not tenant_id:
        return None
    return _LEGACY_FALLBACK.get(tenant_id)


# Re-export para callers que quieran inspect/test el fallback
LEGACY_FALLBACK = dict(_LEGACY_FALLBACK)  # frozen-ish copy para evitar mutación accidental
