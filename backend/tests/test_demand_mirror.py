"""Tests Ola B: espejo demanda↔oferta, escasez/inexistente/ciego, data negativa, radar léxico."""
from datetime import datetime, timezone

import pytest

import demand_mirror
from demand_genome import explotar_busquedas
from demand_mirror import espejo, escasez, data_negativa, radar_lexico


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


def _oferta_fake(unidades):
    async def _f(db, colonias=None):
        return [u for u in unidades if not colonias or u["colonia"] in colonias]
    return _f


_UNIDADES = [
    {"colonia": "condesa", "disponible": True, "unit_id": "u1",
     "vector": {"producto.recamaras": "2", "producto.m2_banda": "100-110",
                "producto.feature.balcon": "si", "finanzas.presupuesto_banda_mdp": "12.0-12.2"}},
    {"colonia": "condesa", "disponible": True, "unit_id": "u2",
     "vector": {"producto.recamaras": "3", "producto.m2_banda": "120-130"}},
    {"colonia": "condesa", "disponible": False, "unit_id": "u3",     # vendida: NO cuenta como oferta
     "vector": {"producto.recamaras": "2"}},
    {"colonia": "napoles", "disponible": True, "unit_id": "u4",
     "vector": {"producto.recamaras": "1"}},
]


async def _db_con_demanda():
    db = _DB()
    now = datetime.now(timezone.utc)
    for i in range(8):   # 8 personas piden 2 rec con roof en Condesa
        await db.marketplace_searches.insert_one({
            "id": f"s{i}", "visitor_id": f"v{i}", "colonias": ["Condesa"], "created_at_dt": now,
            "recamaras_min": 2, "features_pedidos": ["roof garden", "helipuerto privado"],
        })
    await explotar_busquedas(db)
    return db


@pytest.mark.asyncio
async def test_espejo_demanda_vs_oferta(monkeypatch):
    monkeypatch.setattr(demand_mirror, "_oferta_vectores", _oferta_fake(_UNIDADES))
    db = await _db_con_demanda()
    r = await espejo(db, {"condesa"})
    filas = {(f["dimension"], f["valor"]): f for f in r["filas"]}
    rec2 = filas[("producto.recamaras", "2")]
    assert rec2["demanda"] == 8 and rec2["oferta_disponible"] == 1   # la vendida NO cuenta
    assert rec2["tension"] == 8.0
    # lo INEXISTENTE: 8 piden roof_garden y ninguna unidad lo tiene
    roof = filas[("producto.feature", "roof_garden")]
    assert roof["estado"] == "inexistente" and roof["oferta_disponible"] == 0
    # inventario CIEGO: hay 3 rec disponible y nadie lo pide
    rec3 = filas[("producto.recamaras", "3")]
    assert rec3["estado"] == "ciego"


@pytest.mark.asyncio
async def test_escasez_rankea_y_detecta(monkeypatch):
    monkeypatch.setattr(demand_mirror, "_oferta_vectores", _oferta_fake(_UNIDADES))
    db = await _db_con_demanda()
    r = await escasez(db, {"condesa"})
    assert r["tension_top"][0]["tension"] == 8.0
    assert any(f["valor"] == "roof_garden" for f in r["lo_inexistente"])
    assert any(f["valor"] == "3" for f in r["inventario_ciego"])
    assert "tensión" in r["lectura"].lower() or "tension" in r["lectura"].lower()


@pytest.mark.asyncio
async def test_data_negativa(monkeypatch):
    monkeypatch.setattr(demand_mirror, "_oferta_vectores", _oferta_fake(_UNIDADES))
    db = await _db_con_demanda()
    now = datetime.now(timezone.utc)
    # u1 tiene vista; u2/u4 invisibles · dev con 6 vistas y 0 likes
    await db.buyer_signals.insert_one({"type": "unit_view", "entity_id": "u1", "created_at_dt": now})
    for i in range(6):
        await db.buyer_signals.insert_one({"type": "ficha_view", "entity_id": "dev9", "created_at_dt": now})
    r = await data_negativa(db)
    assert {"colonia": "napoles", "unidades": 1} in r["zonas_ciegas"]   # inventario sin UNA búsqueda
    assert set(r["unidades_invisibles"]["muestra"]) == {"u2", "u4"}     # disponibles sin vistas
    assert r["interes_sin_amor"][0]["dev_id"] == "dev9"                 # vistas sí, likes no


@pytest.mark.asyncio
async def test_radar_lexico_emergentes():
    db = await _db_con_demanda()
    r = await radar_lexico(db)
    top = {t["termino"]: t["menciones"] for t in r["terminos_top"]}
    assert top.get("helipuerto privado") == 8      # NO está en taxonomía → emergente, no se pierde
    assert "taxonom" in r["lectura"]


@pytest.mark.asyncio
async def test_espejo_sin_datos_honesto(monkeypatch):
    monkeypatch.setattr(demand_mirror, "_oferta_vectores", _oferta_fake([]))
    db = _DB()
    r = await espejo(db)
    assert r["es_estimado"] is True and r["filas"] == []
