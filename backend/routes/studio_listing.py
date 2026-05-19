"""W5.22 Z.1 Sub-B — Studio Listing Import routes.

Prefijo: /api/studio · todas T2+ via require_studio.

Endpoints:
    POST   /listing-import         importa desde URL
    GET    /listing-imports        lista paginada del user
    GET    /listing-import/{id}    detalle
    DELETE /listing-import/{id}    borra
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field, HttpUrl

import studio_listing_importer as importer

log = logging.getLogger("dmx.routes_studio_listing")

router = APIRouter(prefix="/api/studio", tags=["studio_listing"])


async def _require_user(request: Request):
    from routes.studio import require_studio
    return await require_studio(request)


def _db(request: Request):
    return request.app.state.db


class ListingImportBody(BaseModel):
    source_url: HttpUrl
    target_project_id: Optional[str] = Field(None, max_length=80)


@router.post("/listing-import")
async def create_import(body: ListingImportBody, request: Request) -> Dict[str, Any]:
    user = await _require_user(request)
    db = _db(request)
    if not importer.check_rate_limit(user.user_id):
        raise HTTPException(
            429, "Limite de 10 imports/hora alcanzado. Intenta en 1 hora.",
        )
    try:
        doc = await importer.import_listing(
            db,
            user_id=user.user_id,
            tenant_id=user.tenant_id or "default",
            source_url=str(body.source_url),
            target_project_id=body.target_project_id,
        )
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    try:
        from routes.dev_batch14 import log_activity
        await log_activity(db, user.user_id, user.role, "studio_listing_import",
                           doc.get("id"), "listing_import",
                           {"portal": doc.get("source_portal"), "status": doc.get("status")})
    except Exception:
        pass
    return {"ok": True, "import": doc}


@router.get("/listing-imports")
async def list_imports(request: Request,
                       limit: int = Query(20, ge=1, le=100),
                       skip: int = Query(0, ge=0)) -> Dict[str, Any]:
    user = await _require_user(request)
    db = _db(request)
    return await importer.list_user_imports(db, user.user_id, limit=limit, skip=skip)


@router.get("/listing-import/{import_id}")
async def get_import_route(import_id: str, request: Request) -> Dict[str, Any]:
    user = await _require_user(request)
    db = _db(request)
    doc = await importer.get_import(db, import_id, user.user_id)
    if not doc:
        raise HTTPException(404, "Import no encontrado")
    return {"import": doc}


@router.delete("/listing-import/{import_id}")
async def delete_import_route(import_id: str, request: Request) -> Dict[str, Any]:
    user = await _require_user(request)
    db = _db(request)
    target = await db.listing_imports.find_one({"id": import_id}, {"_id": 0, "user_id": 1})
    if not target:
        raise HTTPException(404, "Import no encontrado")
    if target.get("user_id") != user.user_id and user.role != "superadmin":
        raise HTTPException(403, "Solo el dueno puede borrar este import")
    ok = await importer.delete_import(
        db, import_id, target["user_id"] if user.role == "superadmin" else user.user_id,
    )
    if not ok:
        raise HTTPException(404, "Import no encontrado")
    try:
        from routes.dev_batch14 import log_activity
        await log_activity(db, user.user_id, user.role, "studio_listing_import_delete",
                           import_id, "listing_import", {})
    except Exception:
        pass
    return {"ok": True, "deleted": import_id}
