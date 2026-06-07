"""Wave 4 · Tests state_of_cdmx_engine.py · 8 tests unidad sin DB.

Cubre funciones PURAS:
- current_period (YYYY-Qx format)
- _velocity_by_category (5 categories)
- _predictions (top/cold zones)
- _FALLBACK_TOP_ROI / _FALLBACK_DEMAND integridad

NO testea OG image / DB / engines downstream → require infra.
"""
import re

import pytest

from state_of_cdmx_engine import (
    _FALLBACK_DEMAND,
    _FALLBACK_TOP_ROI,
    _predictions,
    _velocity_by_category,
    current_period,
)

pytestmark = pytest.mark.unit


# ─── current_period ──────────────────────────────────────────────────────────

def test_current_period_format():
    """current_period devuelve 'YYYY-Qx' (x=1-4)."""
    p = current_period()
    assert re.match(r"^\d{4}-Q[1-4]$", p)


def test_current_period_year_recent():
    """Año razonable (2024-2030)."""
    p = current_period()
    year = int(p.split("-")[0])
    assert 2024 <= year <= 2030


# ─── _velocity_by_category ───────────────────────────────────────────────────

def test_velocity_by_category_includes_5_segments():
    """Categories: luxury, premium, residencial, medio, social."""
    v = _velocity_by_category()
    assert set(v.keys()) == {"luxury", "premium", "residencial", "medio", "social"}


def test_velocity_luxury_higher_than_social():
    """Luxury tarda más meses al sellout que social."""
    v = _velocity_by_category()
    assert v["luxury"] > v["social"]


def test_velocity_values_positive_ints():
    """Todos los meses son ints positivos."""
    v = _velocity_by_category()
    for category, months in v.items():
        assert isinstance(months, int)
        assert months > 0


# ─── _predictions ────────────────────────────────────────────────────────────

def test_predictions_derived_and_flagged_estimate():
    """Predictions: plusvalía derivada del dato (no hardcodeada) + marcada estimada."""
    p = _predictions(list(_FALLBACK_TOP_ROI))
    assert "q_next_avg_appreciation" in p
    assert p.get("es_estimado") is True          # fallback de ejemplo → estimado
    assert "q3_avg_appreciation" not in p         # ya no hay forecast trimestral inventado


def test_predictions_hot_zones_top_5():
    """hot_zones toma los 5 primeros por ROI."""
    p = _predictions(list(_FALLBACK_TOP_ROI))
    assert len(p["hot_zones"]) == 5


def test_predictions_cold_zones_bottom_3():
    """cold_zones toma los últimos 3."""
    p = _predictions(list(_FALLBACK_TOP_ROI))
    assert len(p["cold_zones"]) == 3


# ─── Fallback constants ──────────────────────────────────────────────────────

def test_fallback_top_roi_has_10_entries():
    """Fallback top ROI tiene 10 colonias."""
    assert len(_FALLBACK_TOP_ROI) == 10


def test_fallback_top_roi_sorted_desc():
    """Fallback top ROI ordenado por roi_12m_pct descendente."""
    rois = [r["roi_12m_pct"] for r in _FALLBACK_TOP_ROI]
    assert rois == sorted(rois, reverse=True)


def test_fallback_demand_has_10_entries_with_labels():
    """Fallback demand tiene 10 entries con label de oportunidad."""
    assert len(_FALLBACK_DEMAND) == 10
    valid_labels = {"Demanda alta", "Equilibrado", "Sobreoferta"}
    for d in _FALLBACK_DEMAND:
        assert d["opportunity_label"] in valid_labels
