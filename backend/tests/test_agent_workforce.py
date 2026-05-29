"""P2 · Agent Workforce · unit tests (8).

Cubre: build_action shape/dedup_key · prospector · nurturer · orchestrator UPSERT
idempotente por dedup_key (no duplica al re-correr) · cap per-agente · FAIL-OPEN con
T2/T3 ausente · status=pending NO resucita acciones dismissed al re-correr.

Sin infra real: mongomock_motor (fixture mock_db de conftest). Sin LLM.

Run: python3 -m pytest tests/test_agent_workforce.py -v
"""
from __future__ import annotations

from datetime import datetime, timezone, timedelta

import pytest

from agent_workforce.agent_common import build_action, AGENT_DAILY_CAP_PER_TENANT
from agent_workforce.prospector import run_prospector
from agent_workforce.nurturer import run_nurturer
from agent_workforce import orchestrator


def _now():
    return datetime.now(timezone.utc)


# ─── 1 · build_action shape + dedup_key determinista ─────────────────────────
@pytest.mark.unit
def test_build_action_shape_and_dedup_key():
    a = build_action("prospector", "calificar_lead", "lead123", "Califica a Ana",
                     subtitle="tibio", priority=2, cta_actions=["ver_lead"], expires_hours=72)
    assert a["dedup_key"] == "prospector:calificar_lead:lead123"
    assert a["id"] == a["dedup_key"]              # id estable = dedup_key
    assert a["source_agent"] == "prospector"
    assert a["lead_id"] == "lead123"
    assert a["priority"] == 2
    assert a["cta_actions"] == ["ver_lead"]
    assert isinstance(a["expires_at"], datetime)
    assert a["expires_at"] > _now()
    # lead_id None → placeholder "_" (no rompe dedup_key)
    b = build_action("nurturer", "x", None, "t")
    assert b["dedup_key"] == "nurturer:x:_"


# ─── 2 · Prospector emite acciones de calificación ───────────────────────────
@pytest.mark.unit
@pytest.mark.asyncio
async def test_prospector_returns_actions(mock_db):
    now = _now()
    await mock_db.asesor_contactos.insert_one({
        "id": "c1", "owner_id": "asesor1", "first_name": "Ana", "last_name": "López",
        "emails": ["ana@x.com"], "created_at": now,
    })
    # Cuenta + buyer_score hot → tier visible (sin compute / sin LLM)
    await mock_db.users.insert_one({"user_id": "u_ana", "email": "ana@x.com"})
    await mock_db.buyer_scores.insert_one({"user_id": "u_ana", "tier": "hot"})

    actions = await run_prospector(mock_db, "asesor1", "tenantA")
    assert len(actions) == 1
    act = actions[0]
    assert act["source_agent"] == "prospector"
    assert act["type"] == "calificar_lead"
    assert act["lead_id"] == "c1"
    assert "Ana" in act["title"]
    assert act["priority"] == 1            # hot → urgente
    assert act["dedup_key"] == "prospector:calificar_lead:c1"


# ─── 3 · Nurturer reactiva leads en silencio Xd ──────────────────────────────
@pytest.mark.unit
@pytest.mark.asyncio
async def test_nurturer_returns_actions(mock_db):
    now = _now()
    await mock_db.asesor_contactos.insert_one({
        "id": "c2", "owner_id": "asesor1", "first_name": "Beto", "last_name": "Ruiz",
        "emails": ["beto@x.com"], "created_at": (now - timedelta(days=40)),
    })
    # Último contacto hace 10 días (> NO_CONTACT_DAYS=5)
    await mock_db.asesor_contacto_timeline.insert_one({
        "contacto_id": "c2", "ts": (now - timedelta(days=10)).isoformat(),
    })
    actions = await run_nurturer(mock_db, "asesor1", "tenantA")
    assert len(actions) == 1
    act = actions[0]
    assert act["source_agent"] == "nurturer"
    assert act["type"] == "reactivar_lead"
    assert act["lead_id"] == "c2"
    assert "Beto" in act["title"]
    assert "plantilla" in act["subtitle"].lower()
    # Lead reciente CON contacto fresco NO se reactiva
    await mock_db.asesor_contactos.insert_one({
        "id": "c3", "owner_id": "asesor1", "first_name": "Cyn", "emails": ["cyn@x.com"],
        "created_at": now,
    })
    await mock_db.asesor_contacto_timeline.insert_one({
        "contacto_id": "c3", "ts": now.isoformat(),
    })
    actions2 = await run_nurturer(mock_db, "asesor1", "tenantA")
    assert {a["lead_id"] for a in actions2} == {"c2"}   # c3 fresco excluido


# ─── 4 · Orchestrator UPSERT por dedup_key NO duplica al re-correr ────────────
@pytest.mark.unit
@pytest.mark.asyncio
async def test_orchestrator_upsert_no_duplicate_on_rerun(mock_db):
    now = _now()
    await mock_db.asesor_contactos.insert_one({
        "id": "c1", "owner_id": "asesor1", "first_name": "Ana", "emails": ["ana@x.com"],
        "created_at": now,
    })
    await mock_db.users.insert_one({"user_id": "u_ana", "email": "ana@x.com"})
    await mock_db.buyer_scores.insert_one({"user_id": "u_ana", "tier": "warm"})

    r1 = await orchestrator.run_all_agents(mock_db, "asesor1", "tenantA", trigger="on-demand")
    n1 = await mock_db.command_center_actions.count_documents({"user_id": "asesor1"})
    assert r1["ok"] is True
    assert n1 >= 1
    # Re-correr: mismas acciones → UPSERT, NO nuevos documentos
    await orchestrator.run_all_agents(mock_db, "asesor1", "tenantA", trigger="on-demand")
    n2 = await mock_db.command_center_actions.count_documents({"user_id": "asesor1"})
    assert n2 == n1
    # source_agent presente → badge "🤖 {agente}" en Command Center
    doc = await mock_db.command_center_actions.find_one({"user_id": "asesor1"})
    assert doc["source_agent"] in ("prospector", "nurturer")
    assert doc["status"] == "pending"


# ─── 5 · Cap per-agente ──────────────────────────────────────────────────────
@pytest.mark.unit
@pytest.mark.asyncio
async def test_orchestrator_cap_per_agent(mock_db, monkeypatch):
    now = _now()
    docs = [{
        "id": f"c{i}", "owner_id": "asesor1", "first_name": f"L{i}",
        "emails": [f"l{i}@x.com"], "created_at": now,
    } for i in range(AGENT_DAILY_CAP_PER_TENANT + 10)]
    await mock_db.asesor_contactos.insert_many(docs)

    res = await orchestrator.run_all_agents(mock_db, "asesor1", "tenantA")
    # Prospector cap-eado al límite (los contactos sin cuenta → tier None, igual emiten)
    assert res["by_agent"].get("prospector", 0) <= AGENT_DAILY_CAP_PER_TENANT
    assert "prospector" in res.get("capped_agents", [])


# ─── 6 · FAIL-OPEN cuando un agente falla al importar ────────────────────────
# Post-merge P2: los 5 agentes existen (closer/analyst/coach mergeados). El test
# original validaba el escenario paralelo (T2/T3 ausentes). Ahora validamos el
# FAIL-OPEN REAL: si un agente NO puede importarse, el orchestrator lo skip-ea
# sin tumbar el run · los demás corren.
@pytest.mark.unit
@pytest.mark.asyncio
async def test_orchestrator_failopen_agent_import_fails(mock_db, monkeypatch):
    import importlib as _il
    _orig = _il.import_module

    def _fail_closer(name, *a, **k):
        if name.endswith("closer"):
            raise ImportError("simulated closer import failure")
        return _orig(name, *a, **k)

    monkeypatch.setattr("agent_workforce.orchestrator.importlib.import_module", _fail_closer)
    res = await orchestrator.run_all_agents(mock_db, "asesorX", "tenantA")
    assert res["ok"] is True
    # closer skip-eado por fallo de import · los otros 4 corrieron
    assert "closer" in res["skipped_agents"]
    assert "prospector" in res["by_agent"]
    assert "nurturer" in res["by_agent"]


# ─── 6b · Post-merge · los 5 agentes presentes corren (ninguno skip) ─────────
@pytest.mark.unit
@pytest.mark.asyncio
async def test_orchestrator_all_5_agents_present(mock_db):
    # Tras merge P2 (T1+T2+T3) los 5 agentes existen → ninguno skipeado por ausencia
    res = await orchestrator.run_all_agents(mock_db, "asesorX", "tenantA")
    assert res["ok"] is True
    assert res["skipped_agents"] == []
    for ag in ("prospector", "nurturer", "closer", "analyst", "coach"):
        assert ag in res["by_agent"]


# ─── 7 · Run summary persistido en agent_workforce_runs ──────────────────────
@pytest.mark.unit
@pytest.mark.asyncio
async def test_orchestrator_persists_run_summary(mock_db):
    await orchestrator.run_all_agents(mock_db, "asesor1", "tenantA", trigger="cron")
    runs = await mock_db.agent_workforce_runs.find({"user_id": "asesor1"}).to_list(10)
    assert len(runs) == 1
    assert runs[0]["trigger"] == "cron"
    assert "by_agent" in runs[0]
    assert isinstance(runs[0]["ran_at"], datetime)


# ─── 8 · Re-correr NO resucita acciones dismissed ────────────────────────────
@pytest.mark.unit
@pytest.mark.asyncio
async def test_rerun_does_not_resurrect_dismissed(mock_db):
    now = _now()
    await mock_db.asesor_contactos.insert_one({
        "id": "c1", "owner_id": "asesor1", "first_name": "Ana", "emails": ["ana@x.com"],
        "created_at": now,
    })
    await orchestrator.run_all_agents(mock_db, "asesor1", "tenantA")
    # El asesor descarta la acción
    await mock_db.command_center_actions.update_many(
        {"user_id": "asesor1"}, {"$set": {"status": "dismissed"}})
    # Re-correr: status sigue dismissed (status solo en $setOnInsert)
    await orchestrator.run_all_agents(mock_db, "asesor1", "tenantA")
    doc = await mock_db.command_center_actions.find_one({"user_id": "asesor1"})
    assert doc["status"] == "dismissed"
    pendientes = await mock_db.command_center_actions.count_documents(
        {"user_id": "asesor1", "status": "pending"})
    assert pendientes == 0
