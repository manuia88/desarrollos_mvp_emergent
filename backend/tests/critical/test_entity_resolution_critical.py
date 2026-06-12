"""Tests críticos · entity resolution (entity_resolution_engine.py).

Pieza crítica SIN test detectada en la auditoría B2. Es la regla canónica de
deduplicación de leads (registro de cita): un fallo silencioso fusiona leads de
distintos clientes o deja pasar duplicados. Congelamos el scoring (pesos
email .40 / phone .30 / nombre .20 / address .10) y las capas temporal/cross-asesor.

Funciones puras → tests directos, cero infra.
"""
from __future__ import annotations

import pytest

pytestmark = pytest.mark.unit

from entity_resolution_engine import (  # noqa: E402
    compute_score,
    is_cross_asesor,
    is_in_temporal_window,
    normalize_email,
    normalize_phone,
)


# ─── Normalizadores ───────────────────────────────────────────────────────────
def test_normalize_email_lowercase_y_trim():
    assert normalize_email("  A@B.COM ") == "a@b.com"


def test_normalize_phone_solo_digitos_10():
    assert normalize_phone("55-1234-5678") == "5512345678"
    assert normalize_phone("+52 5512345678") == "5512345678"


# ─── compute_score: pesos y matched_fields ────────────────────────────────────
def test_score_identico_email_phone_nombre():
    a = {"email": "ana@x.com", "phone": "5512345678", "name": "Ana Lopez"}
    r = compute_score(a, dict(a))
    # email(40) + phone(30) + nombre(~100*0.20≈20) ≈ 90; 3 campos matched (≥80)
    assert r["score_combined"] >= 88
    assert r["matched_fields"] == 3


def test_score_todo_distinto_es_bajo_y_sin_matches():
    a = {"email": "ana@x.com", "phone": "5512345678", "name": "Ana Lopez"}
    b = {"email": "beto@y.com", "phone": "5598765432", "name": "Carlos Ruiz"}
    r = compute_score(a, b)
    # email/phone no coinciden (0); el nombre puede aportar ruido fuzzy pequeño,
    # pero el score total queda muy por debajo del umbral de fusión y 0 campos matched.
    assert r["breakdown"]["email"] == 0 and r["breakdown"]["phone"] == 0
    assert r["score_combined"] < 20
    assert r["matched_fields"] == 0


def test_score_solo_email_aporta_al_menos_40():
    a = {"email": "ana@x.com", "phone": "5512345678", "name": "Ana Lopez"}
    b = {"email": "ana@x.com", "phone": "5598765432", "name": "Carlos Ruiz"}
    r = compute_score(a, b)
    # solo email coincide → su peso es 0.40 (40 pts); puede sumar algo de fuzzy del nombre.
    assert r["breakdown"]["email"] == 100
    assert 40.0 <= r["score_combined"] < 60.0
    assert r["matched_fields"] >= 1


# ─── Capa temporal (ventana 90d / aviso 1 año) ────────────────────────────────
def test_temporal_mismo_momento_ok_sin_aviso():
    a = {"created_at": "2026-01-01T00:00:00+00:00"}
    ok, manual = is_in_temporal_window(a, dict(a))
    assert ok is True and manual is False


def test_temporal_mas_de_un_ano_requiere_manual():
    a = {"created_at": "2024-01-01T00:00:00+00:00"}
    b = {"created_at": "2026-06-01T00:00:00+00:00"}
    ok, manual = is_in_temporal_window(a, b)
    assert ok is False  # > 90 días
    assert manual is True  # > 1 año → revisión manual


def test_temporal_sin_fecha_es_permisivo():
    ok, manual = is_in_temporal_window({}, {})
    assert ok is True and manual is False


# ─── Capa cross-asesor ────────────────────────────────────────────────────────
def test_cross_asesor_distinto_fuerza_manual():
    assert is_cross_asesor({"assigned_to": "a1"}, {"assigned_to": "a2"}) is True


def test_cross_asesor_mismo_o_faltante_no_fuerza():
    assert is_cross_asesor({"assigned_to": "a1"}, {"assigned_to": "a1"}) is False
    assert is_cross_asesor({"assigned_to": "a1"}, {}) is False
