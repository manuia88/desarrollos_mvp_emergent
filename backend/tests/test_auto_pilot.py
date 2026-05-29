"""P5.A · Auto-pilot · unit tests (8) · ÉNFASIS GUARDRAILS.

Cubre: whitelist · NUNCA money/irreversible · confidence gate · opt-in por tipo ·
kill switch · cap diario · audit/log · FAIL-OPEN rollback (queda pending).

Sin infra real: mongomock_motor (fixture mock_db). whatsapp/audit imports FAIL-OPEN
en este entorno mínimo (los executors capturan). recordatorio NO requiere infra externa
→ se usa como acción auto-ejecutable feliz.

Run: python3 -m pytest tests/test_auto_pilot.py -v
"""
from __future__ import annotations

from datetime import datetime, timezone

import pytest

import auto_pilot_engine as ap


def _now():
    return datetime.now(timezone.utc)


async def _enable(db, user_id, types=None, paused=False):
    """Habilita el piloto para un asesor (opt-in)."""
    await ap.set_autopilot_config(db, user_id, {
        "paused": paused,
        "types": types or {"followup_whatsapp": True, "recordatorio": True, "reasignar_etapa": True},
    })


async def _action(db, user_id, **over):
    """Inserta una acción pending en command_center_actions."""
    doc = {
        "id": over.get("id", "act1"), "user_id": user_id, "status": "pending",
        "type": "recordatorio", "title": "Recordar llamar", "subtitle": "",
        "lead_id": "lead1", "confidence": 90, "priority": 2,
    }
    doc.update(over)
    await db.command_center_actions.insert_one(doc)
    return doc


# ─── 1 · opt-in feliz: recordatorio whitelisted + confidence alto → auto_done ─
@pytest.mark.unit
@pytest.mark.asyncio
async def test_executes_whitelisted_optin(mock_db):
    await _enable(mock_db, "a1")
    await _action(mock_db, "a1", id="r1", type="recordatorio", confidence=85)
    res = await ap.run_autopilot(mock_db, "a1", "tA")
    assert res["executed"] == 1
    doc = await mock_db.command_center_actions.find_one({"id": "r1"})
    assert doc["status"] == "auto_done"
    # tarea creada (executor recordatorio)
    assert await mock_db.asesor_tareas.count_documents({"owner_id": "a1"}) == 1


# ─── 2 · WHITELIST: tipo fuera de whitelist → NO ejecuta (solo sugiere) ───────
@pytest.mark.unit
@pytest.mark.asyncio
async def test_non_whitelisted_not_executed(mock_db):
    await _enable(mock_db, "a1")
    await _action(mock_db, "a1", id="x1", type="calificar_lead", confidence=99)
    res = await ap.run_autopilot(mock_db, "a1", "tA")
    assert res["executed"] == 0
    assert res["reasons"].get("not_whitelisted") == 1
    doc = await mock_db.command_center_actions.find_one({"id": "x1"})
    assert doc["status"] == "pending"  # intacta


# ─── 3 · NUNCA money/irreversible (defensa en profundidad) ───────────────────
@pytest.mark.unit
@pytest.mark.asyncio
async def test_never_auto_money(mock_db):
    await _enable(mock_db, "a1")
    # type whitelisted PERO title contiene "comisión"/"contrato" → denylist
    await _action(mock_db, "a1", id="m1", type="recordatorio",
                  title="Cobrar comisión del cierre", confidence=99)
    await _action(mock_db, "a1", id="m2", type="recordatorio",
                  title="Firmar contrato", subtitle="pago final", confidence=99)
    res = await ap.run_autopilot(mock_db, "a1", "tA")
    assert res["executed"] == 0
    assert res["reasons"].get("never_auto_denylist") == 2
    assert (await mock_db.command_center_actions.find_one({"id": "m1"}))["status"] == "pending"


# ─── 4 · confidence gate (< min → skip) ──────────────────────────────────────
@pytest.mark.unit
@pytest.mark.asyncio
async def test_confidence_gate(mock_db):
    await _enable(mock_db, "a1")
    await _action(mock_db, "a1", id="c1", type="recordatorio", confidence=50)   # < 70 → skip
    await _action(mock_db, "a1", id="c2", type="recordatorio", confidence=None)  # sin valor → 0 → skip
    res = await ap.run_autopilot(mock_db, "a1", "tA")
    assert res["executed"] == 0
    assert res["reasons"].get("low_confidence") == 2
    assert (await mock_db.command_center_actions.find_one({"id": "c1"}))["status"] == "pending"


# ─── 5 · opt-in por tipo: tipo OFF → no ejecuta ──────────────────────────────
@pytest.mark.unit
@pytest.mark.asyncio
async def test_type_opt_out(mock_db):
    await _enable(mock_db, "a1", types={"recordatorio": False, "followup_whatsapp": False, "reasignar_etapa": False})
    await _action(mock_db, "a1", id="o1", type="recordatorio", confidence=95)
    res = await ap.run_autopilot(mock_db, "a1", "tA")
    assert res["executed"] == 0
    assert res["reasons"].get("type_opt_out") == 1


# ─── 6 · kill switch global → 0 ejecuciones ──────────────────────────────────
@pytest.mark.unit
@pytest.mark.asyncio
async def test_kill_switch(mock_db):
    await _enable(mock_db, "a1", paused=True)
    await _action(mock_db, "a1", id="k1", type="recordatorio", confidence=99)
    res = await ap.run_autopilot(mock_db, "a1", "tA")
    assert res.get("paused") is True
    assert res["executed"] == 0
    assert (await mock_db.command_center_actions.find_one({"id": "k1"}))["status"] == "pending"


# ─── 7 · cap diario → no excede AUTOPILOT_DAILY_CAP ──────────────────────────
@pytest.mark.unit
@pytest.mark.asyncio
async def test_daily_cap(mock_db, monkeypatch):
    monkeypatch.setattr(ap, "AUTOPILOT_DAILY_CAP", 2)
    await _enable(mock_db, "a1")
    for i in range(5):
        await _action(mock_db, "a1", id=f"cap{i}", type="recordatorio", confidence=90, lead_id=f"l{i}")
    res = await ap.run_autopilot(mock_db, "a1", "tA")
    assert res["executed"] == 2  # cap respetado
    done = await mock_db.command_center_actions.count_documents({"user_id": "a1", "status": "auto_done"})
    assert done == 2


# ─── 8 · FAIL-OPEN: ejecución falla → queda pending + log failed (NO auto_done) ─
@pytest.mark.unit
@pytest.mark.asyncio
async def test_failopen_rollback(mock_db):
    await _enable(mock_db, "a1")
    # followup_whatsapp sin phone → executor falla → rollback
    await _action(mock_db, "a1", id="f1", type="followup_whatsapp",
                  subtitle="Hola, seguimiento", confidence=95, lead_id="ghost")
    res = await ap.run_autopilot(mock_db, "a1", "tA")
    assert res["executed"] == 0
    assert res["failed"] == 1
    doc = await mock_db.command_center_actions.find_one({"id": "f1"})
    assert doc["status"] == "pending"  # NO se marcó auto_done
    # log registró el fallo
    fail_log = await mock_db.autopilot_log.find_one({"action_id": "f1", "status": "failed"})
    assert fail_log is not None
