"""Phase 4 Batch 11 regression tests — Amenidades, Comercialización, Unit drawer endpoints."""
import os
import requests

API = os.environ.get("TEST_API_URL", "http://localhost:8001")
DEV_ID = "altavista-polanco"
UNIT_ID = "altavista-polanco-02A"


def _login():
    s = requests.Session()
    r = s.post(f"{API}/api/auth/login",
               json={"email": "developer@demo.com", "password": "Dev2026!"},
               timeout=10)
    assert r.status_code == 200, r.text
    return s


def test_amenities_get():
    s = _login()
    r = s.get(f"{API}/api/dev/projects/{DEV_ID}/amenities")
    assert r.status_code == 200
    data = r.json()
    assert "amenities" in data
    assert "all_categories" in data
    assert "comunes" in data["all_categories"]


def test_amenities_patch():
    s = _login()
    r = s.patch(f"{API}/api/dev/projects/{DEV_ID}/amenities",
                json={"amenities": ["gym", "alberca", "spa"]})
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_commercialization_cycle():
    s = _login()
    r = s.get(f"{API}/api/dev/projects/{DEV_ID}/commercialization")
    assert r.status_code == 200
    data = r.json()
    assert "works_with_brokers" in data
    assert "default_commission_pct" in data

    r2 = s.patch(f"{API}/api/dev/projects/{DEV_ID}/commercialization",
                 json={"works_with_brokers": True, "default_commission_pct": 4.0})
    assert r2.status_code == 200
    assert r2.json()["works_with_brokers"] is True
    assert r2.json()["default_commission_pct"] == 4.0


def test_preassignments():
    s = _login()
    r = s.get(f"{API}/api/dev/projects/{DEV_ID}/preassignments")
    assert r.status_code == 200
    assert "items" in r.json()


def test_unit_price_history():
    s = _login()
    r = s.get(f"{API}/api/dev/units/{DEV_ID}/{UNIT_ID}/price-history")
    assert r.status_code == 200
    data = r.json()
    assert "history" in data
    assert data["unit_id"] == UNIT_ID


def test_unit_comparables():
    s = _login()
    r = s.get(f"{API}/api/dev/units/{DEV_ID}/{UNIT_ID}/comparables")
    assert r.status_code == 200
    data = r.json()
    assert "units" in data
    assert "total_count" in data


def test_unit_market_comparables():
    s = _login()
    r = s.get(f"{API}/api/dev/units/{DEV_ID}/{UNIT_ID}/market-comparables")
    assert r.status_code == 200
    data = r.json()
    assert "comparables" in data


def test_unit_engagement():
    s = _login()
    r = s.get(f"{API}/api/dev/units/{DEV_ID}/{UNIT_ID}/engagement")
    assert r.status_code == 200
    data = r.json()
    assert "asesores" in data
    assert "clientes" in data
    assert "funnel" in data


def test_unit_ai_prediction():
    s = _login()
    r = s.post(f"{API}/api/dev/units/{DEV_ID}/{UNIT_ID}/ai-prediction", json={})
    assert r.status_code == 200
    data = r.json()
    assert "prob_cierre_90d_pct" in data
    assert "recomendaciones" in data


if __name__ == "__main__":
    for fn_name in [n for n in dir() if n.startswith("test_")]:
        fn = globals()[fn_name]
        try:
            fn()
            print(f"PASS {fn_name}")
        except AssertionError as e:
            print(f"FAIL {fn_name}: {e}")
        except Exception as e:
            print(f"ERR  {fn_name}: {e}")
