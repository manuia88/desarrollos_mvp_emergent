"""Tests · tenant_dev_map helper · W4.1C++ tech-debt fix 2026-05-13.

Cubre:
- get_allowed_dev_ids_sync (modo legacy fallback · sin Mongo · 100% determinista)
- LEGACY_FALLBACK shape (immutable copy)
- Cache invalidate
- Backward compat con TENANT_DEV_MAP shape original

NO toca código existente · solo testea el helper nuevo.
"""
from __future__ import annotations

import pytest


pytestmark = pytest.mark.unit


# ─── get_allowed_dev_ids_sync · fallback legacy ────────────────────────────


def test_sync_returns_wildcard_for_dmx_superadmin():
    """tenant 'dmx' es superadmin → retorna '*' wildcard."""
    from tenant_dev_map import get_allowed_dev_ids_sync
    assert get_allowed_dev_ids_sync("dmx") == "*"


def test_sync_returns_list_for_constructora_ariel():
    """tenant 'constructora_ariel' retorna lista exacta legacy."""
    from tenant_dev_map import get_allowed_dev_ids_sync
    result = get_allowed_dev_ids_sync("constructora_ariel")
    assert isinstance(result, list)
    assert set(result) == {"quattro", "habitare-capital", "agora-urbana"}


def test_sync_returns_none_for_unknown_tenant():
    """tenant no registrado retorna None (caller debe denegar acceso)."""
    from tenant_dev_map import get_allowed_dev_ids_sync
    assert get_allowed_dev_ids_sync("attacker_org") is None
    assert get_allowed_dev_ids_sync("random_tenant_xyz") is None


def test_sync_handles_none_and_empty():
    """None y empty string retornan None (defensive)."""
    from tenant_dev_map import get_allowed_dev_ids_sync
    assert get_allowed_dev_ids_sync(None) is None
    assert get_allowed_dev_ids_sync("") is None


# ─── LEGACY_FALLBACK · shape integrity ───────────────────────────────────────


def test_legacy_fallback_contains_canonical_entries():
    """LEGACY_FALLBACK incluye los 2 tenants canónicos · sin extras."""
    from tenant_dev_map import LEGACY_FALLBACK
    assert "dmx" in LEGACY_FALLBACK
    assert "constructora_ariel" in LEGACY_FALLBACK
    assert LEGACY_FALLBACK["dmx"] == "*"
    assert LEGACY_FALLBACK["constructora_ariel"] == [
        "quattro", "habitare-capital", "agora-urbana",
    ]


def test_legacy_fallback_is_copy_not_reference():
    """LEGACY_FALLBACK exportado es copia · mutación no afecta el module-local."""
    from tenant_dev_map import LEGACY_FALLBACK, get_allowed_dev_ids_sync

    # Mutate copy
    LEGACY_FALLBACK["hacker_tenant"] = ["malicious"]

    # Source-of-truth NO debe haberse contaminado
    assert get_allowed_dev_ids_sync("hacker_tenant") is None


# ─── Cache invalidate ────────────────────────────────────────────────────────


def test_invalidate_cache_clears_all():
    """invalidate_cache(None) limpia todo · invalidate_cache(tenant) limpia uno."""
    from tenant_dev_map import invalidate_cache, _cache

    # Seed cache manually
    _cache["test_tenant_a"] = ("*", 999999999.0)
    _cache["test_tenant_b"] = (["x"], 999999999.0)

    # Invalidate specific
    invalidate_cache("test_tenant_a")
    assert "test_tenant_a" not in _cache
    assert "test_tenant_b" in _cache

    # Invalidate all
    invalidate_cache()
    assert _cache == {}


# ─── Backward compat con uso desde routes/documents.py ─────────────────────


def test_documents_route_import_compat():
    """routes/documents.py importa TENANT_DEV_MAP del módulo nuevo · compat."""
    from tenant_dev_map import LEGACY_FALLBACK as TENANT_DEV_MAP

    # El export TENANT_DEV_MAP mantiene el shape mixto (string "*" + List[str])
    assert TENANT_DEV_MAP["dmx"] == "*"
    assert isinstance(TENANT_DEV_MAP["constructora_ariel"], list)


def test_helper_supports_both_wildcard_and_list_return_types():
    """get_allowed_dev_ids_sync retorna Union[str, List[str], None] · validar tipos."""
    from tenant_dev_map import get_allowed_dev_ids_sync

    superadmin_rule = get_allowed_dev_ids_sync("dmx")
    assert superadmin_rule == "*" or isinstance(superadmin_rule, str)

    dev_rule = get_allowed_dev_ids_sync("constructora_ariel")
    assert isinstance(dev_rule, list)

    no_rule = get_allowed_dev_ids_sync("unknown")
    assert no_rule is None
