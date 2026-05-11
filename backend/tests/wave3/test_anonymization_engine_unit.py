"""Wave 3 · Tests anonymization_engine.py · 16 tests unidad sin DB.

Cubre helpers PUROS (no async · no Mongo):
- strip_pii (recursivo · raw PII · enterprise tier)
- add_differential_privacy_noise (Laplace + cap ±25%)
- _PII_FIELDS_RAW / _ENTERPRISE_ONLY_FIELDS (constantes integridad)

NO testea async helpers DB (check_k_anonymity) → require AsyncIOMotor.
Privacy-critical: verifica que PII NUNCA escapa public/pro responses.
"""
import random

import pytest

from anonymization_engine import (
    _ENTERPRISE_ONLY_FIELDS,
    _PII_FIELDS_RAW,
    add_differential_privacy_noise,
    strip_pii,
)

pytestmark = pytest.mark.unit


# ─── strip_pii · raw PII ─────────────────────────────────────────────────────

def test_strip_pii_removes_buyer_email():
    """strip_pii elimina campo buyer_email de un dict simple."""
    record = {"buyer_email": "x@y.com", "price": 100}
    out = strip_pii(record, "public")
    assert "buyer_email" not in out
    assert out["price"] == 100


def test_strip_pii_removes_all_raw_fields():
    """strip_pii elimina TODOS los campos raw PII en public tier."""
    record = {f: "value" for f in _PII_FIELDS_RAW}
    record["safe_field"] = "ok"
    out = strip_pii(record, "public")
    for f in _PII_FIELDS_RAW:
        assert f not in out, f"raw PII field '{f}' debió eliminarse"
    assert out["safe_field"] == "ok"


def test_strip_pii_removes_rfc_curp():
    """strip_pii elimina identificadores fiscales mexicanos (RFC, CURP)."""
    record = {"rfc": "ABCD800101XYZ", "curp": "ABCD800101HDFXYZ01", "x": 1}
    out = strip_pii(record, "public")
    assert "rfc" not in out
    assert "curp" not in out
    assert out["x"] == 1


def test_strip_pii_removes_address_full():
    """strip_pii elimina address_full + sub-componentes de domicilio."""
    record = {
        "address_full": "Reforma 222",
        "address_street": "Reforma",
        "address_number": "222",
        "zone_id": "polanco",
    }
    out = strip_pii(record, "public")
    assert "address_full" not in out
    assert "address_street" not in out
    assert "address_number" not in out
    assert out["zone_id"] == "polanco"


# ─── strip_pii · tier behavior ───────────────────────────────────────────────

def test_strip_pii_public_removes_hashed_ids():
    """strip_pii public tier ALSO elimina hashed identifiers."""
    record = {"property_id_hash": "abc123", "anonymized_id": "xyz789", "x": 1}
    out = strip_pii(record, "public")
    assert "property_id_hash" not in out
    assert "anonymized_id" not in out
    assert out["x"] == 1


def test_strip_pii_pro_removes_hashed_ids():
    """strip_pii pro tier también elimina hashed identifiers (igual que public)."""
    record = {"property_id_hash": "abc123", "anonymized_id": "xyz789"}
    out = strip_pii(record, "pro")
    assert "property_id_hash" not in out
    assert "anonymized_id" not in out


def test_strip_pii_enterprise_keeps_hashed_ids():
    """strip_pii enterprise tier MANTIENE hashed identifiers (raw PII still gone)."""
    record = {
        "property_id_hash": "abc123",
        "anonymized_id": "xyz789",
        "owner_name": "Juan",  # raw PII → must go
    }
    out = strip_pii(record, "enterprise")
    assert out["property_id_hash"] == "abc123"
    assert out["anonymized_id"] == "xyz789"
    assert "owner_name" not in out


# ─── strip_pii · recursion ───────────────────────────────────────────────────

def test_strip_pii_recursive_in_nested_dict():
    """strip_pii recursivo: elimina PII en sub-objetos."""
    record = {
        "zone_id": "polanco",
        "owner_info": {
            "owner_name": "Juan",
            "buyer_email": "j@y.com",
            "preferences": "tres recamaras",
        },
    }
    out = strip_pii(record, "public")
    assert out["zone_id"] == "polanco"
    assert "owner_name" not in out["owner_info"]
    assert "buyer_email" not in out["owner_info"]
    assert out["owner_info"]["preferences"] == "tres recamaras"


def test_strip_pii_handles_list_of_records():
    """strip_pii aplica a cada item cuando recibe lista."""
    records = [
        {"buyer_email": "a@a.com", "x": 1},
        {"buyer_email": "b@b.com", "x": 2},
    ]
    out = strip_pii(records, "public")
    assert isinstance(out, list)
    assert len(out) == 2
    for item in out:
        assert "buyer_email" not in item


def test_strip_pii_recursive_in_nested_list():
    """strip_pii recursivo en listas anidadas dentro de dict."""
    record = {
        "transactions": [
            {"buyer_email": "x@y.com", "amount": 100},
            {"seller_name": "Pedro", "amount": 200},
        ]
    }
    out = strip_pii(record, "public")
    assert out["transactions"][0]["amount"] == 100
    assert "buyer_email" not in out["transactions"][0]
    assert out["transactions"][1]["amount"] == 200
    assert "seller_name" not in out["transactions"][1]


def test_strip_pii_passthrough_primitives():
    """strip_pii devuelve primitivos sin cambios."""
    assert strip_pii(42, "public") == 42
    assert strip_pii("hello", "public") == "hello"
    assert strip_pii(None, "public") is None


def test_strip_pii_does_not_mutate_input():
    """strip_pii NO debe mutar el dict original."""
    record = {"buyer_email": "x@y.com", "x": 1}
    _ = strip_pii(record, "public")
    assert "buyer_email" in record  # original intacto


# ─── add_differential_privacy_noise ─────────────────────────────────────────

def test_dp_noise_none_returns_none():
    """add_differential_privacy_noise pasa None sin tocarlo."""
    assert add_differential_privacy_noise(None) is None


def test_dp_noise_returns_float_within_cap():
    """noise nunca excede ±25 % del valor original."""
    random.seed(42)
    value = 100.0
    cap = abs(value) * 0.25
    for _ in range(100):
        out = add_differential_privacy_noise(value, epsilon=1.0, sensitivity=1.0)
        assert isinstance(out, float)
        assert abs(out - value) <= cap + 0.01  # 0.01 margen redondeo


def test_dp_noise_zero_value_uses_scale_cap():
    """value=0 usa cap = scale * 5 (no aborta div-by-zero)."""
    random.seed(7)
    out = add_differential_privacy_noise(0.0, epsilon=1.0, sensitivity=1.0)
    assert isinstance(out, float)
    # cap = 1.0/1.0 * 5 = 5
    assert abs(out) <= 5.01


def test_dp_noise_deterministic_with_seed():
    """Con la misma seed RNG y mismos params → resultado determinista."""
    random.seed(123)
    a = add_differential_privacy_noise(50.0, epsilon=1.0, sensitivity=1.0)
    random.seed(123)
    b = add_differential_privacy_noise(50.0, epsilon=1.0, sensitivity=1.0)
    assert a == b


# ─── Constants integrity ─────────────────────────────────────────────────────

def test_pii_fields_raw_includes_critical_identifiers():
    """PII raw list contiene identificadores críticos LFPDPPP."""
    critical = ["rfc", "curp", "buyer_email", "seller_email", "folio_notarial", "owner_name"]
    for f in critical:
        assert f in _PII_FIELDS_RAW, f"campo crítico '{f}' falta en _PII_FIELDS_RAW"


def test_enterprise_only_fields_distinct_from_raw_pii():
    """_ENTERPRISE_ONLY_FIELDS y _PII_FIELDS_RAW son disjuntos."""
    overlap = set(_ENTERPRISE_ONLY_FIELDS) & set(_PII_FIELDS_RAW)
    assert overlap == set(), f"overlap inesperado: {overlap}"
