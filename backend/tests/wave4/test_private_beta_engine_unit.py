"""Wave 4 · Tests private_beta_engine.py · 12 tests unidad sin DB.

Cubre funciones PURAS:
- _gen_code_str (DMX-BR-XXXXXX · 36^6 combinaciones)
- _ip_hash (LFPDPPP)
- is_private_beta_mode (env var truthy parsing)
- _expires_days_default (env override)
- CODE_PREFIX / CODE_BODY_LEN / CODE_ALPHABET integridad

NO testea async DB (generate_codes, validate_code, waitlist) → require Mongo.
"""
import os
import string
from unittest.mock import patch

import pytest

from private_beta_engine import (
    CODE_ALPHABET,
    CODE_BODY_LEN,
    CODE_PREFIX,
    _expires_days_default,
    _gen_code_str,
    _ip_hash,
    is_private_beta_mode,
)

pytestmark = pytest.mark.unit


# ─── _gen_code_str · invite code format ──────────────────────────────────────

def test_gen_code_starts_with_prefix():
    """Código generado empieza con 'DMX-BR-'."""
    code = _gen_code_str()
    assert code.startswith("DMX-BR-")


def test_gen_code_body_length_6():
    """Body después del prefijo es 6 chars."""
    code = _gen_code_str()
    body = code[len(CODE_PREFIX):]
    assert len(body) == 6


def test_gen_code_body_uses_alphabet():
    """Body solo usa CODE_ALPHABET (A-Z 0-9)."""
    code = _gen_code_str()
    body = code[len(CODE_PREFIX):]
    for ch in body:
        assert ch in CODE_ALPHABET, f"char '{ch}' not in alphabet"


def test_gen_code_high_entropy_unique():
    """Codes únicos en 50 generaciones (36^6 = 2.1B combinaciones · choque improbable)."""
    codes = {_gen_code_str() for _ in range(50)}
    assert len(codes) == 50


def test_gen_code_total_length():
    """Total length = prefix(7) + 6 = 13."""
    code = _gen_code_str()
    assert len(code) == len(CODE_PREFIX) + CODE_BODY_LEN


# ─── _ip_hash · LFPDPPP ──────────────────────────────────────────────────────

def test_ip_hash_returns_16_hex():
    """ip_hash es 16 hex chars."""
    h = _ip_hash("1.2.3.4")
    assert len(h) == 16
    assert all(c in "0123456789abcdef" for c in h)


def test_ip_hash_empty_returns_empty():
    """IP vacío → '' (defensivo)."""
    assert _ip_hash("") == ""


def test_ip_hash_deterministic():
    """Mismo IP → mismo hash."""
    assert _ip_hash("10.0.0.1") == _ip_hash("10.0.0.1")


def test_ip_hash_different_ips_differ():
    """IPs distintas → hashes distintos."""
    assert _ip_hash("1.1.1.1") != _ip_hash("2.2.2.2")


# ─── is_private_beta_mode · env var parsing ──────────────────────────────────

def test_private_beta_mode_truthy_values():
    """'1', 'true', 'yes' → True."""
    for val in ("1", "true", "TRUE", "yes", "YES"):
        with patch.dict(os.environ, {"PRIVATE_BETA_MODE": val}):
            assert is_private_beta_mode() is True


def test_private_beta_mode_falsy_values():
    """'0', 'false', '' → False."""
    for val in ("0", "false", "FALSE", ""):
        with patch.dict(os.environ, {"PRIVATE_BETA_MODE": val}):
            assert is_private_beta_mode() is False


def test_private_beta_mode_unset_returns_false():
    """Sin env var → False (default seguro)."""
    env = {k: v for k, v in os.environ.items() if k != "PRIVATE_BETA_MODE"}
    with patch.dict(os.environ, env, clear=True):
        assert is_private_beta_mode() is False


# ─── _expires_days_default ───────────────────────────────────────────────────

def test_expires_days_default_uses_env():
    """Lee PRIVATE_BETA_INVITE_EXPIRES_DAYS."""
    with patch.dict(os.environ, {"PRIVATE_BETA_INVITE_EXPIRES_DAYS": "30"}):
        assert _expires_days_default() == 30


def test_expires_days_default_fallback_90():
    """Sin env var → 90 default."""
    env = {k: v for k, v in os.environ.items() if k != "PRIVATE_BETA_INVITE_EXPIRES_DAYS"}
    with patch.dict(os.environ, env, clear=True):
        assert _expires_days_default() == 90


def test_expires_days_default_invalid_fallback():
    """Valor no parseable → fallback 90."""
    with patch.dict(os.environ, {"PRIVATE_BETA_INVITE_EXPIRES_DAYS": "garbage"}):
        assert _expires_days_default() == 90


# ─── Constants integrity ─────────────────────────────────────────────────────

def test_code_prefix_canonical():
    """CODE_PREFIX is 'DMX-BR-' (canonical brand format)."""
    assert CODE_PREFIX == "DMX-BR-"


def test_code_body_len_is_6():
    """Body de 6 chars · 36^6 = 2.1B combinaciones."""
    assert CODE_BODY_LEN == 6


def test_code_alphabet_36_chars():
    """Alphabet: A-Z (26) + 0-9 (10) = 36 chars."""
    assert len(CODE_ALPHABET) == 36
    assert set(CODE_ALPHABET) == set(string.ascii_uppercase + string.digits)


def test_code_combinations_space():
    """36^6 = 2,176,782,336 combinaciones (anti-bruteforce)."""
    space = len(CODE_ALPHABET) ** CODE_BODY_LEN
    assert space == 2_176_782_336
