"""Phase 4 Batch 32 · routes — Asesor Identity (Endorsements + LinkedIn + DISC + Trust).

Endpoints públicos (sin auth):
  POST   /api/public/endorsements                    → cliente deja reseña
  GET    /api/public/endorsements/confirm/{token}    → confirma + redirect
  GET    /api/public/asesor/{id}/endorsements        → lista pública verificadas
  GET    /api/public/asesor/{id}/profile             → perfil público completo
  GET    /api/public/asesor/{id}/trust-score         → score público

Endpoints asesor (auth):
  POST   /api/asesor/linkedin/import                 → importa profile manual
  GET    /api/asesor/linkedin/me                     → mi profile LinkedIn
  DELETE /api/asesor/linkedin                        → revoke
  POST   /api/asesor/disc/submit                     → submit answers
  GET    /api/asesor/disc/me                         → my DISC profile
  DELETE /api/asesor/disc/me                         → delete
  GET    /api/asesor/trust-score/me                  → my trust score breakdown
  DELETE /api/asesor/endorsements/{id}               → asesor borra spam propio
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field, EmailStr

log = logging.getLogger("dmx.routes_asesor_identity")

router = APIRouter(tags=["asesor-identity"])

ASESOR_ROLES = {"advisor", "asesor_admin", "developer_admin",
                "developer_director", "developer_member",
                "inmobiliaria_admin", "superadmin"}


def _db(req: Request):
    return req.app.state.db


async def _auth_asesor(request: Request):
    from server import get_current_user
    u = await get_current_user(request)
    if not u:
        raise HTTPException(401, "No autenticado")
    if u.role not in ASESOR_ROLES:
        raise HTTPException(403, "Acceso solo para asesores y administradores")
    return u


def _client_ip(request: Request) -> str:
    h = request.headers
    return h.get("x-forwarded-for", "").split(",")[0].strip() or (
        request.client.host if request.client else ""
    )


# ═══ Pydantic models ═════════════════════════════════════════════════════════

class EndorsementCreate(BaseModel):
    asesor_id: str = Field(..., min_length=4, max_length=120)
    client_email: EmailStr
    client_name: str = Field(..., min_length=2, max_length=120)
    rating: int = Field(..., ge=1, le=5)
    text: str = Field(..., min_length=8, max_length=1200)
    project_id: Optional[str] = None


class LinkedInImportBody(BaseModel):
    linkedin_url: str = Field(..., min_length=12, max_length=300)
    profile_data: Optional[Dict[str, Any]] = None


class DiscAnswer(BaseModel):
    q_id: str
    value: str = Field(..., pattern="^[abcd]$")


class DiscSubmitBody(BaseModel):
    answers: List[DiscAnswer]


# ═══ ENDORSEMENTS — public ═══════════════════════════════════════════════════

@router.post("/api/public/endorsements")
async def post_endorsement(body: EndorsementCreate, request: Request):
    db = _db(request)
    from services.endorsements import create_endorsement

    try:
        doc = await create_endorsement(
            db,
            asesor_id=body.asesor_id,
            client_email=body.client_email,
            client_name=body.client_name,
            rating=body.rating,
            text=body.text,
            project_id=body.project_id,
            ip=_client_ip(request),
        )
    except PermissionError as e:
        raise HTTPException(429, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))

    # Sin retornar token de confirmación al público
    doc.pop("confirmation_token", None)
    return {"created": True, "endorsement_id": doc["endorsement_id"]}


@router.get("/api/public/endorsements/confirm/{token}")
async def confirm_endorsement_route(token: str, request: Request):
    db = _db(request)
    from services.endorsements import confirm_endorsement
    doc = await confirm_endorsement(db, token)
    if not doc:
        raise HTTPException(404, "Token no válido o expirado")

    asesor_id = doc.get("asesor_id", "")
    redirect_to = f"/asesor-publico/{asesor_id}?confirmed=true"
    return RedirectResponse(url=redirect_to, status_code=302)


@router.get("/api/public/asesor/{asesor_id}/endorsements")
async def get_public_endorsements(
    asesor_id: str, request: Request, limit: int = Query(50, ge=1, le=100),
):
    db = _db(request)
    from services.endorsements import get_asesor_endorsements
    return await get_asesor_endorsements(
        db, asesor_id, only_verified=True, limit=limit,
    )


# ═══ PUBLIC PROFILE (compose) ════════════════════════════════════════════════

@router.get("/api/public/asesor/{asesor_id}/profile")
async def get_public_profile(asesor_id: str, request: Request):
    db = _db(request)

    # Asesor base
    asesor = await db.users.find_one(
        {"user_id": asesor_id, "role": {"$in": ["advisor", "asesor_admin"]}},
        {"_id": 0, "user_id": 1, "name": 1, "email": 1,
         "avatar_url": 1, "phone": 1, "tenant_id": 1},
    )
    if not asesor:
        raise HTTPException(404, "Asesor no encontrado")

    # LinkedIn
    from services.linkedin_import import get_profile as get_li
    linkedin = await get_li(db, asesor_id)

    # Endorsements
    from services.endorsements import get_asesor_endorsements
    endorsements = await get_asesor_endorsements(db, asesor_id, only_verified=True, limit=20)

    # Trust score
    from services.trust_score import compute_trust_score
    trust = await compute_trust_score(db, asesor_id)

    # DISC (public muestra solo primary letter, no answers)
    from services.disc_test import get_disc_profile
    disc_full = await get_disc_profile(db, asesor_id)
    disc_public = None
    if disc_full and disc_full.get("result"):
        disc_public = {
            "primary": disc_full["result"].get("primary"),
            "narrative_text": disc_full.get("narrative_text", ""),
        }

    # Proyectos asignados (deals cerrados)
    WON = ["won", "ganado", "cerrado_ganado", "closed_won"]
    deals_cur = db.leads.find(
        {"$and": [
            {"$or": [{"assigned_to": asesor_id}, {"asesor_id": asesor_id}]},
            {"$or": [
                {"status": {"$in": WON}},
                {"lead_stage": {"$in": WON}},
            ]},
        ]},
        {"_id": 0, "project_id": 1, "development_id": 1},
    ).limit(50)
    deal_project_ids = set()
    async for d in deals_cur:
        pid = d.get("project_id") or d.get("development_id")
        if pid:
            deal_project_ids.add(pid)

    projects: List[Dict[str, Any]] = []
    if deal_project_ids:
        cur = db.developments.find(
            {"id": {"$in": list(deal_project_ids)}},
            {"_id": 0, "id": 1, "name": 1, "colonia": 1, "ciudad": 1,
             "cover_photo": 1, "price_from": 1},
        ).limit(20)
        async for p in cur:
            projects.append(p)

    return {
        "asesor": {
            "user_id": asesor["user_id"],
            "name": asesor.get("name") or asesor.get("email") or "Asesor",
            "avatar_url": asesor.get("avatar_url", ""),
            "phone": asesor.get("phone", ""),
        },
        "linkedin": linkedin,
        "endorsements": endorsements,
        "trust_score": {
            "score": trust["score"],
            "components": trust["components"],
        },
        "disc": disc_public,
        "projects": projects,
    }


@router.get("/api/public/asesor/{asesor_id}/trust-score")
async def get_public_trust(asesor_id: str, request: Request):
    db = _db(request)
    from services.trust_score import compute_trust_score
    t = await compute_trust_score(db, asesor_id)
    return {"asesor_id": asesor_id, "score": t["score"]}


# ═══ LinkedIn — auth asesor ══════════════════════════════════════════════════

@router.post("/api/asesor/linkedin/import")
async def linkedin_import_route(body: LinkedInImportBody, request: Request):
    user = await _auth_asesor(request)
    db = _db(request)
    from services.linkedin_import import import_from_url
    try:
        return await import_from_url(
            db, user.user_id, body.linkedin_url, body.profile_data,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/api/asesor/linkedin/me")
async def linkedin_me(request: Request):
    user = await _auth_asesor(request)
    db = _db(request)
    from services.linkedin_import import get_profile
    doc = await get_profile(db, user.user_id)
    if not doc:
        return {"profile": None}
    return {"profile": doc}


@router.delete("/api/asesor/linkedin")
async def linkedin_revoke(request: Request):
    user = await _auth_asesor(request)
    db = _db(request)
    from services.linkedin_import import revoke_profile
    deleted = await revoke_profile(db, user.user_id)
    return {"deleted": deleted}


# ═══ DISC — auth asesor ══════════════════════════════════════════════════════

@router.post("/api/asesor/disc/submit")
async def disc_submit(body: DiscSubmitBody, request: Request):
    user = await _auth_asesor(request)
    db = _db(request)
    from services.disc_test import submit_disc
    try:
        return await submit_disc(
            db, user.user_id,
            [{"q_id": a.q_id, "value": a.value} for a in body.answers],
        )
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/api/asesor/disc/me")
async def disc_me(request: Request):
    user = await _auth_asesor(request)
    db = _db(request)
    from services.disc_test import get_disc_profile
    doc = await get_disc_profile(db, user.user_id)
    if not doc:
        return {"profile": None}
    return {"profile": doc}


@router.delete("/api/asesor/disc/me")
async def disc_delete(request: Request):
    user = await _auth_asesor(request)
    db = _db(request)
    from services.disc_test import delete_disc_profile
    deleted = await delete_disc_profile(db, user.user_id)
    return {"deleted": deleted}


# ═══ Trust Score — auth asesor (breakdown) ═══════════════════════════════════

@router.get("/api/asesor/trust-score/me")
async def my_trust_score(
    request: Request, force: bool = Query(False),
):
    user = await _auth_asesor(request)
    db = _db(request)
    from services.trust_score import compute_trust_score
    return await compute_trust_score(db, user.user_id, force_refresh=force)


# ═══ Endorsement management — asesor ═════════════════════════════════════════

@router.delete("/api/asesor/endorsements/{endorsement_id}")
async def delete_my_endorsement(endorsement_id: str, request: Request):
    user = await _auth_asesor(request)
    db = _db(request)
    from services.endorsements import delete_endorsement
    deleted = await delete_endorsement(db, endorsement_id, user.user_id)
    if not deleted:
        raise HTTPException(404, "Reseña no encontrada")
    return {"deleted": True}


@router.get("/api/asesor/endorsements/me")
async def my_endorsements(
    request: Request,
    only_verified: bool = Query(False),
    limit: int = Query(50, ge=1, le=200),
):
    user = await _auth_asesor(request)
    db = _db(request)
    from services.endorsements import get_asesor_endorsements
    return await get_asesor_endorsements(
        db, user.user_id, only_verified=only_verified, limit=limit,
    )
