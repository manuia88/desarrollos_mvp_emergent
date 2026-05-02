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
import uuid

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
from dev_assets import (
    ASSET_TYPES, ALLOWED_IMG_EXT, ASSET_MAX_BATCH, ASSET_MAX_FILE_BYTES,
    watermark_image, ai_categorize, pedra_generate_360,
    write_asset, sha256_bytes as asset_sha256, sanitize_asset, regenerate_plano_thumbnails,
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


# ─── Internal helper reusable by Drive watcher (Phase 7.11) ───────────────────
async def _ingest_document_bytes(
    db,
    dev_id: str,
    *,
    user_id: str,
    user_name: str,
    user_role: str,
    filename: str,
    data: bytes,
    doc_type: str,
    upload_notes: Optional[str] = None,
    period_relevant_start: Optional[datetime] = None,
    period_relevant_end: Optional[datetime] = None,
    source: str = "manual",
    source_metadata: Optional[Dict[str, Any]] = None,
    schedule_ocr: bool = True,
) -> Dict[str, Any]:
    """Common ingestion pipeline. Returns {action, document}.
    action is 'created', 'duplicate' or 'updated' (rev-update path).
    """
    if doc_type not in DI_DOC_TYPES:
        raise HTTPException(400, f"doc_type inválido. Permitidos: {sorted(DI_DOC_TYPES)}")
    name = (filename or "").strip()
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if ext not in DI_ALLOWED_EXT:
        raise HTTPException(400, f"Extensión no permitida ({ext or 'sin extensión'}). Acepta: {sorted(DI_ALLOWED_EXT)}")
    if not data:
        raise HTTPException(400, "Archivo vacío")
    if len(data) > DI_MAX_FILE_BYTES:
        raise HTTPException(413, f"Archivo excede {DI_MAX_FILE_BYTES // 1024 // 1024} MB")

    file_hash = sha256_bytes(data)
    existing = await db.di_documents.find_one({"development_id": dev_id, "file_hash": file_hash})
    if existing:
        return {"action": "duplicate", "document": sanitize_document(existing)}

    dev = await db.developments.find_one({"id": dev_id}, {"_id": 0, "developer_id": 1})
    if not dev:
        # Fall back to seed lookup
        from data_developments import DEVELOPMENTS_BY_ID
        dev = DEVELOPMENTS_BY_ID.get(dev_id) or {}

    mime = detect_mime(name, data)
    doc_id = f"di_{uuid.uuid4().hex[:14]}"
    storage_path = await asyncio.to_thread(write_encrypted_file, doc_id, data)

    doc = {
        "id": doc_id,
        "development_id": dev_id,
        "developer_id": dev.get("developer_id"),
        "uploader_user_id": user_id,
        "uploader_name": user_name,
        "uploader_role": user_role,
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
        "period_relevant_start": period_relevant_start,
        "period_relevant_end": period_relevant_end,
        "source": source,
        "source_metadata": source_metadata or {},
        "created_at": utcnow(),
        "processed_at": None,
        "expires_at": None,
    }
    await db.di_documents.insert_one(doc)

    if schedule_ocr:
        asyncio.create_task(run_ocr_for_document(db, doc_id))

    out = await db.di_documents.find_one({"id": doc_id})
    return {"action": "created", "document": sanitize_document(out)}


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
    _dev_exists(dev_id)

    def _parse_dt(v: Optional[str]):
        if not v:
            return None
        try:
            return datetime.fromisoformat(v.replace("Z", "+00:00"))
        except Exception:
            return None

    data = await file.read()
    res = await _ingest_document_bytes(
        _get_db(request),
        dev_id,
        user_id=user.user_id, user_name=user.name, user_role=user.role,
        filename=file.filename or "",
        data=data,
        doc_type=doc_type,
        upload_notes=upload_notes,
        period_relevant_start=_parse_dt(period_relevant_start),
        period_relevant_end=_parse_dt(period_relevant_end),
        source="manual",
    )
    if res["action"] == "duplicate":
        raise HTTPException(409, f"Documento duplicado (sha256 ya existe en este desarrollo): id={res['document']['id']}")
    # F0.1 — Audit log
    try:
        from audit_log import log_mutation
        await log_mutation(_get_db(request), user, "create", "document", res["document"]["id"],
                           before=None, after={"dev_id": dev_id, "doc_type": doc_type, "filename": file.filename},
                           request=request)
    except Exception: pass
    return {"document": res["document"]}


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
    result = await sync_apply_changes(db, dev_id, applied_by=f"{user.role}:{user.user_id}")
    # F0.1 — Audit log auto-sync mapper
    try:
        from audit_log import log_mutation
        applied_count = result.get("applied", 0) if isinstance(result, dict) else 0
        await log_mutation(db, user, "update", "sync_overlay", dev_id,
                           before={"dev_id": dev_id, "pending": True},
                           after={"dev_id": dev_id, "applied": applied_count},
                           request=request)
    except Exception: pass
    return result


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
    result = await sync_revert_audit(db, dev_id, audit_id, applied_by=f"{user.role}:{user.user_id}")
    # F0.1 — Audit log (revert critical)
    try:
        from audit_log import log_mutation
        from observability import emit_ml_event
        await log_mutation(db, user, "revert", "sync_overlay", audit_id,
                           before={"dev_id": dev_id, "audit_id": audit_id},
                           after={"reverted_by": user.user_id, "dev_id": dev_id},
                           request=request)
        await emit_ml_event(db, "mutation_logged", user.user_id, getattr(user, "tenant_id", None), user.role,
                            context={"entity_type": "sync_overlay", "action": "revert"}, ai_decision={}, user_action={})
    except Exception: pass
    return result


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


# ─── Phase 7.6 — Asset pipeline ───────────────────────────────────────────────
class ReorderBody(BaseModel):
    asset_ids: List[str]


@router.post("/api/superadmin/developments/{dev_id}/assets/upload")
async def assets_upload(
    dev_id: str,
    request: Request,
    files: List[UploadFile] = File(...),
    asset_type: str = Form("foto_render"),
):
    user = await _get_user(request)
    _require_dev_or_superadmin(user)
    _check_dev_access(user, dev_id)
    _dev_exists(dev_id)

    if asset_type not in ASSET_TYPES:
        raise HTTPException(400, f"asset_type inválido. Permitidos: {sorted(ASSET_TYPES)}")
    if len(files) > ASSET_MAX_BATCH:
        raise HTTPException(400, f"Máximo {ASSET_MAX_BATCH} archivos por lote")

    db = _get_db(request)
    # Determine starting order_index
    last = await db.dev_assets.find_one(
        {"development_id": dev_id, "asset_type": asset_type},
        sort=[("order_index", -1)],
    )
    base_order = (last["order_index"] + 1) if last else 0

    created: List[Dict[str, Any]] = []
    for i, f in enumerate(files):
        name = (f.filename or "").strip()
        ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
        if ext not in ALLOWED_IMG_EXT:
            continue
        data = await f.read()
        if not data or len(data) > ASSET_MAX_FILE_BYTES:
            continue
        wm = await asyncio.to_thread(watermark_image, data, f.content_type or "image/jpeg")
        asset_id = f"asset_{uuid.uuid4().hex[:14]}"
        sp = write_asset(asset_id, wm, "jpg")
        doc = {
            "id": asset_id,
            "development_id": dev_id,
            "uploader_user_id": user.user_id,
            "asset_type": asset_type,
            "filename": name,
            "file_size_bytes": len(wm),
            "mime_type": "image/jpeg",
            "file_hash": asset_sha256(wm),
            "storage_path": sp,
            "order_index": base_order + i,
            "ai_category": None,
            "ai_caption": None,
            "pedra_render_id": None,
            "tour_url": None,
            "watermarked": True,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }
        await db.dev_assets.insert_one(doc)
        created.append(sanitize_asset(doc))

        # Schedule AI categorization in background (non-blocking)
        asyncio.create_task(_categorize_and_save(db, asset_id, wm))

    return {"ok": True, "count": len(created), "created": created}


async def _categorize_and_save(db, asset_id: str, image_bytes: bytes):
    res = await ai_categorize(image_bytes)
    update = {"updated_at": datetime.now(timezone.utc)}
    if res.get("ok"):
        update["ai_category"] = res.get("category")
        update["ai_caption"] = res.get("caption")
        update["ai_model"] = res.get("model")
    else:
        update["ai_error"] = res.get("error")
    await db.dev_assets.update_one({"id": asset_id}, {"$set": update})


@router.post("/api/superadmin/developments/{dev_id}/assets/reorder")
async def assets_reorder(dev_id: str, body: ReorderBody, request: Request):
    user = await _get_user(request)
    _require_dev_or_superadmin(user)
    _check_dev_access(user, dev_id)
    db = _get_db(request)

    # Capture previous order for undo (Batch 17)
    prev = await db.dev_assets.find(
        {"development_id": dev_id, "id": {"$in": body.asset_ids}},
        {"_id": 0, "id": 1, "order_index": 1},
    ).sort("order_index", 1).to_list(len(body.asset_ids))
    prev_ids = [p["id"] for p in prev]

    for i, aid in enumerate(body.asset_ids):
        await db.dev_assets.update_one(
            {"id": aid, "development_id": dev_id},
            {"$set": {"order_index": i, "updated_at": datetime.now(timezone.utc)}},
        )

    # Register undo (Batch 17)
    try:
        from routes_dev_batch17 import register_undo
        await register_undo(
            db, user_id=user.user_id, action="reorder",
            entity_type="asset", entity_id=dev_id,
            before_state={"ordered_ids": prev_ids},
            after_state={"ordered_ids": body.asset_ids},
            meta={"collection": "dev_assets", "id_field": "id"},
        )
    except Exception:
        pass
    return {"ok": True, "reordered": len(body.asset_ids)}


@router.post("/api/superadmin/developments/{dev_id}/assets/{asset_id}/categorize")
async def asset_categorize(dev_id: str, asset_id: str, request: Request):
    user = await _get_user(request)
    _require_dev_or_superadmin(user)
    _check_dev_access(user, dev_id)
    db = _get_db(request)
    a = await db.dev_assets.find_one({"id": asset_id, "development_id": dev_id})
    if not a:
        raise HTTPException(404, "Asset no encontrado")
    try:
        image_bytes = Path(a["storage_path"]).read_bytes()
    except Exception:
        raise HTTPException(410, "Archivo de asset no encontrado en disco")
    res = await ai_categorize(image_bytes)
    update = {"updated_at": datetime.now(timezone.utc)}
    if res.get("ok"):
        update["ai_category"] = res.get("category")
        update["ai_caption"] = res.get("caption")
        update["ai_model"] = res.get("model")
        update["ai_error"] = None
    else:
        update["ai_error"] = res.get("error")
    await db.dev_assets.update_one({"id": asset_id}, {"$set": update})
    return res


@router.post("/api/superadmin/developments/{dev_id}/assets/{asset_id}/generate-360")
async def asset_generate_360(dev_id: str, asset_id: str, request: Request):
    user = await _get_user(request)
    _require_dev_or_superadmin(user)
    _check_dev_access(user, dev_id)
    db = _get_db(request)
    a = await db.dev_assets.find_one({"id": asset_id, "development_id": dev_id})
    if not a:
        raise HTTPException(404, "Asset no encontrado")
    try:
        image_bytes = Path(a["storage_path"]).read_bytes()
    except Exception:
        raise HTTPException(410, "Archivo de asset no encontrado en disco")
    room = a.get("ai_category") or "sala"
    res = await pedra_generate_360(image_bytes, room_type=room)
    if res.get("ok"):
        await db.dev_assets.update_one({"id": asset_id}, {"$set": {
            "pedra_render_id": res.get("render_id"),
            "tour_url": res.get("tour_url"),
            "updated_at": datetime.now(timezone.utc),
        }})
    return res


@router.delete("/api/superadmin/developments/{dev_id}/assets/{asset_id}")
async def asset_delete(dev_id: str, asset_id: str, request: Request):
    user = await _get_user(request)
    _require_dev_or_superadmin(user)
    _check_dev_access(user, dev_id)
    db = _get_db(request)
    a = await db.dev_assets.find_one({"id": asset_id, "development_id": dev_id})
    if not a:
        raise HTTPException(404, "Asset no encontrado")
    sp = a.get("storage_path")
    try:
        if sp and Path(sp).exists():
            Path(sp).unlink()
    except Exception as e:
        log.warning(f"asset unlink failed {asset_id}: {e}")
    await db.dev_assets.delete_one({"id": asset_id})
    return {"ok": True, "id": asset_id}


@router.post("/api/superadmin/developments/{dev_id}/assets/regenerate-plano-thumbnails")
async def assets_regen_plano(dev_id: str, request: Request):
    user = await _get_user(request)
    _require_dev_or_superadmin(user)
    _check_dev_access(user, dev_id)
    db = _get_db(request)
    return await regenerate_plano_thumbnails(db, dev_id)


# Public — used by marketplace & ficha (any user, even anon)
public_router = APIRouter(tags=["assets_public"])


@public_router.get("/api/developments/{dev_id}/assets")
async def list_dev_assets_public(dev_id: str, request: Request,
                                 asset_type: Optional[str] = Query(None)):
    db = _get_db(request)
    query: Dict[str, Any] = {"development_id": dev_id}
    if asset_type and asset_type in ASSET_TYPES:
        query["asset_type"] = asset_type
    cursor = db.dev_assets.find(query).sort([("asset_type", 1), ("order_index", 1)])
    items = [sanitize_asset(a) async for a in cursor]
    return {"development_id": dev_id, "count": len(items), "assets": items}


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


# Phase 7.6 dev aliases (assets)
@dev_alias.post("/api/desarrollador/developments/{dev_id}/assets/upload")
async def dev_assets_upload(
    dev_id: str, request: Request,
    files: List[UploadFile] = File(...),
    asset_type: str = Form("foto_render"),
):
    return await assets_upload(dev_id, request, files=files, asset_type=asset_type)


@dev_alias.post("/api/desarrollador/developments/{dev_id}/assets/reorder")
async def dev_assets_reorder(dev_id: str, body: ReorderBody, request: Request):
    return await assets_reorder(dev_id, body, request)


@dev_alias.post("/api/desarrollador/developments/{dev_id}/assets/{asset_id}/categorize")
async def dev_asset_categorize(dev_id: str, asset_id: str, request: Request):
    return await asset_categorize(dev_id, asset_id, request)


@dev_alias.post("/api/desarrollador/developments/{dev_id}/assets/{asset_id}/generate-360")
async def dev_asset_generate_360(dev_id: str, asset_id: str, request: Request):
    return await asset_generate_360(dev_id, asset_id, request)


@dev_alias.delete("/api/desarrollador/developments/{dev_id}/assets/{asset_id}")
async def dev_asset_delete(dev_id: str, asset_id: str, request: Request):
    return await asset_delete(dev_id, asset_id, request)


@dev_alias.post("/api/desarrollador/developments/{dev_id}/assets/regenerate-plano-thumbnails")
async def dev_assets_regen_plano(dev_id: str, request: Request):
    return await assets_regen_plano(dev_id, request)
