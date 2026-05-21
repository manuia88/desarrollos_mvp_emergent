"""W5.x F2 Sub-F · RAG inspector endpoints (superadmin).

Prefix: /api/superadmin/rag · todos require_superadmin.
- GET  /stats        → counts por scope · total · last_reindex_at
- POST /query        → debug raw · {query, scope?, top_k?}
- POST /reindex      → trigger manual reindex_all (idempotente)
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

log = logging.getLogger("dmx.routes_rag_admin")

router = APIRouter(tags=["superadmin_rag"])
PREFIX = "/api/superadmin/rag"


def _db(request: Request):
    return request.app.state.db


async def _require_superadmin(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    if user.role != "superadmin":
        raise HTTPException(403, "Solo superadmin")
    return user


class RagQueryBody(BaseModel):
    query: str = Field(..., min_length=2, max_length=500)
    scope: Optional[str] = None
    top_k: int = Field(10, ge=1, le=30)
    scopes_in: Optional[list[str]] = None


_REINDEX_LOCK = asyncio.Lock()
_LAST_REINDEX_STATE: Dict[str, Any] = {"running": False, "last_result": None, "last_at": None}


@router.get(PREFIX + "/stats")
async def rag_stats(request: Request) -> Dict[str, Any]:
    """Counts por scope · total · last_reindex_at."""
    await _require_superadmin(request)
    db = _db(request)
    try:
        total = await db.dmx_embeddings.count_documents({})
        scopes: Dict[str, int] = {}
        try:
            pipeline = [
                {"$group": {"_id": "$scope", "n": {"$sum": 1}}},
                {"$sort": {"n": -1}},
            ]
            cur = db.dmx_embeddings.aggregate(pipeline)
            async for row in cur:
                scopes[row.get("_id") or "unknown"] = int(row.get("n") or 0)
        except Exception as exc:
            log.warning(f"[rag stats] aggregate failed: {exc}")
        last_doc = await db.dmx_embeddings.find_one(
            {}, {"_id": 0, "created_at": 1}, sort=[("created_at", -1)]
        )
        return {
            "total_chunks": int(total),
            "scopes": scopes,
            "last_chunk_at": (last_doc or {}).get("created_at"),
            "last_reindex_at": _LAST_REINDEX_STATE.get("last_at"),
            "last_reindex_result": _LAST_REINDEX_STATE.get("last_result"),
            "reindex_running": _LAST_REINDEX_STATE.get("running") or False,
        }
    except Exception as exc:
        log.warning(f"[rag stats] failed: {exc}")
        raise HTTPException(500, f"stats failed: {str(exc)[:200]}")


@router.post(PREFIX + "/query")
async def rag_query(body: RagQueryBody, request: Request) -> Dict[str, Any]:
    """Debug query · retorna resultados raw del semantic_search."""
    await _require_superadmin(request)
    db = _db(request)
    try:
        from rag_engine import semantic_search
        kwargs: Dict[str, Any] = {"top_k": body.top_k}
        if body.scope:
            kwargs["scope"] = body.scope
        if body.scopes_in:
            kwargs["scopes_in"] = body.scopes_in
        res = await semantic_search(db, body.query, **kwargs)
        return res or {"ok": False, "results": []}
    except HTTPException:
        raise
    except Exception as exc:
        log.warning(f"[rag query] failed: {exc}")
        raise HTTPException(500, f"query failed: {str(exc)[:200]}")


@router.post(PREFIX + "/reindex")
async def rag_reindex(request: Request) -> Dict[str, Any]:
    """Trigger manual de reindex_all · single-flight (lock)."""
    await _require_superadmin(request)
    db = _db(request)
    if _LAST_REINDEX_STATE.get("running"):
        return {"ok": False, "running": True, "message": "Reindex ya en progreso"}
    if _REINDEX_LOCK.locked():
        return {"ok": False, "running": True, "message": "Lock activo · espera"}
    async with _REINDEX_LOCK:
        from datetime import datetime, timezone
        _LAST_REINDEX_STATE["running"] = True
        try:
            from rag_engine import reindex_all
            result = await reindex_all(db, incremental=True)
            _LAST_REINDEX_STATE["last_result"] = result
            _LAST_REINDEX_STATE["last_at"] = datetime.now(timezone.utc).isoformat()
            return {"ok": True, **(result or {})}
        except Exception as exc:
            log.warning(f"[rag reindex] failed: {exc}")
            _LAST_REINDEX_STATE["last_result"] = {"error": str(exc)[:240]}
            _LAST_REINDEX_STATE["last_at"] = datetime.now(timezone.utc).isoformat()
            raise HTTPException(500, f"reindex failed: {str(exc)[:200]}")
        finally:
            _LAST_REINDEX_STATE["running"] = False
