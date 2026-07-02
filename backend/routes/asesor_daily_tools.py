"""Phase 4 Batch 33 · routes — Asesor Daily Tools.

Endpoints:
  Sub-A Calendar bidi:
    POST   /api/asesor/calendar/webhook/subscribe   (auth)
    DELETE /api/asesor/calendar/webhook/subscribe   (auth)
    POST   /api/asesor/calendar/webhook/callback    (público, llamado por Google)
    GET    /api/asesor/calendar/sync-status         (auth)
    POST   /api/asesor/calendar/sync-now            (auth, force polling)

  Sub-B Visit briefing:
    POST   /api/asesor/visit-briefing/generate      (auth)
    GET    /api/asesor/visit-briefing/{appt_id}     (auth)
    POST   /api/asesor/visit-briefing/{id}/viewed   (auth)

  Sub-C Client insights:
    GET    /api/asesor/lead/{lead_id}/insights      (auth)
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, Query, Header
from pydantic import BaseModel, Field

log = logging.getLogger("dmx.routes_asesor_daily_tools")

router = APIRouter(tags=["asesor-daily-tools"])

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


# ═══ Models ══════════════════════════════════════════════════════════════════

class GenerateBriefingBody(BaseModel):
    appointment_id: str = Field(..., min_length=4, max_length=120)
    force: bool = False


# ═══ Sub-A: Calendar Bidirectional ═══════════════════════════════════════════

@router.post("/api/asesor/calendar/webhook/subscribe")
async def subscribe_webhook(request: Request):
    user = await _auth_asesor(request)
    db = _db(request)
    from services.calendar_bidirectional import subscribe_webhooks
    return await subscribe_webhooks(db, user.user_id)


@router.delete("/api/asesor/calendar/webhook/subscribe")
async def unsubscribe_webhook(request: Request):
    user = await _auth_asesor(request)
    db = _db(request)
    from services.calendar_bidirectional import unsubscribe_webhooks
    deleted = await unsubscribe_webhooks(db, user.user_id)
    return {"deleted": deleted}


@router.post("/api/asesor/calendar/webhook/callback")
async def webhook_callback(
    request: Request,
    x_goog_channel_id: Optional[str] = Header(None),
    x_goog_resource_id: Optional[str] = Header(None),
    x_goog_resource_state: Optional[str] = Header("exists"),
):
    """Endpoint público llamado por Google con headers X-Goog-*."""
    db = _db(request)
    if not x_goog_channel_id:
        raise HTTPException(400, "Missing X-Goog-Channel-ID")
    from services.calendar_bidirectional import handle_webhook_callback
    return await handle_webhook_callback(
        db,
        channel_id=x_goog_channel_id,
        resource_id=x_goog_resource_id or "",
        resource_state=x_goog_resource_state or "exists",
    )


@router.get("/api/asesor/calendar/sync-status")
async def calendar_sync_status(request: Request):
    user = await _auth_asesor(request)
    db = _db(request)
    from services.calendar_bidirectional import get_sync_status
    return await get_sync_status(db, user.user_id)


@router.post("/api/asesor/calendar/sync-now")
async def calendar_sync_now(request: Request):
    user = await _auth_asesor(request)
    db = _db(request)
    from services.calendar_bidirectional import _pull_events_google
    n = await _pull_events_google(db, user.user_id, since_minutes=60 * 24 * 7)
    return {"synced": n}


# ═══ Sub-B: Visit Briefing ═══════════════════════════════════════════════════

async def _assert_appointment_owner(db, user, appointment_id: str) -> None:
    """[AUD-038] La cita (y su lead) deben ser del tenant del caller. Antes: el briefing se generaba
    para CUALQUIER appointment_id y el bypass por rol admin no comparaba tenant → un admin del tenant A
    obtenía el briefing (PII del lead) de una cita del tenant B. superadmin = god-view."""
    from tenant_scope import is_superadmin, tenant_of, actor_id, assert_lead_owner, _demo_mode
    if is_superadmin(user):
        return
    apt = await db.appointments.find_one(
        {"$or": [{"appointment_id": appointment_id}, {"id": appointment_id}]},
        {"_id": 0, "dev_org_id": 1, "asesor_id": 1, "inmobiliaria_id": 1, "tenant_id": 1, "lead_id": 1})
    if not apt:
        raise HTTPException(404, "Cita no encontrada")
    owners = {apt.get(k) for k in ("dev_org_id", "asesor_id", "inmobiliaria_id", "tenant_id")}
    owners.discard(None)
    if tenant_of(user) in owners or actor_id(user) in owners:
        return
    if apt.get("lead_id"):
        await assert_lead_owner(db, user, apt["lead_id"])
        return
    if _demo_mode():
        return
    raise HTTPException(403, "Esta cita es de otra cuenta")


@router.post("/api/asesor/visit-briefing/generate")
async def visit_briefing_generate(
    body: GenerateBriefingBody, request: Request,
):
    user = await _auth_asesor(request)
    db = _db(request)
    await _assert_appointment_owner(db, user, body.appointment_id)  # [AUD-038] dueño-o-403 ANTES de generar
    from services.visit_auto_prep import generate_visit_briefing
    try:
        doc = await generate_visit_briefing(
            db, body.appointment_id, force=body.force,
        )
    except ValueError as e:
        raise HTTPException(404, str(e))

    # Verificar pertenencia (sin fail-open: si falta asesor_id, igual se exige rol admin)
    if doc.get("asesor_id") != user.user_id:
        if user.role not in ("superadmin", "asesor_admin", "developer_admin",
                             "developer_director", "inmobiliaria_admin"):
            raise HTTPException(403, "Briefing pertenece a otro asesor")
    return doc


@router.get("/api/asesor/visit-briefing/{appointment_id}")
async def visit_briefing_get(appointment_id: str, request: Request):
    user = await _auth_asesor(request)
    db = _db(request)
    await _assert_appointment_owner(db, user, appointment_id)  # [AUD-038] dueño-o-403 (cross-tenant)
    from services.visit_auto_prep import get_briefing
    doc = await get_briefing(db, appointment_id)
    if not doc:
        raise HTTPException(404, "Briefing no encontrado")
    if doc.get("asesor_id") != user.user_id:
        if user.role not in ("superadmin", "asesor_admin", "developer_admin",
                             "developer_director", "inmobiliaria_admin"):
            raise HTTPException(403, "Briefing pertenece a otro asesor")
    return doc


@router.post("/api/asesor/visit-briefing/{briefing_id}/viewed")
async def visit_briefing_mark_viewed(briefing_id: str, request: Request):
    user = await _auth_asesor(request)
    db = _db(request)
    from services.visit_auto_prep import mark_briefing_viewed
    marked = await mark_briefing_viewed(db, briefing_id, user.user_id)
    return {"marked": marked}


# ═══ Sub-C: Client Insights ══════════════════════════════════════════════════

@router.get("/api/asesor/lead/{lead_id}/insights")
async def lead_insights(
    lead_id: str, request: Request,
    force: bool = Query(False),
):
    user = await _auth_asesor(request)
    db = _db(request)
    # Seguridad (IDOR): compute_client_insights NO filtra por asesor → verificamos
    # aquí que el lead pertenezca a este asesor antes de exponer PII/conducta.
    if user.role not in ("superadmin", "asesor_admin", "developer_admin",
                         "developer_director", "inmobiliaria_admin"):
        owned = await db.leads.find_one(
            {"id": lead_id, "$or": [{"assigned_to": user.user_id}, {"asesor_id": user.user_id}]},
            {"_id": 1})
        if not owned:
            owned = await db.asesor_contactos.find_one(
                {"$or": [{"id": lead_id}, {"source_lead_id": lead_id}], "owner_id": user.user_id},
                {"_id": 1})
        if not owned:
            raise HTTPException(404, "Lead no encontrado")
    from services.client_insights import compute_client_insights
    return await compute_client_insights(
        db, lead_id, asesor_id=user.user_id, force=force,
    )
