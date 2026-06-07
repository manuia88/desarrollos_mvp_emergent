"""
Economía de ser dueño — ¿Rentar o Comprar? (A03) + Costo Total a N años (A05).
═══════════════════════════════════════════════════════════════════════════════
Calculadora de cara al comprador, en lenguaje normal. Simula año por año dos vidas
paralelas — comprar vs rentar-e-invertir-la-diferencia — para responder:

  · A03 ¿Rentar o comprar?  ¿en qué año comprar deja de costar más que rentar?
  · A05 Costo total (TCO):   ¿cuánto te cuesta DE VERDAD ser dueño N años (ya restando
                             la plusvalía y el capital que conservas)?

Reusa lo que ya existe — NO inventa:
  · pago de hipoteca: `mortgage_calculator._pago_frances` (sistema francés real).
  · plusvalía esperada + renta de la zona: `zone_cycle_engine.compute_zone_cycle`.
El predial / mantenimiento / escrituración usan tasas CDMX estándar (etiquetadas como
estimadas); se afinan si el dev sube su predial real. Cero deuda.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

# ── Tasas CDMX estándar (estimadas · etiquetadas en la UI) ──
PREDIAL_PCT = 0.0015        # predial anual ≈ 0.15% del valor
MANT_PER_M2_MES = 40.0      # mantenimiento estimado $/m²/mes
ESCRITURACION_PCT = 0.06    # escrituración + notario + ISAI ≈ 6% una vez
SEGUROS_PCT = 0.004         # seguro de hogar anual
VENTA_PCT = 0.05            # costo de vender (ISR/comisión) si liquidas
OPORTUNIDAD_PCT = 0.085     # rendimiento alterno si rentas e inviertes (CETES/conservador)
INFLACION_RENTA = 0.05      # la renta sube ~5%/año


def _clamp(v, lo, hi):
    return max(lo, min(hi, v))


def _appreciation_annual(colonia: Dict[str, Any]) -> float:
    """Plusvalía anual esperada desde el momentum real de la zona (acotada y conservadora)."""
    try:
        import zone_cycle_engine as zce
        mom = zce._momentum_pct(colonia) / 100.0
    except Exception:
        mom = 0.04
    return _clamp(mom, 0.015, 0.09)


def compute_ownership(
    price: float, m2: float, colonia: Optional[Dict[str, Any]],
    *, enganche_pct: float = 0.20, years: int = 10,
    plazo_anos: int = 20, tasa_anual: float = 0.105,
) -> Dict[str, Any]:
    from services.mortgage_calculator import _pago_frances

    price = float(price or 0)
    m2 = float(m2 or 80)
    years = int(_clamp(years, 1, 30))
    enganche_pct = _clamp(enganche_pct, 0.05, 0.95)

    g = _appreciation_annual(colonia) if colonia else 0.04
    # Renta equivalente mensual (de la zona); fallback 0.42%/mes del precio.
    rent_m0 = price * 0.0042
    renta_fuente = "estimado"
    if colonia:
        try:
            import zone_cycle_engine as zce
            z = zce.compute_zone_cycle(colonia)
            rent_m0 = price * (z["renta"]["larga_pct"] / 100.0) / 12.0
            renta_fuente = z["renta"]["fuente"]
        except Exception:
            pass

    enganche = round(price * enganche_pct)
    escrituracion = round(price * ESCRITURACION_PCT)
    loan = price - enganche
    n_meses = plazo_anos * 12
    pago_mensual = _pago_frances(loan, tasa_anual, n_meses)

    balance = loan
    rent_m = rent_m0
    renter_portfolio = enganche + escrituracion  # el que renta invierte el desembolso inicial
    intereses_total = predial_total = mant_total = seguros_total = pagos_total = 0.0
    break_even: Optional[int] = None
    serie: List[Dict[str, Any]] = []
    mant_anual = m2 * MANT_PER_M2_MES * 12

    for t in range(1, years + 1):
        # Amortización del año t
        interes_anual = pagos_anual = 0.0
        for mes in range(12):
            mes_global = (t - 1) * 12 + mes + 1
            if balance > 0.005 and mes_global <= n_meses:
                i = balance * (tasa_anual / 12)
                principal = pago_mensual - i
                balance = max(0.0, balance - principal)
                interes_anual += i
                pagos_anual += pago_mensual
        value_t = price * ((1 + g) ** t)
        predial_t = value_t * PREDIAL_PCT
        seguros_t = value_t * SEGUROS_PCT

        intereses_total += interes_anual
        predial_total += predial_t
        mant_total += mant_anual
        seguros_total += seguros_t
        pagos_total += pagos_anual

        buyer_out_t = pagos_anual + predial_t + mant_anual + seguros_t
        rent_anual = rent_m * 12
        rent_m *= (1 + INFLACION_RENTA)

        # El que renta invierte la diferencia (si comprar cuesta más ese año)
        renter_portfolio = renter_portfolio * (1 + OPORTUNIDAD_PCT) + max(0.0, buyer_out_t - rent_anual)

        equity_t = value_t - balance
        buyer_net_t = equity_t - value_t * VENTA_PCT   # patrimonio si vendieras al año t
        renter_net_t = renter_portfolio

        if break_even is None and buyer_net_t >= renter_net_t:
            break_even = t

        serie.append({
            "anio": t,
            "comprar": round(buyer_net_t),
            "rentar": round(renter_net_t),
            "valor_inmueble": round(value_t),
        })

    value_n = price * ((1 + g) ** years)
    plusvalia = value_n - price
    equity_final = value_n - balance

    # ── A05 · Costo total real (lo que "te cuesta" ser dueño, sin contar el capital que conservas) ──
    costo_neto = escrituracion + intereses_total + predial_total + mant_total + seguros_total - plusvalia
    costo_real_mensual = costo_neto / (years * 12)

    tco = {
        "anios": years,
        "desglose": [
            {"concepto": "Enganche", "monto": enganche, "nota": "capital que conservas como patrimonio"},
            {"concepto": "Escrituración (una vez)", "monto": escrituracion, "nota": "notario + ISAI (~6%)"},
            {"concepto": "Intereses de la hipoteca", "monto": round(intereses_total), "nota": f"a {round(tasa_anual*100,1)}% en {years} años"},
            {"concepto": "Predial", "monto": round(predial_total), "nota": "estimado CDMX"},
            {"concepto": "Mantenimiento", "monto": round(mant_total), "nota": f"~${round(MANT_PER_M2_MES)}/m²/mes"},
            {"concepto": "Seguro de hogar", "monto": round(seguros_total), "nota": "estimado"},
            {"concepto": "Plusvalía ganada", "monto": -round(plusvalia), "nota": f"la zona sube ~{round(g*100,1)}%/año"},
        ],
        "costo_neto": round(costo_neto),
        "costo_real_mensual": round(costo_real_mensual),
        "equity_final": round(equity_final),
        "valor_final": round(value_n),
        "lectura": (f"Ser dueño {years} años te cuesta de verdad ~${round(costo_real_mensual):,}/mes "
                    f"(ya restando la plusvalía). Al final conservas ~${round(equity_final):,} en patrimonio."),
    }

    # ── A03 · ¿Rentar o comprar? ──
    if break_even is not None:
        if break_even <= 3:
            verdict = {"clave": "comprar", "color": "verde",
                       "lectura": f"Comprar te conviene rápido: a partir del año {break_even} tu patrimonio supera al de rentar."}
        else:
            verdict = {"clave": "comprar_largo", "color": "verde",
                       "lectura": f"Comprar conviene si te quedas {break_even}+ años; antes, rentar sale parejo o mejor."}
    else:
        verdict = {"clave": "rentar", "color": "ambar",
                   "lectura": f"En tu horizonte de {years} años, rentar e invertir la diferencia sale mejor o parejo. "
                              "Comprar conviene más si te quedas más tiempo o si la zona acelera."}

    rent_vs_buy = {
        "break_even_anio": break_even, "horizonte": years,
        "renta_mensual_estimada": round(rent_m0), "renta_fuente": renta_fuente,
        "plusvalia_anual_pct": round(g * 100, 1),
        "comprar_patrimonio": serie[-1]["comprar"] if serie else 0,
        "rentar_patrimonio": serie[-1]["rentar"] if serie else 0,
        "serie": serie, **verdict,
    }

    return {
        "supuestos": {
            "precio": round(price), "m2": m2, "enganche_pct": round(enganche_pct * 100),
            "plazo_anos": plazo_anos, "tasa_anual_pct": round(tasa_anual * 100, 1),
            "pago_mensual": round(pago_mensual), "oportunidad_pct": round(OPORTUNIDAD_PCT * 100, 1),
        },
        "rent_vs_buy": rent_vs_buy, "tco": tco,
    }
