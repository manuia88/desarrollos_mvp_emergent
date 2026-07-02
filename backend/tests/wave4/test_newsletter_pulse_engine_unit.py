"""Wave 4 · Tests newsletter_pulse_engine.py · 14 tests unidad sin DB.

Cubre constants + funciones puras:
- VALID_SEGMENTS (4 segmentos canónicos)
- SEGMENT_LABELS (cada segmento mapea a label ES)
- SEGMENT_CTA (cada segmento mapea a CTA distinto)
- _now (UTC timezone)
- _run_id (format `pulse_` + 12 hex)
- _stub_segment_content (estructura JSON · all keys present)
- _build_email_html (HTML válido · contiene user_name · CTA · unsubscribe)
"""
from datetime import datetime

import pytest

from newsletter_pulse_engine import (
    SEGMENT_CTA,
    SEGMENT_LABELS,
    VALID_SEGMENTS,
    _build_email_html,
    _now,
    _run_id,
    _stub_segment_content,
)

pytestmark = pytest.mark.unit


# ─── VALID_SEGMENTS ──────────────────────────────────────────────────────────
def test_valid_segments_has_four_canonical():
    """4 segmentos canónicos: dev · asesor · buyer · inversionista."""
    assert VALID_SEGMENTS == {"dev", "asesor", "buyer", "inversionista"}


def test_valid_segments_is_set_type():
    """VALID_SEGMENTS es set (O(1) lookup)."""
    assert isinstance(VALID_SEGMENTS, set)


# ─── SEGMENT_LABELS ──────────────────────────────────────────────────────────
def test_segment_labels_covers_all_segments():
    """Cada segmento de VALID_SEGMENTS tiene label."""
    for seg in VALID_SEGMENTS:
        assert seg in SEGMENT_LABELS
        assert isinstance(SEGMENT_LABELS[seg], str) and SEGMENT_LABELS[seg]


def test_segment_labels_dev_is_desarrolladores():
    """'dev' → 'Desarrolladores'."""
    assert SEGMENT_LABELS["dev"] == "Desarrolladores"


def test_segment_labels_asesor_is_asesores_inmobiliarios():
    """'asesor' → 'Asesores Inmobiliarios'."""
    assert SEGMENT_LABELS["asesor"] == "Asesores Inmobiliarios"


# ─── SEGMENT_CTA ─────────────────────────────────────────────────────────────
def test_segment_cta_covers_all_segments():
    """Cada segmento tiene CTA texto distintivo."""
    for seg in VALID_SEGMENTS:
        assert seg in SEGMENT_CTA
        assert isinstance(SEGMENT_CTA[seg], str) and SEGMENT_CTA[seg]


def test_segment_cta_all_distinct():
    """Los 4 CTAs son únicos (no duplicados)."""
    ctas = list(SEGMENT_CTA.values())
    assert len(ctas) == len(set(ctas))


def test_segment_cta_ends_with_arrow():
    """Cada CTA termina con flecha → (UX consistente)."""
    for seg, cta in SEGMENT_CTA.items():
        assert cta.endswith("→")


# ─── _now ────────────────────────────────────────────────────────────────────
def test_now_returns_utc_datetime():
    """`_now` retorna datetime tz-aware UTC."""
    n = _now()
    assert isinstance(n, datetime)
    assert n.tzinfo is not None


# ─── _run_id ─────────────────────────────────────────────────────────────────
def test_run_id_format():
    """ID format: 'pulse_' + 12 hex."""
    rid = _run_id()
    assert rid.startswith("pulse_")
    suffix = rid[len("pulse_"):]
    assert len(suffix) == 12
    int(suffix, 16)


def test_run_id_unique():
    """IDs únicos entre llamadas."""
    assert _run_id() != _run_id()


# ─── _stub_segment_content ───────────────────────────────────────────────────
def test_stub_segment_content_has_required_keys():
    """Stub content tiene todas las keys esperadas por _build_email_html."""
    content = _stub_segment_content("dev")
    for key in ("hero_title", "market_summary", "top_3_zonas", "segment_highlight", "cost_usd", "layer"):
        assert key in content


def test_stub_segment_content_top_3_zonas_has_three_entries():
    """top_3_zonas tiene exactamente 3 zonas."""
    content = _stub_segment_content("buyer")
    assert len(content["top_3_zonas"]) == 3
    for z in content["top_3_zonas"]:
        assert "name" in z
        assert "insight" in z


def test_stub_segment_content_cost_zero_layer_stub():
    """Stub layer cost=0 and layer='stub'."""
    content = _stub_segment_content("inversionista")
    assert content["cost_usd"] == 0.0
    assert content["layer"] == "stub"


# ─── _build_email_html ───────────────────────────────────────────────────────
def test_build_email_html_contains_user_name():
    """HTML contiene user_name personalizado."""
    content = _stub_segment_content("dev")
    html = _build_email_html(
        user_name="Manuel",
        segment="dev",
        content=content,
        personalized_section="Personal test",
        unsubscribe_url="https://desarrollosmx.io/unsub",
    )
    assert "Manuel" in html


def test_build_email_html_contains_unsubscribe_url():
    """HTML contiene el unsubscribe_url."""
    content = _stub_segment_content("asesor")
    html = _build_email_html(
        user_name="Ana",
        segment="asesor",
        content=content,
        personalized_section="",
        unsubscribe_url="https://desarrollosmx.io/unsub/xyz",
    )
    assert "https://desarrollosmx.io/unsub/xyz" in html


def test_build_email_html_contains_segment_cta():
    """HTML contiene el CTA correcto del segmento."""
    content = _stub_segment_content("buyer")
    html = _build_email_html(
        user_name="Luis",
        segment="buyer",
        content=content,
        personalized_section="",
        unsubscribe_url="https://desarrollosmx.io/unsub",
    )
    assert SEGMENT_CTA["buyer"] in html


def test_build_email_html_omits_personal_block_when_empty():
    """Sin personalized_section, el bloque personal no aparece."""
    content = _stub_segment_content("inversionista")
    html = _build_email_html(
        user_name="Pedro",
        segment="inversionista",
        content=content,
        personalized_section="",
        unsubscribe_url="https://desarrollosmx.io/unsub",
    )
    # El border-left:4px solid #6366F1 solo aparece si personal_html no vacío
    assert "border-left:4px solid #6366F1" not in html


def test_build_email_html_doctype_present():
    """HTML válido empieza con <!DOCTYPE html>."""
    content = _stub_segment_content("dev")
    html = _build_email_html("X", "dev", content, "", "https://x.io")
    assert html.lstrip().startswith("<!DOCTYPE html>")
