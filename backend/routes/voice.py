"""W4.10 Sub-Fix 3 — Voice Atlax routes.

Prefix: /api/voice · /api/superadmin/voice
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel

from voice_atlax_engine import VoiceAtlaxEngine

log = logging.getLogger("dmx.routes_voice")

router = APIRouter(tags=["voice"])


def _db(request: Request):
    return request.app.state.db


async def _get_user(request: Request) -> Dict[str, Any]:
    from server import get_current_user
    return await get_current_user(request)


# ─── Models ────────────────────────────────────────────────────────────────────

class SynthesizeIn(BaseModel):
    text: str
    session_token: str
    voice_id: Optional[str] = None


# ─── STT Endpoint ─────────────────────────────────────────────────────────────

@router.get("/api/voice/status")
async def voice_status(request: Request):
    """¿La voz de Atlax está disponible? (SIN LLM, $0). El front esconde el botón si está apagada, para no
    prometer algo que daría error. Reusa el check de tier + presencia de llaves."""
    db = _db(request)
    enabled, has_keys = False, False
    try:
        import voice_atlax_engine as ve
        enabled = await ve._check_voice_phase_y(db)
        has_keys = bool(ve.OPENAI_API_KEY) and bool(ve.ELEVEN_KEY)
    except Exception:
        pass
    return {"enabled": bool(enabled and has_keys), "tier_on": enabled, "has_keys": has_keys}


@router.post("/api/voice/transcribe")
async def transcribe_audio(
    request: Request,
    audio: UploadFile = File(...),
    session_token: Optional[str] = None,
    language: str = "es",
):
    """STT: audio multipart → transcript (Whisper-1)."""
    content_type = audio.content_type or ""
    if not any(ct in content_type for ct in ("audio", "video", "webm", "octet")):
        raise HTTPException(422, "Formato de audio no soportado. Envía webm/mp3/wav/ogg.")

    audio_bytes = await audio.read()
    if len(audio_bytes) > 25 * 1024 * 1024:
        raise HTTPException(413, "Audio demasiado grande (máx 25MB)")

    # Extraer session_token de form o query
    if not session_token:
        try:
            form = await request.form()
            session_token = form.get("session_token") or ""
        except Exception:
            pass

    if not session_token:
        raise HTTPException(422, "session_token requerido")

    db = _db(request)
    engine = VoiceAtlaxEngine(db)
    result = await engine.transcribe(audio_bytes, session_token, language=language)

    if result.get("tier_off"):
        raise HTTPException(403, "voice_atlax desactivado — activa el tier en Phase Y settings")

    if not result.get("ok"):
        raise HTTPException(503, result.get("error", "Error en transcripción"))

    return JSONResponse(result)


# ─── TTS Endpoint ─────────────────────────────────────────────────────────────

@router.post("/api/voice/synthesize")
async def synthesize_text(body: SynthesizeIn, request: Request):
    """TTS: texto → audio MP3 (ElevenLabs eleven_multilingual_v2)."""
    if len(body.text.strip()) < 1:
        raise HTTPException(422, "Texto vacío")

    db = _db(request)
    engine = VoiceAtlaxEngine(db)
    result = await engine.synthesize(body.text, body.session_token, body.voice_id)

    if result.get("tier_off"):
        raise HTTPException(403, "voice_atlax desactivado — activa el tier en Phase Y settings")

    if not result.get("ok"):
        raise HTTPException(503, result.get("error", "Error en síntesis de voz"))

    return JSONResponse(result)


@router.get("/api/voice/{audio_id}/download")
async def download_audio(audio_id: str, request: Request):
    """Descarga archivo MP3 generado."""
    db = _db(request)
    engine = VoiceAtlaxEngine(db)
    audio_bytes = await engine.get_audio_file(audio_id)
    if not audio_bytes:
        raise HTTPException(404, "Audio no encontrado")

    return Response(
        content=audio_bytes,
        media_type="audio/mpeg",
        headers={"Content-Disposition": f"inline; filename={audio_id}.mp3"},
    )


# ─── Superadmin stats ─────────────────────────────────────────────────────────

@router.get("/api/superadmin/voice/usage")
async def voice_usage(request: Request, org_id: Optional[str] = None, days: int = 30):
    user = await _get_user(request)
    if getattr(user,"role",None) != "superadmin":
        raise HTTPException(403, "Solo superadmin")

    db = _db(request)
    from datetime import timedelta, timezone, datetime
    since = datetime.now(timezone.utc) - timedelta(days=days)

    pipeline = [
        {"$match": {"created_at": {"$gte": since}}},
        {"$group": {
            "_id": "$direction",
            "count": {"$sum": 1},
            "total_cost_usd": {"$sum": "$cost_usd"},
            "avg_latency_ms": {"$avg": "$latency_ms"},
        }},
    ]
    stats: Dict[str, Any] = {}
    async for doc in db.voice_interactions.aggregate(pipeline):
        stats[doc["_id"]] = {
            "count": doc["count"],
            "total_cost_usd": round(doc["total_cost_usd"], 6),
            "avg_latency_ms": round(doc.get("avg_latency_ms") or 0),
        }

    total = await db.voice_interactions.count_documents({"created_at": {"$gte": since}})
    return JSONResponse({"ok": True, "days": days, "total": total, "by_direction": stats})
