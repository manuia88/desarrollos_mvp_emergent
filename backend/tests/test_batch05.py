"""Phase 4 Batch 0.5 — Diagnostic Engine regression tests."""
import requests

API = "http://localhost:8001"
DEV_EMAIL = "developer@demo.com"
DEV_PASS = "Dev2026!"
SA_EMAIL = "admin@desarrollosmx.com"
SA_PASS = "Admin2026!"


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return s


def test_probe_registry():
    s = _login(DEV_EMAIL, DEV_PASS)
    r = s.get(f"{API}/api/dev/diagnostic/probe-registry")
    assert r.status_code == 200
    d = r.json()
    assert d["total"] >= 30, f"Expected ≥30 probes, got {d['total']}"
    modules = {it["module"] for it in d["items"]}
    for req in ["schema", "ie_engine", "marketplace", "cross_portal",
                "engagement", "ai_integrations", "integrations_external",
                "performance", "notifications"]:
        assert req in modules, f"Missing module: {req}"


def test_run_diagnostic():
    s = _login(DEV_EMAIL, DEV_PASS)
    r = s.post(f"{API}/api/dev/projects/altavista-polanco/diagnostic/run",
               json={"scope": "all"})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["total_probes"] >= 30
    assert "summary" in d
    assert "by_module" in d["summary"]


def test_latest_diagnostic():
    s = _login(DEV_EMAIL, DEV_PASS)
    r = s.get(f"{API}/api/dev/projects/altavista-polanco/diagnostic/latest")
    assert r.status_code == 200


def test_user_diagnostic():
    s = _login(DEV_EMAIL, DEV_PASS)
    r = s.post(f"{API}/api/diagnostic/user/user_dev_0001/run")
    assert r.status_code == 200
    d = r.json()
    assert d["total_probes"] >= 10


def test_problem_report_flow():
    s = _login(DEV_EMAIL, DEV_PASS)
    r = s.post(f"{API}/api/diagnostic/problem-reports",
               json={"description": "Regression test report",
                     "current_url": "/test"})
    assert r.status_code == 200
    d = r.json()
    assert d["ok"] is True
    assert d["report_id"].startswith("rpt_")


def test_system_map():
    s = _login(SA_EMAIL, SA_PASS)
    r = s.get(f"{API}/api/superadmin/system-map")
    assert r.status_code == 200
    d = r.json()
    assert "nodes" in d and len(d["nodes"]) >= 9
    assert "stats" in d


def test_probe_recurrence():
    s = _login(SA_EMAIL, SA_PASS)
    r = s.get(f"{API}/api/superadmin/probe-recurrence")
    assert r.status_code == 200


def test_auto_fix():
    s = _login(DEV_EMAIL, DEV_PASS)
    r = s.post(f"{API}/api/dev/projects/altavista-polanco/diagnostic/auto-fix/seed_default_commercialization")
    assert r.status_code == 200
    d = r.json()
    assert d["ok"] is True


if __name__ == "__main__":
    for fn_name in [n for n in dir() if n.startswith("test_")]:
        try:
            globals()[fn_name]()
            print(f"PASS {fn_name}")
        except AssertionError as e:
            print(f"FAIL {fn_name}: {e}")
        except Exception as e:
            print(f"ERR  {fn_name}: {type(e).__name__}: {e}")
