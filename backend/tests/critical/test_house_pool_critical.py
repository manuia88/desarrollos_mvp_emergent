"""Tests críticos · reparto del pool de la casa (house_pool_engine.py).

Pieza crítica SIN test detectada en la auditoría B2 y corazón del fix B1-02 (lead
de marketplace sin asesor → pool dmx_root, NUNCA a otra inmobiliaria). Congela:
- solo asesores de la casa (rol válido + tenant dmx_root/None) entran al reparto,
- orden zona→carga→cierres,
- None cuando aún no hay asesores de la casa,
- assign_house_lead marca owner_org = dmx_root.

Async vía asyncio.run + mongomock.
"""
from __future__ import annotations

import asyncio

import pytest

pytestmark = pytest.mark.unit

from house_pool_engine import (  # noqa: E402
    DMX_HOUSE_ORG,
    assign_house_lead,
    house_asesores,
    pick_house_asesor,
)


def _mock_db():
    try:
        import mongomock_motor
    except ImportError:
        pytest.skip("mongomock_motor no instalado")
    return mongomock_motor.AsyncMongoMockClient()["dmx_test"]


def test_pool_vacio_devuelve_none():
    async def run():
        db = _mock_db()
        assert await pick_house_asesor(db, zone="Polanco") is None
    asyncio.run(run())


def test_solo_asesores_de_la_casa_entran():
    async def run():
        db = _mock_db()
        await db.users.insert_many([
            {"user_id": "casa1", "role": "advisor", "tenant_id": "dmx_root"},
            {"user_id": "casa2", "role": "asesor_admin", "tenant_id": None},
            {"user_id": "ajeno", "role": "advisor", "tenant_id": "otra_inmobiliaria"},
            {"user_id": "dev", "role": "developer_admin", "tenant_id": "dmx_root"},
        ])
        casa = {u["user_id"] for u in await house_asesores(db)}
        assert casa == {"casa1", "casa2"}  # ni 'ajeno' (otro tenant) ni 'dev' (rol no-asesor)
    asyncio.run(run())


def test_prefiere_asesor_que_cubre_la_zona():
    async def run():
        db = _mock_db()
        await db.users.insert_many([
            {"user_id": "cubre", "role": "advisor", "tenant_id": "dmx_root"},
            {"user_id": "nocubre", "role": "advisor", "tenant_id": "dmx_root"},
        ])
        # 'cubre' tiene Polanco en su perfil; ambos con carga 0
        await db.asesor_profiles.insert_one({"user_id": "cubre", "colonias": ["Polanco"]})
        elegido = await pick_house_asesor(db, zone="Polanco")
        assert elegido == "cubre"
    asyncio.run(run())


def test_entre_los_que_cubren_gana_el_menos_cargado():
    async def run():
        db = _mock_db()
        await db.users.insert_many([
            {"user_id": "cargado", "role": "advisor", "tenant_id": "dmx_root"},
            {"user_id": "libre", "role": "advisor", "tenant_id": "dmx_root"},
        ])
        await db.asesor_profiles.insert_many([
            {"user_id": "cargado", "colonias": ["Roma"]},
            {"user_id": "libre", "colonias": ["Roma"]},
        ])
        # 'cargado' ya tiene 2 leads abiertos del pool
        await db.visit_requests.insert_many([
            {"id": "v1", "assigned_asesor_id": "cargado", "status": "assigned"},
            {"id": "v2", "assigned_asesor_id": "cargado", "status": "accepted"},
        ])
        elegido = await pick_house_asesor(db, zone="Roma")
        assert elegido == "libre"
    asyncio.run(run())


def test_assign_house_lead_marca_owner_org_dmx_root():
    async def run():
        db = _mock_db()
        await db.users.insert_one({"user_id": "casa1", "role": "advisor", "tenant_id": "dmx_root"})
        await db.visit_requests.insert_one({"id": "vr1", "property_id": "p1", "status": "requested"})
        await assign_house_lead(db, "vr1")
        vr = await db.visit_requests.find_one({"id": "vr1"})
        assert vr.get("owner_org") == DMX_HOUSE_ORG == "dmx_root"
    asyncio.run(run())
