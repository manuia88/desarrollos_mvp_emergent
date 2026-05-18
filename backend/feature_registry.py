"""W5.FF2 Sub-A — Self-registering Feature Catalog.

Auto-discovery pattern: features se registran via decorator @register_feature(...) en
sus propios módulos, sin tocar un catálogo central. Cero refactor para feature N+1.

API:
  register_feature(key, ...) → decorator (idempotente · safe re-registro mismo key)
  get_all_features()         → List[Dict] copia
  get_feature(key)           → Optional[Dict]
  ensure_catalog_synced(db)  → startup hook · upsert a db.feature_catalog

Schema (versión 1):
  {key, name, plan_tier, monthly_price_mxn, requires_features[], category,
   schema_version, registered_at}

Convivencia W2.4 SA5: feature_flags_engine.FEATURE_CATALOG (10 entries legacy)
mantiene autoridad sobre keys que YA están ahí. El registry permite extender
con nuevas features (W4.x/W5.x) sin tocar el legacy.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional

_log = logging.getLogger("dmx.feature_registry")

SCHEMA_VERSION = 1

# Module-scoped registry · keys → feature dict
_REGISTRY: Dict[str, Dict[str, Any]] = {}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def register_feature(
    key: str,
    *,
    plan_tier: str = "free",
    monthly_price_mxn: int = 0,
    requires_features: Optional[List[str]] = None,
    category: str = "general",
    name: Optional[str] = None,
) -> Callable[[Any], Any]:
    """Decorator that registers a feature in the global catalog.

    Idempotent: re-registering the same key updates the entry (last write wins).
    Returns the decorated target untouched (clase / función / módulo dummy).

    Usage:
        @register_feature("battle_card", plan_tier="pro", category="intelligence")
        class BattleCardFeature: pass

        # OR
        @register_feature("foo")
        def _foo_marker(): pass
    """
    if not isinstance(key, str) or not key.strip():
        raise ValueError("register_feature: 'key' must be a non-empty string")

    entry = {
        "key": key,
        "name": name or key.replace("_", " ").title(),
        "plan_tier": plan_tier,
        "monthly_price_mxn": int(monthly_price_mxn) if monthly_price_mxn else 0,
        "requires_features": list(requires_features or []),
        "category": category,
        "schema_version": SCHEMA_VERSION,
        "registered_at": _now_iso(),
    }
    _REGISTRY[key] = entry

    def _decorator(target: Any) -> Any:
        return target

    return _decorator


def get_all_features() -> List[Dict[str, Any]]:
    """Returns a defensive copy of all registered features (sorted by key)."""
    return [dict(v) for _, v in sorted(_REGISTRY.items())]


def get_feature(key: str) -> Optional[Dict[str, Any]]:
    e = _REGISTRY.get(key)
    return dict(e) if e else None


# ─── Startup sync ─────────────────────────────────────────────────────────────
async def ensure_catalog_synced(db) -> Dict[str, int]:
    """Upserts all registered features into db.feature_catalog.

    - schema_version cambió → update existing.
    - new key → insert.
    - Idempotent · safe to call on every startup.
    FAIL-SOFT: cualquier excepción se loggea y retorna {synced:0, new:0, updated:0}.
    """
    new_count = 0
    updated_count = 0
    synced_count = 0

    if db is None:
        _log.warning("[feature_registry] db=None at startup · skip sync")
        return {"synced": 0, "new": 0, "updated": 0}

    try:
        # Index by key (idempotent)
        try:
            await db.feature_catalog.create_index("key", unique=True, background=True)
        except Exception as ex:
            _log.warning(f"[feature_registry] index create non-fatal: {ex}")

        for entry in get_all_features():
            key = entry["key"]
            existing = await db.feature_catalog.find_one({"key": key}, {"_id": 0})
            if existing is None:
                await db.feature_catalog.insert_one(dict(entry))
                new_count += 1
                synced_count += 1
                continue

            # Update si schema_version cambió o algún campo difiere
            ev = existing.get("schema_version", 0)
            should_update = ev != entry["schema_version"] or any(
                existing.get(k) != entry.get(k)
                for k in ("name", "plan_tier", "monthly_price_mxn",
                          "requires_features", "category")
            )
            if should_update:
                await db.feature_catalog.update_one(
                    {"key": key},
                    {"$set": {**entry, "registered_at": existing.get("registered_at", entry["registered_at"])}},
                )
                updated_count += 1
            synced_count += 1

        _log.info(
            f"[feature_registry] sync OK · total={synced_count} new={new_count} updated={updated_count}"
        )
        return {"synced": synced_count, "new": new_count, "updated": updated_count}

    except Exception as exc:
        _log.warning(f"[feature_registry] ensure_catalog_synced failed (non-fatal): {exc}")
        return {"synced": 0, "new": 0, "updated": 0}


# ─── Test/dev helper ──────────────────────────────────────────────────────────
def _clear_registry_for_tests() -> None:
    """Used by unit tests only · NOT for production code."""
    _REGISTRY.clear()
