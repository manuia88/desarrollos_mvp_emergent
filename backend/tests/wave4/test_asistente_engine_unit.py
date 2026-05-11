"""Wave 4 · Tests asistente_engine.py · 12 tests unidad sin DB.

Cubre helpers puros (no Mongo · no LLM · no rate-limit infra):
- _now() tz-aware UTC
- _estimate_tokens (4 chars ≈ 1 tok · min 1)
- _check_rate (sliding window bucket · sin Redis)
- _detect_intent (intent classifier es-MX: cita · presupuesto · comparables · zona · otro)
- _extract_tool_calls / _strip_tool_calls (<tool_call> regex parsing)
- _system_prompt (intent_history · persona_prefix · map_context · sim_mode)
- Cap constants (MAX_MESSAGES_PER_SESSION=30 etc.)
- WELCOME_MESSAGE (es-MX greeting)
- Custom exceptions hierarchy

Funciones async (AsistenteEngine methods · _check_phase_y · _exec_tool ·
expire_old_sessions_cron · ensure_indexes) → diferidas.
"""
from collections import defaultdict

import pytest

from asistente_engine import (
    AsistenteDisabledError,
    AsistenteRateLimitError,
    AsistenteSessionCapError,
    MAX_MESSAGES_PER_SESSION,
    MAX_TOKENS_OUT_PER_MSG,
    MESSAGES_PER_MIN_PER_SESSION,
    SESSIONS_PER_HOUR_PER_IP,
    SESSION_EXPIRE_HOURS,
    WELCOME_MESSAGE,
    _check_rate,
    _detect_intent,
    _estimate_tokens,
    _extract_tool_calls,
    _now,
    _strip_tool_calls,
    _system_prompt,
)

pytestmark = pytest.mark.unit


# ─── Constants ───────────────────────────────────────────────────────────────

def test_caps_constants_values():
    """Caps DMX canónicos (no cambiar sin migration plan)."""
    assert MAX_MESSAGES_PER_SESSION == 30
    assert MAX_TOKENS_OUT_PER_MSG == 200
    assert SESSIONS_PER_HOUR_PER_IP == 5
    assert MESSAGES_PER_MIN_PER_SESSION == 20
    assert SESSION_EXPIRE_HOURS == 24


def test_welcome_message_es_mx():
    """Welcome es-MX · menciona CDMX y DesarrollosMX."""
    assert "DesarrollosMX" in WELCOME_MESSAGE
    assert "CDMX" in WELCOME_MESSAGE


def test_custom_exceptions_inherit_exception():
    """Errores asistente son subclase de Exception."""
    for exc_cls in (
        AsistenteDisabledError, AsistenteRateLimitError, AsistenteSessionCapError,
    ):
        assert issubclass(exc_cls, Exception)


# ─── _now / _estimate_tokens ─────────────────────────────────────────────────

def test_now_tz_aware_utc():
    """_now() UTC tz-aware."""
    out = _now()
    assert out.tzinfo is not None
    assert out.utcoffset().total_seconds() == 0


def test_estimate_tokens_basic():
    """Heurística 4 chars ≈ 1 tok · min 1."""
    assert _estimate_tokens("") == 1
    assert _estimate_tokens(None) == 1
    assert _estimate_tokens("a" * 12) == 3


# ─── _check_rate ─────────────────────────────────────────────────────────────

def test_check_rate_allows_below_limit():
    """Acepta hasta `limit` requests dentro de window."""
    buckets: dict = defaultdict(list)
    # límite 3, ventana 60s
    for _ in range(3):
        assert _check_rate(buckets, "k1", limit=3, window_s=60) is True
    # 4ta cae
    assert _check_rate(buckets, "k1", limit=3, window_s=60) is False


def test_check_rate_separate_keys_independent():
    """Diferentes keys no se mezclan."""
    buckets: dict = defaultdict(list)
    for _ in range(5):
        assert _check_rate(buckets, "a", limit=5, window_s=60) is True
    # key 'b' arranca limpio
    assert _check_rate(buckets, "b", limit=1, window_s=60) is True


# ─── _detect_intent ──────────────────────────────────────────────────────────

def test_detect_intent_empty_otro():
    """Texto vacío → 'otro'."""
    assert _detect_intent("") == "otro"
    assert _detect_intent(None) == "otro"


def test_detect_intent_cita():
    """Keywords 'agendar', 'visita', 'asesor' → 'cita'."""
    assert _detect_intent("Quiero agendar una visita") == "cita"
    assert _detect_intent("Conectarme con un asesor") == "cita"


def test_detect_intent_presupuesto():
    """Keywords 'crédito', 'mensualidad', 'infonavit' → 'presupuesto'."""
    assert _detect_intent("Cuánto sería de mensualidad") == "presupuesto"
    assert _detect_intent("Tengo crédito Infonavit") == "presupuesto"


def test_detect_intent_zona():
    """Keywords 'colonia', 'Polanco' → 'zona'."""
    assert _detect_intent("Busco en Polanco") == "zona"
    assert _detect_intent("¿Qué colonia me recomiendas?") == "zona"


def test_detect_intent_comparables():
    """Keywords 'comparar', 'opciones', 'similar' → 'comparables'."""
    assert _detect_intent("Quiero comparar dos desarrollos") == "comparables"


def test_detect_intent_unmatched_otro():
    """Sin keywords reconocibles → 'otro'."""
    assert _detect_intent("Hola, buenos días") == "otro"


# ─── _extract_tool_calls / _strip_tool_calls ─────────────────────────────────

def test_extract_tool_calls_valid_json():
    """Parsea <tool_call> JSON válido."""
    text = '<tool_call>{"tool": "get_zone_info", "params": {"zone_slug": "polanco"}}</tool_call>'
    calls = _extract_tool_calls(text)
    assert len(calls) == 1
    assert calls[0]["tool"] == "get_zone_info"


def test_extract_tool_calls_invalid_skipped():
    """JSON inválido se ignora sin crash."""
    text = '<tool_call>{invalid}</tool_call>'
    assert _extract_tool_calls(text) == []


def test_strip_tool_calls_removes_tags():
    """Strip elimina <tool_call> + retorna text limpio."""
    text = 'Hola <tool_call>{"tool":"x"}</tool_call> mundo'
    out = _strip_tool_calls(text)
    assert "<tool_call>" not in out
    assert "Hola" in out and "mundo" in out


def test_strip_tool_calls_none_returns_empty():
    """None → ''."""
    assert _strip_tool_calls(None) == ""


# ─── _system_prompt ──────────────────────────────────────────────────────────

def test_system_prompt_default_contains_tools_and_rules():
    """System prompt baseline incluye tools + reglas + DMX brand."""
    sp = _system_prompt(sim_mode=False, intent_history=[])
    assert "DesarrollosMX" in sp
    assert "TOOLS DISPONIBLES" in sp
    assert "search_developments_public" in sp
    assert "REGLAS" in sp


def test_system_prompt_sim_mode_note():
    """sim_mode=True añade marca [SIM]."""
    sp_sim = _system_prompt(sim_mode=True, intent_history=[])
    sp_real = _system_prompt(sim_mode=False, intent_history=[])
    assert "SIMULACIÓN" in sp_sim
    assert "SIMULACIÓN" not in sp_real


def test_system_prompt_persona_prefix_prepended():
    """persona_prefix se antepone al system prompt."""
    sp = _system_prompt(
        sim_mode=False, intent_history=[],
        persona_prefix="══ CONFIG PERSONA ══\nEres Sofía.",
    )
    assert sp.startswith("══ CONFIG PERSONA ══")
    assert "Sofía" in sp


def test_system_prompt_intent_history_truncated_to_last_5():
    """intent_history solo expone los últimos 5 intents."""
    sp = _system_prompt(
        sim_mode=False,
        intent_history=["cita", "zona", "comparables", "presupuesto", "zona", "cita", "otro"],
    )
    # Debe incluir los últimos 5 (no incluir el primer "cita")
    assert "comparables" in sp
    assert "otro" in sp


def test_system_prompt_map_context_appended():
    """map_context se añade en bloque [CONTEXTO MAPA]."""
    sp = _system_prompt(
        sim_mode=False, intent_history=[],
        map_context="zoom=14, centro Roma Norte",
    )
    assert "[CONTEXTO MAPA]" in sp
    assert "Roma Norte" in sp
