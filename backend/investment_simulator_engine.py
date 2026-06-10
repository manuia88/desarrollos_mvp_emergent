"""W4.14 — Investment Simulator Engine.

3 escenarios (conservador · base · optimista) basados en:
  - hedonic_regression_engine W3 (baseline precio/m²)
  - zone_score_engine W3 (plusvalía, demanda)
  - comparables Phase 13

Ninguna colección nueva. Cómputo on-demand + cache en memory 1h.
"""
from __future__ import annotations

import logging
import math
import os
import secrets as _secrets
import time
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.investment_sim")

# In-memory cache { cache_key: (ts, result) }
_CACHE: Dict[str, tuple] = {}
CACHE_TTL = 3600  # 1 hour


def _now_ts() -> float:
    return time.time()


def _cache_get(key: str) -> Optional[Dict[str, Any]]:
    entry = _CACHE.get(key)
    if entry and (_now_ts() - entry[0]) < CACHE_TTL:
        return entry[1]
    return None


def _cache_set(key: str, value: Dict[str, Any]) -> None:
    _CACHE[key] = (_now_ts(), value)
    # Evict if cache too large
    if len(_CACHE) > 500:
        oldest = min(_CACHE, key=lambda k: _CACHE[k][0])
        del _CACHE[oldest]


# ─── Heuristic aprec rates by zone quality ───────────────────────────────────

APREC_RATES = {
    "A": {"conservador": 0.04, "base": 0.07, "optimista": 0.11},
    "B": {"conservador": 0.03, "base": 0.06, "optimista": 0.09},
    "C": {"conservador": 0.02, "base": 0.045, "optimista": 0.075},
    "D": {"conservador": 0.01, "base": 0.03, "optimista": 0.055},
    "F": {"conservador": 0.005, "base": 0.02, "optimista": 0.04},
}

# Default if no zone score
DEFAULT_RATES = {"conservador": 0.025, "base": 0.05, "optimista": 0.08}

# Known popular colonias → base annualized appreciation rate
COLONIA_DEFAULTS: Dict[str, float] = {
    "polanco": 0.075,
    "condesa": 0.065,
    "roma": 0.06,
    "roma-norte": 0.065,
    "narvarte": 0.055,
    "del-valle": 0.05,
    "santa-fe": 0.045,
    "coyoacan": 0.05,
    "xochimilco": 0.03,
    "doctores": 0.04,
    "tepito": 0.025,
}

# Tasas — fuente ÚNICA oficial (banxico_rates) con conector que auto-llena de Banxico.
# Defaults OFICIALES al 2026-06-07: TIIE 28d 6.6554% (Hacienda), hipoteca fija ~10.5%.
# (Antes estaba un 9.5%/13.5% de un blog → corregido a fuente oficial.)
import banxico_rates as _rates


def _tiie() -> float:
    return _rates.get_rate_sync("tiie_28d")


def _mortgage_rate() -> float:
    return _rates.get_rate_sync("hipoteca_fija_ref")

# Rental yield by tier (annual, gross)
RENTAL_YIELDS = {
    "A": 0.055,
    "B": 0.05,
    "C": 0.045,
    "D": 0.04,
    "F": 0.035,
}
DEFAULT_RENTAL_YIELD = 0.045


def _pmt(rate_annual: float, n_months: int, principal: float) -> float:
    """Cuota mensual de crédito hipotecario (formula estándar)."""
    if n_months <= 0 or principal <= 0:
        return 0.0
    r = rate_annual / 12
    if r == 0:
        return principal / n_months
    return principal * r * (1 + r) ** n_months / ((1 + r) ** n_months - 1)


def _compute_scenario(
    precio_entrada: float,
    plazo_meses: int,
    m2: float,
    financiamiento_pct: float,
    aprec_annual: float,
    rental_yield_annual: float,
    tier: str = "B",
    label: str = "base",
    mortgage_rate_override: Optional[float] = None,
) -> Dict[str, Any]:
    """Computa un escenario financiero completo."""
    enganche = precio_entrada * (1 - financiamiento_pct)
    credito = precio_entrada * financiamiento_pct
    gastos_cierre = precio_entrada * 0.065  # 6.5% avg notaría+IVA+ISR
    inversion_inicial = enganche + gastos_cierre

    # Monthly mortgage payment · P1.1 · permite override de tasa (escenario alza de tasas
    # consistente: TIR/ROI/break-even reflejan la tasa estresada, no solo el pago de cabecera).
    rate = _mortgage_rate() if mortgage_rate_override is None else mortgage_rate_override
    pago_mensual = _pmt(rate, plazo_meses, credito)

    # Aprec price trajectory
    precio_final = precio_entrada * ((1 + aprec_annual) ** (plazo_meses / 12))
    plusvalia_abs = precio_final - precio_entrada

    # Rental income (monthly)
    renta_mensual = precio_entrada * rental_yield_annual / 12
    # Operating costs (mantto, admin, vacancia)
    costos_op_mensual = renta_mensual * 0.25

    # Cash flow month by month
    cash_flow_monthly = []
    for mes in range(1, plazo_meses + 1):
        valor_mes = precio_entrada * ((1 + aprec_annual) ** (mes / 12))
        renta_neta = renta_mensual - costos_op_mensual  # sin hipoteca
        cash_flow_monthly.append({
            "mes": mes,
            "renta_neta": round(renta_neta, 0),
            "pago_hipoteca": round(pago_mensual, 0),
            "valor_propiedad": round(valor_mes, 0),
            "flujo_neto": round(renta_neta - pago_mensual, 0),  # para TIR (incl. hipoteca)
        })

    # ── ROI · DOS perfiles de inversionista (founder ruling): al contado vs apalancado ──
    # P1.1 · antes había UN solo ROI que mezclaba retornos estilo "contado" (rentas netas
    # completas, sin restar hipoteca) sobre una base chica "apalancada" (solo enganche) →
    # inflaba el número (+480% en recesión). Ahora cada perfil es internamente consistente.
    total_rentas_netas = (renta_mensual - costos_op_mensual) * plazo_meses
    sum_flujo_neto = sum(cf["flujo_neto"] for cf in cash_flow_monthly)  # incluye hipoteca

    # 1) AL CONTADO (sin hipoteca): pagas todo el precio + cierre; ganas plusvalía + rentas netas.
    inversion_contado = precio_entrada + gastos_cierre
    roi_contado_pct = ((plusvalia_abs - gastos_cierre + total_rentas_netas)
                       / inversion_contado) * 100 if inversion_contado > 0 else 0.0

    # 2) APALANCADO (con hipoteca): inviertes solo enganche+cierre; el flujo neto YA descuenta
    #    la hipoteca; al vender (crédito amortizado a `plazo`) recibes el precio final completo.
    roi_apalancado_pct = ((sum_flujo_neto + precio_final - inversion_inicial)
                          / inversion_inicial) * 100 if inversion_inicial > 0 else 0.0

    # roi_pct (compat) = el del esquema elegido: apalancado si hay crédito, contado si no.
    roi_pct = roi_apalancado_pct if financiamiento_pct > 0 else roi_contado_pct

    # TIR: usa flujo_neto (renta - costos_op - hipoteca) para TIR con venta final
    tir = _compute_tir_anualizada(inversion_inicial, cash_flow_monthly, precio_final, plazo_meses)

    # Break-even HONESTO (P1.1): recuperas tu inversión cuando el flujo acumulado (que YA
    # descuenta la hipoteca) + la plusvalía acumulada cubren lo que pusiste (enganche+cierre).
    # Antes usaba renta_neta sin restar la hipoteca → break-even demasiado optimista.
    cumulative_flujo = 0.0
    break_even_months = None  # None = no se recupera vía flujo+plusvalía en el plazo (se recupera al vender)
    for mes, cf in enumerate(cash_flow_monthly, 1):
        cumulative_flujo += cf["flujo_neto"]
        val_actual = precio_entrada * ((1 + aprec_annual) ** (mes / 12))
        plusvalia_acum = val_actual - precio_entrada
        if (cumulative_flujo + plusvalia_acum) >= inversion_inicial:
            break_even_months = mes
            break

    return {
        "label": label,
        "aprec_anual_pct": round(aprec_annual * 100, 2),
        "precio_final": round(precio_final, 0),
        "roi_pct": round(roi_pct, 2),
        "roi_contado_pct": round(roi_contado_pct, 2),       # sin hipoteca (cash buyer)
        "roi_apalancado_pct": round(roi_apalancado_pct, 2),  # con hipoteca (descuenta pagos)
        "inversion_contado": round(inversion_contado, 0),
        "tir_anual_pct": round(tir * 100, 2) if tir else None,
        "break_even_meses": break_even_months,
        "pago_mensual_hipoteca": round(pago_mensual, 0),
        "renta_mensual_bruta": round(renta_mensual, 0),
        "renta_mensual_neta": round(renta_mensual - costos_op_mensual, 0),
        "enganche": round(enganche, 0),
        "gastos_cierre": round(gastos_cierre, 0),
        "inversion_inicial": round(inversion_inicial, 0),
        "plusvalia_abs": round(plusvalia_abs, 0),
        "cash_flow_monthly": cash_flow_monthly,
        "tier": tier,
    }


def _compute_tir_anualizada(
    inversion: float, cash_flows: List[Dict[str, Any]], valor_final: float, meses: int
) -> Optional[float]:
    """Newton-Raphson TIR mensual → anualizada."""
    if not cash_flows or inversion <= 0:
        return None
    flows = [-inversion] + [cf["flujo_neto"] for cf in cash_flows]
    flows[-1] += valor_final
    try:
        rate = 0.01  # initial guess monthly
        for _ in range(50):
            npv = sum(f / (1 + rate) ** i for i, f in enumerate(flows))
            dnpv = sum(-i * f / (1 + rate) ** (i + 1) for i, f in enumerate(flows))
            if abs(dnpv) < 1e-10:
                break
            rate -= npv / dnpv
            if rate <= -1:
                rate = 0.0001
        annual = (1 + rate) ** 12 - 1
        if -0.99 < annual < 10:
            return annual
        return None
    except Exception:
        return None


async def simulate(
    db,
    precio_entrada: float,
    plazo_meses: int,
    m2: float,
    colonia_slug: str,
    apreciacion_anual_user_pct: Optional[float] = None,
    financiamiento_pct: float = 0.80,
) -> Dict[str, Any]:
    """
    Genera ScenarioBundle con 3 escenarios.
    Intenta usar hedonic_regression_engine para baseline.
    Si no disponible, usa heurístico con avg colonia.
    """
    cache_key = f"{precio_entrada}_{plazo_meses}_{m2}_{colonia_slug}_{apreciacion_anual_user_pct}_{financiamiento_pct}"
    cached = _cache_get(cache_key)
    if cached:
        return cached

    # Validate inputs
    precio_entrada = max(100_000, min(precio_entrada, 1_000_000_000))
    plazo_meses = max(12, min(plazo_meses, 360))
    m2 = max(10, min(m2, 5000))
    financiamiento_pct = max(0.0, min(financiamiento_pct, 0.95))

    # Get zone tier and baseline appreciation
    tier = "B"
    hedonic_pm2 = None
    zone_score_val = None

    try:
        from zone_score_engine import get_score_or_compute
        zs = await get_score_or_compute(db, colonia_slug, tier="colonia")
        if zs and not zs.get("error"):
            score = float(zs.get("score_total") or zs.get("score") or 0)
            if score >= 85:
                tier = "A"
            elif score >= 70:
                tier = "B"
            elif score >= 55:
                tier = "C"
            elif score >= 40:
                tier = "D"
            else:
                tier = "F"
            zone_score_val = score
    except Exception:
        pass

    try:
        from hedonic_regression_engine import predict_price
        latest_model = await db.hedonic_models.find_one(
            {"available": True},
            {"_id": 0, "id": 1},
            sort=[("fit_at_dt", -1)],
        )
        if latest_model:
            hp = await predict_price(db, latest_model["id"], {"m2": m2, "recamaras": 2, "banos": 1})
            if hp.get("available") and hp.get("predicted_price_per_m2"):
                hedonic_pm2 = float(hp["predicted_price_per_m2"])
    except Exception:
        pass

    # Determine aprec rates
    rates = APREC_RATES.get(tier, DEFAULT_RATES)

    # If user provided aprec, use it as base; shift conservador/optimista accordingly
    if apreciacion_anual_user_pct is not None:
        user_rate = float(apreciacion_anual_user_pct) / 100
        rates = {
            "conservador": max(0.005, user_rate * 0.6),
            "base": user_rate,
            "optimista": user_rate * 1.5,
        }
    else:
        # Override base with known colonia default if available
        slug_clean = colonia_slug.lower().replace(" ", "-")
        if slug_clean in COLONIA_DEFAULTS:
            base = COLONIA_DEFAULTS[slug_clean]
            rates = {
                "conservador": max(0.005, base * 0.6),
                "base": base,
                "optimista": base * 1.5,
            }

    # W5.3 Parte 2B Sub-C — Override rates con forecast real si está disponible.
    # Anualizamos delta_pct_12m (ya es % anual proxy) y aplicamos low95/value/high95
    # del horizonte 12m para conservador/base/optimista.
    forecast_used = False
    try:
        from forecast_engine import get_zone_forecast
        zf = await get_zone_forecast(db, colonia_slug)
        if zf and zf.get("horizons"):
            band = (zf["horizons"] or {}).get("12m") or {}
            baseline = float(zf.get("baseline_index") or 0)
            if band and baseline > 0:
                # delta = (value - baseline) / baseline; aplicamos a 12 meses → tasa anual.
                value = float(band.get("value") or baseline)
                low95 = float(band.get("low95") or baseline)
                high95 = float(band.get("high95") or baseline)
                # Tasas anualizadas (cap conservador a 0; cap optimista a 0.20 para
                # evitar ROIs absurdos cuando CI95 12m está muy abierto).
                base_rate = (value - baseline) / baseline
                low_rate = (low95 - baseline) / baseline
                high_rate = (high95 - baseline) / baseline
                rates = {
                    "conservador": max(0.0, min(low_rate, 0.10)),
                    "base": max(0.005, min(base_rate, 0.15)),
                    "optimista": max(0.01, min(high_rate, 0.20)),
                }
                forecast_used = True
    except Exception:
        pass

    rental_yield = RENTAL_YIELDS.get(tier, DEFAULT_RENTAL_YIELD)

    # Compute 3 scenarios
    conservador = _compute_scenario(
        precio_entrada, plazo_meses, m2, financiamiento_pct,
        rates["conservador"], rental_yield, tier, "conservador",
    )
    base = _compute_scenario(
        precio_entrada, plazo_meses, m2, financiamiento_pct,
        rates["base"], rental_yield, tier, "base",
    )
    optimista = _compute_scenario(
        precio_entrada, plazo_meses, m2, financiamiento_pct,
        rates["optimista"], rental_yield, tier, "optimista",
    )

    result: Dict[str, Any] = {
        "colonia_slug": colonia_slug,
        "precio_entrada": precio_entrada,
        "plazo_meses": plazo_meses,
        "m2": m2,
        "financiamiento_pct": financiamiento_pct,
        "tier_zona": tier,
        "zone_score": zone_score_val,
        "hedonic_pm2": hedonic_pm2,
        "forecast_used": forecast_used,
        "conservador": conservador,
        "base": base,
        "optimista": optimista,
    }

    # F0.1 · Attach DMX Score (single computation, attached to all 3 scenarios)
    try:
        from score_inversion_engine import compute_score
        sc = await compute_score(
            db, colonia_slug=colonia_slug, precio=precio_entrada,
            plazo_meses=plazo_meses, m2=m2,
        )
        for key in ("conservador", "base", "optimista"):
            if isinstance(result.get(key), dict):
                result[key]["dmx_score"] = sc["score"]
                result[key]["dmx_tier"] = sc["tier"]
                result[key]["dmx_label"] = sc["label"]
                result[key]["dmx_factors"] = sc["factors"]
        result["dmx_score"] = sc["score"]
        result["dmx_tier"] = sc["tier"]
        result["dmx_label"] = sc["label"]
    except Exception:
        pass

    _cache_set(cache_key, result)
    return result


async def get_colonia_baseline(db, colonia_slug: str) -> Dict[str, Any]:
    """Pre-llena form con datos de la colonia para el simulador."""
    tier = "B"
    zone_score_val = None
    demand_supply = None
    avg_pm2 = None

    try:
        from zone_score_engine import get_score_or_compute
        zs = await get_score_or_compute(db, colonia_slug, tier="colonia")
        if zs and not zs.get("error"):
            zone_score_val = float(zs.get("score_total") or zs.get("score") or 0)
            if zone_score_val >= 85:
                tier = "A"
            elif zone_score_val >= 70:
                tier = "B"
            elif zone_score_val >= 55:
                tier = "C"
            elif zone_score_val >= 40:
                tier = "D"
            else:
                tier = "F"
    except Exception:
        pass

    try:
        from maps_cross_engine import compute_demand_supply_gap
        ds = await compute_demand_supply_gap(db, colonia_slug)
        demand_supply = ds.get("gap_label") or ds.get("status")
    except Exception:
        pass

    # avg pm2 from comparables or AVM
    try:
        from avm_public_engine import avm_quick
        avm = avm_quick(colonia_slug, 80, 2, 1, 5)
        if avm and not avm.get("error"):
            avg_pm2 = avm.get("precio_m2_estimado") or avm.get("value_m2")
    except Exception:
        pass

    if not avg_pm2:
        # Fallback from known colonias
        slug_clean = colonia_slug.lower().replace(" ", "-")
        default_rates = {
            "polanco": 85000, "condesa": 72000, "roma": 65000, "narvarte": 50000,
            "del-valle": 45000, "santa-fe": 55000, "coyoacan": 48000,
        }
        avg_pm2 = default_rates.get(slug_clean, 40000)

    slug_clean = colonia_slug.lower().replace(" ", "-")
    base_aprec = COLONIA_DEFAULTS.get(slug_clean, APREC_RATES.get(tier, DEFAULT_RATES)["base"])

    return {
        "colonia_slug": colonia_slug,
        "tier_zona": tier,
        "zone_score": zone_score_val,
        "avg_price_per_m2": avg_pm2,
        "base_aprec_anual_pct": round(base_aprec * 100, 2),
        "demand_supply_status": demand_supply,
        "suggested_financiamiento_pct": 0.80,
        "mortgage_rate_annual_pct": round(_mortgage_rate() * 100, 2),
    }


async def stress_test(scenario_bundle: Dict[str, Any]) -> Dict[str, Any]:
    """Sensibilidad a 3 shocks: recesión, alza tasas, supply shock."""
    precio = float(scenario_bundle.get("precio_entrada", 3_000_000))
    plazo = int(scenario_bundle.get("plazo_meses", 120))
    m2 = float(scenario_bundle.get("m2", 80))
    fin_pct = float(scenario_bundle.get("financiamiento_pct", 0.80))
    tier = scenario_bundle.get("tier_zona", "B")
    rental_yield = RENTAL_YIELDS.get(tier, DEFAULT_RENTAL_YIELD)
    base_rates = APREC_RATES.get(tier, DEFAULT_RATES)

    recesion = _compute_scenario(
        precio, plazo, m2, fin_pct,
        max(0, base_rates["conservador"] - 0.03),
        rental_yield * 0.85, tier, "recesion",
    )
    # P1.1 · alza de tasas: el escenario COMPLETO usa la tasa +300bps (antes solo se parchaba
    # el pago de cabecera y la TIR/ROI quedaban iguales a base → engañoso).
    alza_tasas_s = _compute_scenario(
        precio, plazo, m2, fin_pct,
        base_rates["base"],
        rental_yield * 0.9, tier, "alza_tasas",
        mortgage_rate_override=_mortgage_rate() + 0.03,
    )

    supply_shock = _compute_scenario(
        precio * 0.90, plazo, m2, fin_pct,
        max(0, base_rates["base"] - 0.02),
        rental_yield * 0.80, tier, "supply_shock",
    )

    return {
        "recesion": {
            "roi_pct": recesion["roi_pct"],
            "tir_anual_pct": recesion["tir_anual_pct"],
            "break_even_meses": recesion["break_even_meses"],
            "description": "Caída 3% anual en plusvalía + 15% menos renta",
        },
        "alza_tasas": {
            "roi_pct": alza_tasas_s["roi_pct"],
            "tir_anual_pct": alza_tasas_s["tir_anual_pct"],
            "pago_mensual_hipoteca": alza_tasas_s["pago_mensual_hipoteca"],
            "description": "TIIE +300bps → pago hipotecario más alto",
        },
        "supply_shock": {
            "roi_pct": supply_shock["roi_pct"],
            "tir_anual_pct": supply_shock["tir_anual_pct"],
            "precio_final": supply_shock["precio_final"],
            "description": "Precio entrada -10% + 20% menos renta por exceso oferta",
        },
    }


async def compare_alternatives(db, colonia_slug: str, precio_entrada: float) -> List[Dict[str, Any]]:
    """Retorna 3-5 desarrollos/colonias similares en segmento para comparar ROI."""
    try:
        price_min = precio_entrada * 0.6
        price_max = precio_entrada * 1.4
        cursor = db.developments.find(
            {
                "price_from": {"$gte": price_min, "$lte": price_max},
                "status": "active",
            },
            {"_id": 0, "id": 1, "name": 1, "zone_id": 1, "price_from": 1, "m2_from": 1},
        ).limit(5)
        results = [doc async for doc in cursor]
        alts = []
        for d in results:
            pm2 = d.get("price_from", precio_entrada) / max(d.get("m2_from", 80), 1)
            alts.append({
                "dev_id": d.get("id"),
                "name": d.get("name"),
                "zone_id": d.get("zone_id"),
                "price_from": d.get("price_from"),
                "price_m2": round(pm2, 0),
                "simulador_url": f"/simulador?colonia={d.get('zone_id','')}&precio={d.get('price_from',0)}",
            })
        if alts:
            return alts
    except Exception as exc:
        log.warning(f"[investment_sim] compare_alternatives query failed: {exc}")

    # Fallback: static top colonias similar tier
    return [
        {"dev_id": None, "name": "Del Valle Centro", "zone_id": "del-valle",
         "price_from": precio_entrada * 0.85, "price_m2": 45000,
         "simulador_url": "/simulador?colonia=del-valle"},
        {"dev_id": None, "name": "Narvarte Poniente", "zone_id": "narvarte",
         "price_from": precio_entrada * 0.9, "price_m2": 50000,
         "simulador_url": "/simulador?colonia=narvarte"},
        {"dev_id": None, "name": "Roma Sur", "zone_id": "roma-sur",
         "price_from": precio_entrada * 1.1, "price_m2": 65000,
         "simulador_url": "/simulador?colonia=roma-sur"},
    ]


# ═══════════════════════════════════════════════════════════════════════════════
# CALCULADORA COMPLETA DE INVERSIÓN — "brutalmente completa" (no se queda en el ROI)
# Cubre: flujo de caja real (amortización francesa mes a mes) · ROI contado y apalancado
# sobre el capital REALMENTE desembolsado · TIR (rendimiento anual) · patrimonio que
# construyes · impuestos (ISR renta + ganancia) · neto al vender · ¿la renta cubre la
# hipoteca? · break-even honesto · análisis año por año (cuándo conviene vender) ·
# costo de oportunidad vs CETES · desglose de la ganancia. Reusa _pmt + tasas oficiales.
# Build-for-endstate + Doctrina de Datos: cada supuesto va MARCADO como supuesto.
# ═══════════════════════════════════════════════════════════════════════════════

# Supuestos fiscales/operativos MX — DEFAULTS editables (supuesto, NO dato real).
DEFAULTS_MX = {
    "isr_renta_pct": 0.25,            # ISR efectivo sobre renta (arrendamiento, deducción ciega 35%)
    "isr_ganancia_pct": 0.30,         # ISR sobre ganancia de capital al vender (estimado · varía)
    "cetes_anual": 0.095,             # rendimiento libre de riesgo (costo de oportunidad)
    "comision_venta_pct": 0.05,       # comisión inmobiliaria al vender
    "costos_compra_pct": 0.065,       # notaría + ISAI + avalúo
    "predial_anual_pct": 0.0012,      # predial CDMX aprox (% del valor / año)
    "seguro_anual_pct": 0.0035,       # seguro de inmueble (% del valor / año)
    "admin_pct_renta": 0.06,          # administración / cobranza (% de la renta)
    "mantenimiento_pct_renta": 0.10,  # mantenimiento (% de la renta)
    "vacancia_pct": 0.08,             # vacancia (% del año desocupado)
    "crecimiento_renta_anual": 0.04,  # la renta sube ~inflación
}


def _amortization_schedule(principal: float, rate_annual: float, plazo_meses: int):
    """Tabla de amortización (crédito francés, pago fijo). Devuelve (lista_por_mes, pago_mensual).
    Cada mes: {pago, interes, capital, saldo}. interes = deducible ISR; capital = patrimonio."""
    if principal <= 0 or plazo_meses <= 0:
        return [], 0.0
    r = rate_annual / 12.0
    pago = _pmt(rate_annual, plazo_meses, principal)
    saldo = principal
    sched = []
    for _ in range(plazo_meses):
        interes = saldo * r
        capital = pago - interes
        saldo = max(0.0, saldo - capital)
        sched.append({"pago": pago, "interes": interes, "capital": capital, "saldo": saldo})
    return sched, pago


def _irr_monthly(flows: List[float]) -> Optional[float]:
    """TIR mensual (Newton-Raphson) sobre una lista plana de flujos (flows[0] = inversión, negativo)."""
    if not flows or all(abs(f) < 1e-9 for f in flows):
        return None
    rate = 0.01
    for _ in range(100):
        npv = sum(f / (1 + rate) ** i for i, f in enumerate(flows))
        d = sum(-i * f / (1 + rate) ** (i + 1) for i, f in enumerate(flows))
        if abs(d) < 1e-9:
            break
        new = rate - npv / d
        if new <= -0.999:
            new = -0.5
        if abs(new - rate) < 1e-8:
            rate = new
            break
        rate = new
    return rate if -0.99 < rate < 10 else None


def analizar_inversion(params: Dict[str, Any], financiar: bool = True) -> Dict[str, Any]:
    """Análisis COMPLETO de una compra de inversión, mes a mes con amortización real.
    `financiar=False` = al contado (sin hipoteca). Incluye tabla año-por-año (cuándo vender).
    Todo supuesto va marcado como supuesto. FAIL-OPEN en cada pieza."""
    p = {**DEFAULTS_MX, **(params or {})}
    precio = float(p.get("precio") or 0)
    if precio <= 0:
        return {"ok": False, "reason": "precio_invalido"}

    anios_ten = max(1, min(40, int(p.get("anios_tenencia") or 10)))
    meses_ten = anios_ten * 12

    fin_pct = max(0.0, min(0.95, float(p.get("financiamiento_pct", 0.80)))) if financiar else 0.0
    enganche = precio * (1 - fin_pct)
    credito = precio * fin_pct
    tasa = float(p.get("tasa_credito") or _mortgage_rate())
    plazo_cred_meses = max(12, int(float(p.get("plazo_credito_anios") or 20) * 12))

    costos_compra = precio * float(p["costos_compra_pct"])
    inversion_inicial = enganche + costos_compra

    if p.get("renta_mensual") is not None:
        renta_mensual_0 = float(p["renta_mensual"])
    elif p.get("rental_yield_anual"):
        renta_mensual_0 = precio * float(p["rental_yield_anual"]) / 12.0
    else:
        renta_mensual_0 = precio * DEFAULT_RENTAL_YIELD / 12.0
    con_renta = renta_mensual_0 > 0

    aprec = float(p["apreciacion_anual"]) if p.get("apreciacion_anual") is not None else 0.05
    crec_renta = float(p["crecimiento_renta_anual"])

    sched, pago_hip = _amortization_schedule(credito, tasa, plazo_cred_meses)

    # ── Recorrido mes a mes ──
    flujos: List[float] = []
    cash_flow_monthly: List[Dict[str, Any]] = []
    cum = 0.0
    cum_por_mes: List[float] = []
    capital_amortizado = 0.0
    cap_amort_por_mes: List[float] = []
    interes_total = 0.0
    isr_renta_total = 0.0
    renta_neta_op_total = 0.0
    for mes in range(1, meses_ten + 1):
        anio_idx = (mes - 1) // 12
        renta_bruta = renta_mensual_0 * ((1 + crec_renta) ** anio_idx) if con_renta else 0.0
        vacancia = renta_bruta * p["vacancia_pct"]
        mantto = renta_bruta * p["mantenimiento_pct_renta"]
        admin = renta_bruta * p["admin_pct_renta"]
        predial = precio * p["predial_anual_pct"] / 12.0
        seguro = precio * p["seguro_anual_pct"] / 12.0
        renta_neta_op = renta_bruta - vacancia - mantto - admin - predial - seguro
        renta_neta_op_total += renta_neta_op

        if mes <= plazo_cred_meses and sched:
            row = sched[mes - 1]
            pago_m, interes_m, capital_m = row["pago"], row["interes"], row["capital"]
        else:
            pago_m = interes_m = capital_m = 0.0
        capital_amortizado += capital_m
        interes_total += interes_m

        base_isr = max(0.0, renta_neta_op - interes_m)  # intereses son deducibles
        isr_renta_m = base_isr * p["isr_renta_pct"] if con_renta else 0.0
        isr_renta_total += isr_renta_m

        flujo_m = renta_neta_op - pago_m - isr_renta_m
        cum += flujo_m
        flujos.append(flujo_m)
        cum_por_mes.append(cum)
        cap_amort_por_mes.append(capital_amortizado)
        if mes <= 36:
            cash_flow_monthly.append({
                "mes": mes,
                "renta_neta": round(renta_neta_op, 0),
                "pago_hipoteca": round(pago_m, 0),
                "isr_renta": round(isr_renta_m, 0),
                "flujo_neto": round(flujo_m, 0),
                "valor_propiedad": round(precio * ((1 + aprec) ** (mes / 12.0)), 0),
            })

    def _saldo_en(m: int) -> float:
        if not financiar or not sched:
            return 0.0
        return sched[m - 1]["saldo"] if m <= plazo_cred_meses else 0.0

    # ── Tabla año por año: si vendieras al final del año Y ──
    por_anio: List[Dict[str, Any]] = []
    for y in range(1, anios_ten + 1):
        m = y * 12
        valor_v = precio * ((1 + aprec) ** y)
        saldo = _saldo_en(m)
        comision = valor_v * p["comision_venta_pct"]
        gan_cap = valor_v - precio - costos_compra - comision
        isr_g = max(0.0, gan_cap) * p["isr_ganancia_pct"]
        neto_v = valor_v - saldo - comision - isr_g
        cumf = cum_por_mes[m - 1]
        capital_real_y = inversion_inicial + sum(-f for f in flujos[:m] if f < 0)
        profit_y = cumf + neto_v - inversion_inicial
        roi_y = (profit_y / capital_real_y * 100) if capital_real_y > 0 else 0.0
        tir_flows = [-inversion_inicial] + flujos[:m]
        tir_flows[-1] += neto_v
        tir_m = _irr_monthly(tir_flows)
        tir_y = ((1 + tir_m) ** 12 - 1) * 100 if tir_m is not None else None
        por_anio.append({
            "anio": y,
            "valor_venta": round(valor_v, 0),
            "saldo_credito": round(saldo, 0),
            "neto_al_vender": round(neto_v, 0),
            "flujo_acumulado": round(cumf, 0),
            "patrimonio_construido": round(cap_amort_por_mes[m - 1], 0),
            "plusvalia": round(valor_v - precio, 0),
            "ganancia_total": round(profit_y, 0),
            "roi_pct": round(roi_y, 1),
            "tir_anual_pct": round(tir_y, 2) if tir_y is not None else None,
        })

    fin = por_anio[-1]
    capital_real = inversion_inicial + sum(-f for f in flujos if f < 0)
    # ¿la renta cubre la hipoteca? (promedio del periodo)
    renta_neta_mes_prom = renta_neta_op_total / meses_ten if meses_ten else 0.0
    cubre = (renta_neta_mes_prom >= pago_hip) if (financiar and pago_hip > 0) else True
    cobertura_pct = round(renta_neta_mes_prom / pago_hip * 100, 1) if (financiar and pago_hip > 0) else None
    # costo de oportunidad: mismo capital real a CETES
    cetes_final = capital_real * ((1 + p["cetes_anual"]) ** anios_ten)
    # cuándo vender (mejor TIR) + break-even (primer año con ganancia > 0)
    mejor = max(por_anio, key=lambda x: (x["tir_anual_pct"] if x["tir_anual_pct"] is not None else -999))
    break_even_anio = next((x["anio"] for x in por_anio if x["ganancia_total"] > 0), None)
    # desglose de la ganancia final
    plusvalia_neta = fin["neto_al_vender"] - (enganche + sum(r["capital"] for r in sched[:min(meses_ten, plazo_cred_meses)]) if financiar else precio)

    return {
        "ok": True,
        "modo": "apalancado" if financiar else "contado",
        "precio": round(precio, 0),
        "anios_tenencia": anios_ten,
        "enganche": round(enganche, 0),
        "credito": round(credito, 0),
        "tasa_credito_pct": round(tasa * 100, 2),
        "plazo_credito_anios": round(plazo_cred_meses / 12, 1),
        "costos_compra": round(costos_compra, 0),
        "inversion_inicial": round(inversion_inicial, 0),
        "capital_real_invertido": round(capital_real, 0),
        "pago_mensual_hipoteca": round(pago_hip, 0),
        "renta_mensual_inicial": round(renta_mensual_0, 0),
        "renta_neta_mensual_prom": round(renta_neta_mes_prom, 0),
        "flujo_mensual_anio1": round(sum(flujos[:12]) / min(12, len(flujos)), 0) if flujos else 0,
        "cubre_hipoteca": cubre,
        "cobertura_renta_vs_hipoteca_pct": cobertura_pct,
        # headline (venta al final de la tenencia)
        "valor_venta_final": fin["valor_venta"],
        "neto_al_vender": fin["neto_al_vender"],
        "plusvalia_total": fin["plusvalia"],
        "patrimonio_construido": fin["patrimonio_construido"],
        "flujo_acumulado": fin["flujo_acumulado"],
        "isr_renta_total": round(isr_renta_total, 0),
        "ganancia_total": fin["ganancia_total"],
        "roi_total_pct": fin["roi_pct"],
        "tir_anual_pct": fin["tir_anual_pct"],
        "cap_rate_pct": round((renta_neta_op_total / max(meses_ten, 1) * 12) / precio * 100, 2),
        # costo de oportunidad
        "cetes_anual_pct": round(p["cetes_anual"] * 100, 2),
        "valor_en_cetes": round(cetes_final, 0),
        "vence_a_cetes": fin["neto_al_vender"] + fin["flujo_acumulado"] > cetes_final,
        # cuándo vender + break-even
        "mejor_anio_para_vender": mejor["anio"],
        "break_even_anio": break_even_anio,
        "por_anio": por_anio,
        "cash_flow_monthly": cash_flow_monthly,
        "supuestos": {
            "apreciacion_anual_pct": round(aprec * 100, 2),
            "crecimiento_renta_anual_pct": round(crec_renta * 100, 2),
            "isr_renta_pct": round(p["isr_renta_pct"] * 100, 1),
            "isr_ganancia_pct": round(p["isr_ganancia_pct"] * 100, 1),
            "vacancia_pct": round(p["vacancia_pct"] * 100, 1),
            "gastos_nota": "Supuestos editables — ajústalos con tu contador. No son dato fiscal oficial.",
        },
    }


def renta_minima(params: Dict[str, Any]) -> Dict[str, Any]:
    """Renta mensual mínima para que el flujo del año 1 no sea negativo (no te cueste de tu bolsa).
    Búsqueda binaria. FAIL-OPEN."""
    base = {**params}
    lo, hi = 0.0, float(params.get("precio") or 0) * 0.02  # techo: 2%/mes del precio
    if hi <= 0:
        return {"ok": False}
    for _ in range(40):
        mid = (lo + hi) / 2
        r = analizar_inversion({**base, "renta_mensual": mid}, financiar=True)
        if r.get("flujo_mensual_anio1", -1) >= 0:
            hi = mid
        else:
            lo = mid
    return {"ok": True, "renta_minima_mensual": round(hi, 0),
            "nota": "Renta para que NO te cueste de tu bolsa cada mes (flujo ≥ 0 el primer año)."}


def comparar_inversiones(lista_params: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Compara 2-3 inmuebles lado a lado (al modo elegido) y los ordena por TIR. FAIL-OPEN."""
    items = []
    for i, pr in enumerate(lista_params[:3]):
        financiar = bool(pr.get("financiar", True))
        a = analizar_inversion(pr, financiar=financiar)
        if a.get("ok"):
            a["_idx"] = i
            a["etiqueta"] = pr.get("etiqueta") or f"Opción {chr(65 + i)}"
            items.append(a)
    items.sort(key=lambda x: (x.get("tir_anual_pct") or -999), reverse=True)
    return {"ok": bool(items), "opciones": items,
            "ganador": items[0]["etiqueta"] if items else None}


# ─── Capa 1 · Auto-relleno con datos REALES DMX (cierra ciclo con el arsenal) ───

async def autofill_calculadora(db, colonia_slug: str, precio: Optional[float] = None,
                               m2: float = 80.0) -> Dict[str, Any]:
    """Pre-llena la calculadora con datos reales DMX (apreciación DRPI, renta del cubo, AVM,
    score, demanda). Cada campo trae su ORIGEN ('dmx_real' | 'supuesto') para honestidad. FAIL-OPEN."""
    out: Dict[str, Any] = {"colonia_slug": colonia_slug, "origen": {}}
    # Reusa el baseline que ya existe (tier, score, avg pm2, apreciación base, demanda, tasa).
    try:
        base = await get_colonia_baseline(db, colonia_slug)
        out.update({
            "tier_zona": base.get("tier_zona"),
            "zone_score": base.get("zone_score"),
            "avg_price_per_m2": base.get("avg_price_per_m2"),
            "apreciacion_anual_pct": base.get("base_aprec_anual_pct"),
            "demand_supply_status": base.get("demand_supply_status"),
            "tasa_credito_pct": base.get("mortgage_rate_annual_pct"),
            "financiamiento_pct": base.get("suggested_financiamiento_pct"),
        })
        out["origen"]["tasa_credito_pct"] = "dmx_real"
        out["origen"]["avg_price_per_m2"] = "dmx_real" if base.get("zone_score") else "supuesto"
        out["origen"]["apreciacion_anual_pct"] = "supuesto"
    except Exception as e:
        log.warning(f"[calc autofill] baseline fail-open: {e}")

    # Precio sugerido si no lo dieron (avg pm2 × m2).
    if not precio and out.get("avg_price_per_m2"):
        precio = float(out["avg_price_per_m2"]) * float(m2 or 80)
    out["precio_sugerido"] = round(precio, 0) if precio else None

    # Apreciación REAL año-contra-año desde el índice DRPI (si hay historia).
    try:
        from vertical_products_engine import _drpi_yoy_pct
        yoy = await _drpi_yoy_pct(db, colonia_slug)
        if yoy is not None:
            out["apreciacion_anual_pct"] = round(max(-5, min(20, yoy)), 2)
            out["origen"]["apreciacion_anual_pct"] = "dmx_real"
    except Exception as e:
        log.warning(f"[calc autofill] drpi yoy fail-open: {e}")

    # Renta mensual estimada: cubo (avg_rental) → si no, yield del tier.
    renta = None
    try:
        cube = await db.cube_aggregations.find_one(
            {"tier_id": colonia_slug, "period": "current"}, {"_id": 0, "kpis": 1})
        if cube:
            renta = (cube.get("kpis") or {}).get("avg_rental_mxn")
    except Exception:
        pass
    if renta:
        out["renta_mensual"] = round(float(renta), 0)
        out["origen"]["renta_mensual"] = "dmx_real"
    elif precio:
        ytier = RENTAL_YIELDS.get(out.get("tier_zona") or "B", DEFAULT_RENTAL_YIELD)
        out["renta_mensual"] = round(precio * ytier / 12.0, 0)
        out["origen"]["renta_mensual"] = "supuesto"

    # Demanda viva (Live Pulse) — señal de contexto, no entra al cálculo.
    try:
        from live_pulse_engine import compute_pulse
        pulse = await compute_pulse(db, colonia_slug)
        out["pulso_demanda"] = {"score": pulse.get("score"), "bucket": pulse.get("bucket")}
    except Exception:
        pass
    return out


# ─── Capa 5 · Veredicto en lenguaje humano (determinista; LLM opcional) ─────────

def interpretar_resultado(apalancado: Dict[str, Any], contado: Dict[str, Any]) -> Dict[str, Any]:
    """Traduce los números a una recomendación clara + acciones. Determinista (siempre funciona),
    honesto. La capa LLM puede enriquecerlo después sin romper esto."""
    if not apalancado.get("ok") and not contado.get("ok"):
        return {"veredicto": "Faltan datos para analizar.", "acciones": []}
    tir_ap = apalancado.get("tir_anual_pct")
    tir_co = contado.get("tir_anual_pct")
    cetes = apalancado.get("cetes_anual_pct") or contado.get("cetes_anual_pct") or 9.5
    cubre = apalancado.get("cubre_hipoteca")
    flujo1 = apalancado.get("flujo_mensual_anio1")
    mejor = apalancado.get("mejor_anio_para_vender")

    frases: List[str] = []
    acciones: List[str] = []

    # ¿Conviene apalancarse?
    if tir_ap is not None and tir_co is not None:
        if tir_ap > tir_co:
            frases.append(f"Con hipoteca rindes más ({tir_ap}%/año) que al contado ({tir_co}%/año): el crédito te SUMA porque cuesta menos de lo que rinde el inmueble.")
        else:
            frases.append(f"Al contado rindes más ({tir_co}%/año) que con hipoteca ({tir_ap}%/año): a esta tasa, el crédito te RESTA. Si puedes, paga al contado o negocia mejor tasa/precio.")
            acciones.append("Negocia una mejor tasa hipotecaria o un mejor precio de entrada.")

    # vs CETES (costo de oportunidad)
    mejor_tir = max([t for t in (tir_ap, tir_co) if t is not None], default=None)
    if mejor_tir is not None:
        if mejor_tir < cetes:
            frases.append(f"Ojo: el mejor rendimiento ({mejor_tir}%/año) queda por DEBAJO de CETES ({cetes}%/año). Hoy el dinero rinde más sin riesgo en CETES — este inmueble convendría solo si esperas más plusvalía o renta.")
            acciones.append("Sube la renta, busca una zona con más plusvalía, o un precio de entrada más bajo.")
        else:
            frases.append(f"El rendimiento ({mejor_tir}%/año) le gana a CETES ({cetes}%/año): el inmueble justifica el riesgo extra.")

    # Flujo mensual
    if cubre is False and flujo1 is not None and flujo1 < 0:
        frases.append(f"Con hipoteca te costaría ~${abs(flujo1):,.0f}/mes de tu bolsa (la renta no cubre el pago). Asegúrate de aguantar ese flujo.")
        acciones.append("Considera mayor enganche para bajar la mensualidad, o una unidad que rente más.")
    elif flujo1 is not None and flujo1 >= 0:
        frases.append(f"Con hipoteca el inmueble se paga casi solo (flujo ~${flujo1:,.0f}/mes).")

    if mejor:
        frases.append(f"El mejor momento para vender, según el rendimiento, es alrededor del año {mejor}.")

    nivel = "buena" if (mejor_tir is not None and mejor_tir >= cetes) else "regular" if (mejor_tir is not None and mejor_tir >= cetes * 0.6) else "floja"
    return {
        "nivel": nivel,
        "veredicto": " ".join(frases) or "Análisis listo.",
        "acciones": acciones,
        "nota_honestidad": "Cálculo con supuestos editables (apreciación, renta, impuestos). Ajústalos a tu caso; no es asesoría fiscal.",
    }


# ─── Capa 4 · Granularidad para analíticas (huella anónima = combustible del flywheel) ──

_calc_idx_ready = False
_PRICE_BUCKETS = [(0, 2_000_000), (2_000_000, 4_000_000), (4_000_000, 7_000_000),
                  (7_000_000, 12_000_000), (12_000_000, 10**12)]


def _price_bucket(precio: float) -> str:
    for lo, hi in _PRICE_BUCKETS:
        if lo <= precio < hi:
            return f"{int(lo/1e6)}-{'+' if hi >= 10**12 else int(hi/1e6)}M"
    return "n/a"


async def _ensure_calc_indexes(db) -> None:
    global _calc_idx_ready
    if _calc_idx_ready:
        return
    try:
        from pymongo import ASCENDING, DESCENDING
        await db.investment_simulations.create_index([("colonia_slug", ASCENDING), ("created_at", DESCENDING)])
        await db.investment_simulations.create_index("created_at_dt")
        await db.investment_simulations.create_index("id", unique=True, sparse=True)
        await db.investment_scenarios.create_index("token", unique=True, sparse=True)
    except Exception as e:
        log.warning(f"[calc] index fail-open: {e}")
    _calc_idx_ready = True


async def registrar_simulacion(db, params: Dict[str, Any], resultado: Dict[str, Any],
                               ip_hash: Optional[str] = None, lead_capturado: bool = False) -> Optional[str]:
    """Guarda la huella ANÓNIMA de una simulación (LFPDPPP: cero PII). Alimenta demanda revelada
    por zona/precio, expectativas del mercado y conversión. FAIL-OPEN."""
    try:
        await _ensure_calc_indexes(db)
        from datetime import datetime as _dt, timezone as _tz
        now = _dt.now(_tz.utc)
        precio = float(params.get("precio") or 0)
        doc = {
            "id": f"sim_{_secrets.token_urlsafe(10)}",
            "colonia_slug": params.get("colonia_slug") or params.get("colonia_id"),
            "precio": round(precio, 0),
            "rango_precio": _price_bucket(precio),
            "financiamiento_pct": params.get("financiamiento_pct"),
            "anios_tenencia": params.get("anios_tenencia"),
            "apreciacion_asumida_pct": (resultado.get("supuestos") or {}).get("apreciacion_anual_pct"),
            "renta_mensual": params.get("renta_mensual"),
            "tir_apalancado_pct": resultado.get("tir_anual_pct"),
            "lead_capturado": bool(lead_capturado),
            "ip_hash": ip_hash,
            "created_at": now.isoformat(),
            "created_at_dt": now,
        }
        await db.investment_simulations.insert_one(dict(doc))
        return doc["id"]
    except Exception as e:
        log.warning(f"[calc] registrar_simulacion fail-open: {e}")
        return None


async def analiticas_simulaciones(db, dias: int = 90) -> Dict[str, Any]:
    """Demanda revelada de inversionistas: por zona, por rango de precio, expectativas y conversión.
    Para el dev (Battle Card), el superadmin (Terminal) y para alimentar Live Pulse / demand_gap. FAIL-OPEN."""
    from datetime import datetime as _dt, timezone as _tz, timedelta as _td
    cutoff = _dt.now(_tz.utc) - _td(days=dias)
    out: Dict[str, Any] = {"ventana_dias": dias, "por_zona": [], "por_rango_precio": [], "total": 0}
    try:
        por_zona = await db.investment_simulations.aggregate([
            {"$match": {"created_at_dt": {"$gte": cutoff}}},
            {"$group": {
                "_id": "$colonia_slug",
                "simulaciones": {"$sum": 1},
                "precio_promedio": {"$avg": "$precio"},
                "apreciacion_esperada_prom": {"$avg": "$apreciacion_asumida_pct"},
                "leads": {"$sum": {"$cond": ["$lead_capturado", 1, 0]}},
            }},
            {"$match": {"_id": {"$nin": [None, ""]}}},
            {"$sort": {"simulaciones": -1}},
            {"$limit": 50},
        ]).to_list(50)
        for z in por_zona:
            sims = z.get("simulaciones") or 0
            out["por_zona"].append({
                "colonia_slug": z["_id"],
                "simulaciones": sims,
                "precio_promedio": round(z.get("precio_promedio") or 0),
                "apreciacion_esperada_prom_pct": round(z.get("apreciacion_esperada_prom") or 0, 1),
                "leads": z.get("leads") or 0,
                "conversion_pct": round((z.get("leads") or 0) / sims * 100, 1) if sims else 0,
            })
            out["total"] += sims
        por_rango = await db.investment_simulations.aggregate([
            {"$match": {"created_at_dt": {"$gte": cutoff}}},
            {"$group": {"_id": "$rango_precio", "simulaciones": {"$sum": 1}}},
            {"$sort": {"simulaciones": -1}},
        ]).to_list(20)
        out["por_rango_precio"] = [{"rango": r["_id"], "simulaciones": r["simulaciones"]} for r in por_rango if r["_id"]]
    except Exception as e:
        log.warning(f"[calc] analiticas fail-open: {e}")
    return out


# ─── Capa 2 · La simulación se vuelve negocio: lead + predicción + guardar/compartir ──

async def capturar_lead_simulacion(db, contacto: Dict[str, Any], params: Dict[str, Any],
                                   resultado: Dict[str, Any]) -> Dict[str, Any]:
    """Convierte una simulación seria en lead calificado (con consentimiento). Entra a db.leads
    con todo el contexto + registra la predicción de apreciación en el Cerebro del Mercado. FAIL-OPEN."""
    if not contacto.get("consent"):
        return {"ok": False, "reason": "sin_consentimiento"}
    from datetime import datetime as _dt, timezone as _tz
    now = _dt.now(_tz.utc)
    lead_doc = {
        "id": f"lead_{_secrets.token_urlsafe(10)}",
        "name": (contacto.get("name") or "").strip()[:120] or "Inversionista (simulador)",
        "email": (contacto.get("email") or "").strip().lower()[:160] or None,
        "phone": (contacto.get("phone") or "").strip()[:40] or None,
        "source": "investment_simulator",
        "status_v2": "lead_nuevo",
        "status": "nuevo",
        "zone_slug": params.get("colonia_slug") or params.get("colonia_id"),
        "interest_zones": [params.get("colonia_slug")] if params.get("colonia_slug") else [],
        "budget_mxn": params.get("precio"),
        "intent": "inversion",
        "sim_context": {
            "precio": params.get("precio"),
            "financiamiento_pct": params.get("financiamiento_pct"),
            "anios_tenencia": params.get("anios_tenencia"),
            "tir_apalancado_pct": resultado.get("tir_anual_pct"),
            "renta_mensual": params.get("renta_mensual"),
        },
        "consent": True,
        "created_at": now.isoformat(),
        "created_at_dt": now,
    }
    try:
        await db.leads.insert_one(dict(lead_doc))
    except Exception as e:
        log.warning(f"[calc] capturar_lead fail-open: {e}")
        return {"ok": False}
    # Registra la apreciación DMX como predicción del Cerebro (se califica vs DRPI real → flywheel).
    try:
        aprec = (resultado.get("supuestos") or {}).get("apreciacion_anual_pct")
        zona = params.get("colonia_slug") or params.get("colonia_id")
        if aprec is not None and zona:
            from cerebro_mercado_engine import registrar_prediccion
            await registrar_prediccion(db, kind="price", predicted=float(aprec),
                                       ref=f"calc_aprec__{zona}",
                                       meta={"colonia_id": zona, "kind_real": "apreciacion_anual_pct",
                                             "source": "investment_calculator"})
    except Exception as e:
        log.warning(f"[calc] cerebro predict fail-open: {e}")
    return {"ok": True, "lead_id": lead_doc["id"]}


async def guardar_escenario(db, params: Dict[str, Any], resultado: Dict[str, Any]) -> Dict[str, Any]:
    """Guarda un escenario para compartir por link (re-enganche). FAIL-OPEN."""
    try:
        await _ensure_calc_indexes(db)
        from datetime import datetime as _dt, timezone as _tz
        token = _secrets.token_urlsafe(9)
        await db.investment_scenarios.insert_one({
            "token": token, "params": params, "resultado_resumen": {
                k: resultado.get(k) for k in ("tir_anual_pct", "roi_total_pct", "neto_al_vender", "precio")},
            "created_at": _dt.now(_tz.utc).isoformat(),
        })
        return {"ok": True, "token": token, "url": f"/simulador?escenario={token}"}
    except Exception as e:
        log.warning(f"[calc] guardar_escenario fail-open: {e}")
        return {"ok": False}


async def obtener_escenario(db, token: str) -> Dict[str, Any]:
    try:
        doc = await db.investment_scenarios.find_one({"token": token}, {"_id": 0})
        return {"ok": bool(doc), "escenario": doc}
    except Exception:
        return {"ok": False}
