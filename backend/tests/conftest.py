"""Pytest configuration · DMX Wave 1+ test suite.

- Markers: unit (no infra · mocks) · integration (server + Mongo live)
- Fixtures: mongomock client · async event loop · common test data
- Default: collect only `unit` markers (rápido CI). Integration via `pytest -m integration`.

Compatible con tests legacy `backend/tests/test_batch*.py` (integration sin marker).
"""
from __future__ import annotations

import os
os.environ.setdefault("DEMO_SEED_ON", "1")   # tests validan motores con la data fixture (runtime la apaga)
import socket
from urllib.parse import urlparse

import pytest

# ─── [AUD-011] Skip honesto de tests de integración cuando su backend NO está vivo ──────────────
# Antes: ~460 tests e2e/integración erroraban con httpx.ConnectError / ConnectionError al correr
# `pytest` sin un servidor arriba (default apuntan a localhost:8001) → la línea base salía en rojo
# aunque no hubiera un solo bug de producto. Un test de integración sin su infra debe SALTARSE, no
# fallar. Este hook detecta el URL objetivo del módulo (global API / BASE_URL) y, si el socket NO
# conecta, marca skip. Si el backend SÍ está vivo, los tests corren de verdad (no se enmascara nada).
_LIVE_CACHE: dict[str, bool] = {}


def _reachable(url: str) -> bool:
    if url in _LIVE_CACHE:
        return _LIVE_CACHE[url]
    ok = False
    try:
        u = urlparse(url)
        host = u.hostname or "localhost"
        port = u.port or (443 if u.scheme == "https" else 80)
        with socket.create_connection((host, port), timeout=1.0):
            ok = True
    except OSError:
        ok = False
    _LIVE_CACHE[url] = ok
    return ok


def _mongo_reachable() -> bool:
    uri = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    if uri in _LIVE_CACHE:
        return _LIVE_CACHE[uri]
    try:
        u = urlparse(uri)
        ok = _reachable(f"http://{u.hostname or 'localhost'}:{u.port or 27017}")
    except OSError:
        ok = False
    _LIVE_CACHE[uri] = ok
    return ok


import re as _re

# nombres típicos de la variable con la URL base del backend en los tests e2e
_URL_GLOBALS = ("API", "API_URL", "BASE", "BASE_URL", "ROOT", "HOST", "BACKEND", "URL", "SERVER")
# URLs objetivo detectables en el SOURCE del módulo (fixtures que devuelven la URL, defaults hardcodeados)
_URL_SRC = _re.compile(r"https?://(?:localhost|127\.0\.0\.1):80{0,1}[0-9]{1,3}|https?://[a-z0-9-]+\.preview\.emergentagent\.com")
_MOD_URLS: dict[str, list[str]] = {}


def _module_target_urls(mod) -> list[str]:
    """URLs de backend que un módulo de test usa (globals conocidos + regex sobre su source)."""
    key = getattr(mod, "__file__", None) or getattr(mod, "__name__", "")
    if key in _MOD_URLS:
        return _MOD_URLS[key]
    urls: set[str] = set()
    for g in _URL_GLOBALS:
        v = getattr(mod, g, None)
        if isinstance(v, str) and v.startswith("http"):
            urls.add(v)
    try:
        with open(mod.__file__, encoding="utf-8", errors="replace") as f:
            for m in _URL_SRC.finditer(f.read()):
                urls.add(m.group(0))
    except (OSError, AttributeError):
        pass
    out = sorted(urls)
    _MOD_URLS[key] = out
    return out


def pytest_collection_modifyitems(config, items):
    """Salta (no falla) los tests de integración cuyo backend/Mongo objetivo no esté vivo.

    Honesto: solo salta si NINGUNA de las URLs objetivo del módulo conecta a nivel socket.
    Si el backend está arriba en la URL configurada, los tests corren de verdad.
    """
    env_override = bool(os.environ.get("REACT_APP_BACKEND_URL"))
    for item in items:
        mod = getattr(item, "module", None)
        if mod is None:
            continue
        urls = _module_target_urls(mod)
        # Un preview remoto de Emergent hardcodeado como default NO es un target local válido:
        # sin REACT_APP_BACKEND_URL explícito, ese host puede aceptar TCP (parked/CDN) pero no servir
        # la API → JSONDecodeError/AssertionError espurios. Se trata como no-alcanzable.
        def _intended(u: str) -> bool:
            if "emergentagent.com" in u and not env_override:
                return False
            return _reachable(u)
        if urls and not any(_intended(u) for u in urls):
            item.add_marker(pytest.mark.skip(
                reason=f"integración: backend no vivo en {urls[0]} (AUD-011)"))
            continue
        murl = getattr(mod, "MONGO_URL", None) or getattr(mod, "MONGO_URI", None)
        if isinstance(murl, str) and murl.startswith("mongodb") and not _mongo_reachable():
            item.add_marker(pytest.mark.skip(reason="integración: Mongo no vivo (AUD-011)"))


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
