"""W3.3 ZZ.3 — DRPI Routes (public + superadmin).

Public endpoints (tier-gated for advanced views):
  GET  /api/drpi/snapshot/{zone_id}    — last snapshot + delta_pct + r²
  GET  /api/drpi/national/{period}     — national CDMX rollup

Superadmin endpoints:
  POST /api/superadmin/drpi/recompute              — manual trigger
  GET  /api/superadmin/drpi/coefficients/{zone_id} — full hedonic model
  GET  /api/superadmin/drpi/list                   — list all snapshots
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request

import drpi_engine as drpi
import hedonic_regression_engine as hedonic

log = logging.getLogger("dmx.routes_drpi")

router = APIRouter(tags=["drpi"])


def _db(request: Request):
    return request.app.state.db


async def _sa(request: Request):
    from permissions import require_superadmin
    return await require_superadmin(request)


async def _user_tier(request: Request) -> str:
    """Return user's tier_label: free | pro | enterprise. Anonymous → free."""
    try:
        from server import get_current_user
        user = await get_current_user(request)
        if not user:
            return "free"
        if getattr(user, "role", "") == "superadmin":
            return "enterprise"
        # Look up org plan if any
        db = request.app.state.db
        tenant_id = getattr(user, "tenant_id", None)
        if tenant_id:
            org = await db.organizations.find_one(
                {"tenant_id": tenant_id}, {"_id": 0, "plan": 1, "tier": 1},
            )
            if org:
                p = (org.get("plan") or org.get("tier") or "").lower()
                if p in ("enterprise", "premium"):
                    return "enterprise"
                if p in ("pro", "growth", "trial"):
                    return "pro"
        return "free"
    except Exception:
        return "free"


# ══════════════════════════════════════════════════════════════════════════════
# 1. PUBLIC — current snapshot (tier-gated)
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/api/drpi/snapshot/{zone_id}")
async def public_snapshot(
    zone_id: str, request: Request,
    tier: str = Query("colonia"),
    period: Optional[str] = Query(None),
    include: Optional[str] = Query(None, description="history|hedonic"),
):
    db = _db(request)
    tier_label = await _user_tier(request)
    period = period or drpi._period_now()

    snap = await db.drpi_snapshots.find_one(
        {"zone_id": zone_id, "tier": tier, "period": period},
        {"_id": 0, "computed_at_dt": 0},
    )
    if not snap:
        snap = {
            "zone_id": zone_id, "tier": tier, "period": period,
            "available": False, "reason": "no_snapshot",
        }

    out: dict = {
        "snapshot": snap,
        "tier_label": tier_label,
        "period": period,
        "source": "via DMX DRPI",
    }

    # Pro tier+: include 12-period history
    if include == "history" and tier_label in ("pro", "enterprise"):
        out["history"] = await drpi.compute_drpi_history(db, zone_id, tier, periods=12)
    elif include == "history":
        out["history_locked"] = True
        out["upgrade_required"] = "pro"

    # Enterprise tier: include hedonic coefficients
    if include == "hedonic" and tier_label == "enterprise":
        if snap.get("hedonic_model_id"):
            hed = await db.hedonic_models.find_one(
                {"id": snap["hedonic_model_id"]}, {"_id": 0, "fit_at_dt": 0},
            )
            out["hedonic"] = hed
    elif include == "hedonic":
        out["hedonic_locked"] = True
        out["upgrade_required"] = "enterprise"

    return out


# ══════════════════════════════════════════════════════════════════════════════
# 2. PUBLIC — national rollup
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/api/drpi/national/{period}")
async def public_national(period: str, request: Request):
    db = _db(request)
    return await drpi.compute_drpi_national(db, period)


# ══════════════════════════════════════════════════════════════════════════════
# 3. SUPERADMIN — manual recompute
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/api/superadmin/drpi/recompute")
async def superadmin_recompute(request: Request):
    user = await _sa(request)
    db = _db(request)
    result = await drpi.cron_drpi_monthly_snapshot(db)
    try:
        from audit_log import log_mutation
        await log_mutation(
            db, user, "create", "drpi_recompute", result.get("period", ""),
            before=None, after=result, request=request,
        )
    except Exception:
        pass
    return result


# ══════════════════════════════════════════════════════════════════════════════
# 4. SUPERADMIN — hedonic coefficients
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/api/superadmin/drpi/coefficients/{zone_id}")
async def superadmin_coefficients(
    zone_id: str, request: Request,
    tier: str = Query("colonia"),
):
    await _sa(request)
    db = _db(request)
    hed = await db.hedonic_models.find_one(
        {"zone_id": zone_id, "tier": tier},
        {"_id": 0, "fit_at_dt": 0},
        sort=[("fit_at_dt", -1)],
    )
    if not hed:
        # Try to fit on-demand
        hed = await hedonic.fit_hedonic_model(db, zone_id, tier)
    return {"zone_id": zone_id, "tier": tier, "model": hed}


# ══════════════════════════════════════════════════════════════════════════════
# 5. SUPERADMIN — list all snapshots
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/api/superadmin/drpi/list")
async def superadmin_list(
    request: Request,
    period: Optional[str] = Query(None),
    tier: Optional[str] = Query(None),
    limit: int = Query(200, ge=1, le=1000),
    skip: int = Query(0, ge=0),
):
    await _sa(request)
    db = _db(request)
    q: dict = {}
    if period: q["period"] = period
    if tier:   q["tier"] = tier
    cursor = db.drpi_snapshots.find(
        q, {"_id": 0, "computed_at_dt": 0},
    ).sort([("period", -1), ("zone_id", 1)]).skip(skip).limit(limit)
    items = [d async for d in cursor]
    total = await db.drpi_snapshots.count_documents(q)
    return {"items": items, "count": len(items), "count_total": total,
            "skip": skip, "limit": limit}
