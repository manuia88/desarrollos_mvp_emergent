"""W4.13.A — Lead Journey Routes."""
from __future__ import annotations

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Request, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

import lead_journey_engine as eng

router = APIRouter()


def _db(request: Request):
    return request.app.state.db


async def _current_user(request: Request) -> Optional[Dict[str, Any]]:
    try:
        from server import get_current_user
        u = await get_current_user(request)
        if u:
            return u.model_dump() if hasattr(u, "model_dump") else dict(u)
    except Exception:
        pass
    return None


async def _require_advisor_or_admin(request: Request) -> Dict[str, Any]:
    u = await _current_user(request)
    if not u:
        raise HTTPException(401, "auth_required")
    role = (u.get("role") or "").lower()
    if role not in ("advisor", "asesor", "developer_admin", "broker", "superadmin", "tenant_admin"):
        raise HTTPException(403, "advisor_or_admin_required")
    return u


async def _caller_inmobiliaria(db, user: Dict[str, Any]) -> str:
    """Inmobiliaria del que llama (campo canónico), vía el resolver compartido."""
    from services.lead_bridge import resolve_user_inmobiliaria
    return (await resolve_user_inmobiliaria(db, user.get("user_id"))) or user.get("tenant_id") or ""


async def _check_lead_ownership(db, lead_id: str, user: Dict[str, Any]) -> None:
    """SEGURIDAD (pentest 3ª ola): FAIL-CLOSED. Antes solo comparaba inmobiliaria_id → si el lead NO lo tenía (caso
    común: leads de dev/marketplace), la comprobación PASABA → lectura+escritura cross-tenant. Ahora cubre todos los
    campos de dueño (inmobiliaria_id/org_id/dev_org_id) y la asignación directa al usuario."""
    if (user.get("role") or "").lower() == "superadmin":
        return
    lead = await db.leads.find_one(
        {"id": lead_id},
        {"_id": 0, "inmobiliaria_id": 1, "org_id": 1, "dev_org_id": 1, "owner_id": 1,
         "assigned_to": 1, "assigned_user_id": 1, "assignee_id": 1, "asesor_id": 1})
    if not lead:
        return  # No such lead → 404 deferred to caller
    uid = user.get("user_id")
    # Asignación directa al usuario. FIX auditoría: los leads reales usan 'assignee_id' (42/58) y 'asesor_id',
    # que antes NO se miraban → el candado pasaba por defecto (cross-asesor). Ahora se incluyen.
    if uid and uid in {lead.get("owner_id"), lead.get("assigned_to"), lead.get("assigned_user_id"),
                       lead.get("assignee_id"), lead.get("asesor_id")}:
        return
    user_inm = await _caller_inmobiliaria(db, user)
    mine = {x for x in (user_inm, user.get("tenant_id"), user.get("dev_org_id")) if x}
    owners = {lead.get(k) for k in ("inmobiliaria_id", "org_id", "dev_org_id")}
    owners.discard(None)
    if owners & mine:
        return  # coincide la inmobiliaria/org del lead con la del usuario
    # FIX auditoría: FAIL-CLOSED real. Antes, si el lead no traía dueño ni asignación, PASABA (fail-open).
    # Ahora: sin match positivo (asignación directa o inmobiliaria) → 403. Solo superadmin ve todo.
    raise HTTPException(403, "lead_not_in_your_tenant")


# ─── GET journey ──────────────────────────────────────────────────────────────
@router.get("/api/leads/{lead_id}/journey")
async def get_journey(lead_id: str, request: Request):
    u = await _require_advisor_or_admin(request)
    db = _db(request)
    await _check_lead_ownership(db, lead_id, u)
    steps = await eng.get_journey(db, lead_id)
    return JSONResponse({"ok": True, "lead_id": lead_id, "steps": steps, "count": len(steps)})


# ─── Bulk re-route ────────────────────────────────────────────────────────────
class BulkRerouteIn(BaseModel):
    lead_ids: List[str] = Field(..., min_length=1, max_length=50)


@router.post("/api/lead-journey/bulk-reroute")
async def bulk_reroute(body: BulkRerouteIn, request: Request):
    u = await _require_advisor_or_admin(request)
    db = _db(request)
    # SEGURIDAD (pentest 3ª ola): verifica ownership de CADA lead (antes el engine confiaba solo en inmobiliaria_id →
    # rerouteaba leads cross-tenant). Solo se rerutean los que el usuario realmente posee.
    owned = []
    for lid in body.lead_ids:
        try:
            await _check_lead_ownership(db, lid, u)
            owned.append(lid)
        except HTTPException:
            continue
    if not owned:
        raise HTTPException(403, "Ninguno de los leads es de tu cuenta")
    out = await eng.bulk_re_route(db, owned, u["user_id"], await _caller_inmobiliaria(db, u))
    return JSONResponse({"ok": True, **out})


# ─── Pause nurture ────────────────────────────────────────────────────────────
class PauseNurtureIn(BaseModel):
    until_iso: Optional[str] = None


@router.post("/api/leads/{lead_id}/pause-nurture")
async def pause_nurture(lead_id: str, body: PauseNurtureIn, request: Request):
    u = await _require_advisor_or_admin(request)
    db = _db(request)
    await _check_lead_ownership(db, lead_id, u)
    out = await eng.pause_nurture(db, lead_id, u["user_id"], body.until_iso, u.get("tenant_id"))
    return JSONResponse(out)


# ─── Journey stats ────────────────────────────────────────────────────────────
@router.get("/api/lead-journey/stats")
async def journey_stats(
    request: Request,
    period_days: int = Query(30, ge=1, le=365),
):
    u = await _require_advisor_or_admin(request)
    db = _db(request)
    out = await eng.journey_stats(db, u.get("tenant_id") or "", period_days)
    return JSONResponse({"ok": True, **out})


# ─── Outbound claim ───────────────────────────────────────────────────────────
@router.post("/api/leads/{lead_id}/outbound-claim")
async def outbound_claim(lead_id: str, request: Request):
    u = await _require_advisor_or_admin(request)
    db = _db(request)
    out = await eng.outbound_claim(db, lead_id, u["user_id"], await _caller_inmobiliaria(db, u))
    return JSONResponse(out)


# ─── Available outbound leads (asesor portal) ─────────────────────────────────
@router.get("/api/lead-journey/outbound-available")
async def outbound_available(request: Request, limit: int = Query(100, ge=1, le=500)):
    u = await _require_advisor_or_admin(request)
    db = _db(request)
    leads = await eng.list_outbound_leads(db, await _caller_inmobiliaria(db, u), limit)
    return JSONResponse({"ok": True, "leads": leads, "count": len(leads)})


# ─── F0.2·Sub-B · Leaderboard cohort ─────────────────────────────────────────
@router.get("/api/lead-journey/leaderboard")
async def journey_leaderboard(
    request: Request,
    period_days: int = Query(30, ge=1, le=365),
    cohort: str = Query("asesor"),
    limit: int = Query(5, ge=1, le=20),
):
    u = await _require_advisor_or_admin(request)
    db = _db(request)
    is_super = (u.get("role") or "").lower() == "superadmin"
    tenant_id = (u.get("tenant_id") or "") if not is_super else ""
    rows = await eng.leaderboard_cohort(db, tenant_id=tenant_id, period_days=period_days, limit=limit)
    return JSONResponse({
        "ok": True, "cohort": cohort, "period_days": period_days,
        "scope": "global" if is_super else "tenant",
        "items": rows, "count": len(rows),
    })


# ─── DEV/QA · manual emit (superadmin only) ───────────────────────────────────
class EmitStepIn(BaseModel):
    lead_id: str
    step_type: str
    actor_type: str = "system"
    payload: Optional[Dict[str, Any]] = None


@router.post("/api/lead-journey/emit")
async def emit_step_manual(body: EmitStepIn, request: Request):
    u = await _current_user(request)
    if not u or (u.get("role") or "").lower() != "superadmin":
        raise HTTPException(403, "superadmin_required")
    db = _db(request)
    sid = await eng.emit_step(
        db, lead_id=body.lead_id, tenant_id=u.get("tenant_id"),
        step_type=body.step_type, actor_type=body.actor_type,
        actor_id=u["user_id"], payload=body.payload or {},
    )
    return JSONResponse({"ok": True, "step_id": sid})

# W5.FF4 register_feature marker · NO duplicate
from feature_registry import register_feature as _w5ff4_register_feature
_w5ff4_register_feature("lead_journey", plan_tier="pro",        monthly_price_mxn=149, category="growth",      name="Lead Journey")
