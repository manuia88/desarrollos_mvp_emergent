"""Wave 3 · Tests bulletins_engine.py · 11 tests unidad sin DB.

Cubre helpers puros y generadores de templates:
- _slug_for (slug normalization para zone_id / general)
- _new_id (id generator)
- _md_to_html (markdown → html minimal renderer)
- _build_bulletin_pdf (PDF bytes integrity · header magic %PDF)
- _iso · _now (timestamp helpers)
- TOP_ZONES integrity
"""
import os
import tempfile

# Redirige los upload dirs a tmp ANTES de importar el módulo,
# que hace os.makedirs() a nivel de import.
os.environ.setdefault("IE_UPLOAD_DIR", os.path.join(tempfile.gettempdir(), "ie_engine"))

from datetime import datetime, timezone

import pytest

from bulletins_engine import (
    TOP_ZONES,
    _build_bulletin_pdf,
    _iso,
    _md_to_html,
    _new_id,
    _now,
    _slug_for,
)

pytestmark = pytest.mark.unit


# ─── TOP_ZONES integrity ─────────────────────────────────────────────────────
def test_top_zones_has_six_entries():
    """V1 distribuye boletines para 6 alcaldías top."""
    assert len(TOP_ZONES) == 6


def test_top_zones_each_has_zone_id_and_name():
    """Cada zone tiene `zone_id` y `name`."""
    for z in TOP_ZONES:
        assert "zone_id" in z
        assert "name" in z
        assert isinstance(z["zone_id"], str) and z["zone_id"]
        assert isinstance(z["name"], str) and z["name"]


# ─── _slug_for ───────────────────────────────────────────────────────────────
def test_slug_for_none_returns_general():
    """None → 'general' (default bucket)."""
    assert _slug_for(None) == "general"


def test_slug_for_normalizes_spaces_lowercase():
    """'Lomas De Chapultepec' → 'lomas_de_chapultepec'."""
    assert _slug_for("Lomas De Chapultepec") == "lomas_de_chapultepec"


def test_slug_for_already_normalized():
    """Slug ya normalizado pasa unchanged."""
    assert _slug_for("polanco") == "polanco"


# ─── _new_id ─────────────────────────────────────────────────────────────────
def test_new_id_default_prefix_bul():
    """Default prefix 'bul_'."""
    assert _new_id().startswith("bul_")


def test_new_id_unique():
    """Ids únicos entre invocaciones."""
    assert _new_id() != _new_id()


# ─── _md_to_html ─────────────────────────────────────────────────────────────
def test_md_to_html_h1_h2_h3():
    """Headers `# / ## / ###` → `<h1> / <h2> / <h3>`."""
    md = "# Title\n## Sub\n### Sub2"
    html = _md_to_html(md)
    assert "<h1>Title</h1>" in html
    assert "<h2>Sub</h2>" in html
    assert "<h3>Sub2</h3>" in html


def test_md_to_html_list_and_paragraph():
    """`- item` → `<li>`, plain → `<p>`."""
    html = _md_to_html("- one\n- two\nplain text")
    assert "<li>one</li>" in html
    assert "<li>two</li>" in html
    assert "<p>plain text</p>" in html


def test_md_to_html_strips_bold_markers():
    """`**bold**` → `bold` (markers eliminados)."""
    html = _md_to_html("este es **negrita** texto")
    assert "**" not in html
    assert "negrita" in html


def test_md_to_html_empty_input():
    """Empty md → empty string."""
    assert _md_to_html("") == ""
    assert _md_to_html(None) == ""


# ─── _build_bulletin_pdf ─────────────────────────────────────────────────────
# Skip si reportlab no instalado (entornos lite)
_HAS_REPORTLAB = True
try:
    import reportlab  # noqa: F401
except Exception:
    _HAS_REPORTLAB = False


@pytest.mark.skipif(not _HAS_REPORTLAB, reason="reportlab no instalado")
def test_build_bulletin_pdf_returns_valid_pdf_bytes():
    """PDF bytes válido (header %PDF-)."""
    kpis = {
        "index_value": 102.5,
        "delta_pct": 1.2,
        "sample_size": 150,
        "r_squared": 0.78,
    }
    pdf = _build_bulletin_pdf(
        title="Test Bulletin",
        period="2026-05",
        kpis=kpis,
        narrative_md="# Heading\n\nBody paragraph.",
    )
    assert isinstance(pdf, bytes)
    assert pdf.startswith(b"%PDF-")
    assert len(pdf) > 500  # PDF mínimo razonable


@pytest.mark.skipif(not _HAS_REPORTLAB, reason="reportlab no instalado")
def test_build_bulletin_pdf_handles_missing_kpis():
    """KPIs con None / faltantes → no crash."""
    pdf = _build_bulletin_pdf(
        title="Empty Test",
        period="2026-05",
        kpis={"index_value": None, "delta_pct": None,
              "sample_size": None, "r_squared": None},
        narrative_md="",
    )
    assert pdf.startswith(b"%PDF-")


# ─── _iso · _now ─────────────────────────────────────────────────────────────
def test_iso_format():
    """_iso emite ISO-8601."""
    s = _iso()
    assert "T" in s


def test_now_utc_aware():
    """_now devuelve datetime UTC-aware."""
    n = _now()
    assert n.tzinfo is not None
    assert n.utcoffset().total_seconds() == 0
