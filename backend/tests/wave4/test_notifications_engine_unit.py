"""Wave 4 · Tests notifications_engine.py · 14 tests unidad sin DB.

Cubre helpers PUROS y constantes:
- SEVERITIES / NOTIF_TYPES / DEFAULT_CATEGORIES integridad
- _is_quiet (quiet hours window · cross-midnight handling)
- _notif_id (formato y unicidad)

NO testea async DB / Resend / cron · diferir.
"""
from datetime import datetime, timezone
from unittest.mock import patch

import pytest

from notifications_engine import (
    DEFAULT_CATEGORIES,
    DEFAULT_DIGEST_FREQUENCY,
    DEFAULT_QUIET_HOURS,
    NOTIF_TYPES,
    SEVERITIES,
    _is_quiet,
    _notif_id,
)

pytestmark = pytest.mark.unit


# ─── Constantes ──────────────────────────────────────────────────────────────

def test_severities_includes_4_tiers():
    """SEVERITIES expone 4 tiers canónicos."""
    assert set(SEVERITIES) == {"critical", "high", "normal", "low"}


def test_notif_types_includes_core_15_plus_generic():
    """NOTIF_TYPES incluye todos los rules + generic fallback."""
    core_rules = {
        "lead_new", "lead_high_urgency", "meeting_24h", "meeting_1h",
        "cron_failed", "saved_zone_alert", "message_pending",
        "listing_view_repeat", "comparable_price_drop", "drop_off_pico",
        "tenant_signup", "api_limit_warn", "lfpdppp_dsr", "audit_suspicious",
        "nurture_cooldown", "generic",
    }
    assert core_rules.issubset(NOTIF_TYPES)


def test_default_categories_covers_all_notif_types():
    """Cada tipo en NOTIF_TYPES tiene un entry en DEFAULT_CATEGORIES."""
    for t in NOTIF_TYPES:
        assert t in DEFAULT_CATEGORIES, f"falta {t} en DEFAULT_CATEGORIES"


def test_default_categories_high_urgency_uses_whatsapp():
    """lead_high_urgency activa WA · canal critical."""
    assert DEFAULT_CATEGORIES["lead_high_urgency"]["whatsapp"] is True
    assert DEFAULT_CATEGORIES["lead_high_urgency"]["email"] is True


def test_default_categories_in_app_always_true():
    """In-app es el canal universal por defecto."""
    for cat, channels in DEFAULT_CATEGORIES.items():
        assert channels.get("in_app") is True, f"{cat} debería tener in_app=True"


def test_default_quiet_hours_uses_cdmx_tz():
    """quiet hours default es timezone CDMX."""
    assert DEFAULT_QUIET_HOURS["tz"] == "America/Mexico_City"
    assert DEFAULT_QUIET_HOURS["start"] == "21:00"
    assert DEFAULT_QUIET_HOURS["end"] == "08:00"


def test_default_digest_frequency_is_4h():
    """Digest default cada 4h."""
    assert DEFAULT_DIGEST_FREQUENCY == "4h"


# ─── _notif_id ────────────────────────────────────────────────────────────────

def test_notif_id_format():
    """_notif_id retorna formato 'notif_' + 16 hex chars."""
    nid = _notif_id()
    assert nid.startswith("notif_")
    assert len(nid) == len("notif_") + 16


def test_notif_id_unique():
    """_notif_id genera IDs únicos en llamadas sucesivas."""
    ids = {_notif_id() for _ in range(50)}
    assert len(ids) == 50


# ─── _is_quiet · quiet hours logic ───────────────────────────────────────────

def test_is_quiet_crosses_midnight_true_at_22h():
    """22:00 está dentro de quiet 21:00-08:00 (cross midnight)."""
    fake_now = datetime(2026, 5, 10, 22, 0, tzinfo=timezone.utc)
    with patch("notifications_engine._now", return_value=fake_now):
        assert _is_quiet({"quiet_hours": {"start": "21:00", "end": "08:00"}}) is True


def test_is_quiet_crosses_midnight_true_at_3am():
    """03:00 está dentro de quiet 21:00-08:00 (cross midnight, after 0h)."""
    fake_now = datetime(2026, 5, 10, 3, 0, tzinfo=timezone.utc)
    with patch("notifications_engine._now", return_value=fake_now):
        assert _is_quiet({"quiet_hours": {"start": "21:00", "end": "08:00"}}) is True


def test_is_quiet_crosses_midnight_false_at_12h():
    """12:00 está fuera de quiet 21:00-08:00."""
    fake_now = datetime(2026, 5, 10, 12, 0, tzinfo=timezone.utc)
    with patch("notifications_engine._now", return_value=fake_now):
        assert _is_quiet({"quiet_hours": {"start": "21:00", "end": "08:00"}}) is False


def test_is_quiet_non_crossing_window():
    """Window 10:00-14:00 (no cruza medianoche): 12h dentro, 16h fuera."""
    fake_now_in = datetime(2026, 5, 10, 12, 0, tzinfo=timezone.utc)
    with patch("notifications_engine._now", return_value=fake_now_in):
        assert _is_quiet({"quiet_hours": {"start": "10:00", "end": "14:00"}}) is True
    fake_now_out = datetime(2026, 5, 10, 16, 0, tzinfo=timezone.utc)
    with patch("notifications_engine._now", return_value=fake_now_out):
        assert _is_quiet({"quiet_hours": {"start": "10:00", "end": "14:00"}}) is False


def test_is_quiet_handles_invalid_prefs_gracefully():
    """Prefs inválidas → False (no aborta · best-effort)."""
    # Empty prefs falls back to DEFAULT_QUIET_HOURS (21:00-08:00); pick a
    # time fuera del default → False.
    fake_now = datetime(2026, 5, 10, 12, 0, tzinfo=timezone.utc)
    with patch("notifications_engine._now", return_value=fake_now):
        assert _is_quiet({}) is False
    # Bad value triggers exception → False
    assert _is_quiet({"quiet_hours": "garbage"}) is False
