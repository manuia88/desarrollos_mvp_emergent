"""Phase 4 Batch 22 · Pytest regression suite for Project Insights tab.

Run: DB_NAME=desarrollosmx python3 -m pytest tests/test_batch22.py -v
"""
import os

import httpx
import pytest

API = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")

DEV_EMAIL = "developer@demo.com"
DEV_PASSWORD = "Dev2026!"
ASESOR_EMAIL = "asesor@demo.com"
ASESOR_PASSWORD = "Asesor2026!"
PROJECT_ID = "altavista-polanco"  # legacy seed


def _mkclient(email, pwd):
    c = httpx.Client(base_url=API, timeout=60, follow_redirects=False)
    r = c.post("/api/auth/login", json={"email": email, "password": pwd})
    assert r.status_code == 200, r.text
    for ck in r.cookies.jar:
        c.cookies.set(ck.name, ck.value, domain=ck.domain, path=ck.path)
    return c


@pytest.fixture(scope="module")
def dev():
    c = _mkclient(DEV_EMAIL, DEV_PASSWORD)
    yield c
    c.close()


@pytest.fixture(scope="module")
def asesor():
    c = _mkclient(ASESOR_EMAIL, ASESOR_PASSWORD)
    yield c
    c.close()


# ─── Auth gating ─────────────────────────────────────────────────────────────

def test_resumen_requires_auth():
    c = httpx.Client(base_url=API, timeout=10)
    r = c.get(f"/api/dev/projects/{PROJECT_ID}/insights/resumen")
    assert r.status_code in (401, 403)
    c.close()


def test_asesor_role_blocked(asesor):
    r = asesor.get(f"/api/dev/projects/{PROJECT_ID}/insights/resumen")
    assert r.status_code == 403


def test_unknown_project_404(dev):
    r = dev.get("/api/dev/projects/nonexistent-xyz-zzz/insights/resumen")
    assert r.status_code == 404


# ─── Resumen ─────────────────────────────────────────────────────────────────

def test_resumen_shape(dev):
    r = dev.get(f"/api/dev/projects/{PROJECT_ID}/insights/resumen")
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["project_id"] == PROJECT_ID
    assert "kpis" in j
    for k in ("units_sold", "units_total", "leads_30d", "conversion_pct",
             "days_listed", "gmv"):
        assert k in j["kpis"]
    assert "health_score" in j
    assert "trend_30d" in j and isinstance(j["trend_30d"], list)
    assert "summary_text" in j
    assert isinstance(j["summary_text"], str) and len(j["summary_text"]) > 0


# ─── Engagement ──────────────────────────────────────────────────────────────

@pytest.mark.parametrize("period", ["7d", "30d", "90d"])
def test_engagement_periods(dev, period):
    r = dev.get(f"/api/dev/projects/{PROJECT_ID}/insights/engagement?period={period}")
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["period"] == period
    assert "total_visits_asesor" in j
    assert "total_visits_cliente" in j
    assert "top_units_asesor" in j and isinstance(j["top_units_asesor"], list)
    assert "top_units_cliente" in j and isinstance(j["top_units_cliente"], list)
    assert "time_distribution" in j
    assert "conversion_rate_per_actor" in j
    assert "asesor" in j["conversion_rate_per_actor"]
    assert "cliente" in j["conversion_rate_per_actor"]


def test_engagement_invalid_period_422(dev):
    r = dev.get(f"/api/dev/projects/{PROJECT_ID}/insights/engagement?period=junk")
    assert r.status_code == 422


# ─── Comparables ─────────────────────────────────────────────────────────────

def test_comparables_shape(dev):
    r = dev.get(f"/api/dev/projects/{PROJECT_ID}/insights/comparables?top_n=3")
    assert r.status_code == 200, r.text
    j = r.json()
    assert "current" in j
    assert "comparables" in j and isinstance(j["comparables"], list)
    if j["comparables"]:
        c = j["comparables"][0]
        for k in ("id", "name", "similarity_score", "delta_vs_current",
                  "price_per_m2", "health_score", "sale_velocity_per_month"):
            assert k in c
        d = c["delta_vs_current"]
        for k in ("price_per_m2_pct", "health_pct", "velocity_pct", "days_listed_pct"):
            assert k in d


def test_comparables_top_n_bounds(dev):
    r = dev.get(f"/api/dev/projects/{PROJECT_ID}/insights/comparables?top_n=10")
    assert r.status_code == 200
    r2 = dev.get(f"/api/dev/projects/{PROJECT_ID}/insights/comparables?top_n=20")
    assert r2.status_code == 422


# ─── AI: predictions / recommendations / narrative ───────────────────────────

def test_predictions_items(dev):
    r = dev.get(f"/api/dev/projects/{PROJECT_ID}/insights/ai/predictions")
    assert r.status_code == 200, r.text
    j = r.json()
    assert "items" in j and isinstance(j["items"], list)
    assert len(j["items"]) >= 1
    for it in j["items"]:
        assert 0 <= it["confidence_pct"] <= 100
        assert isinstance(it["value"], str)
        assert isinstance(it["reasoning"], str)


def test_recommendations_items(dev):
    r = dev.get(f"/api/dev/projects/{PROJECT_ID}/insights/ai/recommendations")
    assert r.status_code == 200, r.text
    j = r.json()
    assert "items" in j and isinstance(j["items"], list)
    assert len(j["items"]) >= 1
    for it in j["items"]:
        assert it["priority"] in ("high", "med", "low")
        assert isinstance(it["title"], str)
        assert isinstance(it["body"], str)
        assert isinstance(it.get("category"), str)


def test_narrative_text(dev):
    r = dev.get(f"/api/dev/projects/{PROJECT_ID}/insights/ai/narrative?period=30d")
    assert r.status_code == 200, r.text
    j = r.json()
    assert "text" in j and isinstance(j["text"], str)
    assert len(j["text"]) > 20


def test_narrative_invalid_period(dev):
    r = dev.get(f"/api/dev/projects/{PROJECT_ID}/insights/ai/narrative?period=junk")
    assert r.status_code == 422


def test_predictions_cache_idempotent(dev):
    r1 = dev.get(f"/api/dev/projects/{PROJECT_ID}/insights/ai/predictions")
    r2 = dev.get(f"/api/dev/projects/{PROJECT_ID}/insights/ai/predictions")
    assert r1.status_code == 200 and r2.status_code == 200
    # On 2nd call we should hit cache (or still return same items)
    items1 = r1.json().get("items", [])
    items2 = r2.json().get("items", [])
    assert len(items1) == len(items2)
