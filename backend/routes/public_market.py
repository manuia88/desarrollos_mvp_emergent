"""
DMX · Fase 3.4 — LENTE DEL COMPRADOR: inteligencia de mercado PÚBLICA
Sin auth, rate-limited (30/min/IP). Expone SOLO agregados anónimos del cubo para que
el comprador entienda el VALOR ("zero fear buying"): qué atributo sube el precio/m² en
el mercado. Nunca dato crudo de un proyecto/dev. Mismo motor del cubo (dmx_hedonic_atom).
"""
from __future__ import annotations

import time
from collections import defaultdict, deque
from typing import Optional, Deque, Dict

from fastapi import APIRouter, HTTPException, Request, Query

router = APIRouter()

_BUCKET: Dict[str, Deque[float]] = defaultdict(lambda: deque(maxlen=120))
_WINDOW = 60.0


def _ip(req: Request) -> str:
    fwd = (req.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    return fwd or (req.client.host if req.client else "unknown")


def _rate(req: Request, limit: int = 30) -> None:
    b = _BUCKET[_ip(req)]
    now = time.time()
    while b and now - b[0] > _WINDOW:
        b.popleft()
    if len(b) >= limit:
        raise HTTPException(429, "rate_limit_exceeded")
    b.append(now)


@router.get("/api/public/market/index")
async def market_index(request: Request):
    """DMX ÍNDICE DE MERCADO — agregados ANÓNIMOS por colonia (precio/m², absorción,
    inventario) desde el cubo. El 'Transparency Index' / data marketplace: dato público,
    consumible vía API, sin exponer ningún proyecto/dev. Privacidad: celdas con <5
    unidades se omiten. 'DMX no opina, mide.'"""
    _rate(request)
    import cube_olap_engine as olap
    db = request.app.state.db
    cc = await olap.query_cross_cut(db, dimensions=["zone"], filters={})
    rows = []
    for c in cc.get("matrix", []):
        k = c.get("kpis") or {}
        if (k.get("units_total") or 0) < 5:            # privacidad k-anon
            continue
        rows.append({
            "colonia": c.get("zone"),
            "precio_m2": k.get("avg_price_per_m2"),
            "absorcion_pct": k.get("absorcion_pct"),
            "inventario": k.get("units_available"),
            "unidades": k.get("units_total"),
        })
    rows.sort(key=lambda r: (r.get("precio_m2") or 0), reverse=True)
    return {
        "index": rows, "count": len(rows),
        "fuente": "DMX · cubo de mercado (anónimo)",
        "metodologia": "agregado por colonia · celdas <5 unidades omitidas (privacidad)",
    }


@router.get("/api/public/market/amenity-ranker")
async def amenity_ranker(request: Request, colonia: Optional[str] = Query(None)):
    """Qué atributo sube el precio/m² en el mercado (anónimo). Para que el comprador
    entienda por qué una propiedad vale lo que vale. Opcional ?colonia= para acotar."""
    _rate(request)
    import dmx_hedonic_atom
    db = request.app.state.db
    scope = {"geo.colonia_id": colonia} if colonia else None
    r = await dmx_hedonic_atom.fit_and_rank(db, scope, persist=False)
    # Option A (pentest 2026-06-27): el PÚBLICO ve el ranking (qué amenidad mueve el precio) pero NO la receta
    # estadística del modelo hedónico (r²/p-value/significancia/n) = moat (versión completa en /api/dev/market/...).
    pub = [{"atributo": a.get("atributo"), "impacto_pct_precio_m2": a.get("impacto_pct_precio_m2")}
           for a in (r.get("amenity_ranker") or [])]
    return {"amenity_ranker": pub}
