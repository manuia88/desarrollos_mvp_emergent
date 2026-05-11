"""Pytest configuration · DMX Wave 1+ test suite.

- Markers: unit (no infra · mocks) · integration (server + Mongo live)
- Fixtures: mongomock client · async event loop · common test data
- Default: collect only `unit` markers (rápido CI). Integration via `pytest -m integration`.

Compatible con tests legacy `backend/tests/test_batch*.py` (integration sin marker).
"""
from __future__ import annotations

import pytest


def pytest_configure(config):
    """Register custom markers."""
    config.addinivalue_line(
        "markers", "unit: lightweight tests · cero infra · mocks · run en CI"
    )
    config.addinivalue_line(
        "markers", "integration: requires servidor live + Mongo seedeada"
    )
    config.addinivalue_line(
        "markers", "slow: tests >5s · skip default"
    )
    config.addinivalue_line(
        "markers", "tenant_isolation: W4.15.3 G5 cross-tenant attack tests"
    )


# ─── Fixtures comunes Wave 1+ ───────────────────────────────────────────────


@pytest.fixture
def mock_db():
    """Mongomock async-compatible · usar en unit tests que tocan Mongo sin server real.

    Uso:
        async def test_xxx(mock_db):
            await mock_db.users.insert_one({"x": 1})
            doc = await mock_db.users.find_one({"x": 1})
            assert doc["x"] == 1
    """
    try:
        import mongomock_motor
        client = mongomock_motor.AsyncMongoMockClient()
        return client["dmx_test"]
    except ImportError:
        pytest.skip("mongomock_motor not installed · pip install mongomock-motor")


@pytest.fixture
def superadmin_user():
    """Mock superadmin user dict · para tests permissions."""
    return {
        "user_id": "test-sa-001",
        "email": "test-sa@desarrollosmx.io",
        "role": "superadmin",
        "tenant_id": None,
        "account_blocked": False,
    }


@pytest.fixture
def developer_user():
    """Mock developer user dict · para tests tenant scope."""
    return {
        "user_id": "test-dev-001",
        "email": "test-dev@desarrollosmx.io",
        "role": "developer_admin",
        "tenant_id": "tenant-test-001",
        "account_blocked": False,
    }


@pytest.fixture
def asesor_user():
    """Mock asesor user dict · para tests roles intermedios."""
    return {
        "user_id": "test-asesor-001",
        "email": "test-asesor@desarrollosmx.io",
        "role": "advisor",
        "tenant_id": "tenant-test-001",
        "account_blocked": False,
    }


@pytest.fixture
def blocked_user():
    """Mock blocked user · para tests account_blocked flow."""
    return {
        "user_id": "test-blocked-001",
        "email": "test-blocked@desarrollosmx.io",
        "role": "advisor",
        "tenant_id": "tenant-test-001",
        "account_blocked": True,
    }
