"""Phase 4 Batch 20 · Backend routes — Asesor metrics endpoints + 6am snapshot job."""
from __future__ import annotations
import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException, Query, Request

from services.asesor_metrics import compute_asesor_metrics, get_team_metrics

log = logging.getLogger("dmx.asesor_metrics")
router = APIRouter(tags=["asesor_metrics"])

ADMIN_ROLES = {"developer_admin", "developer_director", "developer_member",
                "inmobiliaria_admin", "asesor_admin", "superadmin"}
ASESOR_ROLES = {"advisor", "asesor_admin"}


def _db(req): return req.app.state.db
def _now(): return datetime.now(timezone.utc)


async def _auth(req: Request):
    from server import get_current_user
    u = await get_current_user(req)
    if not u:
        raise HTTPException(401, "No autenticado")
    return u


@router.get("/api/asesor/metrics/me")
async def my_metrics(request: Request, period: str = Query("30d", pattern="^(7d|30d|90d)$")):
    user = await _auth(request)
    if user.role not in ASESOR_ROLES | ADMIN_ROLES:
        raise HTTPException(403, "Sin permiso")
    db = _db(request)
    return await compute_asesor_metrics(db, user.user_id, period)


@router.get("/api/asesor/metrics/team")
async def team_metrics(request: Request, period: str = Query("30d", pattern="^(7d|30d|90d)$")):
    user = await _auth(request)
    if user.role not in ADMIN_ROLES:
        raise HTTPException(403, "Solo administradores pueden ver métricas del equipo")
    db = _db(request)
    tenant = getattr(user, "tenant_id", None)
    if user.role == "superadmin":
        tenant = None  # superadmin sees all
    elif not tenant:
        # Seguridad: admin sin tenant NO debe ver métricas de todas las inmobiliarias.
        raise HTTPException(403, "Tu cuenta no tiene inmobiliaria asignada · contacta soporte")
    rows = await get_team_metrics(db, tenant, period)
    avg = (sum(r["pipeline_value_mxn"] for r in rows) / len(rows)) if rows else 0
    return {"period": period, "team_average_pipeline": round(avg, 2), "asesores": rows}


@router.get("/api/asesor/metrics/{asesor_id}/timeseries")
async def metrics_timeseries(asesor_id: str, request: Request,
                              period: str = Query("90d", pattern="^(7d|30d|90d)$")):
    user = await _auth(request)
    is_self = (user.user_id == asesor_id)
    if not is_self and user.role not in ADMIN_ROLES:
        raise HTTPException(403, "Sin permiso")
    db = _db(request)
    # Seguridad: un admin solo ve asesores de SU inmobiliaria (no cross-tenant).
    if not is_self and user.role != "superadmin":
        target = await db.users.find_one({"user_id": asesor_id}, {"_id": 0, "tenant_id": 1})
        if not target or target.get("tenant_id") != getattr(user, "tenant_id", None):
            raise HTTPException(403, "Asesor de otra inmobiliaria")
    days = {"7d": 7, "30d": 30, "90d": 90}[period]
    since = (_now() - timedelta(days=days)).date().isoformat()
    snapshots = await db.asesor_metrics_snapshots.find(
        {"asesor_id": asesor_id, "snapshot_date": {"$gte": since}},
        {"_id": 0},
    ).sort("snapshot_date", 1).to_list(days + 5)
    series = {
        "pipeline": [{"date": s["snapshot_date"], "value": s.get("pipeline_value_mxn", 0)} for s in snapshots],
        "conversion_rate": [{"date": s["snapshot_date"], "value": s.get("conversion_rate_pct", 0)} for s in snapshots],
        "response_time": [{"date": s["snapshot_date"], "value": s.get("response_time_hours", 0)} for s in snapshots],
        "activity_score": [{"date": s["snapshot_date"], "value": s.get("activity_score_7d", 0)} for s in snapshots],
    }
    return {"asesor_id": asesor_id, "period": period, "series": series, "count": len(snapshots)}


# ─── Indexes ─────────────────────────────────────────────────────────────────

async def ensure_asesor_metrics_indexes(db) -> None:
    await db.asesor_metrics_snapshots.create_index(
        [("asesor_id", 1), ("snapshot_date", -1)], background=True,
    )
    await db.asesor_metrics_snapshots.create_index(
        [("asesor_id", 1), ("snapshot_date", 1)], unique=True, background=True,
    )
    log.info("[asesor_metrics] indexes ensured")
