"""
DMX · F1.2 — Motor de Valor Residual del Terreno.
Prefix /api/dev/valor-residual · auth developer/superadmin.
Responde "¿Cuánto máximo puedo pagar por este terreno?" reutilizando el SIG (CUS/COS),
el AVM de la zona y el motor de costo de obra. Cero deuda, Doctrina de Datos.
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, Query
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/dev/valor-residual", tags=["dev_valor_residual"])
log = logging.getLogger("dmx.routes_dev_valor_residual")


def _db(request: Request):
    return request.app.state.db


async def _auth(req: Request):
    from server import get_current_user
    user = await get_current_user(req)
    if not user:
        raise HTTPException(401, "No autenticado")
    if user.role not in ("developer_admin", "developer_member", "developer_director", "superadmin"):
        raise HTTPException(403, "Rol no autorizado")
    return user


class CalculoIn(BaseModel):
    terreno_m2: float = Field(..., gt=0, le=1_000_000)
    categoria: str = "media"
    colonia_id: Optional[str] = None
    cus_manual: Optional[float] = Field(None, ge=0, le=30)
    precio_venta_pm2_manual: Optional[float] = Field(None, ge=0, le=2_000_000)
    costo_obra_pm2_manual: Optional[float] = Field(None, ge=0, le=2_000_000)
    margen_objetivo: Optional[float] = Field(None, ge=0, le=0.9)
    eficiencia: Optional[float] = Field(None, gt=0, le=1)
    city: str = "CDMX"


@router.get("/categorias")
async def categorias(request: Request):
    """Catálogo de categorías de producto (para el selector). Sin auth pesada (solo logueado)."""
    await _auth(request)
    from valor_residual_engine import CATEGORIAS, DEFAULTS
    return {
        "categorias": [{"id": k, **v} for k, v in CATEGORIAS.items()],
        "defaults": DEFAULTS,
    }


@router.get("/colonias")
async def colonias(request: Request, q: Optional[str] = Query(None), city: str = "CDMX",
                   limit: int = Query(40, ge=1, le=200)):
    """Colonias con CUS para el selector. Busca por nombre; ordena las que tienen precio real."""
    await _auth(request)
    db = _db(request)
    flt = {"city": city, "cus": {"$gt": 0}}
    if q and q.strip():
        import re as _re
        flt["name"] = {"$regex": _re.escape(q.strip()), "$options": "i"}
    cur = db.colonias.find(
        flt,
        {"_id": 0, "id": 1, "name": 1, "alcaldia": 1, "cos": 1, "cus": 1,
         "precio_pm2": 1, "vsuelo_pm2_catastral": 1},
    ).limit(limit)
    items = await cur.to_list(length=limit)
    # las que tienen precio real primero, luego por nombre
    items.sort(key=lambda c: (0 if (c.get("precio_pm2") or 0) > 0 else 1, c.get("name") or ""))
    return {"items": items, "total": len(items)}


class DueDiligenceIn(BaseModel):
    colonia_id: Optional[str] = None
    superficie_m2: Optional[float] = Field(None, gt=0, le=1_000_000)
    city: str = "CDMX"


@router.post("/due-diligence")
async def due_diligence(request: Request, body: DueDiligenceIn):
    """F1.3 · Revisión completa del predio antes de comprar (zonificación + riesgos + legal +
    factibilidades + Norma 3). Cada ítem con estado y origen del dato."""
    await _auth(request)
    from predio_due_diligence_engine import generar_due_diligence
    try:
        return await generar_due_diligence(
            _db(request), colonia_id=body.colonia_id,
            superficie_m2=body.superficie_m2, city=body.city)
    except Exception as e:
        log.exception("[valor-residual] due-diligence falló")
        raise HTTPException(500, f"No se pudo generar: {e}")


@router.post("/calcular")
async def calcular(request: Request, body: CalculoIn):
    """Calcula la oferta máxima por el terreno (método residual) con el origen de cada dato."""
    await _auth(request)
    from valor_residual_engine import calcular_residual
    try:
        return await calcular_residual(
            _db(request),
            terreno_m2=body.terreno_m2,
            categoria=body.categoria,
            colonia_id=body.colonia_id,
            cus_manual=body.cus_manual,
            precio_venta_pm2_manual=body.precio_venta_pm2_manual,
            costo_obra_pm2_manual=body.costo_obra_pm2_manual,
            margen_objetivo=body.margen_objetivo,
            eficiencia=body.eficiencia,
            city=body.city,
        )
    except Exception as e:
        log.exception("[valor-residual] calcular falló")
        raise HTTPException(500, f"No se pudo calcular: {e}")
