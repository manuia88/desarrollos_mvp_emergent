"""Wave 4 · Tests atlax_engine.py · 13 tests unidad sin DB.

Cubre helpers puros (no Mongo · no LLM · no async):
- _now() (timezone-aware UTC)
- _estimate_lead_score (heurístico es-MX · high+medium keywords · clamp 100)
- _truncate_title (W4.11a thread title generator · max_len)
- AtlaxQueryIn (Pydantic validation: min/max query · channel pattern · org_id default None)

Funciones async/router (atlax_query, _resolve_asistente_token, _resolve_thread,
ensure_atlax_indexes, atlax_history, atlax_list_threads, atlax_thread_messages)
→ diferidas (require AsyncIOMotor + AsistenteEngine + RAG semantic_search).
"""
from datetime import datetime

import pytest

from atlax_engine import (
    AtlaxQueryIn,
    _estimate_lead_score,
    _now,
    _truncate_title,
)

pytestmark = pytest.mark.unit


# ─── _now ────────────────────────────────────────────────────────────────────

def test_now_is_timezone_aware_utc():
    """_now() retorna datetime UTC tz-aware."""
    out = _now()
    assert isinstance(out, datetime)
    assert out.tzinfo is not None
    assert out.utcoffset().total_seconds() == 0


# ─── _estimate_lead_score ────────────────────────────────────────────────────

def test_lead_score_baseline_when_empty():
    """Query vacía/None → baseline 30."""
    assert _estimate_lead_score("") == 30
    assert _estimate_lead_score(None) == 30


def test_lead_score_baseline_when_no_keywords():
    """Sin keywords → baseline 30."""
    assert _estimate_lead_score("hola buen día") == 30


def test_lead_score_high_keyword_adds_15():
    """Keyword 'high' agrega +15 al baseline (sin medium keywords)."""
    # "comprar" es high · "algo" no es medium
    score = _estimate_lead_score("Quiero comprar algo")
    assert score == 30 + 15  # 45


def test_lead_score_high_and_medium_combined():
    """High + medium combinan: 'comprar polanco' → 30 + 15 + 5 = 50."""
    score = _estimate_lead_score("comprar en Polanco")
    assert score == 50


def test_lead_score_multiple_keywords_capped_at_100():
    """Múltiples keywords pero score nunca > 100."""
    # Forzamos sobrescribir con muchísimas high+medium
    text = "comprar agendar visitar presupuesto financiamiento crédito interesa precio polanco roma condesa lomas santa fe depto casa amenidades"
    score = _estimate_lead_score(text)
    assert score == 100


def test_lead_score_case_insensitive():
    """Matcheo es case-insensitive (q.lower())."""
    a = _estimate_lead_score("Quiero COMPRAR un depto")
    b = _estimate_lead_score("quiero comprar un depto")
    assert a == b


def test_lead_score_medium_only_adds_5():
    """Solo medium keyword: 30 + 5 = 35."""
    score = _estimate_lead_score("Me interesa un depto")  # "depto" medium · "interesa" high
    # Both: 30 + 15 (interesa) + 5 (depto) = 50
    assert score == 50


# ─── _truncate_title ─────────────────────────────────────────────────────────

def test_truncate_title_short_query_passthrough():
    """Query <= max_len se retorna intacta."""
    assert _truncate_title("hola") == "hola"


def test_truncate_title_empty_returns_default():
    """Query vacía → 'Conversación'."""
    assert _truncate_title("") == "Conversación"
    assert _truncate_title("   ") == "Conversación"


def test_truncate_title_long_cuts_at_word_boundary():
    """Query > max_len se trunca en último espacio + ellipsis."""
    text = "Esta es una consulta muy larga sobre desarrollos inmobiliarios en CDMX zona Polanco y Lomas"
    out = _truncate_title(text, max_len=40)
    assert out.endswith("…")
    assert len(out) <= 41  # 40 chars + ellipsis
    # No debe cortar a media palabra
    assert not out.replace("…", "").rstrip().endswith("desarroll")


def test_truncate_title_strips_newlines():
    """Newlines se convierten en espacios."""
    out = _truncate_title("hola\nmundo")
    assert "\n" not in out
    assert "hola" in out and "mundo" in out


# ─── AtlaxQueryIn (Pydantic schema) ──────────────────────────────────────────

def test_atlax_query_in_defaults():
    """Defaults: channel='web' · thread_id=None · org_id=None · session_id=None."""
    q = AtlaxQueryIn(query="hola")
    assert q.channel == "web"
    assert q.thread_id is None
    assert q.org_id is None
    assert q.session_id is None


def test_atlax_query_in_channel_validation():
    """channel solo acepta whatsapp|web|web_bubble."""
    # válidos
    for ch in ("whatsapp", "web", "web_bubble"):
        q = AtlaxQueryIn(query="hola", channel=ch)
        assert q.channel == ch
    # inválido
    with pytest.raises(Exception):
        AtlaxQueryIn(query="hola", channel="telegram")


def test_atlax_query_in_query_min_length():
    """Query min_length=2 → 1 char rechaza."""
    with pytest.raises(Exception):
        AtlaxQueryIn(query="a")
