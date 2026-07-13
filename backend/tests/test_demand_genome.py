"""Tests del Genoma de Demanda (Ola A): taxonomía, explotador de átomos, idempotencia, KPI del moat."""
from datetime import datetime, timezone

import pytest

from demand_genome import (
    normalizar_feature, normalizar_features, banda_precio_mdp, banda_m2,
    atomos_de_busqueda, explotar_busquedas, resumen_genoma, TAXONOMIA_FEATURES,
)


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


# ── taxonomía ─────────────────────────────────────────────────────────────────
def test_taxonomia_normaliza_texto_libre():
    assert normalizar_feature("Roof Garden") == "roof_garden"
    assert normalizar_feature("pet friendly") == "pet_friendly"
    assert normalizar_feature("BALCÓN") == "balcon"
    assert normalizar_feature("depa con ludoteca para niños") == "ludoteca"
    assert normalizar_feature("cajones independientes") == "cajon_independiente"
    assert normalizar_feature("helipuerto") is None            # no está — honesto


def test_normalizar_features_separa_emergentes():
    r = normalizar_features(["roof garden", "asadores", "helipuerto", "cava de vinos"])
    assert set(r["reconocidos"]) == {"roof_garden", "asadores"}
    assert "helipuerto" in r["desconocidos"]                    # radar léxico: NO se pierde
    assert len(TAXONOMIA_FEATURES) >= 30


def test_bandas_agregables():
    assert banda_precio_mdp(12000000) == "12.0-12.2"
    assert banda_m2(105) == "100-110"


# ── explotador (la búsqueda compleja del founder) ─────────────────────────────
def _busqueda_founder():
    return {
        "id": "mks_test1", "visitor_id": "v1", "source": "saved_search",
        "colonias": ["Condesa"], "created_at_dt": datetime.now(timezone.utc),
        "recamaras_min": 2, "banos_min": 2, "estacionamientos_min": 2,
        "m2_min": 100, "piso_min": 4,
        "precio_max": 12000000, "enganche_max": 15, "mensualidad_max": 40000,
        "stages": ["preventa"], "plazo": "6m",
        "features_pedidos": ["balcón", "roof garden", "vista exterior"],
        "amenidades_pedidas": ["asadores", "ludoteca"],
    }


def test_atomos_de_busqueda_compleja():
    atomos = atomos_de_busqueda(_busqueda_founder())
    dims = {a["dimension"]: a["valor"] for a in atomos}
    assert dims["producto.recamaras"] == "2"
    assert dims["producto.estacionamientos"] == "2"
    assert dims["producto.m2_banda"] == "100-110"
    assert dims["producto.nivel_min"] == "4"
    assert dims["finanzas.presupuesto_banda_mdp"] == "12.0-12.2"
    assert dims["finanzas.enganche_max"] == "15"
    assert dims["finanzas.mensualidad_max"] == "40000"
    assert dims["intencion.etapa_obra"] == "preventa"
    # features normalizados a taxonomía (5 pedidos → 5 slugs)
    feats = {a["valor"] for a in atomos if a["dimension"] == "producto.feature"}
    assert feats == {"balcon", "roof_garden", "vista", "asadores", "ludoteca"}
    # todos anclados a la colonia normalizada
    assert all(a["colonia"] == "condesa" for a in atomos)
    assert len(atomos) >= 14


def test_atomos_busqueda_simple():
    atomos = atomos_de_busqueda({"id": "x", "colonias": ["Roma Norte"], "recamaras_min": 3,
                                 "precio_max": 5000000, "source": "marketplace_picker"})
    dims = {a["dimension"] for a in atomos}
    assert dims == {"producto.recamaras", "finanzas.presupuesto_banda_mdp"}


# ── backfill idempotente + KPI del moat ───────────────────────────────────────
@pytest.mark.asyncio
async def test_explotar_idempotente_y_resumen():
    db = _DB()
    await db.marketplace_searches.insert_one(_busqueda_founder())
    await db.marketplace_searches.insert_one({"id": "mks2", "visitor_id": "v2",
                                              "colonias": ["Condesa"], "recamaras_min": 2,
                                              "precio_max": 8000000, "source": "picker"})
    r1 = await explotar_busquedas(db)
    n1 = len(db.demand_atoms.docs)
    r2 = await explotar_busquedas(db)          # segunda corrida NO duplica
    assert len(db.demand_atoms.docs) == n1
    assert r1["busquedas_procesadas"] == 2 and r2["busquedas_procesadas"] == 2

    kpi = await resumen_genoma(db)
    assert kpi["n_atomos"] == n1
    assert kpi["n_visitantes"] == 2
    assert kpi["dimensiones_con_senal"] >= 8
    assert kpi["top_colonias"].get("condesa") == n1   # toda la señal es de Condesa
    assert "moat" in kpi["lectura"]


@pytest.mark.asyncio
async def test_resumen_sin_atomos_honesto():
    db = _DB()
    kpi = await resumen_genoma(db)
    assert kpi["es_estimado"] is True and kpi["n_atomos"] == 0
