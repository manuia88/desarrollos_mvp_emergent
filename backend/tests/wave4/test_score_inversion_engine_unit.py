"""Wave 4 · Tests score_inversion_engine.py · 15 tests unidad sin DB.

Cubre funciones PURAS del DMX Score:
- _normalize_tir / _normalize_zone / _normalize_demand / _normalize_stress
- _label_for (AAA/AA/A/BBB/BB/B mapping)
- _score_id (hash determinista)
- WEIGHTS aggregation (TIR 40% + Zone 30% + Demand 20% + Stress 10%)
- ZONE_TIER_TO_SCORE integrity

NO testea async compute_score / DB / engines downstream → require infra.
"""
import pytest

from score_inversion_engine import (
    WEIGHTS,
    ZONE_TIER_TO_SCORE,
    _label_for,
    _normalize_demand,
    _normalize_stress,
    _normalize_tir,
    _normalize_zone,
    _score_id,
)

pytestmark = pytest.mark.unit


# ─── WEIGHTS integrity ───────────────────────────────────────────────────────

def test_weights_sum_to_100():
    """4 factores: TIR 40% + Zone 30% + Demand 20% + Stress 10% = 100%."""
    total = WEIGHTS["tir"] + WEIGHTS["zone"] + WEIGHTS["demand"] + WEIGHTS["stress"]
    assert total == pytest.approx(1.0)


def test_weights_individual_values():
    """Pesos canónicos verbatim del producto."""
    assert WEIGHTS["tir"] == 0.40
    assert WEIGHTS["zone"] == 0.30
    assert WEIGHTS["demand"] == 0.20
    assert WEIGHTS["stress"] == 0.10


# ─── _normalize_tir ──────────────────────────────────────────────────────────

def test_normalize_tir_none_returns_50():
    """TIR None → 50 (neutral)."""
    assert _normalize_tir(None) == 50.0


def test_normalize_tir_15pct_caps_at_100():
    """TIR ≥ 15% → 100 (cap superior)."""
    assert _normalize_tir(15) == 100.0
    assert _normalize_tir(25) == 100.0


def test_normalize_tir_zero_returns_zero():
    """TIR ≤ 0% → 0."""
    assert _normalize_tir(0) == 0.0
    assert _normalize_tir(-5) == 0.0


def test_normalize_tir_7_5pct_linear():
    """TIR 7.5% → 50 (linear midpoint)."""
    assert _normalize_tir(7.5) == 50.0


# ─── _normalize_zone ─────────────────────────────────────────────────────────

def test_normalize_zone_none_returns_50():
    """Zone doc None → 50 (neutral)."""
    assert _normalize_zone(None) == 50.0


def test_normalize_zone_uses_score_total():
    """Si zone_doc tiene score_total, lo usa."""
    assert _normalize_zone({"score_total": 85}) == 85.0


def test_normalize_zone_falls_back_to_score():
    """Fallback a 'score' si no hay score_total."""
    assert _normalize_zone({"score": 70}) == 70.0


def test_normalize_zone_tier_letter_mapping():
    """Tier A → 95, B → 80, etc. (cuando no hay score numérico)."""
    assert _normalize_zone({"tier": "A"}) == 95.0
    assert _normalize_zone({"tier": "F"}) == 20.0


# ─── _normalize_demand ───────────────────────────────────────────────────────

def test_normalize_demand_none_returns_50():
    """gap_score None → 50 (neutral)."""
    assert _normalize_demand(None) == 50.0


def test_normalize_demand_high_gap_caps_100():
    """gap ≥ 30 → 100."""
    assert _normalize_demand(30) == 100.0
    assert _normalize_demand(60) == 100.0


def test_normalize_demand_low_gap_caps_zero():
    """gap ≤ -30 → 0."""
    assert _normalize_demand(-30) == 0.0
    assert _normalize_demand(-50) == 0.0


def test_normalize_demand_zero_returns_50():
    """gap = 0 → 50 (centro)."""
    assert _normalize_demand(0) == 50.0


# ─── _normalize_stress ───────────────────────────────────────────────────────

def test_normalize_stress_none_returns_50():
    """stress_result None → 50 (neutral)."""
    assert _normalize_stress(None) == 50.0


def test_normalize_stress_all_positive_returns_100():
    """100% escenarios positivos → 100."""
    stress = {"scenarios": [{"roi_pct": 5}, {"roi_pct": 10}, {"roi_pct": 0}]}
    assert _normalize_stress(stress) == 100.0


def test_normalize_stress_half_positive_returns_50():
    """50% positivos → 50."""
    stress = {"scenarios": [{"roi_pct": 5}, {"roi_pct": -10}]}
    assert _normalize_stress(stress) == 50.0


# ─── _label_for · DMX Score tier mapping ─────────────────────────────────────

def test_label_for_aaa_at_90():
    """Score 90+ → AAA."""
    assert _label_for(95)["tier"] == "AAA"
    assert _label_for(90)["tier"] == "AAA"


def test_label_for_aa_at_80():
    """Score 80-89 → AA."""
    assert _label_for(85)["tier"] == "AA"
    assert _label_for(80)["tier"] == "AA"


def test_label_for_a_at_70():
    """Score 70-79 → A."""
    assert _label_for(75)["tier"] == "A"


def test_label_for_bbb_at_60():
    """Score 60-69 → BBB."""
    assert _label_for(65)["tier"] == "BBB"


def test_label_for_bb_at_50():
    """Score 50-59 → BB · etiqueta especulativo."""
    info = _label_for(55)
    assert info["tier"] == "BB"
    assert "Especulativo" in info["label"]


def test_label_for_b_below_50():
    """Score <50 → B · alto riesgo."""
    info = _label_for(30)
    assert info["tier"] == "B"
    assert "riesgo" in info["label"].lower()


def test_label_for_all_includes_recommendation():
    """Todos los tiers incluyen recommendation string."""
    for score in (95, 85, 75, 65, 55, 30):
        info = _label_for(score)
        assert "recommendation" in info
        assert len(info["recommendation"]) > 0


# ─── _score_id determinismo ──────────────────────────────────────────────────

def test_score_id_deterministic():
    """Mismos inputs → mismo score_id."""
    a = _score_id("polanco", 5_000_000, 24, 80, 2, 2, 5)
    b = _score_id("polanco", 5_000_000, 24, 80, 2, 2, 5)
    assert a == b


def test_score_id_different_inputs_differ():
    """Inputs distintos → score_id distinto."""
    a = _score_id("polanco", 5_000_000, 24, 80, 2, 2, 5)
    b = _score_id("condesa", 5_000_000, 24, 80, 2, 2, 5)
    assert a != b


def test_score_id_length_24():
    """score_id es 24 hex chars."""
    assert len(_score_id("roma", 3_000_000, 36, 90, 3, 2, 0)) == 24


# ─── ZONE_TIER_TO_SCORE integrity ────────────────────────────────────────────

def test_zone_tier_to_score_covers_all_tiers():
    """ZONE_TIER_TO_SCORE incluye A/B/C/D/E/F."""
    assert set(ZONE_TIER_TO_SCORE.keys()) == {"A", "B", "C", "D", "E", "F"}


def test_zone_tier_to_score_a_greater_than_f():
    """A score >> F score (orden monotónico)."""
    assert ZONE_TIER_TO_SCORE["A"] > ZONE_TIER_TO_SCORE["F"]
    assert ZONE_TIER_TO_SCORE["A"] > ZONE_TIER_TO_SCORE["B"]
    assert ZONE_TIER_TO_SCORE["B"] > ZONE_TIER_TO_SCORE["C"]
