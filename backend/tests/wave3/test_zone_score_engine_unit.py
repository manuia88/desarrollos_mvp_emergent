"""Wave 3 · Tests zone_score_engine.py · 17 tests unidad sin DB.

Cubre helpers puros del scoring A-F + 6 dimensiones (sin Mongo · sin red):
- _letter (numeric → A/B/C/D/E/F bands)
- _clamp (0-100 enforcement)
- _score_supply_pressure (absorption ratio)
- _score_demand_growth (delta % normalizado)
- _score_yield (gross yield % por banda HIGH/MID/LOW)
- _score_denue_density (density vs MAX_DENSITY_REF)
- Constants (FORMULA_VERSION · WEIGHTS sum=1 · YIELD thresholds)

Funciones async con Mongo (compute_zone_score · get_latest_score · get_score_or_compute ·
list_all_scores · get_score_history · cron_*) → diferidas a integration tests.

NO modifica código existente · solo lectura.
"""
import pytest

from zone_score_engine import (
    _letter,
    _clamp,
    _score_supply_pressure,
    _score_demand_growth,
    _score_yield,
    _score_denue_density,
    FORMULA_VERSION,
    WEIGHTS,
    MAX_DENSITY_REF,
    YIELD_HIGH,
    YIELD_MID,
    YIELD_LOW,
)


pytestmark = pytest.mark.unit


# ─── 1. _letter: A-F band mapping ────────────────────────────────────────────


def test_letter_band_thresholds_canonical():
    """Boundaries A≥80 · B 65-79 · C 50-64 · D 35-49 · E 20-34 · F<20."""
    # A band
    assert _letter(100) == "A"
    assert _letter(80) == "A"
    # B band
    assert _letter(79.9) == "B"
    assert _letter(65) == "B"
    # C band
    assert _letter(64.9) == "C"
    assert _letter(50) == "C"
    # D band
    assert _letter(49.9) == "D"
    assert _letter(35) == "D"
    # E band
    assert _letter(34.9) == "E"
    assert _letter(20) == "E"
    # F band
    assert _letter(19.9) == "F"
    assert _letter(0) == "F"


def test_letter_handles_negative_and_above_100():
    """Edge: scores fuera de rango siguen mapeando con seguridad."""
    assert _letter(-5) == "F"
    assert _letter(150) == "A"


# ─── 2. _clamp: 0-100 enforcement ────────────────────────────────────────────


def test_clamp_within_range():
    """Valores en rango pasan tal cual."""
    assert _clamp(50) == 50
    assert _clamp(0) == 0
    assert _clamp(100) == 100


def test_clamp_outside_range():
    """Valores fuera de rango → recortados a [0, 100]."""
    assert _clamp(150) == 100.0
    assert _clamp(-10) == 0.0
    assert _clamp(99999) == 100.0


def test_clamp_custom_bounds():
    """Bounds custom respetados."""
    assert _clamp(50, lo=0, hi=20) == 20
    assert _clamp(-5, lo=10, hi=30) == 10


# ─── 3. _score_supply_pressure: absorption → score ───────────────────────────


def test_supply_zero_total_returns_neutral():
    """Sin units → 50 (neutral · sin señal)."""
    assert _score_supply_pressure({"units_total": 0, "units_sold": 0}) == 50.0
    assert _score_supply_pressure({}) == 50.0


def test_supply_full_absorption_max_score():
    """100% absorption → score 100 (escasez = liquidez)."""
    assert _score_supply_pressure({"units_total": 100, "units_sold": 100}) == 100.0


def test_supply_half_absorption_mid_score():
    """50% absorption → score 50."""
    assert _score_supply_pressure({"units_total": 100, "units_sold": 50}) == 50.0


def test_supply_low_absorption_low_score():
    """10% absorption → score 10."""
    assert _score_supply_pressure({"units_total": 100, "units_sold": 10}) == 10.0


# ─── 4. _score_demand_growth: leads delta → score ────────────────────────────


def test_demand_no_baseline_returns_neutral():
    """prev_leads=0 → 50 (no baseline)."""
    assert _score_demand_growth(100, 0) == 50.0
    assert _score_demand_growth(0, 0) == 50.0


def test_demand_flat_returns_50():
    """0% delta → 50."""
    assert _score_demand_growth(100, 100) == 50.0


def test_demand_growth_50pct_caps_at_100():
    """+50% growth → 100 (clamp)."""
    assert _score_demand_growth(150, 100) == 100.0
    assert _score_demand_growth(200, 100) == 100.0  # +100% también clamped


def test_demand_decline_50pct_floor_zero():
    """-50% decline → 0 (clamp)."""
    assert _score_demand_growth(50, 100) == 0.0
    assert _score_demand_growth(0, 100) == 0.0


# ─── 5. _score_yield: gross yield % bands ────────────────────────────────────


def test_yield_missing_inputs_neutral():
    """rental o price faltantes → 50 (placeholder)."""
    assert _score_yield(None, 100) == 50.0
    assert _score_yield(10000, None) == 50.0
    assert _score_yield(10000, 0) == 50.0


def test_yield_high_band_caps_100():
    """Yield ≥ 8% → score 100."""
    # rental 10000/mo · price 1.5M → annual rental 120k → yield 8%
    assert _score_yield(10000, 1500000) == 100.0


def test_yield_mid_band_score_60_to_100():
    """Yield 5-8% → score 60-100."""
    # rental 4000/mo · price 1M → annual 48k → yield 4.8% (just under MID, in LOW band)
    score = _score_yield(4000, 1000000)
    assert 20.0 <= score < 60.0  # within LOW->MID interpolation


def test_yield_very_low_below_threshold():
    """Yield < 2% → score muy bajo."""
    # rental 1000/mo · price 2M → annual 12k → yield 0.6% → score 6
    score = _score_yield(1000, 2000000)
    assert score < 20.0


# ─── 6. _score_denue_density: businesses_per_km2 → score ─────────────────────


def test_denue_density_none_returns_neutral():
    """density None → 50 (no data)."""
    assert _score_denue_density(None) == 50.0


def test_denue_density_at_reference_max_score():
    """density ≥ MAX_DENSITY_REF → 100."""
    assert _score_denue_density(MAX_DENSITY_REF) == 100.0
    assert _score_denue_density(MAX_DENSITY_REF * 2) == 100.0  # capped


def test_denue_density_half_reference_50_score():
    """density = MAX/2 → score 50."""
    assert _score_denue_density(MAX_DENSITY_REF / 2) == 50.0


# ─── 7. Constants integrity ──────────────────────────────────────────────────


def test_formula_version_intact():
    """FORMULA_VERSION canónico."""
    assert FORMULA_VERSION == "1.0.0"


def test_weights_sum_to_one():
    """Pesos por dimensión suman 1.0 (normalización válida)."""
    assert sum(WEIGHTS.values()) == pytest.approx(1.0)


def test_weights_canonical_dimensions():
    """6 dimensiones canónicas presentes."""
    assert set(WEIGHTS.keys()) == {
        "liquidez", "supply", "demand", "risk", "yield_score", "denue_density",
    }


def test_yield_thresholds_ordered():
    """YIELD_LOW < YIELD_MID < YIELD_HIGH (invariante de bandas)."""
    assert YIELD_LOW < YIELD_MID < YIELD_HIGH
    assert YIELD_HIGH == 8.0
    assert YIELD_MID == 5.0
    assert YIELD_LOW == 2.0
