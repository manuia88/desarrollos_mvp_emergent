"""W4.10 Sub-Fix 3 — Voice Atlax Engine.

Whisper STT (OpenAI) + ElevenLabs TTS adapter.
Phase Y: master_switch + feature_tier voice_atlax >= T1
"""
from __future__ import annotations

import base64
import logging
import os
import uuid
import time
from datetime import datetime, timezone
from typing import Any, Dict, Optional

log = logging.getLogger("dmx.voice_atlax")

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
ELEVEN_KEY = os.environ.get("ELEVENLABS_API_KEY") or os.environ.get("ELEVEN_LABS_API_KEY", "")
# Voz por defecto ElevenLabs — modelo multilingual v2
DEFAULT_VOICE_ID = os.environ.get("ELEVEN_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")  # Rachel (neutral)
UPLOAD_DIR = os.environ.get("DI_UPLOAD_DIR", "/app/backend/uploads")
VOICE_DIR = f"{UPLOAD_DIR}/voice"

MAX_AUDIO_SECONDS = 60
MAX_INTERACTIONS_PER_DAY = 50


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _interaction_id() -> str:
    return f"vi_{uuid.uuid4().hex[:14]}"


# ─── Phase Y check ─────────────────────────────────────────────────────────────

async def _check_voice_phase_y(db) -> bool:
    try:
        from routes.phase_y_controls import get_phase_y_settings
        s = await get_phase_y_settings(db, "dmx")
        tier = (s.get("feature_tiers") or {}).get("voice_atlax", "off")
        return tier not in ("off", "T0")
    except Exception:
        return False


# ─── Utilidades ───────────────────────────────────────────────────────────────

import asyncio
import os as _os

def _ensure_voice_dir():
    _os.makedirs(VOICE_DIR, exist_ok=True)


# ─── VoiceAtlaxEngine ─────────────────────────────────────────────────────────

class VoiceAtlaxEngine:

    def __init__(self, db):
        self.db = db

    async def _rate_check(self, session_token: str) -> bool:
        """Verifica límite de 50 interacciones/día por sesión."""
        from datetime import timezone
        from_dt = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        count = await self.db.voice_interactions.count_documents({
            "session_token": session_token,
            "created_at": {"$gte": from_dt},
        })
        return count < MAX_INTERACTIONS_PER_DAY

    async def transcribe(self, audio_bytes: bytes, session_token: str, language: str = "es") -> Dict[str, Any]:
        """
        STT: audio bytes → texto via OpenAI Whisper.
        Retorna {ok, transcript, cost_usd, latency_ms, model_stt}
        """
        phase_ok = await _check_voice_phase_y(self.db)
        if not phase_ok:
            return {"ok": False, "error": "voice_atlax desactivado (tier off)", "tier_off": True}

        rate_ok = await self._rate_check(session_token)
        if not rate_ok:
            return {"ok": False, "error": f"Límite de {MAX_INTERACTIONS_PER_DAY} interacciones/día alcanzado"}

        if not OPENAI_API_KEY:
            return {"ok": False, "error": "OPENAI_API_KEY no configurado — STT no disponible"}

        start = time.time()
        try:
            from openai import AsyncOpenAI
            client = AsyncOpenAI(api_key=OPENAI_API_KEY)

            # Guardar audio temporal
            _ensure_voice_dir()
            tmp_path = f"{VOICE_DIR}/tmp_{uuid.uuid4().hex[:8]}.webm"
            with open(tmp_path, "wb") as f:
                f.write(audio_bytes)

            with open(tmp_path, "rb") as f:
                response = await client.audio.transcriptions.create(
                    model="whisper-1",
                    file=f,
                    language=language,
                    response_format="text",
                )

            # Cleanup temp
            try:
                _os.remove(tmp_path)
            except Exception:
                pass

            latency_ms = int((time.time() - start) * 1000)
            # Costo Whisper: ~$0.006/min → ~$0.0001 para 1s
            duration_est = max(1, len(audio_bytes) / 16000)  # estimado
            cost_usd = round(duration_est / 60 * 0.006, 6)

            transcript = str(response).strip() if response else ""

            await self.db.voice_interactions.insert_one({
                "_id": _interaction_id(),
                "session_token": session_token,
                "direction": "input_voice",
                "audio_duration_seconds": duration_est,
                "transcript_text": transcript,
                "language": f"es-MX",
                "latency_ms": latency_ms,
                "cost_usd": cost_usd,
                "model_stt": "whisper-1",
                "model_tts": None,
                "created_at": _now(),
            })

            # ── AI cost tracking (best-effort, fire-and-forget) ────────────
            try:
                from ai_budget import track_ai_call
                # Whisper has no token concept — use duration as proxy for call visibility.
                _proxy_tokens = max(1, int(duration_est * 100))  # ~1 min audio → 6000 "tokens"
                await track_ai_call(
                    db=self.db,
                    dev_org_id=session_token or "default",
                    model="whisper-1",
                    tokens=_proxy_tokens,
                    tokens_in=_proxy_tokens,
                    tokens_out=max(1, len(transcript) // 4),
                    call_type="voice_atlax",
                    feature_key="voice_atlax",
                )
            except Exception as _exc:
                log.warning(f"[track_ai_call] failed silent: {_exc}")

            return {
                "ok": True,
                "transcript": transcript,
                "cost_usd": cost_usd,
                "latency_ms": latency_ms,
                "model_stt": "whisper-1",
            }

        except Exception as exc:
            log.error(f"[voice] transcribe error: {exc}")
            return {"ok": False, "error": str(exc)}

    async def synthesize(self, text: str, session_token: str, voice_id: Optional[str] = None) -> Dict[str, Any]:
        """
        TTS: texto → audio MP3 via ElevenLabs.
        Retorna {ok, audio_base64, audio_url_relative, cost_usd, latency_ms, model_tts}
        """
        phase_ok = await _check_voice_phase_y(self.db)
        if not phase_ok:
            return {"ok": False, "error": "voice_atlax desactivado (tier off)", "tier_off": True}

        rate_ok = await self._rate_check(session_token)
        if not rate_ok:
            return {"ok": False, "error": f"Límite de {MAX_INTERACTIONS_PER_DAY} interacciones/día alcanzado"}

        if not ELEVEN_KEY:
            return {"ok": False, "error": "ELEVENLABS_API_KEY no configurado — TTS no disponible"}

        if not text or not text.strip():
            return {"ok": False, "error": "Texto vacío"}

        # Cap texto
        text = text.strip()[:600]
        vid = voice_id or DEFAULT_VOICE_ID
        start = time.time()

        try:
            from elevenlabs.client import ElevenLabs
            eleven_client = ElevenLabs(api_key=ELEVEN_KEY)

            audio_generator = eleven_client.text_to_speech.convert(
                text=text,
                voice_id=vid,
                model_id="eleven_multilingual_v2",
            )

            audio_data = b""
            for chunk in audio_generator:
                audio_data += chunk

            latency_ms = int((time.time() - start) * 1000)

            # Guardar MP3
            _ensure_voice_dir()
            audio_id = f"tts_{uuid.uuid4().hex[:12]}"
            audio_path = f"{VOICE_DIR}/{audio_id}.mp3"
            with open(audio_path, "wb") as f:
                f.write(audio_data)

            # Costo ElevenLabs estimado: ~$0.30/1000 chars
            cost_usd = round(len(text) / 1000 * 0.30, 6)
            audio_b64 = base64.b64encode(audio_data).decode()

            await self.db.voice_interactions.insert_one({
                "_id": _interaction_id(),
                "session_token": session_token,
                "direction": "output_voice",
                "audio_duration_seconds": None,
                "transcript_text": text,
                "language": "es-MX",
                "latency_ms": latency_ms,
                "cost_usd": cost_usd,
                "model_stt": None,
                "model_tts": "eleven_multilingual_v2",
                "audio_id": audio_id,
                "created_at": _now(),
            })

            return {
                "ok": True,
                "audio_id": audio_id,
                "audio_base64": audio_b64,
                "audio_url_relative": f"/api/voice/{audio_id}/download",
                "cost_usd": cost_usd,
                "latency_ms": latency_ms,
                "model_tts": "eleven_multilingual_v2",
            }

        except Exception as exc:
            log.error(f"[voice] synthesize error: {exc}")
            return {"ok": False, "error": str(exc)}

    async def get_audio_file(self, audio_id: str) -> Optional[bytes]:
        """Retorna bytes del archivo MP3 guardado."""
        path = f"{VOICE_DIR}/{audio_id}.mp3"
        try:
            with open(path, "rb") as f:
                return f.read()
        except Exception:
            return None


# ─── Indexes ──────────────────────────────────────────────────────────────────

async def ensure_voice_indexes(db) -> None:
    try:
        await db.voice_interactions.create_index(
            [("session_token", 1), ("created_at", -1)],
            name="idx_voice_session_date", background=True,
        )
        await db.voice_interactions.create_index(
            "created_at",
            name="idx_voice_ttl",
            expireAfterSeconds=60 * 60 * 24 * 30,  # TTL 30 días
            background=True,
        )
        log.info("[voice] indexes OK")
    except Exception as exc:
        log.warning(f"[voice] ensure_indexes failed: {exc}")
