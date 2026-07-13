"""Test del loader de dato real 4S — verifica la transformación (velocidad real, procedencia) sin Mongo."""
import pytest

from market_4s_loader import load_market_4s, _velocidad


class _FakeCollection:
    def __init__(self):
        self.docs = {}

    async def update_one(self, key, update, upsert=False):
        # clave natural serializable
        k = tuple(sorted(key.items()))
        self.docs[k] = {**self.docs.get(k, {}), **update.get("$set", {})}

    async def create_index(self, *a, **k):
        return None


class _FakeDB:
    def __init__(self):
        self._cols = {}

    def __getattr__(self, name):
        return self._cols.setdefault(name, _FakeCollection())


@pytest.mark.asyncio
async def test_velocidad_real():
    # velocidad = vendidas / meses en mercado (el número que reemplaza el proxy _MESES_STAGE)
    assert _velocidad(372, 39) == round(372 / 39, 2)   # Edison Park ≈ 9.54 u/mes
    assert _velocidad(0, 3) == 0.0                       # sin ventas
    assert _velocidad(10, 0) is None                     # sin meses → None (no inventa)
    assert _velocidad(None, None) is None


@pytest.mark.asyncio
async def test_load_market_4s_carga_39_proyectos_con_procedencia():
    db = _FakeDB()
    summary = await load_market_4s(db)

    # 39 proyectos reales de los 3 estudios
    assert summary["proyectos"] == 39
    assert summary["demanda_segmentos"] == 9   # Insurgentes 2 + Antonio Caso 3 + Periférico 2 + Coyoacán 2
    assert summary["wtp"] == 1
    assert summary["fuente"] == "4s_2026-05"

    # cada proyecto quedó marcado REAL (no estimado) con velocidad derivada
    proyectos = list(db.market_comps_4s.docs.values())
    assert len(proyectos) == 39
    for p in proyectos:
        assert p["fuente"] == "4s_2026-05"
        assert p["es_estimado"] is False
        # velocidad presente y coherente (vendidas/meses) cuando hay meses
        if p.get("tiempo_en_mercado_meses"):
            assert p["velocidad_mensual_real"] == round(p["unidades_vendidas"] / p["tiempo_en_mercado_meses"], 2)

    # Edison Park: absorción histórica alta, chequeo puntual
    edison = next(p for p in proyectos if p["proyecto"] == "Edison Park")
    assert edison["unidades_vendidas"] == 372
    assert edison["velocidad_mensual_real"] == round(372 / 39, 2)
    assert edison["absorcion_pct"] == round(100 * 372 / 427, 1)


@pytest.mark.asyncio
async def test_demanda_gap_cargado():
    db = _FakeDB()
    await load_market_4s(db)
    seg = list(db.demanda_4s.docs.values())
    assert len(seg) == 9
    # el GAP (demanda − inventario) viene del estudio, es dato real
    insurgentes_resid = next(s for s in seg if s["estudio"] == "insurgentes" and s["segmento"] == "Residencial")
    assert insurgentes_resid["gap_vertical_3anos"] == 2479
    assert insurgentes_resid["venta_mensual"] == 69
    assert insurgentes_resid["fuente"] == "4s_2026-05"
