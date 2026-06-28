"""Superadmin · VISIBILIDAD TOTAL DE GRANULARIDAD.

Hace VISIBLE toda la granularidad de los motores (scores + features) en un solo lugar — lo que antes estaba fragmentado
en colecciones sueltas o era efímero. Dos vistas:
  GET /coverage            — el MAPA: qué familias de scores existen, cuáles fluyen, cuáles están apagadas o son efímeras.
  GET /entity/{tipo}/{id}  — la FICHA: todos los scores/features de UNA entidad (zona/desarrollo/unidad/lead/asesor/…).
"""
from fastapi import APIRouter, Request

router = APIRouter(prefix="/api/superadmin/granularity", tags=["superadmin_granularity"])


@router.get("/coverage")
async def granularity_coverage(request: Request):
    from permissions import require_superadmin
    await require_superadmin(request)
    from granularity_registry import coverage
    return await coverage(request.app.state.db)


@router.get("/entity/{entity_type}/{entity_id}")
async def granularity_entity(entity_type: str, entity_id: str, request: Request):
    from permissions import require_superadmin
    await require_superadmin(request)
    from granularity_registry import inspect_entity
    return await inspect_entity(request.app.state.db, entity_type, entity_id)


@router.get("/stub-diagnosis")
async def granularity_stub_diagnosis(request: Request):
    """Mapa de 'qué falta para des-stubear': por receta IE stub, la fuente que necesita y su estatus accionable."""
    from permissions import require_superadmin
    await require_superadmin(request)
    from granularity_registry import stub_diagnosis
    return await stub_diagnosis(request.app.state.db)


@router.post("/backfill")
async def granularity_backfill(request: Request, family: str = "default"):
    """ENCENDER familias apagadas: corre el cómputo+persistencia para las entidades existentes. family ∈
    {default, all, buyer_scores, asesor_trust_scores, lead_match_scores, avm_predictions, score_snapshots}."""
    from permissions import require_superadmin
    await require_superadmin(request)
    from granularity_backfill import run_backfill
    fam = None if family == "default" else family
    return await run_backfill(request.app.state.db, fam)
