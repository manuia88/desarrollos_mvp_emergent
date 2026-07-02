"""Wave 4 · Tests reply_classifier_engine.py · 12 tests unidad sin DB.

Cubre helpers PUROS (no async DB · no LLM · no Resend):
- CATEGORIES / URGENCIES / ACTIONS (constants integrity)
- _normalize_body (whitespace squash + lowercase + truncate 2000)
- _strip_quoted (quoted lines + signatures removed)
- _estimate_tokens / _ensure_utc
- _layer_heuristic (regex-based classifier · async pero NO toca DB)
- Error module hierarchy

NO testea classify_reply / _layer_llm / _layer_cached / dispatch_action /
ingest_webhook_reply / _action_* / mark_action_taken / ensure_reply_indexes
(requieren AsyncIOMotor + LLM + Resend + Phase Y settings).
"""
import asyncio
from datetime import datetime

import pytest

from agentic_crm.reply_classifier_engine import (
    ACTIONS,
    CATEGORIES,
    ReplyClassifierDisabledError,
    ReplyClassifierForbiddenError,
    ReplyClassifierNotFoundError,
    ReplyClassifierRateLimitError,
    URGENCIES,
    _ensure_utc,
    _estimate_tokens,
    _layer_heuristic,
    _normalize_body,
    _strip_quoted,
)

pytestmark = pytest.mark.unit


# ─── Constants integrity ────────────────────────────────────────────────────

def test_categories_are_six_canonical():
    """6 categorías Y.3C."""
    assert CATEGORIES == {"interested", "objection", "soft_silence",
                          "question", "unsubscribe", "spam"}


def test_urgencies_three_levels():
    """high / medium / low."""
    assert URGENCIES == {"high", "medium", "low"}


def test_actions_five_dispatchers():
    """5 acciones next_best."""
    assert ACTIONS == {"notify_asesor", "escalate_manager",
                       "add_watchlist", "advance_funnel_stage", "mark_spam"}


# ─── _normalize_body ────────────────────────────────────────────────────────

def test_normalize_body_lowercase_and_collapses_whitespace():
    """Cualquier whitespace múltiple → 1 espacio · lowercase · trim."""
    out = _normalize_body("  HOLA\n\n  Mundo\t\t  ")
    assert out == "hola mundo"


def test_normalize_body_truncates_to_2000():
    """Body > 2000 chars truncado."""
    out = _normalize_body("a" * 5000)
    assert len(out) == 2000


def test_normalize_body_handles_none_and_empty():
    """None / empty → ''."""
    assert _normalize_body(None) == ""
    assert _normalize_body("") == ""


# ─── _strip_quoted ──────────────────────────────────────────────────────────

def test_strip_quoted_removes_quoted_lines():
    """Líneas que empiezan con > son removidas (junto con el resto del thread)."""
    body = "Hola asesor\n> mensaje anterior\n> firma"
    out = _strip_quoted(body)
    assert "mensaje anterior" not in out
    assert "Hola asesor" in out


def test_strip_quoted_removes_signature_markers():
    """Línea que empieza con -- (sig) corta el thread."""
    body = "Reply real\n--\nFirma del usuario"
    out = _strip_quoted(body)
    assert "Firma" not in out
    assert "Reply real" in out


def test_strip_quoted_handles_empty():
    """Empty input → empty output."""
    assert _strip_quoted("") == ""
    assert _strip_quoted(None) == ""


# ─── _estimate_tokens / _ensure_utc ─────────────────────────────────────────

def test_estimate_tokens_floor_one():
    """Heurística len/4 con piso 1."""
    assert _estimate_tokens("") == 1
    assert _estimate_tokens("a" * 16) == 4


def test_ensure_utc_normalizes_naive_dt():
    """Naive datetime → tz UTC."""
    out = _ensure_utc(datetime(2026, 5, 10))
    assert out is not None and out.tzinfo is not None


# ─── _layer_heuristic ───────────────────────────────────────────────────────

def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro) if hasattr(asyncio, "get_event_loop") else asyncio.run(coro)


def test_heuristic_classifies_interested_when_keyword_present():
    """Body con 'agendar' o 'visita' → interested + high urgency."""
    reply = {"body_text": "Hola, me gustaría agendar una visita esta semana"}
    out = asyncio.run(_layer_heuristic(None, "org", reply))
    cls = out["classification"]
    assert cls["category"] == "interested"
    assert cls["urgency"] == "high"
    assert cls["next_best_action_type"] == "notify_asesor"


def test_heuristic_classifies_objection_on_price_keyword():
    """Body con 'muy caro' → objection."""
    reply = {"body_text": "El precio está muy caro para mi presupuesto"}
    out = asyncio.run(_layer_heuristic(None, "org", reply))
    assert out["classification"]["category"] == "objection"


def test_heuristic_classifies_unsubscribe_explicit():
    """Body con 'unsubscribe' o 'no me contacten' → unsubscribe."""
    reply = {"body_text": "Por favor unsubscribe me de su lista"}
    out = asyncio.run(_layer_heuristic(None, "org", reply))
    assert out["classification"]["category"] == "unsubscribe"
    assert out["classification"]["next_best_action_type"] == "mark_spam"


def test_heuristic_classifies_spam_keyword():
    """Body con palabras spam tipo crypto/casino → spam."""
    reply = {"body_text": "Earn free money with crypto bitcoin investment now"}
    out = asyncio.run(_layer_heuristic(None, "org", reply))
    assert out["classification"]["category"] == "spam"


def test_heuristic_default_soft_silence_when_no_keywords():
    """Sin keywords claras → soft_silence default."""
    reply = {"body_text": "Gracias por tu mensaje."}
    out = asyncio.run(_layer_heuristic(None, "org", reply))
    assert out["classification"]["category"] == "soft_silence"
    assert out["classification"]["next_best_action_type"] == "add_watchlist"


def test_heuristic_returns_zero_tokens_no_cost():
    """Layer heurístico no genera tokens ni costo."""
    reply = {"body_text": "Reply random"}
    out = asyncio.run(_layer_heuristic(None, "org", reply))
    assert out["tokens_in"] == 0
    assert out["tokens_out"] == 0
    assert out["cost_usd"] == 0.0


# ─── Error hierarchy ────────────────────────────────────────────────────────

def test_errors_are_exception_subclasses():
    """Custom errors heredan de Exception."""
    for E in (ReplyClassifierDisabledError, ReplyClassifierRateLimitError,
              ReplyClassifierNotFoundError, ReplyClassifierForbiddenError):
        assert issubclass(E, Exception)
        with pytest.raises(E):
            raise E("test")
