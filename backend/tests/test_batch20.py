"""Phase 4 Batch 20 · Pytest regression suite for Asesor metrics + Tracking links + Funnel/Sankey.

Run: DB_NAME=desarrollosmx python3 -m pytest tests/test_batch20.py -v
"""
import os
import uuid
from datetime import datetime, timezone

import httpx
import pymongo
import pytest

pytestmark = pytest.mark.integration


API = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "desarrollosmx")

DEV_EMAIL = "developer@demo.com"
DEV_PASSWORD = "Dev2026!"
ASESOR_EMAIL = "asesor@demo.com"
ASESOR_PASSWORD = "Asesor2026!"


def _mkclient(email, pwd):
    c = httpx.Client(base_url=API, timeout=30, follow_redirects=False)
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


@pytest.fixture(scope="module")
def db_handle():
    client = pymongo.MongoClient(MONGO_URL)
    yield client[DB_NAME]
    client.close()


# ─── Asesor Metrics ────────────────────────────────────────────────────────

def test_asesor_metrics_unauth():
    r = httpx.get(f"{API}/api/asesor/metrics/me")
    assert r.status_code == 401


def test_asesor_metrics_me_shape(asesor):
    r = asesor.get("/api/asesor/metrics/me?period=30d")
    assert r.status_code == 200
    data = r.json()
    for k in ("asesor_id", "pipeline_value_mxn", "leads_active", "conversion_rate_pct",
               "response_time_hours", "citas_booked_30d", "activity_score_7d", "links_active"):
        assert k in data


def test_asesor_team_403_for_asesor(asesor):
    r = asesor.get("/api/asesor/metrics/team")
    assert r.status_code == 403


def test_asesor_team_admin_ok(dev):
    r = dev.get("/api/asesor/metrics/team?period=30d")
    assert r.status_code == 200
    data = r.json()
    assert "asesores" in data and "team_average_pipeline" in data


def test_asesor_metrics_invalid_period(asesor):
    r = asesor.get("/api/asesor/metrics/me?period=999d")
    assert r.status_code == 422


# ─── Tracking links ────────────────────────────────────────────────────────

def test_link_create_and_list(asesor, db_handle):
    payload = {
        "project_id": "altavista-polanco",
        "utm_source": "facebook",
        "utm_medium": "social",
        "utm_campaign": "test_b20",
    }
    r = asesor.post("/api/asesor/links", json=payload)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "link_id" in data and len(data["link_id"]) == 8
    assert data["booking_url"].endswith(f"ref={data['link_id']}&utm_source=facebook&utm_medium=social&utm_campaign=test_b20") \
        or "ref=" in data["booking_url"]
    assert data["qr_png_data_url"].startswith("data:image/png;base64,")
    slug = data["link_id"]

    # List links — should include this slug
    r2 = asesor.get("/api/asesor/links")
    assert r2.status_code == 200
    items = r2.json()["items"]
    assert any(x["link_id"] == slug for x in items)

    # Cleanup
    db_handle.tracking_links.delete_one({"link_id": slug})


def test_link_invalid_utm_source(asesor):
    r = asesor.post("/api/asesor/links", json={
        "project_id": "x", "utm_source": "INVALID", "utm_medium": "social",
    })
    assert r.status_code == 400


def test_link_click_redirect_and_cookie(asesor, db_handle):
    # Create a link
    payload = {"project_id": "altavista-polanco", "utm_source": "qr",
                "utm_medium": "print", "utm_campaign": "print2026"}
    r = asesor.post("/api/asesor/links", json=payload)
    slug = r.json()["link_id"]
    try:
        # Hit the public click endpoint (no auth) — should 302 + set cookie
        click = httpx.get(f"{API}/api/links/{slug}/click", follow_redirects=False)
        assert click.status_code == 302
        assert "/reservar/altavista-polanco" in click.headers.get("location", "")
        cookies = click.headers.get("set-cookie", "")
        assert "dmx_ref=" in cookies and slug in cookies
        # Click counter should be 1
        link = db_handle.tracking_links.find_one({"link_id": slug})
        assert link["total_clicks"] >= 1
    finally:
        db_handle.tracking_links.delete_one({"link_id": slug})
        db_handle.link_clicks.delete_many({"link_id": slug})


def test_link_delete_soft(asesor, db_handle):
    r = asesor.post("/api/asesor/links", json={
        "project_id": "x-test-delete", "utm_source": "email", "utm_medium": "email",
    })
    slug = r.json()["link_id"]
    try:
        r2 = asesor.delete(f"/api/asesor/links/{slug}")
        assert r2.status_code == 200
        link = db_handle.tracking_links.find_one({"link_id": slug})
        assert link is not None
        assert link["active"] is False
    finally:
        db_handle.tracking_links.delete_one({"link_id": slug})


# ─── Funnel ────────────────────────────────────────────────────────────────

def test_funnel_event_public_no_auth():
    payload = {"event_type": "view_ficha", "project_id": "altavista-polanco"}
    r = httpx.post(f"{API}/api/funnel/event", json=payload)
    assert r.status_code == 200


def test_funnel_invalid_event():
    r = httpx.post(f"{API}/api/funnel/event",
                    json={"event_type": "not_real", "project_id": "x"})
    assert r.status_code == 400


def test_funnel_get_shape():
    r = httpx.get(f"{API}/api/funnel/altavista-polanco?period=30d")
    assert r.status_code == 200
    data = r.json()
    assert "stages" in data and len(data["stages"]) == 6
    for s in data["stages"]:
        assert "stage" in s and "count" in s and "drop_off_pct" in s


def test_funnel_breakdown_dimensions():
    for dim in ("utm_source", "asesor", "campaign"):
        r = httpx.get(f"{API}/api/funnel/altavista-polanco/breakdown?dimension={dim}&period=30d")
        assert r.status_code == 200
        assert "rows" in r.json()


def test_funnel_drop_off_math(db_handle):
    """Seed 5 events for fake project then verify drop_off math."""
    project_id = f"b20-drop-{uuid.uuid4().hex[:6]}"
    now = datetime.now(timezone.utc)
    docs = []
    for stage, n in [
        ("view_ficha", 100),
        ("click_reservar", 60),
        ("slot_picked", 40),
        ("form_filled", 25),
        ("booking_confirmed", 10),
    ]:
        for i in range(n):
            docs.append({
                "id": f"{project_id}_{stage}_{i}",
                "event_type": stage, "project_id": project_id,
                "session_id": f"s{i}", "ip_hash": "",
                "created_at": now.isoformat(),
                "metadata": {},
            })
    db_handle.funnel_events.insert_many(docs)
    try:
        r = httpx.get(f"{API}/api/funnel/{project_id}?period=30d")
        data = r.json()
        by_stage = {s["stage"]: s for s in data["stages"]}
        # view_ficha→click_reservar: 100→60 → drop 40%
        assert by_stage["click_reservar"]["drop_off_pct"] == 40.0
        # form→booking: 25→10 → drop 60%
        assert by_stage["booking_confirmed"]["drop_off_pct"] == 60.0
        assert data["overall_conversion_pct"] == 10.0  # 10/100
    finally:
        db_handle.funnel_events.delete_many({"project_id": project_id})


# ─── Sankey ────────────────────────────────────────────────────────────────

def test_sankey_shape_admin(dev):
    r = dev.get("/api/sankey/attribution?project_id=altavista-polanco&period=30d")
    assert r.status_code == 200
    data = r.json()
    assert "nodes" in data and "links" in data
    assert isinstance(data["nodes"], list) and isinstance(data["links"], list)


def test_sankey_asesor_403(asesor):
    r = asesor.get("/api/sankey/attribution?project_id=altavista-polanco&period=30d")
    assert r.status_code == 403


# ─── AI Suggestion gating ──────────────────────────────────────────────────

def test_funnel_suggestion_below_threshold(dev):
    """If <100 events, should not call Claude (suggestion=null)."""
    project_id = f"b20-empty-{uuid.uuid4().hex[:6]}"
    r = dev.get(f"/api/funnel/{project_id}/suggestion?period=30d")
    assert r.status_code == 200
    data = r.json()
    assert data["suggestion"] is None
    assert data["min_events_required"] == 100


# ─── Snapshot job ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_run_daily_snapshots_dry_run(db_handle):
    """Run the snapshot computation directly + verify upsert."""
    import sys
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))  # [AUD-013] path portable (no /app)
    import motor.motor_asyncio
    mclient = motor.motor_asyncio.AsyncIOMotorClient(MONGO_URL)
    mdb = mclient[DB_NAME]
    from scheduler_asesor_snapshots import run_daily_snapshots
    written = await run_daily_snapshots(mdb)
    assert written >= 0  # may be 0 if no asesores yet, but no exception
    mclient.close()
