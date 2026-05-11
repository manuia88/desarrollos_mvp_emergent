"""Wave 2 · Tests data_lake_etl.py · 13 tests unidad sin DB.

Cubre helpers puros (lógica sin Mongo · 100% determinista):
- _slug (string normalization a slug url-safe)
- _new_id (prefijo + token random)
- _iso (ISO 8601 UTC)
- CRITICAL_FAIL_THRESHOLD constante

Funciones async con Mongo (ensure_facts_indexes · seed_dim_zones ·
_aggregate_zone_kpis · run_daily_etl · coverage_per_tier) → diferidas
a integration tests (requieren motor + mongomock).

NO toca infra · NO modifica código existente · solo lectura.
"""
import pytest

from data_lake_etl import (
    _slug,
    _new_id,
    _iso,
    CRITICAL_FAIL_THRESHOLD,
)

pytestmark = pytest.mark.unit


# ─── 1. _slug: string → url-safe slug ─────────────────────────────────────────


def test_slug_basic_spaces_to_dashes():
    """Espacios → guiones · lowercase."""
    assert _slug("Polanco Norte") == "polanco-norte"


def test_slug_empty_and_none():
    """Empty string · None → string vacío."""
    assert _slug("") == ""
    assert _slug(None) == ""


def test_slug_multi_spaces_collapsed():
    """Multiples espacios consecutivos → un solo guion."""
    assert _slug("Multi   Space") == "multi-space"


def test_slug_strips_leading_trailing_dashes():
    """Guiones al inicio/final se eliminan."""
    assert _slug("---abc---") == "abc"


def test_slug_consecutive_dashes_collapsed():
    """A--B → a-b (no -- en resultado)."""
    assert _slug("A--B") == "a-b"


def test_slug_underscore_and_dash_become_dash():
    """Underscores y dashes → guiones uniformes."""
    assert _slug("hello_world") == "hello-world"
    assert _slug("foo-bar") == "foo-bar"


def test_slug_drops_non_alnum_punctuation():
    """Signos de puntuación se eliminan, alfanuméricos preservados."""
    assert _slug("CDMX 2026!!!") == "cdmx-2026"


def test_slug_preserves_unicode_alnum():
    """isalnum() conserva acentos unicode (comportamiento actual)."""
    assert _slug("Álvaro Obregón") == "álvaro-obregón"


# ─── 2. _new_id: prefix + random token ────────────────────────────────────────


def test_new_id_starts_with_prefix():
    """new_id devuelve `{prefix}_{token}`."""
    nid = _new_id("etl")
    assert nid.startswith("etl_")
    assert len(nid) > len("etl_")


def test_new_id_unique_across_calls():
    """Múltiples llamadas → IDs distintos (token random)."""
    ids = {_new_id("alert") for _ in range(20)}
    assert len(ids) == 20  # todos únicos


# ─── 3. _iso: UTC ISO 8601 timestamp ──────────────────────────────────────────


def test_iso_returns_iso_format_string():
    """_iso devuelve string ISO 8601 con T."""
    s = _iso()
    assert isinstance(s, str)
    assert "T" in s
    # `datetime.isoformat` includes microseconds + tz offset (+00:00)
    assert "+00:00" in s or s.endswith("Z")


# ─── 4. Constants integrity (catch silent regressions) ───────────────────────


def test_critical_fail_threshold_constant():
    """CRITICAL_FAIL_THRESHOLD == 5 (umbral alerta crítica)."""
    assert CRITICAL_FAIL_THRESHOLD == 5
    assert isinstance(CRITICAL_FAIL_THRESHOLD, int)


def test_slug_idempotent_on_clean_input():
    """Slug ya limpio → invariante (idempotencia)."""
    assert _slug("polanco-norte") == "polanco-norte"
    assert _slug(_slug("Polanco Norte")) == _slug("Polanco Norte")
