"""Tests Ola B3: generador de reportes por menú (registro de bloques, aislamiento, cortes)."""
from datetime import datetime, timezone

import pytest

from report_builder import BLOQUES, catalogo, generar_reporte
from demand_genome import explotar_busquedas
from market_4s_loader import load_market_4s
from market_4s_facts import load_facts_4s


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

    async def find_one(self, q=None, proj=None):
        q = q or {}
        simple = {k: v for k, v in q.items() if not isinstance(v, dict)}
        for d in self.docs.values():
            if all(d.get(kk) == vv for kk, vv in simple.items()):
                return d
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


async def _db_full():
    db = _DB()
    await load_market_4s(db)
    await load_facts_4s(db)
    now = datetime.now(timezone.utc)
    for i in range(5):
        await db.marketplace_searches.insert_one({
            "id": f"r{i}", "visitor_id": f"v{i}", "colonias": ["Tabacalera"], "created_at_dt": now,
            "recamaras_min": 2, "precio_max": 4500000, "features_pedidos": ["balcón"],
        })
    await explotar_busquedas(db)
    return db


def test_catalogo_es_el_menu():
    c = catalogo()
    ids = {b["id"] for b in c["bloques"]}
    assert len(ids) == len(BLOQUES) >= 19
    assert {"demanda_viva", "espejo", "escasez", "brief_4s", "contraste_4s", "gap_radar",
            "precio_sombra", "screener", "land_bank", "set_competitivo"} <= ids
    assert all(b["titulo"] and b["desc"] for b in c["bloques"])


def test_catalogo_server_driven_declara_necesita_y_acciones():
    """La MEJOR forma del guiado-por-datos: cada bloque se auto-describe — el front pinta
    inputs (necesita) y botones de autorización (acciones) desde aquí, sin cablearse."""
    c = {b["id"]: b for b in catalogo()["bloques"]}
    assert c["set_competitivo"]["necesita"] == ["unit_id"]        # → input de unidad aparece solo
    assert c["brief_4s"]["necesita"] == ["estudio"]
    # las acciones (botones de despacho al dev) SOLO existen donde el founder autoriza
    acc_brief = c["brief_4s"]["acciones"][0]
    assert acc_brief["metodo"] == "POST" and "despachar" in acc_brief["endpoint"]
    assert "autorizo" in acc_brief["titulo"].lower() or "Autorizas" in acc_brief["confirmacion"]
    acc_esc = c["escasez"]["acciones"][0]
    assert "inexistente-a-brief" in acc_esc["endpoint"]
    # los bloques de solo-consulta NO llevan acciones (nada llega al dev sin botón)
    assert c["demanda_viva"]["acciones"] == [] and c["screener"]["acciones"] == []


@pytest.mark.asyncio
async def test_bloque_set_competitivo_con_unidad():
    db = await _db_full()
    for i in range(3):
        await db.buyer_signals.insert_one({"type": "unit_view", "visitor_id": f"q{i}", "entity_id": "uA"})
        await db.buyer_signals.insert_one({"type": "unit_view", "visitor_id": f"q{i}", "entity_id": "uB"})
    r = await generar_reporte(db, bloques=["set_competitivo"], unit_id="uA")
    s = r["secciones"][0]
    assert s["rivales"][0]["rival"] == "uB"
    # sin unit_id → honesto
    r2 = await generar_reporte(db, bloques=["set_competitivo"])
    assert r2["secciones"][0]["procedencia"] == "sin_dato"


@pytest.mark.asyncio
async def test_reporte_a_la_medida_territorio_y_bloques():
    db = await _db_full()
    r = await generar_reporte(db, colonias=["Tabacalera"], estudio="puente_alvarado",
                              bloques=["demanda_viva", "brief_4s", "gap_radar"])
    assert r["n_bloques"] == 3
    sec = {s["bloque"]: s for s in r["secciones"]}
    assert sec["demanda_viva"]["procedencia"] == "observado"
    assert sec["demanda_viva"]["n_senales"] >= 15                  # 5 búsquedas × 3+ dims
    assert sec["brief_4s"]["procedencia"] == "medido"
    assert sec["brief_4s"]["producto"]["dormitorios"]["opcion"] == "2"
    assert sec["gap_radar"]["fuente"] == "real"
    assert r["territorio"]["colonias"] == ["tabacalera"]


@pytest.mark.asyncio
async def test_reporte_con_corte_hipersegmentado():
    db = await _db_full()
    r = await generar_reporte(db, colonias=["Tabacalera"], bloques=["demanda_viva"],
                              cortes={"dimension": "producto.recamaras", "valor": "2"})
    filas = r["secciones"][0]["filas"]
    assert filas and all(f["dimension"] == "producto.recamaras" and f["valor"] == "2" for f in filas)


@pytest.mark.asyncio
async def test_bloque_desconocido_honesto_y_aislado():
    db = await _db_full()
    r = await generar_reporte(db, bloques=["demanda_viva", "bloque_inventado"])
    sec = {s["bloque"]: s for s in r["secciones"]}
    assert "error" in sec["bloque_inventado"]                       # honesto
    assert "n_senales" in sec["demanda_viva"]                       # y el resto del reporte VIVE


@pytest.mark.asyncio
async def test_bloques_que_requieren_estudio_son_honestos_sin_el():
    db = await _db_full()
    r = await generar_reporte(db, colonias=["Tabacalera"], bloques=["equilibrio_4s", "brief_4s"])
    for s in r["secciones"]:
        assert s.get("procedencia") == "sin_dato"                   # sin estudio → lo dice, no truena
