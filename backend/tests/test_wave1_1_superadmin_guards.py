"""
Wave 1.1 — Superadmin guard hardening · pytest regression suite

Verifies that all `/api/superadmin/*` endpoints enforce role-based access:
- 403 when called by non-superadmin role (asesor / advisor / buyer)
- 200 (or 401 if no auth path is exercised) when called by superadmin

Also covers the 2 bugs fixed in this batch:
- routes_documents.py:215 — /document-types now requires dev_or_superadmin (was: any auth)
- units_history.py:150  — /units/{id}/history early role check (was: skipped on empty sample)

Run:
    DB_NAME=desarrollosmx python3 -m pytest backend/tests/test_wave1_1_superadmin_guards.py -v
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


def _login(email: str, pwd: str) -> httpx.Client:
    c = httpx.Client(base_url=API, timeout=30, follow_redirects=False)
    r = c.post("/api/auth/login", json={"email": email, "password": pwd})
    assert r.status_code == 200, f"login failed for {email}: {r.text}"
    for ck in r.cookies.jar:
        c.cookies.set(ck.name, ck.value, domain=ck.domain, path=ck.path)
    return c


@pytest.fixture(scope="module")
def superadmin():
    c = _login(SA_EMAIL, SA_PWD)
    yield c
    c.close()


@pytest.fixture(scope="module")
def advisor():
    c = _login(ADV_EMAIL, ADV_PWD)
    yield c
    c.close()


@pytest.fixture(scope="module")
def developer():
    c = _login(DEV_EMAIL, DEV_PWD)
    yield c
    c.close()


# ═════════════════════════════════════════════════════════════════════════════
# Group 1 — Endpoints that MUST be superadmin-only
# ═════════════════════════════════════════════════════════════════════════════

SUPERADMIN_ONLY_GETS = [
    "/api/superadmin/data-sources",
    "/api/superadmin/data-sources/stats",
    "/api/superadmin/ingestion-jobs",
    "/api/superadmin/uploads/recent",
    "/api/superadmin/scores",
    "/api/superadmin/scores/recipes",
    "/api/superadmin/problem-reports",
    "/api/superadmin/system-map",
    "/api/superadmin/probe-recurrence",
    "/api/superadmin/diagnostics/per-org",
    "/api/superadmin/ai-usage",
    "/api/superadmin/drive/connections",
    "/api/superadmin/rag/stats",
    "/api/_internal/observability/status",
]


@pytest.mark.parametrize("path", SUPERADMIN_ONLY_GETS)
def test_advisor_blocked_from_superadmin_only(advisor, path):
    """1: asesor token → /api/superadmin/* superadmin-only → 403"""
    r = advisor.get(path)
    assert r.status_code == 403, f"asesor unexpectedly allowed on {path} (got {r.status_code}): {r.text[:200]}"


@pytest.mark.parametrize("path", SUPERADMIN_ONLY_GETS)
def test_developer_blocked_from_superadmin_only(developer, path):
    """2: developer_admin token → /api/superadmin/* superadmin-only → 403"""
    r = developer.get(path)
    assert r.status_code == 403, f"developer unexpectedly allowed on {path} (got {r.status_code}): {r.text[:200]}"


def test_unauth_blocked_from_superadmin_only():
    """3: no auth → /api/superadmin/data-sources → 401"""
    r = httpx.get(f"{API}/api/superadmin/data-sources", timeout=15)
    assert r.status_code in (401, 403)


def test_superadmin_allowed_data_sources(superadmin):
    """4: superadmin token → /api/superadmin/data-sources → 200"""
    r = superadmin.get("/api/superadmin/data-sources")
    assert r.status_code == 200, r.text


def test_superadmin_allowed_problem_reports(superadmin):
    """5: superadmin token → /api/superadmin/problem-reports → 200"""
    r = superadmin.get("/api/superadmin/problem-reports")
    assert r.status_code == 200, r.text


# ═════════════════════════════════════════════════════════════════════════════
# Group 2 — Wave 1.1 bug fixes
# ═════════════════════════════════════════════════════════════════════════════


def test_bug_fix_document_types_advisor_blocked(advisor):
    """6 (BUG FIX): /api/superadmin/document-types now blocks asesor (was: any auth)."""
    r = advisor.get("/api/superadmin/document-types")
    assert r.status_code == 403, f"asesor still has access to /document-types: {r.status_code} {r.text[:200]}"


def test_bug_fix_document_types_superadmin_ok(superadmin):
    """7 (BUG FIX): /api/superadmin/document-types still works for superadmin."""
    r = superadmin.get("/api/superadmin/document-types")
    assert r.status_code == 200, r.text
    assert "doc_types" in r.json()


def test_bug_fix_document_types_developer_ok(developer):
    """8 (BUG FIX): /api/superadmin/document-types allowed for developer (consistent with rest of routes_documents)."""
    r = developer.get("/api/superadmin/document-types")
    assert r.status_code == 200, r.text


def test_bug_fix_units_history_advisor_blocked(advisor):
    """9 (BUG FIX): /api/superadmin/units/{nonexistent_id}/history now blocks asesor (was: 200 empty)."""
    r = advisor.get("/api/superadmin/units/nonexistent_unit_xyz/history")
    assert r.status_code == 403, f"asesor probed units/history (sample-skip bug not fixed): {r.status_code}"


def test_bug_fix_units_history_superadmin_ok(superadmin):
    """10 (BUG FIX): /api/superadmin/units/{nonexistent_id}/history returns 200 empty for superadmin."""
    r = superadmin.get("/api/superadmin/units/nonexistent_unit_xyz/history")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("count", 0) == 0


# ═════════════════════════════════════════════════════════════════════════════
# Group 3 — POST/PATCH/DELETE mutation guards
# ═════════════════════════════════════════════════════════════════════════════


def test_advisor_blocked_recompute_scores(advisor):
    """11: asesor cannot trigger /api/superadmin/scores/recompute (mutation)."""
    r = advisor.post("/api/superadmin/scores/recompute", json={"zone_id": "test", "codes": []})
    assert r.status_code == 403


def test_advisor_blocked_test_sentry():
    """12: anonymous → /api/_internal/test-sentry → 401/403 (never 500)."""
    r = httpx.post(f"{API}/api/_internal/test-sentry", timeout=15)
    assert r.status_code in (401, 403)


def test_advisor_blocked_ai_cap_patch(advisor):
    """13: asesor cannot mutate AI usage caps."""
    r = advisor.patch("/api/superadmin/ai-usage/some_org/cap", json={"cap": 100})
    assert r.status_code == 403
