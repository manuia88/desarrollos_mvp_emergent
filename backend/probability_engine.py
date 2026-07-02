"""W5.19 — Probability UX Engine (Kalshi-inspired).

3 funciones async + endpoint GET /api/probability/{type} + cache TTL 60s.

Shape estándar:
{
  probability_pct: float 0-100,
  confidence_lvl: "ALTA"|"MEDIA"|"BAJA",
  sources_breakdown: [{source, contribution_pct, value_used}],
  explanation_es: str,
  insufficient_data: bool,
  reason: str | None,
  computed_at: iso
}

Endpoint: GET /api/probability/{type}?id=X&months=Y&listed=Z
"""
from __future__ import annotations

import logging
import math
import re
import time
from collections import defaultdict, deque
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from ratelimit import client_ip as _dmx_canon_ip  # SEGURIDAD: IP anti-spoofing (pentest 2026-06-27)

log = logging.getLogger("dmx.probability")

# ─── Cache TTL 60s ────────────────────────────────────────────────────────────
_CACHE: Dict[str, Dict[str, Any]] = {}
_CACHE_TTL = 60   # segundos
_CACHE_MAX = 256

# ─── Rate limiting (60 req/min/IP) ────────────────────────────────────────────
_RATE_BUCKET: Dict[str, deque] = defaultdict(lambda: deque(maxlen=60))
_RATE_WINDOW_S = 60

# ─── Constantes ───────────────────────────────────────────────────────────────
VALID_TYPES = {"sells_complete", "drpi_up", "closes_below_listed"}
Z_80 = 1.28  # z-score para intervalo 80%

router = APIRouter()


# ─── Helpers internos ─────────────────────────────────────────────────────────

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _sigmoid(x: float) -> float:
    try:
        return 1.0 / (1.0 + math.exp(-x))
    except OverflowError:
        return 0.0 if x < 0 else 1.0


def _norm_cdf(z: float) -> float:
    """CDF normal estándar via función error (sin scipy)."""
    return 0.5 * (1.0 + math.erf(z / math.sqrt(2.0)))


def _confidence_label(prob_pct: float) -> str:
    """ALTA si señal clara (lejos de 50%), BAJA si cerca de 50% (incierto)."""
    dist = abs(prob_pct - 50.0)
    if dist >= 25.0:
        return "ALTA"
    if dist >= 15.0:
        return "MEDIA"
    return "BAJA"


def _cache_get(key: str) -> Optional[Dict[str, Any]]:
    entry = _CACHE.get(key)
    if entry and (time.monotonic() - entry["ts"]) < _CACHE_TTL:
        return entry["data"]
    _CACHE.pop(key, None)
    return None


def _cache_set(key: str, data: Dict[str, Any]) -> None:
    if len(_CACHE) >= _CACHE_MAX:
        oldest = next(iter(_CACHE))
        _CACHE.pop(oldest, None)
    _CACHE[key] = {"data": data, "ts": time.monotonic()}


def _rate_limit(request: Request) -> None:
    ip = _dmx_canon_ip(request)
    if not ip and request.client:
        ip = request.client.host
    ip = ip or "unknown"
    bucket = _RATE_BUCKET[ip]
    now = time.time()
    while bucket and (now - bucket[0]) > _RATE_WINDOW_S:
        bucket.popleft()
    if len(bucket) >= 60:
        raise HTTPException(status_code=429, detail="Rate limit excedido · 60 req/min por IP")
    bucket.append(now)


def _parse_property_id(pid: str) -> Optional[Dict[str, Any]]:
    """Parsea property_id sintético: {colonia}_m2{m2}_r{rec}_b{ban}_a{age}"""
    m = re.match(r'^(.+?)_m2(\d+(?:\.\d+)?)_r(\d+)_b(\d+)_a(\d+)$', pid)
    if m:
        return {
            "colonia": m.group(1),
            "m2": float(m.group(2)),
            "recamaras": int(m.group(3)),
            "banos": int(m.group(4)),
            "antiguedad_anos": int(m.group(5)),
        }
    return None


def _db(request: Request):
    return request.app.state.db


# ─── Helper 1: Sells Complete ─────────────────────────────────────────────────

async def compute_sells_complete(db, project_id: str, months: int = 12) -> Dict[str, Any]:
    """Probabilidad de que un proyecto venda todas sus unidades en N meses.

    Usa velocidad de absorción de unidades (WhatIf W4.4D conceptual) +
    velocidad de leads como señal de demanda.
    """
    from data_developments import DEVELOPMENTS_BY_ID
    dev = DEVELOPMENTS_BY_ID.get(project_id)
    if not dev:
        return {
            "probability_pct": 0.0,
            "confidence_lvl": "BAJA",
            "sources_breakdown": [],
            "explanation_es": f"Proyecto {project_id} no encontrado en el sistema.",
            "insufficient_data": True,
            "reason": "project_not_found",
            "computed_at": _now_iso(),
        }

    units_total = int(dev.get("units_total") or dev.get("units_available") or 0)
    units_available = int(dev.get("units_available") or 0)
    if units_total <= 0:
        return {
            "probability_pct": 0.0,
            "confidence_lvl": "BAJA",
            "sources_breakdown": [],
            "explanation_es": "Sin unidades registradas en el proyecto.",
            "insufficient_data": True,
            "reason": "no_units",
            "computed_at": _now_iso(),
        }

    units_sold = max(0, units_total - units_available)
    absorption_rate = units_sold / units_total  # 0..1

    # Leads recientes como señal de demanda activa
    since = datetime.now(timezone.utc) - timedelta(days=months * 30)
    try:
        lead_count = await db.leads.count_documents({
            "project_id": project_id,
            "created_at": {"$gte": since},
        })
    except Exception:
        lead_count = 0

    leads_per_month = lead_count / max(1, months)
    # >= 3 leads/mes = señal plena; escala lineal
    leads_signal = min(1.0, leads_per_month / 3.0)

    # Combinar: 70% absorción real, 30% velocidad de leads
    combined = 0.70 * absorption_rate + 0.30 * leads_signal

    # Sigmoid calibrado: combined=0.4 → 50%, combined=0.8 → ~92%
    x = (combined - 0.4) * 12.0
    prob = _sigmoid(x) * 100.0
    prob = round(min(99.0, max(1.0, prob)), 1)

    confidence = _confidence_label(prob)

    wb_contrib = absorption_rate * 70.0
    leads_contrib = leads_signal * 30.0
    total_contrib = max(wb_contrib + leads_contrib, 0.01)

    # [AUD-046] Rango en vez del conteo exacto de leads (no exponer el volumen de ventas de un proyecto).
    _leads_bucket = ("0" if lead_count <= 0 else "1-10" if lead_count <= 10 else
                     "11-25" if lead_count <= 25 else "26-50" if lead_count <= 50 else
                     "51-100" if lead_count <= 100 else "100+")
    sources = [
        {
            "source": "WhatIf",
            "contribution_pct": round(wb_contrib / total_contrib * 100.0, 1),
            "value_used": f"absorcion_{round(absorption_rate * 100, 1)}pct",
        },
        {
            "source": "Comparables",
            "contribution_pct": round(leads_contrib / total_contrib * 100.0, 1),
            "value_used": f"leads_{_leads_bucket}_en_{months}m",
        },
    ]

    explanation = (
        f"{prob}% basado en absorcion {round(absorption_rate*100,1)}% "
        f"(WhatIf {round(wb_contrib/total_contrib*100,1)}%) "
        f"+ {lead_count} leads/{months}m "
        f"(Comparables {round(leads_contrib/total_contrib*100,1)}%) "
        f"· confianza {confidence}"
    )

    return {
        "probability_pct": prob,
        "confidence_lvl": confidence,
        "sources_breakdown": sources,
        "explanation_es": explanation,
        "insufficient_data": False,
        "reason": None,
        "computed_at": _now_iso(),
    }


# ─── Helper 2: DRPI Up ────────────────────────────────────────────────────────

async def compute_zone_drpi_up(db, zone_slug: str, months: int = 3) -> Dict[str, Any]:
    """Probabilidad de que el DRPI de una zona suba en N meses.

    Usa get_zone_forecast (forecast ARIMA W5.3). Si delta_pct > 0 → prob > 50%.
    """
    from forecast_engine import get_zone_forecast

    forecast = await get_zone_forecast(db, zone_slug)
    if not forecast or not forecast.get("available"):
        return {
            "probability_pct": 0.0,
            "confidence_lvl": "BAJA",
            "sources_breakdown": [],
            "explanation_es": (
                f"Datos insuficientes para {zone_slug}. "
                "El modelo ARIMA requiere historial minimo de 6 meses."
            ),
            "insufficient_data": True,
            "reason": "forecast_unavailable",
            "computed_at": _now_iso(),
        }

    horizons = forecast.get("horizons") or {}
    horizon_key = f"{months}m"
    if horizon_key not in horizons:
        available_sorted = sorted(
            horizons.keys(),
            key=lambda k: abs(int(k.rstrip("m")) - months),
        )
        if available_sorted:
            horizon_key = available_sorted[0]
        else:
            return {
                "probability_pct": 50.0,
                "confidence_lvl": "BAJA",
                "sources_breakdown": [],
                "explanation_es": f"Sin horizonte {months}m disponible para {zone_slug}.",
                "insufficient_data": True,
                "reason": "no_horizon",
                "computed_at": _now_iso(),
            }

    h = horizons[horizon_key]
    delta_pct = float(h.get("delta_pct") or 0.0)
    mape = float(forecast.get("mape_test") or 10.0)

    # k=0.3 → delta 3pp = ~73%, delta 5pp = ~82%
    k = 0.3
    prob = _sigmoid(k * delta_pct) * 100.0
    prob = round(min(99.0, max(1.0, prob)), 1)

    confidence = _confidence_label(prob)
    # MAPE alto degradar confianza un nivel
    if mape > 5.0 and confidence == "ALTA":
        confidence = "MEDIA"

    sources = [
        {
            "source": "Forecast",
            "contribution_pct": 100.0,
            "value_used": f"delta_{delta_pct:+.1f}pct_{horizon_key}",
        }
    ]

    direction = "subida" if delta_pct >= 0 else "bajada"
    explanation = (
        f"{prob}% probabilidad de {direction} DRPI en {horizon_key} "
        f"· Forecast ARIMA (delta {delta_pct:+.1f}%) "
        f"· confianza {confidence}"
    )

    return {
        "probability_pct": prob,
        "confidence_lvl": confidence,
        "sources_breakdown": sources,
        "explanation_es": explanation,
        "insufficient_data": False,
        "reason": None,
        "computed_at": _now_iso(),
    }


# ─── Helper 3: Closes Below Listed ───────────────────────────────────────────

async def compute_closes_below_listed(db, property_id: str, listed_price: float) -> Dict[str, Any]:
    """Probabilidad de que el precio de cierre esté por debajo del precio listado.

    P = norm.cdf((listed - avm_value) / sigma)
    Usa AVM (W5.1) + FSD sigma (W5.15).
    """
    from avm_public_engine import avm_quick_async
    from fsd_engine import compute_fsd

    parsed = _parse_property_id(property_id)
    if not parsed:
        # Fallback: usar como colonia con valores tipicos
        parsed = {
            "colonia": property_id,
            "m2": 80.0,
            "recamaras": 2,
            "banos": 2,
            "antiguedad_anos": 8,
        }

    colonia = parsed["colonia"]
    m2 = parsed["m2"]
    recamaras = parsed["recamaras"]
    banos = parsed["banos"]
    antiguedad_anos = parsed["antiguedad_anos"]

    # 1. Valor AVM
    avm_result = await avm_quick_async(db, colonia, m2, recamaras, banos, antiguedad_anos)
    if avm_result.get("error"):
        return {
            "probability_pct": 0.0,
            "confidence_lvl": "BAJA",
            "sources_breakdown": [],
            "explanation_es": f"Colonia '{colonia}' no encontrada en AVM.",
            "insufficient_data": True,
            "reason": "avm_not_found",
            "computed_at": _now_iso(),
        }

    avm_value = float(avm_result.get("precio_estimado") or 0)
    if avm_value <= 0:
        return {
            "probability_pct": 50.0,
            "confidence_lvl": "BAJA",
            "sources_breakdown": [],
            "explanation_es": "AVM sin valor estimado disponible para esta propiedad.",
            "insufficient_data": True,
            "reason": "avm_zero_value",
            "computed_at": _now_iso(),
        }

    # 2. Sigma desde FSD
    property_features = {
        "m2": m2,
        "recamaras": recamaras,
        "banos": banos,
        "antiguedad_anos": antiguedad_anos,
    }
    fsd_result = await compute_fsd(db, property_features, colonia)
    fsd_available = fsd_result.get("available", False)

    sigma = 0.0
    if fsd_available:
        low = float(fsd_result.get("low_estimate") or 0)
        high = float(fsd_result.get("high_estimate") or 0)
        if high > low > 0:
            sigma = (high - low) / (2.0 * Z_80)

    if sigma <= 0:
        range_low = float(avm_result.get("range_low") or avm_value * 0.88)
        range_high = float(avm_result.get("range_high") or avm_value * 1.12)
        sigma = (range_high - range_low) / (2.0 * Z_80)

    if sigma <= 0:
        sigma = avm_value * 0.12

    # 3. z-score y probabilidad
    z = (listed_price - avm_value) / sigma
    prob = _norm_cdf(z) * 100.0
    prob = round(min(99.0, max(1.0, prob)), 1)

    confidence = _confidence_label(prob)
    if not fsd_available and confidence == "ALTA":
        confidence = "MEDIA"

    avm_contrib = 60.0
    fsd_contrib = 40.0 if fsd_available else 0.0
    total_contrib = max(avm_contrib + fsd_contrib, 0.01)

    sources: List[Dict[str, Any]] = [
        {
            "source": "AVM",
            "contribution_pct": round(avm_contrib / total_contrib * 100.0, 1),
            "value_used": f"estimado_{int(avm_value):,}mxn".replace(",", "_"),
        }
    ]
    if fsd_available:
        sources.append({
            "source": "FSD",
            "contribution_pct": round(fsd_contrib / total_contrib * 100.0, 1),
            "value_used": f"sigma_{int(sigma):,}mxn".replace(",", "_"),
        })

    diff_pct = round((listed_price - avm_value) / avm_value * 100.0, 1)
    direction_str = "sobre" if listed_price >= avm_value else "bajo"
    fsd_str = f" + FSD {round(fsd_contrib/total_contrib*100,1)}%" if fsd_available else ""
    explanation = (
        f"{prob}% · Precio listado {diff_pct:+.1f}% {direction_str} valor AVM "
        f"(AVM {round(avm_contrib/total_contrib*100,1)}%{fsd_str}) "
        f"· confianza {confidence}"
    )

    return {
        "probability_pct": prob,
        "confidence_lvl": confidence,
        "sources_breakdown": sources,
        "explanation_es": explanation,
        "insufficient_data": False,
        "reason": None,
        "computed_at": _now_iso(),
    }


# ─── Endpoint unificado ───────────────────────────────────────────────────────

@router.get("/api/probability/{type}")
async def get_probability(
    type: str,
    request: Request,
    id: str = Query(..., description="entity_id segun el type"),
    months: int = Query(default=12, ge=1, le=24),
    listed: Optional[float] = Query(default=None, ge=0),
):
    """
    GET /api/probability/{type}?id=X&months=Y&listed=Z

    type ∈ {sells_complete, drpi_up, closes_below_listed}
    Cache TTL 60s · Rate limit 60 req/min/IP · T0 publico
    """
    if type not in VALID_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"type invalido. Debe ser uno de: {', '.join(sorted(VALID_TYPES))}",
        )

    _rate_limit(request)

    cache_key = f"{type}:{id}:{months}:{listed}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    db = _db(request)

    try:
        if type == "sells_complete":
            # [AUD-046] Decisión founder: la prob. de venta de un proyecto (que deriva de su volumen de
            # leads) exige LOGIN — antes era pública T0 y filtraba señal comercial a cualquiera.
            from server import get_current_user
            if not await get_current_user(request):
                raise HTTPException(401, "Inicia sesión para ver la probabilidad de venta")
            result = await compute_sells_complete(db, id, months)
        elif type == "drpi_up":
            result = await compute_zone_drpi_up(db, id, months)
        else:  # closes_below_listed
            if listed is None:
                raise HTTPException(
                    status_code=422,
                    detail="Param 'listed' requerido para closes_below_listed",
                )
            result = await compute_closes_below_listed(db, id, float(listed))
    except HTTPException:
        raise
    except Exception as exc:
        log.warning(f"[probability] error {type}/{id}: {exc}")
        return {
            "probability_pct": 0.0,
            "confidence_lvl": "BAJA",
            "sources_breakdown": [],
            "explanation_es": "Error interno al calcular probabilidad.",
            "insufficient_data": True,
            "reason": "computation_error",
            "computed_at": _now_iso(),
        }

    # Audit log opcional
    try:
        from audit_immutable_engine import log as audit_log
        await audit_log(
            db,
            actor={"user_id": "public", "role": "public"},
            action="probability_query",
            entity_type=type,
            entity_id=id,
            before=None,
            after={
                "probability_pct": result.get("probability_pct"),
                "insufficient_data": result.get("insufficient_data"),
            },
        )
    except Exception:
        pass

    _cache_set(cache_key, result)
    return result

# W5.FF6 register_feature marker · NO duplicate
from feature_registry import register_feature as _w5ff6_register_feature
_w5ff6_register_feature("probability_ux", plan_tier="pro", monthly_price_mxn=99, category="intelligence", name="Probability UX")
