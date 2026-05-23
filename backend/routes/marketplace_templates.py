"""W6.4 · Marketplace Templates · REST routes.

8 endpoints:
  POST   /api/marketplace/templates/publish                          (T2+ advisor)
  GET    /api/marketplace/templates                                  (público T0)
  GET    /api/marketplace/templates/search?q=                        (público T0)
  GET    /api/marketplace/templates/{id}                             (público T0)
  POST   /api/marketplace/templates/{id}/clone                       (T2+ advisor)
  POST   /api/marketplace/templates/{id}/rate                        (T2+ advisor)
  GET    /api/marketplace/templates/revenue/my                       (T2+ advisor)
  POST   /api/superadmin/marketplace/templates/{id}/approve          (superadmin)
  POST   /api/superadmin/marketplace/templates/{id}/reject           (superadmin)
  DELETE /api/superadmin/marketplace/templates/{id}                  (superadmin)
  GET    /api/superadmin/marketplace/templates/admin-stats           (superadmin)
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from marketplace_templates_engine import (
    approve_template,
    clone_template,
    delete_template,
    get_admin_stats,
    get_revenue_stats,
    get_template,
    list_templates,
    publish_template,
    rate_template,
    reject_template,
    search_templates,
)
from permissions import require_superadmin

log = logging.getLogger("dmx.routes_marketplace_templates")
router = APIRouter()

_ADVISOR_ROLES = ("superadmin", "advisor", "asesor_admin", "asesor_freelance")


async def _get_user(request: Request):
    from server import get_current_user
    return await get_current_user(request)


async def _require_advisor(request: Request):
    user = await _get_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    role = getattr(user, "role", None)
    if role not in _ADVISOR_ROLES:
        raise HTTPException(403, "Acceso denegado · solo asesor T2+")
    return user


# ─── Models ──────────────────────────────────────────────────────────────────

class PublishIn(BaseModel):
    workflow_id: str
    title: str = Field(..., min_length=4, max_length=120)
    description: Optional[str] = Field(None, max_length=2000)
    category: str = Field(..., pattern=r"^(nurture|post-visita|win-back|custom)$")
    price_mxn: int = Field(0, ge=0, le=10000)


class CloneIn(BaseModel):
    paid_amount_mxn: Optional[int] = Field(None, ge=0, le=10000)


class RateIn(BaseModel):
    stars: int = Field(..., ge=1, le=5)
    comment: Optional[str] = Field(None, max_length=1000)


class RejectIn(BaseModel):
    reason: Optional[str] = Field("", max_length=500)


# ─── Endpoints (advisor) ─────────────────────────────────────────────────────

@router.post("/api/marketplace/templates/publish")
async def publish_endpoint(body: PublishIn, request: Request):
    user = await _require_advisor(request)
    db = request.app.state.db
    author_id = getattr(user, "id", None) or getattr(user, "email", None) or "unknown"
    res = await publish_template(
        db, author_user_id=author_id, workflow_id=body.workflow_id,
        author_email=getattr(user, "email", None),
        metadata={
            "title": body.title,
            "description": body.description or "",
            "category": body.category,
            "price_mxn": body.price_mxn,
        },
    )
    if not res.get("ok"):
        raise HTTPException(400, res.get("error") or "publish failed")
    return res


@router.get("/api/marketplace/templates")
async def list_endpoint(
    request: Request,
    category: Optional[str] = None,
    price_tier: Optional[str] = None,
    sort: str = "popular",
    limit: int = 50,
):
    db = request.app.state.db
    return await list_templates(
        db, category=category, price_tier=price_tier, sort=sort, limit=limit,
    )


@router.get("/api/marketplace/templates/search")
async def search_endpoint(request: Request, q: str = "", limit: int = 30):
    db = request.app.state.db
    return await search_templates(db, q, limit=limit)


@router.get("/api/marketplace/templates/revenue/my")
async def my_revenue_endpoint(request: Request):
    user = await _require_advisor(request)
    db = request.app.state.db
    aid = getattr(user, "id", None) or getattr(user, "email", None) or "unknown"
    return await get_revenue_stats(db, author_user_id=aid)


@router.get("/api/marketplace/templates/{template_id}")
async def detail_endpoint(template_id: str, request: Request):
    db = request.app.state.db
    doc = await get_template(db, template_id)
    if not doc:
        raise HTTPException(404, "template no encontrado")
    if doc.get("status") != "approved":
        # Solo el autor (o superadmin) puede ver no-aprobados
        user = await _get_user(request)
        author = doc.get("author_user_id")
        uid = getattr(user, "id", None) or getattr(user, "email", None) if user else None
        role = getattr(user, "role", None) if user else None
        if not (uid == author or role == "superadmin"):
            raise HTTPException(404, "template no encontrado")
    return doc


@router.post("/api/marketplace/templates/{template_id}/clone")
async def clone_endpoint(template_id: str, body: CloneIn, request: Request):
    user = await _require_advisor(request)
    db = request.app.state.db
    target_id = getattr(user, "id", None) or getattr(user, "email", None) or "unknown"
    res = await clone_template(
        db,
        template_id=template_id,
        target_user_id=target_id,
        target_email=getattr(user, "email", None),
        paid_amount_mxn=body.paid_amount_mxn,
    )
    if not res.get("ok"):
        raise HTTPException(400, res.get("error") or "clone failed")
    return res


@router.post("/api/marketplace/templates/{template_id}/rate")
async def rate_endpoint(template_id: str, body: RateIn, request: Request):
    user = await _require_advisor(request)
    db = request.app.state.db
    uid = getattr(user, "id", None) or getattr(user, "email", None) or "unknown"
    res = await rate_template(
        db, template_id=template_id, user_id=uid, stars=body.stars,
        comment=body.comment,
    )
    if not res.get("ok"):
        raise HTTPException(400, res.get("error") or "rate failed")
    return res


# ─── Endpoints (superadmin) ──────────────────────────────────────────────────

@router.post("/api/superadmin/marketplace/templates/{template_id}/approve")
async def approve_endpoint(template_id: str, request: Request):
    user = await require_superadmin(request)
    db = request.app.state.db
    admin_id = getattr(user, "id", "superadmin")
    res = await approve_template(db, template_id, admin_user_id=admin_id)
    if not res.get("ok"):
        raise HTTPException(400, res.get("error") or "approve failed")
    return res


@router.post("/api/superadmin/marketplace/templates/{template_id}/reject")
async def reject_endpoint(template_id: str, body: RejectIn, request: Request):
    user = await require_superadmin(request)
    db = request.app.state.db
    admin_id = getattr(user, "id", "superadmin")
    res = await reject_template(db, template_id, admin_user_id=admin_id,
                                 reason=body.reason or "")
    if not res.get("ok"):
        raise HTTPException(400, res.get("error") or "reject failed")
    return res


@router.delete("/api/superadmin/marketplace/templates/{template_id}")
async def delete_endpoint(template_id: str, request: Request):
    user = await require_superadmin(request)
    db = request.app.state.db
    admin_id = getattr(user, "id", "superadmin")
    res = await delete_template(db, template_id, admin_user_id=admin_id)
    if not res.get("ok"):
        raise HTTPException(400, res.get("error") or "delete failed")
    return res


@router.get("/api/superadmin/marketplace/templates/admin-stats")
async def admin_stats_endpoint(request: Request):
    await require_superadmin(request)
    db = request.app.state.db
    stats = await get_admin_stats(db)
    revenue = await get_revenue_stats(db, author_user_id=None)
    return {"stats": stats, "revenue": revenue}


@router.get("/api/superadmin/marketplace/templates/list")
async def admin_list_endpoint(
    request: Request,
    status: Optional[str] = None,
    limit: int = 100,
):
    """Admin list · permite filtrar por status (pending_review/approved/rejected/all)."""
    await require_superadmin(request)
    db = request.app.state.db
    # Bypass cache · query directo
    from marketplace_templates_engine import _serialize  # noqa: WPS437

    query: Dict[str, Any] = {"deleted_at": None}
    if status and status != "all":
        query["status"] = status
    limit = max(1, min(500, int(limit or 100)))
    cursor = db.marketplace_templates.find(query, {"_id": 0}).sort("published_at", -1).limit(limit)
    items = await cursor.to_list(length=limit)
    return {"items": [_serialize(d) for d in items], "count": len(items), "filter": status or "all"}
