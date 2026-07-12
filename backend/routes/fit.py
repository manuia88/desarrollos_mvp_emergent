"""W5.x F11 · Fit Engine routes.

GET /api/fit/score?lead_id=&property_id=          · single score
GET /api/fit/lead/{lead_id}/top-properties        · top N props para un lead
GET /api/fit/property/{property_id}/top-leads     · top N leads para una propiedad

Permission: advisor / asesor_admin / superadmin.
Rate-limit: 60/min/user.
"""
from __future__ import annotations

import logging
import time
from collections import defaultdict, deque
from typing import Dict

from fastapi import APIRouter, HTTPException, Query, Request

log = logging.getLogger("dmx.routes_fit")
router = APIRouter(tags=["fit"])

ASESOR_ROLES = {"advisor", "asesor_admin", "superadmin"}
ADMIN_ROLES = {"asesor_admin", "superadmin", "developer_admin", "developer_director"}

_RATE_BUCKETS: Dict[str, deque] = defaultdict(lambda: deque(maxlen=60))
_RATE_WINDOW_S = 60


def _db(req: Request):
    return req.app.state.db


async def _auth(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    role = getattr(user, "role", None)
    if role not in ASESOR_ROLES:
        raise HTTPException(403, "Sin permiso · solo advisor/asesor_admin/superadmin")
    return user


def _rate_limit(user_id: str) -> None:
    now = time.time()
    bkt = _RATE_BUCKETS[user_id]
    while bkt and (now - bkt[0]) > _RATE_WINDOW_S:
        bkt.popleft()
    if len(bkt) >= 60:
        raise HTTPException(429, "Rate limit excedido · 60/min")
    bkt.append(now)


def _is_admin(user) -> bool:
    return getattr(user, "role", None) in ADMIN_ROLES


# ─── GET /api/fit/score ──────────────────────────────────────────────────────

@router.get("/api/fit/score")
async def get_fit_score(
    request: Request,
    lead_id: str = Query(..., min_length=1),
    property_id: str = Query(..., min_length=1),
):
    user = await _auth(request)
    _rate_limit(user.user_id)
    db = _db(request)

    # Advisor sólo puede ver leads que le pertenecen
    if not _is_admin(user):
        try:
            lc = await db.lead_captures.find_one(
                {"lead_id": lead_id}, {"_id": 0, "advisor_id": 1, "assigned_to": 1}
            )
            if lc:
                owner = lc.get("advisor_id") or lc.get("assigned_to")
                if owner and owner != user.user_id:
                    raise HTTPException(403, "Ese lead no te pertenece")
        except HTTPException:
            raise
        except Exception:
            pass

    from fit_engine import compute_fit_score
    res = await compute_fit_score(db, lead_id, property_id, user_id=user.user_id)
    if not res.get("ok"):
        if res.get("reason") == "property_not_found":
            raise HTTPException(404, "Propiedad no encontrada")
        raise HTTPException(400, res.get("reason") or "no_ok")

    # Strip datetimes for JSON
    out = {
        "lead_id": lead_id,
        "property_id": property_id,
        "property_title": res.get("property_title"),
        "score": res.get("score"),
        "confidence": res.get("confidence"),
        "breakdown": res.get("breakdown"),
        "explanation_short": res.get("explanation_short"),
        "reasons_top_3": res.get("reasons_top_3"),
        "cached": bool(res.get("cached")),
    }
    return out


# ─── GET /api/fit/lead/{lead_id}/top-properties ──────────────────────────────

@router.get("/api/fit/lead/{lead_id}/top-properties")
async def top_properties(
    lead_id: str,
    request: Request,
    limit: int = Query(5, ge=1, le=20),
):
    user = await _auth(request)
    _rate_limit(user.user_id)
    db = _db(request)

    # Candado canónico fail-closed (superadmin pasa; asesor plano solo sus leads).
    from tenant_scope import assert_lead_owner
    await assert_lead_owner(db, user, lead_id)

    from fit_engine import top_properties_for_lead
    res = await top_properties_for_lead(db, lead_id, limit=limit, user_id=user.user_id)
    return res


# ─── GET /api/fit/property/{property_id}/top-leads ───────────────────────────

@router.get("/api/fit/property/{property_id}/top-leads")
async def top_leads(
    property_id: str,
    request: Request,
    limit: int = Query(5, ge=1, le=20),
):
    user = await _auth(request)
    _rate_limit(user.user_id)
    db = _db(request)

    # Advisor solo si es primary_advisor de ese proyecto
    if not _is_admin(user):
        is_primary = False
        try:
            from data_developments import DEVELOPMENTS_BY_ID
            dev = DEVELOPMENTS_BY_ID.get(property_id)
            if dev:
                primary = (dev.get("primary_advisor_id")
                            or dev.get("advisor_id")
                            or dev.get("owner_id"))
                if primary and primary == user.user_id:
                    is_primary = True
        except Exception:
            pass
        if not is_primary:
            try:
                d = await db.developments.find_one(
                    {"$or": [{"id": property_id}, {"_id": property_id}, {"slug": property_id}]},
                    {"_id": 0, "primary_advisor_id": 1, "advisor_id": 1, "owner_id": 1},
                )
                if d:
                    primary = (d.get("primary_advisor_id")
                                or d.get("advisor_id")
                                or d.get("owner_id"))
                    if primary and primary == user.user_id:
                        is_primary = True
            except Exception:
                pass
        if not is_primary:
            raise HTTPException(403, "No eres el asesor primario de este proyecto")

    from fit_engine import top_leads_for_property
    res = await top_leads_for_property(db, property_id, limit=limit, user_id=user.user_id)
    return res
