"""
Wave 2 E2E smoke suite — cubre W2.1 a W2.9 superadmin endpoints.

Verifica:
- Permission audit: TODOS los endpoints superadmin → 403 con asesor/developer
- Shape smoke: GET principal de cada router retorna 200 con shape esperado
- Public endpoint W2.7: /api/data-lake/public/validation accesible SIN auth
- Critical mutations bloqueadas para roles inferiores

Run:
    cd backend
    DB_NAME=desarrollosmx python3 -m pytest tests/test_wave2_e2e_superadmin.py -v
"""
import os
import httpx
import pytest


API = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")

SA_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@desarrollosmx.com")
SA_PWD = os.environ.get("ADMIN_PASSWORD", "Admin2026!")
ADV_EMAIL = "asesor@demo.com"
ADV_PWD = "Asesor2026!"
DEV_EMAIL = "developer@demo.com"
DEV_PWD = "Dev2026!"


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
# Group 1 — Permission audit cross-Wave 2 (todos endpoints → 403 con role inferior)
# ═════════════════════════════════════════════════════════════════════════════

W2_GET_ENDPOINTS = [
    # W2.1 Data Sources Hub
    "/api/superadmin/data-hub/connectors",
    # W2.2 Audit Log Viewer
    "/api/superadmin/audit/entries",
    "/api/superadmin/audit/distinct/actors",
    "/api/superadmin/audit/distinct/entity-types",
    "/api/superadmin/audit/stats",
    # W2.3 AI Cost Observatory
    "/api/superadmin/ai-cost/overview",
    "/api/superadmin/ai-cost/by-tenant",
    "/api/superadmin/ai-cost/by-feature",
    "/api/superadmin/ai-cost/by-model",
    "/api/superadmin/ai-cost/forecast",
    "/api/superadmin/ai-cost/caps",
    # W2.4 Commercial Foundation
    "/api/superadmin/commercial/features/catalog",
    "/api/superadmin/commercial/plan-templates",
    "/api/superadmin/commercial/snapshots",
    "/api/superadmin/commercial/trials/expiring",
    # W2.5 Metrics Cube
    "/api/superadmin/metrics-cube/tiers",
    # W2.6 Founder Console
    "/api/superadmin/founder-console/dashboard",
    "/api/superadmin/founder-console/anomalies",
    "/api/superadmin/founder-console/commands",
    "/api/superadmin/founder-console/quick-actions",
    # W2.7 Data Lake
    "/api/superadmin/data-lake/etl-runs",
    "/api/superadmin/data-lake/coverage",
    "/api/superadmin/data-lake/validation-metrics",
    # W2.9 Intelligence Hub
    "/api/superadmin/intelligence-hub/overview",
]


@pytest.mark.parametrize("path", W2_GET_ENDPOINTS)
def test_advisor_blocked(advisor, path):
    r = advisor.get(path)
    assert r.status_code == 403, f"asesor allowed on {path}: {r.status_code}"


@pytest.mark.parametrize("path", W2_GET_ENDPOINTS)
def test_developer_blocked(developer, path):
    r = developer.get(path)
    assert r.status_code == 403, f"developer allowed on {path}: {r.status_code}"


@pytest.mark.parametrize("path", W2_GET_ENDPOINTS[:5])  # Sampling
def test_unauth_blocked(path):
    r = httpx.get(f"{API}{path}", timeout=15)
    assert r.status_code in (401, 403), f"unauth allowed on {path}: {r.status_code}"


# ═════════════════════════════════════════════════════════════════════════════
# Group 2 — W2.1 Data Sources Hub smoke
# ═════════════════════════════════════════════════════════════════════════════

def test_w21_connectors_list(superadmin):
    r = superadmin.get("/api/superadmin/data-hub/connectors")
    assert r.status_code == 200, r.text
    body = r.json()
    items = body.get("items", body) if isinstance(body, dict) else body
    if items:
        first = items[0] if isinstance(items, list) else next(iter(items.values()))
        assert any(k in first for k in ("id", "connector_id", "name"))


def test_w21_connector_detail(superadmin):
    """Smoke: GET /connectors retorna lista; pickeamos primero y validamos detail."""
    r = superadmin.get("/api/superadmin/data-hub/connectors")
    if r.status_code != 200:
        pytest.skip("connectors list unavailable")
    body = r.json()
    items = body.get("items", body) if isinstance(body, dict) else body
    if not items:
        pytest.skip("no connectors registered yet")
    first = items[0] if isinstance(items, list) else next(iter(items.values()))
    cid = first.get("id") or first.get("connector_id")
    if not cid:
        pytest.skip("connector has no id field")
    r2 = superadmin.get(f"/api/superadmin/data-hub/connectors/{cid}")
    assert r2.status_code in (200, 404)


# ═════════════════════════════════════════════════════════════════════════════
# Group 3 — W2.2 Audit Log Viewer smoke
# ═════════════════════════════════════════════════════════════════════════════

def test_w22_audit_entries_paginated(superadmin):
    r = superadmin.get("/api/superadmin/audit/entries?limit=5")
    assert r.status_code == 200, r.text
    body = r.json()
    assert "items" in body or isinstance(body, list)


def test_w22_audit_distinct_actors(superadmin):
    r = superadmin.get("/api/superadmin/audit/distinct/actors")
    assert r.status_code == 200


def test_w22_audit_export_format(superadmin):
    r = superadmin.get("/api/superadmin/audit/export?format=json&limit=5")
    assert r.status_code in (200, 400, 422)  # 422 si limit not supported in export


# ═════════════════════════════════════════════════════════════════════════════
# Group 4 — W2.3 AI Cost Observatory smoke
# ═════════════════════════════════════════════════════════════════════════════

def test_w23_ai_cost_overview_shape(superadmin):
    r = superadmin.get("/api/superadmin/ai-cost/overview?period=month")
    assert r.status_code == 200, r.text
    body = r.json()
    assert isinstance(body, dict)
    # Should have at least total + breakdown keys
    assert any(k in body for k in ("total_mxn", "total", "breakdown", "top_5_spenders"))


def test_w23_caps_list(superadmin):
    r = superadmin.get("/api/superadmin/ai-cost/caps")
    assert r.status_code == 200


def test_w23_advisor_cant_set_cap(advisor):
    r = advisor.post("/api/superadmin/ai-cost/caps",
                     json={"tenant_id": "test", "monthly_cap_mxn": 100})
    assert r.status_code == 403


# ═════════════════════════════════════════════════════════════════════════════
# Group 5 — W2.4 Commercial Foundation smoke
# ═════════════════════════════════════════════════════════════════════════════

def test_w24_features_catalog(superadmin):
    r = superadmin.get("/api/superadmin/commercial/features/catalog")
    assert r.status_code == 200, r.text
    body = r.json()
    items = body.get("items", body) if isinstance(body, dict) else body
    # Should have at least some features registered
    assert isinstance(items, (list, dict))


def test_w24_plan_templates(superadmin):
    r = superadmin.get("/api/superadmin/commercial/plan-templates")
    assert r.status_code == 200


def test_w24_snapshots(superadmin):
    r = superadmin.get("/api/superadmin/commercial/snapshots")
    assert r.status_code == 200


def test_w24_me_feature_flags_any_auth(advisor):
    """Endpoint /api/me/feature-flags es público a cualquier auth user."""
    r = advisor.get("/api/me/feature-flags")
    assert r.status_code == 200, r.text


# ═════════════════════════════════════════════════════════════════════════════
# Group 6 — W2.5 Metrics Cube smoke
# ═════════════════════════════════════════════════════════════════════════════

def test_w25_cube_tiers(superadmin):
    r = superadmin.get("/api/superadmin/metrics-cube/tiers")
    assert r.status_code == 200, r.text
    body = r.json()
    assert isinstance(body, (list, dict))


def test_w25_cube_city_list(superadmin):
    r = superadmin.get("/api/superadmin/metrics-cube/city")
    assert r.status_code == 200


# ═════════════════════════════════════════════════════════════════════════════
# Group 7 — W2.6 Founder Console smoke
# ═════════════════════════════════════════════════════════════════════════════

def test_w26_founder_dashboard(superadmin):
    r = superadmin.get("/api/superadmin/founder-console/dashboard")
    assert r.status_code == 200, r.text
    body = r.json()
    # Should have executive KPIs
    assert isinstance(body, dict)


def test_w26_commands_list(superadmin):
    r = superadmin.get("/api/superadmin/founder-console/commands")
    assert r.status_code == 200, r.text
    body = r.json()
    items = body.get("items", body) if isinstance(body, dict) else body
    # Should have at least some default commands
    assert isinstance(items, list) and len(items) > 0


def test_w26_quick_actions_auto_seed(superadmin):
    r = superadmin.get("/api/superadmin/founder-console/quick-actions")
    assert r.status_code == 200


# ═════════════════════════════════════════════════════════════════════════════
# Group 8 — W2.7 Data Lake smoke + PUBLIC endpoint
# ═════════════════════════════════════════════════════════════════════════════

def test_w27_etl_runs_list(superadmin):
    r = superadmin.get("/api/superadmin/data-lake/etl-runs?limit=5")
    assert r.status_code == 200, r.text


def test_w27_coverage(superadmin):
    r = superadmin.get("/api/superadmin/data-lake/coverage")
    assert r.status_code == 200


def test_w27_validation_metrics(superadmin):
    r = superadmin.get("/api/superadmin/data-lake/validation-metrics")
    assert r.status_code == 200


def test_w27_public_validation_no_auth():
    """Endpoint público intencional para /methodology page Wave 3 ZZ.3."""
    r = httpx.get(f"{API}/api/data-lake/public/validation", timeout=15)
    assert r.status_code == 200, f"public endpoint should NOT require auth: {r.status_code}"
    body = r.json()
    assert "models" in body or isinstance(body, list)


# ═════════════════════════════════════════════════════════════════════════════
# Group 9 — W2.8 Cube OLAP extensions
# ═════════════════════════════════════════════════════════════════════════════

def test_w28_cross_cut(superadmin):
    r = superadmin.get(
        "/api/superadmin/metrics-cube/cross-cut?dimensions=property_type&period=30d"
    )
    assert r.status_code in (200, 400, 422)


def test_w28_compare_zones(superadmin):
    r = superadmin.post(
        "/api/superadmin/metrics-cube/compare",
        json={"zone_ids": ["miguel-hidalgo"], "period": "30d"},
    )
    assert r.status_code in (200, 400, 422, 404)


def test_w28_backfill_status_404_when_inexistent(superadmin):
    r = superadmin.get("/api/superadmin/metrics-cube/backfill/status?job_id=nonexistent_xyz")
    assert r.status_code in (404, 200)  # 200 con empty si shape lo permite


# ═════════════════════════════════════════════════════════════════════════════
# Group 10 — W2.9 Intelligence Hub smoke
# ═════════════════════════════════════════════════════════════════════════════

def test_w29_overview_shape(superadmin):
    r = superadmin.get("/api/superadmin/intelligence-hub/overview")
    assert r.status_code == 200, r.text
    body = r.json()
    assert isinstance(body, dict)


def test_w29_heatmap_multi_layers(superadmin):
    r = superadmin.get(
        "/api/superadmin/intelligence-hub/heatmap-multi?layers=price,demand&tier=colonia"
    )
    assert r.status_code == 200, r.text


def test_w29_advisor_cant_generate_insights(advisor):
    r = advisor.post(
        "/api/superadmin/intelligence-hub/insights/generate",
        json={"zone_id": "polanco", "tier": "colonia", "period": "current"},
    )
    assert r.status_code == 403
