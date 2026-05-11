"""Phase 4 Batch 23 · Pytest regression suite for AI Copilot.

Run: DB_NAME=desarrollosmx python3 -m pytest tests/test_batch23.py -v
"""
import os

import httpx
import pytest

pytestmark = pytest.mark.integration


API = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")

DEV_EMAIL = "developer@demo.com"
DEV_PASSWORD = "Dev2026!"
ASESOR_EMAIL = "asesor@demo.com"
ASESOR_PASSWORD = "Asesor2026!"


def _mkclient(email, pwd):
    c = httpx.Client(base_url=API, timeout=120, follow_redirects=False)
    r = c.post("/api/auth/login", json={"email": email, "password": pwd})
    assert r.status_code == 200, r.text
    for ck in r.cookies.jar:
        c.cookies.set(ck.name, ck.value, domain=ck.domain, path=ck.path)
    return c


@pytest.fixture(scope="module")
def dev():
    c = _mkclient(DEV_EMAIL, DEV_PASSWORD)
    yield c
    c.close()


@pytest.fixture(scope="module")
def asesor():
    c = _mkclient(ASESOR_EMAIL, ASESOR_PASSWORD)
    yield c
    c.close()


# ─── Auth gating ─────────────────────────────────────────────────────────────

def test_ask_requires_auth():
    c = httpx.Client(base_url=API, timeout=10)
    r = c.post("/api/copilot/ask", json={"question": "hola"})
    assert r.status_code in (401, 403)
    c.close()


def test_quick_actions_requires_auth():
    c = httpx.Client(base_url=API, timeout=10)
    r = c.get("/api/copilot/quick-actions")
    assert r.status_code in (401, 403)
    c.close()


# ─── Quick actions ───────────────────────────────────────────────────────────

def test_quick_actions_developer(dev):
    r = dev.get("/api/copilot/quick-actions")
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["role"] == "developer_admin"
    assert isinstance(j["items"], list) and len(j["items"]) >= 4
    for it in j["items"]:
        assert {"id", "label", "prompt"} <= set(it.keys())


def test_quick_actions_asesor(asesor):
    r = asesor.get("/api/copilot/quick-actions")
    assert r.status_code == 200
    j = r.json()
    assert isinstance(j["items"], list) and len(j["items"]) >= 4


def test_quick_actions_explicit_role(dev):
    r = dev.get("/api/copilot/quick-actions?role=advisor")
    assert r.status_code == 200
    j = r.json()
    assert j["role"] == "advisor"
    labels = [i["label"] for i in j["items"]]
    assert any("pipeline" in l.lower() for l in labels)


# ─── Ask flow + persistence ──────────────────────────────────────────────────

def test_ask_validation_too_short(dev):
    r = dev.post("/api/copilot/ask", json={"question": "x"})
    assert r.status_code == 422


def test_ask_dev_returns_response(dev):
    r = dev.post("/api/copilot/ask",
                 json={"question": "Resume mi pipeline en 2 viñetas"})
    assert r.status_code == 200, r.text
    j = r.json()
    assert isinstance(j["response_markdown"], str) and len(j["response_markdown"]) > 5
    assert isinstance(j["conversation_id"], str)
    assert j["tokens_used"] >= 0


def test_ask_threads_into_same_conversation(dev):
    r1 = dev.post("/api/copilot/ask", json={"question": "Saludo de prueba"})
    j1 = r1.json()
    cid = j1["conversation_id"]
    r2 = dev.post("/api/copilot/ask",
                  json={"question": "Sigue: dame 1 dato más", "conversation_id": cid})
    assert r2.status_code == 200
    j2 = r2.json()
    assert j2["conversation_id"] == cid


def test_list_conversations_returns_recent(dev):
    # ensure at least one exists from previous tests
    dev.post("/api/copilot/ask", json={"question": "Test list - dame 1 dato"})
    r = dev.get("/api/copilot/conversations")
    assert r.status_code == 200
    j = r.json()
    assert isinstance(j["items"], list)
    assert len(j["items"]) >= 1
    for it in j["items"]:
        assert {"id", "last_topic", "message_count"} <= set(it.keys())


def test_get_conversation_round_trip(dev):
    r = dev.post("/api/copilot/ask",
                 json={"question": "Round trip - dame 1 idea breve"})
    cid = r.json()["conversation_id"]
    r2 = dev.get(f"/api/copilot/conversations/{cid}")
    assert r2.status_code == 200, r2.text
    d = r2.json()
    assert d["id"] == cid
    msgs = d.get("messages", [])
    assert len(msgs) >= 2
    assert msgs[0]["role"] == "user"
    assert msgs[1]["role"] == "assistant"


def test_get_conversation_404(dev):
    r = dev.get("/api/copilot/conversations/cv_doesnotexist")
    assert r.status_code == 404


def test_delete_conversation(dev):
    r = dev.post("/api/copilot/ask", json={"question": "Para borrar luego"})
    cid = r.json()["conversation_id"]
    r2 = dev.delete(f"/api/copilot/conversations/{cid}")
    assert r2.status_code == 200
    # 404 after delete
    r3 = dev.get(f"/api/copilot/conversations/{cid}")
    assert r3.status_code == 404


def test_user_isolation(dev, asesor):
    """Asesor must NOT see developer's conversations."""
    r = dev.post("/api/copilot/ask", json={"question": "Conversación del dev"})
    cid_dev = r.json()["conversation_id"]
    # Asesor tries to read dev's conversation → 404
    r2 = asesor.get(f"/api/copilot/conversations/{cid_dev}")
    assert r2.status_code == 404
    # Asesor tries to delete dev's conversation → 404
    r3 = asesor.delete(f"/api/copilot/conversations/{cid_dev}")
    assert r3.status_code == 404
