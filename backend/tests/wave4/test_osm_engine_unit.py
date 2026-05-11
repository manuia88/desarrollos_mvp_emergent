"""Wave 4 · Tests osm_engine.py · 10 tests unidad sin DB.

Cubre constantes + función pura `_haversine_m` OSM Geofabrik/Overpass engine:
- OVERPASS_URL / GEOFABRIK_PBF canonical
- CDMX_BBOX (south · west · north · east tuple integrity)
- CATEGORIES dict (8 OSM tag mappings)
- _haversine_m (geodésica · simetría · CDMX bbox)
- _now() timezone-aware UTC

Funciones async (fetch_overpass_bbox · persist_to_cache · get_amenities_radius ·
stats · run_osm_weekly_cron) → diferidas a integration tests.

NO modifica código existente · solo lectura.
"""
import math
from datetime import datetime

import pytest

from data_sources.osm_engine import (
    CATEGORIES,
    CDMX_BBOX,
    GEOFABRIK_PBF,
    OVERPASS_URL,
    _haversine_m,
    _now,
)

pytestmark = pytest.mark.unit


# ─── 1. OVERPASS_URL canonical ──────────────────────────────────────────────


def test_overpass_url_canonical():
    """Overpass API endpoint oficial."""
    assert OVERPASS_URL == "https://overpass-api.de/api/interpreter"


# ─── 2. GEOFABRIK_PBF canonical ─────────────────────────────────────────────


def test_geofabrik_pbf_canonical():
    """Geofabrik PBF Distrito Federal latest."""
    assert "geofabrik.de" in GEOFABRIK_PBF
    assert "distrito-federal-latest.osm.pbf" in GEOFABRIK_PBF
    assert GEOFABRIK_PBF.startswith("https://")


# ─── 3. CDMX_BBOX integridad (s,w,n,e) ──────────────────────────────────────


def test_cdmx_bbox_tuple_integrity():
    """Bbox (south, west, north, east) coherente para CDMX."""
    assert isinstance(CDMX_BBOX, tuple)
    assert len(CDMX_BBOX) == 4
    s, w, n, e = CDMX_BBOX
    # south < north
    assert s < n
    # west < east
    assert w < e
    # CDMX está en ~19.x norte y ~-99.x oeste
    assert 19.0 <= s <= 20.0
    assert 19.0 <= n <= 20.0
    assert -99.5 <= w <= -98.5
    assert -99.5 <= e <= -98.5


# ─── 4. CATEGORIES contiene 8 keys clave ────────────────────────────────────


def test_categories_catalog_has_eight():
    """8 categorías OSM mapping: school · hospital · restaurant · cafe ·
    bank · park · shop · transport."""
    expected = {"school", "hospital", "restaurant", "cafe",
                "bank", "park", "shop", "transport"}
    assert set(CATEGORIES.keys()) == expected


# ─── 5. CATEGORIES values son tuplas (tag, subtag) ──────────────────────────


def test_categories_values_are_tuples():
    """Cada entry es (osm_tag, osm_value) · value puede ser None (wildcard)."""
    for cat, val in CATEGORIES.items():
        assert isinstance(val, tuple)
        assert len(val) == 2
        tag, sub = val
        assert isinstance(tag, str)
        # subtag is str o None (wildcard · ej shop · transport)
        assert sub is None or isinstance(sub, str)


# ─── 6. CATEGORIES amenity mappings ─────────────────────────────────────────


def test_categories_amenity_mappings():
    """school · hospital · restaurant · cafe · bank → tag amenity."""
    amenities = ["school", "hospital", "restaurant", "cafe", "bank"]
    for a in amenities:
        assert CATEGORIES[a][0] == "amenity"
        assert CATEGORIES[a][1] == a


# ─── 7. Haversine same point → 0 ────────────────────────────────────────────


def test_haversine_same_point_is_zero():
    """d(P,P) = 0."""
    assert _haversine_m(19.4, -99.1, 19.4, -99.1) == 0.0


# ─── 8. Haversine simetría ──────────────────────────────────────────────────


def test_haversine_symmetric():
    """d(A,B) == d(B,A)."""
    d1 = _haversine_m(19.4, -99.1, 19.5, -99.2)
    d2 = _haversine_m(19.5, -99.2, 19.4, -99.1)
    assert math.isclose(d1, d2, rel_tol=1e-9)


# ─── 9. Haversine 1deg lat ≈ 111km ──────────────────────────────────────────


def test_haversine_one_degree_lat():
    """1° latitud ≈ 111_320 m."""
    d = _haversine_m(0.0, 0.0, 1.0, 0.0)
    assert 109_000 <= d <= 112_000


# ─── 10. _now timezone-aware UTC ────────────────────────────────────────────


def test_now_returns_utc_aware():
    """_now() UTC tz-aware."""
    t = _now()
    assert isinstance(t, datetime)
    assert t.tzinfo is not None
    assert t.utcoffset().total_seconds() == 0
