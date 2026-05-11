"""Wave 3 · Tests denue_engine.py · 14 tests unidad sin DB.

Cubre helpers puros (lógica sin Mongo · sin red · 100% determinista):
- _classify_scian (SCIAN code → category)
- _safe_float (str → float robusto · soporta coma decimal)
- _area_km2 (radio metros → área km²)
- _new_id (id generator · prefijo + entropía)
- _token (env precedence: IE_DENUE_TOKEN > IE_INEGI_TOKEN)
- Constants integrity (SCIAN_KEYWORDS · MAX_RECORDS · DEFAULT_RADIUS_M · CDMX_LAT/LNG)

Funciones async con red/Mongo (_fetch_denue_entorno · fetch_businesses_by_zone ·
compute_zone_density · get_zone_density · lookup_business · cron_*) → diferidas a
integration tests (necesitan httpx mock + mongomock).

NO modifica código existente · solo lectura.
"""
import math
import os

import pytest

from denue_engine import (
    _classify_scian,
    _safe_float,
    _area_km2,
    _new_id,
    _token,
    SCIAN_KEYWORDS,
    MAX_RECORDS,
    DEFAULT_RADIUS_M,
    CDMX_LAT,
    CDMX_LNG,
)


pytestmark = pytest.mark.unit


# ─── 1. _classify_scian: SCIAN prefix → category ─────────────────────────────


def test_classify_scian_restaurants():
    """SCIAN 722* → restaurants."""
    assert _classify_scian("722011") == "restaurants"
    assert _classify_scian("7221") == "restaurants"


def test_classify_scian_gyms_markets_schools_hospitals():
    """Coverage de prefijos clave del catálogo."""
    assert _classify_scian("7139") == "gyms"
    assert _classify_scian("713940") == "gyms"
    assert _classify_scian("461110") == "markets"
    assert _classify_scian("462") == "markets"
    assert _classify_scian("611") == "schools"
    assert _classify_scian("621") == "hospitals"


def test_classify_scian_pharmacies_banks():
    """SCIAN 4661* → pharmacies · 522* → banks."""
    assert _classify_scian("466110") == "pharmacies"
    assert _classify_scian("522110") == "banks"


def test_classify_scian_unknown_returns_none():
    """Códigos no mapeados · empty · None → None."""
    assert _classify_scian("999999") is None
    assert _classify_scian("") is None
    assert _classify_scian(None) is None
    assert _classify_scian("123") is None


# ─── 2. _safe_float: parse robusto ───────────────────────────────────────────


def test_safe_float_basic_decimal():
    """String decimal estándar → float."""
    assert _safe_float("12.5") == 12.5
    assert _safe_float("0") == 0.0
    assert _safe_float(-3.14) == -3.14


def test_safe_float_comma_decimal_es():
    """Coma decimal estilo ES → punto decimal."""
    assert _safe_float("1,5") == 1.5
    assert _safe_float("19,4326") == 19.4326


def test_safe_float_none_and_garbage_return_none():
    """None · strings inválidos → None (sin raise)."""
    assert _safe_float(None) is None
    assert _safe_float("xyz") is None
    assert _safe_float("") is None


# ─── 3. _area_km2: π·r² ──────────────────────────────────────────────────────


def test_area_km2_default_radius():
    """2000m → π·(2)² = 4π ≈ 12.566."""
    assert _area_km2(2000) == pytest.approx(math.pi * 4, rel=1e-6)


def test_area_km2_zero_radius():
    """Radio 0 → área 0."""
    assert _area_km2(0) == 0.0


def test_area_km2_1000m_is_pi():
    """1000m → 1km radio → área = π."""
    assert _area_km2(1000) == pytest.approx(math.pi, rel=1e-6)


# ─── 4. _new_id: id generator ────────────────────────────────────────────────


def test_new_id_has_prefix_and_uniqueness():
    """Prefix denue_ + uniqueness entre llamadas consecutivas."""
    a = _new_id()
    b = _new_id()
    assert a.startswith("denue_")
    assert b.startswith("denue_")
    assert a != b
    assert len(a) > len("denue_")


# ─── 5. _token: env precedence ───────────────────────────────────────────────


def test_token_returns_none_when_unset(monkeypatch):
    """Sin tokens en env → None (graceful degrade)."""
    monkeypatch.delenv("IE_DENUE_TOKEN", raising=False)
    monkeypatch.delenv("IE_INEGI_TOKEN", raising=False)
    assert _token() is None


def test_token_falls_back_to_inegi(monkeypatch):
    """Sin IE_DENUE_TOKEN pero con IE_INEGI_TOKEN → usa fallback."""
    monkeypatch.delenv("IE_DENUE_TOKEN", raising=False)
    monkeypatch.setenv("IE_INEGI_TOKEN", "fallback_value")
    assert _token() == "fallback_value"


def test_token_prefers_denue_over_inegi(monkeypatch):
    """IE_DENUE_TOKEN tiene precedencia sobre IE_INEGI_TOKEN."""
    monkeypatch.setenv("IE_DENUE_TOKEN", "preferred")
    monkeypatch.setenv("IE_INEGI_TOKEN", "fallback")
    assert _token() == "preferred"


# ─── 6. Constants integrity (catch silent regressions) ───────────────────────


def test_scian_keywords_canonical_set():
    """SCIAN_KEYWORDS contiene las 7 categorías canónicas Wave 3."""
    assert set(SCIAN_KEYWORDS.keys()) == {
        "restaurants", "gyms", "markets",
        "schools", "hospitals", "pharmacies", "banks",
    }


def test_constants_defaults_intact():
    """MAX_RECORDS · DEFAULT_RADIUS_M · CDMX center coords."""
    assert MAX_RECORDS == 500
    assert DEFAULT_RADIUS_M == 2000
    # CDMX center sanity: lat ~19.4, lng ~-99.1
    assert 19.0 < CDMX_LAT < 20.0
    assert -100.0 < CDMX_LNG < -99.0
