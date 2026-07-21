"""Ledger de estatus (Palanca 2, auditoría 07-20): el vigía ahora alimenta unit_status_events
con org/colonia, días-para-vender desde listed_at (no created_at) e idempotencia."""
from datetime import datetime, timedelta, timezone

import mongomock_motor
import pytest

from unit_status_ledger import record_status_event


@pytest.fixture()
def db():
    return mongomock_motor.AsyncMongoMockClient()["t"]


DEV = {"id": "d1", "developer_id": "org_x", "colonia_id": "roma-norte", "alcaldia": "Cuauhtémoc"}


@pytest.mark.asyncio
async def test_escribe_con_org_y_colonia(db):
    u = {"id": "u1", "unit_number": "A-101", "price": 5_000_000}
    eid = await record_status_event(db, "d1", u, "disponible", "reservado",
                                    source="vigia_lista", dev=DEV)
    assert eid
    ev = await db.unit_status_events.find_one({"unit_id": "u1"})
    assert ev["org_id"] == "org_x" and ev["colonia_id"] == "roma-norte"      # antes: solo dev_id
    assert ev["new_status"] == "reservado" and ev["source"] == "vigia_lista"


@pytest.mark.asyncio
async def test_idempotente_mismo_estado_mismo_dia(db):
    u = {"id": "u1", "unit_number": "A-101"}
    assert await record_status_event(db, "d1", u, "disponible", "vendido", source="s", dev=DEV)
    assert await record_status_event(db, "d1", u, "disponible", "vendido", source="s", dev=DEV) is None
    assert await db.unit_status_events.count_documents({"unit_id": "u1"}) == 1  # no dobles


@pytest.mark.asyncio
async def test_dias_para_vender_desde_listed_at(db):
    hace30 = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    u = {"id": "u1", "unit_number": "A-101", "listed_at": hace30,
         "created_at": datetime.now(timezone.utc).isoformat()}   # ingerida HOY pero listada hace 30
    await record_status_event(db, "d1", u, "disponible", "vendido", source="s", dev=DEV)
    ev = await db.unit_status_events.find_one({"unit_id": "u1"})
    assert ev["days_to_sell"] == 30 and ev["days_from"] == "listed_at"       # NO 0 días
    assert ev["sold_at"]


@pytest.mark.asyncio
async def test_noop_si_no_cambia(db):
    assert await record_status_event(db, "d1", {"id": "u1"}, "vendido", "vendido",
                                     source="s", dev=DEV) is None
