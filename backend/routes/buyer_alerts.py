"""Phase 4 Batch 29 · routes — Smart Buyer Alerts.

Endpoints (todos requieren auth role=buyer):
  GET    /api/comprador/alerts                     → lista alertas del user
  POST   /api/comprador/alerts                     → crear alerta
  PATCH  /api/comprador/alerts/{id}                → actualizar alerta
  DELETE /api/comprador/alerts/{id}                → soft delete
  GET    /api/comprador/alerts/deliveries?limit=50 → histórico entregas
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Request, Depends, Query
from pydantic import BaseModel, Field

log = logging.getLogger("dmx.routes_buyer_alerts")

router = APIRouter(tags=["comprador-alerts"])


def _db(request: Request):
    return request.app.state.db


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: Any) -> Optional[str]:
    if dt is None:
        return None
    if hasattr(dt, "isoformat"):
        return dt.isoformat()
    return str(dt)


async def _require_buyer(request: Request):
    from server import require_auth
    user = await require_auth(request)
    if user.role not in ("buyer", "superadmin"):
        raise HTTPException(status_code=403, detail="Acceso solo para compradores")
    return user


def _clean_alert(a: Dict[str, Any]) -> Dict[str, Any]:
    a.pop("_id", None)
    for k in ("created_at", "last_triggered"):
        a[k] = _iso(a.get(k))
    return a


def _clean_delivery(d: Dict[str, Any]) -> Dict[str, Any]:
    d.pop("_id", None)
    d["sent_at"] = _iso(d.get("sent_at"))
    return d


# ─── Pydantic models ─────────────────────────────────────────────────────────

class AlertCreate(BaseModel):
    type: str
    channel: str
    conditions: Dict[str, Any] = Field(default_factory=dict)
    frequency: str = "daily"


class AlertPatch(BaseModel):
    channel: Optional[str] = None
    conditions: Optional[Dict[str, Any]] = None
    frequency: Optional[str] = None
    active: Optional[bool] = None


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/api/comprador/alerts")
async def list_alerts(request: Request, user=Depends(_require_buyer)):
    db = _db(request)
    alerts = await db.buyer_alerts.find(
        {"user_id": user.user_id},
        {"_id": 0},
    ).sort("created_at", -1).limit(100).to_list(100)
    return [_clean_alert(a) for a in alerts]


@router.post("/api/comprador/alerts", status_code=201)
async def create_alert(body: AlertCreate, request: Request, user=Depends(_require_buyer)):
    from services.buyer_alerts import VALID_TYPES, VALID_CHANNELS, VALID_FREQUENCIES
    if body.type not in VALID_TYPES:
        raise HTTPException(400, f"Tipo inválido. Válidos: {VALID_TYPES}")
    if body.channel not in VALID_CHANNELS:
        raise HTTPException(400, f"Canal inválido. Válidos: {VALID_CHANNELS}")
    if body.frequency not in VALID_FREQUENCIES:
        raise HTTPException(400, f"Frecuencia inválida. Válidas: {VALID_FREQUENCIES}")

    db = _db(request)
    alert_id = uuid.uuid4().hex
    now = _now()
    doc = {
        "alert_id": alert_id,
        "user_id": user.user_id,
        "type": body.type,
        "channel": body.channel,
        "conditions": body.conditions,
        "frequency": body.frequency,
        "active": True,
        "last_triggered": None,
        "created_at": now,
    }
    await db.buyer_alerts.insert_one(doc)
    doc.pop("_id", None)
    doc["created_at"] = _iso(now)
    doc["last_triggered"] = None
    return doc


@router.patch("/api/comprador/alerts/{alert_id}")
async def update_alert(alert_id: str, body: AlertPatch, request: Request, user=Depends(_require_buyer)):
    db = _db(request)
    existing = await db.buyer_alerts.find_one(
        {"alert_id": alert_id, "user_id": user.user_id},
        {"_id": 0},
    )
    if not existing:
        raise HTTPException(404, "Alerta no encontrada")

    upd: Dict[str, Any] = {}
    if body.channel is not None:
        from services.buyer_alerts import VALID_CHANNELS
        if body.channel not in VALID_CHANNELS:
            raise HTTPException(400, "Canal inválido")
        upd["channel"] = body.channel
    if body.conditions is not None:
        upd["conditions"] = body.conditions
    if body.frequency is not None:
        from services.buyer_alerts import VALID_FREQUENCIES
        if body.frequency not in VALID_FREQUENCIES:
            raise HTTPException(400, "Frecuencia inválida")
        upd["frequency"] = body.frequency
    if body.active is not None:
        upd["active"] = body.active

    if not upd:
        raise HTTPException(400, "Sin campos a actualizar")

    await db.buyer_alerts.update_one({"alert_id": alert_id}, {"$set": upd})
    fresh = await db.buyer_alerts.find_one({"alert_id": alert_id}, {"_id": 0})
    return _clean_alert(fresh)


@router.delete("/api/comprador/alerts/{alert_id}")
async def delete_alert(alert_id: str, request: Request, user=Depends(_require_buyer)):
    db = _db(request)
    r = await db.buyer_alerts.delete_one(
        {"alert_id": alert_id, "user_id": user.user_id}
    )
    if r.deleted_count == 0:
        raise HTTPException(404, "Alerta no encontrada")
    return {"deleted": True}


@router.get("/api/comprador/alerts/deliveries")
async def list_deliveries(
    request: Request,
    limit: int = Query(default=50, ge=1, le=100),
    user=Depends(_require_buyer),
):
    db = _db(request)
    deliveries = await db.alert_deliveries.find(
        {"user_id": user.user_id},
        {"_id": 0},
    ).sort("sent_at", -1).limit(limit).to_list(limit)
    return [_clean_delivery(d) for d in deliveries]
