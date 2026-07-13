"""Alertas de la bitácora: si el mercado SE MOVIÓ (bajas, ventas, retiros, resurrecciones),
el founder recibe la campana por el canal existente — idempotente por día."""
import pytest


class _Cursor:
    def __init__(self, docs):
        self._docs = list(docs)

    def limit(self, n):
        self._docs = self._docs[:n]
        return self

    def __aiter__(self):
        self._it = iter(self._docs)
        return self

    async def __anext__(self):
        try:
            return next(self._it)
        except StopIteration:
            raise StopAsyncIteration


class _Col:
    def __init__(self):
        self.docs = {}
        self._auto = 0

    async def update_one(self, key, update, upsert=False):
        k = tuple(sorted((kk, str(vv)) for kk, vv in key.items()))
        self.docs[k] = {**self.docs.get(k, {}), **update.get("$set", {})}

    async def insert_one(self, doc):
        self._auto += 1
        self.docs[("_auto", self._auto)] = dict(doc)

    async def find_one(self, q=None):
        q = q or {}
        simple = {k: v for k, v in q.items() if not isinstance(v, dict)}
        for d in self.docs.values():
            if all(d.get(kk) == vv for kk, vv in simple.items()):
                return dict(d)
        return None

    async def create_index(self, *a, **k):
        return None

    def find(self, q=None, proj=None):
        q = q or {}
        simple = {k: v for k, v in q.items() if not isinstance(v, dict)}
        return _Cursor(d for d in self.docs.values() if all(d.get(kk) == vv for kk, vv in simple.items()))


class _DB:
    def __init__(self):
        self._c = {}

    def __getattr__(self, n):
        return self._c.setdefault(n, _Col())


@pytest.mark.asyncio
async def test_alerta_transiciones_notifica_y_es_idempotente(monkeypatch):
    import notifications_engine
    from vistas_guardadas import revisar_transiciones
    db = _DB()
    # bitácora: una unidad baja de precio HOY (ts de hoy → entra en la ventana desde ayer)
    from datetime import datetime, timezone, timedelta
    hoy = datetime.now(timezone.utc)
    ayer = hoy - timedelta(days=1)
    for ts, precio in ((ayer, 5000000), (hoy, 4500000)):
        await db.oferta_timeline.insert_one({
            "unit_id": "u1", "colonia": "condesa", "ts": ts.isoformat(), "hash": f"h{precio}",
            "precio": precio, "disponible": True, "vector": {}, "crudos": {}})
    await db.users.insert_one({"role": "superadmin", "user_id": "founder"})

    enviadas = []
    async def _fake_emit(db_, **kw):
        enviadas.append(kw)
    monkeypatch.setattr(notifications_engine, "emit_notification", _fake_emit)

    r1 = await revisar_transiciones(db)
    assert r1["movimientos"] >= 1
    assert len(enviadas) == 1
    assert enviadas[0]["user_id"] == "founder"
    assert "bajas de precio" in enviadas[0]["body"]

    r2 = await revisar_transiciones(db)          # mismo día → NO duplica la campana
    assert r2.get("ya_corrido")
    assert len(enviadas) == 1
