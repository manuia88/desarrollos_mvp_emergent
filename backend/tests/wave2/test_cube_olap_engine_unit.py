"""Wave 2 · Tests cube_olap_engine.py · 15 tests unidad sin DB.

Cubre helpers puros (lógica sin Mongo · 100% determinista):
- _price_tier_for (price MXN → entry|mid|luxury|ultraluxury|unknown)
- _decade_for (year_built → '2020s' etc.)
- _unit_property_type (heurística normalizar unit_type)
- _unit_price (extract+coerce price)
- _unit_year (extract+coerce year_built)
- _aggregate_units (KPIs sobre list[unit])
- Constants integrity (PROPERTY_TYPES · PRICE_TIERS · MAX_*)

Funciones async con Mongo (_list_units_for_zone · query_slice · query_cross_cut ·
query_compare_zones · _do_backfill · backfill_historical · refresh_top_materialized_views ·
ensure_consolidated_indexes) → diferidas a integration tests.

NO toca infra · NO modifica código existente · solo lectura.
"""
import pytest

from cube_olap_engine import (
    _price_tier_for,
    _decade_for,
    _unit_property_type,
    _unit_price,
    _unit_year,
    _aggregate_units,
    PROPERTY_TYPES,
    PRICE_TIERS,
    PRICE_TIER_KEYS,
    SLICE_BY_OPTIONS,
    MAX_DIMENSIONS,
    MAX_COMPARE_ZONES,
)

pytestmark = pytest.mark.unit


# ─── 1. _price_tier_for: MXN → tier ───────────────────────────────────────────


def test_price_tier_for_buckets():
    """Cada bucket de PRICE_TIERS clasifica correctamente."""
    assert _price_tier_for(2_000_000) == "entry"
    assert _price_tier_for(5_000_000) == "mid"
    assert _price_tier_for(10_000_000) == "luxury"
    assert _price_tier_for(25_000_000) == "ultraluxury"


def test_price_tier_for_boundary_values():
    """Boundaries usan rango [lo, hi) — `lo` incluido, `hi` excluido."""
    assert _price_tier_for(0) == "entry"
    assert _price_tier_for(3_000_000) == "mid"  # frontera entry→mid
    assert _price_tier_for(8_000_000) == "luxury"
    assert _price_tier_for(20_000_000) == "ultraluxury"


def test_price_tier_for_none_and_negative():
    """None → 'unknown' · precios negativos → 'unknown' (fuera de bucket)."""
    assert _price_tier_for(None) == "unknown"
    assert _price_tier_for(-100) == "unknown"


# ─── 2. _decade_for: year → '2020s' ───────────────────────────────────────────


def test_decade_for_modern_years():
    """Años 1900+ → string '{decade}s'."""
    assert _decade_for(2024) == "2020s"
    assert _decade_for(1999) == "1990s"
    assert _decade_for(2010) == "2010s"


def test_decade_for_invalid_year():
    """None · 0 · pre-1900 → 'unknown'."""
    assert _decade_for(None) == "unknown"
    assert _decade_for(0) == "unknown"
    assert _decade_for(1850) == "unknown"


# ─── 3. _unit_property_type: normalize unit_type ──────────────────────────────


def test_unit_property_type_canonical_keys():
    """Keys canónicos pasan directo."""
    assert _unit_property_type({"unit_type": "depto"}) == "depto"
    assert _unit_property_type({"unit_type": "casa"}) == "casa"
    assert _unit_property_type({"type": "loft"}) == "loft"
    assert _unit_property_type({"unit_type": "ph"}) == "ph"


def test_unit_property_type_heuristic_match():
    """Substring match cuando no es key canónico."""
    assert _unit_property_type({"type": "departamento"}) == "depto"
    assert _unit_property_type({"unit_type": "TOWNHOUSE"}) == "town"
    assert _unit_property_type({"unit_type": "penthouse"}) == "ph"


def test_unit_property_type_default_fallback():
    """Sin unit_type o vacío → 'depto' (conservador)."""
    assert _unit_property_type({}) == "depto"
    assert _unit_property_type({"unit_type": ""}) == "depto"
    assert _unit_property_type({"unit_type": "weird_unknown_type"}) == "depto"


# ─── 4. _unit_price: extract + coerce ─────────────────────────────────────────


def test_unit_price_extraction():
    """Lee 'price' o 'price_mxn' · coerce a float."""
    assert _unit_price({"price": 5_000_000}) == 5_000_000.0
    assert _unit_price({"price_mxn": 7_500_000.5}) == 7_500_000.5


def test_unit_price_returns_none_invalid():
    """Sin price · None · valor no-numérico → None."""
    assert _unit_price({}) is None
    assert _unit_price({"price": None}) is None
    assert _unit_price({"price": "invalid"}) is None


# ─── 5. _unit_year: extract + coerce ──────────────────────────────────────────


def test_unit_year_extraction_and_coerce():
    """Lee 'year_built' o 'anio_construccion' · coerce a int."""
    assert _unit_year({"year_built": 2024}) == 2024
    assert _unit_year({"anio_construccion": "2020"}) == 2020


def test_unit_year_returns_none_invalid():
    """Sin year · 0 · valor no-numérico → None."""
    assert _unit_year({}) is None
    assert _unit_year({"year_built": 0}) is None  # falsy → None
    assert _unit_year({"year_built": "bad"}) is None


# ─── 6. _aggregate_units: KPIs sobre lista ────────────────────────────────────


def test_aggregate_units_empty_list():
    """Lista vacía → estructura con ceros + Nones."""
    agg = _aggregate_units([])
    assert agg["units_total"] == 0
    assert agg["units_sold"] == 0
    assert agg["units_available"] == 0
    assert agg["units_reserved"] == 0
    assert agg["avg_price_mxn"] is None
    assert agg["avg_price_per_m2"] is None
    assert agg["conversion_rate"] is None


def test_aggregate_units_status_buckets_and_avgs():
    """Cuenta por status · avg_price · conversion_rate."""
    units = [
        {"status": "disponible", "price": 5_000_000, "m2_privative": 100},
        {"status": "vendido", "price": 3_000_000, "size_m2": 80},
        {"status": "reservado", "price_mxn": 8_000_000, "m2_privative": 150},
    ]
    agg = _aggregate_units(units)
    assert agg["units_total"] == 3
    assert agg["units_sold"] == 1
    assert agg["units_available"] == 1
    assert agg["units_reserved"] == 1
    # avg precio = (5M + 3M + 8M) / 3 = 5,333,333.33
    assert agg["avg_price_mxn"] == round((5_000_000 + 3_000_000 + 8_000_000) / 3, 2)
    # conversion = 1 vendido / (1+1+1) * 100 = 33.33
    assert agg["conversion_rate"] == round(1 / 3 * 100, 2)


def test_aggregate_units_status_synonyms_recognized():
    """Sinónimos status (sold/cerrado/available/apartado) cuentan."""
    units = [
        {"status": "sold", "price": 1},
        {"status": "cerrado", "price": 1},
        {"status": "closed", "price": 1},
        {"status": "available", "price": 1},
        {"status": "apartado", "price": 1},
        {"status": "reserved", "price": 1},
    ]
    agg = _aggregate_units(units)
    assert agg["units_sold"] == 3  # sold + cerrado + closed
    assert agg["units_available"] == 1
    assert agg["units_reserved"] == 2  # apartado + reserved


# ─── 7. Constants integrity (catch silent regressions) ───────────────────────


def test_constants_intact():
    """Constants públicas tienen valores canónicos."""
    assert PROPERTY_TYPES == ("depto", "casa", "loft", "town", "ph")
    assert PRICE_TIER_KEYS == ("entry", "mid", "luxury", "ultraluxury")
    assert SLICE_BY_OPTIONS == ("property_type", "price_tier", "year_built_decade")
    assert MAX_DIMENSIONS == 3
    assert MAX_COMPARE_ZONES == 5
    # PRICE_TIERS estructura: 4 tuples (key, lo, hi)
    assert len(PRICE_TIERS) == 4
    assert PRICE_TIERS[0] == ("entry", 0, 3_000_000)
    assert PRICE_TIERS[-1][0] == "ultraluxury"
