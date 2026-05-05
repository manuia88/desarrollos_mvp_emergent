"""Phase 4 Batch 22 · routes — Project Insights endpoints."""
from __future__ import annotations
import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Query, Request

from services.insights_engagement import get_engagement_split
from services.insights_comparables import find_comparables
from services.insights_ai import (
    generate_predictions, generate_recommendations,
    generate_narrative, generate_resumen_narrative,
)

log = logging.getLogger("dmx.insights")
router = APIRouter(tags=["insights"])

DEV_ROLES = {"developer_admin", "developer_director", "developer_member",
              "inmobiliaria_admin", "asesor_admin", "superadmin"}


def _db(req): return req.app.state.db
def _now(): return datetime.now(timezone.utc)


async def _auth_dev(req):
    from server import get_current_user
    u = await get_current_user(req)
    if not u:
        raise HTTPException(401, "No autenticado")
    if u.role not in DEV_ROLES:
        raise HTTPException(403, "Solo roles desarrollador/admin pueden ver insights")
    return u


async def _project_or_404(db, project_id: str):
    p = await db.projects.find_one(
        {"$or": [{"id": project_id}, {"slug": project_id}]}, {"_id": 0},
    )
    if p:
        return p
    # Legacy fallback: data_developments seed
    try:
        from data_developments import DEVELOPMENTS_BY_ID
        dev = DEVELOPMENTS_BY_ID.get(project_id)
        if dev:
            return {
                "id": project_id,
                "slug": project_id,
                "name": dev.get("name", project_id),
                "colonia": dev.get("colonia"),
                "municipio": dev.get("municipio") or dev.get("alcaldia"),
                "stage": dev.get("stage"),
                "segmento": dev.get("segmento") or dev.get("segment"),
                "price_from": dev.get("price_from") or dev.get("price_min"),
                "total_units": dev.get("total_units") or dev.get("units_total"),
                "created_at": dev.get("created_at") or dev.get("listed_at"),
            }
    except Exception:
        pass
    raise HTTPException(404, "Proyecto no encontrado")


# ─── Resumen ─────────────────────────────────────────────────────────────────

@router.get("/api/dev/projects/{project_id}/insights/resumen")
async def get_resumen(project_id: str, request: Request):
    await _auth_dev(request)
    db = _db(request)
    proj = await _project_or_404(db, project_id)

    days_listed = 0
    try:
        ca = proj.get("created_at")
        if ca:
            cdt = datetime.fromisoformat(str(ca).replace("Z", "+00:00"))
            days_listed = max(0, (datetime.now(timezone.utc) - cdt).days)
    except Exception:
        pass

    units_total = await db.units.count_documents({"project_id": project_id})
    units_sold = await db.units.count_documents(
        {"project_id": project_id, "status": {"$in": ["vendido", "vendida"]}},
    )
    since = (_now() - timedelta(days=30)).isoformat()
    leads_30d = await db.leads.count_documents(
        {"project_id": project_id, "created_at": {"$gte": since}},
    )
    won_30d = await db.leads.count_documents({
        "project_id": project_id,
        "lead_stage": {"$in": ["cerrado_ganado", "ganado", "won"]},
        "created_at": {"$gte": since},
    })
    conversion_pct = round((won_30d / leads_30d) * 100, 1) if leads_30d else 0.0

    # GMV: sum sold unit prices
    gmv_pipeline = [
        {"$match": {"project_id": project_id,
                     "status": {"$in": ["vendido", "vendida"]}}},
        {"$group": {"_id": None, "gmv": {"$sum": "$price"}}},
    ]
    gmv = 0.0
    async for r in db.units.aggregate(gmv_pipeline):
        gmv = float(r.get("gmv", 0) or 0)

    hs = await db.health_scores.find_one(
        {"entity_type": "project", "entity_id": project_id},
        {"_id": 0, "score": 1, "trend_7d": 1, "components": 1},
        sort=[("computed_at", -1)],
    ) or {}

    # Trend snapshots last 30 days (health_score history)
    trend = []
    async for s in db.health_scores_snapshots.find(
        {"entity_type": "project", "entity_id": project_id,
         "snapshot_date": {"$gte": (_now() - timedelta(days=30)).date().isoformat()}},
        {"_id": 0, "score": 1, "snapshot_date": 1},
    ).sort("snapshot_date", 1):
        trend.append({"date": s["snapshot_date"], "value": int(s.get("score", 0))})

    summary_text = await generate_resumen_narrative(db, project_id)

    return {
        "project_id": project_id,
        "kpis": {
            "units_sold": units_sold,
            "units_total": units_total,
            "leads_30d": leads_30d,
            "conversion_pct": conversion_pct,
            "days_listed": days_listed,
            "gmv": round(gmv, 2),
        },
        "health_score": int(hs.get("score", 0)),
        "trend_7d": int(hs.get("trend_7d", 0)),
        "trend_30d": trend,
        "summary_text": summary_text,
    }


# ─── Engagement ──────────────────────────────────────────────────────────────

@router.get("/api/dev/projects/{project_id}/insights/engagement")
async def get_engagement(
    project_id: str, request: Request,
    period: str = Query("30d", pattern="^(7d|30d|90d)$"),
):
    await _auth_dev(request)
    db = _db(request)
    await _project_or_404(db, project_id)
    return await get_engagement_split(db, project_id, period)


# ─── Comparables ─────────────────────────────────────────────────────────────

@router.get("/api/dev/projects/{project_id}/insights/comparables")
async def get_comparables(project_id: str, request: Request,
                            top_n: int = Query(5, ge=1, le=10)):
    await _auth_dev(request)
    db = _db(request)
    await _project_or_404(db, project_id)
    return await find_comparables(db, project_id, top_n=top_n)


# ─── AI Insights ─────────────────────────────────────────────────────────────

@router.get("/api/dev/projects/{project_id}/insights/ai/predictions")
async def get_predictions(project_id: str, request: Request):
    await _auth_dev(request)
    db = _db(request)
    await _project_or_404(db, project_id)
    return await generate_predictions(db, project_id)


@router.get("/api/dev/projects/{project_id}/insights/ai/recommendations")
async def get_recommendations(project_id: str, request: Request):
    await _auth_dev(request)
    db = _db(request)
    await _project_or_404(db, project_id)
    return await generate_recommendations(db, project_id)


@router.get("/api/dev/projects/{project_id}/insights/ai/narrative")
async def get_narrative(
    project_id: str, request: Request,
    period: str = Query("30d", pattern="^(7d|30d|90d)$"),
    force: bool = Query(False),
):
    await _auth_dev(request)
    db = _db(request)
    await _project_or_404(db, project_id)
    return await generate_narrative(db, project_id, period, force=force)
