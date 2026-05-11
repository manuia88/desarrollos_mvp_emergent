"""Wave 2 · Tests feature_flags_engine.py · 14 tests unidad sin DB.

Cubre funciones puras + integridad de catálogos/seeds:
- get_catalog (immutability + completeness)
- get_feature (lookup + miss)
- _is_active (enabled flag + expires_at past/future/invalid)
- cache_get/set/invalidate (TTL + per-tenant + global)
- FEATURE_CATALOG integrity (keys únicos, requires_features refs válidas)
- PLAN_TEMPLATES_SEED integrity (features refs válidas, ids únicos)
- SNAPSHOTS_SEED integrity (feature_keys válidas)
- SNAPSHOT_COMPONENTS constant
"""
import time
from datetime import datetime, timezone, timedelta

import pytest

from feature_flags_engine import (
    FEATURE_CATALOG,
    PLAN_TEMPLATES_SEED,
    SNAPSHOTS_SEED,
    SNAPSHOT_COMPONENTS,
    _BY_KEY,
    _cache,
    _cache_get,
    _cache_set,
    _is_active,
    cache_invalidate,
    get_catalog,
    get_feature,
)

pytestmark = pytest.mark.unit


# ─── get_catalog / get_feature ────────────────────────────────────────────────
def test_get_catalog_returns_copy_not_reference():
    """get_catalog returns deep-copied dicts so caller cannot mutate registry."""
    cat = get_catalog()
    assert len(cat) == len(FEATURE_CATALOG)
    cat[0]["key"] = "MUTATED"
    assert FEATURE_CATALOG[0]["key"] != "MUTATED"


def test_get_catalog_all_entries_have_required_fields():
    """Every catalog entry has key/name/category/default_plan_tier/monthly_price_mxn/requires_features."""
    required = {"key", "name", "category", "default_plan_tier", "monthly_price_mxn", "requires_features"}
    for entry in get_catalog():
        assert required.issubset(entry.keys()), f"missing fields in {entry.get('key')}"


def test_get_feature_known_key():
    """get_feature('demanda') returns the demanda entry."""
    f = get_feature("demanda")
    assert f is not None
    assert f["key"] == "demanda"
    assert f["category"] == "intelligence"


def test_get_feature_unknown_key_returns_none():
    """Unknown feature key returns None."""
    assert get_feature("does_not_exist") is None


# ─── _is_active ──────────────────────────────────────────────────────────────
def test_is_active_disabled_returns_false():
    """Doc with enabled=False is always inactive."""
    assert _is_active({"enabled": False}) is False


def test_is_active_enabled_no_expiry_returns_true():
    """Enabled doc with no expires_at is active."""
    assert _is_active({"enabled": True}) is True


def test_is_active_enabled_future_expiry_returns_true():
    """Enabled doc with future expires_at is active."""
    future = (datetime.now(timezone.utc) + timedelta(days=10)).isoformat()
    assert _is_active({"enabled": True, "expires_at": future}) is True


def test_is_active_enabled_past_expiry_returns_false():
    """Enabled doc with past expires_at is inactive."""
    past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    assert _is_active({"enabled": True, "expires_at": past}) is False


def test_is_active_invalid_expiry_does_not_raise():
    """Garbage expires_at falls through to active (try/except guard)."""
    # exception path: treats as active (enabled=True, parse fail)
    assert _is_active({"enabled": True, "expires_at": "not-a-date"}) is True


# ─── Cache (TTL + invalidation) ──────────────────────────────────────────────
def test_cache_set_and_get_roundtrip():
    """cache_set then cache_get returns same flags map."""
    cache_invalidate()
    flags = {"demanda": {"enabled": True}}
    _cache_set("tenant-x", flags)
    got = _cache_get("tenant-x")
    assert got == flags


def test_cache_miss_returns_none():
    """cache_get for unknown tenant is None."""
    cache_invalidate()
    assert _cache_get("never-cached") is None


def test_cache_invalidate_single_tenant():
    """Invalidating one tenant leaves others intact."""
    cache_invalidate()
    _cache_set("tenant-a", {"a": 1})
    _cache_set("tenant-b", {"b": 2})
    cache_invalidate("tenant-a")
    assert _cache_get("tenant-a") is None
    assert _cache_get("tenant-b") == {"b": 2}
    cache_invalidate()


def test_cache_invalidate_all():
    """Calling cache_invalidate() with no arg clears every tenant."""
    _cache_set("t1", {"x": 1})
    _cache_set("t2", {"x": 2})
    cache_invalidate()
    assert _cache_get("t1") is None
    assert _cache_get("t2") is None


def test_cache_ttl_expires_entry():
    """Manually aging an entry beyond TTL forces re-fetch (returns None)."""
    cache_invalidate()
    _cache_set("tenant-ttl", {"x": 1})
    # Force-expire by mutating timestamp
    _cache["tenant-ttl"]["ts"] = time.monotonic() - 120  # > 60s TTL
    assert _cache_get("tenant-ttl") is None
    cache_invalidate()


# ─── Catalog integrity ───────────────────────────────────────────────────────
def test_feature_catalog_keys_unique():
    """No duplicate feature keys in FEATURE_CATALOG."""
    keys = [f["key"] for f in FEATURE_CATALOG]
    assert len(keys) == len(set(keys))


def test_feature_catalog_requires_features_resolve():
    """Every requires_features entry refers to an existing feature key."""
    valid_keys = set(_BY_KEY.keys())
    for f in FEATURE_CATALOG:
        for dep in f.get("requires_features", []):
            assert dep in valid_keys, f"{f['key']} requires unknown feature {dep}"


def test_feature_catalog_plan_tier_valid():
    """All default_plan_tier values are basic/pro/enterprise."""
    valid_tiers = {"basic", "pro", "enterprise"}
    for f in FEATURE_CATALOG:
        assert f["default_plan_tier"] in valid_tiers


# ─── Plan templates seed integrity ───────────────────────────────────────────
def test_plan_templates_seed_ids_unique():
    """No duplicate template ids in PLAN_TEMPLATES_SEED."""
    ids = [t["id"] for t in PLAN_TEMPLATES_SEED]
    assert len(ids) == len(set(ids))


def test_plan_templates_seed_features_resolve():
    """Every feature referenced by a plan template exists in the catalog."""
    valid_keys = set(_BY_KEY.keys())
    for t in PLAN_TEMPLATES_SEED:
        for fk in t.get("features", []):
            assert fk in valid_keys, f"template {t['id']} references unknown feature {fk}"


# ─── Snapshots seed integrity ────────────────────────────────────────────────
def test_snapshots_seed_feature_keys_resolve():
    """Every feature_key inside SNAPSHOTS_SEED payload exists in catalog."""
    valid_keys = set(_BY_KEY.keys())
    for snap in SNAPSHOTS_SEED:
        for f in (snap.get("payload") or {}).get("features") or []:
            fk = f.get("feature_key")
            if fk is not None:
                assert fk in valid_keys, f"snapshot {snap['id']} references unknown feature {fk}"


def test_snapshot_components_constant():
    """SNAPSHOT_COMPONENTS includes the 7 documented dimensions."""
    expected = {"features", "pipeline", "email_templates", "branding",
                "automations", "disc", "reportes"}
    assert set(SNAPSHOT_COMPONENTS) == expected
