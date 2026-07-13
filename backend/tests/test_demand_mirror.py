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
    {"colonia": "condesa", "disponible": True, "unit_id": "u1", "recamaras": 2, "m2": 104, "precio": 12100000,
     "vector": {"producto.recamaras": "2", "producto.m2_banda": "100-110",
                "producto.feature.balcon": "si", "finanzas.presupuesto_banda_mdp": "12.0-12.2"}},
    {"colonia": "condesa", "disponible": True, "unit_id": "u2", "recamaras": 3, "m2": 125, "precio": 15000000,
     "vector": {"producto.recamaras": "3", "producto.m2_banda": "120-130",
                "producto.feature.spa": "si"}},          # spa: nadie lo pide → inventario CIEGO
    {"colonia": "condesa", "disponible": False, "unit_id": "u3", "recamaras": 2,
     "vector": {"producto.recamaras": "2"}},             # vendida: NO cuenta como oferta
    {"colonia": "napoles", "disponible": True, "unit_id": "u4", "recamaras": 1,
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
async def test_espejo_semantica_de_satisfaccion(monkeypatch):
    """HARDENING: '2 rec' = 2 O MÁS (la de 3 rec SÍ satisface) + visitantes únicos + ciego=feature."""
    monkeypatch.setattr(demand_mirror, "_oferta_vectores", _oferta_fake(_UNIDADES))
    db = await _db_con_demanda()
    r = await espejo(db, {"condesa"})
    filas = {(f["dimension"], f["valor"]): f for f in r["filas"]}
    rec2 = filas[("producto.recamaras", "2")]
    assert rec2["demanda"] == 8                      # 8 VISITANTES únicos
    assert rec2["oferta_satisface"] == 2             # u1 (2 rec) Y u2 (3 rec ≥ 2); la vendida NO
    assert rec2["tension"] == 4.0                    # 8/2 — ya no inflada
    # lo INEXISTENTE: 8 piden roof_garden y ninguna unidad lo tiene
    roof = filas[("producto.feature", "roof_garden")]
    assert roof["estado"] == "inexistente" and roof["oferta_satisface"] == 0
    # inventario CIEGO: u2 tiene spa y NADIE lo pide
    spa = filas[("producto.feature", "spa")]
    assert spa["estado"] == "ciego" and spa["oferta_satisface"] == 1


@pytest.mark.asyncio
async def test_espejo_visitante_obsesivo_cuenta_una_vez(monkeypatch):
    monkeypatch.setattr(demand_mirror, "_oferta_vectores", _oferta_fake(_UNIDADES))
    db = _DB()
    now = datetime.now(timezone.utc)
    for i in range(10):   # UN visitante busca 10 veces
        await db.marketplace_searches.insert_one({"id": f"o{i}", "visitor_id": "obsesivo",
                                                  "colonias": ["Condesa"], "created_at_dt": now,
                                                  "recamaras_min": 2})
    await explotar_busquedas(db)
    r = await espejo(db, {"condesa"})
    rec2 = next(f for f in r["filas"] if f["dimension"] == "producto.recamaras")
    assert rec2["demanda"] == 1                      # 1 visitante, no 10 (señales sí acumulan)
    assert rec2["senales"] == 10.0


@pytest.mark.asyncio
async def test_escasez_rankea_y_detecta(monkeypatch):
    monkeypatch.setattr(demand_mirror, "_oferta_vectores", _oferta_fake(_UNIDADES))
    db = await _db_con_demanda()
    r = await escasez(db, {"condesa"})
    assert r["tension_top"][0]["tension"] == 4.0     # semántica ≥: 8 visitantes / 2 que satisfacen
    assert any(f["valor"] == "roof_garden" for f in r["lo_inexistente"])
    assert any(f["valor"] == "spa" for f in r["inventario_ciego"])
    assert "visitantes únicos" in r["lectura"]


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
    assert {x["unit_id"] for x in r["unidades_invisibles"]["muestra"]} == {"u2", "u4"}  # sin vistas (ahora con edad)
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


@pytest.mark.asyncio
async def test_espejo_recamaras_con_alias_y_datos_sucios(monkeypatch):
    """Bug cazado EN PANTALLA por el gate vivo: 'recámaras=2 → 0 unidades satisfacen' con cientos
    de disponibles. Causa: el espejo leía recamaras/piso crudos sin alias (bedrooms) ni parse
    tolerante ('10+1'), mientras baños sí usaba el vector. Ahora la misma disciplina en crudos."""
    import demand_mirror
    from demand_mirror import espejo
    db = _DB()
    # búsqueda real: alguien pide 2 recámaras
    await db.marketplace_searches.insert_one({
        "id": "s1", "visitor_id": "v1", "colonias": ["Condesa"],
        "created_at_dt": datetime.now(timezone.utc), "recamaras_min": 2})
    from demand_genome import explotar_busquedas
    await explotar_busquedas(db)
    # oferta estilo INGERIDA: alias bedrooms + piso sucio '10+1' — antes ambas caían a False
    unidades = [
        {"colonia": "condesa", "dev_id": "d1", "disponible": True, "unit_id": "u-alias",
         "precio": 5000000.0, "m2": 80.0, "piso": None, "recamaras": None,
         "crudos": {}, "vector": {"producto.recamaras": "3"}},
    ]
    # simula lo que _fila produce HOY desde {"bedrooms": "3", "nivel": "10+1"}
    from demand_mirror import _oferta_vectores_raw  # noqa: F401 (validación de import)
    from demand_genome import _entero, _get
    crudo = {"id": "u-alias", "bedrooms": "3", "nivel": "10+1", "m2": 80, "precio_lista": 5000000,
             "status": "disponible"}
    assert _entero(_get(crudo, "recamaras", "bedrooms")) == 3
    assert _entero(_get(crudo, "piso", "nivel", "floor")) == 10
    unidades[0]["recamaras"] = _entero(_get(crudo, "recamaras", "bedrooms"))
    unidades[0]["piso"] = _entero(_get(crudo, "piso", "nivel", "floor"))

    async def _f(db_, colonias=None):
        return unidades
    monkeypatch.setattr(demand_mirror, "_oferta_vectores", _f)
    r = await espejo(db)
    fila = next(f for f in r["filas"]
                if f["dimension"] == "producto.recamaras" and str(f["valor"]) == "2")
    assert fila["oferta_satisface"] == 1        # 3 rec satisface 2+ — ya NO 'inexistente'
    assert fila["estado"] == "espejo"


@pytest.mark.asyncio
async def test_salud_del_dato_visible(monkeypatch):
    """Los rescates ya no viven solo en logs: el founder VE qué se rescató ('10+1'→10),
    qué se perdió ('PB') y qué llega limpio — por campo, con ejemplos."""
    import data_developments
    from demand_mirror import salud_oferta
    monkeypatch.setattr(data_developments, "DEVELOPMENTS", [
        {"id": "d1", "colonia": "Condesa", "units": [
            {"id": "u1", "precio_lista": 5000000, "m2": 80, "recamaras": 2, "piso": 3,
             "status": "disponible"},                                    # limpia
            {"id": "u2", "precio_lista": 6000000, "m2": 90, "bedrooms": "3",
             "piso": "10+1", "status": "disponible"},                    # piso RESCATADO
            {"id": "u3", "precio_lista": 7000000, "m2": 100, "recamaras": 2,
             "piso": "PB", "status": "disponible"},                      # piso PERDIDO
        ]}])
    db = _DB()
    r = await salud_oferta(db)
    assert r["n_unidades"] == 3
    assert r["por_campo"]["piso"] == {"presente": 1, "rescatado": 1, "perdido": 1}
    ej = {e["unit_id"]: e["diagnostico"] for e in r["ejemplos"]["piso"]}
    assert ej == {"u2": "rescatado", "u3": "perdido"}
    assert "RESCATADOS" in r["lectura"]


@pytest.mark.asyncio
async def test_data_negativa_con_edad_en_bitacora(monkeypatch):
    """Invisible desde hace 3 días ≠ invisible desde hace 3 meses: la edad sale del primer
    evento de la unidad en NUESTRA bitácora (sin depender de fechas de la fuente)."""
    import demand_mirror
    from demand_mirror import data_negativa
    from datetime import timedelta
    db = _DB()
    vieja = datetime.now(timezone.utc) - timedelta(days=45)
    await db.oferta_timeline.insert_one({"unit_id": "u-vieja", "ts": vieja.isoformat(), "hash": "h1"})
    unidades = [{"colonia": "condesa", "dev_id": "d1", "disponible": True, "unit_id": "u-vieja",
                 "precio": 5000000.0, "m2": 80.0, "vector": {}, "crudos": {}}]
    async def _f(db_, colonias=None):
        return unidades
    monkeypatch.setattr(demand_mirror, "_oferta_vectores", _f)
    r = await data_negativa(db)
    inv = r["unidades_invisibles"]
    assert inv["n"] == 1
    assert inv["muestra"][0]["unit_id"] == "u-vieja"
    assert 44 <= inv["muestra"][0]["dias_invisible"] <= 46
    assert 44 <= inv["edad_mediana_dias"] <= 46
