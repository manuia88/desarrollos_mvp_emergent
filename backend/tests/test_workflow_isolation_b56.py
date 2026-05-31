"""B5.6 · Regresión de aislamiento de dispatch_event (workflow_engine).

Prueba que un workflow del owner A NUNCA se ejecuta sobre el lead del owner B,
y que sin owner resoluble el dispatch es FAIL-CLOSED (no dispara + auditado).

Antes del fix B5.6: con tenant/owner nulo la query corría sin filtro → disparaba
TODOS los workflows activos de TODOS los dueños (fuga cross-owner).

Ejecutar desde backend/:  pytest tests/test_workflow_isolation_b56.py
"""
from __future__ import annotations

import asyncio

import pytest

import workflow_engine

pytestmark = pytest.mark.unit

_TRIG = [{"type": "trigger", "config": {"trigger_type": "lead.new"}}]


def _seed_and_patch(db, monkeypatch):
    """Reemplaza execute_workflow por un stub (aísla la prueba a la lógica de selección)."""
    async def _fake_exec(db, wf, lead_id=None, context_extra=None, execution_id=None):
        return {"run_id": "run_" + str(wf.get("id")), "skipped": False}
    monkeypatch.setattr(workflow_engine, "execute_workflow", _fake_exec)


def test_dispatch_event_owner_isolation(mock_db, monkeypatch):
    async def run():
        db = mock_db
        _seed_and_patch(db, monkeypatch)
        await db.workflows.insert_many([
            {"id": "wfA", "owner_user_id": "ownerA", "status": "active", "deleted_at": None, "nodes": _TRIG},
            {"id": "wfB", "owner_user_id": "ownerB", "status": "active", "deleted_at": None, "nodes": _TRIG},
        ])
        # el lead del asesor vive en asesor_contactos (owner_id), NO en db.leads
        await db.asesor_contactos.insert_one({"id": "leadA", "owner_id": "ownerA"})

        # T1 · lead del owner A → SOLO dispara el workflow de A
        r1 = await workflow_engine.dispatch_event(db, {"type": "lead.new", "lead_id": "leadA"})
        assert [f["workflow_id"] for f in r1["details"]] == ["wfA"], r1
        assert "wfB" not in [f["workflow_id"] for f in r1["details"]]

        # T2 · lead no resoluble → FAIL-CLOSED + audit forense
        r2 = await workflow_engine.dispatch_event(db, {"type": "lead.new", "lead_id": "nope"})
        assert r2["ok"] is False and r2["error"] == "no_owner_isolation" and r2["fired"] == 0
        assert await db.workflow_audit.count_documents({"reason": "no_owner_isolation"}) >= 1

        # T3 · owner explícito en el evento (sin lead) → aislado a A
        r3 = await workflow_engine.dispatch_event(db, {"type": "lead.new", "owner_user_id": "ownerA"})
        assert [f["workflow_id"] for f in r3["details"]] == ["wfA"], r3

        # T4 · evento sin lead ni owner → FAIL-CLOSED (nunca query sin filtro)
        r4 = await workflow_engine.dispatch_event(db, {"type": "lead.new"})
        assert r4["fired"] == 0 and r4["ok"] is False

    asyncio.run(run())


def test_dispatch_event_owner_mismatch_defense_in_depth(mock_db, monkeypatch):
    """Aunque por error un workflow de otro owner pasara el filtro, el doble-check lo bloquea."""
    async def run():
        db = mock_db
        _seed_and_patch(db, monkeypatch)
        # workflow del owner B
        await db.workflows.insert_one(
            {"id": "wfB", "owner_user_id": "ownerB", "status": "active", "deleted_at": None, "nodes": _TRIG})
        await db.asesor_contactos.insert_one({"id": "leadA", "owner_id": "ownerA"})
        # evento del owner A → NO debe disparar el wf de B (query ya filtra; el resultado es 0)
        r = await workflow_engine.dispatch_event(db, {"type": "lead.new", "lead_id": "leadA"})
        assert r["fired"] == 0, r

    asyncio.run(run())
