"""SA · /api/auth/register · allowlist de roles (seguridad).

Cierra el hueco de auto-provisión de privilegios: register NO debe aceptar un
`role` del cliente fuera de {buyer, advisor, developer_admin} (espejo de
/select-role). Privilegiados (superadmin/asesor_admin/developer_director/
inmobiliaria_*) solo se asignan server-side (seed/admin), nunca por registro
público.

Sin infra real: mock_db (mongomock_motor de conftest). server.* (hash/token)
stubbeado vía sys.modules para no importar el server completo.

Run: python3 -m pytest tests/test_auth_register_role.py -v
"""
from __future__ import annotations

import sys
from types import SimpleNamespace, ModuleType

import pytest

import routes.auth as auth_mod


def _stub_server(monkeypatch):
    """register() hace `from server import hash_password, ...` adentro.
    Lo resolvemos a stubs para no cargar el server real (pesado / side-effects)."""
    fake = ModuleType("server")
    fake.hash_password = lambda pw: f"hashed:{pw}"
    fake.create_access_token = lambda uid, email: "access-token"
    fake.create_refresh_token = lambda uid: "refresh-token"
    monkeypatch.setitem(sys.modules, "server", fake)


def _req(mock_db):
    return SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(db=mock_db)))


def _resp():
    # register() solo llama response.set_cookie(...)
    return SimpleNamespace(set_cookie=lambda *a, **k: None)


async def _register(mock_db, **fields):
    payload = auth_mod.RegisterIn(**fields)
    return await auth_mod.register(payload, _resp(), _req(mock_db))


# ─── 1 · superadmin → 400 y NO crea usuario ──────────────────────────────────
@pytest.mark.unit
@pytest.mark.asyncio
async def test_register_rejects_superadmin(mock_db, monkeypatch):
    _stub_server(monkeypatch)
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as ei:
        await _register(mock_db, email="hacker@x.com", password="x", name="H", role="superadmin")
    assert ei.value.status_code == 400
    assert await mock_db.users.find_one({"email": "hacker@x.com"}) is None


# ─── 2 · otros roles privilegiados / basura también rechazados ───────────────
@pytest.mark.unit
@pytest.mark.asyncio
@pytest.mark.parametrize("bad_role", ["asesor_admin", "developer_director", "inmobiliaria_admin", "random"])
async def test_register_rejects_other_privileged(mock_db, monkeypatch, bad_role):
    _stub_server(monkeypatch)
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as ei:
        await _register(mock_db, email=f"{bad_role}@x.com", password="x", name="X", role=bad_role)
    assert ei.value.status_code == 400


# ─── 3 · roles self-serve permitidos: buyer/advisor/developer_admin ──────────
@pytest.mark.unit
@pytest.mark.asyncio
@pytest.mark.parametrize("ok_role", ["buyer", "advisor", "developer_admin"])
async def test_register_allows_self_serve(mock_db, monkeypatch, ok_role):
    _stub_server(monkeypatch)
    out = await _register(mock_db, email=f"{ok_role}@x.com", password="x", name="X", role=ok_role)
    assert out["user"].role == ok_role
    doc = await mock_db.users.find_one({"email": f"{ok_role}@x.com"})
    assert doc and doc["role"] == ok_role


# ─── 4 · default sin role = buyer ────────────────────────────────────────────
@pytest.mark.unit
@pytest.mark.asyncio
async def test_register_default_buyer(mock_db, monkeypatch):
    _stub_server(monkeypatch)
    out = await _register(mock_db, email="default@x.com", password="x", name="X")
    assert out["user"].role == "buyer"
