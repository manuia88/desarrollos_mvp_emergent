"""
Studio real engines (Chunk 4) — adapters para video, ads, TTS + budget cap.

Video   · Replicate Kling 3.0 (primary) + Fal Seedance Pro (fallback)
Ads     · OpenAI gpt-image-1 direct (90 imágenes únicas, asyncio semaphore 5)
TTS     · ElevenLabs multilingual (opcional, requiere key)
Budget  · Cap mensual por user_id, pre-flight + post-spend tracking

Nota v1.0: video genera 1 clip representativo (no multi-escena mux) por guardrail tiempo.
Multi-escena + MoviePy mux viene en Wave 1.5.
"""
from __future__ import annotations

import asyncio
import base64
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import httpx
from fastapi import HTTPException

# ─── Storage paths ───────────────────────────────────────────────────────────
UPLOAD_ROOT = Path("/app/backend/uploads/studio")
for sub in ("videos", "ads", "tts"):
    (UPLOAD_ROOT / sub).mkdir(parents=True, exist_ok=True)


# ═══ BUDGET ═════════════════════════════════════════════════════════════════
DEFAULT_CAP_USD = 20.0
ADMIN_DEFAULT_CAP = 200.0


def _month_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


async def get_or_create_budget(db, user_id: str, is_admin: bool = False) -> Dict[str, Any]:
    month = _month_iso()
    doc = await db.studio_user_budget.find_one({"user_id": user_id, "month_iso": month}, {"_id": 0})
    if not doc:
        cap = ADMIN_DEFAULT_CAP if is_admin else DEFAULT_CAP_USD
        doc = {"user_id": user_id, "month_iso": month, "spent_usd": 0.0,
               "cap_usd": cap, "updated_at": datetime.now(timezone.utc)}
        await db.studio_user_budget.update_one(
            {"user_id": user_id, "month_iso": month},
            {"$setOnInsert": doc}, upsert=True,
        )
    return doc


async def preflight_budget(db, user_id: str, estimated_cost: float, is_admin: bool = False) -> Dict[str, Any]:
    b = await get_or_create_budget(db, user_id, is_admin)
    if b["spent_usd"] + estimated_cost > b["cap_usd"]:
        raise HTTPException(
            status_code=402,
            detail={
                "error": "budget_cap_reached",
                "spent": round(b["spent_usd"], 4),
                "cap": b["cap_usd"],
                "estimated_cost": round(estimated_cost, 4),
                "remaining": round(b["cap_usd"] - b["spent_usd"], 4),
                "message": "Cap mensual de Studio alcanzado. Contacta a tu admin para incrementarlo.",
            },
        )
    return b


async def charge_budget(db, user_id: str, actual_cost: float) -> None:
    await db.studio_user_budget.update_one(
        {"user_id": user_id, "month_iso": _month_iso()},
        {"$inc": {"spent_usd": round(actual_cost, 6)},
         "$set": {"updated_at": datetime.now(timezone.utc)}},
        upsert=True,
    )


# ═══ VIDEO ADAPTERS ══════════════════════════════════════════════════════════
KLING_COST_USD = 0.45
SEEDANCE_COST_USD = 0.35


async def _download_file(url: str, dest: Path) -> int:
    async with httpx.AsyncClient(timeout=120) as c:
        r = await c.get(url)
        r.raise_for_status()
        dest.write_bytes(r.content)
        return len(r.content)


def _build_video_prompt(script: Dict[str, Any]) -> str:
    """Combina todas las escenas en un prompt visual coherente para 1 clip."""
    scenes = script.get("scenes") or []
    if not scenes:
        return "Cinematic real estate walkthrough, navy and cream palette, professional architecture"
    visuals = [s.get("visual", "") for s in scenes[:3]]
    first = visuals[0] if visuals else ""
    combined = f"Cinematic real estate video: {first}. Paleta navy oscuro y cream, arquitectura moderna CDMX, movimientos de cámara fluidos, iluminación natural cálida, profesional."
    return combined[:500]


async def video_kling_replicate(script: Dict[str, Any], duration: int, video_id: str) -> Dict[str, Any]:
    """Replicate Kling 3.0 text-to-video. 5-10s output."""
    import replicate
    token = os.environ.get("REPLICATE_API_TOKEN")
    if not token:
        raise RuntimeError("REPLICATE_API_TOKEN no configurado")
    os.environ["REPLICATE_API_TOKEN"] = token
    prompt = _build_video_prompt(script)
    client = replicate.Client(api_token=token)
    # Kling via Replicate: model slug varies — usar official kwaivgi/kling-v2.0 que es estable
    output = await asyncio.to_thread(
        client.run,
        "kwaivgi/kling-v2.0",
        input={
            "prompt": prompt,
            "duration": min(10, max(5, duration // 3)),
            "aspect_ratio": "16:9",
            "negative_prompt": "low quality, blurry, distorted, watermark",
        },
    )
    # Replicate returns FileOutput or URL; normalize
    video_url = str(output) if output else None
    if not video_url:
        raise RuntimeError("Kling returned no output")
    dest = UPLOAD_ROOT / "videos" / f"{video_id}.mp4"
    size = await _download_file(video_url, dest)
    return {"engine": "kling-v2", "file_path": str(dest), "size_bytes": size,
            "cost_usd": KLING_COST_USD, "prompt_used": prompt}


async def video_seedance_fal(script: Dict[str, Any], duration: int, video_id: str) -> Dict[str, Any]:
    """Fal.ai Seedance Pro fallback."""
    import fal_client
    key = os.environ.get("FAL_KEY")
    if not key:
        raise RuntimeError("FAL_KEY no configurado")
    os.environ["FAL_KEY"] = key
    prompt = _build_video_prompt(script)
    # Use fal-ai/bytedance/seedance-1.0-pro/text-to-video
    handler = await fal_client.submit_async(
        "fal-ai/bytedance/seedance/v1/pro/text-to-video",
        arguments={"prompt": prompt, "aspect_ratio": "16:9",
                   "duration": str(min(10, max(5, duration // 3)))},
    )
    result = await handler.get()
    video_url = (result or {}).get("video", {}).get("url") if isinstance(result, dict) else None
    if not video_url:
        raise RuntimeError(f"Seedance returned no URL: {str(result)[:200]}")
    dest = UPLOAD_ROOT / "videos" / f"{video_id}.mp4"
    size = await _download_file(video_url, dest)
    return {"engine": "seedance-pro", "file_path": str(dest), "size_bytes": size,
            "cost_usd": SEEDANCE_COST_USD, "prompt_used": prompt}


async def generate_video(engine: str, script: Dict[str, Any], duration: int, video_id: str) -> Dict[str, Any]:
    """Dispatcher with Kling→Seedance auto-fallback."""
    if engine == "seedance":
        return await video_seedance_fal(script, duration, video_id)
    if engine == "kling":
        return await video_kling_replicate(script, duration, video_id)
    # auto: try Kling, fall back to Seedance on error
    try:
        return await video_kling_replicate(script, duration, video_id)
    except Exception as e:
        try:
            r = await video_seedance_fal(script, duration, video_id)
            r["fallback_from_kling"] = str(e)[:200]
            return r
        except Exception as e2:
            raise RuntimeError(f"Kling error: {e} · Seedance error: {e2}")


# ═══ ADS ADAPTER (OpenAI gpt-image-1 direct) ════════════════════════════════
ADS_COST_PER_IMAGE = 0.04
ADS_SEMAPHORE = asyncio.Semaphore(5)


async def _openai_image(prompt: str, out_path: Path) -> int:
    """Single gpt-image-1 call via OpenAI HTTP API → PNG bytes → disk."""
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        raise RuntimeError("OPENAI_API_KEY no configurado")
    async with httpx.AsyncClient(timeout=120) as c:
        r = await c.post(
            "https://api.openai.com/v1/images/generations",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={"model": "gpt-image-1", "prompt": prompt[:4000],
                  "size": "1024x1024", "n": 1},
        )
        r.raise_for_status()
        data = r.json()
        b64 = data["data"][0]["b64_json"]
        img_bytes = base64.b64decode(b64)
        out_path.write_bytes(img_bytes)
        return len(img_bytes)


async def generate_ad_image(copy: Dict[str, Any], visual_profile: str, batch_id: str, variant: int) -> Dict[str, Any]:
    """Generate 1 ad image for a given copy with concurrency control."""
    angulo = copy.get("angle", "unknown").replace(" ", "_").lower()[:30]
    batch_dir = UPLOAD_ROOT / "ads" / batch_id / angulo
    batch_dir.mkdir(parents=True, exist_ok=True)
    out = batch_dir / f"{variant:02d}.png"

    if out.exists():
        return {"copy": copy, "image_path": str(out), "cached": True}

    prompt = (
        f"Real estate marketing ad. {copy.get('headline', '')}. "
        f"Style: {visual_profile}, navy #06080F and cream #F0EBE0 palette, "
        f"modern CDMX architecture, editorial photography, high end, no text overlay. "
        f"Composition: rule of thirds, natural light, wide angle lens."
    )
    async with ADS_SEMAPHORE:
        try:
            size = await _openai_image(prompt, out)
            return {"copy": copy, "image_path": str(out), "size_bytes": size,
                    "cost_usd": ADS_COST_PER_IMAGE}
        except Exception as e:
            return {"copy": copy, "error": str(e)[:200], "cost_usd": 0}


async def generate_ads_full_batch(copies: list, visual_profile: str, batch_id: str, start_variant: int = 10):
    """Fire all 90 remaining ads concurrently (throttled by semaphore)."""
    tasks = [
        generate_ad_image(c, visual_profile, batch_id, start_variant + i)
        for i, c in enumerate(copies)
    ]
    return await asyncio.gather(*tasks)


# ═══ TTS ADAPTER (ElevenLabs) ═══════════════════════════════════════════════
TTS_COST_PER_1000_CHARS = 0.18


async def generate_tts_elevenlabs(text: str, voice_id: str, language: str = "es-MX", audio_id: Optional[str] = None) -> Dict[str, Any]:
    key = os.environ.get("ELEVENLABS_API_KEY")
    if not key:
        raise HTTPException(503, detail={
            "error": "tts_engine_not_configured",
            "message": "ElevenLabs API key no configurada. Pega ELEVENLABS_API_KEY en backend/.env.",
        })
    audio_id = audio_id or uuid.uuid4().hex[:16]
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
    payload = {"text": text[:5000], "model_id": "eleven_multilingual_v2",
               "voice_settings": {"stability": 0.55, "similarity_boost": 0.75, "style": 0.3}}
    async with httpx.AsyncClient(timeout=120) as c:
        r = await c.post(url, headers={"xi-api-key": key, "Content-Type": "application/json",
                                        "accept": "audio/mpeg"}, json=payload)
        r.raise_for_status()
        dest = UPLOAD_ROOT / "tts" / f"{audio_id}.mp3"
        dest.write_bytes(r.content)
    # Aproximar duration: ~150 palabras/min, 5 chars/palabra
    duration_s = max(1, len(text) / 750 * 60)
    cost = len(text) / 1000 * TTS_COST_PER_1000_CHARS
    return {"audio_id": audio_id, "file_path": str(dest), "size_bytes": len(r.content),
            "duration_seconds": round(duration_s, 1), "cost_usd": round(cost, 5),
            "voice_id": voice_id, "language": language}


# ═══ COST ESTIMATORS (pre-flight) ════════════════════════════════════════════
def estimate_video_cost(duration: int, tts_enabled: bool, text_len: int = 0) -> float:
    base = KLING_COST_USD  # assume kling primary
    if tts_enabled and text_len:
        base += text_len / 1000 * TTS_COST_PER_1000_CHARS
    return base


def estimate_ads_full_cost(remaining: int = 90) -> float:
    return remaining * ADS_COST_PER_IMAGE


def estimate_tts_cost(text_len: int) -> float:
    return text_len / 1000 * TTS_COST_PER_1000_CHARS
