"""W5.22 Z.4 · Video Standalone routes (7 endpoints).

POST   /api/video-standalone/generate                       (T2+ advisor)
GET    /api/video-standalone/history?days=&provider=&...    (T2+ advisor · own)
POST   /api/video-standalone/{video_id}/export?format=      (T2+ advisor)
POST   /api/video-standalone/{video_id}/share-whatsapp?ratio= (T2+ advisor)
GET    /api/video-standalone/{video_id}                     (T2+ advisor · own)
DELETE /api/video-standalone/{video_id}                     (T2+ advisor · own)
GET    /api/superadmin/video-standalone/stats?days=         (superadmin)

REUSA W5.16 Studio Video bundle via video_standalone_engine (NO redefine adapters).
Rate-limit: generate 5/min · resto 30/min.
"""
from __future__ import annotations

import logging
import time
from collections import defaultdict, deque
from typing import Dict, Optional

from fastapi import APIRouter, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field, field_validator

log = logging.getLogger("dmx.routes.video_standalone")
router = APIRouter(tags=["video-standalone"])

ADVISOR_ROLES = {
    "advisor", "asesor", "asesor_admin", "asesor_freelance",
    "inmobiliaria_admin", "inmobiliaria_director", "inmobiliaria_member",
    "developer_admin", "developer_director", "developer_member", "developer",
    "superadmin",
}

_RATE_GENERATE: Dict[str, deque] = defaultdict(lambda: deque(maxlen=5))
_RATE_GENERAL: Dict[str, deque] = defaultdict(lambda: deque(maxlen=30))
_WINDOW_S = 60


def _db(req: Request):
    return req.app.state.db


async def _auth(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    role = getattr(user, "role", None)
    if role not in ADVISOR_ROLES:
        raise HTTPException(403, "Sin permiso · solo advisor/developer/superadmin")
    return user


async def _auth_superadmin(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    if getattr(user, "role", None) != "superadmin":
        raise HTTPException(403, "Solo superadmin")
    return user


def _rate(bucket: Dict[str, deque], user_id: str, limit: int) -> None:
    now = time.time()
    bkt = bucket[user_id]
    while bkt and (now - bkt[0]) > _WINDOW_S:
        bkt.popleft()
    if len(bkt) >= limit:
        raise HTTPException(429, f"Rate limit excedido · {limit}/min")
    bkt.append(now)


async def _assert_video_owner(db, video_id: str, user):
    """Tenant isolation · 404 si no existe o no es del caller (superadmin bypass)."""
    from video_standalone_engine import get_job
    user_id = getattr(user, "user_id", None)
    is_superadmin = getattr(user, "role", None) == "superadmin"
    job = await get_job(db, video_id, user_id=None if is_superadmin else user_id)
    if not job:
        raise HTTPException(404, "Video no encontrado")
    return job


# ─── Pydantic ────────────────────────────────────────────────────────────────
class GenerateBody(BaseModel):
    script: str = Field(..., min_length=1, max_length=5000)
    image_url: Optional[str] = Field(None, max_length=2000)
    provider: Optional[str] = Field(None)
    audience: Optional[str] = Field(None, max_length=200)
    duration_sec: Optional[int] = Field(60)
    hook_check: Optional[bool] = Field(False)

    @field_validator("provider")
    @classmethod
    def _v_provider(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        from video_standalone_engine import SUPPORTED_PROVIDERS
        vv = (v or "").strip().lower()
        if vv and vv not in SUPPORTED_PROVIDERS:
            raise ValueError(f"provider invalido · soportados {list(SUPPORTED_PROVIDERS)}")
        return vv or None

    @field_validator("duration_sec")
    @classmethod
    def _v_duration(cls, v: Optional[int]) -> int:
        from video_standalone_engine import SUPPORTED_DURATIONS
        vv = int(v or 60)
        if vv not in SUPPORTED_DURATIONS:
            raise ValueError(f"duration_sec invalido · soportadas {list(SUPPORTED_DURATIONS)}")
        return vv


# ─── POST /generate ──────────────────────────────────────────────────────────
@router.post("/api/video-standalone/generate")
async def post_generate(request: Request, body: GenerateBody):
    user = await _auth(request)
    user_id = getattr(user, "user_id", None)
    dev_org_id = getattr(user, "tenant_id", None)
    _rate(_RATE_GENERATE, user_id or "anon", limit=5)
    db = _db(request)

    from video_standalone_engine import generate_video_robust
    try:
        res = await generate_video_robust(
            db,
            dev_org_id=dev_org_id,
            user_id=user_id,
            script=body.script,
            image_url=body.image_url,
            provider=body.provider,
            audience=body.audience,
            duration_sec=body.duration_sec or 60,
            hook_check=bool(body.hook_check),
        )
    except Exception as exc:
        log.warning(f"[video_standalone] generate error: {exc}")
        raise HTTPException(500, "Error generando video")

    if not res.get("ok"):
        reason = res.get("reason") or "unknown"
        if reason == "quota_exceeded":
            raise HTTPException(429, detail={"reason": "quota_exceeded", "quota": res.get("quota")})
        if reason == "script_empty":
            raise HTTPException(422, "script vacio")
        # provider_error / engine_error · 502 con retry suggestion (job persistido)
        raise HTTPException(
            502,
            detail={"reason": reason, "video_id": res.get("video_id"),
                    "retry_suggestion": res.get("retry_suggestion")},
        )
    return res


# ─── GET /history ────────────────────────────────────────────────────────────
@router.get("/api/video-standalone/history")
async def get_history(
    request: Request,
    days: int = Query(default=30, ge=1, le=365),
    provider: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    ratio: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
):
    user = await _auth(request)
    user_id = getattr(user, "user_id", None)
    _rate(_RATE_GENERAL, user_id or "anon", limit=30)
    db = _db(request)
    from video_standalone_engine import get_user_history
    return await get_user_history(
        db, user_id=user_id, limit=limit,
        filters={"days": days, "provider": provider, "status": status, "ratio": ratio},
    )


# ─── POST /{video_id}/export ─────────────────────────────────────────────────
@router.post("/api/video-standalone/{video_id}/export")
async def post_export(request: Request, video_id: str, format: str = Query(default="pdf")):
    user = await _auth(request)
    user_id = getattr(user, "user_id", None)
    _rate(_RATE_GENERAL, user_id or "anon", limit=30)
    db = _db(request)
    await _assert_video_owner(db, video_id, user)

    from video_standalone_engine import export_video
    is_superadmin = getattr(user, "role", None) == "superadmin"
    res = await export_video(
        db, video_id, user_id=None if is_superadmin else user_id, fmt=format,
    )
    if not res.get("ok"):
        reason = res.get("reason") or "unknown"
        if reason == "not_found":
            raise HTTPException(404, "Video no encontrado")
        if reason == "format_invalid":
            raise HTTPException(422, "format invalido · usa pdf|download")
        raise HTTPException(500, f"Export falló · {reason}")

    if res.get("format") == "pdf":
        return Response(
            content=res["pdf_bytes"],
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{res.get("filename", "video.pdf")}"'},
        )
    return res


# ─── POST /{video_id}/share-whatsapp ─────────────────────────────────────────
@router.post("/api/video-standalone/{video_id}/share-whatsapp")
async def post_share_whatsapp(request: Request, video_id: str, ratio: str = Query(default="9:16")):
    user = await _auth(request)
    user_id = getattr(user, "user_id", None)
    _rate(_RATE_GENERAL, user_id or "anon", limit=30)
    db = _db(request)
    await _assert_video_owner(db, video_id, user)

    from video_standalone_engine import share_to_whatsapp
    is_superadmin = getattr(user, "role", None) == "superadmin"
    res = await share_to_whatsapp(
        db, video_id, user_id=None if is_superadmin else user_id, ratio=ratio,
    )
    if not res.get("ok"):
        raise HTTPException(404, "Video no encontrado")
    return res


# ─── GET /{video_id} ─────────────────────────────────────────────────────────
@router.get("/api/video-standalone/{video_id}")
async def get_one(request: Request, video_id: str):
    user = await _auth(request)
    user_id = getattr(user, "user_id", None)
    _rate(_RATE_GENERAL, user_id or "anon", limit=30)
    db = _db(request)
    job = await _assert_video_owner(db, video_id, user)
    return job


# ─── DELETE /{video_id} ──────────────────────────────────────────────────────
@router.delete("/api/video-standalone/{video_id}")
async def delete_one(request: Request, video_id: str):
    user = await _auth(request)
    user_id = getattr(user, "user_id", None)
    _rate(_RATE_GENERAL, user_id or "anon", limit=30)
    db = _db(request)
    await _assert_video_owner(db, video_id, user)

    from video_standalone_engine import delete_video
    is_superadmin = getattr(user, "role", None) == "superadmin"
    res = await delete_video(db, video_id, user_id=None if is_superadmin else user_id)
    if not res.get("ok"):
        raise HTTPException(404, "Video no encontrado")
    return res


# ─── GET /api/superadmin/video-standalone/stats ──────────────────────────────
@router.get("/api/superadmin/video-standalone/stats")
async def get_superadmin_stats_route(request: Request, days: int = Query(default=30, ge=1, le=365)):
    user = await _auth_superadmin(request)
    _rate(_RATE_GENERAL, getattr(user, "user_id", "anon"), limit=30)
    db = _db(request)
    from video_standalone_engine import get_superadmin_stats
    return await get_superadmin_stats(db, days=days)
