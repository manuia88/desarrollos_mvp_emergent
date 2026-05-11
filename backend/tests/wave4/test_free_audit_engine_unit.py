"""Wave 4 · Tests free_audit_engine.py · 11 tests unidad sin DB.

Cubre funciones PURAS:
- hash_ip (LFPDPPP-safe sha256 32 hex)
- _fmt_mxn (formatter precio)
- _csv_escape (CSV inyection-safe)
- _build_recommendations (3 reco heuristics)
- REQUIRED_FIELDS / _CSV_HEADERS integridad

NO testea async submit / PDF render / Resend → require infra.
"""
import pytest

from free_audit_engine import (
    _CSV_HEADERS,
    REQUIRED_FIELDS,
    _build_recommendations,
    _csv_escape,
    _fmt_mxn,
    hash_ip,
)

pytestmark = pytest.mark.unit


# ─── hash_ip · LFPDPPP ───────────────────────────────────────────────────────

def test_hash_ip_deterministic():
    """Mismo IP → mismo hash."""
    assert hash_ip("10.0.0.1") == hash_ip("10.0.0.1")


def test_hash_ip_length_32():
    """hash_ip retorna 32 hex chars."""
    assert len(hash_ip("1.2.3.4")) == 32


def test_hash_ip_does_not_contain_raw_ip():
    """Hash no expone IP raw (LFPDPPP safe)."""
    h = hash_ip("192.168.42.5")
    assert "192" not in h
    assert "42" not in h or h.count("42") < 5  # accidental collision possible


def test_hash_ip_different_ips_differ():
    """IPs distintas → hashes distintos."""
    assert hash_ip("1.1.1.1") != hash_ip("2.2.2.2")


# ─── _fmt_mxn formatter ──────────────────────────────────────────────────────

def test_fmt_mxn_millions():
    """Valores >= 1M se formatean como X.YM."""
    out = _fmt_mxn(3_500_000)
    assert "M" in out and "3.5" in out


def test_fmt_mxn_thousands():
    """Valores entre 1K y 1M como XXK."""
    out = _fmt_mxn(75_000)
    assert "K" in out


def test_fmt_mxn_none_returns_dash():
    """None → '—'."""
    assert _fmt_mxn(None) == "—"


def test_fmt_mxn_zero_returns_dash():
    """0 también renders '—'."""
    assert _fmt_mxn(0) == "—"


def test_fmt_mxn_small_value():
    """Valor < 1000 muestra exacto."""
    out = _fmt_mxn(500)
    assert "MXN" in out


# ─── _csv_escape ─────────────────────────────────────────────────────────────

def test_csv_escape_plain_string():
    """String sin caracteres especiales no se envuelve."""
    assert _csv_escape("hola") == "hola"


def test_csv_escape_comma_wraps_in_quotes():
    """Comma → comilla envolvente."""
    out = _csv_escape("foo,bar")
    assert out.startswith('"') and out.endswith('"')


def test_csv_escape_quote_doubles():
    """Comilla interna se dobla (RFC 4180)."""
    out = _csv_escape('she said "hi"')
    assert '""' in out


def test_csv_escape_none_is_empty():
    """None → '' (no la palabra 'None')."""
    assert _csv_escape(None) == ""


def test_csv_escape_newline_wraps():
    """Newline también requiere envolver."""
    out = _csv_escape("line1\nline2")
    assert out.startswith('"')


# ─── _build_recommendations ─────────────────────────────────────────────────

def test_recommendations_fallback_includes_distribution():
    """Reco siempre incluye CTA de distribución DMX."""
    recs = _build_recommendations({}, {})
    assert any("DMX" in r.get("title", "") for r in recs)


def test_recommendations_max_3_items():
    """Reco capada a 3 items."""
    recs = _build_recommendations(
        {"precio_estimado": 5_000_000},
        {"zone_score": {"score_total": 90}, "hedonic_pred": {"predicted_total": 4_000_000}},
    )
    assert len(recs) <= 3


def test_recommendations_overpriced_warning():
    """Precio >5% sobre hedónico → reco de ajuste."""
    recs = _build_recommendations(
        {"precio_estimado": 5_500_000},
        {"hedonic_pred": {"predicted_total": 4_000_000}, "zone_score": {"score_total": 70}},
    )
    # 1er reco debería ser ajuste de precio
    titles = " ".join(r.get("title", "") for r in recs)
    assert "precio" in titles.lower() or "ajustar" in titles.lower() or "Reconsidera" in titles


# ─── REQUIRED_FIELDS / _CSV_HEADERS integridad ───────────────────────────────

def test_required_fields_includes_essentials():
    """REQUIRED_FIELDS incluye campos canónicos del audit."""
    assert "project_name" in REQUIRED_FIELDS
    assert "colonia_slug" in REQUIRED_FIELDS
    assert "email" in REQUIRED_FIELDS
    assert "m2" in REQUIRED_FIELDS


def test_csv_headers_includes_audit_id_and_email():
    """CSV export headers cover IDs + contact."""
    assert "audit_id" in _CSV_HEADERS
    assert "email" in _CSV_HEADERS
    assert "submitted_at" in _CSV_HEADERS


def test_csv_headers_size_18():
    """CSV tiene 18 columnas (contratos data team)."""
    assert len(_CSV_HEADERS) == 18
