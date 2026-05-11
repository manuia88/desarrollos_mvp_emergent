"""W4.17 — Notifications API Routes.

GET  /api/notifications
GET  /api/notifications/unread-count
POST /api/notifications/{id}/mark-read
POST /api/notifications/mark-all-read
GET  /api/notifications/preferences
PUT  /api/notifications/preferences
"""
from __future__ import annotations

from typing import Any, Dict, Optional
from fastapi import APIRouter, HTTPException, Request, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel

import notifications_engine as eng

router = APIRouter()


def _db(request: Request):
    return request.app.state.db


async def _current_user(request: Request) -> Dict[str, Any]:
    try:
        from server import get_current_user
        u = await get_current_user(request)
        if u:
            return u.model_dump() if hasattr(u, "model_dump") else dict(u)
    except Exception:
        pass
    raise HTTPException(401, "auth_required")


# ─── GET /api/notifications ───────────────────────────────────────────────────

@router.get("/api/notifications")
async def list_notifications(
    request: Request,
    unread: bool = Query(False),
    limit: int = Query(20, ge=1, le=100),
    type: Optional[str] = Query(None),
):
    u = await _current_user(request)
    db = _db(request)
    notifs = await eng.get_notifications(
        db, u["user_id"], unread_only=unread, limit=limit, type_filter=type
    )
    return JSONResponse({"ok": True, "notifications": notifs, "count": len(notifs)})


# ─── GET /api/notifications/unread-count ──────────────────────────────────────

@router.get("/api/notifications/unread-count")
async def get_unread_count(request: Request):
    u = await _current_user(request)
    db = _db(request)
    count = await eng.unread_count(db, u["user_id"])
    return JSONResponse({"ok": True, "count": count})


# ─── POST /api/notifications/{id}/mark-read ───────────────────────────────────

@router.post("/api/notifications/{notif_id}/mark-read")
async def mark_read(notif_id: str, request: Request):
    u = await _current_user(request)
    db = _db(request)
    ok = await eng.mark_read(db, notif_id, u["user_id"])
    if not ok:
        raise HTTPException(404, "notificacion_no_encontrada")
    return JSONResponse({"ok": True, "notif_id": notif_id})


# ─── POST /api/notifications/mark-all-read ────────────────────────────────────

class MarkAllReadBody(BaseModel):
    type: Optional[str] = None


@router.post("/api/notifications/mark-all-read")
async def mark_all_read(request: Request, body: MarkAllReadBody = MarkAllReadBody()):
    u = await _current_user(request)
    db = _db(request)
    count = await eng.mark_all_read(db, u["user_id"], type=body.type)
    return JSONResponse({"ok": True, "marked_count": count})


# ─── GET /api/notifications/preferences ──────────────────────────────────────

@router.get("/api/notifications/preferences")
async def get_preferences(request: Request):
    u = await _current_user(request)
    db = _db(request)
    prefs = await eng.get_preferences(db, u["user_id"])
    prefs.pop("_id", None)
    return JSONResponse({"ok": True, "preferences": prefs})


# ─── PUT /api/notifications/preferences ──────────────────────────────────────

class PreferencesBody(BaseModel):
    categories: Optional[Dict[str, Any]] = None
    quiet_hours: Optional[Dict[str, Any]] = None
    digest_frequency: Optional[str] = None


@router.put("/api/notifications/preferences")
async def update_preferences(body: PreferencesBody, request: Request):
    u = await _current_user(request)
    db = _db(request)
    payload: Dict[str, Any] = {}
    if body.categories is not None:
        payload["categories"] = body.categories
    if body.quiet_hours is not None:
        payload["quiet_hours"] = body.quiet_hours
    if body.digest_frequency is not None:
        valid = ("instant", "hourly", "4h", "daily")
        if body.digest_frequency not in valid:
            raise HTTPException(422, f"digest_frequency debe ser uno de {valid}")
        payload["digest_frequency"] = body.digest_frequency
    await eng.update_preferences(db, u["user_id"], payload)
    return JSONResponse({"ok": True, "message": "Preferencias actualizadas"})
