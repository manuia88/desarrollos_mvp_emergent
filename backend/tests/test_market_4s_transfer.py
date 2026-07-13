"""Tests de transferencia de priors 4S: real → transferido → sin_prior (anti-dependencia de 4S)."""
import pytest

from market_4s_loader import load_market_4s
from market_4s_facts import load_facts_4s
from market_4s_transfer import prior_para_colonia, _arquetipos


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
        self._auto = 0

    async def update_one(self, key, update, upsert=False):
        k = tuple(sorted((kk, str(vv)) for kk, vv in key.items()))
        self.docs[k] = {**self.docs.get(k, {}), **update.get("$set", {})}

    async def insert_one(self, doc):
        self._auto += 1
        self.docs[("_auto", self._auto)] = doc

    async def find_one(self, q=None, proj=None):
        q = q or {}
        simple = {k: v for k, v in q.items() if not isinstance(v, dict)}
        for d in self.docs.values():
            if all(d.get(kk) == vv for kk, vv in simple.items()):
                return d
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


async def _db_cargada():
    db = _DB()
    await load_market_4s(db)
    await load_facts_4s(db)
    return db


@pytest.mark.asyncio
async def test_arquetipos_desde_atomos():
    db = await _db_cargada()
    arqs = await _arquetipos(db)
    assert len(arqs) == 4                                   # un arquetipo por estudio
    por_estudio = {a["estudio"]: a["precio_m2"] for a in arqs}
    assert 60000 < por_estudio["coyoacan"] < 80000          # ~$71.7k ponderado
    assert 80000 < por_estudio["insurgentes_antonio_caso"] < 110000


@pytest.mark.asyncio
async def test_modo_real_en_zona_de_influencia():
    db = await _db_cargada()
    r = await prior_para_colonia(db, "Tabacalera")
    assert r["modo"] == "real" and r["es_estimado"] is False
    assert r["estudio_fuente"] == "puente_alvarado"          # prefiere el estudio más reciente
    assert r["prior"]["recamaras"]["opcion"] == "2"


@pytest.mark.asyncio
async def test_modo_transferido_colonia_de_perfil_similar():
    db = await _db_cargada()
    # Narvarte no está en ningún estudio, pero su precio/m² (~$70k) se parece a Coyoacán/Periférico
    r = await prior_para_colonia(db, "Narvarte", precio_m2=70000)
    assert r["modo"] == "transferido"
    assert r["es_estimado"] is True                          # transferido NO es medido — honesto
    assert r["similitud"] >= 0.8 and r["confianza"] in ("media", "baja")
    assert r["prior"] is not None
    assert "TRANSFERIDO" in r["leyenda"]


@pytest.mark.asyncio
async def test_modo_transferido_lee_precio_del_universo():
    db = await _db_cargada()
    await db.colonias.insert_one({"name": "Del Carmen", "precio_pm2": 68000})
    r = await prior_para_colonia(db, "Del Carmen")           # sin pasar precio → lo busca solo
    assert r["modo"] == "transferido"


@pytest.mark.asyncio
async def test_sin_prior_lomas_ultra_premium_no_rompe_nada():
    db = await _db_cargada()
    # Lomas de Chapultepec ~$150k/m² — ningún arquetipo 4S se le parece
    r = await prior_para_colonia(db, "Lomas de Chapultepec", precio_m2=150000)
    assert r["modo"] == "sin_prior"
    assert r["prior"] is None and r["es_estimado"] is True
    assert "estimados propios" in r["leyenda"]               # los motores siguen como siempre


@pytest.mark.asyncio
async def test_sin_precio_ni_zona_sin_prior_honesto():
    db = await _db_cargada()
    r = await prior_para_colonia(db, "colonia-desconocida-xyz")
    assert r["modo"] == "sin_prior"
