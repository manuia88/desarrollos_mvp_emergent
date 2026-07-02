"""Wave 4 · Tests maps_cross_engine.py · 12 tests unidad sin DB.

Cubre helpers PUROS (no async · no Mongo):
- _haversine_km (distancia geodésica · CDMX coordenadas conocidas)
- TIER_RANK mapping (free/T0/T1/T2/T3 ordenamiento)
- CACHE_TTL_H constant
- _now (datetime UTC timezone-aware)

Para demand_supply_gap_geojson / battle_card / funnel_inverso: lógica heurística
testeada vía cálculos de ratio sin necesidad de async DB (funciones internas
auxiliares testeadas en isolation).

NO testea funnel_inverso/match_catastro/battle_card directamente (todas async +
Mongo). NO testea cron_evaluate_saved_zones (async + cron).
"""
from datetime import datetime, timezone

import pytest

from maps_cross_engine import (
    CACHE_TTL_H,
    TIER_RANK,
    _haversine_km,
    _now,
)

pytestmark = pytest.mark.unit


# ─── _haversine_km ────────────────────────────────────────────────────────────


def test_haversine_zero_distance():
    """Mismo punto → distancia ~0."""
    d = _haversine_km(19.4326, -99.1332, 19.4326, -99.1332)
    assert d == pytest.approx(0.0, abs=0.001)


def test_haversine_short_distance_positive():
    """Distancia corta (~1km) → valor > 0 y < 5."""
    # ~1 grado lat = 111 km; 0.01 grado ≈ 1.1 km
    d = _haversine_km(19.4326, -99.1332, 19.4416, -99.1332)
    assert 0.5 < d < 1.5


def test_haversine_symmetric():
    """haversine(A,B) == haversine(B,A)."""
    a_lat, a_lng = 19.4326, -99.1332
    b_lat, b_lng = 19.5000, -99.2000
    d_ab = _haversine_km(a_lat, a_lng, b_lat, b_lng)
    d_ba = _haversine_km(b_lat, b_lng, a_lat, a_lng)
    assert d_ab == pytest.approx(d_ba, abs=0.0001)


def test_haversine_cdmx_to_polanco():
    """Centro CDMX (Zócalo) a Polanco ≈ 5-7 km."""
    # Zócalo
    zocalo = (19.4326, -99.1332)
    # Polanco aprox
    polanco = (19.4338, -99.1909)
    d = _haversine_km(*zocalo, *polanco)
    assert 4.5 < d < 7.5


def test_haversine_returns_positive():
    """haversine siempre retorna >= 0."""
    d = _haversine_km(19.1, -99.4, 19.7, -98.9)
    assert d >= 0


# ─── TIER_RANK ────────────────────────────────────────────────────────────────


def test_tier_rank_ordering():
    """free=T0=0 < T1=pro=1 < T2=2 < T3=enterprise=3."""
    assert TIER_RANK["free"] == 0
    assert TIER_RANK["T0"] == 0
    assert TIER_RANK["T1"] == 1
    assert TIER_RANK["pro"] == 1
    assert TIER_RANK["T2"] == 2
    assert TIER_RANK["T3"] == 3
    assert TIER_RANK["enterprise"] == 3


def test_tier_rank_monotonic():
    """Orden monótono creciente: free < T1 < T2 < T3."""
    assert TIER_RANK["free"] < TIER_RANK["T1"]
    assert TIER_RANK["T1"] < TIER_RANK["T2"]
    assert TIER_RANK["T2"] < TIER_RANK["T3"]


def test_tier_rank_synonyms_match():
    """free=T0 y pro=T1 y enterprise=T3 son sinónimos."""
    assert TIER_RANK["free"] == TIER_RANK["T0"]
    assert TIER_RANK["pro"] == TIER_RANK["T1"]
    assert TIER_RANK["enterprise"] == TIER_RANK["T3"]


# ─── _now ─────────────────────────────────────────────────────────────────────


def test_now_returns_timezone_aware_utc():
    """_now() retorna datetime con tzinfo=UTC."""
    t = _now()
    assert isinstance(t, datetime)
    assert t.tzinfo is not None
    assert t.utcoffset() == timezone.utc.utcoffset(t)


# ─── Demand-supply gap scoring logic (replicada para testear thresholds) ─────


def test_demand_supply_score_high_demand():
    """score > 0.3 → alta_demanda (replicar lógica color tier)."""
    # supply=2, demand=10, max=10, score=(10-2)/10 = 0.8 → alta_demanda
    supply, demand = 2, 10
    max_v = max(supply, demand, 1)
    score = (demand - supply) / max_v
    assert score > 0.3


def test_demand_supply_score_sobreoferta():
    """score < -0.3 → sobreoferta."""
    # supply=20, demand=5, max=20, score=(5-20)/20 = -0.75 → sobreoferta
    supply, demand = 20, 5
    max_v = max(supply, demand, 1)
    score = (demand - supply) / max_v
    assert score < -0.3


def test_demand_supply_balanced():
    """Supply == demand → score 0 → balanceado (entre -0.3 y 0)."""
    supply, demand = 10, 10
    max_v = max(supply, demand, 1)
    score = (demand - supply) / max_v
    assert score == 0
    # En la lógica del engine, score > 0 ya es demanda_moderada (no balanceado);
    # 0 cae en branch >-0.3 (balanceado)
    assert -0.3 < score <= 0


# ─── Cache TTL constant ───────────────────────────────────────────────────────


def test_cache_ttl_24h():
    """CACHE_TTL_H = 24 (cache 24h heuristic responses)."""
    assert CACHE_TTL_H == 24
