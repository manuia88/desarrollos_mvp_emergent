"""W2.3 SA4 — AI Cost Observatory routes.

Prefix: /api/superadmin/ai-cost · all require_superadmin.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Literal

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

import ai_cost_aggregations as agg

log = logging.getLogger("dmx.routes_superadmin_ai_cost")

router = APIRouter(tags=["superadmin_ai_cost"])
PREFIX = "/api/superadmin/ai-cost"


def _db(request: Request):
    return request.app.state.db


async def _require_superadmin(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    if user.role != "superadmin":
        raise HTTPException(403, "Solo superadmin")
    return user


# ─── Schemas ──────────────────────────────────────────────────────────────────
class CapBody(BaseModel):
    tenant_id: str
    monthly_cap_mxn: float = Field(..., gt=0, le=1_000_000)
    alert_threshold_pct: float = Field(80.0, ge=10, le=99)
    custom_alert_email: Optional[str] = None
    hard_block: bool = False


class CapPatchBody(BaseModel):
    monthly_cap_mxn: Optional[float] = Field(None, gt=0, le=1_000_000)
    alert_threshold_pct: Optional[float] = Field(None, ge=10, le=99)
    custom_alert_email: Optional[str] = None
    hard_block: Optional[bool] = None


PERIOD_RE = Literal["month", "7d", "30d"]


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get(PREFIX + "/overview")
async def overview_route(request: Request, period: PERIOD_RE = "month"):
    await _require_superadmin(request)
    return await agg.overview(_db(request), period)


@router.get(PREFIX + "/by-tenant")
async def by_tenant_route(
    request: Request,
    period: PERIOD_RE = "month",
    limit: int = Query(50, ge=1, le=200),
    skip: int = Query(0, ge=0),
    sort: Literal["spend_desc", "name_asc"] = "spend_desc",
):
    await _require_superadmin(request)
    return await agg.by_tenant(_db(request), period, limit, skip, sort)


@router.get(PREFIX + "/by-feature")
async def by_feature_route(
    request: Request,
    period: PERIOD_RE = "month",
    tenant_id: Optional[str] = None,
):
    await _require_superadmin(request)
    return await agg.by_feature(_db(request), period, tenant_id)


@router.get(PREFIX + "/by-model")
async def by_model_route(request: Request, period: PERIOD_RE = "month"):
    await _require_superadmin(request)
    return await agg.by_model(_db(request), period)


@router.get(PREFIX + "/tenant/{tenant_id}/timeseries")
async def tenant_timeseries_route(
    tenant_id: str, request: Request,
    days: int = Query(30, ge=1, le=180),
):
    await _require_superadmin(request)
    return await agg.tenant_timeseries(_db(request), tenant_id, days)


@router.get(PREFIX + "/forecast")
async def forecast_route(request: Request, tenant_id: Optional[str] = None):
    await _require_superadmin(request)
    return await agg.forecast(_db(request), tenant_id)


@router.get(PREFIX + "/caps")
async def list_caps_route(request: Request):
    await _require_superadmin(request)
    db = _db(request)
    cur = db.ai_budget_caps.find({}, {"_id": 0}).sort("set_at", -1).limit(500)
    items = [d async for d in cur]
    return {"items": items, "total": len(items)}


@router.post(PREFIX + "/caps")
async def upsert_cap_route(body: CapBody, request: Request):
    user = await _require_superadmin(request)
    db = _db(request)

    before = await db.ai_budget_caps.find_one({"tenant_id": body.tenant_id}, {"_id": 0})
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "tenant_id": body.tenant_id,
        "monthly_cap_mxn": float(body.monthly_cap_mxn),
        "alert_threshold_pct": float(body.alert_threshold_pct),
        "custom_alert_email": body.custom_alert_email,
        "hard_block": bool(body.hard_block),
        "set_by": user.user_id,
        "set_at": now,
    }
    await db.ai_budget_caps.update_one(
        {"tenant_id": body.tenant_id},
        {"$set": doc},
        upsert=True,
    )
    try:
        from audit_log import log_mutation
        await log_mutation(
            db, user, "create" if not before else "update",
            "ai_budget_cap", body.tenant_id,
            before=before, after=doc, request=request,
        )
    except Exception:
        pass
    return {"ok": True, "cap": doc}


@router.patch(PREFIX + "/caps/{tenant_id}")
async def patch_cap_route(tenant_id: str, body: CapPatchBody, request: Request):
    user = await _require_superadmin(request)
    db = _db(request)

    before = await db.ai_budget_caps.find_one({"tenant_id": tenant_id}, {"_id": 0})
    if not before:
        raise HTTPException(404, "Cap no encontrado para este tenant")

    updates = {k: v for k, v in body.dict(exclude_unset=True).items() if v is not None}
    if not updates:
        raise HTTPException(400, "Sin campos a actualizar")
    updates["set_by"] = user.user_id
    updates["set_at"] = datetime.now(timezone.utc).isoformat()

    await db.ai_budget_caps.update_one({"tenant_id": tenant_id}, {"$set": updates})
    after = await db.ai_budget_caps.find_one({"tenant_id": tenant_id}, {"_id": 0})

    try:
        from audit_log import log_mutation
        await log_mutation(
            db, user, "update", "ai_budget_cap", tenant_id,
            before=before, after=after, request=request,
        )
    except Exception:
        pass
    return {"ok": True, "cap": after}


# ─── Cron registration ────────────────────────────────────────────────────────

def schedule_ai_cost_daily_aggregation(scheduler, db) -> None:
    """Register daily 1am MX cron with cron_heartbeat instrumentation."""
    try:
        from cron_heartbeat import wrap_apscheduler_job
        from apscheduler.triggers.cron import CronTrigger
        scheduler.add_job(
            wrap_apscheduler_job(agg.materialize_daily_snapshot, "ai_cost_daily_aggregation"),
            CronTrigger(hour=1, minute=0, timezone="America/Mexico_City"),
            args=[db], id="ai_cost_daily_aggregation",
            replace_existing=True, misfire_grace_time=600,
        )
    except Exception as e:
        log.warning(f"[ai_cost] schedule daily cron failed: {e}")

# W5.FF4 register_feature marker · NO duplicate
from feature_registry import register_feature as _w5ff4_register_feature
_w5ff4_register_feature("ai_cost_dashboard", plan_tier="enterprise", monthly_price_mxn=0,   category="monetization", name="AI Cost Dashboard")
