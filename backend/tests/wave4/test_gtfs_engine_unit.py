"""Wave 4 · Tests gtfs_engine.py · 9 tests unidad sin DB.

Cubre constantes + función pura `_haversine_m` GTFS CDMX engine:
- CKAN_BASE / PACKAGE_NAME canonical
- _haversine_m (Great circle distance · 0 para mismo punto ·
  ~111km por grado lat · simetría)
- _now() timezone-aware UTC

Funciones async (fetch_package · fetch_zip_and_parse_stops · persist_to_cache ·
get_transit_accessibility · stats · run_gtfs_*_cron) → diferidas a integration tests.

NO modifica código existente · solo lectura.
"""
import math
from datetime import datetime

import pytest

from data_sources.gtfs_engine import (
    CKAN_BASE,
    PACKAGE_NAME,
    _haversine_m,
    _now,
)

pytestmark = pytest.mark.unit


# ─── 1. CKAN_BASE canonical ─────────────────────────────────────────────────


def test_ckan_base_canonical():
    """CKAN API v3 datos.cdmx.gob.mx."""
    assert CKAN_BASE == "https://datos.cdmx.gob.mx/api/3/action"


# ─── 2. PACKAGE_NAME = gtfs ─────────────────────────────────────────────────


def test_package_name_is_gtfs():
    """CKAN package GTFS oficial CDMX."""
    assert PACKAGE_NAME == "gtfs"


# ─── 3. Haversine same point → 0 ────────────────────────────────────────────


def test_haversine_same_point_is_zero():
    """Mismo lat/lng → distancia 0."""
    d = _haversine_m(19.4326, -99.1332, 19.4326, -99.1332)
    assert d == 0.0


# ─── 4. Haversine 1deg lat ≈ 111km ──────────────────────────────────────────


def test_haversine_one_degree_lat_is_111km():
    """1° latitud ≈ 111_320 m (constante geodésica)."""
    d = _haversine_m(0.0, 0.0, 1.0, 0.0)
    # tolerancia ±2km
    assert 109_000 <= d <= 112_000


# ─── 5. Haversine simétrica ─────────────────────────────────────────────────


def test_haversine_is_symmetric():
    """d(A,B) == d(B,A)."""
    a = (19.43, -99.13)
    b = (19.45, -99.20)
    d1 = _haversine_m(*a, *b)
    d2 = _haversine_m(*b, *a)
    assert math.isclose(d1, d2, rel_tol=1e-9)


# ─── 6. Haversine CDMX core ≈ 1.5km ─────────────────────────────────────────


def test_haversine_cdmx_zocalo_to_chapultepec():
    """Zócalo CDMX (19.4326, -99.1332) a Chapultepec (19.4205, -99.1816) ≈ 5.3 km.

    Sanity check con coordenadas reales conocidas.
    """
    d = _haversine_m(19.4326, -99.1332, 19.4205, -99.1816)
    # ~5.3 km · tolerancia ±500m
    assert 4_800 <= d <= 5_800


# ─── 7. Haversine returns float ─────────────────────────────────────────────


def test_haversine_returns_float():
    """Salida siempre float (no int)."""
    d = _haversine_m(19.0, -99.0, 19.1, -99.1)
    assert isinstance(d, float)
    assert d > 0


# ─── 8. Haversine antipodal point ───────────────────────────────────────────


def test_haversine_antipodal_max_distance():
    """Punto antípoda ≈ media circunferencia tierra (20_015 km)."""
    d = _haversine_m(0.0, 0.0, 0.0, 180.0)
    # ~π * R = π * 6_371_000 ≈ 20_015_087 m
    assert 19_900_000 <= d <= 20_100_000


# ─── 9. _now timezone-aware UTC ─────────────────────────────────────────────


def test_now_returns_utc_aware():
    """_now() UTC tz-aware."""
    t = _now()
    assert isinstance(t, datetime)
    assert t.tzinfo is not None
    assert t.utcoffset().total_seconds() == 0
