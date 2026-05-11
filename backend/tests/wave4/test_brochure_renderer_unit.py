"""Wave 4 · Tests brochure_renderer.py · 8 tests unidad sin red.

Cubre helpers PUROS (no ReportLab full render · no Pillow real fetch · no HTTP):
- _SOCIAL_SPECS catalog (4 formats · canonical dimensions)
- _fmt_price (None/0/<1M/>1M edge cases)
- _font_path (mapping variants · None when font missing)
- Storage dirs constants

NO testea render_brochure_pdf (requiere fonts + ReportLab full path).
NO testea render_social_variant (requiere Pillow + image fetch).
NO testea _fetch_image_pil (red HTTP).
"""
import pytest

from brochure_renderer import (
    PDF_DIR,
    SOCIAL_DIR,
    STORAGE_BASE,
    _SOCIAL_SPECS,
    _fmt_price,
    _font_path,
)

pytestmark = pytest.mark.unit


# ─── _SOCIAL_SPECS catalog ───────────────────────────────────────────────────


def test_social_specs_has_4_formats():
    """_SOCIAL_SPECS declara exactamente 4 variants sociales."""
    assert len(_SOCIAL_SPECS) == 4


def test_social_specs_canonical_keys():
    """Keys deben ser fb_feed, ig_feed, ig_stories, wa_status."""
    assert set(_SOCIAL_SPECS.keys()) == {
        "fb_feed", "ig_feed", "ig_stories", "wa_status"
    }


def test_social_specs_dimensions_canonical():
    """Cada variant tiene (W,H) en tupla > 0."""
    expected = {
        "fb_feed": (1200, 630),
        "ig_feed": (1080, 1080),
        "ig_stories": (1080, 1920),
        "wa_status": (1080, 1920),
    }
    assert _SOCIAL_SPECS == expected


def test_social_specs_all_positive_dimensions():
    """Todas las dimensiones son enteros positivos."""
    for fmt, (w, h) in _SOCIAL_SPECS.items():
        assert isinstance(w, int) and w > 0, f"{fmt} W inválido"
        assert isinstance(h, int) and h > 0, f"{fmt} H inválido"


# ─── _fmt_price ──────────────────────────────────────────────────────────────


def test_fmt_price_none_returns_consultar():
    """_fmt_price(None) → 'Consultar'."""
    assert _fmt_price(None) == "Consultar"


def test_fmt_price_zero_returns_consultar():
    """_fmt_price(0) → 'Consultar' (falsy)."""
    assert _fmt_price(0) == "Consultar"


def test_fmt_price_million_uses_m_format():
    """_fmt_price(>=1M) usa formato 'X.XM MXN'."""
    out = _fmt_price(5_500_000)
    assert "M MXN" in out
    assert "5.5" in out


def test_fmt_price_sub_million_uses_full_number():
    """_fmt_price(<1M) usa formato comma-separated."""
    out = _fmt_price(800_000)
    assert "MXN" in out
    assert "M MXN" not in out  # no usa abreviación M
    assert "800" in out


# ─── _font_path mapping ──────────────────────────────────────────────────────


def test_font_path_unknown_variant_returns_none():
    """_font_path('inexistente') retorna None (no raise)."""
    assert _font_path("inexistente_xxx") is None


def test_font_path_known_variant_returns_string_or_none():
    """_font_path('bold') retorna str (si font existe) o None (si no)."""
    out = _font_path("bold")
    assert out is None or isinstance(out, str)


# ─── Storage paths ────────────────────────────────────────────────────────────


def test_storage_paths_under_base():
    """PDF_DIR y SOCIAL_DIR cuelgan de STORAGE_BASE."""
    # PDF_DIR and SOCIAL_DIR son subdirs de STORAGE_BASE
    assert str(PDF_DIR).startswith(str(STORAGE_BASE))
    assert str(SOCIAL_DIR).startswith(str(STORAGE_BASE))
    assert PDF_DIR.name == "pdf"
    assert SOCIAL_DIR.name == "social"
