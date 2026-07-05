"""Oportunidades del asesor — demanda → TUS clientes → mensaje.

Fija el contrato del endpoint /api/asesor/market/oportunidades: (1) owner-scoping duro (cada asesor
ve SOLO sus leads, por assignee_id — nunca ajenos); (2) leads cerrados excluidos; (3) agrupación por
colonia con orden leads-first; (4) join demanda↔desarrollos↔leads. Se mockea demand_gap para aislar
la lógica del endpoint del motor OLAP.
"""
import types

import mongomock_motor
import pytest

import routes.asesor_market as R
import dmx_demand


@pytest.fixture()
def db():
    return mongomock_motor.AsyncMongoMockClient()["dmx_test"]


def _req(db):
    return types.SimpleNamespace(app=types.SimpleNamespace(state=types.SimpleNamespace(db=db)))


def _patch_auth(monkeypatch, user_id):
    async def _fake_auth(request):
        return types.SimpleNamespace(role="advisor", user_id=user_id)
    monkeypatch.setattr(R, "_auth", _fake_auth)


def _patch_demand(monkeypatch):
    # polanco (altavista-polanco) y roma-norte (roma-norte-85) son colonias con desarrollos reales.
    async def _fake_gap(db, top=25):
        return {
            "demand_source": "behavioral_events", "es_estimado": False,
            "lectura_datos": "Demanda con datos reales",
            "cells": [
                {"colonia": "polanco", "tipologia": "2_recamaras", "available": 5, "gap_score": 0.4, "verdict": "Se agota rápido → ventana para construir/subir", "zone_demand": 30},
                {"colonia": "roma-norte", "tipologia": "1_recamara", "available": 10, "gap_score": 0.1, "verdict": "Sostener", "zone_demand": 12},
                {"colonia": "condesa", "tipologia": "3_recamaras", "available": 3, "gap_score": 0.2, "verdict": "Sostener", "zone_demand": 8},
            ],
        }
    monkeypatch.setattr(dmx_demand, "demand_gap", _fake_gap)


async def _seed_leads(db):
    # Campos de dueño MIXTOS a propósito: producción escribe assigned_to (lead_capture/journey),
    # otros caminos usan asesor_id/owner_id (tenant_scope.assert_lead_owner), el seed demo assignee_id.
    # El endpoint debe encontrar los leads del asesor por CUALQUIERA de los 4 (antes solo assignee_id → vacío).
    await db.leads.insert_many([
        # míos (asr_test) — polanco (2) + roma-norte (1)
        {"id": "L1", "name": "Cliente A", "development_id": "altavista-polanco", "assigned_to": "asr_test", "status": "nuevo"},
        {"id": "L2", "name": "Cliente B", "development_id": "altavista-polanco", "asesor_id": "asr_test", "status": "contactado"},
        {"id": "L3", "name": "Cliente C", "development_id": "roma-norte-85", "assignee_id": "asr_test", "status": "cita"},
        # cerrado (no debe aparecer)
        {"id": "L4", "name": "Cerrado", "development_id": "altavista-polanco", "assigned_to": "asr_test", "status": "cerrado_ganado"},
        # de OTRO asesor (jamás debe verse)
        {"id": "L9", "name": "Ajeno", "development_id": "altavista-polanco", "assigned_to": "otro_asesor", "status": "nuevo"},
    ])


@pytest.mark.asyncio
async def test_owner_scoping_and_grouping(db, monkeypatch):
    _patch_auth(monkeypatch, "asr_test")
    _patch_demand(monkeypatch)
    await _seed_leads(db)

    out = await R.oportunidades(_req(db), top=20)
    by_col = {o["colonia"]: o for o in out["oportunidades"]}

    # Polanco: 2 leads míos (cerrado y ajeno excluidos)
    assert by_col["polanco"]["n_leads"] == 2
    ids = {l["id"] for l in by_col["polanco"]["mis_leads"]}
    assert ids == {"L1", "L2"}
    assert "L4" not in ids and "L9" not in ids            # cerrado y ajeno fuera

    # roma-norte: 1 lead mío
    assert by_col["roma-norte"]["n_leads"] == 1
    assert by_col["roma-norte"]["mis_leads"][0]["id"] == "L3"

    # condesa: sin leads míos, pero aparece como intel de mercado
    assert by_col["condesa"]["n_leads"] == 0

    # orden leads-first: las dos colonias con leads van antes que la sin leads
    order = [o["colonia"] for o in out["oportunidades"]]
    assert order.index("polanco") < order.index("condesa")
    assert order.index("roma-norte") < order.index("condesa")
    assert out["con_leads"] == 2
    assert out["total"] == 3


@pytest.mark.asyncio
async def test_other_asesor_sees_only_theirs(db, monkeypatch):
    """El mismo dato, otro dueño → jamás ve los leads del primero (no fuga cross-asesor)."""
    _patch_demand(monkeypatch)
    await _seed_leads(db)
    _patch_auth(monkeypatch, "otro_asesor")

    out = await R.oportunidades(_req(db), top=20)
    by_col = {o["colonia"]: o for o in out["oportunidades"]}
    # otro_asesor solo tiene L9 (polanco)
    assert by_col["polanco"]["n_leads"] == 1
    assert by_col["polanco"]["mis_leads"][0]["id"] == "L9"
    all_ids = {l["id"] for o in out["oportunidades"] for l in o["mis_leads"]}
    assert all_ids == {"L9"}                              # nunca L1/L2/L3


@pytest.mark.asyncio
async def test_no_leads_still_returns_market_intel(db, monkeypatch):
    """Asesor sin ningún lead: ve la demanda (intel), con_leads=0, sin tronar."""
    _patch_auth(monkeypatch, "asesor_vacio")
    _patch_demand(monkeypatch)
    out = await R.oportunidades(_req(db), top=20)
    assert out["con_leads"] == 0
    assert out["total"] == 3
    assert all(o["n_leads"] == 0 for o in out["oportunidades"])
