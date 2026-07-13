"""Tests Ola C: precio sombra, liquidez, screener, curva vertical, land bank, corredores,
set competitivo, inexistente→brief."""
from datetime import datetime, timezone

import pytest

import demand_mirror
from demand_genome import explotar_busquedas
from market_scores_engine import precio_sombra, score_liquidez, screener, curva_vertical, land_bank
from demand_graph_engine import corredores, set_competitivo, inexistente_a_brief


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


def _u(uid, colonia, precio, m2, piso=1, rec=2, feats=(), disponible=True, dev="d1"):
    vec = {"producto.recamaras": str(rec)}
    for f in feats:
        vec[f"producto.feature.{f}"] = "si"
    return {"colonia": colonia, "dev_id": dev, "disponible": disponible, "unit_id": uid,
            "precio": precio, "m2": m2, "piso": piso, "recamaras": rec, "vector": vec}


# edificio d1: 5 con balcón (~$120k/m²) + 5 sin (~$100k/m²) + gema/caro (mismo estrato 60m²/2rec)
# edificio d2: base piso 1 ($110k) + tres piso 8 (~$130k) → prima de altura INTRA-edificio
_UNIDADES = (
    [_u(f"b{i}", "condesa", 120000 * 60, 60, piso=i % 4 + 1, feats=("balcon",)) for i in range(5)]
    + [_u(f"s{i}", "condesa", 100000 * 60, 60, piso=i % 4 + 1) for i in range(5)]
    + [_u("gema", "condesa", 80000 * 60, 60, piso=2, feats=("balcon",))]     # infravalorada
    + [_u("caro", "condesa", 150000 * 60, 60, piso=3)]                        # sobrevalorada
    + [_u("alto0", "condesa", 110000 * 60, 60, piso=1, dev="d2"),
       _u("alto", "condesa", 130000 * 60, 60, piso=8, dev="d2"),
       _u("alto2", "condesa", 132000 * 60, 60, piso=8, dev="d2"),
       _u("alto3", "condesa", 128000 * 60, 60, piso=8, dev="d2")]
)


def _patch(monkeypatch):
    async def _f(db, colonias=None):
        return [u for u in _UNIDADES if not colonias or u["colonia"] in colonias]
    monkeypatch.setattr(demand_mirror, "_oferta_vectores", _f)


@pytest.mark.asyncio
async def test_c1_precio_sombra_balcon(monkeypatch):
    _patch(monkeypatch)
    r = await precio_sombra(_DB(), {"condesa"})
    balcon = next(s for s in r["sombras"] if s["feature"] == "balcon")
    assert balcon["sombra_pm2"] > 10000              # el balcón cotiza (~+$13-20k/m² con la gema)
    assert balcon["n_con"] >= 3 and balcon["n_sin"] >= 3
    assert "balcon" in r["lectura"]


@pytest.mark.asyncio
async def test_c2_liquidez_rankea_por_demanda(monkeypatch):
    _patch(monkeypatch)
    db = _DB()
    now = datetime.now(timezone.utc)
    for i in range(6):   # la demanda pide balcón en condesa → unidades con balcón = más líquidas
        await db.marketplace_searches.insert_one({"id": f"q{i}", "visitor_id": f"v{i}",
                                                  "colonias": ["Condesa"], "created_at_dt": now,
                                                  "recamaras_min": 2, "features_pedidos": ["balcón"]})
    await explotar_busquedas(db)
    r = await score_liquidez(db, {"condesa"})
    assert r["es_estimado"] is False
    top = r["unidades"][0]
    assert "balcon" in str(next(u for u in _UNIDADES if u["unit_id"] == top["unit_id"])["vector"])
    assert top["banda"] == "alta"


@pytest.mark.asyncio
async def test_c3_screener_detecta_gema_y_caro(monkeypatch):
    _patch(monkeypatch)
    r = await screener(_DB(), {"condesa"})
    infra = {f["unit_id"] for f in r["infravaloradas"]}
    sobre = {f["unit_id"] for f in r["sobrevaloradas"]}
    assert "gema" in infra                            # $80k/m² con balcón vs justo ~$120k
    assert "caro" in sobre                            # $150k/m² sin balcón vs justo ~$100k
    assert all(f["n_comparables"] >= 3 for f in r["infravaloradas"])


@pytest.mark.asyncio
async def test_c5_curva_vertical_intra_edificio(monkeypatch):
    """HARDENING: la prima se mide dentro del MISMO edificio (d2: piso 8 vs su propio piso 1)."""
    _patch(monkeypatch)
    r = await curva_vertical(_DB(), {"condesa"})
    assert r["control"] == "intra-edificio (dev_id)"
    assert r["n_edificios"] == 2                      # d1 (niveles 1-4) y d2 (1 y 8)
    assert r["es_estimado"] is False
    nivel8 = next(n for n in r["niveles"] if n["nivel"] == 8)
    assert nivel8["prima_vs_base_pct"] > 5            # ~+18% vs el piso 1 del MISMO edificio
    assert nivel8["n_edificios"] == 1


@pytest.mark.asyncio
async def test_c8_land_bank_rankea(monkeypatch):
    _patch(monkeypatch)
    db = _DB()
    now = datetime.now(timezone.utc)
    for i in range(9):
        await db.marketplace_searches.insert_one({"id": f"lb{i}", "visitor_id": f"w{i}",
                                                  "colonias": ["Condesa"], "created_at_dt": now,
                                                  "recamaras_min": 2})
    await explotar_busquedas(db)
    await db.colonias.insert_one({"name": "Condesa", "alcaldia": "Cuauhtémoc", "cus": 3.5,
                                  "zonif_niveles": 6, "precio_pm2": 110000, "vsuelo_pm2_catastral": 22000})
    await db.colonias.insert_one({"name": "Sin Demanda", "alcaldia": "X", "cus": 2,
                                  "zonif_niveles": 3, "precio_pm2": 50000, "vsuelo_pm2_catastral": 25000})
    r = await land_bank(db)
    assert r["top"][0]["colonia"] == "Condesa"        # demanda + brecha 5x + 6 niveles gana
    assert r["top"][0]["rank"] == 1
    assert r["top"][0]["brecha_mercado_suelo"] == 5.0
    assert "Condesa" in r["lectura"]


@pytest.mark.asyncio
async def test_c6_corredores_colonias_que_comparten_buscadores():
    db = _DB()
    now = datetime.now(timezone.utc)
    for i in range(4):   # 4 visitantes buscan en Condesa Y Roma Norte
        for col in ("Condesa", "Roma Norte"):
            await db.marketplace_searches.insert_one({"id": f"c{i}{col[:2]}", "visitor_id": f"x{i}",
                                                      "colonias": [col], "created_at_dt": now,
                                                      "recamaras_min": 2})
    await explotar_busquedas(db)
    r = await corredores(db)
    top = r["corredores"][0]
    assert {top["colonia_a"], top["colonia_b"]} == {"condesa", "roma norte"}
    assert top["buscadores_compartidos"] == 4
    assert top["traslape_pct"] == 100.0               # todos los de una buscan en la otra


@pytest.mark.asyncio
async def test_c7_set_competitivo_por_covistas():
    db = _DB()
    for i in range(5):   # 5 visitantes vieron u1 Y u2; 1 vio u1 y u9
        await db.buyer_signals.insert_one({"type": "unit_view", "visitor_id": f"z{i}", "entity_id": "u1"})
        await db.buyer_signals.insert_one({"type": "unit_view", "visitor_id": f"z{i}", "entity_id": "u2"})
    await db.buyer_signals.insert_one({"type": "unit_view", "visitor_id": "z9", "entity_id": "u1"})
    await db.buyer_signals.insert_one({"type": "unit_view", "visitor_id": "z9", "entity_id": "u9"})
    r = await set_competitivo(db, unit_id="u1")
    assert r["rivales"][0] == {"rival": "u2", "co_vistas": 5}   # el rival REAL de u1
    assert "u2" in r["lectura"]


@pytest.mark.asyncio
async def test_c4_inexistente_se_despacha_al_dev(monkeypatch):
    _patch(monkeypatch)
    db = _DB()
    now = datetime.now(timezone.utc)
    for i in range(7):   # 7 piden roof_garden en condesa — ninguna unidad lo tiene
        await db.marketplace_searches.insert_one({"id": f"rg{i}", "visitor_id": f"y{i}",
                                                  "colonias": ["Condesa"], "created_at_dt": now,
                                                  "features_pedidos": ["roof garden"]})
    await explotar_busquedas(db)
    r = await inexistente_a_brief(db, {"condesa"}, actor="test@dmx")
    assert r["ok"] is True and r["despachado"] is True
    assert any(l["valor"] == "roof_garden" for l in r["llaves"])
    acciones = [d for d in db.cube_actions.docs.values() if d.get("destino") == "dev"]
    assert len(acciones) == 1                          # quedó en el buzón del dev
    assert acciones[0]["payload"]["tipo"] == "inexistente_genoma"
