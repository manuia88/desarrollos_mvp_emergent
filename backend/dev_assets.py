"""Phase 7.6 — Asset pipeline (Fotos, Planos thumbnails, Tour 360°).

Public assets (NO Fernet cifrado — son para el marketplace).

Endpoints registrados en routes_documents.py por consistencia con el resto del módulo DI.
"""

from __future__ import annotations

import os
import io
import uuid
import base64
import hashlib
import logging
import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.di.assets")

ASSET_UPLOAD_DIR = Path(os.environ.get("ASSET_UPLOAD_DIR", "/app/backend/uploads/dev_assets"))
ASSET_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

ASSET_MAX_FILE_BYTES = 12 * 1024 * 1024  # 12 MB per image
ASSET_MAX_BATCH = 20

ASSET_TYPES = {"foto_hero", "foto_render", "foto_unidad_modelo", "plano_thumbnail", "tour_360", "video", "brochure", "foto_avance"}
# Allow-list de tipos SEGUROS para el comprador (marketing). Lo que no esté aquí (planos
# técnicos, futuros tipos internos) NUNCA se expone al público. Candado del lado servidor:
# no se confía en que el front pida el tipo correcto.
PUBLIC_ASSET_TYPES = {"foto_hero", "foto_render", "foto_unidad_modelo", "tour_360", "video", "brochure", "foto_avance"}
# Orden de preferencia para elegir la foto de portada (hero) que se muestra en los listados.
HERO_PREFERENCE = ("foto_hero", "foto_render", "foto_unidad_modelo", "foto_avance")
AI_CATEGORIES = {"sala", "cocina", "recamara", "bano", "fachada", "exterior", "amenidad", "plano"}

ALLOWED_IMG_EXT = {"jpg", "jpeg", "png", "webp"}

CATEGORIZE_MODEL = "claude-sonnet-4-5-20250929"


def _now():
    return datetime.now(timezone.utc)


def _mk_id():
    return f"asset_{uuid.uuid4().hex[:14]}"


# ─── Mongo indexes ────────────────────────────────────────────────────────────
async def ensure_asset_indexes(db) -> None:
    coll = db.dev_assets
    await coll.create_index([("development_id", 1), ("asset_type", 1), ("order_index", 1)])
    await coll.create_index("id", unique=True)
    await coll.create_index("file_hash")


# ─── Watermark ────────────────────────────────────────────────────────────────
def watermark_image(data: bytes, mime_type: str = "image/jpeg") -> bytes:
    """Overlay 'DesarrollosMX' text bottom-right corner. Returns bytes."""
    try:
        from PIL import Image, ImageDraw, ImageFont  # type: ignore
    except Exception:
        return data
    try:
        img = Image.open(io.BytesIO(data))
        if img.mode not in ("RGB", "RGBA"):
            img = img.convert("RGB")
        w, h = img.size
        draw = ImageDraw.Draw(img, "RGBA")
        # Font
        try:
            f = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
                                   max(14, int(min(w, h) * 0.022)))
        except Exception:
            f = ImageFont.load_default()
        text = "DesarrollosMX"
        try:
            bbox = draw.textbbox((0, 0), text, font=f)
            tw = bbox[2] - bbox[0]
            th = bbox[3] - bbox[1]
        except Exception:
            tw, th = 120, 18
        pad = max(8, int(min(w, h) * 0.012))
        x = w - tw - pad - 6
        y = h - th - pad - 4
        # Soft shadow box
        draw.rectangle([x - 8, y - 4, x + tw + 8, y + th + 8],
                       fill=(6, 8, 15, 165))
        draw.text((x, y), text, fill=(240, 235, 224, 240), font=f)

        out = io.BytesIO()
        # Always export jpeg for size; if input was png alpha, lose alpha (acceptable for marketing)
        if img.mode != "RGB":
            img = img.convert("RGB")
        img.save(out, format="JPEG", quality=85, optimize=True)
        return out.getvalue()
    except Exception as e:
        log.warning(f"watermark failed: {e}")
        return data


# ─── AI Categorize (Claude vision) ────────────────────────────────────────────
async def ai_categorize(image_bytes: bytes) -> Dict[str, Any]:
    """Returns {category, caption, model, ok, error?}. Cero invención."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return {"ok": False, "error": "EMERGENT_LLM_KEY missing"}
    try:
        from llm_client import LlmChat, UserMessage, ImageContent
    except Exception as e:
        return {"ok": False, "error": f"emergentintegrations import failed: {e}"}

    sys_prompt = (
        "Eres un clasificador visual de fotografías inmobiliarias en es-MX. "
        "Devuelve SOLO un JSON válido (sin markdown) con dos llaves:\n"
        "  category: una de [sala, cocina, recamara, bano, fachada, exterior, amenidad, plano] o null si la imagen no encaja.\n"
        "  caption: 1 frase corta en español de México (≤80 chars) describiendo el espacio.\n"
        "JAMÁS inventes detalles que no se vean. Si no estás seguro, category=null."
    )
    try:
        b64 = base64.b64encode(image_bytes).decode("ascii")
        chat = LlmChat(
            api_key=api_key,
            session_id=f"asset_categorize_{uuid.uuid4().hex[:8]}",
            system_message=sys_prompt,
        ).with_model("anthropic", CATEGORIZE_MODEL)
        msg = UserMessage(
            text="Clasifica esta foto inmobiliaria. Devuelve únicamente el JSON.",
            file_contents=[ImageContent(image_base64=b64)],
        )
        raw = await chat.send_message(msg)
        text = (raw or "").strip()
        if text.startswith("```"):
            lines = text.splitlines()
            if lines and lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].startswith("```"):
                lines = lines[:-1]
            text = "\n".join(lines).strip()
        parsed = json.loads(text)
        cat = parsed.get("category")
        if cat is not None and cat not in AI_CATEGORIES:
            cat = None
        cap = (parsed.get("caption") or "")[:160]
        return {"ok": True, "category": cat, "caption": cap, "model": CATEGORIZE_MODEL}
    except Exception as e:
        log.exception("ai_categorize failed")
        return {"ok": False, "error": f"{type(e).__name__}: {e}"}


# ─── Pedra integration (stub honesto if key missing) ─────────────────────────
PEDRA_API_BASE = os.environ.get("PEDRA_API_BASE", "https://api.pedra.so/v1")


async def pedra_generate_360(image_bytes: bytes, room_type: Optional[str] = None) -> Dict[str, Any]:
    api_key = os.environ.get("PEDRA_API_KEY")
    if not api_key:
        return {
            "ok": False,
            "error": "PEDRA_API_KEY missing",
            "hint": "Configura PEDRA_API_KEY en /app/backend/.env y reinicia backend para habilitar tours 360°.",
            "stubbed": True,
        }
    try:
        import httpx
        files = {"image": ("photo.jpg", image_bytes, "image/jpeg")}
        data = {"room_type": room_type or "sala"}
        async with httpx.AsyncClient(timeout=60.0) as client:
            r = await client.post(
                f"{PEDRA_API_BASE}/render-360",
                headers={"Authorization": f"Bearer {api_key}"},
                files=files, data=data,
            )
            if r.status_code >= 400:
                return {"ok": False, "error": f"pedra_http_{r.status_code}", "body": r.text[:500]}
            payload = r.json()
            return {
                "ok": True,
                "render_id": payload.get("id") or payload.get("render_id"),
                "tour_url": payload.get("tour_url") or payload.get("url"),
                "raw": payload,
            }
    except Exception as e:
        log.exception("pedra call failed")
        return {"ok": False, "error": f"{type(e).__name__}: {e}"}


# ─── Storage helpers ──────────────────────────────────────────────────────────
def write_asset(asset_id: str, data: bytes, ext: str) -> str:
    p = ASSET_UPLOAD_DIR / f"{asset_id}.{ext}"
    p.write_bytes(data)
    return str(p)


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sanitize_asset(a: dict) -> dict:
    if not a:
        return {}
    out = {k: v for k, v in a.items() if k != "_id"}
    for k in ("created_at", "updated_at"):
        v = out.get(k)
        if isinstance(v, datetime):
            out[k] = v.isoformat()
    sp = out.get("storage_path")
    if sp:
        # Surface a public URL hint (served by FastAPI static)
        out["public_url"] = f"/api/assets-static/{Path(sp).name}"
    return out


def _public_url(a: dict) -> Optional[str]:
    sp = a.get("storage_path")
    return f"/api/assets-static/{Path(sp).name}" if sp else None


async def public_photos_for_dev(db, dev_id: str) -> List[Dict[str, Any]]:
    """Fotos SEGURAS (marketing) de un desarrollo para el comprador, ya filtradas por la allow-list.
    Cada foto trae su URL + el caption de IA (auto-tag) como texto accesible. Cierra el ciclo:
    el dev sube → la IA la clasifica → el comprador la ve etiquetada."""
    out: List[Dict[str, Any]] = []
    try:
        cur = db.dev_assets.find(
            {"development_id": dev_id, "asset_type": {"$in": list(PUBLIC_ASSET_TYPES)}},
            {"_id": 0, "asset_type": 1, "storage_path": 1, "order_index": 1,
             "ai_caption": 1, "ai_category": 1, "tour_url": 1},
        ).sort([("asset_type", 1), ("order_index", 1)])
        async for a in cur:
            url = _public_url(a) or a.get("tour_url")
            if not url:
                continue
            out.append({
                "url": url, "tipo": a.get("asset_type"),
                "descripcion": a.get("ai_caption") or "",   # alt-text accesible (IA)
                "categoria": a.get("ai_category") or None,
            })
    except Exception as e:
        log.warning(f"[assets] public_photos_for_dev {dev_id}: {e}")
    return out


async def public_hero_map(db, dev_ids: List[str]) -> Dict[str, str]:
    """Mapa dev_id → URL de la foto de portada (hero) REAL del dev, en BATCH para los listados
    (una sola query con $in · no llamada por-item). Elige el mejor tipo según HERO_PREFERENCE."""
    best: Dict[str, tuple] = {}   # dev_id → (rank, order_index, url)
    if not dev_ids:
        return {}
    try:
        cur = db.dev_assets.find(
            {"development_id": {"$in": list(dev_ids)}, "asset_type": {"$in": list(HERO_PREFERENCE)}},
            {"_id": 0, "development_id": 1, "asset_type": 1, "storage_path": 1, "order_index": 1},
        )
        async for a in cur:
            url = _public_url(a)
            if not url:
                continue
            did = a.get("development_id")
            try:
                rank = HERO_PREFERENCE.index(a.get("asset_type"))
            except ValueError:
                continue
            oi = a.get("order_index") or 0
            cur_best = best.get(did)
            if cur_best is None or (rank, oi) < (cur_best[0], cur_best[1]):
                best[did] = (rank, oi, url)
    except Exception as e:
        log.warning(f"[assets] public_hero_map: {e}")
    return {did: v[2] for did, v in best.items()}


# ─── Plano thumbnail generation from plano_arquitectonico docs ────────────────
async def regenerate_plano_thumbnails(db, dev_id: str) -> Dict[str, Any]:
    """For each plano_arquitectonico doc, render page 1 as thumbnail and store as dev_asset."""
    try:
        import pdfplumber  # type: ignore
        from PIL import Image  # type: ignore
    except Exception as e:
        return {"ok": False, "error": f"pdfplumber/PIL missing: {e}"}
    from document_intelligence import read_encrypted_file

    cursor = db.di_documents.find({
        "development_id": dev_id, "doc_type": "plano_arquitectonico",
        "status": {"$in": ["ocr_done", "extracted"]},
    })
    created: List[str] = []
    async for doc in cursor:
        # Skip if thumbnail already exists for this doc
        existing = await db.dev_assets.find_one({
            "development_id": dev_id, "asset_type": "plano_thumbnail",
            "source_doc_id": doc["id"],
        })
        if existing:
            continue
        try:
            file_bytes = await asyncio.to_thread(read_encrypted_file, doc.get("storage_path"))
            with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                if not pdf.pages:
                    continue
                pil = pdf.pages[0].to_image(resolution=120).original
                buf = io.BytesIO()
                pil.convert("RGB").save(buf, format="JPEG", quality=80)
                jpg_bytes = buf.getvalue()
        except Exception as e:
            log.warning(f"plano thumb failed doc={doc['id']}: {e}")
            continue

        wm = watermark_image(jpg_bytes)
        asset_id = _mk_id()
        sp = write_asset(asset_id, wm, "jpg")
        await db.dev_assets.insert_one({
            "id": asset_id,
            "development_id": dev_id,
            "uploader_user_id": "system",
            "asset_type": "plano_thumbnail",
            "filename": f"{doc['filename']}.thumb.jpg",
            "file_size_bytes": len(wm),
            "mime_type": "image/jpeg",
            "file_hash": sha256_bytes(wm),
            "storage_path": sp,
            "order_index": 1000,
            "ai_category": "plano",
            "ai_caption": f"Plano arquitectónico generado desde {doc['filename']}",
            "watermarked": True,
            "source_doc_id": doc["id"],
            "created_at": _now(), "updated_at": _now(),
        })
        created.append(asset_id)
    return {"ok": True, "created": created, "count": len(created)}
