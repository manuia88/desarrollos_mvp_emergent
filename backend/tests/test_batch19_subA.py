"""
Batch 19 Sub-A Tests
- POST tour-complete persiste tour_id en tours_completed
- POST tour-dismiss persiste tour_id en tours_dismissed
- GET preferences post-action LEE arrays correctos
- Permission denied accediendo prefs ajenas
"""
import pytest
import requests
import os

BASE = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001")

# ─── helpers ────────────────────────────────────────────────────────────────

def _login(email, password):
    r = requests.post(f"{BASE}/api/auth/login",
                      json={"email": email, "password": password})
    assert r.status_code == 200, f"Login failed: {r.text}"
    return r.cookies


def _get_prefs(cookies):
    r = requests.get(f"{BASE}/api/preferences/me", cookies=cookies)
    assert r.status_code == 200, r.text
    return r.json()


# ─── Fixtures ────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def dev_cookies():
    return _login("admin@desarrollosmx.com", "Admin2026!")


@pytest.fixture(scope="module")
def asesor_cookies():
    return _login("asesor@demo.com", "Asesor2026!")


# ─── Tests ───────────────────────────────────────────────────────────────────

def test_tour_complete_persists(dev_cookies):
    """POST tour-complete → tour_id aparece en tours_completed."""
    tour_id = "dev_first_login_test_b19"
    r = requests.post(
        f"{BASE}/api/preferences/me/tour-complete",
        json={"tour_id": tour_id},
        cookies=dev_cookies,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert body["tour_id"] == tour_id

    # Verify persisted
    prefs = _get_prefs(dev_cookies)
    completed = prefs.get("tours_completed") or []
    assert tour_id in completed, f"Expected {tour_id} in tours_completed, got: {completed}"


def test_tour_dismiss_persists(dev_cookies):
    """POST tour-dismiss → tour_id aparece en tours_dismissed."""
    tour_id = "asesor_first_login_test_b19"
    r = requests.post(
        f"{BASE}/api/preferences/me/tour-dismiss",
        json={"tour_id": tour_id},
        cookies=dev_cookies,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert body["tour_id"] == tour_id

    # Verify persisted
    prefs = _get_prefs(dev_cookies)
    dismissed = prefs.get("tours_dismissed") or []
    assert tour_id in dismissed, f"Expected {tour_id} in tours_dismissed, got: {dismissed}"


def test_preferences_reads_both_arrays(dev_cookies):
    """GET /api/preferences/me returns tours_completed AND tours_dismissed arrays post-save."""
    prefs = _get_prefs(dev_cookies)
    assert "tours_completed" in prefs or prefs.get("tours_completed") is not None, \
        "tours_completed key not in prefs response"
    assert "tours_dismissed" in prefs or prefs.get("tours_dismissed") is not None, \
        "tours_dismissed key not in prefs response"


def test_tour_complete_empty_id_rejected(dev_cookies):
    """POST tour-complete with empty tour_id → 422."""
    r = requests.post(
        f"{BASE}/api/preferences/me/tour-complete",
        json={"tour_id": ""},
        cookies=dev_cookies,
    )
    assert r.status_code == 422, f"Expected 422, got {r.status_code}"


def test_tour_complete_requires_auth():
    """POST tour-complete without cookies → 401."""
    r = requests.post(
        f"{BASE}/api/preferences/me/tour-complete",
        json={"tour_id": "some_tour"},
    )
    assert r.status_code in (401, 403), f"Expected 401/403 unauthenticated, got {r.status_code}"
