"""W7.AS.3.I (R3) · Unit tests · Conversation Drift superadmin routes.

4 tests · sin DB real · fake async motor stub (count/find/sort/skip/limit/
to_list/find_one/update_one). Cubre: endpoints callable · compute FAIL-OPEN si
insufficient data · alerts history paginado · ack idempotente · recompute
respeta dedup 1/7d (throttle).
Run: python3 -m pytest tests/test_conversation_drift_routes.py -v
"""
from __future__ import annotations

from datetime import datetime, timezone, timedelta

import pytest

from routes.conversation_drift import (
    compute_drift_payload, alerts_history, ack_alert, recompute_baseline,
    _check_rate, RATE_LIMIT, PAGE_CAP,
)

pytestmark = pytest.mark.unit


# ─── Fake async Mongo stub ──────────────────────────────────────────────────
def _match(doc, filt):
    for k, v in (filt or {}).items():
        dv = doc.get(k)
        if isinstance(v, dict):
            if "$exists" in v and (k in doc) != bool(v["$exists"]):
                return False
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
        self._docs = list(docs)

    def sort(self, key, direction=-1):
        self._docs.sort(key=lambda d: d.get(key) or 0, reverse=(direction < 0))
        return self

    def skip(self, n):
        self._docs = self._docs[n:]
        return self

    def limit(self, n):
        self._docs = self._docs[:n]
        return self

    async def to_list(self, length=None):
        return [dict(d) for d in (self._docs[:length] if length else self._docs)]

    def __aiter__(self):
        self._it = iter(self._docs)
        return self

    async def __anext__(self):
        try:
            return dict(next(self._it))
        except StopIteration:
            raise StopAsyncIteration


class _InsertResult:
    def __init__(self, _id):
        self.inserted_id = _id


class _Collection:
    def __init__(self):
        self.docs = []
        self._seq = 0

    async def insert_one(self, doc):
        d = dict(doc)
        if "_id" not in d:
            self._seq += 1
            d["_id"] = f"auto{self._seq}"
        self.docs.append(d)
        return _InsertResult(d["_id"])

    async def count_documents(self, filt=None):
        return sum(1 for d in self.docs if _match(d, filt or {}))

    def find(self, filt=None, projection=None):
        return _Cursor([d for d in self.docs if _match(d, filt or {})])

    async def find_one(self, filt=None):
        for d in self.docs:
            if _match(d, filt or {}):
                return dict(d)
        return None

    async def update_one(self, filt, update):
        for d in self.docs:
            if _match(d, filt or {}):
                d.update((update or {}).get("$set", {}))
                return
    # detector usa distinct() solo en el cron (no en estos tests)
    async def distinct(self, field):
        return list({d.get(field) for d in self.docs if d.get(field)})


class FakeDB:
    def __init__(self):
        self._c = {}

    def _coll(self, name):
        return self._c.setdefault(name, _Collection())

    def __getattr__(self, name):
        if name.startswith("_"):
            raise AttributeError(name)
        return self._coll(name)

    def __getitem__(self, name):
        return self._coll(name)


def _now():
    return datetime.now(timezone.utc)


# ─── Test 1 · compute FAIL-OPEN con DB vacía (insufficient baseline) ─────────
@pytest.mark.asyncio
async def test_compute_fail_open_insufficient():
    db = FakeDB()
    res = await compute_drift_payload(db, "tenantA")
    # shape correcta: 3 métricas + baseline + current
    assert set(["handoff_rate_delta", "sentiment_delta", "confidence_delta",
                "baseline", "current"]).issubset(res.keys())
    assert res["handoff_rate_delta"] == 0.0
    assert res["sentiment_delta"] == 0.0
    assert res["confidence_delta"] == 0.0
    assert res["drift"] == 0
    assert res["insufficient_baseline"] is True
    assert res["reason"] == "insufficient_baseline"


# ─── Test 2 · alerts history paginado + cap + empty ──────────────────────────
@pytest.mark.asyncio
async def test_alerts_history_pagination():
    db = FakeDB()
    # empty → tabla vacía
    empty = await alerts_history(db, None, days=30, page=1, page_size=100)
    assert empty["total"] == 0 and empty["alerts"] == []

    # seed 5 alerts (3 tenantA + 2 tenantB) dentro de ventana
    base = _now()
    for i in range(5):
        await db.conversation_drift_alerts.insert_one({
            "tenant_id": "tenantA" if i < 3 else "tenantB",
            "alerted_at": base - timedelta(days=i),
            "breached": ["handoff_rate"], "deltas": {"handoff_rate": 0.4},
        })
    # filtro por tenant
    a = await alerts_history(db, "tenantA", days=30, page=1, page_size=100)
    assert a["total"] == 3 and a["count"] == 3
    assert all(x["tenant_id"] == "tenantA" for x in a["alerts"])
    assert a["alerts"][0]["status"] == "pending"  # orden desc por fecha
    # paginación: page_size 2 → 2 items en page 1
    p1 = await alerts_history(db, None, days=30, page=1, page_size=2)
    assert p1["count"] == 2 and p1["total"] == 5 and p1["page_size"] == 2
    # cap respetado: page_size > PAGE_CAP se trunca a PAGE_CAP
    capped = await alerts_history(db, None, days=30, page=1, page_size=9999)
    assert capped["page_size"] == PAGE_CAP


# ─── Test 3 · ack idempotente + audit trail ──────────────────────────────────
@pytest.mark.asyncio
async def test_ack_idempotent():
    db = FakeDB()
    await db.conversation_drift_alerts.insert_one({
        "_id": "alert_1", "tenant_id": "tenantA",
        "alerted_at": _now(), "breached": ["avg_sentiment"],
    })
    # 1er ack → already False
    r1 = await ack_alert(db, "alert_1", user_id="admin@dmx.com")
    assert r1["acknowledged"] is True and r1["already"] is False
    # 2do ack → idempotente, already True
    r2 = await ack_alert(db, "alert_1", user_id="admin@dmx.com")
    assert r2["acknowledged"] is True and r2["already"] is True
    # audit trail escrito UNA vez (solo en la transición)
    audits = [d for d in db.audit_log.docs
              if d.get("action") == "conversation_drift_alert_ack"]
    assert len(audits) == 1
    # alert ahora aparece como ack en history
    hist = await alerts_history(db, "tenantA", days=30, page=1, page_size=100)
    assert hist["alerts"][0]["status"] == "ack"


# ─── Test 4 · recompute respeta dedup 1/7d (throttle) + rate-limit ───────────
@pytest.mark.asyncio
async def test_recompute_respects_throttle():
    db = FakeDB()
    now = _now()
    # baseline (30d) vs current (7d) divergentes → drift=1:
    #   10 threads viejos (15d) NO handoff + 2 recientes (1d) handoff
    for i in range(10):
        await db.conversation_threads.insert_one({
            "_id": f"old{i}", "tenant_id": "tenantA", "status": "active",
            "sentiment": "neutral", "created_at": now - timedelta(days=15)})
    for i in range(2):
        await db.conversation_threads.insert_one({
            "_id": f"new{i}", "tenant_id": "tenantA", "status": "handoff",
            "sentiment": "neutral", "created_at": now - timedelta(days=1)})
    # alert reciente ya disparado (dentro de 7d) → debe throttlear
    await db.conversation_drift_alerts.insert_one({
        "tenant_id": "tenantA", "alerted_at": now - timedelta(days=2),
        "breached": ["handoff_rate"], "deltas": {"handoff_rate": 0.5}})

    res = await recompute_baseline(db, "tenantA")
    assert res["recomputed"] is True
    assert res["drift"] == 1                 # divergencia detectada
    assert res["alerted"] is False           # NO re-alerta
    assert res["throttled"] is True          # dedup 1/7d respetado
    # snapshot de baseline persistido
    assert len(db.conversation_drift_baselines.docs) == 1

    # rate-limit sanity (mismo limiter compartido del módulo)
    key = "sa-drift-unique-key"
    allowed = sum(1 for _ in range(RATE_LIMIT) if _check_rate(key))
    assert allowed == RATE_LIMIT
    assert _check_rate(key) is False
    assert _check_rate("") is True
