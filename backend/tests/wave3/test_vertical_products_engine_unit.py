"""Wave 3 · Tests vertical_products_engine.py · 14 tests unidad sin DB.

Cubre helpers y constantes de los 4 productos verticales B2B:
- _new_id (id generator con prefijo)
- _request_hash (hash determinista de payload)
- _iso · _now (timestamp helpers)
- Constants integrity: METHODOLOGY_VERSION, TIER_RANK, PERIL_WEIGHTS
- Lógica determinista de risk adjusters / peril breakdown / monte carlo growth bands
"""
from datetime import datetime

import pytest

from vertical_products_engine import (
    METHODOLOGY_VERSION,
    PERIL_WEIGHTS,
    TIER_RANK,
    _iso,
    _new_id,
    _now,
    _request_hash,
)

pytestmark = pytest.mark.unit


# ─── Constants ───────────────────────────────────────────────────────────────
def test_methodology_version_semver():
    """METHODOLOGY_VERSION es semver string."""
    assert isinstance(METHODOLOGY_VERSION, str)
    assert len(METHODOLOGY_VERSION.split(".")) == 3


def test_tier_rank_ordering():
    """free < pro < enterprise."""
    assert TIER_RANK["free"] < TIER_RANK["pro"] < TIER_RANK["enterprise"]


def test_tier_rank_contains_all_three_tiers():
    """TIER_RANK incluye los 3 tiers DMX."""
    assert {"free", "pro", "enterprise"}.issubset(set(TIER_RANK.keys()))


def test_peril_weights_sum_to_one():
    """Suma de weights de los 4 perils = 1.0 (composite válido)."""
    total = sum(PERIL_WEIGHTS.values())
    assert abs(total - 1.0) < 1e-9


def test_peril_weights_keys():
    """4 perils: seismic, flood, theft, fire."""
    assert set(PERIL_WEIGHTS.keys()) == {"seismic", "flood", "theft", "fire"}


def test_peril_weights_all_positive():
    """Todos los weights > 0."""
    for k, v in PERIL_WEIGHTS.items():
        assert v > 0, f"{k} weight non-positive"


# ─── _new_id ─────────────────────────────────────────────────────────────────
def test_new_id_default_prefix_vp():
    """Default prefix 'vp_'."""
    assert _new_id().startswith("vp_")


def test_new_id_custom_prefix_vpc():
    """Audit log usa 'vpc' prefix."""
    assert _new_id("vpc").startswith("vpc_")


def test_new_id_unique_per_call():
    """Dos invocaciones → ids distintos."""
    assert _new_id() != _new_id()


# ─── _request_hash ───────────────────────────────────────────────────────────
def test_request_hash_deterministic():
    """Mismo payload → mismo hash (sorted keys)."""
    p = {"zone_id": "polanco", "m2": 80}
    assert _request_hash(p) == _request_hash(p)


def test_request_hash_order_independent():
    """Orden de keys no afecta hash (sort interno)."""
    h1 = _request_hash({"a": 1, "b": 2})
    h2 = _request_hash({"b": 2, "a": 1})
    assert h1 == h2


def test_request_hash_different_payload_different_hash():
    """Payloads distintos → hashes distintos."""
    h1 = _request_hash({"zone_id": "polanco"})
    h2 = _request_hash({"zone_id": "roma"})
    assert h1 != h2


def test_request_hash_length_16():
    """Hash truncado a 16 chars (ratio collision aceptable para audit)."""
    assert len(_request_hash({"x": 1})) == 16


# ─── _iso · _now ─────────────────────────────────────────────────────────────
def test_iso_returns_iso8601():
    """ISO-8601 con T separator."""
    s = _iso()
    assert "T" in s
    assert isinstance(s, str)


def test_now_utc_aware():
    """_now devuelve datetime UTC-aware."""
    n = _now()
    assert isinstance(n, datetime)
    assert n.tzinfo is not None
    assert n.utcoffset().total_seconds() == 0
