"""EXPEDIENTE DE COMPORTAMIENTO POR DESARROLLADOR — endpoint.

  GET /api/superadmin/expediente/{dev} → cómo trabaja ese desarrollador, aprendido de
      sus datos (convenciones, cadencia de listas, peleas, solicitudes, señal de venta).
      `dev` acepta la carpeta del Drive ('DESARROLLOS-CLASS'), el org_id ('org_gdc')
      o un alias ('class' / 'gdc').

Lógica en dev_expediente.py (pura + async testeable); aquí solo auth + wiring.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from dev_expediente import expediente
from permissions import require_superadmin

router = APIRouter(prefix="/api/superadmin")


def _db(request: Request):
    return request.app.state.db


@router.get("/expediente/{dev}")
async def expediente_endpoint(request: Request, dev: str):
    """El expediente de conducta del desarrollador — todo derivado de datos reales."""
    await require_superadmin(request)
    exp = await expediente(_db(request), dev)
    if not exp["encontrado"]:
        raise HTTPException(status_code=404,
                            detail=f"No conozco a ningún desarrollador '{dev}'")
    return exp
