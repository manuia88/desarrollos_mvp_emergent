"""Wave 4 · Tests director_agent_engine.py · 14 tests unidad sin DB.

Cubre helpers puros + constantes orchestrator:
- TIER_CAPS (off/T1/T2/T3/T4 input/output token caps)
- _MEMORY_TIERS (T2+ enable memory injection)
- PRICE_IN_PER_TOK / PRICE_OUT_PER_TOK ($3/$15 per 1M Claude Sonnet 4.x)
- DIRECTOR_MODEL canonical
- _estimate_tokens (4 chars ≈ 1 tok · min 1)
- _extract_tool_calls / _strip_tool_calls (<tool_call> regex parsing)
- _build_system_prompt (org/role/tier/sim/memory injection)
- Custom exceptions hierarchy

Funciones async (_exec_tool · _agentic_loop · _load_history_as_openai · DirectorAgent
methods · ensure_indexes) → diferidas (require AsyncIOMotor + emergentintegrations
LlmChat + sub-agents).
"""
import pytest

from director_agent_engine import (
    DIRECTOR_MODEL,
    PRICE_IN_PER_TOK,
    PRICE_OUT_PER_TOK,
    PhaseYDisabledError,
    SessionEndedError,
    TIER_CAPS,
    TierCapExceededError,
    _MEMORY_TIERS,
    _build_system_prompt,
    _estimate_tokens,
    _extract_tool_calls,
    _strip_tool_calls,
)

pytestmark = pytest.mark.unit


# ─── Constants ───────────────────────────────────────────────────────────────

def test_tier_caps_has_all_tiers():
    """TIER_CAPS expone 5 tiers canónicos: off · T1..T4."""
    assert set(TIER_CAPS.keys()) == {"off", "T1", "T2", "T3", "T4"}


def test_tier_caps_off_is_zero():
    """tier off = (0, 0) cap input/output."""
    assert TIER_CAPS["off"] == (0, 0)


def test_tier_caps_t4_unlimited_none():
    """tier T4 = (None, None) unlimited."""
    assert TIER_CAPS["T4"] == (None, None)


def test_tier_caps_ascending_input():
    """Caps de input estrictamente ascendentes T1 < T2 < T3 (T4 = unlimited)."""
    t1_in, _ = TIER_CAPS["T1"]
    t2_in, _ = TIER_CAPS["T2"]
    t3_in, _ = TIER_CAPS["T3"]
    assert t1_in < t2_in < t3_in


def test_memory_tiers_t2_plus_only():
    """Memory injection activa solo en T2+."""
    assert _MEMORY_TIERS == {"T2", "T3", "T4"}
    assert "T1" not in _MEMORY_TIERS
    assert "off" not in _MEMORY_TIERS


def test_price_constants_claude_sonnet():
    """Pricing Claude Sonnet 4.x: $3/$15 per 1M tokens."""
    assert PRICE_IN_PER_TOK == pytest.approx(3.0 / 1_000_000)
    assert PRICE_OUT_PER_TOK == pytest.approx(15.0 / 1_000_000)
    # output 5x más caro que input
    assert PRICE_OUT_PER_TOK == pytest.approx(PRICE_IN_PER_TOK * 5)


def test_director_model_is_claude_sonnet():
    """DIRECTOR_MODEL default = claude-sonnet-4-x."""
    assert "claude-sonnet" in DIRECTOR_MODEL.lower()


# ─── Custom exceptions ───────────────────────────────────────────────────────

def test_custom_exceptions_inherit_exception():
    """Excepciones del engine son subclase de Exception."""
    for exc_cls in (PhaseYDisabledError, SessionEndedError, TierCapExceededError):
        assert issubclass(exc_cls, Exception)


# ─── _estimate_tokens ────────────────────────────────────────────────────────

def test_estimate_tokens_4_chars_per_token():
    """Heurística: 4 chars ≈ 1 token."""
    assert _estimate_tokens("a" * 8) == 2
    assert _estimate_tokens("a" * 400) == 100


def test_estimate_tokens_min_one():
    """Mínimo 1 token incluso para string vacío/None."""
    assert _estimate_tokens("") == 1
    assert _estimate_tokens(None) == 1


# ─── _extract_tool_calls / _strip_tool_calls ─────────────────────────────────

def test_extract_tool_calls_single():
    """Extrae un único <tool_call> JSON válido."""
    text = (
        'Voy a consultar el score IE. '
        '<tool_call>{"tool": "get_ie_score", "params": {"developer_id": "dev_42"}}</tool_call>'
    )
    calls = _extract_tool_calls(text)
    assert len(calls) == 1
    assert calls[0]["tool"] == "get_ie_score"
    assert calls[0]["params"]["developer_id"] == "dev_42"


def test_extract_tool_calls_multiple():
    """Extrae varios tool calls."""
    text = (
        '<tool_call>{"tool": "get_ie_score", "params": {"developer_id": "d1"}}</tool_call>'
        ' algo '
        '<tool_call>{"tool": "get_org_kpis", "params": {"org_id": "o1"}}</tool_call>'
    )
    calls = _extract_tool_calls(text)
    assert len(calls) == 2
    assert {c["tool"] for c in calls} == {"get_ie_score", "get_org_kpis"}


def test_extract_tool_calls_invalid_json_skipped():
    """JSON inválido se descarta sin crash."""
    text = '<tool_call>{not valid json}</tool_call><tool_call>{"tool":"x"}</tool_call>'
    calls = _extract_tool_calls(text)
    assert len(calls) == 1
    assert calls[0]["tool"] == "x"


def test_extract_tool_calls_none_when_no_tags():
    """Texto sin tags → lista vacía."""
    assert _extract_tool_calls("solo respuesta sin tool") == []


def test_strip_tool_calls_removes_tags():
    """_strip_tool_calls elimina tags + trim."""
    text = (
        'Consulto datos. '
        '<tool_call>{"tool":"x"}</tool_call>'
        ' Aquí está la respuesta.'
    )
    out = _strip_tool_calls(text)
    assert "<tool_call>" not in out
    assert "Consulto datos" in out
    assert "Aquí está la respuesta" in out


# ─── _build_system_prompt ────────────────────────────────────────────────────

def test_build_system_prompt_includes_context():
    """System prompt incluye org_id, role, tier."""
    sp = _build_system_prompt("org_xyz", "developer_admin", "T3", sim_mode=False)
    assert "org_xyz" in sp
    assert "developer_admin" in sp
    assert "T3" in sp


def test_build_system_prompt_sim_mode_note():
    """sim_mode=True añade marca SIMULATION MODE."""
    sp_sim = _build_system_prompt("org_x", "advisor", "T2", sim_mode=True)
    sp_real = _build_system_prompt("org_x", "advisor", "T2", sim_mode=False)
    assert "SIMULATION MODE" in sp_sim
    assert "SIMULATION MODE" not in sp_real


def test_build_system_prompt_memory_injection_when_provided():
    """memory_context anexa bloque 'Memorias recientes relevantes'."""
    mem = "- Lead 42 expresó interés en Polanco · 2026-04"
    sp = _build_system_prompt("org_x", "advisor", "T3", sim_mode=False, memory_context=mem)
    assert "Memorias recientes relevantes" in sp
    assert mem in sp


def test_build_system_prompt_tools_section_present():
    """System prompt lista las tools clave (numbered)."""
    sp = _build_system_prompt("org_x", "advisor", "T2", sim_mode=False)
    # Tools key
    for tool in (
        "get_ie_score", "get_unit_score", "get_comparables", "get_org_kpis",
        "retrieve_memory", "whatif_simulate",
    ):
        assert tool in sp, f"Falta tool {tool} en system prompt"
