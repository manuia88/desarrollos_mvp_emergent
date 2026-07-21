"""Juez de scores/índices (Palanca 5, auditoría 07-20): mide cuánto es REAL vs relleno
sintético y caza valores fuera de rango. Antes nadie lo sabía (DRPI 99.8% synthetic)."""
import mongomock_motor
import pytest

import juez_metricas as jm


@pytest.fixture()
def db():
    return mongomock_motor.AsyncMongoMockClient()["t"]


@pytest.mark.asyncio
async def test_mide_real_vs_relleno(db):
    await db.drpi_snapshots.insert_many(
        [{"index_value": 100, "synthetic": True} for _ in range(9)] +
        [{"index_value": 105}])                         # 1 real de 10
    r = await jm.juez_metricas(db)
    fam = next(f for f in r["familias"] if f["familia"] == "drpi")
    assert fam["real"] == 1 and fam["relleno"] == 9 and fam["pct_real"] == 10
    assert fam["estado"] == "relleno" and r["sano"] is False


@pytest.mark.asyncio
async def test_caza_fuera_de_rango(db):
    await db.ie_scores.insert_many([{"value": 50}, {"value": 900}])   # 900 > 100 = implausible
    r = await jm.juez_metricas(db)
    fam = next(f for f in r["familias"] if f["familia"] == "ie_scores")
    assert fam["fuera_de_rango"] == 1 and fam["estado"] == "fuera_de_rango"


@pytest.mark.asyncio
async def test_limpia_centinelas(db):
    await db.drpi_snapshots.insert_many([
        {"zone_id": "___NOPE___", "index_value": 1}, {"zone_id": "test_zone", "index_value": 1},
        {"zone_id": "roma-norte", "index_value": 100}])
    r = await jm.limpiar_centinelas(db)
    assert r["drpi_snapshots"] == 2
    assert await db.drpi_snapshots.count_documents({}) == 1        # solo la real queda
