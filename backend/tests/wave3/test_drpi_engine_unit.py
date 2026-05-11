"""Wave 3 · Tests drpi_engine.py · 12 tests unidad sin DB.

Cubre funciones puras + constantes:
- _period_now (formato YYYY-MM UTC actual)
- _period_prev (decremento de mes con cruce de año)
- _iso · _now (helpers de timestamps)
- Constants integrity: FORMULA_VERSION, BASE_INDEX, TOP_ZONES
"""
from datetime import datetime, timezone

import pytest

from drpi_engine import (
    BASE_INDEX,
    FORMULA_VERSION,
    TOP_ZONES,
    _iso,
    _now,
    _period_now,
    _period_prev,
)

pytestmark = pytest.mark.unit


# ─── Constants ───────────────────────────────────────────────────────────────
def test_formula_version_is_semver_string():
    """FORMULA_VERSION es string semver."""
    assert isinstance(FORMULA_VERSION, str)
    parts = FORMULA_VERSION.split(".")
    assert len(parts) == 3
    assert all(p.isdigit() for p in parts)


def test_base_index_is_100():
    """BASE_INDEX anchor a 100 (estándar DRPI)."""
    assert BASE_INDEX == 100.0


def test_top_zones_contains_canonical_alcaldias():
    """TOP_ZONES incluye las alcaldías core CDMX."""
    assert "polanco" in TOP_ZONES
    assert "roma" in TOP_ZONES
    assert "condesa" in TOP_ZONES
    assert len(TOP_ZONES) >= 6


def test_top_zones_all_lowercase():
    """Convención: zone_ids minúsculas snake_case."""
    for z in TOP_ZONES:
        assert z == z.lower()
        assert " " not in z


# ─── _period_now ─────────────────────────────────────────────────────────────
def test_period_now_format_yyyy_mm():
    """Returns 'YYYY-MM' con mes zero-padded."""
    p = _period_now()
    assert len(p) == 7
    assert p[4] == "-"
    y, m = p.split("-")
    assert len(y) == 4 and y.isdigit()
    assert len(m) == 2 and m.isdigit()
    assert 1 <= int(m) <= 12


def test_period_now_matches_utc_now():
    """Período actual = mes UTC actual."""
    n = datetime.now(timezone.utc)
    expected = f"{n.year}-{n.month:02d}"
    assert _period_now() == expected


# ─── _period_prev ────────────────────────────────────────────────────────────
def test_period_prev_decrements_month():
    """Marzo → Febrero, mismo año."""
    assert _period_prev("2026-03") == "2026-02"


def test_period_prev_january_crosses_year():
    """Enero → Diciembre del año anterior."""
    assert _period_prev("2026-01") == "2025-12"


def test_period_prev_december_to_november():
    """Diciembre → Noviembre."""
    assert _period_prev("2026-12") == "2026-11"


def test_period_prev_pads_single_digit_month():
    """Mes resultante siempre 2-dígitos zero-padded."""
    assert _period_prev("2026-10") == "2026-09"


def test_period_prev_invalid_returns_input():
    """Input malformado → devuelve input sin crash."""
    assert _period_prev("garbage") == "garbage"


# ─── _iso · _now ─────────────────────────────────────────────────────────────
def test_iso_returns_iso8601_with_tz():
    """_iso emite ISO-8601 con timezone."""
    s = _iso()
    assert "T" in s
    assert s.endswith("+00:00") or s.endswith("Z")


def test_now_returns_utc_aware_datetime():
    """_now devuelve datetime con tzinfo UTC."""
    n = _now()
    assert isinstance(n, datetime)
    assert n.tzinfo is not None
    assert n.utcoffset().total_seconds() == 0
