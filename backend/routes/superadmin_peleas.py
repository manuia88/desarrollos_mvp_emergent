"""PROTOCOLO DE PELEAS — el registro único de datos en disputa, visible.

  GET /api/superadmin/peleas → todas las peleas abiertas uniformes
      {tipo, desarrollo, unidad, detalle, edad_dias, ruta} + totales por ruta/tipo
      + las envejecidas (ruta 'dev' con más de `umbral_dias` días — recordatorio).

Lógica en peleas_registry.py (pura + async testeable); aquí solo auth + wiring.
"""
from __future__ import annotations

from fastapi import APIRouter, Request

from peleas_registry import filtra_envejecidas, peleas_abiertas
from permissions import require_superadmin

router = APIRouter(prefix="/api/superadmin")


def _db(request: Request):
    return request.app.state.db


@router.get("/peleas")
async def peleas_endpoint(request: Request, umbral_dias: int = 10):
    """Todo dato en disputa entre fuentes, en un solo lugar — nada vive solo en Mongo."""
    await require_superadmin(request)
    r = await peleas_abiertas(_db(request))
    r["envejecidas"] = filtra_envejecidas(r["peleas"], umbral_dias)
    r["umbral_dias"] = umbral_dias
    return r
