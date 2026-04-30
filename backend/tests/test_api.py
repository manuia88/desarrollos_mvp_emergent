"""Backend API tests for DesarrollosMX — Phase 3 Marketplace."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL is required"


# ─── Health ───────────────────────────────────────────────────────────────────
class TestHealth:
    def test_health(self):
        r = requests.get(f"{BASE_URL}/api/health", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data.get("status") == "ok"
        assert data.get("colonias") == 16
        assert data.get("properties") == 25


# ─── Colonias ─────────────────────────────────────────────────────────────────
class TestColonias:
    def test_list_colonias(self):
        r = requests.get(f"{BASE_URL}/api/colonias", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == 16
        c = data[0]
        for key in ("id", "name", "alcaldia", "scores", "price_m2", "momentum", "polygon", "center"):
            assert key in c, f"missing {key}"

    def test_colonia_by_id(self):
        r = requests.get(f"{BASE_URL}/api/colonias/polanco", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["id"] == "polanco"
        assert data["name"] == "Polanco"
        assert "scores" in data

    def test_colonia_not_found(self):
        r = requests.get(f"{BASE_URL}/api/colonias/no-such", timeout=15)
        assert r.status_code == 404

    def test_colonia_propiedades(self):
        r = requests.get(f"{BASE_URL}/api/colonias/polanco/propiedades", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        for p in data:
            assert p["colonia_id"] == "polanco"

    def test_colonia_propiedades_404(self):
        r = requests.get(f"{BASE_URL}/api/colonias/no-such/propiedades", timeout=15)
        assert r.status_code == 404


# ─── Properties list + filters ────────────────────────────────────────────────
class TestPropertiesList:
    def test_list_all(self):
        r = requests.get(f"{BASE_URL}/api/properties", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == 25
        p = data[0]
        for key in ("id", "titulo", "titulo_en", "price", "price_display", "beds", "baths",
                    "parking", "sqm", "tipo", "tag", "amenities", "advisor", "colonia_id",
                    "center", "description"):
            assert key in p, f"property missing {key}"

    def test_filter_multi_colonia(self):
        r = requests.get(
            f"{BASE_URL}/api/properties",
            params=[("colonia", "polanco"), ("colonia", "roma-norte")], timeout=15,
        )
        assert r.status_code == 200
        data = r.json()
        assert all(p["colonia_id"] in ("polanco", "roma-norte") for p in data)
        assert len(data) >= 2

    def test_filter_min_price(self):
        r = requests.get(f"{BASE_URL}/api/properties", params={"min_price": 10000000}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert all(p["price"] >= 10000000 for p in data)
        assert len(data) > 0

    def test_filter_max_price(self):
        r = requests.get(f"{BASE_URL}/api/properties", params={"max_price": 5000000}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert all(p["price"] <= 5000000 for p in data)
        assert len(data) > 0

    def test_filter_min_sqm(self):
        r = requests.get(f"{BASE_URL}/api/properties", params={"min_sqm": 200}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert all(p["sqm"] >= 200 for p in data)

    def test_filter_beds(self):
        r = requests.get(f"{BASE_URL}/api/properties", params={"beds": 3}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert all(p["beds"] >= 3 for p in data)

    def test_filter_tipo_casa(self):
        r = requests.get(f"{BASE_URL}/api/properties", params={"tipo": "casa"}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert len(data) > 0
        assert all(p["tipo"] == "casa" for p in data)

    def test_filter_tag_preventa(self):
        r = requests.get(f"{BASE_URL}/api/properties", params={"tag": "preventa"}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert len(data) > 0
        assert all(p["tag"] == "preventa" for p in data)

    def test_filter_amenity_intersection(self):
        r = requests.get(
            f"{BASE_URL}/api/properties",
            params=[("amenity", "gym"), ("amenity", "pet")], timeout=15,
        )
        assert r.status_code == 200
        data = r.json()
        assert all("gym" in p["amenities"] and "pet" in p["amenities"] for p in data)
        assert len(data) > 0

    def test_sort_price_asc(self):
        r = requests.get(f"{BASE_URL}/api/properties", params={"sort": "price_asc"}, timeout=15)
        data = r.json()
        prices = [p["price"] for p in data]
        assert prices == sorted(prices)

    def test_sort_price_desc(self):
        r = requests.get(f"{BASE_URL}/api/properties", params={"sort": "price_desc"}, timeout=15)
        data = r.json()
        prices = [p["price"] for p in data]
        assert prices == sorted(prices, reverse=True)

    def test_sort_sqm_desc(self):
        r = requests.get(f"{BASE_URL}/api/properties", params={"sort": "sqm_desc"}, timeout=15)
        data = r.json()
        sqms = [p["sqm"] for p in data]
        assert sqms == sorted(sqms, reverse=True)


# ─── Single property + similares ──────────────────────────────────────────────
class TestPropertyDetail:
    def test_get_p007(self):
        r = requests.get(f"{BASE_URL}/api/properties/p007", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["id"] == "p007"
        assert data["colonia_id"] == "condesa"

    def test_get_404(self):
        r = requests.get(f"{BASE_URL}/api/properties/nonexistent", timeout=15)
        assert r.status_code == 404

    def test_similares(self):
        r = requests.get(f"{BASE_URL}/api/properties/p007/similares", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == 3
        ids = [p["id"] for p in data]
        assert "p007" not in ids
        # at least one should be same colonia (condesa) — p008 is condesa
        assert any(p["colonia_id"] == "condesa" for p in data)

    def test_similares_404(self):
        r = requests.get(f"{BASE_URL}/api/properties/nonexistent/similares", timeout=15)
        assert r.status_code == 404


# ─── Briefing (Claude) + cache ────────────────────────────────────────────────
class TestBriefing:
    def test_briefing_first_and_cached(self):
        r1 = requests.post(f"{BASE_URL}/api/properties/p007/briefing", timeout=60)
        assert r1.status_code == 200, r1.text
        d1 = r1.json()
        assert "text" in d1
        assert isinstance(d1["text"], str)
        assert len(d1["text"]) <= 290
        # No markdown / emoji-bullets
        assert "**" not in d1["text"]
        assert "##" not in d1["text"]
        # ISO week format
        assert "week" in d1
        assert "W" in d1["week"]
        # Second call should be cached
        r2 = requests.post(f"{BASE_URL}/api/properties/p007/briefing", timeout=30)
        assert r2.status_code == 200
        d2 = r2.json()
        assert d2.get("cached") is True
        assert d2["text"] == d1["text"]

    def test_briefing_404(self):
        r = requests.post(f"{BASE_URL}/api/properties/nonexistent/briefing", timeout=15)
        assert r.status_code == 404


# ─── Auth (regression smoke) ──────────────────────────────────────────────────
class TestAuthRegression:
    def test_me_unauth(self):
        r = requests.get(f"{BASE_URL}/api/auth/me", timeout=15)
        assert r.status_code == 401

    def test_logout(self):
        r = requests.post(f"{BASE_URL}/api/auth/logout", timeout=15)
        assert r.status_code == 200
