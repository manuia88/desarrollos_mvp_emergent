"""Wave 3 · Tests construction_cost_engine.py · 13 tests unidad sin DB ni red.

Cubre:
- Constants integrity (BASE_COSTS · ZONE_PREMIUM · series IDs · BANXICO/INEGI URLs)
- Token helpers (_banxico_token · _inegi_token)
- _iso (ISO timestamp UTC)

Funciones async con red/Mongo (_fetch_banxico_series · _fetch_inegi_inpp ·
predict_cost_per_m2 · get_or_compute_cost · forecast_total · cron_*) → diferidas a
integration tests (necesitan httpx mock + mongomock).

NO modifica código existente · solo lectura.
"""
import pytest

from construction_cost_engine import (
    BASE_COSTS,
    ZONE_PREMIUM,
    BANXICO_BASE,
    INEGI_BASE,
    BANXICO_SERIES_INCC,
    BANXICO_SERIES_EDIF,
    INEGI_INPP_CONST,
    _banxico_token,
    _inegi_token,
    _iso,
)


pytestmark = pytest.mark.unit


# ─── 1. BASE_COSTS catalog: vertical / horizontal × entry / mid / luxury ─────


def test_base_costs_vertical_tiers_present():
    """vertical tiene entry/mid/luxury · valores positivos crecientes."""
    v = BASE_COSTS["vertical"]
    assert v["entry"] > 0
    assert v["mid"] > v["entry"]
    assert v["luxury"] > v["mid"]


def test_base_costs_horizontal_tiers_present():
    """horizontal tiene entry/mid/luxury · valores positivos crecientes."""
    h = BASE_COSTS["horizontal"]
    assert h["entry"] > 0
    assert h["mid"] > h["entry"]
    assert h["luxury"] > h["mid"]


def test_base_costs_canonical_values_2025():
    """Valores de referencia CDMX 2025 — catch silent edits."""
    assert BASE_COSTS["vertical"]["entry"] == 10_500.0
    assert BASE_COSTS["vertical"]["mid"] == 15_800.0
    assert BASE_COSTS["vertical"]["luxury"] == 26_000.0
    assert BASE_COSTS["horizontal"]["entry"] == 8_000.0
    assert BASE_COSTS["horizontal"]["mid"] == 12_500.0
    assert BASE_COSTS["horizontal"]["luxury"] == 18_500.0


def test_base_costs_vertical_more_expensive_than_horizontal():
    """Vertical siempre más caro que horizontal por tier (estructura/sismo)."""
    for tier in ("entry", "mid", "luxury"):
        assert BASE_COSTS["vertical"][tier] > BASE_COSTS["horizontal"][tier]


# ─── 2. ZONE_PREMIUM multipliers ─────────────────────────────────────────────


def test_zone_premium_polanco_above_one():
    """Zonas tier alto (Polanco · Lomas · Santa Fe) > 1.0."""
    assert ZONE_PREMIUM["polanco"] > 1.0
    assert ZONE_PREMIUM["lomas"] > 1.0
    assert ZONE_PREMIUM["santa_fe"] > 1.0


def test_zone_premium_low_tier_below_one():
    """Zonas tier popular (Iztapalapa · Ecatepec) < 1.0."""
    assert ZONE_PREMIUM["iztapalapa"] < 1.0
    assert ZONE_PREMIUM["ecatepec"] < 1.0
    assert ZONE_PREMIUM["doctores"] < 1.0


def test_zone_premium_canonical_keys_present():
    """Set de zonas catalogadas — catch silent removals."""
    expected = {"polanco", "santa_fe", "lomas", "condesa", "roma",
                "napoles", "doctores", "iztapalapa", "ecatepec"}
    assert expected.issubset(set(ZONE_PREMIUM.keys()))


# ─── 3. Series IDs + base URLs ───────────────────────────────────────────────


def test_banxico_series_ids_intact():
    """Series BANXICO INPC construcción + Costos Edificación."""
    assert BANXICO_SERIES_INCC == "SF61745"
    assert BANXICO_SERIES_EDIF == "SF111290"


def test_inegi_inpp_indicator_intact():
    """Indicador INEGI INPP construcción."""
    assert INEGI_INPP_CONST == "914339"


def test_base_urls_https():
    """Endpoints externos en HTTPS."""
    assert BANXICO_BASE.startswith("https://")
    assert INEGI_BASE.startswith("https://")
    assert "banxico" in BANXICO_BASE.lower()
    assert "inegi" in INEGI_BASE.lower()


# ─── 4. Token helpers ────────────────────────────────────────────────────────


def test_banxico_token_reads_env(monkeypatch):
    """Token resuelve IE_BANXICO_TOKEN · ausente → None."""
    monkeypatch.delenv("IE_BANXICO_TOKEN", raising=False)
    assert _banxico_token() is None
    monkeypatch.setenv("IE_BANXICO_TOKEN", "abc")
    assert _banxico_token() == "abc"


def test_inegi_token_reads_env(monkeypatch):
    """Token resuelve IE_INEGI_TOKEN · ausente → None."""
    monkeypatch.delenv("IE_INEGI_TOKEN", raising=False)
    assert _inegi_token() is None
    monkeypatch.setenv("IE_INEGI_TOKEN", "xyz")
    assert _inegi_token() == "xyz"


# ─── 5. _iso timestamp ───────────────────────────────────────────────────────


def test_iso_returns_utc_iso_string():
    """_iso() retorna string ISO con offset UTC."""
    val = _iso()
    assert isinstance(val, str)
    # ISO format starts with YYYY-MM-DDTHH:MM
    assert len(val) >= 19
    assert val[4] == "-" and val[7] == "-" and val[10] == "T"
    # tz info: ends in +00:00 or Z
    assert val.endswith("+00:00") or val.endswith("Z")
