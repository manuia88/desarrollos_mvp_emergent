"""
routes/gentrificacion.py — Índice de GENTRIFICACIÓN / "zona subiendo" de una colonia.
═══════════════════════════════════════════════════════════════════════════════
Expone el motor gentrification_engine (índice 0–100 derivado y honesto: es_estimado=True).
Lo consumen 4 portales:
  · comprador  → tarjeta "¿esta zona está subiendo?" (revalorización + seguridad + demanda).
  · inversor   → señal de momentum de la colonia junto a plusvalía/yield.
  · asesor     → argumento de venta ("colonia en ascenso", con sus fuentes).
  · superadmin → inspección + backfill (persist) del índice por colonia.

Registro en server.py (NO lo hace este archivo):
    from routes.gentrificacion import router as gentrificacion_router
    app.include_router(gentrificacion_router)
"""
from fastapi import APIRouter, HTTPException, Request

import gentrification_engine as ge

router = APIRouter(tags=["gentrificacion"])


@router.get("/api/zona/{colonia_id}/gentrificacion")
async def zona_gentrificacion(colonia_id: str, request: Request):
    """Índice 'zona subiendo' (0–100) de la colonia + sus componentes con fuente.
    Índice ESTIMADO honesto (es_estimado=True). Fail-open: si algo truena, responde
    un cuerpo válido con score=None en vez de romper el portal."""
    try:
        db = request.app.state.db
        return await ge.gentrification_score(db, colonia_id)
    except Exception as e:  # noqa: BLE001
        return {
            "colonia_id": colonia_id, "score": None, "nivel": "estable",
            "componentes": [], "es_estimado": True, "confianza": "muy_baja",
            "n_componentes": 0, "error": str(e)[:200],
        }


@router.post("/api/superadmin/gentrificacion/{colonia_id}/persist")
async def superadmin_persist_gentrificacion(colonia_id: str, request: Request):
    """Superadmin: computa y persiste el índice en colonia_valoracion.gentrification."""
    try:
        db = request.app.state.db
        return await ge.persist_score(db, colonia_id)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(e)[:200])


@router.post("/api/superadmin/gentrificacion/backfill")
async def superadmin_backfill_gentrificacion(request: Request, limit: int = 0):
    """Superadmin: backfill del índice para todas las colonias con al menos una señal.
    `limit`=0 → sin límite. Idempotente."""
    try:
        db = request.app.state.db
        return await ge.persist_all(db, limit=(limit or None))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(e)[:200])
