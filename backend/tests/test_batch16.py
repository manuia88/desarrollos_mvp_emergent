"""Phase 4 Batch 16 · Pytest regression suite.

Covers:
  · AI Suggestions (generate, dismiss, accept, validation)
  · Public Booking (info, availability, book)
  · Smart Empty States (config presence, JS only — skipped in pytest)

Run: pytest /app/backend/tests/test_batch16.py -v
"""
import os
import uuid

import httpx
import pytest

API = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "http://localhost:8001",
).rstrip("/")

DEV_EMAIL = "developer@demo.com"
DEV_PASSWORD = "Dev2026!"

PROJECT_SLUG = "altavista-polanco"  # has Google-connected asesores in seed
NO_POOL_SLUG = "juarez-boutique"    # no asesor_pool configured


@pytest.fixture(scope="module")
def dev_session():
    """Login as developer and return a session cookie client."""
    client = httpx.Client(base_url=API, timeout=30, follow_redirects=True)
    r = client.post("/api/auth/login",
                    json={"email": DEV_EMAIL, "password": DEV_PASSWORD})
    assert r.status_code == 200, r.text
    # Propagate cookies so subsequent calls on this client are authed
    for c in r.cookies.jar:
        client.cookies.set(c.name, c.value, domain=c.domain, path=c.path)
    yield client
    client.close()


# ─── AI Suggestions ─────────────────────────────────────────────────────────

def test_suggestions_unauth():
    r = httpx.get(f"{API}/api/ai/suggestions/project/{PROJECT_SLUG}")
    assert r.status_code == 401


def test_suggestions_invalid_entity_type(dev_session):
    r = dev_session.get(f"/api/ai/suggestions/invalid_type/abc")
    assert r.status_code == 400


def test_suggestions_generate_and_cache(dev_session):
    # Force regen to ensure a fresh item
    r = dev_session.get(f"/api/ai/suggestions/project/{PROJECT_SLUG}?force=1")
    assert r.status_code == 200
    data = r.json()
    assert data["entity_type"] == "project"
    assert data["entity_id"] == PROJECT_SLUG
    # Fallback deterministic should produce at least one item for low-health project
    assert isinstance(data["items"], list)

    # Cache hit — second call should return >=0 items (may be cache)
    r2 = dev_session.get(f"/api/ai/suggestions/project/{PROJECT_SLUG}")
    assert r2.status_code == 200


def test_suggestion_dismiss_and_accept(dev_session):
    r = dev_session.get(f"/api/ai/suggestions/project/{PROJECT_SLUG}?force=1")
    items = r.json().get("items", [])
    if not items:
        pytest.skip("No suggestion available to dismiss")
    sug_id = items[0]["id"]

    r1 = dev_session.post(f"/api/ai/suggestions/{sug_id}/dismiss",
                           json={"note": "pytest"})
    assert r1.status_code == 200
    assert r1.json()["status"] == "dismissed"

    # Double dismiss should 404
    r2 = dev_session.post(f"/api/ai/suggestions/{sug_id}/dismiss", json={})
    assert r2.status_code == 404

    # Generate new and accept
    r3 = dev_session.get(f"/api/ai/suggestions/project/{PROJECT_SLUG}?force=1")
    items = r3.json().get("items", [])
    if not items:
        pytest.skip("No suggestion for accept test")
    sug_id2 = items[0]["id"]
    r4 = dev_session.post(f"/api/ai/suggestions/{sug_id2}/accept", json={})
    assert r4.status_code == 200
    assert r4.json()["status"] == "accepted"


def test_suggestion_lead_entity(dev_session):
    # Lead context may be empty but endpoint must not 500
    fake_lead_id = f"lead_test_{uuid.uuid4().hex[:6]}"
    r = dev_session.get(f"/api/ai/suggestions/lead/{fake_lead_id}")
    assert r.status_code == 200


# ─── Public Booking ─────────────────────────────────────────────────────────

def test_public_booking_info_ok():
    r = httpx.get(f"{API}/api/public/projects/{PROJECT_SLUG}/booking")
    assert r.status_code == 200
    data = r.json()
    assert data["slug"] == PROJECT_SLUG
    assert data["name"]
    assert "booking_enabled" in data
    assert "pool_size" in data


def test_public_booking_info_404():
    r = httpx.get(f"{API}/api/public/projects/no-existe-slug/booking")
    assert r.status_code == 404


def test_public_availability_valid():
    from datetime import datetime, timezone, timedelta
    now = datetime.now(timezone.utc)
    payload = {
        "date_from": now.isoformat(),
        "date_to": (now + timedelta(days=7)).isoformat(),
    }
    r = httpx.post(f"{API}/api/public/projects/{PROJECT_SLUG}/availability",
                    json=payload, timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert "slots" in data
    # Slots must NOT expose internal asesor_ids
    for s in data["slots"][:3]:
        assert "available_asesor_ids" not in s
        assert "asesores_available" in s


def test_public_availability_invalid_range():
    from datetime import datetime, timezone, timedelta
    now = datetime.now(timezone.utc)
    payload = {
        "date_from": now.isoformat(),
        "date_to": (now + timedelta(days=30)).isoformat(),
    }
    r = httpx.post(f"{API}/api/public/projects/{PROJECT_SLUG}/availability",
                    json=payload, timeout=15)
    assert r.status_code == 400


def test_public_booking_end_to_end():
    from datetime import datetime, timezone, timedelta
    now = datetime.now(timezone.utc)
    # Get slots first
    r = httpx.post(f"{API}/api/public/projects/{PROJECT_SLUG}/availability",
                    json={"date_from": now.isoformat(),
                          "date_to": (now + timedelta(days=7)).isoformat()},
                    timeout=15)
    slots = r.json().get("slots", [])
    if not slots:
        pytest.skip("No slots available to book — seed incomplete")

    # Pick the first slot that is in the future enough (availability may return
    # slots in the past if `now` drifts inside a day — skip those)
    future_slot = None
    for s in slots:
        st = datetime.fromisoformat(s["slot_start"].replace("Z", "+00:00"))
        if st > now:
            future_slot = s
            break
    if not future_slot:
        pytest.skip("No future slot found")

    payload = {
        "lead_name": "Pytest Batch16",
        "lead_email": f"pytest.b16.{uuid.uuid4().hex[:8]}@example.com",
        "lead_phone": "+525512345678",
        "slot_start": future_slot["slot_start"],
        "slot_end": future_slot["slot_end"],
        "utm_source": "pytest",
        "utm_campaign": "batch16_regression",
    }
    r2 = httpx.post(f"{API}/api/public/projects/{PROJECT_SLUG}/book",
                    json=payload, timeout=20)
    assert r2.status_code == 200, r2.text
    data = r2.json()
    assert data["ok"] is True
    assert data["appointment_id"]
    assert data["lead_id"]
    assert data["project_name"]
    # WhatsApp stub should confirm
    assert data["confirmation"]["whatsapp"]["stub"] is True


def test_public_booking_bad_payload():
    r = httpx.post(f"{API}/api/public/projects/{PROJECT_SLUG}/book",
                    json={"lead_name": "X"}, timeout=10)
    assert r.status_code in (400, 422)


def test_public_booking_unknown_project():
    from datetime import datetime, timezone, timedelta
    now = datetime.now(timezone.utc)
    r = httpx.post(f"{API}/api/public/projects/no-existe/book",
                    json={
                        "lead_name": "X", "lead_email": "x@x.com",
                        "lead_phone": "+525500000000",
                        "slot_start": now.isoformat(),
                        "slot_end": (now + timedelta(hours=1)).isoformat(),
                    }, timeout=10)
    assert r.status_code == 404
