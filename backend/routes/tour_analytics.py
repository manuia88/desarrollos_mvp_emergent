"""
Batch 21 Sub-A — Tour Completion Analytics
GET /api/metrics/tour-completion?period=30d
Permission: dev_admin | inmobiliaria_admin | superadmin (403 otros)
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Optional, Any

from fastapi import APIRouter, HTTPException, Request

log = logging.getLogger("dmx.tour_analytics")
router = APIRouter(tags=["batch21"])

ALLOWED_ROLES = {"developer_admin", "inmobiliaria_admin", "superadmin"}

KNOWN_TOURS = [
    "dev_first_login",
    "asesor_first_login",
    "inmobiliaria_first_login",
    "comprador_first_login",
    "dev_post_first_project",
]

KNOWN_ROLES = ["developer_admin", "advisor", "inmobiliaria_admin", "buyer"]

PERIOD_DAYS: Dict[str, Optional[int]] = {
    "7d":  7,
    "30d": 30,
    "90d": 90,
    "all": None,
}


def _db(request: Request):
    return request.app.state.db


async def _auth(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    return user


def _period_cutoff(period: str) -> Optional[datetime]:
    days = PERIOD_DAYS.get(period)
    if days is None:
        return None
    return datetime.now(timezone.utc) - timedelta(days=days)


def _empty_role_stats() -> Dict[str, Any]:
    return {
        "users_total": 0,
        "tours_started": 0,
        "tours_completed": 0,
        "tours_dismissed": 0,
        "completion_rate_pct": 0.0,
        "dismiss_rate_pct": 0.0,
        "by_tour": {t: {"started": 0, "completed": 0, "rate_pct": 0.0} for t in KNOWN_TOURS},
    }


@router.get("/api/metrics/tour-completion")
async def get_tour_completion(request: Request, period: str = "30d"):
    """
    Returns tour completion funnel aggregated by role.
    Query param period: 7d | 30d | 90d | all
    """
    user = await _auth(request)
    if user.role not in ALLOWED_ROLES:
        raise HTTPException(403, "Sin permisos para ver métricas de tour")

    if period not in PERIOD_DAYS:
        raise HTTPException(422, f"period must be one of {list(PERIOD_DAYS.keys())}")

    db = _db(request)
    cutoff = _period_cutoff(period)

    # ── 1. Fetch users within period ──────────────────────────────────────────
    user_query: dict = {}
    if cutoff:
        user_query["created_at"] = {"$gte": cutoff}

    users_cursor = db.users.find(user_query, {"_id": 0, "user_id": 1, "role": 1})
    users_list = [u async for u in users_cursor]

    if not users_list:
        # Return structure with all zeros — no error
        return {
            "period": period,
            "by_role": {role: _empty_role_stats() for role in KNOWN_ROLES},
        }

    user_ids = [u["user_id"] for u in users_list if u.get("user_id")]

    # ── 2. Fetch all preferences in one query ─────────────────────────────────
    prefs_cursor = db.user_preferences.find(
        {"user_id": {"$in": user_ids}},
        {"_id": 0, "user_id": 1, "tours_completed": 1, "tours_dismissed": 1},
    )
    prefs_by_uid: Dict[str, dict] = {}
    async for p in prefs_cursor:
        prefs_by_uid[p["user_id"]] = p

    # ── 3. Build role → tour aggregations ────────────────────────────────────
    # Structure: role → tour_id → {completed_count, dismissed_count}
    role_tour_counts: Dict[str, Dict[str, Dict[str, int]]] = {
        role: {t: {"completed": 0, "dismissed": 0} for t in KNOWN_TOURS}
        for role in KNOWN_ROLES
    }
    role_user_counts: Dict[str, int] = {role: 0 for role in KNOWN_ROLES}

    for u in users_list:
        role = u.get("role") or "unknown"

        # Map superadmin / developer variants → developer_admin
        if role == "superadmin" or role.startswith("developer"):
            role = "developer_admin"
        elif role in ("asesor_admin", "asesor_member"):
            role = "advisor"
        elif role == "inmobiliaria_member":
            role = "inmobiliaria_admin"

        # Skip truly unknown roles
        if role not in role_tour_counts:
            continue

        role_user_counts[role] += 1
        uid = u.get("user_id", "")
        prefs = prefs_by_uid.get(uid, {})
        completed_tours: list = prefs.get("tours_completed") or []
        dismissed_tours: list = prefs.get("tours_dismissed") or []

        for t in completed_tours:
            if t in role_tour_counts[role]:
                role_tour_counts[role][t]["completed"] += 1

        for t in dismissed_tours:
            if t in role_tour_counts[role]:
                role_tour_counts[role][t]["dismissed"] += 1

    # ── 4. Build final response ───────────────────────────────────────────────
    by_role: Dict[str, Any] = {}

    for role in KNOWN_ROLES:
        total_users = role_user_counts[role]
        tours = role_tour_counts[role]

        # Aggregate across all tours
        total_completed = sum(v["completed"] for v in tours.values())
        total_dismissed = sum(v["dismissed"] for v in tours.values())
        total_started   = total_completed + total_dismissed

        compl_rate = round(total_completed / total_started * 100, 1) if total_started > 0 else 0.0
        dism_rate  = round(total_dismissed / total_started * 100, 1) if total_started > 0 else 0.0

        by_tour: Dict[str, Any] = {}
        for t in KNOWN_TOURS:
            tc = tours[t]["completed"]
            td = tours[t]["dismissed"]
            ts = tc + td
            rate = round(tc / ts * 100, 1) if ts > 0 else 0.0
            by_tour[t] = {"started": ts, "completed": tc, "rate_pct": rate}

        by_role[role] = {
            "users_total":          total_users,
            "tours_started":        total_started,
            "tours_completed":      total_completed,
            "tours_dismissed":      total_dismissed,
            "completion_rate_pct":  compl_rate,
            "dismiss_rate_pct":     dism_rate,
            "by_tour":              by_tour,
        }

    return {"period": period, "by_role": by_role}


async def ensure_batch21_indexes(db) -> None:
    try:
        await db.users.create_index("created_at")
        await db.user_preferences.create_index("user_id")
    except Exception:
        pass
    log.info("[batch21] indexes OK")
