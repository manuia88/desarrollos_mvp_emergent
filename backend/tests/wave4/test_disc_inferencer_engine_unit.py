"""Wave 4 · Tests disc_inferencer_engine.py · 14 tests unidad sin DB.

Cubre helpers PUROS (no async DB · no LLM):
- _normalize_disc_payload (shape validation, clamping, default fallbacks)
- _signature_of (fuzzy similarity signature)
- _estimate_tokens (heuristic length / 4)
- _extract_tool_calls / _strip_tool_calls (regex parsing)
- Constants: DIMENSIONS, TYPE_KEY, KEY_TYPE, TONES, LENGTHS, URGENCIES, CHANNELS
- Errors module hierarchy

NO testea infer_profile · _layer_llm · _layer_cached · _layer_heuristic ·
ensure_disc_indexes (requieren Mongo async + LLM + Phase Y settings).
"""
import pytest

from agentic_crm.disc_inferencer_engine import (
    CHANNELS,
    DIMENSIONS,
    DISCInferencerDisabledError,
    DISCInferencerForbiddenError,
    DISCInferencerNotFoundError,
    DISCInferencerRateLimitError,
    KEY_TYPE,
    LENGTHS,
    TONES,
    TYPE_KEY,
    URGENCIES,
    _estimate_tokens,
    _extract_tool_calls,
    _normalize_disc_payload,
    _signature_of,
    _strip_tool_calls,
)

pytestmark = pytest.mark.unit


# ─── Constants integrity ────────────────────────────────────────────────────

def test_dimensions_4_disc_in_spanish():
    """DIMENSIONS contiene las 4 dimensiones DISC en español."""
    assert DIMENSIONS == ("dominante", "influyente", "estable", "concienzudo")


def test_type_key_maps_all_dimensions_to_letters():
    """TYPE_KEY mapea cada dim → letra DISC. Inverso KEY_TYPE consistente."""
    assert TYPE_KEY == {
        "dominante": "D", "influyente": "I", "estable": "S", "concienzudo": "C",
    }
    # Inverso correcto
    assert {v: k for k, v in TYPE_KEY.items()} == KEY_TYPE


def test_communication_preference_sets_non_empty():
    """TONES, LENGTHS, URGENCIES, CHANNELS son sets no vacíos con valores conocidos."""
    assert "direct" in TONES and "warm" in TONES
    assert "concise" in LENGTHS and "moderate" in LENGTHS and "detailed" in LENGTHS
    assert "immediate" in URGENCIES and "warm-up" in URGENCIES
    assert "call" in CHANNELS and "whatsapp" in CHANNELS and "email" in CHANNELS


# ─── _normalize_disc_payload ────────────────────────────────────────────────

def test_normalize_disc_payload_valid_full():
    """Payload válido completo → shape estable y campos clampados a rangos."""
    raw = {
        "scores": {"dominante": 40, "influyente": 30, "estable": 20, "concienzudo": 10},
        "predominant_type": "D",
        "confidence_score": 85,
        "communication_preferences": {
            "tone": "direct", "length_preference": "concise",
            "urgency_response": "immediate", "preferred_channel": "call",
        },
        "recommended_approach_text": "Directo y rápido.",
        "evidence": {
            "behavioral_signals": ["Agendó cita 1h"],
            "chat_signals": ["Pide datos"],
            "reply_signals": ["Reply high urgency"],
        },
    }
    out = _normalize_disc_payload(raw)
    assert out is not None
    assert out["scores"]["dominante"] == 40
    assert out["predominant_type"] == "D"
    assert out["confidence_score"] == 85
    cp = out["communication_preferences"]
    assert cp["tone"] == "direct"
    assert cp["length_preference"] == "concise"
    assert cp["urgency_response"] == "immediate"
    assert cp["preferred_channel"] == "call"


def test_normalize_disc_payload_clamps_scores_to_0_100():
    """Scores fuera de [0,100] se clampean."""
    raw = {
        "scores": {"dominante": 150, "influyente": -10, "estable": 50, "concienzudo": 50},
        "predominant_type": "I",
    }
    out = _normalize_disc_payload(raw)
    assert out is not None
    assert out["scores"]["dominante"] == 100
    assert out["scores"]["influyente"] == 0


def test_normalize_disc_payload_returns_none_on_bad_scores():
    """Si scores no convertibles a int → None (señal de fallo)."""
    raw = {"scores": {"dominante": "abc", "influyente": 20, "estable": 20, "concienzudo": 20}}
    out = _normalize_disc_payload(raw)
    assert out is None


def test_normalize_disc_payload_fills_defaults_for_missing_comm_pref():
    """Communication prefs faltantes/inválidas → defaults seguros."""
    raw = {
        "scores": {"dominante": 25, "influyente": 25, "estable": 25, "concienzudo": 25},
        "predominant_type": "BAD_TYPE",  # debería caer en S (default por max score)
        "communication_preferences": {
            "tone": "invalid_tone", "length_preference": "nope",
            "urgency_response": "x", "preferred_channel": "carrier_pigeon",
        },
    }
    out = _normalize_disc_payload(raw)
    assert out is not None
    cp = out["communication_preferences"]
    assert cp["tone"] == "warm"
    assert cp["length_preference"] == "moderate"
    assert cp["urgency_response"] == "warm-up"
    assert cp["preferred_channel"] == "whatsapp"
    # predominant_type vuelve a letra del max score (todos = 25 → max() devuelve primero)
    assert out["predominant_type"] in KEY_TYPE


def test_normalize_disc_payload_confidence_default_50_on_bad_input():
    """confidence_score inválido → default 50."""
    raw = {
        "scores": {"dominante": 25, "influyente": 25, "estable": 25, "concienzudo": 25},
        "confidence_score": "not-a-number",
    }
    out = _normalize_disc_payload(raw)
    assert out is not None
    assert out["confidence_score"] == 50


def test_normalize_disc_payload_truncates_evidence_lists_and_strings():
    """Evidence: cada lista max 6 items, cada str max 200 chars."""
    big_signal = "x" * 500
    raw = {
        "scores": {"dominante": 25, "influyente": 25, "estable": 25, "concienzudo": 25},
        "evidence": {
            "behavioral_signals": [big_signal] * 20,
            "chat_signals": [big_signal] * 20,
            "reply_signals": [big_signal] * 20,
        },
    }
    out = _normalize_disc_payload(raw)
    assert out is not None
    for k in ("behavioral_signals", "chat_signals", "reply_signals"):
        sigs = out["evidence"][k]
        assert len(sigs) <= 6
        for s in sigs:
            assert len(s) <= 200


def test_normalize_disc_payload_recommended_approach_truncated_1200():
    """recommended_approach_text se trunca a 1200 chars."""
    raw = {
        "scores": {"dominante": 25, "influyente": 25, "estable": 25, "concienzudo": 25},
        "recommended_approach_text": "A" * 3000,
    }
    out = _normalize_disc_payload(raw)
    assert out is not None
    assert len(out["recommended_approach_text"]) == 1200


# ─── _signature_of ──────────────────────────────────────────────────────────

def test_signature_of_combines_segment_intent_zone_lowercase():
    """Signature usa budget_band|intent|zone en lowercase."""
    lead = {"budget_band": "Alto", "intent": "Inversion", "zone_interest": "Polanco"}
    sig = _signature_of(lead)
    assert sig == "alto|inversion|polanco"


def test_signature_of_empty_lead_returns_pipe_separators():
    """Lead vacío → pipes vacíos · stripped vacío para detección."""
    sig = _signature_of({})
    assert sig == "||"
    # No tiene ningún char no-pipe
    assert not sig.strip("|")


# ─── _estimate_tokens ───────────────────────────────────────────────────────

def test_estimate_tokens_rough_quarter_of_length():
    """Heurística len/4 con mínimo 1."""
    assert _estimate_tokens("") == 1
    assert _estimate_tokens(None) == 1
    assert _estimate_tokens("a" * 40) == 10
    assert _estimate_tokens("hola mundo") == max(1, 10 // 4)


# ─── _extract_tool_calls / _strip_tool_calls ────────────────────────────────

def test_extract_tool_calls_parses_valid_json_blocks():
    """Extrae tool_calls multi-bloque · ignora JSON inválido."""
    text = (
        'pre <tool_call>{"tool": "a", "params": {"x": 1}}</tool_call> mid '
        '<tool_call>{"tool": "b"}</tool_call> '
        '<tool_call>not json</tool_call>'
    )
    out = _extract_tool_calls(text)
    assert len(out) == 2
    assert out[0]["tool"] == "a"
    assert out[1]["tool"] == "b"


def test_strip_tool_calls_removes_all_blocks():
    """Quita todos los bloques tool_call y strips."""
    text = '  hola<tool_call>{"x":1}</tool_call>mundo  '
    out = _strip_tool_calls(text)
    assert "tool_call" not in out
    assert "hola" in out and "mundo" in out


# ─── Error hierarchy ────────────────────────────────────────────────────────

def test_errors_are_exception_subclasses():
    """Custom errors heredan de Exception."""
    for E in (DISCInferencerDisabledError, DISCInferencerRateLimitError,
              DISCInferencerNotFoundError, DISCInferencerForbiddenError):
        assert issubclass(E, Exception)
        with pytest.raises(E):
            raise E("test")
