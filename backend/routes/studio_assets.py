"""W5.22 Z.1 Sub-C — Studio Assets + Mood Board routes.

Prefijo: /api/studio · todas T2+ via require_studio.

Endpoints:
    POST   /asset/initiate              presigned PUT R2 (5min · 200MB)
    POST   /asset/confirm               commit metadata post-upload
    GET    /studio-assets               lista paginada filtrable
    DELETE /asset/{id}                  soft delete

    POST   /mood-board                  crear
    GET    /mood-boards                 lista por project
    GET    /mood-board/{id}             detalle
    PUT    /mood-board/{id}             update (reorder asset_ids[])
    DELETE /mood-board/{id}             borra
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

import studio_asset_library as asset_lib

log = logging.getLogger("dmx.routes_studio_assets")

router = APIRouter(prefix="/api/studio", tags=["studio_assets"])


async def _require_user(request: Request):
    from routes.studio import require_studio
    return await require_studio(request)


def _db(request: Request):
    return request.app.state.db


# ─── Schemas ──────────────────────────────────────────────────────────────────
class AssetInitiateBody(BaseModel):
    asset_type: str = Field(..., pattern="^(photo|video|pdf|3dgs_scan)$")
    filename: str = Field(..., min_length=1, max_length=200)
    mime: str = Field(..., max_length=80)
    size_bytes: int = Field(..., gt=0)


class AssetConfirmBody(BaseModel):
    r2_key: str = Field(..., min_length=4)
    r2_url: Optional[str] = None
    asset_type: str = Field(..., pattern="^(photo|video|pdf|3dgs_scan)$")
    filename: str = Field(..., min_length=1, max_length=200)
    size_bytes: int = Field(..., gt=0)
    mime: str = Field(..., max_length=80)
    project_id: Optional[str] = Field(None, max_length=80)
    width: Optional[int] = None
    height: Optional[int] = None
    duration_s: Optional[float] = None
    tags: Optional[List[str]] = None


class MoodBoardCreateBody(BaseModel):
    project_id: str = Field(..., max_length=80)
    name: str = Field(..., min_length=1, max_length=120)
    description: Optional[str] = Field("", max_length=600)
    asset_ids: Optional[List[str]] = None
    color_palette: Optional[List[str]] = None


class MoodBoardUpdateBody(BaseModel):
    name: Optional[str] = Field(None, max_length=120)
    description: Optional[str] = Field(None, max_length=600)
    asset_ids: Optional[List[str]] = None
    color_palette: Optional[List[str]] = None


# ─── Asset endpoints ──────────────────────────────────────────────────────────
@router.post("/asset/initiate")
async def asset_initiate(body: AssetInitiateBody, request: Request) -> Dict[str, Any]:
    user = await _require_user(request)
    try:
        pre = asset_lib.issue_asset_upload(
            user_id=user.user_id,
            asset_type=body.asset_type,
            filename=body.filename,
            mime=body.mime,
            size_bytes=body.size_bytes,
        )
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    return {"ok": True, "upload": pre}


@router.post("/asset/confirm")
async def asset_confirm(body: AssetConfirmBody, request: Request) -> Dict[str, Any]:
    user = await _require_user(request)
    db = _db(request)
    try:
        doc = await asset_lib.confirm_asset(
            db,
            user_id=user.user_id,
            tenant_id=user.tenant_id or "default",
            project_id=body.project_id,
            asset_type=body.asset_type,
            r2_key=body.r2_key,
            r2_url=body.r2_url,
            filename=body.filename,
            size_bytes=body.size_bytes,
            mime=body.mime,
            width=body.width,
            height=body.height,
            duration_s=body.duration_s,
            tags=body.tags,
        )
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    try:
        from routes.dev_batch14 import log_activity
        await log_activity(db, user.user_id, user.role, "studio_asset_confirm",
                           doc["id"], "studio_asset",
                           {"type": body.asset_type, "size": body.size_bytes})
    except Exception:
        pass
    return {"ok": True, "asset": doc}


@router.get("/studio-assets")
async def list_assets_route(
    request: Request,
    project_id: Optional[str] = Query(None),
    asset_type: Optional[str] = Query(None, pattern="^(photo|video|pdf|3dgs_scan)$"),
    tags: Optional[str] = Query(None, description="csv tags"),
    search: Optional[str] = Query(None, max_length=80),
    limit: int = Query(50, ge=1, le=200),
    skip: int = Query(0, ge=0),
) -> Dict[str, Any]:
    user = await _require_user(request)
    db = _db(request)
    tag_list = [t.strip() for t in (tags or "").split(",") if t.strip()] or None
    return await asset_lib.list_assets(
        db,
        user_id=user.user_id,
        project_id=project_id,
        asset_type=asset_type,
        tags=tag_list,
        search=search,
        limit=limit, skip=skip,
    )


@router.delete("/asset/{asset_id}")
async def delete_asset_route(asset_id: str, request: Request) -> Dict[str, Any]:
    user = await _require_user(request)
    db = _db(request)
    target = await db.studio_assets.find_one({"id": asset_id}, {"_id": 0, "user_id": 1})
    if not target:
        raise HTTPException(404, "Asset no encontrado")
    if target.get("user_id") != user.user_id and user.role != "superadmin":
        raise HTTPException(403, "Solo el dueno puede borrar este asset")
    ok = await asset_lib.soft_delete_asset(
        db, asset_id,
        target["user_id"] if user.role == "superadmin" else user.user_id,
    )
    if not ok:
        raise HTTPException(404, "Asset no encontrado")
    try:
        from routes.dev_batch14 import log_activity
        await log_activity(db, user.user_id, user.role, "studio_asset_delete",
                           asset_id, "studio_asset", {})
    except Exception:
        pass
    return {"ok": True, "deleted": asset_id}


# ─── Mood Board endpoints ────────────────────────────────────────────────────
@router.post("/mood-board")
async def create_board_route(body: MoodBoardCreateBody, request: Request) -> Dict[str, Any]:
    user = await _require_user(request)
    db = _db(request)
    doc = await asset_lib.create_mood_board(
        db,
        tenant_id=user.tenant_id or "default",
        user_id=user.user_id,
        project_id=body.project_id,
        name=body.name,
        description=body.description or "",
        asset_ids=body.asset_ids,
        color_palette=body.color_palette,
    )
    try:
        from routes.dev_batch14 import log_activity
        await log_activity(db, user.user_id, user.role, "mood_board_create",
                           doc["id"], "mood_board",
                           {"project_id": body.project_id, "name": body.name})
    except Exception:
        pass
    return {"ok": True, "board": doc}


@router.get("/mood-boards")
async def list_boards_route(request: Request,
                            project_id: Optional[str] = Query(None)) -> Dict[str, Any]:
    user = await _require_user(request)
    db = _db(request)
    items = await asset_lib.list_mood_boards(db, user_id=user.user_id, project_id=project_id)
    return {"items": items, "total": len(items)}


@router.get("/mood-board/{board_id}")
async def get_board_route(board_id: str, request: Request) -> Dict[str, Any]:
    user = await _require_user(request)
    db = _db(request)
    doc = await asset_lib.get_mood_board(db, board_id, user.user_id)
    if not doc:
        raise HTTPException(404, "Mood board no encontrado")
    return {"board": doc}


@router.put("/mood-board/{board_id}")
async def update_board_route(board_id: str, body: MoodBoardUpdateBody,
                             request: Request) -> Dict[str, Any]:
    user = await _require_user(request)
    db = _db(request)
    doc = await asset_lib.update_mood_board(
        db,
        board_id=board_id,
        user_id=user.user_id,
        updates=body.model_dump(exclude_unset=True),
    )
    if not doc:
        raise HTTPException(404, "Mood board no encontrado")
    try:
        from routes.dev_batch14 import log_activity
        await log_activity(db, user.user_id, user.role, "mood_board_update",
                           board_id, "mood_board",
                           {"keys": list(body.model_dump(exclude_unset=True).keys())})
    except Exception:
        pass
    return {"ok": True, "board": doc}


@router.delete("/mood-board/{board_id}")
async def delete_board_route(board_id: str, request: Request) -> Dict[str, Any]:
    user = await _require_user(request)
    db = _db(request)
    target = await db.mood_boards.find_one({"id": board_id}, {"_id": 0, "user_id": 1})
    if not target:
        raise HTTPException(404, "Mood board no encontrado")
    if target.get("user_id") != user.user_id and user.role != "superadmin":
        raise HTTPException(403, "Solo el dueno puede borrar este mood board")
    ok = await asset_lib.delete_mood_board(
        db, board_id,
        target["user_id"] if user.role == "superadmin" else user.user_id,
    )
    if not ok:
        raise HTTPException(404, "Mood board no encontrado")
    try:
        from routes.dev_batch14 import log_activity
        await log_activity(db, user.user_id, user.role, "mood_board_delete",
                           board_id, "mood_board", {})
    except Exception:
        pass
    return {"ok": True, "deleted": board_id}
