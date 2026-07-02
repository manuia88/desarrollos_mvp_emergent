"""W5.x F6 Sub-B · Tax projector public routes (NO auth · open calculator).

Prefix: /api/tax · 5 endpoints (POST x4 + GET full-scenario).
Cache MongoDB via tax_projector_cache (hit en segunda llamada con mismo input).
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from tax_projector_engine import (
    calculate_isr_vendedor,
    calculate_isai_comprador,
    project_predial_10y,
    calculate_closing_cost_total,
)
from tax_projector_cache import cache_get, cache_set, make_cache_key

log = logging.getLogger("dmx.routes_tax_projector")

router = APIRouter(prefix="/api/tax", tags=["tax_projector"])


# ─── Pydantic bodies ─────────────────────────────────────────────────────────
class IsrVendedorBody(BaseModel):
    precio_compra: float = Field(..., gt=0)
    fecha_compra: str = Field(..., pattern=r"^\d{4}(-\d{2}-\d{2})?$")
    precio_venta: float = Field(..., gt=0)
    fecha_venta: str = Field(..., pattern=r"^\d{4}(-\d{2}-\d{2})?$")
    terreno_pct: float = Field(0.20, ge=0.1, le=0.5)
    participacion_pct: float = Field(1.0, gt=0.0, le=1.0)


class IsaiComprBody(BaseModel):
    precio_venta: float = Field(..., gt=0)
    valor_catastral: float = Field(..., ge=0)
    year: int = Field(2026, ge=2000, le=2100)


class PredialBody(BaseModel):
    valor_catastral: float = Field(0, ge=0)
    year_base: int = Field(2026, ge=2000, le=2100)
    tipo: str = Field("habitacional", pattern=r"^(habitacional|no_habitacional)$")
    predial_anual_actual: Optional[float] = Field(None, ge=0)
    mes_pago_anticipado: Optional[str] = Field(None, pattern=r"^(enero|febrero|marzo_o_despues)$")
    grupo_vulnerable: bool = Field(False)


class ClosingBody(BaseModel):
    precio_venta: float = Field(..., gt=0)
    valor_catastral: float = Field(..., ge=0)
    year: int = Field(2026, ge=2000, le=2100)
    con_credito_hipotecario: bool = Field(False)
    monto_credito: Optional[float] = Field(None, ge=0)


# ─── Helpers ─────────────────────────────────────────────────────────────────
def _db(request: Request):
    return request.app.state.db


async def _cached(request: Request, tipo: str, payload: Dict[str, Any], compute_fn) -> Dict[str, Any]:
    """Cache-aware wrapper · compute_fn devuelve dict con campo 'ok'."""
    db = _db(request)
    key = make_cache_key(tipo, payload)
    hit = await cache_get(db, key)
    if hit:
        hit = dict(hit)
        hit["cached"] = True
        return hit
    result = compute_fn()
    if isinstance(result, dict) and result.get("ok"):
        await cache_set(db, key, tipo, result)
    result["cached"] = False
    return result


# ─── Endpoints ───────────────────────────────────────────────────────────────
@router.post("/isr-vendedor")
async def isr_vendedor(body: IsrVendedorBody, request: Request) -> Dict[str, Any]:
    payload = body.model_dump()
    result = await _cached(request, "isr_vendedor", payload, lambda: calculate_isr_vendedor(**payload))
    if not result.get("ok"):
        raise HTTPException(422, result.get("reason", "Calculo invalido"))
    return result


@router.post("/isai-comprador")
async def isai_comprador(body: IsaiComprBody, request: Request) -> Dict[str, Any]:
    payload = body.model_dump()
    result = await _cached(request, "isai_comprador", payload, lambda: calculate_isai_comprador(**payload))
    if not result.get("ok"):
        raise HTTPException(422, result.get("reason", "Calculo invalido"))
    return result


@router.post("/predial-projection")
async def predial_projection(body: PredialBody, request: Request) -> Dict[str, Any]:
    payload = body.model_dump()
    result = await _cached(request, "predial_10y", payload, lambda: project_predial_10y(**payload))
    if not result.get("ok"):
        raise HTTPException(422, result.get("reason", "Calculo invalido"))
    return result


@router.post("/closing-cost-total")
async def closing_cost_total(body: ClosingBody, request: Request) -> Dict[str, Any]:
    payload = body.model_dump()
    result = await _cached(request, "closing_total", payload, lambda: calculate_closing_cost_total(**payload))
    if not result.get("ok"):
        raise HTTPException(422, result.get("reason", "Calculo invalido"))
    return result


@router.get("/full-scenario")
async def full_scenario(
    request: Request,
    precio_compra: float = Query(..., gt=0),
    fecha_compra: str = Query(..., pattern=r"^\d{4}(-\d{2}-\d{2})?$"),
    precio_venta: float = Query(..., gt=0),
    fecha_venta: str = Query(..., pattern=r"^\d{4}(-\d{2}-\d{2})?$"),
    valor_catastral: float = Query(..., ge=0),
    terreno_pct: float = Query(0.20, ge=0.1, le=0.5),
    participacion_pct: float = Query(1.0, gt=0.0, le=1.0),
    year: int = Query(2026, ge=2000, le=2100),
    tipo_predial: str = Query("habitacional", pattern=r"^(habitacional|no_habitacional)$"),
    predial_anual_actual: Optional[float] = Query(None, ge=0),
    mes_pago_anticipado: Optional[str] = Query(None, pattern=r"^(enero|febrero|marzo_o_despues)$"),
    grupo_vulnerable: bool = Query(False),
    con_credito_hipotecario: bool = Query(False),
    monto_credito: Optional[float] = Query(None, ge=0),
) -> Dict[str, Any]:
    """Escenario completo · 4 sub-resultados en un solo round-trip."""
    isr_payload = {
        "precio_compra": precio_compra, "fecha_compra": fecha_compra,
        "precio_venta": precio_venta, "fecha_venta": fecha_venta,
        "terreno_pct": terreno_pct, "participacion_pct": participacion_pct,
    }
    isai_payload = {"precio_venta": precio_venta, "valor_catastral": valor_catastral, "year": year}
    predial_payload = {
        "valor_catastral": valor_catastral, "year_base": year, "tipo": tipo_predial,
        "predial_anual_actual": predial_anual_actual,
        "mes_pago_anticipado": mes_pago_anticipado, "grupo_vulnerable": grupo_vulnerable,
    }
    closing_payload = {
        "precio_venta": precio_venta, "valor_catastral": valor_catastral, "year": year,
        "con_credito_hipotecario": con_credito_hipotecario, "monto_credito": monto_credito,
    }

    isr = await _cached(request, "isr_vendedor", isr_payload, lambda: calculate_isr_vendedor(**isr_payload))
    isai = await _cached(request, "isai_comprador", isai_payload, lambda: calculate_isai_comprador(**isai_payload))
    predial = await _cached(request, "predial_10y", predial_payload, lambda: project_predial_10y(**predial_payload))
    closing = await _cached(request, "closing_total", closing_payload, lambda: calculate_closing_cost_total(**closing_payload))

    return {
        "ok": True,
        "isr_vendedor": isr,
        "isai_comprador": isai,
        "predial_10y": predial,
        "closing_total": closing,
        "inputs": {
            "precio_compra": precio_compra,
            "fecha_compra": fecha_compra,
            "precio_venta": precio_venta,
            "fecha_venta": fecha_venta,
            "valor_catastral": valor_catastral,
            "terreno_pct": terreno_pct,
            "participacion_pct": participacion_pct,
            "year": year,
            "tipo_predial": tipo_predial,
        },
    }
