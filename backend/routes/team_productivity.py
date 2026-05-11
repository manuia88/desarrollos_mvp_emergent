"""Phase 4 Batch 21 · Sub-Chunk B — Team Productivity & Confidence Ratio.

GET /api/metrics/team-productivity?period=7d|30d|90d
Permission: developer_admin | developer_director | inmobiliaria_admin | asesor_admin | superadmin

Response:
    {
      "period": "30d",
      "team_total": { total_changes, total_undones, confidence_ratio_pct, activity_per_day_avg },
      "by_asesor": [{asesor_id, name, total_changes, total_undones, confidence_ratio_pct, rank}]
    }
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any

from fastapi import APIRouter, HTTPException, Query, Request

log = logging.getLogger("dmx.team_productivity")

router = APIRouter(tags=["metrics_team"])

# Action values that count as "changes" — mapped from B14 + B17 actual emissions
TRACKED_ACTIONS = {
    "lead_stage_change",      # spec: status_change (B4.2 emits this)
    "status_change",          # alias
    "inline_edit",            # B17
    "lead_assign",
    "comision_update",
    "drag_reorder",
    "reorder",                # B17 emits this
    "project_publish",
    "lead_created",
}

ASESOR_ROLES = {"advisor", "asesor_admin"}
ADMIN_ROLES = {"developer_admin", "developer_director", "developer_member",
                "inmobiliaria_admin", "asesor_admin", "superadmin"}

PERIOD_DAYS = {"7d": 7, "30d": 30, "90d": 90}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _db(req: Request):
    return req.app.state.db


async def _auth(req: Request):
    from server import get_current_user
    u = await get_current_user(req)
    if not u:
        raise HTTPException(401, "No autenticado")
    return u


def _require_admin(user) -> None:
    if getattr(user, "role", "") not in ADMIN_ROLES:
        raise HTTPException(403, "Solo administradores pueden ver métricas del equipo")


@router.get("/api/metrics/team-productivity")
async def team_productivity(
    request: Request,
    period: str = Query("30d", pattern="^(7d|30d|90d)$"),
):
    user = await _auth(request)
    _require_admin(user)
    db = _db(request)

    days = PERIOD_DAYS[period]
    since = (_now() - timedelta(days=days)).isoformat()
    tenant = getattr(user, "tenant_id", None) or ""

    # ── 1) Get the asesor pool scoped to admin's tenant ─────────────────
    asesor_query: Dict[str, Any] = {"role": {"$in": list(ASESOR_ROLES)}}
    if user.role != "superadmin" and tenant:
        asesor_query["tenant_id"] = tenant
    asesores = await db.users.find(
        asesor_query,
        {"_id": 0, "user_id": 1, "name": 1, "email": 1, "role": 1},
    ).to_list(500)
    asesor_ids = [a["user_id"] for a in asesores if a.get("user_id")]
    asesor_name_by_id = {a["user_id"]: a.get("name") or a.get("email") or a["user_id"]
                          for a in asesores}

    if not asesor_ids:
        return {
            "period": period,
            "team_total": {"total_changes": 0, "total_undones": 0,
                            "confidence_ratio_pct": 100.0, "activity_per_day_avg": 0.0},
            "by_asesor": [],
        }

    # ── 2) Total changes per asesor — db.activities ─────────────────────
    activities_pipeline = [
        {"$match": {
            "actor_id": {"$in": asesor_ids},
            "action": {"$in": list(TRACKED_ACTIONS)},
            "$or": [
                {"timestamp": {"$gte": since}},
                {"created_at": {"$gte": since}},
            ],
        }},
        {"$group": {"_id": "$actor_id", "count": {"$sum": 1}}},
    ]
    changes_by_id: Dict[str, int] = {}
    async for row in db.activities.aggregate(activities_pipeline):
        if row.get("_id"):
            changes_by_id[row["_id"]] = int(row.get("count", 0))

    # ── 3) Total undones per asesor — db.undo_log ───────────────────────
    undones_pipeline = [
        {"$match": {
            "user_id": {"$in": asesor_ids},
            "undone_at": {"$ne": None, "$gte": since},
            "created_at": {"$gte": since},
        }},
        {"$group": {"_id": "$user_id", "count": {"$sum": 1}}},
    ]
    undones_by_id: Dict[str, int] = {}
    async for row in db.undo_log.aggregate(undones_pipeline):
        if row.get("_id"):
            undones_by_id[row["_id"]] = int(row.get("count", 0))

    # ── 4) Build per-asesor rows ────────────────────────────────────────
    rows: List[Dict[str, Any]] = []
    for aid in asesor_ids:
        changes = changes_by_id.get(aid, 0)
        undones = undones_by_id.get(aid, 0)
        if changes == 0:
            ratio = 100.0
        else:
            ratio = round((1 - undones / changes) * 100, 1)
            if ratio < 0:
                ratio = 0.0
        rows.append({
            "asesor_id": aid,
            "name": asesor_name_by_id.get(aid, aid),
            "total_changes": changes,
            "total_undones": undones,
            "confidence_ratio_pct": ratio,
        })

    # Sort desc by ratio, then desc by changes (tiebreaker rewards activity)
    rows.sort(key=lambda r: (-r["confidence_ratio_pct"], -r["total_changes"]))
    for i, r in enumerate(rows):
        r["rank"] = i + 1

    # ── 5) Team totals ──────────────────────────────────────────────────
    total_changes = sum(r["total_changes"] for r in rows)
    total_undones = sum(r["total_undones"] for r in rows)
    if total_changes == 0:
        team_ratio = 100.0
    else:
        team_ratio = round((1 - total_undones / total_changes) * 100, 1)
        if team_ratio < 0:
            team_ratio = 0.0
    avg_per_day = round(total_changes / days, 2)

    return {
        "period": period,
        "team_total": {
            "total_changes": total_changes,
            "total_undones": total_undones,
            "confidence_ratio_pct": team_ratio,
            "activity_per_day_avg": avg_per_day,
        },
        "by_asesor": rows,
    }
