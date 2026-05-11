"""Wave 2 · Tests intelligence_insights_engine.py · 9 tests unidad sin DB.

Cubre helpers puros (lógica sin Mongo · sin Claude API):
- _similarity (0..1 sobre 3 KPIs · masks None)
- _stub_brief (heurística honesta cuando IA no disponible)
- _new_id (prefix `brief_`)
- Constants (FRESH_DAYS · TTL_DAYS · LAYER_KEYS · DEFAULT_MODEL)

Funciones async con Mongo o LLM (_gather_context · _claude_sonnet_brief ·
get_cached_brief · generate_brief · _persist_brief · comparables_matrix ·
heatmap_multi_layer · executive_overview · cron_weekly_refresh ·
_email_founder_digest) → diferidas a integration tests (requieren mongo + LLM mock).

NO toca infra · NO modifica código existente · solo lectura.
"""
import pytest

from intelligence_insights_engine import (
    _similarity,
    _stub_brief,
    _new_id,
    LAYER_KEYS,
    FRESH_DAYS,
    TTL_DAYS,
    DEFAULT_MODEL,
)

pytestmark = pytest.mark.unit


# ─── 1. _similarity: 0..1 sobre 3 KPIs ────────────────────────────────────────


def test_similarity_identical_kpis_returns_one():
    """KPIs idénticos → 1.0 (deltas = 0 → 1 - mean(0) = 1)."""
    a = {"avg_price_per_m2": 100_000, "units_total": 50, "conversion_rate": 30}
    b = {"avg_price_per_m2": 100_000, "units_total": 50, "conversion_rate": 30}
    assert _similarity(a, b) == 1.0


def test_similarity_proportional_kpis():
    """Dobles · todos los deltas relativos = 0.5 → similitud = 0.5."""
    a = {"avg_price_per_m2": 100_000, "units_total": 50, "conversion_rate": 30}
    c = {"avg_price_per_m2": 200_000, "units_total": 100, "conversion_rate": 60}
    assert _similarity(a, c) == 0.5


def test_similarity_skips_none_keys():
    """KPIs con None se omiten del cálculo (no rompen)."""
    a = {"avg_price_per_m2": 100_000, "units_total": 50, "conversion_rate": 30}
    d = {"avg_price_per_m2": None, "units_total": 50, "conversion_rate": 30}
    # solo 2 deltas (ambos 0) → similitud 1.0
    assert _similarity(a, d) == 1.0


def test_similarity_all_none_returns_zero():
    """Sin deltas válidos → 0.0 (denominador safety)."""
    e = {"avg_price_per_m2": None, "units_total": None, "conversion_rate": None}
    f = {"avg_price_per_m2": None, "units_total": None, "conversion_rate": None}
    assert _similarity(e, f) == 0.0


# ─── 2. _stub_brief: heurística honesta ───────────────────────────────────────


def test_stub_brief_marks_state_bull_when_growth_positive():
    """growth_pct_30d > 5 → market_state 'bull'."""
    ctx = {
        "kpis": {"units_total": 100, "conversion_rate": 35.5, "avg_price_mxn": 5_000_000},
        "growth_pct_30d": 6.0,
    }
    stub = _stub_brief(ctx, reason="test")
    assert stub["market_state"] == "bull"
    assert stub["model"] == "stub"
    assert stub["confidence_pct"] == 35
    assert stub["ai_cost_mxn"] == 0.0
    assert stub["stub_reason"] == "test"
    assert len(stub["key_findings"]) == 5
    assert len(stub["top_risks"]) == 3
    assert len(stub["opportunities"]) == 3


def test_stub_brief_marks_state_bear_when_growth_negative():
    """growth_pct_30d < -5 → market_state 'bear'."""
    ctx = {"kpis": {}, "growth_pct_30d": -8.0}
    stub = _stub_brief(ctx, reason="r")
    assert stub["market_state"] == "bear"


def test_stub_brief_state_stable_default_and_none_growth():
    """growth en rango [-5, 5] o None → 'stable'."""
    stub_a = _stub_brief({"kpis": {}, "growth_pct_30d": 2.0}, reason="r")
    assert stub_a["market_state"] == "stable"
    stub_b = _stub_brief({"kpis": {}, "growth_pct_30d": None}, reason="r")
    assert stub_b["market_state"] == "stable"


# ─── 3. _new_id: prefix `brief_` ──────────────────────────────────────────────


def test_new_id_prefix_and_uniqueness():
    """_new_id devuelve string `brief_*` · únicos por llamada."""
    nid = _new_id()
    assert nid.startswith("brief_")
    assert len(nid) > len("brief_")
    ids = {_new_id() for _ in range(20)}
    assert len(ids) == 20


# ─── 4. Constants integrity ───────────────────────────────────────────────────


def test_constants_intact():
    """Constants públicas con valores canónicos."""
    assert FRESH_DAYS == 7
    assert TTL_DAYS == 90
    assert LAYER_KEYS == ("price", "demand", "risk", "supply")
    assert DEFAULT_MODEL == "claude-sonnet-4-5-20250929"
