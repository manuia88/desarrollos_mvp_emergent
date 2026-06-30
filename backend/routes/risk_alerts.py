"""W3.4B — Risk Alerts Routes (letter change engine).

Endpoints (superadmin-only):
  GET  /api/superadmin/risk-alerts                    — list paginado/filters
  GET  /api/superadmin/risk-alerts/timeline/{zone_id} — series temporal letter changes
  POST /api/superadmin/risk-alerts/{id}/acknowledge   — marca visto (audit)
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request

log = logging.getLogger("dmx.routes_risk_alerts")

router = APIRouter(tags=["risk_alerts"])


def _db(request: Request):
    return request.app.state.db


async def _sa(request: Request):
    from permissions import require_superadmin
    return await require_superadmin(request)


def _iso_now():
    return datetime.now(timezone.utc).isoformat()


# ─── List ─────────────────────────────────────────────────────────────────────

@router.get("/api/superadmin/risk-alerts")
async def list_alerts(
    request: Request,
    zone_id: Optional[str] = Query(None),
    severity: Optional[str] = Query(None, regex="^(critical|warning|info)$"),
    days: int = Query(30, ge=1, le=365),
    limit: int = Query(50, ge=1, le=200),
    skip: int = Query(0, ge=0),
):
    await _sa(request)
    db = _db(request)
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    q: dict = {"changed_at_dt": {"$gte": cutoff}}
    if zone_id: q["zone_id"] = zone_id
    if severity: q["severity"] = severity

    total = await db.risk_letter_changes.count_documents(q)
    cursor = db.risk_letter_changes.find(
        q, {"_id": 0, "changed_at_dt": 0},
    ).sort("changed_at_dt", -1).skip(skip).limit(limit)
    items = [d async for d in cursor]

    crit = await db.risk_letter_changes.count_documents({
        "severity": "critical",
        "changed_at_dt": {"$gte": cutoff},
        "acknowledged_at": None,
    })
    drops = await db.risk_letter_changes.count_documents({
        "severity": {"$in": ["warning", "critical"]},
        "changed_at_dt": {"$gte": cutoff},
    })
    rises = await db.risk_letter_changes.count_documents({
        "severity": "info",
        "changed_at_dt": {"$gte": cutoff},
    })
    return {
        "items": items, "count": len(items), "count_total": total,
        "skip": skip, "limit": limit,
        "kpis": {
            "critical_open": crit,
            "drops_in_window": drops,
            "rises_in_window": rises,
            "window_days": days,
        },
    }


# ─── Timeline per zone ────────────────────────────────────────────────────────

@router.get("/api/superadmin/risk-alerts/timeline/{zone_id}")
async def zone_timeline(zone_id: str, request: Request, limit: int = Query(50, ge=1, le=200)):
    await _sa(request)
    db = _db(request)
    cursor = db.risk_letter_changes.find(
        {"zone_id": zone_id}, {"_id": 0, "changed_at_dt": 0},
    ).sort("changed_at_dt", -1).limit(limit)
    items = [d async for d in cursor]
    return {"zone_id": zone_id, "items": items, "count": len(items)}


# ─── Acknowledge ──────────────────────────────────────────────────────────────

@router.post("/api/superadmin/risk-alerts/{change_id}/acknowledge")
async def acknowledge_alert(change_id: str, request: Request):
    user = await _sa(request)
    db = _db(request)
    from pymongo import ReturnDocument
    res = await db.risk_letter_changes.find_one_and_update(
        {"id": change_id},
        {"$set": {
            "acknowledged_at": _iso_now(),
            "acknowledged_by": getattr(user, "user_id", None),
        }},
        return_document=ReturnDocument.AFTER,
    )
    if not res:
        raise HTTPException(404, "Cambio no encontrado")
    res.pop("_id", None); res.pop("changed_at_dt", None)
    try:
        from audit_log import log_mutation
        await log_mutation(
            db, user, "update", "risk_letter_change", change_id,
            before=None, after={"acknowledged": True}, request=request,
        )
    except Exception as _e:
        log.warning("[audit] log_mutation perdido (risk_letter_change %s): %s", change_id, _e)
    return res
