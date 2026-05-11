"""Wave 3 · Tests score_engine.py · 12 tests unidad sin DB.

Cubre IE Engine framework (recipes + tier mapping + dev enrichment puro):
- TIER_THRESHOLDS constants
- Recipe._tier_for (higher_better · lower_better · custom)
- Recipe._stub_result (fallback degrade gracefully)
- register / get_recipe (registry)
- _enrich_dev (price_m2_avg ponderado · type=depto · launch_date derivation por stage)
- _STAGE_OFFSET_MONTHS catalog

Funciones async / DB-bound (ScoreEngine._fetch_obs · compute_one · compute_many ·
_persist · _build_*_context · ensure_score_indexes · auto_discover real) → diferidas
a integration tests (necesitan mongomock + import recipes/).

NO modifica código existente · solo lectura.
"""
import pytest

from score_engine import (
    TIER_THRESHOLDS,
    Recipe,
    ScoreResult,
    register,
    get_recipe,
    _enrich_dev,
    _STAGE_OFFSET_MONTHS,
    _STAGE_OFFSET_DEFAULT,
)


pytestmark = pytest.mark.unit


# ─── 1. TIER_THRESHOLDS constants ────────────────────────────────────────────


def test_tier_thresholds_canonical():
    """green≥70 · amber 40-69 · red<40 (W3.1B Phase B1 spec)."""
    assert TIER_THRESHOLDS == {"green": 70, "amber": 40}


# ─── 2. Recipe._tier_for: numeric → tier label ───────────────────────────────


def test_recipe_tier_higher_better():
    """higher_better: ≥70 green · ≥40 amber · <40 red."""
    class R(Recipe):
        code = "T_HB"
        tier_logic = "higher_better"
    r = R()
    assert r._tier_for(80) == "green"
    assert r._tier_for(70) == "green"
    assert r._tier_for(50) == "amber"
    assert r._tier_for(40) == "amber"
    assert r._tier_for(30) == "red"
    assert r._tier_for(None) == "unknown"


def test_recipe_tier_lower_better():
    """lower_better: ≤30 green · ≤60 amber · >60 red (umbrales invertidos)."""
    class R(Recipe):
        code = "T_LB"
        tier_logic = "lower_better"
    r = R()
    assert r._tier_for(20) == "green"
    assert r._tier_for(30) == "green"
    assert r._tier_for(50) == "amber"
    assert r._tier_for(60) == "amber"
    assert r._tier_for(70) == "red"
    assert r._tier_for(None) == "unknown"


def test_recipe_tier_custom_returns_unknown():
    """custom tier_logic → unknown (recipe lo override manualmente)."""
    class R(Recipe):
        code = "T_C"
        tier_logic = "custom"
    r = R()
    assert r._tier_for(80) == "unknown"
    assert r._tier_for(None) == "unknown"


# ─── 3. Recipe._stub_result: degrade gracefully ──────────────────────────────


def test_recipe_stub_result_shape():
    """Stub fallback marca is_stub=True · tier=unknown · confidence=low · value=None."""
    class R(Recipe):
        code = "T_STUB"
        version = "2.5"
    stub = R()._stub_result("zone_x", reason="no data")
    assert stub.code == "T_STUB"
    assert stub.zone_id == "zone_x"
    assert stub.value is None
    assert stub.tier == "unknown"
    assert stub.confidence == "low"
    assert stub.is_stub is True
    assert stub.formula_version == "2.5"
    assert stub.inputs_used == {}


def test_score_result_default_fields():
    """ScoreResult dataclass defaults sanos."""
    r = ScoreResult(
        code="X", zone_id="z", value=75.0,
        tier="green", confidence="high", is_stub=False,
    )
    assert r.formula_version == "1.0"
    assert r.inputs_used == {}
    assert r.model_version is None  # Phase C / N4 opt-in fields
    assert r.confidence_interval is None
    assert r.training_window_days is None


# ─── 4. register / get_recipe: registry ──────────────────────────────────────


def test_register_and_get_recipe_roundtrip():
    """register(cls) hace que get_recipe(code) retorne instancia."""
    class R(Recipe):
        code = "T_REG_UNIT"
        description = "unit test recipe"
    register(R)
    fetched = get_recipe("T_REG_UNIT")
    assert fetched is not None
    assert fetched.code == "T_REG_UNIT"


def test_register_missing_code_raises():
    """Recipe sin .code definido → ValueError."""
    class R(Recipe):
        pass  # code = "" inherited
    with pytest.raises(ValueError):
        register(R)


# ─── 5. _enrich_dev: pure derivation for proyecto recipes ────────────────────


def test_enrich_dev_price_m2_avg_weighted():
    """price_m2_avg = Σ(price) / Σ(m2_privative) sobre units con ambos."""
    dev = {"units": [
        {"price": 5_000_000, "m2_privative": 100},
        {"price": 3_000_000, "m2_privative": 60},
    ]}
    e = _enrich_dev(dev)
    # total_price=8M · total_m2=160 → 50000 MXN/m²
    assert e["price_m2_avg"] == 50000.0
    assert e["type"] == "depto"  # always


def test_enrich_dev_skips_units_with_missing_data():
    """Units sin price o sin m2 ignorados en avg."""
    dev = {"units": [
        {"price": 5_000_000, "m2_privative": 100},
        {"price": None, "m2_privative": 50},          # skipped
        {"price": 1_000_000},                          # no m2 · skipped
    ]}
    e = _enrich_dev(dev)
    # Only first unit counts → 50000
    assert e["price_m2_avg"] == 50000.0


def test_enrich_dev_no_units_omits_price_m2():
    """Sin units válidas → price_m2_avg NO presente (recipe degradará)."""
    e = _enrich_dev({"units": []})
    assert "price_m2_avg" not in e
    assert e["type"] == "depto"


def test_enrich_dev_launch_date_by_stage():
    """launch_date = delivery_estimate − stage offset (preventa 30m · en_construccion 18m · default 24m)."""
    # preventa: 2027-01 − 30m = 2024-07
    e = _enrich_dev({"units": [], "delivery_estimate": "2027-01",
                     "stage": "preventa"})
    assert e["launch_date"] == "2024-07-01"
    # en_construccion: 2026-06 − 18m = 2024-12
    e2 = _enrich_dev({"units": [], "delivery_estimate": "2026-06",
                      "stage": "en_construccion"})
    assert e2["launch_date"] == "2024-12-01"
    # unknown stage → default 24m: 2026-06 − 24m = 2024-06
    e3 = _enrich_dev({"units": [], "delivery_estimate": "2026-06",
                      "stage": "unknown_stage"})
    assert e3["launch_date"] == "2024-06-01"


def test_enrich_dev_invalid_delivery_omits_launch():
    """delivery_estimate malformed → no launch_date emitido (graceful)."""
    e = _enrich_dev({"units": [], "delivery_estimate": "BAD",
                     "stage": "preventa"})
    assert "launch_date" not in e
    # Also missing delivery_estimate → no launch_date
    e2 = _enrich_dev({"units": [], "stage": "preventa"})
    assert "launch_date" not in e2


# ─── 6. Stage offset catalog ─────────────────────────────────────────────────


def test_stage_offset_catalog_intact():
    """4 stages canónicos + default."""
    assert _STAGE_OFFSET_MONTHS["preventa"] == 30
    assert _STAGE_OFFSET_MONTHS["en_construccion"] == 18
    assert _STAGE_OFFSET_MONTHS["entrega_inmediata"] == 6
    assert _STAGE_OFFSET_MONTHS["exclusiva"] == 24
    assert _STAGE_OFFSET_DEFAULT == 24
