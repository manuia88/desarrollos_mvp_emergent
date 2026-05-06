"""
Phase 4 Batch 24 — Marketplace Map Intelligence · pytest suite
Tests: heatmap endpoints, zoom levels, colonia intelligence, image search
"""
import os
import io
import json
import pytest
import httpx

BASE = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001")


# ─── Sub-A: Heatmap ───────────────────────────────────────────────────────────

def test_map_levels():
    """GET /api/public/map/levels devuelve Z1–Z4."""
    r = httpx.get(f"{BASE}/api/public/map/levels", timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert "levels" in d
    assert set(d["levels"].keys()) == {"Z1", "Z2", "Z3", "Z4"}
    assert "auto_switch" in d


def test_heatmap_price_z4():
    """Heatmap precio Z4 devuelve 16 colonias individuales."""
    r = httpx.get(f"{BASE}/api/public/map/heatmap?layer=price&zoom_level=4", timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d["type"] == "FeatureCollection"
    assert d["meta"]["zoom_unit"] == "colonia"
    assert d["meta"]["features_count"] == 16
    # Verificar que hay Polanco
    ids = {f["properties"]["id"] for f in d["features"]}
    assert "polanco" in ids
    # Valores en pesos (no en miles)
    prices = [f["properties"]["value"] for f in d["features"]]
    assert all(v >= 30000 for v in prices), f"Precios muy bajos: {prices[:3]}"
    # weight normalizado 0-1
    weights = [f["properties"]["weight"] for f in d["features"]]
    assert all(0.0 <= w <= 1.0 for w in weights)


def test_heatmap_demand_z3():
    """Heatmap demanda Z3 devuelve alcaldías."""
    r = httpx.get(f"{BASE}/api/public/map/heatmap?layer=demand&zoom_level=3", timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d["meta"]["zoom_unit"] == "alcaldia"
    assert d["meta"]["features_count"] >= 4


def test_heatmap_momentum_z2():
    """Heatmap momentum Z2 devuelve zonas metro."""
    r = httpx.get(f"{BASE}/api/public/map/heatmap?layer=momentum&zoom_level=2", timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d["meta"]["zoom_unit"] == "metro_zone"
    assert d["meta"]["features_count"] == 3


def test_heatmap_z1_country():
    """Heatmap Z1 devuelve un solo feature país."""
    r = httpx.get(f"{BASE}/api/public/map/heatmap?layer=price&zoom_level=1", timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d["meta"]["zoom_unit"] == "country"
    assert d["meta"]["features_count"] == 1


def test_heatmap_invalid_layer():
    """Capa inválida devuelve 422."""
    r = httpx.get(f"{BASE}/api/public/map/heatmap?layer=INVALID", timeout=15)
    assert r.status_code == 422


def test_heatmap_geojson_structure():
    """Cada feature tiene geometry Point y properties válidos."""
    r = httpx.get(f"{BASE}/api/public/map/heatmap?layer=price&zoom_level=4", timeout=15)
    d = r.json()
    for f in d["features"]:
        assert f["type"] == "Feature"
        assert f["geometry"]["type"] == "Point"
        assert len(f["geometry"]["coordinates"]) == 2
        assert "value" in f["properties"]
        assert "weight" in f["properties"]
        assert "id" in f["properties"]


# ─── Sub-B: Colonia Intelligence ──────────────────────────────────────────────

def test_colonia_polanco():
    """Colonia Polanco devuelve shape completo."""
    r = httpx.get(f"{BASE}/api/public/map/colonia/polanco", timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d["colonia"]["nombre"] == "Polanco"
    assert d["colonia"]["alcaldia"] == "Miguel Hidalgo"
    assert isinstance(d["projects_count"], int)
    assert d["avg_price_m2"] > 0
    # Climate twin
    assert d["climate_twin"]["city"] == "Upper East Side"
    assert d["climate_twin"]["similarity_pct"] > 0
    # Risks
    assert "flood" in d["risks"]
    assert "seismic" in d["risks"]
    assert "theft" in d["risks"]
    assert "heat_stress" in d["risks"]
    assert d["risks"]["mock"] is True


def test_colonia_roma_norte():
    """Colonia Roma Norte — twin es Williamsburg."""
    r = httpx.get(f"{BASE}/api/public/map/colonia/roma-norte", timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d["climate_twin"]["city"] == "Williamsburg"
    # Scores presentes
    assert isinstance(d["scores"], dict)
    assert len(d["scores"]) > 0


def test_colonia_not_found():
    """Colonia inexistente devuelve 404."""
    r = httpx.get(f"{BASE}/api/public/map/colonia/colonia-que-no-existe", timeout=15)
    assert r.status_code == 404


def test_colonia_risks_range():
    """Todos los valores de riesgo están en rango 0-100."""
    for colonia_id in ["polanco", "doctores", "condesa", "santa-fe"]:
        r = httpx.get(f"{BASE}/api/public/map/colonia/{colonia_id}", timeout=15)
        assert r.status_code == 200
        risks = r.json()["risks"]
        for key in ["flood", "seismic", "theft", "heat_stress"]:
            assert 0 <= risks[key] <= 100, f"{colonia_id}.{key} = {risks[key]}"


def test_all_16_colonias():
    """Los 16 colonia_id en data_seed son alcanzables."""
    colonia_ids = [
        "polanco", "lomas-chapultepec", "roma-norte", "roma-sur", "condesa",
        "juarez", "cuauhtemoc", "del-valle-centro", "narvarte", "napoles",
        "escandon", "anzures", "doctores", "coyoacan-centro", "pedregal", "santa-fe",
    ]
    for cid in colonia_ids:
        r = httpx.get(f"{BASE}/api/public/map/colonia/{cid}", timeout=15)
        assert r.status_code == 200, f"Colonia {cid} failed with {r.status_code}"


# ─── Sub-C: Image Search ──────────────────────────────────────────────────────

def _make_minimal_png() -> bytes:
    """Genera un PNG mínimo válido (1x1 rojo)."""
    import struct, zlib
    def chunk(name, data):
        c = struct.pack(">I", len(data)) + name + data
        crc = zlib.crc32(name + data) & 0xFFFFFFFF
        return c + struct.pack(">I", crc)
    png = b"\x89PNG\r\n\x1a\n"
    ihdr_data = struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)
    png += chunk(b"IHDR", ihdr_data)
    raw = b"\x00\xff\x00\x00"  # filter=0, R=255, G=0, B=0
    compressed = zlib.compress(raw)
    png += chunk(b"IDAT", compressed)
    png += chunk(b"IEND", b"")
    return png


def test_image_search_valid_image():
    """POST /api/public/search/by-image acepta imagen válida y devuelve matches."""
    png_bytes = _make_minimal_png()
    r = httpx.post(
        f"{BASE}/api/public/search/by-image",
        files={"file": ("test.png", io.BytesIO(png_bytes), "image/png")},
        headers={"X-Forwarded-For": "10.0.0.1"},
        timeout=60,
    )
    assert r.status_code == 200
    d = r.json()
    assert "matches" in d
    assert isinstance(d["matches"], list)
    assert "processing_ms" in d
    assert "embedding_cached" in d


def test_image_search_invalid_type():
    """Archivo no-imagen devuelve 400."""
    r = httpx.post(
        f"{BASE}/api/public/search/by-image",
        files={"file": ("doc.pdf", io.BytesIO(b"%PDF fake"), "application/pdf")},
        headers={"X-Forwarded-For": "10.0.0.2"},
        timeout=15,
    )
    assert r.status_code == 400


def test_image_search_rate_limit():
    """11ª request del mismo IP en 1 min devuelve 429."""
    png_bytes = _make_minimal_png()
    responses = []
    for i in range(11):
        r = httpx.post(
            f"{BASE}/api/public/search/by-image",
            files={"file": ("test.png", io.BytesIO(png_bytes), "image/png")},
            headers={"X-Forwarded-For": "192.168.99.99"},
            timeout=90,
        )
        responses.append(r.status_code)

    assert 429 in responses, f"Expected 429 in {set(responses)}"


def test_image_search_response_shape():
    """Cada match tiene los campos requeridos."""
    png_bytes = _make_minimal_png()
    r = httpx.post(
        f"{BASE}/api/public/search/by-image",
        files={"file": ("test.png", io.BytesIO(png_bytes), "image/png")},
        headers={"X-Forwarded-For": "10.0.0.3"},
        timeout=60,
    )
    assert r.status_code == 200
    d = r.json()
    if d["matches"]:
        m = d["matches"][0]
        assert "project_id" in m
        assert "similarity_pct" in m
        assert "nombre" in m
        assert "precio" in m
        assert "zona" in m
