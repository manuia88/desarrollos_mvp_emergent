"""Wave 4 · Tests catastro_engine.py · 9 tests unidad sin DB.

Cubre constantes + funciones puras Catastro CDMX engine:
- CKAN_BASE / PACKAGE_NAME canonical
- SCHEMA_FIELDS adaptive parser dict (4 canonical keys)
- _adaptive_field (resolves canonical → first non-empty match)
- _to_float (strips $ · comma · graceful None)
- _now() timezone-aware UTC

Funciones async (fetch_package · fetch_resource_csv · persist_to_cache ·
lookup · stats · run_catastro_quarterly_cron) → diferidas a integration tests.

NO modifica código existente · solo lectura.
"""
from datetime import datetime

import pytest

from data_sources.catastro_engine import (
    CKAN_BASE,
    PACKAGE_NAME,
    SCHEMA_FIELDS,
    _adaptive_field,
    _now,
    _to_float,
)

pytestmark = pytest.mark.unit


# ─── 1. CKAN_BASE canonical ─────────────────────────────────────────────────


def test_ckan_base_canonical():
    """CKAN API v3 datos.cdmx.gob.mx."""
    assert CKAN_BASE == "https://datos.cdmx.gob.mx/api/3/action"


# ─── 2. PACKAGE_NAME canonical ──────────────────────────────────────────────


def test_package_name_canonical():
    """CKAN slug oficial informacion catastral CDMX."""
    assert PACKAGE_NAME == "informacion-catastral-de-la-ciudad-de-mexico"
    assert "catastral" in PACKAGE_NAME


# ─── 3. SCHEMA_FIELDS contiene 4 keys canónicas ─────────────────────────────


def test_schema_fields_canonical_keys():
    """Adaptive parser cubre 4 atributos clave."""
    canonical = {"cuenta_catastral", "alcaldia", "valor_catastral", "superficie_m2"}
    assert set(SCHEMA_FIELDS.keys()) == canonical
    for k in canonical:
        assert isinstance(SCHEMA_FIELDS[k], list)
        assert len(SCHEMA_FIELDS[k]) >= 2  # al menos 2 aliases


# ─── 4. _adaptive_field hits primer alias ───────────────────────────────────


def test_adaptive_field_resolves_first_match():
    """Primer alias presente en dict wins."""
    d = {"cuenta_catastral": "ABC123", "other": "x"}
    assert _adaptive_field(d, "cuenta_catastral") == "ABC123"


# ─── 5. _adaptive_field hits alias secundario ───────────────────────────────


def test_adaptive_field_falls_back_to_alias():
    """Si key primaria ausente · busca aliases (CUENTA · CTA · etc)."""
    d = {"CUENTA": "ZZ999"}
    assert _adaptive_field(d, "cuenta_catastral") == "ZZ999"


# ─── 6. _adaptive_field returns None si vacío ───────────────────────────────


def test_adaptive_field_returns_none_when_missing():
    """Sin keys ni aliases · None graceful."""
    d = {"unrelated": "x"}
    assert _adaptive_field(d, "cuenta_catastral") is None
    # empty string / None tampoco son válidos
    d2 = {"cuenta_catastral": "", "CUENTA": None}
    assert _adaptive_field(d2, "cuenta_catastral") is None


# ─── 7. _to_float strips currency formatting ────────────────────────────────


def test_to_float_strips_currency_formatting():
    """'$1,234.50' → 1234.50 · '5000' → 5000.0."""
    assert _to_float("$1,234.50") == 1234.50
    assert _to_float("5000") == 5000.0
    assert _to_float("1,000,000") == 1_000_000.0


# ─── 8. _to_float returns None on invalid ───────────────────────────────────


def test_to_float_returns_none_on_invalid():
    """'' · None · 'n/d' · 'abc' → None graceful."""
    assert _to_float(None) is None
    assert _to_float("") is None
    assert _to_float("n/d") is None
    assert _to_float("abc") is None


# ─── 9. _now timezone-aware UTC ─────────────────────────────────────────────


def test_now_returns_utc_aware():
    """_now() UTC tz-aware."""
    t = _now()
    assert isinstance(t, datetime)
    assert t.tzinfo is not None
    assert t.utcoffset().total_seconds() == 0
