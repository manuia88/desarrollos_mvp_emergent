"""dmx_demand._zone_demand — demanda REAL multi-fuente + fallback honesto (no inventario).

Fija el fix del bug del proxy invertido: (1) con señal real (conducta materializada) la demanda es
proporcional a la señal, no al inventario; (2) sin ninguna señal real cae a un fallback UNIFORME —
NUNCA al inventario, así el ranking cross-colonia jamás se invierte. Las fuentes de agregación
(vistas/búsquedas) se ejercitan en el smoke sobre DB real; aquí probamos el combinador y el fallback.
"""
from datetime import datetime, timezone

import mongomock_motor
import pytest

import dmx_demand
import data_seed


@pytest.fixture()
def db():
    return mongomock_motor.AsyncMongoMockClient()["dmx_test"]


@pytest.mark.asyncio
async def test_real_signal_drives_demand_not_inventory(db):
    """Con conducta real (facts_buyer_signals), la demanda sigue la señal: más señal → más demanda."""
    await db.facts_buyer_signals.insert_many([
        {"scope": "colonia", "colonia": "roma-norte", "total_signals": 100},
        {"scope": "colonia", "colonia": "polanco", "total_signals": 40},
        {"scope": "development", "entity_id": "dev-x", "total_signals": 999},   # NO cuenta (no es colonia)
    ])
    demand, is_proxy, sources = await dmx_demand._zone_demand(db)
    assert is_proxy is False
    assert "conducta" in sources
    # roma-norte (100) > polanco (40); normalizado a max=100, con peso 1.6 → 1.6 y 0.64
    assert demand["roma-norte"] == pytest.approx(1.6, abs=0.001)
    assert demand["polanco"] == pytest.approx(0.64, abs=0.001)
    assert demand["roma-norte"] > demand["polanco"]
    assert "dev-x" not in demand


@pytest.mark.asyncio
async def test_fallback_is_uniform_never_inventory(db):
    """Sin ninguna señal real → is_proxy=True y demanda UNIFORME (todas =1.0). El inventario NO participa:
    dos colonias con inventario distinto obtienen la MISMA demanda (antes se invertía por inventario)."""
    demand, is_proxy, sources = await dmx_demand._zone_demand(db)
    assert is_proxy is True
    assert sources == []
    assert demand, "el fallback debe sembrar demanda uniforme desde COLONIAS"
    # todas las colonias del seed valen exactamente 1.0 (uniforme)
    assert set(demand.values()) == {1.0}

    # y explícitamente: dos colonias con inventario distinto → misma demanda (no inversión por stock)
    by_inv = sorted(
        [(str(c.get("id") or "").strip().lower(), c.get("inventory") or 0) for c in data_seed.COLONIAS if c.get("id")],
        key=lambda x: x[1])
    if len(by_inv) >= 2:
        low_inv, high_inv = by_inv[0][0], by_inv[-1][0]
        if by_inv[0][1] != by_inv[-1][1]:   # solo si de verdad difieren en inventario
            assert demand.get(low_inv) == demand.get(high_inv) == 1.0


@pytest.mark.asyncio
async def test_conducta_weighted_above_raw_count(db):
    """La conducta (facts) alimenta la demanda aun cuando vistas/búsquedas están vacías (fail-open de esas)."""
    await db.facts_buyer_signals.insert_one(
        {"scope": "colonia", "colonia": "condesa", "total_signals": 7})
    demand, is_proxy, sources = await dmx_demand._zone_demand(db)
    assert is_proxy is False
    assert sources == ["conducta"]
    # única colonia con señal → normalizada a su propio máximo (1.0) × peso 1.6
    assert demand["condesa"] == pytest.approx(1.6, abs=0.001)


@pytest.mark.asyncio
async def test_search_floor_filters_noise(db):
    """Piso de muestra: una colonia con <3 búsquedas es ruido y NO cuenta como demanda medida; ≥3 sí."""
    now = datetime.now(timezone.utc)
    docs = ([{"colonias": ["hotcol"], "created_at_dt": now} for _ in range(4)]
            + [{"colonias": ["noisecol"], "created_at_dt": now} for _ in range(2)])
    await db.marketplace_searches.insert_many(docs)
    demand, is_proxy, sources = await dmx_demand._zone_demand(db)
    assert "busquedas" in sources          # (si falla aquí, mongomock no corrió el aggregate — ver smoke en DB real)
    assert "hotcol" in demand              # 4 búsquedas ≥ piso → cuenta
    assert "noisecol" not in demand        # 2 búsquedas < piso → ruido, no cuenta
    assert is_proxy is False
