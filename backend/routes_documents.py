"""Document Intelligence routes — Phase 7.1.

Multi-tenant guard:
- superadmin: full access to all developments.
- developer_admin: tenant_id maps to developer_id slug (or list); only their developments.
- Other roles: 403.

Endpoints:
- POST   /api/superadmin/developments/{dev_id}/documents/upload          (multipart)
- GET    /api/superadmin/developments/{dev_id}/documents                  (list per dev)
- GET    /api/superadmin/documents/{doc_id}                                (detail incl. ocr_preview)
- GET    /api/superadmin/documents/{doc_id}/download                       (decrypted file)
- POST   /api/superadmin/documents/{doc_id}/reprocess-ocr
- DELETE /api/superadmin/documents/{doc_id}

Aliased under /api/desarrollador/* for developer_admin convenience (same handlers, same multi-tenant guard).
"""

import os
import uuid
import asyncio
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Form, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from document_intelligence import (
    DI_ALLOWED_EXT, DI_DOC_TYPES, DI_DOC_TYPE_LABELS_ES, DI_MAX_FILE_BYTES, DI_STATUS,
    write_encrypted_file, read_encrypted_file, sha256_bytes, detect_mime,
    run_ocr_for_document, sanitize_document, utcnow,
)
from extraction_engine import (
    run_extraction, get_latest_extraction, EXTRACTION_PROMPT_VERSION,
)
from cross_check_engine import (
    run_cross_check, get_dev_cross_check, sanitize as sanitize_cross_check, ENGINE_VERSION as CC_ENGINE_VERSION,
)
from auto_sync_engine import (
    apply_changes as sync_apply_changes,
    compute_changes as sync_compute_changes,
    revert_audit as sync_revert_audit,
    get_audit as sync_get_audit,
    set_field_lock as sync_set_field_lock,
    get_overlay as sync_get_overlay,
)

log = logging.getLogger("dmx.di.routes")

router = APIRouter(tags=["document_intelligence"])

# Tenant → list of developer_ids (slug). MVP map: dev demo user has tenant_id="constructora_ariel" but no dev assigned.
# For each tenant_id we explicitly list which developer_ids they own. superadmin tenant ("dmx") sees everything.
TENANT_DEV_MAP = {
    "dmx": "*",  # superadmin sees everything
    "constructora_ariel": ["quattro", "habitare-capital", "agora-urbana"],  # demo developer
}


def _get_db(request: Request):
    return request.app.state.db


async def _get_user(request: Request):
    from server import get_current_user  # circular-safe
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    return user


def _allowed_dev_ids(user) -> object:
    """Return '*' for full-access, or a list of allowed development_ids based on user tenant."""
    role = getattr(user, "role", None)
    if role == "superadmin":
        return "*"
    if role != "developer_admin":
        return []
    tenant = getattr(user, "tenant_id", None)
    if not tenant:
        return []
    rule = TENANT_DEV_MAP.get(tenant)
    if rule == "*":
        return "*"
    if isinstance(rule, list):
        # Map developer_ids → list of development_ids
        from data_developments import DEVELOPMENTS
        dev_ids = [d["id"] for d in DEVELOPMENTS if d.get("developer_id") in rule]
        return dev_ids
    return []


def _check_dev_access(user, dev_id: str) -> None:
    allowed = _allowed_dev_ids(user)
    if allowed == "*":
        return
    if not isinstance(allowed, list) or dev_id not in allowed:
        raise HTTPException(403, "Acceso restringido: este desarrollo no pertenece a tu tenant.")


def _require_dev_or_superadmin(user) -> None:
    if user.role not in {"superadmin", "developer_admin"}:
        raise HTTPException(403, "Solo superadmin y developer_admin pueden gestionar documentos.")


# ─── Pydantic ─────────────────────────────────────────────────────────────────
class DocumentTypesOut(BaseModel):
    doc_types: dict


# ─── Helper: validate dev_id ──────────────────────────────────────────────────
def _dev_exists(dev_id: str) -> dict:
    from data_developments import DEVELOPMENTS_BY_ID
    dev = DEVELOPMENTS_BY_ID.get(dev_id)
    if not dev:
        raise HTTPException(404, f"Desarrollo {dev_id} no encontrado")
    return dev


# ─── Endpoints ────────────────────────────────────────────────────────────────
@router.get("/api/superadmin/document-types", response_model=DocumentTypesOut)
async def list_doc_types(request: Request):
    await _get_user(request)  # any auth user can read this dictionary
    return {"doc_types": DI_DOC_TYPE_LABELS_ES}


@router.post("/api/superadmin/developments/{dev_id}/documents/upload")
async def upload_document(
    dev_id: str,
    request: Request,
    file: UploadFile = File(...),
    doc_type: str = Form(...),
    upload_notes: Optional[str] = Form(None),
    period_relevant_start: Optional[str] = Form(None),
    period_relevant_end: Optional[str] = Form(None),
):
    user = await _get_user(request)
    _require_dev_or_superadmin(user)
    _check_dev_access(user, dev_id)
    dev = _dev_exists(dev_id)

    if doc_type not in DI_DOC_TYPES:
        raise HTTPException(400, f"doc_type inválido. Permitidos: {sorted(DI_DOC_TYPES)}")

    # Validate extension
    name = (file.filename or "").strip()
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if ext not in DI_ALLOWED_EXT:
        raise HTTPException(400, f"Extensión no permitida ({ext or 'sin extensión'}). Acepta: {sorted(DI_ALLOWED_EXT)}")

    # Read & size check
    data = await file.read()
    if not data:
        raise HTTPException(400, "Archivo vacío")
    if len(data) > DI_MAX_FILE_BYTES:
        raise HTTPException(413, f"Archivo excede {DI_MAX_FILE_BYTES // 1024 // 1024} MB")

    file_hash = sha256_bytes(data)
    db = _get_db(request)

    # Dedupe per (development_id, file_hash)
    existing = await db.di_documents.find_one({"development_id": dev_id, "file_hash": file_hash})
    if existing:
        raise HTTPException(409, f"Documento duplicado (sha256 ya existe en este desarrollo): id={existing['id']}")

    mime = detect_mime(name, data)

    doc_id = f"di_{uuid.uuid4().hex[:14]}"
    storage_path = await asyncio.to_thread(write_encrypted_file, doc_id, data)

    def _parse_dt(v: Optional[str]):
        if not v:
            return None
        try:
            return datetime.fromisoformat(v.replace("Z", "+00:00"))
        except Exception:
            return None

    doc = {
        "id": doc_id,
        "development_id": dev_id,
        "developer_id": dev.get("developer_id"),
        "uploader_user_id": user.user_id,
        "uploader_name": user.name,
        "uploader_role": user.role,
        "filename": name,
        "file_size_bytes": len(data),
        "mime_type": mime,
        "file_hash": file_hash,
        "storage_path": storage_path,
        "doc_type": doc_type,
        "status": "pending",
        "ocr_text_enc": None,
        "ocr_text_chars": 0,
        "ocr_pages_count": 0,
        "ocr_confidence": None,
        "ocr_engine": None,
        "ocr_error": None,
        "upload_notes": upload_notes,
        "period_relevant_start": _parse_dt(period_relevant_start),
        "period_relevant_end": _parse_dt(period_relevant_end),
        "created_at": utcnow(),
        "processed_at": None,
        "expires_at": None,
    }
    await db.di_documents.insert_one(doc)

    # Schedule async OCR
    asyncio.create_task(run_ocr_for_document(db, doc_id))

    out = await db.di_documents.find_one({"id": doc_id})
    return {"document": sanitize_document(out)}


@router.get("/api/superadmin/developments/{dev_id}/documents")
async def list_dev_documents(
    dev_id: str,
    request: Request,
    doc_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
):
    user = await _get_user(request)
    _require_dev_or_superadmin(user)
    _check_dev_access(user, dev_id)
    _dev_exists(dev_id)

    db = _get_db(request)
    query: dict = {"development_id": dev_id}
    if doc_type and doc_type in DI_DOC_TYPES:
        query["doc_type"] = doc_type
    if status and status in DI_STATUS:
        query["status"] = status

    cursor = db.di_documents.find(query).sort("created_at", -1).limit(500)
    docs = [sanitize_document(d) async for d in cursor]
    return {"development_id": dev_id, "count": len(docs), "documents": docs}


@router.get("/api/superadmin/documents")
async def list_all_documents(
    request: Request,
    doc_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(200, ge=1, le=1000),
):
    user = await _get_user(request)
    _require_dev_or_superadmin(user)
    db = _get_db(request)

    query: dict = {}
    allowed = _allowed_dev_ids(user)
    if allowed != "*":
        if not allowed:
            return {"count": 0, "documents": []}
        query["development_id"] = {"$in": allowed}
    if doc_type and doc_type in DI_DOC_TYPES:
        query["doc_type"] = doc_type
    if status and status in DI_STATUS:
        query["status"] = status

    cursor = db.di_documents.find(query).sort("created_at", -1).limit(limit)
    docs = [sanitize_document(d) async for d in cursor]
    return {"count": len(docs), "documents": docs}


@router.get("/api/superadmin/documents/{doc_id}")
async def get_document(doc_id: str, request: Request):
    user = await _get_user(request)
    _require_dev_or_superadmin(user)
    db = _get_db(request)
    doc = await db.di_documents.find_one({"id": doc_id})
    if not doc:
        raise HTTPException(404, "Documento no encontrado")
    _check_dev_access(user, doc["development_id"])
    return {"document": sanitize_document(doc, include_ocr_preview=True)}


@router.get("/api/superadmin/documents/{doc_id}/download")
async def download_document(doc_id: str, request: Request):
    user = await _get_user(request)
    _require_dev_or_superadmin(user)
    db = _get_db(request)
    doc = await db.di_documents.find_one({"id": doc_id})
    if not doc:
        raise HTTPException(404, "Documento no encontrado")
    _check_dev_access(user, doc["development_id"])

    storage_path = doc.get("storage_path")
    try:
        data = await asyncio.to_thread(read_encrypted_file, storage_path)
    except FileNotFoundError:
        raise HTTPException(410, "Archivo no encontrado en storage")
    except Exception as e:
        raise HTTPException(500, f"No se pudo descifrar el archivo: {e}")

    # verify hash on-read (defense in depth)
    if sha256_bytes(data) != doc.get("file_hash"):
        raise HTTPException(409, "Hash mismatch — archivo posiblemente corrupto")

    import io
    headers = {
        "Content-Disposition": f'attachment; filename="{doc.get("filename","document.bin")}"',
        "Content-Length": str(len(data)),
    }
    return StreamingResponse(
        io.BytesIO(data),
        media_type=doc.get("mime_type") or "application/octet-stream",
        headers=headers,
    )


@router.post("/api/superadmin/documents/{doc_id}/reprocess-ocr")
async def reprocess_ocr(doc_id: str, request: Request):
    user = await _get_user(request)
    _require_dev_or_superadmin(user)
    db = _get_db(request)
    doc = await db.di_documents.find_one({"id": doc_id})
    if not doc:
        raise HTTPException(404, "Documento no encontrado")
    _check_dev_access(user, doc["development_id"])

    await db.di_documents.update_one({"id": doc_id}, {"$set": {
        "status": "pending", "ocr_error": None,
    }})
    asyncio.create_task(run_ocr_for_document(db, doc_id))
    return {"ok": True, "id": doc_id, "status": "pending"}


@router.delete("/api/superadmin/documents/{doc_id}")
async def delete_document(doc_id: str, request: Request):
    user = await _get_user(request)
    _require_dev_or_superadmin(user)
    db = _get_db(request)
    doc = await db.di_documents.find_one({"id": doc_id})
    if not doc:
        raise HTTPException(404, "Documento no encontrado")
    _check_dev_access(user, doc["development_id"])

    # Delete file on disk
    sp = doc.get("storage_path")
    try:
        if sp:
            p = Path(sp)
            if p.exists():
                p.unlink()
    except Exception as e:
        log.warning(f"di.delete file unlink failed for {doc_id}: {e}")

    # Delete extractions if any (Phase 7.2 placeholder)
    await db.di_extractions.delete_many({"document_id": doc_id})
    await db.di_documents.delete_one({"id": doc_id})
    return {"ok": True, "id": doc_id}


# ─── Phase 7.2 — Structured Extraction ────────────────────────────────────────
@router.post("/api/superadmin/documents/{doc_id}/extract")
async def extract_document(doc_id: str, request: Request):
    user = await _get_user(request)
    _require_dev_or_superadmin(user)
    db = _get_db(request)
    doc = await db.di_documents.find_one({"id": doc_id})
    if not doc:
        raise HTTPException(404, "Documento no encontrado")
    _check_dev_access(user, doc["development_id"])

    if doc.get("status") not in ("ocr_done", "extracted", "extraction_pending", "extraction_failed"):
        raise HTTPException(400, f"El documento debe estar en OCR listo o extracted antes de extraer (status actual: {doc.get('status')})")

    # Run extraction (sync wait — typically <30s)
    res = await run_extraction(db, doc_id, force=True)
    if not res.get("ok"):
        return {"ok": False, "error": res.get("error")}
    return {
        "ok": True,
        "extraction_id": res.get("extraction_id"),
        "cost_usd": res.get("cost_usd"),
        "doc_type": doc.get("doc_type"),
    }


@router.get("/api/superadmin/documents/{doc_id}/extraction")
async def get_extraction(doc_id: str, request: Request):
    user = await _get_user(request)
    _require_dev_or_superadmin(user)
    db = _get_db(request)
    doc = await db.di_documents.find_one({"id": doc_id})
    if not doc:
        raise HTTPException(404, "Documento no encontrado")
    _check_dev_access(user, doc["development_id"])

    extr = await get_latest_extraction(db, doc_id)
    return {
        "document_id": doc_id,
        "doc_type": doc.get("doc_type"),
        "status": doc.get("status"),
        "extraction_error": doc.get("extraction_error"),
        "extraction": extr,
        "schema_version": EXTRACTION_PROMPT_VERSION,
    }


@router.post("/api/superadmin/developments/{dev_id}/documents/bulk-extract")
async def bulk_extract(dev_id: str, request: Request):
    user = await _get_user(request)
    _require_dev_or_superadmin(user)
    _check_dev_access(user, dev_id)
    _dev_exists(dev_id)

    db = _get_db(request)
    cursor = db.di_documents.find({
        "development_id": dev_id,
        "status": {"$in": ["ocr_done", "extraction_failed"]},
    }).limit(100)

    docs = [d async for d in cursor]
    results = []
    for d in docs:
        try:
            r = await run_extraction(db, d["id"], force=True)
            results.append({"id": d["id"], "ok": r.get("ok"), "error": r.get("error"), "cost_usd": r.get("cost_usd")})
        except Exception as e:
            results.append({"id": d["id"], "ok": False, "error": f"{type(e).__name__}: {e}"})

    success = sum(1 for r in results if r["ok"])
    total_cost = round(sum(r.get("cost_usd") or 0 for r in results), 6)
    return {
        "development_id": dev_id,
        "total": len(results),
        "success": success,
        "failed": len(results) - success,
        "total_cost_usd": total_cost,
        "results": results,
    }


# ─── Phase 7.3 — Cross-Check ──────────────────────────────────────────────────
@router.post("/api/superadmin/developments/{dev_id}/cross-check")
async def trigger_cross_check(dev_id: str, request: Request):
    user = await _get_user(request)
    _require_dev_or_superadmin(user)
    _check_dev_access(user, dev_id)
    _dev_exists(dev_id)
    db = _get_db(request)
    res = await run_cross_check(db, dev_id)
    return res


@router.get("/api/superadmin/developments/{dev_id}/cross-check")
async def get_cross_check(dev_id: str, request: Request):
    user = await _get_user(request)
    _require_dev_or_superadmin(user)
    _check_dev_access(user, dev_id)
    _dev_exists(dev_id)
    db = _get_db(request)
    return {**(await get_dev_cross_check(db, dev_id)), "engine_version": CC_ENGINE_VERSION}


@router.get("/api/superadmin/cross-checks/{cc_id}")
async def get_single_cross_check(cc_id: str, request: Request):
    user = await _get_user(request)
    _require_dev_or_superadmin(user)
    db = _get_db(request)
    doc = await db.di_cross_checks.find_one({"id": cc_id})
    if not doc:
        raise HTTPException(404, "Cross-check no encontrado")
    _check_dev_access(user, doc.get("development_id"))
    return sanitize_cross_check(doc)


@router.get("/api/superadmin/cross-checks/stats/global")
async def cross_check_stats(request: Request):
    user = await _get_user(request)
    _require_dev_or_superadmin(user)
    db = _get_db(request)
    pipe = [
        {"$match": {"severity": "critical", "result": "fail"}},
        {"$group": {"_id": "$development_id", "n": {"$sum": 1}}},
    ]
    crit_devs = [r async for r in db.di_cross_checks.aggregate(pipe)]
    return {
        "developments_with_critical": len(crit_devs),
        "total_critical_rules": sum(int(r["n"]) for r in crit_devs),
    }


# ─── Phase 7.5 — Auto-Sync ────────────────────────────────────────────────────
class FieldLockBody(BaseModel):
    field: str
    locked: bool


@router.get("/api/superadmin/developments/{dev_id}/sync-preview")
async def sync_preview(dev_id: str, request: Request):
    user = await _get_user(request)
    _require_dev_or_superadmin(user)
    _check_dev_access(user, dev_id)
    _dev_exists(dev_id)
    db = _get_db(request)
    overlay = await sync_get_overlay(db, dev_id)
    changes = await sync_compute_changes(db, dev_id)
    return {
        **changes,
        "locked_fields": overlay.get("locked_fields") or [],
        "last_auto_sync_at": overlay.get("last_auto_sync_at").isoformat() if overlay.get("last_auto_sync_at") else None,
    }


@router.post("/api/superadmin/developments/{dev_id}/sync-apply")
async def sync_apply(dev_id: str, request: Request):
    user = await _get_user(request)
    _require_dev_or_superadmin(user)
    _check_dev_access(user, dev_id)
    _dev_exists(dev_id)
    db = _get_db(request)
    return await sync_apply_changes(db, dev_id, applied_by=f"{user.role}:{user.user_id}")


@router.post("/api/superadmin/developments/{dev_id}/auto-sync")
async def sync_full_run(dev_id: str, request: Request):
    """Trigger manual full run: applies all pending diffs."""
    return await sync_apply(dev_id, request)


@router.post("/api/superadmin/developments/{dev_id}/sync-revert/{audit_id}")
async def sync_revert(dev_id: str, audit_id: str, request: Request):
    user = await _get_user(request)
    _require_dev_or_superadmin(user)
    _check_dev_access(user, dev_id)
    _dev_exists(dev_id)
    db = _get_db(request)
    return await sync_revert_audit(db, dev_id, audit_id, applied_by=f"{user.role}:{user.user_id}")


@router.get("/api/superadmin/developments/{dev_id}/sync-audit")
async def sync_audit(dev_id: str, request: Request):
    user = await _get_user(request)
    _require_dev_or_superadmin(user)
    _check_dev_access(user, dev_id)
    _dev_exists(dev_id)
    db = _get_db(request)
    audit = await sync_get_audit(db, dev_id)
    return {"development_id": dev_id, "audit": audit, "count": len(audit)}


@router.post("/api/superadmin/developments/{dev_id}/sync-lock-field")
async def sync_lock_field(dev_id: str, body: FieldLockBody, request: Request):
    user = await _get_user(request)
    _require_dev_or_superadmin(user)
    _check_dev_access(user, dev_id)
    _dev_exists(dev_id)
    db = _get_db(request)
    return await sync_set_field_lock(db, dev_id, body.field, body.locked)


@router.get("/api/superadmin/sync/pending-summary")
async def sync_pending_summary(request: Request):
    """Per-tenant summary: devs with pending review queue."""
    user = await _get_user(request)
    _require_dev_or_superadmin(user)
    db = _get_db(request)
    allowed = _allowed_dev_ids(user)
    pending: List[Dict[str, Any]] = []
    cursor = db.dev_overlays.find({}, {"_id": 0})
    async for o in cursor:
        dev_id = o.get("development_id")
        if allowed != "*" and dev_id not in (allowed or []):
            continue
        pending.append({
            "development_id": dev_id,
            "last_auto_sync_at": o.get("last_auto_sync_at").isoformat() if o.get("last_auto_sync_at") else None,
            "synced_field_count": len((o.get("fields") or {}).keys()),
            "audit_count": len(o.get("audit") or []),
            "locked_fields": o.get("locked_fields") or [],
            "auto_sync_paused_reason": o.get("auto_sync_paused_reason"),
        })
    return {"count": len(pending), "items": pending}


# ─── Developer-portal aliases (multi-tenant guard kicks in via _check_dev_access) ──
dev_alias = APIRouter(tags=["document_intelligence_dev"])


@dev_alias.get("/api/desarrollador/developments/{dev_id}/documents")
async def dev_list_documents(dev_id: str, request: Request,
                             doc_type: Optional[str] = Query(None),
                             status: Optional[str] = Query(None)):
    return await list_dev_documents(dev_id, request, doc_type=doc_type, status=status)


@dev_alias.post("/api/desarrollador/developments/{dev_id}/documents/upload")
async def dev_upload_document(
    dev_id: str,
    request: Request,
    file: UploadFile = File(...),
    doc_type: str = Form(...),
    upload_notes: Optional[str] = Form(None),
    period_relevant_start: Optional[str] = Form(None),
    period_relevant_end: Optional[str] = Form(None),
):
    return await upload_document(
        dev_id, request, file=file, doc_type=doc_type,
        upload_notes=upload_notes,
        period_relevant_start=period_relevant_start,
        period_relevant_end=period_relevant_end,
    )


@dev_alias.get("/api/desarrollador/documents/{doc_id}")
async def dev_get_document(doc_id: str, request: Request):
    return await get_document(doc_id, request)


@dev_alias.get("/api/desarrollador/documents/{doc_id}/download")
async def dev_download_document(doc_id: str, request: Request):
    return await download_document(doc_id, request)


@dev_alias.post("/api/desarrollador/documents/{doc_id}/reprocess-ocr")
async def dev_reprocess_ocr(doc_id: str, request: Request):
    return await reprocess_ocr(doc_id, request)


@dev_alias.delete("/api/desarrollador/documents/{doc_id}")
async def dev_delete_document(doc_id: str, request: Request):
    return await delete_document(doc_id, request)


@dev_alias.get("/api/desarrollador/documents")
async def dev_list_all(request: Request,
                       doc_type: Optional[str] = Query(None),
                       status: Optional[str] = Query(None),
                       limit: int = Query(200, ge=1, le=1000)):
    return await list_all_documents(request, doc_type=doc_type, status=status, limit=limit)


# Phase 7.2 dev aliases
@dev_alias.post("/api/desarrollador/documents/{doc_id}/extract")
async def dev_extract(doc_id: str, request: Request):
    return await extract_document(doc_id, request)


@dev_alias.get("/api/desarrollador/documents/{doc_id}/extraction")
async def dev_get_extraction(doc_id: str, request: Request):
    return await get_extraction(doc_id, request)


@dev_alias.post("/api/desarrollador/developments/{dev_id}/documents/bulk-extract")
async def dev_bulk_extract(dev_id: str, request: Request):
    return await bulk_extract(dev_id, request)


# Phase 7.3 dev aliases
@dev_alias.post("/api/desarrollador/developments/{dev_id}/cross-check")
async def dev_trigger_cross_check(dev_id: str, request: Request):
    return await trigger_cross_check(dev_id, request)


@dev_alias.get("/api/desarrollador/developments/{dev_id}/cross-check")
async def dev_get_cross_check(dev_id: str, request: Request):
    return await get_cross_check(dev_id, request)


# Phase 7.5 dev aliases (auto-sync)
@dev_alias.get("/api/desarrollador/developments/{dev_id}/sync-preview")
async def dev_sync_preview(dev_id: str, request: Request):
    return await sync_preview(dev_id, request)


@dev_alias.post("/api/desarrollador/developments/{dev_id}/sync-apply")
async def dev_sync_apply(dev_id: str, request: Request):
    return await sync_apply(dev_id, request)


@dev_alias.post("/api/desarrollador/developments/{dev_id}/sync-revert/{audit_id}")
async def dev_sync_revert(dev_id: str, audit_id: str, request: Request):
    return await sync_revert(dev_id, audit_id, request)


@dev_alias.get("/api/desarrollador/developments/{dev_id}/sync-audit")
async def dev_sync_audit(dev_id: str, request: Request):
    return await sync_audit(dev_id, request)


@dev_alias.post("/api/desarrollador/developments/{dev_id}/sync-lock-field")
async def dev_sync_lock(dev_id: str, body: FieldLockBody, request: Request):
    return await sync_lock_field(dev_id, body, request)


@dev_alias.get("/api/desarrollador/sync/pending-summary")
async def dev_sync_pending(request: Request):
    return await sync_pending_summary(request)
