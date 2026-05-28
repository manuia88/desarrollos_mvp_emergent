"""P2.T2 — Unit tests · Closer + close_probability + Analyst + pipeline_drift.

8 tests · cero infra real. DB = mongomock_motor (async, soporta $gte/datetime),
async vía asyncio.run (sin pytest-asyncio). FAIL-OPEN se prueba con db=None.

Ejecutar desde backend/:  pytest tests/test_agent_closer_analyst.py
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone, timedelta

import pytest

pytestmark = pytest.mark.unit


def _now():
    return datetime.now(timezone.utc)


def _mk_db():
    try:
        import mongomock_motor
    except ImportError:  # pragma: no cover
        pytest.skip("mongomock_motor no instalado")
    return mongomock_motor.AsyncMongoMockClient()["dmx_test"]


# ─── close_probability ────────────────────────────────────────────────────────

def test_close_probability_fail_open_no_db():
    from close_probability import close_probability
    res = asyncio.run(close_probability(None, "L-x"))
    assert res["prob"] == 50
    assert res["confidence"] == "BAJA"
    assert isinstance(res["factors"], list)


def test_close_probability_high_signals():
    from close_probability import close_probability

    async def go():
        db = _mk_db()
        await db.asesor_contactos.insert_one(
            {"id": "L1", "owner_id": "OWN1", "emails": ["a@b.com"],
             "temperatura": "caliente", "first_name": "Laura", "last_name": "M"})
        await db.users.insert_one({"email": "a@b.com", "user_id": "U1"})
        await db.buyer_scores.insert_one({"user_id": "U1", "score": 90, "tier": "hot"})
        await db.asesor_busquedas.insert_one(
            {"contacto_id": "L1", "owner_id": "OWN1", "stage": "cerrando", "offers": 1})
        await db.asesor_contacto_timeline.insert_one(
            {"contacto_id": "L1", "owner_id": "OWN1", "ts": _now() - timedelta(days=1)})
        return await close_probability(db, "L1")

    res = asyncio.run(go())
    assert res["prob"] >= 70
    assert res["confidence"] in ("ALTA", "MEDIA", "BAJA")
    factors = {f.get("factor") for f in res["factors"]}
    assert "buyer_score" in factors and "stage" in factors


def test_close_probability_low_signals():
    from close_probability import close_probability

    async def go():
        db = _mk_db()
        await db.asesor_contactos.insert_one(
            {"id": "L2", "owner_id": "OWN1", "temperatura": "frio"})
        await db.asesor_busquedas.insert_one(
            {"contacto_id": "L2", "owner_id": "OWN1", "stage": "perdida"})
        return await close_probability(db, "L2")

    res = asyncio.run(go())
    assert res["prob"] < 50


# ─── closer agent ─────────────────────────────────────────────────────────────

def test_run_closer_returns_actions_shape():
    from agent_workforce.closer import run_closer

    async def go():
        db = _mk_db()
        await db.asesor_contactos.insert_one(
            {"id": "L1", "owner_id": "OWN1", "emails": ["a@b.com"],
             "temperatura": "caliente", "first_name": "Laura", "last_name": "M",
             "created_at": _now()})
        await db.users.insert_one({"email": "a@b.com", "user_id": "U1"})
        await db.buyer_scores.insert_one({"user_id": "U1", "score": 90, "tier": "hot"})
        await db.asesor_busquedas.insert_one(
            {"contacto_id": "L1", "owner_id": "OWN1", "stage": "cerrando", "offers": 1})
        await db.asesor_contacto_timeline.insert_one(
            {"contacto_id": "L1", "owner_id": "OWN1", "ts": _now() - timedelta(days=1)})
        return await run_closer(db, "OWN1", "T1")

    actions = asyncio.run(go())
    assert isinstance(actions, list) and len(actions) == 1
    a = actions[0]
    # Contrato: keys que el orchestrator T1 espera.
    for k in ("type", "lead_id", "title", "subtitle", "priority", "cta_actions", "source_agent"):
        assert k in a
    assert a["source_agent"] == "closer"
    assert a["type"] == "lead_listo_cierre"
    assert a["lead_id"] == "L1"
    assert a["priority"] == 2
    assert "agendar_cierre" in a["cta_actions"]
    assert "%" in a["title"]


def test_run_closer_fail_open():
    from agent_workforce.closer import run_closer
    assert asyncio.run(run_closer(None, "OWN1")) == []


# ─── pipeline_drift_personal ──────────────────────────────────────────────────

def test_pipeline_drift_detects_response_drop():
    from pipeline_drift_personal import compute_pipeline_drift

    async def go():
        db = _mk_db()
        now = _now()
        # 5 leads viejos (20d) tocados en su día → cuentan en baseline 30d, no en 7d.
        for i in range(5):
            await db.asesor_contactos.insert_one(
                {"id": f"old{i}", "owner_id": "OWN1", "created_at": now - timedelta(days=20)})
            await db.asesor_contacto_timeline.insert_one(
                {"contacto_id": f"old{i}", "owner_id": "OWN1", "ts": now - timedelta(days=20)})
        # 5 leads recientes (2d) pero sólo 1 tocado → tasa de respuesta actual baja.
        for i in range(5):
            await db.asesor_contactos.insert_one(
                {"id": f"new{i}", "owner_id": "OWN1", "created_at": now - timedelta(days=2)})
        await db.asesor_contacto_timeline.insert_one(
            {"contacto_id": "new0", "owner_id": "OWN1", "ts": now - timedelta(days=1)})
        return await compute_pipeline_drift(db, "OWN1", "T1")

    d = asyncio.run(go())
    for k in ("response_rate_delta", "conversion_delta", "handoff_delta", "baseline", "current"):
        assert k in d
    assert d["response_rate_delta"] < 0
    assert d["drift"] == 1


def test_pipeline_drift_fail_open():
    from pipeline_drift_personal import compute_pipeline_drift
    d = asyncio.run(compute_pipeline_drift(None, "OWN1", "T1"))
    assert d["drift"] == 0
    assert d["response_rate_delta"] == 0


# ─── analyst agent ────────────────────────────────────────────────────────────

def test_run_analyst_emits_response_drop():
    from agent_workforce.analyst import run_analyst

    async def go():
        db = _mk_db()
        now = _now()
        for i in range(5):
            await db.asesor_contactos.insert_one(
                {"id": f"old{i}", "owner_id": "OWN1", "created_at": now - timedelta(days=20)})
            await db.asesor_contacto_timeline.insert_one(
                {"contacto_id": f"old{i}", "owner_id": "OWN1", "ts": now - timedelta(days=20)})
        for i in range(5):
            await db.asesor_contactos.insert_one(
                {"id": f"new{i}", "owner_id": "OWN1", "created_at": now - timedelta(days=2)})
        await db.asesor_contacto_timeline.insert_one(
            {"contacto_id": "new0", "owner_id": "OWN1", "ts": now - timedelta(days=1)})
        return await run_analyst(db, "OWN1", "T1")

    actions = asyncio.run(go())
    assert isinstance(actions, list) and len(actions) >= 1
    a = next(x for x in actions if x["type"] == "anomalia_tasa_respuesta")
    assert a["source_agent"] == "analyst"
    assert a["priority"] == 3
    assert a["lead_id"] is None
    assert "%" in a["title"]
    for k in ("type", "title", "subtitle", "priority", "cta_actions", "source_agent"):
        assert k in a


def test_run_analyst_fail_open():
    from agent_workforce.analyst import run_analyst
    assert asyncio.run(run_analyst(None, "OWN1")) == []
