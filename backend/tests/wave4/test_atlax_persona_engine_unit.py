"""Wave 4 · Tests atlax_persona_engine.py · 11 tests unidad sin DB.

Cubre helpers puros (no Mongo · sin tier check):
- DEFAULT_PERSONA shape (claves obligatorias · defaults sensatos)
- TONE_DESCRIPTIONS catalog (5 tonos)
- REGISTER_DESCRIPTIONS catalog (3 registros mx)
- ALLOWED_FIELDS coincide con DEFAULT_PERSONA keys
- _now() tz-aware UTC
- build_persona_prompt (default → '' · customizado → bloque completo)

Funciones async (get_persona · update_persona · get_persona_or_default ·
ensure_indexes) → diferidas (require AsyncIOMotor + phase_y_controls).
"""
from datetime import datetime

import pytest

from atlax_persona_engine import (
    ALLOWED_FIELDS,
    DEFAULT_PERSONA,
    REGISTER_DESCRIPTIONS,
    TONE_DESCRIPTIONS,
    _now,
    build_persona_prompt,
)

pytestmark = pytest.mark.unit


# ─── Constants ───────────────────────────────────────────────────────────────

def test_default_persona_required_keys():
    """DEFAULT_PERSONA contiene todas las claves esperadas."""
    required = {
        "persona_name", "persona_tagline", "tone", "formality_level",
        "warmth_level", "tech_jargon_allowed", "brand_voice_keywords",
        "forbidden_topics", "custom_greetings", "custom_signature",
        "language_register",
    }
    assert required.issubset(DEFAULT_PERSONA.keys())


def test_default_persona_atlax_brand():
    """Brand default = 'Atlax' (post-W4.4E.5.2 rename)."""
    assert DEFAULT_PERSONA["persona_name"] == "Atlax"
    assert DEFAULT_PERSONA["tone"] == "cercano"
    assert DEFAULT_PERSONA["language_register"] == "mx-neutral"


def test_default_persona_numeric_bounds():
    """Levels en rango 1-5 sensato (formality=3 · warmth=4)."""
    assert 1 <= DEFAULT_PERSONA["formality_level"] <= 5
    assert 1 <= DEFAULT_PERSONA["warmth_level"] <= 5


def test_tone_descriptions_five_tones():
    """TONE_DESCRIPTIONS expone 5 tonos canónicos."""
    expected = {"formal", "casual", "tecnico", "cercano", "premium"}
    assert set(TONE_DESCRIPTIONS.keys()) == expected
    for desc in TONE_DESCRIPTIONS.values():
        assert isinstance(desc, str) and len(desc) > 10


def test_register_descriptions_three_registers():
    """REGISTER_DESCRIPTIONS expone 3 registros MX."""
    expected = {"mx-formal", "mx-casual", "mx-neutral"}
    assert set(REGISTER_DESCRIPTIONS.keys()) == expected


def test_allowed_fields_matches_default_keys():
    """ALLOWED_FIELDS equals DEFAULT_PERSONA keys (whitelist update_persona)."""
    assert ALLOWED_FIELDS == set(DEFAULT_PERSONA.keys())


# ─── _now ────────────────────────────────────────────────────────────────────

def test_now_is_utc_tz_aware():
    """_now() tz-aware UTC."""
    out = _now()
    assert isinstance(out, datetime)
    assert out.tzinfo is not None
    assert out.utcoffset().total_seconds() == 0


# ─── build_persona_prompt ────────────────────────────────────────────────────

def test_build_persona_prompt_default_returns_empty():
    """Persona default (version=0 sin custom) → ''."""
    persona = {**DEFAULT_PERSONA, "version": 0}
    assert build_persona_prompt(persona) == ""


def test_build_persona_prompt_none_returns_empty():
    """Persona None/vacía → ''."""
    assert build_persona_prompt(None) == ""
    assert build_persona_prompt({}) == ""


def test_build_persona_prompt_customized_emits_block():
    """Persona version>0 + custom name → bloque con CONFIGURACIÓN tags."""
    persona = {
        **DEFAULT_PERSONA,
        "version": 1,
        "persona_name": "Sofía",
        "tone": "formal",
    }
    out = build_persona_prompt(persona)
    assert "CONFIGURACIÓN DE IDENTIDAD" in out
    assert "Sofía" in out
    assert "FIN CONFIGURACIÓN PERSONALIDAD" in out


def test_build_persona_prompt_forbidden_topics_emit_warning():
    """forbidden_topics emite bloque TEMAS PROHIBIDOS con texto exacto."""
    persona = {
        **DEFAULT_PERSONA,
        "version": 2,
        "forbidden_topics": ["política", "religión"],
    }
    out = build_persona_prompt(persona)
    assert "TEMAS PROHIBIDOS" in out
    assert "\"política\"" in out
    assert "\"religión\"" in out
    assert "Esa información no está disponible actualmente" in out


def test_build_persona_prompt_keywords_truncated_to_eight():
    """brand_voice_keywords máximo 8 mostradas."""
    persona = {
        **DEFAULT_PERSONA,
        "version": 3,
        "brand_voice_keywords": [f"kw{i}" for i in range(20)],
    }
    out = build_persona_prompt(persona)
    # debe incluir kw0..kw7 pero NO kw8 o más
    assert "kw0" in out and "kw7" in out
    assert "kw8" not in out
