"""
Phase 4 Batch 28 — Portal Comprador (Magic Link + Dashboard + Favorites + Privacy) · pytest
Run: pytest /app/backend/tests/test_batch28.py -q
"""
import os
import re
import httpx
import pytest


def _resolve_base():
    """Test against public HTTPS URL so cookies (secure=True) are sent."""
    env_url = os.environ.get("REACT_APP_BACKEND_URL")
    if env_url:
        return env_url
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.strip().split("=", 1)[1]
    except Exception:
        pass
    return "http://localhost:8001"


BASE = _resolve_base()

# Unique suffix per test run to avoid DB pollution between reruns
import time as _t
import uuid as _uuid

pytestmark = pytest.mark.integration

_RUN_SUFFIX = f"{int(_t.time())}{_uuid.uuid4().hex[:4]}"

def _email(prefix: str) -> str:
    return f"{prefix}.{_RUN_SUFFIX}@dmx.com"


def _ip(s: str) -> dict:
    return {"X-Forwarded-For": f"28.28.{s}"}


def _request_token(email: str, ip_suffix: str) -> str:
    """Solicita un magic link y extrae el token del debug_link."""
    r = httpx.post(
        f"{BASE}/api/auth/comprador/magic-link/request",
        json={"email": email, "name": email.split("@")[0]},
        headers=_ip(ip_suffix),
        timeout=15,
    )
    assert r.status_code == 200
    d = r.json()
    link = d.get("debug_link") or ""
    m = re.search(r"token=([^&]+)", link)
    assert m, f"No token in debug_link: {link}"
    return m.group(1)


def _get_buyer_session(email: str, ip_suffix: str) -> httpx.Client:
    """Devuelve un httpx.Client con cookies de sesión comprador autenticada."""
    token = _request_token(email, ip_suffix)
    client = httpx.Client(timeout=15)
    r = client.get(f"{BASE}/api/auth/comprador/magic-link/verify?token={token}")
    assert r.status_code == 200, f"verify failed: {r.text}"
    return client


# ─── Sub-A · Magic Link ───────────────────────────────────────────────────────

def test_ml_request_invalid_email():
    r = httpx.post(f"{BASE}/api/auth/comprador/magic-link/request",
                   json={"email": "noemail"}, headers=_ip("1.1"), timeout=10)
    assert r.status_code == 400


def test_ml_request_returns_debug_link_in_preview():
    r = httpx.post(f"{BASE}/api/auth/comprador/magic-link/request",
                   json={"email": _email("test1")}, headers=_ip("1.2"), timeout=10)
    assert r.status_code == 200
    d = r.json()
    assert d.get("sent") is True
    # Si el email no se envía, debug_link presente
    if not d.get("email_sent"):
        assert "debug_link" in d
        assert "token=" in d["debug_link"]


def test_ml_verify_invalid_token():
    r = httpx.get(f"{BASE}/api/auth/comprador/magic-link/verify?token=invalid_xyz",
                  timeout=10)
    assert r.status_code == 401


def test_ml_verify_creates_user_role_buyer():
    token = _request_token(_email("newbuyer"), "1.3")
    r = httpx.get(f"{BASE}/api/auth/comprador/magic-link/verify?token={token}",
                  timeout=10)
    assert r.status_code == 200
    d = r.json()
    assert d["user"]["role"] == "buyer"
    # Cookie set
    assert "access_token" in r.cookies


def test_ml_verify_token_single_use():
    token = _request_token(_email("oneuse"), "1.4")
    r1 = httpx.get(f"{BASE}/api/auth/comprador/magic-link/verify?token={token}", timeout=10)
    assert r1.status_code == 200
    r2 = httpx.get(f"{BASE}/api/auth/comprador/magic-link/verify?token={token}", timeout=10)
    assert r2.status_code == 401


def test_ml_request_rate_limit():
    headers = {"X-Forwarded-For": "28.99.99.10"}
    last = None
    for _ in range(6):
        last = httpx.post(f"{BASE}/api/auth/comprador/magic-link/request",
                          json={"email": _email("rl")}, headers=headers, timeout=10)
    assert last.status_code == 429


# ─── Comprador endpoints sin auth → 401 ──────────────────────────────────────

def test_dashboard_requires_auth():
    r = httpx.get(f"{BASE}/api/comprador/dashboard", timeout=10)
    assert r.status_code == 401


def test_favorites_requires_auth():
    r = httpx.get(f"{BASE}/api/comprador/favorites", timeout=10)
    assert r.status_code == 401


# ─── Sub-A · Dashboard ───────────────────────────────────────────────────────

def test_dashboard_after_login():
    client = _get_buyer_session(_email("dash"), "2.1")
    r = client.get(f"{BASE}/api/comprador/dashboard")
    assert r.status_code == 200
    d = r.json()
    assert "kpis" in d and "profile_completion_pct" in d
    for k in ("saved_searches", "alerts", "favorites", "history"):
        assert k in d["kpis"]


def test_profile_get_and_patch():
    client = _get_buyer_session(_email("profile"), "2.2")
    r = client.get(f"{BASE}/api/comprador/profile")
    assert r.status_code == 200
    assert r.json()["email"] == _email("profile")

    r = client.patch(f"{BASE}/api/comprador/profile",
                     json={"name": "John Doe", "phone": "+525555000111"})
    assert r.status_code == 200
    assert r.json()["name"] == "John Doe"
    assert r.json()["phone"].startswith("+52")


# ─── Sub-B · Favorites + History ─────────────────────────────────────────────

def test_favorites_crud():
    client = _get_buyer_session(_email("fav"), "3.1")
    # Add
    r = client.post(f"{BASE}/api/comprador/favorites",
                    json={"item_type": "project", "item_id": "altavista-polanco",
                          "tags": ["urgente", "premium"]})
    assert r.status_code == 200
    fav_id = r.json()["fav_id"]
    assert r.json()["tags"] == ["urgente", "premium"]

    # Idempotency: re-add same returns same fav_id
    r2 = client.post(f"{BASE}/api/comprador/favorites",
                     json={"item_type": "project", "item_id": "altavista-polanco"})
    assert r2.status_code == 200
    assert r2.json()["fav_id"] == fav_id

    # List enriched with thumb
    r = client.get(f"{BASE}/api/comprador/favorites")
    assert r.status_code == 200
    items = r.json()
    assert len(items) >= 1
    first = next(f for f in items if f["fav_id"] == fav_id)
    assert first.get("thumb", {}).get("name") == "Altavista Polanco"

    # Filter by item_type
    r = client.get(f"{BASE}/api/comprador/favorites?item_type=colonia")
    assert r.status_code == 200
    assert all(f["item_type"] == "colonia" for f in r.json())

    # Delete
    r = client.delete(f"{BASE}/api/comprador/favorites/{fav_id}")
    assert r.status_code == 200
    assert r.json()["deleted"] is True


def test_favorite_invalid_item_type():
    client = _get_buyer_session(_email("inv"), "3.2")
    r = client.post(f"{BASE}/api/comprador/favorites",
                    json={"item_type": "ufo", "item_id": "x"})
    assert r.status_code == 400


def test_history_track_and_list():
    client = _get_buyer_session(_email("hist"), "3.3")
    # Track view
    r = client.post(f"{BASE}/api/comprador/history",
                    json={"item_type": "project", "item_id": "altavista-polanco",
                          "source": "marketplace"})
    assert r.status_code == 200
    assert r.json().get("view_id")

    # Dedup within 60s — same item should not duplicate
    r2 = client.post(f"{BASE}/api/comprador/history",
                     json={"item_type": "project", "item_id": "altavista-polanco",
                           "source": "marketplace"})
    assert r2.json().get("deduped") is True

    # List
    r = client.get(f"{BASE}/api/comprador/history?limit=10")
    assert r.status_code == 200
    items = r.json()
    assert len(items) >= 1
    assert any(v["item_id"] == "altavista-polanco" for v in items)
    # Enriched
    proj_view = next(v for v in items if v["item_id"] == "altavista-polanco")
    assert proj_view.get("thumb", {}).get("name") == "Altavista Polanco"

    # Clear
    r = client.delete(f"{BASE}/api/comprador/history")
    assert r.status_code == 200
    assert r.json()["cleared"] >= 1
    r = client.get(f"{BASE}/api/comprador/history")
    assert r.json() == []


def test_saved_searches_link_to_user():
    """Anon save_search by email → user logs in con same email → search aparece linked."""
    email = _email("linked")
    # Anonymous save (B25 endpoint)
    r = httpx.post(f"{BASE}/api/public/saved-search",
                   json={"email": email, "filters": {"colonia": "polanco"}, "alert_frequency": "weekly"},
                   headers=_ip("3.4"), timeout=15)
    assert r.status_code == 200
    search_id = r.json()["search_id"]

    # Login as same email via magic link
    client = _get_buyer_session(email, "3.5")
    r = client.get(f"{BASE}/api/comprador/saved-searches")
    assert r.status_code == 200
    items = r.json()
    # Search by email should be visible (auto-linked en first read)
    ids = [s["search_id"] for s in items]
    assert search_id in ids

    # Delete works
    r = client.delete(f"{BASE}/api/comprador/saved-searches/{search_id}")
    assert r.status_code == 200


# ─── Sub-C · Privacy ─────────────────────────────────────────────────────────

def test_consents_default_then_update():
    client = _get_buyer_session(_email("priv"), "4.1")
    # GET defaults
    r = client.get(f"{BASE}/api/comprador/privacy/consents")
    assert r.status_code == 200
    d = r.json()
    assert d.get("is_default") is True
    assert d["consents"]["marketing_email"] is False
    assert d["consents"]["analytics"] is True

    # PATCH partial
    r = client.patch(f"{BASE}/api/comprador/privacy/consents",
                     json={"consents": {"marketing_email": True, "analytics": False}})
    assert r.status_code == 200
    assert r.json()["consents"]["marketing_email"] is True
    assert r.json()["consents"]["analytics"] is False
    # share_with_dev untouched
    assert r.json()["consents"]["share_with_dev"] is False

    # GET again, no longer default
    r = client.get(f"{BASE}/api/comprador/privacy/consents")
    assert r.json()["is_default"] is False


def test_consents_invalid_keys_ignored():
    client = _get_buyer_session(_email("inv-c"), "4.2")
    r = client.patch(f"{BASE}/api/comprador/privacy/consents",
                     json={"consents": {"hack_key": True}})
    assert r.status_code == 400


def test_export_user_data():
    client = _get_buyer_session(_email("export"), "4.3")
    # Add some data
    client.post(f"{BASE}/api/comprador/favorites",
                json={"item_type": "project", "item_id": "altavista-polanco"})

    r = client.post(f"{BASE}/api/comprador/privacy/export")
    assert r.status_code == 200
    d = r.json()
    assert d.get("status") in ("ready", "sent")
    assert d.get("items", {}).get("favorites") >= 1


def test_delete_account_email_mismatch():
    client = _get_buyer_session(_email("delme"), "4.4")
    r = client.post(f"{BASE}/api/comprador/privacy/delete-account",
                    json={"confirm_email": "wrong@email.com"})
    assert r.status_code == 400


def test_delete_account_soft_then_cancel():
    client = _get_buyer_session(_email("delsoft"), "4.5")
    r = client.post(f"{BASE}/api/comprador/privacy/delete-account",
                    json={"confirm_email": _email("delsoft"),
                          "reason": "testing"})
    assert r.status_code == 200
    assert r.json()["soft_deleted"] is True
    assert r.json()["grace_period_days"] == 30

    # Cancel: nuevo login restaura la cuenta (grace period)
    client2 = _get_buyer_session(_email("delsoft"), "4.6")
    r = client2.post(f"{BASE}/api/comprador/privacy/cancel-delete")
    assert r.status_code == 200
    assert r.json()["cancelled"] is True
