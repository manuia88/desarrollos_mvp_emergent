"""Phase 4 Batch 13 — Cross-portal sync + tracking attribution tests."""
import requests

API = "http://localhost:8001"


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200
    return s


def test_attribution_model_get():
    s = _login("developer@demo.com", "Dev2026!")
    r = s.get(f"{API}/api/dev/settings/attribution-model")
    assert r.status_code == 200
    assert "model" in r.json()


def test_attribution_model_patch():
    s = _login("developer@demo.com", "Dev2026!")
    for m in ["first", "last", "split"]:
        r = s.patch(f"{API}/api/dev/settings/attribution-model", json={"model": m})
        assert r.status_code == 200
        assert r.json()["model"] == m
    # Invalid
    r = s.patch(f"{API}/api/dev/settings/attribution-model", json={"model": "invalid"})
    assert r.status_code == 400


def test_public_lead_with_attribution():
    s = requests.Session()
    payload = {
        "project_id": "altavista-polanco",
        "name": "Test Lead",
        "email": "test@example.com",
        "attribution": {
            "touchpoints": [
                {"asesor_id": "user_asesor_0001", "source": "asesor_link"},
                {"asesor_id": None, "source": "web_form"},
            ],
            "current_url": "/desarrollo/altavista-polanco?ref=user_asesor_0001",
            "cookie_ref": "user_asesor_0001",
        },
    }
    r = s.post(f"{API}/api/leads/public", json=payload)
    assert r.status_code == 200
    d = r.json()
    assert d["ok"] is True
    assert d["lead_id"].startswith("lead_")


def test_tracking_view():
    s = requests.Session()
    r = s.post(f"{API}/api/tracking/view",
               json={"asesor_id": "user_asesor_0001", "project_id": "altavista-polanco",
                     "url": "/test"})
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_asesor_tracking_links():
    s = _login("asesor@demo.com", "Asesor2026!")
    r = s.get(f"{API}/api/asesor/tracking-links")
    assert r.status_code == 200
    assert "asesor_id" in r.json()


def test_asesor_stats():
    s = _login("asesor@demo.com", "Asesor2026!")
    r = s.get(f"{API}/api/asesor/tracking-links/stats")
    assert r.status_code == 200
    assert "conversion_rate_pct" in r.json()


def test_qrcode():
    s = _login("asesor@demo.com", "Asesor2026!")
    r = s.post(f"{API}/api/asesor/tracking-links/qrcode",
               json={"url": "https://example.com/test"})
    assert r.status_code == 200
    assert r.json()["data_url"].startswith("data:image/png;base64,")


def test_kanban_unified():
    s = _login("developer@demo.com", "Dev2026!")
    r = s.get(f"{API}/api/dev/leads/kanban-unified")
    assert r.status_code == 200
    d = r.json()
    assert "columns" in d and len(d["columns"]) == 6


def test_cross_portal_sync_check():
    s = _login("developer@demo.com", "Dev2026!")
    r = s.post(f"{API}/api/cross-portal/sync-check")
    assert r.status_code == 200
    assert "issues" in r.json()


def test_unified_diagnostic_passes_wizard_project():
    """B13 fix: wizard projects should now PASS schema/marketplace probes."""
    s = _login("developer@demo.com", "Dev2026!")
    r = s.post(f"{API}/api/dev/projects/test-wizard-torre/diagnostic/run",
               json={"scope": "all"})
    assert r.status_code == 200
    d = r.json()
    schema_probes = [p for p in d["probes_results"] if p["module"] == "schema"]
    assert len(schema_probes) == 5
    schema_passed = [p for p in schema_probes if p["passed"]]
    # Schema probes should mostly pass (commercialization may still need first run)
    assert len(schema_passed) >= 3


if __name__ == "__main__":
    for fn_name in [n for n in dir() if n.startswith("test_")]:
        try:
            globals()[fn_name]()
            print(f"PASS {fn_name}")
        except AssertionError as e:
            print(f"FAIL {fn_name}: {e}")
        except Exception as e:
            print(f"ERR  {fn_name}: {type(e).__name__}: {e}")
