"""P4 · Smart Digest · unit tests (6).

Cubre: build_daily_digest (shape) · send_digest prefs gate (opt-in) · dedup 1/día ·
FAIL-OPEN (sin email/phone) · prefs get/set persistencia · cron solo enabled.

Sin infra real: mongomock_motor (fixture mock_db de conftest). Sin LLM/email/WA reales
(stub-aware · los imports de notifications/whatsapp FAIL-OPEN en este entorno mínimo).

Run: python3 -m pytest tests/test_asesor_digest.py -v
"""
from __future__ import annotations

from datetime import datetime, timezone, timedelta

import pytest

import asesor_digest_engine as dig


def _now():
    return datetime.now(timezone.utc)


# ─── 1 · build_daily_digest arma el resumen ──────────────────────────────────
@pytest.mark.unit
@pytest.mark.asyncio
async def test_build_daily_digest_shape(mock_db):
    now = _now()
    await mock_db.asesor_briefings.insert_one({
        "user_id": "a1", "date": now.strftime("%Y-%m-%d"),
        "text": "Buenos días Manuel, tu briefing:\nTienes 3 tareas.\nLeads fríos: 2.",
    })
    # 2 acciones de agente HOY
    await mock_db.command_center_actions.insert_many([
        {"id": "k1", "user_id": "a1", "source_agent": "prospector", "created_at": now},
        {"id": "k2", "user_id": "a1", "source_agent": "nurturer", "created_at": now},
    ])
    d = await dig.build_daily_digest(mock_db, "a1", "tA")
    assert d["user_id"] == "a1"
    assert "briefing" in d["briefing_resumen"].lower()
    assert d["agent_actions_total"] == 2
    assert d["agent_actions_count"].get("prospector") == 1
    assert isinstance(d["top_prioridades"], list)
    assert "citas_hoy" in d


# ─── 2 · prefs gate: disabled → NO envía ─────────────────────────────────────
@pytest.mark.unit
@pytest.mark.asyncio
async def test_send_digest_disabled_skips(mock_db):
    # default opt-in = False → skipped
    res = await dig.send_digest(mock_db, "a1", "tA", force=False)
    assert res["ok"] is True
    assert res["skipped"] is True
    assert res["reason"] == "digest_disabled"


# ─── 3 · prefs get/set persistencia ──────────────────────────────────────────
@pytest.mark.unit
@pytest.mark.asyncio
async def test_digest_prefs_get_set(mock_db):
    before = await dig.get_digest_prefs(mock_db, "a1")
    assert before["asesor_digest_enabled"] is False
    after = await dig.set_digest_prefs(mock_db, "a1", {
        "asesor_digest_enabled": True, "asesor_digest_channels": ["email", "whatsapp", "bogus"]})
    assert after["asesor_digest_enabled"] is True
    # canal inválido filtrado
    assert set(after["asesor_digest_channels"]) == {"email", "whatsapp"}
    # persiste en la MISMA colección notification_preferences
    doc = await mock_db.notification_preferences.find_one({"user_id": "a1"})
    assert doc["asesor_digest_enabled"] is True


# ─── 4 · dedup 1/día (2do envío mismo día → skip salvo force) ─────────────────
@pytest.mark.unit
@pytest.mark.asyncio
async def test_send_digest_dedup_one_per_day(mock_db):
    await dig.set_digest_prefs(mock_db, "a1", {"asesor_digest_enabled": True})
    r1 = await dig.send_digest(mock_db, "a1", "tA", force=False)
    assert r1["skipped"] is False
    r2 = await dig.send_digest(mock_db, "a1", "tA", force=False)
    assert r2["skipped"] is True
    assert r2["reason"] == "already_sent_today"
    # force ignora dedup
    r3 = await dig.send_digest(mock_db, "a1", "tA", force=True)
    assert r3["skipped"] is False


# ─── 5 · FAIL-OPEN sin email/phone (no crash · ok True) ──────────────────────
@pytest.mark.unit
@pytest.mark.asyncio
async def test_send_digest_failopen_no_contact(mock_db):
    # enabled pero sin users/asesor_profiles → no destinatarios · NO crashea
    await dig.set_digest_prefs(mock_db, "a2", {"asesor_digest_enabled": True})
    res = await dig.send_digest(mock_db, "a2", "tA", force=True)
    assert res["ok"] is True
    assert res["skipped"] is False
    assert res["sent_channels"] == []  # nada que enviar, pero sin error


# ─── 6 · cron envía SOLO a asesores enabled ──────────────────────────────────
@pytest.mark.unit
@pytest.mark.asyncio
async def test_cron_only_enabled(mock_db):
    await dig.set_digest_prefs(mock_db, "on1", {"asesor_digest_enabled": True})
    await dig.set_digest_prefs(mock_db, "off1", {"asesor_digest_enabled": False})
    await mock_db.users.insert_one({"user_id": "on1", "email": "on1@x.com", "name": "On Uno"})
    res = await dig.run_cron_all(mock_db)
    assert res["candidates"] == 1          # solo on1 tiene enabled=True
    assert res["sent"] == 1
    # off1 nunca recibió (no en candidates)
    log_off = await mock_db.asesor_digest_sends.find_one({"user_id": "off1"})
    assert log_off is None
