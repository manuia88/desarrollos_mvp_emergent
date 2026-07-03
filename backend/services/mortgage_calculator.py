"""Phase 4 Batch 27 · services — Mortgage Calculator (Infonavit / Fovissste / Banca).

Cálculos referenciales basados en parámetros públicos (no constituyen oferta vinculante).
- Infonavit: factor edad × SBC × 0.65 (cap $2.5M aprox). Tasa 12% nominal anual fija. Pago = 30% SBC.
- Fovissste: monto según ahorro voluntario + sueldo básico + edad. Tasa 4-7% según puntaje interno.
- Banca privada: pago francés con DTI ≤ 0.35. CAT % = tasa + comisiones + seguros (~+1.5%).
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List

log = logging.getLogger("dmx.mortgage")

# ─── Tablas referenciales ────────────────────────────────────────────────────

INFONAVIT_CAP_MXN = 2_500_000
INFONAVIT_RATE_NOMINAL = 0.12
INFONAVIT_DISCOUNT_RATE = 0.30  # 30% del SBC vía descuento patrón
INFONAVIT_MAX_AGE = 65
INFONAVIT_MAX_YEARS = 30

# Factor por edad (IDEM tabla aproximada Infonavit 2024-25)
def _infonavit_factor(edad: int) -> float:
    if edad <= 24: return 0.99
    if edad <= 29: return 0.97
    if edad <= 34: return 0.93
    if edad <= 39: return 0.86
    if edad <= 44: return 0.77
    if edad <= 49: return 0.66
    if edad <= 54: return 0.54
    if edad <= 59: return 0.41
    return 0.30

FOVISSSTE_CAP_MXN = 2_000_000

# Banca privada — tasas fijas a 20 años (referenciales)
BANCA_TASAS = [
    {"banco": "BBVA",       "tasa_anual": 0.105, "comision_apertura_pct": 0.010},
    {"banco": "Banamex",    "tasa_anual": 0.108, "comision_apertura_pct": 0.012},
    {"banco": "Santander",  "tasa_anual": 0.112, "comision_apertura_pct": 0.010},
    {"banco": "Banorte",    "tasa_anual": 0.106, "comision_apertura_pct": 0.011},
    {"banco": "Scotiabank", "tasa_anual": 0.110, "comision_apertura_pct": 0.012},
]

DTI_MAX = 0.35  # debt-to-income máximo aceptable
SEGUROS_PCT = 0.01  # ~1% anual seguro vida + daños sobre saldo (0.5% subestimaba: reales ~0.8–1.5%)
CAT_GASTOS_PCT = 0.006  # avalúo, investigación y gastos administrativos anualizados (~0.6%)


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _pago_frances(monto: float, tasa_anual: float, n_meses: int) -> float:
    """Pago mensual fijo (sistema francés)."""
    if n_meses <= 0 or monto <= 0:
        return 0.0
    if tasa_anual <= 0:
        return round(monto / n_meses, 2)
    r = tasa_anual / 12
    pago = monto * (r / (1 - (1 + r) ** -n_meses))
    return round(pago, 2)


def _cat_aproximado(tasa_anual: float, comision_pct: float, plazo_anos: int = 20) -> float:
    """CAT aproximado (referencial, NO el oficial): tasa + comisión de apertura amortizada al plazo REAL
    + seguros (~1%) + gastos (~0.6%). Antes amortizaba la comisión con /20 fijo y usaba seguro 0.5% →
    daba CAT ~+0.55pp (irreal); el CAT de mercado está ~+1.5–3pp sobre la tasa. El definitivo lo publica el banco."""
    plazo = max(1, int(plazo_anos))
    return round((tasa_anual + comision_pct / plazo + SEGUROS_PCT + CAT_GASTOS_PCT) * 100, 2)


# ─── Cálculos por fuente ─────────────────────────────────────────────────────

def calculate_infonavit(
    precio: float,
    sbc: float,
    edad: int,
    descuentos_actuales: float = 0.0,
) -> Dict[str, Any]:
    """SBC = Salario Base de Cotización mensual. `descuentos_actuales` reduce capacidad."""
    if sbc <= 0 or edad <= 0:
        return {"banco": "Infonavit", "viable": False, "razon": "Datos insuficientes (SBC y edad)"}

    factor = _infonavit_factor(edad)
    monto_credito_raw = sbc * factor * 0.65 * 12 * 30  # SBC mensual × factor × 65% × 360 meses
    monto_credito = min(monto_credito_raw, INFONAVIT_CAP_MXN, max(0.0, precio))

    plazo_max_anos = min(INFONAVIT_MAX_YEARS, max(1, INFONAVIT_MAX_AGE - edad))
    pago_mensual = round(sbc * INFONAVIT_DISCOUNT_RATE - descuentos_actuales, 2)
    pago_mensual = max(0.0, pago_mensual)

    viable = monto_credito >= precio * 0.5 and pago_mensual > 0
    enganche_requerido = max(0.0, precio - monto_credito)

    return {
        "banco": "Infonavit",
        "monto_credito": round(monto_credito, 2),
        "pago_mensual": pago_mensual,
        "tasa_anual_pct": round(INFONAVIT_RATE_NOMINAL * 100, 2),
        "cat_pct": round(INFONAVIT_RATE_NOMINAL * 100 + 1.5, 2),
        "plazo_anos": plazo_max_anos,
        "enganche_requerido": round(enganche_requerido, 2),
        "factor_edad": factor,
        "viable": viable,
        "razon": None if viable else "Monto Infonavit cubre menos del 50% del precio · combina con banca o ahorra más",
    }


def calculate_fovissste(
    precio: float,
    ahorro_voluntario: float,
    sueldo_basico: float,
    edad: int,
) -> Dict[str, Any]:
    """Cálculo simplificado Fovissste. Tasa según puntaje (proxy ahorro vol. + edad)."""
    if sueldo_basico <= 0 or edad <= 0:
        return {"banco": "Fovissste", "viable": False, "razon": "Datos insuficientes (sueldo básico y edad)"}

    # Puntaje proxy 0-100 (ahorro voluntario, edad joven, sueldo)
    score = min(100, int((ahorro_voluntario / 50_000) * 30) + max(0, 50 - edad) + min(40, int(sueldo_basico / 1_000)))
    if score >= 80: tasa = 0.04
    elif score >= 60: tasa = 0.05
    elif score >= 40: tasa = 0.06
    else: tasa = 0.07

    plazo_anos = min(30, max(1, INFONAVIT_MAX_AGE - edad))
    n_meses = plazo_anos * 12
    monto_max = min(FOVISSSTE_CAP_MXN, sueldo_basico * 12 * 30 * 0.5 + ahorro_voluntario * 0.5)
    monto_credito = max(0.0, min(monto_max, precio))
    pago_mensual = _pago_frances(monto_credito, tasa, n_meses)

    dti = pago_mensual / sueldo_basico if sueldo_basico > 0 else 1.0
    viable = monto_credito >= precio * 0.4 and dti <= DTI_MAX
    enganche_requerido = max(0.0, precio - monto_credito)

    return {
        "banco": "Fovissste",
        "monto_credito": round(monto_credito, 2),
        "pago_mensual": pago_mensual,
        "tasa_anual_pct": round(tasa * 100, 2),
        "cat_pct": _cat_aproximado(tasa, 0.010),
        "plazo_anos": plazo_anos,
        "enganche_requerido": round(enganche_requerido, 2),
        "score_interno": score,
        "dti_ratio": round(dti, 3),
        "viable": viable,
        "razon": None if viable else "Combinación de monto y DTI fuera de rango · sube ahorro voluntario o reduce precio",
    }


def calculate_banca(
    precio: float,
    enganche_pct: float,
    plazo_anos: int,
    ingreso_mensual: float,
    banco_filter: str = "",
) -> List[Dict[str, Any]]:
    """Devuelve lista de cálculos por banco (uno por entrada en BANCA_TASAS)."""
    if precio <= 0 or ingreso_mensual <= 0 or plazo_anos <= 0:
        return []

    enganche_pct = max(0.0, min(0.95, enganche_pct))
    monto_credito = precio * (1 - enganche_pct)
    enganche_monto = precio - monto_credito
    n_meses = plazo_anos * 12

    out: List[Dict[str, Any]] = []
    for b in BANCA_TASAS:
        if banco_filter and b["banco"].lower() != banco_filter.lower():
            continue
        tasa = b["tasa_anual"]
        pago_mensual = _pago_frances(monto_credito, tasa, n_meses)
        # Seguro mensual (vida + daños) sobre el saldo inicial — el pago REAL al banco lo incluye. El DTI se
        # evalúa sobre el pago CON seguro (antes lo omitía y podía marcar "viable" un crédito que no lo es).
        seguro_mensual = round(monto_credito * SEGUROS_PCT / 12.0, 2)
        pago_total_mensual = round(pago_mensual + seguro_mensual, 2)
        dti = pago_total_mensual / ingreso_mensual
        viable = dti <= DTI_MAX
        razon = None if viable else (
            f"DTI {round(dti*100, 1)}% supera el máximo {int(DTI_MAX*100)}% · sube enganche o aumenta plazo"
        )

        out.append({
            "banco": b["banco"],
            "monto_credito": round(monto_credito, 2),
            "enganche_monto": round(enganche_monto, 2),
            "enganche_pct": round(enganche_pct * 100, 2),
            "pago_mensual": pago_mensual,
            "seguro_mensual": seguro_mensual,
            "pago_total_mensual": pago_total_mensual,
            "tasa_anual_pct": round(tasa * 100, 2),
            "cat_pct": _cat_aproximado(tasa, b["comision_apertura_pct"], plazo_anos),
            "cat_es_aproximado": True,
            "comision_apertura": round(monto_credito * b["comision_apertura_pct"], 2),
            "plazo_anos": plazo_anos,
            "n_pagos": n_meses,
            "dti_ratio": round(dti, 3),
            "viable": viable,
            "razon": razon,
        })
    return out


def calculate_all(
    precio: float,
    enganche_pct: float = 0.20,
    plazo_anos: int = 20,
    ingreso_mensual: float = 0.0,
    edad: int = 30,
    sbc: float = 0.0,
    ahorro_voluntario: float = 0.0,
    sueldo_basico: float = 0.0,
    banco_filter: str = "",
) -> Dict[str, Any]:
    """Aglutinador para el endpoint."""
    infonavit = calculate_infonavit(precio, sbc or ingreso_mensual, edad) if (sbc or ingreso_mensual) else {
        "banco": "Infonavit", "viable": False, "razon": "Proporciona tu SBC para calcular Infonavit",
    }
    fovissste = calculate_fovissste(precio, ahorro_voluntario, sueldo_basico or ingreso_mensual, edad) if (sueldo_basico or ingreso_mensual) else {
        "banco": "Fovissste", "viable": False, "razon": "Proporciona tu sueldo básico para calcular Fovissste",
    }
    banca = calculate_banca(precio, enganche_pct, plazo_anos, ingreso_mensual, banco_filter)

    return {
        "infonavit": infonavit,
        "fovissste": fovissste,
        "banca": banca,
        "inputs": {
            "precio": precio,
            "enganche_pct": round(enganche_pct * 100, 2),
            "plazo_anos": plazo_anos,
            "ingreso_mensual": ingreso_mensual,
            "edad": edad,
            "sbc": sbc,
            "ahorro_voluntario": ahorro_voluntario,
            "sueldo_basico": sueldo_basico,
        },
    }
