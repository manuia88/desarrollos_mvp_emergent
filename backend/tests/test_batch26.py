"""
Phase 4 Batch 26 — Marketplace Lead-Capture Tools (Reporte + Quiz + Comparador) · pytest
Run: pytest /app/backend/tests/test_batch26.py -q
"""
import os
import base64
import httpx
import pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001")


def _ip(suffix: str) -> dict:
    """Genera headers únicos por IP para evitar 429 entre tests."""
    return {"X-Forwarded-For": f"26.26.{suffix}"}


# ─── Sub-A · Reporte de Colonia (PDF) ─────────────────────────────────────────

def test_report_request_invalid_colonia():
    """Colonia inexistente devuelve 404."""
    r = httpx.post(
        f"{BASE}/api/public/colonia/colonia-que-no-existe-xyz/report-request",
        json={"email": "test@dmx.com", "accepted_terms": True},
        headers=_ip("1.1"),
        timeout=15,
    )
    assert r.status_code == 404


def test_report_request_invalid_email():
    r = httpx.post(
        f"{BASE}/api/public/colonia/polanco/report-request",
        json={"email": "noemail", "accepted_terms": True},
        headers=_ip("1.2"),
        timeout=15,
    )
    assert r.status_code == 400


def test_report_request_terms_required():
    r = httpx.post(
        f"{BASE}/api/public/colonia/polanco/report-request",
        json={"email": "x@y.com", "accepted_terms": False},
        headers=_ip("1.3"),
        timeout=15,
    )
    assert r.status_code == 400


def test_report_request_success_returns_pdf_base64():
    """Happy path: genera PDF base64 + capture_id."""
    r = httpx.post(
        f"{BASE}/api/public/colonia/polanco/report-request",
        json={"email": "lead.report@dmx.com", "accepted_terms": True},
        headers=_ip("1.4"),
        timeout=20,
    )
    assert r.status_code == 200
    d = r.json()
    assert d.get("capture_id")
    assert d.get("colonia_nombre") == "Polanco"
    assert d.get("pdf_base64")
    # Validar magic bytes PDF
    pdf = base64.b64decode(d["pdf_base64"])
    assert pdf[:5] == b"%PDF-"
    assert len(pdf) > 1000  # >1KB indica PDF real


# ─── Sub-B · Quiz Colonia ─────────────────────────────────────────────────────

def test_quiz_invalid_email():
    r = httpx.post(
        f"{BASE}/api/public/quiz/submit",
        json={"email": "bad", "answers": {"a": 1, "b": 2, "c": 3}, "accepted_terms": True},
        headers=_ip("2.1"),
        timeout=15,
    )
    assert r.status_code == 400


def test_quiz_too_few_answers():
    r = httpx.post(
        f"{BASE}/api/public/quiz/submit",
        json={"email": "ok@dmx.com", "answers": {"a": 1}, "accepted_terms": True},
        headers=_ip("2.2"),
        timeout=15,
    )
    assert r.status_code == 400


def test_quiz_returns_top_3_with_match_pct():
    """Quiz devuelve exactamente 3 matches con match_pct sorteado desc."""
    answers = {
        "presupuesto": "3to6m",
        "uso": "vivir",
        "etapa_vida": "pareja",
        "lifestyle": ["culture", "gastronomy"],
        "movilidad": "transporte",
        "seguridad_importance": "alta",
    }
    r = httpx.post(
        f"{BASE}/api/public/quiz/submit",
        json={"email": "lead.quiz@dmx.com", "answers": answers, "accepted_terms": True},
        headers=_ip("2.3"),
        timeout=20,
    )
    assert r.status_code == 200
    d = r.json()
    assert d.get("capture_id")
    assert isinstance(d.get("matches"), list)
    assert len(d["matches"]) == 3
    pcts = [m["match_pct"] for m in d["matches"]]
    assert pcts == sorted(pcts, reverse=True)
    for m in d["matches"]:
        assert m.get("colonia_id")
        assert m.get("nombre")
        assert isinstance(m.get("top_3_reasons"), list)


def test_quiz_terms_required():
    r = httpx.post(
        f"{BASE}/api/public/quiz/submit",
        json={
            "email": "x@y.com",
            "answers": {"a": 1, "b": 2, "c": 3, "d": 4},
            "accepted_terms": False,
        },
        headers=_ip("2.4"),
        timeout=15,
    )
    assert r.status_code == 400


# ─── Sub-C · Comparador ───────────────────────────────────────────────────────

def test_compare_invalid_entity_type():
    r = httpx.post(
        f"{BASE}/api/public/compare",
        json={"entity_type": "foo", "ids": ["polanco"]},
        headers=_ip("3.1"),
        timeout=15,
    )
    assert r.status_code == 400


def test_compare_too_many_ids():
    r = httpx.post(
        f"{BASE}/api/public/compare",
        json={"entity_type": "colonia", "ids": ["a", "b", "c", "d"]},
        headers=_ip("3.2"),
        timeout=15,
    )
    assert r.status_code == 400


def test_compare_no_ids():
    r = httpx.post(
        f"{BASE}/api/public/compare",
        json={"entity_type": "colonia", "ids": []},
        headers=_ip("3.3"),
        timeout=15,
    )
    assert r.status_code == 400


def test_compare_single_colonia_ok():
    r = httpx.post(
        f"{BASE}/api/public/compare",
        json={"entity_type": "colonia", "ids": ["polanco"]},
        headers=_ip("3.4"),
        timeout=20,
    )
    assert r.status_code == 200
    d = r.json()
    assert d.get("entity_type") == "colonia"
    assert len(d.get("entities", [])) == 1
    assert d["entities"][0]["id"] == "polanco"
    assert isinstance(d.get("metrics"), list) and len(d["metrics"]) > 0


def test_compare_two_colonias_has_winner_idx():
    r = httpx.post(
        f"{BASE}/api/public/compare",
        json={"entity_type": "colonia", "ids": ["polanco", "roma-norte"]},
        headers=_ip("3.5"),
        timeout=25,
    )
    assert r.status_code == 200
    d = r.json()
    assert len(d.get("entities", [])) == 2
    # Al menos una métrica debe tener winner_idx asignado
    has_winner = any(m.get("winner_idx") in (0, 1) for m in d.get("metrics", []))
    assert has_winner, "Esperaba winner_idx en al menos una métrica"


def test_compare_three_colonias_ok():
    r = httpx.post(
        f"{BASE}/api/public/compare",
        json={"entity_type": "colonia", "ids": ["polanco", "roma-norte", "condesa"]},
        headers=_ip("3.6"),
        timeout=30,
    )
    assert r.status_code == 200
    d = r.json()
    assert len(d.get("entities", [])) == 3


def test_compare_pdf_returns_valid_pdf():
    r = httpx.post(
        f"{BASE}/api/public/compare/pdf",
        json={"entity_type": "colonia", "ids": ["polanco", "roma-norte"]},
        headers=_ip("3.7"),
        timeout=25,
    )
    assert r.status_code == 200
    assert r.headers.get("content-type") == "application/pdf"
    assert r.content[:5] == b"%PDF-"
    assert len(r.content) > 1000


# ─── Rate limiting ────────────────────────────────────────────────────────────

def test_report_rate_limit_429():
    """6ª request en <1min desde misma IP → 429."""
    headers = {"X-Forwarded-For": "26.99.99.99"}
    last = None
    for _ in range(6):
        last = httpx.post(
            f"{BASE}/api/public/colonia/polanco/report-request",
            json={"email": "rl@dmx.com", "accepted_terms": True},
            headers=headers,
            timeout=20,
        )
    assert last.status_code == 429
