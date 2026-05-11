"""W4.3 — Sub-Chunk C · Behavioral Tracking routes.

- POST /api/track  → público · rate limit 100 events/min/session
- GET  /api/superadmin/behavioral/events    → superadmin
- GET  /api/superadmin/behavioral/aggregate → superadmin
"""
from __future__ import annotations

import logging
import time
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from behavioral_tracking_engine import ingest_event, aggregate_by_feature

log = logging.getLogger("dmx.routes_behavioral")

# ─── Rate Limiter (in-process · acceptable para Wave 4) ───────────────────────
# { session_id: [timestamps_of_events_last_60s] }
_rate_buckets: Dict[str, list] = defaultdict(list)
_RATE_LIMIT = 100
_RATE_WINDOW = 60  # segundos


def _check_rate_limit(session_id: str) -> bool:
    """True si se puede aceptar el evento. False si supera el límite."""
    now = time.monotonic()
    bucket = _rate_buckets[session_id]
    # Purgar eventos fuera de la ventana
    _rate_buckets[session_id] = [t for t in bucket if now - t < _RATE_WINDOW]
    if len(_rate_buckets[session_id]) >= _RATE_LIMIT:
        return False
    _rate_buckets[session_id].append(now)
    return True


# ─── Pydantic models ───────────────────────────────────────────────────────────
class TrackEventIn(BaseModel):
    session_id: str
    event_type: str = "page_view"
    page: str = "/"
    feature: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


# ─── Routers ──────────────────────────────────────────────────────────────────
router = APIRouter(tags=["behavioral"])
sa_router = APIRouter(prefix="/api/superadmin/behavioral", tags=["behavioral-admin"])


@router.post("/api/track", status_code=201)
async def track_event(body: TrackEventIn, request: Request):
    """Ingesta pública de eventos. Rate limit 100/min/session."""
    session_id = body.session_id or "anon"
    if not _check_rate_limit(session_id):
        raise HTTPException(429, "Límite de eventos alcanzado. Intenta en 1 minuto.")

    db = request.app.state.db

    # Enriquecer con user_id si hay sesión activa
    user_id = None
    org_id = None
    try:
        from server import get_current_user
        u = await get_current_user(request)
        if u:
            user_id = getattr(u, "user_id", None)
            org_id = getattr(u, "tenant_id", None)
    except Exception:
        pass

    payload = {
        "session_id": session_id,
        "event_type": body.event_type,
        "page": body.page,
        "feature": body.feature,
        "metadata": body.metadata or {},
        "user_id": user_id,
        "org_id": org_id,
    }

    event_id = await ingest_event(db, payload, request)
    return JSONResponse({"event_id": event_id, "status": "ok"}, status_code=201)


# ─── Superadmin endpoints ──────────────────────────────────────────────────────
async def _require_superadmin(request: Request):
    from permissions import require_superadmin
    return await require_superadmin(request)


@sa_router.get("/events")
async def list_events(
    request: Request,
    org_id: Optional[str] = None,
    feature: Optional[str] = None,
    since: Optional[str] = None,
    limit: int = 100,
):
    """Lista eventos paginados. Filtros: org_id, feature, since (ISO datetime)."""
    await _require_superadmin(request)
    db = request.app.state.db

    if limit > 500:
        limit = 500

    query: Dict[str, Any] = {}
    if org_id:
        query["org_id"] = org_id
    if feature:
        query["feature"] = feature
    if since:
        try:
            since_dt = datetime.fromisoformat(since.replace("Z", "+00:00"))
            query["timestamp"] = {"$gte": since_dt}
        except ValueError:
            raise HTTPException(422, "Formato de 'since' inválido. Usa ISO 8601.")

    docs = await db.behavioral_events.find(
        query, {"_id": 0}
    ).sort("timestamp", -1).limit(limit).to_list(length=limit)

    # Serializar datetimes
    for d in docs:
        ts = d.get("timestamp")
        if isinstance(ts, datetime):
            d["timestamp"] = ts.isoformat()

    return JSONResponse({"items": docs, "count": len(docs), "limit": limit})


@sa_router.get("/aggregate")
async def aggregate_events(
    request: Request,
    org_id: Optional[str] = None,
    since: Optional[str] = None,
):
    """Agrega conteos por feature y por page."""
    await _require_superadmin(request)
    db = request.app.state.db

    since_dt: Optional[datetime] = None
    if since:
        try:
            since_dt = datetime.fromisoformat(since.replace("Z", "+00:00"))
        except ValueError:
            # Default a últimos 30 días si formato inválido
            since_dt = datetime.now(timezone.utc) - timedelta(days=30)
    else:
        since_dt = datetime.now(timezone.utc) - timedelta(days=30)

    result = await aggregate_by_feature(db, org_id, since_dt)
    return JSONResponse(result)
