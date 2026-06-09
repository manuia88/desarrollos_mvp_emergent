"""
DMX · F1.1 — Doctrina de Datos (endpoint cross-portal).
Prefix /api/doctrine · cualquier usuario autenticado (los 4 portales la consumen).
Fuente única de la verdad sobre el origen de cada número (data_doctrine.py).
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Request

router = APIRouter(prefix="/api/doctrine", tags=["doctrine"])
log = logging.getLogger("dmx.routes_doctrine")


async def _auth(req: Request):
    from server import get_current_user
    user = await get_current_user(req)
    if not user:
        raise HTTPException(401, "No autenticado")
    return user


@router.get("")
async def get_doctrine(request: Request):
    """La leyenda completa de la Doctrina de Datos (orígenes + 7 reglas + madurez)."""
    await _auth(request)
    from data_doctrine import legend
    return legend()
