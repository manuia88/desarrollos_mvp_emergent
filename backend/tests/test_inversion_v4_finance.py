"""Tests del motor financiero v4 (inversion_v4_finance). Criterio: amortización cierra ~0; IRR exacto vs casos
cerrados; equity multiple cuenta capital TOTAL aportado; regla de apalancamiento; alertas. (numpy_financial opcional.)"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import inversion_v4_finance as F


def test_irr_casos_cerrados():
    assert abs(F.irr([-1000, 1100]) - 0.10) < 1e-4
    assert abs(F.irr([-1000, 0, 1210]) - 0.10) < 1e-4
    assert F.irr([-100, -100, -100]) is None  # sin solución (todos negativos)


def test_irr_vs_numpy_financial_si_existe():
    try:
        import numpy_financial as nf
    except ImportError:
        return
    flows = [-2_600_000, 30000, 30000, 30000, 30000, 4_500_000]
    assert abs(F.irr(flows) - nf.irr(flows)) < 1e-4


def test_amortizacion_cierra_en_cero():
    am = F.amortization(1_000_000, 0.10 / 12, 240, 240)
    assert abs(am["pmt"] - 9650.22) < 0.5
    assert am["saldo_pendiente"] < 1.0


def test_escenario_contado():
    inp = {"valor_propiedad": 5_000_000, "renta_mensual": 22000, "predial": 8000, "mantenimiento": 12000,
           "seguro": 6000, "con_credito": False, "horizonte_anios": 5, "apreciacion_anual": 0.075,
           "crecimiento_renta_anual": 0.05, "cetes_1a": 0.07, "prima_riesgo_inmobiliario": 0.05, "inflacion_anual": 0.045}
    r = F.analyze(inp)
    assert r["ok"] and r["cap_rate_pct"] == 4.5 and r["tir_pct"] is not None
    assert r["equity_multiple"] is not None and r["mejor_anio_venta"] is not None


def test_apalancamiento_negativo_y_equity_multiple():
    inp = {"valor_propiedad": 5_000_000, "renta_mensual": 22000, "predial": 8000, "mantenimiento": 12000,
           "seguro": 6000, "con_credito": True, "ltv": 0.80, "tasa_anual": 0.1145, "plazo_meses": 240,
           "horizonte_anios": 5, "apreciacion_anual": 0.075, "crecimiento_renta_anual": 0.05,
           "cetes_1a": 0.07, "prima_riesgo_inmobiliario": 0.05, "inflacion_anual": 0.045}
    r = F.analyze(inp)
    # activo rinde ~8.8% < crédito 11.45% → apalancamiento negativo
    assert r["apalancamiento"] == "negativo"
    assert r["alertas"]["dscr_bajo_1"] is True
    # equity multiple v4 cuenta los flujos negativos intermedios
    assert r["equity_multiple"] is not None and r["equity_multiple"] < 2.0
