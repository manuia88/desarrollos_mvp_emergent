"""W6.MOV.2 · Gov Data MX routes (8 endpoints).

Superadmin endpoints (7):
  GET  /api/superadmin/gov-data-mx/sources                Track A status
  GET  /api/superadmin/gov-data-mx/cron-status            Track B status
  POST /api/superadmin/gov-data-mx/refresh/{source_id}    Track A force pull
  GET  /api/superadmin/gov-data-mx/stats                  aggregated stats
  POST /api/superadmin/gov-data-mx/upload                 Track C upload (multipart)
  GET  /api/superadmin/gov-data-mx/uploads                Track C list
  DELETE /api/superadmin/gov-data-mx/uploads/{id}         Track C soft delete

Public endpoint (1):
  GET  /api/gov-data-mx/public/{source_id}                aggregated indicator (no raw)
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, File, Form, HTTPException, Query, Request, UploadFile
from pydantic import BaseModel, Field

from gov_data_mx_engine import (
    ALL_SOURCES,
    SOURCE_DISPATCH,
    UPLOAD_MAX_BYTES,
    UPLOAD_SOURCE_LABELS,
    delete_upload,
    fetch_source,
    get_all_sources,
    get_public_source,
    get_stats,
    list_uploads,
    upload_file,
)
from gov_data_mx_cron import get_cron_status
from permissions import require_superadmin

log = logging.getLogger("dmx.gov_data_mx_routes")
router = APIRouter()


class DeleteUploadBody(BaseModel):
    reason: Optional[str] = Field(None, max_length=500)


# ─── Track A · sources status ────────────────────────────────────────────────
@router.get("/api/superadmin/gov-data-mx/sources")
async def list_sources(request: Request):
    """Superadmin · Track A status (6 connectors API)."""
    await require_superadmin(request)
    db = request.app.state.db
    return await get_all_sources(db)


# ─── Track B · cron status ───────────────────────────────────────────────────
@router.get("/api/superadmin/gov-data-mx/cron-status")
async def cron_status(request: Request):
    """Superadmin · Track B status (6 parsers cron)."""
    await require_superadmin(request)
    db = request.app.state.db
    return await get_cron_status(db)


# ─── Track A · force pull ────────────────────────────────────────────────────
@router.post("/api/superadmin/gov-data-mx/refresh/{source_id}")
async def refresh_source(request: Request, source_id: str):
    """Superadmin · force Track A pull ignorando cache."""
    user = await require_superadmin(request)
    db = request.app.state.db
    if source_id not in SOURCE_DISPATCH:
        raise HTTPException(400, f"source_id desconocido · usa uno de {list(SOURCE_DISPATCH.keys())}")
    # Invalidar cache antes de fetch
    try:
        await db.gov_data_mx_cache.delete_one({"source_id": source_id})
    except Exception as exc:
        log.warning(f"cache invalidate failed {source_id}: {exc}")
    result = await fetch_source(db, source_id)

    try:
        import audit_immutable_engine
        actor = {"user_id": getattr(user, "id", "superadmin"), "role": "superadmin"}
        await audit_immutable_engine.log(
            db, actor, "gov_data_mx.refresh", "gov_data_mx", source_id,
            before=None, after={"status": result.get("status")},
        )
    except Exception as exc:
        log.warning(f"audit log skipped: {exc}")
    return {"ok": True, "source_id": source_id, "result": result}


# ─── Aggregated stats ────────────────────────────────────────────────────────
@router.get("/api/superadmin/gov-data-mx/stats")
async def stats(request: Request):
    """Superadmin · aggregated stats Track A + B + C."""
    await require_superadmin(request)
    db = request.app.state.db
    return await get_stats(db)


# ─── Track C · upload ────────────────────────────────────────────────────────
@router.post("/api/superadmin/gov-data-mx/upload")
async def upload(
    request: Request,
    file: UploadFile = File(...),
    source_label: str = Form(...),
    schema_hint: Optional[str] = Form(None),
):
    """Superadmin · upload CSV/Excel/PDF (max 10MB)."""
    user = await require_superadmin(request)
    db = request.app.state.db

    # Defensive read · cap to 10MB +1 to detect overflow
    raw = await file.read(UPLOAD_MAX_BYTES + 1)
    if len(raw) > UPLOAD_MAX_BYTES:
        raise HTTPException(413, f"archivo excede {UPLOAD_MAX_BYTES // (1024*1024)}MB")

    if source_label not in UPLOAD_SOURCE_LABELS:
        raise HTTPException(400, f"source_label inválido · usa uno de {UPLOAD_SOURCE_LABELS}")

    actor_id = getattr(user, "id", "superadmin") or "superadmin"
    res = await upload_file(
        db,
        file_bytes=raw,
        filename=file.filename or "uploaded",
        content_type=file.content_type,
        source_label=source_label,
        schema_hint=schema_hint,
        uploaded_by=actor_id,
    )
    if not res.get("ok"):
        raise HTTPException(400, res.get("error") or "upload failed")
    return res


# ─── Track C · list uploads ──────────────────────────────────────────────────
@router.get("/api/superadmin/gov-data-mx/uploads")
async def list_uploaded(
    request: Request,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    include_deleted: bool = Query(False),
):
    """Superadmin · list uploads paginated."""
    await require_superadmin(request)
    db = request.app.state.db
    return await list_uploads(db, limit=limit, offset=offset, include_deleted=include_deleted)


# ─── Track C · delete upload ─────────────────────────────────────────────────
@router.delete("/api/superadmin/gov-data-mx/uploads/{upload_id}")
async def delete_uploaded(
    request: Request,
    upload_id: str,
    body: Optional[DeleteUploadBody] = None,
):
    """Superadmin · soft delete upload."""
    user = await require_superadmin(request)
    db = request.app.state.db
    actor_id = getattr(user, "id", "superadmin") or "superadmin"
    reason = (body.reason if body else None)
    res = await delete_upload(db, upload_id=upload_id, reason=reason, actor_id=actor_id)
    if not res.get("ok"):
        raise HTTPException(404, res.get("error") or "delete failed")
    return res


# ─── Public · aggregated indicator (no raw) ──────────────────────────────────
@router.get("/api/gov-data-mx/public/{source_id}")
async def public_source(request: Request, source_id: str):
    """Público T0 · returns aggregated summary · no raw payload."""
    db = request.app.state.db
    if source_id not in ALL_SOURCES:
        raise HTTPException(404, f"source desconocido · usa uno de {ALL_SOURCES}")
    return await get_public_source(db, source_id)
