"""Tests de los 3 cables 4S→motores vivos: absorción (censo), demanda (EPRAV), precio (residual)."""
import pytest

from market_4s_loader import load_market_4s


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

    async def find_one(self, q=None, proj=None):
        q = q or {}
        for d in self.docs.values():
            if all(d.get(kk) == vv for kk, vv in q.items()):
                return d
        return None

    def find(self, q=None, proj=None):
        q = q or {}
        # solo soporta igualdad simple; los operadores ($nin, etc.) → no match (fail-safe)
        simple = {k: v for k, v in q.items() if not isinstance(v, dict)}
        return _Cursor(d for d in self.docs.values() if all(d.get(kk) == vv for kk, vv in simple.items()))


class _DB:
    def __init__(self):
        self._c = {}

    def __getattr__(self, n):
        return self._c.setdefault(n, _Col())


# ── Cable 1 · absorción ────────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_cable1_absorcion_censa_4s_sin_nombres_por_defecto():
    from absorcion_engine import curva_absorcion
    db = _DB()
    await load_market_4s(db)
    r = await curva_absorcion(db, col_names={"Tabacalera", "San Rafael"})

    assert r["n_proyectos_4s"] > 0                 # entraron competidores 4S al censo
    assert r["es_estimado"] is False               # ≥3 comparables reales → real
    assert r["data_basis"] == "real"
    nombres = [c["nombre"] for c in r["comparables"] if c.get("fuente") == "4s"]
    assert nombres and all(n == "Competidor de mercado (4S)" for n in nombres)  # anonimizado


@pytest.mark.asyncio
async def test_cable1_nombres_solo_superadmin():
    from absorcion_engine import curva_absorcion
    db = _DB()
    await load_market_4s(db)
    r = await curva_absorcion(db, col_names={"Tabacalera"}, nombres_4s=True)
    nombres = [c["nombre"] for c in r["comparables"] if c.get("fuente") == "4s"]
    assert any(n != "Competidor de mercado (4S)" for n in nombres)  # superadmin ve el nombre real


@pytest.mark.asyncio
async def test_cable1_apagable():
    from absorcion_engine import curva_absorcion
    db = _DB()
    await load_market_4s(db)
    r = await curva_absorcion(db, col_names={"Tabacalera"}, incluir_4s=False)
    assert r["n_proyectos_4s"] == 0                # sin 4S no se cuela nada


# ── Cable 2 · demanda EPRAV ────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_cable2_eprav_pasa_a_real_con_4s():
    from demanda_demografica_engine import estimar_demanda
    db = _DB()
    await load_market_4s(db)
    # colonia_id = nombre que cae en una zona de influencia 4S
    r = await estimar_demanda(db, "Tabacalera", "media")
    assert r["demanda_4s_real"] is not None
    assert r["demanda_4s_real"]["demanda_3anos"] > 0
    assert r["es_estimado"] is False               # ← estimado→real
    assert "4S" in r["fuente"] or "4s" in r["fuente"]


@pytest.mark.asyncio
async def test_cable2_sigue_estimado_sin_4s():
    from demanda_demografica_engine import estimar_demanda
    db = _DB()
    await load_market_4s(db)
    r = await estimar_demanda(db, "colonia-sin-estudio-xyz", "media")
    assert r["demanda_4s_real"] is None
    assert r["es_estimado"] is True                # honesto: sin dato real, sigue modelo


# ── Cable 3 · precio en el residual ────────────────────────────────────────────
@pytest.mark.asyncio
async def test_cable3_precio_residual_usa_4s():
    from valor_residual_engine import _precio_venta_pm2
    db = _DB()
    await load_market_4s(db)
    colonia = {"id": "tabacalera", "name": "Tabacalera"}   # sin precio_pm2 propio
    p = await _precio_venta_pm2(db, colonia, "media", "CDMX")
    assert p["origen"] == "dato"                   # dato real, no supuesto
    assert "4S" in p["fuente"]
    assert p["pm2"] > 0
