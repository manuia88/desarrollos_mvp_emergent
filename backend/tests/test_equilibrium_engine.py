"""Test del equilibrium_engine — precio de equilibrio + elasticidad + gap, con dato real 4S (sin Mongo)."""
import pytest

from market_4s_loader import load_market_4s
from equilibrium_engine import precio_equilibrio, gap_por_rango, market_intelligence, _ols


class _Cursor:
    def __init__(self, docs):
        self._docs = list(docs)

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

    async def update_one(self, key, update, upsert=False):
        k = tuple(sorted(key.items()))
        self.docs[k] = {**self.docs.get(k, {}), **update.get("$set", {})}

    async def create_index(self, *a, **k):
        return None

    def find(self, q=None, proj=None):
        q = q or {}
        return _Cursor(d for d in self.docs.values() if all(d.get(kk) == vv for kk, vv in q.items()))


class _DB:
    def __init__(self):
        self._c = {}

    def __getattr__(self, n):
        return self._c.setdefault(n, _Col())


def test_ols_pendiente_negativa():
    # y baja cuando x sube → slope negativo
    fit = _ols([1, 2, 3, 4], [10, 8, 6, 4])
    assert fit["slope"] == pytest.approx(-2.0)


@pytest.mark.asyncio
async def test_precio_equilibrio_real_desde_4s():
    db = _DB()
    await load_market_4s(db)
    r = await precio_equilibrio(db, estudio="coyoacan", meses_objetivo=12)

    assert r["n_comparables"] == 11            # los 11 proyectos de Coyoacán
    assert r["fuente"] == "real"
    assert r["es_estimado"] is False
    assert isinstance(r["precio_equilibrio_m2"], (int, float))
    assert r["precio_equilibrio_m2"] > 0
    assert isinstance(r["elasticidad_precio_absorcion"], float)
    assert r["precio_m2_rango"][0] < r["precio_m2_rango"][1]


@pytest.mark.asyncio
async def test_sin_comparables_es_estimado_honesto():
    db = _DB()
    await load_market_4s(db)
    r = await precio_equilibrio(db, zona="zona-inexistente")
    assert r["n_comparables"] == 0
    assert r["es_estimado"] is True
    assert r["precio_equilibrio_m2"] is None   # NO inventa


@pytest.mark.asyncio
async def test_gap_por_rango():
    db = _DB()
    await load_market_4s(db)
    g = await gap_por_rango(db, estudio="coyoacan")
    assert g["fuente"] == "real"
    assert g["gap_total_3anos"] == 327 + 722            # Premium + Residencial Plus
    assert g["rangos"][0]["gap_vertical_3anos"] == 722  # ordenado por gap desc (RP primero)


@pytest.mark.asyncio
async def test_market_intelligence_fusiona_con_confianza():
    db = _DB()
    await load_market_4s(db)
    mi = await market_intelligence(db, estudio="coyoacan")
    assert mi["confianza_dato"] == "alta"       # equilibrio real + gap real
    assert mi["precio_equilibrio"]["fuente"] == "real"
    assert mi["gap_mercado"]["fuente"] == "real"
