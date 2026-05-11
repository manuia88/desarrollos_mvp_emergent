"""W4.9.6 — 3D Gaussian Splatting Tour Engine.

Manages `unit_3dgs_scans` and `tour_3dgs_settings` collections.

Storage: filesystem at `/app/backend/storage/3dgs/{scan_id}/` (gitignored).
Future: Cloudflare R2 via TOUR3DGS_STORAGE_BUCKET env var (Wave 5).
"""
from __future__ import annotations

import hashlib
import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import luma_client

log = logging.getLogger("dmx.tour_3dgs_engine")

STORAGE_BASE = Path(os.environ.get("TOUR3DGS_STORAGE_PATH", "/app/backend/storage/3dgs"))
STORAGE_BASE.mkdir(parents=True, exist_ok=True)

ALLOWED_FORMATS = {"luma", "polycam", "upload_ply", "upload_spz", "upload_splat"}
ALLOWED_UPLOAD_EXTS = {"ply", "spz", "splat"}
MAX_UPLOAD_MB = 200
LFPDPPP_SALT = os.environ.get("LFPDPPP_SALT", "dmx_lfpdppp_2026")

DEFAULT_VIEWER_CONFIG: Dict[str, Any] = {
    "camera_init_position": [0, 1.6, 4],
    "camera_init_target": [0, 1.0, 0],
    "floor_y": 0,
    "auto_rotate": False,
    "auto_rotate_speed": 0.4,
    "exposure": 1.0,
}

DEFAULT_SETTINGS: Dict[str, Any] = {
    "default_viewer_theme": "cream",
    "default_ui_mode": "minimal",
    "enable_public_iframe": True,
    "embed_branding": True,
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def hash_ip(ip: str) -> str:
    return hashlib.sha256(f"{ip}:{LFPDPPP_SALT}".encode()).hexdigest()[:32]


def scan_dir(scan_id: str) -> Path:
    p = STORAGE_BASE / scan_id
    p.mkdir(parents=True, exist_ok=True)
    return p


# ─── Ownership ────────────────────────────────────────────────────────────────

async def _resolve_unit(db, unit_id: str) -> Optional[Dict[str, Any]]:
    try:
        u = await db.units.find_one({"$or": [{"id": unit_id}, {"unit_id": unit_id}]}, {"_id": 0})
        return u
    except Exception:
        return None


async def _user_can_manage(db, user: Dict[str, Any], unit_id: str, dev_id: Optional[str] = None) -> bool:
    role = user.get("role")
    if role == "superadmin":
        return True
    # Resolve dev from unit if needed
    if not dev_id:
        u = await _resolve_unit(db, unit_id)
        if u:
            dev_id = u.get("project_id") or u.get("development_id") or u.get("dev_id")
    user_dev = user.get("dev_org_id") or user.get("tenant_id")
    if role in ("developer_admin", "dev_admin", "developer"):
        return bool(user_dev) and (dev_id is None or user_dev == dev_id)
    if role in ("advisor", "asesor_admin"):
        # advisors can manage in projects they have access to (simplified ACL)
        return True
    return False


# ─── Register / process ──────────────────────────────────────────────────────

async def register_scan(
    db,
    user: Dict[str, Any],
    unit_id: str,
    source_format: str,
    luma_scan_id: Optional[str] = None,
    video_url: Optional[str] = None,
    project_slug: Optional[str] = None,
    dev_id: Optional[str] = None,
) -> Dict[str, Any]:
    if source_format not in ALLOWED_FORMATS:
        raise ValueError("invalid_source_format")
    if not await _user_can_manage(db, user, unit_id, dev_id):
        raise PermissionError("not_authorized")

    scan_id = str(uuid.uuid4())
    status = "pending"
    splat_url = ply_url = spz_url = thumb_url = ""
    quality = None

    if source_format == "luma":
        if not luma_scan_id and video_url:
            created = luma_client.create_scan(name=f"unit_{unit_id}", capture_video_url=video_url)
            luma_scan_id = created.get("luma_scan_id")
        if luma_scan_id:
            status = "processing"
            # Try fetching status now (stub returns ready)
            st = luma_client.get_scan_status(luma_scan_id)
            if st.get("status") == "ready":
                downloads = luma_client.download_assets(luma_scan_id, scan_dir(scan_id))
                splat_url = _asset_url(scan_id, "splat") if downloads.get("splat") else ""
                ply_url = _asset_url(scan_id, "ply") if downloads.get("ply") else ""
                spz_url = _asset_url(scan_id, "spz") if downloads.get("spz") else ""
                thumb_url = _asset_url(scan_id, "png") if downloads.get("png") else ""
                status = "ready"
                quality = 80

    doc = {
        "scan_id": scan_id,
        "unit_id": unit_id,
        "dev_id": dev_id or "",
        "project_slug": project_slug or "",
        "luma_scan_id": luma_scan_id or "",
        "status": status,
        "splat_url": splat_url,
        "ply_url": ply_url,
        "spz_url": spz_url,
        "thumbnail_url": thumb_url,
        "viewer_config": dict(DEFAULT_VIEWER_CONFIG),
        "captured_by_user_id": user.get("user_id"),
        "captured_at": _now_iso(),
        "file_size_kb": 0,
        "source_format": source_format,
        "quality_score": quality,
        "notes": "",
    }
    try:
        await db.unit_3dgs_scans.insert_one(dict(doc))
    except Exception as exc:
        log.warning(f"[engine] insert scan failed: {exc}")
    doc.pop("_id", None)
    return doc


async def upload_local_scan(
    db,
    user: Dict[str, Any],
    unit_id: str,
    file_bytes: bytes,
    filename: str,
    project_slug: Optional[str] = None,
    dev_id: Optional[str] = None,
) -> Dict[str, Any]:
    if not filename or "." not in filename:
        raise ValueError("invalid_filename")
    ext = filename.rsplit(".", 1)[-1].lower()
    if ext not in ALLOWED_UPLOAD_EXTS:
        raise ValueError("unsupported_format")
    if len(file_bytes) > MAX_UPLOAD_MB * 1024 * 1024:
        raise ValueError("file_too_large")
    if not await _user_can_manage(db, user, unit_id, dev_id):
        raise PermissionError("not_authorized")

    scan_id = str(uuid.uuid4())
    target = scan_dir(scan_id) / f"scene.{ext}"
    with open(target, "wb") as f:
        f.write(file_bytes)

    source_format = f"upload_{ext}"
    url_for_ext = _asset_url(scan_id, ext)
    doc = {
        "scan_id": scan_id,
        "unit_id": unit_id,
        "dev_id": dev_id or "",
        "project_slug": project_slug or "",
        "luma_scan_id": "",
        "status": "ready",
        "splat_url": url_for_ext if ext == "splat" else "",
        "ply_url": url_for_ext if ext == "ply" else "",
        "spz_url": url_for_ext if ext == "spz" else "",
        "thumbnail_url": "",
        "viewer_config": dict(DEFAULT_VIEWER_CONFIG),
        "captured_by_user_id": user.get("user_id"),
        "captured_at": _now_iso(),
        "file_size_kb": round(len(file_bytes) / 1024),
        "source_format": source_format,
        "quality_score": None,
        "notes": "",
    }
    try:
        await db.unit_3dgs_scans.insert_one(dict(doc))
    except Exception as exc:
        log.warning(f"[engine] upload insert failed: {exc}")
    doc.pop("_id", None)
    return doc


async def process_scan_async(db, scan_id: str) -> Dict[str, Any]:
    """Poll Luma until ready, download assets."""
    doc = await db.unit_3dgs_scans.find_one({"scan_id": scan_id}, {"_id": 0})
    if not doc:
        raise ValueError("scan_not_found")
    if doc.get("status") == "ready":
        return doc
    luma_id = doc.get("luma_scan_id")
    if not luma_id:
        return doc
    st = luma_client.get_scan_status(luma_id)
    if st.get("status") != "ready":
        await db.unit_3dgs_scans.update_one({"scan_id": scan_id}, {"$set": {"status": st.get("status", "processing")}})
        doc["status"] = st.get("status", "processing")
        return doc
    downloads = luma_client.download_assets(luma_id, scan_dir(scan_id))
    update = {
        "status": "ready",
        "splat_url": _asset_url(scan_id, "splat") if downloads.get("splat") else "",
        "ply_url": _asset_url(scan_id, "ply") if downloads.get("ply") else "",
        "spz_url": _asset_url(scan_id, "spz") if downloads.get("spz") else "",
        "thumbnail_url": _asset_url(scan_id, "png") if downloads.get("png") else "",
        "quality_score": 80,
    }
    await db.unit_3dgs_scans.update_one({"scan_id": scan_id}, {"$set": update})
    doc.update(update)
    return doc


# ─── Get / list / update ─────────────────────────────────────────────────────

async def get_scan(db, scan_id: str) -> Optional[Dict[str, Any]]:
    return await db.unit_3dgs_scans.find_one({"scan_id": scan_id}, {"_id": 0})


async def list_scans(
    db,
    unit_id: Optional[str] = None,
    dev_id: Optional[str] = None,
    project_slug: Optional[str] = None,
    status: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
) -> Dict[str, Any]:
    q: Dict[str, Any] = {}
    if unit_id:
        q["unit_id"] = unit_id
    if dev_id:
        q["dev_id"] = dev_id
    if project_slug:
        q["project_slug"] = project_slug
    if status:
        q["status"] = status
    skip = max(0, (page - 1) * limit)
    out: List[Dict[str, Any]] = []
    try:
        cursor = db.unit_3dgs_scans.find(q, {"_id": 0}).sort("captured_at", -1).skip(skip).limit(limit)
        async for d in cursor:
            out.append(d)
    except Exception as exc:
        log.warning(f"[engine] list_scans failed: {exc}")
    total = 0
    try:
        total = await db.unit_3dgs_scans.count_documents(q)
    except Exception:
        total = len(out)
    return {"items": out, "total": total, "page": page, "limit": limit}


async def update_viewer_config(db, user: Dict[str, Any], scan_id: str, config: Dict[str, Any]) -> Dict[str, Any]:
    doc = await get_scan(db, scan_id)
    if not doc:
        raise ValueError("scan_not_found")
    if not await _user_can_manage(db, user, doc["unit_id"], doc.get("dev_id")):
        raise PermissionError("not_authorized")
    merged = {**(doc.get("viewer_config") or DEFAULT_VIEWER_CONFIG), **(config or {})}
    await db.unit_3dgs_scans.update_one({"scan_id": scan_id}, {"$set": {"viewer_config": merged}})
    doc["viewer_config"] = merged
    return doc


async def delete_scan(db, user: Dict[str, Any], scan_id: str) -> bool:
    doc = await get_scan(db, scan_id)
    if not doc:
        raise ValueError("scan_not_found")
    if not await _user_can_manage(db, user, doc["unit_id"], doc.get("dev_id")):
        raise PermissionError("not_authorized")
    # Remove storage dir
    try:
        sd = scan_dir(scan_id)
        for f in sd.glob("*"):
            try:
                f.unlink()
            except Exception:
                pass
        try:
            sd.rmdir()
        except Exception:
            pass
    except Exception:
        pass
    try:
        await db.unit_3dgs_scans.delete_one({"scan_id": scan_id})
    except Exception:
        pass
    # Audit
    try:
        await db.audit_log.insert_one({
            "user_id": user.get("user_id"),
            "action": "tour_3dgs.delete",
            "resource": f"scan:{scan_id}",
            "ts": _now_iso(),
        })
    except Exception:
        pass
    return True


# ─── Regenerate thumbnail (F0.2·Sub-D) ───────────────────────────────────────

def _render_placeholder_thumbnail(scan_id: str, unit_id: str, target: Path) -> bool:
    """Genera un PNG 800x600 con gradiente indigo→rose + texto cream cuando
    Luma no tiene asset PNG. Best-effort; falla silenciosamente si Pillow no
    está disponible."""
    try:
        from PIL import Image, ImageDraw, ImageFont  # type: ignore
        W, H = 800, 600
        img = Image.new("RGB", (W, H), (6, 8, 15))
        draw = ImageDraw.Draw(img)
        # Horizontal gradient indigo (#6366F1) → rose (#EC4899)
        for x in range(W):
            t = x / max(W - 1, 1)
            r = int(99 + t * (236 - 99))
            g = int(102 + t * (72 - 102))
            b = int(241 + t * (153 - 241))
            draw.line([(x, 0), (x, 80)], fill=(r, g, b))
        # Title block
        try:
            font_big = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 38)
            font_sm = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 18)
        except Exception:
            font_big = ImageFont.load_default()
            font_sm = ImageFont.load_default()
        draw.text((40, 140), "DMX · Tour 3D", fill=(240, 235, 224), font=font_big)
        draw.text((40, 200), f"Unit: {unit_id[:30]}", fill=(160, 164, 176), font=font_sm)
        draw.text((40, 230), f"Scan: {scan_id[:8]}", fill=(160, 164, 176), font=font_sm)
        draw.text((40, H - 60), "Vista previa generada · pendiente render Luma", fill=(160, 164, 176), font=font_sm)
        img.save(str(target), format="PNG", optimize=True)
        return True
    except Exception as exc:
        log.warning(f"[3dgs·placeholder] Pillow render failed: {exc}")
        return False


async def regenerate_thumbnail(db, user: Dict[str, Any], scan_id: str) -> Dict[str, Any]:
    """F0.2·Sub-D — Regenera thumbnail.png para un scan existente.

    Estrategias (orden):
      1. Luma scan ready → vuelve a descargar asset PNG.
      2. Upload local (sin PNG) → genera placeholder con gradiente DMX (Pillow).
    Devuelve scan doc actualizado; raise PermissionError/ValueError.
    """
    doc = await get_scan(db, scan_id)
    if not doc:
        raise ValueError("scan_not_found")
    if not await _user_can_manage(db, user, doc["unit_id"], doc.get("dev_id")):
        raise PermissionError("not_authorized")

    sd = scan_dir(scan_id)
    target = sd / "scene.png"
    regenerated = False
    source = None

    luma_id = doc.get("luma_scan_id")
    if luma_id:
        try:
            st = luma_client.get_scan_status(luma_id)
            if st.get("status") == "ready":
                downloads = luma_client.download_assets(luma_id, sd)
                if downloads.get("png") and target.exists():
                    regenerated = True
                    source = "luma"
        except Exception as exc:
            log.warning(f"[3dgs·regen_thumb] luma fetch failed scan={scan_id}: {exc}")

    if not regenerated:
        ok = _render_placeholder_thumbnail(scan_id, doc.get("unit_id", ""), target)
        if ok:
            regenerated = True
            source = "placeholder"

    if not regenerated:
        raise RuntimeError("thumbnail_regenerate_failed")

    thumb_url = _asset_url(scan_id, "png")
    update = {
        "thumbnail_url": thumb_url,
        "last_thumbnail_at": _now_iso(),
    }
    try:
        await db.unit_3dgs_scans.update_one(
            {"scan_id": scan_id},
            {"$set": update, "$inc": {"thumbnail_regenerate_count": 1}},
        )
    except Exception as exc:
        log.warning(f"[3dgs·regen_thumb] mongo update failed: {exc}")
    try:
        await db.audit_log.insert_one({
            "user_id": user.get("user_id"),
            "action": "tour_3dgs.thumbnail_regenerate",
            "resource": f"scan:{scan_id}",
            "ts": _now_iso(),
            "payload": {"source": source},
        })
    except Exception:
        pass
    doc.update(update)
    return doc


# ─── Settings ────────────────────────────────────────────────────────────────

async def get_settings(db, dev_id: str) -> Dict[str, Any]:
    doc = await db.tour_3dgs_settings.find_one({"dev_id": dev_id}, {"_id": 0})
    if not doc:
        return {"dev_id": dev_id, **DEFAULT_SETTINGS}
    return doc


async def update_settings(db, user: Dict[str, Any], dev_id: str, settings: Dict[str, Any]) -> Dict[str, Any]:
    role = user.get("role")
    user_dev = user.get("dev_org_id") or user.get("tenant_id")
    if role != "superadmin" and not (role in ("developer_admin", "dev_admin") and user_dev == dev_id):
        raise PermissionError("not_authorized")
    cur = await get_settings(db, dev_id)
    merged = {**cur, **(settings or {}), "dev_id": dev_id}
    await db.tour_3dgs_settings.update_one(
        {"dev_id": dev_id}, {"$set": merged}, upsert=True
    )
    merged.pop("_id", None)
    return merged


# ─── Asset URLs ──────────────────────────────────────────────────────────────

def _asset_url(scan_id: str, ext: str) -> str:
    return f"/api/tour-3dgs/scans/{scan_id}/asset/scene.{ext}"


def resolve_asset_path(scan_id: str, fmt: str, ext: str) -> Optional[Path]:
    """fmt+ext used together (we keep them separate in the URL signature)."""
    sd = scan_dir(scan_id)
    # Whitelist
    if ext not in {"splat", "ply", "spz", "png"}:
        return None
    name = f"{fmt}.{ext}" if fmt and fmt != "scene" else f"scene.{ext}"
    p = sd / name
    if not p.exists():
        # Try thumbnail.png explicitly
        if ext == "png":
            alt = sd / "thumbnail.png"
            if alt.exists():
                return alt
        return None
    return p


async def ensure_tour_3dgs_indexes(db) -> None:
    try:
        await db.unit_3dgs_scans.create_index("unit_id")
        await db.unit_3dgs_scans.create_index([("project_slug", 1), ("status", 1)])
        await db.unit_3dgs_scans.create_index([("captured_at", -1)])
        await db.unit_3dgs_scans.create_index("scan_id", unique=True)
        await db.tour_3dgs_settings.create_index("dev_id", unique=True)
    except Exception as exc:
        log.warning(f"[engine] index create failed: {exc}")
