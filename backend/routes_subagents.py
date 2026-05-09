"""W4.5 Y.2A/Y.2B — Sub-agents REST routes.

Prefijos:
  /api/subagents/pricing/...              → developer_admin / superadmin (own org)
  /api/subagents/marketing/...            → developer_admin / superadmin (own org)
  /api/superadmin/subagents/pricing/...   → superadmin (any org)
  /api/superadmin/subagents/marketing/... → superadmin (any org)
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

log = logging.getLogger("dmx.routes_subagents")

router    = APIRouter(prefix="/api/subagents",            tags=["subagents"])
sa_router = APIRouter(prefix="/api/superadmin/subagents", tags=["subagents-admin"])

ALLOWED_ROLES = {"developer_admin", "superadmin", "inmobiliaria_admin"}


# ─── Auth helpers ─────────────────────────────────────────────────────────────
async def _get_user(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    return user


async def _require_developer_or_admin(request: Request) -> Any:
    user = await _get_user(request)
    role = getattr(user, "role", "")
    if role not in ALLOWED_ROLES:
        raise HTTPException(403, "Acceso denegado: se requiere rol developer_admin o superadmin")
    return user


async def _require_superadmin(request: Request) -> Any:
    user = await _get_user(request)
    from permissions import require_superadmin
    await require_superadmin(request)
    return user


def _clean_rec(doc: Dict[str, Any]) -> Dict[str, Any]:
    d = dict(doc)
    # expose _id as id
    if "_id" in d:
        d["id"] = d.pop("_id")
    elif "id" not in d:
        d["id"] = None
    for k in ("generated_at", "applied_at", "expires_at"):
        v = d.get(k)
        if isinstance(v, datetime):
            d[k] = v.isoformat()
    return d


def _clean_run(doc: Dict[str, Any]) -> Dict[str, Any]:
    d = dict(doc)
    if "_id" in d:
        d["run_id"] = d.pop("_id")
    v = d.get("created_at")
    if isinstance(v, datetime):
        d["created_at"] = v.isoformat()
    return d


# ─── Pydantic models ──────────────────────────────────────────────────────────
class AnalyzeIn(BaseModel):
    project_id: str


class RejectIn(BaseModel):
    reason: Optional[str] = None


# ─── POST /api/subagents/pricing/analyze ──────────────────────────────────────
@router.post("/pricing/analyze", status_code=201)
async def analyze_pricing(body: AnalyzeIn, request: Request):
    user = await _require_developer_or_admin(request)
    org_id = getattr(user, "tenant_id", None) or getattr(user, "org_id", None)
    if not org_id:
        raise HTTPException(400, "tenant_id no disponible en sesión")

    db = request.app.state.db

    from sub_agents.pricing_agent import (
        PricingAgent, PricingAgentDisabledError, PricingAgentRateLimitError,
    )
    try:
        agent = PricingAgent(db=db, org_id=org_id)
        result = await agent.analyze_project(project_id=body.project_id)
    except PricingAgentDisabledError as e:
        raise HTTPException(403, str(e))
    except PricingAgentRateLimitError as e:
        raise HTTPException(429, str(e))
    except Exception as e:
        log.error(f"[routes_subagents] analyze_pricing error: {e}")
        raise HTTPException(500, f"Error interno del agente de pricing: {e}")

    return JSONResponse(status_code=201, content=result)


# ─── GET /api/subagents/pricing/recommendations ───────────────────────────────
@router.get("/pricing/recommendations")
async def list_recommendations(
    request: Request,
    project_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 50,
    skip: int = 0,
):
    user = await _require_developer_or_admin(request)
    org_id = getattr(user, "tenant_id", None) or getattr(user, "org_id", None)
    if not org_id:
        raise HTTPException(400, "tenant_id no disponible en sesión")

    db = request.app.state.db

    query: Dict[str, Any] = {"org_id": org_id}
    if project_id:
        query["project_id"] = project_id
    if status:
        query["status"] = status

    limit = min(limit, 200)
    cursor = db.pricing_recommendations.find(query).sort("generated_at", -1).skip(skip).limit(limit)
    docs = await cursor.to_list(length=limit)
    total = await db.pricing_recommendations.count_documents(query)

    return JSONResponse(content={
        "items": [_clean_rec(d) for d in docs],
        "total": total,
        "limit": limit,
        "skip": skip,
    })


# ─── POST /api/subagents/pricing/recommendations/{id}/apply ───────────────────
@router.post("/pricing/recommendations/{rec_id}/apply")
async def apply_recommendation(rec_id: str, request: Request):
    user = await _require_developer_or_admin(request)
    org_id = getattr(user, "tenant_id", None) or getattr(user, "org_id", None)
    user_id = getattr(user, "user_id", None)

    db = request.app.state.db

    doc = await db.pricing_recommendations.find_one({"_id": rec_id})
    if not doc:
        raise HTTPException(404, "Recomendación no encontrada")
    if doc.get("org_id") != org_id and getattr(user, "role", "") != "superadmin":
        raise HTTPException(403, "Acceso denegado")
    if doc.get("status") != "pending":
        raise HTTPException(409, f"No se puede aplicar una recomendación en estado '{doc.get('status')}'")

    now = datetime.now(timezone.utc)
    await db.pricing_recommendations.update_one(
        {"_id": rec_id},
        {"$set": {"status": "applied", "applied_at": now, "applied_by_user_id": user_id}},
    )

    # Audit log
    try:
        from audit_log import log_mutation
        actor_dict = {"user_id": user_id or "unknown", "role": getattr(user, "role", ""), "tenant_id": org_id}
        await log_mutation(
            db, actor_dict, "update", "pricing_recommendation",
            entity_id=rec_id,
            before={"status": "pending"},
            after={"status": "applied", "applied_by": user_id},
        )
    except Exception as exc:
        log.warning(f"[routes_subagents] audit log failed: {exc}")

    updated = await db.pricing_recommendations.find_one({"_id": rec_id})
    return JSONResponse(content=_clean_rec(updated or {}))


# ─── POST /api/subagents/pricing/recommendations/{id}/reject ──────────────────
@router.post("/pricing/recommendations/{rec_id}/reject")
async def reject_recommendation(rec_id: str, body: RejectIn, request: Request):
    user = await _require_developer_or_admin(request)
    org_id = getattr(user, "tenant_id", None) or getattr(user, "org_id", None)
    user_id = getattr(user, "user_id", None)

    db = request.app.state.db

    doc = await db.pricing_recommendations.find_one({"_id": rec_id})
    if not doc:
        raise HTTPException(404, "Recomendación no encontrada")
    if doc.get("org_id") != org_id and getattr(user, "role", "") != "superadmin":
        raise HTTPException(403, "Acceso denegado")
    if doc.get("status") != "pending":
        raise HTTPException(409, f"No se puede rechazar una recomendación en estado '{doc.get('status')}'")

    update_fields: Dict[str, Any] = {"status": "rejected"}
    if body.reason:
        update_fields["rejection_reason"] = body.reason[:400]

    await db.pricing_recommendations.update_one({"_id": rec_id}, {"$set": update_fields})

    try:
        from audit_log import log_mutation
        actor_dict = {"user_id": user_id or "unknown", "role": getattr(user, "role", ""), "tenant_id": org_id}
        await log_mutation(
            db, actor_dict, "update", "pricing_recommendation",
            entity_id=rec_id,
            before={"status": "pending"},
            after={"status": "rejected", "reason": body.reason},
        )
    except Exception as exc:
        log.warning(f"[routes_subagents] audit log reject failed: {exc}")

    updated = await db.pricing_recommendations.find_one({"_id": rec_id})
    return JSONResponse(content=_clean_rec(updated or {}))


# ─── GET /api/superadmin/subagents/pricing/runs ───────────────────────────────
@sa_router.get("/pricing/runs")
async def list_pricing_runs(
    request: Request,
    org_id: Optional[str] = None,
    days: int = 30,
    limit: int = 50,
    skip: int = 0,
):
    await _require_superadmin(request)

    db = request.app.state.db

    since = datetime.now(timezone.utc) - timedelta(days=days)
    query: Dict[str, Any] = {"agent_type": "pricing", "created_at": {"$gte": since}}
    if org_id:
        query["org_id"] = org_id

    limit = min(limit, 200)
    cursor = db.subagent_runs.find(query).sort("created_at", -1).skip(skip).limit(limit)
    docs = await cursor.to_list(length=limit)
    total = await db.subagent_runs.count_documents(query)

    # Aggregate stats
    total_cost = sum(d.get("cost_usd") or 0 for d in docs)
    layer_breakdown: Dict[str, int] = {}
    for d in docs:
        layer = d.get("fallback_layer") or "llm"
        layer_breakdown[layer] = layer_breakdown.get(layer, 0) + 1
    success_count = sum(1 for d in docs if d.get("status") == "success")

    return JSONResponse(content={
        "items": [_clean_run(d) for d in docs],
        "total": total,
        "total_cost_usd": round(total_cost, 6),
        "layer_breakdown": layer_breakdown,
        "success_rate_pct": round((success_count / len(docs) * 100) if docs else 0, 1),
        "limit": limit,
        "skip": skip,
    })


# ═══════════════════════════════════════════════════════════════════════════════
# W4.5 Y.2B — Marketing Sub-Agent endpoints
# ═══════════════════════════════════════════════════════════════════════════════

# ─── POST /api/subagents/marketing/analyze ────────────────────────────────────
@router.post("/marketing/analyze", status_code=201)
async def analyze_marketing(body: AnalyzeIn, request: Request):
    user = await _require_developer_or_admin(request)
    org_id = getattr(user, "tenant_id", None) or getattr(user, "org_id", None)
    if not org_id:
        raise HTTPException(400, "tenant_id no disponible en sesión")

    db = request.app.state.db

    from sub_agents.marketing_agent import (
        MarketingAgent, MarketingAgentDisabledError, MarketingAgentRateLimitError,
    )
    try:
        agent = MarketingAgent(db=db, org_id=org_id)
        result = await agent.analyze_project(project_id=body.project_id)
    except MarketingAgentDisabledError as e:
        raise HTTPException(403, str(e))
    except MarketingAgentRateLimitError as e:
        raise HTTPException(429, str(e))
    except Exception as e:
        log.error(f"[routes_subagents] analyze_marketing error: {e}")
        raise HTTPException(500, f"Error interno del agente de marketing: {e}")

    return JSONResponse(status_code=201, content=result)


# ─── GET /api/subagents/marketing/recommendations ─────────────────────────────
@router.get("/marketing/recommendations")
async def list_marketing_recommendations(
    request: Request,
    project_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 50,
    skip: int = 0,
):
    user = await _require_developer_or_admin(request)
    org_id = getattr(user, "tenant_id", None) or getattr(user, "org_id", None)
    if not org_id:
        raise HTTPException(400, "tenant_id no disponible en sesión")

    db = request.app.state.db
    query: Dict[str, Any] = {"org_id": org_id}
    if project_id:
        query["project_id"] = project_id
    if status:
        query["status"] = status

    limit = min(limit, 200)
    cursor = db.marketing_recommendations.find(query).sort("generated_at", -1).skip(skip).limit(limit)
    docs = await cursor.to_list(length=limit)
    total = await db.marketing_recommendations.count_documents(query)

    return JSONResponse(content={
        "items": [_clean_rec(d) for d in docs],
        "total": total,
        "limit": limit,
        "skip": skip,
    })


# ─── POST /api/subagents/marketing/recommendations/{id}/apply ─────────────────
@router.post("/marketing/recommendations/{rec_id}/apply")
async def apply_marketing_recommendation(rec_id: str, request: Request):
    user = await _require_developer_or_admin(request)
    org_id = getattr(user, "tenant_id", None) or getattr(user, "org_id", None)
    user_id = getattr(user, "user_id", None)

    db = request.app.state.db
    doc = await db.marketing_recommendations.find_one({"_id": rec_id})
    if not doc:
        raise HTTPException(404, "Recomendación no encontrada")
    if doc.get("org_id") != org_id and getattr(user, "role", "") != "superadmin":
        raise HTTPException(403, "Acceso denegado")
    if doc.get("status") != "pending":
        raise HTTPException(409, f"No se puede aplicar una recomendación en estado '{doc.get('status')}'")

    now = datetime.now(timezone.utc)
    await db.marketing_recommendations.update_one(
        {"_id": rec_id},
        {"$set": {"status": "applied", "applied_at": now, "applied_by_user_id": user_id}},
    )

    try:
        from audit_log import log_mutation
        actor_dict = {"user_id": user_id or "unknown", "role": getattr(user, "role", ""), "tenant_id": org_id}
        await log_mutation(
            db, actor_dict, "update", "marketing_recommendation",
            entity_id=rec_id,
            before={"status": "pending"},
            after={"status": "applied", "applied_by": user_id},
        )
    except Exception as exc:
        log.warning(f"[routes_subagents] mkt audit log failed: {exc}")

    updated = await db.marketing_recommendations.find_one({"_id": rec_id})
    return JSONResponse(content=_clean_rec(updated or {}))


# ─── POST /api/subagents/marketing/recommendations/{id}/reject ────────────────
@router.post("/marketing/recommendations/{rec_id}/reject")
async def reject_marketing_recommendation(rec_id: str, body: RejectIn, request: Request):
    user = await _require_developer_or_admin(request)
    org_id = getattr(user, "tenant_id", None) or getattr(user, "org_id", None)
    user_id = getattr(user, "user_id", None)

    db = request.app.state.db
    doc = await db.marketing_recommendations.find_one({"_id": rec_id})
    if not doc:
        raise HTTPException(404, "Recomendación no encontrada")
    if doc.get("org_id") != org_id and getattr(user, "role", "") != "superadmin":
        raise HTTPException(403, "Acceso denegado")
    if doc.get("status") != "pending":
        raise HTTPException(409, f"No se puede rechazar una recomendación en estado '{doc.get('status')}'")

    update_fields: Dict[str, Any] = {"status": "rejected"}
    if body.reason:
        update_fields["rejection_reason"] = body.reason[:400]
    await db.marketing_recommendations.update_one({"_id": rec_id}, {"$set": update_fields})

    try:
        from audit_log import log_mutation
        actor_dict = {"user_id": user_id or "unknown", "role": getattr(user, "role", ""), "tenant_id": org_id}
        await log_mutation(
            db, actor_dict, "update", "marketing_recommendation",
            entity_id=rec_id,
            before={"status": "pending"},
            after={"status": "rejected", "reason": body.reason},
        )
    except Exception as exc:
        log.warning(f"[routes_subagents] mkt audit reject failed: {exc}")

    updated = await db.marketing_recommendations.find_one({"_id": rec_id})
    return JSONResponse(content=_clean_rec(updated or {}))


# ─── GET /api/superadmin/subagents/marketing/runs ────────────────────────────
@sa_router.get("/marketing/runs")
async def list_marketing_runs(
    request: Request,
    org_id: Optional[str] = None,
    days: int = 30,
    limit: int = 50,
    skip: int = 0,
):
    await _require_superadmin(request)

    db = request.app.state.db
    since = datetime.now(timezone.utc) - timedelta(days=days)
    query: Dict[str, Any] = {"agent_type": "marketing", "created_at": {"$gte": since}}
    if org_id:
        query["org_id"] = org_id

    limit = min(limit, 200)
    cursor = db.subagent_runs.find(query).sort("created_at", -1).skip(skip).limit(limit)
    docs = await cursor.to_list(length=limit)
    total = await db.subagent_runs.count_documents(query)

    total_cost = sum(d.get("cost_usd") or 0 for d in docs)
    layer_breakdown: Dict[str, int] = {}
    for d in docs:
        layer = d.get("fallback_layer") or "llm"
        layer_breakdown[layer] = layer_breakdown.get(layer, 0) + 1
    success_count = sum(1 for d in docs if d.get("status") == "success")

    return JSONResponse(content={
        "items": [_clean_run(d) for d in docs],
        "total": total,
        "total_cost_usd": round(total_cost, 6),
        "layer_breakdown": layer_breakdown,
        "success_rate_pct": round((success_count / len(docs) * 100) if docs else 0, 1),
        "limit": limit,
        "skip": skip,
    })
