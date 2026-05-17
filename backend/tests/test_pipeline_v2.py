"""W5.ASR.2 Parte 2 — Tests pipeline V2 (7 lineales + 2 paralelas).

3 tests requeridos:
  1. test_v2_kanban_columns_7_plus_parallel_chips_on_cards
  2. test_v2_hard_rules_block_invalid_transitions
  3. test_v2_parallel_states_activate_and_mark_lost
"""
import asyncio
import os
import uuid
from datetime import datetime, timezone

import pytest
import pytest_asyncio
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv("/app/backend/.env")

# Engine imports (test directo · no FastAPI app)
from pipeline_engine import (
    LINEAR_STAGES_ORDER,
    PARALLEL_STATES,
    validate_transition_v2,
    get_lead_pipeline_state,
    set_parallel_state,
    map_v1_to_v2,
)
from lead_journey_engine import step_type_for_v2_target, V2_STATUS_TO_STEP


# ─── Fixtures ────────────────────────────────────────────────────────────────

@pytest.fixture
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture
async def db():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    database = client[os.environ.get("DB_NAME", "test_db")]
    yield database
    client.close()


# ─── Test 1: V2 Kanban columns 7 + parallel chips on cards ───────────────────

@pytest.mark.asyncio
async def test_v2_kanban_columns_7_plus_parallel_chips_on_cards(db):
    """Verifica que el motor produce 7 etapas lineales V2 + paralelas como flags."""
    # 7 etapas lineales canónicas
    expected_linear = [
        "lead_nuevo", "contactado", "calificado",
        "visita", "negociacion", "cierre", "vendido",
    ]
    assert LINEAR_STAGES_ORDER == expected_linear, "Orden de etapas lineales V2 incorrecto"
    assert len(LINEAR_STAGES_ORDER) == 7, "Pipeline V2 debe tener exactamente 7 etapas lineales"

    # 2 paralelas
    assert sorted(PARALLEL_STATES) == ["nurture", "perdido"], "Paralelas V2 deben ser nurture y perdido"

    # Cards con paralelas activas: pipeline_state debe incluirlas
    lead_with_nurture = {
        "status_v2": "calificado",
        "nurture_active": True,
        "pipeline_version": 2,
    }
    state = get_lead_pipeline_state(lead_with_nurture)
    assert state["linear_status"] == "calificado"
    assert "nurture" in state["parallel_states"]
    assert state["stage_index"] == 2  # 0-based en LINEAR_STAGES_ORDER

    lead_with_perdido = {
        "status_v2": "negociacion",
        "lost_at": datetime.now(timezone.utc).isoformat(),
        "lost_reason": "Sin presupuesto",
        "pipeline_version": 2,
    }
    state = get_lead_pipeline_state(lead_with_perdido)
    assert state["linear_status"] == "negociacion"
    assert "perdido" in state["parallel_states"]

    # Lead con AMBAS paralelas activas simultáneamente (ortogonalidad)
    lead_both = {
        "status_v2": "contactado",
        "nurture_active": True,
        "lost_at": datetime.now(timezone.utc).isoformat(),
    }
    state = get_lead_pipeline_state(lead_both)
    assert set(state["parallel_states"]) == {"nurture", "perdido"}


# ─── Test 2: Hard-rules V2 bloquean transiciones inválidas ───────────────────

@pytest.mark.asyncio
async def test_v2_hard_rules_block_invalid_transitions(db):
    """Verifica las 6 hard-rules V2 que bloquean transiciones sin datos requeridos."""
    # Rule 1: lead_nuevo → contactado requires first_msg_sent_at
    lead = {"status_v2": "lead_nuevo"}
    ok, err = validate_transition_v2(lead, "contactado")
    assert not ok
    assert "first_contact" in err.lower() or "contactar" in err.lower()
    # Con dato: OK
    ok, _ = validate_transition_v2(
        {"status_v2": "lead_nuevo", "first_msg_sent_at": "2026-01-01T00:00:00Z"},
        "contactado",
    )
    assert ok

    # Rule 2: contactado → calificado requires budget + timeline
    ok, err = validate_transition_v2({"status_v2": "contactado"}, "calificado")
    assert not ok
    assert "budget" in err.lower() or "timeline" in err.lower()
    ok, _ = validate_transition_v2(
        {"status_v2": "contactado", "budget_declared": 5_000_000, "timeline_declared": "3m"},
        "calificado",
    )
    assert ok

    # Rule 3: calificado → visita requires cita_id
    ok, err = validate_transition_v2({"status_v2": "calificado"}, "visita")
    assert not ok
    assert "cita" in err.lower()

    # Rule 4: visita → negociacion requires visit_outcome
    ok, err = validate_transition_v2({"status_v2": "visita"}, "negociacion")
    assert not ok
    assert "visit_outcome" in err or "visita" in err.lower()

    # Rule 5: negociacion → cierre requires oferta_accepted_at
    ok, err = validate_transition_v2({"status_v2": "negociacion"}, "cierre")
    assert not ok
    assert "oferta" in err.lower()

    # Rule 6: cierre → vendido requires notaria_completed_at
    ok, err = validate_transition_v2({"status_v2": "cierre"}, "vendido")
    assert not ok
    assert "notaria" in err.lower() or "notarial" in err.lower()

    # Paralelas SIEMPRE permitidas desde cualquier etapa lineal
    for stage in LINEAR_STAGES_ORDER:
        for parallel in PARALLEL_STATES:
            ok, _ = validate_transition_v2({"status_v2": stage}, parallel)
            assert ok, f"Paralela {parallel} debe permitirse desde {stage}"

    # Salto no-secuencial debe bloquearse: lead_nuevo → calificado (skip contactado)
    ok, err = validate_transition_v2(
        {"status_v2": "lead_nuevo", "first_msg_sent_at": "x"},
        "calificado",
    )
    assert not ok
    assert "transición" in err.lower() or "permitida" in err.lower()


# ─── Test 3: Estados paralelos activate-nurture + mark-lost ──────────────────

@pytest.mark.asyncio
async def test_v2_parallel_states_activate_and_mark_lost(db):
    """Inserta lead → activa nurture → marca perdido → verifica pipeline_state."""
    lead_id = f"test_pv2_{uuid.uuid4().hex[:10]}"
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.leads.insert_one({
        "id": lead_id,
        "status": "contactado",
        "status_v2": "contactado",
        "pipeline_version": 2,
        "created_at": now_iso,
        "updated_at": now_iso,
        "contact": {"name": "Test V2", "email": "test@v2.test"},
    })
    try:
        # 1) Activar nurture
        state = await set_parallel_state(db, lead_id, "nurture", True)
        assert state["linear_status"] == "contactado"
        assert "nurture" in state["parallel_states"]
        assert "perdido" not in state["parallel_states"]

        # 2) Marcar perdido (paralelo, no toca status_v2 lineal)
        state = await set_parallel_state(db, lead_id, "perdido", True, reason="Sin presupuesto")
        assert state["linear_status"] == "contactado", "Marcar perdido NO debe tocar status_v2 lineal"
        assert "perdido" in state["parallel_states"]
        assert "nurture" in state["parallel_states"], "Ambas paralelas pueden coexistir"

        # 3) Verificar lost_reason persistido
        doc = await db.leads.find_one({"id": lead_id}, {"_id": 0})
        assert doc.get("lost_reason") == "Sin presupuesto"
        assert doc.get("lost_at") is not None

        # 4) Desactivar nurture
        state = await set_parallel_state(db, lead_id, "nurture", False)
        assert "nurture" not in state["parallel_states"]
        assert "perdido" in state["parallel_states"]

        # 5) step_type mapping V2 → journey
        assert step_type_for_v2_target("vendido") == "closed_won"
        assert step_type_for_v2_target("perdido") == "closed_lost"
        assert step_type_for_v2_target("nurture") == "nurtured"
        assert step_type_for_v2_target("lead_nuevo") == "captured"
        assert step_type_for_v2_target("unknown_xyz") is None
        # Todas las 9 etapas (7 lineales + 2 paralelas) mapean a step_type válido
        assert len(V2_STATUS_TO_STEP) == 9
    finally:
        await db.leads.delete_one({"id": lead_id})


# ─── Mapeo V1 → V2 (regression: backward compat) ─────────────────────────────

@pytest.mark.asyncio
async def test_v1_to_v2_status_mapping_backward_compat(db):
    """Asegura que el mapeo V1 → V2 cubre todos los statuses legacy sin perder datos."""
    assert map_v1_to_v2("nuevo") == "lead_nuevo"
    assert map_v1_to_v2("under_review") == "lead_nuevo"
    assert map_v1_to_v2("contactado") == "contactado"
    assert map_v1_to_v2("visita_agendada") == "visita"
    assert map_v1_to_v2("visita_realizada") == "visita"
    assert map_v1_to_v2("propuesta") == "negociacion"
    assert map_v1_to_v2("cerrado_ganado") == "vendido"
    assert map_v1_to_v2("cerrado_perdido") == "perdido"
    # Status desconocido cae a default
    assert map_v1_to_v2("estado_inexistente") == "lead_nuevo"
