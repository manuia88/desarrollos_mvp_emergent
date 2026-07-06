"""CUBO TOTAL F3 — Atlax compilador de preguntas (cube_query_nl).

Fija: (1) el heurístico determinista entiende los patrones comunes en español (sin LLM),
(2) TODO pasa por el validador real del motor — un filtro inventado se descarta y se declara,
(3) parsear_pregunta nunca lanza y cachea, (4) dinero en español ('30 mil', '8 millones', '65 m²'
NO son 65 millones).
"""
import mongomock_motor
import pytest

import cube_query_nl as nl


@pytest.fixture()
def db():
    return mongomock_motor.AsyncMongoMockClient()["dmx_test"]


def test_dinero_espanol():
    assert nl._dinero("bajo $30,000 de mensualidad") == 30_000
    assert nl._dinero("menos de 30 mil") == 30_000
    assert nl._dinero("hasta 8 millones") == 8_000_000
    assert nl._dinero("medio millón") == 500_000
    assert nl._dinero("$8m de presupuesto") == 8_000_000
    assert nl._dinero("65 m² con balcón") is None          # m² NO son millones
    assert nl._dinero("sin números") is None


def test_heuristico_pregunta_founder():
    r = nl._heuristico("depas con balcón bajo $30 mil de mensualidad en Benito Juárez, por colonia")
    campos = {f["campo"]: f for f in r["filtros"]}
    assert r["universo"] == "unidades"
    assert campos["alcaldia"]["valor"] == "benito-juarez"
    assert campos["has_balcon"]["valor"] is True
    assert campos["mens_80_20"]["op"] == "lt" and campos["mens_80_20"]["valor"] == 30_000
    assert r["agrupar_por"] == ["colonia"]


def test_heuristico_multiples_features():
    r = nl._heuristico("departamentos con balcón y terraza")
    campos = {f["campo"] for f in r["filtros"]}
    assert {"has_balcon", "has_terraza"} <= campos          # sin break: las dos features entran


def test_heuristico_modo_zonas():
    r = nl._heuristico("colonias caminables y seguras en Coyoacán, por alcaldía")
    assert r["universo"] == "zonas"
    campos = {f["campo"]: f for f in r["filtros"]}
    assert campos["walkability"]["op"] == "gt"
    assert campos["seguridad_zona"]["op"] == "gt"
    assert campos["alcaldia"]["valor"] == "coyoacan"
    assert r["agrupar_por"] == ["alcaldia"]


def test_validacion_descarta_lo_invalido():
    # una propuesta (como si viniera del LLM) con un campo inventado y un op inválido
    p = {"universo": "unidades", "filtros": [
        {"campo": "precio", "op": "lt", "valor": 5_000_000},
        {"campo": "campo_inventado", "op": "eq", "valor": 1},
        {"campo": "m2", "op": "regex", "valor": ".*"},
    ], "agrupar_por": ["colonia", "precio"], "interpretacion": "x", "fuente": "llm"}
    r = nl._validar_propuesta(p)
    assert r["ok"] and [f["campo"] for f in r["filtros"]] == ["precio"]
    assert len(r["descartados"]) == 3                       # 2 filtros + 1 agrupación no agrupable
    assert r["agrupar_por"] == ["colonia"]


def test_validacion_campo_unidad_en_zonas_se_descarta():
    p = {"universo": "zonas", "filtros": [
        {"campo": "walkability", "op": "gt", "valor": 70},
        {"campo": "mens_80_20", "op": "lt", "valor": 30_000},   # campo de unidad → no aplica en zonas
    ], "agrupar_por": [], "interpretacion": "", "fuente": "llm"}
    r = nl._validar_propuesta(p)
    assert [f["campo"] for f in r["filtros"]] == ["walkability"]
    assert len(r["descartados"]) == 1


@pytest.mark.asyncio
async def test_parsear_pregunta_sin_llm_y_cache(db, monkeypatch):
    # sin key LLM → heurístico; nunca lanza
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    r = await nl.parsear_pregunta(db, "depas con balcón en Benito Juárez")
    assert r["ok"] and r["fuente"] == "heuristico"
    assert any(f["campo"] == "has_balcon" for f in r["filtros"])
    # segunda vez: sale del cache
    r2 = await nl.parsear_pregunta(db, "depas con balcón en Benito Juárez")
    assert r2.get("cached") is True
    # vacía → error declarado, no excepción
    r3 = await nl.parsear_pregunta(db, "   ")
    assert r3["ok"] is False


# ─── Regresión de los hallazgos de la review adversarial F3 ───────────────────

def test_valor_none_se_descarta_y_declara():
    """[review] un filtro del LLM con valor=None prometería filtrar y daría 0 en silencio."""
    p = {"universo": "unidades", "filtros": [
        {"campo": "precio", "op": "lt", "valor": None},
        {"campo": "has_balcon", "op": "eq", "valor": None},
        {"campo": "m2", "op": "between", "valor": 50},          # between sin [min,max]
        {"campo": "mens_80_20", "op": "exists", "valor": None}, # exists SÍ acepta None
    ], "agrupar_por": [], "interpretacion": "", "fuente": "llm"}
    r = nl._validar_propuesta(p)
    assert [f["campo"] for f in r["filtros"]] == ["mens_80_20"]
    assert len(r["descartados"]) == 3


def test_heuristico_pregunta_mixta_no_pierde_indices():
    """[review] 'depas en colonias caminables' es universo unidades PERO walkability se conserva."""
    r = nl._heuristico("depas con balcón en colonias caminables de benito juárez")
    assert r["universo"] == "unidades"
    campos = {f["campo"] for f in r["filtros"]}
    assert {"has_balcon", "walkability", "alcaldia"} <= campos


def test_heuristico_colonias_reales():
    """Con el catálogo real, el heurístico reconoce colonias (match largo primero)."""
    catalogo = ["roma-norte", "roma-sur", "narvarte", "del-valle-centro"]
    catalogo.sort(key=len, reverse=True)
    r = nl._heuristico("depas en roma norte con 2 baños y alberca", catalogo)
    campos = {f["campo"]: f for f in r["filtros"]}
    assert campos["colonia"]["valor"] == "roma-norte"
    assert campos["banos"]["op"] == "gte" and campos["banos"]["valor"] == 2
    assert campos["amenidades_edificio"]["valor"] == "alberca"


def test_heuristico_etapa_estado_y_rango():
    r = nl._heuristico("depas disponibles en preventa entre 3 millones y 5 millones")
    campos = {f["campo"]: f for f in r["filtros"]}
    assert campos["status"]["valor"] == "disponible"
    assert campos["etapa"]["valor"] == "preventa"
    assert campos["precio"]["op"] == "between" and campos["precio"]["valor"] == [3_000_000, 5_000_000]


def test_heuristico_amenidad_gym_token():
    """'gimnasio' mapea al token real del vocabulario compartido ('gym')."""
    r = nl._heuristico("departamentos con gimnasio y spa")
    valores = {f["valor"] for f in r["filtros"] if f["campo"] == "amenidades_edificio"}
    assert valores == {"gym", "spa"}
