"""Wave 4 · Tests investment_simulator_engine.py · 14 tests unidad sin DB.

Cubre funciones PURAS financieras:
- _pmt (cuota hipotecaria · formula estándar)
- _compute_scenario (ROI · TIR · break-even · cash flow)
- _compute_tir_anualizada (Newton-Raphson)
- _cache_get / _cache_set (in-memory TTL)
- APREC_RATES / RENTAL_YIELDS / COLONIA_DEFAULTS / MORTGAGE_RATE_ANNUAL integridad

NO testea async simulate() / DB / engines downstream → require infra.
"""
import pytest

from investment_simulator_engine import (
    APREC_RATES,
    COLONIA_DEFAULTS,
    DEFAULT_RATES,
    DEFAULT_RENTAL_YIELD,
    MORTGAGE_RATE_ANNUAL,
    RENTAL_YIELDS,
    SPREAD,
    TIIE_RATE,
    _cache_get,
    _cache_set,
    _compute_scenario,
    _compute_tir_anualizada,
    _pmt,
)

pytestmark = pytest.mark.unit


# ─── _pmt cuota mensual hipoteca ─────────────────────────────────────────────

def test_pmt_returns_positive_for_valid_loan():
    """Crédito 2M, 240 meses, 13.5% anual → cuota > 0."""
    pago = _pmt(0.135, 240, 2_000_000)
    assert pago > 0


def test_pmt_zero_principal_returns_zero():
    """Sin principal → cuota cero (defensivo)."""
    assert _pmt(0.135, 240, 0) == 0.0


def test_pmt_zero_months_returns_zero():
    """0 meses → 0 (defensivo)."""
    assert _pmt(0.135, 0, 1_000_000) == 0.0


def test_pmt_zero_rate_linear_division():
    """Tasa 0 → simple division principal/n_months."""
    pago = _pmt(0.0, 120, 1_200_000)
    assert pago == pytest.approx(10_000.0, rel=0.001)


# ─── _compute_scenario · core financial calc ─────────────────────────────────

def test_compute_scenario_returns_required_keys():
    """Escenario incluye claves esenciales."""
    s = _compute_scenario(
        precio_entrada=3_000_000, plazo_meses=120, m2=80,
        financiamiento_pct=0.80, aprec_annual=0.06,
        rental_yield_annual=0.05, tier="B", label="base",
    )
    required = {
        "label", "aprec_anual_pct", "precio_final", "roi_pct",
        "tir_anual_pct", "break_even_meses", "pago_mensual_hipoteca",
        "enganche", "gastos_cierre", "inversion_inicial",
        "plusvalia_abs", "cash_flow_monthly", "tier",
    }
    assert required.issubset(s.keys())


def test_compute_scenario_cash_flow_monthly_length():
    """cash_flow_monthly tiene plazo_meses entries."""
    s = _compute_scenario(
        precio_entrada=3_000_000, plazo_meses=60, m2=80,
        financiamiento_pct=0.80, aprec_annual=0.05,
        rental_yield_annual=0.05, tier="B", label="base",
    )
    assert len(s["cash_flow_monthly"]) == 60


def test_compute_scenario_precio_final_appreciates():
    """precio_final > precio_entrada con aprec > 0."""
    s = _compute_scenario(
        precio_entrada=3_000_000, plazo_meses=120, m2=80,
        financiamiento_pct=0.80, aprec_annual=0.07,
        rental_yield_annual=0.05, tier="B", label="base",
    )
    assert s["precio_final"] > 3_000_000


def test_compute_scenario_enganche_20pct_default():
    """Con financiamiento 0.80 → enganche = 20% del precio."""
    s = _compute_scenario(
        precio_entrada=3_000_000, plazo_meses=120, m2=80,
        financiamiento_pct=0.80, aprec_annual=0.06,
        rental_yield_annual=0.05, tier="B", label="base",
    )
    assert s["enganche"] == pytest.approx(600_000, rel=0.001)


def test_compute_scenario_gastos_cierre_65pct():
    """Gastos cierre = 6.5% del precio."""
    s = _compute_scenario(
        precio_entrada=3_000_000, plazo_meses=120, m2=80,
        financiamiento_pct=0.80, aprec_annual=0.06,
        rental_yield_annual=0.05, tier="B", label="base",
    )
    assert s["gastos_cierre"] == pytest.approx(195_000, rel=0.001)


# ─── _compute_tir_anualizada ─────────────────────────────────────────────────

def test_tir_returns_none_for_zero_inversion():
    """Sin inversión → None (defensivo)."""
    assert _compute_tir_anualizada(0, [{"flujo_neto": 100}], 1_000_000, 12) is None


def test_tir_returns_none_for_empty_flows():
    """Sin cash flows → None."""
    assert _compute_tir_anualizada(100_000, [], 1_000_000, 12) is None


# ─── In-memory cache ─────────────────────────────────────────────────────────

def test_cache_set_and_get_roundtrip():
    """set → get devuelve mismo valor."""
    key = "test_cache_unit_xyz"
    val = {"answer": 42}
    _cache_set(key, val)
    assert _cache_get(key) == val


def test_cache_miss_returns_none():
    """Cache miss → None."""
    assert _cache_get("nonexistent_key_zzz") is None


# ─── Constants integrity ─────────────────────────────────────────────────────

def test_aprec_rates_includes_5_tiers():
    """APREC_RATES tiene tiers A/B/C/D/F."""
    assert set(APREC_RATES.keys()) == {"A", "B", "C", "D", "F"}


def test_aprec_rates_each_tier_has_3_scenarios():
    """Cada tier tiene 3 escenarios: conservador/base/optimista."""
    for tier, rates in APREC_RATES.items():
        assert set(rates.keys()) == {"conservador", "base", "optimista"}


def test_aprec_rates_a_tier_higher_than_f():
    """A tier appreciates more than F tier (base scenario)."""
    assert APREC_RATES["A"]["base"] > APREC_RATES["F"]["base"]


def test_aprec_rates_optimista_higher_than_conservador():
    """Optimista > base > conservador en cada tier."""
    for tier, rates in APREC_RATES.items():
        assert rates["optimista"] >= rates["base"] >= rates["conservador"]


def test_rental_yields_includes_5_tiers():
    """RENTAL_YIELDS tiene mismos tiers que APREC_RATES."""
    assert set(RENTAL_YIELDS.keys()) == {"A", "B", "C", "D", "F"}


def test_colonia_defaults_includes_top_cdmx():
    """COLONIA_DEFAULTS incluye colonias premium CDMX."""
    for col in ("polanco", "condesa", "roma", "del-valle"):
        assert col in COLONIA_DEFAULTS


def test_mortgage_rate_equals_tiie_plus_spread():
    """MORTGAGE_RATE_ANNUAL = TIIE + SPREAD."""
    assert MORTGAGE_RATE_ANNUAL == pytest.approx(TIIE_RATE + SPREAD)


def test_default_rental_yield_in_range():
    """DEFAULT_RENTAL_YIELD razonable (2-10%)."""
    assert 0.02 <= DEFAULT_RENTAL_YIELD <= 0.10


def test_default_rates_dict():
    """DEFAULT_RATES tiene 3 escenarios."""
    assert set(DEFAULT_RATES.keys()) == {"conservador", "base", "optimista"}
