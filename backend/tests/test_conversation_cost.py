"""W7.AS.3.F · Unit tests · Conversation Cost Optimizer + Stats Engine + rate-limit.

6 unit tests · sin DB real · fake async motor stub (find/to_list con $in/$gte).
Run: python3 -m pytest tests/test_conversation_cost.py -v
"""
from __future__ import annotations

from datetime import datetime, timezone, timedelta

import pytest

from conversation_cost_optimizer import (
    select_model, model_tier, HAIKU_MODEL, SONNET_MODEL, OPUS_MODEL,
)
from conversation_cost_stats_engine import (
    get_tenant_cost, get_top_expensive, get_model_distribution, get_stats_summary,
)
from routes.conversation_cost import _check_rate, RATE_LIMIT

pytestmark = pytest.mark.unit


# ─── Fake async Mongo stub ──────────────────────────────────────────────────
def _match(doc, filt):
    for k, v in (filt or {}).items():
        dv = doc.get(k)
        if isinstance(v, dict):
            if "$in" in v and dv not in v["$in"]:
                return False
            if "$gte" in v and not (dv is not None and dv >= v["$gte"]):
                return False
            if "$lte" in v and not (dv is not None and dv <= v["$lte"]):
                return False
        elif dv != v:
            return False
    return True


class _Cursor:
    def __init__(self, docs):
        self._docs = docs

    async def to_list(self, length=None):
        return [dict(d) for d in (self._docs[:length] if length else self._docs)]


class _Collection:
    def __init__(self):
        self.docs = []

    async def insert_one(self, doc):
        self.docs.append(dict(doc))

    def find(self, filt=None, projection=None):
        return _Cursor([d for d in self.docs if _match(d, filt or {})])


class FakeDB:
    def __init__(self):
        self._c = {}

    def __getattr__(self, name):
        if name.startswith("_"):
            raise AttributeError(name)
        return self._c.setdefault(name, _Collection())


class _BoomCollection:
    def find(self, *a, **k):
        raise RuntimeError("boom")


class BoomDB:
    def __getattr__(self, name):
        if name.startswith("_"):
            raise AttributeError(name)
        return _BoomCollection()


def _now():
    return datetime.now(timezone.utc)


async def _seed_events(db):
    now = _now()
    old = now - timedelta(days=400)
    # tenant A · 3 conversation calls (haiku, sonnet, sonnet)
    await db.ai_call_events.insert_one({"dev_org_id": "A", "feature_key": "conversation_engine",
                                        "model": HAIKU_MODEL, "cost_usd": 0.001, "cost_mxn": 0.02, "ts": now})
    await db.ai_call_events.insert_one({"dev_org_id": "A", "feature_key": "conversation_engine",
                                        "model": SONNET_MODEL, "cost_usd": 0.010, "cost_mxn": 0.20, "ts": now})
    await db.ai_call_events.insert_one({"dev_org_id": "A", "feature_key": "conversation_message",
                                        "model": SONNET_MODEL, "cost_usd": 0.020, "cost_mxn": 0.40, "ts": now})
    # tenant B · 1 opus call
    await db.ai_call_events.insert_one({"dev_org_id": "B", "feature_key": "conversation_engine",
                                        "model": OPUS_MODEL, "cost_usd": 0.100, "cost_mxn": 2.00, "ts": now})
    # noise: non-conversation feature + an OLD event (must be excluded)
    await db.ai_call_events.insert_one({"dev_org_id": "A", "feature_key": "asistente_chat",
                                        "model": SONNET_MODEL, "cost_usd": 9.99, "cost_mxn": 199.0, "ts": now})
    await db.ai_call_events.insert_one({"dev_org_id": "A", "feature_key": "conversation_engine",
                                        "model": SONNET_MODEL, "cost_usd": 5.55, "cost_mxn": 111.0, "ts": old})


async def _seed_conversations(db):
    now = _now()
    await db.conversation_threads.insert_one({"_id": "c1", "asesor_id": "ase1", "tenant_id": "A",
                                              "lead_id": "l1", "status": "active", "sentiment": "neutral"})
    await db.conversation_threads.insert_one({"_id": "c2", "asesor_id": "ase2", "tenant_id": "A",
                                              "lead_id": "l2", "status": "handoff", "sentiment": "negative"})
    # c2 is the more expensive (more tokens)
    await db.conversation_messages.insert_one({"conversation_id": "c1", "tokens_in": 100, "tokens_out": 50, "created_at": now})
    await db.conversation_messages.insert_one({"conversation_id": "c2", "tokens_in": 5000, "tokens_out": 4000, "created_at": now})
    await db.conversation_messages.insert_one({"conversation_id": "c2", "tokens_in": 2000, "tokens_out": 1000, "created_at": now})


# ─── Test 1 · select_model base tiers ───────────────────────────────────────
def test_select_model_basic_tiers():
    # classification → Haiku
    assert select_model("detecta el email del lead", 0, "classification") == HAIKU_MODEL
    # escalation review → Opus
    assert select_model("analiza este handoff", 5, "escalation_review") == OPUS_MODEL
    # substantial conversation (default) → Sonnet
    txt = "Me interesa un departamento de 3 recámaras en Polanco con presupuesto de 10 millones"
    assert select_model(txt, 3, "conversation") == SONNET_MODEL
    assert model_tier(HAIKU_MODEL) == "haiku"
    assert model_tier(OPUS_MODEL) == "opus"


# ─── Test 2 · heuristics (upgrade + downgrade) ──────────────────────────────
def test_select_model_heuristics():
    # short simple greeting → downgrade to Haiku
    assert select_model("Hola", 1, "conversation") == HAIKU_MODEL
    assert select_model("Buenas tardes!", 0, "conversation") == HAIKU_MODEL
    # long history + negative sentiment → upgrade to Opus (lead en riesgo)
    assert select_model("Esto es un pésimo servicio, estoy muy molesto", 25, "conversation") == OPUS_MODEL
    # negative but short history stays Sonnet (no upgrade)
    assert select_model("Esto es un pésimo servicio", 3, "conversation") == SONNET_MODEL


# ─── Test 3 · FAIL-OPEN ──────────────────────────────────────────────────────
def test_select_model_fail_open():
    # bad text type forces exception path → Sonnet
    assert select_model(12345, 2, "conversation") == SONNET_MODEL
    # None intent defaults to conversation tier (Sonnet) with substantial-ish text
    assert select_model("quiero ver opciones de inversión en renta", 4, None) == SONNET_MODEL
    # weird history type handled gracefully
    assert select_model("hola que tal, busco casa", "bad", "conversation") in (SONNET_MODEL, HAIKU_MODEL)


# ─── Test 4 · get_tenant_cost aggregates (reuses ai_call_events) ────────────
@pytest.mark.asyncio
async def test_get_tenant_cost_aggregates():
    db = FakeDB()
    await _seed_events(db)
    res = await get_tenant_cost(db, "A", days=30)
    # only conversation_* feature keys within window: 0.001 + 0.010 + 0.020 = 0.031
    assert res["calls"] == 3
    assert abs(res["cost_usd"] - 0.031) < 1e-6
    # tenant B isolated
    resB = await get_tenant_cost(db, "B", days=30)
    assert resB["calls"] == 1 and abs(resB["cost_usd"] - 0.1) < 1e-6


# ─── Test 5 · top-expensive + model-distribution ────────────────────────────
@pytest.mark.asyncio
async def test_top_expensive_and_distribution():
    db = FakeDB()
    await _seed_events(db)
    await _seed_conversations(db)

    top = await get_top_expensive(db, days=30, limit=10)
    assert len(top) == 2
    assert top[0]["conversation_id"] == "c2"   # most tokens → most expensive
    assert top[0]["cost_usd"] >= top[1]["cost_usd"]
    assert top[0]["asesor_id"] == "ase2"

    dist = await get_model_distribution(db, days=30)
    assert dist["total_calls"] == 4  # 3×A + 1×B conversation calls (old + asistente excluded)
    tiers = {d["tier"]: d for d in dist["distribution"]}
    assert tiers["haiku"]["calls"] == 1
    assert tiers["sonnet"]["calls"] == 2
    assert tiers["opus"]["calls"] == 1
    assert abs(sum(d["pct"] for d in dist["distribution"]) - 100.0) < 0.5


# ─── Test 6 · rate-limit cap + stats FAIL-OPEN ──────────────────────────────
@pytest.mark.asyncio
async def test_rate_limit_cap_and_fail_open():
    key = "sa-test-unique-key"
    allowed = sum(1 for _ in range(RATE_LIMIT) if _check_rate(key))
    assert allowed == RATE_LIMIT          # first 30 pass
    assert _check_rate(key) is False      # 31st blocked
    assert _check_rate("") is True        # empty key → fail-open (no limit)

    # stats engine FAIL-OPEN: db that raises on every op → safe zero shape
    summary = await get_stats_summary(BoomDB(), days=30)
    assert summary.get("error") is True
    assert summary["total_cost_usd"] == 0.0
    dist = await get_model_distribution(BoomDB(), days=30)
    assert dist["total_calls"] == 0 and dist.get("error") is True
