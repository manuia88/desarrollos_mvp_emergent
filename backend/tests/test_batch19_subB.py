"""
Batch 19 Sub-B Tests
- branding GET/PUT con admin OK + LEE post-save valor exacto
- Logo upload <500KB OK, >500KB → 413
- PUT con asesor role → 403
- cross_portal_events log creado en mutaciones críticas
- Reset branding → defaults DMX
"""
import pytest
import requests
import os
import io

BASE = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001")

DMX_DEFAULTS = {
    "primary_color": "#06080F",
    "accent_color": "#F4E9D8",
}

def _login(email, password):
    r = requests.post(f"{BASE}/api/auth/login",
                      json={"email": email, "password": password})
    assert r.status_code == 200, f"Login failed ({email}): {r.text}"
    return r.cookies


@pytest.fixture(scope="module")
def admin_cookies():
    return _login("admin@desarrollosmx.com", "Admin2026!")


@pytest.fixture(scope="module")
def asesor_cookies():
    return _login("asesor@demo.com", "Asesor2026!")


# ─── Tests ───────────────────────────────────────────────────────────────────

def test_branding_get_returns_defaults(admin_cookies):
    """GET /api/orgs/me/branding returns branding object."""
    r = requests.get(f"{BASE}/api/orgs/me/branding", cookies=admin_cookies)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "branding" in data
    assert "primary_color" in data["branding"]


def test_branding_put_admin_ok_and_reads_back(admin_cookies):
    """PUT /api/orgs/me/branding with admin → 200 + reads back exact value."""
    payload = {
        "primary_color": "#1A2B3C",
        "accent_color": "#AABBCC",
        "display_name": "Test Org B19",
        "tagline": "B19 tagline test",
    }
    r = requests.put(
        f"{BASE}/api/orgs/me/branding",
        json=payload,
        cookies=admin_cookies,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert body["branding"]["primary_color"] == "#1A2B3C"
    assert body["branding"]["accent_color"] == "#AABBCC"
    assert body["branding"]["display_name"] == "Test Org B19"

    # Verify GET reads exact value
    get_r = requests.get(f"{BASE}/api/orgs/me/branding", cookies=admin_cookies)
    assert get_r.status_code == 200
    get_data = get_r.json()
    assert get_data["branding"]["primary_color"] == "#1A2B3C"
    assert get_data["branding"]["display_name"] == "Test Org B19"


def test_branding_put_asesor_403(asesor_cookies):
    """PUT /api/orgs/me/branding with asesor role → 403."""
    r = requests.put(
        f"{BASE}/api/orgs/me/branding",
        json={"primary_color": "#FF0000"},
        cookies=asesor_cookies,
    )
    assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"


def test_logo_upload_small_ok(admin_cookies):
    """POST /api/orgs/me/branding/logo with <500KB PNG → 200."""
    # Create a minimal valid PNG (1x1 px)
    import base64
    # 1x1 white PNG (smallest valid PNG)
    png_b64 = (
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9Q"
        "DwADhgGAWjR9awAAAABJRU5ErkJggg=="
    )
    png_bytes = base64.b64decode(png_b64)
    files = {"file": ("test.png", io.BytesIO(png_bytes), "image/png")}
    r = requests.post(
        f"{BASE}/api/orgs/me/branding/logo",
        files=files,
        cookies=admin_cookies,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert "logo_url" in data
    assert data["logo_url"] is not None


def test_logo_upload_large_rejected(admin_cookies):
    """POST /api/orgs/me/branding/logo with >500KB → 413."""
    big_content = b"X" * (501 * 1024)  # 501KB
    files = {"file": ("big.png", io.BytesIO(big_content), "image/png")}
    r = requests.post(
        f"{BASE}/api/orgs/me/branding/logo",
        files=files,
        cookies=admin_cookies,
    )
    assert r.status_code == 413, f"Expected 413, got {r.status_code}: {r.text}"


def test_cross_portal_event_logged(admin_cookies):
    """POST /api/orgs/cross-portal/log creates event in collection."""
    r = requests.post(
        f"{BASE}/api/orgs/cross-portal/log",
        json={"event_type": "project_published", "entity_id": "test-project-001"},
        cookies=admin_cookies,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["ok"] is True
    assert "event_id" in data
    assert "marketplace" in data["affected_portals"]
    assert "asesor" in data["affected_portals"]


def test_reset_branding_to_defaults(admin_cookies):
    """PUT branding with defaults → primary_color and accent_color revert."""
    reset_payload = {
        "primary_color": "#06080F",
        "accent_color": "#F4E9D8",
        "display_name": "",
        "tagline": "",
    }
    r = requests.put(
        f"{BASE}/api/orgs/me/branding",
        json=reset_payload,
        cookies=admin_cookies,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["branding"]["primary_color"] == "#06080F"
    assert data["branding"]["accent_color"] == "#F4E9D8"
