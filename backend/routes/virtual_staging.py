"""W5.17 · Virtual Staging routes.

POST /api/virtual-staging                 · generate (1-3 styles)
GET  /api/virtual-staging/cache/{image_hash}?room=&styles=

Permission: advisor/asesor_admin/developer_admin/developer_director/superadmin.
Rate-limit: 5/min/user (Replicate calls are expensive).
"""
from __future__ import annotations

import logging
import time
from collections import defaultdict, deque
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field, field_validator

log = logging.getLogger("dmx.routes_virtual_staging")
router = APIRouter(tags=["virtual-staging"])

ALLOWED_ROLES = {
    "advisor", "asesor_admin",
    "developer_admin", "developer_director", "developer_member",
    "superadmin",
}

_RATE_BUCKETS: Dict[str, deque] = defaultdict(lambda: deque(maxlen=5))
_RATE_WINDOW_S = 60
_RATE_LIMIT = 5


def _db(req: Request):
    return req.app.state.db


async def _auth(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    role = getattr(user, "role", None)
    if role not in ALLOWED_ROLES:
        raise HTTPException(
            403, "Sin permiso · solo advisor/asesor_admin/developer_*/superadmin"
        )
    return user


def _rate_limit(user_id: str) -> None:
    now = time.time()
    bkt = _RATE_BUCKETS[user_id]
    while bkt and (now - bkt[0]) > _RATE_WINDOW_S:
        bkt.popleft()
    if len(bkt) >= _RATE_LIMIT:
        raise HTTPException(429, f"Rate limit excedido · {_RATE_LIMIT}/min")
    bkt.append(now)


# ─── body schema ────────────────────────────────────────────────────────────

class StagingBody(BaseModel):
    input_image_url: str = Field(..., min_length=1, max_length=4096)
    room_type: str = Field(..., min_length=1, max_length=32)
    styles: List[str] = Field(..., min_length=1, max_length=3)

    @field_validator("room_type")
    @classmethod
    def _v_room(cls, v: str) -> str:
        from virtual_staging_engine import SUPPORTED_ROOMS
        if v not in SUPPORTED_ROOMS:
            raise ValueError(f"room_type inválido · soportados: {SUPPORTED_ROOMS}")
        return v

    @field_validator("styles")
    @classmethod
    def _v_styles(cls, v: List[str]) -> List[str]:
        from virtual_staging_engine import SUPPORTED_STYLES
        bad = [s for s in v if s not in SUPPORTED_STYLES]
        if bad:
            raise ValueError(f"styles inválidos: {bad} · soportados: {SUPPORTED_STYLES}")
        if len(set(v)) != len(v):
            raise ValueError("styles no pueden repetirse")
        return v


# ─── POST /api/virtual-staging ──────────────────────────────────────────────

@router.post("/api/virtual-staging")
async def post_virtual_staging(request: Request, body: StagingBody):
    user = await _auth(request)
    _rate_limit(user.user_id)
    db = _db(request)

    try:
        from virtual_staging_engine import stage_image
        result = await stage_image(
            db=db,
            input_image_url=body.input_image_url,
            room_type=body.room_type,
            styles=body.styles,
            user_id=getattr(user, "user_id", None),
            dev_org_id=getattr(user, "tenant_id", None),
        )
        return result
    except ValueError as e:
        raise HTTPException(422, str(e))
    except RuntimeError as e:
        # External dep failure (Replicate) → 503
        log.warning(f"[virtual_staging] 503 runtime: {e}")
        raise HTTPException(503, f"Servicio de staging no disponible · {e}")
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"[virtual_staging] unexpected: {e}")
        raise HTTPException(500, f"Error interno · {str(e)[:200]}")


# ─── GET /api/virtual-staging/admin/stats (superadmin) ──────────────────────

@router.get("/api/virtual-staging/admin/stats")
async def get_virtual_staging_admin_stats(request: Request):
    from permissions import require_superadmin
    await require_superadmin(request)
    db = _db(request)

    from datetime import datetime, timezone, timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)

    by_style: Dict[str, Dict[str, Any]] = {}
    by_room: Dict[str, int] = {}
    by_user: Dict[str, int] = {}
    total = 0
    cache_hits = 0
    sum_cost_usd = 0.0
    sum_ms = 0
    style_ms: Dict[str, list] = defaultdict(list)

    cursor = db.virtual_staging_cache.find(
        {"generated_at": {"$gte": cutoff}},
        {"_id": 0},
    )
    async for d in cursor:
        total += 1
        # cache hit detection: if a doc exists for same image_hash+room+styles earlier than this one
        # Heuristic: count entries where 'ai_budget_used' is 0 (no LLM call → was cache hit replay)
        budget = d.get("ai_budget_used") or 0
        try:
            cost_val = float(budget) if budget else 0.0
        except (TypeError, ValueError):
            cost_val = 0.0
        if cost_val == 0:
            cache_hits += 1
        sum_cost_usd += cost_val

        ms = int(d.get("processing_ms_total") or 0)
        sum_ms += ms

        room = d.get("room_type") or "?"
        by_room[room] = by_room.get(room, 0) + 1

        uid = d.get("user_id") or "anon"
        by_user[uid] = by_user.get(uid, 0) + 1

        styles_joined = d.get("styles_joined") or ""
        for s in [x for x in styles_joined.split(",") if x]:
            stat = by_style.setdefault(s, {"count": 0, "ms_samples": 0, "ms_total": 0})
            stat["count"] += 1
            stat["ms_samples"] += 1
            stat["ms_total"] += ms
            style_ms[s].append(ms)

    cache_rate = round((cache_hits / total) * 100, 1) if total else 0.0

    style_rows = []
    for s, st in by_style.items():
        avg_ms = round(st["ms_total"] / st["ms_samples"], 0) if st["ms_samples"] else 0
        style_rows.append({"style": s, "count": st["count"], "avg_processing_ms": avg_ms})
    style_rows.sort(key=lambda r: r["count"], reverse=True)
    top_style = style_rows[0]["style"] if style_rows else None

    room_rows = sorted(
        [{"room": r, "count": c} for r, c in by_room.items()],
        key=lambda x: x["count"],
        reverse=True,
    )

    top_users = sorted(
        [{"user_id": u, "count": c} for u, c in by_user.items()],
        key=lambda x: x["count"],
        reverse=True,
    )[:5]

    return {
        "days_window": 30,
        "total_stagings": total,
        "cache_hit_rate_pct": cache_rate,
        "total_replicate_cost_usd_30d": round(sum_cost_usd, 2),
        "top_style": top_style,
        "by_style": style_rows,
        "by_room": room_rows,
        "top_users_5": top_users,
    }


# ─── GET /api/virtual-staging/cache/{image_hash} ────────────────────────────

@router.get("/api/virtual-staging/cache/{image_hash}")
async def get_virtual_staging_cache(
    request: Request,
    image_hash: str,
    room: str = Query(..., min_length=1, max_length=32),
    styles: str = Query(..., min_length=1, max_length=128, description="csv sorted"),
):
    user = await _auth(request)
    _rate_limit(user.user_id)
    db = _db(request)

    try:
        from virtual_staging_engine import (
            get_cached, SUPPORTED_ROOMS, SUPPORTED_STYLES,
        )
        if room not in SUPPORTED_ROOMS:
            raise HTTPException(422, f"room inválido · soportados: {SUPPORTED_ROOMS}")
        # normalize styles_joined: split + dedupe + sorted
        try:
            req_styles = [s.strip() for s in styles.split(",") if s.strip()]
            if not req_styles or len(req_styles) > 3:
                raise ValueError("styles 1-3")
            bad = [s for s in req_styles if s not in SUPPORTED_STYLES]
            if bad:
                raise ValueError(f"styles inválidos: {bad}")
            styles_joined = ",".join(sorted(set(req_styles)))
        except ValueError as ve:
            raise HTTPException(422, str(ve))

        doc = await get_cached(db, image_hash, room, styles_joined)
        if not doc:
            raise HTTPException(404, "cache miss")
        doc["cached"] = True
        return doc
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"[virtual_staging] cache lookup unexpected: {e}")
        raise HTTPException(500, f"Error · {str(e)[:200]}")
