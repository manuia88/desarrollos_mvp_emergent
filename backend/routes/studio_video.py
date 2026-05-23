"""W5.16-A · Studio Video routes.

POST /api/studio/video/script   · auto-script generator (hook/body/cta)
POST /api/studio/video/tts      · ElevenLabs TTS sintesis con cache
GET  /api/studio/video/voices   · 5 voces ES-MX curadas
GET  /api/studio/video/quota    · daily cap status

Permission: advisor / asesor_admin / developer_* / superadmin.
Rate-limit: script 20/min · tts 10/min.
"""
from __future__ import annotations

import logging
import time
from collections import defaultdict, deque
from typing import Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, field_validator

log = logging.getLogger("dmx.routes.studio_video")
router = APIRouter(tags=["studio-video"])

ALLOWED_ROLES = {
    "advisor", "asesor_admin", "asesor_freelance",
    "developer_admin", "developer_director", "developer_member", "developer",
    "superadmin",
}

_RATE_SCRIPT: Dict[str, deque] = defaultdict(lambda: deque(maxlen=20))
_RATE_TTS: Dict[str, deque] = defaultdict(lambda: deque(maxlen=10))
_WINDOW_S = 60


def _db(req: Request):
    return req.app.state.db


async def _auth(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    role = getattr(user, "role", None)
    if role not in ALLOWED_ROLES:
        raise HTTPException(403, "Sin permiso · solo advisor/developer/superadmin")
    return user


def _rate_check(bucket: Dict[str, deque], user_id: str, limit: int) -> None:
    now = time.time()
    bkt = bucket[user_id]
    while bkt and (now - bkt[0]) > _WINDOW_S:
        bkt.popleft()
    if len(bkt) >= limit:
        raise HTTPException(429, f"Rate limit excedido · {limit}/min")
    bkt.append(now)


async def _quota_or_403(db, dev_org_id: Optional[str]) -> Dict:
    from ai_budget import check_studio_video_quota
    q = await check_studio_video_quota(db, dev_org_id)
    if not q.get("available"):
        raise HTTPException(
            403,
            f"Quota studio_video excedida hoy · usado ${q.get('used_today_usd', 0):.2f} de ${q.get('cap_daily_usd', 0):.2f}",
        )
    return q


# ─── Pydantic bodies ────────────────────────────────────────────────────────

class ScriptBody(BaseModel):
    property_id: str = Field(..., min_length=1, max_length=128)
    duration_sec: int = Field(60)
    tone: str = Field("neutral")
    audience: Optional[str] = Field("neutral")

    @field_validator("duration_sec")
    @classmethod
    def _v_duration(cls, v: int) -> int:
        from studio_video_engine import SUPPORTED_DURATIONS
        if v not in SUPPORTED_DURATIONS:
            raise ValueError(f"duration_sec invalido · soportadas {SUPPORTED_DURATIONS}")
        return v

    @field_validator("tone")
    @classmethod
    def _v_tone(cls, v: str) -> str:
        from studio_video_engine import SUPPORTED_TONES
        if v not in SUPPORTED_TONES:
            raise ValueError(f"tone invalido · soportados {SUPPORTED_TONES}")
        return v


class GenerateVideoBody(BaseModel):
    script: str = Field(..., min_length=1, max_length=5000)
    image_url: Optional[str] = Field(None)
    provider: Optional[str] = Field("luma")
    duration_sec: Optional[int] = Field(60)

    @field_validator("provider")
    @classmethod
    def _v_provider(cls, v: Optional[str]) -> str:
        from studio_video_engine import SUPPORTED_PROVIDERS
        vv = (v or "luma").strip().lower()
        if vv not in SUPPORTED_PROVIDERS:
            raise ValueError(f"provider invalido · soportados {list(SUPPORTED_PROVIDERS)}")
        return vv

    @field_validator("duration_sec")
    @classmethod
    def _v_duration_b(cls, v: Optional[int]) -> int:
        from studio_video_engine import SUPPORTED_DURATIONS
        vv = int(v or 60)
        if vv not in SUPPORTED_DURATIONS:
            raise ValueError(f"duration_sec invalido · soportadas {SUPPORTED_DURATIONS}")
        return vv


class TTSBody(BaseModel):
    text: str = Field(..., min_length=1, max_length=2500)
    voice_id: str = Field("rachel_es")

    @field_validator("voice_id")
    @classmethod
    def _v_voice(cls, v: str) -> str:
        from adapters.tts.elevenlabs import SUPPORTED_VOICES_ES_MX
        ids = {vc["voice_id"] for vc in SUPPORTED_VOICES_ES_MX}
        if v not in ids:
            raise ValueError(f"voice_id invalido · soportados {sorted(ids)}")
        return v


# ─── POST /api/studio/video/script ─────────────────────────────────────────

@router.post("/api/studio/video/script")
async def post_video_script(request: Request, body: ScriptBody):
    user = await _auth(request)
    user_id = getattr(user, "user_id", None)
    dev_org_id = getattr(user, "tenant_id", None)
    _rate_check(_RATE_SCRIPT, user_id or "anon", limit=20)
    db = _db(request)

    quota = await _quota_or_403(db, dev_org_id)

    from studio_video_engine import generate_script_from_property
    try:
        res = await generate_script_from_property(
            db,
            property_id=body.property_id,
            duration_sec=body.duration_sec,
            tone=body.tone,
            audience=body.audience or "neutral",
            user_id=user_id,
            dev_org_id=dev_org_id,
        )
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    except Exception as exc:
        log.warning(f"[studio_video] script generation error: {exc}")
        raise HTTPException(500, "Error generando script")

    if not res.get("ok"):
        if res.get("reason") == "property_not_found":
            raise HTTPException(404, "property_id no encontrado")
        raise HTTPException(422, f"No fue posible generar script · {res.get('reason', 'unknown')}")

    res["quota"] = {
        "used_today_usd": quota.get("used_today_usd"),
        "remaining_usd": quota.get("remaining_usd"),
        "cap_daily_usd": quota.get("cap_daily_usd"),
    }
    return res


# ─── POST /api/studio/video/tts ────────────────────────────────────────────

@router.post("/api/studio/video/tts")
async def post_video_tts(request: Request, body: TTSBody):
    user = await _auth(request)
    user_id = getattr(user, "user_id", None)
    dev_org_id = getattr(user, "tenant_id", None)
    _rate_check(_RATE_TTS, user_id or "anon", limit=10)
    db = _db(request)

    quota = await _quota_or_403(db, dev_org_id)

    from adapters.tts.elevenlabs import synthesize_with_cache
    res = await synthesize_with_cache(
        db,
        text=body.text,
        voice_id=body.voice_id,
        user_id=user_id,
        dev_org_id=dev_org_id,
    )

    if not res.get("ok"):
        raise HTTPException(422, f"TTS sintesis falla · {res.get('error', 'unknown')}")

    res["quota"] = {
        "used_today_usd": quota.get("used_today_usd"),
        "remaining_usd": quota.get("remaining_usd"),
        "cap_daily_usd": quota.get("cap_daily_usd"),
    }
    return res


# ─── POST /api/studio-video/generate-video (W5.16-B multi-ratio) ──────────

_RATE_VIDEO: Dict[str, deque] = defaultdict(lambda: deque(maxlen=5))


@router.post("/api/studio-video/generate-video")
async def post_generate_video(request: Request, body: GenerateVideoBody):
    user = await _auth(request)
    user_id = getattr(user, "user_id", None)
    dev_org_id = getattr(user, "tenant_id", None)
    _rate_check(_RATE_VIDEO, user_id or "anon", limit=5)
    db = _db(request)

    from studio_video_engine import generate_video_multiratio
    try:
        res = await generate_video_multiratio(
            db,
            dev_org_id=dev_org_id,
            script=body.script,
            image_url=body.image_url,
            provider=body.provider or "luma",
            duration_sec=body.duration_sec or 60,
            user_id=user_id,
        )
    except Exception as exc:
        log.warning(f"[studio_video.B] generate error: {exc}")
        raise HTTPException(500, "Error generando video")

    if not res.get("ok"):
        reason = res.get("reason") or "unknown"
        if reason == "quota_exceeded":
            raise HTTPException(
                429,
                detail={"reason": "quota_exceeded", "quota": res.get("quota")},
            )
        if reason in ("script_empty",):
            raise HTTPException(422, "script vacio")
        raise HTTPException(422, f"No fue posible generar video · {reason}")

    return res


# ─── GET /api/studio/video/voices ──────────────────────────────────────────

@router.get("/api/studio/video/voices")
async def get_video_voices(request: Request):
    await _auth(request)
    from adapters.tts.elevenlabs import list_voices_es_mx, DEFAULT_VOICE_ID
    return {"voices": list_voices_es_mx(), "default_voice_id": DEFAULT_VOICE_ID}


# ─── GET /api/studio/video/quota ───────────────────────────────────────────

@router.get("/api/studio/video/quota")
async def get_video_quota(request: Request):
    user = await _auth(request)
    db = _db(request)
    dev_org_id = getattr(user, "tenant_id", None)
    from ai_budget import check_studio_video_quota
    return await check_studio_video_quota(db, dev_org_id)
