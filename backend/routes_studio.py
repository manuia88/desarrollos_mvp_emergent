"""DMX Studio Wave 1 — video + ads generation with adapter pattern.

Engines are pluggable. Today: STUB (Claude script + gpt-image-1 hero images).
Future: replace with fal.ai Seedance / Replicate Kling / ElevenLabs without touching UI.
"""

import os
import uuid
import base64
import asyncio
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel


router = APIRouter(prefix="/api/studio", tags=["studio"])

STUDIO_ROLES = {"advisor", "asesor_admin", "developer_admin", "superadmin"}


def _now():
    return datetime.now(timezone.utc)

def _uid(p):
    return f"{p}_{uuid.uuid4().hex[:10]}"


def get_db(request: Request):
    return request.app.state.db


async def require_studio(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user: raise HTTPException(401, "No autenticado")
    if user.role not in STUDIO_ROLES:
        raise HTTPException(403, "Acceso restringido al Studio")
    return user


# ─── Engine config (read once) ────────────────────────────────────────────────
def _video_engine() -> str:
    return os.environ.get("STUDIO_VIDEO_ENGINE", "stub")  # stub|fal|replicate

def _ads_engine() -> str:
    return os.environ.get("STUDIO_ADS_ENGINE", "openai-stub")  # openai-stub|openai-full|flux

# Voice + music libraries (curated, free CDN-friendly metadata)
VOICES = [
    {"id": "esmx-mia",      "label": "Mía",      "lang": "es-MX", "gender": "f", "tone": "cálida"},
    {"id": "esmx-sofia",    "label": "Sofía",    "lang": "es-MX", "gender": "f", "tone": "profesional"},
    {"id": "esmx-paula",    "label": "Paula",    "lang": "es-MX", "gender": "f", "tone": "energética"},
    {"id": "esmx-diego",    "label": "Diego",    "lang": "es-MX", "gender": "m", "tone": "cálido"},
    {"id": "esmx-mateo",    "label": "Mateo",    "lang": "es-MX", "gender": "m", "tone": "profesional"},
    {"id": "esmx-rodrigo",  "label": "Rodrigo",  "lang": "es-MX", "gender": "m", "tone": "autoritativo"},
    {"id": "enus-emma",     "label": "Emma",     "lang": "en-US", "gender": "f", "tone": "warm"},
    {"id": "enus-olivia",   "label": "Olivia",   "lang": "en-US", "gender": "f", "tone": "professional"},
    {"id": "enus-james",    "label": "James",    "lang": "en-US", "gender": "m", "tone": "professional"},
    {"id": "enus-noah",     "label": "Noah",     "lang": "en-US", "gender": "m", "tone": "energetic"},
]

MUSIC_TRACKS = {
    "lujo":      [{"id": "lujo-01", "label": "Cinematic Strings",  "bpm": 80}, {"id": "lujo-02", "label": "Velvet Piano", "bpm": 70}],
    "familiar":  [{"id": "fam-01",  "label": "Acoustic Sunrise",   "bpm": 95}, {"id": "fam-02",  "label": "Wooden Heart", "bpm": 100}],
    "urbano":    [{"id": "urb-01",  "label": "Lofi Skyline",       "bpm": 88}, {"id": "urb-02",  "label": "City Pulse",   "bpm": 110}],
    "lifestyle": [{"id": "lst-01",  "label": "Sunset Vibes",       "bpm": 105},{"id": "lst-02",  "label": "Boutique Funk","bpm": 115}],
}

ANGULOS = [
    {"k": "inversion",  "label": "Inversión",  "audience": "inversor con foco en yield + plusvalía"},
    {"k": "lifestyle",  "label": "Lifestyle",  "audience": "joven profesional buscando estilo de vida en CDMX"},
    {"k": "plusvalia",  "label": "Plusvalía",  "audience": "comprador racional enfocado en apreciación 5-10 años"},
    {"k": "familia",    "label": "Familia",    "audience": "familia con niños buscando seguridad + escuelas + parques"},
    {"k": "urgencia",   "label": "Urgencia",   "audience": "decisor que reacciona a oportunidad limitada (descuento o cierre etapa)"},
    {"k": "ubicacion",  "label": "Ubicación",  "audience": "comprador que prioriza walkability + transporte + zona"},
    {"k": "roi",        "label": "ROI",        "audience": "inversor sofisticado con métricas concretas"},
]

VISUAL_PROFILES = ["joven", "familia", "ejecutivo", "inversor", "lujo", "starter", "retiro"]


# ─── Pydantic ─────────────────────────────────────────────────────────────────
class VideoRequest(BaseModel):
    source_type: str  # text|photos|url
    source_data: str
    video_type: str = "walkthrough"  # walkthrough|hero|drone|lifestyle|testimonial
    duration: int = 30  # 15|30|60|90
    voice_id: str = "esmx-mia"
    music_mood: str = "lujo"
    subtitles: bool = True
    cta: Optional[str] = None
    cta_url: Optional[str] = None
    advisor_branding: Optional[dict] = None  # logo_url, brand_colors


class AdsRequest(BaseModel):
    source_url: Optional[str] = None
    development_id: Optional[str] = None
    visual_profile: str = "joven"
    advisor_branding: Optional[dict] = None  # logo_url, name, brand_color


# ─── Video engine adapter ─────────────────────────────────────────────────────
async def _generate_video_stub(req: VideoRequest, user) -> dict:
    """STUB: Claude generates script/storyboard/subtitles. No render."""
    from emergentintegrations.llm.chat import LlmChat, UserMessage

    voice = next((v for v in VOICES if v["id"] == req.voice_id), VOICES[0])
    music = MUSIC_TRACKS.get(req.music_mood, MUSIC_TRACKS["lujo"])[0]
    scenes_count = max(3, req.duration // 8)  # ~8s per scene

    prompt = f"""Eres director creativo de video real estate. Genera un guión profesional para video de tipo "{req.video_type}", duración {req.duration}s.

Brief / fuente:
{req.source_data[:1500]}

Audiencia: profesional inmobiliario LATAM. Tono: {voice['tone']}. Idioma: {voice['lang']}.

Devuelve JSON con esta estructura exacta (sin markdown, sin backticks, JSON puro):
{{
  "title": "título de 4-7 palabras",
  "hook": "primer oración (3 segundos) anti-scroll",
  "scenes": [
    {{"t_start": 0, "t_end": 8, "visual": "descripción visual breve", "voiceover": "texto exacto a narrar", "subtitle": "texto onscreen corto"}}
  ],
  "cta_text": "CTA final 5-9 palabras",
  "music_brief": "brief de ánimo musical en 1 frase"
}}

Genera exactamente {scenes_count} scenes que cubran toda la duración {req.duration}s. El voiceover total debe leerse en {req.duration}s a ritmo natural (~150 palabras por minuto).
"""
    try:
        chat = LlmChat(api_key=os.environ.get("EMERGENT_LLM_KEY"),
                       session_id=_uid("video"),
                       system_message="Eres director creativo senior de video real estate LATAM.")
        chat.with_model("anthropic", "claude-sonnet-4-5-20250929")
        raw = await chat.send_message(UserMessage(text=prompt))
        # Try parse
        import json, re
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        script = json.loads(m.group(0)) if m else {"title": "Sin título", "scenes": []}
    except Exception as e:
        script = {
            "title": "Video generado (stub)",
            "hook": "Descubre tu próxima decisión inteligente.",
            "scenes": [{"t_start": 0, "t_end": req.duration, "visual": "Recorrido principal", "voiceover": req.source_data[:200], "subtitle": "DesarrollosMX"}],
            "cta_text": req.cta or "Agenda tu visita hoy.",
            "music_brief": "Cinemático sutil.",
            "_error": str(e),
        }

    return {
        "engine": "stub",
        "is_stub": True,
        "script": script,
        "voice": voice,
        "music": music,
        "preview_url": None,  # Real engine would populate
        "duration_s": req.duration,
        "video_type": req.video_type,
    }


async def _generate_video_real(req: VideoRequest, user) -> dict:
    """Real engine adapter — to be wired by Claude Code post-MVP via fal.ai or Replicate."""
    raise HTTPException(503, "Real video engine not configured. Set STUDIO_VIDEO_ENGINE=fal or replicate and provide API key.")


VIDEO_ENGINE = {
    "stub": _generate_video_stub,
    "fal": _generate_video_real,
    "replicate": _generate_video_real,
}


# ─── Ads engine adapter ───────────────────────────────────────────────────────
async def _generate_ads_openai_stub(req: AdsRequest, user) -> dict:
    """openai-stub: 10 real copies + 7 hero images via gpt-image-1, 90 placeholder slots."""
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    from emergentintegrations.llm.openai.image_generation import OpenAIImageGeneration

    # Resolve source data
    src_data = ""
    src_label = "Brief manual"
    if req.development_id:
        from data_developments import DEVELOPMENTS_BY_ID
        d = DEVELOPMENTS_BY_ID.get(req.development_id)
        if d:
            src_label = d["name"]
            src_data = (f"{d['name']} en {d['colonia']}, {d['alcaldia']}. Etapa {d['stage']}, entrega {d['delivery_estimate']}. "
                        f"Desde ${d['price_from']:,} MXN, {d['m2_range'][0]}-{d['m2_range'][1]}m². "
                        f"Amenidades: {', '.join(d.get('amenities', [])[:6])}.")
    elif req.source_url:
        src_label = req.source_url
        src_data = f"Propiedad publicada en {req.source_url} (datos extraídos automáticamente — modo demo)."
    else:
        raise HTTPException(400, "Falta source_url o development_id")

    # Generate 10 copies via Claude (1 per ángulo first 7 + 3 winners variants)
    copy_prompt = f"""Eres copywriter senior de ads inmobiliarios mexicanos. Genera ads para esta propiedad:

{src_data}

Audiencia visual: perfil "{req.visual_profile}".
Idioma: es-MX. Tono: profesional, basado en datos, sin marketing vacío. Sin emojis.

Devuelve JSON puro (sin backticks):
{{
  "ads": [
    {{"angulo": "inversion",  "headline": "...", "body": "1-2 oraciones", "cta": "3-5 palabras"}},
    {{"angulo": "lifestyle",  "headline": "...", "body": "...",  "cta": "..."}},
    {{"angulo": "plusvalia",  "headline": "...", "body": "...",  "cta": "..."}},
    {{"angulo": "familia",    "headline": "...", "body": "...",  "cta": "..."}},
    {{"angulo": "urgencia",   "headline": "...", "body": "...",  "cta": "..."}},
    {{"angulo": "ubicacion",  "headline": "...", "body": "...",  "cta": "..."}},
    {{"angulo": "roi",        "headline": "...", "body": "...",  "cta": "..."}},
    {{"angulo": "inversion",  "variant": 2, "headline": "...", "body": "...", "cta": "..."}},
    {{"angulo": "lifestyle",  "variant": 2, "headline": "...", "body": "...", "cta": "..."}},
    {{"angulo": "urgencia",   "variant": 2, "headline": "...", "body": "...", "cta": "..."}}
  ]
}}

Cada headline máximo 60 caracteres. Cada body máximo 110 caracteres. Cada cta máximo 30 caracteres."""
    copies = []
    try:
        chat = LlmChat(api_key=os.environ.get("EMERGENT_LLM_KEY"),
                       session_id=_uid("ads"),
                       system_message="Eres copywriter senior de ads inmobiliarios LATAM.")
        chat.with_model("anthropic", "claude-sonnet-4-5-20250929")
        raw = await chat.send_message(UserMessage(text=copy_prompt))
        import json, re
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        if m:
            copies = json.loads(m.group(0)).get("ads", [])
    except Exception:
        copies = [{"angulo": a["k"], "headline": f"Conoce {src_label}", "body": "Decisión basada en datos.", "cta": "Ver detalles"} for a in ANGULOS] + \
                [{"angulo": "inversion", "variant": 2, "headline": "Inversión inteligente", "body": "Plusvalía proyectada arriba del mercado.", "cta": "Solicita análisis"}] * 3

    # Image generation runs progressively via /ad-batches/{bid}/hero-image/{angulo}
    # to fit within proxy timeouts (each image takes ~30-50s).
    hero_images_b64 = {}

    # Compose 100 ads: 10 with full copy + image ref, 90 locked placeholders
    # NOTE: image bytes are stored in `studio_assets` collection, not inline (Mongo BSON 16MB limit)
    full_ads = []
    for i, c in enumerate(copies[:10]):
        ang_key = c.get("angulo", "lifestyle")
        full_ads.append({
            "id": _uid("ad"),
            "angulo": ang_key,
            "variant": c.get("variant", 1),
            "headline": c.get("headline", "")[:60],
            "body": c.get("body", "")[:140],
            "cta": c.get("cta", "")[:32],
            "format": "feed_1x1",
            "is_stub": False,
        })

    locked_ads = []
    for i in range(90):
        ang = ANGULOS[i % 7]
        locked_ads.append({
            "id": _uid("adlock"),
            "angulo": ang["k"],
            "variant": (i // 7) + 3,
            "locked": True,
            "format": ["feed_1x1", "stories_9x16", "reels_9x16"][i % 3],
        })

    return {
        "engine": "openai-stub",
        "is_stub": True,
        "source_label": src_label,
        "visual_profile": req.visual_profile,
        "ads": full_ads + locked_ads,
        "ads_unlocked": len(full_ads),
        "ads_locked": len(locked_ads),
        "angulos_breakdown": {a["k"]: sum(1 for x in full_ads if x["angulo"] == a["k"]) for a in ANGULOS},
    }


async def _generate_ads_real(req: AdsRequest, user) -> dict:
    raise HTTPException(503, "Full ads engine (100 unique images) not configured. Set STUDIO_ADS_ENGINE=openai-full.")


ADS_ENGINE = {
    "openai-stub": _generate_ads_openai_stub,
    "openai-full": _generate_ads_real,
    "flux": _generate_ads_real,
}


# ─── API ──────────────────────────────────────────────────────────────────────
@router.get("/library")
async def studio_library(request: Request):
    """Voice + music + ángulos + visual profiles for wizards."""
    await require_studio(request)
    return {
        "voices": VOICES,
        "music_tracks": MUSIC_TRACKS,
        "angulos": ANGULOS,
        "visual_profiles": VISUAL_PROFILES,
        "video_engine": _video_engine(),
        "ads_engine": _ads_engine(),
    }


@router.get("/dashboard")
async def studio_dashboard(request: Request):
    user = await require_studio(request)
    db = get_db(request)
    videos = await db.studio_videos.find({"owner_id": user.user_id}, {"_id": 0, "script.scenes": 0}).sort("created_at", -1).limit(50).to_list(50)
    ad_batches = await db.studio_ad_batches.find({"owner_id": user.user_id}, {"_id": 0, "ads": 0}).sort("created_at", -1).limit(50).to_list(50)
    total_ads = sum(b.get("ads_unlocked", 0) for b in ad_batches)
    return {
        "videos": videos,
        "ad_batches": ad_batches,
        "stats": {
            "videos_generated": len(videos),
            "ad_batches_generated": len(ad_batches),
            "total_ads_unlocked": total_ads,
            "video_engine": _video_engine(),
            "ads_engine": _ads_engine(),
        },
    }


@router.post("/generate-video")
async def generate_video(payload: VideoRequest, request: Request):
    user = await require_studio(request)
    db = get_db(request)
    engine = _video_engine()
    fn = VIDEO_ENGINE.get(engine, _generate_video_stub)
    out = await fn(payload, user)
    doc = {
        "id": _uid("vid"),
        "owner_id": user.user_id,
        "created_at": _now().isoformat(),
        "request": payload.model_dump(),
        **out,
    }
    await db.studio_videos.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


@router.post("/generate-ads")
async def generate_ads(payload: AdsRequest, request: Request):
    user = await require_studio(request)
    db = get_db(request)
    engine = _ads_engine()
    fn = ADS_ENGINE.get(engine, _generate_ads_openai_stub)
    out = await fn(payload, user)
    doc = {
        "id": _uid("adb"),
        "owner_id": user.user_id,
        "created_at": _now().isoformat(),
        "request": payload.model_dump(),
        **out,
    }
    # Save with full ads payload
    await db.studio_ad_batches.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


@router.get("/videos/{vid}")
async def get_video(vid: str, request: Request):
    user = await require_studio(request)
    db = get_db(request)
    v = await db.studio_videos.find_one({"id": vid, "owner_id": user.user_id}, {"_id": 0})
    if not v: raise HTTPException(404, "No encontrado")
    return v


@router.get("/ad-batches/{bid}")
async def get_ad_batch(bid: str, request: Request):
    user = await require_studio(request)
    db = get_db(request)
    b = await db.studio_ad_batches.find_one({"id": bid, "owner_id": user.user_id}, {"_id": 0})
    if not b: raise HTTPException(404, "No encontrado")
    return b


@router.post("/ad-batches/{bid}/hero-image/{angulo}")
async def generate_hero_image(bid: str, angulo: str, request: Request):
    """Lazy hero image generation per ángulo — fits in single proxy timeout window.
    Image bytes stored in `studio_assets` to avoid BSON 16MB cap on the batch doc."""
    from emergentintegrations.llm.openai.image_generation import OpenAIImageGeneration
    user = await require_studio(request)
    db = get_db(request)
    batch = await db.studio_ad_batches.find_one({"id": bid, "owner_id": user.user_id}, {"_id": 0})
    if not batch: raise HTTPException(404, "Batch no encontrado")
    ang = next((a for a in ANGULOS if a["k"] == angulo), None)
    if not ang: raise HTTPException(400, "Ángulo inválido")

    # Skip if already exists
    existing = await db.studio_assets.find_one({"batch_id": bid, "angulo": angulo}, {"_id": 0, "image_b64": 0})
    if existing:
        return {"angulo": angulo, "asset_id": existing["asset_id"], "skipped": True}

    img_prompt = (f"Modern real estate marketing image for {batch['source_label']} in Mexico City. "
                  f"Angle: {ang['label']} ({ang['audience']}). "
                  f"Visual profile: {batch.get('visual_profile', 'joven')}. "
                  f"Architectural photography, dramatic natural lighting, premium feel, "
                  f"navy + cream + indigo color palette. No text overlays. Clean, high-end.")
    try:
        image_gen = OpenAIImageGeneration(api_key=os.environ.get("EMERGENT_LLM_KEY"))
        imgs = await image_gen.generate_images(prompt=img_prompt, model="gpt-image-1", number_of_images=1)
        if not imgs:
            raise HTTPException(502, "Generación falló")
        b64 = base64.b64encode(imgs[0]).decode("utf-8")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Engine error: {str(e)[:120]}")

    asset_id = _uid("asset")
    await db.studio_assets.insert_one({
        "asset_id": asset_id, "batch_id": bid, "angulo": angulo,
        "owner_id": user.user_id, "image_b64": b64, "created_at": _now(),
    })
    # Also tag ads of this ángulo with the asset_id
    await db.studio_ad_batches.update_one(
        {"id": bid, "owner_id": user.user_id},
        {"$set": {"ads.$[a].asset_id": asset_id}},
        array_filters=[{"a.angulo": angulo, "a.locked": {"$ne": True}}],
    )
    return {"angulo": angulo, "asset_id": asset_id}


@router.get("/assets/{asset_id}")
async def get_asset(asset_id: str, request: Request):
    """Serve a generated image (base64-encoded) — frontend uses data URL inline."""
    user = await require_studio(request)
    db = get_db(request)
    a = await db.studio_assets.find_one({"asset_id": asset_id, "owner_id": user.user_id}, {"_id": 0})
    if not a: raise HTTPException(404, "Asset no encontrado")
    return {"asset_id": asset_id, "image_b64": a["image_b64"], "angulo": a.get("angulo")}
