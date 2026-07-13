"""Tests del HARDENING A-C: taxonomía runtime, señales con peso, KPI con historia, reportes con memoria."""
from datetime import datetime, timezone

import pytest

import demand_mirror
from demand_genome import (explotar_busquedas, explotar_senales, promover_termino,
                           snapshot_kpi, historia_kpi, PESO_SENAL)
from report_builder import generar_reporte, guardar_reporte, listar_reportes, obtener_reporte


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


@pytest.mark.asyncio
async def test_taxonomia_promovida_en_runtime():
    """El radar léxico cierra su ciclo: 'helipuerto' se promueve → la siguiente explosión lo reconoce."""
    db = _DB()
    now = datetime.now(timezone.utc)
    await db.marketplace_searches.insert_one({"id": "t1", "visitor_id": "v1", "colonias": ["Condesa"],
                                              "created_at_dt": now, "features_pedidos": ["helipuerto"]})
    await explotar_busquedas(db)
    emergentes = [a for a in db.demand_atoms.docs.values() if a["dimension"] == "lexico.termino_emergente"]
    assert emergentes and emergentes[0]["valor"] == "helipuerto"

    r = await promover_termino(db, "helipuerto")
    assert r["ok"] and r["slug"] == "helipuerto"
    await explotar_busquedas(db)   # re-proceso: ahora es feature contable
    feats = [a for a in db.demand_atoms.docs.values()
             if a["dimension"] == "producto.feature" and a["valor"] == "helipuerto"]
    assert feats, "el término promovido debe volverse átomo de feature SIN tocar código"


@pytest.mark.asyncio
async def test_senales_con_peso(monkeypatch):
    """Ver una unidad con balcón = deseo por sus llaves, con peso MENOR que buscarlo."""
    unidades = [{"colonia": "condesa", "disponible": True, "unit_id": "uX", "recamaras": 2,
                 "vector": {"producto.recamaras": "2", "producto.feature.balcon": "si"}}]

    async def _f(db, colonias=None):
        return unidades
    monkeypatch.setattr(demand_mirror, "_oferta_vectores", _f)

    db = _DB()
    await db.buyer_signals.insert_one({"type": "unit_view", "visitor_id": "v9", "entity_id": "uX",
                                       "created_at_dt": datetime.now(timezone.utc)})
    r = await explotar_senales(db)
    assert r["senales_procesadas"] == 1 and r["atomos"] >= 2
    atomo = next(a for a in db.demand_atoms.docs.values()
                 if a["dimension"] == "producto.feature" and a["valor"] == "balcon")
    assert atomo["peso"] == PESO_SENAL["unit_view"] == 0.3   # más débil que buscar (1.0)
    assert atomo["fuente"] == "senal:unit_view"


@pytest.mark.asyncio
async def test_kpi_snapshot_e_historia():
    """La curva semanal del moat es idempotente por semana (la evidencia 'crece solo' para YC)."""
    db = _DB()
    now = datetime.now(timezone.utc)
    await db.marketplace_searches.insert_one({"id": "k1", "visitor_id": "v1", "colonias": ["Roma"],
                                              "created_at_dt": now, "recamaras_min": 2})
    await explotar_busquedas(db)
    s1 = await snapshot_kpi(db)
    s2 = await snapshot_kpi(db)                       # misma semana → NO duplica
    assert s1["semana"] == s2["semana"]
    hist = await historia_kpi(db)
    assert len(hist) == 1 and hist[0]["n_atomos"] >= 1


@pytest.mark.asyncio
async def test_reporte_con_memoria():
    db = _DB()
    r = await generar_reporte(db, bloques=["genoma_kpi"])
    g = await guardar_reporte(db, r, nombre="Antes del lanzamiento")
    assert g["ok"]
    lista = await listar_reportes(db)
    assert lista["reportes"][0]["nombre"] == "Antes del lanzamiento"
    recuperado = await obtener_reporte(db, g["id"])
    assert recuperado and recuperado["n_bloques"] == 1
