"""W3.6 — Phase Z.4 Vertical Products Public API endpoints.

POST /api/v1/verticals/bank-avm                 (Pro+)
POST /api/v1/verticals/insurance-risk           (Pro+)
POST /api/v1/verticals/notaria-title-check      (Enterprise)
POST /api/v1/verticals/investor-yield           (Pro+ free=cap_rate only)

Tier-gating reuses public_api_auth.require_tier (W3.5).
Audit: vertical_call event logged via audit_log + vertical_product_calls.
"""
from __future__ import annotations

import logging
import time
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

import public_api_auth as auth
import vertical_products_engine as vp

log = logging.getLogger("dmx.routes_vertical_products")

router = APIRouter(tags=["vertical_products_v1"])


def _db(request: Request):
    return request.app.state.db


def _set_headers(response: Response, ctx: auth.ApiKeyContext) -> None:
    response.headers["X-DMX-Tier"] = ctx.tier
    response.headers["X-DMX-Calls-Remaining"] = str(max(0, ctx.calls_remaining - 1))
    response.headers["X-DMX-Methodology-Version"] = vp.METHODOLOGY_VERSION


def _filter_by_tier(out: Dict[str, Any], ctx: auth.ApiKeyContext, vertical: str) -> Dict[str, Any]:
    """Strip details for lower tiers per spec.

    free → 1 KPI top-level, no breakdown
    pro  → full output con methodology
    enterprise → + monte carlo + comparables list + raw data sources
    """
    if not out.get("available"):
        return out  # always return reason

    tier = ctx.tier
    if tier == "free":
        # Free returns just the headline KPI per vertical
        if vertical == "bank-avm":
            return {
                "available": True, "zone_id": out.get("zone_id"),
                "value_mxn": out.get("value_mxn"),
                "tier": "free", "upgrade_for": "comparables, CI, methodology",
                "methodology_version": out.get("methodology_version"),
                "computed_at": out.get("computed_at"),
            }
        if vertical == "insurance-risk":
            return {
                "available": True, "zone_id": out.get("zone_id"),
                "risk_score_0_100": out.get("risk_score_0_100"),
                "tier": "free", "upgrade_for": "peril breakdown, premium",
                "methodology_version": out.get("methodology_version"),
                "computed_at": out.get("computed_at"),
            }
        if vertical == "investor-yield":
            return {
                "available": True, "zone_id": out.get("zone_id"),
                "cap_rate_pct": out.get("cap_rate_pct"),
                "tier": "free", "upgrade_for": "monte carlo, IRR, financing",
                "methodology_version": out.get("methodology_version"),
                "computed_at": out.get("computed_at"),
            }
        # notaria-title-check requires enterprise; free should not reach here
        return {"available": False, "reason": "tier_insufficient", "tier": "free"}

    if tier == "pro":
        # Pro: full output incl. IRR + monte carlo. Hides only enterprise-only details.
        cleaned = dict(out)
        if vertical == "bank-avm":
            comps = cleaned.get("comparables_used") or []
            cleaned["comparables_used"] = comps[:3]
        return cleaned

    # enterprise: all
    return out


# ═════════════════════════════════════════════════════════════════════════════
# Bodies
# ═════════════════════════════════════════════════════════════════════════════

class PropertyFeaturesBody(BaseModel):
    address: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    zone_id: Optional[str] = None
    m2: Optional[float] = None
    recamaras: Optional[int] = None
    baños: Optional[int] = None
    year_built: Optional[int] = None
    floor: Optional[int] = None
    view: Optional[str] = None
    orientation: Optional[str] = None
    property_type: Optional[str] = "depto"
    proximity_metro_m: Optional[float] = None


class InsuranceRiskBody(PropertyFeaturesBody):
    coverage_type: Optional[str] = "property"  # property|liability|catastrophic


class InvestorYieldBody(PropertyFeaturesBody):
    purchase_price: Optional[float] = None
    hold_years: Optional[int] = 5
    financing_terms: Optional[Dict[str, Any]] = None


class TitleCheckBody(BaseModel):
    property_id: str
    claimed_owner: Optional[str] = None
    transaction_history: Optional[List[Dict[str, Any]]] = None


# ═════════════════════════════════════════════════════════════════════════════
# Endpoints
# ═════════════════════════════════════════════════════════════════════════════

@router.post("/api/v1/verticals/bank-avm")
async def v1_bank_avm(body: PropertyFeaturesBody, request: Request, response: Response):
    ctx = await auth.validate_api_key(request)
    started = time.perf_counter()
    db = _db(request)

    payload = body.model_dump(exclude_none=True)
    raw = await vp.compute_avm(db, payload)
    out = _filter_by_tier(raw, ctx, "bank-avm")

    latency_ms = int((time.perf_counter() - started) * 1000)
    _set_headers(response, ctx)
    await auth.track_api_call(
        db, ctx, request, status_code=200,
        latency_ms=latency_ms, response_size=len(str(out)),
    )
    await vp.persist_call_audit(
        db, "bank-avm", ctx, payload,
        status="ok" if raw.get("available") else "stub",
        latency_ms=latency_ms,
    )
    try:
        from audit_log import log_mutation
        actor = {"user_id": "api_key", "role": "api",
                 "tenant_id": ctx.tenant_id, "name": ctx.id}
        await log_mutation(
            db, actor, "create", "vertical_call", f"bank-avm:{ctx.id}",
            before=None, after={"vertical": "bank-avm", "tier": ctx.tier},
            request=request,
        )
    except Exception:
        pass
    return out


@router.post("/api/v1/verticals/insurance-risk")
async def v1_insurance_risk(body: InsuranceRiskBody, request: Request, response: Response):
    ctx = await auth.validate_api_key(request)
    # free returns KPI-only via _filter_by_tier; no tier gate here
    started = time.perf_counter()
    db = _db(request)

    payload = body.model_dump(exclude_none=True)
    coverage = payload.pop("coverage_type", "property")
    raw = await vp.compute_insurance_risk(db, payload, coverage)
    out = _filter_by_tier(raw, ctx, "insurance-risk")

    latency_ms = int((time.perf_counter() - started) * 1000)
    _set_headers(response, ctx)
    await auth.track_api_call(
        db, ctx, request, status_code=200,
        latency_ms=latency_ms, response_size=len(str(out)),
    )
    await vp.persist_call_audit(
        db, "insurance-risk", ctx, payload,
        status="ok" if raw.get("available") else "stub",
        latency_ms=latency_ms,
    )
    try:
        from audit_log import log_mutation
        actor = {"user_id": "api_key", "role": "api",
                 "tenant_id": ctx.tenant_id, "name": ctx.id}
        await log_mutation(
            db, actor, "create", "vertical_call", f"insurance-risk:{ctx.id}",
            before=None, after={"vertical": "insurance-risk", "tier": ctx.tier},
            request=request,
        )
    except Exception:
        pass
    return out


@router.post("/api/v1/verticals/notaria-title-check")
async def v1_notaria_title(body: TitleCheckBody, request: Request, response: Response):
    ctx = await auth.validate_api_key(request)
    auth.require_tier(ctx, "enterprise")  # sensitive data → enterprise only
    started = time.perf_counter()
    db = _db(request)

    payload = body.model_dump(exclude_none=True)
    raw = await vp.compute_title_check(
        db, body.property_id, body.transaction_history or [],
    )

    latency_ms = int((time.perf_counter() - started) * 1000)
    _set_headers(response, ctx)
    await auth.track_api_call(
        db, ctx, request, status_code=200,
        latency_ms=latency_ms, response_size=len(str(raw)),
    )
    await vp.persist_call_audit(
        db, "notaria-title-check", ctx, payload,
        status="ok" if raw.get("available") else "stub",
        latency_ms=latency_ms,
    )
    try:
        from audit_log import log_mutation
        actor = {"user_id": "api_key", "role": "api",
                 "tenant_id": ctx.tenant_id, "name": ctx.id}
        await log_mutation(
            db, actor, "create", "vertical_call",
            f"notaria-title-check:{ctx.id}",
            before=None, after={"vertical": "notaria-title-check", "tier": ctx.tier},
            request=request,
        )
    except Exception:
        pass
    return raw


@router.post("/api/v1/verticals/investor-yield")
async def v1_investor_yield(body: InvestorYieldBody, request: Request, response: Response):
    ctx = await auth.validate_api_key(request)
    started = time.perf_counter()
    db = _db(request)

    payload = body.model_dump(exclude_none=True)
    hold_years = payload.pop("hold_years", 5)
    raw = await vp.compute_investor_yield(db, payload, hold_years)
    out = _filter_by_tier(raw, ctx, "investor-yield")

    latency_ms = int((time.perf_counter() - started) * 1000)
    _set_headers(response, ctx)
    await auth.track_api_call(
        db, ctx, request, status_code=200,
        latency_ms=latency_ms, response_size=len(str(out)),
    )
    await vp.persist_call_audit(
        db, "investor-yield", ctx, payload,
        status="ok" if raw.get("available") else "stub",
        latency_ms=latency_ms,
    )
    try:
        from audit_log import log_mutation
        actor = {"user_id": "api_key", "role": "api",
                 "tenant_id": ctx.tenant_id, "name": ctx.id}
        await log_mutation(
            db, actor, "create", "vertical_call", f"investor-yield:{ctx.id}",
            before=None, after={"vertical": "investor-yield", "tier": ctx.tier},
            request=request,
        )
    except Exception:
        pass
    return out
