"""Phase 4 Batch 15 — Pytest regression suite.

Sub-chunk A: OAuth Connections (Google only, Microsoft stub)
Sub-chunk B: Availability Engine + Auto-assign Policies
Sub-chunk C: Metrics Dashboard + Public Booking

Run: cd /app/backend && TEST_BASE_URL=... python -m pytest tests/test_batch15.py -v
"""
import asyncio
import os
import sys
from datetime import datetime, timezone, timedelta

import httpx
import pytest

BASE_URL = os.environ.get("TEST_BASE_URL", "http://localhost:8001")


@pytest.fixture(scope="module")
def cookies():
    r = httpx.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "developer@demo.com", "password": "Dev2026!"},
        follow_redirects=True, timeout=15,
    )
    assert r.status_code == 200, r.text
    return dict(r.cookies)


# ─── Sub-Chunk A: OAuth ───────────────────────────────────────────────────────

class TestOAuthGoogle:

    def test_initiate_returns_google_auth_url(self, cookies):
        r = httpx.get(f"{BASE_URL}/api/oauth/google/initiate", cookies=cookies, timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert d["auth_url"].startswith("https://accounts.google.com/o/oauth2")
        assert "state=" in d["auth_url"]
        assert "calendar" in d["auth_url"]
        assert d["provider"] == "google"

    def test_connections_endpoint_returns_list(self, cookies):
        r = httpx.get(f"{BASE_URL}/api/oauth/connections", cookies=cookies, timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert "connections" in d
        assert isinstance(d["connections"], list)

    def test_google_slot_always_present(self, cookies):
        r = httpx.get(f"{BASE_URL}/api/oauth/connections", cookies=cookies, timeout=10)
        conns = r.json()["connections"]
        google = next((c for c in conns if c["provider"] == "google"), None)
        assert google is not None, "Google slot should always appear in connections"

    def test_advisor_pool_endpoint(self, cookies):
        r = httpx.get(f"{BASE_URL}/api/oauth/advisor-pool", cookies=cookies, timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert "advisors" in d
        assert isinstance(d["advisors"], list)

    def test_revoke_google_without_connection_graceful(self, cookies):
        """Revoking when not connected should still return ok."""
        r = httpx.post(f"{BASE_URL}/api/oauth/google/revoke", cookies=cookies, timeout=10)
        assert r.status_code == 200
        assert r.json()["ok"] is True


# ─── Sub-Chunk B: Availability + Policies ────────────────────────────────────

class TestPolicyCRUD:

    def test_get_policy_returns_default_when_none(self, cookies):
        """GET policy for new project returns default policy."""
        r = httpx.get(
            f"{BASE_URL}/api/appointments/policy/test-new-project-xyz",
            cookies=cookies, timeout=10,
        )
        assert r.status_code == 200
        d = r.json()
        assert d["policy_type"] == "round_robin"
        assert isinstance(d["asesor_pool"], list)

    def test_create_round_robin_policy(self, cookies):
        payload = {
            "policy_type": "round_robin",
            "asesor_pool": ["user_asesor_001", "user_asesor_002", "user_asesor_003"],
            "slot_duration_min": 60, "buffer_min": 15,
        }
        r = httpx.put(
            f"{BASE_URL}/api/appointments/policy/altavista-polanco",
            json=payload, cookies=cookies, timeout=10,
        )
        assert r.status_code == 200
        d = r.json()
        assert d["policy_type"] == "round_robin"
        assert len(d["asesor_pool"]) == 3

    def test_create_load_balance_policy(self, cookies):
        r = httpx.put(
            f"{BASE_URL}/api/appointments/policy/lomas-signature",
            json={"policy_type": "load_balance", "asesor_pool": ["user_asesor_001"],
                  "slot_duration_min": 45, "buffer_min": 10},
            cookies=cookies, timeout=10,
        )
        assert r.status_code == 200
        assert r.json()["policy_type"] == "load_balance"

    def test_invalid_policy_type_rejected(self, cookies):
        r = httpx.put(
            f"{BASE_URL}/api/appointments/policy/test-proj",
            json={"policy_type": "random_shuffle", "asesor_pool": []},
            cookies=cookies, timeout=10,
        )
        assert r.status_code == 400

    def test_policy_persists_after_get(self, cookies):
        """Policy saved via PUT is retrievable via GET."""
        httpx.put(
            f"{BASE_URL}/api/appointments/policy/pedregal-brutalist",
            json={"policy_type": "pre_selected", "asesor_pool": ["user_asesor_001"]},
            cookies=cookies, timeout=10,
        )
        r = httpx.get(
            f"{BASE_URL}/api/appointments/policy/pedregal-brutalist",
            cookies=cookies, timeout=10,
        )
        assert r.json()["policy_type"] == "pre_selected"


class TestAvailability:

    def test_availability_empty_pool_returns_no_slots(self, cookies):
        """Project with no asesor_pool returns 0 slots."""
        now = datetime.now(timezone.utc)
        r = httpx.post(
            f"{BASE_URL}/api/appointments/availability",
            json={
                "project_id": "test-empty-pool-xyz",
                "date_from": now.isoformat(),
                "date_to": (now + timedelta(days=2)).isoformat(),
            },
            cookies=cookies, timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["count"] == 0

    def test_availability_respects_date_range_limit(self, cookies):
        """Date range > 30d should be rejected."""
        now = datetime.now(timezone.utc)
        r = httpx.post(
            f"{BASE_URL}/api/appointments/availability",
            json={
                "project_id": "altavista-polanco",
                "date_from": now.isoformat(),
                "date_to": (now + timedelta(days=45)).isoformat(),
            },
            cookies=cookies, timeout=10,
        )
        assert r.status_code == 400


class TestAutoAssign:

    def test_round_robin_distributes(self):
        """Unit test: round_robin selects different asesores over 5 calls."""
        import asyncio
        sys.path.insert(0, "/app/backend")
        from motor.motor_asyncio import AsyncIOMotorClient
        from availability import _select_asesor_round_robin
        from dotenv import load_dotenv
        load_dotenv("/app/backend/.env")

        async def _run():
            db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
            await db.appointment_assign_log.delete_many({"project_id": "pytest-rr"})
            pool = ["user_asesor_001", "user_asesor_002", "user_asesor_003"]
            results = []
            for i in range(5):
                s = await _select_asesor_round_robin(db, "pytest-rr", pool)
                results.append(s)
                await db.appointment_assign_log.insert_one({
                    "project_id": "pytest-rr", "asesor_id": s,
                    "appointment_id": f"rr-{i}",
                    "assigned_at": f"2026-01-0{i+1}T00:00:00+00:00",
                })
            await db.appointment_assign_log.delete_many({"project_id": "pytest-rr"})
            return results

        results = asyncio.run(_run())
        unique = len(set(results))
        assert unique >= 2, f"Expected distribution among >=2 asesores, got: {results}"

    def test_load_balance_picks_least_loaded(self):
        """Unit test: load_balance picks asesor with fewer appointments."""
        import asyncio
        sys.path.insert(0, "/app/backend")
        from motor.motor_asyncio import AsyncIOMotorClient
        from availability import _select_asesor_load_balance
        from dotenv import load_dotenv
        load_dotenv("/app/backend/.env")

        async def _run():
            db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
            today = datetime.now(timezone.utc).date().isoformat()
            # Insert 3 confirmed apts for asesor_001
            await db.appointments.insert_many([
                {"asesor_id": "lb-asesor-A", "status": "confirmed",
                 "datetime": f"{today}T10:00:00+00:00", "id": f"lb-{i}"}
                for i in range(3)
            ])
            selected = await _select_asesor_load_balance(db, ["lb-asesor-A", "lb-asesor-B"])
            await db.appointments.delete_many({"asesor_id": "lb-asesor-A", "id": {"$regex": "lb-"}})
            return selected

        selected = asyncio.run(_run())
        assert selected == "lb-asesor-B", f"Expected lb-asesor-B (0 apts), got {selected}"


# ─── Sub-Chunk C: Public booking + Metrics ───────────────────────────────────

class TestPublicBooking:

    def test_public_booking_creates_appointment(self):
        """POST /api/public/appointments/book → creates appointment + ICS."""
        now = datetime.now(timezone.utc)
        slot_start = (now + timedelta(days=2)).replace(hour=10, minute=0, second=0, microsecond=0)
        slot_end = slot_start + timedelta(hours=1)
        r = httpx.post(
            f"{BASE_URL}/api/public/appointments/book",
            json={
                "project_id": "altavista-polanco",
                "slot_start": slot_start.isoformat(),
                "slot_end": slot_end.isoformat(),
                "lead_name": "Test Lead B15",
                "lead_email": "test.b15@domain.com",
            },
            timeout=15,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ok"] is True
        assert d["appointment_id"]
        assert d["asesor_id"]
        assert "BEGIN:VCALENDAR" in d.get("ics", ""), "ICS should be generated"


class TestMetrics:

    def test_metrics_returns_kpis_and_table(self, cookies):
        r = httpx.get(f"{BASE_URL}/api/appointments/metrics?limit=5", cookies=cookies, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "kpis" in d
        assert "auto_assigned_30d" in d["kpis"]
        assert "conversion_pct" in d["kpis"]
        assert "items" in d
        assert isinstance(d["items"], list)

    def test_metrics_filter_by_policy(self, cookies):
        r = httpx.get(
            f"{BASE_URL}/api/appointments/metrics?policy_type=round_robin",
            cookies=cookies, timeout=15,
        )
        assert r.status_code == 200

    def test_probes_pass(self, cookies):
        """B15 probes oauth_calendar_health + auto_assign_engine pass."""
        r = httpx.post(
            f"{BASE_URL}/api/dev/projects/altavista-polanco/diagnostic/run",
            json={"force": True}, cookies=cookies, timeout=30,
        )
        assert r.status_code == 200
        probes = {p["probe_id"]: p for p in r.json().get("probes_results", [])}
        assert "oauth_calendar_health" in probes
        assert probes["oauth_calendar_health"]["passed"], probes["oauth_calendar_health"]
        assert "auto_assign_engine" in probes
        assert probes["auto_assign_engine"]["passed"], probes["auto_assign_engine"]
