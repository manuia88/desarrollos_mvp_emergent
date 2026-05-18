"""W4.9 — Brochure API Routes.

GET    /api/brochures/variants
POST   /api/brochures/generate
POST   /api/brochures/upload-custom
GET    /api/brochures/list
GET    /api/brochures/{brochure_id}
GET    /api/brochures/files/{brochure_id}/pdf
GET    /api/brochures/files/{brochure_id}/social/{fmt}
DELETE /api/brochures/{brochure_id}
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Form, Query
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel, Field

import brochure_engine as engine
from projects_unified import get_project_by_slug

log = logging.getLogger("dmx.routes_brochure")
router = APIRouter()

ALLOWED_ROLES = {"superadmin", "developer", "developer_admin", "advisor", "asesor_admin", "dev_admin"}


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


def _ensure_can_generate(user: Dict[str, Any]) -> None:
    role = user.get("role")
    if role not in ALLOWED_ROLES:
        raise HTTPException(403, "role_not_allowed")


# ─── GET /api/brochures/variants ─────────────────────────────────────────────

@router.get("/api/brochures/variants")
async def get_variants(request: Request):
    """Lista las 4 variantes de branding (público para preview)."""
    variants = engine.list_branding_variants()
    return JSONResponse({"ok": True, "variants": list(variants.values())})


# ─── POST /api/brochures/generate ────────────────────────────────────────────

class GenerateRequest(BaseModel):
    project_id: str = Field(..., min_length=1)
    variant: str = Field("dmx_neutral")
    overrides: Optional[Dict[str, Any]] = None


@router.post("/api/brochures/generate")
async def generate(request: Request, body: GenerateRequest):
    user = await _current_user(request)
    _ensure_can_generate(user)
    db = _db(request)

    project = await get_project_by_slug(db, body.project_id)
    if not project:
        raise HTTPException(404, "project_not_found")

    try:
        doc = await engine.generate_brochure(db, user, project, body.variant, body.overrides)
    except RuntimeError as exc:
        raise HTTPException(500, str(exc))
    except Exception as exc:
        log.exception("[routes] generate failed")
        raise HTTPException(500, f"generate_failed: {exc}")

    # Audit
    try:
        from server import audit
        await audit(user["user_id"], "brochure.generate", f"project:{body.project_id}",
                    {"brochure_id": doc["brochure_id"], "variant": body.variant})
    except Exception:
        pass

    return JSONResponse({"ok": True, "brochure": doc})


# ─── POST /api/brochures/upload-custom ───────────────────────────────────────

@router.post("/api/brochures/upload-custom")
async def upload_custom(
    request: Request,
    project_id: str = Form(...),
    file: UploadFile = File(...),
):
    user = await _current_user(request)
    _ensure_can_generate(user)
    db = _db(request)

    project = await get_project_by_slug(db, project_id)
    if not project:
        raise HTTPException(404, "project_not_found")

    content = await file.read()
    try:
        doc = await engine.register_custom_upload(db, user, project, content, file.filename or "custom.pdf")
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except Exception as exc:
        log.exception("[routes] upload failed")
        raise HTTPException(500, f"upload_failed: {exc}")

    try:
        from server import audit
        await audit(user["user_id"], "brochure.upload_custom", f"project:{project_id}",
                    {"brochure_id": doc["brochure_id"], "filename": file.filename})
    except Exception:
        pass

    return JSONResponse({"ok": True, "brochure": doc})


# ─── GET /api/brochures/list ─────────────────────────────────────────────────

@router.get("/api/brochures/list")
async def list_user_brochures(
    request: Request,
    project_id: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    user = await _current_user(request)
    db = _db(request)
    tenant_id = user.get("tenant_id") or user.get("dev_org_id") or "dmx"
    items = await engine.list_brochures(db, tenant_id, project_id=project_id, limit=limit)
    return JSONResponse({"ok": True, "brochures": items, "count": len(items)})


# ─── GET /api/brochures/{brochure_id} ────────────────────────────────────────

@router.get("/api/brochures/{brochure_id}")
async def get_one(request: Request, brochure_id: str):
    user = await _current_user(request)
    db = _db(request)
    doc = await engine.get_brochure(db, brochure_id)
    if not doc:
        raise HTTPException(404, "brochure_not_found")
    tenant = user.get("tenant_id") or user.get("dev_org_id") or "dmx"
    if doc.get("tenant_id") and doc["tenant_id"] != tenant and user.get("role") != "superadmin":
        raise HTTPException(403, "cross_tenant_forbidden")
    return JSONResponse({"ok": True, "brochure": doc})


# ─── GET /api/brochures/files/{brochure_id}/pdf ──────────────────────────────

@router.get("/api/brochures/files/{brochure_id}/pdf")
async def download_pdf(request: Request, brochure_id: str):
    db = _db(request)
    doc = await engine.get_brochure(db, brochure_id)
    if not doc:
        raise HTTPException(404, "brochure_not_found")
    path = engine.resolve_pdf_path(brochure_id)
    if not path:
        raise HTTPException(404, "file_not_found")
    await engine.increment_download(db, brochure_id)
    filename = f"{(doc.get('project_name') or 'brochure').replace(' ', '_')}_{brochure_id[:8]}.pdf"
    return FileResponse(str(path), media_type="application/pdf", filename=filename)


# ─── GET /api/brochures/files/{brochure_id}/social/{fmt} ─────────────────────

@router.get("/api/brochures/files/{brochure_id}/social/{fmt}")
async def download_social(request: Request, brochure_id: str, fmt: str):
    db = _db(request)
    doc = await engine.get_brochure(db, brochure_id)
    if not doc:
        raise HTTPException(404, "brochure_not_found")
    path = engine.resolve_social_path(brochure_id, fmt)
    if not path:
        raise HTTPException(404, "variant_not_found")
    filename = f"{(doc.get('project_name') or 'social').replace(' ', '_')}_{fmt}.png"
    return FileResponse(str(path), media_type="image/png", filename=filename)


# ─── POST /api/brochures/regenerate/{brochure_id} (F0.2·Sub-C) ──────────────

class RegenerateRequest(BaseModel):
    variant: Optional[str] = None
    overrides: Optional[Dict[str, Any]] = None


@router.post("/api/brochures/regenerate/{brochure_id}")
async def regenerate(request: Request, brochure_id: str, body: Optional[RegenerateRequest] = None):
    user = await _current_user(request)
    _ensure_can_generate(user)
    db = _db(request)
    body = body or RegenerateRequest()
    try:
        doc = await engine.regenerate_brochure(
            db, user, brochure_id,
            new_variant_id=body.variant, overrides=body.overrides,
        )
    except PermissionError as exc:
        raise HTTPException(403, str(exc))
    except ValueError as exc:
        raise HTTPException(400 if "not_found" not in str(exc) else 404, str(exc))
    except RuntimeError as exc:
        raise HTTPException(500, str(exc))

    try:
        from server import audit
        await audit(user["user_id"], "brochure.regenerate", f"brochure:{brochure_id}",
                    {"variant": doc.get("branding_variant")})
    except Exception:
        pass
    return JSONResponse({"ok": True, "brochure": doc})


# ─── DELETE /api/brochures/{brochure_id} ─────────────────────────────────────

@router.delete("/api/brochures/{brochure_id}")
async def delete_brochure(request: Request, brochure_id: str):
    user = await _current_user(request)
    _ensure_can_generate(user)
    db = _db(request)
    doc = await engine.get_brochure(db, brochure_id)
    if not doc:
        raise HTTPException(404, "brochure_not_found")
    tenant = user.get("tenant_id") or user.get("dev_org_id") or "dmx"
    if doc.get("tenant_id") and doc["tenant_id"] != tenant and user.get("role") != "superadmin":
        raise HTTPException(403, "cross_tenant_forbidden")

    # Remove files
    try:
        p = engine.resolve_pdf_path(brochure_id)
        if p and p.exists():
            p.unlink()
        for fmt in ("fb_feed", "ig_feed", "ig_stories", "wa_status"):
            sp = engine.resolve_social_path(brochure_id, fmt)
            if sp and sp.exists():
                sp.unlink()
    except Exception:
        pass

    try:
        await db.brochures.delete_one({"brochure_id": brochure_id})
    except Exception:
        pass

    return JSONResponse({"ok": True, "deleted": brochure_id})

# W5.FF4 register_feature marker · NO duplicate
from feature_registry import register_feature as _w5ff4_register_feature
_w5ff4_register_feature("brochure_generator", plan_tier="pro",        monthly_price_mxn=99,  category="marketing",   name="Brochure Generator")
