"""Wave 4 · Tests sigcdmx_engine.py · 8 tests unidad sin DB.

Cubre constantes + función pura `_to_int` SIGCDMX uso suelo engine:
- ALCALDIAS catalog (16 alcaldías CDMX integrity)
- BASE_URL canonical sig.cdmx.gob.mx
- _to_int (robust parser · None on invalid · float-string handling)
- _now() timezone-aware

Funciones async (fetch_alcaldia · persist_to_cache · lookup · stats ·
run_sigcdmx_monthly_cron) → diferidas a integration tests.

NO modifica código existente · solo lectura.
"""
from datetime import datetime

import pytest

from data_sources.sigcdmx_engine import (
    ALCALDIAS,
    BASE_URL,
    _now,
    _to_int,
)

pytestmark = pytest.mark.unit


# ─── 1. ALCALDIAS catalog · 16 alcaldías CDMX ────────────────────────────────


def test_alcaldias_count_is_16():
    """CDMX tiene exactamente 16 alcaldías."""
    assert len(ALCALDIAS) == 16


# ─── 2. ALCALDIAS contiene alcaldías clave ──────────────────────────────────


def test_alcaldias_includes_core_alcaldias():
    """Alcaldías clave (zona core mercado real estate)."""
    core = {"cuauhtemoc", "miguel_hidalgo", "benito_juarez", "coyoacan",
            "tlalpan", "iztapalapa"}
    assert core.issubset(set(ALCALDIAS))


# ─── 3. ALCALDIAS formato snake_case ────────────────────────────────────────


def test_alcaldias_format_snake_case():
    """Todos los slugs lowercase + underscore (no spaces · no accents)."""
    for a in ALCALDIAS:
        assert isinstance(a, str)
        assert a == a.lower()
        assert " " not in a
        # solo letras y underscore
        assert all(c.isalpha() or c == "_" for c in a)


# ─── 4. BASE_URL canonical ──────────────────────────────────────────────────


def test_base_url_canonical():
    """SIGCDMX catalogov2 CSV shapes endpoint."""
    assert BASE_URL == "https://catalogov2.sig.cdmx.gob.mx/descargas/csv_shapes"
    assert BASE_URL.startswith("https://")


# ─── 5. _to_int integer string ──────────────────────────────────────────────


def test_to_int_basic_int_string():
    """'5' → 5 · '0' → 0."""
    assert _to_int("5") == 5
    assert _to_int("0") == 0
    assert _to_int("123") == 123


# ─── 6. _to_int float string truncates ──────────────────────────────────────


def test_to_int_float_string_truncates():
    """'5.7' → 5 · '12.0' → 12 (int conversion via float)."""
    assert _to_int("5.7") == 5
    assert _to_int("12.0") == 12


# ─── 7. _to_int invalid returns None ────────────────────────────────────────


def test_to_int_invalid_returns_none():
    """'' · None · 'abc' · objetos raros → None graceful."""
    assert _to_int("") is None
    assert _to_int(None) is None
    assert _to_int("n/d") is None
    assert _to_int("abc") is None


# ─── 8. _now timezone-aware UTC ─────────────────────────────────────────────


def test_now_returns_utc_aware():
    """_now() UTC tz-aware."""
    t = _now()
    assert isinstance(t, datetime)
    assert t.tzinfo is not None
    assert t.utcoffset().total_seconds() == 0
