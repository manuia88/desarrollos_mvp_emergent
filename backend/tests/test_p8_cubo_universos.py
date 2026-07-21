"""Palanca 8 · el cubo de UN SOLO universo (auditoría 07-20).

Antes: el cubo (dmx_units, átomo) y los cortes (db.units) eran DOS universos que divergían — el átomo
se construía del db.units CRUDO (sin overrides del portal dev) y traía metadata de dev del SEED. Ahora
el átomo es proyección FIEL de unidades_efectivas (db.units + overrides) y el juez verifica que el
átomo REAL == db.units. Estos tests fallan si alguien reintroduce la divergencia.
"""
import mongomock_motor
import pytest

from dmx_cube_feed import (db_unit_to_atom, sync_ingested_to_atom,
                           juez_cubo_universos, podar_atomos_fantasma)


@pytest.fixture()
def db():
    return mongomock_motor.AsyncMongoMockClient()["t"]


DEV = {"id": "d1", "developer_id": "org_A", "colonia_id": "roma-norte", "alcaldia": "Cuauhtémoc"}


# ── db_unit_to_atom: mapea lo que antes quedaba None ─────────────────────────────
def test_atom_mapea_piso_orientacion_y_areas():
    u = {"id": "u1", "development_id": "d1", "price_mxn": 5_000_000, "status": "disponible",
         "level": 7, "orientacion": "norte", "m2_terrace": 12, "m2_roof_garden": 20, "size_m2": 80}
    a = db_unit_to_atom(u, DEV)
    assert a["position"]["piso"] == 7
    assert a["position"]["orientacion"] == "N"          # normalizado vía _ORIENT (antes: None)
    assert a["areas"]["m2_terraza"] == 12 and a["areas"]["m2_roof_garden_privado"] == 20
    assert a["geo"]["colonia_id"] == "roma-norte"       # cae al dev cuando la unidad no lo trae


# ── sync: átomo FIEL (funde overrides del portal dev) ────────────────────────────
@pytest.mark.asyncio
async def test_sync_funde_override_del_portal(db):
    await db.developments.insert_one(DEV)
    await db.units.insert_one({"id": "u1", "development_id": "d1", "developer_id": "org_A",
                               "price_mxn": 5_000_000, "status": "disponible", "size_m2": 80})
    # el dev marcó la unidad VENDIDA en su portal (override), sin re-ingerir
    await db.developer_unit_overrides.insert_one({"unit_id": "u1", "dev_id": "d1", "status": "vendido"})
    await sync_ingested_to_atom(db)
    atom = await db.dmx_units.find_one({"unit_id": "u1"})
    assert atom["commercial"]["status"] == "vendido"    # antes: 'disponible' (el cubo contaba oferta fantasma)


@pytest.mark.asyncio
async def test_sync_materializa_finance(db):
    await db.developments.insert_one(DEV)
    await db.units.insert_one({"id": "u1", "development_id": "d1", "developer_id": "org_A",
                               "price_mxn": 5_000_000, "status": "disponible", "size_m2": 80})
    await sync_ingested_to_atom(db)
    atom = await db.dmx_units.find_one({"unit_id": "u1"})
    assert atom.get("finance", {}).get("mens_80_20") is not None   # dimensión 'financiero' viva


# ── juez de universos: convergencia átomo real ↔ db.units ────────────────────────
@pytest.mark.asyncio
async def test_juez_convergen_cuando_atomo_igual_a_units(db):
    await db.developments.insert_one(DEV)
    await db.units.insert_one({"id": "u1", "development_id": "d1", "developer_id": "org_A",
                               "price_mxn": 5_000_000, "status": "disponible", "size_m2": 80})
    await sync_ingested_to_atom(db)
    j = await juez_cubo_universos(db)
    assert j["convergen"] is True and j["fantasmas"] == 0 and j["faltan_en_atomo"] == 0
    assert j["atomo_real"] == j["db_units_vivas"] == 1


@pytest.mark.asyncio
async def test_juez_detecta_fantasma_y_prune_lo_limpia(db):
    # átomo real cuyo unit_id ya no existe en db.units (re-ingesta le dio id nuevo)
    await db.dmx_units.insert_one({"unit_id": "muerto", "development_id": "d1",
                                   "sources": {"_origin": "bulk_ingest"}})
    j = await juez_cubo_universos(db)
    assert j["fantasmas"] == 1 and j["convergen"] is False
    n = await podar_atomos_fantasma(db)
    assert n == 1
    j2 = await juez_cubo_universos(db)
    assert j2["fantasmas"] == 0


@pytest.mark.asyncio
async def test_juez_no_cuenta_seed_como_fantasma(db):
    # el átomo seed (demo) NO está en db.units pero NUNCA es fantasma ni se poda
    await db.dmx_units.insert_one({"unit_id": "seed1", "development_id": "demo",
                                   "sources": {"_origin": "seed_backfill"}})
    j = await juez_cubo_universos(db)
    assert j["fantasmas"] == 0 and j["atomo_seed"] == 1
    assert await podar_atomos_fantasma(db) == 0          # el seed se respeta


# ── source-level: las rutas quedan trazadas ──────────────────────────────────────
def test_olap_oferta_excluye_seed():
    import os
    src = open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                            "cube_olap_engine.py"), encoding="utf-8").read()
    assert '"sources._origin": {"$ne": "seed_backfill"}' in src, \
        "la oferta del snapshot OLAP debe excluir los átomos seed (demo)"


def test_cube_query_libre_join_a_db_developments():
    import os
    src = open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                            "cube_query_libre.py"), encoding="utf-8").read()
    assert "dev_map" in src and "db.developments.find" in src, \
        "cube_query_libre debe unir metadata de dev contra db.developments (no solo el seed)"
