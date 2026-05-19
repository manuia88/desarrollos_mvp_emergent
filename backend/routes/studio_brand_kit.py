"""W5.22 Z.1 Sub-A — Studio Brand Kit routes.

Prefijo: /api/studio/brand-kit · todas T2+ via require_studio (advisor,
asesor_admin, developer_admin, superadmin).

Endpoints:
    POST /                         upsert por (user_id, variant_key)
    GET  /                         lista variants del user (seed si vacio)
    GET  /{id}                     detalle
    DELETE /{id}                   borra (solo dueno)
    POST /{id}/activate            set is_active=true · resto false
    POST /upload-logo              presigned PUT R2 (1h · max 5MB)
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

import studio_brand_kit_engine as bk_engine

log = logging.getLogger("dmx.routes_studio_brand_kit")

router = APIRouter(prefix="/api/studio/brand-kit", tags=["studio_brand_kit"])


async def _require_user(request: Request):
    from routes.studio import require_studio
    return await require_studio(request)


def _db(request: Request):
    return request.app.state.db


# ─── Schemas ──────────────────────────────────────────────────────────────────
class BrandKitUpsertBody(BaseModel):
    variant_key: str = Field(..., pattern="^(dev|asesor|inmobiliaria|dmx)$")
    logo_r2_key: Optional[str] = None
    logo_url: Optional[str] = None
    color_primary: Optional[str] = Field(None, max_length=12)
    color_secondary: Optional[str] = Field(None, max_length=12)
    color_accent: Optional[str] = Field(None, max_length=12)
    font_heading: Optional[str] = None
    font_body: Optional[str] = None
    disclaimer_text: Optional[str] = Field(None, max_length=600)
    cta_default: Optional[str] = Field(None, max_length=80)
    footer_legal: Optional[str] = Field(None, max_length=200)
    is_active: Optional[bool] = False


class LogoUploadBody(BaseModel):
    file_ext: str = Field("png", pattern="^(png|jpg|jpeg|svg)$")
    mime: str = Field(..., max_length=80)
    size_bytes: int = Field(..., gt=0)


# ─── Routes ───────────────────────────────────────────────────────────────────
@router.get("")
async def list_kits(request: Request) -> Dict[str, Any]:
    user = await _require_user(request)
    db = _db(request)
    items = await bk_engine.list_user_kits(db, user.user_id)
    if not items:
        items = await bk_engine.seed_default_variants(db, user.tenant_id or "default", user.user_id)
    return {"items": items, "total": len(items)}


@router.post("")
async def upsert_kit(body: BrandKitUpsertBody, request: Request) -> Dict[str, Any]:
    user = await _require_user(request)
    db = _db(request)
    try:
        doc = await bk_engine.upsert_kit(
            db,
            tenant_id=user.tenant_id or "default",
            user_id=user.user_id,
            variant_key=body.variant_key,
            payload=body.model_dump(exclude_unset=True),
        )
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    try:
        from routes.dev_batch14 import log_activity
        await log_activity(db, user.user_id, user.role, "brand_kit_upsert",
                           doc.get("id"), "brand_kit",
                           {"variant": body.variant_key})
    except Exception:
        pass
    return {"ok": True, "kit": doc}


@router.get("/{kit_id}")
async def get_kit_route(kit_id: str, request: Request) -> Dict[str, Any]:
    user = await _require_user(request)
    db = _db(request)
    kit = await bk_engine.get_kit(db, kit_id, user.user_id)
    if not kit:
        raise HTTPException(404, "Brand kit no encontrado")
    return {"kit": kit}


@router.delete("/{kit_id}")
async def delete_kit_route(kit_id: str, request: Request) -> Dict[str, Any]:
    user = await _require_user(request)
    db = _db(request)
    # Cross-user 403 explicito
    target = await db.brand_kits.find_one({"id": kit_id}, {"_id": 0, "user_id": 1})
    if not target:
        raise HTTPException(404, "Brand kit no encontrado")
    if target.get("user_id") != user.user_id and user.role != "superadmin":
        raise HTTPException(403, "Solo el dueno puede borrar este brand kit")
    ok = await bk_engine.delete_kit(db, kit_id, user.user_id if user.role != "superadmin" else target["user_id"])
    if not ok:
        raise HTTPException(404, "Brand kit no encontrado")
    try:
        from routes.dev_batch14 import log_activity
        await log_activity(db, user.user_id, user.role, "brand_kit_delete",
                           kit_id, "brand_kit", {})
    except Exception:
        pass
    return {"ok": True, "deleted": kit_id}


@router.post("/{kit_id}/activate")
async def activate_kit_route(kit_id: str, request: Request) -> Dict[str, Any]:
    user = await _require_user(request)
    db = _db(request)
    kit = await bk_engine.activate_kit(db, kit_id, user.user_id)
    if not kit:
        raise HTTPException(404, "Brand kit no encontrado")
    try:
        from routes.dev_batch14 import log_activity
        await log_activity(db, user.user_id, user.role, "brand_kit_activate",
                           kit_id, "brand_kit", {"variant": kit.get("variant_key")})
    except Exception:
        pass
    return {"ok": True, "kit": kit}


@router.post("/upload-logo")
async def upload_logo(body: LogoUploadBody, request: Request) -> Dict[str, Any]:
    user = await _require_user(request)
    err = bk_engine.validate_logo_upload(body.mime, body.size_bytes)
    if err:
        raise HTTPException(422, err)
    pre = bk_engine.issue_logo_upload(user.user_id, body.file_ext)
    return {"ok": True, "upload": pre}
