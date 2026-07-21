"""Consolidación multi-torre (founder 07-21): un proyecto ingerido como N fichas (una por torre) se
junta en UNA ficha con torres[] + units.tower, moviendo eventos/overrides/átomos/assets al canónico."""
import mongomock_motor
import pytest

from consolidar_torres import consolidar_proyecto, tower_label


@pytest.fixture()
def db():
    return mongomock_motor.AsyncMongoMockClient()["t"]


def test_tower_label_prefijo_y_nombre():
    assert tower_label("A-405", "X", "d") == "A"                 # prefijo del número
    assert tower_label("405", "Jilotepec (Torre D)", "d") == "D"  # del nombre
    assert tower_label("405", "X", "dev_qc_jilo_torre_e_y_f") == "E-F"
    assert tower_label("405", "Río Churubusco II", "d") == "II"
    assert tower_label("405", "Avenida Industria 3", "d") == "3"


@pytest.mark.asyncio
async def test_consolida_mueve_todo_y_etiqueta_torre(db):
    await db.developments.insert_many([
        {"id": "can", "name": "Jilotepec"},          # canónico (units con prefijo A/B)
        {"id": "src_d", "name": "Jilotepec (Torre D)"},
    ])
    await db.units.insert_many([
        {"id": "u1", "development_id": "can", "unit_number": "A-101"},
        {"id": "u2", "development_id": "can", "unit_number": "B-202"},
        {"id": "u3", "development_id": "src_d", "unit_number": "405"},
    ])
    # eventos/overrides/assets de la fuente
    await db.unit_status_events.insert_one({"dev_id": "src_d", "new_status": "vendido"})
    await db.developer_unit_overrides.insert_one({"dev_id": "src_d", "unit_id": "u3", "price": 9})
    await db.dev_assets.insert_one({"development_id": "src_d", "asset_type": "plano_nivel", "nivel": 4})

    r = await consolidar_proyecto(db, "can", ["can", "src_d"])
    assert r["ok"] and set(r["torres"]) == {"A", "B", "D"}
    assert r["total_units"] == 3 and r["units_movidas"] == 1
    # u3 movido al canónico con tower D
    u3 = await db.units.find_one({"id": "u3"})
    assert u3["development_id"] == "can" and u3["tower"] == "D"
    # eventos/overrides/assets re-apuntados
    assert await db.unit_status_events.count_documents({"dev_id": "can"}) == 1
    assert await db.developer_unit_overrides.count_documents({"dev_id": "can"}) == 1
    assert await db.dev_assets.count_documents({"development_id": "can"}) == 1
    # ficha fuente borrada (vacía) + torres[] en el canónico
    assert "src_d" in r["fichas_borradas"]
    assert await db.developments.find_one({"id": "src_d"}) is None
    can = await db.developments.find_one({"id": "can"})
    assert set(can["torres"]) == {"A", "B", "D"} and can["total_units"] == 3


@pytest.mark.asyncio
async def test_idempotente_segunda_corrida_no_rompe(db):
    await db.developments.insert_one({"id": "can", "name": "X Torre A"})
    await db.units.insert_one({"id": "u1", "development_id": "can", "unit_number": "101"})
    r1 = await consolidar_proyecto(db, "can", ["can"])
    r2 = await consolidar_proyecto(db, "can", ["can"])
    assert r1["total_units"] == r2["total_units"] == 1
    u = await db.units.find_one({"id": "u1"})
    assert u["tower"] == "A"     # del nombre 'X Torre A'
