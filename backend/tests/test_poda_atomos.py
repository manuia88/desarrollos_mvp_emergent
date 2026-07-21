"""Palanca 1 de la auditoría 07-20: poda de átomos fantasma del cubo. La re-ingesta daba id
nuevo a la unidad y el átomo viejo (dmx_units) quedaba huérfano — 32% del cubo (1,747). La poda
borra los INGERIDOS con unit_id muerto y NUNCA toca los del seed (fallback demo)."""
import mongomock_motor
import pytest

import dmx_cube_feed as cf


@pytest.fixture()
def db():
    return mongomock_motor.AsyncMongoMockClient()["t"]


@pytest.mark.asyncio
async def test_poda_borra_fantasma_ingerido_no_toca_seed_ni_vivo(db):
    await db.units.insert_many([{"id": "u_vivo"}])
    await db.dmx_units.insert_many([
        {"unit_id": "u_vivo", "sources": {"_origin": "bulk_ingest"}},      # vivo → queda
        {"unit_id": "u_muerto", "sources": {"_origin": "bulk_ingest"}},    # fantasma → se va
        {"unit_id": "seed_x", "sources": {"_origin": "seed_backfill"}},    # seed → intocable
    ])
    borrados = await cf.podar_atomos_fantasma(db)
    assert borrados == 1
    quedan = {a["unit_id"] async for a in db.dmx_units.find({})}
    assert quedan == {"u_vivo", "seed_x"}


@pytest.mark.asyncio
async def test_poda_es_idempotente(db):
    await db.units.insert_many([{"id": "u1"}])
    await db.dmx_units.insert_many([
        {"unit_id": "u1", "sources": {"_origin": "bulk_ingest"}},
        {"unit_id": "muerto", "sources": {"_origin": "bulk_ingest"}},
    ])
    assert await cf.podar_atomos_fantasma(db) == 1
    assert await cf.podar_atomos_fantasma(db) == 0        # 2ª corrida no borra nada
