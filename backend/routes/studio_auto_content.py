"""W5.22 Z.2 Sub-C — Studio Auto-Content routes.

Prefijo: /api/studio/auto-content · T2+ via require_studio.

Endpoints:
    POST /queue/run           system only: dispara cron manualmente
    GET  /queue               lista sugerencias del user (filtros status · paginated 20)
    POST /:id/approve         aprueba sugerencia → genera carrusel
    POST /:id/reject          rechaza sugerencia
    GET  /stats               contador de sugerencias por status
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Request, Query
from pydantic import BaseModel

import studio_auto_content_cron as ac

log = logging.getLogger("dmx.routes_studio_auto_content")

router = APIRouter(prefix="/api/studio/auto-content", tags=["studio_auto_content"])


async def _require_user(request: Request):
    from routes.studio import require_studio
    return await require_studio(request)


def _db(request: Request):
    return request.app.state.db


def _is_internal(request: Request) -> bool:
    """Verifica que la llamada sea desde sistema o superadmin."""
    ip = request.client.host if request.client else ""
    return ip in ("127.0.0.1", "::1", "localhost")


# ─── Routes ───────────────────────────────────────────────────────────────────
@router.post("/queue/run")
async def run_queue(request: Request) -> Dict[str, Any]:
    """Dispara el cron manualmente. Acceso: sistema (IP local) o superadmin."""
    db = _db(request)
    # Best-effort auth: si hay usuario activo, verificar superadmin
    try:
        from server import get_current_user
        user = await get_current_user(request)
        if user and user.role != "superadmin" and not _is_internal(request):
            raise HTTPException(403, "Solo superadmin o sistema puede disparar el cron")
    except HTTPException:
        raise
    except Exception:
        if not _is_internal(request):
            raise HTTPException(403, "Acceso denegado")

    result = await ac.run_daily_batch(db)
    return {"ok": True, **result}


@router.get("/queue")
async def list_queue(
    request: Request,
    status: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    skip: int = Query(0, ge=0),
) -> Dict[str, Any]:
    user = await _require_user(request)
    db = _db(request)
    items = await ac.list_queue(db, user.user_id, status_filter=status, limit=limit, skip=skip)
    stats = await ac.queue_stats(db, user.user_id)
    return {"items": items, "total": len(items), "stats": stats}


@router.post("/{queue_id}/approve")
async def approve_item(queue_id: str, request: Request) -> Dict[str, Any]:
    user = await _require_user(request)
    db = _db(request)
    result = await ac.approve_queue_item(db, queue_id, user.user_id)
    if not result.get("ok"):
        raise HTTPException(404, result.get("error", "No se pudo aprobar"))
    return result


@router.post("/{queue_id}/reject")
async def reject_item(queue_id: str, request: Request) -> Dict[str, Any]:
    user = await _require_user(request)
    db = _db(request)
    ok = await ac.reject_queue_item(db, queue_id, user.user_id)
    if not ok:
        raise HTTPException(404, "Sugerencia no encontrada o ya procesada")
    return {"ok": True, "queue_id": queue_id}


@router.get("/stats")
async def get_stats(request: Request) -> Dict[str, Any]:
    user = await _require_user(request)
    db = _db(request)
    stats = await ac.queue_stats(db, user.user_id)
    return {"ok": True, "stats": stats}
