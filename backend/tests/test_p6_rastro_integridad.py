"""Palanca 6 · rastro/integridad (auditoría 07-20). Cubre: writer canónico único (id +
idempotencia por unit_id y por nombre-retro), severity vivo del audit, reversa de eventos en
deshacer_lote, juez de integridad de bitácora + cleaner de unit-huérfanos, retención de auditorías,
y ESTADOS_VALIDOS con 'bloqueado'."""
from datetime import datetime, timedelta, timezone

import mongomock_motor
import pytest

from unit_status_ledger import record_status_event, sanear_eventos
from audit_log import _derive_severity, log_mutation
from dev_lifecycle import juez_integridad_bitacora, podar_bitacora_unit_huerfanos
from auditor_catalogo import podar_auditorias, ESTADOS_VALIDOS


@pytest.fixture()
def db():
    return mongomock_motor.AsyncMongoMockClient()["t"]


DEV = {"id": "d1", "name": "Comunal 50", "developer_id": "org_x", "colonia_id": "roma-norte"}


# ── writer canónico ────────────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_writer_pone_id_propio(db):
    u = {"id": "u1", "unit_number": "A-101", "price": 5_000_000}
    eid = await record_status_event(db, "d1", u, "disponible", "vendido", source="vigia", dev=DEV)
    ev = await db.unit_status_events.find_one({"id": eid})
    assert ev and ev["id"].startswith("use_")        # antes: 465/465 sin id


@pytest.mark.asyncio
async def test_retro_por_nombre_idempotente(db):
    # sin unit_id → ancla por (dev_name, unit_number, changed_at, source)
    pu = {"unit_number": "301", "price": 4_000_000, "status": "disponible"}
    fecha = "2026-05-01"
    a = await record_status_event(db, None, dict(pu), "disponible", "vendido", source="retro_lista",
                                  changed_at=fecha, dev={"name": "Comunal 50", "colonia_id": "roma"})
    b = await record_status_event(db, None, dict(pu), "disponible", "vendido", source="retro_lista",
                                  changed_at=fecha, dev={"name": "Comunal 50", "colonia_id": "roma"})
    assert a and b is None                            # segundo es no-op (no doble venta retro)
    assert await db.unit_status_events.count_documents({}) == 1


@pytest.mark.asyncio
async def test_extra_no_pisa_schema_fijo(db):
    u = {"id": "u9", "unit_number": "B-1"}
    await record_status_event(db, "d1", u, "disponible", "vendido", source="reingesta_ausente",
                              dev=DEV, extra={"nota": "ausente de la lista", "new_status": "HACK"})
    ev = await db.unit_status_events.find_one({"unit_id": "u9"})
    assert ev["nota"] == "ausente de la lista"
    assert ev["new_status"] == "vendido"              # extra no pudo pisar el campo fijo


@pytest.mark.asyncio
async def test_sanear_backfill_id_y_dedup(db):
    # dos 'vendido' del mismo día sin id (simula datos viejos escritos a mano)
    await db.unit_status_events.insert_one({"unit_id": "z", "new_status": "vendido", "changed_at": "2026-07-01T10:00:00"})
    await db.unit_status_events.insert_one({"unit_id": "z", "new_status": "vendido", "changed_at": "2026-07-01T20:00:00"})
    res = await sanear_eventos(db)
    assert res["id_backfilled"] == 2 and res["dedup_borrados"] == 1
    assert await db.unit_status_events.count_documents({"unit_id": "z"}) == 1


# ── severity ───────────────────────────────────────────────────────────────────
def test_severity_delete_sensible_es_critical():
    assert _derive_severity("delete", "user", None, None, []) == "critical"
    assert _derive_severity("delete", "unit", None, None, []) == "high"
    assert _derive_severity("authz_denied", "x", None, None, []) == "critical"


def test_severity_cambio_precio_grande_es_high():
    assert _derive_severity("update", "unit", {"price": 100}, {"price": 200}, ["price"]) == "high"
    assert _derive_severity("update", "unit", {"price": 100}, {"price": 105}, ["price"]) == "info"


@pytest.mark.asyncio
async def test_log_mutation_escribe_severity(db):
    await log_mutation(db, {"user_id": "u", "role": "superadmin"}, "delete", "development", "d1")
    import asyncio; await asyncio.sleep(0.02)          # fire-and-forget
    ev = await db.audit_log.find_one({"action": "delete"})
    assert ev and ev["severity"] == "critical"        # antes: severity nunca se escribía → critical_24h=0


# ── reversa / integridad ────────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_juez_integridad_detecta_unit_huerfano(db):
    await db.units.insert_one({"id": "viva"})
    await db.oferta_timeline.insert_one({"unit_id": "muerta", "dev_id": "d1"})     # unit borrada
    intg = await juez_integridad_bitacora(db)
    ot = next(s for s in intg["stores"] if s["store"] == "oferta_timeline")
    assert ot["unit_huerfano"] == 1 and intg["sano"] is False


@pytest.mark.asyncio
async def test_cleaner_reancla_por_unit_number(db):
    await db.units.insert_one({"id": "nuevo", "development_id": "d1", "unit_number": "101"})
    await db.oferta_timeline.insert_one({"unit_id": "viejo", "development_id": "d1", "unit_number": "101"})
    r = await podar_bitacora_unit_huerfanos(db)
    assert r["reanclados"] == 1 and r["borrados"] == 0
    ev = await db.oferta_timeline.find_one({})
    assert ev["unit_id"] == "nuevo"                    # re-anclado, no borrado (conserva historia)


@pytest.mark.asyncio
async def test_cleaner_borra_peso_muerto_sin_unit_number(db):
    await db.oferta_timeline.insert_one({"unit_id": "fantasma", "dev_id": "d1"})   # sin unit_number
    r = await podar_bitacora_unit_huerfanos(db)
    assert r["borrados"] == 1
    assert await db.oferta_timeline.count_documents({}) == 0


# ── retención + estados ──────────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_podar_auditorias_conserva_n_por_dev(db):
    for i in range(5):
        await db.auditoria_hallazgos.insert_one({"development_id": "d1", "ts": f"2026-07-0{i+1}", "hallazgos": []})
    borrados = await podar_auditorias(db, conservar_por_dev=3)
    assert borrados == 2
    assert await db.auditoria_hallazgos.count_documents({}) == 3


def test_estados_validos_incluye_bloqueado():
    assert "bloqueado" in ESTADOS_VALIDOS and "bloqueada" in ESTADOS_VALIDOS
