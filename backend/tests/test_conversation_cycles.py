"""W7.AS.3.C · Unit tests cycle-closers (SOC · Workflow · Hook · Enrichment).

8 unit tests · sin DB real · mocks (AsyncMock/MagicMock) + fake engine modules
inyectados en sys.modules para resolver los imports perezosos.

Cubren: shape de retorno · idempotencia · FAIL-OPEN · regex MX phone.

Run: python3 -m pytest tests/test_conversation_cycles.py -v
"""
from __future__ import annotations

import sys
import types
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

import conversation_soc_integration as soc
import conversation_workflow_bridge as wf
import conversation_hook_predictor as hook
import conversation_lead_enrichment as enr


# ─── Fakes: motor db sin infra real ─────────────────────────────────────────

class _Res:
    """Imita pymongo UpdateResult/InsertResult."""
    def __init__(self, upserted_id=None, modified_count=0):
        self.upserted_id = upserted_id
        self.modified_count = modified_count


class _Cursor:
    def __init__(self, items):
        self._items = items

    def limit(self, *_a, **_k):
        return self

    async def to_list(self, *_a, **_k):
        return list(self._items)


class FakeCollection:
    def __init__(self):
        self.update_one = AsyncMock(return_value=_Res(upserted_id="new"))
        self.update_many = AsyncMock(return_value=_Res(modified_count=0))
        self.find_one = AsyncMock(return_value=None)
        self.insert_one = AsyncMock(return_value=_Res(upserted_id="i"))
        self.delete_one = AsyncMock(return_value=_Res())
        self.create_index = AsyncMock(return_value=None)
        self._find_items = []

    def find(self, *_a, **_k):
        return _Cursor(self._find_items)


class FakeDB:
    def __init__(self):
        object.__setattr__(self, "_cols", {})

    def __getattr__(self, name):
        cols = object.__getattribute__(self, "_cols")
        if name not in cols:
            cols[name] = FakeCollection()
        return cols[name]

    def col(self, name) -> FakeCollection:
        return getattr(self, name)


# ─── 1 · SOC signal · shape ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_record_conversation_signal_shape():
    db = FakeDB()
    db.col("conversation_soc_signals").update_one = AsyncMock(return_value=_Res(upserted_id="abc"))
    out = await soc.record_conversation_signal("asesor-1", "response_time_seconds", 42, db)
    assert out["ok"] is True
    assert out["recorded"] is True
    assert out["idempotent"] is False
    assert out["signal_id"].startswith("csoc_")
    assert out["signal_type"] == "response_time_seconds"
    assert out["value"] == 42.0


# ─── 2 · SOC signal · idempotencia + tipo inválido ───────────────────────────

@pytest.mark.asyncio
async def test_record_conversation_signal_idempotent():
    db = FakeDB()
    # 2da invocación: upsert no inserta (upserted_id None) → idempotent
    db.col("conversation_soc_signals").update_one = AsyncMock(return_value=_Res(upserted_id=None))
    out = await soc.record_conversation_signal("asesor-1", "lead_conversion", 1, db)
    assert out["ok"] is True
    assert out["recorded"] is False
    assert out["idempotent"] is True

    # signal_type inválido → shape neutro sin crash
    bad = await soc.record_conversation_signal("asesor-1", "not_a_signal", 1, db)
    assert bad["ok"] is False
    assert bad["reason"] == "invalid_signal_type"


# ─── 3 · SOC signal · FAIL-OPEN ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_record_conversation_signal_failopen():
    db = FakeDB()
    db.col("conversation_soc_signals").update_one = AsyncMock(side_effect=RuntimeError("mongo down"))
    out = await soc.record_conversation_signal("asesor-1", "nps_proxy_sentiment", 0.8, db)
    assert out["ok"] is False
    assert out["recorded"] is False
    assert out["reason"] == "persist_error"
    # nunca crashea · siempre dict
    assert isinstance(out, dict)


# ─── 4 · Workflow trigger · shape + idempotencia + FAIL-OPEN ─────────────────

@pytest.mark.asyncio
async def test_agent_triggers_workflow():
    db = FakeDB()
    db.col("workflows").find_one = AsyncMock(
        return_value={"id": "wf1", "status": "active", "deleted_at": None, "nodes": [], "edges": []}
    )
    db.col("conversation_workflow_pauses").find_one = AsyncMock(return_value=None)

    fake_engine = types.ModuleType("workflow_engine")
    fake_engine.execute_workflow = AsyncMock(return_value={"ok": True, "run_id": "run-1"})
    with patch.dict(sys.modules, {"workflow_engine": fake_engine}):
        out = await wf.agent_triggers_workflow("wf1", "lead-1", db)
        assert out["ok"] is True
        assert out["triggered"] is True
        assert out["run_id"] == "run-1"

        # idempotente: engine reporta skipped
        fake_engine.execute_workflow = AsyncMock(
            return_value={"ok": True, "skipped": "idempotent", "run_id": "run-1"}
        )
        out2 = await wf.agent_triggers_workflow("wf1", "lead-1", db)
        assert out2["triggered"] is False
        assert out2["idempotent"] is True

        # FAIL-OPEN: engine revienta
        fake_engine.execute_workflow = AsyncMock(side_effect=RuntimeError("boom"))
        out3 = await wf.agent_triggers_workflow("wf1", "lead-1", db)
        assert out3["ok"] is False
        assert out3["reason"] == "engine_error"


# ─── 5 · Workflow pause · idempotencia + runs suspendidos ────────────────────

@pytest.mark.asyncio
async def test_agent_pauses_workflow_idempotent():
    db = FakeDB()
    db.col("conversation_workflow_pauses").update_one = AsyncMock(return_value=_Res(upserted_id="p1"))
    db.col("workflow_runs").update_many = AsyncMock(return_value=_Res(modified_count=2))

    out = await wf.agent_pauses_workflow("wf1", "lead-1", "lead pidió pausa", db)
    assert out["ok"] is True
    assert out["paused"] is True
    assert out["idempotent"] is False
    assert out["runs_suspended"] == 2
    assert out["pause_id"].startswith("wfpause_")

    # 2da invocación mismos params → no duplica
    db.col("conversation_workflow_pauses").update_one = AsyncMock(return_value=_Res(upserted_id=None))
    out2 = await wf.agent_pauses_workflow("wf1", "lead-1", "lead pidió pausa", db)
    assert out2["paused"] is False
    assert out2["idempotent"] is True


# ─── 6 · Hook score · gate warning + FAIL-OPEN ───────────────────────────────

@pytest.mark.asyncio
async def test_score_first_message_gate():
    fake_engine = types.ModuleType("hook_predictor_engine")
    # score bajo → gate_warning True (NO bloquea)
    fake_engine.predict_hook_score = AsyncMock(return_value={
        "score": 40, "breakdown": {"clarity": 50, "cta": 30, "novelty": 40, "urgency": 40},
        "suggestion": "Agrega un CTA claro.", "source": "llm",
    })
    with patch.dict(sys.modules, {"hook_predictor_engine": fake_engine}), \
         patch.object(hook, "_get_db", AsyncMock(return_value=None)):
        low = await hook.score_first_message("hola", audience="investor", tenant_id="t1")
        assert low["score"] == 40.0
        assert low["gate_warning"] is True
        assert low["passes_gate"] is False
        assert low["threshold"] == 60

        # score alto → sin warning
        fake_engine.predict_hook_score = AsyncMock(return_value={
            "score": 85, "breakdown": {"clarity": 90, "cta": 80, "novelty": 85, "urgency": 85},
            "source": "llm",
        })
        high = await hook.score_first_message("oferta exclusiva hoy", audience="investor", tenant_id="t1")
        assert high["gate_warning"] is False
        assert high["passes_gate"] is True

        # FAIL-OPEN: engine revienta → shape neutro, no bloquea
        fake_engine.predict_hook_score = AsyncMock(side_effect=RuntimeError("llm down"))
        neutral = await hook.score_first_message("texto", audience=None, tenant_id="t1")
        assert neutral["source"] == "unavailable"
        assert neutral["passes_gate"] is True
        assert neutral["gate_warning"] is False


# ─── 7 · Lead enrichment · detección email/phone + regex MX ──────────────────

@pytest.mark.asyncio
async def test_auto_enrich_on_detect():
    # regex MX phone valida formatos +52 / 55 / lada nacional
    assert enr._detect_phone("llámame al 55 1234 5678") == "+525512345678"
    assert enr._detect_phone("mi cel +52 55 1234 5678") == "+525512345678"
    assert enr._detect_phone("whats +52 1 55 1234 5678") == "+525512345678"
    assert enr._detect_phone("lada 33 3344 5566") == "+523333445566"
    assert enr._detect_phone("oficina 999 123 4567") == "+529991234567"
    assert enr._detect_phone("sin numero util 12") is None
    assert enr._detect_email("escribe a Juan.Perez@Mail.com ok") == "juan.perez@mail.com"

    db = FakeDB()
    db.col("conversation_autoenrich").update_one = AsyncMock(return_value=_Res(upserted_id="m1"))

    fake_engine = types.ModuleType("lead_enrichment_engine")
    fake_engine.enrich_lead = AsyncMock(return_value={"status": "ok", "enriched_fields": {"company": "ACME"}})
    with patch.dict(sys.modules, {"lead_enrichment_engine": fake_engine}):
        out = await enr.auto_enrich_on_detect(
            "contáctame: juan@mail.com o +52 55 1234 5678", "lead-9", "tenant-1", db
        )
        assert out["detected"] is True
        assert out["dispatched"] is True
        assert out["email"] == "juan@mail.com"
        assert out["phone"] == "+525512345678"
        assert out["enrichment"]["status"] == "ok"
        # se invocó el engine 1 sola vez
        fake_engine.enrich_lead.assert_awaited_once()


# ─── 8 · Lead enrichment · idempotencia + sin contacto ───────────────────────

@pytest.mark.asyncio
async def test_auto_enrich_idempotent_and_no_contact():
    db = FakeDB()
    # marker ya existe (upserted_id None) → no re-dispatch
    db.col("conversation_autoenrich").update_one = AsyncMock(return_value=_Res(upserted_id=None))
    fake_engine = types.ModuleType("lead_enrichment_engine")
    fake_engine.enrich_lead = AsyncMock(return_value={"status": "ok"})
    with patch.dict(sys.modules, {"lead_enrichment_engine": fake_engine}):
        again = await enr.auto_enrich_on_detect("correo juan@mail.com", "lead-9", "tenant-1", db)
        assert again["status"] == "skipped"
        assert again["dispatched"] is False
        assert again["idempotent"] is True
        fake_engine.enrich_lead.assert_not_awaited()

    # sin contacto detectable → detected False
    none_out = await enr.auto_enrich_on_detect("hola, ¿cómo estás?", "lead-10", "tenant-1", db)
    assert none_out["detected"] is False
    assert none_out["reason"] == "no_contact_detected"
