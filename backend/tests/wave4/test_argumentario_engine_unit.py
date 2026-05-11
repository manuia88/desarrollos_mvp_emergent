"""Wave 4 · Tests argumentario_engine.py · 14 tests unidad sin DB.

Cubre helpers PUROS (no async DB · no LLM · no Phase Y):
- DISC_CLOSING / DISC_LABELS / OBJECTION_TYPES / CLOSING_TECHNIQUES (constants)
- _build_heuristic_argumentario (template combinations · 36 combos)
- _normalize_content (shape defensivo del output)
- ArgumentarioEngine._tier_num
- Error module hierarchy

NO testea generate_argumentario / refresh_argumentario / _layer_llm /
_layer_cache_similar / _persist / mark_used / ensure_argumentario_indexes
(requieren AsyncIOMotor + LLM + Phase Y settings).
"""
import pytest

from agentic_crm.argumentario_engine import (
    ArgumentarioDisabledError,
    ArgumentarioEngine,
    ArgumentarioRateLimitError,
    CLOSING_TECHNIQUES,
    DISC_CLOSING,
    DISC_LABELS,
    OBJECTION_TYPES,
    _build_heuristic_argumentario,
    _normalize_content,
)

pytestmark = pytest.mark.unit


# ─── Constants integrity ────────────────────────────────────────────────────

def test_disc_closing_maps_4_types_plus_mix():
    """DISC_CLOSING tiene D/I/S/C + MIX → técnica de cierre."""
    expected = {"D": "assumptive", "I": "summary", "S": "empathy",
                "C": "evidence", "MIX": "balance"}
    assert DISC_CLOSING == expected


def test_disc_labels_match_disc_closing_keys():
    """DISC_LABELS describe los mismos 5 tipos."""
    assert set(DISC_LABELS.keys()) == set(DISC_CLOSING.keys())
    for k in DISC_LABELS:
        assert isinstance(DISC_LABELS[k], str) and DISC_LABELS[k]


def test_objection_types_are_six_canonical():
    """6 tipos de objeción fijos."""
    assert len(OBJECTION_TYPES) == 6
    for ot in ("precio_alto", "timing", "pareja_decide",
               "prefiero_otra_zona", "necesito_pensarlo",
               "financiamiento_complicado"):
        assert ot in OBJECTION_TYPES


def test_closing_techniques_have_required_fields():
    """Cada técnica debe tener name, rationale y script."""
    for tech_name in ("assumptive", "summary", "empathy", "evidence", "balance"):
        t = CLOSING_TECHNIQUES.get(tech_name)
        assert t is not None
        for k in ("name", "rationale", "script"):
            assert k in t and isinstance(t[k], str) and t[k]


# ─── _build_heuristic_argumentario ──────────────────────────────────────────

def test_heuristic_argumentario_shape_for_D():
    """Output completo para perfil D · todos los campos presentes."""
    out = _build_heuristic_argumentario(
        disc_type="D", budget_band="alto", segment="premium",
        lead_name="Manuel", zone="Polanco",
    )
    assert "opening_script" in out
    assert set(out["opening_script"].keys()) == {"call", "whatsapp", "email"}
    assert "value_pitch" in out and isinstance(out["value_pitch"], str)
    assert "objection_responses" in out
    assert set(out["objection_responses"].keys()) == set(OBJECTION_TYPES)
    assert "closing_technique" in out
    assert out["closing_technique"]["recommended"] == "assumptive"
    assert "discovery_questions" in out and len(out["discovery_questions"]) == 5
    assert "followup_cadence" in out
    assert {"first", "second", "third", "rationale"} <= set(out["followup_cadence"].keys())


def test_heuristic_argumentario_disc_drives_closing():
    """Cada DISC → su técnica de cierre asociada."""
    cases = [("D", "assumptive"), ("I", "summary"), ("S", "empathy"),
             ("C", "evidence"), ("MIX", "balance")]
    for disc_type, expected in cases:
        out = _build_heuristic_argumentario(disc_type, "medio", "residencial",
                                            "Lead", "CDMX")
        assert out["closing_technique"]["recommended"] == expected


def test_heuristic_argumentario_unknown_disc_falls_to_mix():
    """DISC desconocido → balance (MIX)."""
    out = _build_heuristic_argumentario("ZZ", "medio", "residencial", "X", "CDMX")
    assert out["closing_technique"]["recommended"] == "balance"


def test_heuristic_argumentario_uses_lead_name_in_opening():
    """lead_name aparece en opening_script."""
    out = _build_heuristic_argumentario("D", "medio", "residencial", "Carlos", "CDMX")
    full_text = " ".join(out["opening_script"].values())
    assert "Carlos" in full_text


def test_heuristic_argumentario_includes_zone_in_value_pitch():
    """zone aparece referenciado en value_pitch o opening."""
    out = _build_heuristic_argumentario("C", "alto", "residencial",
                                        "Comprador", "Roma Norte")
    assert "Roma Norte" in out["value_pitch"] or \
           any("Roma Norte" in s for s in out["opening_script"].values())


def test_heuristic_argumentario_default_disc_when_empty():
    """disc_type="" → cae a MIX (balance)."""
    out = _build_heuristic_argumentario("", "medio", "residencial", "X", "CDMX")
    assert out["closing_technique"]["recommended"] == "balance"


# ─── _normalize_content ─────────────────────────────────────────────────────

def test_normalize_content_fills_missing_objection_responses():
    """6 tipos objeción siempre presentes en output."""
    raw = {"objection_responses": {"precio_alto": "Custom resp"}}
    out = _normalize_content(raw)
    for ot in OBJECTION_TYPES:
        assert ot in out["objection_responses"]
    assert out["objection_responses"]["precio_alto"] == "Custom resp"


def test_normalize_content_truncates_long_strings():
    """value_pitch >500 → truncado."""
    raw = {"value_pitch": "A" * 2000}
    out = _normalize_content(raw)
    assert len(out["value_pitch"]) == 500


def test_normalize_content_pads_discovery_questions_to_5():
    """Si <5 preguntas, padea con placeholder."""
    raw = {"discovery_questions": ["pregunta unica"]}
    out = _normalize_content(raw)
    assert len(out["discovery_questions"]) == 5


def test_normalize_content_handles_string_for_opening_script():
    """opening_script como str se promueve a dict call/whatsapp/email."""
    raw = {"opening_script": "Saludo único"}
    out = _normalize_content(raw)
    assert out["opening_script"]["call"] == "Saludo único"
    assert out["opening_script"]["whatsapp"] == "Saludo único"


def test_normalize_content_handles_string_for_closing_technique():
    """closing_technique como str se promueve a dict con recommended igual."""
    raw = {"closing_technique": "summary"}
    out = _normalize_content(raw)
    assert out["closing_technique"]["recommended"] == "summary"


# ─── ArgumentarioEngine helpers sin DB ──────────────────────────────────────

def test_tier_num_parses_tier_strings():
    """T1→1 · T3→3 · off/None/bogus →0."""
    e = ArgumentarioEngine(db=None, org_id="org_test")
    assert e._tier_num("T1") == 1
    assert e._tier_num("T2") == 2
    assert e._tier_num("off") == 0
    assert e._tier_num(None) == 0
    assert e._tier_num("nonsense") == 0


# ─── Error hierarchy ────────────────────────────────────────────────────────

def test_errors_are_exception_subclasses():
    """Custom errors heredan de Exception."""
    for E in (ArgumentarioDisabledError, ArgumentarioRateLimitError):
        assert issubclass(E, Exception)
        with pytest.raises(E):
            raise E("test")
