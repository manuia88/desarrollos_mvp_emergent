"""Seguridad · aislamiento multi-tenant — candados CENTRALES (tenant_scope).

Test permanente que cuida la RAÍZ cerrada en la auditoría 2026-06-16: los helpers
que tapan las fugas cross-tenant. Si alguien debilita un candado, este test truena.
Verifica por candado: dueño OK · otra cuenta → 403 · superadmin god-view · 404 si no existe.

Run: cd backend && python3 -m pytest tests/test_tenant_scope.py -v
"""
from __future__ import annotations

import pytest
from fastapi import HTTPException

import tenant_scope as ts

pytestmark = pytest.mark.tenant_isolation

DEV_A = {"role": "developer_admin", "tenant_id": "org_a", "user_id": "u_a"}
DEV_B = {"role": "developer_admin", "tenant_id": "org_b", "user_id": "u_b"}
SUPER = {"role": "superadmin", "tenant_id": "dmx", "user_id": "u_s"}


@pytest.fixture(autouse=True)
def _prod_mode(monkeypatch):
    """Fuerza producción (fail-closed) para que los candados NIEGUEN de verdad
    (en demo/DMX_DEV_MODE algunos fallbacks no bloquean)."""
    monkeypatch.setenv("DMX_DEV_MODE", "false")


# ─── assert_dev_org (eje desarrolladora) ─────────────────────────────────────
def test_dev_org_owner_ok():
    ts.assert_dev_org(DEV_A, "org_a")  # no raise


def test_dev_org_other_tenant_403():
    with pytest.raises(HTTPException) as e:
        ts.assert_dev_org(DEV_A, "org_b")
    assert e.value.status_code == 403


def test_dev_org_superadmin_godview():
    ts.assert_dev_org(SUPER, "org_a")
    ts.assert_dev_org(SUPER, "cualquier_org")


# ─── assert_inm_owner (eje inmobiliaria) ─────────────────────────────────────
def test_inm_owner_ok():
    ts.assert_inm_owner(DEV_A, "org_a")


def test_inm_owner_other_403():
    with pytest.raises(HTTPException) as e:
        ts.assert_inm_owner(DEV_A, "org_b")
    assert e.value.status_code == 403


def test_inm_owner_superadmin():
    ts.assert_inm_owner(SUPER, "org_a")


# ─── assert_db_project_owner (db-aware · proyectos del wizard) ────────────────
@pytest.mark.asyncio
async def test_db_project_owner(mock_db):
    await mock_db.projects.insert_one({"id": "p1", "dev_org_id": "org_a"})
    await ts.assert_db_project_owner(mock_db, DEV_A, "p1")           # dueño OK
    with pytest.raises(HTTPException) as e403:
        await ts.assert_db_project_owner(mock_db, DEV_B, "p1")       # otra dev → 403
    assert e403.value.status_code == 403
    with pytest.raises(HTTPException) as e404:
        await ts.assert_db_project_owner(mock_db, DEV_A, "no_existe")  # 404
    assert e404.value.status_code == 404
    await ts.assert_db_project_owner(mock_db, SUPER, "p1")          # god-view


# ─── assert_lead_owner (eje lead) ────────────────────────────────────────────
@pytest.mark.asyncio
async def test_lead_owner(mock_db):
    await mock_db.leads.insert_one({"id": "l1", "dev_org_id": "org_a"})
    await ts.assert_lead_owner(mock_db, DEV_A, "l1")                # dueño OK
    with pytest.raises(HTTPException) as e:
        await ts.assert_lead_owner(mock_db, DEV_B, "l1")           # otra cuenta → 403
    assert e.value.status_code == 403


# ─── tenant_filter (Candado 2 · filtro explícito componible) ─────────────────
def test_tenant_filter_superadmin_godview():
    assert ts.tenant_filter(SUPER, "leads") == {}                  # superadmin → sin filtro


def test_tenant_filter_scopes_by_owner_fields():
    f = ts.tenant_filter(DEV_A, "leads")
    assert "$or" in f
    # cada owner-field de leads debe estar, filtrado al tenant/actor del usuario
    fields = {list(c.keys())[0] for c in f["$or"]}
    assert {"dev_org_id", "org_id", "owner_id", "assigned_to"} <= fields
    # los valores son el tenant y el actor
    vals = f["$or"][0][list(f["$or"][0].keys())[0]]["$in"]
    assert "org_a" in vals


@pytest.mark.asyncio
async def test_tenant_filter_composes_in_query(mock_db):
    # compone como filtro real de find(): solo trae los del tenant del usuario
    await mock_db.leads.insert_one({"id": "a", "dev_org_id": "org_a"})
    await mock_db.leads.insert_one({"id": "b", "dev_org_id": "org_b"})
    got = await mock_db.leads.find(ts.tenant_filter(DEV_A, "leads"), {"_id": 0}).to_list(10)
    ids = {d["id"] for d in got}
    assert ids == {"a"}                                            # NO ve el de org_b
