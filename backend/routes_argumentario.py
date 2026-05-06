"""Phase 3 Batch 31 · routes — Argumentario AI RAG endpoints.

Endpoints:
  POST /api/asesor/argumentario/query    → consulta inline + Claude RAG
  GET  /api/asesor/argumentario/recent   → últimas consultas del asesor
  GET  /api/asesor/argumentario/kb       → lista KB filtrable por categoría
  POST /api/asesor/argumentario/seed     → reseed KB (solo admin)
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

log = logging.getLogger("dmx.routes_argumentario")

router = APIRouter(tags=["asesor-argumentario"])

ASESOR_ROLES = {"advisor", "asesor_admin", "developer_admin",
                "developer_director", "developer_member",
                "inmobiliaria_admin", "superadmin"}
ADMIN_ONLY = {"superadmin", "asesor_admin", "inmobiliaria_admin",
              "developer_admin", "developer_director"}


def _db(req: Request):
    return req.app.state.db


async def _auth_asesor(request: Request):
    from server import get_current_user
    u = await get_current_user(request)
    if not u:
        raise HTTPException(401, "No autenticado")
    if u.role not in ASESOR_ROLES:
        raise HTTPException(403, "Acceso solo para asesores y administradores")
    return u


class ArgumentarioQueryBody(BaseModel):
    question: str = Field(..., min_length=4, max_length=600)
    category: Optional[str] = Field(
        None, pattern="^(objeciones|cierres|comparaciones|producto)$",
    )
    top_k: int = Field(5, ge=1, le=10)


@router.post("/api/asesor/argumentario/query")
async def post_argumentario_query(
    body: ArgumentarioQueryBody,
    request: Request,
):
    user = await _auth_asesor(request)
    db = _db(request)

    from services.argumentario_rag import query_argumentario
    return await query_argumentario(
        db,
        asesor_id=user.user_id,
        question=body.question,
        category=body.category,
        top_k=body.top_k,
    )


@router.get("/api/asesor/argumentario/recent")
async def get_recent(request: Request, limit: int = Query(20, ge=1, le=100)):
    user = await _auth_asesor(request)
    db = _db(request)
    from services.argumentario_rag import get_recent_queries
    items = await get_recent_queries(db, asesor_id=user.user_id, limit=limit)
    return {"items": items, "total": len(items)}


@router.get("/api/asesor/argumentario/kb")
async def list_kb(
    request: Request,
    category: Optional[str] = Query(
        None, pattern="^(objeciones|cierres|comparaciones|producto)$",
    ),
    limit: int = Query(50, ge=1, le=200),
):
    await _auth_asesor(request)
    db = _db(request)

    q: Dict[str, Any] = {}
    if category:
        q["category"] = category

    docs: List[Dict[str, Any]] = await db.argumentario_knowledge.find(
        q, {"_id": 0, "embedding": 0},
    ).sort("category", 1).limit(limit).to_list(limit)

    return {"items": docs, "total": len(docs)}


@router.post("/api/asesor/argumentario/seed")
async def reseed_kb(request: Request):
    """Reseed completo (admin). Borra KB existente y regenera con embeddings."""
    user = await _auth_asesor(request)
    if user.role not in ADMIN_ONLY:
        raise HTTPException(403, "Solo administradores")
    db = _db(request)

    await db.argumentario_knowledge.delete_many({})
    from services.argumentario_seed import seed_kb_if_empty
    inserted = await seed_kb_if_empty(db)

    return {"reseeded": True, "inserted": inserted}
