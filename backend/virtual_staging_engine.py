"""W5.17 · Virtual Staging Engine.

Pipeline:
  POST /api/virtual-staging body {input_image_url, room_type, styles[1-3]}
  → fetch image bytes (or fallback to URL hash)
  → compute sha256[:16] image_hash
  → cache check (image_hash, room_type, styles_joined)
  → MISS → asyncio.gather(stage_single_style(...) for s in styles)
  → upload (best-effort; if no R2/S3 helper present, returns Replicate URL directly)
  → cache 30 days (TTL Mongo index)
  → respond {staging_id, staged_images, cached, processing_ms_total}

Model: SDXL via Replicate (image-to-image). Aligned with the pattern used by
backend/studio_engines.py::video_kling_replicate (env REPLICATE_API_TOKEN +
replicate.Client + asyncio.to_thread). SDXL is the most widely available
image-to-image staging model on Replicate (supports `image` + `prompt`
+ `prompt_strength`).

Roles allowed (routes layer): dev/advisor/dev_admin/superadmin.
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import logging
import os
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.virtual_staging_engine")

# ─── CONSTANTS ──────────────────────────────────────────────────────────────

SUPPORTED_STYLES: List[str] = [
    "moderno", "minimalista", "luxury", "family", "boutique", "scandi",
]

SUPPORTED_ROOMS: List[str] = [
    "sala", "recamara", "comedor", "cocina", "oficina", "bano",
]

# SDXL img2img — same pattern as studio_engines.py:106-123 (env-token + client.run via to_thread)
# Version pinned matches the official `stability-ai/sdxl` slug; Replicate resolves latest stable.
DEFAULT_MODEL: str = (
    "stability-ai/sdxl:7762fd07cf82c948538e41f63f77d685e02b063e37e496e96eefd46c929f9bdc"
)

STYLE_PROMPT_TEMPLATES: Dict[str, str] = {
    "moderno": (
        "modern minimalist living space with clean lines, white walls, sleek furniture, "
        "large windows, natural light, professional interior photography, high-quality, photorealistic"
    ),
    "minimalista": (
        "ultra-minimalist room with very few pieces of furniture, monochrome palette, "
        "hidden storage, zen aesthetic, professional architectural photography"
    ),
    "luxury": (
        "luxury high-end interior with gold accents, marble surfaces, designer furniture, "
        "crystal chandeliers, professional luxury real estate photography"
    ),
    "family": (
        "warm family-friendly living space with cozy sofas, soft textiles, kids-safe furniture, "
        "plants, natural materials, inviting atmosphere, professional photography"
    ),
    "boutique": (
        "boutique curated interior with art pieces, vintage furniture mixed with modern, "
        "plants, unique decor, magazine-worthy editorial photography"
    ),
    "scandi": (
        "scandinavian style with light wood, white walls, minimalist hygge aesthetic, "
        "plants, natural fabrics, bright and airy, professional photography"
    ),
}

ROOM_HINT_TEMPLATES: Dict[str, str] = {
    "sala": "living room with sofa, coffee table, lamps, area rug",
    "recamara": "bedroom with bed, nightstands, dresser, soft lighting",
    "comedor": "dining room with table, chairs, light fixture",
    "cocina": "kitchen with cabinets, appliances, countertops",
    "oficina": "home office with desk, chair, bookshelves, plants",
    "bano": "bathroom with vanity, mirror, towels, accessories",
}

NEGATIVE_PROMPT = "low quality, blurry, distorted, watermark, text, deformed"

_MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10MB cap
_FETCH_TIMEOUT_S = 10
_CACHE_TTL_DAYS = 30


# ─── helpers ────────────────────────────────────────────────────────────────

def compute_image_hash(image_data: bytes) -> str:
    """sha256[:16] del contenido binario."""
    return hashlib.sha256(image_data).hexdigest()[:16]


async def fetch_image_bytes(url: str) -> bytes:
    """Descarga la imagen para hash. data: URL → base64 decode; http(s) → httpx.

    Cap 10MB. Timeout 10s. Raises ValueError si excede o falla.
    """
    if not url:
        raise ValueError("URL vacía")

    # data URL → decode base64
    if url.startswith("data:"):
        try:
            header, _, b64 = url.partition(",")
            if ";base64" in header:
                raw = base64.b64decode(b64)
            else:
                raw = b64.encode("utf-8")
            if len(raw) > _MAX_IMAGE_BYTES:
                raise ValueError(f"data URL excede 10MB ({len(raw)} bytes)")
            return raw
        except Exception as e:
            raise ValueError(f"data URL inválida: {e}")

    # http(s) — SEGURIDAD (pentest 2026-06-27): valida anti-SSRF ANTES del fetch (era un escáner de la red interna /
    # acceso a metadata de la nube vía la URL que mete el asesor) y NO sigue redirects (un redirect a una IP interna
    # evadía cualquier allowlist de host).
    from services.ai_safety import is_public_url_safe
    if not is_public_url_safe(url, label="virtual_staging"):
        raise ValueError("URL no permitida (anti-SSRF)")
    try:
        import httpx  # local import to keep startup light
    except ImportError as e:
        raise ValueError(f"httpx no disponible: {e}")

    try:
        async with httpx.AsyncClient(timeout=_FETCH_TIMEOUT_S) as client:
            # HEAD first to check content-length (best-effort; some hosts reject)
            try:
                head = await client.head(url, follow_redirects=False)
                cl = head.headers.get("content-length")
                if cl and int(cl) > _MAX_IMAGE_BYTES:
                    raise ValueError(f"Image >10MB (content-length={cl})")
            except Exception:
                pass  # fall through to GET

            r = await client.get(url, follow_redirects=False)
            r.raise_for_status()
            data = r.content
            if len(data) > _MAX_IMAGE_BYTES:
                raise ValueError(f"Image >10MB ({len(data)} bytes)")
            return data
    except ValueError:
        raise
    except Exception as e:
        raise ValueError(f"fetch_image_bytes failed: {e}")


def _build_style_prompt(room_type: str, style: str) -> str:
    style_part = STYLE_PROMPT_TEMPLATES.get(style, style)
    room_part = ROOM_HINT_TEMPLATES.get(room_type, room_type)
    return f"{room_part}. Style: {style_part}"


async def _maybe_upload_to_r2(url: str, key: str) -> Optional[str]:
    """Best-effort upload to R2/S3 if a helper exists in the codebase.

    Returns the public URL on success, or None on any failure (caller falls back
    to the Replicate URL). Currently NO common upload helper exists in
    backend/*.py (studio_carrusel_engine et al. use put_object directly with
    bespoke creds), so this stub returns None — the engine just emits the
    Replicate URL. To enable R2 mirroring later, implement here.
    """
    return None


# ─── core: stage_single_style ───────────────────────────────────────────────

async def stage_single_style(
    input_image_url: str,
    room_type: str,
    style: str,
) -> Dict[str, Any]:
    """Run Replicate SDXL img2img for one style.

    Returns:
        success → {style, url, model_used, processing_ms}
        failure → {style, error: str}
    """
    started = time.monotonic()
    try:
        import replicate  # type: ignore
    except ImportError as e:
        return {"style": style, "error": f"replicate SDK missing: {e}"}

    token = os.environ.get("REPLICATE_API_TOKEN")
    if not token:
        return {"style": style, "error": "REPLICATE_API_TOKEN no configurado"}
    os.environ["REPLICATE_API_TOKEN"] = token  # match studio_engines pattern

    prompt = _build_style_prompt(room_type, style)
    try:
        client = replicate.Client(api_token=token)
        output = await asyncio.to_thread(
            client.run,
            DEFAULT_MODEL,
            input={
                "image": input_image_url,
                "prompt": prompt,
                "negative_prompt": NEGATIVE_PROMPT,
                "prompt_strength": 0.65,
                "num_inference_steps": 30,
                "guidance_scale": 7.5,
                "scheduler": "K_EULER",
            },
        )
        # Replicate returns FileOutput, list[FileOutput] or str depending on model.
        out_url: Optional[str] = None
        if isinstance(output, list) and output:
            out_url = str(output[0])
        elif output is not None:
            out_url = str(output)
        if not out_url:
            return {"style": style, "error": "Replicate returned no output"}

        # Best-effort mirror to R2 (currently no-op; falls back to Replicate URL)
        mirrored = await _maybe_upload_to_r2(out_url, key=f"virtual_staging/{uuid.uuid4()}.png")
        final_url = mirrored or out_url

        elapsed_ms = int((time.monotonic() - started) * 1000)
        return {
            "style": style,
            "url": final_url,
            "model_used": DEFAULT_MODEL.split(":")[0],
            "processing_ms": elapsed_ms,
        }
    except Exception as e:
        log.warning(f"[virtual_staging] style={style} replicate failed: {e}")
        return {"style": style, "error": str(e)[:300]}


# ─── cache ──────────────────────────────────────────────────────────────────

async def get_cached(
    db,
    image_hash: str,
    room_type: str,
    styles_joined: str,
) -> Optional[Dict[str, Any]]:
    """Lookup virtual_staging_cache. Returns the doc (sans _id) or None."""
    try:
        doc = await db.virtual_staging_cache.find_one(
            {
                "image_hash": image_hash,
                "room_type": room_type,
                "styles_joined": styles_joined,
            },
            {"_id": 0},
            sort=[("generated_at", -1)],
        )
        return doc
    except Exception as e:
        log.warning(f"[virtual_staging] get_cached failed: {e}")
        return None


# ─── core: stage_image ──────────────────────────────────────────────────────

async def stage_image(
    db,
    input_image_url: str,
    room_type: str,
    styles: List[str],
    user_id: Optional[str] = None,
    dev_org_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Main entrypoint.

    Validates → hashes → cache check → Replicate (parallel) → audit + budget → cache → return.
    """
    # ── validation ──────────────────────────────────────────────────────
    if not isinstance(room_type, str) or room_type not in SUPPORTED_ROOMS:
        raise ValueError(f"room_type inválido · soportados: {SUPPORTED_ROOMS}")
    if not isinstance(styles, list) or not (1 <= len(styles) <= 3):
        raise ValueError("styles debe tener entre 1 y 3 elementos")
    if any(s not in SUPPORTED_STYLES for s in styles):
        raise ValueError(f"styles inválidos · soportados: {SUPPORTED_STYLES}")
    if not isinstance(input_image_url, str) or not input_image_url.strip():
        raise ValueError("input_image_url requerido")

    started_total = time.monotonic()

    # ── compute hash (best-effort; fallback to URL string) ──────────────
    try:
        img_bytes = await fetch_image_bytes(input_image_url)
        image_hash = compute_image_hash(img_bytes)
    except Exception as e:
        log.info(f"[virtual_staging] fetch failed, using URL hash fallback: {e}")
        image_hash = hashlib.sha256(input_image_url.encode("utf-8")).hexdigest()[:16]

    styles_sorted = sorted(styles)
    styles_joined = ",".join(styles_sorted)

    # ── cache check ─────────────────────────────────────────────────────
    cached = await get_cached(db, image_hash, room_type, styles_joined)
    if cached:
        cached["cached"] = True
        cached["processing_ms_total"] = int((time.monotonic() - started_total) * 1000)
        return cached

    # ── SEGURIDAD P1 (auditoría 2026-07-12): cap de presupuesto PRE-gasto ──
    # El caché ya cortó los hits gratis. Ante cache-miss, verificar presupuesto ANTES de invocar
    # Replicate (SDXL es API paga). Sin esto un asesor podía generar miles de imágenes/día sin tope.
    try:
        from ai_budget import is_within_budget
        _budget_ok = await is_within_budget(db, dev_org_id)
    except Exception:
        _budget_ok = True  # si el guard no es verificable, no bloquear (fail-open del CHECK, no del gasto)
    if not _budget_ok:
        from fastapi import HTTPException
        raise HTTPException(403, "Presupuesto de IA agotado para tu organización. Intenta más tarde.")

    # ── Replicate parallel ──────────────────────────────────────────────
    try:
        results = await asyncio.gather(
            *[stage_single_style(input_image_url, room_type, s) for s in styles_sorted],
            return_exceptions=False,
        )
    except Exception as e:
        log.error(f"[virtual_staging] asyncio.gather crashed: {e}")
        raise RuntimeError(f"Replicate batch failed: {e}")

    staged_images: List[Dict[str, Any]] = list(results)

    # ── audit (best-effort) ─────────────────────────────────────────────
    staging_id = str(uuid.uuid4())
    try:
        from audit_immutable_engine import log as audit_log
        await audit_log(
            db,
            actor={"user_id": user_id or "anonymous", "role": "system"},
            action="virtual_staging_generated",
            entity_type="virtual_staging_cache",
            entity_id=staging_id,
            before=None,
            after={
                "image_hash": image_hash,
                "room_type": room_type,
                "styles_joined": styles_joined,
                "n_results": len(staged_images),
                "n_errors": sum(1 for r in staged_images if "error" in r),
            },
        )
    except Exception as e:
        log.warning(f"[virtual_staging] audit failed silent: {e}")

    # ── ai_budget tracking (best-effort) ────────────────────────────────
    ai_budget_used = 0.0
    try:
        from ai_budget import track_ai_call
        # Replicate SDXL is image-gen, not LLM tokens. We approximate with a fixed
        # synthetic-token cost so the cost-per-image lands ~$0.012 USD per style
        # (SDXL public pricing ~$0.0023/run · we count higher to budget safely).
        ok_count = sum(1 for r in staged_images if "url" in r)
        synthetic_tokens = ok_count * 1000
        await track_ai_call(
            db=db,
            dev_org_id=dev_org_id or "default",
            model="replicate_sdxl",
            tokens=synthetic_tokens,
            call_type="virtual_staging",
            tokens_in=0,
            tokens_out=synthetic_tokens,
            feature_key="virtual_staging",
        )
        ai_budget_used = ok_count * 0.012
    except Exception as e:
        log.warning(f"[virtual_staging] track_ai_call failed silent: {e}")

    # ── cache write ─────────────────────────────────────────────────────
    now = datetime.now(timezone.utc)
    ttl_until = now + timedelta(days=_CACHE_TTL_DAYS)
    processing_ms_total = int((time.monotonic() - started_total) * 1000)

    doc = {
        "staging_id": staging_id,
        "image_hash": image_hash,
        "room_type": room_type,
        "styles_joined": styles_joined,
        "staged_images": staged_images,
        "user_id": user_id,
        "ai_budget_used": ai_budget_used,
        "generated_at": now,
        "ttl_until": ttl_until,
        "processing_ms_total": processing_ms_total,
    }
    try:
        await db.virtual_staging_cache.insert_one(dict(doc))
    except Exception as e:
        log.warning(f"[virtual_staging] cache insert failed silent: {e}")

    return {
        "staging_id": staging_id,
        "image_hash": image_hash,
        "room_type": room_type,
        "styles_joined": styles_joined,
        "staged_images": staged_images,
        "user_id": user_id,
        "ai_budget_used": ai_budget_used,
        "generated_at": now.isoformat(),
        "cached": False,
        "processing_ms_total": processing_ms_total,
    }


# ─── ensure_indexes ─────────────────────────────────────────────────────────

async def ensure_indexes(db) -> None:
    """Indexes for virtual_staging_cache.

    - image_hash sparse (lookup helper)
    - (image_hash, room_type, styles_joined) compound (primary cache key)
    - ttl_until TTL (auto-purge after 30 days)
    """
    try:
        await db.virtual_staging_cache.create_index(
            "image_hash", sparse=True, name="vs_image_hash"
        )
    except Exception as e:
        log.warning(f"[virtual_staging] index image_hash failed: {e}")
    try:
        await db.virtual_staging_cache.create_index(
            [("image_hash", 1), ("room_type", 1), ("styles_joined", 1)],
            name="vs_cache_key",
        )
    except Exception as e:
        log.warning(f"[virtual_staging] index compound failed: {e}")
    try:
        await db.virtual_staging_cache.create_index(
            "ttl_until", expireAfterSeconds=0, name="vs_ttl"
        )
    except Exception as e:
        log.warning(f"[virtual_staging] index ttl failed: {e}")
