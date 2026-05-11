"""Wave 4 · Tests lead_nurture_engine.py · 14 tests unidad sin DB.

Cubre helpers puros lead_nurture + nurture_intelligent + CLI:
- _zone_interest_slug / _zone_interest_kind (zone-/alcaldia-/intent- prefixes)
- _zone_display_name / _zone_landing_url (URL builders desarrollosmx.io)
- _iso_days_ago (cutoff ISO UTC)
- _compose_email_html (Resend template legacy)
- _normalize_sequence (sequence_type fallback · channel validation · clamping touches)
- _lead_signature_nrt (DISC|budget|intent|zone hashing)
- _cli_format_table (ASCII table renderer F0.3·Sub-B)
- _ensure_utc_dt (timezone normalization)
- _estimate_tokens_nrt
- _extract_tool_calls_nrt / _strip_tool_calls_nrt (<tool_call> nurture variant)
- VALID_SEQUENCE_TYPES / VALID_CHANNELS catalog integrity
- Custom exceptions hierarchy

Funciones async (find_matches · send_nurture_email · run_lead_nurture_match ·
NurtureIntelligentEngine · _nrt_layer_* · run_lead_nurture_intelligent_*) →
diferidas (require AsyncIOMotor + httpx Resend + LLM).
"""
from datetime import datetime, timezone

import pytest

from lead_nurture_engine import (
    NURTURE_THROTTLE_DAYS,
    NurtureIntelligentDisabledError,
    NurtureIntelligentForbiddenError,
    NurtureIntelligentNotFoundError,
    NurtureIntelligentRateLimitError,
    SIMILARITY_THRESHOLD,
    SITE_BASE,
    VALID_CHANNELS,
    VALID_SEQUENCE_TYPES,
    _cli_format_table,
    _compose_email_html,
    _ensure_utc_dt,
    _estimate_tokens_nrt,
    _extract_tool_calls_nrt,
    _iso_days_ago,
    _lead_signature_nrt,
    _normalize_sequence,
    _strip_tool_calls_nrt,
    _zone_display_name,
    _zone_interest_kind,
    _zone_interest_slug,
    _zone_landing_url,
)

pytestmark = pytest.mark.unit


# ─── Constants ───────────────────────────────────────────────────────────────

def test_constants_canonical_values():
    """Throttle 7d, similarity ≥0.78, site canonical .io."""
    assert NURTURE_THROTTLE_DAYS == 7
    assert SIMILARITY_THRESHOLD == 0.78
    assert SITE_BASE == "https://desarrollosmx.io"


def test_valid_sequence_types_five():
    """5 tipos canónicos de secuencia."""
    expected = {
        "warm-fast", "warm-medium", "cold-warm",
        "stalled-recovery", "interested-confirmed",
    }
    assert VALID_SEQUENCE_TYPES == expected


def test_valid_channels_three():
    """3 canales: email · whatsapp · asesor_handoff."""
    assert VALID_CHANNELS == {"email", "whatsapp", "asesor_handoff"}


def test_custom_exceptions_inherit_exception():
    """Errores nurture son subclase de Exception."""
    for exc_cls in (
        NurtureIntelligentDisabledError, NurtureIntelligentRateLimitError,
        NurtureIntelligentNotFoundError, NurtureIntelligentForbiddenError,
    ):
        assert issubclass(exc_cls, Exception)


# ─── _zone_interest_slug / _kind ─────────────────────────────────────────────

def test_zone_interest_slug_strips_prefixes():
    """Strip zone- / alcaldia- / intent-."""
    assert _zone_interest_slug("zone-polanco") == "polanco"
    assert _zone_interest_slug("alcaldia-cuauhtemoc") == "cuauhtemoc"
    assert _zone_interest_slug("intent-preventa-cdmx") == "preventa-cdmx"


def test_zone_interest_slug_no_prefix_passthrough():
    """Sin prefix conocido → retorna intacto."""
    assert _zone_interest_slug("free-form") == "free-form"
    assert _zone_interest_slug("") == ""


def test_zone_interest_kind_dispatch():
    """Kind = zone / alcaldia / intent / other."""
    assert _zone_interest_kind("zone-polanco") == "zone"
    assert _zone_interest_kind("alcaldia-bj") == "alcaldia"
    assert _zone_interest_kind("intent-preventa") == "intent"
    assert _zone_interest_kind("foo") == "other"


# ─── _zone_landing_url ───────────────────────────────────────────────────────

def test_zone_landing_url_by_kind():
    """URLs canónicas por kind."""
    assert _zone_landing_url("zone", "polanco") == "https://desarrollosmx.io/zona/polanco"
    assert _zone_landing_url("alcaldia", "cuauhtemoc") == "https://desarrollosmx.io/alcaldia/cuauhtemoc"
    assert _zone_landing_url("intent", "preventa") == "https://desarrollosmx.io/cdmx/preventa"
    assert _zone_landing_url("other", "x") == "https://desarrollosmx.io/marketplace"


def test_zone_display_name_fallback():
    """Display name unknown → slug humanized."""
    out = _zone_display_name("zone", "unknown-slug")
    assert isinstance(out, str)
    # Fallback: replace - con espacio + title-case
    assert out == "Unknown Slug"


# ─── _iso_days_ago ───────────────────────────────────────────────────────────

def test_iso_days_ago_format_and_past():
    """ISO timestamp UTC en el pasado."""
    s = _iso_days_ago(7)
    parsed = datetime.fromisoformat(s)
    now = datetime.now(timezone.utc)
    assert parsed < now
    delta_days = (now - parsed).total_seconds() / 86400
    assert 6.9 < delta_days < 7.1


# ─── _compose_email_html ─────────────────────────────────────────────────────

def test_compose_email_html_includes_zone_and_devs():
    """HTML contiene zone_name, zone_url y dev names."""
    devs = [
        {"name": "Torre Polanco", "colonia_id": "polanco", "stage": "preventa"},
        {"name": "Casa Roma", "colonia_id": "roma-norte", "stage": "lista"},
    ]
    html = _compose_email_html("Polanco", "https://desarrollosmx.io/zona/polanco", devs)
    assert isinstance(html, str)
    assert "Polanco" in html
    assert "Torre Polanco" in html
    assert "Casa Roma" in html
    assert "https://desarrollosmx.io/zona/polanco" in html


# ─── _ensure_utc_dt ──────────────────────────────────────────────────────────

def test_ensure_utc_dt_normalizes_naive():
    """Datetime naive → UTC tz attached."""
    naive = datetime(2026, 1, 1, 12, 0, 0)
    out = _ensure_utc_dt(naive)
    assert out is not None
    assert out.tzinfo is not None


def test_ensure_utc_dt_passes_aware_unchanged():
    """Datetime tz-aware se retorna sin cambios."""
    aware = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    out = _ensure_utc_dt(aware)
    assert out is aware


def test_ensure_utc_dt_non_datetime_returns_none():
    """Input no-datetime → None (sin crash)."""
    assert _ensure_utc_dt("not-a-date") is None
    assert _ensure_utc_dt(None) is None


# ─── _estimate_tokens_nrt ────────────────────────────────────────────────────

def test_estimate_tokens_nrt_basic():
    """4 chars ≈ 1 tok · min 1."""
    assert _estimate_tokens_nrt("") == 1
    assert _estimate_tokens_nrt("a" * 16) == 4


# ─── _extract_tool_calls_nrt / _strip ────────────────────────────────────────

def test_extract_tool_calls_nrt_parses():
    """Parser nurture extrae <tool_call> JSON."""
    text = '<tool_call>{"tool": "get_disc_profile", "params": {"lead_id": "l_42"}}</tool_call>'
    calls = _extract_tool_calls_nrt(text)
    assert len(calls) == 1
    assert calls[0]["tool"] == "get_disc_profile"


def test_strip_tool_calls_nrt_removes_tags():
    """Strip nurture elimina tags."""
    text = 'pre <tool_call>{"tool":"x"}</tool_call> post'
    out = _strip_tool_calls_nrt(text)
    assert "<tool_call>" not in out
    assert "pre" in out and "post" in out


# ─── _normalize_sequence ─────────────────────────────────────────────────────

def test_normalize_sequence_basic_valid():
    """Sequence válida normalizada con steps + clamping."""
    raw = {
        "sequence_type": "warm-fast",
        "touches": [
            {"channel": "email", "offset_hours": 0, "subject": "s1",
             "body": "b1", "cta": "c1", "rationale": "r1"},
            {"channel": "whatsapp", "offset_hours": 24, "subject": "s2",
             "body": "b2", "cta": "c2", "rationale": "r2"},
        ],
    }
    out = _normalize_sequence(raw)
    assert out["sequence_type"] == "warm-fast"
    assert len(out["touches"]) == 2
    assert out["touches"][0]["step"] == 1
    assert out["touches"][1]["step"] == 2


def test_normalize_sequence_invalid_type_fallback_to_warm_medium():
    """sequence_type inválido → fallback 'warm-medium'."""
    raw = {
        "sequence_type": "invalid-xyz",
        "touches": [{"channel": "email", "offset_hours": 0,
                     "subject": "s", "body": "b", "cta": "c"}],
    }
    out = _normalize_sequence(raw)
    assert out["sequence_type"] == "warm-medium"


def test_normalize_sequence_invalid_channel_fallback_to_email():
    """Canal no whitelist → 'email'."""
    raw = {
        "sequence_type": "warm-medium",
        "touches": [{"channel": "sms", "offset_hours": 0,
                     "subject": "s", "body": "b", "cta": "c"}],
    }
    out = _normalize_sequence(raw)
    assert out["touches"][0]["channel"] == "email"


def test_normalize_sequence_offset_clamped_to_30_days():
    """offset_hours clamped a max 720 (30d * 24h)."""
    raw = {
        "sequence_type": "cold-warm",
        "touches": [{"channel": "email", "offset_hours": 99999,
                     "subject": "s", "body": "b", "cta": "c"}],
    }
    out = _normalize_sequence(raw)
    assert out["touches"][0]["offset_hours"] == 24 * 30


def test_normalize_sequence_truncates_to_5_touches():
    """Máximo 5 touches por sequence."""
    raw = {
        "sequence_type": "cold-warm",
        "touches": [
            {"channel": "email", "offset_hours": i * 24, "subject": f"s{i}",
             "body": f"b{i}", "cta": f"c{i}"}
            for i in range(10)
        ],
    }
    out = _normalize_sequence(raw)
    assert len(out["touches"]) == 5


def test_normalize_sequence_empty_touches_returns_none():
    """Touches vacíos → None (señal de fallback)."""
    assert _normalize_sequence({"sequence_type": "warm-fast", "touches": []}) is None
    assert _normalize_sequence({"sequence_type": "warm-fast", "touches": None}) is None


# ─── _lead_signature_nrt ─────────────────────────────────────────────────────

def test_lead_signature_format():
    """Signature DISC|budget|intent|zone."""
    lead = {"budget_band": "3-5M", "intent": "inversion", "zone_interest": "polanco"}
    sig = _lead_signature_nrt(lead, disc_type="D")
    assert sig == "D|3-5m|inversion|polanco"


def test_lead_signature_no_disc_uses_X():
    """Sin DISC → 'X' placeholder."""
    sig = _lead_signature_nrt({"budget_band": "1-3M"}, disc_type=None)
    assert sig.startswith("X|")


# ─── _cli_format_table ───────────────────────────────────────────────────────

def test_cli_format_table_empty_rows():
    """Lista vacía → mensaje '(sin filas)'."""
    assert _cli_format_table([]) == "(sin filas)"


def test_cli_format_table_renders_columns_and_rows():
    """Tabla ASCII con headers + rows + paddings."""
    rows = [
        {"lead_id": "l1", "email": "a@x.com", "would_send_at": "2026-05-11T00:00"},
        {"lead_id": "l2", "email": "b@x.com", "would_send_at": "2026-05-11T00:01"},
    ]
    table = _cli_format_table(rows)
    # Headers presentes
    assert "lead_id" in table
    assert "email" in table
    assert "would_send_at" in table
    # Data presente
    assert "l1" in table and "l2" in table
    assert "a@x.com" in table
    # Separadores
    assert table.startswith("+")
    assert "|" in table
