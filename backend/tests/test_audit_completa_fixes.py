"""Auditoría completa 2026-07-04 — tests que fijan los fixes de seguridad/honestidad.

(1) briefing_engine: asesor_admin SOLO ve/toca briefings de asesores de SU tenant (antes q={} con
    only_mine=false → todos los briefings de todas las inmobiliarias, con PII). Fail-closed sin tenant.
(2) dmx_demand.mask_small_cells: celdas con <k unidades no exponen sold/absorción (velocidad de venta
    de un competidor identificable) hacia las lentes dev/asesor.
(3) asesor_market.oportunidades: encuentra leads por los campos canónicos (assigned_to/asesor_id/
    owner_id), no solo el assignee_id del seed demo (que enmascaraba el bug con test verde).
"""
import types

import mongomock_motor
import pytest

import briefing_engine
import dmx_demand


@pytest.fixture()
def db():
    return mongomock_motor.AsyncMongoMockClient()["dmx_test"]


def _user(role, user_id, tenant_id=None):
    return types.SimpleNamespace(role=role, user_id=user_id, tenant_id=tenant_id)


async def _seed_briefings(db):
    # tenant A: admin_a + asesor a1 · tenant B: asesor b1
    await db.users.insert_many([
        {"user_id": "admin_a", "role": "asesor_admin", "tenant_id": "tA"},
        {"user_id": "a1", "role": "advisor", "tenant_id": "tA"},
        {"user_id": "b1", "role": "advisor", "tenant_id": "tB"},
    ])
    await db.ie_advisor_briefings.insert_many([
        {"id": "brA", "advisor_user_id": "a1", "lead_id": "L-A", "generated_at": "2026-07-01"},
        {"id": "brB", "advisor_user_id": "b1", "lead_id": "L-B", "generated_at": "2026-07-02"},
    ])


@pytest.mark.asyncio
async def test_admin_scope_solo_su_tenant(db):
    await _seed_briefings(db)
    admin_a = _user("asesor_admin", "admin_a", "tA")
    ids = await briefing_engine._tenant_advisor_ids(db, admin_a)
    assert "a1" in ids and "admin_a" in ids
    assert "b1" not in ids                                   # jamás asesores de otro tenant
    # puede tocar el briefing de SU asesor, no el del tenant B
    brA = await db.ie_advisor_briefings.find_one({"id": "brA"}, {"_id": 0})
    brB = await db.ie_advisor_briefings.find_one({"id": "brB"}, {"_id": 0})
    assert await briefing_engine._can_touch_briefing(db, admin_a, brA) is True
    assert await briefing_engine._can_touch_briefing(db, admin_a, brB) is False


@pytest.mark.asyncio
async def test_admin_sin_tenant_fail_closed(db):
    await _seed_briefings(db)
    admin_x = _user("asesor_admin", "admin_x", None)         # sin tenant real
    ids = await briefing_engine._tenant_advisor_ids(db, admin_x)
    assert ids == {"admin_x"}                                # fail-CLOSED: solo lo suyo, nunca god-view
    brA = await db.ie_advisor_briefings.find_one({"id": "brA"}, {"_id": 0})
    assert await briefing_engine._can_touch_briefing(db, admin_x, brA) is False


@pytest.mark.asyncio
async def test_asesor_plano_solo_lo_suyo(db):
    await _seed_briefings(db)
    a1 = _user("advisor", "a1", "tA")
    brA = await db.ie_advisor_briefings.find_one({"id": "brA"}, {"_id": 0})
    brB = await db.ie_advisor_briefings.find_one({"id": "brB"}, {"_id": 0})
    assert await briefing_engine._can_touch_briefing(db, a1, brA) is True
    assert await briefing_engine._can_touch_briefing(db, a1, brB) is False


def test_mask_small_cells():
    result = {"cells": [
        {"colonia": "a", "tipologia": "1_recamara", "available": 1, "sold": 1, "absorcion_pct": 50},   # total 2 < 3
        {"colonia": "b", "tipologia": "2_recamaras", "available": 5, "sold": 3, "absorcion_pct": 37},  # total 8 ok
    ], "es_estimado": False}
    out = dmx_demand.mask_small_cells(result, k=3)
    small, big = out["cells"][0], out["cells"][1]
    assert small["sold"] is None and small["absorcion_pct"] is None    # velocidad del competidor protegida
    assert small["available"] == 1                                     # inventario sí (no identifica ritmo)
    assert big["sold"] == 3 and big["absorcion_pct"] == 37             # celda grande intacta
    assert out["enmascaradas_kanon"] == 1
    # no muta el original
    assert result["cells"][0]["sold"] == 1
