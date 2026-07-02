"""Phase 4 Batch 21 · Pytest regression suite for Sub-B (Productivity) + Sub-C (Aggregated).

Run: DB_NAME=desarrollosmx python3 -m pytest tests/test_batch21.py -v
"""
import os
from datetime import datetime, timezone, timedelta

import httpx
import pymongo
import pytest

pytestmark = pytest.mark.integration


API = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "desarrollosmx")

ADMIN_EMAIL = "admin@desarrollosmx.io"
ADMIN_PASSWORD = "Admin2026!"
DEV_EMAIL = "developer@demo.com"
DEV_PASSWORD = "Dev2026!"
ASESOR_EMAIL = "asesor@demo.com"
ASESOR_PASSWORD = "Asesor2026!"


def _mkclient(email, pwd):
    c = httpx.Client(base_url=API, timeout=30, follow_redirects=True)
    r = c.post("/api/auth/login", json={"email": email, "password": pwd})
    assert r.status_code == 200, r.text
    for ck in r.cookies.jar:
        c.cookies.set(ck.name, ck.value, domain=ck.domain, path=ck.path)
    return c


@pytest.fixture(scope="module")
def superadmin():
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
    c = _mkclient(ASESOR_EMAIL, ASESOR_PASSWORD)
    yield c
    c.close()


@pytest.fixture(scope="module")
def seed_team():
    """Seed 3 advisors + activities + undo_log + leads + appointments in tenant 'b21_demo'."""
    client = pymongo.MongoClient(MONGO_URL)
    db = client[DB_NAME]

    tenant = "b21_demo"
    asesor_ids = [f"b21_ase_{i}" for i in range(1, 4)]
    now = datetime.now(timezone.utc)

    # Clean up any prior stale state (idempotent)
    db.users.delete_many({"user_id": {"$in": asesor_ids}})
    db.activities.delete_many({"actor_id": {"$in": asesor_ids}})
    db.undo_log.delete_many({"user_id": {"$in": asesor_ids}})
    db.leads.delete_many({"id": {"$regex": r"^b21_lead_"}})
    db.appointments.delete_many({"$or": [
        {"id": {"$regex": r"^b21_apt_"}},
        {"appointment_id": {"$regex": r"^b21_apt_"}},
        {"asesor_id": {"$in": asesor_ids}},
    ]})
    db.health_scores.delete_many({"entity_id": {"$in": asesor_ids}})
    db.user_preferences.delete_many({"user_id": {"$in": asesor_ids}})

    # Insert 3 advisors
    for i, aid in enumerate(asesor_ids, start=1):
        db.users.update_one({"user_id": aid}, {"$set": {
            "user_id": aid,
            "name": f"Asesor B21-{i}",
            "email": f"b21_ase_{i}@demo.com",
            "role": "advisor",
            "tenant_id": tenant,
            "avatar_url": "",
        }}, upsert=True)

    # Per-asesor seed: activities + undones + leads + appointments
    seeds = [
        # (changes_count, undones_count, pipeline_value, leads_in_period, won_in_period)
        (15, 1, 8_500_000, 6, 3),
        (10, 0, 5_200_000, 4, 1),
        (8,  4, 2_000_000, 3, 0),
    ]
    for aid, (changes, undones, pipeline, total_lp, won_lp) in zip(asesor_ids, seeds):
        # activities
        for i in range(changes):
            db.activities.insert_one({
                "id": f"act_{aid}_{i}",
                "actor_id": aid,
                "actor_type": "asesor",
                "action": "lead_stage_change" if i % 2 == 0 else "inline_edit",
                "entity_type": "lead",
                "entity_id": f"lead_{aid}_{i}",
                "timestamp": (now - timedelta(days=i % 25)).isoformat(),
                "created_at": (now - timedelta(days=i % 25)).isoformat(),
            })
        # undo_log
        for i in range(undones):
            db.undo_log.insert_one({
                "id": f"undo_{aid}_{i}",
                "user_id": aid,
                "action": "inline_edit",
                "entity_type": "lead",
                "entity_id": f"lead_{aid}_{i}",
                "before_state": {}, "after_state": {},
                "created_at": (now - timedelta(days=i)).isoformat(),
                "expires_at": (now + timedelta(hours=1)).isoformat(),
                "hard_purge_at": (now + timedelta(hours=24)).isoformat(),
                "undone_at": (now - timedelta(days=i)).isoformat(),
            })
        # Leads — both active & in-period
        per_asesor_pipeline = pipeline / max(1, total_lp - won_lp + 2)
        # Active leads (for pipeline)
        for i in range(2):
            db.leads.update_one({"id": f"b21_lead_active_{aid}_{i}"}, {"$set": {
                "id": f"b21_lead_active_{aid}_{i}",
                "lead_id": f"b21_lead_active_{aid}_{i}",
                "name": f"Lead Active {i}",
                "email": f"lead_act_{aid}_{i}@demo.com",
                "phone": "+525500000000",
                "assigned_to": aid,
                "lead_stage": "negociacion",
                "expected_value": per_asesor_pipeline,
                "created_at": (now - timedelta(days=10)).isoformat(),
                "first_response_at": (now - timedelta(days=10) + timedelta(hours=2)).isoformat(),
            }}, upsert=True)
        # In-period leads (some won, some lost)
        for i in range(total_lp):
            stage = "cerrado_ganado" if i < won_lp else "calificado"
            db.leads.update_one({"id": f"b21_lead_period_{aid}_{i}"}, {"$set": {
                "id": f"b21_lead_period_{aid}_{i}",
                "lead_id": f"b21_lead_period_{aid}_{i}",
                "name": f"Lead Period {i}",
                "email": f"lead_p_{aid}_{i}@demo.com",
                "phone": "+525500000001",
                "assigned_to": aid,
                "lead_stage": stage,
                "expected_value": 0,
                "created_at": (now - timedelta(days=15)).isoformat(),
                "first_response_at": (now - timedelta(days=15) + timedelta(hours=3)).isoformat(),
            }}, upsert=True)
        # Appointments
        for i in range(3):
            apt_id = f"b21_apt_{aid}_{i}"
            db.appointments.update_one({"id": apt_id}, {"$set": {
                "id": apt_id,
                "appointment_id": apt_id,
                "asesor_id": aid,
                "status": "confirmed",
                "datetime": (now + timedelta(days=i)).isoformat(),
            }}, upsert=True)
        # Health score
        db.health_scores.update_one(
            {"entity_type": "asesor", "entity_id": aid},
            {"$set": {
                "entity_type": "asesor", "entity_id": aid,
                "score": 70 + 5 * (3 - asesor_ids.index(aid)),
                "components": {}, "trend_7d": 0,
                "computed_at": now.isoformat(),
            }}, upsert=True,
        )
        # User preferences
        db.user_preferences.update_one(
            {"user_id": aid},
            {"$set": {"user_id": aid, "tours_completed": [f"tour_{j}" for j in range(2 + asesor_ids.index(aid))]}},
            upsert=True,
        )

    yield {"tenant": tenant, "asesor_ids": asesor_ids, "seeds": dict(zip(asesor_ids, seeds))}

    # Cleanup
    db.users.delete_many({"user_id": {"$in": asesor_ids}})
    db.activities.delete_many({"actor_id": {"$in": asesor_ids}})
    db.undo_log.delete_many({"user_id": {"$in": asesor_ids}})
    db.leads.delete_many({"id": {"$regex": r"^b21_lead_"}})
    db.appointments.delete_many({"id": {"$regex": r"^b21_apt_"}})
    db.health_scores.delete_many({"entity_id": {"$in": asesor_ids}})
    db.user_preferences.delete_many({"user_id": {"$in": asesor_ids}})
    client.close()


# ─── PERMISSIONS ────────────────────────────────────────────────────────────

def test_productivity_unauth():
    r = httpx.get(f"{API}/api/metrics/team-productivity")
    assert r.status_code == 401


def test_aggregated_unauth():
    r = httpx.get(f"{API}/api/metrics/team-aggregated")
    assert r.status_code == 401


def test_productivity_asesor_403(asesor):
    r = asesor.get("/api/metrics/team-productivity")
    assert r.status_code == 403


def test_aggregated_asesor_403(asesor):
    r = asesor.get("/api/metrics/team-aggregated")
    assert r.status_code == 403


def test_invalid_period(dev):
    r = dev.get("/api/metrics/team-productivity?period=999d")
    assert r.status_code == 422


# ─── PRODUCTIVITY (Sub-B) ──────────────────────────────────────────────────

def test_productivity_shape_and_calculations(superadmin, seed_team):
    r = superadmin.get("/api/metrics/team-productivity?period=30d")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["period"] == "30d"
    assert "team_total" in data
    tt = data["team_total"]
    for k in ("total_changes", "total_undones", "confidence_ratio_pct", "activity_per_day_avg"):
        assert k in tt
    # Verify our seeded asesores show up
    rows = data["by_asesor"]
    seeded_ids = set(seed_team["asesor_ids"])
    found = [r for r in rows if r["asesor_id"] in seeded_ids]
    assert len(found) == 3, f"Expected 3 seeded asesores, got {len(found)}"

    # Verify calculation matches seed: aid_1 has 15 changes, 1 undone → 93.3%
    by_id = {r["asesor_id"]: r for r in found}
    s1 = by_id["b21_ase_1"]
    assert s1["total_changes"] == 15
    assert s1["total_undones"] == 1
    assert s1["confidence_ratio_pct"] == round((1 - 1/15) * 100, 1)  # 93.3

    s2 = by_id["b21_ase_2"]
    assert s2["confidence_ratio_pct"] == 100.0  # 0 undones

    s3 = by_id["b21_ase_3"]
    assert s3["confidence_ratio_pct"] == round((1 - 4/8) * 100, 1)  # 50.0

    # Ranks assigned 1..N globally
    assert all("rank" in r and r["rank"] >= 1 for r in rows)


def test_productivity_period_7d(superadmin, seed_team):
    r = superadmin.get("/api/metrics/team-productivity?period=7d")
    assert r.status_code == 200
    data = r.json()
    assert data["period"] == "7d"
    # 7d window should have fewer activities than 30d
    seeded = [r for r in data["by_asesor"] if r["asesor_id"].startswith("b21_ase_")]
    # asesor_1 had 15 changes spread across days 0..14 mod 25 → only days 0..6 fit 7d
    assert all(r["total_changes"] <= 15 for r in seeded)


def test_productivity_dev_admin_can_access(dev):
    # developer_admin role can access (tenant scoped)
    r = dev.get("/api/metrics/team-productivity?period=30d")
    assert r.status_code == 200


# ─── AGGREGATED (Sub-C) ────────────────────────────────────────────────────

def test_aggregated_shape(superadmin, seed_team):
    r = superadmin.get("/api/metrics/team-aggregated?period=30d")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["period"] == "30d"
    assert "team_average" in data
    ta = data["team_average"]
    for k in ("pipeline_value_mxn", "conversion_rate_pct", "response_time_hours",
               "activity_score_7d", "health_score_avg", "citas_booked"):
        assert k in ta

    seeded_ids = set(seed_team["asesor_ids"])
    seeded_rows = [r for r in data["asesores"] if r["asesor_id"] in seeded_ids]
    assert len(seeded_rows) == 3

    # Expected fields
    for r in seeded_rows:
        for k in ("name", "avatar_url", "pipeline_value_mxn", "leads_active",
                   "conversion_rate_pct", "response_time_hours", "activity_score_7d",
                   "health_score", "citas_booked", "tours_completed", "vs_team_avg_pct"):
            assert k in r


def test_aggregated_vs_team_avg_signed(superadmin, seed_team):
    r = superadmin.get("/api/metrics/team-aggregated?period=30d")
    data = r.json()
    seeded_ids = set(seed_team["asesor_ids"])
    seeded_rows = [r for r in data["asesores"] if r["asesor_id"] in seeded_ids]
    # asesor_1 has highest pipeline (8.5M), asesor_3 has lowest (2M)
    by_id = {r["asesor_id"]: r for r in seeded_rows}
    assert by_id["b21_ase_1"]["vs_team_avg_pct"] >= 0
    assert by_id["b21_ase_3"]["vs_team_avg_pct"] < 0


def test_aggregated_citas_count(superadmin, seed_team):
    r = superadmin.get("/api/metrics/team-aggregated?period=30d")
    data = r.json()
    seeded = {r["asesor_id"]: r for r in data["asesores"]
               if r["asesor_id"] in seed_team["asesor_ids"]}
    # We seeded 3 confirmed appointments per asesor
    assert seeded["b21_ase_1"]["citas_booked"] == 3
    assert seeded["b21_ase_2"]["citas_booked"] == 3
    assert seeded["b21_ase_3"]["citas_booked"] == 3


def test_aggregated_health_score_present(superadmin, seed_team):
    r = superadmin.get("/api/metrics/team-aggregated?period=30d")
    data = r.json()
    seeded = {r["asesor_id"]: r for r in data["asesores"]
               if r["asesor_id"] in seed_team["asesor_ids"]}
    # We seeded health scores 80/75/70
    assert seeded["b21_ase_1"]["health_score"] == 85
    assert seeded["b21_ase_3"]["health_score"] == 75


def test_aggregated_tours_completed(superadmin, seed_team):
    r = superadmin.get("/api/metrics/team-aggregated?period=30d")
    data = r.json()
    seeded = {r["asesor_id"]: r for r in data["asesores"]
               if r["asesor_id"] in seed_team["asesor_ids"]}
    assert seeded["b21_ase_1"]["tours_completed"] == 2  # index 0 → 2
    assert seeded["b21_ase_3"]["tours_completed"] == 4  # index 2 → 4
