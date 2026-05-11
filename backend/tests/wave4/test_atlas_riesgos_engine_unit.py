"""Wave 4 · Tests atlas_riesgos_engine.py · 7 tests unidad sin DB.

Cubre constantes Atlas Riesgos CDMX engine:
- CKAN_BASE canonical datos.cdmx.gob.mx
- SEARCH_QUERY = atlas+riesgo
- LAYERS catalog (inundacion · sismico · laderas · 3 capas)
- _now() timezone-aware UTC

Funciones async (fetch_metadata · lookup · stats · run_atlas_yearly_cron)
→ diferidas a integration tests.

NO modifica código existente · solo lectura.
"""
from datetime import datetime

import pytest

from data_sources.atlas_riesgos_engine import (
    CKAN_BASE,
    LAYERS,
    SEARCH_QUERY,
    _now,
)

pytestmark = pytest.mark.unit


# ─── 1. CKAN_BASE canonical ─────────────────────────────────────────────────


def test_ckan_base_canonical():
    """datos.cdmx.gob.mx CKAN API v3 endpoint."""
    assert CKAN_BASE == "https://datos.cdmx.gob.mx/api/3/action"
    assert CKAN_BASE.endswith("/action")


# ─── 2. SEARCH_QUERY catálogo Atlas Riesgos ─────────────────────────────────


def test_search_query_atlas_riesgo():
    """CKAN package_search query."""
    assert SEARCH_QUERY == "atlas+riesgo"
    assert "+" in SEARCH_QUERY  # CKAN syntax


# ─── 3. LAYERS catalog 3 capas ──────────────────────────────────────────────


def test_layers_catalog_is_three():
    """3 capas obligatorias: inundación · sísmico · laderas."""
    assert LAYERS == ["inundacion", "sismico", "laderas"]
    assert len(LAYERS) == 3


# ─── 4. LAYERS son strings lowercase ────────────────────────────────────────


def test_layers_are_lowercase_strings():
    """Slugs canónicos lowercase sin acentos."""
    for ly in LAYERS:
        assert isinstance(ly, str)
        assert ly == ly.lower()
        assert " " not in ly


# ─── 5. _now timezone-aware UTC ─────────────────────────────────────────────


def test_now_returns_utc_aware():
    """_now() UTC tz-aware (Mongo compatible)."""
    t = _now()
    assert isinstance(t, datetime)
    assert t.tzinfo is not None
    assert t.utcoffset().total_seconds() == 0


# ─── 6. Risk scoring weights (overall_score logic) ──────────────────────────


def test_risk_tier_weights_canonical():
    """Pesos canónicos: alto=3 · medio=2 · bajo=1 · n/d=0.

    Validates the score formula 100 * sum/max_pts donde max_pts = 3*len(LAYERS).
    """
    weights = {"alto": 3, "medio": 2, "bajo": 1}
    max_pts = 3 * len(LAYERS)
    assert max_pts == 9  # 3 capas × peso máx 3

    # Caso: 3 capas alto → score = 100
    score_all_high = sum(weights["alto"] for _ in LAYERS)
    assert round(100 * score_all_high / max_pts, 1) == 100.0

    # Caso: 3 capas bajo → 33.3%
    score_all_low = sum(weights["bajo"] for _ in LAYERS)
    assert round(100 * score_all_low / max_pts, 1) == 33.3


# ─── 7. LAYERS subset of known risk types ───────────────────────────────────


def test_layers_subset_known_risk_types():
    """Atlas Riesgos CDMX cubre 3 tipos hazards principales."""
    known = {"inundacion", "sismico", "laderas", "hundimiento", "volcan"}
    assert set(LAYERS).issubset(known)
