"""Phase 4 Batch 18.5 — pytest suite for backend FIX-PASS.

Adds:
  1. PATCH /api/units/{uid}/position now requires explicit project_id
  2. PATCH /api/units/{uid}/position validates project_id exists
  3. PUT /floors/{n}/layout rejects floors not in the project's real set
  4. PUT /floors/{n}/layout rejects oversized data-URI backgrounds (>500 KB)
  5. Asesor (non-admin) cannot PATCH unit position

Run: pytest /app/backend/tests/test_batch18_5.py -v
"""
import os
import httpx
import pytest

API = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")

ADMIN_EMAIL = "admin@desarrollosmx.com"
ADMIN_PASSWORD = "Admin2026!"
ASESOR_EMAIL = "asesor@demo.com"
ASESOR_PASSWORD = "Asesor2026!"

TEST_PROJECT = "altavista-polanco"
TEST_FLOOR = 2


def _mkclient(email, pwd):
    c = httpx.Client(base_url=API, timeout=30, follow_redirects=True)
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
def asesor():
    try:
        c = _mkclient(ASESOR_EMAIL, ASESOR_PASSWORD)
        yield c
        c.close()
    except AssertionError:
        yield None


# ─── Test 1: PATCH position requires project_id ───────────────────────────────

def test_patch_position_requires_project_id(admin):
    """Body without project_id → 422 (FastAPI validation)."""
    units = admin.get(f"/api/projects/{TEST_PROJECT}/floors/{TEST_FLOOR}").json()["units"]
    uid = units[0]["id"]
    r = admin.patch(
        f"/api/units/{uid}/position",
        json={"x": 10, "y": 10, "width": 50, "height": 50, "floor_number": TEST_FLOOR},
    )
    assert r.status_code == 422, f"Expected 422 missing project_id, got {r.status_code}"


# ─── Test 2: PATCH position validates project exists ──────────────────────────

def test_patch_position_invalid_project_id(admin):
    """Unknown project_id → 404."""
    units = admin.get(f"/api/projects/{TEST_PROJECT}/floors/{TEST_FLOOR}").json()["units"]
    uid = units[0]["id"]
    r = admin.patch(
        f"/api/units/{uid}/position",
        json={
            "x": 10, "y": 10, "width": 50, "height": 50,
            "floor_number": TEST_FLOOR, "project_id": "NONEXISTENT_PROJECT",
        },
    )
    assert r.status_code == 404, f"Expected 404, got {r.status_code}: {r.text}"


# ─── Test 3: PATCH position with explicit project_id succeeds ────────────────

def test_patch_position_with_explicit_project_id_works(admin):
    units = admin.get(f"/api/projects/{TEST_PROJECT}/floors/{TEST_FLOOR}").json()["units"]
    uid = units[0]["id"]
    r = admin.patch(
        f"/api/units/{uid}/position",
        json={
            "x": 200, "y": 200, "width": 80, "height": 60,
            "floor_number": TEST_FLOOR, "project_id": TEST_PROJECT,
        },
    )
    assert r.status_code == 200, r.text
    assert r.json()["ok"] is True


# ─── Test 4: PUT layout rejects unknown floor ────────────────────────────────

def test_put_layout_invalid_floor_rejected(admin):
    """Floor number not in project → 400."""
    r = admin.put(
        f"/api/projects/{TEST_PROJECT}/floors/9999/layout",
        json={"svg_background_url": "https://example.com/p.svg"},
    )
    assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"
    assert "no existe" in r.text.lower() or "valid" in r.text.lower() or "9999" in r.text


# ─── Test 5: PUT layout rejects oversized data-URI background ────────────────

def test_put_layout_rejects_oversized_background(admin):
    """data-URI > 500 KB → 413."""
    # Build a data URI with ~600 KB of base64 payload
    big_payload = "A" * (700 * 1024)
    data_uri = "data:image/png;base64," + big_payload
    r = admin.put(
        f"/api/projects/{TEST_PROJECT}/floors/{TEST_FLOOR}/layout",
        json={"svg_background_url": data_uri},
    )
    assert r.status_code == 413, f"Expected 413, got {r.status_code}: {r.text}"


# ─── Test 6: Asesor (non-admin) cannot PATCH unit position ───────────────────

def test_patch_position_forbidden_for_asesor(asesor):
    if asesor is None:
        pytest.skip("asesor account not available")
    # Use a valid-ish unit_id format; even if asesor were allowed, project_id is valid
    r = asesor.patch(
        "/api/units/altavista-polanco-A201/position",
        json={
            "x": 1, "y": 1, "width": 50, "height": 50,
            "floor_number": TEST_FLOOR, "project_id": TEST_PROJECT,
        },
    )
    assert r.status_code in (401, 403), f"Expected 401/403, got {r.status_code}"
