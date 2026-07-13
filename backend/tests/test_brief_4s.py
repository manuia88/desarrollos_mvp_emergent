"""Tests del brief de producto 4S: generación desde átomos + despacho al buzón del dev."""
import pytest

from market_4s_loader import load_market_4s
from market_4s_facts import load_facts_4s
from brief_4s_engine import generar_brief, despachar_brief


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

    def sort(self, *a, **k):
        return self

    def limit(self, *a, **k):
        return self


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
async def test_brief_puente_alvarado_completo():
    db = await _db_cargada()
    b = await generar_brief(db, "puente_alvarado")
    assert b["es_estimado"] is False
    # producto ganador: 56m2 y lock-off empatan en 24% — ambos en el top-2
    ops = {m["opcion"] for m in b["producto"]["modelos_ganadores"]}
    assert ops & {"56m2_2rec2banos_4210000", "lockoff_68m2_4964000"}
    assert b["producto"]["dormitorios"]["opcion"] == "2"
    # hueco: el bin más grande de PA es 2.0-2.2 mdp (151 unidades)
    assert b["hueco_precio"][0]["bins_top"][0]["rango_mdp"] == "2.0-2.2"
    assert b["hueco_precio"][0]["bins_top"][0]["hueco_unidades"] == 151
    # pago real: enganche 20% (54%), descuento 10% (54%)
    assert b["pago"]["enganche"]["opcion"] == "20"
    assert b["pago"]["descuento_que_convierte"]["opcion"] == "10"
    # riesgo específico de PA: elevautos compartido NO (25%) → bajo umbral 30, sin advertencia
    assert isinstance(b["riesgos"]["advertencias"], list)
    # sustentabilidad top con dato real
    assert b["sustentabilidad_top"] and b["sustentabilidad_top"][0]["pct"] >= 94
    assert "2.0-2.2" in b["lectura"]


@pytest.mark.asyncio
async def test_brief_coyoacan_trae_precio_equilibrio():
    db = await _db_cargada()
    b = await generar_brief(db, "coyoacan")
    assert b["precio_equilibrio"] is not None            # coyoacán SÍ tiene comparables cargados
    assert b["precio_equilibrio"]["precio_m2_12m"] > 0
    assert b["precio_equilibrio"]["n_comparables"] >= 3


@pytest.mark.asyncio
async def test_brief_pa_sin_comps_honesto():
    db = await _db_cargada()
    b = await generar_brief(db, "puente_alvarado")
    assert b["precio_equilibrio"] is None                # PA no tiene comps en market_comps_4s — no inventa


@pytest.mark.asyncio
async def test_despachar_brief_al_buzon_dev():
    db = await _db_cargada()
    r = await despachar_brief(db, "periferico", actor="test@dmx")
    assert r["ok"] is True
    assert r["accion"]["destino"] == "dev"
    assert "Brief de producto 4S" in r["accion"]["titulo"]
    assert r["accion"]["payload"]["tipo"] == "brief_4s"
    # quedó en el buzón cube_actions (el dev lo ve por el reader existente)
    acciones = [d for d in db.cube_actions.docs.values() if d.get("destino") == "dev"]
    assert len(acciones) == 1
    assert acciones[0]["payload"]["brief"]["estudio"] == "periferico"


@pytest.mark.asyncio
async def test_despachar_sin_atomos_rechaza_honesto():
    db = _DB()                                            # sin átomos
    r = await despachar_brief(db, "coyoacan")
    assert r["ok"] is False and "honesto" in r["error"]
