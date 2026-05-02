"""
Phase 3 Iteration A — DesarrollosMX Developments API regression tests.
Covers: /api/health, /api/developments (+filters/sort), /api/developments/:id,
/api/developments/:id/units, /api/developments/:id/similar,
/api/developers/:id, /api/developments/:id/briefing (cache),
/api/properties/search-ai (Claude parser, cache).
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://latam-spatial.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ─── HEALTH ──────────────────────────────────────────────────────────────────
def test_health(client):
    r = client.get(f"{API}/health", timeout=10)
    assert r.status_code == 200
    d = r.json()
    assert d.get("status") == "ok"
    assert d.get("colonias") == 16


# ─── DEVELOPMENTS LIST ───────────────────────────────────────────────────────
def test_developments_list_count_and_shape(client):
    r = client.get(f"{API}/developments", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) == 15
    required = {
        "id", "name", "slug", "colonia_id", "colonia", "alcaldia", "street",
        "address_full", "center", "developer", "stage", "price_from",
        "price_from_display", "price_to", "m2_range", "bedrooms_range",
        "bathrooms_range", "parking_range", "amenities", "photos", "featured",
        "units_total", "units_available", "units_reserved", "units_sold",
        "contact_phone",
    }
    d0 = data[0]
    missing = required - set(d0.keys())
    assert not missing, f"Missing keys in dev payload: {missing}"

    # developer enriched
    assert isinstance(d0["developer"], dict)
    assert "name" in d0["developer"]

    # stage vocab
    valid_stages = {"preventa", "en_construccion", "entrega_inmediata", "exclusiva"}
    for d in data:
        assert d["stage"] in valid_stages, f"bad stage {d['stage']}"

    # m2_range min/max
    assert isinstance(d0["m2_range"], (list, dict))
    if isinstance(d0["m2_range"], dict):
        assert "min" in d0["m2_range"] and "max" in d0["m2_range"]
    else:
        assert len(d0["m2_range"]) == 2

    # contact_phone fallback present (DMX_FALLBACK_WHATSAPP)
    assert d0.get("contact_phone"), "contact_phone must default to DMX_FALLBACK_WHATSAPP"


def test_stage_mix_expected(client):
    r = client.get(f"{API}/developments", timeout=15)
    data = r.json()
    stages = {}
    for d in data:
        stages[d["stage"]] = stages.get(d["stage"], 0) + 1
    # Expected mix per spec: 7 preventa, 5 en_construccion, 2 entrega_inmediata, 1 exclusiva
    assert stages.get("preventa", 0) == 7, f"preventa count={stages.get('preventa')} stages={stages}"
    assert stages.get("en_construccion", 0) == 5, f"{stages}"
    assert stages.get("entrega_inmediata", 0) == 2, f"{stages}"
    assert stages.get("exclusiva", 0) == 1, f"{stages}"


# ─── FILTERS ──────────────────────────────────────────────────────────────────
def test_filter_stage_preventa(client):
    r = client.get(f"{API}/developments", params={"stage": "preventa"}, timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert all(d["stage"] == "preventa" for d in data)
    assert len(data) >= 1


def test_filter_colonia_single(client):
    r = client.get(f"{API}/developments", params={"colonia": "polanco"}, timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert len(data) >= 1
    assert all(d["colonia_id"] == "polanco" for d in data)


def test_filter_colonia_multi(client):
    r = client.get(f"{API}/developments?colonia=polanco&colonia=roma-norte", timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert all(d["colonia_id"] in {"polanco", "roma-norte"} for d in data)
    assert len(data) >= 2


def test_filter_min_price(client):
    r = client.get(f"{API}/developments", params={"min_price": 10000000}, timeout=10)
    assert r.status_code == 200
    data = r.json()
    for d in data:
        # dev is in range if price_to >= min_price
        assert d["price_to"] >= 10000000 or d["price_from"] >= 10000000


def test_filter_max_price(client):
    r = client.get(f"{API}/developments", params={"max_price": 5000000}, timeout=10)
    assert r.status_code == 200
    data = r.json()
    for d in data:
        assert d["price_from"] <= 5000000


def test_filter_beds(client):
    r = client.get(f"{API}/developments", params={"beds": 3}, timeout=10)
    assert r.status_code == 200
    data = r.json()
    for d in data:
        br = d["bedrooms_range"]
        if isinstance(br, dict):
            assert br["max"] >= 3
        else:
            assert br[1] >= 3


def test_filter_amenity_multi(client):
    r = client.get(f"{API}/developments?amenity=gym&amenity=alberca", timeout=10)
    assert r.status_code == 200
    data = r.json()
    for d in data:
        ams = [a.lower() for a in d.get("amenities", [])]
        assert any("gym" in a for a in ams) or any("alberca" in a for a in ams)


def test_filter_featured(client):
    r = client.get(f"{API}/developments", params={"featured": "true"}, timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert all(d.get("featured") for d in data)


def test_sort_price_asc(client):
    r = client.get(f"{API}/developments", params={"sort": "price_asc"}, timeout=10)
    data = r.json()
    prices = [d["price_from"] for d in data]
    assert prices == sorted(prices), "price_asc not ascending"


def test_sort_price_desc(client):
    r = client.get(f"{API}/developments", params={"sort": "price_desc"}, timeout=10)
    data = r.json()
    prices = [d["price_from"] for d in data]
    assert prices == sorted(prices, reverse=True), "price_desc not descending"


def test_sort_sqm_desc(client):
    r = client.get(f"{API}/developments", params={"sort": "sqm_desc"}, timeout=10)
    assert r.status_code == 200


# ─── DETAIL ──────────────────────────────────────────────────────────────────
def test_development_detail_with_units(client):
    r = client.get(f"{API}/developments/altavista-polanco", timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d["id"] == "altavista-polanco"
    units = d.get("units")
    assert isinstance(units, list) and len(units) > 30
    u0 = units[0]
    required_unit = {
        "id", "development_id", "unit_number", "prototype", "level",
        "m2_privative", "m2_balcony", "m2_terrace", "m2_roof_garden", "m2_total",
        "bedrooms", "bathrooms", "parking_spots", "parking_type", "bodega",
        "price", "price_display", "status",
    }
    missing = required_unit - set(u0.keys())
    assert not missing, f"Unit missing keys: {missing}"
    assert u0["parking_type"] in {"individual", "battery_shared"}
    assert u0["status"] in {"disponible", "reservado", "vendido"}


def test_development_detail_404(client):
    r = client.get(f"{API}/developments/invalid-id-{uuid.uuid4().hex[:8]}", timeout=10)
    assert r.status_code == 404


# ─── UNITS ENDPOINT ───────────────────────────────────────────────────────────
def test_units_filter_status(client):
    r = client.get(f"{API}/developments/tamaulipas-89/units", params={"status": "disponible"}, timeout=10)
    assert r.status_code == 200
    units = r.json()
    assert all(u["status"] == "disponible" for u in units)


def test_units_filter_beds(client):
    # beds is a "min beds" filter (2+) matching UI semantics
    r = client.get(f"{API}/developments/tamaulipas-89/units", params={"beds": 2}, timeout=10)
    assert r.status_code == 200
    units = r.json()
    assert all(u["bedrooms"] >= 2 for u in units)


def test_units_filter_combo(client):
    r = client.get(f"{API}/developments/tamaulipas-89/units?status=disponible&beds=2", timeout=10)
    assert r.status_code == 200
    units = r.json()
    for u in units:
        assert u["status"] == "disponible"
        assert u["bedrooms"] >= 2


# ─── SIMILAR ──────────────────────────────────────────────────────────────────
def test_similar_developments(client):
    r = client.get(f"{API}/developments/tamaulipas-89/similar", timeout=10)
    assert r.status_code == 200
    sims = r.json()
    assert isinstance(sims, list)
    assert len(sims) == 3
    ids = [s["id"] for s in sims]
    assert "tamaulipas-89" not in ids


# ─── DEVELOPER ────────────────────────────────────────────────────────────────
def test_developer_detail(client):
    r = client.get(f"{API}/developers/lumbre", timeout=10)
    assert r.status_code == 200
    d = r.json()
    for k in [
        "verified_constitution", "no_judicial_records", "no_profeco_complaints",
        "projects_delivered", "units_sold", "years_experience", "description",
        "current_developments",
    ]:
        assert k in d, f"developer missing key {k}"
    assert isinstance(d["current_developments"], list)
    assert len(d["current_developments"]) >= 1


# ─── BRIEFING (Claude + ISO-week cache) ───────────────────────────────────────
def test_briefing_first_and_cached(client):
    r1 = client.post(f"{API}/developments/altavista-polanco/briefing", timeout=60)
    assert r1.status_code == 200, r1.text
    d1 = r1.json()
    assert "text" in d1 and "week" in d1
    assert isinstance(d1["text"], str) and len(d1["text"]) > 0
    assert len(d1["text"]) <= 290, f"briefing too long {len(d1['text'])}"
    # first call should ideally be cached:false, but accept either if a prior test primed
    # Second call must be cached:true
    r2 = client.post(f"{API}/developments/altavista-polanco/briefing", timeout=30)
    assert r2.status_code == 200
    d2 = r2.json()
    assert d2.get("cached") is True, f"Second call should be cached=True, got {d2}"
    assert d2["text"] == d1["text"]


# ─── AI SEARCH (Claude parser + cache) ────────────────────────────────────────
def test_ai_search_natural_query(client):
    q = "depa 2 rec en Roma Norte máximo 8 millones con terraza"
    r1 = client.post(f"{API}/properties/search-ai", json={"query": q}, timeout=60)
    assert r1.status_code == 200, r1.text
    d1 = r1.json()
    assert "filters" in d1
    f = d1["filters"]
    # colonia
    colonias = f.get("colonia") or f.get("colonias") or []
    if isinstance(colonias, str):
        colonias = [colonias]
    assert any("roma-norte" in str(c).lower() for c in colonias), f"colonia missing roma-norte: {f}"
    # beds
    assert f.get("beds") == 2 or f.get("bedrooms") == 2, f"beds missing: {f}"
    # max price
    mp = f.get("max_price") or f.get("price_max")
    assert mp == 8000000, f"max_price missing/wrong: {f}"
    # amenity terrace/roof
    ams = f.get("amenity") or f.get("amenities") or []
    if isinstance(ams, str):
        ams = [ams]
    assert any(("roof" in str(a).lower()) or ("terra" in str(a).lower()) for a in ams), f"amenity missing roof/terrace: {f}"

    # second identical call → cached
    r2 = client.post(f"{API}/properties/search-ai", json={"query": q}, timeout=30)
    assert r2.status_code == 200, r2.text
    d2 = r2.json()
    assert d2.get("cached") is True, f"ai cache miss: {d2}"


def test_ai_search_empty_query(client):
    r = client.post(f"{API}/properties/search-ai", json={"query": ""}, timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d.get("filters") == {} or d["filters"] == {}
