"""
Métricas COMPUESTAS por lente de portal — cablea los packs que estaban definidos SIN ruta (huérfanos).

composite_metrics.for_comprador / for_inversor existían pero ningún route los consumía (violación
no-orphan). Aquí se exponen como wrappers read-only (mismo motor, lentes distintos):
  · comprador → Liquidez&Ghost + Índice de recortes (¿zona con vida? ¿líquida? ¿precio bajando?)
  · inversor  → Investor + Liquidez&Ghost + recortes (yield/spread/plusvalía + liquidez entrar-salir)

Cada compuesta ya trae su estado honesto (vivo / esperando_dato) desde composite_metrics — NO se inventa.
No se toca ninguna fórmula: solo se sirve. Opción ?colonia= filtra a una zona (lente del portal).
"""
from fastapi import APIRouter, Request
from typing import Optional, Dict, Any
import composite_metrics as cm

router = APIRouter()


def _filter_zona(payload: Dict[str, Any], colonia: Optional[str]) -> Dict[str, Any]:
    """Filtra por_zona a una colonia (case-insensitive por zona/slug) si se pide; si no, deja todo."""
    if not colonia:
        return payload
    cl = colonia.lower()
    rows = [pz for pz in payload.get("por_zona", []) if (pz.get("zona") or "").lower() == cl
            or (pz.get("colonia_id") or "").lower() == cl]
    return {**payload, "por_zona": rows}


@router.get("/api/composites/comprador")
async def composites_comprador(request: Request, colonia: Optional[str] = None, since_days: int = 180):
    """Compuestas con lente de COMPRADOR (liquidez / vida de calle / margen de negociación)."""
    db = request.app.state.db
    data = await cm.for_comprador(db, since_days=since_days)
    return {"lente": "comprador", **_filter_zona(data, colonia)}


@router.get("/api/composites/inversor")
async def composites_inversor(request: Request, colonia: Optional[str] = None, since_days: int = 180):
    """Compuestas con lente de INVERSOR (yield / spread / plusvalía / liquidez / recortes)."""
    db = request.app.state.db
    data = await cm.for_inversor(db, since_days=since_days)
    return {"lente": "inversor", **_filter_zona(data, colonia)}
