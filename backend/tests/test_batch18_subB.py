"""Phase 4 Batch 18 Sub-B — pytest suite for floor plan backend.

Covers:
  1. GET /floors → returns floor list with counts
  2. GET /floors/{n} → returns units with positions
  3. Units without saved positions get auto-positioning
  4. PUT /layout → upsert succeeds for admin
  5. PATCH /position → saves unit position, readable on next GET
  6. Non-admin cannot PUT layout (403)
  7. GET /floors on unknown project → 404
  8. PATCH /position returns correct position data

Run: pytest /app/backend/tests/test_batch18_subB.py -v
"""
import os
import httpx
import pytest

API = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")

ADMIN_EMAIL = "admin@desarrollosmx.com"
ADMIN_PASSWORD = "Admin2026!"
DEV_EMAIL = "developer@demo.com"
DEV_PASSWORD = "Dev2026!"
ASESOR_EMAIL = "asesor@demo.com"
ASESOR_PASSWORD = "Asesor2026!"

# altavista-polanco has levels [2,3,4,5,6] → 5 floors
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
def dev():
    c = _mkclient(DEV_EMAIL, DEV_PASSWORD)
    yield c
    c.close()


@pytest.fixture(scope="module")
def asesor():
    try:
        c = _mkclient(ASESOR_EMAIL, ASESOR_PASSWORD)
        yield c
        c.close()
    except AssertionError:
        # asesor account might not exist; skip gracefully with a dummy
        yield None


# ─── Test 1: list floors ──────────────────────────────────────────────────────

def test_list_floors_returns_floor_list(admin):
    r = admin.get(f"/api/projects/{TEST_PROJECT}/floors")
    assert r.status_code == 200, r.text
    data = r.json()
    assert "floors" in data
    floors = data["floors"]
    assert len(floors) >= 1
    for fl in floors:
        assert "floor_number" in fl
        assert "unit_count" in fl
        assert fl["unit_count"] >= 1
        assert "status_counts" in fl


# ─── Test 2: floor detail returns units ───────────────────────────────────────

def test_floor_detail_returns_units(admin):
    r = admin.get(f"/api/projects/{TEST_PROJECT}/floors/{TEST_FLOOR}")
    assert r.status_code == 200, r.text
    data = r.json()
    assert "units" in data
    assert data["total"] >= 1
    assert "layout" in data
    assert "grid_dimensions" in data["layout"]


# ─── Test 3: auto-positioning for units without saved positions ───────────────

def test_auto_positioning_applied(admin):
    """Units without saved positions must have non-null position with x,y,width,height."""
    r = admin.get(f"/api/projects/{TEST_PROJECT}/floors/{TEST_FLOOR}")
    assert r.status_code == 200
    units = r.json()["units"]
    auto_units = [u for u in units if u.get("is_auto_positioned")]
    assert len(auto_units) >= 1, "Expected at least some auto-positioned units"
    for u in auto_units:
        pos = u["position"]
        assert "x" in pos and "y" in pos
        assert "width" in pos and "height" in pos
        assert pos["width"] > 0 and pos["height"] > 0


# ─── Test 4: PUT layout upsert ────────────────────────────────────────────────

def test_put_layout_upsert(admin):
    """Admin can upsert floor layout metadata."""
    r = admin.put(
        f"/api/projects/{TEST_PROJECT}/floors/{TEST_FLOOR}/layout",
        json={"svg_background_url": "https://example.com/floor2.svg"},
    )
    assert r.status_code == 200, r.text
    assert r.json().get("ok") is True

    # Verify the background URL is now returned in floor detail
    r2 = admin.get(f"/api/projects/{TEST_PROJECT}/floors/{TEST_FLOOR}")
    assert r2.json()["layout"].get("svg_background_url") == "https://example.com/floor2.svg"


# ─── Test 5: PATCH unit position saved + readable ────────────────────────────

def test_patch_unit_position_persists(admin):
    """PATCH position → subsequent GET returns saved (not auto) position."""
    # Get a unit id from the floor
    units = admin.get(f"/api/projects/{TEST_PROJECT}/floors/{TEST_FLOOR}").json()["units"]
    assert units, "No units on this floor"
    uid = units[0]["id"]

    r = admin.patch(
        f"/api/units/{uid}/position",
        json={"x": 123, "y": 456, "width": 90, "height": 70, "floor_number": TEST_FLOOR, "project_id": TEST_PROJECT},
    )
    assert r.status_code == 200, r.text
    assert r.json()["ok"] is True
    assert r.json()["position"]["x"] == 123

    # Re-fetch and verify
    units2 = admin.get(f"/api/projects/{TEST_PROJECT}/floors/{TEST_FLOOR}").json()["units"]
    patched = next((u for u in units2 if u["id"] == uid), None)
    assert patched is not None
    assert patched["position"]["x"] == 123
    assert patched["position"]["y"] == 456
    assert patched.get("is_auto_positioned") is False


# ─── Test 6: 404 on unknown project ──────────────────────────────────────────

def test_list_floors_unknown_project_404(admin):
    r = admin.get("/api/projects/NONEXISTENT_XYZ_9999/floors")
    assert r.status_code == 404, f"Expected 404, got {r.status_code}: {r.text}"


# ─── Test 7: non-admin role cannot PUT layout ─────────────────────────────────

def test_put_layout_forbidden_non_admin(asesor):
    if asesor is None:
        pytest.skip("asesor account not available")
    r = asesor.put(
        f"/api/projects/{TEST_PROJECT}/floors/{TEST_FLOOR}/layout",
        json={"svg_background_url": "https://evil.com/hack.svg"},
    )
    assert r.status_code in (401, 403), f"Expected 401/403, got {r.status_code}"


# ─── Test 8: empty floor returns empty units list ─────────────────────────────

def test_empty_floor_returns_empty_list(admin):
    """A floor number that has no units → empty list, not 404."""
    r = admin.get(f"/api/projects/{TEST_PROJECT}/floors/999")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["units"] == []
    assert data["total"] == 0
