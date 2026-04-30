"""Backend API tests for DesarrollosMX"""
import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

class TestHealth:
    def test_health(self):
        r = requests.get(f"{BASE_URL}/api/health")
        assert r.status_code == 200
        data = r.json()
        assert data.get("status") == "ok"

class TestColonias:
    def test_get_colonias(self):
        r = requests.get(f"{BASE_URL}/api/colonias")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == 3

    def test_colonia_fields(self):
        r = requests.get(f"{BASE_URL}/api/colonias")
        data = r.json()
        for c in data:
            assert "id" in c
            assert "name" in c
            assert "liv" in c
            assert "mov" in c
            assert "sec" in c
            assert "facts" in c

    def test_colonia_by_id(self):
        r = requests.get(f"{BASE_URL}/api/colonias/del-valle-centro")
        assert r.status_code == 200
        data = r.json()
        assert data["id"] == "del-valle-centro"
        assert data["name"] == "Del Valle Centro"

    def test_colonia_not_found(self):
        r = requests.get(f"{BASE_URL}/api/colonias/nonexistent")
        assert r.status_code == 404

class TestProperties:
    def test_get_properties(self):
        r = requests.get(f"{BASE_URL}/api/properties")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == 3

    def test_property_fields(self):
        r = requests.get(f"{BASE_URL}/api/properties")
        data = r.json()
        for p in data:
            assert "id" in p
            assert "title" in p
            assert "price" in p
            assert "scores" in p
            assert "advisor" in p

class TestAuth:
    def test_me_unauthenticated(self):
        r = requests.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 401

    def test_logout(self):
        r = requests.post(f"{BASE_URL}/api/auth/logout")
        assert r.status_code == 200
