"""CUBO TOTAL F2 — motor de consulta libre (cube_query_libre).

Fija: (1) filtros combinados con operadores sobre campos del registro, (2) None nunca matchea
(honesto: sin dato ≠ cumple), (3) agrupación con n + k-anon por celda, (4) overrides del dev
mandan sobre el seed, (5) validación de campos/operadores desconocidos.
"""
import mongomock_motor
import pytest

import cube_query_libre as Q


@pytest.fixture()
def db():
    return mongomock_motor.AsyncMongoMockClient()["dmx_test"]


def _unidad(uid, colonia, alcaldia, precio, m2, balcon, parking_n, mens, eng, status="disponible"):
    return {
        "unit_id": uid, "development_id": f"dev-{colonia}",
        "commercial": {"precio_lista_mxn": precio, "status": status},
        "areas": {"m2_privativo": m2, "m2_balcon": balcon},
        "interior": {"recamaras": 2, "banos_completos": 1},
        "parking": [{"arreglo": "lineal"}] * parking_n,
        "geo": {"colonia_id": colonia, "alcaldia": alcaldia},
        "finance": {"mens_80_20": mens, "enganche_min_pct": eng,
                    "banda_mensualidad": "20-30k", "banda_enganche": "10-20%"},
    }


async def _seed(db):
    await db.dmx_units.insert_many([
        _unidad("u1", "narvarte", "Benito Juárez", 3_250_000, 52, 4, 1, 27_638, 10),
        _unidad("u2", "narvarte", "Benito Juárez", 3_289_000, 52, 4, 1, 27_969, 10, status="vendido"),
        _unidad("u3", "napoles", "Benito Juárez", 5_900_000, 90, 0, 2, 50_100, 10),   # sin balcón, grande
        _unidad("u4", "polanco", "Miguel Hidalgo", 9_000_000, 120, 6, 2, 76_000, 20),  # otra alcaldía
        # sin finance (sin dato → NUNCA matchea filtros financieros)
        {"unit_id": "u5", "development_id": "dev-x", "commercial": {"precio_lista_mxn": 2_000_000, "status": "disponible"},
         "areas": {"m2_privativo": 50, "m2_balcon": 3}, "interior": {}, "parking": [{}],
         "geo": {"colonia_id": "narvarte", "alcaldia": "Benito Juárez"}},
    ])


FILTROS_FOUNDER = [
    {"campo": "alcaldia", "op": "eq", "valor": "Benito Juárez"},
    {"campo": "has_balcon", "op": "eq", "valor": True},
    {"campo": "m2", "op": "lt", "valor": 65},
    {"campo": "n_parking", "op": "gte", "valor": 1},
    {"campo": "enganche_min_pct", "op": "lte", "valor": 10},
    {"campo": "mens_80_20", "op": "lt", "valor": 30_000},
]


@pytest.mark.asyncio
async def test_corte_founder_completo(db):
    await _seed(db)
    r = await Q.consulta(db, FILTROS_FOUNDER, agrupar_por=["colonia"])
    assert r["ok"] and r["n"] == 2                       # u1+u2 (u3 sin balcón, u4 otra alcaldía, u5 sin finance)
    assert {u["unit_id"] for u in r["unidades"]} == {"u1", "u2"}
    assert r["kpis"]["absorcion_pct"] == 50.0            # 1 de 2 vendida
    assert r["kanon_ok"] is False                        # n=2 < 3 → etiquetado (god-view)
    g = r["grupos"][0]
    assert g["valores"] == {"colonia": "narvarte"} and g["n"] == 2 and g["kanon_ok"] is False


@pytest.mark.asyncio
async def test_sin_dato_nunca_matchea(db):
    await _seed(db)
    # u5 no tiene finance → un filtro financiero lo excluye SIEMPRE (no lo cuenta como que cumple)
    r = await Q.consulta(db, [{"campo": "mens_80_20", "op": "lt", "valor": 999_999}])
    assert "u5" not in {u["unit_id"] for u in r["unidades"]}
    # pero exists=False lo encuentra explícitamente
    r2 = await Q.consulta(db, [{"campo": "mens_80_20", "op": "exists", "valor": False}])
    assert {u["unit_id"] for u in r2["unidades"]} == {"u5"}


@pytest.mark.asyncio
async def test_override_del_dev_manda(db):
    await _seed(db)
    # el dev cambió el precio de u1 a 10M → un filtro precio<5M ya no la incluye
    await db.developer_unit_overrides.insert_one({"unit_id": "u1", "price": 10_000_000, "dev_id": "dev-narvarte"})
    r = await Q.consulta(db, [{"campo": "precio", "op": "lt", "valor": 5_000_000}])
    ids = {u["unit_id"] for u in r["unidades"]}
    assert "u1" not in ids and "u2" in ids


@pytest.mark.asyncio
async def test_validacion(db):
    r = await Q.consulta(db, [{"campo": "hackeo", "op": "eq", "valor": 1}])
    assert r["ok"] is False and any("desconocido" in e.lower() for e in r["errores"])
    r2 = await Q.consulta(db, [{"campo": "precio", "op": "regex", "valor": ".*"}])
    assert r2["ok"] is False
    r3 = await Q.consulta(db, [], agrupar_por=["precio"])   # no agrupable
    assert r3["ok"] is False


def test_campos_disponibles():
    d = Q.campos_disponibles()
    keys = {c["key"] for c in d["campos"]}
    assert {"alcaldia", "colonia", "m2", "has_balcon", "n_parking",
            "mens_80_20", "enganche_min_pct", "precio", "status"} <= keys
    assert d["k_anon"] == 3


@pytest.mark.asyncio
async def test_modo_zona_universo_colonias(db):
    """Universo 'zonas': el corte es sobre COLONIAS (con índices), no unidades — escala a toda la ciudad."""
    # ie_scores usa slug corto (como en prod: 'polanco', 'condesa'); zone_id == colonia.id
    await db.ie_scores.insert_many([
        {"code": "IE_COL_N08_WALKABILITY_MX", "zone_id": "roma-norte", "value": 95, "is_stub": False},
        {"code": "IE_COL_N06_SCHOOL_PREMIUM", "zone_id": "roma-norte", "value": 80, "is_stub": False},
        {"code": "IE_COL_N08_WALKABILITY_MX", "zone_id": "napoles", "value": 40, "is_stub": False},
        {"code": "IE_COL_N08_WALKABILITY_MX", "zone_id": "condesa", "value": 88, "is_stub": False},  # prefijo
        {"code": "IE_COL_N08_WALKABILITY_MX", "zone_id": "stub-zone", "value": 99, "is_stub": True},  # stub NO cuenta
    ])
    await db.colonias.insert_many([
        {"id": "roma-norte", "name": "Roma Norte", "alcaldia": "Cuauhtémoc"},
        {"id": "napoles", "name": "Nápoles", "alcaldia": "Benito Juárez"},
        {"id": "condesa-cuauhtemoc", "name": "Condesa", "alcaldia": "Cuauhtémoc"},  # solo slug largo en catálogo
    ])
    # todas las colonias con índice real (3, el stub excluido)
    r = await Q.consulta(db, [], ["alcaldia"], universo="zonas")
    assert r["ok"] and r["universo"] == "zonas" and r["n"] == 3
    # alcaldía resuelta por prefijo: 'condesa' (índice) → 'condesa-cuauhtemoc' (catálogo) → Cuauhtémoc
    condesa = next(c for c in r["colonias"] if c["colonia"] == "condesa")
    assert condesa["alcaldia"] == "cuauhtemoc"
    # filtro de zona: solo caminables >90 → roma-norte
    r2 = await Q.consulta(db, [{"campo": "walkability", "op": "gt", "valor": 90}], universo="zonas")
    assert {c["colonia"] for c in r2["colonias"]} == {"roma-norte"}
    # en modo zona, un campo de UNIDAD es inválido (no aplica)
    r3 = await Q.consulta(db, [{"campo": "mens_80_20", "op": "lt", "valor": 20000}], universo="zonas")
    assert r3["ok"] is False and any("no aplica" in e for e in r3["errores"])


@pytest.mark.asyncio
async def test_campos_incluye_zona_y_universos(db):
    d = Q.campos_disponibles()
    assert set(d["universos"]) == {"unidades", "zonas"}
    zk = {c["key"] for c in d["campos"] if c.get("zona")}
    assert {"walkability", "escuelas_zona", "gentrificacion_zona", "riesgo_zona", "colonia", "alcaldia"} <= zk
    # un campo de unidad NO está marcado como zona
    assert not next(c for c in d["campos"] if c["key"] == "mens_80_20")["zona"]
