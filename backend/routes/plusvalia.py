"""
routes/plusvalia.py — PLUSVALÍA HIPER-SEGMENTADA (lee `plusvalia_grid`).
═══════════════════════════════════════════════════════════════════════════════
Endpoint público de lectura de la grid de plusvalía (colonia × atributo × price-tier).
Sirve a los TRES portales:
  · comprador (ficha/zona: "cuánto se revaloriza esta colonia y cuánto suma cada atributo")
  · dev       (mismo dato, para argumentar precio/plusvalía por atributo)
  · superadmin(estado de la grid: qué está sembrado, con qué confianza/fuente)

Motor: plusvalia_grid_engine (que SOLO orquesta shf_engine + dmx_hedonic_atom). Nunca inventa:
cada celda trae base · factor_shf · ajuste_hedonico · es_estimado · fuente · confianza · n.

Router EXPORTADO como `router`. NO se registra aquí (el registro central lo hace server.py).
"""
from __future__ import annotations

import time
from collections import defaultdict, deque
from typing import Optional, Deque, Dict

from fastapi import APIRouter, HTTPException, Request, Query

try:
    from ratelimit import client_ip as _dmx_canon_ip  # SEGURIDAD: IP anti-spoofing (pentest 2026-06-27)
except Exception:  # pragma: no cover — fail-soft si el módulo no está
    _dmx_canon_ip = None  # type: ignore

import plusvalia_grid_engine as pg

router = APIRouter()

_BUCKET: Dict[str, Deque[float]] = defaultdict(lambda: deque(maxlen=120))
_WINDOW = 60.0


def _db(request: Request):
    return request.app.state.db


def _ip(req: Request) -> str:
    fwd = _dmx_canon_ip(req) if _dmx_canon_ip else None
    return fwd or (req.client.host if req.client else "unknown")


def _rate(req: Request, limit: int = 60) -> None:
    b = _BUCKET[_ip(req)]
    now = time.time()
    while b and now - b[0] > _WINDOW:
        b.popleft()
    if len(b) >= limit:
        raise HTTPException(429, "rate_limit_exceeded")
    b.append(now)


@router.get("/api/plusvalia/{colonia_id}")
async def plusvalia_colonia(
    request: Request,
    colonia_id: str,
    atributo: Optional[str] = Query(None, description="roof|terraza|estacionamiento|balcon|bodega (o vacío = panel completo)"),
    tipo: Optional[str] = Query(None, description="price-tier (entry|mid|luxury|ultraluxury) o property_type"),
):
    """Plusvalía anual segmentada de una colonia.

    · sin `atributo`  → panel: plusvalía base de la zona + una fila por atributo principal.
    · con `atributo`  → una sola celda (base SHF × prima hedónica del atributo).
    `tipo` (opcional) segmenta el hedónico por price-tier.
    """
    _rate(request)
    db = _db(request)
    if atributo:
        cell = await pg.get_cell(db, colonia_id, atributo=atributo, tipo=tipo)
        if cell.get("error"):
            raise HTTPException(404, cell["error"])
        return cell
    panel = await pg.get_colonia(db, colonia_id, tipo=tipo)
    if panel.get("error"):
        raise HTTPException(404, panel["error"])
    return panel


@router.get("/api/plusvalia/_meta/colonias")
async def plusvalia_colonias(request: Request):
    """Colonias con plusvalía hiper-segmentada disponible (las que tienen hedónico).
    Útil para el selector del comprador/dev y para el panel de estado de superadmin."""
    _rate(request)
    db = _db(request)
    cols = await pg.colonias_con_hedonico(db)
    return {"colonias": cols, "total": len(cols),
            "atributos": pg.ATRIBUTOS_PRINCIPALES,
            "price_tiers": list(pg.PRICE_TIER_KEYS)}


@router.get("/api/plusvalia/_admin/estado")
async def plusvalia_estado(request: Request, colonia_id: Optional[str] = Query(None)):
    """Estado de la grid (superadmin): celdas materializadas + procedencia. Solo lectura."""
    # SEGURIDAD (auditoría A–Z 07-24): el docstring decía "superadmin" pero el handler nunca lo
    # comprobaba — esta pantalla interna respondía a cualquiera sin sesión.
    from permissions import require_superadmin
    await require_superadmin(request)
    _rate(request, limit=30)
    db = _db(request)
    q = {"colonia_id": colonia_id} if colonia_id else {}
    total = await db[pg.COLLECTION].count_documents(q)
    por_base: Dict[str, int] = {}
    por_confianza: Dict[str, int] = {}
    muestra = []
    async for c in db[pg.COLLECTION].find(q, {"_id": 0}).limit(500):
        por_base[c.get("base", "?")] = por_base.get(c.get("base", "?"), 0) + 1
        por_confianza[c.get("confianza", "?")] = por_confianza.get(c.get("confianza", "?"), 0) + 1
        if len(muestra) < 20:
            muestra.append({
                "colonia_id": c.get("colonia_id"), "atributo": c.get("atributo"),
                "tipo": c.get("tipo"), "valor_pct": c.get("valor_pct"),
                "base": c.get("base"), "confianza": c.get("confianza"),
                "es_estimado": c.get("es_estimado"), "n": c.get("n"),
            })
    return {
        "coleccion": pg.COLLECTION,
        "celdas": total,
        "por_base": por_base,
        "por_confianza": por_confianza,
        "muestra": muestra,
    }
