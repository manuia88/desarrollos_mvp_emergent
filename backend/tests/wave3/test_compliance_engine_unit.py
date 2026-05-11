"""Wave 3 · Tests compliance_engine.py · 13 tests unidad sin DB.

Cubre helpers PUROS (no async · no Mongo):
- _now / _iso (timestamp helpers · UTC)
- _new_id (prefijo + entropía + unicidad)
- VALID_REQUEST_TYPES (LFPDPPP request types)
- _PII_COLLECTIONS (mapping integridad · acciones válidas)
- _ANON_PLACEHOLDER (constante)

NO testea async DB helpers (ensure_compliance_indexes / log_compliance_event /
create_dsr / verify_dsr_token / process_dsr_deletion / cron_compliance_audit_retention_check
/ send_dsr_confirmation_email) → require AsyncIOMotor + httpx + Resend.
"""
from datetime import datetime, timezone

import pytest

from compliance_engine import (
    VALID_REQUEST_TYPES,
    _ANON_PLACEHOLDER,
    _AUDIT_COLL,
    _DSR_COLL,
    _PII_COLLECTIONS,
    _iso,
    _new_id,
    _now,
)

pytestmark = pytest.mark.unit


# ─── _now / _iso ─────────────────────────────────────────────────────────────

def test_now_returns_datetime_utc():
    """_now() devuelve datetime con tzinfo UTC."""
    out = _now()
    assert isinstance(out, datetime)
    assert out.tzinfo is not None
    assert out.utcoffset().total_seconds() == 0


def test_iso_returns_parseable_utc_string():
    """_iso() devuelve string ISO 8601 parseable y termina en +00:00."""
    out = _iso()
    assert isinstance(out, str)
    assert out.endswith("+00:00")
    parsed = datetime.fromisoformat(out)
    assert parsed.tzinfo is not None


# ─── _new_id ─────────────────────────────────────────────────────────────────

def test_new_id_default_prefix_is_dsr():
    """_new_id() default prefix='dsr'."""
    out = _new_id()
    assert out.startswith("dsr_")


def test_new_id_custom_prefix():
    """_new_id('caud') usa el prefijo provisto."""
    out = _new_id("caud")
    assert out.startswith("caud_")


def test_new_id_uniqueness_across_calls():
    """_new_id() genera ids únicos en 100 invocaciones."""
    ids = {_new_id() for _ in range(100)}
    assert len(ids) == 100


def test_new_id_has_entropy_token():
    """_new_id() incluye un token >= 8 chars después del prefijo."""
    out = _new_id("test")
    suffix = out.split("_", 1)[1]
    assert len(suffix) >= 8


# ─── VALID_REQUEST_TYPES ─────────────────────────────────────────────────────

def test_valid_request_types_lfpdppp_set():
    """VALID_REQUEST_TYPES contiene los 4 tipos LFPDPPP (ARCO+portability)."""
    expected = {"access", "deletion", "portability", "rectification"}
    assert VALID_REQUEST_TYPES == expected


def test_valid_request_types_is_set_for_o1_lookup():
    """VALID_REQUEST_TYPES es un set (membership O(1))."""
    assert isinstance(VALID_REQUEST_TYPES, set)


# ─── _PII_COLLECTIONS mapping integrity ──────────────────────────────────────

def test_pii_collections_actions_are_valid():
    """Cada tupla en _PII_COLLECTIONS usa una acción soportada."""
    valid_actions = {"delete", "anonymize", "anonymize_user", "keep"}
    for coll_name, email_field, action in _PII_COLLECTIONS:
        assert action in valid_actions, (
            f"acción inválida '{action}' para colección '{coll_name}'"
        )


def test_pii_collections_have_three_fields():
    """Cada entry tiene exactamente 3 elementos (collection, field, action)."""
    for entry in _PII_COLLECTIONS:
        assert len(entry) == 3


def test_pii_collections_dsr_kept_for_audit():
    """dsr_requests usa action='keep' (audit trail legal LFPDPPP)."""
    dsr_entries = [t for t in _PII_COLLECTIONS if t[0] == "dsr_requests"]
    assert len(dsr_entries) == 1
    assert dsr_entries[0][2] == "keep"


def test_pii_collections_users_anonymize_user():
    """users usa action='anonymize_user' (preserva billing audit)."""
    user_entries = [t for t in _PII_COLLECTIONS if t[0] == "users"]
    assert len(user_entries) == 1
    assert user_entries[0][2] == "anonymize_user"


def test_pii_collections_unique_collection_names():
    """No hay colecciones duplicadas en _PII_COLLECTIONS."""
    names = [t[0] for t in _PII_COLLECTIONS]
    assert len(names) == len(set(names))


# ─── Constantes ─────────────────────────────────────────────────────────────

def test_anon_placeholder_is_unambiguous():
    """_ANON_PLACEHOLDER no colisiona con un email real (sin '@')."""
    assert "@" not in _ANON_PLACEHOLDER
    assert "dsr" in _ANON_PLACEHOLDER.lower()


def test_collection_names_are_strings():
    """_DSR_COLL y _AUDIT_COLL son strings no vacíos."""
    assert isinstance(_DSR_COLL, str) and len(_DSR_COLL) > 0
    assert isinstance(_AUDIT_COLL, str) and len(_AUDIT_COLL) > 0
    assert _DSR_COLL != _AUDIT_COLL
