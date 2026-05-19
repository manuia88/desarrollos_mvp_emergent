"""W5.22 Z.1 Sub-A — Studio Brand Kit Engine.

Brand kits per (tenant_id, user_id, variant_key). Logo upload via Cloudflare R2
presigned PUT (1h expiry · max 5MB · PNG/JPG/SVG). Si R2 no configurado,
genera URLs stub para desarrollo local (FAIL-SOFT).

Collection: db.brand_kits
Unique index: (tenant_id, user_id, variant_key)
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.studio_brand_kit")

ALLOWED_LOGO_MIMES = {"image/png", "image/jpeg", "image/svg+xml"}
MAX_LOGO_SIZE = 5 * 1024 * 1024  # 5MB
VARIANTS = ("dev", "asesor", "inmobiliaria", "dmx")

R2_BUCKET = os.environ.get("CLOUDFLARE_R2_BUCKET", "dmx-studio-assets")
R2_ACCOUNT = os.environ.get("CLOUDFLARE_R2_ACCOUNT_ID", "")
R2_KEY = os.environ.get("CLOUDFLARE_R2_ACCESS_KEY", "")
R2_SECRET = os.environ.get("CLOUDFLARE_R2_SECRET_KEY", "")

# Default DMX palette per variant (seedeable al primer GET)
DEFAULT_VARIANTS: List[Dict[str, Any]] = [
    {"variant_key": "dev",
     "color_primary": "#6366F1", "color_secondary": "#EC4899", "color_accent": "#F0EBE0",
     "disclaimer_text": "Renders ilustrativos. Especificaciones sujetas a cambio sin previo aviso.",
     "cta_default": "Agenda tu visita", "footer_legal": "DesarrollosMX (c) 2026"},
    {"variant_key": "asesor",
     "color_primary": "#EC4899", "color_secondary": "#6366F1", "color_accent": "#F0EBE0",
     "disclaimer_text": "Tu asesor inmobiliario certificado.",
     "cta_default": "Hablemos por WhatsApp", "footer_legal": "Asesor DMX (c) 2026"},
    {"variant_key": "inmobiliaria",
     "color_primary": "#22C55E", "color_secondary": "#6366F1", "color_accent": "#F0EBE0",
     "disclaimer_text": "Inmobiliaria DMX certificada.",
     "cta_default": "Conoce nuestro portfolio", "footer_legal": "Inmobiliaria (c) 2026"},
    {"variant_key": "dmx",
     "color_primary": "#06080F", "color_secondary": "#F0EBE0", "color_accent": "#6366F1",
     "disclaimer_text": "Inteligencia inmobiliaria CDMX.",
     "cta_default": "Explora el mercado", "footer_legal": "DesarrollosMX (c) 2026"},
]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso() -> str:
    return _now().isoformat()


def _uid() -> str:
    return "bk_" + uuid.uuid4().hex[:12]


def _r2_configured() -> bool:
    return bool(R2_ACCOUNT and R2_KEY and R2_SECRET)


def _generate_logo_presigned(file_ext: str, user_id: str) -> Dict[str, Any]:
    """Genera presigned PUT URL para R2. FAIL-SOFT si R2 no configurado.

    En desarrollo local sin R2 vars, retorna stub URL que el frontend puede
    detectar y omitir el upload. Esto evita 500 en entornos de demo.
    """
    safe_ext = (file_ext or "").lstrip(".").lower()
    if safe_ext not in ("png", "jpg", "jpeg", "svg"):
        safe_ext = "png"
    r2_key = f"brand-kits/{user_id}/{uuid.uuid4().hex[:10]}.{safe_ext}"
    if not _r2_configured():
        return {
            "r2_key": r2_key,
            "presigned_url": None,
            "public_url": None,
            "mode": "stub",
            "expires_in_s": 3600,
        }
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
            Params={"Bucket": R2_BUCKET, "Key": r2_key},
            ExpiresIn=3600,
        )
        public_url = f"https://{R2_BUCKET}.{R2_ACCOUNT}.r2.cloudflarestorage.com/{r2_key}"
        return {
            "r2_key": r2_key, "presigned_url": url, "public_url": public_url,
            "mode": "live", "expires_in_s": 3600,
        }
    except Exception as exc:
        log.warning(f"[brand_kit] R2 presign failed (fallback stub): {exc}")
        return {
            "r2_key": r2_key, "presigned_url": None, "public_url": None,
            "mode": "stub_fallback", "expires_in_s": 3600,
        }


def validate_logo_upload(mime: str, size_bytes: int) -> Optional[str]:
    """Retorna None si OK, o mensaje de error si invalido."""
    if mime not in ALLOWED_LOGO_MIMES:
        return f"Tipo MIME no permitido: {mime}. Permitidos: PNG, JPG, SVG."
    if size_bytes > MAX_LOGO_SIZE:
        return f"Archivo muy grande: {size_bytes} bytes (max {MAX_LOGO_SIZE})."
    if size_bytes <= 0:
        return "Tamano de archivo invalido."
    return None


async def seed_default_variants(db, tenant_id: str, user_id: str) -> List[Dict[str, Any]]:
    """Crea las 4 variants default si user no tiene records aun. Idempotente."""
    existing = await db.brand_kits.count_documents({"user_id": user_id})
    if existing > 0:
        return await list_user_kits(db, user_id)
    now = _iso()
    docs: List[Dict[str, Any]] = []
    for v in DEFAULT_VARIANTS:
        doc = {
            "id": _uid(),
            "tenant_id": tenant_id,
            "user_id": user_id,
            "variant_key": v["variant_key"],
            "logo_r2_key": None,
            "logo_url": None,
            "color_primary": v["color_primary"],
            "color_secondary": v["color_secondary"],
            "color_accent": v["color_accent"],
            "font_heading": "Outfit",
            "font_body": "DM Sans",
            "disclaimer_text": v["disclaimer_text"],
            "cta_default": v["cta_default"],
            "footer_legal": v["footer_legal"],
            "is_active": v["variant_key"] == "dev",
            "created_at": now,
            "updated_at": now,
        }
        docs.append(doc)
    try:
        await db.brand_kits.insert_many(docs)
    except Exception as exc:
        log.warning(f"[brand_kit] seed failed: {exc}")
    return await list_user_kits(db, user_id)


async def list_user_kits(db, user_id: str) -> List[Dict[str, Any]]:
    cur = db.brand_kits.find({"user_id": user_id}, {"_id": 0}).sort("variant_key", 1)
    return [d async for d in cur]


async def get_kit(db, kit_id: str, user_id: str) -> Optional[Dict[str, Any]]:
    return await db.brand_kits.find_one(
        {"id": kit_id, "user_id": user_id}, {"_id": 0},
    )


async def upsert_kit(db, *, tenant_id: str, user_id: str,
                     variant_key: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    if variant_key not in VARIANTS:
        raise ValueError(f"variant_key invalido: {variant_key}. Permitidos: {VARIANTS}")
    now = _iso()
    existing = await db.brand_kits.find_one(
        {"tenant_id": tenant_id, "user_id": user_id, "variant_key": variant_key},
        {"_id": 0},
    )
    base = {
        "tenant_id": tenant_id,
        "user_id": user_id,
        "variant_key": variant_key,
        "logo_r2_key": payload.get("logo_r2_key"),
        "logo_url": payload.get("logo_url"),
        "color_primary": payload.get("color_primary") or "#6366F1",
        "color_secondary": payload.get("color_secondary") or "#EC4899",
        "color_accent": payload.get("color_accent") or "#F0EBE0",
        "font_heading": payload.get("font_heading") or "Outfit",
        "font_body": payload.get("font_body") or "DM Sans",
        "disclaimer_text": payload.get("disclaimer_text") or "",
        "cta_default": payload.get("cta_default") or "Conoce mas",
        "footer_legal": payload.get("footer_legal") or "",
        "updated_at": now,
    }
    if existing:
        await db.brand_kits.update_one(
            {"id": existing["id"]}, {"$set": base},
        )
        return await get_kit(db, existing["id"], user_id) or {**existing, **base}
    base["id"] = _uid()
    base["is_active"] = bool(payload.get("is_active"))
    base["created_at"] = now
    await db.brand_kits.insert_one(dict(base))
    return base


async def activate_kit(db, kit_id: str, user_id: str) -> Optional[Dict[str, Any]]:
    target = await get_kit(db, kit_id, user_id)
    if not target:
        return None
    await db.brand_kits.update_many({"user_id": user_id}, {"$set": {"is_active": False}})
    await db.brand_kits.update_one({"id": kit_id, "user_id": user_id}, {"$set": {"is_active": True, "updated_at": _iso()}})
    return await get_kit(db, kit_id, user_id)


async def delete_kit(db, kit_id: str, user_id: str) -> bool:
    res = await db.brand_kits.delete_one({"id": kit_id, "user_id": user_id})
    return res.deleted_count > 0


def issue_logo_upload(user_id: str, file_ext: str) -> Dict[str, Any]:
    """Genera presigned PUT URL para logo. Side-effect free."""
    return _generate_logo_presigned(file_ext, user_id)


async def ensure_indexes(db) -> None:
    try:
        await db.brand_kits.create_index(
            [("tenant_id", 1), ("user_id", 1), ("variant_key", 1)],
            unique=True, background=True,
        )
        await db.brand_kits.create_index([("user_id", 1), ("is_active", 1)], background=True)
    except Exception as exc:
        log.warning(f"[brand_kit] ensure_indexes warning: {exc}")
