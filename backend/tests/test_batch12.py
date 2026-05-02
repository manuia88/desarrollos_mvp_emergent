"""Phase 4 Batch 12 — Wizard regression tests."""
import io
import os
import requests

API = os.environ.get("TEST_API_URL", "http://localhost:8001")
DEV_EMAIL = "developer@demo.com"
DEV_PASS = "Dev2026!"


def _login(email=DEV_EMAIL, password=DEV_PASS):
    s = requests.Session()
    r = s.post(f"{API}/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return s


def test_smart_defaults():
    s = _login()
    r = s.get(f"{API}/api/dev/wizard/smart-defaults")
    assert r.status_code == 200
    d = r.json()
    assert "categoria" in d
    assert "operacion" in d
    assert "amenidades_sugeridas" in d
    assert "comercializacion" in d


def test_draft_save_load():
    s = _login()
    r1 = s.post(f"{API}/api/dev/wizard/draft/save",
                json={"draft_data": {"x": 1}, "current_step": 3})
    assert r1.status_code == 200
    assert r1.json()["ok"] is True
    r2 = s.get(f"{API}/api/dev/wizard/draft/load")
    assert r2.status_code == 200
    d = r2.json()
    assert d.get("current_step") == 3
    assert d.get("draft_data", {}).get("x") == 1


def test_create_project():
    s = _login()
    r = s.post(f"{API}/api/dev/wizard/projects", json={
        "categoria": {"tipo_proyecto": "residencial_vertical",
                      "segmento": "NSE_C", "etapa": "preventa"},
        "operacion": {"nombre": f"Test Project {os.urandom(3).hex()}",
                      "total_unidades": 5, "target_price": 3000000},
        "ubicacion": {"colonia": "Test Col", "estado": "CDMX", "municipio": "Test"},
        "amenidades": ["gym"],
        "comercializacion": {"works_with_brokers": False, "default_commission_pct": 2.5},
        "ia_source": "manual",
    })
    assert r.status_code == 200
    d = r.json()
    assert d["ok"] is True
    assert d["project_id"].startswith("test-project-")
    assert "redirect" in d


def test_ia_extract_with_text():
    s = _login()
    text_content = (
        "Proyecto Test IA\nUbicación: Polanco CDMX\n"
        "100 unidades · preventa · NSE AB\n"
    ).encode()
    files = {"files": ("test.txt", io.BytesIO(text_content), "text/plain")}
    r = s.post(f"{API}/api/dev/wizard/ia-extract", files=files)
    assert r.status_code == 200
    d = r.json()
    assert "run_id" in d
    assert d["run_id"].startswith("wzia_")
    assert d["files"][0]["filename"] == "test.txt"


def test_drive_status():
    s = _login()
    r = s.get(f"{API}/api/dev/wizard/drive/status")
    assert r.status_code == 200
    d = r.json()
    assert "oauth_configured" in d
    assert "url_paste_available" in d


def test_drive_url_validation():
    s = _login()
    # Invalid URL
    r1 = s.post(f"{API}/api/dev/wizard/drive/url",
                json={"drive_folder_url": "https://example.com"})
    assert r1.status_code == 400
    # Valid pattern
    r2 = s.post(f"{API}/api/dev/wizard/drive/url",
                json={"drive_folder_url": "https://drive.google.com/drive/folders/1ABC123xyz456"})
    assert r2.status_code == 200


if __name__ == "__main__":
    for fn_name in [n for n in dir() if n.startswith("test_")]:
        try:
            globals()[fn_name]()
            print(f"PASS {fn_name}")
        except AssertionError as e:
            print(f"FAIL {fn_name}: {e}")
        except Exception as e:
            print(f"ERR  {fn_name}: {type(e).__name__}: {e}")
