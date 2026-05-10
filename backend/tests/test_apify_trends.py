"""W4.18.1 — Apify Google Trends regression tests.

Tests cubren:
- _coerce_geo / _coerce_timeframe (helpers puros)
- _build_cache_key (idempotente)
- _normalize_actor_output (ambos schemas: data_xplorer y puppeteer)
- _build_actor_input (selección por actor)

Tests E2E (cache hit, persist, invalidate, cron) requieren Mongo y se cubren via
`curl` manual; aquí mantenemos solo unit tests rápidos sin red.
"""
from __future__ import annotations

import os
os.environ.setdefault("APIFY_TOKEN", "test_token_dummy")

from apify_trends_engine import (  # noqa: E402
    _coerce_geo,
    _coerce_timeframe,
    _build_cache_key,
    _build_actor_input,
    _normalize_actor_output,
    DEFAULT_GEO,
    DEFAULT_TIMEFRAME,
)


def test_coerce_geo_aliases():
    assert _coerce_geo("MX-CMX") == "MX"
    assert _coerce_geo("CDMX") == "MX"
    assert _coerce_geo("mx-cmx") == "MX"
    assert _coerce_geo("US") == "US"
    assert _coerce_geo("us") == "US"
    assert _coerce_geo("") == DEFAULT_GEO
    assert _coerce_geo(None) == DEFAULT_GEO
    assert _coerce_geo("INVALID-LONG") == DEFAULT_GEO


def test_coerce_timeframe_aliases():
    assert _coerce_timeframe("today 3-m") == "today 3-m"
    assert _coerce_timeframe("3m") == "today 3-m"
    assert _coerce_timeframe("today 12-m") == ""  # alias → empty (12m default actor)
    assert _coerce_timeframe("12m") == ""
    assert _coerce_timeframe("invalid_value") == DEFAULT_TIMEFRAME
    assert _coerce_timeframe(None) == DEFAULT_TIMEFRAME


def test_build_cache_key_idempotent():
    k1 = _build_cache_key("polanco", "MX", "today 3-m")
    k2 = _build_cache_key("polanco", "MX", "today 3-m")
    k3 = _build_cache_key("Polanco", "MX", "today 3-m")  # case insensitive normalize
    assert k1 == k2 == k3
    assert len(k1) == 40  # SHA1 hex length


def test_build_cache_key_distinct_on_geo():
    k_mx = _build_cache_key("polanco", "MX", "today 3-m")
    k_us = _build_cache_key("polanco", "US", "today 3-m")
    assert k_mx != k_us


def test_build_actor_input_default_apify():
    inp = _build_actor_input("polanco", "MX", "today 3-m", None)
    # apify/google-trends-scraper schema (default)
    assert "searchTerms" in inp
    assert inp["searchTerms"] == ["polanco"]
    assert inp["geo"] == "MX"
    assert inp["timeRange"] == "today 3-m"
    assert "proxyConfiguration" in inp


def test_build_actor_input_data_xplorer():
    # Patch APIFY_ACTOR temporalmente
    import apify_trends_engine as eng
    orig = eng.APIFY_ACTOR
    eng.APIFY_ACTOR = "data_xplorer/google-trends-fast-scraper"
    try:
        inp = _build_actor_input("polanco", "CDMX", "today 12-m", None)
        # data_xplorer schema
        assert inp["keyword"] == "polanco"
        assert inp["geo"] == "MX"  # coerced
        assert inp["predefinedTimeframe"]  # not empty
        assert inp["fetchRegionalData"] is True
    finally:
        eng.APIFY_ACTOR = orig


def test_normalize_empty_items():
    out = _normalize_actor_output([], "polanco", "MX", "today 3-m")
    assert out["interest_over_time"] == []
    assert out["trend_direction"] == "flat"
    assert out["average_interest"] is None


def test_normalize_data_xplorer_schema():
    items = [{
        "keyword": "polanco",
        "timeline_data": {"2025-W01": 50, "2025-W02": 60, "2025-W03": 80, "2025-W04": 100},
        "region_data": [
            {"name": "Ciudad de México", "value": 100},
            {"name": "Jalisco", "value": 60},
        ],
        "related_queries": {
            "top": [{"query": "polanco departamentos", "value": 100}],
            "rising": [{"query": "polanco preventa", "value": "Breakout"}],
        },
    }]
    out = _normalize_actor_output(items, "polanco", "MX", "today 3-m")
    assert len(out["interest_over_time"]) == 4
    assert out["interest_over_time"][0]["value"] == 50
    assert out["trend_direction"] == "rising"
    assert out["average_interest"] is not None
    assert out["peak_interest"] == 100
    assert len(out["interest_by_region"]) == 2
    assert out["interest_by_region"][0]["name"] == "Ciudad de México"
    assert out["related_queries_top"][0]["label"] == "polanco departamentos"
    assert out["related_queries_rising"][0]["label"] == "polanco preventa"


def test_normalize_puppeteer_schema():
    items = [{
        "searchTerm": "polanco",
        "interestOverTime": [
            {"time": "t0", "value": 80, "formattedTime": "Jan 1"},
            {"time": "t1", "value": 70, "formattedTime": "Jan 2"},
            {"time": "t2", "value": 50, "formattedTime": "Jan 3"},
            {"time": "t3", "value": 30, "formattedTime": "Jan 4"},
        ],
        "interestByRegion": [{"geoName": "Ciudad de México", "value": 100}],
        "relatedQueries": {
            "top": [{"query": "polanco precio", "value": 90}],
            "rising": [{"query": "polanco renta", "value": 50}],
        },
        "relatedTopics": {"top": [], "rising": []},
    }]
    out = _normalize_actor_output(items, "polanco", "MX", "today 3-m")
    assert len(out["interest_over_time"]) == 4
    assert out["trend_direction"] == "falling"
    assert out["peak_interest"] == 80
    assert out["interest_by_region"][0]["name"] == "Ciudad de México"
    assert out["related_queries_top"][0]["label"] == "polanco precio"
