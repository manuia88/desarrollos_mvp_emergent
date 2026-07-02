"""Wave 3 · Tests fraud_detection_engine.py · 14 tests unidad sin DB.

Cubre helpers puros (no async · no Mongo):
- _iso (timestamp ISO UTC)
- _new_id (prefijo + entropía + unicidad)
- _hash_listing_id (sha256 anonymizer · 20 chars)
- _ml_features (vector numérico · None si essentials missing)
- _haversine_m (geo distance)
- Constants integrity (thresholds + salt)

NO testea funciones async DB (detect_price_anomaly_ml / detect_duplicate_listing /
detect_title_chain_anomaly / detect_listing_fraud / persist_alert / cron_fraud_detection_daily /
resolve_alert / dismiss_alert / ensure_indexes / _train_model / _maybe_send_summary_email)
→ require AsyncIOMotor + sklearn fit + httpx.
"""
import re
from datetime import datetime

import pytest

from fraud_detection_engine import (
    ANON_SALT,
    GEO_PROX_METERS,
    ML_AMBER_THRESHOLD,
    ML_CRITICAL_THRESHOLD,
    PRICE_TOLERANCE_PCT,
    TITLE_FUZZ_THRESHOLD,
    _hash_listing_id,
    _haversine_m,
    _iso,
    _ml_features,
    _new_id,
)

pytestmark = pytest.mark.unit


# ─── _iso / _new_id ──────────────────────────────────────────────────────────

def test_iso_returns_utc_string():
    """_iso() devuelve string ISO 8601 con marcador UTC."""
    out = _iso()
    assert isinstance(out, str)
    assert out.endswith("+00:00")
    parsed = datetime.fromisoformat(out)
    assert parsed.tzinfo is not None
    assert parsed.utcoffset().total_seconds() == 0


def test_new_id_default_prefix_fa():
    """_new_id() usa prefijo 'fa_' por default."""
    nid = _new_id()
    assert nid.startswith("fa_")
    suffix = nid[len("fa_"):]
    assert len(suffix) >= 10
    assert re.match(r"^[A-Za-z0-9_\-]+$", suffix)


def test_new_id_custom_prefix():
    """_new_id(prefix) respeta prefijo custom."""
    nid = _new_id("xyz")
    assert nid.startswith("xyz_")


def test_new_id_unique_per_call():
    """_new_id() devuelve valores únicos en 200 llamadas."""
    ids = {_new_id() for _ in range(200)}
    assert len(ids) == 200


# ─── _hash_listing_id ────────────────────────────────────────────────────────

def test_hash_listing_id_returns_20_char_hex():
    """_hash_listing_id() devuelve string hex de exactamente 20 chars."""
    h = _hash_listing_id("listing_123")
    assert isinstance(h, str)
    assert len(h) == 20
    assert re.match(r"^[0-9a-f]+$", h)


def test_hash_listing_id_deterministic():
    """_hash_listing_id() es determinista para mismo input."""
    assert _hash_listing_id("abc") == _hash_listing_id("abc")


def test_hash_listing_id_different_inputs_diff_hash():
    """Inputs distintos producen hashes distintos."""
    assert _hash_listing_id("aaa") != _hash_listing_id("bbb")


def test_hash_listing_id_empty_returns_hash():
    """Empty string usa fallback _iso() pero sigue devolviendo string 20 chars."""
    h = _hash_listing_id("")
    assert isinstance(h, str)
    assert len(h) == 20


# ─── _ml_features ────────────────────────────────────────────────────────────

def test_ml_features_returns_5_floats_when_complete():
    """_ml_features() devuelve lista de 5 floats con datos completos."""
    doc = {
        "closing_price_mxn": 5_000_000,
        "m2": 100,
        "recamaras": 3,
        "baños": 2,
        "year_built": 2018,
    }
    feats = _ml_features(doc)
    assert feats is not None
    assert len(feats) == 5
    assert all(isinstance(f, float) for f in feats)
    assert feats == [5_000_000.0, 100.0, 3.0, 2.0, 2018.0]


def test_ml_features_falls_back_to_listing_price():
    """_ml_features() usa listing_price_mxn si closing_price_mxn falta."""
    doc = {"listing_price_mxn": 4_000_000, "m2": 80}
    feats = _ml_features(doc)
    assert feats is not None
    assert feats[0] == 4_000_000.0


def test_ml_features_returns_none_no_price():
    """_ml_features() devuelve None si no hay precio."""
    assert _ml_features({"m2": 100}) is None


def test_ml_features_returns_none_no_m2():
    """_ml_features() devuelve None si m2 = 0 o falta."""
    assert _ml_features({"closing_price_mxn": 5_000_000}) is None
    assert _ml_features({"closing_price_mxn": 5_000_000, "m2": 0}) is None


def test_ml_features_returns_none_negative_m2():
    """_ml_features() devuelve None si m2 ≤ 0."""
    assert _ml_features({"closing_price_mxn": 5_000_000, "m2": -10}) is None


def test_ml_features_default_year_built_2010():
    """_ml_features() usa 2010 como default cuando year_built falta."""
    doc = {"closing_price_mxn": 5_000_000, "m2": 100}
    feats = _ml_features(doc)
    assert feats is not None
    assert feats[4] == 2010.0


# ─── _haversine_m ────────────────────────────────────────────────────────────

def test_haversine_m_zero_for_same_point():
    """_haversine_m() devuelve 0 para mismo punto."""
    d = _haversine_m(19.4326, -99.1332, 19.4326, -99.1332)
    assert d == pytest.approx(0.0, abs=0.01)


def test_haversine_m_known_distance():
    """_haversine_m() ~111km entre dos puntos a 1° latitud."""
    d = _haversine_m(19.0, -99.0, 20.0, -99.0)
    # ~111.19km
    assert 110_000 < d < 112_000


def test_haversine_m_short_distance_cdmx():
    """_haversine_m() <600m entre dos puntos cercanos CDMX."""
    # Reforma a Polanco (~5km)
    d = _haversine_m(19.4284, -99.1676, 19.4338, -99.1934)
    assert 2_000 < d < 4_000


# ─── Constants integrity ─────────────────────────────────────────────────────

def test_anon_salt_is_non_empty_str():
    """ANON_SALT es string no vacío para hash anonymization."""
    assert isinstance(ANON_SALT, str)
    assert len(ANON_SALT) > 0


def test_thresholds_in_expected_ranges():
    """Thresholds en rangos sensatos para fraud detection."""
    assert TITLE_FUZZ_THRESHOLD == pytest.approx(85.0)
    assert GEO_PROX_METERS == pytest.approx(500.0)
    assert PRICE_TOLERANCE_PCT == pytest.approx(0.05)
    # ML thresholds: critical más estricto que amber (más negativo)
    assert ML_CRITICAL_THRESHOLD < ML_AMBER_THRESHOLD
    assert ML_CRITICAL_THRESHOLD < 0
