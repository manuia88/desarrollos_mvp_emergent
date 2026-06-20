"""Tests del módulo fiscal v4 (inversion_v4_tax) — tarifa art.152, RESICO, exención casa habitación, comparador,
integración con el motor. ESTIMACIÓN fiscal (validar con contador); estos tests fijan la mecánica, no la asesoría."""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import inversion_v4_tax as T
import inversion_v4_finance as F


def test_tarifa_art152_punto_conocido():
    v = T.tarifa_art152(100000)
    assert abs(v - (4461.94 + (100000 - 75984.56) * 0.1088)) < 0.01
    assert T.tarifa_art152(0) == 0.0


def test_resico_escalonado():
    assert T.resico_pf(20000) == 200.0
    assert T.resico_pf(40000) == 440.0
    assert T.resico_pf(0) == 0.0


def test_isr_renta_auto_elige_menor():
    r = T.isr_renta_anual({"perfil": "fisica", "regimen_fiscal": "auto", "ingreso_bruto_anual": 264000,
                           "predial": 8000, "valor_propiedad": 5_000_000})
    assert r["regimen_efectivo"] == "resico"           # el más barato para arrendador chico
    assert r["isr_renta_anual"] <= r["opciones_isr"]["arrend_ciega"]


def test_exencion_casa_habitacion():
    ve = T.isr_venta({"perfil": "fisica", "tipo_inmueble": "residencial", "es_casa_habitacion": True,
                      "valor_venta": 5_000_000, "costo_adquisicion": 4_000_000, "udis_actual": 8.4, "horizonte_anios": 5})
    assert ve["isr_venta"] == 0 and ve["exento"] is True
    # sobre el tope (700k UDIS ≈ 5.88M) → grava
    vg = T.isr_venta({"perfil": "fisica", "tipo_inmueble": "residencial", "es_casa_habitacion": True,
                      "valor_venta": 9_000_000, "costo_adquisicion": 6_000_000, "udis_actual": 8.4,
                      "horizonte_anios": 5, "inflacion_anual": 0.045})
    assert vg["isr_venta"] > 0


def test_pm_sin_exencion():
    ve = T.isr_venta({"perfil": "moral", "valor_venta": 5_000_000, "costo_adquisicion": 4_000_000,
                      "terreno_pct": 0.30, "horizonte_anios": 5})
    assert ve["isr_venta"] > 0 and ve["exento"] is False


def test_integracion_motor_mas_fiscal():
    inp = {"valor_propiedad": 5_000_000, "renta_mensual": 22000, "predial": 8000, "mantenimiento": 12000,
           "seguro": 6000, "con_credito": False, "horizonte_anios": 5, "apreciacion_anual": 0.075,
           "crecimiento_renta_anual": 0.05, "cetes_1a": 0.07, "prima_riesgo_inmobiliario": 0.05,
           "inflacion_anual": 0.045, "perfil": "fisica", "regimen_fiscal": "auto", "tipo_inmueble": "residencial",
           "es_casa_habitacion": True, "udis_actual": 8.4}
    res = F.analyze(inp, isr_fn=T.make_isr_fn())
    assert res["ok"] and res["isr"]["renta"]["regimen_efectivo"] == "resico"
    assert res["isr"]["renta"]["isr_renta_anual"] > 0
