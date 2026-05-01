"""Phase 7.11 — Google Drive Watch Service.

Per-tenant (development_id) Drive folder monitoring:
- OAuth flow (Google) → access + refresh token (encrypted Fernet via IE_FERNET_KEY).
- Folder picker (lists user's root folders).
- Cron 6h: list folder files, detect md5Checksum changes, download new/changed,
  pipe to existing 7.1 ingestion pipeline (which auto-triggers extraction 7.2 +
  cross-check 7.3 + auto-sync 7.5).
- Honest stub when GOOGLE_OAUTH_CLIENT_ID missing.
- Multi-tenant: each connection isolated by (development_id, user_id).
"""
from __future__ import annotations

import os
import re
import io
import json
import uuid
import logging
import asyncio
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from document_intelligence import _get_cipher as _di_cipher, DI_DOC_TYPES

log = logging.getLogger("dmx.drive")

DRIVE_SCOPES = [
    "https://www.googleapis.com/auth/drive.readonly",
]
GOOGLE_AUTH_URI = "https://accounts.google.com/o/oauth2/auth"
GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token"
GOOGLE_REVOKE_URI = "https://oauth2.googleapis.com/revoke"

CRON_INTERVAL_HOURS = 6


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _has_keys() -> bool:
    return bool(os.environ.get("GOOGLE_OAUTH_CLIENT_ID") and os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET"))


def _redirect_uri() -> str:
    explicit = os.environ.get("GOOGLE_OAUTH_REDIRECT_URI")
    if explicit:
        return explicit
    backend = os.environ.get("REACT_APP_BACKEND_URL") or os.environ.get("BACKEND_PUBLIC_URL")
    if backend:
        return f"{backend.rstrip('/')}/api/auth/google/drive-callback"
    return "/api/auth/google/drive-callback"


def _client_config() -> Dict[str, Any]:
    return {
        "web": {
            "client_id": os.environ["GOOGLE_OAUTH_CLIENT_ID"],
            "client_secret": os.environ["GOOGLE_OAUTH_CLIENT_SECRET"],
            "auth_uri": GOOGLE_AUTH_URI,
            "token_uri": GOOGLE_TOKEN_URI,
            "redirect_uris": [_redirect_uri()],
        }
    }


# ─── Fernet helpers ───────────────────────────────────────────────────────────
def _enc(s: Optional[str]) -> Optional[str]:
    if s is None:
        return None
    return _di_cipher().encrypt(s.encode("utf-8")).decode("utf-8")


def _dec(s: Optional[str]) -> Optional[str]:
    if s is None:
        return None
    try:
        return _di_cipher().decrypt(s.encode("utf-8")).decode("utf-8")
    except Exception:
        return None


# ─── State token (CSRF + dev_id + user_id) ───────────────────────────────────
def _make_state(dev_id: str, user_id: str) -> str:
    raw = json.dumps({"dev": dev_id, "uid": user_id, "ts": int(_now().timestamp())})
    return _di_cipher().encrypt(raw.encode("utf-8")).decode("utf-8")


def _read_state(state: str) -> Optional[Dict[str, Any]]:
    try:
        raw = _di_cipher().decrypt(state.encode("utf-8"))
        return json.loads(raw)
    except Exception:
        return None


# ─── Document type heuristics ─────────────────────────────────────────────────
DOC_TYPE_KEYWORDS = [
    (["lista", "precios", "tabulador"], "lp"),
    (["brochure"], "brochure"),
    (["escritura"], "escritura"),
    (["seduvi", "uso suelo", "uso_suelo", "uso-suelo"], "permiso_seduvi"),
    (["estudio", "suelo", "mecanica", "mecánica"], "estudio_suelo"),
    (["licencia", "construccion", "construcción"], "licencia_construccion"),
    (["predial"], "predial"),
    (["plano"], "plano_arquitectonico"),
    (["contrato"], "contrato_cv"),
    (["constancia", "fiscal"], "constancia_fiscal"),
]


def detect_doc_type(filename: str) -> str:
    n = (filename or "").lower()
    n = re.sub(r"[_\-.]+", " ", n)
    for keywords, dt in DOC_TYPE_KEYWORDS:
        for kw in keywords:
            if kw in n:
                if dt in DI_DOC_TYPES:
                    return dt
    return "otro" if "otro" in DI_DOC_TYPES else next(iter(DI_DOC_TYPES))


# ─── Mongo ────────────────────────────────────────────────────────────────────
async def ensure_drive_indexes(db) -> None:
    coll = db.dev_drive_connections
    await coll.create_index("development_id", unique=True)
    await coll.create_index("status")
    await coll.create_index("last_sync_at")


def _public_conn(c: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not c:
        return None
    out = {k: v for k, v in c.items() if k not in ("_id", "google_oauth_token_enc", "refresh_token_enc")}
    out["has_token"] = bool(c.get("google_oauth_token_enc"))
    out["has_refresh"] = bool(c.get("refresh_token_enc"))
    for k in ("created_at", "updated_at", "last_sync_at", "expires_at"):
        v = out.get(k)
        if isinstance(v, datetime):
            out[k] = v.isoformat()
    return out


# ─── Google API wrappers (sync; wrap in to_thread) ───────────────────────────
def _build_credentials(conn: Dict[str, Any]):
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request as GoogleRequest

    access = _dec(conn.get("google_oauth_token_enc"))
    refresh = _dec(conn.get("refresh_token_enc"))
    creds = Credentials(
        token=access,
        refresh_token=refresh,
        token_uri=GOOGLE_TOKEN_URI,
        client_id=os.environ["GOOGLE_OAUTH_CLIENT_ID"],
        client_secret=os.environ["GOOGLE_OAUTH_CLIENT_SECRET"],
        scopes=DRIVE_SCOPES,
    )
    if creds.expired and creds.refresh_token:
        creds.refresh(GoogleRequest())
    return creds


def _drive_service(conn: Dict[str, Any]):
    from googleapiclient.discovery import build
    creds = _build_credentials(conn)
    return build("drive", "v3", credentials=creds, cache_discovery=False)


def _list_root_folders_sync(conn: Dict[str, Any], page_size: int = 100) -> List[Dict[str, Any]]:
    svc = _drive_service(conn)
    q = "mimeType = 'application/vnd.google-apps.folder' and 'me' in owners and trashed = false"
    resp = svc.files().list(q=q, fields="files(id,name,modifiedTime)", pageSize=page_size).execute()
    return resp.get("files", []) or []


def _list_folder_contents_sync(conn: Dict[str, Any], folder_id: str) -> List[Dict[str, Any]]:
    svc = _drive_service(conn)
    q = f"'{folder_id}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'"
    fields = "files(id,name,mimeType,modifiedTime,md5Checksum,size)"
    files: List[Dict[str, Any]] = []
    page_token = None
    while True:
        resp = svc.files().list(
            q=q, fields=fields, pageSize=200, pageToken=page_token
        ).execute()
        files.extend(resp.get("files", []) or [])
        page_token = resp.get("nextPageToken")
        if not page_token:
            break
    return files


def _download_file_sync(conn: Dict[str, Any], file_id: str) -> bytes:
    from googleapiclient.http import MediaIoBaseDownload
    svc = _drive_service(conn)
    request = svc.files().get_media(fileId=file_id)
    buf = io.BytesIO()
    downloader = MediaIoBaseDownload(buf, request)
    done = False
    while not done:
        _status, done = downloader.next_chunk()
    return buf.getvalue()


# Google nativos → export mime + extension. All target PDF para que el pipeline
# OCR/Claude existing maneje uniforme (xlsx no es allowed_ext).
NATIVE_EXPORT_MAP: Dict[str, Tuple[str, str]] = {
    "application/vnd.google-apps.document":     ("application/pdf", "pdf"),
    "application/vnd.google-apps.spreadsheet":  ("application/pdf", "pdf"),
    "application/vnd.google-apps.presentation": ("application/pdf", "pdf"),
    "application/vnd.google-apps.drawing":      ("application/pdf", "pdf"),
}


def _export_native_doc_sync(conn: Dict[str, Any], file_id: str, native_mime: str) -> Tuple[bytes, str]:
    """Returns (bytes, target_extension). Raises if mime unsupported."""
    from googleapiclient.http import MediaIoBaseDownload
    target_mime, ext = NATIVE_EXPORT_MAP[native_mime]
    svc = _drive_service(conn)
    request = svc.files().export_media(fileId=file_id, mimeType=target_mime)
    buf = io.BytesIO()
    downloader = MediaIoBaseDownload(buf, request)
    done = False
    while not done:
        _status, done = downloader.next_chunk()
    return buf.getvalue(), ext


def _ensure_filename_extension(name: str, ext: str) -> str:
    """Append .{ext} if name doesn't already end with that extension."""
    if not name:
        return f"untitled.{ext}"
    if name.lower().endswith(f".{ext.lower()}"):
        return name
    return f"{name}.{ext}"


def _refresh_and_persist_token_sync(conn: Dict[str, Any]) -> Dict[str, Any]:
    """Returns updated conn fields {google_oauth_token_enc, expires_at}."""
    creds = _build_credentials(conn)
    return {
        "google_oauth_token_enc": _enc(creds.token),
        "expires_at": creds.expiry.replace(tzinfo=timezone.utc) if creds.expiry else None,
    }


def _revoke_token_sync(refresh_token: str) -> bool:
    import httpx
    try:
        r = httpx.post(GOOGLE_REVOKE_URI, params={"token": refresh_token}, timeout=10)
        return r.status_code in (200, 400)  # 400 if already revoked
    except Exception:
        return False


# ─── Watcher cron ─────────────────────────────────────────────────────────────
async def _sync_one_connection(db, conn: Dict[str, Any]) -> Dict[str, Any]:
    """Returns audit dict {dev_id, scanned, new, updated, errors}."""
    from routes_documents import _ingest_document_bytes
    dev_id = conn["development_id"]
    audit = {"dev_id": dev_id, "scanned": 0, "new": 0, "updated": 0, "errors": [], "started_at": _now().isoformat()}

    if not _has_keys():
        audit["errors"].append("GOOGLE_OAUTH_* keys missing")
        return audit

    try:
        files = await asyncio.to_thread(_list_folder_contents_sync, conn, conn["folder_id"])
    except Exception as e:
        log.exception(f"[drive] list_folder_contents failed dev={dev_id}: {e}")
        audit["errors"].append(f"list_failed: {type(e).__name__}: {e}")
        await db.dev_drive_connections.update_one(
            {"development_id": dev_id},
            {"$set": {"status": "error", "last_error": str(e), "updated_at": _now()}, "$push": {"error_log": {"ts": _now(), "msg": str(e)[:300]}}},
        )
        return audit

    audit["scanned"] = len(files)
    audit["skipped_unsupported"] = 0
    audit["exported_native"] = 0
    revisions: Dict[str, str] = dict(conn.get("last_revision_id") or {})

    for f in files:
        fid = f["id"]
        name = f.get("name") or "unnamed"
        mime = f.get("mimeType") or ""
        md5 = f.get("md5Checksum")
        modified_time = f.get("modifiedTime")
        is_native = mime in NATIVE_EXPORT_MAP

        # Compute revision tag: md5 for binary files, modifiedTime for Google natives.
        if md5:
            rev_tag = md5
        elif is_native and modified_time:
            rev_tag = f"native::{modified_time}"
        else:
            # Unsupported: no md5 and not a known native (e.g., shortcut, form)
            audit["skipped_unsupported"] += 1
            continue

        prev = revisions.get(fid)
        is_new = prev is None
        is_changed = (prev is not None and prev != rev_tag)
        if not (is_new or is_changed):
            continue

        try:
            if is_native:
                data, ext = await asyncio.to_thread(_export_native_doc_sync, conn, fid, mime)
                final_name = _ensure_filename_extension(name, ext)
                audit["exported_native"] += 1
            else:
                data = await asyncio.to_thread(_download_file_sync, conn, fid)
                final_name = name

            doc_type = detect_doc_type(final_name)
            user_id = conn.get("user_id") or "drive-watcher"
            res = await _ingest_document_bytes(
                db, dev_id,
                user_id=user_id, user_name="Drive Watcher", user_role="system",
                filename=final_name, data=data, doc_type=doc_type,
                upload_notes=f"Auto-imported from Google Drive folder '{conn.get('folder_name','')}'" + (" (native exported)" if is_native else ""),
                source="drive_watcher",
                source_metadata={
                    "drive_file_id": fid,
                    "drive_md5": md5,
                    "drive_mime": mime,
                    "drive_modified_time": modified_time,
                    "is_native_export": is_native,
                    "folder_id": conn["folder_id"],
                    "folder_name": conn.get("folder_name", ""),
                    "is_revision": is_changed,
                },
                schedule_ocr=True,
            )
            if res["action"] == "created":
                if is_changed:
                    audit["updated"] += 1
                else:
                    audit["new"] += 1
                revisions[fid] = rev_tag
            elif res["action"] == "duplicate":
                # Same content already ingested — track revision so we don't retry
                revisions[fid] = rev_tag
        except Exception as e:
            log.exception(f"[drive] ingest failed file={fid} name={name}: {e}")
            audit["errors"].append(f"{name}: {type(e).__name__}: {str(e)[:120]}")

    await db.dev_drive_connections.update_one(
        {"development_id": dev_id},
        {"$set": {
            "last_sync_at": _now(),
            "last_revision_id": revisions,
            "status": "connected" if not audit["errors"] else "error",
            "last_audit": audit,
            "updated_at": _now(),
        }},
    )
    audit["finished_at"] = _now().isoformat()
    return audit


async def run_drive_watcher_once(db) -> Dict[str, Any]:
    """Iterate all connected drives and sync each one."""
    if not _has_keys():
        return {"ok": False, "reason": "google_oauth_keys_missing", "synced": 0}
    cursor = db.dev_drive_connections.find({"status": {"$in": ["connected", "error"]}})
    audits = []
    async for conn in cursor:
        try:
            a = await _sync_one_connection(db, conn)
            audits.append(a)
        except Exception as e:
            log.exception(f"[drive] sync_one_connection unexpected error dev={conn.get('development_id')}: {e}")
            audits.append({"dev_id": conn.get("development_id"), "errors": [str(e)]})
    return {"ok": True, "synced": len(audits), "audits": audits, "ran_at": _now().isoformat()}


# ─── Routers ──────────────────────────────────────────────────────────────────
router = APIRouter(tags=["drive"])


def _check_dev_access(user, dev_id: str) -> None:
    """Multi-tenant guard. Reuses TENANT_DEV_MAP from routes_documents."""
    if not user:
        raise HTTPException(401, "Auth requerida")
    role = getattr(user, "role", None)
    if role == "superadmin":
        return
    if role not in ("developer_admin", "developer_member"):
        raise HTTPException(403, "Sólo superadmin o developer")
    from routes_documents import _allowed_dev_ids
    allowed = _allowed_dev_ids(user)
    if allowed == "*":
        return
    if dev_id not in allowed:
        raise HTTPException(403, f"Sin acceso a {dev_id}")


async def _get_user(request: Request):
    from server import get_current_user
    return await get_current_user(request)


# ─── 1. Get OAuth URL ─────────────────────────────────────────────────────────
@router.get("/api/superadmin/drive/oauth-url")
async def drive_oauth_url(development_id: str = Query(...), request: Request = None):
    user = await _get_user(request)
    _check_dev_access(user, development_id)
    if not _has_keys():
        return {
            "ok": False,
            "configured": False,
            "message": "Configura GOOGLE_OAUTH_CLIENT_ID y GOOGLE_OAUTH_CLIENT_SECRET en .env del backend.",
        }
    from google_auth_oauthlib.flow import Flow
    flow = Flow.from_client_config(_client_config(), scopes=DRIVE_SCOPES, redirect_uri=_redirect_uri())
    state = _make_state(development_id, user.user_id)
    auth_url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
        state=state,
    )
    return {"ok": True, "configured": True, "authorization_url": auth_url}


# ─── 2. OAuth callback ────────────────────────────────────────────────────────
@router.get("/api/auth/google/drive-callback")
async def drive_callback(
    request: Request,
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
):
    fe = os.environ.get("REACT_APP_BACKEND_URL") or os.environ.get("FRONTEND_URL") or ""
    if error:
        return RedirectResponse(f"{fe}/desarrollador?drive_error={error}")
    if not code or not state:
        raise HTTPException(400, "Faltan code/state")
    payload = _read_state(state)
    if not payload:
        raise HTTPException(400, "State inválido")
    dev_id = payload["dev"]
    user_id = payload["uid"]

    if not _has_keys():
        raise HTTPException(503, "GOOGLE_OAUTH_* no configurado")

    from google_auth_oauthlib.flow import Flow
    flow = Flow.from_client_config(_client_config(), scopes=None, redirect_uri=_redirect_uri())
    try:
        await asyncio.to_thread(flow.fetch_token, code=code)
    except Exception as e:
        raise HTTPException(400, f"OAuth fetch_token falló: {type(e).__name__}: {e}")
    creds = flow.credentials
    granted = set(creds.scopes or [])
    if "https://www.googleapis.com/auth/drive.readonly" not in granted and "https://www.googleapis.com/auth/drive" not in granted:
        raise HTTPException(400, f"Scopes insuficientes: {granted}")

    db = request.app.state.db
    now = _now()
    await db.dev_drive_connections.update_one(
        {"development_id": dev_id},
        {"$set": {
            "id": (await db.dev_drive_connections.find_one({"development_id": dev_id}, {"_id": 0, "id": 1}) or {}).get("id") or f"drvc_{uuid.uuid4().hex[:14]}",
            "development_id": dev_id,
            "user_id": user_id,
            "google_oauth_token_enc": _enc(creds.token),
            "refresh_token_enc": _enc(creds.refresh_token),
            "scopes": list(granted),
            "expires_at": creds.expiry.replace(tzinfo=timezone.utc) if creds.expiry else None,
            "folder_id": None,
            "folder_name": None,
            "status": "connected",
            "last_revision_id": {},
            "error_log": [],
            "updated_at": now,
        }, "$setOnInsert": {"created_at": now}},
        upsert=True,
    )
    return RedirectResponse(f"{fe}/desarrollador/desarrollos/{dev_id}/legajo?drive=connected&picker=1")


# ─── 3. Folder picker ─────────────────────────────────────────────────────────
@router.get("/api/superadmin/drive/{dev_id}/folders")
async def drive_list_folders(dev_id: str, request: Request):
    user = await _get_user(request)
    _check_dev_access(user, dev_id)
    db = request.app.state.db
    conn = await db.dev_drive_connections.find_one({"development_id": dev_id})
    if not conn:
        raise HTTPException(404, "Conexión Drive no encontrada")
    try:
        folders = await asyncio.to_thread(_list_root_folders_sync, conn)
        # Persist refreshed token if any
        upd = await asyncio.to_thread(_refresh_and_persist_token_sync, conn)
        await db.dev_drive_connections.update_one({"development_id": dev_id}, {"$set": {**upd, "updated_at": _now()}})
    except Exception as e:
        raise HTTPException(502, f"Drive list folders falló: {e}")
    return {"folders": [{"id": f["id"], "name": f["name"], "modifiedTime": f.get("modifiedTime")} for f in folders]}


# ─── 4. Set folder ────────────────────────────────────────────────────────────
class SetFolderIn(BaseModel):
    folder_id: str
    folder_name: Optional[str] = None


@router.post("/api/superadmin/drive/{dev_id}/folder")
async def drive_set_folder(dev_id: str, body: SetFolderIn, request: Request):
    user = await _get_user(request)
    _check_dev_access(user, dev_id)
    db = request.app.state.db
    conn = await db.dev_drive_connections.find_one({"development_id": dev_id})
    if not conn:
        raise HTTPException(404, "Conexión Drive no encontrada")
    await db.dev_drive_connections.update_one(
        {"development_id": dev_id},
        {"$set": {"folder_id": body.folder_id, "folder_name": body.folder_name, "status": "connected", "updated_at": _now()}},
    )
    return {"ok": True}


# ─── 5. Status ────────────────────────────────────────────────────────────────
@router.get("/api/superadmin/drive/{dev_id}/status")
async def drive_status(dev_id: str, request: Request):
    user = await _get_user(request)
    _check_dev_access(user, dev_id)
    db = request.app.state.db
    conn = await db.dev_drive_connections.find_one({"development_id": dev_id})
    return {"configured": _has_keys(), "connection": _public_conn(conn)}


# ─── 6. Sync now ──────────────────────────────────────────────────────────────
@router.post("/api/superadmin/drive/{dev_id}/sync-now")
async def drive_sync_now(dev_id: str, request: Request):
    user = await _get_user(request)
    _check_dev_access(user, dev_id)
    db = request.app.state.db
    conn = await db.dev_drive_connections.find_one({"development_id": dev_id})
    if not conn:
        raise HTTPException(404, "Conexión Drive no encontrada")
    if not conn.get("folder_id"):
        raise HTTPException(400, "Selecciona una carpeta primero")
    if not _has_keys():
        raise HTTPException(503, "GOOGLE_OAUTH_* no configurado")
    audit = await _sync_one_connection(db, conn)
    return {"ok": True, "audit": audit}


# ─── 7. Disconnect ────────────────────────────────────────────────────────────
@router.post("/api/superadmin/drive/{dev_id}/disconnect")
async def drive_disconnect(dev_id: str, request: Request):
    user = await _get_user(request)
    _check_dev_access(user, dev_id)
    db = request.app.state.db
    conn = await db.dev_drive_connections.find_one({"development_id": dev_id})
    if not conn:
        raise HTTPException(404, "Conexión Drive no encontrada")
    rt = _dec(conn.get("refresh_token_enc"))
    if rt:
        await asyncio.to_thread(_revoke_token_sync, rt)
    await db.dev_drive_connections.delete_one({"development_id": dev_id})
    return {"ok": True}


# ─── 8. Superadmin overview ───────────────────────────────────────────────────
@router.get("/api/superadmin/drive/connections")
async def drive_connections(request: Request):
    user = await _get_user(request)
    if not user or getattr(user, "role", None) != "superadmin":
        raise HTTPException(403, "Solo superadmin")
    db = request.app.state.db
    out = []
    async for c in db.dev_drive_connections.find({}):
        out.append(_public_conn(c))
    return {"configured": _has_keys(), "count": len(out), "connections": out}


# Developer multi-tenant aliases (mirror /api/superadmin/drive/* under /api/desarrollador/drive/*)
dev_alias = APIRouter(tags=["drive_dev"])
for path, fn in [
    ("/api/desarrollador/drive/oauth-url", drive_oauth_url),
    ("/api/desarrollador/drive/{dev_id}/status", drive_status),
    ("/api/desarrollador/drive/{dev_id}/folders", drive_list_folders),
    ("/api/desarrollador/drive/{dev_id}/sync-now", drive_sync_now),
    ("/api/desarrollador/drive/{dev_id}/disconnect", drive_disconnect),
    ("/api/desarrollador/drive/{dev_id}/folder", drive_set_folder),
]:
    pass  # placeholder; real aliases mounted explicitly below


@dev_alias.get("/api/desarrollador/drive/oauth-url")
async def _alias_oauth(development_id: str = Query(...), request: Request = None):
    return await drive_oauth_url(development_id, request)


@dev_alias.get("/api/desarrollador/drive/{dev_id}/status")
async def _alias_status(dev_id: str, request: Request):
    return await drive_status(dev_id, request)


@dev_alias.get("/api/desarrollador/drive/{dev_id}/folders")
async def _alias_folders(dev_id: str, request: Request):
    return await drive_list_folders(dev_id, request)


@dev_alias.post("/api/desarrollador/drive/{dev_id}/sync-now")
async def _alias_sync(dev_id: str, request: Request):
    return await drive_sync_now(dev_id, request)


@dev_alias.post("/api/desarrollador/drive/{dev_id}/disconnect")
async def _alias_disconnect(dev_id: str, request: Request):
    return await drive_disconnect(dev_id, request)


@dev_alias.post("/api/desarrollador/drive/{dev_id}/folder")
async def _alias_folder(dev_id: str, body: SetFolderIn, request: Request):
    return await drive_set_folder(dev_id, body, request)
