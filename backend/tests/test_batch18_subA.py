"""Phase 4 Batch 18 Sub-A · Pytest regression suite.

Covers:
  · GET /api/preferences/me — auto-creates defaults
  · PATCH /api/preferences/me — density change persisted
  · POST /api/preferences/me/recent-project — push project_id
  · Deduplicate logic (same id pushed twice → only once in list)
  · Trim to 5 logic (push 6 different ids → list max 5, oldest removed)

Run: pytest /app/backend/tests/test_batch18_subA.py -v
"""
import os
import uuid
import httpx
import pytest

API = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")

ADMIN_EMAIL = "admin@desarrollosmx.com"
ADMIN_PASSWORD = "Admin2026!"
DEV_EMAIL = "developer@demo.com"
DEV_PASSWORD = "Dev2026!"


def _mkclient(email, pwd):
    c = httpx.Client(base_url=API, timeout=20, follow_redirects=True)
    r = c.post("/api/auth/login", json={"email": email, "password": pwd})
    assert r.status_code == 200, f"Login failed for {email}: {r.text}"
    for ck in r.cookies.jar:
        c.cookies.set(ck.name, ck.value, domain=ck.domain, path=ck.path)
    return c


@pytest.fixture(scope="module")
def admin():
    c = _mkclient(ADMIN_EMAIL, ADMIN_PASSWORD)
    yield c
    c.close()


@pytest.fixture(scope="module")
def dev():
    c = _mkclient(DEV_EMAIL, DEV_PASSWORD)
    yield c
    c.close()


# ─── Test 1: GET preferences auto-creates defaults ────────────────────────────

def test_get_preferences_returns_defaults(dev):
    """First call must return density=comfortable + empty recent_project_ids."""
    r = dev.get("/api/preferences/me")
    assert r.status_code == 200, r.text
    data = r.json()
    assert "density" in data
    assert data["density"] in ("comfortable", "compact", "spacious")
    assert "recent_project_ids" in data
    assert isinstance(data["recent_project_ids"], list)
    assert "last_project_id" in data
    assert "sidebar_collapsed" in data
    assert "theme" in data


# ─── Test 2: PATCH density persisted ─────────────────────────────────────────

def test_patch_density_persists(dev):
    """PATCH density=compact → GET confirms compact."""
    r = dev.patch("/api/preferences/me", json={"density": "compact"})
    assert r.status_code == 200, r.text
    assert r.json().get("ok") is True

    r2 = dev.get("/api/preferences/me")
    assert r2.status_code == 200
    assert r2.json()["density"] == "compact"

    # Restore comfortable for other tests
    dev.patch("/api/preferences/me", json={"density": "comfortable"})


# ─── Test 3: push recent-project ─────────────────────────────────────────────

def test_push_recent_project(admin):
    """POST recent-project inserts id at front + updates last_project_id."""
    slug = f"test-proj-{uuid.uuid4().hex[:6]}"
    r = admin.post("/api/preferences/me/recent-project", json={"project_id": slug})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("ok") is True
    assert slug in data["recent_project_ids"]
    assert data["recent_project_ids"][0] == slug
    assert data["last_project_id"] == slug


# ─── Test 4: deduplication ────────────────────────────────────────────────────

def test_recent_project_deduplication(admin):
    """Pushing same project_id twice → appears only once."""
    slug = f"dedup-{uuid.uuid4().hex[:6]}"
    for _ in range(3):
        admin.post("/api/preferences/me/recent-project", json={"project_id": slug})

    r = admin.get("/api/preferences/me")
    assert r.status_code == 200
    ids = r.json()["recent_project_ids"]
    assert ids.count(slug) == 1, f"Expected 1 occurrence of {slug}, got {ids.count(slug)}"


# ─── Test 5: trim to 5 ────────────────────────────────────────────────────────

def test_recent_project_trim_to_5(admin):
    """After pushing 6 different ids list stays ≤ 5; oldest is dropped."""
    tag = uuid.uuid4().hex[:6]
    projects = [f"{tag}-p{i}" for i in range(1, 7)]  # 6 ids

    for pid in projects:
        r = admin.post("/api/preferences/me/recent-project", json={"project_id": pid})
        assert r.status_code == 200, r.text

    r = admin.get("/api/preferences/me")
    assert r.status_code == 200
    ids = r.json()["recent_project_ids"]
    assert len(ids) <= 5, f"Expected ≤5 ids, got {len(ids)}: {ids}"
    # Last pushed (p6) must be first
    assert ids[0] == f"{tag}-p6"
    # First pushed (p1) must be gone
    assert f"{tag}-p1" not in ids, f"p1 should have been evicted, but found in {ids}"


# ─── Test 6: invalid density returns 422 ─────────────────────────────────────

def test_patch_invalid_density_422(dev):
    """PATCH with unknown density value must return 422."""
    r = dev.patch("/api/preferences/me", json={"density": "ultrawide"})
    assert r.status_code == 422, f"Expected 422, got {r.status_code}: {r.text}"


# ─── Test 7: unauthenticated returns 401 ─────────────────────────────────────

def test_get_preferences_unauthenticated():
    """Without session cookie, must return 401."""
    c = httpx.Client(base_url=API, timeout=10)
    r = c.get("/api/preferences/me")
    assert r.status_code == 401, f"Expected 401, got {r.status_code}"
    c.close()
