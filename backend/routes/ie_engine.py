"""
IE Engine — Phase A backend (read-only foundation + schema seed).

Phase A scope:
- Mongo collections: ie_data_sources, ie_raw_observations, ie_ingestion_jobs, ie_manual_uploads
- Idempotent seed of the 18 sources defined in data_ie_sources.IE_DATA_SOURCES_SEED
- Fernet-encrypted credentials column
- Read-only HTTP endpoints (list, detail, ingestion-jobs, uploads)
- Stat aggregation for the superadmin dashboard widget
- Role-gated to superadmin

Phase A does NOT include: fetch/sync/test_connection routes, manual upload write
endpoints, APScheduler, or score calculation — those land in A2/A3/A4.
"""
import base64
import os
import hashlib
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any

from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, HTTPException, Request, Query, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from data_ie_sources import IE_DATA_SOURCES_SEED, initial_status_for
from connectors_ie import get_connector, connector_kind, new_job_id
from uploads_ie import (
    MAX_UPLOAD_BYTES, ALLOWED_EXTS, is_allowed,
    sha256_bytes, build_preview, parse_manual_upload, upload_dir,
)
from scheduler_ie import trigger_now


router = APIRouter(prefix="/api/superadmin")

SUPERADMIN_ROLES = {"superadmin"}


# ─── Fernet credential cipher ────────────────────────────────────────────────
def _get_cipher() -> Fernet:
    """
    Build a Fernet cipher from IE_FERNET_KEY (base64 urlsafe 32 bytes).
    If absent, derive a deterministic key from JWT_SECRET so dev instances boot.
    Production MUST set IE_FERNET_KEY explicitly.
    """
    raw = os.environ.get("IE_FERNET_KEY")
    if raw:
        return Fernet(raw.encode() if isinstance(raw, str) else raw)
    seed = (os.environ.get("JWT_SECRET") or "dmx-dev-fernet").encode()
    digest = hashlib.sha256(seed).digest()
    derived = base64.urlsafe_b64encode(digest)
    return Fernet(derived)


_cipher = _get_cipher()


def encrypt_credentials(creds: Dict[str, str]) -> Optional[str]:
    if not creds:
        return None
    import json
    blob = json.dumps(creds, separators=(",", ":")).encode()
    return _cipher.encrypt(blob).decode()


def decrypt_credentials(token: Optional[str]) -> Dict[str, str]:
    if not token:
        return {}
    import json
    try:
        return json.loads(_cipher.decrypt(token.encode()).decode())
    except (InvalidToken, ValueError):
        return {}


def credentials_summary(creds: Dict[str, str]) -> Dict[str, Any]:
    """Never return raw secrets; return masked previews + which keys are filled."""
    out = {}
    for k, v in (creds or {}).items():
        if not v:
            out[k] = {"set": False, "preview": None}
        elif len(v) <= 6:
            out[k] = {"set": True, "preview": "•" * len(v)}
        else:
            out[k] = {"set": True, "preview": v[:3] + "•" * (len(v) - 6) + v[-3:]}
    return out


# ─── Models ──────────────────────────────────────────────────────────────────
class DataSourceOut(BaseModel):
    id: str
    name: str
    category: str
    access_mode: str
    status: str
    supports_manual_upload: bool
    endpoint: Optional[str] = None
    description: Optional[str] = None
    credentials_keys: List[str] = Field(default_factory=list)
    credentials_env: Dict[str, str] = Field(default_factory=dict)
    credentials_summary: Dict[str, Any] = Field(default_factory=dict)
    last_sync: Optional[datetime] = None
    last_status: str = "never"
    records_total: int = 0
    error_log: List[Dict[str, Any]] = Field(default_factory=list)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class IngestionJobOut(BaseModel):
    id: str
    source_id: str
    trigger: str
    status: str
    started_at: datetime
    finished_at: Optional[datetime] = None
    records_ingested: int = 0
    error_message: Optional[str] = None


class ManualUploadOut(BaseModel):
    id: str
    source_id: str
    uploader_user_id: Optional[str] = None
    filename: str
    file_size_bytes: int
    mime_type: str
    file_hash: str
    storage_path: str
    screenshot_path: Optional[str] = None
    upload_notes: Optional[str] = None
    period_start: Optional[datetime] = None
    period_end: Optional[datetime] = None
    status: str
    records_extracted: Optional[int] = None
    superseded_by: Optional[str] = None
    created_at: datetime
    processed_at: Optional[datetime] = None


class DataSourcesStats(BaseModel):
    active: int
    stub: int
    manual_only: int
    h2: int
    blocked: int
    errors_24h: int
    total: int
    recent_syncs: List[Dict[str, Any]] = Field(default_factory=list)


class CredentialsPatch(BaseModel):
    credentials: Dict[str, str] = Field(default_factory=dict)
    run_test: bool = False


class TestConnectionResult(BaseModel):
    ok: bool
    message: str
    kind: str  # "real" | "stub"


class SyncResult(BaseModel):
    job_id: str
    status: str
    records_ingested: int
    is_stub: bool
    duration_ms: int


# ─── Seed + indexes ──────────────────────────────────────────────────────────
async def seed_ie_engine(db) -> None:
    """Idempotent: insert the 18 sources, refresh descriptive fields, never overwrite credentials/last_sync."""
    await db.ie_data_sources.create_index("id", unique=True)
    await db.ie_raw_observations.create_index([("source_id", 1), ("fetched_at", -1)])
    await db.ie_ingestion_jobs.create_index([("source_id", 1), ("started_at", -1)])
    await db.ie_manual_uploads.create_index([("source_id", 1), ("created_at", -1)])
    await db.ie_manual_uploads.create_index("file_hash", unique=True, sparse=True)

    env_lookup = lambda k: os.environ.get(k)  # noqa: E731
    now = datetime.now(timezone.utc)

    for src in IE_DATA_SOURCES_SEED:
        existing = await db.ie_data_sources.find_one({"id": src["id"]}, {"_id": 0})
        descriptive = {
            "name": src["name"],
            "category": src["category"],
            "access_mode": src["access_mode"],
            "supports_manual_upload": src["supports_manual_upload"],
            "endpoint": src.get("endpoint"),
            "description": src.get("description"),
            "credentials_keys": src.get("credentials_keys", []),
            "credentials_env": src.get("credentials_env", {}),
            "updated_at": now,
        }
        if existing is None:
            await db.ie_data_sources.insert_one({
                "id": src["id"],
                **descriptive,
                "status": initial_status_for(src, env_lookup),
                "credentials": None,
                "last_sync": None,
                "last_status": "never",
                "error_log": [],
                "records_total": 0,
                "created_at": now,
            })
        else:
            # Refresh descriptive fields only — preserve credentials, status, sync state
            await db.ie_data_sources.update_one(
                {"id": src["id"]},
                {"$set": descriptive},
            )


# ─── Helpers ─────────────────────────────────────────────────────────────────
async def _require_superadmin(request: Request):
    from server import get_current_user  # avoid circular import at module load
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    if user.role not in SUPERADMIN_ROLES:
        raise HTTPException(403, "Acceso restringido a superadmin")
    return user


async def audit(user_id: str, action: str, resource: str, data: Optional[Dict[str, Any]] = None):
    from server import audit as _audit
    await _audit(user_id, action, resource, data or {})


def _shape_data_source(doc: Dict[str, Any]) -> DataSourceOut:
    creds = decrypt_credentials(doc.get("credentials"))
    return DataSourceOut(
        id=doc["id"],
        name=doc.get("name", doc["id"]),
        category=doc.get("category", "geo"),
        access_mode=doc.get("access_mode", "manual_upload"),
        status=doc.get("status", "stub"),
        supports_manual_upload=doc.get("supports_manual_upload", True),
        endpoint=doc.get("endpoint"),
        description=doc.get("description"),
        credentials_keys=doc.get("credentials_keys", []),
        credentials_env=doc.get("credentials_env", {}),
        credentials_summary=credentials_summary(creds),
        last_sync=doc.get("last_sync"),
        last_status=doc.get("last_status", "never"),
        records_total=int(doc.get("records_total", 0)),
        error_log=doc.get("error_log", [])[-10:],
        created_at=doc.get("created_at"),
        updated_at=doc.get("updated_at"),
    )


# ─── Endpoints ───────────────────────────────────────────────────────────────
@router.get("/data-sources", response_model=List[DataSourceOut])
async def list_data_sources(request: Request):
    await _require_superadmin(request)
    db = request.app.state.db
    cursor = db.ie_data_sources.find({}, {"_id": 0}).sort("name", 1)
    docs = await cursor.to_list(length=200)
    return [_shape_data_source(d) for d in docs]


@router.get("/data-sources/stats", response_model=DataSourcesStats)
async def data_sources_stats(request: Request):
    await _require_superadmin(request)
    db = request.app.state.db
    docs = await db.ie_data_sources.find({}, {"_id": 0}).to_list(length=200)

    counters = {"active": 0, "stub": 0, "manual_only": 0, "h2": 0, "blocked": 0}
    for d in docs:
        s = d.get("status", "stub")
        if s in counters:
            counters[s] += 1

    cutoff = datetime.now(timezone.utc).timestamp() - 86400
    errors_24h = await db.ie_ingestion_jobs.count_documents({
        "status": "error",
        "started_at": {"$gte": datetime.fromtimestamp(cutoff, tz=timezone.utc)},
    })

    recent = await db.ie_data_sources.find(
        {"last_sync": {"$ne": None}},
        {"_id": 0, "id": 1, "name": 1, "last_sync": 1, "last_status": 1},
    ).sort("last_sync", -1).to_list(length=5)

    return DataSourcesStats(
        **counters,
        errors_24h=errors_24h,
        total=len(docs),
        recent_syncs=recent,
    )


@router.get("/data-sources/{source_id}", response_model=DataSourceOut)
async def get_data_source(source_id: str, request: Request):
    await _require_superadmin(request)
    db = request.app.state.db
    doc = await db.ie_data_sources.find_one({"id": source_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Fuente no encontrada")
    return _shape_data_source(doc)


@router.get("/ingestion-jobs", response_model=List[IngestionJobOut])
async def list_ingestion_jobs(
    request: Request,
    source_id: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
):
    await _require_superadmin(request)
    db = request.app.state.db
    q = {"source_id": source_id} if source_id else {}
    cursor = db.ie_ingestion_jobs.find(q, {"_id": 0}).sort("started_at", -1).limit(limit)
    docs = await cursor.to_list(length=limit)
    return [IngestionJobOut(**d) for d in docs]


@router.get("/data-sources/{source_id}/uploads", response_model=List[ManualUploadOut])
async def list_uploads_for_source(source_id: str, request: Request, limit: int = Query(20, ge=1, le=100)):
    await _require_superadmin(request)
    db = request.app.state.db
    cursor = db.ie_manual_uploads.find({"source_id": source_id}, {"_id": 0}).sort("created_at", -1).limit(limit)
    docs = await cursor.to_list(length=limit)
    return [ManualUploadOut(**d) for d in docs]


@router.get("/uploads/recent", response_model=List[ManualUploadOut])
async def list_recent_uploads(request: Request, limit: int = Query(20, ge=1, le=100)):
    await _require_superadmin(request)
    db = request.app.state.db
    cursor = db.ie_manual_uploads.find({}, {"_id": 0}).sort("created_at", -1).limit(limit)
    docs = await cursor.to_list(length=limit)
    return [ManualUploadOut(**d) for d in docs]


# ─── Phase A2 — credentials + test + sync ────────────────────────────────────
async def _load_source_or_404(db, source_id: str) -> Dict[str, Any]:
    doc = await db.ie_data_sources.find_one({"id": source_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Fuente no encontrada")
    return doc


def _post_test_status(source_doc: Dict[str, Any], creds: Dict[str, str], ok: bool) -> str:
    """Compute next status after a connection test or sync."""
    mode = source_doc.get("access_mode")
    if mode == "manual_upload":
        return "manual_only"
    if source_doc.get("status") == "h2":
        return "h2"
    if ok:
        return "active"
    if mode in ("api_key", "ckan_resource"):
        # If creds present but failed → stub; if absent → blocked
        env_map = source_doc.get("credentials_env", {}) or {}
        cred_keys = source_doc.get("credentials_keys", []) or list(env_map.keys())
        any_set = any(creds.get(k) for k in cred_keys) or any(os.environ.get(v) for v in env_map.values())
        return "stub" if any_set else "blocked"
    return "stub"


@router.patch("/data-sources/{source_id}", response_model=DataSourceOut)
async def update_credentials(source_id: str, payload: CredentialsPatch, request: Request):
    user = await _require_superadmin(request)
    db = request.app.state.db
    src = await _load_source_or_404(db, source_id)
    if src.get("access_mode") == "manual_upload":
        raise HTTPException(400, "Las fuentes manual_upload no requieren credenciales.")

    # Merge with existing credentials so partial updates don't wipe other keys.
    current = decrypt_credentials(src.get("credentials"))
    merged = {**current, **{k: v for k, v in payload.credentials.items() if v is not None}}
    encrypted = encrypt_credentials(merged)

    update_doc: Dict[str, Any] = {
        "credentials": encrypted,
        "updated_at": datetime.now(timezone.utc),
    }

    if payload.run_test:
        connector = get_connector(src, merged)
        ok, msg = await connector.test_connection()
        update_doc["last_status"] = "ok" if ok else "error"
        if not ok:
            err_log = (src.get("error_log") or []) + [{
                "ts": datetime.now(timezone.utc),
                "scope": "test_connection",
                "message": msg,
            }]
            update_doc["error_log"] = err_log[-10:]
        # Refresh status (active vs stub vs blocked) after test
        update_doc["status"] = _post_test_status(src, merged, ok)
    else:
        # No test: status reflects "creds provided but never validated"
        if src.get("status") in ("blocked", "h2"):
            update_doc["status"] = "stub"

    await db.ie_data_sources.update_one({"id": source_id}, {"$set": update_doc})
    fresh = await db.ie_data_sources.find_one({"id": source_id}, {"_id": 0})
    await audit(user.user_id, "ie_credentials_update", source_id,
                {"keys": list(payload.credentials.keys()), "tested": payload.run_test})
    return _shape_data_source(fresh)


@router.post("/data-sources/{source_id}/test", response_model=TestConnectionResult)
async def test_connection_route(source_id: str, request: Request):
    user = await _require_superadmin(request)
    db = request.app.state.db
    src = await _load_source_or_404(db, source_id)
    if src.get("access_mode") == "manual_upload":
        return TestConnectionResult(ok=False, message="Fuente manual: no requiere conexión.", kind="stub")

    creds = decrypt_credentials(src.get("credentials"))
    connector = get_connector(src, creds)
    ok, msg = await connector.test_connection()

    update_doc: Dict[str, Any] = {
        "last_status": "ok" if ok else "error",
        "updated_at": datetime.now(timezone.utc),
    }
    if not ok:
        err_log = (src.get("error_log") or []) + [{
            "ts": datetime.now(timezone.utc),
            "scope": "test_connection",
            "message": msg,
        }]
        update_doc["error_log"] = err_log[-10:]
    update_doc["status"] = _post_test_status(src, creds, ok)
    await db.ie_data_sources.update_one({"id": source_id}, {"$set": update_doc})
    await audit(user.user_id, "ie_test_connection", source_id, {"ok": ok})

    return TestConnectionResult(ok=ok, message=msg, kind=connector_kind(source_id))


@router.post("/data-sources/{source_id}/sync", response_model=SyncResult)
async def sync_source_route(source_id: str, request: Request):
    user = await _require_superadmin(request)
    db = request.app.state.db
    src = await _load_source_or_404(db, source_id)
    if src.get("access_mode") == "manual_upload":
        raise HTTPException(400, "Las fuentes manual_upload no se sincronizan vía API — sube un archivo.")

    creds = decrypt_credentials(src.get("credentials"))
    connector = get_connector(src, creds)

    job_id = new_job_id()
    started = datetime.now(timezone.utc)
    await db.ie_ingestion_jobs.insert_one({
        "id": job_id, "source_id": source_id, "trigger": "manual",
        "status": "running", "started_at": started, "finished_at": None,
        "records_ingested": 0, "error_message": None,
    })

    error_msg: Optional[str] = None
    obs: List[Dict[str, Any]] = []
    try:
        obs = await connector.fetch()
    except Exception as e:  # noqa: BLE001 — connector contract says no raise but be defensive
        error_msg = f"Connector exception: {e}"
        obs = []

    is_stub = bool(obs) and all(o.get("is_stub") for o in obs)
    n = len(obs)

    if obs:
        # Tag every observation with the job id for audit.
        for o in obs:
            o["job_id"] = job_id
        await db.ie_raw_observations.insert_many(obs)

    finished = datetime.now(timezone.utc)
    duration_ms = int((finished - started).total_seconds() * 1000)
    job_status = "ok" if (n > 0 and not error_msg) else "error" if error_msg else "ok"

    await db.ie_ingestion_jobs.update_one({"id": job_id}, {"$set": {
        "status": job_status,
        "finished_at": finished,
        "records_ingested": n,
        "error_message": error_msg,
    }})

    next_status = _post_test_status(src, creds, n > 0 and not error_msg)
    if is_stub and next_status == "active":
        next_status = "stub"  # mock data → keep marked as stub so dashboard reflects reality
    await db.ie_data_sources.update_one({"id": source_id}, {"$set": {
        "last_sync": finished,
        "last_status": "ok" if (n > 0 and not error_msg) else "error",
        "status": next_status,
        "records_total": (src.get("records_total", 0) + n),
        "updated_at": finished,
    }})

    await audit(user.user_id, "ie_sync", source_id, {"job_id": job_id, "records": n, "is_stub": is_stub})
    return SyncResult(job_id=job_id, status=job_status, records_ingested=n,
                      is_stub=is_stub, duration_ms=duration_ms)



# ─── Phase A3 — manual uploads ───────────────────────────────────────────────
class UploadOut(BaseModel):
    upload: ManualUploadOut
    preview: Dict[str, Any]


class PreviewRequest(BaseModel):
    pass  # body unused; kept for symmetry


def _safe_filename(name: str) -> str:
    base = os.path.basename(name or "upload.bin")
    # Replace path-traversal characters; keep extension.
    cleaned = "".join(c if c.isalnum() or c in "._-" else "_" for c in base)
    return cleaned[:180] or "upload.bin"


async def _persist_observations_from_upload(db, source_id: str, upload_id: str, storage_path: str, original_name: str) -> int:
    """Parse the file via uploads_ie.parse_manual_upload and insert observations."""
    obs, err = parse_manual_upload(source_id, storage_path, original_name)
    if err:
        return 0
    if not obs:
        return 0
    for o in obs:
        o["upload_id"] = upload_id
    await db.ie_raw_observations.insert_many(obs)
    return len(obs)


@router.post("/data-sources/{source_id}/upload", response_model=UploadOut)
async def upload_for_source(
    source_id: str,
    request: Request,
    file: UploadFile = File(...),
    notes: Optional[str] = Form(None),
    period_start: Optional[str] = Form(None),
    period_end: Optional[str] = Form(None),
    screenshot: Optional[UploadFile] = File(None),
):
    user = await _require_superadmin(request)
    db = request.app.state.db
    src = await _load_source_or_404(db, source_id)
    if not src.get("supports_manual_upload"):
        raise HTTPException(400, "Esta fuente no admite upload manual.")

    # Validate filename + mime + ext early
    raw_name = file.filename or "upload.bin"
    if not is_allowed(raw_name, file.content_type or ""):
        raise HTTPException(400, f"Tipo de archivo no permitido. Extensiones aceptadas: {sorted(ALLOWED_EXTS)}")

    data = await file.read()
    if len(data) == 0:
        raise HTTPException(400, "Archivo vacío.")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"Archivo excede el límite de {MAX_UPLOAD_BYTES // 1024 // 1024} MB.")

    file_hash = sha256_bytes(data)
    existing = await db.ie_manual_uploads.find_one({"file_hash": file_hash}, {"_id": 0})
    if existing:
        raise HTTPException(409, f"Este archivo ya fue subido (upload_id={existing['id']}).")

    upload_id = f"upl_{file_hash[:16]}"
    safe = _safe_filename(raw_name)
    target = upload_dir() / f"{upload_id}__{safe}"
    target.write_bytes(data)

    # Optional screenshot (PNG/JPEG bytes from html-to-image)
    screenshot_path: Optional[str] = None
    if screenshot is not None:
        shot_bytes = await screenshot.read()
        if shot_bytes:
            shot_target = upload_dir() / f"{upload_id}__screenshot.png"
            shot_target.write_bytes(shot_bytes)
            screenshot_path = str(shot_target)

    # Period parsing — accept ISO dates, ignore on parse failure
    def _parse_iso(s: Optional[str]) -> Optional[datetime]:
        if not s:
            return None
        try:
            return datetime.fromisoformat(s.replace("Z", "+00:00"))
        except ValueError:
            return None

    now = datetime.now(timezone.utc)
    upload_doc = {
        "id": upload_id,
        "source_id": source_id,
        "uploader_user_id": user.user_id,
        "filename": raw_name,
        "file_size_bytes": len(data),
        "mime_type": file.content_type or "application/octet-stream",
        "file_hash": file_hash,
        "storage_path": str(target),
        "screenshot_path": screenshot_path,
        "upload_notes": notes,
        "period_start": _parse_iso(period_start),
        "period_end": _parse_iso(period_end),
        "status": "uploaded",
        "records_extracted": None,
        "superseded_by": None,
        "created_at": now,
        "processed_at": None,
    }
    await db.ie_manual_uploads.insert_one(upload_doc)

    # Build preview before parse so the modal shows live feedback
    preview = build_preview(raw_name, data)

    # Auto-process small files inline (≤10 MB). Bigger ones stay as "uploaded";
    # the operator can hit /process explicitly.
    if len(data) <= 10 * 1024 * 1024:
        await db.ie_manual_uploads.update_one({"id": upload_id}, {"$set": {"status": "processing"}})
        n = await _persist_observations_from_upload(db, source_id, upload_id, str(target), raw_name)
        await db.ie_manual_uploads.update_one({"id": upload_id}, {"$set": {
            "status": "ingested" if n > 0 else "uploaded",
            "records_extracted": n,
            "processed_at": datetime.now(timezone.utc),
        }})
        if n > 0:
            await db.ie_data_sources.update_one({"id": source_id}, {"$set": {
                "last_sync": datetime.now(timezone.utc),
                "last_status": "ok",
                "updated_at": datetime.now(timezone.utc),
            }, "$inc": {"records_total": n}})

    fresh = await db.ie_manual_uploads.find_one({"id": upload_id}, {"_id": 0})
    await audit(user.user_id, "ie_manual_upload", source_id, {
        "upload_id": upload_id, "size": len(data), "records": fresh.get("records_extracted"),
    })
    return UploadOut(upload=ManualUploadOut(**fresh), preview=preview)


@router.post("/uploads/{upload_id}/process", response_model=ManualUploadOut)
async def reprocess_upload(upload_id: str, request: Request):
    user = await _require_superadmin(request)
    db = request.app.state.db
    upl = await db.ie_manual_uploads.find_one({"id": upload_id}, {"_id": 0})
    if not upl:
        raise HTTPException(404, "Upload no encontrado")

    # Wipe previous observations from this upload before re-processing
    await db.ie_raw_observations.delete_many({"upload_id": upload_id})
    await db.ie_manual_uploads.update_one({"id": upload_id}, {"$set": {"status": "processing"}})

    n = await _persist_observations_from_upload(
        db, upl["source_id"], upload_id, upl["storage_path"], upl["filename"]
    )
    await db.ie_manual_uploads.update_one({"id": upload_id}, {"$set": {
        "status": "ingested" if n > 0 else "failed",
        "records_extracted": n,
        "processed_at": datetime.now(timezone.utc),
    }})

    await audit(user.user_id, "ie_upload_reprocess", upl["source_id"], {"upload_id": upload_id, "records": n})
    fresh = await db.ie_manual_uploads.find_one({"id": upload_id}, {"_id": 0})
    return ManualUploadOut(**fresh)


@router.get("/uploads/{upload_id}", response_model=ManualUploadOut)
async def get_upload(upload_id: str, request: Request):
    await _require_superadmin(request)
    db = request.app.state.db
    upl = await db.ie_manual_uploads.find_one({"id": upload_id}, {"_id": 0})
    if not upl:
        raise HTTPException(404, "Upload no encontrado")
    return ManualUploadOut(**upl)



@router.get("/uploads/{upload_id}/download")
async def download_upload(upload_id: str, request: Request):
    """Download the raw uploaded file. Role-gated. Returns the original file with proper headers."""
    user = await _require_superadmin(request)
    db = request.app.state.db
    upl = await db.ie_manual_uploads.find_one({"id": upload_id}, {"_id": 0})
    if not upl:
        raise HTTPException(404, "Upload no encontrado")

    storage_path = upl.get("storage_path")
    if not storage_path or not os.path.exists(storage_path):
        raise HTTPException(410, "Archivo ausente del storage (posiblemente movido o purgado).")

    # Verify on-disk hash still matches what we stored — alarms tampering.
    try:
        with open(storage_path, "rb") as fh:
            current_hash = sha256_bytes(fh.read())
    except OSError as e:
        raise HTTPException(500, f"No pude leer el archivo: {e}") from e

    if current_hash != upl.get("file_hash"):
        await db.ie_manual_uploads.update_one(
            {"id": upload_id},
            {"$set": {"status": "failed", "processed_at": datetime.now(timezone.utc)}},
        )
        raise HTTPException(409, "Hash on-disk no coincide con el original — archivo manipulado.")

    await audit(user.user_id, "ie_upload_download", upl["source_id"], {"upload_id": upload_id})
    return FileResponse(
        storage_path,
        media_type=upl.get("mime_type") or "application/octet-stream",
        filename=upl.get("filename") or upload_id,
        headers={"X-IE-Upload-Hash": current_hash},
    )


# ─── Phase A4 — cron triggers ────────────────────────────────────────────────
class CronTriggerIn(BaseModel):
    job: str  # "daily_ingestion" | "hourly_status"


class CronTriggerOut(BaseModel):
    job: str
    triggered_at: datetime
    summary: Any  # list for ingestion/status, dict for daily_score_recompute


@router.post("/cron/trigger", response_model=CronTriggerOut)
async def trigger_cron(payload: CronTriggerIn, request: Request):
    """Force-run a cron job from the UI (manual tick). Useful while the daily cron has not fired yet."""
    user = await _require_superadmin(request)
    db = request.app.state.db
    if payload.job not in ("daily_ingestion", "hourly_status", "daily_score_recompute"):
        raise HTTPException(400, "Job desconocido. Usa 'daily_ingestion', 'hourly_status' o 'daily_score_recompute'.")
    summary = await trigger_now(db, payload.job)
    await audit(user.user_id, "ie_cron_trigger", payload.job, {"results": summary})
    return CronTriggerOut(job=payload.job, triggered_at=datetime.now(timezone.utc), summary=summary if summary is not None else [])
