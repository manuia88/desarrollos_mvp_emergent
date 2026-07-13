"""Tests de la BITÁCORA TEMPORAL: event-sourcing del inventario + evolución universal por tiempo."""
from datetime import datetime, timezone

import pytest

import demand_mirror
from demand_genome import explotar_busquedas
from market_timeline import snapshot_oferta, snapshot_contexto, evolucion


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


def _ph(precio):
    """El PH del founder: 120m², roof garden, 3 rec — su precio cambia en el tiempo."""
    return {"colonia": "condesa", "dev_id": "torre1", "disponible": True, "unit_id": "ph-402",
            "precio": precio, "m2": 120, "piso": 12, "recamaras": 3,
            "vector": {"producto.recamaras": "3", "producto.m2_banda": "120-130",
                       "producto.feature.roof_garden": "si"}}


def _patch(monkeypatch, unidades):
    async def _f(db, colonias=None):
        return unidades
    monkeypatch.setattr(demand_mirror, "_oferta_vectores", _f)


@pytest.mark.asyncio
async def test_snapshot_solo_escribe_cambios(monkeypatch):
    db = _DB()
    _patch(monkeypatch, [_ph(12000000)])
    r1 = await snapshot_oferta(db)
    r2 = await snapshot_oferta(db)                     # sin cambios → NO duplica
    assert r1["eventos_nuevos"] == 1 and r2["eventos_nuevos"] == 0 and r2["sin_cambio"] == 1
    _patch(monkeypatch, [_ph(12500000)])               # el dev sube el precio
    r3 = await snapshot_oferta(db)
    assert r3["eventos_nuevos"] == 1                   # el cambio queda escrito PARA SIEMPRE
    eventos = [e for e in db.oferta_timeline.docs.values()]
    assert len(eventos) == 2
    assert {e["precio"] for e in eventos} == {12000000, 12500000}


@pytest.mark.asyncio
async def test_evolucion_del_ph_exacto(monkeypatch):
    """La pregunta del founder: '¿cuánto costaba ESE PH?' — respondida por periodo."""
    db = _DB()
    _patch(monkeypatch, [])
    # simula 3 meses de bitácora del PH (eventos con ts controlado)
    for mes, precio in [("2026-05", 11800000), ("2026-06", 12100000), ("2026-07", 12500000)]:
        e = _ph(precio)
        await db.oferta_timeline.insert_one({
            "unit_id": e["unit_id"], "colonia": e["colonia"], "dev_id": e["dev_id"],
            "ts": f"{mes}-05T12:00:00+00:00", "hash": f"h{precio}",
            "precio": precio, "m2": 120, "pm2": round(precio / 120),
            "disponible": True, "vector": e["vector"]})
    r = await evolucion(db, unit_id="ph-402", granularidad="mes")
    assert r["n_periodos"] == 3
    precios = [s["precio_unidad"] for s in r["series"]]
    assert precios == [11800000, 12100000, 12500000]   # la vida del PH, mes a mes


@pytest.mark.asyncio
async def test_evolucion_universal_por_corte_y_granularidad(monkeypatch):
    """Cualquier corte del genoma × tiempo: demanda de roof_garden + oferta que lo satisface."""
    db = _DB()
    _patch(monkeypatch, [])
    # oferta: el PH (con roof) entra en junio
    e = _ph(12000000)
    await db.oferta_timeline.insert_one({"unit_id": "ph-402", "colonia": "condesa", "dev_id": "torre1",
                                         "ts": "2026-06-10T00:00:00+00:00", "hash": "x",
                                         "precio": 12000000, "m2": 120, "pm2": 100000,
                                         "disponible": True, "vector": e["vector"]})
    # demanda: 3 visitantes piden roof en mayo, 5 en junio
    for i in range(3):
        await db.marketplace_searches.insert_one({"id": f"m{i}", "visitor_id": f"a{i}",
                                                  "colonias": ["Condesa"],
                                                  "created_at_dt": datetime(2026, 5, 9, tzinfo=timezone.utc),
                                                  "features_pedidos": ["roof garden"]})
    for i in range(5):
        await db.marketplace_searches.insert_one({"id": f"j{i}", "visitor_id": f"b{i}",
                                                  "colonias": ["Condesa"],
                                                  "created_at_dt": datetime(2026, 6, 12, tzinfo=timezone.utc),
                                                  "features_pedidos": ["roof garden"]})
    await explotar_busquedas(db)

    r = await evolucion(db, colonias={"condesa"}, dimension="producto.feature",
                        valor="roof_garden", granularidad="mes")
    por_mes = {s["periodo"]: s for s in r["series"]}
    assert por_mes["2026-05"]["demanda_visitantes"] == 3
    assert por_mes["2026-05"]["oferta_disponible"] == 0    # el PH aún no existía en mayo
    assert por_mes["2026-06"]["demanda_visitantes"] == 5
    assert por_mes["2026-06"]["oferta_disponible"] == 1    # en junio ya está y SATISFACE el corte
    # granularidad año: todo colapsa a 2026
    r2 = await evolucion(db, colonias={"condesa"}, dimension="producto.feature",
                         valor="roof_garden", granularidad="ano")
    assert r2["series"][0]["periodo"] == "2026" and r2["series"][0]["demanda_visitantes"] == 8


@pytest.mark.asyncio
async def test_v2_todas_las_granularidades(monkeypatch):
    """Cualquier temporalidad: hora → día → semana → mes → trimestre → año."""
    from market_timeline import GRANULARIDADES
    assert {"hora", "dia", "semana", "mes", "trimestre", "ano"} <= set(GRANULARIDADES)
    db = _DB()
    _patch(monkeypatch, [])
    await db.marketplace_searches.insert_one({"id": "g1", "visitor_id": "v1", "colonias": ["Roma"],
                                              "created_at_dt": datetime(2026, 7, 13, 15, 30, tzinfo=timezone.utc),
                                              "recamaras_min": 2})
    await explotar_busquedas(db)
    esperados = {"hora": "2026-07-13T15", "dia": "2026-07-13", "semana": "2026-W29",
                 "mes": "2026-07", "trimestre": "2026-Q3", "ano": "2026"}
    for gran, periodo in esperados.items():
        r = await evolucion(db, granularidad=gran)
        assert r["series"][0]["periodo"] == periodo, f"{gran} → {r['series'][0]['periodo']}"


@pytest.mark.asyncio
async def test_v2_cortes_multiples_y_logico(monkeypatch):
    """Hipersegmentación: '2 rec Y roof' — el visitante cuenta solo si pidió AMBOS."""
    db = _DB()
    _patch(monkeypatch, [_ph(12000000)])
    now = datetime(2026, 7, 10, tzinfo=timezone.utc)
    # v-ambos pide 2rec+roof · v-solo-rec pide solo 2rec
    await db.marketplace_searches.insert_one({"id": "a1", "visitor_id": "v-ambos", "colonias": ["Condesa"],
                                              "created_at_dt": now, "recamaras_min": 2,
                                              "features_pedidos": ["roof garden"]})
    await db.marketplace_searches.insert_one({"id": "a2", "visitor_id": "v-solo-rec", "colonias": ["Condesa"],
                                              "created_at_dt": now, "recamaras_min": 2})
    await explotar_busquedas(db)
    await snapshot_oferta(db)   # el PH (3 rec + roof) satisface AMBOS cortes

    r = await evolucion(db, colonias={"condesa"}, granularidad="mes",
                        cortes=[{"dimension": "producto.recamaras", "valor": "2"},
                                {"dimension": "producto.feature", "valor": "roof_garden"}])
    s = r["series"][0]
    assert s["demanda_visitantes"] == 1        # solo v-ambos pidió TODO (∩, no suma)
    assert s["oferta_disponible"] == 1         # el PH satisface 2+ rec Y tiene roof
    assert s["tension"] == 1.0                 # tensión calculada por periodo
    assert len(r["filtro"]["cortes"]) == 2


@pytest.mark.asyncio
async def test_v2_desglose_una_serie_por_valor(monkeypatch):
    """Hipergranularidad: desglosar_por=recamaras → una serie por cada valor (1, 2, 3...)."""
    db = _DB()
    _patch(monkeypatch, [])
    now = datetime(2026, 7, 10, tzinfo=timezone.utc)
    for i in range(4):
        await db.marketplace_searches.insert_one({"id": f"d2{i}", "visitor_id": f"x{i}",
                                                  "colonias": ["Condesa"], "created_at_dt": now,
                                                  "recamaras_min": 2})
    for i in range(2):
        await db.marketplace_searches.insert_one({"id": f"d3{i}", "visitor_id": f"y{i}",
                                                  "colonias": ["Condesa"], "created_at_dt": now,
                                                  "recamaras_min": 3})
    await explotar_busquedas(db)
    r = await evolucion(db, colonias={"condesa"}, granularidad="mes",
                        desglosar_por="producto.recamaras")
    assert r["desglose"] == "producto.recamaras"
    assert set(r["valores"]) == {"2", "3"}
    assert r["series_por_valor"]["2"][0]["demanda_visitantes"] == 4
    assert r["series_por_valor"]["3"][0]["demanda_visitantes"] == 2


@pytest.mark.asyncio
async def test_contexto_diario_idempotente(monkeypatch):
    db = _DB()
    _patch(monkeypatch, [_ph(12000000)])
    c1 = await snapshot_contexto(db)
    c2 = await snapshot_contexto(db)                   # mismo día → un solo doc
    assert c1["fecha"] == c2["fecha"]
    docs = [d for d in db.contexto_timeline.docs.values()]
    assert len(docs) == 1
    assert docs[0]["n_unidades"] == 1 and docs[0]["pm2_mediana"] == 100000
