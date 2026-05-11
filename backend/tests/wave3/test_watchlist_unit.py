"""Wave 3 · Tests routes/watchlist.py · 9 tests unidad sin DB.

Cubre helpers PUROS (no async · no Mongo · no FastAPI request):
- _now (UTC datetime)
- _public_url (env DMX_PUBLIC_URL fallback)
- EMAIL_RE (regex validación email)
- VALID_SCOPES (set membership LFPDPPP scope opt-in)
- Pydantic schemas (SubscribeRequest defaults)

NO testea endpoints async (subscribe / confirm / manage_get / manage_update /
manage_unsubscribe / ensure_indexes / _send_opt_in_email) → require AsyncIOMotor +
FastAPI Request + Resend stubs.
"""
import os
from datetime import datetime, timezone

import pytest

from routes.watchlist import (
    EMAIL_RE,
    VALID_SCOPES,
    SubscribeRequest,
    UpdateRequest,
    _now,
    _public_url,
)

pytestmark = pytest.mark.unit


# ─── _now ────────────────────────────────────────────────────────────────────

def test_now_returns_utc_datetime():
    """_now() devuelve datetime con UTC timezone."""
    out = _now()
    assert isinstance(out, datetime)
    assert out.tzinfo is not None
    assert out.utcoffset().total_seconds() == 0


# ─── _public_url ─────────────────────────────────────────────────────────────

def test_public_url_default_fallback(monkeypatch):
    """_public_url() devuelve desarrollosmx.io cuando env var ausente."""
    monkeypatch.delenv("DMX_PUBLIC_URL", raising=False)
    assert _public_url() == "https://desarrollosmx.io"


def test_public_url_strips_trailing_slash(monkeypatch):
    """_public_url() quita slash final del env var."""
    monkeypatch.setenv("DMX_PUBLIC_URL", "https://staging.desarrollosmx.io/")
    assert _public_url() == "https://staging.desarrollosmx.io"


# ─── EMAIL_RE ────────────────────────────────────────────────────────────────

def test_email_re_accepts_standard_emails():
    """EMAIL_RE acepta emails válidos comunes."""
    valid = [
        "user@example.com",
        "first.last@subdomain.example.mx",
        "user+tag@gmail.com",
        "name_123@desarrollosmx.io",
    ]
    for e in valid:
        assert EMAIL_RE.match(e), f"email válido rechazado: {e}"


def test_email_re_rejects_malformed_emails():
    """EMAIL_RE rechaza emails malformados."""
    invalid = [
        "no-at-symbol",
        "@nouser.com",
        "user@",
        "user@.com",
        "user@nodot",
        "",
    ]
    for e in invalid:
        assert not EMAIL_RE.match(e), f"email inválido aceptado: {e}"


# ─── VALID_SCOPES ────────────────────────────────────────────────────────────

def test_valid_scopes_set_contents():
    """VALID_SCOPES contiene exactamente {bulletins, risk_alerts, both}."""
    assert VALID_SCOPES == {"bulletins", "risk_alerts", "both"}


def test_valid_scopes_membership_o1():
    """VALID_SCOPES es set (membership O(1))."""
    assert isinstance(VALID_SCOPES, set)
    assert "both" in VALID_SCOPES
    assert "spam" not in VALID_SCOPES


# ─── Pydantic schemas defaults ───────────────────────────────────────────────

def test_subscribe_request_defaults():
    """SubscribeRequest defaults: zone_ids=[] · scope='both'."""
    req = SubscribeRequest(email="x@y.com")
    assert req.email == "x@y.com"
    assert req.zone_ids == []
    assert req.scope == "both"


def test_update_request_optional_fields():
    """UpdateRequest acepta None en ambos campos (PATCH semantics)."""
    req = UpdateRequest()
    assert req.zone_ids is None
    assert req.scope is None
