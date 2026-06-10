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

    # ROI: plusvalía + rentas netas (sin hipoteca) / inversión inicial
    # La hipoteca construye equity, no es un costo puro
    total_rentas_netas = (renta_mensual - costos_op_mensual) * plazo_meses
    roi_abs = (plusvalia_abs - gastos_cierre + total_rentas_netas) / inversion_inicial
    roi_pct = roi_abs * 100

    # TIR: usa flujo_neto (renta - costos_op - hipoteca) para TIR con venta final
    tir = _compute_tir_anualizada(inversion_inicial, cash_flow_monthly, precio_final, plazo_meses)

    # Break-even: cuando plusvalía acumulada + rentas netas cubre inversión inicial
    cumulative_renta = 0.0
    break_even_months = plazo_meses
    for mes, cf in enumerate(cash_flow_monthly, 1):
        cumulative_renta += cf["renta_neta"]
        val_actual = precio_entrada * ((1 + aprec_annual) ** (mes / 12))
        plusvalia_acum = val_actual - precio_entrada
        if (plusvalia_acum + cumulative_renta - gastos_cierre) >= 0:
            break_even_months = mes
            break

    return {
        "label": label,
        "aprec_anual_pct": round(aprec_annual * 100, 2),
        "precio_final": round(precio_final, 0),
        "roi_pct": round(roi_pct, 2),
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
