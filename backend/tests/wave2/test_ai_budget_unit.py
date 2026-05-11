"""Wave 2 · Tests ai_budget.py · 9 tests unidad sin DB.

Cubre funciones puras + constantes:
- _cost_usd (cálculo combinado in+out × multiplier por modelo)
- _month_iso (formato YYYY-MM UTC)
- Constants integrity: DEFAULT_CAP_MXN, USD_TO_MXN, ALERT_THRESHOLD_PCT, MODEL_COST_PER_1K, MODEL_COST_OUT_MULTIPLIER
"""
from datetime import datetime, timezone

import pytest

from ai_budget import (
    ALERT_THRESHOLD_PCT,
    DEFAULT_CAP_MXN,
    MODEL_COST_OUT_MULTIPLIER,
    MODEL_COST_PER_1K,
    USD_TO_MXN,
    _cost_usd,
    _month_iso,
)

pytestmark = pytest.mark.unit


# ─── _cost_usd ───────────────────────────────────────────────────────────────
def test_cost_usd_zero_tokens_is_zero():
    """0 tokens → 0 cost."""
    assert _cost_usd("claude-haiku-4-5-20251001", 0, 0) == 0.0


def test_cost_usd_haiku_input_only():
    """1000 input tokens haiku = $0.00025 (no output cost)."""
    cost = _cost_usd("claude-haiku-4-5-20251001", 1000, 0)
    assert cost == round(0.00025, 6)


def test_cost_usd_haiku_output_costs_4x_input():
    """1000 output tokens haiku = 4× the input rate (multiplier=4)."""
    cost_in = _cost_usd("claude-haiku-4-5-20251001", 1000, 0)
    cost_out = _cost_usd("claude-haiku-4-5-20251001", 0, 1000)
    assert round(cost_out / cost_in, 2) == 4.0


def test_cost_usd_sonnet_more_expensive_than_haiku():
    """Sonnet cost per 1k tokens > Haiku cost."""
    sonnet = _cost_usd("claude-sonnet-4-5-20250929", 1000, 0)
    haiku = _cost_usd("claude-haiku-4-5-20251001", 1000, 0)
    assert sonnet > haiku


def test_cost_usd_unknown_model_uses_default_rate():
    """Unknown model falls back to default rate (0.001) and multiplier (4)."""
    cost = _cost_usd("unknown-model-xyz", 1000, 0)
    assert cost == round(0.001, 6)


def test_cost_usd_combines_input_and_output():
    """Total cost = input cost + output cost * multiplier."""
    rate = MODEL_COST_PER_1K["claude-haiku-4-5-20251001"]
    mult = MODEL_COST_OUT_MULTIPLIER["claude-haiku-4-5-20251001"]
    expected = round((500 / 1000) * rate + (500 / 1000) * rate * mult, 6)
    assert _cost_usd("claude-haiku-4-5-20251001", 500, 500) == expected


# ─── _month_iso ──────────────────────────────────────────────────────────────
def test_month_iso_format():
    """_month_iso returns 'YYYY-MM' matching current UTC month."""
    result = _month_iso()
    assert len(result) == 7
    assert result[4] == "-"
    now = datetime.now(timezone.utc)
    assert result == f"{now.year}-{now.month:02d}"


def test_month_iso_zero_padded_month():
    """Single-digit months are zero-padded (e.g. '2026-05', not '2026-5')."""
    result = _month_iso()
    month_part = result.split("-")[1]
    assert len(month_part) == 2


# ─── Constants integrity ─────────────────────────────────────────────────────
def test_constants_have_sane_defaults():
    """Default cap, alert threshold and FX rate are within expected ranges."""
    assert DEFAULT_CAP_MXN > 0
    assert 0.0 < ALERT_THRESHOLD_PCT < 1.0
    assert USD_TO_MXN > 0


def test_model_cost_tables_have_default_fallback():
    """Both rate and multiplier tables include a 'default' key (fallback path)."""
    assert "default" in MODEL_COST_PER_1K
    assert "default" in MODEL_COST_OUT_MULTIPLIER
