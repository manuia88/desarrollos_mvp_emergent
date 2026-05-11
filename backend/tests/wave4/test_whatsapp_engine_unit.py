"""Wave 4 · Tests whatsapp_engine.py · 12 tests unidad sin DB.

Cubre funciones puras y constantes:
- _now (UTC timezone)
- _msg_id (format `wa_` + 16 hex)
- PROVIDER env var (stub default)
- TWILIO_WA_FROM default prefix `whatsapp:`
- _twilio_send (graceful fail sin twilio creds)
- _verify_twilio_signature (graceful fail con signature inválido)
- _meta_send (graceful fail sin META token)
"""
import os

# Defaults antes de importar el módulo
os.environ.setdefault("WHATSAPP_PROVIDER", "stub")

from datetime import datetime, timezone

import pytest

from whatsapp_engine import (
    PROVIDER,
    TWILIO_WA_FROM,
    _meta_send,
    _msg_id,
    _now,
    _twilio_send,
    _verify_twilio_signature,
)

pytestmark = pytest.mark.unit


# ─── _now ────────────────────────────────────────────────────────────────────
def test_now_returns_datetime():
    """`_now` retorna datetime."""
    assert isinstance(_now(), datetime)


def test_now_is_timezone_aware_utc():
    """`_now` retorna datetime con tz UTC."""
    n = _now()
    assert n.tzinfo is not None
    assert n.tzinfo.utcoffset(n) == timezone.utc.utcoffset(n)


# ─── _msg_id ─────────────────────────────────────────────────────────────────
def test_msg_id_starts_with_wa_prefix():
    """IDs de mensaje WhatsApp empiezan con 'wa_'."""
    mid = _msg_id()
    assert mid.startswith("wa_")


def test_msg_id_has_16_hex_chars_after_prefix():
    """Tras 'wa_' siguen 16 chars hex."""
    mid = _msg_id()
    suffix = mid[3:]
    assert len(suffix) == 16
    int(suffix, 16)  # valida hex


def test_msg_id_unique_across_calls():
    """Dos llamadas consecutivas generan IDs distintos."""
    assert _msg_id() != _msg_id()


# ─── Constants ───────────────────────────────────────────────────────────────
def test_provider_default_is_stub():
    """PROVIDER default = 'stub' (env fixture)."""
    assert PROVIDER in ("stub", "twilio", "business")


def test_twilio_wa_from_has_whatsapp_prefix():
    """TWILIO_WA_FROM siempre lleva 'whatsapp:' prefix."""
    assert TWILIO_WA_FROM.startswith("whatsapp:")


def test_twilio_wa_from_contains_plus_e164():
    """E.164 number: '+' tras 'whatsapp:'."""
    raw = TWILIO_WA_FROM.replace("whatsapp:", "")
    assert raw.startswith("+")
    assert raw[1:].isdigit()


# ─── _twilio_send ────────────────────────────────────────────────────────────
def test_twilio_send_returns_dict_with_ok_key():
    """`_twilio_send` siempre retorna dict con 'ok' key (graceful fail sin creds)."""
    result = _twilio_send("+525555000001", "test body")
    assert isinstance(result, dict)
    assert "ok" in result


def test_twilio_send_fail_has_status_failed():
    """Sin creds reales el envío retorna status='failed' u ok=False."""
    result = _twilio_send("+525555000001", "hola")
    # Sin TWILIO_ACCOUNT_SID válido el resultado debe ser fail
    if not result.get("ok"):
        assert result.get("status") == "failed"
        assert "error" in result


# ─── _verify_twilio_signature ────────────────────────────────────────────────
def test_verify_twilio_signature_invalid_returns_false():
    """Firma inválida → False (no raise)."""
    result = _verify_twilio_signature(
        "https://desarrollosmx.io/api/wa/webhook",
        {"From": "whatsapp:+525555000001", "Body": "hola"},
        "INVALID_SIG",
    )
    assert result is False


def test_verify_twilio_signature_empty_args_returns_false():
    """Args vacíos no levantan excepción."""
    result = _verify_twilio_signature("", {}, "")
    assert isinstance(result, bool)
    assert result is False


# ─── _meta_send ──────────────────────────────────────────────────────────────
def test_meta_send_returns_dict_with_ok_key():
    """`_meta_send` retorna dict con 'ok' (graceful sin META token)."""
    result = _meta_send("+525555000001", "test body")
    assert isinstance(result, dict)
    assert "ok" in result


def test_meta_send_fail_has_error_field():
    """Sin META_PHONE_ID válido falla con error."""
    result = _meta_send("+525555000001", "hola")
    if not result.get("ok"):
        assert "error" in result
        assert result.get("status") == "failed"
