"""W4.9.6 — Tour 3DGS API routes.

POST   /api/tour-3dgs/scans               create scan (luma_scan_id|video_url)
POST   /api/tour-3dgs/scans/upload        multipart .ply/.spz/.splat
GET    /api/tour-3dgs/scans               list (paginated, filtros)
GET    /api/tour-3dgs/scans/{scan_id}     read (public if ready)
PATCH  /api/tour-3dgs/scans/{id}/viewer-config
DELETE /api/tour-3dgs/scans/{scan_id}
GET    /api/tour-3dgs/settings/{dev_id}
PUT    /api/tour-3dgs/settings/{dev_id}
GET    /api/tour-3dgs/scans/{scan_id}/asset/{fmt}.{ext}   public asset stream

Rate limit: 5 creations/min/user (in-memory bucket).
"""
from __future__ import annotations

import logging
import time
from collections import defaultdict, deque
from typing import Any, Deque, Dict, Optional

from fastapi import APIRouter, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

import tour_3dgs_engine as engine
from ratelimit import client_ip as _dmx_canon_ip  # SEGURIDAD: IP anti-spoofing (pentest 2026-06-27)

log = logging.getLogger("dmx.routes_tour_3dgs")
router = APIRouter()

_RL_BUCKET: Dict[str, Deque[float]] = defaultdict(deque)
_RL_LIMIT = 5
_RL_WINDOW_S = 60


def _db(request: Request):
    return request.app.state.db


def _client_ip(request: Request) -> str:
    fwd =_dmx_canon_ip(request)
    return fwd or (request.client.host if request.client else "unknown")


def _rate_limit(user_id: str) -> None:
    now = time.time()
    b = _RL_BUCKET[user_id]
    while b and (now - b[0]) > _RL_WINDOW_S:
        b.popleft()
    if len(b) >= _RL_LIMIT:
        raise HTTPException(429, "rate_limit_exceeded")
    b.append(now)


async def _current_user(request: Request) -> Dict[str, Any]:
    try:
        from server import get_current_user
        u = await get_current_user(request)
        if u:
            return u.model_dump() if hasattr(u, "model_dump") else dict(u)
    except Exception:
        pass
    raise HTTPException(401, "auth_required")


async def _optional_user(request: Request) -> Optional[Dict[str, Any]]:
    try:
        from server import get_current_user
        u = await get_current_user(request)
        if u:
            return u.model_dump() if hasattr(u, "model_dump") else dict(u)
    except Exception:
        return None
    return None


# ─── Create ───────────────────────────────────────────────────────────────────

class CreateScanRequest(BaseModel):
    unit_id: str = Field(..., min_length=1)
    source_format: str = Field("luma")
    luma_scan_id: Optional[str] = None
    video_url: Optional[str] = None
    project_slug: Optional[str] = None
    dev_id: Optional[str] = None


@router.post("/api/tour-3dgs/scans")
async def create_scan(request: Request, body: CreateScanRequest):
    user = await _current_user(request)
    _rate_limit(user.get("user_id", "anon"))
    db = _db(request)
    try:
        doc = await engine.register_scan(
            db, user,
            unit_id=body.unit_id,
            source_format=body.source_format,
            luma_scan_id=body.luma_scan_id,
            video_url=body.video_url,
            project_slug=body.project_slug,
            dev_id=body.dev_id,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except PermissionError as exc:
        raise HTTPException(403, str(exc))
    except Exception as exc:
        log.exception("[routes] create_scan failed")
        raise HTTPException(500, f"create_failed: {exc}")
    return JSONResponse({"ok": True, "scan": doc})


# ─── Upload local file ────────────────────────────────────────────────────────

@router.post("/api/tour-3dgs/scans/upload")
async def upload_scan(
    request: Request,
    unit_id: str = Form(...),
    file: UploadFile = File(...),
    project_slug: Optional[str] = Form(None),
    dev_id: Optional[str] = Form(None),
):
    user = await _current_user(request)
    _rate_limit(user.get("user_id", "anon"))
    db = _db(request)
    content = await file.read()
    try:
        doc = await engine.upload_local_scan(
            db, user, unit_id, content, file.filename or "scene.splat",
            project_slug=project_slug, dev_id=dev_id,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except PermissionError as exc:
        raise HTTPException(403, str(exc))
    except Exception as exc:
        log.exception("[routes] upload failed")
        raise HTTPException(500, f"upload_failed: {exc}")
    return JSONResponse({"ok": True, "scan": doc})


# ─── List ─────────────────────────────────────────────────────────────────────

@router.get("/api/tour-3dgs/scans")
async def list_scans_route(
    request: Request,
    unit_id: Optional[str] = Query(None),
    dev_id: Optional[str] = Query(None),
    project_slug: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
):
    db = _db(request)
    user = await _optional_user(request)
    # Ownership filtering: non-superadmin sees own dev + public ready scans
    if user and user.get("role") != "superadmin":
        if not status and dev_id and (user.get("dev_org_id") or user.get("tenant_id")) != dev_id:
            status = "ready"  # cross-tenant: force public ready filter
    result = await engine.list_scans(
        db, unit_id=unit_id, dev_id=dev_id, project_slug=project_slug,
        status=status, page=page, limit=limit,
    )
    return JSONResponse({"ok": True, **result})


# ─── Get ──────────────────────────────────────────────────────────────────────

@router.get("/api/tour-3dgs/scans/{scan_id}")
async def get_scan_route(request: Request, scan_id: str):
    db = _db(request)
    doc = await engine.get_scan(db, scan_id)
    if not doc:
        raise HTTPException(404, "scan_not_found")
    if doc.get("status") != "ready":
        user = await _optional_user(request)
        if not user:
            raise HTTPException(403, "not_ready_public")
    return JSONResponse({"ok": True, "scan": doc})


# ─── Update viewer config ─────────────────────────────────────────────────────

class ViewerConfigBody(BaseModel):
    config: Dict[str, Any]


@router.patch("/api/tour-3dgs/scans/{scan_id}/viewer-config")
async def patch_viewer_config(request: Request, scan_id: str, body: ViewerConfigBody):
    user = await _current_user(request)
    db = _db(request)
    try:
        doc = await engine.update_viewer_config(db, user, scan_id, body.config or {})
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    except PermissionError as exc:
        raise HTTPException(403, str(exc))
    return JSONResponse({"ok": True, "scan": doc})


# ─── Delete ───────────────────────────────────────────────────────────────────

@router.delete("/api/tour-3dgs/scans/{scan_id}", status_code=204)
async def delete_scan_route(request: Request, scan_id: str):
    user = await _current_user(request)
    db = _db(request)
    try:
        await engine.delete_scan(db, user, scan_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    except PermissionError as exc:
        raise HTTPException(403, str(exc))
    return JSONResponse({"ok": True}, status_code=204)


# ─── Regenerate thumbnail (F0.2·Sub-D) ───────────────────────────────────────

@router.post("/api/tour-3dgs/scans/{scan_id}/regenerate-thumbnail")
async def regenerate_thumbnail_route(request: Request, scan_id: str):
    user = await _current_user(request)
    _rate_limit(user.get("user_id", "anon"))
    db = _db(request)
    try:
        doc = await engine.regenerate_thumbnail(db, user, scan_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    except PermissionError as exc:
        raise HTTPException(403, str(exc))
    except RuntimeError as exc:
        raise HTTPException(500, str(exc))
    return JSONResponse({"ok": True, "scan": doc})


# ─── Settings ─────────────────────────────────────────────────────────────────

@router.get("/api/tour-3dgs/settings/{dev_id}")
async def get_settings_route(request: Request, dev_id: str):
    db = _db(request)
    s = await engine.get_settings(db, dev_id)
    s.pop("_id", None)
    return JSONResponse({"ok": True, "settings": s})


class SettingsBody(BaseModel):
    settings: Dict[str, Any]


@router.put("/api/tour-3dgs/settings/{dev_id}")
async def put_settings_route(request: Request, dev_id: str, body: SettingsBody):
    user = await _current_user(request)
    db = _db(request)
    try:
        s = await engine.update_settings(db, user, dev_id, body.settings or {})
    except PermissionError as exc:
        raise HTTPException(403, str(exc))
    return JSONResponse({"ok": True, "settings": s})


# ─── Asset streaming (public if ready) ────────────────────────────────────────

@router.get("/api/tour-3dgs/scans/{scan_id}/asset/{filename}")
async def serve_asset(request: Request, scan_id: str, filename: str):
    """Sirve scene.splat / scene.spz / scene.ply / thumbnail.png públicamente
    si status=ready. CORS abierto para iframe cross-origin."""
    db = _db(request)
    doc = await engine.get_scan(db, scan_id)
    if not doc:
        raise HTTPException(404, "scan_not_found")
    if doc.get("status") != "ready":
        raise HTTPException(403, "scan_not_ready")
    if "." not in filename or "/" in filename or ".." in filename:
        raise HTTPException(400, "invalid_filename")
    fmt, ext = filename.rsplit(".", 1)
    path = engine.resolve_asset_path(scan_id, fmt, ext.lower())
    if not path:
        raise HTTPException(404, "asset_not_found")
    media_map = {
        "splat": "application/octet-stream",
        "spz": "application/octet-stream",
        "ply": "application/octet-stream",
        "png": "image/png",
    }
    media = media_map.get(ext.lower(), "application/octet-stream")
    headers = {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=3600",
    }
    return FileResponse(str(path), media_type=media, headers=headers)


# ─── Convenience: og:image thumbnail ──────────────────────────────────────────

@router.get("/api/tour-3dgs/scans/{scan_id}/thumbnail.png")
async def thumbnail_route(request: Request, scan_id: str):
    db = _db(request)
    doc = await engine.get_scan(db, scan_id)
    if not doc:
        raise HTTPException(404, "scan_not_found")
    path = engine.resolve_asset_path(scan_id, "thumbnail", "png")
    if not path:
        path = engine.resolve_asset_path(scan_id, "scene", "png")
    if not path:
        raise HTTPException(404, "thumbnail_not_found")
    headers = {"Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=3600"}
    return FileResponse(str(path), media_type="image/png", headers=headers)


# ─── Embed telemetry (LFPDPPP IP hash) ────────────────────────────────────────

class EmbedLoadBody(BaseModel):
    unit_id: Optional[str] = None
    scan_id: Optional[str] = None
    referrer: Optional[str] = None


@router.post("/api/tour-3dgs/embed/loaded")
async def embed_loaded(request: Request, body: EmbedLoadBody):
    """Log embed loads anonymously (LFPDPPP: IP hashed)."""
    db = _db(request)
    ip = _client_ip(request)
    payload = {
        "ip_hash": engine.hash_ip(ip),
        "unit_id": body.unit_id or "",
        "scan_id": body.scan_id or "",
        "referrer": (body.referrer or request.headers.get("referer", ""))[:300],
        "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    try:
        await db.tour_3dgs_embed_logs.insert_one(dict(payload))
    except Exception:
        pass
    log.info(f"[embed] 3dgs loaded · ip_hash={payload['ip_hash'][:8]} unit={payload['unit_id']} ref={payload['referrer'][:80]}")
    return JSONResponse({"ok": True})

# W5.FF4 register_feature marker · NO duplicate
from feature_registry import register_feature as _w5ff4_register_feature
_w5ff4_register_feature("tour_3dgs", plan_tier="pro",        monthly_price_mxn=149, category="marketing",   name="Tour 3DGS")
