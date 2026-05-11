"""Wave 4 · Tests visit_prep_engine.py · 11 tests unidad sin DB.

Cubre helpers PUROS (no async DB · no LLM · no Resend · no Phase Y):
- _segment_of_lead / _zone_of_lead (lead profile derivation)
- _parse_visit_dt (datetime + str ISO parsing)
- _ensure_utc (tz normalization)
- _normalize_dossier_content (shape defensivo)
- _estimate_tokens / _extract_tool_calls / _strip_tool_calls (regex helpers)
- DAY_CAPS constants integrity
- Error module hierarchy

NO testea generate_dossier / _layer_llm / _layer_cached / _layer_heuristic /
send_email / mark_viewed / run_visit_prep_daily / ensure_visit_prep_indexes
(requieren AsyncIOMotor + LLM + Resend + Phase Y settings).
"""
from datetime import datetime, timezone

import pytest

from agentic_crm.visit_prep_engine import (
    DAY_CAPS,
    VisitPrepDisabledError,
    VisitPrepForbiddenError,
    VisitPrepNotFoundError,
    VisitPrepRateLimitError,
    _ensure_utc,
    _estimate_tokens,
    _extract_tool_calls,
    _normalize_dossier_content,
    _parse_visit_dt,
    _segment_of_lead,
    _strip_tool_calls,
    _zone_of_lead,
)

pytestmark = pytest.mark.unit


# ─── Constants integrity ────────────────────────────────────────────────────

def test_day_caps_have_4_tiers():
    """DAY_CAPS T1 < T2 < T3 < T4 (T4 prácticamente ilimitado)."""
    assert set(DAY_CAPS.keys()) == {"T1", "T2", "T3", "T4"}
    assert DAY_CAPS["T1"] < DAY_CAPS["T2"] < DAY_CAPS["T3"] < DAY_CAPS["T4"]
    assert DAY_CAPS["T1"] == 50
    assert DAY_CAPS["T2"] == 100
    assert DAY_CAPS["T3"] == 200


# ─── _segment_of_lead ───────────────────────────────────────────────────────

def test_segment_of_lead_high_budget_returns_band():
    """budget_band='alto' → segment 'alto'."""
    assert _segment_of_lead({"budget_band": "alto"}) == "alto"
    assert _segment_of_lead({"budget_band": "premium"}) == "premium"
    assert _segment_of_lead({"budget_band": "high"}) == "high"


def test_segment_of_lead_intent_inversion_returns_inversionista():
    """intent='inversion' sin budget alto → 'inversionista'."""
    assert _segment_of_lead({"intent": "inversion"}) == "inversionista"
    assert _segment_of_lead({"intent": "inversionista"}) == "inversionista"


def test_segment_of_lead_default_medio_when_empty():
    """Sin budget ni intent → 'medio'."""
    assert _segment_of_lead({}) == "medio"


# ─── _zone_of_lead ──────────────────────────────────────────────────────────

def test_zone_of_lead_picks_first_available_key():
    """Prefiere zone_interest > zone_id > source_metadata.zone_interest."""
    assert _zone_of_lead({"zone_interest": "Polanco"}) == "Polanco"
    assert _zone_of_lead({"zone_id": "z123"}) == "z123"
    assert _zone_of_lead({"source_metadata": {"zone_interest": "Roma"}}) == "Roma"
    assert _zone_of_lead({}) is None


# ─── _parse_visit_dt ────────────────────────────────────────────────────────

def test_parse_visit_dt_accepts_datetime():
    """datetime aware → mismo objeto (con tz UTC)."""
    dt = datetime(2026, 5, 10, 14, 30, tzinfo=timezone.utc)
    out = _parse_visit_dt(dt)
    assert out == dt
    assert out.tzinfo is not None


def test_parse_visit_dt_accepts_iso_strings_with_z():
    """ISO con sufijo Z → datetime UTC."""
    out = _parse_visit_dt("2026-05-10T14:30:00Z")
    assert out is not None
    assert out.year == 2026 and out.month == 5
    assert out.tzinfo is not None


def test_parse_visit_dt_returns_none_on_bad_input():
    """Input no parseable → None."""
    assert _parse_visit_dt("abc") is None
    assert _parse_visit_dt(None) is None
    assert _parse_visit_dt(123) is None


# ─── _ensure_utc ────────────────────────────────────────────────────────────

def test_ensure_utc_adds_tz_to_naive():
    """Naive datetime → recibe tzinfo UTC."""
    naive = datetime(2026, 5, 10, 14, 0)
    out = _ensure_utc(naive)
    assert out is not None and out.tzinfo is not None


def test_ensure_utc_returns_none_on_non_datetime():
    """Non-datetime → None."""
    assert _ensure_utc("string") is None
    assert _ensure_utc(None) is None


# ─── _normalize_dossier_content ─────────────────────────────────────────────

def test_normalize_dossier_content_returns_full_shape():
    """Shape estable con defaults seguros."""
    out = _normalize_dossier_content({})
    for k in ("buyer_profile", "top_3_comparables_likely_asked",
              "likely_objections", "talking_points", "key_project_data",
              "recommended_units"):
        assert k in out
    assert isinstance(out["top_3_comparables_likely_asked"], list)
    assert isinstance(out["talking_points"], list)


def test_normalize_dossier_content_truncates_lists():
    """top_3_comparables ≤3 · likely_objections ≤5 · talking_points ≤7."""
    big = list(range(20))
    out = _normalize_dossier_content({
        "top_3_comparables_likely_asked": big,
        "likely_objections": big,
        "talking_points": big,
        "recommended_units": big,
    })
    assert len(out["top_3_comparables_likely_asked"]) <= 3
    assert len(out["likely_objections"]) <= 5
    assert len(out["talking_points"]) <= 7
    assert len(out["recommended_units"]) <= 3


def test_normalize_dossier_content_truncates_buyer_profile_1200():
    """buyer_profile str se trunca a 1200 chars."""
    out = _normalize_dossier_content({"buyer_profile": "X" * 5000})
    assert len(out["buyer_profile"]) == 1200


# ─── _estimate_tokens / tool_calls ──────────────────────────────────────────

def test_estimate_tokens_minimum_one():
    """len/4 con piso 1."""
    assert _estimate_tokens("") == 1
    assert _estimate_tokens("a" * 20) == 5


def test_extract_and_strip_tool_calls():
    """Extracción JSON válido + strip total."""
    text = 'pre <tool_call>{"tool":"x","params":{"a":1}}</tool_call> post'
    calls = _extract_tool_calls(text)
    assert len(calls) == 1 and calls[0]["tool"] == "x"
    stripped = _strip_tool_calls(text)
    assert "tool_call" not in stripped


# ─── Error hierarchy ────────────────────────────────────────────────────────

def test_errors_are_exception_subclasses():
    """Custom errors heredan de Exception."""
    for E in (VisitPrepDisabledError, VisitPrepRateLimitError,
              VisitPrepNotFoundError, VisitPrepForbiddenError):
        assert issubclass(E, Exception)
        with pytest.raises(E):
            raise E("test")
