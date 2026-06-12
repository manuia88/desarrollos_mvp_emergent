"""Tests críticos · aislamiento multi-tenant (tenant_scope.py).

Pieza crítica SIN test detectada en la auditoría B2. tenant_scope es la fuente
ÚNICA de "qué ve cada usuario": si se rompe, hay fuga cross-tenant o IDOR sobre
leads. Estos tests congelan su comportamiento (incl. el fix B1 de assert_lead_owner).

Sin infra: funciones puras directas; las async vía asyncio.run + mongomock.
"""
from __future__ import annotations

import asyncio

import pytest

pytestmark = pytest.mark.unit

from tenant_scope import (  # noqa: E402
    actor_id,
    assert_dev_project,
    assert_lead_owner,
    is_superadmin,
    tenant_of,
    user_dev_ids,
)


def _mock_db():
    try:
        import mongomock_motor
    except ImportError:
        pytest.skip("mongomock_motor no instalado")
    return mongomock_motor.AsyncMongoMockClient()["dmx_test"]


# ─── tenant_of / actor_id / is_superadmin (puros) ─────────────────────────────
def test_tenant_of_prefiere_tenant_id():
    assert tenant_of({"tenant_id": "org_a", "org_id": "org_b"}) == "org_a"


def test_tenant_of_cae_a_org_id_y_luego_default():
    assert tenant_of({"org_id": "org_b"}) == "org_b"
    assert tenant_of({}) == "default"
    assert tenant_of(None) == "default"


def test_actor_id_usa_user_id_no_id():
    # El bug histórico: getattr(user,"id") caía al default. Debe usar user_id.
    assert actor_id({"user_id": "u1", "id": "NO_USAR"}) == "u1"
    assert actor_id({}) is None


def test_is_superadmin():
    assert is_superadmin({"role": "superadmin"}) is True
    assert is_superadmin({"role": "advisor"}) is False


# ─── user_dev_ids: superadmin ve todo · desconocido = fallback ACOTADO ─────────
def test_user_dev_ids_superadmin_ve_todos():
    from data_developments import DEVELOPMENTS

    todos = user_dev_ids({"role": "superadmin"})
    assert len(todos) == len(DEVELOPMENTS)


def test_user_dev_ids_tenant_desconocido_fallback_acotado_nunca_todo():
    from data_developments import DEVELOPMENTS

    ids = user_dev_ids({"role": "advisor", "tenant_id": "tenant_que_no_existe_xyz"})
    # Regla de oro anti-fuga: fallback acotado (≤2), NUNCA "todo".
    assert 0 < len(ids) <= 2
    assert len(ids) < len(DEVELOPMENTS)


# ─── assert_dev_project (puro, usa user_dev_ids) ──────────────────────────────
def test_assert_dev_project_superadmin_pasa_siempre():
    # No debe lanzar.
    assert_dev_project({"role": "superadmin"}, "cualquier_proyecto")


def test_assert_dev_project_ajeno_lanza_403():
    from fastapi import HTTPException

    user = {"role": "advisor", "tenant_id": "tenant_que_no_existe_xyz"}
    ajeno = "proyecto_de_otra_org_999"
    # El proyecto ajeno no está en el fallback acotado del usuario → 403.
    if ajeno in user_dev_ids(user):
        pytest.skip("el proyecto cayó en el fallback demo; caso no aplica")
    with pytest.raises(HTTPException) as exc:
        assert_dev_project(user, ajeno)
    assert exc.value.status_code == 403


# ─── assert_lead_owner: cierra IDOR sobre leads (async + mock_db) ─────────────
def test_assert_lead_owner_superadmin_no_bloquea():
    async def run():
        db = _mock_db()
        # superadmin retorna antes de tocar la DB.
        await assert_lead_owner(db, {"role": "superadmin"}, "lead_inexistente")
    asyncio.run(run())


def test_assert_lead_owner_dueno_pasa():
    async def run():
        db = _mock_db()
        await db.leads.insert_one({"id": "L1", "owner_id": "u_owner", "org_id": "org_a"})
        # mismo tenant → pasa
        await assert_lead_owner(db, {"role": "advisor", "tenant_id": "org_a", "user_id": "x"}, "L1")
        # o mismo actor (owner_id) → pasa
        await assert_lead_owner(db, {"role": "advisor", "tenant_id": "otra", "user_id": "u_owner"}, "L1")
    asyncio.run(run())


def test_assert_lead_owner_ajeno_lanza_403():
    from fastapi import HTTPException

    async def run():
        db = _mock_db()
        await db.leads.insert_one({"id": "L2", "owner_id": "u_owner", "org_id": "org_a"})
        with pytest.raises(HTTPException) as exc:
            await assert_lead_owner(
                db, {"role": "advisor", "tenant_id": "org_INTRUSA", "user_id": "u_intruso"}, "L2")
        assert exc.value.status_code == 403
    asyncio.run(run())


def test_assert_lead_owner_inexistente_lanza_404():
    from fastapi import HTTPException

    async def run():
        db = _mock_db()
        with pytest.raises(HTTPException) as exc:
            await assert_lead_owner(db, {"role": "advisor", "tenant_id": "x", "user_id": "y"}, "NO_EXISTE")
        assert exc.value.status_code == 404
    asyncio.run(run())


def test_assert_lead_owner_legacy_sin_dueno_no_bloquea():
    async def run():
        db = _mock_db()
        # lead demo con campo de dueño presente pero vacío (None) → no bloquear
        # (rama legacy documentada: owners queda vacío tras descartar None → return).
        await db.asesor_contactos.insert_one({"id": "L3", "owner_id": None})
        await assert_lead_owner(db, {"role": "advisor", "tenant_id": "x", "user_id": "y"}, "L3")
    asyncio.run(run())
