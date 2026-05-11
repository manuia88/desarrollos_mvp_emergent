"""Wave 3 · Tests risk_score_engine.py · 15 tests unidad sin DB.

Cubre helpers puros (no async · no Mongo):
- _iso (timestamp ISO UTC)
- _clamp (range clamp 0-100)
- _letter (numeric → A/B/C/D/E/F)
- _crime_to_score (per_100k → score 0-100 invertido)
- WEIGHTS_V2 (4 fuentes · suma 1.0)
- FORMULA_VERSION + CRIME_NORM_HIGH constants

NO testea funciones async DB (compute_risk_score_v1 / compute_risk_score_v2 /
_title_risk_heuristic / detect_letter_change / get_risk_score_or_compute /
list_all_scores / cron_risk_score_zone_daily / ensure_indexes)
→ require AsyncIOMotor + crime_data_engine + natural_risk_engine + perception_risk_engine.
"""
from datetime import datetime

import pytest

from risk_score_engine import (
    CRIME_NORM_HIGH,
    FORMULA_VERSION,
    WEIGHTS_V2,
    _clamp,
    _crime_to_score,
    _iso,
    _letter,
)

pytestmark = pytest.mark.unit


# ─── _iso ────────────────────────────────────────────────────────────────────

def test_iso_returns_utc_iso_string():
    """_iso() devuelve string ISO 8601 con marcador UTC."""
    out = _iso()
    assert isinstance(out, str)
    assert out.endswith("+00:00")
    parsed = datetime.fromisoformat(out)
    assert parsed.utcoffset().total_seconds() == 0


# ─── _clamp ──────────────────────────────────────────────────────────────────

def test_clamp_within_range_unchanged():
    """_clamp() no cambia valores dentro del rango."""
    assert _clamp(50.0) == 50.0
    assert _clamp(0.0) == 0.0
    assert _clamp(100.0) == 100.0


def test_clamp_above_high_capped():
    """_clamp() capa valores >100 al máximo."""
    assert _clamp(150.0) == 100.0
    assert _clamp(1000.0) == 100.0


def test_clamp_below_low_floored():
    """_clamp() suelo en 0 para valores negativos."""
    assert _clamp(-50.0) == 0.0
    assert _clamp(-0.1) == 0.0


def test_clamp_custom_range():
    """_clamp() respeta rango custom (lo, hi)."""
    assert _clamp(50.0, lo=10.0, hi=20.0) == 20.0
    assert _clamp(5.0, lo=10.0, hi=20.0) == 10.0
    assert _clamp(15.0, lo=10.0, hi=20.0) == 15.0


# ─── _letter ─────────────────────────────────────────────────────────────────

def test_letter_a_for_high_scores():
    """_letter() devuelve 'A' para score ≥ 80."""
    assert _letter(100.0) == "A"
    assert _letter(85.0) == "A"
    assert _letter(80.0) == "A"


def test_letter_b_65_to_79():
    """_letter() devuelve 'B' para 65 ≤ score < 80."""
    assert _letter(79.9) == "B"
    assert _letter(70.0) == "B"
    assert _letter(65.0) == "B"


def test_letter_c_50_to_64():
    """_letter() devuelve 'C' para 50 ≤ score < 65."""
    assert _letter(64.9) == "C"
    assert _letter(55.0) == "C"
    assert _letter(50.0) == "C"


def test_letter_d_35_to_49():
    """_letter() devuelve 'D' para 35 ≤ score < 50."""
    assert _letter(49.9) == "D"
    assert _letter(40.0) == "D"
    assert _letter(35.0) == "D"


def test_letter_e_20_to_34():
    """_letter() devuelve 'E' para 20 ≤ score < 35."""
    assert _letter(34.9) == "E"
    assert _letter(25.0) == "E"
    assert _letter(20.0) == "E"


def test_letter_f_below_20():
    """_letter() devuelve 'F' para score < 20."""
    assert _letter(19.9) == "F"
    assert _letter(0.0) == "F"


# ─── _crime_to_score ─────────────────────────────────────────────────────────

def test_crime_to_score_returns_none_for_none():
    """_crime_to_score(None) devuelve None."""
    assert _crime_to_score(None) is None


def test_crime_to_score_zero_incidents_max_score():
    """0 incidentes per 100k → score 100."""
    assert _crime_to_score(0.0) == 100.0


def test_crime_to_score_high_norm_zero_score():
    """CRIME_NORM_HIGH (5000) incidentes per 100k → score 0."""
    assert _crime_to_score(CRIME_NORM_HIGH) == 0.0


def test_crime_to_score_above_max_clamped_zero():
    """>5000 incidentes per 100k → clamp a 0 (no negativo)."""
    assert _crime_to_score(10_000.0) == 0.0


def test_crime_to_score_midpoint():
    """2500 incidentes (50% de norm) → score ~50."""
    assert _crime_to_score(2500.0) == 50.0


# ─── WEIGHTS_V2 + constants ──────────────────────────────────────────────────

def test_weights_v2_has_4_sources():
    """WEIGHTS_V2 tiene exactamente 4 keys: crime, natural, title, perception."""
    assert set(WEIGHTS_V2.keys()) == {"crime", "natural", "title", "perception"}


def test_weights_v2_sum_to_1():
    """WEIGHTS_V2 suma exactamente 1.0 (composite válido)."""
    assert sum(WEIGHTS_V2.values()) == pytest.approx(1.0, abs=1e-9)


def test_weights_v2_expected_distribution():
    """WEIGHTS_V2 valores: crime 40% · natural 25% · title 15% · perception 20%."""
    assert WEIGHTS_V2["crime"] == pytest.approx(0.40)
    assert WEIGHTS_V2["natural"] == pytest.approx(0.25)
    assert WEIGHTS_V2["title"] == pytest.approx(0.15)
    assert WEIGHTS_V2["perception"] == pytest.approx(0.20)


def test_formula_version_is_2():
    """FORMULA_VERSION expone v2 schema."""
    assert FORMULA_VERSION == "2.0.0"


def test_crime_norm_high_5000():
    """CRIME_NORM_HIGH = 5000 incidentes per 100k (CDMX 6m reference)."""
    assert CRIME_NORM_HIGH == pytest.approx(5000.0)
