"""W5.4 — Buyer Score Routes · endpoints superadmin only.

GET  /api/superadmin/buyer-score/summary
GET  /api/superadmin/buyer-score/per-user?tier=hot&limit=50
POST /api/superadmin/buyer-score/trigger-recompute
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from permissions import require_superadmin
from pydantic import BaseModel

log = logging.getLogger("dmx.buyer_score_routes")

router = APIRouter(prefix="/api/superadmin", tags=["buyer-score"])

# Lock global para evitar recomputes concurrentes
_recompute_lock = asyncio.Lock()


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ─── Summary ──────────────────────────────────────────────────────────────────

@router.get("/buyer-score/summary")
async def buyer_score_summary(request: Request) -> Dict[str, Any]:
    """Resumen agregado: distribución por tier + avg_score + última corrida."""
    await require_superadmin(request)
    db = request.app.state.db

    pipeline = [
        {"$group": {
            "_id": "$tier",
            "count": {"$sum": 1},
            "avg_score": {"$avg": "$score"},
        }},
    ]
    tier_rows = await db.buyer_scores.aggregate(pipeline).to_list(10)

    by_tier: Dict[str, int] = {"hot": 0, "warm": 0, "cold": 0}
    tier_avgs: Dict[str, float] = {}
    total_buyers = 0
    for row in tier_rows:
        t = row["_id"] or "cold"
        by_tier[t] = row["count"]
        tier_avgs[t] = round(row["avg_score"], 1)
        total_buyers += row["count"]

    # Avg global
    agg_all = await db.buyer_scores.aggregate([
        {"$group": {"_id": None, "avg": {"$avg": "$score"}}},
    ]).to_list(1)
    avg_score = round((agg_all[0]["avg"] if agg_all else 0.0), 1)

    # Última corrida del cron
    last_run = await db.buyer_score_runs.find_one(
        {}, {"_id": 0}, sort=[("ran_at", -1)]
    )

    # Distribución en buckets de 10 puntos (0-10, 10-20, …, 90-100)
    dist_pipeline = [
        {"$bucket": {
            "groupBy": "$score",
            "boundaries": [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 101],
            "default": "other",
            "output": {"count": {"$sum": 1}},
        }},
    ]
    try:
        dist_raw = await db.buyer_scores.aggregate(dist_pipeline).to_list(15)
        distribution = [{"range": f"{r['_id']}-{r['_id']+10}" if isinstance(r["_id"], (int, float)) else "other", "count": r["count"]} for r in dist_raw]
    except Exception:
        distribution = []

    return {
        "total_buyers": total_buyers,
        "by_tier": by_tier,
        "avg_score": avg_score,
        "tier_avgs": tier_avgs,
        "distribution": distribution,
        "last_run": last_run,
    }


# ─── Per-User ──────────────────────────────────────────────────────────────────

@router.get("/buyer-score/per-user")
async def buyer_score_per_user(
    request: Request,
    tier: Optional[str] = Query(None, description="hot|warm|cold"),
    limit: int = Query(50, ge=1, le=200),
) -> List[Dict[str, Any]]:
    """Tabla de buyers con score + tier + componentes breakdown."""
    await require_superadmin(request)
    db = request.app.state.db

    flt: Dict[str, Any] = {}
    if tier and tier in ("hot", "warm", "cold"):
        flt["tier"] = tier

    rows = await db.buyer_scores.find(
        flt, {"_id": 0}
    ).sort("score", -1).limit(limit).to_list(limit)

    # Enriquecer con email del usuario
    user_ids = [r["user_id"] for r in rows if r.get("user_id")]
    email_map: Dict[str, str] = {}
    if user_ids:
        async for u in db.users.find(
            {"user_id": {"$in": user_ids}},
            {"_id": 0, "user_id": 1, "email": 1, "first_name": 1, "last_name": 1},
        ):
            email_map[u["user_id"]] = {
                "email": u.get("email", ""),
                "name": f"{u.get('first_name', '')} {u.get('last_name', '')}".strip(),
            }

    result = []
    for r in rows:
        uid = r.get("user_id", "")
        user_info = email_map.get(uid, {})
        result.append({
            "user_id": uid,
            "email": user_info.get("email", ""),
            "name": user_info.get("name", ""),
            "score": r.get("score", 0),
            "tier": r.get("tier", "cold"),
            "prev_score": r.get("prev_score", 0),
            "delta_pct": r.get("delta_pct", 0),
            "components": r.get("components", {}),
            "computed_at": r.get("computed_at"),
        })

    return result


# ─── Trigger manual recompute ──────────────────────────────────────────────────

class RecomputeResult(BaseModel):
    ok: bool
    locked: bool = False
    buyers_evaluated: int = 0
    buyers_computed_ok: int = 0
    errors_count: int = 0
    duration_seconds: float = 0.0


@router.post("/buyer-score/trigger-recompute", response_model=RecomputeResult)
async def trigger_buyer_score_recompute(request: Request) -> RecomputeResult:
    """Trigger manual idempotente del recompute de buyer scores."""
    await require_superadmin(request)
    db = request.app.state.db

    if _recompute_lock.locked():
        log.info("[buyer_score] trigger-recompute: ya hay un recompute en curso · skip")
        return RecomputeResult(ok=True, locked=True)

    async with _recompute_lock:
        from buyer_score_cron import recompute_all_buyers
        result = await recompute_all_buyers(db)

    return RecomputeResult(
        ok=True,
        locked=False,
        buyers_evaluated=result.get("buyers_evaluated", 0),
        buyers_computed_ok=result.get("buyers_computed_ok", 0),
        errors_count=result.get("errors_count", 0),
        duration_seconds=result.get("duration_seconds", 0.0),
    )

# W5.FF4 register_feature marker · NO duplicate
from feature_registry import register_feature as _w5ff4_register_feature
_w5ff4_register_feature("buyer_score", plan_tier="pro",        monthly_price_mxn=149, category="ai",          name="Buyer Score")
