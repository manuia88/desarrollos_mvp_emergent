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
from fastapi import APIRouter, HTTPException, Request, Query
from pydantic import BaseModel, Field

from data_ie_sources import IE_DATA_SOURCES_SEED, initial_status_for


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
