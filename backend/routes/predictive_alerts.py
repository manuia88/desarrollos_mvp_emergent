"""W5.x F8 · Predictive Alerts routes.

GET  /api/asesor/alertas                      · feed (poll 30s frontend)
POST /api/asesor/alertas/{alert_id}/snooze    · snooze adaptativo
POST /api/asesor/alertas/{alert_id}/contactar · marcar contactado
POST /api/asesor/alertas/{alert_id}/descartar · marcar descartado

Permission: advisor / asesor_admin / superadmin.
Rate-limit: 60/min/user.
"""
from __future__ import annotations

import logging
import time
from collections import defaultdict, deque
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

log = logging.getLogger("dmx.routes_predictive_alerts")
router = APIRouter(tags=["predictive-alerts"])

ASESOR_ROLES = {"advisor", "asesor_admin", "superadmin"}

# Rate limit 60/min/user
_RATE_BUCKETS: Dict[str, deque] = defaultdict(lambda: deque(maxlen=60))
_RATE_WINDOW_S = 60


def _db(req: Request):
    return req.app.state.db


def _now() -> datetime:
    return datetime.now(timezone.utc)


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


class SnoozeBody(BaseModel):
    hours: Optional[int] = Field(default=None, ge=1, le=720)


class ContactBody(BaseModel):
    notes: Optional[str] = Field(default=None, max_length=500)


class DismissBody(BaseModel):
    reason: Optional[str] = Field(default=None, max_length=200)


# ─── GET feed ────────────────────────────────────────────────────────────────

@router.get("/api/asesor/alertas")
async def list_alerts(
    request: Request,
    status: str = Query("active", pattern="^(active|snoozed|contacted|dismissed)$"),
    limit: int = Query(20, ge=1, le=100),
):
    user = await _auth(request)
    _rate_limit(user.user_id)
    db = _db(request)

    # Lazy expiry: snoozed con snoozed_until pasado → status="active"
    try:
        now_iso = _now()
        await db.predictive_alerts.update_many(
            {
                "advisor_id": user.user_id,
                "status": "snoozed",
                "snoozed_until": {"$lte": now_iso},
            },
            {"$set": {"status": "active", "snoozed_until": None}},
        )
    except Exception as e:
        log.debug(f"[predictive_alerts] lazy expiry fail: {e}")

    try:
        cur = db.predictive_alerts.find(
            {"advisor_id": user.user_id, "status": status},
            {"_id": 0},
            sort=[("created_at", -1)],
        ).limit(limit)
        alerts: List[Dict[str, Any]] = await cur.to_list(length=limit)
    except Exception as e:
        log.warning(f"[predictive_alerts] list_alerts query fail: {e}")
        alerts = []

    # Lookup lead_name + lead_whatsapp + property_title (best-effort)
    lead_ids = list({a.get("lead_id") for a in alerts if a.get("lead_id")})
    prop_ids = list({a.get("property_id") for a in alerts if a.get("property_id")})
    leads_map: Dict[str, Dict[str, Any]] = {}
    props_map: Dict[str, str] = {}
    try:
        if lead_ids:
            async for lc in db.lead_captures.find(
                {"lead_id": {"$in": lead_ids}},
                {"_id": 0, "lead_id": 1, "name": 1, "whatsapp": 1},
            ):
                leads_map[lc.get("lead_id")] = lc
    except Exception:
        pass
    try:
        if prop_ids:
            async for dev in db.developments.find(
                {"$or": [
                    {"id": {"$in": prop_ids}},
                    {"_id": {"$in": prop_ids}},
                    {"slug": {"$in": prop_ids}},
                ]},
                {"_id": 0, "id": 1, "slug": 1, "name": 1, "title": 1},
            ):
                key = dev.get("id") or dev.get("slug")
                if key:
                    props_map[key] = dev.get("name") or dev.get("title") or key
    except Exception:
        pass

    enriched: List[Dict[str, Any]] = []
    for a in alerts:
        lid = a.get("lead_id")
        pid = a.get("property_id")
        lead_info = leads_map.get(lid) if lid else None
        a["lead_name"] = (lead_info or {}).get("name") if lead_info else None
        a["lead_whatsapp"] = (lead_info or {}).get("whatsapp") if lead_info else None
        if pid and not a.get("property_title"):
            a["property_title"] = props_map.get(pid)
        # ISO-ify timestamps
        for k in ("created_at", "snoozed_until", "contacted_at", "dismissed_at"):
            v = a.get(k)
            if isinstance(v, datetime):
                a[k] = v.isoformat()
        enriched.append(a)

    try:
        total_active = await db.predictive_alerts.count_documents(
            {"advisor_id": user.user_id, "status": "active"}
        )
    except Exception:
        total_active = 0

    return {"alerts": enriched, "total_active": total_active, "status": status}


# ─── helpers para POST endpoints ─────────────────────────────────────────────

async def _get_alert_owned(db, alert_id: str, advisor_id: str) -> Dict[str, Any]:
    try:
        doc = await db.predictive_alerts.find_one({"alert_id": alert_id}, {"_id": 0})
    except Exception as e:
        log.warning(f"[predictive_alerts] find_one fail: {e}")
        doc = None
    if not doc:
        raise HTTPException(404, "Alerta no encontrada")
    if doc.get("advisor_id") != advisor_id:
        raise HTTPException(403, "Esta alerta no te pertenece")
    return doc


async def _audit(db, advisor_id: str, action: str, alert_id: str, before, after) -> None:
    try:
        from audit_immutable_engine import log as audit_log
        await audit_log(
            db,
            actor={"user_id": advisor_id, "role": "advisor"},
            action=action,
            entity_type="predictive_alert",
            entity_id=alert_id,
            before=before,
            after=after,
        )
    except Exception as e:
        log.debug(f"[predictive_alerts] audit fail: {e}")


# ─── POST snooze ─────────────────────────────────────────────────────────────

@router.post("/api/asesor/alertas/{alert_id}/snooze")
async def snooze_alert(alert_id: str, body: SnoozeBody, request: Request):
    from datetime import timedelta
    from predictive_alerts_engine import compute_smart_snooze_hours

    user = await _auth(request)
    _rate_limit(user.user_id)
    db = _db(request)
    doc = await _get_alert_owned(db, alert_id, user.user_id)

    hours = body.hours
    if hours is None:
        hours = compute_smart_snooze_hours(doc.get("urgency_tier", "media"))
    snoozed_until = _now() + timedelta(hours=int(hours))

    try:
        await db.predictive_alerts.update_one(
            {"alert_id": alert_id},
            {"$set": {"status": "snoozed", "snoozed_until": snoozed_until}},
        )
    except Exception as e:
        log.warning(f"[predictive_alerts] snooze update fail: {e}")
        raise HTTPException(500, "Error al actualizar alerta")

    await _audit(db, user.user_id, "predictive_alert_snoozed", alert_id,
                  {"status": doc.get("status")},
                  {"status": "snoozed", "hours": hours, "snoozed_until": snoozed_until.isoformat()})

    return {"success": True, "snoozed_until": snoozed_until.isoformat(), "hours": hours}


# ─── POST contactar ──────────────────────────────────────────────────────────

@router.post("/api/asesor/alertas/{alert_id}/contactar")
async def contact_alert(alert_id: str, body: ContactBody, request: Request):
    user = await _auth(request)
    _rate_limit(user.user_id)
    db = _db(request)
    doc = await _get_alert_owned(db, alert_id, user.user_id)

    now = _now()
    try:
        await db.predictive_alerts.update_one(
            {"alert_id": alert_id},
            {"$set": {"status": "contacted", "contacted_at": now}},
        )
    except Exception as e:
        log.warning(f"[predictive_alerts] contact update fail: {e}")
        raise HTTPException(500, "Error al actualizar alerta")

    await _audit(db, user.user_id, "predictive_alert_contacted", alert_id,
                  {"status": doc.get("status")},
                  {"status": "contacted", "contacted_at": now.isoformat(),
                   "notes": (body.notes or "")[:500]})

    return {"success": True, "contacted_at": now.isoformat()}


# ─── POST descartar ──────────────────────────────────────────────────────────

@router.post("/api/asesor/alertas/{alert_id}/descartar")
async def dismiss_alert(alert_id: str, body: DismissBody, request: Request):
    user = await _auth(request)
    _rate_limit(user.user_id)
    db = _db(request)
    doc = await _get_alert_owned(db, alert_id, user.user_id)

    now = _now()
    try:
        await db.predictive_alerts.update_one(
            {"alert_id": alert_id},
            {"$set": {"status": "dismissed", "dismissed_at": now}},
        )
    except Exception as e:
        log.warning(f"[predictive_alerts] dismiss update fail: {e}")
        raise HTTPException(500, "Error al actualizar alerta")

    await _audit(db, user.user_id, "predictive_alert_dismissed", alert_id,
                  {"status": doc.get("status")},
                  {"status": "dismissed", "dismissed_at": now.isoformat(),
                   "reason": (body.reason or "")[:200]})

    return {"success": True, "dismissed_at": now.isoformat()}
