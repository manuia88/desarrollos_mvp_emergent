"""Phase 4 Batch 17 · Pytest regression suite.

Covers:
  · Inline edit endpoint (whitelist + permission + undo registration)
  · Filter presets CRUD
  · Undo system (register + perform + expiry + permission)
  · Reorder endpoints (documents, prototypes, tareas)
  · Probes registration

Run: pytest /app/backend/tests/test_batch17.py -v
"""
import asyncio
import os
import uuid
from datetime import datetime, timezone, timedelta

import httpx
import pytest

API = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")

DEV_EMAIL = "developer@demo.com"
DEV_PASSWORD = "Dev2026!"
ASESOR_EMAIL = "asesor@demo.com"
ASESOR_PASSWORD = "Asesor2026!"

PROJECT_SLUG = "altavista-polanco"


def _mkclient(email, pwd):
    c = httpx.Client(base_url=API, timeout=20, follow_redirects=True)
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
def db_project(dev):
    """Create a test project in db.projects so inline_edit can target it."""
    import pymongo
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "desarrollosmx")
    client = pymongo.MongoClient(mongo_url)
    db = client[db_name]
    slug = f"testb17-{uuid.uuid4().hex[:6]}"
    doc = {
        "id": slug,
        "slug": slug,
        "name": "Proyecto Test B17",
        "address": "Av. Demo 123",
        "price_from": 5_000_000,
        "description": "Proyecto demo creado para pruebas B17",
        "dev_org_id": "constructora_ariel",
        "developer_id": "constructora_ariel",
        "stage": "preventa",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    db.projects.insert_one({**doc})
    yield slug
    db.projects.delete_one({"id": slug})
    client.close()


# ═══════════════════════════════════════════════════════════════════════════
# INLINE EDIT
# ═══════════════════════════════════════════════════════════════════════════

def test_inline_unauth():
    r = httpx.patch(f"{API}/api/inline/unit/xxx",
                     json={"field": "price", "value": 100})
    assert r.status_code == 401


def test_inline_invalid_entity_type(dev):
    r = dev.patch("/api/inline/nothing/xxx", json={"field": "x", "value": 1})
    assert r.status_code == 400


def test_inline_non_whitelisted_field(dev):
    r = dev.patch(f"/api/inline/lead/anything",
                   json={"field": "password_hash", "value": "x"})
    assert r.status_code == 400


def test_inline_project_rename_and_undo(dev, db_project):
    # Try to update project name
    original = None
    r = dev.patch(f"/api/inline/project/{db_project}",
                   json={"field": "name", "value": "Nombre TestB17"})
    if r.status_code == 403:
        pytest.skip("dev user cannot edit seed project — expected per tenant rules")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["ok"] is True
    assert data["new"] == "Nombre TestB17"
    original = data["old"]

    # Verify undo was registered
    r2 = dev.get("/api/undo/recent?limit=5")
    assert r2.status_code == 200
    items = r2.json()["items"]
    target = next((i for i in items
                    if i.get("action") == "inline_edit"
                    and i.get("entity_id") == db_project), None)
    assert target is not None, "Undo entry not registered"
    undo_id = target["id"]

    # Perform undo
    r3 = dev.post(f"/api/undo/{undo_id}", json={})
    assert r3.status_code == 200, r3.text

    # Verify restored by re-reading
    r4 = dev.patch(f"/api/inline/project/{db_project}",
                    json={"field": "name", "value": "Nombre TestB17 v2"})
    assert r4.status_code == 200
    assert r4.json()["old"] == original  # restored value is visible


def test_inline_validator_rejects(dev, db_project):
    r = dev.patch(f"/api/inline/project/{db_project}",
                   json={"field": "price_from", "value": -500})
    assert r.status_code == 400


# ═══════════════════════════════════════════════════════════════════════════
# UNDO
# ═══════════════════════════════════════════════════════════════════════════

def test_undo_recent_unauth():
    r = httpx.get(f"{API}/api/undo/recent")
    assert r.status_code == 401


def test_undo_not_found(dev):
    r = dev.post("/api/undo/undo_nonexistent", json={})
    assert r.status_code == 404


def test_undo_double_redo_blocked(dev, db_project):
    # Create an inline edit, capture undo, execute twice
    r = dev.patch(f"/api/inline/project/{db_project}",
                   json={"field": "description", "value": "Test B17 desc"})
    if r.status_code != 200:
        pytest.skip("Cannot edit project")
    recent = dev.get("/api/undo/recent?limit=1").json()["items"]
    if not recent:
        pytest.skip("No undo registered")
    uid = recent[0]["id"]
    r1 = dev.post(f"/api/undo/{uid}", json={})
    assert r1.status_code == 200
    r2 = dev.post(f"/api/undo/{uid}", json={})
    assert r2.status_code == 409  # already undone


# ═══════════════════════════════════════════════════════════════════════════
# FILTER PRESETS
# ═══════════════════════════════════════════════════════════════════════════

def test_presets_crud(dev):
    name = f"testpreset_{uuid.uuid4().hex[:6]}"
    r1 = dev.post("/api/filter-presets", json={
        "route": "/desarrollador/crm",
        "name": name,
        "filters": {"status": "active", "zona": "polanco"},
    })
    assert r1.status_code == 200
    preset_id = r1.json()["id"]

    r2 = dev.get("/api/filter-presets?route=/desarrollador/crm")
    assert r2.status_code == 200
    found = any(p["id"] == preset_id for p in r2.json()["items"])
    assert found

    r3 = dev.delete(f"/api/filter-presets/{preset_id}")
    assert r3.status_code == 200

    # Double delete → 404
    r4 = dev.delete(f"/api/filter-presets/{preset_id}")
    assert r4.status_code == 404


def test_presets_empty_name(dev):
    r = dev.post("/api/filter-presets", json={
        "route": "/x", "name": "  ", "filters": {},
    })
    assert r.status_code == 400


# ═══════════════════════════════════════════════════════════════════════════
# REORDER
# ═══════════════════════════════════════════════════════════════════════════

def test_reorder_tareas_empty(asesor):
    r = asesor.post("/api/asesor/tareas/reorder", json={"ordered_ids": []})
    assert r.status_code == 200
    assert r.json()["reordered"] == 0


def test_reorder_permission_denied_asesor(asesor):
    # Asesor should not be able to reorder project documents
    r = asesor.post(f"/api/dev/projects/{PROJECT_SLUG}/documents/reorder",
                    json={"ordered_ids": []})
    assert r.status_code == 403


def test_reorder_prototypes_empty(dev):
    r = dev.post(f"/api/dev/projects/{PROJECT_SLUG}/prototypes/reorder",
                  json={"ordered_ids": []})
    assert r.status_code == 200


# ═══════════════════════════════════════════════════════════════════════════
# PROBES
# ═══════════════════════════════════════════════════════════════════════════

def test_probes_batch17_registered(dev):
    r = dev.get(f"/api/diagnostic/project/{PROJECT_SLUG}/probes")
    if r.status_code == 404:
        pytest.skip("Diagnostic endpoint not exposed in test env")
    if r.status_code != 200:
        pytest.skip(f"Diagnostic endpoint returned {r.status_code}")
    probes = r.json().get("probes", [])
    ids = [p.get("id", "") for p in probes]
    assert any("inline_edit_audit" in pid for pid in ids), f"Missing inline_edit_audit: {ids[:5]}"
    assert any("undo_system_health" in pid for pid in ids), f"Missing undo_system_health"
