"""
Phase 4 Batch 27 — Mortgage Calculator + Colonia History + Share-link OG · pytest
Run: pytest /app/backend/tests/test_batch27.py -q
"""
import os
import httpx

import pytest

pytestmark = pytest.mark.integration


BASE = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001")


def _ip(s: str) -> dict:
    return {"X-Forwarded-For": f"27.27.{s}"}


# ─── Sub-A · Mortgage Calculator ──────────────────────────────────────────────

def test_mortgage_invalid_precio():
    r = httpx.post(f"{BASE}/api/public/mortgage/calculate",
                   json={"precio": 0, "ingreso_mensual": 50000, "edad": 30,
                         "plazo_anos": 20, "enganche_pct": 0.2},
                   headers=_ip("1.1"), timeout=15)
    assert r.status_code == 400


def test_mortgage_invalid_plazo():
    r = httpx.post(f"{BASE}/api/public/mortgage/calculate",
                   json={"precio": 5_000_000, "ingreso_mensual": 50000, "edad": 30,
                         "plazo_anos": 50, "enganche_pct": 0.2},
                   headers=_ip("1.2"), timeout=15)
    assert r.status_code == 400


def test_mortgage_happy_path_5m_20pct_20y():
    """Caso de la verificación A: precio $5M + enganche 20% + 20 años + ingreso $50k."""
    r = httpx.post(f"{BASE}/api/public/mortgage/calculate",
                   json={
                       "precio": 5_000_000, "enganche_pct": 0.20,
                       "plazo_anos": 20, "ingreso_mensual": 50000, "edad": 32,
                       "sbc": 18000, "sueldo_basico": 15000, "ahorro_voluntario": 40000,
                   },
                   headers=_ip("1.3"), timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert "infonavit" in d and "fovissste" in d and "banca" in d
    # 5 bancos
    assert len(d["banca"]) == 5
    bancos = {b["banco"] for b in d["banca"]}
    assert bancos == {"BBVA", "Banamex", "Santander", "Banorte", "Scotiabank"}
    # Cada banco con campos clave
    for b in d["banca"]:
        assert "pago_mensual" in b and "cat_pct" in b and "dti_ratio" in b
        assert b["pago_mensual"] > 0
        assert b["cat_pct"] > b["tasa_anual_pct"]  # CAT siempre > tasa nominal
    assert "disclaimer" in d


def test_mortgage_low_income_dti_fail():
    """Edge case: ingreso bajo → DTI alto → todos los bancos viable=false con razón."""
    r = httpx.post(f"{BASE}/api/public/mortgage/calculate",
                   json={"precio": 5_000_000, "enganche_pct": 0.10,
                         "plazo_anos": 15, "ingreso_mensual": 15000, "edad": 40},
                   headers=_ip("1.4"), timeout=15)
    assert r.status_code == 200
    d = r.json()
    viables = [b["viable"] for b in d["banca"]]
    assert viables == [False] * 5
    assert "DTI" in (d["banca"][0]["razon"] or "")


def test_mortgage_save_invalid_email():
    r = httpx.post(f"{BASE}/api/public/mortgage/save",
                   json={"email": "x", "calculation": {}, "accepted_terms": True},
                   headers=_ip("1.5"), timeout=15)
    assert r.status_code == 400


def test_mortgage_save_terms_required():
    r = httpx.post(f"{BASE}/api/public/mortgage/save",
                   json={"email": "ok@dmx.com", "calculation": {}, "accepted_terms": False},
                   headers=_ip("1.6"), timeout=15)
    assert r.status_code == 400


def test_mortgage_save_happy():
    r = httpx.post(f"{BASE}/api/public/mortgage/save",
                   json={
                       "email": "lead.mortgage@dmx.com",
                       "calculation": {"inputs": {"precio": 5_000_000}, "banca": []},
                       "accepted_terms": True,
                       "propiedad_id": "test-prop-1",
                   },
                   headers=_ip("1.7"), timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d.get("saved") is True
    assert d.get("capture_id")


def test_mortgage_calc_rate_limit_429():
    """21 calls / 1 min desde misma IP → 429 (límite 20)."""
    headers = {"X-Forwarded-For": "27.99.99.1"}
    last = None
    for _ in range(21):
        last = httpx.post(f"{BASE}/api/public/mortgage/calculate",
                          json={"precio": 1_000_000, "ingreso_mensual": 30000,
                                "edad": 30, "plazo_anos": 20, "enganche_pct": 0.2},
                          headers=headers, timeout=10)
    assert last.status_code == 429


# ─── Sub-B · Colonia History ──────────────────────────────────────────────────

def test_history_404_unknown_colonia():
    r = httpx.get(f"{BASE}/api/public/colonia/no-existe-xyz/history",
                  headers=_ip("2.1"), timeout=15)
    assert r.status_code == 404


def test_history_polanco_shape_and_cache():
    """Primera llamada genera. Segunda llamada hit de cache (no consume budget)."""
    r1 = httpx.get(f"{BASE}/api/public/colonia/polanco/history",
                   headers=_ip("2.2"), timeout=40)
    assert r1.status_code == 200
    d1 = r1.json()
    assert d1.get("colonia_id") == "polanco"
    assert isinstance(d1.get("past_milestones"), list)
    assert isinstance(d1.get("future_projections"), list)
    assert "summary_text" in d1

    # Segunda llamada → from_cache True
    r2 = httpx.get(f"{BASE}/api/public/colonia/polanco/history",
                   headers=_ip("2.3"), timeout=15)
    assert r2.status_code == 200
    d2 = r2.json()
    assert d2.get("from_cache") is True


# ─── Sub-C · Share / og:image ─────────────────────────────────────────────────

def test_share_meta_invalid_type():
    r = httpx.get(f"{BASE}/api/share/comparar/meta?ids=polanco&type=foo",
                  headers=_ip("3.1"), timeout=10)
    assert r.status_code == 400


def test_share_meta_no_ids():
    r = httpx.get(f"{BASE}/api/share/comparar/meta?ids=&type=colonia",
                  headers=_ip("3.2"), timeout=10)
    assert r.status_code == 400


def test_share_meta_happy():
    r = httpx.get(f"{BASE}/api/share/comparar/meta?ids=polanco,roma-norte&type=colonia",
                  headers=_ip("3.3"), timeout=10)
    assert r.status_code == 200
    d = r.json()
    assert "Polanco" in d.get("og_title", "")
    assert "/api/share/comparar/og-image" in d.get("og_image_url", "")
    assert "ids=polanco,roma-norte" in d.get("og_image_url", "")
    assert len(d.get("entities", [])) == 2


def test_share_og_image_is_png():
    r = httpx.get(f"{BASE}/api/share/comparar/og-image?ids=polanco,roma-norte&type=colonia",
                  headers=_ip("3.4"), timeout=15)
    assert r.status_code == 200
    assert r.headers.get("content-type") == "image/png"
    # PNG magic bytes
    assert r.content[:8] == b"\x89PNG\r\n\x1a\n"
    assert len(r.content) > 1000


def test_share_og_image_3_entities():
    r = httpx.get(f"{BASE}/api/share/comparar/og-image?ids=polanco,roma-norte,condesa&type=colonia",
                  headers=_ip("3.5"), timeout=15)
    assert r.status_code == 200
    assert r.content[:8] == b"\x89PNG\r\n\x1a\n"


def test_virtual_tour_request_invalid_email():
    r = httpx.post(f"{BASE}/api/public/virtual-tour/request",
                   json={"email": "x", "accepted_terms": True,
                         "propiedad_id": "x", "propiedad_nombre": "Test"},
                   headers=_ip("3.6"), timeout=10)
    assert r.status_code == 400


def test_virtual_tour_request_happy():
    r = httpx.post(f"{BASE}/api/public/virtual-tour/request",
                   json={"email": "lead.tour@dmx.com", "accepted_terms": True,
                         "propiedad_id": "test-dev-1", "propiedad_nombre": "Torre Roma"},
                   headers=_ip("3.7"), timeout=10)
    assert r.status_code == 200
    d = r.json()
    assert d.get("registered") is True
    assert d.get("capture_id")
