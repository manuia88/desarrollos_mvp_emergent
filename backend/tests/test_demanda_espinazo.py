"""Espinazo de demanda (Palanca 4, auditoría 07-20): marca env=demo/real + atribuye dev_id.
La demanda estaba contaminada con tráfico seed/sintético (roma-norte-85) y sin atribuir."""
import mongomock_motor
import pytest

import demanda_espinazo as de


@pytest.fixture()
def db():
    return mongomock_motor.AsyncMongoMockClient()["t"]


def test_detecta_visitor_de_prueba():
    assert de.es_visitor_prueba("vis_e2e_flow") is True
    assert de.es_visitor_prueba("v_test_123") is True
    assert de.es_visitor_prueba("v_0d329c714a08") is False


@pytest.mark.asyncio
async def test_marca_demo_y_atribuye_dev_real(db):
    await db.developments.insert_one({"id": "dev_real"})
    await db.buyer_signals.insert_many([
        {"entity_id": "dev_real", "visitor_id": "v_ok"},        # real → env real + dev_id
        {"entity_id": "roma-norte-85", "visitor_id": "v_x"},    # seed slug → demo
        {"entity_id": "dev_real", "visitor_id": "vis_e2e_x"},   # visitor de prueba → demo
    ])
    r = await de.marcar_env(db)
    assert r["buyer_signals"]["dev_id_atribuido"] >= 1
    real = await db.buyer_signals.find_one({"entity_id": "dev_real", "visitor_id": "v_ok"})
    assert real["env"] == "real" and real["dev_id"] == "dev_real"
    demo = await db.buyer_signals.find_one({"entity_id": "roma-norte-85"})
    assert demo["env"] == "demo"
    assert (await db.buyer_signals.find_one({"visitor_id": "vis_e2e_x"}))["env"] == "demo"


@pytest.mark.asyncio
async def test_resolver_dev(db):
    await db.developments.insert_one({"id": "dev_1", "slug": "torre-alfa"})
    assert await de.resolver_dev(db, "dev_1") == "dev_1"
    assert await de.resolver_dev(db, "torre-alfa") == "dev_1"    # por slug
    assert await de.resolver_dev(db, "no-existe") is None
