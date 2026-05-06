"""Phase 18 · Batch 35 — Inmobiliaria entity routes.

Endpoints:
  Public:
    POST /api/auth/inmobiliaria/signup            → create tenant + admin user
    POST /api/inmobiliaria/ampi-verify            → format-validate AMPI ID

  Authenticated (inmobiliaria_admin / superadmin):
    GET  /api/inmobiliaria/me                     → current user's inmobiliaria info
    POST /api/inmobiliaria/users/invite           → invite new asesor (creates pending rel)
    GET  /api/inmobiliaria/advisor-relationships  → list invitations + active asesores
    POST /api/inmobiliaria/dev-partnerships       → propose alliance with developer
    GET  /api/inmobiliaria/dev-partnerships       → list alliances (filterable)
    PATCH /api/inmobiliaria/dev-partnerships/{id} → update partnership status

Reuses log_activity from routes_dev_batch14, _send_email from services.lead_capture,
and existing /api/inmobiliaria/dashboard from routes_dev_batch4_1.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request, Response, Query
from pydantic import BaseModel, Field

log = logging.getLogger("dmx.routes_inmobiliaria")

router = APIRouter(tags=["inmobiliaria"])

ADMIN_ROLES = {"superadmin", "inmobiliaria_admin"}


def _db(request: Request):
    return request.app.state.db


async def _auth_inm_admin(request: Request):
    from server import get_current_user
    u = await get_current_user(request)
    if not u:
        raise HTTPException(401, "No autenticado")
    if u.role not in ADMIN_ROLES:
        raise HTTPException(403, "Solo administradores de inmobiliaria")
    return u


async def _resolve_inmobiliaria_id(user, override: Optional[str] = None) -> str:
    """superadmin can target any tenant via ?inmobiliaria_id=…
    inmobiliaria_admin always uses their own tenant_id.
    """
    if user.role == "superadmin":
        return override or getattr(user, "tenant_id", None) or "dmx_root"
    tid = getattr(user, "tenant_id", None)
    if not tid:
        raise HTTPException(409, "Tu cuenta no está asociada a una inmobiliaria")
    return tid


# ═══ Schemas ═════════════════════════════════════════════════════════════════

class InmobiliariaSignupIn(BaseModel):
    company_name: str = Field(..., min_length=2, max_length=160)
    admin_email: str = Field(..., min_length=4, max_length=200)
    admin_password: str = Field(..., min_length=8, max_length=200)
    admin_name: str = Field(..., min_length=2, max_length=120)
    ampi_id: Optional[str] = Field(None, max_length=20)
    rfc: Optional[str] = Field(None, max_length=14)
    founded_year: Optional[int] = Field(None, ge=1900, le=2100)
    contact_phone: Optional[str] = Field(None, max_length=30)


class AmpiVerifyIn(BaseModel):
    ampi_id: str = Field(..., min_length=1, max_length=20)


class InviteAdvisorIn(BaseModel):
    email: str = Field(..., min_length=4, max_length=200)
    name: str = Field(..., min_length=2, max_length=120)
    role: str = Field("asesor", max_length=24)


class CreatePartnershipIn(BaseModel):
    dev_org_id: str = Field(..., min_length=2, max_length=80)
    dev_org_name: Optional[str] = Field(None, max_length=160)
    commission_pct: Optional[float] = Field(None, ge=0, le=50)
    notes: Optional[str] = Field(None, max_length=500)


class PartnershipPatchIn(BaseModel):
    status: str = Field(..., pattern="^(pending|active|paused|terminated)$")


# ═══ Public — Signup + AMPI verify ═══════════════════════════════════════════

@router.post("/api/auth/inmobiliaria/signup")
async def auth_inmobiliaria_signup(
    payload: InmobiliariaSignupIn, request: Request, response: Response,
):
    from server import hash_password, create_access_token, create_refresh_token
    from services.inmobiliaria_signup import signup_inmobiliaria

    db = _db(request)
    pwd_hash = hash_password(payload.admin_password)
    try:
        result = await signup_inmobiliaria(
            db,
            company_name=payload.company_name,
            admin_email=payload.admin_email,
            admin_password_hash=pwd_hash,
            admin_name=payload.admin_name,
            ampi_id=payload.ampi_id,
            rfc=payload.rfc,
            founded_year=payload.founded_year,
            contact_phone=payload.contact_phone,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))

    inm = result["inmobiliaria"]
    user_id = result["user_id"]
    email = payload.admin_email.strip().lower()

    # Issue cookies (same pattern as /api/auth/register)
    access = create_access_token(user_id, email)
    refresh = create_refresh_token(user_id)
    response.set_cookie("access_token", access, httponly=True, secure=True, samesite="none", max_age=28800)
    response.set_cookie("refresh_token", refresh, httponly=True, secure=True, samesite="none", max_age=2592000)

    # Best-effort activity log
    try:
        from routes_dev_batch14 import log_activity
        await log_activity(
            db, user_id, "inmobiliaria_admin", "create",
            inm["id"], "inmobiliaria",
            metadata={"company_name": inm["name"], "ampi_verified": inm.get("ampi_verified")},
            inmobiliaria_id=inm["id"],
        )
    except Exception:
        pass

    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    return {
        "user": user_doc,
        "inmobiliaria": inm,
        "ampi_result": result.get("ampi_result"),
    }


@router.post("/api/inmobiliaria/ampi-verify")
async def inmobiliaria_ampi_verify(payload: AmpiVerifyIn):
    from services.ampi_verification import validate_ampi_id
    return validate_ampi_id(payload.ampi_id)


# ═══ Authenticated — Me ══════════════════════════════════════════════════════

@router.get("/api/inmobiliaria/me")
async def inmobiliaria_me(request: Request):
    user = await _auth_inm_admin(request)
    db = _db(request)
    inm_id = await _resolve_inmobiliaria_id(user)
    inm = await db.inmobiliarias.find_one({"id": inm_id}, {"_id": 0})
    if not inm:
        raise HTTPException(404, "Inmobiliaria no encontrada")
    # Counters
    advisors_active = await db.inmobiliaria_internal_users.count_documents(
        {"inmobiliaria_id": inm_id, "status": "active"},
    )
    advisors_pending = await db.inmobiliaria_internal_users.count_documents(
        {"inmobiliaria_id": inm_id, "status": "pending"},
    )
    partnerships_active = await db.inmobiliaria_dev_partnerships.count_documents(
        {"inmobiliaria_id": inm_id, "status": "active"},
    )
    partnerships_pending = await db.inmobiliaria_dev_partnerships.count_documents(
        {"inmobiliaria_id": inm_id, "status": "pending"},
    )
    return {
        "inmobiliaria": inm,
        "counters": {
            "advisors_active": advisors_active,
            "advisors_pending": advisors_pending,
            "partnerships_active": partnerships_active,
            "partnerships_pending": partnerships_pending,
        },
    }


# ═══ Authenticated — Advisor invitations ═════════════════════════════════════

@router.post("/api/inmobiliaria/users/invite")
async def inmobiliaria_users_invite(
    payload: InviteAdvisorIn,
    request: Request,
    inmobiliaria_id: Optional[str] = Query(None),
):
    user = await _auth_inm_admin(request)
    db = _db(request)
    inm_id = await _resolve_inmobiliaria_id(user, inmobiliaria_id)

    from services.inmobiliaria_relationships import invite_advisor
    try:
        rel = await invite_advisor(
            db,
            inmobiliaria_id=inm_id,
            invited_email=payload.email,
            invited_name=payload.name,
            invited_role=payload.role,
            invited_by_user_id=user.user_id,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))

    # Best-effort activation email (reuses _send_email from lead_capture)
    try:
        from services.lead_capture import _send_email
        token = rel.get("activation_token", "")
        link = f"/aceptar-invitacion?token={token}"
        html = f"""<!DOCTYPE html><html lang="es"><body style="background:#06080F;font-family:'DM Sans',Arial;padding:32px 20px;max-width:560px;margin:0 auto;">
          <div style="text-align:center;margin-bottom:22px;">
            <div style="display:inline-block;padding:7px 18px;background:linear-gradient(90deg,#6366F1,#EC4899);border-radius:9999px;color:#fff;font-weight:700;font-size:12px;">DesarrollosMX</div>
          </div>
          <h1 style="font-family:Outfit,Arial;font-weight:800;font-size:22px;color:#F0EBE0;margin:0 0 12px;letter-spacing:-0.02em;">Te invitan a unirte</h1>
          <p style="color:rgba(240,235,224,0.65);font-size:14px;line-height:1.6;margin:0 0 22px;">
            Has sido invitado(a) como <strong>{payload.role}</strong> en una inmobiliaria de DesarrollosMX.
          </p>
          <div style="text-align:center;margin:18px 0;">
            <a href="{link}" style="display:inline-block;padding:13px 28px;background:linear-gradient(90deg,#6366F1,#EC4899);border-radius:9999px;color:#fff;font-weight:700;font-size:14px;text-decoration:none;">
              Aceptar invitación
            </a>
          </div>
        </body></html>"""
        await _send_email(payload.email.strip().lower(), "Invitación a DesarrollosMX", html)
    except Exception as ex:
        log.debug(f"[inmobiliaria.invite] email skip: {ex}")

    # Activity log
    try:
        from routes_dev_batch14 import log_activity
        await log_activity(
            db, user.user_id, "inmobiliaria_admin", "invite",
            rel["rel_id"], "inmobiliaria_advisor_relationship",
            metadata={"email": payload.email, "role": payload.role},
            inmobiliaria_id=inm_id,
        )
    except Exception:
        pass

    return rel


@router.get("/api/inmobiliaria/advisor-relationships")
async def inmobiliaria_advisor_relationships(
    request: Request,
    status: Optional[str] = Query(None, pattern="^(pending|active|inactive)$"),
    inmobiliaria_id: Optional[str] = Query(None),
):
    user = await _auth_inm_admin(request)
    db = _db(request)
    inm_id = await _resolve_inmobiliaria_id(user, inmobiliaria_id)
    from services.inmobiliaria_relationships import list_advisor_relationships
    items = await list_advisor_relationships(db, inm_id, status=status)
    return {"items": items, "total": len(items)}


# ═══ Authenticated — Developer partnerships ══════════════════════════════════

@router.post("/api/inmobiliaria/dev-partnerships")
async def inmobiliaria_create_partnership(
    payload: CreatePartnershipIn,
    request: Request,
    inmobiliaria_id: Optional[str] = Query(None),
):
    user = await _auth_inm_admin(request)
    db = _db(request)
    inm_id = await _resolve_inmobiliaria_id(user, inmobiliaria_id)

    from services.inmobiliaria_relationships import create_dev_partnership
    try:
        doc = await create_dev_partnership(
            db,
            inmobiliaria_id=inm_id,
            dev_org_id=payload.dev_org_id,
            dev_org_name=payload.dev_org_name,
            commission_pct=payload.commission_pct,
            notes=payload.notes,
            created_by_user_id=user.user_id,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))

    try:
        from routes_dev_batch14 import log_activity
        await log_activity(
            db, user.user_id, "inmobiliaria_admin", "create",
            doc["partnership_id"], "inmobiliaria_dev_partnership",
            metadata={"dev_org_id": doc["dev_org_id"], "commission_pct": doc.get("commission_pct")},
            inmobiliaria_id=inm_id,
        )
    except Exception:
        pass

    return doc


@router.get("/api/inmobiliaria/dev-partnerships")
async def inmobiliaria_list_partnerships(
    request: Request,
    status: Optional[str] = Query(None, pattern="^(pending|active|paused|terminated)$"),
    inmobiliaria_id: Optional[str] = Query(None),
):
    user = await _auth_inm_admin(request)
    db = _db(request)
    inm_id = await _resolve_inmobiliaria_id(user, inmobiliaria_id)
    from services.inmobiliaria_relationships import list_dev_partnerships
    items = await list_dev_partnerships(db, inm_id, status=status)
    return {"items": items, "total": len(items)}


@router.patch("/api/inmobiliaria/dev-partnerships/{partnership_id}")
async def inmobiliaria_patch_partnership(
    partnership_id: str, payload: PartnershipPatchIn, request: Request,
):
    user = await _auth_inm_admin(request)
    db = _db(request)
    # Authorization: ensure partnership belongs to user's tenant (unless superadmin)
    existing = await db.inmobiliaria_dev_partnerships.find_one(
        {"partnership_id": partnership_id}, {"_id": 0},
    )
    if not existing:
        raise HTTPException(404, "Alianza no encontrada")
    if user.role != "superadmin":
        if existing.get("inmobiliaria_id") != getattr(user, "tenant_id", None):
            raise HTTPException(403, "Sin acceso a esta alianza")

    from services.inmobiliaria_relationships import update_dev_partnership_status
    try:
        after = await update_dev_partnership_status(db, partnership_id, payload.status)
    except ValueError as e:
        raise HTTPException(400, str(e))

    try:
        from routes_dev_batch14 import log_activity
        await log_activity(
            db, user.user_id, "inmobiliaria_admin", "update",
            partnership_id, "inmobiliaria_dev_partnership",
            metadata={"status": payload.status},
            inmobiliaria_id=existing.get("inmobiliaria_id", ""),
        )
    except Exception:
        pass
    return after
