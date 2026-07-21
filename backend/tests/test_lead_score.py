"""UN score de lead (Palanca 4, auditoría 07-20): reconcilia los marcadores dispersos en UN
campo canónico leads.score. Antes: 59/59 con score=None."""
import mongomock_motor
import pytest

import lead_score as ls


@pytest.fixture()
def db():
    return mongomock_motor.AsyncMongoMockClient()["t"]


@pytest.mark.asyncio
async def test_score_desde_termometro(db):
    await db.leads.insert_one({"id": "L1", "visitor_id": "v1"})
    await db.lead_temperaturas.insert_one({"visitor_id": "v1", "temperatura": "68.8", "banda": "caliente"})
    s = await ls.reconciliar_lead_score(db, {"id": "L1", "visitor_id": "v1"})
    assert s == 69
    lead = await db.leads.find_one({"id": "L1"})
    assert lead["score_banda"] == "caliente" and lead["score_fuente"] == "termometro"


@pytest.mark.asyncio
async def test_score_desde_actividad_si_no_hay_termometro(db):
    await db.leads.insert_one({"id": "L2", "visitor_id": "v2"})
    await db.buyer_signals.insert_many([{"visitor_id": "v2"} for _ in range(6)])
    s = await ls.reconciliar_lead_score(db, {"id": "L2", "visitor_id": "v2"})
    assert s == 50 and (await db.leads.find_one({"id": "L2"}))["score_fuente"] == "actividad"


@pytest.mark.asyncio
async def test_sin_visitor_score_none(db):
    await db.leads.insert_one({"id": "L3"})
    assert await ls.reconciliar_lead_score(db, {"id": "L3"}) is None
    assert (await db.leads.find_one({"id": "L3"}))["score"] is None       # honesto, no inventa


@pytest.mark.asyncio
async def test_batch(db):
    await db.leads.insert_many([{"id": "L1", "visitor_id": "v1"}, {"id": "L2"}])
    await db.lead_temperaturas.insert_one({"visitor_id": "v1", "temperatura": 90, "banda": "hirviendo"})
    r = await ls.reconciliar_todos(db)
    assert r == {"leads": 2, "con_score": 1}
