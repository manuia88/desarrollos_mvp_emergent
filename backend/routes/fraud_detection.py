"""W3.4A — Fraud Detection Routes (superadmin-only).

Endpoints:
  GET  /api/superadmin/fraud-alerts             — list paginado (filters)
  GET  /api/superadmin/fraud-alerts/{id}        — detail with full evidence
  POST /api/superadmin/fraud-alerts/{id}/resolve — body {resolution_note}
  POST /api/superadmin/fraud-alerts/{id}/dismiss — body {reason}
  POST /api/superadmin/fraud-alerts/scan         — manual batch scan trigger
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

import fraud_detection_engine as fraud

log = logging.getLogger("dmx.routes_fraud_detection")

router = APIRouter(tags=["fraud_detection"])

PREFIX = "/api/superadmin/fraud-alerts"


def _db(request: Request):
    return request.app.state.db


async def _sa(request: Request):
    from permissions import require_superadmin
    return await require_superadmin(request)


# ─── List ─────────────────────────────────────────────────────────────────────

@router.get(PREFIX)
async def list_alerts(
    request: Request,
    status: Optional[str] = Query(None, regex="^(open|investigating|resolved|dismissed)$"),
    severity: Optional[str] = Query(None, regex="^(critical|amber|info)$"),
    source: Optional[str] = Query(None, regex="^(price_anomaly|duplicate|title_chain)$"),
    zone_id: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    skip: int = Query(0, ge=0),
):
    await _sa(request)
    db = _db(request)
    q: dict = {}
    if status:   q["status"] = status
    if severity: q["severity"] = severity
    if source:   q["source"] = source
    if zone_id:  q["zone_id"] = zone_id

    total = await db.fraud_alerts.count_documents(q)
    cursor = db.fraud_alerts.find(
        q, {"_id": 0, "detected_at_dt": 0},
    ).sort("detected_at_dt", -1).skip(skip).limit(limit)
    items = [d async for d in cursor]

    # KPIs strip
    crit_open  = await db.fraud_alerts.count_documents({"status": "open", "severity": "critical"})
    amber_open = await db.fraud_alerts.count_documents({"status": "open", "severity": "amber"})
    return {
        "items": items, "count": len(items), "count_total": total,
        "skip": skip, "limit": limit,
        "kpis": {
            "critical_open": crit_open,
            "amber_open": amber_open,
        },
    }


# ─── Detail ───────────────────────────────────────────────────────────────────

@router.get(PREFIX + "/{alert_id}")
async def alert_detail(alert_id: str, request: Request):
    await _sa(request)
    db = _db(request)
    doc = await db.fraud_alerts.find_one({"id": alert_id}, {"_id": 0, "detected_at_dt": 0})
    if not doc:
        raise HTTPException(404, "Alerta no encontrada")

    # If duplicate, attach matching transaction summary
    if doc.get("source") == "duplicate" and doc.get("similarity_match_id"):
        match = await db.transactions.find_one(
            {"$or": [{"anonymized_id": doc["similarity_match_id"]},
                     {"id": doc["similarity_match_id"]}]},
            {"_id": 0, "zone_id": 1, "tier": 1, "property_type": 1,
             "m2": 1, "closing_price_mxn": 1, "closed_at": 1, "anonymized_id": 1},
        )
        doc["match_listing"] = match
    return doc


# ─── Mutations ────────────────────────────────────────────────────────────────

class ResolveBody(BaseModel):
    resolution_note: str = ""


class DismissBody(BaseModel):
    reason: str = ""


@router.post(PREFIX + "/{alert_id}/resolve")
async def resolve_alert(alert_id: str, body: ResolveBody, request: Request):
    user = await _sa(request)
    db = _db(request)
    res = await fraud.resolve_alert(db, alert_id, user, body.resolution_note)
    if not res:
        raise HTTPException(404, "Alerta no encontrada")
    try:
        from audit_log import log_mutation
        await log_mutation(
            db, user, "update", "fraud_alert", alert_id,
            before=None, after={"status": "resolved", "note": body.resolution_note},
            request=request,
        )
    except Exception as _e:
        log.warning("[audit] log_mutation perdido (fraud_alert resolve %s): %s", alert_id, _e)
    return res


@router.post(PREFIX + "/{alert_id}/dismiss")
async def dismiss_alert(alert_id: str, body: DismissBody, request: Request):
    user = await _sa(request)
    db = _db(request)
    res = await fraud.dismiss_alert(db, alert_id, user, body.reason)
    if not res:
        raise HTTPException(404, "Alerta no encontrada")
    try:
        from audit_log import log_mutation
        await log_mutation(
            db, user, "update", "fraud_alert", alert_id,
            before=None, after={"status": "dismissed", "reason": body.reason},
            request=request,
        )
    except Exception as _e:
        log.warning("[audit] log_mutation perdido (fraud_alert dismiss %s): %s", alert_id, _e)
    return res


# ─── Manual scan ──────────────────────────────────────────────────────────────

@router.post(PREFIX + "/scan")
async def manual_scan(request: Request):
    user = await _sa(request)
    db = _db(request)
    out = await fraud.cron_fraud_detection_daily(db)
    try:
        from audit_log import log_mutation
        await log_mutation(
            db, user, "create", "fraud_scan", "manual",
            before=None, after=out, request=request,
        )
    except Exception as _e:
        log.warning("[audit] log_mutation perdido (fraud_scan manual): %s", _e)
    return out
