"""W7.AS.3.B — Unit tests (dummy · cero infra · sin DB real).

Cubre los 4 módulos de inteligencia conversacional + el paquete de prompts:
  - conversation_rag (FAIL-OPEN sin KG)
  - conversation_disc_adapter (modificadores DISC + mapeo tier)
  - conversation_plan_venta_playbook (máquina de etapas)
  - conversation_function_calling (dispatch FAIL-OPEN)
  - conversation_prompts (base + 4 personas cargables)

Tests async se ejecutan via asyncio.run (sin dependencia de pytest-asyncio).
Ejecutar desde backend/:  pytest tests/test_conversation_intel.py
"""
from __future__ import annotations

import asyncio

import pytest

pytestmark = pytest.mark.unit


# ─── 1. Importabilidad de los 4 módulos + prompts ────────────────────────────

def test_all_modules_importable():
    from conversation_rag import get_context
    from conversation_disc_adapter import adapt_system_prompt
    from conversation_plan_venta_playbook import next_action
    from conversation_function_calling import dispatch_tool
    assert callable(get_context)
    assert callable(adapt_system_prompt)
    assert callable(next_action)
    assert callable(dispatch_tool)


# ─── 2. Las 4 personas + base cargan y build_prompt compone ──────────────────

def test_personas_loadable():
    from conversation_prompts import (
        SYSTEM_BASE, PERSONAS, available_personas, build_prompt,
    )
    assert isinstance(SYSTEM_BASE, str) and len(SYSTEM_BASE) > 50
    assert set(available_personas()) == {"luxury", "family", "investor", "first_home"}
    for key in PERSONAS:
        prompt = build_prompt(key)
        # base + persona presentes
        assert SYSTEM_BASE in prompt
        assert PERSONAS[key] in prompt
    # persona desconocida → solo base (FAIL-OPEN)
    assert build_prompt("does_not_exist") == SYSTEM_BASE


# ─── 3. DISC adapter adjunta el modificador correcto por letra ───────────────

def test_disc_adapter_appends_modifier():
    from conversation_disc_adapter import adapt_system_prompt
    base = "BASE_PROMPT"
    for letter, needle in (("D", "Dominante"), ("I", "Influyente"),
                           ("S", "Estable"), ("C", "Concienzudo")):
        out = adapt_system_prompt(base, letter)
        assert out.startswith(base)
        assert needle in out
        assert len(out) > len(base)


# ─── 4. DISC adapter FAIL-OPEN ante None / desconocido ───────────────────────

def test_disc_adapter_fail_open():
    from conversation_disc_adapter import adapt_system_prompt
    base = "BASE"
    assert adapt_system_prompt(base, None) == base
    assert adapt_system_prompt(base, "zzz") == base
    assert adapt_system_prompt(base, "") == base


# ─── 5. DISC tier (hot/warm/cold) se mapea a una dimensión DISC ──────────────

def test_disc_tier_mapping():
    from conversation_disc_adapter import adapt_system_prompt
    base = "BASE"
    assert "Dominante" in adapt_system_prompt(base, "hot")   # hot → D
    assert "Influyente" in adapt_system_prompt(base, "warm")  # warm → I
    assert "Estable" in adapt_system_prompt(base, "cold")     # cold → S


# ─── 6. Plan Venta: estado vacío → descubrimiento + shape correcto ───────────

def test_plan_venta_default_and_shape():
    from conversation_plan_venta_playbook import next_action, STAGES
    res = next_action("lead-1", {})
    assert set(res.keys()) == {"stage", "suggested_intent", "blocked_intents", "lead_id"}
    assert res["stage"] == "descubrimiento"
    assert res["stage"] in STAGES
    assert res["suggested_intent"] == "discover_needs"
    assert isinstance(res["blocked_intents"], list)
    # en descubrimiento el cierre está bloqueado
    assert "propose_close" in res["blocked_intents"]
    assert res["lead_id"] == "lead-1"


# ─── 7. Plan Venta: progresión por señales del estado ────────────────────────

def test_plan_venta_progression():
    from conversation_plan_venta_playbook import next_action
    assert next_action("l", {"qualified": True})["stage"] == "calificacion"
    assert next_action("l", {"demo_done": True})["stage"] == "demo"
    assert next_action("l", {"objection_raised": True})["stage"] == "objeciones"
    cierre = next_action("l", {"ready_to_close": True})
    assert cierre["stage"] == "cierre"
    assert cierre["suggested_intent"] == "propose_close"
    # en cierre ya no hay intenciones bloqueadas
    assert cierre["blocked_intents"] == []
    # current_stage explícito válido tiene prioridad
    assert next_action("l", {"current_stage": "demo"})["stage"] == "demo"


# ─── 8. Async FAIL-OPEN: RAG sin KG → "" · dispatch tool desconocida → ok=False

def test_async_fail_open_paths():
    from conversation_rag import get_context
    from conversation_function_calling import dispatch_tool

    async def _run():
        # KG no disponible en entorno de test → "" sin crash
        ctx = await get_context("¿cuánto cuesta en Polanco?", "lead-x", "tenant-x")
        assert ctx == ""
        # tool inexistente → resultado FAIL-OPEN citando la fuente
        out = await dispatch_tool("herramienta_inexistente", {"a": 1}, None)
        assert out["ok"] is False
        assert out["tool_id"] == "herramienta_inexistente"
        assert "result_summary" in out
        return True

    assert asyncio.run(_run()) is True
