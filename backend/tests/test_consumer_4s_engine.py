"""Tests de los 4 upgrades de inteligencia del consumidor 4S (superadmin-only)."""
import pytest

from market_4s_loader import load_market_4s
from consumer_4s_engine import (
    wtp_snapshot, producto_ideal, score_verde, validar_plusvalia, inteligencia_consumidor,
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

    async def update_one(self, key, update, upsert=False):
        k = tuple(sorted(key.items()))
        self.docs[k] = {**self.docs.get(k, {}), **update.get("$set", {})}

    async def create_index(self, *a, **k):
        return None

    async def find_one(self, q=None, proj=None):
        q = q or {}
        for d in self.docs.values():
            if all(d.get(kk) == vv for kk, vv in q.items()):
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


async def _db_cargada():
    db = _DB()
    await load_market_4s(db)
    return db


# ── 1 · WTP ────────────────────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_wtp_snapshot_real():
    db = await _db_cargada()
    r = await wtp_snapshot(db)
    assert r["es_estimado"] is False
    assert len(r["zonas"]) == 3                        # insurgentes / periferico / coyoacan
    assert r["enganche_mas_comun_pct"] == 20
    assert r["descuento_mas_atractivo_pct"] == 10
    # tope de mantenimiento por zona + tarifa $/m² derivada del m² real de la zona
    coy = next(z for z in r["zonas"] if z["zona"] == "coyoacan")
    assert coy["mantenimiento_tope_mxn"] == {"min": 3000, "max": 3600}
    assert coy["elevautos_decisivo_pct"] == 65
    assert coy["tarifa_tope_m2"] and coy["tarifa_tope_m2"] > 0
    # tolerancia por sub-zona: insurgentes toma la mayor (92)
    ins = next(z for z in r["zonas"] if z["zona"] == "insurgentes")
    assert ins["tolerancia_precio_mas_8pct_si_pct"] == 92


# ── 2 · Producto ideal ─────────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_producto_ideal_spec_dominante():
    db = await _db_cargada()
    r = await producto_ideal(db)
    assert r["es_estimado"] is False
    assert r["spec"]["recamaras"]["opcion"] == "2"     # 2 rec domina (47-56%)
    assert r["spec"]["banos"]["opcion"] == "2"
    assert r["spec"]["cocina"]["opcion"] == "abierta_con_barra"
    assert r["intencion_habitar_pct"]["max"] >= 80     # mercado para habitar
    assert "distribucion_completa" in r                # hipergranular: todo el detalle


# ── 3 · Score verde ────────────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_score_verde_rankea():
    db = await _db_cargada()
    r = await score_verde(db)
    assert r["es_estimado"] is False
    assert len(r["ranking"]) >= 5
    mids = [x["pct_mid"] for x in r["ranking"]]
    assert mids == sorted(mids, reverse=True)          # ordenado por impacto
    assert isinstance(r["imprescindibles"], list)


# ── 4 · Plusvalía validada ─────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_validar_plusvalia_prima_y_premium():
    db = await _db_cargada()
    r = await validar_plusvalia(db)
    assert r["es_estimado"] is False
    assert len(r["estudios"]) == 3
    ins = next(e for e in r["estudios"] if e["estudio"] == "insurgentes")
    # prima de mercado: reventa 69,974 vs avalúo 54,458 → +28.5%
    assert ins["prima_mercado_vs_avaluo_pct"] == pytest.approx(28.5, abs=0.1)
    assert "caliente" in ins["veredicto"].lower()
    # premium de obra nueva vs reventa (los comps 4S son más caros/m²)
    assert ins["premium_obra_nueva_pct"] is not None


# ── master ─────────────────────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_inteligencia_consumidor_fusiona_4():
    db = await _db_cargada()
    r = await inteligencia_consumidor(db)
    assert set(r) >= {"wtp", "producto_ideal", "score_verde", "plusvalia"}
    assert r["es_estimado"] is False


@pytest.mark.asyncio
async def test_sin_dato_es_estimado_honesto():
    db = _DB()                                          # sin cargar 4S
    r = await inteligencia_consumidor(db)
    assert r["es_estimado"] is True                     # no inventa
