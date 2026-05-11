"""
Wave 1.6 — E2E smoke suite cubriendo W1.2 + W1.3 + W1.4 + W1.5 superadmin endpoints.

Verifica:
- Permission guards: todos los nuevos endpoints superadmin → 403 con role inferior
- Shape correcto del primer GET de cada router (smoke)
- Casos críticos del flow: tenants list, health overview, bulk-ingest stats

Run:
    DB_NAME=desarrollosmx python3 -m pytest backend/tests/test_wave1_e2e_superadmin.py -v
"""
import os
import httpx
import pytest

pytestmark = pytest.mark.integration



API = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")

SA_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@desarrollosmx.io")
SA_PWD   = os.environ.get("ADMIN_PASSWORD", "Admin2026!")
ADV_EMAIL = "asesor@demo.com"
ADV_PWD   = "Asesor2026!"
DEV_EMAIL = "developer@demo.com"
DEV_PWD   = "Dev2026!"


def _login(email, pwd):
    c = httpx.Client(base_url=API, timeout=30, follow_redirects=False)
    r = c.post("/api/auth/login", json={"email": email, "password": pwd})
    assert r.status_code == 200, f"login {email} failed: {r.text}"
    for ck in r.cookies.jar:
        c.cookies.set(ck.name, ck.value, domain=ck.domain, path=ck.path)
    return c


@pytest.fixture(scope="function")
def superadmin():
    c = _login(SA_EMAIL, SA_PWD); yield c; c.close()


@pytest.fixture(scope="function")
def advisor():
    c = _login(ADV_EMAIL, ADV_PWD); yield c; c.close()


@pytest.fixture(scope="function")
def developer():
    c = _login(DEV_EMAIL, DEV_PWD); yield c; c.close()


# ═════════════════════════════════════════════════════════════════════════════
# Group 1 — All new W1.2-W1.5 superadmin endpoints reject non-superadmin roles
# ═════════════════════════════════════════════════════════════════════════════

W1_GET_ENDPOINTS = [
    # W1.2 Tenants
    "/api/superadmin/tenants",
    "/api/superadmin/tenants/dmx",
    # W1.3 Health
    "/api/superadmin/health/overview",
    "/api/superadmin/health/crons",
    "/api/superadmin/health/alerts",
    # W1.4 Bulk ingest
    "/api/superadmin/bulk-ingest/jobs",
    "/api/superadmin/bulk-ingest/stats",
]


@pytest.mark.parametrize("path", W1_GET_ENDPOINTS)
def test_advisor_blocked(advisor, path):
    r = advisor.get(path)
    assert r.status_code == 403, f"asesor allowed on {path}: {r.status_code}"


@pytest.mark.parametrize("path", W1_GET_ENDPOINTS)
def test_developer_blocked(developer, path):
    r = developer.get(path)
    assert r.status_code == 403, f"developer allowed on {path}: {r.status_code}"


# ═════════════════════════════════════════════════════════════════════════════
# Group 2 — W1.2 Tenants smoke (5 endpoints)
# ═════════════════════════════════════════════════════════════════════════════

def test_tenants_list_shape(superadmin):
    r = superadmin.get("/api/superadmin/tenants")
    assert r.status_code == 200, r.text
    body = r.json()
    assert "items" in body or isinstance(body, (list, dict))
    # Items should have required fields if present
    items = body.get("items") if isinstance(body, dict) else body
    if items and len(items) > 0:
        item = items[0]
        assert "id" in item or "tenant_id" in item
        assert "type" in item
        assert "name" in item


def test_tenants_filter_type(superadmin):
    r = superadmin.get("/api/superadmin/tenants?type=inm")
    assert r.status_code == 200
    body = r.json()
    items = body.get("items") if isinstance(body, dict) else body
    if items:
        for item in items:
            assert item.get("type") in ("inm", "inmobiliaria")


def test_tenants_impersonate_end_idempotent(superadmin):
    """End impersonation with no active session should be idempotent (200)."""
    r = superadmin.post("/api/superadmin/tenants/impersonate/end")
    assert r.status_code in (200, 204)


# ═════════════════════════════════════════════════════════════════════════════
# Group 3 — W1.3 Health smoke (5 endpoints)
# ═════════════════════════════════════════════════════════════════════════════

def test_health_overview_shape(superadmin):
    r = superadmin.get("/api/superadmin/health/overview")
    assert r.status_code == 200, r.text
    body = r.json()
    # Required keys per spec
    for key in ("uptime_24h_pct", "probe_pass_rate_7d", "services"):
        assert key in body, f"missing {key} in overview"
    assert isinstance(body["services"], list)


def test_health_crons_list(superadmin):
    r = superadmin.get("/api/superadmin/health/crons")
    assert r.status_code == 200
    body = r.json()
    # Each cron should have job_id
    items = body.get("items", body) if isinstance(body, dict) else body
    if items and len(items) > 0:
        assert "job_id" in items[0]


def test_health_alerts_list(superadmin):
    r = superadmin.get("/api/superadmin/health/alerts")
    assert r.status_code == 200


def test_health_test_alert(superadmin):
    """POST test alert should insert info-severity alert."""
    r = superadmin.post("/api/superadmin/health/alerts/test")
    assert r.status_code in (200, 201), r.text
    body = r.json()
    assert "id" in body or "alert" in body or body.get("ok") is True


# ═════════════════════════════════════════════════════════════════════════════
# Group 4 — W1.4 Bulk Ingest smoke (8 + 1 stats)
# ═════════════════════════════════════════════════════════════════════════════

def test_bulk_ingest_stats_shape(superadmin):
    r = superadmin.get("/api/superadmin/bulk-ingest/stats")
    assert r.status_code == 200, r.text
    body = r.json()
    # Should have aggregate counts even if zero
    assert isinstance(body, dict)


def test_bulk_ingest_jobs_empty_or_list(superadmin):
    r = superadmin.get("/api/superadmin/bulk-ingest/jobs")
    assert r.status_code == 200
    body = r.json()
    items = body.get("items") if isinstance(body, dict) else body
    assert isinstance(items, list) or items is None


def test_bulk_ingest_start_invalid_url(superadmin):
    """Invalid Drive URL should return 400."""
    r = superadmin.post("/api/superadmin/bulk-ingest/start",
                        json={"drive_folder_url": "not-a-valid-drive-url"})
    assert r.status_code in (400, 409, 422)


# ═════════════════════════════════════════════════════════════════════════════
# Group 5 — W1.5 Quality endpoints (4) reject mutations on non-existent items
# ═════════════════════════════════════════════════════════════════════════════

def test_w15_patch_item_not_found(superadmin):
    r = superadmin.patch("/api/superadmin/bulk-ingest/items/nonexistent_xyz",
                         json={"extracted_overrides": {"project_name": "test"}})
    assert r.status_code in (404, 422)  # 422 si Pydantic valida body antes


def test_w15_diff_item_not_found(superadmin):
    r = superadmin.get("/api/superadmin/bulk-ingest/items/nonexistent_xyz/diff")
    assert r.status_code in (404, 422)


def test_w15_recompute_not_found(superadmin):
    r = superadmin.post("/api/superadmin/bulk-ingest/items/nonexistent_xyz/recompute-extraction")
    assert r.status_code in (404, 409)


def test_w15_force_match_not_found(superadmin):
    r = superadmin.post("/api/superadmin/bulk-ingest/items/nonexistent_xyz/force-match",
                        json={"target_dev_id": "any", "reason": "test"})
    assert r.status_code in (404, 409)


# ═════════════════════════════════════════════════════════════════════════════
# Group 6 — Cross-cutting: unauth → 401/403 (no token = blocked)
# ═════════════════════════════════════════════════════════════════════════════

def test_unauth_blocked_health():
    r = httpx.get(f"{API}/api/superadmin/health/overview", timeout=15)
    assert r.status_code in (401, 403)


def test_unauth_blocked_tenants():
    r = httpx.get(f"{API}/api/superadmin/tenants", timeout=15)
    assert r.status_code in (401, 403)


def test_unauth_blocked_bulk_ingest():
    r = httpx.get(f"{API}/api/superadmin/bulk-ingest/jobs", timeout=15)
    assert r.status_code in (401, 403)
