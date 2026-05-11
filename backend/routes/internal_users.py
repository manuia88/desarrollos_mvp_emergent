"""Phase 14 · Batch 37 — Internal Users + Mini Market + Cross-Org Partnerships routes.

Endpoints:

  Developer Internal Users (auth: developer_admin|developer_director|superadmin):
    POST /api/dev/internal-users
    GET  /api/dev/internal-users
    PATCH /api/dev/internal-users/{email}
    DELETE /api/dev/internal-users/{email}  (suspend, no hard delete)
    PUT  /api/dev/settings/external-inventory
    GET  /api/dev/mini-market

  Inmobiliaria Internal Users (auth: inmobiliaria_admin|inmobiliaria_director|superadmin):
    POST /api/inmobiliaria/internal-users
    GET  /api/inmobiliaria/internal-users
    PATCH /api/inmobiliaria/internal-users/{email}
    DELETE /api/inmobiliaria/internal-users/{email}
    PUT  /api/inmobiliaria/settings/external-inventory
    GET  /api/inmobiliaria/mini-market

  Invitations (public + auth):
    GET  /api/auth/in-house/invitation?token={t}  (public)
    POST /api/dev/internal-users/{invitation_id}/resend

  Cross-Org Partnerships (auth: admin/director):
    POST /api/cross-partnerships
    GET  /api/cross-partnerships
    GET  /api/cross-partnerships/{id}
    POST /api/cross-partnerships/{id}/approve
    POST /api/cross-partnerships/{id}/reject
    POST /api/cross-partnerships/{id}/revoke
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request, Query
from pydantic import BaseModel, Field, EmailStr

log = logging.getLogger("dmx.routes_internal_users")

router = APIRouter(tags=["internal_users"])

ADMIN_ROLES = {"developer_admin", "inmobiliaria_admin", "superadmin"}
DEV_MANAGE_ROLES = {"developer_admin", "developer_director", "superadmin"}
INM_MANAGE_ROLES = {"inmobiliaria_admin", "inmobiliaria_director", "superadmin"}
CROSS_MANAGE_ROLES = {"developer_admin", "developer_director", "inmobiliaria_admin", "inmobiliaria_director", "superadmin"}


def _db(request: Request):
    return request.app.state.db


async def _auth(request: Request, allowed_roles: set = None):
    from server import get_current_user
    u = await get_current_user(request)
    if not u:
        raise HTTPException(401, "No autenticado")
    if allowed_roles and u.role not in allowed_roles:
        raise HTTPException(403, "Sin permisos para esta acción")
    return u


# ═══ Schemas ═════════════════════════════════════════════════════════════════

class InviteUserIn(BaseModel):
    email: str = Field(..., min_length=5, max_length=120)
    role: str = Field(..., min_length=2, max_length=50)
    name: Optional[str] = Field(None, max_length=100)
    assigned_projects: Optional[List[str]] = Field(default_factory=list)
    assigned_dev_partnerships: Optional[List[str]] = Field(default_factory=list)


class PatchUserIn(BaseModel):
    role: Optional[str] = None
    assigned_projects: Optional[List[str]] = None
    assigned_dev_partnerships: Optional[List[str]] = None
    status: Optional[str] = None


class ExternalInventoryIn(BaseModel):
    enabled: bool


class CrossPartnershipIn(BaseModel):
    target_org_type: str = Field(..., pattern="^(dev|inmobiliaria)$")
    target_org_id: str = Field(..., min_length=1, max_length=80)
    notes: Optional[str] = Field(None, max_length=500)
    commission_pct_default: Optional[float] = Field(None, ge=0, le=100)


class CrossDecisionIn(BaseModel):
    reason: Optional[str] = Field(None, max_length=500)


# ═══ Developer Internal Users ════════════════════════════════════════════════

@router.post("/api/dev/internal-users")
async def invite_dev_user(payload: InviteUserIn, request: Request):
    user = await _auth(request, DEV_MANAGE_ROLES)
    db = _db(request)
    dev_org = _get_dev_org_id(user)
    from services.internal_users import invite_internal_user
    try:
        result = await invite_internal_user(
            db,
            org_type="dev",
            org_id=dev_org,
            email=payload.email,
            role=payload.role,
            invited_by_user_id=user.user_id,
            name=payload.name,
            assigned_projects=payload.assigned_projects,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    return result


@router.get("/api/dev/internal-users")
async def list_dev_users(request: Request):
    user = await _auth(request, DEV_MANAGE_ROLES | {"developer_advisor", "developer_obras", "developer_marketing"})
    db = _db(request)
    dev_org = _get_dev_org_id(user)
    from services.internal_users import list_dev_internal_users
    items = await list_dev_internal_users(db, dev_org)
    return {"items": items, "total": len(items)}


@router.patch("/api/dev/internal-users/{email}")
async def patch_dev_user(email: str, payload: PatchUserIn, request: Request):
    user = await _auth(request, DEV_MANAGE_ROLES)
    db = _db(request)
    dev_org = _get_dev_org_id(user)
    from services.internal_users import update_dev_internal_user
    try:
        result = await update_dev_internal_user(
            db,
            dev_org_id=dev_org,
            target_email=email,
            updated_by_user_id=user.user_id,
            role=payload.role,
            assigned_projects=payload.assigned_projects,
            status=payload.status,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    return result


@router.delete("/api/dev/internal-users/{email}")
async def suspend_dev_user(email: str, request: Request):
    user = await _auth(request, DEV_MANAGE_ROLES)
    db = _db(request)
    dev_org = _get_dev_org_id(user)
    from services.internal_users import update_dev_internal_user
    try:
        result = await update_dev_internal_user(
            db,
            dev_org_id=dev_org,
            target_email=email,
            updated_by_user_id=user.user_id,
            status="suspended",
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    return result


@router.put("/api/dev/settings/external-inventory")
async def set_dev_external_inventory(payload: ExternalInventoryIn, request: Request):
    user = await _auth(request, {"developer_admin", "superadmin"})
    db = _db(request)
    dev_org = _get_dev_org_id(user)
    from services.mini_market_engine import set_allow_external_inventory
    await set_allow_external_inventory(db, "dev", dev_org, payload.enabled)
    try:
        from routes.dev_batch14 import log_activity
        await log_activity(
            db, user.user_id, "developer_admin", "update",
            dev_org, "dev_org_settings",
            metadata={"allow_external_inventory": payload.enabled},
        )
    except Exception:
        pass
    return {"dev_org_id": dev_org, "allow_external_inventory": payload.enabled}


@router.get("/api/dev/mini-market")
async def get_dev_mini_market(request: Request):
    user = await _auth(request, DEV_MANAGE_ROLES | {"developer_advisor", "developer_obras", "developer_marketing"})
    db = _db(request)
    from services.mini_market_engine import compute_mini_market_dev
    items = await compute_mini_market_dev(db, user.user_id)
    return {"items": items, "total": len(items)}


@router.post("/api/dev/internal-users/invitations/{invitation_id}/resend")
async def resend_dev_invitation(invitation_id: str, request: Request):
    user = await _auth(request, DEV_MANAGE_ROLES)
    db = _db(request)
    from services.internal_users import resend_invitation
    try:
        return await resend_invitation(db, invitation_id, user.user_id)
    except ValueError as e:
        raise HTTPException(400, str(e))


# ═══ Inmobiliaria Internal Users ═════════════════════════════════════════════

@router.post("/api/inmobiliaria/internal-users")
async def invite_inm_user(payload: InviteUserIn, request: Request):
    user = await _auth(request, INM_MANAGE_ROLES)
    db = _db(request)
    inm_id = _get_inm_id(user)
    from services.internal_users import invite_internal_user
    try:
        result = await invite_internal_user(
            db,
            org_type="inmobiliaria",
            org_id=inm_id,
            email=payload.email,
            role=payload.role,
            invited_by_user_id=user.user_id,
            name=payload.name,
            assigned_dev_partnerships=payload.assigned_dev_partnerships,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    return result


@router.get("/api/inmobiliaria/internal-users")
async def list_inm_users(request: Request):
    user = await _auth(request, INM_MANAGE_ROLES | {"inmobiliaria_advisor", "inmobiliaria_marketing"})
    db = _db(request)
    inm_id = _get_inm_id(user)
    from services.internal_users import list_inmobiliaria_internal_users
    items = await list_inmobiliaria_internal_users(db, inm_id)
    return {"items": items, "total": len(items)}


@router.patch("/api/inmobiliaria/internal-users/{email}")
async def patch_inm_user(email: str, payload: PatchUserIn, request: Request):
    user = await _auth(request, INM_MANAGE_ROLES)
    db = _db(request)
    inm_id = _get_inm_id(user)
    from services.internal_users import update_inmobiliaria_internal_user
    try:
        result = await update_inmobiliaria_internal_user(
            db,
            inmobiliaria_id=inm_id,
            target_email=email,
            updated_by_user_id=user.user_id,
            role=payload.role,
            assigned_dev_partnerships=payload.assigned_dev_partnerships,
            status=payload.status,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    return result


@router.delete("/api/inmobiliaria/internal-users/{email}")
async def suspend_inm_user(email: str, request: Request):
    user = await _auth(request, INM_MANAGE_ROLES)
    db = _db(request)
    inm_id = _get_inm_id(user)
    from services.internal_users import update_inmobiliaria_internal_user
    try:
        result = await update_inmobiliaria_internal_user(
            db,
            inmobiliaria_id=inm_id,
            target_email=email,
            updated_by_user_id=user.user_id,
            status="suspended",
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    return result


@router.put("/api/inmobiliaria/settings/external-inventory")
async def set_inm_external_inventory(payload: ExternalInventoryIn, request: Request):
    user = await _auth(request, {"inmobiliaria_admin", "superadmin"})
    db = _db(request)
    inm_id = _get_inm_id(user)
    from services.mini_market_engine import set_allow_external_inventory
    await set_allow_external_inventory(db, "inmobiliaria", inm_id, payload.enabled)
    return {"inmobiliaria_id": inm_id, "allow_external_inventory": payload.enabled}


@router.get("/api/inmobiliaria/mini-market")
async def get_inm_mini_market(request: Request):
    user = await _auth(request, INM_MANAGE_ROLES | {"inmobiliaria_advisor", "inmobiliaria_marketing"})
    db = _db(request)
    from services.mini_market_engine import compute_mini_market_inmobiliaria
    items = await compute_mini_market_inmobiliaria(db, user.user_id)
    return {"items": items, "total": len(items)}


# ═══ Invitation Lookup (public) ══════════════════════════════════════════════

@router.get("/api/auth/in-house/invitation")
async def get_invitation_info(token: str = Query(...), request: Request = None):
    db = request.app.state.db
    from services.internal_users import lookup_invitation_by_token
    try:
        return await lookup_invitation_by_token(db, token)
    except ValueError as e:
        raise HTTPException(400, str(e))


# ═══ Cross-Org Partnerships ══════════════════════════════════════════════════

@router.post("/api/cross-partnerships")
async def create_cross_partnership(payload: CrossPartnershipIn, request: Request):
    user = await _auth(request, CROSS_MANAGE_ROLES)
    db = _db(request)
    requester_org_type, requester_org_id = _get_org_of_user(user)
    from services.cross_org_partnerships import request_partnership
    try:
        result = await request_partnership(
            db,
            requester_org_type=requester_org_type,
            requester_org_id=requester_org_id,
            target_org_type=payload.target_org_type,
            target_org_id=payload.target_org_id,
            requested_by_user_id=user.user_id,
            notes=payload.notes,
            commission_pct_default=payload.commission_pct_default,
        )
    except ValueError as e:
        raise HTTPException(422, str(e))
    return result


@router.get("/api/cross-partnerships")
async def list_cross_partnerships(
    request: Request,
    role: str = Query("both"),
    status: Optional[str] = Query(None),
):
    user = await _auth(request, CROSS_MANAGE_ROLES)
    db = _db(request)
    org_type, org_id = _get_org_of_user(user)
    from services.cross_org_partnerships import list_for_org
    items = await list_for_org(db, org_type, org_id, role=role, status=status)
    return {"items": items, "total": len(items)}


@router.get("/api/cross-partnerships/{partnership_id}")
async def get_cross_partnership(partnership_id: str, request: Request):
    user = await _auth(request, CROSS_MANAGE_ROLES)
    db = _db(request)
    org_type, org_id = _get_org_of_user(user)
    doc = await db.cross_org_partnerships.find_one(
        {"partnership_id": partnership_id}, {"_id": 0}
    )
    if not doc:
        raise HTTPException(404, "Alianza no encontrada")
    if user.role != "superadmin":
        if doc.get("requester_org_id") != org_id and doc.get("target_org_id") != org_id:
            raise HTTPException(403, "Sin acceso a esta alianza")
    from services.cross_org_partnerships import _serialize
    return _serialize(doc)


@router.post("/api/cross-partnerships/{partnership_id}/approve")
async def approve_cross_partnership(partnership_id: str, request: Request):
    user = await _auth(request, CROSS_MANAGE_ROLES)
    db = _db(request)
    # Only target org can approve
    await _assert_partnership_ownership(db, partnership_id, user, side="target")
    from services.cross_org_partnerships import approve
    try:
        return await approve(db, partnership_id, user.user_id)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/api/cross-partnerships/{partnership_id}/reject")
async def reject_cross_partnership(
    partnership_id: str, payload: CrossDecisionIn, request: Request,
):
    user = await _auth(request, CROSS_MANAGE_ROLES)
    db = _db(request)
    await _assert_partnership_ownership(db, partnership_id, user, side="target")
    from services.cross_org_partnerships import reject
    try:
        return await reject(db, partnership_id, user.user_id, payload.reason or "Sin motivo")
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/api/cross-partnerships/{partnership_id}/revoke")
async def revoke_cross_partnership(
    partnership_id: str, payload: CrossDecisionIn, request: Request,
):
    user = await _auth(request, CROSS_MANAGE_ROLES)
    db = _db(request)
    await _assert_partnership_ownership(db, partnership_id, user, side="both")
    from services.cross_org_partnerships import revoke
    try:
        return await revoke(db, partnership_id, user.user_id, payload.reason or "Sin motivo")
    except ValueError as e:
        raise HTTPException(400, str(e))


# ─── Private helpers ──────────────────────────────────────────────────────────

def _get_dev_org_id(user) -> str:
    tid = getattr(user, "tenant_id", None)
    if not tid:
        raise HTTPException(409, "Tu cuenta no está vinculada a una desarrolladora")
    return tid


def _get_inm_id(user) -> str:
    tid = getattr(user, "tenant_id", None)
    if not tid:
        raise HTTPException(409, "Tu cuenta no está vinculada a una inmobiliaria")
    return tid


def _get_org_of_user(user):
    """Returns (org_type, org_id) tuple for the user."""
    role = getattr(user, "role", "")
    tid = getattr(user, "tenant_id", None)
    if not tid and role != "superadmin":
        raise HTTPException(409, "Tu cuenta no está vinculada a ninguna organización")
    if role.startswith("inmobiliaria"):
        return ("inmobiliaria", tid)
    return ("dev", tid)


async def _assert_partnership_ownership(db, partnership_id: str, user, side: str) -> None:
    """Raises 403 if user's org doesn't own the partnership on the given side."""
    if user.role == "superadmin":
        return
    _, org_id = _get_org_of_user(user)
    doc = await db.cross_org_partnerships.find_one(
        {"partnership_id": partnership_id}, {"_id": 0, "requester_org_id": 1, "target_org_id": 1}
    )
    if not doc:
        raise HTTPException(404, "Alianza no encontrada")
    if side == "target" and doc.get("target_org_id") != org_id:
        raise HTTPException(403, "Solo el destinatario de la alianza puede aprobar/rechazar")
    if side == "both" and doc.get("requester_org_id") != org_id and doc.get("target_org_id") != org_id:
        raise HTTPException(403, "Sin acceso a esta alianza")
