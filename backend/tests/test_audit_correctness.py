"""Regresión · Auditoría de CORRECTNESS de motores (workflow correctness 2026-07-02).

9 bugs de cálculo confirmados y corregidos. Los de impuestos se prueban EJECUTANDO la función
(son puras); el resto se ancla leyendo el código fuente de disco (evita init de cliente LLM al
importar server, patrón AUD-025).
"""
import os
import pathlib

BACKEND = pathlib.Path(__file__).resolve().parent.parent


def _src(name: str) -> str:
    return (BACKEND / name).read_text(encoding="utf-8")


# ── COR-01/02 · inversion_v4_tax.isr_venta (ejecución real) ───────────────────

def test_cor02_isr_pf_usa_nucleo_art126_del_proyector():
    """PF gravable: la calc de inversión REUSA el núcleo art.126 del Proyector (single source of truth),
    no una tarifa art.152 propia. La comisión de venta ya NO entra en la base del ISR (se resta en 'neto al vender')."""
    import inversion_v4_tax as t
    import tax_projector_engine as p
    ctx = {"perfil": "fisica", "valor_venta": 6_000_000, "costo_adquisicion": 4_000_000,
           "terreno_pct": 0.30, "horizonte_anios": 8, "comision_venta_pct": 0.05,
           "es_casa_habitacion": False, "tipo_inmueble": "residencial",
           "inflacion_anual": 0.045, "udis_actual": 8.40}
    r = t.isr_venta(ctx)
    core = p._isr_art126_core(4_000_000, 6_000_000, 0.30, 8, (1.045) ** 8)
    assert r["isr_venta"] == int(core["isr_total"]), (r, core)
    assert r["ganancia_gravable"] == round(core["ganancia_gravable"]), (r, core)
    # el núcleo NO deduce comisión de venta de la base (se evita doble conteo con "neto al vender")
    assert "gastos_venta" not in _src("inversion_v4_tax.py")


def test_cor08_depreciacion_pm_topada():
    """PM: la depreciación acumulada se topa al valor de la construcción (no >100%)."""
    import inversion_v4_tax as t
    # 3M, terreno 30% → construcción 2.1M; 25 años a 5% = 2.625M SIN tope → con tope = 2.1M
    ctx = {"perfil": "moral", "valor_venta": 6_000_000, "costo_adquisicion": 3_000_000,
           "terreno_pct": 0.30, "horizonte_anios": 25}
    r = t.isr_venta(ctx)
    # valor_libros = 3M - 2.1M(topado) = 900k → isr = (6M-900k)*0.30 = 1,530,000
    # (sin tope sería depr 2.625M → libros 375k → isr 1,687,500)
    assert r["isr_venta"] == 1_530_000, r


def test_cor08_pm_cap_menos_estricto_que_sin_tope():
    """El ISR PM con tope es MENOR que el que daría la depreciación sin tope (over-depreciación)."""
    import inversion_v4_tax as t
    ctx = {"perfil": "moral", "valor_venta": 6_000_000, "costo_adquisicion": 3_000_000,
           "terreno_pct": 0.30, "horizonte_anios": 25}
    con_tope = t.isr_venta(ctx)["isr_venta"]
    sin_tope = round(max(0.0, 6_000_000 - (3_000_000 - 3_000_000 * 0.70 * 0.05 * 25)) * 0.30)
    assert con_tope < sin_tope, (con_tope, sin_tope)


# ── COR-07 · inversion_v4_finance twr_unlev aditivo ───────────────────────────

def test_cor07_twr_unlev_aditivo():
    src = _src("inversion_v4_finance.py")
    assert "twr_unlev = cap_rate + aprec" in src
    # el producto geométrico (income+appreciation) ya no se usa para twr_unlev
    assert "twr_unlev = (1.0 + cap_rate) * (1.0 + aprec)" not in src


# ── COR-04/05 · composite_metrics denominadores usan score_zona ───────────────

def test_cor04_05_composites_usan_score_zona():
    src = _src("composite_metrics.py")
    assert 'z.get("score_zona") and 1' not in src            # #18 ya no ignora la calidad
    assert '_ratio(z.get("demanda"), z.get("score_zona"))' in src
    assert '_ratio(_ab(z, "velocidad_mensual"), 1)' not in src   # #50 ya no divide por 1
    assert '_ratio(_ab(z, "velocidad_mensual"), z.get("score_zona"))' in src


# ── COR-03 · absorcion meses ponderados deterministas ─────────────────────────

def test_cor03_absorcion_meses_ponderados():
    src = _src("absorcion_engine.py")
    assert 'b["meses_acc"] += meses * total' in src
    assert 'b["meses_acc"] / b["total"]' in src
    # ya no depende del último stage escrito
    assert '_MESES_STAGE.get(b["stage_key"], 12)' not in src


# ── COR-09 · risk detect_letter_change compara contra el previo REAL ──────────

def test_cor09_risk_prev_real():
    src = _src("risk_score_engine.py")
    assert '"score_letter": {"$exists": True, "$ne": new_letter}' not in src
    assert ".to_list(3)" in src
    assert "es_actual" in src


# ── COR-06 · hedonic intervalo incluye varianza residual (rmse) ───────────────

def test_cor06_hedonic_incluye_rmse():
    src = _src("hedonic_regression_engine.py")
    assert "math.sqrt(se_sum + rmse ** 2)" in src
    assert 'model_doc.get("rmse")' in src


# ── COR-01 · health_score velocity con campos y scope correctos ───────────────

def test_cor01_health_velocity_scope_y_campos():
    src = _src("health_score.py")
    assert '"after.dev_id": entity_id' in src           # scope al proyecto
    assert '"after.status": {"$in": ["vendido", "reservado"]}' in src
    assert '"ts": {"$gte": since_30d.isoformat()}' in src
    # ya no usa los campos inexistentes
    assert '"to.status": {"$in": ["vendido", "reservado"]}' not in src
