"""Wave 4 · Tests smart_routing_engine.py · 13 tests unidad sin DB.

Cubre helpers PUROS (no async DB · no LLM · no Phase Y):
- _segment_of_lead / _zone_of_lead (derivación segmento + zona)
- _ensure_utc (tz normalization)
- _estimate_tokens / _extract_tool_calls / _strip_tool_calls (regex helpers)
- DAY_CAPS / MAX_ASESOR_CAPACITY / SLA_SECONDS / MIN_CAP (constants integrity)
- Error module hierarchy

NO testea route_lead / _layer_llm / _layer_cached / _layer_heuristic /
accept_routing / reject_routing / reassign / update_routing_metrics /
auto_route_fresh_leads / run_routing_metrics_cron / ensure_routing_indexes
(requieren AsyncIOMotor + LLM + Phase Y settings).
"""
from datetime import datetime, timezone

import pytest

from agentic_crm.smart_routing_engine import (
    DAY_CAPS,
    MAX_ASESOR_CAPACITY,
    MIN_CAP,
    ROUTING_PENDING_HRS,
    ROUTING_TTL_DAYS,
    SLA_SECONDS,
    SmartRoutingDisabledError,
    SmartRoutingForbiddenError,
    SmartRoutingNotFoundError,
    SmartRoutingRateLimitError,
    _ensure_utc,
    _estimate_tokens,
    _extract_tool_calls,
    _segment_of_lead,
    _strip_tool_calls,
    _zone_of_lead,
)

pytestmark = pytest.mark.unit


# ─── Constants integrity ────────────────────────────────────────────────────

def test_day_caps_4_tiers_ascending():
    """DAY_CAPS T1<T2<T3<T4 segun spec Y.3A."""
    assert set(DAY_CAPS.keys()) == {"T1", "T2", "T3", "T4"}
    assert DAY_CAPS["T1"] == 1000
    assert DAY_CAPS["T2"] == 5000
    assert DAY_CAPS["T3"] == 20000
    assert DAY_CAPS["T1"] < DAY_CAPS["T2"] < DAY_CAPS["T3"] < DAY_CAPS["T4"]


def test_other_constants():
    """MAX_ASESOR_CAPACITY · SLA_SECONDS · MIN_CAP · ROUTING_TTL_DAYS · PENDING_HRS."""
    assert MAX_ASESOR_CAPACITY == 30
    assert SLA_SECONDS == 60
    assert MIN_CAP == 50
    assert ROUTING_TTL_DAYS == 30
    assert ROUTING_PENDING_HRS == 24


# ─── _segment_of_lead ───────────────────────────────────────────────────────

def test_segment_of_lead_high_budget_returns_alto():
    """budget_band='alto'/'high'/'premium' → 'alto'."""
    assert _segment_of_lead({"budget_band": "alto"}) == "alto"
    assert _segment_of_lead({"budget_band": "high"}) == "alto"
    assert _segment_of_lead({"budget_band": "premium"}) == "alto"


def test_segment_of_lead_inversionista_preserved():
    """budget_band='inversionista' → 'inversionista'."""
    assert _segment_of_lead({"budget_band": "inversionista"}) == "inversionista"


def test_segment_of_lead_intent_inversion_returns_inversionista():
    """intent='inversion' → 'inversionista' aunque budget_band missing."""
    assert _segment_of_lead({"intent": "inversion"}) == "inversionista"
    assert _segment_of_lead({"intent": "investor"}) == "inversionista"


def test_segment_of_lead_message_keyword_inversion():
    """Mensaje libre con 'invertir' → 'inversionista'."""
    out = _segment_of_lead({"message": "Hola, quiero invertir en propiedades"})
    assert out == "inversionista"


def test_segment_of_lead_default_medio_when_empty():
    """Sin nada → 'medio'."""
    assert _segment_of_lead({}) == "medio"


# ─── _zone_of_lead ──────────────────────────────────────────────────────────

def test_zone_of_lead_prefers_zone_interest():
    """zone_interest > zone_id > source_metadata.zone_interest."""
    assert _zone_of_lead({"zone_interest": "Polanco", "zone_id": "z2"}) == "Polanco"
    assert _zone_of_lead({"zone_id": "z123"}) == "z123"
    assert _zone_of_lead({"source_metadata": {"zone_interest": "Roma"}}) == "Roma"
    assert _zone_of_lead({}) is None


# ─── _ensure_utc ────────────────────────────────────────────────────────────

def test_ensure_utc_adds_tz_to_naive():
    """datetime naive → recibe tzinfo UTC."""
    out = _ensure_utc(datetime(2026, 5, 10))
    assert out is not None and out.tzinfo is not None


def test_ensure_utc_keeps_aware_datetime():
    """datetime aware (cualquier tz) → mismo objeto."""
    dt = datetime(2026, 5, 10, tzinfo=timezone.utc)
    out = _ensure_utc(dt)
    assert out == dt


def test_ensure_utc_returns_none_for_non_datetime():
    """No datetime → None."""
    assert _ensure_utc("string") is None
    assert _ensure_utc(None) is None
    assert _ensure_utc(123456) is None


# ─── Token helpers ──────────────────────────────────────────────────────────

def test_estimate_tokens_uses_len_div_4_floor_1():
    """Heurística len/4 con piso 1."""
    assert _estimate_tokens("") == 1
    assert _estimate_tokens("a" * 40) == 10
    assert _estimate_tokens(None) == 1


def test_extract_tool_calls_parses_multiple_valid_blocks():
    """Múltiples bloques tool_call → lista de dicts."""
    text = (
        '<tool_call>{"tool":"get_asesores_metrics_30d","params":{}}</tool_call> '
        '<tool_call>{"tool":"get_asesor_zone_expertise","params":{"asesor_id":"x"}}</tool_call>'
    )
    calls = _extract_tool_calls(text)
    assert len(calls) == 2
    assert calls[0]["tool"] == "get_asesores_metrics_30d"
    assert calls[1]["params"]["asesor_id"] == "x"


def test_extract_tool_calls_skips_invalid_json():
    """Bloque con JSON inválido se descarta sin error."""
    text = '<tool_call>not json</tool_call><tool_call>{"tool":"ok"}</tool_call>'
    calls = _extract_tool_calls(text)
    assert len(calls) == 1
    assert calls[0]["tool"] == "ok"


def test_strip_tool_calls_removes_all_blocks_and_trims():
    """Todos los bloques se remueven; resultado strippeado."""
    text = '   pre<tool_call>{"x":1}</tool_call>mid<tool_call>{"y":2}</tool_call>post   '
    out = _strip_tool_calls(text)
    assert "tool_call" not in out
    assert out.startswith("pre") and out.endswith("post")


# ─── Error hierarchy ────────────────────────────────────────────────────────

def test_errors_are_exception_subclasses():
    """Custom errors heredan de Exception."""
    for E in (SmartRoutingDisabledError, SmartRoutingRateLimitError,
              SmartRoutingNotFoundError, SmartRoutingForbiddenError):
        assert issubclass(E, Exception)
        with pytest.raises(E):
            raise E("test")
