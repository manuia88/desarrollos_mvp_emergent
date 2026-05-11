"""Wave 4 · Tests buyer_coach_engine.py · 11 tests unidad sin DB.

Cubre funciones PURAS:
- _heuristic_response (Layer 3 fallback templates · stages 1-7)
- _infer_disc (4 DISC personalities · D/I/S/C)
- _suggested_actions (next actions por stage)
- _conv_id (formato)
- _ip_hash (LFPDPPP-safe)
- get_stage_checklist (sync · returns lists)
- STAGE_LABELS / STAGE_CHECKLISTS integridad

NO testea LLM call / DB / capture lead → require infra.
"""
import pytest

from buyer_coach_engine import (
    STAGE_CHECKLISTS,
    STAGE_LABELS,
    _conv_id,
    _heuristic_response,
    _infer_disc,
    _ip_hash,
    _suggested_actions,
    get_stage_checklist,
)

pytestmark = pytest.mark.unit


# ─── Constantes 7 stages ─────────────────────────────────────────────────────

def test_stage_labels_covers_7_etapas():
    """STAGE_LABELS define las 7 etapas canónicas del buyer journey."""
    assert set(STAGE_LABELS.keys()) == {1, 2, 3, 4, 5, 6, 7}
    assert STAGE_LABELS[1].startswith("Pre")
    assert "Post-compra" in STAGE_LABELS[7]


def test_stage_checklists_covers_7_stages():
    """STAGE_CHECKLISTS tiene items para los 7 stages."""
    for stage in (1, 2, 3, 4, 5, 6, 7):
        assert stage in STAGE_CHECKLISTS
        assert len(STAGE_CHECKLISTS[stage]) >= 6, f"stage {stage} debe tener ≥6 items"


def test_stage_4_checklist_is_longest():
    """Visit checklist (stage 4) tiene 20 items (más detallado)."""
    assert len(STAGE_CHECKLISTS[4]) == 20


def test_get_stage_checklist_returns_items():
    """get_stage_checklist devuelve list of dicts."""
    items = get_stage_checklist(1)
    assert isinstance(items, list)
    assert len(items) >= 1
    assert "id" in items[0]
    assert "label" in items[0]


def test_get_stage_checklist_invalid_returns_empty():
    """Stage inválido → [] (defensivo)."""
    assert get_stage_checklist(99) == []
    assert get_stage_checklist(0) == []


# ─── _heuristic_response · Layer 3 templates ────────────────────────────────

def test_heuristic_response_stage_2_mentions_30pct_rule():
    """Stage 2 (budget) menciona regla 30%."""
    out = _heuristic_response(2, "tengo 50k de ingreso")
    assert "30%" in out


def test_heuristic_response_stage_3_recommends_cdmx_colonias():
    """Stage 3 (location) sugiere colonias CDMX reales."""
    out = _heuristic_response(3, "donde recomiendas")
    assert "Del Valle" in out or "Narvarte" in out or "Roma" in out


def test_heuristic_response_unknown_stage_fallback():
    """Stage inválido (>7) → fallback genérico no vacío."""
    out = _heuristic_response(99, "hola")
    assert isinstance(out, str) and len(out) > 0


# ─── _infer_disc · DISC personality inference ────────────────────────────────

def test_infer_disc_d_dominant_keywords():
    """Keywords 'ROI/inversión/ganancia' → D (Dominante)."""
    msgs = [{"role": "user", "content": "necesito buen ROI rápido"}]
    assert _infer_disc(msgs) == "D"


def test_infer_disc_i_influence_keywords():
    """Keywords 'familia/niños' → I (Influyente)."""
    msgs = [{"role": "user", "content": "es para mi familia con dos niños"}]
    assert _infer_disc(msgs) == "I"


def test_infer_disc_s_steady_keywords():
    """Keywords 'plazo/seguro' → S (Estable)."""
    msgs = [{"role": "user", "content": "quiero algo seguro a largo plazo"}]
    assert _infer_disc(msgs) == "S"


def test_infer_disc_c_compliant_keywords():
    """Keywords 'datos/m2/exacto' → C (Concienzudo)."""
    msgs = [{"role": "user", "content": "dame datos exactos de m2"}]
    assert _infer_disc(msgs) == "C"


def test_infer_disc_empty_returns_empty_string():
    """Sin keywords → '' (no infer)."""
    msgs = [{"role": "user", "content": "hola"}]
    assert _infer_disc(msgs) == ""


# ─── _suggested_actions ──────────────────────────────────────────────────────

def test_suggested_actions_stage_4_includes_visit():
    """Stage 4 (visita) sugiere descargar checklist y agendar visita."""
    out = _suggested_actions(4, msg_count=2)
    assert any("checklist" in a.lower() for a in out)


def test_suggested_actions_late_stage_includes_lead_capture():
    """Stage >=5 con muchos mensajes → invita capturar lead."""
    out = _suggested_actions(5, msg_count=12)
    assert any("contacto" in a.lower() or "asesor" in a.lower() for a in out)


# ─── _conv_id / _ip_hash ─────────────────────────────────────────────────────

def test_conv_id_format():
    """conv_id formato 'coach_' + 16 hex."""
    cid = _conv_id()
    assert cid.startswith("coach_")
    assert len(cid) == len("coach_") + 16


def test_ip_hash_deterministic_and_no_pii():
    """Mismo IP → mismo hash · hash 32 hex · NO contiene IP raw."""
    h1 = _ip_hash("192.168.1.1")
    h2 = _ip_hash("192.168.1.1")
    assert h1 == h2
    assert len(h1) == 32
    assert "192" not in h1
