"""Wave 4 · Tests brochure_engine.py · 13 tests unidad sin DB.

Cubre helpers PUROS (no async · no Mongo):
- BRANDING_VARIANTS catalog (5 variants + DEFAULT_VARIANT)
- resolve_variant (fallback DEFAULT, mapping consistente)
- list_branding_variants (5 variants, all required keys)
- _pdf_public_url / _social_public_urls (path templating)
- Constants integrity (EXPIRY_DAYS, MAX_CUSTOM_UPLOAD_MB, ALLOWED_CUSTOM_MIMES)

NO testea generate_brochure (toca renderer + mongo). NO testea
register_custom_upload (toca filesystem). NO ReportLab real.
"""
import pytest

from brochure_engine import (
    ALLOWED_CUSTOM_MIMES,
    BRANDING_VARIANTS,
    DEFAULT_VARIANT,
    EXPIRY_DAYS,
    MAX_CUSTOM_UPLOAD_MB,
    PUBLIC_PATH_PREFIX,
    _pdf_public_url,
    _social_public_urls,
    list_branding_variants,
    resolve_variant,
)

pytestmark = pytest.mark.unit


# ─── Branding variants catalog ───────────────────────────────────────────────


def test_branding_variants_has_exactly_5_variants():
    """Catalog declara exactamente 5 variants brand."""
    assert len(BRANDING_VARIANTS) == 5


def test_branding_variants_ids_match_keys():
    """Cada variant['id'] coincide con su clave en el dict (consistencia)."""
    for key, variant in BRANDING_VARIANTS.items():
        assert variant["id"] == key, f"variant id mismatch para {key}"


def test_branding_variants_required_keys_present():
    """Cada variant tiene las claves mínimas para renderer + UI."""
    required = {"id", "label", "description", "primary", "secondary",
                "accent", "heading_font", "body_font", "uses_gradient"}
    for key, variant in BRANDING_VARIANTS.items():
        missing = required - set(variant.keys())
        assert not missing, f"variant {key} falta claves: {missing}"


def test_branding_variant_ids_canonical_set():
    """Los IDs deben ser exactamente los 5 canónicos (no rename silencioso)."""
    expected = {"corporate_navy", "cream_minimal", "gradient_bold",
                "editorial_serif", "dmx_neutral"}
    assert set(BRANDING_VARIANTS.keys()) == expected


def test_default_variant_is_dmx_neutral():
    """Default variant = dmx_neutral (canónico)."""
    assert DEFAULT_VARIANT == "dmx_neutral"
    assert DEFAULT_VARIANT in BRANDING_VARIANTS


def test_branding_variants_hex_colors_valid():
    """primary/secondary/accent son hex válidos (#RRGGBB)."""
    import re
    hex_re = re.compile(r"^#[0-9A-Fa-f]{6}$")
    for key, variant in BRANDING_VARIANTS.items():
        for color_field in ("primary", "secondary", "accent"):
            assert hex_re.match(variant[color_field]), (
                f"variant {key} field {color_field} no es hex válido"
            )


# ─── resolve_variant ─────────────────────────────────────────────────────────


def test_resolve_variant_returns_default_when_none():
    """resolve_variant(None) retorna DEFAULT_VARIANT."""
    out = resolve_variant(None)
    assert out["id"] == DEFAULT_VARIANT


def test_resolve_variant_returns_default_for_unknown():
    """resolve_variant('foo_bar_invalid') retorna DEFAULT (no raise)."""
    out = resolve_variant("foo_bar_invalid_xxx")
    assert out["id"] == DEFAULT_VARIANT


def test_resolve_variant_returns_requested():
    """resolve_variant('corporate_navy') retorna corporate_navy."""
    out = resolve_variant("corporate_navy")
    assert out["id"] == "corporate_navy"
    assert out["label"] == "Corporate Navy"


# ─── list_branding_variants ──────────────────────────────────────────────────


def test_list_branding_variants_returns_full_catalog():
    """list_branding_variants() retorna catalog completo (igual a BRANDING_VARIANTS)."""
    out = list_branding_variants()
    assert out == BRANDING_VARIANTS
    assert len(out) == 5


# ─── URL builders ─────────────────────────────────────────────────────────────


def test_pdf_public_url_format():
    """_pdf_public_url genera URL canónica /api/brochures/files/{id}/pdf."""
    url = _pdf_public_url("abc-123")
    assert url == f"{PUBLIC_PATH_PREFIX}/abc-123/pdf"
    assert url.startswith("/api/brochures/files/")


def test_social_public_urls_skips_empty_paths():
    """_social_public_urls omite formatos con path vacío."""
    out = _social_public_urls("bid", {"fb_feed": "/tmp/a.png", "ig_feed": ""})
    assert "fb_feed" in out
    assert "ig_feed" not in out
    assert out["fb_feed"].endswith("/social/fb_feed")


def test_social_public_urls_uses_prefix():
    """_social_public_urls usa PUBLIC_PATH_PREFIX y el brochure_id."""
    out = _social_public_urls("zz", {"ig_stories": "/x/y.png"})
    assert out["ig_stories"] == f"{PUBLIC_PATH_PREFIX}/zz/social/ig_stories"


# ─── Constants integrity ──────────────────────────────────────────────────────


def test_constants_business_invariants():
    """EXPIRY_DAYS >0 · MAX_CUSTOM_UPLOAD_MB >0 · ALLOWED_CUSTOM_MIMES tiene pdf."""
    assert EXPIRY_DAYS > 0
    assert MAX_CUSTOM_UPLOAD_MB > 0
    assert "application/pdf" in ALLOWED_CUSTOM_MIMES
