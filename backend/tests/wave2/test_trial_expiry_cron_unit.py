"""Wave 2 · Tests trial_expiry_cron.py · 7 tests unidad sin DB/red.

Cubre funciones puras:
- _now / _iso_now (UTC + ISO format)
- _parse_iso (datetime passthrough, str ISO, 'Z' suffix, naive→UTC)
- THRESHOLD_DAYS constant (7/3/1 alert windows)
"""
from datetime import datetime, timezone

import pytest

from trial_expiry_cron import (
    THRESHOLD_DAYS,
    _iso_now,
    _now,
    _parse_iso,
)

pytestmark = pytest.mark.unit


# ─── _now / _iso_now ─────────────────────────────────────────────────────────
def test_now_is_timezone_aware_utc():
    """_now() returns a tz-aware datetime in UTC."""
    n = _now()
    assert isinstance(n, datetime)
    assert n.tzinfo is not None
    assert n.utcoffset().total_seconds() == 0


def test_iso_now_returns_parseable_iso_string():
    """_iso_now() returns an ISO 8601 string that round-trips."""
    s = _iso_now()
    parsed = datetime.fromisoformat(s)
    assert parsed.tzinfo is not None


# ─── _parse_iso ──────────────────────────────────────────────────────────────
def test_parse_iso_datetime_passthrough_tz_aware():
    """Passing a tz-aware datetime returns it unchanged."""
    dt = datetime(2026, 5, 11, 12, 0, 0, tzinfo=timezone.utc)
    assert _parse_iso(dt) is dt


def test_parse_iso_datetime_naive_gets_utc():
    """A naive datetime is upgraded to UTC."""
    naive = datetime(2026, 5, 11, 12, 0, 0)
    result = _parse_iso(naive)
    assert result.tzinfo == timezone.utc


def test_parse_iso_str_with_z_suffix():
    """A 'Z' suffix is normalized to +00:00 before parsing."""
    result = _parse_iso("2026-05-11T12:00:00Z")
    assert result.year == 2026 and result.month == 5 and result.day == 11
    assert result.tzinfo is not None


def test_parse_iso_str_with_offset():
    """ISO string with explicit +00:00 offset parses cleanly."""
    result = _parse_iso("2026-05-11T12:00:00+00:00")
    assert result.hour == 12
    assert result.tzinfo is not None


# ─── THRESHOLD_DAYS constant ─────────────────────────────────────────────────
def test_threshold_days_descending_order():
    """Thresholds are (7, 3, 1) — descending so longest warning fires first."""
    assert THRESHOLD_DAYS == (7, 3, 1)
    assert list(THRESHOLD_DAYS) == sorted(THRESHOLD_DAYS, reverse=True)
