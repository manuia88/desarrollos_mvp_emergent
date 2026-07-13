"""Test del puente 4S → motores vivos: absorción real por colonia + auto-upgrade IAB estimado→real."""
import pytest

from market_4s_loader import load_market_4s
from market_4s_bridge import absorcion_4s_by_colonia, norm_colonia


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


def test_norm_colonia_sin_acentos():
    assert norm_colonia("Juárez") == "juarez"
    assert norm_colonia("  Santa María  ") == "santa maria"
    assert norm_colonia("") == ""


@pytest.mark.asyncio
async def test_absorcion_4s_por_colonia_es_real():
    db = _DB()
    await load_market_4s(db)
    m = await absorcion_4s_by_colonia(db)

    assert m, "debe mapear colonias desde los estudios 4S"
    # las colonias de influencia normalizadas (sin acentos) están mapeadas
    assert "tabacalera" in m
    tab = m["tabacalera"]
    assert tab["fuente"] == "4s"
    assert tab["total"] > 0 and tab["sold"] > 0
    assert tab["n_proyectos"] >= 3           # k-anon en la fuente (≥3 competidores)
    # la absorción es vendido/total real del estudio (0 < pct ≤ 100)
    pct = 100 * tab["sold"] / tab["total"]
    assert 0 < pct <= 100


@pytest.mark.asyncio
async def test_ctx_for_flip_estimado_a_real_con_4s():
    # el cable en routes: una colonia SIN datos propios pero cubierta por 4S → IAB pasa a real
    from routes.dmx_indices import _ctx_for
    db = _DB()
    await load_market_4s(db)
    abs4s = await absorcion_4s_by_colonia(db)

    colonia = {"name": "Juárez", "id": "juarez"}      # con acento, como en el universo real
    ctx_sin = _ctx_for(colonia, {}, None, None)        # sin 4S → sin absorción (estimado)
    ctx_con = _ctx_for(colonia, {}, None, abs4s)       # con 4S → absorción real

    assert "absorcion_pct" not in ctx_sin
    assert "absorcion_pct" in ctx_con                  # ← estimado→real
    assert 0 < ctx_con["absorcion_pct"] <= 100
