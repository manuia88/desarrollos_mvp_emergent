"""Wave 4 · Tests match_weights_engine.py · 14 tests unidad sin DB.

Cubre helpers PUROS (no async DB · no Phase Y · no cron):
- DEFAULT_WEIGHTS (7 dimensiones · suma == 1.0)
- ALLOWED_WEIGHT_KEYS (integridad set)
- _sum_weights / _validate_weights / _normalize_weights
- Constants: MANUAL_CHANGES_CAP_PER_DAY · AUTO_TUNE_MIN_INTERVAL_DAYS
- MatchWeightsEngine._tier_num (helper sin DB)
- MatchWeightsEngine._blend_ratio / _blend_weights / _compute_confidence (puros)
- MatchWeightsEngine._compute_learned_weights (puro · lista in-memory)
- Errors module hierarchy

NO testea get_weights / manual_set_weights / auto_tune / apply_tuning /
_fetch_training_data / _persist_tuned_weights / run_match_weights_auto_tune_all_orgs /
ensure_match_weights_indexes (requieren AsyncIOMotor + Phase Y settings).
"""
import pytest

from agentic_crm.match_weights_engine import (
    ALLOWED_WEIGHT_KEYS,
    AUTO_TUNE_MIN_INTERVAL_DAYS,
    DEFAULT_WEIGHTS,
    MANUAL_CHANGES_CAP_PER_DAY,
    MatchWeightsDisabledError,
    MatchWeightsEngine,
    MatchWeightsRateLimitError,
    MatchWeightsValidationError,
    _normalize_weights,
    _sum_weights,
    _validate_weights,
)

pytestmark = pytest.mark.unit


# ─── DEFAULT_WEIGHTS ────────────────────────────────────────────────────────

def test_default_weights_sums_to_one():
    """Suma de DEFAULT_WEIGHTS debe ser exactamente 1.0."""
    total = sum(DEFAULT_WEIGHTS.values())
    assert abs(total - 1.0) < 1e-9


def test_default_weights_contains_7_canonical_keys():
    """ALLOWED_WEIGHT_KEYS == keys de DEFAULT_WEIGHTS · 7 dimensiones."""
    expected = {"zona", "precio", "segment", "amenidades", "timing",
                "behavioral_intent", "disc_match"}
    assert ALLOWED_WEIGHT_KEYS == expected
    assert set(DEFAULT_WEIGHTS.keys()) == expected


def test_constants_caps_match_spec():
    """Caps según spec W4.7 Y.4B."""
    assert MANUAL_CHANGES_CAP_PER_DAY == 5
    assert AUTO_TUNE_MIN_INTERVAL_DAYS == 6


# ─── _sum_weights / _validate_weights ──────────────────────────────────────

def test_sum_weights_returns_total():
    """Suma de pesos individuales."""
    w = {"zona": 0.5, "precio": 0.3, "segment": 0.2}
    assert abs(_sum_weights(w) - 1.0) < 1e-9


def test_validate_weights_ok_when_sum_is_one():
    """Sum ≈ 1.0 ± 0.05 → None (válido)."""
    w = dict(DEFAULT_WEIGHTS)
    assert _validate_weights(w) is None


def test_validate_weights_rejects_invalid_key():
    """Key no en ALLOWED_WEIGHT_KEYS → string de error."""
    w = {"zona": 1.0, "unknown_key": 0.0}
    err = _validate_weights(w)
    assert err is not None
    assert "no reconocida" in err.lower() or "unknown_key" in err


def test_validate_weights_rejects_value_out_of_range():
    """Peso > 1.0 o < 0 → error."""
    err = _validate_weights({"zona": 1.5})
    assert err is not None and "entre 0 y 1" in err


def test_validate_weights_rejects_bad_sum():
    """Suma fuera de [0.95, 1.05] → error."""
    w = {"zona": 0.3, "precio": 0.3}  # suma 0.6 (otros 0)
    err = _validate_weights(w)
    assert err is not None
    assert "sumar 1" in err or "0.6" in err


# ─── _normalize_weights ─────────────────────────────────────────────────────

def test_normalize_weights_scales_to_one():
    """Normaliza pesos arbitrarios para que sumen 1.0."""
    raw = {"zona": 2.0, "precio": 2.0, "segment": 2.0, "amenidades": 2.0, "timing": 2.0}
    out = _normalize_weights(raw)
    total = sum(out.values())
    assert abs(total - 1.0) < 1e-4
    # Cada uno debería ser 0.2 (5 dims iguales)
    assert abs(out["zona"] - 0.2) < 1e-4


def test_normalize_weights_zero_total_returns_defaults():
    """Si suma ≤ 0 → retorna DEFAULT_WEIGHTS."""
    out = _normalize_weights({"zona": 0.0, "precio": 0.0})
    assert out == DEFAULT_WEIGHTS


# ─── MatchWeightsEngine helpers (sin DB) ────────────────────────────────────

def _engine() -> MatchWeightsEngine:
    """Crea engine sin conexión real."""
    return MatchWeightsEngine(db=None, org_id="org_test")


def test_tier_num_parses_tier_strings():
    """T1 → 1 · T3 → 3 · off/disabled/None → 0."""
    e = _engine()
    assert e._tier_num("T1") == 1
    assert e._tier_num("T3") == 3
    assert e._tier_num("off") == 0
    assert e._tier_num("disabled") == 0
    assert e._tier_num(None) == 0
    assert e._tier_num("bogus") == 0


def test_blend_ratio_thresholds():
    """sample<30 → 0 · 30-100 → 0.5 · 100+ → ramp linear hasta 1.0."""
    e = _engine()
    assert e._blend_ratio(10) == 0.0
    assert e._blend_ratio(50) == 0.5
    assert e._blend_ratio(100) == 0.5
    # Ramp: 150 → 0.5 + 50/200 = 0.75
    assert abs(e._blend_ratio(150) - 0.75) < 1e-6
    assert e._blend_ratio(300) == 1.0


def test_blend_weights_full_learned_when_ratio_1():
    """ratio=1.0 → full learned · ratio=0.0 → full defaults."""
    e = _engine()
    learned = {k: 0.5 for k in ALLOWED_WEIGHT_KEYS}
    learned["zona"] = 0.8
    out_full = e._blend_weights(learned, DEFAULT_WEIGHTS, 1.0)
    assert out_full["zona"] == 0.8
    out_default = e._blend_weights(learned, DEFAULT_WEIGHTS, 0.0)
    assert out_default["zona"] == DEFAULT_WEIGHTS["zona"]


def test_compute_confidence_zero_below_threshold():
    """sample_size <30 o n_closed <5 → confidence=0."""
    e = _engine()
    assert e._compute_confidence(sample_size=20, n_closed=10) == 0
    assert e._compute_confidence(sample_size=200, n_closed=3) == 0


def test_compute_confidence_caps_and_bonus_in_valid_range():
    """Sample válido grande con conversion rate normal → confidence en [30, 100]."""
    e = _engine()
    c = e._compute_confidence(sample_size=200, n_closed=20)  # conv=0.10 → bonus
    assert 30 <= c <= 100
    # Caso pequeño justo en el umbral
    c2 = e._compute_confidence(sample_size=30, n_closed=5)
    assert c2 >= 0


def test_compute_learned_weights_falls_back_to_defaults_when_no_closed():
    """Sin closed leads → retorna DEFAULT_WEIGHTS."""
    e = _engine()
    out = e._compute_learned_weights(closed=[], open_leads=[])
    assert out == DEFAULT_WEIGHTS


def test_compute_learned_weights_emphasizes_dominant_dim():
    """Si closed tiene mucho zone vs open → zona learned > otras."""
    e = _engine()
    closed = [{"zone": 90, "conversion": 50, "segment": 50,
               "capacity": 50, "schedule": 10} for _ in range(10)]
    open_leads = [{"zone": 20, "conversion": 50, "segment": 50,
                   "capacity": 50, "schedule": 10} for _ in range(10)]
    out = e._compute_learned_weights(closed, open_leads)
    assert out["zona"] > out["segment"]
    assert out["zona"] > out["amenidades"]
    # behavioral_intent y disc_match siempre 0 (futuro)
    assert out["behavioral_intent"] == 0.0
    assert out["disc_match"] == 0.0


# ─── Error hierarchy ────────────────────────────────────────────────────────

def test_errors_are_exception_subclasses():
    """Custom errors heredan de Exception."""
    for E in (MatchWeightsDisabledError, MatchWeightsValidationError,
              MatchWeightsRateLimitError):
        assert issubclass(E, Exception)
        with pytest.raises(E):
            raise E("test")
