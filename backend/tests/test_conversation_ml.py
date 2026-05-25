"""W7.AS.3.E (R2) — Unit tests (dummy · cero infra · sin DB real).

12 tests = 4 módulos ML × 3:
  - conversation_self_tuning   (insufficient_data · register_cron · imports)
  - conversation_drift_detector (FAIL-OPEN drift:0 · alert shape · register_cron)
  - conversation_ab_testing     (create_test · assign 50/50 · pick_winner)
  - conversation_confidence_score (FAIL-OPEN fallback · shape · no handoff)

Tests async via asyncio.run (sin pytest-asyncio). DB y scheduler son fakes
mínimos en memoria — sin Mongo ni APScheduler reales.
Ejecutar desde backend/:  pytest tests/test_conversation_ml.py
"""
from __future__ import annotations

import asyncio

import pytest

pytestmark = pytest.mark.unit


# ─── Fakes mínimos en memoria ────────────────────────────────────────────────

class _FakeCursor:
    def __init__(self, docs):
        self._docs = list(docs)

    def __aiter__(self):
        async def gen():
            for d in self._docs:
                yield d
        return gen()

    async def to_list(self, *_a, **_k):
        return list(self._docs)


class _FakeCollection:
    def __init__(self, docs=None):
        self.docs = list(docs or [])

    async def count_documents(self, query):
        return sum(1 for d in self.docs if _match(d, query))

    def find(self, query=None, projection=None):
        return _FakeCursor([d for d in self.docs if _match(d, query or {})])

    async def find_one(self, query, projection=None):
        for d in self.docs:
            if _match(d, query):
                return d
        return None

    async def insert_one(self, doc):
        self.docs.append(dict(doc))
        return type("R", (), {"inserted_id": doc.get("_id")})()

    async def update_one(self, query, update):
        for d in self.docs:
            if _match(d, query):
                for k, v in (update.get("$set") or {}).items():
                    d[k] = v
                for k, v in (update.get("$inc") or {}).items():
                    d[k] = _nested_inc(d, k, v)
                return type("R", (), {"modified_count": 1})()
        return type("R", (), {"modified_count": 0})()

    async def distinct(self, field):
        return list({d.get(field) for d in self.docs if d.get(field) is not None})


def _match(doc, query):
    """Soporta igualdad simple (ignora operadores tipo $gte → siempre pasa)."""
    for k, v in (query or {}).items():
        if isinstance(v, dict):
            continue  # operadores ($gte/$exists/...) → no filtramos en el fake
        if doc.get(k) != v:
            return False
    return True


def _nested_inc(doc, dotted, amount):
    # No usado por los tests (placeholder simple)
    return (doc.get(dotted) or 0) + amount


class _FakeDB:
    def __init__(self):
        self._cols = {}

    def __getattr__(self, name):
        # crea colecciones on-demand
        cols = self.__dict__.setdefault("_cols", {})
        if name not in cols:
            cols[name] = _FakeCollection()
        return cols[name]


class _FakeScheduler:
    def __init__(self):
        self.jobs = []

    def add_job(self, func, trigger=None, **kwargs):
        self.jobs.append({"func": func, "trigger": trigger, "kwargs": kwargs})


# ─── 1-3 · conversation_self_tuning ──────────────────────────────────────────

def test_self_tuning_imports():
    from conversation_self_tuning import analyze_tenant, register_cron
    assert callable(analyze_tenant) and callable(register_cron)


def test_self_tuning_insufficient_data():
    from conversation_self_tuning import analyze_tenant
    db = _FakeDB()
    # 0 conversaciones para el tenant → insufficient_data
    res = asyncio.run(analyze_tenant(db, "tenant-x"))
    assert res["skipped"] == "insufficient_data"
    assert res["count"] == 0


def test_self_tuning_register_cron():
    from conversation_self_tuning import register_cron
    sched = _FakeScheduler()
    register_cron(sched)            # callable con solo scheduler · no raise
    register_cron(sched, _FakeDB())  # y con db
    assert len(sched.jobs) == 2
    j = sched.jobs[0]
    assert j["trigger"] == "cron"
    assert j["kwargs"]["max_instances"] == 1
    assert j["kwargs"]["day_of_week"] == "sun"
    assert (j["kwargs"]["hour"], j["kwargs"]["minute"]) == (4, 30)


# ─── 4-6 · conversation_drift_detector ───────────────────────────────────────

def test_drift_fail_open_returns_zero():
    from conversation_drift_detector import compute_drift
    # db=None → el engine subyacente falla → {drift: 0}
    res = asyncio.run(compute_drift(None, "tenant-x"))
    assert res["drift"] == 0


def test_drift_alert_shape_no_drift():
    from conversation_drift_detector import alert_if_drift
    res = asyncio.run(alert_if_drift(None, "tenant-x"))
    assert res["alerted"] is False
    assert res["drift"] == 0
    assert res["tenant_id"] == "tenant-x"


def test_drift_register_cron():
    from conversation_drift_detector import register_cron
    sched = _FakeScheduler()
    register_cron(sched)
    assert len(sched.jobs) == 1
    j = sched.jobs[0]
    assert j["trigger"] == "cron"
    assert j["kwargs"]["max_instances"] == 1
    assert (j["kwargs"]["hour"], j["kwargs"]["minute"]) == (4, 45)


# ─── 7-9 · conversation_ab_testing ───────────────────────────────────────────

def test_ab_create_test_shape():
    from conversation_ab_testing import create_test
    db = _FakeDB()
    res = asyncio.run(create_test(db, "Tono directo vs cálido", "PROMPT_A", "PROMPT_B"))
    assert res["test_id"].startswith("abtest_")
    assert res["status"] == "running"
    assert set(res["variants"].keys()) == {"A", "B"}
    assert res["variants"]["A"]["prompt"] == "PROMPT_A"


def test_ab_assign_deterministic_5050():
    from conversation_ab_testing import assign
    # idempotente: misma (test,user) → misma variante
    a1 = assign("t1", "user-123")
    a2 = assign("t1", "user-123")
    assert a1 == a2 and a1 in ("A", "B")
    # reparte ambas variantes sobre muchos usuarios
    variants = {assign("t1", f"u{i}") for i in range(50)}
    assert variants == {"A", "B"}


def test_ab_pick_winner_manual_and_auto():
    from conversation_ab_testing import create_test, pick_winner, get_results
    db = _FakeDB()
    created = asyncio.run(create_test(db, "exp", "A", "B"))
    tid = created["test_id"]
    # auto sin datos → sin ganador (insuficiente n / no significativo)
    auto = asyncio.run(pick_winner(db, tid))
    assert auto["winner"] is None and auto["mode"] == "auto"
    # manual → fija ganador
    manual = asyncio.run(pick_winner(db, tid, variant="B"))
    assert manual["winner"] == "B" and manual["mode"] == "manual"
    # results refleja shape de chi²
    results = asyncio.run(get_results(db, tid))
    assert "statistical_significance" in results
    assert results["winner"] == "B"


# ─── 10-12 · conversation_confidence_score ───────────────────────────────────

def test_confidence_fail_open_fallback():
    import os
    from conversation_confidence_score import score_reply
    # Sin EMERGENT_LLM_KEY en el entorno de test → fallback seguro
    old = os.environ.pop("EMERGENT_LLM_KEY", None)
    try:
        res = asyncio.run(score_reply("¿cuánto cuesta?", "Cuesta 5M.", {}))
    finally:
        if old is not None:
            os.environ["EMERGENT_LLM_KEY"] = old
    assert res["confidence"] == 70
    assert res["fallback"] is True


def test_confidence_shape_keys():
    import os
    from conversation_confidence_score import score_reply
    old = os.environ.pop("EMERGENT_LLM_KEY", None)
    try:
        res = asyncio.run(score_reply("hola", "hola, ¿en qué te ayudo?", None))
    finally:
        if old is not None:
            os.environ["EMERGENT_LLM_KEY"] = old
    assert set(res.keys()) == {"confidence", "reason", "fallback", "handoff"}
    assert isinstance(res["confidence"], int)


def test_confidence_fallback_no_handoff():
    import os
    from conversation_confidence_score import score_reply, HANDOFF_THRESHOLD
    old = os.environ.pop("EMERGENT_LLM_KEY", None)
    try:
        res = asyncio.run(score_reply("x", "y", {}))
    finally:
        if old is not None:
            os.environ["EMERGENT_LLM_KEY"] = old
    # fallback (70) NO debe disparar handoff (evita falsa alarma)
    assert res["confidence"] >= HANDOFF_THRESHOLD
    assert res["handoff"] is False
