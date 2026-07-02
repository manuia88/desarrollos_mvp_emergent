"""Wave 2 · Tests metrics_cube_aggregations.py · 15 tests unidad sin DB.

Cubre helpers puros (no async · no Mongo):
- _slug (normalización geo IDs)
- _period_since (ventanas temporales)
- _haversine_km (distancia geo)
- _dev_center_latlng (GeoJSON center + lat/lng fallback)
- _dev_avg_price / _dev_avg_m2 / _dev_days_on_market
- _empty_kpis (schema integrity)
- _accum_dev + _finalize (rollup math: avg price, conversion_rate, ai cost)
- TIERS / PERIODS / CITY_ROOT_ID constants

NO testea funciones async DB (_leads_per_dev / _ai_usage_per_tenant /
_all_developments / aggregate_tier / aggregate_all / metrics_cube_daily_aggregation /
find_comparables / ensure_indexes) → require AsyncIOMotor.
"""
from datetime import datetime, timezone, timedelta

import pytest

from metrics_cube_aggregations import (
    CITY_ROOT_ID,
    CITY_ROOT_NAME,
    PERIODS,
    TIERS,
    _accum_dev,
    _dev_avg_m2,
    _dev_avg_price,
    _dev_center_latlng,
    _dev_days_on_market,
    _empty_kpis,
    _finalize,
    _haversine_km,
    _period_since,
    _slug,
)

pytestmark = pytest.mark.unit


# ─── _slug ───────────────────────────────────────────────────────────────────

def test_slug_basic_lowercase_and_space():
    """_slug normaliza espacios a '-' y lowercases."""
    assert _slug("Hello World") == "hello-world"


def test_slug_collapses_double_dashes_and_strips_edges():
    """_slug colapsa '--' a '-' y quita '-' en extremos."""
    assert _slug("---a--b---") == "a-b"


def test_slug_empty_string():
    """_slug('') devuelve ''."""
    assert _slug("") == ""


def test_slug_drops_unsupported_punctuation():
    """_slug quita caracteres no alfanuméricos no separadores (e.g. '/')."""
    # '/' y otros no están en (' ', '-', '_') ni isalnum, son eliminados.
    assert _slug("Café/Mañana") == "cafémañana"


# ─── _period_since ──────────────────────────────────────────────────────────

def test_period_since_current_is_first_of_month():
    """_period_since('current') devuelve día 1 del mes actual a las 00:00 UTC."""
    out = _period_since("current")
    assert out is not None
    assert out.day == 1
    assert out.hour == 0
    assert out.minute == 0
    assert out.tzinfo is not None


def test_period_since_7d_is_about_seven_days_ago():
    """_period_since('7d') está ~7 días en el pasado."""
    out = _period_since("7d")
    delta = datetime.now(timezone.utc) - out
    # Permitir 7d ± algunos segundos por latencia
    assert 6.99 <= delta.total_seconds() / 86400 <= 7.01


def test_period_since_unknown_returns_none():
    """_period_since con un período no reconocido devuelve None."""
    assert _period_since("zzz") is None
    assert _period_since("") is None


# ─── _haversine_km ──────────────────────────────────────────────────────────

def test_haversine_zero_distance():
    """_haversine_km entre el mismo punto devuelve 0."""
    assert _haversine_km(19.4326, -99.1332, 19.4326, -99.1332) == 0.0


def test_haversine_known_distance():
    """_haversine_km en CDMX (~1.5km approx) coincide con cálculo de referencia."""
    # 0.01 deg lat ~1.11 km · 0.01 deg lng (a 19°N) ~1.05 km · diagonal ~1.53 km
    d = _haversine_km(19.4326, -99.1332, 19.4426, -99.1232)
    assert 1.4 <= d <= 1.7


# ─── _dev_center_latlng ──────────────────────────────────────────────────────

def test_dev_center_latlng_from_geojson_center():
    """_dev_center_latlng acepta GeoJSON center [lng, lat] y devuelve (lat, lng)."""
    out = _dev_center_latlng({"center": [-99.1332, 19.4326]})
    assert out == (19.4326, -99.1332)


def test_dev_center_latlng_fallback_to_lat_lng_fields():
    """_dev_center_latlng cae a dev.lat/lng si no hay 'center'."""
    out = _dev_center_latlng({"lat": 19.4, "lng": -99.1})
    assert out == (19.4, -99.1)


def test_dev_center_latlng_none_when_missing():
    """_dev_center_latlng devuelve None si no hay coordenadas."""
    assert _dev_center_latlng({}) is None


# ─── _dev_avg_price / _dev_avg_m2 ────────────────────────────────────────────

def test_dev_avg_price_range_returns_midpoint():
    """_dev_avg_price con price_from/to devuelve promedio."""
    assert _dev_avg_price({"price_from": 1_000_000, "price_to": 2_000_000}) == 1_500_000.0


def test_dev_avg_price_only_from_returns_from():
    """_dev_avg_price solo con price_from devuelve price_from."""
    assert _dev_avg_price({"price_from": 500_000}) == 500_000.0


def test_dev_avg_m2_returns_midpoint():
    """_dev_avg_m2 con m2_range devuelve promedio."""
    assert _dev_avg_m2({"m2_range": [50, 100]}) == 75.0


def test_dev_avg_m2_missing_returns_none():
    """_dev_avg_m2 sin m2_range devuelve None."""
    assert _dev_avg_m2({}) is None


# ─── _dev_days_on_market ─────────────────────────────────────────────────────

def test_dev_days_on_market_iso_string():
    """_dev_days_on_market con created_at ISO calcula días vs now."""
    now = datetime.now(timezone.utc)
    ts = (now - timedelta(days=10)).isoformat()
    assert _dev_days_on_market({"created_at": ts}, now) == 10


def test_dev_days_on_market_missing_returns_none():
    """_dev_days_on_market sin created_at devuelve None."""
    assert _dev_days_on_market({}, datetime.now(timezone.utc)) is None


def test_dev_days_on_market_invalid_returns_none():
    """_dev_days_on_market con created_at no parseable devuelve None."""
    assert _dev_days_on_market({"created_at": "not-a-date"}, datetime.now(timezone.utc)) is None


# ─── _empty_kpis ─────────────────────────────────────────────────────────────

def test_empty_kpis_has_expected_schema():
    """_empty_kpis incluye los KPI canónicos + los de RENTABILIDAD (cap_rate/yield/noi/renta_m2)
    añadidos en el build de métricas granulares 2026-07-01 (dmx_cube_feed)."""
    k = _empty_kpis()
    expected = {
        "projects_count", "units_total", "units_sold", "units_available",
        "units_reserved", "avg_price_mxn", "avg_price_per_m2", "leads_count",
        "conversion_rate", "days_on_market_avg", "ie_score_promedio", "ai_usage_mxn",
        # [AUD-014] KPIs de rentabilidad del cubo — parte del contrato actual (shipped en main)
        "cap_rate_pct", "yield_bruto", "yield_neto", "noi", "renta_m2",
    }
    assert set(k.keys()) == expected
    assert k["projects_count"] == 0
    assert k["ai_usage_mxn"] == 0.0
    assert k["avg_price_mxn"] is None


# ─── _accum_dev + _finalize: rollup math ────────────────────────────────────

def test_accum_and_finalize_two_devs_conversion_and_averages():
    """Con 2 devs sintéticos, _finalize calcula avg_price, conversion_rate, ai cost."""
    now = datetime.now(timezone.utc)
    kpis = _empty_kpis()
    agg = {"price": [], "price_per_m2": [], "dom": [], "ie": []}

    dev1 = {
        "id": "dev1", "developer_id": "tenant_a",
        "units_total": 100, "units_sold": 30, "units_available": 50, "units_reserved": 20,
        "price_from": 1_000_000, "price_to": 2_000_000, "m2_range": [50, 100],
        "ie_score": 80, "created_at": (now - timedelta(days=10)).isoformat(),
    }
    dev2 = {
        "id": "dev2", "developer_id": "tenant_b",
        "units_total": 50, "units_sold": 10, "units_available": 30, "units_reserved": 10,
        "price_from": 2_000_000, "price_to": 4_000_000, "m2_range": [80, 120],
        "ie_score": 90, "created_at": (now - timedelta(days=5)).isoformat(),
    }
    leads_map = {"dev1": {"leads_count": 5, "leads_won": 2},
                 "dev2": {"leads_count": 3, "leads_won": 1}}
    ai_map = {"tenant_a": 100.0, "tenant_b": 200.0}

    _accum_dev(kpis, dev1, leads_map, ai_map, now, agg)
    _accum_dev(kpis, dev2, leads_map, ai_map, now, agg)
    _finalize(kpis, agg)

    assert kpis["projects_count"] == 2
    assert kpis["units_total"] == 150
    assert kpis["units_sold"] == 40
    # avg price: (1.5M + 3M) / 2 = 2.25M
    assert kpis["avg_price_mxn"] == 2_250_000.0
    # avg price/m2: (20000 + 25000) / 2 = 22500
    assert kpis["avg_price_per_m2"] == 25_000.0
    # conversion = sold / (sold + available + reserved) = 40 / (40+80+30) = 26.67%
    assert kpis["conversion_rate"] == 26.67
    # leads: 5 + 3 = 8
    assert kpis["leads_count"] == 8
    # ai usage: tenant_a + tenant_b = 100 + 200 = 300
    assert kpis["ai_usage_mxn"] == 300.0
    # ie_score promedio: (80 + 90) / 2 = 85
    assert kpis["ie_score_promedio"] == 85.0


def test_finalize_empty_aggregators_leaves_none():
    """_finalize sin datos en agg deja KPIs avg en None."""
    kpis = _empty_kpis()
    agg = {"price": [], "price_per_m2": [], "dom": [], "ie": []}
    _finalize(kpis, agg)
    assert kpis["avg_price_mxn"] is None
    assert kpis["avg_price_per_m2"] is None
    assert kpis["days_on_market_avg"] is None
    assert kpis["ie_score_promedio"] is None
    # conversion_rate también None (denom == 0)
    assert kpis["conversion_rate"] is None


# ─── Constants integrity ─────────────────────────────────────────────────────

def test_tiers_constant():
    """TIERS contiene los 5 niveles canónicos."""
    assert TIERS == ("city", "alcaldia", "colonia", "development", "unit")


def test_periods_constant():
    """PERIODS contiene los 4 períodos canónicos."""
    assert PERIODS == ("current", "7d", "30d", "90d")


def test_city_root_constants():
    """CITY_ROOT_ID / CITY_ROOT_NAME son CDMX (scope H1)."""
    assert CITY_ROOT_ID == "cdmx"
    assert CITY_ROOT_NAME == "Ciudad de México"
