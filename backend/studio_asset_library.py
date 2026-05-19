"""W5.22 Z.1 Sub-C — Studio Asset Library + Mood Board.

Assets: photo/video/pdf/3dgs_scan · presigned PUT R2 5min · max 200MB.
3DGS: upload directo sin re-encoding.
Mood boards: agrupacion de assets por project · color_palette[] extraida.

Collections:
    db.studio_assets        — (user_id, project_id, asset_type) indexed
    db.mood_boards          — (user_id, project_id) indexed
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.studio_asset_library")

R2_BUCKET = os.environ.get("CLOUDFLARE_R2_BUCKET", "dmx-studio-assets")
R2_ACCOUNT = os.environ.get("CLOUDFLARE_R2_ACCOUNT_ID", "")
R2_KEY = os.environ.get("CLOUDFLARE_R2_ACCESS_KEY", "")
R2_SECRET = os.environ.get("CLOUDFLARE_R2_SECRET_KEY", "")
R2_PUBLIC_URL = os.environ.get("CLOUDFLARE_R2_PUBLIC_URL", "").rstrip("/")


def _make_public_url(r2_key: str) -> str:
    """Construye URL pública para visualizar asset.
    Prioridad: CLOUDFLARE_R2_PUBLIC_URL (R2.dev o custom domain) → fallback S3 API (NO pública · solo signed reads).
    """
    if R2_PUBLIC_URL:
        return f"{R2_PUBLIC_URL}/{r2_key}"
    return f"https://{R2_BUCKET}.{R2_ACCOUNT}.r2.cloudflarestorage.com/{r2_key}"

MAX_ASSET_SIZE = 200 * 1024 * 1024  # 200MB
ASSET_TYPES = ("photo", "video", "pdf", "3dgs_scan")

ALLOWED_MIMES = {
    "photo": {"image/png", "image/jpeg", "image/webp", "image/avif"},
    "video": {"video/mp4", "video/quicktime", "video/webm"},
    "pdf":   {"application/pdf"},
    "3dgs_scan": {"application/octet-stream", "model/gltf-binary", "application/zip"},
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso() -> str:
    return _now().isoformat()


def _uid(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def _r2_configured() -> bool:
    return bool(R2_ACCOUNT and R2_KEY and R2_SECRET)


def _safe_ext(filename: str) -> str:
    base = (filename or "").rsplit(".", 1)
    if len(base) != 2:
        return "bin"
    ext = base[1].lower().strip()
    return ext[:8] if ext else "bin"


# ─── Presigned URLs ──────────────────────────────────────────────────────────
def issue_asset_upload(*, user_id: str, asset_type: str,
                      filename: str, mime: str, size_bytes: int) -> Dict[str, Any]:
    """Genera presigned PUT URL R2 5min para asset upload."""
    if asset_type not in ASSET_TYPES:
        raise ValueError(f"asset_type invalido: {asset_type}")
    allowed = ALLOWED_MIMES.get(asset_type, set())
    if mime not in allowed and asset_type != "3dgs_scan":
        raise ValueError(f"MIME no permitido para {asset_type}: {mime}")
    if size_bytes > MAX_ASSET_SIZE:
        raise ValueError(f"Archivo muy grande: {size_bytes} bytes (max {MAX_ASSET_SIZE})")
    if size_bytes <= 0:
        raise ValueError("Tamano de archivo invalido")

    ext = _safe_ext(filename)
    r2_key = f"assets/{user_id}/{asset_type}/{uuid.uuid4().hex[:10]}.{ext}"

    if not _r2_configured():
        return {"r2_key": r2_key, "presigned_url": None, "public_url": None,
                "mode": "stub", "expires_in_s": 300}
    try:
        import boto3
        from botocore.client import Config as BotoConfig
        client = boto3.client(
            "s3",
            endpoint_url=f"https://{R2_ACCOUNT}.r2.cloudflarestorage.com",
            aws_access_key_id=R2_KEY,
            aws_secret_access_key=R2_SECRET,
            config=BotoConfig(signature_version="s3v4"),
            region_name="auto",
        )
        url = client.generate_presigned_url(
            "put_object",
            Params={"Bucket": R2_BUCKET, "Key": r2_key, "ContentType": mime},
            ExpiresIn=300,
        )
        public_url = _make_public_url(r2_key)
        return {"r2_key": r2_key, "presigned_url": url, "public_url": public_url,
                "mode": "live", "expires_in_s": 300}
    except Exception as exc:
        log.warning(f"[asset] R2 presign failed (fallback stub): {exc}")
        return {"r2_key": r2_key, "presigned_url": None, "public_url": None,
                "mode": "stub_fallback", "expires_in_s": 300}


# ─── Assets CRUD ─────────────────────────────────────────────────────────────
async def confirm_asset(db, *, user_id: str, tenant_id: str,
                       project_id: Optional[str],
                       asset_type: str, r2_key: str, r2_url: Optional[str],
                       filename: str, size_bytes: int, mime: str,
                       width: Optional[int] = None, height: Optional[int] = None,
                       duration_s: Optional[float] = None,
                       tags: Optional[List[str]] = None) -> Dict[str, Any]:
    if asset_type not in ASSET_TYPES:
        raise ValueError(f"asset_type invalido: {asset_type}")
    doc = {
        "id": _uid("ast"),
        "tenant_id": tenant_id,
        "user_id": user_id,
        "project_id": project_id,
        "asset_type": asset_type,
        "r2_key": r2_key,
        "r2_url": r2_url,
        "filename": filename[:200],
        "size_bytes": int(size_bytes),
        "mime": mime[:80],
        "width": width, "height": height, "duration_s": duration_s,
        "tags": [t[:40] for t in (tags or [])][:20],
        "deleted_at": None,
        "created_at": _iso(),
    }
    await db.studio_assets.insert_one(dict(doc))
    return doc


async def list_assets(db, *, user_id: str,
                     project_id: Optional[str] = None,
                     asset_type: Optional[str] = None,
                     tags: Optional[List[str]] = None,
                     search: Optional[str] = None,
                     limit: int = 50, skip: int = 0) -> Dict[str, Any]:
    q: Dict[str, Any] = {"user_id": user_id, "deleted_at": None}
    if project_id:
        q["project_id"] = project_id
    if asset_type:
        q["asset_type"] = asset_type
    if tags:
        q["tags"] = {"$in": tags}
    if search:
        q["filename"] = {"$regex": search, "$options": "i"}
    cur = db.studio_assets.find(q, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit)
    items = [d async for d in cur]
    # Reconstruir r2_url al vuelo (auto-fix assets viejos con URL S3 API rota)
    for item in items:
        if item.get("r2_key"):
            item["r2_url"] = _make_public_url(item["r2_key"])
    total = await db.studio_assets.count_documents(q)
    return {"items": items, "total": total, "limit": limit, "skip": skip}


async def get_asset(db, asset_id: str, user_id: str) -> Optional[Dict[str, Any]]:
    doc = await db.studio_assets.find_one(
        {"id": asset_id, "user_id": user_id, "deleted_at": None}, {"_id": 0},
    )
    if doc and doc.get("r2_key"):
        doc["r2_url"] = _make_public_url(doc["r2_key"])
    return doc


async def soft_delete_asset(db, asset_id: str, user_id: str) -> bool:
    res = await db.studio_assets.update_one(
        {"id": asset_id, "user_id": user_id, "deleted_at": None},
        {"$set": {"deleted_at": _iso()}},
    )
    return res.modified_count > 0


# ─── Mood Boards ─────────────────────────────────────────────────────────────
async def create_mood_board(db, *, tenant_id: str, user_id: str,
                           project_id: str, name: str,
                           description: str = "",
                           asset_ids: Optional[List[str]] = None,
                           color_palette: Optional[List[str]] = None) -> Dict[str, Any]:
    now = _iso()
    doc = {
        "id": _uid("mb"),
        "tenant_id": tenant_id,
        "user_id": user_id,
        "project_id": project_id,
        "name": name[:120],
        "description": description[:600],
        "asset_ids": list((asset_ids or [])[:80]),
        "color_palette": [c[:12] for c in (color_palette or [])][:5],
        "created_at": now,
        "updated_at": now,
    }
    await db.mood_boards.insert_one(dict(doc))
    return doc


async def list_mood_boards(db, *, user_id: str,
                          project_id: Optional[str] = None) -> List[Dict[str, Any]]:
    q: Dict[str, Any] = {"user_id": user_id}
    if project_id:
        q["project_id"] = project_id
    cur = db.mood_boards.find(q, {"_id": 0}).sort("updated_at", -1)
    return [d async for d in cur]


async def get_mood_board(db, board_id: str, user_id: str) -> Optional[Dict[str, Any]]:
    return await db.mood_boards.find_one(
        {"id": board_id, "user_id": user_id}, {"_id": 0},
    )


async def update_mood_board(db, *, board_id: str, user_id: str,
                           updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    target = await get_mood_board(db, board_id, user_id)
    if not target:
        return None
    allowed_keys = {"name", "description", "asset_ids", "color_palette"}
    upd = {k: v for k, v in updates.items() if k in allowed_keys and v is not None}
    if "asset_ids" in upd:
        upd["asset_ids"] = list(upd["asset_ids"])[:80]
    if "color_palette" in upd:
        upd["color_palette"] = [c[:12] for c in upd["color_palette"]][:5]
    if "name" in upd:
        upd["name"] = upd["name"][:120]
    if "description" in upd:
        upd["description"] = upd["description"][:600]
    upd["updated_at"] = _iso()
    await db.mood_boards.update_one({"id": board_id, "user_id": user_id}, {"$set": upd})
    return await get_mood_board(db, board_id, user_id)


async def delete_mood_board(db, board_id: str, user_id: str) -> bool:
    res = await db.mood_boards.delete_one({"id": board_id, "user_id": user_id})
    return res.deleted_count > 0


# ─── Indexes ─────────────────────────────────────────────────────────────────
async def ensure_indexes(db) -> None:
    try:
        await db.studio_assets.create_index(
            [("user_id", 1), ("project_id", 1), ("asset_type", 1)], background=True,
        )
        await db.studio_assets.create_index([("user_id", 1), ("created_at", -1)], background=True)
        await db.studio_assets.create_index("id", unique=True, background=True)
        await db.mood_boards.create_index(
            [("user_id", 1), ("project_id", 1)], background=True,
        )
        await db.mood_boards.create_index("id", unique=True, background=True)
    except Exception as exc:
        log.warning(f"[asset_library] ensure_indexes warning: {exc}")
