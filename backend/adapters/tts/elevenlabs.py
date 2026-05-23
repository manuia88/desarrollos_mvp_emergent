"""W5.16-A · ElevenLabs TTS adapter · STUB-AWARE.

Sin ELEVENLABS_API_KEY o ante 402/403/quota errors → retorna stub graceful
(audio_url apunta a /static/stub/voice_sample_es.mp3 · feature demo-able sin credito).

Voces ES-MX curadas (5) · cache 30d en `db.studio_video_audios`.
"""
from __future__ import annotations

import base64
import hashlib
import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

import httpx

log = logging.getLogger("dmx.adapters.tts.elevenlabs")

SUPPORTED_VOICES_ES_MX: List[Dict[str, str]] = [
    {"voice_id": "rachel_es", "name": "Rachel", "gender": "F", "tone": "warm", "elevenlabs_id": "21m00Tcm4TlvDq8ikWAM"},
    {"voice_id": "antonio_es", "name": "Antonio", "gender": "M", "tone": "professional", "elevenlabs_id": "ErXwobaYiN019PkySvjV"},
    {"voice_id": "sofia_es", "name": "Sofia", "gender": "F", "tone": "energetic", "elevenlabs_id": "EXAVITQu4vr4xnSDxMaL"},
    {"voice_id": "carlos_es", "name": "Carlos", "gender": "M", "tone": "authoritative", "elevenlabs_id": "VR6AewLTigWG4xSOukaG"},
    {"voice_id": "valentina_es", "name": "Valentina", "gender": "F", "tone": "luxury", "elevenlabs_id": "MF3mGyEYCl7XYWbV9V6O"},
]

DEFAULT_VOICE_ID = "rachel_es"
ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1"
STUB_AUDIO_URL = "/static/stub/voice_sample_es.mp3"
COST_PER_1K_CHARS_USD = 0.18  # typical ElevenLabs Multilingual v2 pricing
CHARS_PER_SEC = 12.0  # ES neutro ~12 chars/seg
MAX_TEXT_CHARS = 2500
CACHE_TTL_DAYS = 30


def list_voices_es_mx() -> List[Dict[str, str]]:
    return list(SUPPORTED_VOICES_ES_MX)


def _get_voice_config(voice_id: str) -> Optional[Dict[str, str]]:
    for v in SUPPORTED_VOICES_ES_MX:
        if v["voice_id"] == voice_id:
            return v
    return None


def _is_credit_error(status: int, body: Any) -> bool:
    if status in (402, 403):
        return True
    if isinstance(body, dict):
        for k in ("detail", "message", "error"):
            v = body.get(k)
            if isinstance(v, dict):
                # ElevenLabs returns {"detail": {"status": "...", "message": "..."}}
                inner_status = str(v.get("status") or "").lower()
                inner_msg = str(v.get("message") or "").lower()
                if "quota" in inner_status or "credit" in inner_status:
                    return True
                if "quota" in inner_msg or "insufficient" in inner_msg or "credit" in inner_msg:
                    return True
            elif isinstance(v, str):
                vl = v.lower()
                if "quota" in vl or "insufficient" in vl or "credit" in vl:
                    return True
    return False


def _estimate_duration_sec(text: str) -> float:
    return round(max(1.0, len(text) / CHARS_PER_SEC), 2)


def _estimate_cost_usd(text: str) -> float:
    return round((len(text) / 1000.0) * COST_PER_1K_CHARS_USD, 4)


def _audio_bytes_to_data_url(audio: bytes) -> str:
    b64 = base64.b64encode(audio).decode("ascii")
    return f"data:audio/mpeg;base64,{b64}"


def _stub_response(reason: str) -> Dict[str, Any]:
    return {
        "ok": True,
        "stub": True,
        "audio_url": STUB_AUDIO_URL,
        "duration_sec": 0,
        "cost_usd": 0.0,
        "model_used": "stub",
        "reason": reason,
    }


async def synthesize(
    text: str,
    voice_id: str = DEFAULT_VOICE_ID,
    output_format: str = "mp3_44100_128",
) -> Dict[str, Any]:
    """Text-to-speech con fallback STUB-AWARE. NUNCA throws upstream.

    Returns dict with keys: ok, stub, audio_url, duration_sec, cost_usd,
    model_used, optional reason/error.
    """
    if not isinstance(text, str) or not text.strip():
        return {"ok": False, "stub": False, "error": "text vacio"}
    if len(text) > MAX_TEXT_CHARS:
        return {"ok": False, "stub": False, "error": f"text excede {MAX_TEXT_CHARS} chars"}

    voice_cfg = _get_voice_config(voice_id)
    if not voice_cfg:
        return {"ok": False, "stub": False, "error": f"voice_id no soportado: {voice_id}"}

    api_key = os.environ.get("ELEVENLABS_API_KEY")
    if not api_key:
        return _stub_response("no_api_key")

    url = f"{ELEVENLABS_API_BASE}/text-to-speech/{voice_cfg['elevenlabs_id']}"
    headers = {
        "xi-api-key": api_key,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
    }
    payload = {
        "text": text,
        "model_id": "eleven_multilingual_v2",
        "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
    }
    params = {"output_format": output_format}

    try:
        async with httpx.AsyncClient(timeout=30) as cli:
            resp = await cli.post(url, headers=headers, json=payload, params=params)
    except Exception as exc:
        log.warning(f"[elevenlabs] network error · fallback stub: {exc}")
        return _stub_response("network_error_fallback")

    if resp.status_code == 200 and resp.headers.get("content-type", "").startswith("audio/"):
        audio_bytes = resp.content
        audio_url = _audio_bytes_to_data_url(audio_bytes)
        return {
            "ok": True,
            "stub": False,
            "audio_url": audio_url,
            "duration_sec": _estimate_duration_sec(text),
            "cost_usd": _estimate_cost_usd(text),
            "model_used": "eleven_multilingual_v2",
            "bytes": len(audio_bytes),
        }

    # Non-200 path · inspect body
    try:
        body_json = resp.json()
    except Exception:
        body_json = {"raw": resp.text[:500]}

    if _is_credit_error(resp.status_code, body_json):
        log.warning(f"[elevenlabs] credit/quota error {resp.status_code} · fallback stub")
        return _stub_response("insufficient_credit_fallback")

    log.warning(f"[elevenlabs] api error {resp.status_code} · body={str(body_json)[:200]}")
    return {
        "ok": False,
        "stub": False,
        "error": f"api_error_{resp.status_code}",
        "detail": str(body_json)[:300],
    }


def _cache_key(text: str, voice_id: str) -> str:
    payload = f"{voice_id}|{text}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]


async def synthesize_with_cache(
    db,
    text: str,
    voice_id: str = DEFAULT_VOICE_ID,
    user_id: Optional[str] = None,
    dev_org_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Cache 30d en db.studio_video_audios + opcional audit + ai_budget tracking."""
    cache_key = _cache_key(text or "", voice_id)
    try:
        hit = await db.studio_video_audios.find_one({"audio_id": cache_key}, {"_id": 0})
    except Exception as exc:
        log.warning(f"[elevenlabs] cache lookup failed: {exc}")
        hit = None
    if hit:
        out = dict(hit)
        out["cached"] = True
        return out

    res = await synthesize(text, voice_id=voice_id)
    if not res.get("ok"):
        return res

    now = datetime.now(timezone.utc)
    ttl_until = now + timedelta(days=CACHE_TTL_DAYS)
    doc = {
        "audio_id": cache_key,
        "voice_id": voice_id,
        "text_chars": len(text or ""),
        "audio_url": res["audio_url"],
        "duration_sec": res.get("duration_sec", 0),
        "cost_usd": res.get("cost_usd", 0.0),
        "model_used": res.get("model_used"),
        "stub": bool(res.get("stub")),
        "user_id": user_id,
        "dev_org_id": dev_org_id,
        "generated_at": now,
        "ttl_until": ttl_until,
    }
    try:
        await db.studio_video_audios.insert_one(dict(doc))
    except Exception as exc:
        log.warning(f"[elevenlabs] cache insert failed: {exc}")

    # ai_budget tracking solo si llamada real (no stub)
    if not res.get("stub") and dev_org_id:
        try:
            from ai_budget import track_ai_call
            est_tokens = max(1, len(text or "") // 4)
            await track_ai_call(
                db, dev_org_id=dev_org_id, model="elevenlabs_multilingual_v2",
                tokens=est_tokens, call_type="tts",
                feature_key="studio_video",
            )
        except Exception as exc:
            log.warning(f"[elevenlabs] ai_budget tracking failed: {exc}")

    # audit best-effort
    try:
        from audit_immutable_engine import log as audit_log
        await audit_log(
            db,
            actor={"user_id": user_id or "anon", "role": "system"},
            action="studio_video_tts_synthesized",
            entity_type="studio_video_audio",
            entity_id=cache_key,
            after={"voice_id": voice_id, "stub": res.get("stub"), "chars": len(text or "")},
        )
    except Exception as exc:
        log.debug(f"[elevenlabs] audit skipped: {exc}")

    out = dict(doc)
    out["cached"] = False
    out["ok"] = True
    out["generated_at"] = now.isoformat()
    out.pop("ttl_until", None)
    return out


async def ensure_audio_indexes(db) -> None:
    try:
        await db.studio_video_audios.create_index("audio_id", unique=True, background=True)
        await db.studio_video_audios.create_index(
            "ttl_until", expireAfterSeconds=0, background=True,
        )
        await db.studio_video_audios.create_index(
            [("dev_org_id", 1), ("generated_at", -1)], background=True,
        )
    except Exception as exc:
        log.warning(f"[elevenlabs] ensure_audio_indexes failed: {exc}")
