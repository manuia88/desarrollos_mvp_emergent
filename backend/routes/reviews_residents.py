"""W6.MOV.3 · Reviews Residentes routes.

Endpoints:
  GET  /api/reviews/zone/{zone_id}                          → reviews + sentiment (público T0)
  GET  /api/reviews/development/{dev_id}                    → reviews + sentiment (público T0)
  GET  /api/reviews/summary/{entity_type}/{entity_id}       → breakdown sentiment + top themes + quotes
  POST /api/superadmin/reviews/scrape/{entity_type}/{entity_id}   → force scrape (superadmin · audit)
  GET  /api/superadmin/reviews/stats                        → stats globales (superadmin)
  DELETE /api/superadmin/reviews/{entity_type}/{entity_id}  → delete entity reviews (superadmin · audit)
"""
from __future__ import annotations

import logging
from typing import Any, Dict

from fastapi import APIRouter, HTTPException, Request

from reviews_residents_engine import (
    aggregate_by_entity,
    delete_entity_reviews,
    get_stats,
    scrape_entity,
)
from permissions import require_superadmin

log = logging.getLogger("dmx.reviews_residents_routes")
router = APIRouter()


VALID_ENTITY_TYPES = ("zone", "development")


def _validate_entity_type(entity_type: str) -> None:
    if entity_type not in VALID_ENTITY_TYPES:
        raise HTTPException(400, f"entity_type inválido · usa {'|'.join(VALID_ENTITY_TYPES)}")


@router.get("/api/reviews/zone/{zone_id}")
async def get_zone_reviews(request: Request, zone_id: str):
    """Público T0. Sentiment breakdown + top quotes para zona."""
    db = request.app.state.db
    return await aggregate_by_entity(db, "zone", zone_id)


@router.get("/api/reviews/development/{dev_id}")
async def get_development_reviews(request: Request, dev_id: str):
    """Público T0. Sentiment breakdown + top quotes para desarrollo."""
    db = request.app.state.db
    return await aggregate_by_entity(db, "development", dev_id)


@router.get("/api/reviews/summary/{entity_type}/{entity_id}")
async def get_summary(request: Request, entity_type: str, entity_id: str):
    """Público T0. Summary genérico por entity_type."""
    _validate_entity_type(entity_type)
    db = request.app.state.db
    return await aggregate_by_entity(db, entity_type, entity_id)


@router.post("/api/superadmin/reviews/scrape/{entity_type}/{entity_id}")
async def force_scrape(request: Request, entity_type: str, entity_id: str):
    """Superadmin force scrape (ignora cache). Audita acción."""
    _validate_entity_type(entity_type)
    user = await require_superadmin(request)
    db = request.app.state.db
    result = await scrape_entity(db, entity_type, entity_id, force=True)

    try:
        import audit_immutable_engine
        actor = {"user_id": getattr(user, "user_id", "superadmin") if user else "superadmin", "role": "superadmin"}
        await audit_immutable_engine.log(
            db, actor, "reviews_residents.scrape", entity_type, entity_id,
            before=None, after={"sources": result.get("sources"), "is_stub": result.get("is_stub")},
        )
    except Exception as exc:
        log.warning(f"audit log skipped: {exc}")

    return {"ok": True, "result": result}


@router.get("/api/superadmin/reviews/stats")
async def stats(request: Request):
    """Superadmin stats globales."""
    await require_superadmin(request)
    db = request.app.state.db
    return await get_stats(db)


@router.delete("/api/superadmin/reviews/{entity_type}/{entity_id}")
async def delete_reviews(request: Request, entity_type: str, entity_id: str):
    """Superadmin delete reviews + cache para entidad. Audita."""
    _validate_entity_type(entity_type)
    user = await require_superadmin(request)
    db = request.app.state.db
    result = await delete_entity_reviews(db, entity_type, entity_id)

    try:
        import audit_immutable_engine
        actor = {"user_id": getattr(user, "user_id", "superadmin") if user else "superadmin", "role": "superadmin"}
        await audit_immutable_engine.log(
            db, actor, "reviews_residents.delete", entity_type, entity_id,
            before=None, after=result,
        )
    except Exception as exc:
        log.warning(f"audit log skipped: {exc}")

    return {"ok": True, "result": result}
