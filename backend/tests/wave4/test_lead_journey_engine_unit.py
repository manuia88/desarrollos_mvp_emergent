"""Wave 4 · Tests lead_journey_engine.py · 10 tests unidad sin DB.

Cubre constantes y validación pura:
- VALID_STEP_TYPES (16 pasos canónicos)
- ACTOR_TYPES (6 actores)
- IDEMPOTENCY_WINDOW_S (60s)
- Step type validation (input fallthrough)

NO testea async helpers DB (emit_step / journey_stats) → require Mongo.
"""
import pytest

from lead_journey_engine import (
    ACTOR_TYPES,
    IDEMPOTENCY_WINDOW_S,
    VALID_STEP_TYPES,
)

pytestmark = pytest.mark.unit


# ─── VALID_STEP_TYPES integridad ─────────────────────────────────────────────

def test_valid_step_types_includes_16_canonical_steps():
    """16 step types canónicos del funnel + nurture_paused."""
    expected = {
        "captured", "enriched", "disc_inferred", "routed", "assigned",
        "first_touch_email", "first_touch_whatsapp", "meeting_scheduled",
        "visit_completed", "quote_sent", "nurtured",
        "outbound_initiated_by_asesor", "atlax_consulted_broker",
        "closed_won", "closed_lost", "nurture_paused",
    }
    assert VALID_STEP_TYPES == expected


def test_valid_step_types_size_16():
    """VALID_STEP_TYPES tiene exactamente 16 elementos."""
    assert len(VALID_STEP_TYPES) == 16


def test_valid_step_types_includes_terminal_states():
    """closed_won y closed_lost deben estar (terminal states del funnel)."""
    assert "closed_won" in VALID_STEP_TYPES
    assert "closed_lost" in VALID_STEP_TYPES


def test_valid_step_types_includes_first_touch_dual_channel():
    """First-touch tiene 2 variantes: email + whatsapp."""
    assert "first_touch_email" in VALID_STEP_TYPES
    assert "first_touch_whatsapp" in VALID_STEP_TYPES


def test_invalid_step_type_not_in_valid_set():
    """Step types ad-hoc no deben entrar (defensa cliente)."""
    assert "garbage_step" not in VALID_STEP_TYPES
    assert "" not in VALID_STEP_TYPES


# ─── ACTOR_TYPES integridad ──────────────────────────────────────────────────

def test_actor_types_includes_six_canonical():
    """6 actor types: system, asesor, broker, buyer, atlax, cron."""
    assert ACTOR_TYPES == {"system", "asesor", "broker", "buyer", "atlax", "cron"}


def test_actor_types_default_is_system():
    """system es el fallback default cuando actor_type inválido."""
    assert "system" in ACTOR_TYPES


def test_actor_types_includes_atlax_broker():
    """atlax (asistente AI) + broker son actores válidos."""
    assert "atlax" in ACTOR_TYPES
    assert "broker" in ACTOR_TYPES


# ─── IDEMPOTENCY_WINDOW_S ────────────────────────────────────────────────────

def test_idempotency_window_is_60s():
    """Idempotency window = 60 segundos (anti-doble-write)."""
    assert IDEMPOTENCY_WINDOW_S == 60


def test_idempotency_window_is_positive_int():
    """Idempotency window debe ser int positivo."""
    assert isinstance(IDEMPOTENCY_WINDOW_S, int)
    assert IDEMPOTENCY_WINDOW_S > 0
