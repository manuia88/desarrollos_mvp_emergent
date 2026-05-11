"""Wave 3 · Tests hedonic_regression_engine.py · 16 tests unidad sin DB.

Cubre funciones puras del core de regresión hedónica:
- _mean (helper aritmético)
- _new_id (id generator con prefijo)
- _iso (timestamp helper)
- _row_features (feature extraction de transacción → vector)
- _fit_ols_pure (OLS fit · short-circuit insufficient_data + no_variance)
- Constants integrity: FORMULA_VERSION, MIN_SAMPLE_SIZE, DEFAULT_PERIOD_DAYS, NUMERIC_FEATURES
"""
import math

import pytest

from hedonic_regression_engine import (
    DEFAULT_PERIOD_DAYS,
    FORMULA_VERSION,
    MIN_SAMPLE_SIZE,
    NUMERIC_FEATURES,
    _fit_ols_pure,
    _iso,
    _mean,
    _new_id,
    _row_features,
)

pytestmark = pytest.mark.unit


# ─── Constants ───────────────────────────────────────────────────────────────
def test_formula_version_string():
    """FORMULA_VERSION es string semver."""
    assert isinstance(FORMULA_VERSION, str)
    assert len(FORMULA_VERSION.split(".")) == 3


def test_min_sample_size_at_least_30():
    """MIN_SAMPLE_SIZE ≥ 30 (regla estadística OLS)."""
    assert MIN_SAMPLE_SIZE >= 30


def test_default_period_days_180():
    """Window por defecto 180 días (~6 meses, suficiente para OLS)."""
    assert DEFAULT_PERIOD_DAYS == 180


def test_numeric_features_canonical_set():
    """NUMERIC_FEATURES incluye drivers core de precio."""
    assert "m2" in NUMERIC_FEATURES
    assert "recamaras" in NUMERIC_FEATURES
    assert "baños" in NUMERIC_FEATURES
    assert "year_built" in NUMERIC_FEATURES
    assert "proximity_metro_m" in NUMERIC_FEATURES


# ─── _mean ───────────────────────────────────────────────────────────────────
def test_mean_basic_average():
    """Media aritmética simple."""
    assert _mean([1.0, 2.0, 3.0]) == 2.0


def test_mean_empty_returns_zero():
    """Lista vacía → 0 sin ZeroDivisionError."""
    assert _mean([]) == 0.0


# ─── _new_id ─────────────────────────────────────────────────────────────────
def test_new_id_default_prefix():
    """Default prefix 'hm_'."""
    nid = _new_id()
    assert nid.startswith("hm_")
    assert len(nid) > len("hm_")


def test_new_id_custom_prefix():
    """Prefix custom respetado."""
    nid = _new_id("test")
    assert nid.startswith("test_")


def test_new_id_unique_per_call():
    """Dos invocaciones devuelven distinto id."""
    assert _new_id() != _new_id()


# ─── _iso ────────────────────────────────────────────────────────────────────
def test_iso_returns_iso8601_string():
    """_iso → ISO con T separator."""
    s = _iso()
    assert "T" in s
    assert isinstance(s, str)


# ─── _row_features ───────────────────────────────────────────────────────────
def test_row_features_valid_transaction():
    """Transacción válida → dict con log_pm2 y todas las features."""
    doc = {
        "closing_price_mxn": 5_000_000,
        "m2": 100,
        "recamaras": 3,
        "baños": 2,
        "year_built": 2018,
    }
    out = _row_features(doc)
    assert out is not None
    # log(50000) ≈ 10.82
    assert math.isclose(out["log_pm2"], math.log(50000), rel_tol=1e-6)
    assert out["m2"] == 100.0
    assert out["recamaras"] == 3.0


def test_row_features_zero_m2_rejected():
    """m2 = 0 → None (no division)."""
    assert _row_features({"closing_price_mxn": 1_000_000, "m2": 0}) is None


def test_row_features_zero_price_rejected():
    """closing_price_mxn = 0 → None."""
    assert _row_features({"closing_price_mxn": 0, "m2": 80}) is None


def test_row_features_missing_fields_use_defaults():
    """Campos opcionales ausentes → defaults sensatos (year_built=2010)."""
    doc = {"closing_price_mxn": 4_000_000, "m2": 80}
    out = _row_features(doc)
    assert out is not None
    assert out["year_built"] == 2010.0
    assert out["proximity_metro_m"] == 1000.0


# ─── _fit_ols_pure ───────────────────────────────────────────────────────────
# Skip si numpy/statsmodels no instalados (entornos lite)
_HAS_NP = True
try:
    import numpy  # noqa: F401
    import statsmodels.api  # noqa: F401
except Exception:
    _HAS_NP = False


@pytest.mark.skipif(not _HAS_NP, reason="numpy/statsmodels no instalados")
def test_fit_ols_pure_insufficient_data():
    """< MIN_SAMPLE_SIZE rows → available=False reason=insufficient_data."""
    rows = [_row_features({"closing_price_mxn": 1_000_000, "m2": 50})] * 5
    result = _fit_ols_pure([r for r in rows if r])
    assert result["available"] is False
    assert result["reason"] == "insufficient_data"


@pytest.mark.skipif(not _HAS_NP, reason="numpy/statsmodels no instalados")
def test_fit_ols_pure_empty_input():
    """Lista vacía → insufficient_data."""
    result = _fit_ols_pure([])
    assert result["available"] is False
    assert result["sample_size"] == 0


@pytest.mark.skipif(not _HAS_NP, reason="numpy/statsmodels no instalados")
def test_fit_ols_pure_no_variance():
    """Filas con todos los features = 0 → no_variance."""
    rows = [
        {
            "log_pm2": math.log(50000),
            "m2": 0.0, "recamaras": 0.0, "baños": 0.0,
            "year_built": 0.0, "floor": 0.0,
            "proximity_metro_m": 0.0, "denue_density": 0.0,
            "construction_cost_index": 0.0,
        }
        for _ in range(MIN_SAMPLE_SIZE + 1)
    ]
    result = _fit_ols_pure(rows)
    assert result["available"] is False
    assert result["reason"] == "no_variance"
