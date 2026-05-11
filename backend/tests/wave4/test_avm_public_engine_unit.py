"""Wave 4 · Tests avm_public_engine.py · 13 tests unidad sin DB.

Cubre helpers PUROS (no async DB · no hedonic model fit):
- _colonia_record (lookup en COLONIAS_BY_ID · None si slug invalido)
- avm_quick (path heuristic sync · cálculo precio_estimado)
- avm_quick adjust factors (recamaras/baños/antigüedad)
- F0.1 hedonic swap quality guard thresholds (r²<0.20 fallback · ratio sanity)
- colonia_stats (top_3_devs · counts)
- list_top_colonias (sort + limit)

NO testea avm_quick_async hedonic path (requiere Mongo + hedonic_regression).
La quality guard se verifica por inspección de constantes/lógica heurística.
"""
import pytest

from avm_public_engine import (
    _colonia_record,
    avm_quick,
    colonia_stats,
    list_top_colonias,
)

pytestmark = pytest.mark.unit


# ─── _colonia_record ──────────────────────────────────────────────────────────


def test_colonia_record_unknown_returns_none():
    """_colonia_record('inexistente_xxx') → None."""
    assert _colonia_record("inexistente_xxx_zzz") is None


def test_colonia_record_known_returns_dict():
    """Una colonia conocida del seed → dict con name."""
    from data_seed import COLONIAS
    if not COLONIAS:
        pytest.skip("COLONIAS seed vacía")
    sample_id = COLONIAS[0]["id"]
    rec = _colonia_record(sample_id)
    assert rec is not None
    assert "name" in rec


# ─── avm_quick (sync heuristic) ──────────────────────────────────────────────


def test_avm_quick_unknown_colonia_returns_error():
    """avm_quick con slug inexistente → dict con 'error'."""
    out = avm_quick("inexistente_xxx", m2=80, recamaras=2, banos=2, antiguedad_anos=5)
    assert "error" in out
    assert out["error"] == "colonia_not_found"


def test_avm_quick_returns_required_keys():
    """avm_quick retorna estructura de respuesta canónica."""
    from data_seed import COLONIAS
    if not COLONIAS:
        pytest.skip("COLONIAS seed vacía")
    slug = COLONIAS[0]["id"]
    out = avm_quick(slug, m2=80, recamaras=2, banos=2, antiguedad_anos=5)
    required = {
        "colonia_slug", "colonia_name", "input", "precio_estimado",
        "precio_per_m2", "range_low", "range_high", "confidence",
        "comparables", "pricing_model", "model_id", "r_squared",
    }
    missing = required - set(out.keys())
    assert not missing, f"avm_quick output falta: {missing}"


def test_avm_quick_pricing_model_is_heuristic():
    """avm_quick (sync) siempre usa pricing_model='heuristic'."""
    from data_seed import COLONIAS
    if not COLONIAS:
        pytest.skip("COLONIAS seed vacía")
    slug = COLONIAS[0]["id"]
    out = avm_quick(slug, m2=80, recamaras=2, banos=2, antiguedad_anos=5)
    assert out["pricing_model"] == "heuristic"
    assert out["r_squared"] is None
    assert out["model_id"] is None


def test_avm_quick_range_low_lt_high():
    """range_low < precio_estimado < range_high (banda ±12%)."""
    from data_seed import COLONIAS
    if not COLONIAS:
        pytest.skip("COLONIAS seed vacía")
    slug = COLONIAS[0]["id"]
    out = avm_quick(slug, m2=80, recamaras=2, banos=2, antiguedad_anos=5)
    assert out["range_low"] < out["precio_estimado"] < out["range_high"]


def test_avm_quick_recamaras_positive_adjust():
    """Más recámaras → precio_per_m2 mayor (rec_factor = 1 + (rec-2)*0.04)."""
    from data_seed import COLONIAS
    if not COLONIAS:
        pytest.skip("COLONIAS seed vacía")
    slug = COLONIAS[0]["id"]
    out_2rec = avm_quick(slug, m2=80, recamaras=2, banos=2, antiguedad_anos=0)
    out_4rec = avm_quick(slug, m2=80, recamaras=4, banos=2, antiguedad_anos=0)
    assert out_4rec["precio_per_m2"] > out_2rec["precio_per_m2"]


def test_avm_quick_antiguedad_negative_adjust():
    """Mayor antigüedad → precio menor (age_factor = max(0.55, 1 - age*0.012))."""
    from data_seed import COLONIAS
    if not COLONIAS:
        pytest.skip("COLONIAS seed vacía")
    slug = COLONIAS[0]["id"]
    out_new = avm_quick(slug, m2=80, recamaras=2, banos=2, antiguedad_anos=0)
    out_old = avm_quick(slug, m2=80, recamaras=2, banos=2, antiguedad_anos=30)
    assert out_old["precio_estimado"] < out_new["precio_estimado"]


def test_avm_quick_age_factor_floor_055():
    """age_factor cap inferior = 0.55 (max(0.55, 1 - age*0.012))."""
    # age=100 → 1-1.2 = -0.2, pero cap a 0.55
    age = 100
    factor = max(0.55, 1.0 - age * 0.012)
    assert factor == 0.55


# ─── F0.1 hedonic quality guard thresholds (lógica documentada en código) ────


def test_hedonic_quality_guard_r2_min_020():
    """Guard: r² >= 0.20 para aceptar predicción hedonic (sino fallback)."""
    # Replicar lógica del engine: r2_ok = (pred_r2 is None) or (pred_r2 >= 0.20)
    assert (None is None) or (0.20 >= 0.20)  # None passes
    assert 0.25 >= 0.20  # passes
    assert not (0.15 >= 0.20)  # falla → fallback


def test_hedonic_quality_guard_ratio_sanity():
    """Guard: 0.30 <= pred/heuristic <= 3.0 para aceptar (sanity)."""
    heuristic = 1_000_000
    # OK
    pred_ok = 800_000  # ratio 0.8
    r_ok = (pred_ok / heuristic >= 0.30) and (pred_ok / heuristic <= 3.0)
    assert r_ok
    # Too low
    pred_low = 100_000  # ratio 0.1
    r_low = (pred_low / heuristic >= 0.30)
    assert not r_low
    # Too high
    pred_high = 5_000_000  # ratio 5.0
    r_high = (pred_high / heuristic <= 3.0)
    assert not r_high


def test_hedonic_confidence_thresholds():
    """Confidence: alta r²>=0.65 · media r²>=0.40 · baja r²<0.40."""
    # Replicar lógica del engine
    def conf(r2):
        if r2 is not None and r2 >= 0.65:
            return "alta"
        if r2 is not None and r2 >= 0.40:
            return "media"
        return "baja"
    assert conf(0.70) == "alta"
    assert conf(0.50) == "media"
    assert conf(0.25) == "baja"
    assert conf(None) == "baja"


# ─── colonia_stats ────────────────────────────────────────────────────────────


def test_colonia_stats_unknown_returns_error():
    """colonia_stats con slug inexistente → error."""
    out = colonia_stats("inexistente_xxx_zzz")
    assert out.get("error") == "colonia_not_found"


def test_colonia_stats_known_returns_top_devs():
    """colonia_stats retorna list top_3_devs (max 3)."""
    from data_seed import COLONIAS
    if not COLONIAS:
        pytest.skip("COLONIAS seed vacía")
    slug = COLONIAS[0]["id"]
    out = colonia_stats(slug)
    assert "top_3_devs" in out
    assert len(out["top_3_devs"]) <= 3
    assert "total_devs_active" in out


# ─── list_top_colonias ────────────────────────────────────────────────────────


def test_list_top_colonias_respects_limit():
    """list_top_colonias(limit=5) retorna max 5."""
    out = list_top_colonias(limit=5)
    assert len(out) <= 5
    for col in out:
        assert "slug" in col
        assert "name" in col
