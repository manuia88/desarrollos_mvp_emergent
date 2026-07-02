"""W4.4B — Phase Y.1B · Director Memory REST endpoints.

Prefijo: /api/director/memory/*  +  /api/superadmin/director/memory/*
Todos: superadmin-only (DirectorAgent llama internamente sin endpoint).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from director_memory_engine import (
    DirectorMemoryEngine,
)

log = logging.getLogger("dmx.routes_director_memory")

router = APIRouter(prefix="/api/director/memory", tags=["director-memory"])
sa_router = APIRouter(prefix="/api/superadmin/director/memory", tags=["director-memory-admin"])


async def _require_superadmin(request: Request):
    from permissions import require_superadmin
    return await require_superadmin(request)


# ─── Pydantic ─────────────────────────────────────────────────────────────────
class RetrieveIn(BaseModel):
    query: str
    top_k: int = 5
    org_id: str
    source_types: Optional[List[str]] = None
    recency_weight: float = 0.3


# ─── Endpoints ────────────────────────────────────────────────────────────────
@router.post("/ingest/diagnostic/{diagnostic_id}", status_code=201)
async def ingest_diagnostic(diagnostic_id: str, request: Request, org_id: str):
    """Trigger manual ingest de un diagnostic report (superadmin)."""
    await _require_superadmin(request)
    db = request.app.state.db
    engine = DirectorMemoryEngine(db, org_id)
    mid = await engine.ingest_diagnostic(diagnostic_id)
    if not mid:
        raise HTTPException(404, f"Diagnostic report '{diagnostic_id}' no encontrado en org '{org_id}'")
    return JSONResponse({"memory_id": mid, "diagnostic_id": diagnostic_id}, status_code=201)


@router.post("/ingest/behavioral/{session_id}", status_code=201)
async def ingest_behavioral(session_id: str, request: Request, org_id: str):
    """Trigger manual ingest de sesión behavioral (superadmin)."""
    await _require_superadmin(request)
    db = request.app.state.db
    engine = DirectorMemoryEngine(db, org_id)
    mid = await engine.ingest_behavioral_session(session_id)
    if not mid:
        raise HTTPException(422, f"Sesión '{session_id}' tiene <5 eventos o ya fue indexada")
    return JSONResponse({"memory_id": mid, "session_id": session_id}, status_code=201)


@router.post("/retrieve")
async def debug_retrieve(body: RetrieveIn, request: Request):
    """Debug retrieval (superadmin). Retorna hits con scores."""
    await _require_superadmin(request)
    db = request.app.state.db

    if body.top_k > 20:
        raise HTTPException(422, "top_k máximo es 20")

    engine = DirectorMemoryEngine(db, body.org_id)
    hits = await engine.retrieve(
        query_text=body.query,
        top_k=body.top_k,
        source_types=body.source_types,
        recency_weight=body.recency_weight,
    )
    return JSONResponse({"hits": hits, "count": len(hits), "org_id": body.org_id, "query": body.query})


@router.delete("/{memory_id}")
async def delete_memory(memory_id: str, request: Request, org_id: Optional[str] = None):
    """DSR-compliant delete de una entrada de memoria (superadmin)."""
    await _require_superadmin(request)
    db = request.app.state.db

    q: Dict[str, Any] = {"_id": memory_id}
    if org_id:
        q["org_id"] = org_id  # extra safety

    res = await db.director_memory_index.delete_one(q)
    if res.deleted_count == 0:
        raise HTTPException(404, f"Entrada '{memory_id}' no encontrada")
    return JSONResponse({"ok": True, "deleted": memory_id})


@sa_router.get("/stats")
async def memory_stats(
    request: Request,
    org_id: Optional[str] = None,
    days: int = 30,
):
    """Estadísticas de memoria: counts por source_type + top accessed entries (superadmin)."""
    await _require_superadmin(request)
    db = request.app.state.db
    since = datetime.now(timezone.utc) - timedelta(days=days)

    match: Dict[str, Any] = {"created_at": {"$gte": since}}
    if org_id:
        match["org_id"] = org_id

    # Counts per source_type
    pipeline = [
        {"$match": match},
        {"$group": {"_id": "$source_type", "count": {"$sum": 1}, "total_accesses": {"$sum": "$access_count"}}},
        {"$sort": {"count": -1}},
    ]
    by_type_raw = await db.director_memory_index.aggregate(pipeline).to_list(length=20)
    by_type = [{"source_type": t["_id"], "count": t["count"], "total_accesses": t["total_accesses"]} for t in by_type_raw]

    # Top 5 most accessed
    top_accessed = await db.director_memory_index.find(
        match,
        {"_id": 1, "source_type": 1, "content_summary": 1, "access_count": 1, "last_accessed_at": 1},
    ).sort("access_count", -1).limit(5).to_list(length=5)

    for e in top_accessed:
        e["memory_id"] = str(e.pop("_id"))
        la = e.get("last_accessed_at")
        if isinstance(la, datetime):
            e["last_accessed_at"] = la.isoformat()

    total = sum(t["count"] for t in by_type)
    return JSONResponse({
        "days": days,
        "org_id": org_id,
        "total_entries": total,
        "by_source_type": by_type,
        "top_accessed": top_accessed,
    })
