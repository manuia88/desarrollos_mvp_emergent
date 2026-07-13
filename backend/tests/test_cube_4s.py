"""Tests del Cubo 4S: compilador de átomos (macro→nano) + las 4 lentes de consulta."""
import pytest

from market_4s_facts import compilar_facts, load_facts_4s
from cube_4s_engine import catalogo, corte, comparar, nano, dimensiones_nano


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
        k = tuple(sorted((kk, str(vv)) for kk, vv in key.items()))
        self.docs[k] = {**self.docs.get(k, {}), **update.get("$set", {})}

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


# ── compilador ────────────────────────────────────────────────────────────────
def test_compila_mas_de_2000_atomos_de_4_estudios():
    facts = compilar_facts()
    assert len(facts) > 2000
    estudios = {f["estudio"] for f in facts}
    assert estudios == {"coyoacan", "insurgentes_antonio_caso", "periferico", "puente_alvarado"}
    # todo átomo trae dimensiones completas y procedencia
    for f in facts[:50]:
        assert f["tema"] and f["pregunta"] and f["opcion"]
        assert f["fuente"] == "4s_granular_2026"
        assert f["es_estimado"] is False


def test_atomos_nano_con_corte_etapa_de_vida():
    facts = compilar_facts()
    nano_facts = [f for f in facts if f["corte"].get("etapa_vida")]
    assert len(nano_facts) >= 80
    # el ejemplo canónico: lock-off × pareja joven con hijos en Puente de Alvarado = 14%
    ej = next(f for f in nano_facts
              if f["estudio"] == "puente_alvarado" and "lockoff" in f["opcion"]
              and f["corte"]["etapa_vida"] == "pareja_joven_hijos_0_10")
    assert ej["valor"] == 14
    assert ej["pagina"] == 50            # procedencia exacta


def test_atomos_por_subzona_encuesta():
    facts = compilar_facts()
    subz = [f for f in facts if f["corte"].get("subzona_encuesta")]
    assert len(subz) >= 50               # presupuesto/edad/ingreso por Insurgentes vs Antonio Caso
    ins = [f for f in subz if f["corte"]["subzona_encuesta"] == "insurgentes"]
    assert ins, "Insurgentes debe tener átomos por subzona"


# ── lentes ────────────────────────────────────────────────────────────────────
async def _db_cargada():
    db = _DB()
    await load_facts_4s(db)
    return db


@pytest.mark.asyncio
async def test_catalogo_es_el_menu():
    db = await _db_cargada()
    c = await catalogo(db)
    assert c["n_atomos"] > 2000
    assert len(c["estudios"]) == 4
    temas = {t["tema"] for e in c["estudios"] for t in e["temas"]}
    assert {"producto", "esquema_pago", "amenidades", "movilidad", "estilo_vida"} <= temas


@pytest.mark.asyncio
async def test_corte_micro():
    db = await _db_cargada()
    r = await corte(db, estudio="periferico", tema="producto", pregunta="cocina_pct")
    assert r["n"] == 3
    assert r["atomos"][0]["opcion"] == "cerrada"       # Periférico quiere cocina CERRADA (51%)
    assert r["atomos"][0]["valor"] == 51


@pytest.mark.asyncio
async def test_comparar_macro_detecta_diferencias_entre_zonas():
    db = await _db_cargada()
    r = await comparar(db, tema="producto", pregunta="cocina_pct")
    assert len(r["estudios"]) == 4
    assert r["zonas_difieren"] is True                  # cerrada en Periférico vs abierta en el resto
    assert r["top_por_estudio"]["periferico"]["opcion"] == "cerrada"
    assert r["top_por_estudio"]["coyoacan"]["opcion"] == "abierta_con_barra"


@pytest.mark.asyncio
async def test_nano_todo_de_una_etapa_de_vida():
    db = await _db_cargada()
    r = await nano(db, estudio="puente_alvarado", corte_valor="pareja_joven_hijos_0_10")
    assert r["n_atomos"] >= 8
    assert any("modelo_x_etapa_vida" in k for k in r["por_pregunta"])
    assert "lockoff" in r["lectura"] or r["n_atomos"] > 0


@pytest.mark.asyncio
async def test_dimensiones_nano_disponibles():
    db = await _db_cargada()
    dims = await dimensiones_nano(db)
    assert "etapa_vida" in dims and "intencion" in dims and "subzona_encuesta" in dims
    assert "pareja_joven_hijos_0_10" in dims["etapa_vida"]


@pytest.mark.asyncio
async def test_sin_atomos_honesto():
    db = _DB()                                          # sin cargar
    c = await catalogo(db)
    assert c["es_estimado"] is True and c["n_atomos"] == 0
