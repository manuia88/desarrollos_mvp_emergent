"""F2 · lente Demanda del Hub — el cross-cut une la demanda por colonia.

Fija el contrato de `_join_colonia_demand`: (1) sin dim `zone` no une nada; (2) con `zone` inyecta
demand_interactions/visitors/interest + tensión demanda↔oferta desde facts_buyer_signals (k-anon ≥3
ya aplicado aguas arriba); (3) match por slug de colonia; (4) fail-open sin datos.
"""
import mongomock_motor
import pytest

import cube_olap_engine as olap


@pytest.fixture()
def db():
    return mongomock_motor.AsyncMongoMockClient()["dmx_test"]


def _matrix():
    # 3 celdas por colonia con inventario disponible distinto
    return [
        {"zone": "roma-norte", "kpis": {"units_total": 60, "units_available": 48}},
        {"zone": "polanco", "kpis": {"units_total": 130, "units_available": 124}},
        {"zone": "napoles", "kpis": {"units_total": 64, "units_available": 64}},   # sin demanda
    ]


async def _seed_demand(db):
    await db.facts_buyer_signals.insert_many([
        {"scope": "colonia", "colonia": "roma-norte", "total_signals": 550, "distinct_visitors": 5, "interest_score": 507.1},
        {"scope": "colonia", "colonia": "polanco", "total_signals": 328, "distinct_visitors": 13, "interest_score": 216.3},
        {"scope": "development", "entity_id": "dev-x", "total_signals": 999, "distinct_visitors": 9, "interest_score": 10.0},
    ])


@pytest.mark.asyncio
async def test_no_join_without_zone_dimension(db):
    await _seed_demand(db)
    matrix = _matrix()
    joined = await olap._join_colonia_demand(db, matrix, dimensions=["property_type", "price_tier"])
    assert joined is False
    assert all("demand_interactions" not in c["kpis"] for c in matrix)


@pytest.mark.asyncio
async def test_join_injects_demand_and_tension(db):
    await _seed_demand(db)
    matrix = _matrix()
    joined = await olap._join_colonia_demand(db, matrix, dimensions=["zone"])
    assert joined is True
    by_zone = {c["zone"]: c for c in matrix}

    roma = by_zone["roma-norte"]["kpis"]
    assert roma["demand_interactions"] == 550
    assert roma["demand_visitors"] == 5
    assert roma["interest_score"] == 507.1
    # tensión = 550 / 48 disponibles ≈ 11.46 (caliente y con poca oferta)
    assert roma["demanda_oferta_ratio"] == pytest.approx(11.46, abs=0.01)
    assert by_zone["roma-norte"]["demand_scope"] == "colonia"

    pol = by_zone["polanco"]["kpis"]
    assert pol["demanda_oferta_ratio"] == pytest.approx(328 / 124, abs=0.01)

    # colonia sin demanda materializada → no se toca (honesto, sin ceros inventados)
    nap = by_zone["napoles"]["kpis"]
    assert "demand_interactions" not in nap
    assert "demand_scope" not in by_zone["napoles"]


@pytest.mark.asyncio
async def test_tension_omitted_when_no_available_inventory(db):
    """Sin unidades disponibles no hay tensión (evita dividir entre cero); la demanda sí entra."""
    await _seed_demand(db)
    matrix = [{"zone": "roma-norte", "kpis": {"units_total": 60, "units_available": 0}}]
    joined = await olap._join_colonia_demand(db, matrix, dimensions=["zone"])
    assert joined is True
    k = matrix[0]["kpis"]
    assert k["demand_interactions"] == 550
    assert "demanda_oferta_ratio" not in k


@pytest.mark.asyncio
async def test_fail_open_without_facts(db):
    """Sin facts_buyer_signals: no une, no truena."""
    matrix = _matrix()
    joined = await olap._join_colonia_demand(db, matrix, dimensions=["zone"])
    assert joined is False
    assert all("demand_interactions" not in c["kpis"] for c in matrix)
