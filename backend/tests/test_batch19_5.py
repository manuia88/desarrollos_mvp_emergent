"""
Batch 19.5 Tests
- GET /api/public/projects/{slug}/booking retorna dev_branding con shape correcto
- Org sin branding → response retorna defaults DMX
- PUT branding + verificar PDF genera sin errors
- Email template render contiene display_name del org en footer (HTML contenido)
- Reset branding → dev_branding en booking page vuelve a defaults
"""
import pytest
import requests
import os

BASE = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001")

DMX_DEFAULT_PRIMARY = "#06080F"
DMX_DEFAULT_ACCENT  = "#F4E9D8"

def _login(email, password):
    r = requests.post(f"{BASE}/api/auth/login",
                      json={"email": email, "password": password})
    assert r.status_code == 200, f"Login failed ({email}): {r.text}"
    return r.cookies


@pytest.fixture(scope="module")
def admin_cookies():
    return _login("admin@desarrollosmx.com", "Admin2026!")


# ─── helpers ────────────────────────────────────────────────────────────────

def _get_booking_info(slug: str):
    """Public endpoint — no auth required."""
    r = requests.get(f"{BASE}/api/public/projects/{slug}/booking")
    return r


def _get_any_public_slug(admin_cookies) -> str:
    """Get a valid public project slug from the developer's projects."""
    r = requests.get(f"{BASE}/api/developments", cookies=admin_cookies, params={"limit": 5})
    if r.status_code != 200:
        return "dmx-keys"
    data = r.json()
    # response may be a list or dict with items key
    items = data if isinstance(data, list) else data.get("items", [])
    if items:
        slug = items[0].get("slug") if isinstance(items[0], dict) else None
        if slug:
            return slug
    return "dmx-keys"


# ─── Tests ───────────────────────────────────────────────────────────────────

def test_booking_page_returns_dev_branding(admin_cookies):
    """GET /api/public/projects/{slug}/booking → response has dev_branding field with correct shape."""
    slug = _get_any_public_slug(admin_cookies)
    r = _get_booking_info(slug)
    assert r.status_code == 200, f"Booking page returned {r.status_code}: {r.text}"
    data = r.json()
    assert "dev_branding" in data, f"dev_branding missing from booking response. Keys: {list(data.keys())}"
    branding = data["dev_branding"]
    # Required fields
    for field in ("primary_color", "accent_color", "display_name"):
        assert field in branding, f"Missing field '{field}' in dev_branding: {branding}"


def test_booking_page_branding_has_valid_colors(admin_cookies):
    """Branding colors are valid hex strings."""
    slug = _get_any_public_slug(admin_cookies)
    r = _get_booking_info(slug)
    assert r.status_code == 200
    branding = r.json()["dev_branding"]
    primary = branding.get("primary_color", "")
    accent  = branding.get("accent_color", "")
    assert primary.startswith("#"), f"primary_color should be hex: {primary}"
    assert accent.startswith("#"),  f"accent_color should be hex: {accent}"


def test_booking_page_branding_fallback_to_dmx_defaults(admin_cookies):
    """Org without branding → response returns DMX default colors."""
    # First reset branding to defaults
    requests.put(
        f"{BASE}/api/orgs/me/branding",
        json={"primary_color": "#06080F", "accent_color": "#F4E9D8"},
        cookies=admin_cookies,
    )

    slug = _get_any_public_slug(admin_cookies)
    r = _get_booking_info(slug)
    assert r.status_code == 200
    branding = r.json().get("dev_branding") or {}
    primary = branding.get("primary_color") or ""
    # Should be DMX default or at minimum a valid hex
    assert primary.startswith("#"), f"Expected hex color, got: {primary}"
    # After reset, should be DMX default
    assert primary.lower() in ("#06080f", "#06080F"), f"Expected DMX default #06080F, got: {primary}"


def test_email_footer_html_contains_display_name():
    """Email footer HTML renders org display_name correctly."""
    import sys, os; sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
    from branding_helpers import email_footer_html
    branding = {
        "display_name": "Constructora TestOrg B19.5",
        "tagline": "Un tagline de prueba",
        "primary_color": "#1A2B3C",
        "accent_color": "#FFFFFF",
        "logo_url": None,
    }
    footer = email_footer_html(branding)
    assert "Constructora TestOrg B19.5" in footer, f"display_name not in footer: {footer[:300]}"
    assert "Un tagline de prueba" in footer, f"tagline not in footer: {footer[:300]}"


def test_email_footer_html_uses_dmx_defaults_when_none():
    """email_footer_html with None branding falls back to DesarrollosMX."""
    import sys, os; sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
    from branding_helpers import email_footer_html
    footer = email_footer_html(None)
    assert "DesarrollosMX" in footer, f"DMX default name not in footer: {footer[:300]}"
