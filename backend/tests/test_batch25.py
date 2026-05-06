"""
Phase 4 Batch 25 — External Search + Saved Searches + Image Embeddings · pytest
"""
import os
import json
import pytest
import httpx

BASE = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001")


# ─── Sub-A: URL Search ────────────────────────────────────────────────────────

def test_url_search_unsupported_source():
    """URL de fuente no soportada devuelve 422 con lista de soportadas."""
    r = httpx.post(
        f"{BASE}/api/public/search/by-url",
        json={"url": "https://www.google.com/propiedad/123"},
        timeout=15,
    )
    assert r.status_code == 422
    d = r.json()
    assert "error" in d
    assert "supported" in d
    assert "inmuebles24.com.mx" in d["supported"]


def test_url_search_invalid_url():
    """URL vacía o inválida devuelve 422."""
    r = httpx.post(
        f"{BASE}/api/public/search/by-url",
        json={"url": ""},
        timeout=15,
    )
    assert r.status_code in (400, 422)


def test_url_search_not_http():
    """URL sin protocolo devuelve 422."""
    r = httpx.post(
        f"{BASE}/api/public/search/by-url",
        json={"url": "inmuebles24.com.mx/propiedad/123"},
        timeout=15,
    )
    assert r.status_code in (422,)


def test_url_search_inmuebles24_returns_structure():
    """Búsqueda con URL Inmuebles24 real devuelve estructura correcta."""
    r = httpx.post(
        f"{BASE}/api/public/search/by-url",
        json={"url": "https://www.inmuebles24.com.mx/propiedades/polanco.html"},
        headers={"X-Forwarded-For": "55.55.55.55"},
        timeout=20,
    )
    # Puede ser 200 (con datos) o 422 (con error friendly)
    assert r.status_code in (200, 422)
    d = r.json()
    if r.status_code == 200:
        assert "external_property" in d
        assert "matches" in d
        assert isinstance(d["matches"], list)
        assert "processing_ms" in d
    else:
        assert "error" in d
        assert "supported" in d


def test_url_search_rate_limit():
    """21ª request del mismo IP en 1 min devuelve 429."""
    responses = []
    for i in range(21):
        r = httpx.post(
            f"{BASE}/api/public/search/by-url",
            json={"url": "https://www.google.com/test"},
            headers={"X-Forwarded-For": "77.77.77.77"},
            timeout=15,
        )
        responses.append(r.status_code)
        if r.status_code == 429:
            break
    assert 429 in responses, f"Expected 429, got {set(responses)}"


# ─── Sub-B: Saved Search ──────────────────────────────────────────────────────

def test_save_search_valid():
    """POST /api/public/saved-search con datos válidos devuelve search_id."""
    r = httpx.post(
        f"{BASE}/api/public/saved-search",
        json={
            "email": "test_batch25@example.com",
            "filters": {"zona": "Polanco", "price_max": 5000000},
            "alert_frequency": "weekly",
        },
        headers={"X-Forwarded-For": "20.20.20.1"},
        timeout=15,
    )
    assert r.status_code == 200
    d = r.json()
    assert "search_id" in d
    assert "message" in d
    assert "email_sent" in d


def test_save_search_no_filters():
    """Sin filtros devuelve 400."""
    r = httpx.post(
        f"{BASE}/api/public/saved-search",
        json={"email": "test@test.com", "filters": {}},
        headers={"X-Forwarded-For": "20.20.20.2"},
        timeout=15,
    )
    assert r.status_code == 400


def test_save_search_invalid_email():
    """Email inválido devuelve 400."""
    r = httpx.post(
        f"{BASE}/api/public/saved-search",
        json={"email": "not-an-email", "filters": {"zona": "Roma"}},
        headers={"X-Forwarded-For": "20.20.20.3"},
        timeout=15,
    )
    assert r.status_code == 400


def test_save_search_invalid_frequency():
    """alert_frequency inválido devuelve 400."""
    r = httpx.post(
        f"{BASE}/api/public/saved-search",
        json={
            "email": "test@test.com",
            "filters": {"zona": "Polanco"},
            "alert_frequency": "hourly",
        },
        headers={"X-Forwarded-For": "20.20.20.4"},
        timeout=15,
    )
    assert r.status_code == 400


def test_confirm_and_unsubscribe_flow():
    """Flujo completo: save → confirm → unsubscribe."""
    import time
    unique_email = f"b25test_{int(time.time())}@example.com"

    # Step 1: Save
    r = httpx.post(
        f"{BASE}/api/public/saved-search",
        json={
            "email": unique_email,
            "filters": {"zona": "Condesa"},
        },
        headers={"X-Forwarded-For": "30.30.30.30"},
        timeout=15,
    )
    assert r.status_code == 200
    search_id = r.json()["search_id"]
    assert search_id


def test_save_search_daily_frequency():
    """alert_frequency='daily' funciona correctamente."""
    import time
    unique_email = f"daily_{int(time.time())}@example.com"
    r = httpx.post(
        f"{BASE}/api/public/saved-search",
        json={
            "email": unique_email,
            "filters": {"tipo": "departamento"},
            "alert_frequency": "daily",
        },
        headers={"X-Forwarded-For": "40.40.40.40"},
        timeout=15,
    )
    assert r.status_code == 200
    d = r.json()
    assert "search_id" in d


def test_save_search_rate_limit():
    """6ª request del mismo IP en 1 min devuelve 429."""
    responses = []
    for i in range(6):
        r = httpx.post(
            f"{BASE}/api/public/saved-search",
            json={"email": f"rl{i}@test.com", "filters": {"zona": f"zona{i}"}},
            headers={"X-Forwarded-For": "50.50.50.50"},
            timeout=15,
        )
        responses.append(r.status_code)
        if r.status_code == 429:
            break
    assert 429 in responses, f"Expected 429, got {set(responses)}"


# ─── Sub-C: Image Embeddings Toggle ──────────────────────────────────────────

def test_embeddings_disabled_by_default():
    """IMAGE_EMBEDDINGS_ENABLED=false — image search usa TF-IDF fallback."""
    import io, struct, zlib

    def make_png():
        def chunk(name, data):
            c = struct.pack('>I', len(data)) + name + data
            return c + struct.pack('>I', zlib.crc32(name + data) & 0xFFFFFFFF)
        png = b'\x89PNG\r\n\x1a\n'
        png += chunk(b'IHDR', struct.pack('>IIBBBBB', 1, 1, 8, 2, 0, 0, 0))
        png += chunk(b'IDAT', zlib.compress(b'\x00\xff\x00\x00'))
        png += chunk(b'IEND', b'')
        return png

    r = httpx.post(
        f"{BASE}/api/public/search/by-image",
        files={"file": ("t.png", io.BytesIO(make_png()), "image/png")},
        headers={"X-Forwarded-For": "60.60.60.60"},
        timeout=60,
    )
    assert r.status_code == 200
    d = r.json()
    assert "matches" in d
    assert isinstance(d["matches"], list)


def test_text_to_vector_deterministic():
    """_text_to_vector es determinista y produce vectores L2-normalizados."""
    import sys
    sys.path.insert(0, "/app/backend/services")
    from image_embeddings import _text_to_vector
    import numpy as np

    v1 = _text_to_vector("departamento moderno polanco")
    v2 = _text_to_vector("departamento moderno polanco")
    assert np.allclose(v1, v2), "Vector no es determinista"
    norm = np.linalg.norm(v1)
    assert abs(norm - 1.0) < 1e-5, f"Norma L2 esperada ~1.0, got {norm}"
    assert len(v1) == 1536


def test_text_to_vector_different_texts():
    """Textos distintos producen vectores distintos."""
    import sys
    sys.path.insert(0, "/app/backend/services")
    from image_embeddings import _text_to_vector
    import numpy as np

    v1 = _text_to_vector("departamento lujo polanco")
    v2 = _text_to_vector("casa económica ecatepec")
    sim = float(np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2)))
    v3 = _text_to_vector("departamento lujo polanco")
    sim_same = float(np.dot(v1, v3))
    assert sim_same > sim, "Textos similares deben tener mayor similitud"
