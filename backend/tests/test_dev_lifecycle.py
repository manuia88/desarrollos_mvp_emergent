"""Reaper de devs (Palanca 1, auditoría 07-20): borrar/re-ingerir un dev debe limpiar en
CASCADA sus eventos/átomos/overrides — no dejar huérfanos que inflen las métricas."""
import mongomock_motor
import pytest

import dev_lifecycle as dl


@pytest.fixture()
def db():
    return mongomock_motor.AsyncMongoMockClient()["t"]


async def _sembrar(db):
    await db.developments.insert_many([{"id": "vivo"}])           # solo 'vivo' existe
    await db.units.insert_many([
        {"id": "u1", "development_id": "vivo"}, {"id": "u2", "development_id": "muerto"}])
    await db.unit_status_events.insert_many([
        {"dev_id": "vivo", "new_status": "vendido"}, {"dev_id": "muerto", "new_status": "vendido"}])
    await db.price_events.insert_many([{"dev_id": "muerto"}])
    await db.developer_unit_overrides.insert_many([{"dev_id": "muerto", "price": 1}])


@pytest.mark.asyncio
async def test_podar_huerfanos_borra_del_dev_muerto_no_del_vivo(db):
    await _sembrar(db)
    res = await dl.podar_eventos_huerfanos(db)
    assert res.get("unit_status_events") == 1 and res.get("price_events") == 1
    assert await db.unit_status_events.count_documents({"dev_id": "vivo"}) == 1   # vivo intacto
    assert await db.unit_status_events.count_documents({"dev_id": "muerto"}) == 0
    assert await db.units.count_documents({}) == 2                                # units NO se tocan


@pytest.mark.asyncio
async def test_purgar_dev_cascada_completa(db):
    await _sembrar(db)
    res = await dl.purgar_dev(db, "vivo")
    assert res.get("units") == 1 and res.get("unit_status_events") == 1
    assert res.get("developments") == 1                                          # borra el doc
    assert await db.developments.count_documents({"id": "vivo"}) == 0


@pytest.mark.asyncio
async def test_purgar_dev_conserva_doc_si_reingesta(db):
    await _sembrar(db)
    res = await dl.purgar_dev(db, "vivo", borrar_dev=False)
    assert "developments" not in res                                             # NO borra el doc
    assert await db.developments.count_documents({"id": "vivo"}) == 1
    assert await db.units.count_documents({"development_id": "vivo"}) == 0        # pero sí sus units
