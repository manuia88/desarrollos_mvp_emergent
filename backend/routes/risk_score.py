"""W3.4A — Risk Score Routes.

Public:
  GET  /api/risk-score/zone/{zone_id}              — tier-gated (free=letter, pro=numeric, enterprise=full)

Superadmin:
  GET  /api/superadmin/risk-score/all              — list paginado
  POST /api/superadmin/risk-score/recompute        — manual trigger
  GET  /api/superadmin/crime-data/{zone_id}/breakdown — categorías SESNSP detalle
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Query, Request

import crime_data_engine as crime_data
import risk_score_engine as risk_engine
import compliance_engine as comp

log = logging.getLogger("dmx.routes_risk_score")

router = APIRouter(tags=["risk_score"])


def _db(request: Request):
    return request.app.state.db


async def _sa(request: Request):
    from permissions import require_superadmin
    return await require_superadmin(request)


async def _user_tier(request: Request) -> str:
    """free | pro | enterprise — mirror of routes_drpi tier resolver."""
    try:
        from server import get_current_user
        user = await get_current_user(request)
        if not user:
            return "free"
        if getattr(user, "role", "") == "superadmin":
            return "enterprise"
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


# ─── Public ───────────────────────────────────────────────────────────────────

@router.get("/api/risk-score/zone/{zone_id}")
async def public_risk_score(zone_id: str, request: Request):
    db = _db(request)
    tier = await _user_tier(request)
    doc = await risk_engine.get_risk_score_or_compute(db, zone_id)

    if not doc.get("available"):
        await comp.log_compliance_event(
            db, action="api_query", endpoint=f"/api/risk-score/zone/{zone_id}",
            k_anonymity_passed=True, records_returned=0,
            requestor_ip=request.client.host if request.client else "",
        )
        return {
            "zone_id": zone_id, "available": False,
            "reason": doc.get("reason"), "tier_label": tier,
            "source": "via DMX Risk Score",
        }

    base = {
        "zone_id": zone_id,
        "available": True,
        "score_letter": doc.get("score_letter"),
        "tier_label": tier,
        "computed_at": doc.get("computed_at"),
        "formula_version": doc.get("formula_version"),
        "sources_active": doc.get("sources_active"),
        "placeholder_flags": doc.get("placeholder_flags"),
        # "weights" QUITADO (pentest 2026-06-27): los pesos exactos de la fórmula de riesgo son moat, no público.
        "source": "via DMX Risk Score",
    }
    if tier == "free":
        # W3.7 — free tier: only letter, no numeric (so DP noise not applicable)
        await comp.log_compliance_event(
            db, action="api_query", endpoint=f"/api/risk-score/zone/{zone_id}",
            k_anonymity_passed=True, records_returned=1,
            requestor_ip=request.client.host if request.client else "",
        )
        return base

    # pro: includes numeric + 4 dimension scores
    components = doc.get("components") or {}
    pro_components = {
        "crime_score": components.get("crime_score"),
        "crime_normalized_per_100k": components.get("crime_normalized_per_100k"),
        "natural_score": components.get("natural_score"),
        "title_risk_score": components.get("title_risk_score"),
        "percepcion_score": components.get("percepcion_score"),
    }
    out = {**base, "score_numeric": doc.get("score_numeric"), "components": pro_components}
    if tier == "pro":
        await comp.log_compliance_event(
            db, action="api_query", endpoint=f"/api/risk-score/zone/{zone_id}",
            k_anonymity_passed=True, records_returned=1,
            requestor_ip=request.client.host if request.client else "",
        )
        return out

    # enterprise: + crime_by_category + natural_detail + title_detail + percepcion_detail + alcaldia
    out["components"] = {
        **pro_components,
        "crime_total_incidents_6m": components.get("crime_total_incidents_6m"),
        "crime_by_category": components.get("crime_by_category"),
        "natural_detail": components.get("natural_detail"),
        "title_detail": components.get("title_detail"),
        "percepcion_detail": components.get("percepcion_detail"),
    }
    out["alcaldia"] = doc.get("alcaldia")
    await comp.log_compliance_event(
        db, action="api_query", endpoint=f"/api/risk-score/zone/{zone_id}",
        k_anonymity_passed=True, records_returned=1,
        requestor_ip=request.client.host if request.client else "",
    )
    return out


# ─── Superadmin list ──────────────────────────────────────────────────────────

@router.get("/api/superadmin/risk-score/all")
async def superadmin_list(
    request: Request,
    tier: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    await _sa(request)
    db = _db(request)
    rows = await risk_engine.list_all_scores(db, tier=tier, limit=limit)
    return {"zones": rows, "count": len(rows)}


# ─── Superadmin recompute ─────────────────────────────────────────────────────

@router.post("/api/superadmin/risk-score/recompute")
async def superadmin_recompute(request: Request):
    user = await _sa(request)
    db = _db(request)
    out = await risk_engine.cron_risk_score_zone_daily(db)
    try:
        from audit_log import log_mutation
        await log_mutation(
            db, user, "create", "risk_score_recompute", "manual",
            before=None, after=out, request=request,
        )
    except Exception as _e:
        log.warning("[audit] log_mutation perdido (risk_score_recompute manual): %s", _e)
    return out


# ─── Crime data breakdown ─────────────────────────────────────────────────────

@router.get("/api/superadmin/crime-data/{zone_id}/breakdown")
async def crime_breakdown(
    zone_id: str, request: Request,
    period_months: int = Query(6, ge=1, le=24),
):
    await _sa(request)
    db = _db(request)
    return await crime_data.aggregate_crime_zone(db, zone_id, period_months=period_months)
