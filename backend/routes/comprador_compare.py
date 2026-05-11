"""Phase 4 Batch 29 · routes — Comparador Premium (buyer tier).

Endpoints (auth buyer requerido):
  POST /api/comprador/compare      → compare_entities buyer_tier='buyer'
  POST /api/comprador/compare/pdf  → PDF con secciones premium
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel, Field

log = logging.getLogger("dmx.routes_comprador_compare")

router = APIRouter(tags=["comprador-compare"])


def _db(request: Request):
    return request.app.state.db


async def _require_buyer(request: Request):
    from server import require_auth
    user = await require_auth(request)
    if user.role not in ("buyer", "superadmin"):
        raise HTTPException(status_code=403, detail="Acceso solo para compradores")
    return user


# ─── Pydantic models ─────────────────────────────────────────────────────────

class CompareBody(BaseModel):
    entity_type: str
    ids: List[str] = Field(min_length=1, max_length=3)


class ComparePdfBody(BaseModel):
    entity_type: str
    ids: List[str] = Field(min_length=1, max_length=3)


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/api/comprador/compare")
async def compare_premium(body: CompareBody, request: Request, user=Depends(_require_buyer)):
    db = _db(request)
    from services.colonia_comparator import compare_entities
    matrix = await compare_entities(db, body.entity_type, body.ids, buyer_tier="buyer")

    # log_activity
    try:
        from routes.dev_batch14 import log_activity
        await log_activity(
            db,
            actor_id=user.user_id,
            actor_type="buyer",
            action="comparator_premium",
            entity_id=",".join(body.ids[:3]),
            entity_type=body.entity_type,
            metadata={"ids": body.ids, "tier": "buyer"},
        )
    except Exception:
        pass

    return matrix


@router.post("/api/comprador/compare/pdf")
async def compare_premium_pdf(body: ComparePdfBody, request: Request, user=Depends(_require_buyer)):
    import io
    from fastapi.responses import StreamingResponse
    db = _db(request)
    from services.colonia_comparator import compare_entities, generate_comparison_pdf
    matrix = await compare_entities(db, body.entity_type, body.ids, buyer_tier="buyer")
    if "error" in matrix:
        raise HTTPException(400, matrix["error"])

    pdf_bytes = await generate_comparison_pdf(matrix, buyer_tier="buyer")

    try:
        from routes.dev_batch14 import log_activity
        await log_activity(
            db,
            actor_id=user.user_id,
            actor_type="buyer",
            action="comparator_premium_pdf",
            entity_id=",".join(body.ids[:3]),
            entity_type=body.entity_type,
        )
    except Exception:
        pass

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=comparacion_premium_dmx.pdf"},
    )
