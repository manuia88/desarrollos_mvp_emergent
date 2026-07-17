"""Auditoría de flujos 2026-07-17 — tests que fijan los 5 fixes.

FIX 1 · POST /api/cita ya NO crea lead duplicado: mismo correo + mismo desarrollo →
        REUSA el lead existente (nota + último contacto), la cita cuelga de él.
FIX 2 · Estados de unidad: normalizador ÚNICO (ambos géneros y sinónimos) que guarda
        SIEMPRE la forma canónica de la BD (masculina: vendido/reservado/…).
FIX 4 · Primera edición del portal dev: el 'antes' del audit lleva el valor EFECTIVO
        actual (db.units/seed), no None; y en bulk se captura ANTES de escribir.
FIX 5 · El ALTA de contacto del asesor registra en audit_log central (como update/delete)
        y log_mutation avisa con warning cuando falla (fail-open, nunca mudo).

Sin infra real: mongomock_motor (fixture mock_db de conftest) + auth monkeypatched.
Run: python3 -m pytest tests/test_audit3_flujos.py -v
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

pytestmark = pytest.mark.unit


def _req(mock_db):
    """Fake Request mínima: app.state.db + headers/url para los helpers de audit."""
    return SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(db=mock_db)),
                           headers={}, url=None)


async def _drenar_tasks():
    """Deja correr los create_task fire-and-forget (audit persist, conciliadores noop)."""
    for _ in range(3):
        await asyncio.sleep(0)


# ═════════════════════════════════════════════════════════════════════════════
# FIX 2 · normalizador único de estados
# ═════════════════════════════════════════════════════════════════════════════
def test_normalize_unit_status_ambos_generos_y_sinonimos():
    from data_developments import normalize_unit_status as norm
    # siempre la forma canónica de la BD (masculina — db.units.distinct('status'))
    assert norm("vendida") == "vendido"
    assert norm("VENDIDO") == "vendido"
    assert norm("sold") == "vendido"
    assert norm("apartada") == "reservado"
    assert norm("apartado") == "reservado"
    assert norm("reservada") == "reservado"
    assert norm("reserved") == "reservado"
    assert norm("available") == "disponible"
    assert norm(" Disponible ") == "disponible"
    assert norm("bloqueada") == "bloqueado"
    assert norm("bloqueado") == "bloqueado"
    assert norm("renta") == "renta"
    # lo que no reconoce → None (el caller decide el 400)
    assert norm("fantasma") is None
    assert norm("") is None
    assert norm(None) is None


def _stub_conciliadores(monkeypatch):
    """Los motores event-driven del editor no aplican al unit test (noop hermético)."""
    import cotejo_engine
    import market_timeline
    import prototype_engine

    async def _noop(*a, **k):
        return None
    monkeypatch.setattr(prototype_engine, "materializar", _noop)
    monkeypatch.setattr(cotejo_engine, "cotejar_desarrollo", _noop)
    monkeypatch.setattr(market_timeline, "disparar_snapshot_debounced", lambda *a, **k: None)


def _como_superadmin(monkeypatch):
    import routes.inventario as inventario

    async def _fake(request):
        return {"user_id": "sa1", "role": "superadmin", "tenant_id": "dmx"}
    monkeypatch.setattr(inventario, "require_superadmin", _fake)
    return inventario


@pytest.mark.asyncio
async def test_editor_unidad_guarda_forma_canonica(mock_db, monkeypatch):
    """'vendida' (femenino del editor) queda guardada como 'vendido' (canon de la BD)."""
    inventario = _como_superadmin(monkeypatch)
    _stub_conciliadores(monkeypatch)
    await mock_db.units.insert_one({"id": "u1", "development_id": "d1", "status": "disponible"})

    out = await inventario.editar_unidad(_req(mock_db), "u1", inventario.UnidadPatch(status="vendida"))
    await _drenar_tasks()

    assert out["ok"] is True
    doc = await mock_db.units.find_one({"id": "u1"}, {"_id": 0})
    assert doc["status"] == "vendido"                      # nunca 'vendida' en la BD

    # sinónimo en femenino → canon masculino también
    await inventario.editar_unidad(_req(mock_db), "u1", inventario.UnidadPatch(status="apartada"))
    await _drenar_tasks()
    doc = await mock_db.units.find_one({"id": "u1"}, {"_id": 0})
    assert doc["status"] == "reservado"


@pytest.mark.asyncio
async def test_editor_unidad_estado_desconocido_400(mock_db, monkeypatch):
    from fastapi import HTTPException
    inventario = _como_superadmin(monkeypatch)
    _stub_conciliadores(monkeypatch)
    await mock_db.units.insert_one({"id": "u2", "development_id": "d1", "status": "disponible"})
    with pytest.raises(HTTPException) as e:
        await inventario.editar_unidad(_req(mock_db), "u2", inventario.UnidadPatch(status="fantasma"))
    assert e.value.status_code == 400


# ═════════════════════════════════════════════════════════════════════════════
# FIX 4 · primera edición del portal dev: 'antes' = valor EFECTIVO, no None
# ═════════════════════════════════════════════════════════════════════════════
def _como_dev(monkeypatch):
    import routes.developer as developer

    async def _fake(request):
        return SimpleNamespace(user_id="u_dev", role="developer_admin",
                               tenant_id="org_a", name="Dev A")
    monkeypatch.setattr(developer, "require_dev_admin", _fake)
    return developer


async def _seed_dev_real(mock_db):
    # desarrollo REAL en BD (no seed) + su unidad con precio vigente
    await mock_db.developments.insert_one({"id": "d1", "developer_id": "org_a"})
    await mock_db.units.insert_one({"id": "u1", "development_id": "d1",
                                    "status": "disponible", "price_mxn": 2_500_000})


@pytest.mark.asyncio
async def test_primera_edicion_precio_audita_antes_efectivo(mock_db, monkeypatch):
    developer = _como_dev(monkeypatch)
    await _seed_dev_real(mock_db)

    payload = developer.UnitFieldsPatch(dev_id="d1", unit_id="u1", price=2_600_000)
    out = await developer.patch_unit_fields(payload, _req(mock_db))
    await _drenar_tasks()

    assert out["ok"] is True
    audit = await mock_db.developer_audit.find_one({"unit_id": "u1"}, {"_id": 0})
    # el 'antes' es el precio EFECTIVO que veía el público (db.units), NO None
    assert audit["antes"]["price"] == 2_500_000
    assert audit["payload"]["price"] == 2_600_000

    # segunda edición: el 'antes' ahora es el override previo (cadena completa de deltas)
    await developer.patch_unit_fields(
        developer.UnitFieldsPatch(dev_id="d1", unit_id="u1", price=2_700_000), _req(mock_db))
    await _drenar_tasks()
    audits = await mock_db.developer_audit.find({"unit_id": "u1"}, {"_id": 0}).to_list(10)
    assert audits[-1]["antes"]["price"] == 2_600_000


@pytest.mark.asyncio
async def test_primera_edicion_status_audita_antes_efectivo(mock_db, monkeypatch):
    developer = _como_dev(monkeypatch)
    await _seed_dev_real(mock_db)

    payload = developer.UnitStatusPatch(dev_id="d1", unit_id="u1", status="vendido")
    out = await developer.patch_unit_status(payload, _req(mock_db))
    await _drenar_tasks()

    assert out["ok"] is True
    audit = await mock_db.developer_audit.find_one(
        {"unit_id": "u1", "action": "unit_status_change"}, {"_id": 0})
    assert audit["antes"]["status"] == "disponible"        # efectivo de db.units, no None


@pytest.mark.asyncio
async def test_bulk_captura_antes_antes_de_escribir(mock_db, monkeypatch):
    """El bulk leía el 'antes' DESPUÉS del bulk_write (antes==después). Ya no."""
    developer = _como_dev(monkeypatch)
    await _seed_dev_real(mock_db)
    await mock_db.units.insert_one({"id": "u2", "development_id": "d1",
                                    "status": "disponible", "price_mxn": 3_000_000})

    payload = developer.UnitFieldsBulk(dev_id="d1", unit_ids=["u1", "u2"], price=9_999_999)
    out = await developer.patch_unit_fields_bulk(payload, _req(mock_db))
    await _drenar_tasks()

    assert out["ok"] is True
    audits = {a["unit_id"]: a async for a in
              mock_db.developer_audit.find({"bulk": True}, {"_id": 0})}
    assert audits["u1"]["antes"]["price"] == 2_500_000     # efectivo pre-escritura
    assert audits["u2"]["antes"]["price"] == 3_000_000
    for a in audits.values():
        assert a["antes"]["price"] != 9_999_999            # jamás antes==después


# ═════════════════════════════════════════════════════════════════════════════
# FIX 1 · /api/cita reusa el lead del mismo correo en el mismo desarrollo
# ═════════════════════════════════════════════════════════════════════════════
def _stub_cita(monkeypatch):
    import routes.dev_batch4_1 as b41

    async def _sin_auth(request):
        return None

    async def _sin_email(*a, **k):
        return None
    monkeypatch.setattr(b41, "_optional_auth", _sin_auth)
    monkeypatch.setattr(b41, "_send_cita_email", _sin_email)
    return b41


def _payload_cita(b41, email, name="Ana López", project_id="p1"):
    fut = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
    return b41.CitaBody(
        project_id=project_id,
        contact=b41.CitaContactBody(name=name, email=email),
        datetime=fut,
        modalidad="presencial",
        lfpdppp_consent=b41.LfpdpppConsent(accepted=True),
    )


@pytest.mark.asyncio
async def test_cita_reusa_lead_mismo_email_mismo_desarrollo(mock_db, monkeypatch):
    """Lead viejo SIN email_norm (se escapaba del 409 del antifraude) → la nueva cita
    REUSA ese lead: nota + último contacto actualizados, CERO leads duplicados."""
    b41 = _stub_cita(monkeypatch)
    await mock_db.leads.insert_one({
        "id": "lead_old", "project_id": "p1", "status": "nuevo",
        "contact": {"name": "Ana", "email": "Ana@Mail.com"},   # sin email_norm (dato viejo)
        "notes": [], "created_at": "2026-01-01T00:00:00+00:00",
    })

    out = await b41.create_cita(_payload_cita(b41, "ana@mail.com"), _req(mock_db))
    await _drenar_tasks()

    assert out["lead_reused"] is True
    assert out["lead_id"] == "lead_old"                    # cuelga del lead existente
    assert await mock_db.leads.count_documents({"project_id": "p1"}) == 1  # sin duplicado
    lead = await mock_db.leads.find_one({"id": "lead_old"}, {"_id": 0})
    assert lead["contact"]["email_norm"] == "ana@mail.com"  # backfill p/ próximo dedup
    assert lead["last_activity_at"]                         # último contacto refrescado
    assert lead["notes"] and "cita" in lead["notes"][0]["text"].lower()
    apt = await mock_db.appointments.find_one({"lead_id": "lead_old"}, {"_id": 0})
    assert apt and apt["status"] == "agendada"              # la cita SÍ se creó


@pytest.mark.asyncio
async def test_cita_email_nuevo_si_crea_lead(mock_db, monkeypatch):
    """Correo que NO existe en el desarrollo → flujo normal: nace un lead nuevo."""
    b41 = _stub_cita(monkeypatch)
    out = await b41.create_cita(
        _payload_cita(b41, "luis@mail.com", name="Luis Pérez", project_id="p2"), _req(mock_db))
    await _drenar_tasks()

    assert out["lead_reused"] is False
    lead = await mock_db.leads.find_one({"project_id": "p2"}, {"_id": 0})
    assert lead and lead["contact"]["email_norm"] == "luis@mail.com"
    assert await mock_db.appointments.count_documents({"lead_id": lead["id"]}) == 1


# ═════════════════════════════════════════════════════════════════════════════
# FIX 5 · alta de contacto → audit_log central + warning si el audit falla
# ═════════════════════════════════════════════════════════════════════════════
@pytest.mark.asyncio
async def test_alta_contacto_registra_en_audit_central(mock_db, monkeypatch):
    import routes.advisor as advisor

    async def _fake(request):
        return SimpleNamespace(user_id="as1", role="advisor", tenant_id="tA", name="Asesor")
    monkeypatch.setattr(advisor, "require_advisor", _fake)

    payload = advisor.ContactoIn(first_name="Ana", last_name="García",
                                 phones=["55 1234 5678"], emails=["ana@x.com"])
    item = await advisor.create_contacto(payload, _req(mock_db))
    await _drenar_tasks()                                  # el insert del audit es fire-and-forget

    entry = await mock_db.audit_log.find_one(
        {"action": "create", "entity_type": "contacto", "entity_id": item["id"]}, {"_id": 0})
    assert entry is not None                               # el ALTA ya no es invisible
    assert entry["actor"]["user_id"] == "as1"


@pytest.mark.asyncio
async def test_log_mutation_avisa_con_warning_si_falla(caplog):
    """Fail-open sí, mudo NO: si el insert del audit truena, queda un warning."""
    from audit_log import log_mutation

    class _BoomCol:
        async def insert_one(self, doc):
            raise RuntimeError("mongo caído")
    db = SimpleNamespace(audit_log=_BoomCol())
    with caplog.at_level(logging.WARNING, logger="dmx.audit"):
        await log_mutation(db, {"user_id": "u1", "role": "advisor", "tenant_id": "t"},
                           "create", "contacto", "c1")
        await _drenar_tasks()                              # deja correr el _persist
    assert any("persist failed" in r.message or "log_mutation failed" in r.message
               for r in caplog.records)
