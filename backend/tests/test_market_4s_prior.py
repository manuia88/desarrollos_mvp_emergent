"""Tests: átomos 4S → motores (prior de zona, tope de cuota, contraste vs marketplace vivo)."""
from datetime import datetime, timezone

import pytest

from market_4s_loader import load_market_4s
from market_4s_facts import load_facts_4s
from market_4s_prior import prior_zona, cuota_tope_por_colonia, contraste_4s_vs_observado


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
    await load_market_4s(db)   # demanda_4s (zonas de influencia)
    await load_facts_4s(db)    # átomos
    return db


@pytest.mark.asyncio
async def test_prior_zona_dominantes_reales():
    db = await _db_cargada()
    p = await prior_zona(db, "puente_alvarado")
    assert p["es_estimado"] is False
    assert p["recamaras"]["opcion"] == "2" and p["recamaras"]["pct"] == 74   # 2 rec domina PA
    assert p["enganche"]["opcion"] == "20" and p["enganche"]["pct"] == 54
    assert p["credito"]["opcion"] == "hipotecario_personal"
    assert p["descuento"]["opcion"] == "10"


@pytest.mark.asyncio
async def test_prior_zona_difiere_entre_estudios():
    db = await _db_cargada()
    peri = await prior_zona(db, "periferico")
    coy = await prior_zona(db, "coyoacan")
    assert peri["cocina"]["opcion"] == "cerrada"           # Periférico: cocina cerrada
    assert coy["cocina"]["opcion"] == "abierta_con_barra"  # Coyoacán: abierta con barra


@pytest.mark.asyncio
async def test_cuota_tope_por_colonia_flip_a_real():
    db = await _db_cargada()
    t = await cuota_tope_por_colonia(db, "Tabacalera")     # zona de influencia de antonio_caso/PA
    assert t is not None and t["es_estimado"] is False
    assert t["rango_mxn"] and t["rango_mxn"][0] > 0
    # colonia fuera de estudios → None honesto (sigue la referencia genérica)
    assert await cuota_tope_por_colonia(db, "colonia-inexistente-xyz") is None


@pytest.mark.asyncio
async def test_recomendar_cuota_usa_tope_real_de_zona():
    from amenidades_engine import recomendar_cuota
    db = await _db_cargada()
    r = await recomendar_cuota(db, m2=60, amenidades=["alberca", "gimnasio"], colonia_id="Tabacalera")
    assert r["es_estimado"] is False                       # ← estimado→real
    assert r["tope_zona_4s"] is not None
    assert "zona" in r["referencia_segmento"].lower() or "$" in r["referencia_segmento"]


@pytest.mark.asyncio
async def test_contraste_sin_senal_manda_el_prior():
    db = await _db_cargada()                               # marketplace_searches vacío
    c = await contraste_4s_vs_observado(db)
    assert len(c["estudios"]) >= 4
    assert all(e["estado"] == "prior_4s" for e in c["estudios"])
    assert "prior 4S manda" in c["estudios"][0]["veredicto"]


@pytest.mark.asyncio
async def test_contraste_confirma_con_senal_viva():
    db = await _db_cargada()
    # simula 12 búsquedas reales del marketplace en Tabacalera pidiendo 2 recámaras
    now = datetime.now(timezone.utc)
    for i in range(12):
        await db.marketplace_searches.insert_one({
            "visitor_id": f"v{i}", "colonias": ["Tabacalera"],
            "recamaras_min": 2, "precio_max": 4500000, "created_at_dt": now,
        })
    c = await contraste_4s_vs_observado(db)
    pa = next(e for e in c["estudios"] if e["estudio"] in ("puente_alvarado", "antonio_caso"))
    assert pa["estado"] == "confirmado"                    # 4S dice 2 rec, marketplace observa 2 rec
    assert pa["observado"]["n_senales"] >= 12


@pytest.mark.asyncio
async def test_contraste_a8_metraje_y_features():
    """A8: m² y features también entran al contraste (antes solo recámaras+presupuesto)."""
    db = await _db_cargada()
    now = datetime.now(timezone.utc)
    for i in range(12):
        await db.marketplace_searches.insert_one({
            "visitor_id": f"m{i}", "colonias": ["Tabacalera"],
            "recamaras_min": 2, "precio_max": 4500000, "m2_min": 75,
            "features_pedidos": ["balcón", "roof garden"], "created_at_dt": now,
        })
    c = await contraste_4s_vs_observado(db)
    pa = next(e for e in c["estudios"] if e["estudio"] == "puente_alvarado")
    # metraje: 4S dice 71-80 m² dominante en PA; el mercado pide banda 70-80 → SE TOCAN
    assert pa["prior_4s"]["metraje"]["opcion"] == "71_80"
    assert pa["observado"]["m2_bandas"].get("70-80") == 12
    assert pa["metraje_coincide"] is True
    # features observadas normalizadas a taxonomía
    assert pa["features_observadas_top"].get("balcon") == 12
    assert pa["features_observadas_top"].get("roof_garden") == 12
