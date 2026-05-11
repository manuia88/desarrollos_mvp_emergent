"""Wave 4 · Tests maps_engine.py · 13 tests unidad sin DB.

Cubre helpers PUROS (no async · no Mongo · no Mapbox red):
- VALID_LAYERS constant (5 layers canónicos)
- _parse_bbox (str → tuple · invalid → None)
- _in_bbox (bool point-in-bbox check)
- _bbox_quadrant (4×4 grid normalization)
- _filters_hash / _cache_key (deterministic hashing)
- _point_feature / _feature_collection (GeoJSON shape)
- _circle_polygon (polygon geometry · steps+1 coords)
- Constants integrity (CDMX_BBOX, CACHE_TTL_H, MAX_FEATURES_PER_LAYER)

NO testea get_layer_data (async + Mongo). NO testea Mapbox external red.
"""
import pytest

from maps_engine import (
    CACHE_TTL_H,
    CDMX_BBOX,
    MAX_FEATURES_PER_LAYER,
    MapsEngine,
    _bbox_quadrant,
    _cache_key,
    _circle_polygon,
    _feature_collection,
    _filters_hash,
    _in_bbox,
    _parse_bbox,
    _point_feature,
)

pytestmark = pytest.mark.unit


# ─── VALID_LAYERS ─────────────────────────────────────────────────────────────


def test_valid_layers_canonical_set():
    """MapsEngine.VALID_LAYERS = {devs, brokers, catastro, zone_score, risk}."""
    assert MapsEngine.VALID_LAYERS == {
        "devs", "brokers", "catastro", "zone_score", "risk"
    }


def test_valid_layers_count_five():
    """Exactamente 5 layers (no rename silencioso)."""
    assert len(MapsEngine.VALID_LAYERS) == 5


# ─── _parse_bbox ──────────────────────────────────────────────────────────────


def test_parse_bbox_none_returns_none():
    """_parse_bbox(None) retorna None."""
    assert _parse_bbox(None) is None


def test_parse_bbox_empty_returns_none():
    """_parse_bbox('') retorna None."""
    assert _parse_bbox("") is None


def test_parse_bbox_valid_4_floats():
    """_parse_bbox('lat1,lng1,lat2,lng2') → tuple (lng1,lat1,lng2,lat2)."""
    out = _parse_bbox("19.1,-99.4,19.7,-98.9")
    assert out == (-99.4, 19.1, -98.9, 19.7)


def test_parse_bbox_invalid_returns_none():
    """_parse_bbox('abc') retorna None (no raise)."""
    assert _parse_bbox("abc") is None
    assert _parse_bbox("1,2,3") is None  # solo 3 valores


# ─── _in_bbox ─────────────────────────────────────────────────────────────────


def test_in_bbox_none_returns_true():
    """_in_bbox(lat,lng,None) → True (sin filtro)."""
    assert _in_bbox(19.5, -99.1, None) is True


def test_in_bbox_inside():
    """Punto dentro del bbox → True."""
    bbox = (-99.4, 19.1, -98.9, 19.7)
    assert _in_bbox(19.4, -99.1, bbox) is True


def test_in_bbox_outside():
    """Punto fuera del bbox (lat encima) → False."""
    bbox = (-99.4, 19.1, -98.9, 19.7)
    assert _in_bbox(20.0, -99.1, bbox) is False


# ─── _bbox_quadrant ───────────────────────────────────────────────────────────


def test_bbox_quadrant_none_returns_full():
    """_bbox_quadrant(None) → 'full'."""
    assert _bbox_quadrant(None) == "full"


def test_bbox_quadrant_format():
    """_bbox_quadrant retorna formato qRC con dígitos 0-3."""
    out = _bbox_quadrant((-99.3, 19.2, -99.1, 19.4))
    assert out.startswith("q")
    assert len(out) == 3  # q + row + col
    # row/col en [0..3]
    assert 0 <= int(out[1]) <= 3
    assert 0 <= int(out[2]) <= 3


# ─── _filters_hash + _cache_key ──────────────────────────────────────────────


def test_filters_hash_empty_returns_nofilter():
    """_filters_hash({}) → 'nofilter'."""
    assert _filters_hash({}) == "nofilter"
    assert _filters_hash(None) == "nofilter"


def test_filters_hash_deterministic():
    """Mismo dict (orden distinto) produce mismo hash (sorted)."""
    h1 = _filters_hash({"a": 1, "b": 2})
    h2 = _filters_hash({"b": 2, "a": 1})
    assert h1 == h2
    assert len(h1) == 8  # md5 truncado


def test_cache_key_concatenates():
    """_cache_key combina layer_quadrant_hash."""
    k = _cache_key("devs", "q12", "abcd1234")
    assert k == "devs_q12_abcd1234"


# ─── GeoJSON builders ─────────────────────────────────────────────────────────


def test_point_feature_geojson_shape():
    """_point_feature retorna GeoJSON Feature válido."""
    feat = _point_feature(19.5, -99.1, {"name": "test"})
    assert feat["type"] == "Feature"
    assert feat["geometry"]["type"] == "Point"
    # GeoJSON usa [lng, lat]
    assert feat["geometry"]["coordinates"] == [-99.1, 19.5]
    assert feat["properties"]["name"] == "test"


def test_feature_collection_shape():
    """_feature_collection retorna GeoJSON FeatureCollection."""
    fc = _feature_collection([{"type": "Feature"}])
    assert fc["type"] == "FeatureCollection"
    assert isinstance(fc["features"], list)
    assert len(fc["features"]) == 1


# ─── _circle_polygon ──────────────────────────────────────────────────────────


def test_circle_polygon_shape():
    """_circle_polygon genera Feature Polygon con steps+1 coords (cerrado)."""
    poly = _circle_polygon(19.5, -99.1, radius_km=0.8, steps=16)
    assert poly["type"] == "Feature"
    assert poly["geometry"]["type"] == "Polygon"
    coords = poly["geometry"]["coordinates"][0]
    assert len(coords) == 17  # steps + 1 para cerrar


# ─── Constants ────────────────────────────────────────────────────────────────


def test_cdmx_bbox_canonical():
    """CDMX_BBOX cubre CDMX (~19.1-19.75 lat · -99.4 a -98.9 lng)."""
    lng_sw, lat_sw, lng_ne, lat_ne = CDMX_BBOX
    assert lng_sw < lng_ne
    assert lat_sw < lat_ne
    # CDMX está en estos rangos aprox
    assert -100 < lng_sw < -98
    assert 18 < lat_sw < 20


def test_constants_positive():
    """CACHE_TTL_H > 0 · MAX_FEATURES_PER_LAYER > 0."""
    assert CACHE_TTL_H > 0
    assert MAX_FEATURES_PER_LAYER > 0
