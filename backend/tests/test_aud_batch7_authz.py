"""Regresiones del BATCH 7 (modelo de autorización de leads/conversaciones · doc AUTHZ_MODEL.md).

12 violaciones corregidas (AUD-049..057). Mezcla: 1 test de COMPORTAMIENTO del candado raíz
(tenant_scope es liviano, sin cliente LLM → importable) + structural sobre .py de disco (patrón AUD-025).
"""
import asyncio
import os
import re

import pytest
from fastapi import HTTPException

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _src(rel):
    return open(os.path.join(BACKEND, rel), encoding="utf-8").read()


# ─── AUD-051 · candado raíz role-aware (COMPORTAMIENTO) ─────────────────────────
class _FakeColl:
    def __init__(self, doc):
        self._doc = doc

    async def find_one(self, q, proj=None):
        return self._doc


class _FakeDB:
    def __init__(self, lead):
        self.leads = _FakeColl(lead)
        self.asesor_contactos = _FakeColl(None)


class _U:
    def __init__(self, **k):
        self.__dict__.update(k)


def test_aud051_assert_lead_owner_role_aware():
    from tenant_scope import assert_lead_owner
    lead = {"assigned_to": "A", "inmobiliaria_id": "INM1"}
    db = _FakeDB(lead)
    # Asesor dueño (A) → pasa
    asyncio.run(assert_lead_owner(db, _U(role="advisor", user_id="A", tenant_id="INM1"), "L1"))
    # Asesor B del MISMO tenant pero NO dueño → 404 (antes pasaba por match de tenant = fuga AUD-051)
    with pytest.raises(HTTPException):
        asyncio.run(assert_lead_owner(db, _U(role="advisor", user_id="B", tenant_id="INM1"), "L1"))
    # Inmobiliaria admin del tenant → pasa (ve los leads de sus asesores)
    asyncio.run(assert_lead_owner(db, _U(role="inmobiliaria_admin", user_id="ADM", tenant_id="INM1"), "L1"))
    # Superadmin → pasa
    asyncio.run(assert_lead_owner(db, _U(role="superadmin", user_id="S", tenant_id="X"), "L1"))
    # Asesor de OTRO tenant → 404
    with pytest.raises(HTTPException):
        asyncio.run(assert_lead_owner(db, _U(role="advisor", user_id="C", tenant_id="INM2"), "L1"))


def test_aud049_casamentera_apagada():
    src = _src("routes/agentic_crm.py")
    cas = re.search(r"async def casamentera\(.*?\n(?=\n@router|\n# )", src, re.S).group(0)
    assert "compute_match" not in cas and "get_active_partner_org_ids" not in cas, \
        "casamentera cross-org debe estar apagada (AUD-049)"
    assert "410" in cas


def test_aud050_red_comercial_sin_kpi_de_socio():
    src = _src("services/directory_aggregator.py")
    m = re.search(r"cross_inm\.append\(\{.*?\}\)", src, re.S).group(0)
    assert '"kpi"' not in m, "red-comercial cross_inmobiliaria NO debe exponer KPIs de leads del socio (AUD-050)"


def test_aud053_conversation_scope_per_asesor():
    src = _src("conversation_engine.py")
    for fn in ("get_conversation", "list_lead_conversations"):
        body = re.search(rf"async def {fn}\(.*?\n(?=\n    async def |\n    def )", src, re.S).group(0)
        assert "caller_asesor_id" in body, f"{fn} debe soportar scope per-asesor (AUD-053)"


def test_aud055_insights_bloquea_dev():
    src = _src("routes/asesor_daily_tools.py")
    li = re.search(r"async def lead_insights\(.*?compute_client_insights", src, re.S).group(0)
    assert '"developer_admin", "developer_director"' in li and "403" in li, \
        "lead_insights debe bloquear a los devs (conversación · AUD-055)"


def test_aud056_ai_summary_sin_notas_para_dev():
    # v1: el path del dev (no can_view_conversation) usa señales estructuradas, no notes_text
    s2 = _src("routes/dev_batch4_2.py")
    assert "can_view_conversation(user, lead)" in s2 and "_activity()" in s2
    # v2: _build_ai_summary ya NO mete recent_notes (texto de notas) al payload
    s4 = _src("routes/dev_batch4_4.py")
    build = re.search(r"async def _build_ai_summary\(.*?call_type=\"ai_summary\"", s4, re.S).group(0)
    assert "recent_notes" not in build, "_build_ai_summary NO debe incluir texto de notas (AUD-056)"


def test_aud057_send_message_gate_staff():
    src = _src("routes/conversation.py")
    pm = re.search(r"async def post_message\(.*?engine\.send_message", src, re.S).group(0)
    assert '(body.role or "user") != "user"' in pm and "conversación ajena" in pm, \
        "post_message debe gatear los mensajes de staff por dueño del hilo (AUD-057)"
