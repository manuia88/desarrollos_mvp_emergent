"""P2.T3 · Unit tests · Coach agent + coaching_analysis (módulo PURO).

6 tests · sin infra real (mongomock_motor vía fixture mock_db · sin LLM · sin engines live).
Cubren: shape del dict contrato · source_agent="coach" · cap 1/día · FAIL-OPEN ·
analyze_performance reúsa SOC (mockeado) · CERO dependencia de shared.

Run: cd backend && python3 -m pytest tests/test_agent_coach.py -v
"""
from __future__ import annotations

import sys
import types
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest

import coaching_analysis
from agent_workforce import coach


pytestmark = pytest.mark.asyncio


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _fake_soc_module(score=42.0, breakdown=None, ranking_items=None):
    """Inyecta un soc_franchise_engine falso en sys.modules para aislar el test."""
    mod = types.ModuleType("soc_franchise_engine")

    async def compute_soc_score(db, user_id, use_cache=True):
        return {
            "user_id": user_id,
            "score": score,
            "level": "silver",
            "breakdown": breakdown if breakdown is not None else {
                "lead_conversion": {"score": 25.0},
                "nps_proxy": {"score": 70.0},
                "response_time": {"score": 80.0},
                "revenue_30d": {"score": 60.0},
                "compliance": {"score": 90.0},
            },
        }

    async def list_franchisees(db, level=None, limit=20, skip=0, use_cache=True, public_safe=False):
        return ranking_items if ranking_items is not None else []

    mod.compute_soc_score = compute_soc_score
    mod.list_franchisees = list_franchisees
    return mod


# ─── Tests ───────────────────────────────────────────────────────────────────

async def test_run_coach_returns_list_with_source_agent_coach(mock_db):
    """run_coach retorna List[dict] con source_agent='coach' y shape del contrato."""
    with patch.dict(sys.modules, {"soc_franchise_engine": _fake_soc_module()}):
        out = await coach.run_coach(mock_db, "advisor-1", "tenant-1")

    assert isinstance(out, list)
    assert len(out) == 1
    a = out[0]
    # Claves obligatorias del contrato command_center_actions.
    for key in ("type", "title", "subtitle", "priority", "cta_actions", "source_agent"):
        assert key in a, f"falta clave de contrato: {key}"
    assert a["source_agent"] == "coach"
    assert isinstance(a["cta_actions"], list) and a["cta_actions"]
    assert isinstance(a["priority"], int)
    # Tip general → NO lleva lead_id (orchestrator maneja dedup sin lead_id).
    assert a.get("lead_id") is None


async def test_cap_one_per_day(mock_db):
    """Cap 1 tip/día: si ya hay acción coach pending creada hoy, devuelve []."""
    now_iso = datetime.now(timezone.utc).isoformat()
    await mock_db.command_center_actions.insert_one({
        "user_id": "advisor-1",
        "source_agent": "coach",
        "status": "pending",
        "created_at": now_iso,
        "type": "coach_tip",
    })
    with patch.dict(sys.modules, {"soc_franchise_engine": _fake_soc_module()}):
        out = await coach.run_coach(mock_db, "advisor-1", "tenant-1")
    assert out == []


async def test_run_coach_fail_open_on_error():
    """FAIL-OPEN: si la DB explota, run_coach devuelve [] sin propagar."""
    class _Boom:
        def __getattr__(self, _name):
            raise RuntimeError("db caída")

    out = await coach.run_coach(_Boom(), "advisor-1", "tenant-1")
    assert out == []


async def test_run_coach_empty_user_returns_empty(mock_db):
    """Sin user_id → [] (no genera tip huérfano)."""
    out = await coach.run_coach(mock_db, "", "tenant-1")
    assert out == []


async def test_analyze_performance_reuses_soc_and_ranking(mock_db):
    """analyze_performance reúsa SOC (dimensión débil) + ranking → patterns + suggestions."""
    ranking = [
        {"user_id": "other", "score": 90.0, "delta_week": 1.0},
        {"user_id": "advisor-1", "score": 42.0, "delta_week": -3.0},
    ]
    fake_soc = _fake_soc_module(ranking_items=ranking)
    with patch.dict(sys.modules, {"soc_franchise_engine": fake_soc}):
        res = await coaching_analysis.analyze_performance(mock_db, "advisor-1", "tenant-1")

    assert "patterns" in res and "suggestions" in res
    keys = {p["key"] for p in res["patterns"]}
    # lead_conversion=25 < 50 → weak_dimension · advisor-1 está en ranking → ranking.
    assert "weak_dimension" in keys
    assert "ranking" in keys
    assert res["suggestions"] and res["suggestions"][0]["text"]
    # Sin EMERGENT_LLM_KEY el source debe ser heurístico.
    assert res["suggestions"][0]["source"] in ("heuristic", "llm")


async def test_analyze_performance_temporal_pattern(mock_db):
    """analyze_performance detecta patrón temporal de cierres desde asesor_operaciones."""
    # 4 cierres en lunes (weekday 0) · base suficiente (>=3) para patrón.
    for d in ("2026-05-04", "2026-05-11", "2026-05-18", "2026-05-25"):
        await mock_db.asesor_operaciones.insert_one({
            "owner_id": "advisor-1",
            "status": "cerrada",
            "fecha_cierre": f"{d}T15:00:00+00:00",
        })
    fake_soc = _fake_soc_module(breakdown={  # todas las dims altas → sin weak_dimension
        "lead_conversion": {"score": 80.0}, "nps_proxy": {"score": 80.0},
        "response_time": {"score": 80.0}, "revenue_30d": {"score": 80.0},
        "compliance": {"score": 80.0},
    })
    with patch("coaching_analysis._now", return_value=datetime(2026, 5, 28, tzinfo=timezone.utc)):
        with patch.dict(sys.modules, {"soc_franchise_engine": fake_soc}):
            res = await coaching_analysis.analyze_performance(mock_db, "advisor-1", "tenant-1")

    keys = {p["key"] for p in res["patterns"]}
    assert "temporal_closing" in keys
    temporal = next(p for p in res["patterns"] if p["key"] == "temporal_closing")
    assert temporal["data"]["best_day"] == "lunes"
    assert temporal["data"]["total_cierres"] == 4
