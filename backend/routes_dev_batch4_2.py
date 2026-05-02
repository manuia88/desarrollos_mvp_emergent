"""Phase 4 Batch 4.2 — Universal LeadKanban + client_id cross-project + Permission Tiers.

Sub-chunks:
  4.29  Universal LeadKanban  — GET /api/leads/kanban (unified, scope-aware)
  4.30  Global client_id      — GET /api/clients/:gid/leads (cross-project visibility)
  4.31  Permission Tiers      — helpers + matrix applied to all lead endpoints
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request, Query
from pydantic import BaseModel

log = logging.getLogger("dmx.batch4_2")
router = APIRouter(tags=["batch4.2"])

# ─────────────────────────────────────────────────────────────────────────────
# Constants (shared with batch4)
# ─────────────────────────────────────────────────────────────────────────────
KANBAN_COLUMNS = [
    {"key": "nuevo",            "label": "Nuevo",           "statuses": ["nuevo", "under_review"]},
    {"key": "en_contacto",      "label": "En contacto",     "statuses": ["contactado", "visita_agendada"]},
    {"key": "visita_realizada", "label": "Visita realizada","statuses": ["visita_realizada"]},
    {"key": "propuesta",        "label": "Propuesta",       "statuses": ["propuesta"]},
    {"key": "cerrado",          "label": "Cerrado",         "statuses": ["cerrado_ganado", "cerrado_perdido"]},
]
COLUMN_BY_STATUS = {s: col["key"] for col in KANBAN_COLUMNS for s in col["statuses"]}
LEAD_STATUSES = [
    "nuevo", "under_review", "contactado", "visita_agendada",
    "visita_realizada", "propuesta", "cerrado_ganado", "cerrado_perdido",
]


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────
def _now() -> datetime:
    return datetime.now(timezone.utc)


def _db(request: Request):
    return request.app.state.db


async def _auth(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    return user


async def _safe_audit_ml(
    db, user, *, action: str, entity_type: str, entity_id: str,
    before: Optional[Dict], after: Optional[Dict], request: Request,
    ml_event: Optional[str] = None, ml_context: Optional[Dict] = None,
) -> None:
    try:
        from audit_log import log_mutation
        await log_mutation(db, user, action, entity_type, entity_id, before, after, request=request)
    except Exception:
        pass
    if ml_event:
        try:
            from observability import emit_ml_event
            uid = getattr(user, "user_id", "anon")
            role = getattr(user, "role", "anon")
            org = getattr(user, "tenant_id", None) or "default"
            await emit_ml_event(
                db, event_type=ml_event, user_id=uid, org_id=org, role=role,
                context=ml_context or {}, ai_decision={}, user_action={},
            )
        except Exception:
            pass


# ─────────────────────────────────────────────────────────────────────────────
# SUB-CHUNK C · 4.31  Permission Tiers + Matrix
# ─────────────────────────────────────────────────────────────────────────────
def get_user_permission_level(user) -> str:
    """Canonical permission level for a user."""
    role = getattr(user, "role", "public")
    if role == "superadmin":
        return "superadmin"
    # Developer portal
    tenant = getattr(user, "tenant_id", None)
    if tenant and role in ("developer_admin",):
        return "developer_director"
    if tenant and role == "developer_member":
        internal = getattr(user, "internal_role", None)
        if internal in ("commercial_director", "admin"):
            return "developer_director"
        return "developer_member"
    # Inmobiliaria portal
    inm_id = getattr(user, "inmobiliaria_id", None)
    if inm_id:
        internal = getattr(user, "internal_role", None) or role
        if internal in ("admin", "director", "developer_admin"):
            return "inmobiliaria_director"
        if internal in ("asesor", "developer_member", "advisor"):
            return "inmobiliaria_member"
        return "inmobiliaria_other"
    # Advisor / freelance
    if role in ("advisor", "asesor_admin"):
        return "asesor_freelance"
    return "public"


def can_view_kanban(user, scope: str, target_org_id: str = "") -> bool:
    lvl = get_user_permission_level(user)
    uid = getattr(user, "user_id", "")
    if lvl == "superadmin":
        return True
    if scope == "mine":
        return lvl in (
            "asesor_freelance", "inmobiliaria_member", "inmobiliaria_director",
            "developer_member", "developer_director",
        )
    if scope == "all_org":
        return lvl == "developer_director" and (
            not target_org_id or getattr(user, "tenant_id", "") == target_org_id
        )
    if scope == "all_inmobiliaria":
        return lvl == "inmobiliaria_director" and (
            not target_org_id or getattr(user, "inmobiliaria_id", "") == target_org_id
        )
    return False


def can_move_lead(user, lead: Dict) -> bool:
    lvl = get_user_permission_level(user)
    uid = getattr(user, "user_id", "")
    if lvl == "superadmin":
        return True
    # Owner check
    if lead.get("assigned_to") == uid or lead.get("created_by") == uid:
        return True
    # Developer director: can move dev_direct/dev_inhouse (NOT broker_external)
    if lvl == "developer_director":
        if lead.get("dev_org_id") == getattr(user, "tenant_id", ""):
            origin_type = (lead.get("origin") or {}).get("type", "")
            return origin_type in ("dev_direct", "dev_inhouse", "")
    # Inmobiliaria director: can move all inmobiliaria leads
    if lvl == "inmobiliaria_director":
        if lead.get("inmobiliaria_id") == getattr(user, "inmobiliaria_id", ""):
            return True
    return False


def can_view_full_client_data(user, lead: Dict) -> bool:
    lvl = get_user_permission_level(user)
    uid = getattr(user, "user_id", "")
    if lvl == "superadmin":
        return True
    if lead.get("assigned_to") == uid or lead.get("created_by") == uid:
        return True
    # Dev director sees client data for their own org's leads
    if lvl == "developer_director" and lead.get("dev_org_id") == getattr(user, "tenant_id", ""):
        return True
    # Inmobiliaria director sees client data for their inmobiliaria
    if lvl == "inmobiliaria_director" and lead.get("inmobiliaria_id") == getattr(user, "inmobiliaria_id", ""):
        return True
    return False


def can_view_conversation(user, lead: Dict) -> bool:
    lvl = get_user_permission_level(user)
    uid = getattr(user, "user_id", "")
    if lvl == "superadmin":
        return True
    if lead.get("assigned_to") == uid or lead.get("created_by") == uid:
        return True
    # Inmobiliaria director can see conversation of their asesores
    if lvl == "inmobiliaria_director" and lead.get("inmobiliaria_id") == getattr(user, "inmobiliaria_id", ""):
        return True
    # Developer director does NOT see conversation of broker_external leads (per spec)
    return False


def can_view_ai_summary(user, lead: Dict) -> bool:
    """Dev director can see AI summary even for broker_external (coaching)."""
    if can_view_full_client_data(user, lead):
        return True
    lvl = get_user_permission_level(user)
    if lvl == "developer_director" and lead.get("dev_org_id") == getattr(user, "tenant_id", ""):
        return True
    return False


def _scrub_lead(lead: Dict) -> Dict:
    """Return lead with contact info stripped (privacy protection)."""
    scrubbed = {k: v for k, v in lead.items() if k not in ("contact", "notes")}
    asesor_name = lead.get("assigned_to_name") or "Asesor"
    scrubbed["contact"] = {"name": f"Cliente de {asesor_name}", "email": None, "phone": None}
    scrubbed["notes"] = []
    scrubbed["_scrubbed"] = True
    return scrubbed


def _build_card(lead: Dict, name_by_id: Dict[str, str], now: datetime,
                can_move: bool, can_full: bool, cross_count: int = 0) -> Dict:
    """Build a kanban card dict from a lead document."""
    try:
        ts = datetime.fromisoformat(lead.get("last_activity_at") or lead.get("created_at"))
        days_in_status = max(0, (now - ts.astimezone(timezone.utc)).days)
    except Exception:
        days_in_status = None
    # Activity color: green<3, yellow 3-7, red >7
    activity_color = (
        "green" if days_in_status is not None and days_in_status < 3 else
        "yellow" if days_in_status is not None and days_in_status < 7 else
        "red"
    )
    assigned_id = lead.get("assigned_to")
    origin = lead.get("origin") or {}
    origin_type = origin.get("type", "")
    if can_full:
        contact_name = lead.get("contact", {}).get("name", "—")
        contact_email = lead.get("contact", {}).get("email")
        contact_phone = lead.get("contact", {}).get("phone")
    else:
        asesor_name = name_by_id.get(assigned_id, "Asesor")
        contact_name = f"Cliente de {asesor_name}"
        contact_email = None
        contact_phone = None
    return {
        "id": lead["id"],
        "status": lead.get("status", "nuevo"),
        "project_id": lead.get("project_id"),
        "source": lead.get("source"),
        "origin_type": origin_type,
        "origin_inmobiliaria_id": origin.get("inmobiliaria_id"),
        "contact_name": contact_name,
        "contact_email": contact_email,
        "contact_phone": contact_phone,
        "assigned_to": assigned_id,
        "assigned_to_name": name_by_id.get(assigned_id),
        "budget_range": lead.get("budget_range"),
        "last_activity_at": lead.get("last_activity_at"),
        "days_in_status": days_in_status,
        "activity_color": activity_color,
        "lost_reason": lead.get("lost_reason"),
        "intent": lead.get("intent"),
        "client_global_id": lead.get("client_global_id"),
        "cross_project_count": cross_count,
        "can_move": can_move,
        "can_view_full": can_full,
        "velocity_flag": lead.get("velocity_flag", False),
        "geo_metadata": lead.get("geo_metadata"),
    }


# ─────────────────────────────────────────────────────────────────────────────
# SUB-CHUNK A · 4.29  GET /api/leads/kanban (unified)
# ─────────────────────────────────────────────────────────────────────────────
async def _run_kanban(
    request: Request,
    *,
    scope: str = "mine",
    project_id: Optional[str] = None,
    source: Optional[str] = None,
    asesor_id: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    q_search: Optional[str] = None,
):
    user = await _auth(request)
    db = _db(request)
    lvl = get_user_permission_level(user)
    uid = getattr(user, "user_id", "")
    dev_org = getattr(user, "tenant_id", None)
    inm_id = getattr(user, "inmobiliaria_id", None)

    # Permission gate
    target_org = dev_org if scope == "all_org" else (inm_id if scope == "all_inmobiliaria" else "")
    if not can_view_kanban(user, scope, target_org):
        raise HTTPException(403, f"Scope '{scope}' no permitido para tu rol ({lvl})")

    # Build query
    q: Dict[str, Any] = {}
    if scope == "mine":
        q["$or"] = [{"assigned_to": uid}, {"created_by": uid}]
    elif scope == "all_org":
        if dev_org:
            q["dev_org_id"] = dev_org
        elif lvl != "superadmin":
            raise HTTPException(400, "Sin dev_org asociado")
    elif scope == "all_inmobiliaria":
        if inm_id:
            q["inmobiliaria_id"] = inm_id
        elif lvl != "superadmin":
            raise HTTPException(400, "Sin inmobiliaria asociada")
    # Superadmin sees all
    # Additional filters
    if project_id:
        q["project_id"] = project_id
    if source:
        q["source"] = source
    if asesor_id and lvl in ("developer_director", "inmobiliaria_director", "superadmin"):
        q["assigned_to"] = asesor_id
    if from_date or to_date:
        q["created_at"] = {}
        if from_date:
            q["created_at"]["$gte"] = from_date
        if to_date:
            q["created_at"]["$lte"] = to_date

    items = await db.leads.find(q, {"_id": 0}).sort("last_activity_at", -1).limit(1000).to_list(1000)

    # Filter by search
    if q_search:
        term = q_search.lower()
        items = [l for l in items if term in (l.get("contact", {}).get("name", "") or "").lower()]

    # Resolve assignee names
    ids = list({x.get("assigned_to") for x in items if x.get("assigned_to")})
    name_by_id: Dict[str, str] = {}
    if ids:
        async for u in db.users.find({"user_id": {"$in": ids}}, {"_id": 0, "user_id": 1, "name": 1, "email": 1}):
            name_by_id[u["user_id"]] = u.get("name") or u.get("email", "—")

    # Cross-project counts (B4.30)
    gids = list({l["client_global_id"] for l in items if l.get("client_global_id")})
    cross_counts: Dict[str, int] = {}
    if gids:
        for l in items:
            gid = l.get("client_global_id")
            if gid and gid not in cross_counts:
                other_count = await db.leads.count_documents({
                    "client_global_id": gid,
                    "id": {"$ne": l["id"]},
                    "status": {"$nin": ["cerrado_ganado", "cerrado_perdido"]},
                })
                cross_counts[gid] = other_count

    now = _now()
    cols: Dict[str, List] = {c["key"]: [] for c in KANBAN_COLUMNS}
    total_counts: Dict[str, int] = {c["key"]: 0 for c in KANBAN_COLUMNS}
    sum_budgets: Dict[str, float] = {c["key"]: 0.0 for c in KANBAN_COLUMNS}

    for lead in items:
        col_key = COLUMN_BY_STATUS.get(lead.get("status", "nuevo"))
        if not col_key:
            col_key = "nuevo"
        can_m = can_move_lead(user, lead)
        can_f = can_view_full_client_data(user, lead)
        gid = lead.get("client_global_id", "")
        cross = cross_counts.get(gid, 0)
        card = _build_card(lead, name_by_id, now, can_m, can_f, cross)
        cols[col_key].append(card)
        total_counts[col_key] += 1
        bmax = (lead.get("budget_range") or {}).get("max") or 0
        sum_budgets[col_key] = sum_budgets.get(col_key, 0) + bmax

    columns_out = []
    for c in KANBAN_COLUMNS:
        columns_out.append({
            "key": c["key"],
            "label": c["label"],
            "count": total_counts[c["key"]],
            "total_budget_max": sum_budgets[c["key"]],
            "cards": cols[c["key"]],
        })

    return {
        "columns": columns_out,
        "total": len(items),
        "scope": scope,
        "project_id": project_id,
    }


@router.get("/api/leads/kanban")
async def unified_kanban(
    request: Request,
    scope: str = Query("mine"),
    project_id: Optional[str] = None,
    source: Optional[str] = None,
    asesor_id: Optional[str] = None,
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    q_search: Optional[str] = Query(None, alias="q"),
):
    return await _run_kanban(
        request, scope=scope, project_id=project_id, source=source,
        asesor_id=asesor_id, from_date=from_date, to_date=to_date, q_search=q_search,
    )


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/leads/:id/move-column  (permission-aware, replaces batch4 version)
# ─────────────────────────────────────────────────────────────────────────────
class MovePayload(BaseModel):
    target_status: str


@router.post("/api/leads/{lead_id}/move-column")
async def move_lead_column_v2(lead_id: str, payload: MovePayload, request: Request):
    user = await _auth(request)
    db = _db(request)
    if payload.target_status not in LEAD_STATUSES:
        raise HTTPException(400, f"status inválido: {payload.target_status}")

    lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "Lead no encontrado")

    # Permission check
    if not can_move_lead(user, lead):
        lvl = get_user_permission_level(user)
        origin_type = (lead.get("origin") or {}).get("type", "")
        if origin_type == "broker_external":
            detail = "Solo el asesor puede mover este lead (origen externo)"
        else:
            detail = f"Sin permisos para mover este lead ({lvl})"
        # Log denied attempt
        await _safe_audit_ml(
            db, user, action="denied", entity_type="lead_move_attempt", entity_id=lead_id,
            before={"status": lead.get("status")}, after={"target_status": payload.target_status},
            request=request,
            ml_event="permission_denied_attempt",
            ml_context={"lead_id": lead_id, "level": lvl, "origin_type": origin_type},
        )
        raise HTTPException(403, detail)

    if payload.target_status == "cerrado_perdido" and not lead.get("lost_reason"):
        raise HTTPException(422, "Para mover a cerrado_perdido actualiza primero el lost_reason")

    try:
        prev_ts = datetime.fromisoformat(lead.get("last_activity_at") or lead.get("created_at"))
        days_in_prev = max(0, (_now() - prev_ts).days)
    except Exception:
        days_in_prev = None

    now_iso = _now().isoformat()
    await db.leads.update_one(
        {"id": lead_id},
        {"$set": {"status": payload.target_status, "updated_at": now_iso, "last_activity_at": now_iso}},
    )
    lvl = get_user_permission_level(user)
    await _safe_audit_ml(
        db, user, action="update", entity_type="lead_kanban_move", entity_id=lead_id,
        before={"status": lead.get("status")}, after={"status": payload.target_status},
        request=request,
        ml_event="lead_kanban_move",
        ml_context={
            "lead_id": lead_id,
            "from_status": lead.get("status"),
            "to_status": payload.target_status,
            "days_in_prev": days_in_prev,
            "permission_level": lvl,
        },
    )
    updated = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    return {"ok": True, "lead_id": lead_id, "new_status": payload.target_status, "days_in_prev": days_in_prev, "lead": updated}


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/leads/:id  (permission-aware)
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/api/leads/{lead_id}")
async def get_lead_detail(lead_id: str, request: Request):
    user = await _auth(request)
    db = _db(request)
    uid = getattr(user, "user_id", "")
    lvl = get_user_permission_level(user)

    lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "Lead no encontrado")

    # Access check
    can_see = (
        lead.get("assigned_to") == uid
        or lead.get("created_by") == uid
        or lvl == "superadmin"
        or (lvl == "developer_director" and lead.get("dev_org_id") == getattr(user, "tenant_id", ""))
        or (lvl == "inmobiliaria_director" and lead.get("inmobiliaria_id") == getattr(user, "inmobiliaria_id", ""))
        or (lvl == "developer_member" and lead.get("dev_org_id") == getattr(user, "tenant_id", ""))
    )
    if not can_see:
        await _safe_audit_ml(
            db, user, action="denied", entity_type="lead_view_attempt", entity_id=lead_id,
            before=None, after=None, request=request,
            ml_event="permission_denied_attempt",
            ml_context={"lead_id": lead_id, "level": lvl},
        )
        raise HTTPException(403, "Sin acceso a este lead")

    can_full = can_view_full_client_data(user, lead)
    can_conv = can_view_conversation(user, lead)
    can_ai = can_view_ai_summary(user, lead)

    # Audit read access
    await _safe_audit_ml(
        db, user, action="read", entity_type="lead_view", entity_id=lead_id,
        before=None, after=None, request=request,
        ml_event=None,
    )

    result = dict(lead)
    if not can_full:
        result = _scrub_lead(result)

    if not can_conv:
        result.pop("notes", None)
        result["_conversation_hidden"] = True

    result["_permissions"] = {
        "can_move": can_move_lead(user, lead),
        "can_view_full": can_full,
        "can_view_conversation": can_conv,
        "can_view_ai_summary": can_ai,
        "permission_level": lvl,
    }
    return result


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/leads/:id/conversation  (403 if no can_view_conversation)
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/api/leads/{lead_id}/conversation")
async def get_lead_conversation(lead_id: str, request: Request):
    user = await _auth(request)
    db = _db(request)
    lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "Lead no encontrado")

    if not can_view_conversation(user, lead):
        lvl = get_user_permission_level(user)
        await _safe_audit_ml(
            db, user, action="denied", entity_type="lead_conversation_attempt", entity_id=lead_id,
            before=None, after=None, request=request,
            ml_event="permission_denied_attempt",
            ml_context={"lead_id": lead_id, "level": lvl, "field": "conversation"},
        )
        raise HTTPException(403, "Sin permisos para ver la conversación de este lead")

    notes = lead.get("notes") or []
    # Resolve user names
    user_ids = list({n.get("user_id") for n in notes if n.get("user_id")})
    name_map: Dict[str, str] = {}
    if user_ids:
        async for u in db.users.find({"user_id": {"$in": user_ids}}, {"_id": 0, "user_id": 1, "name": 1}):
            name_map[u["user_id"]] = u.get("name", "—")
    enriched = [
        {**n, "user_name": name_map.get(n.get("user_id"), "—")} for n in notes
    ]
    return {"lead_id": lead_id, "notes": enriched, "total": len(enriched)}


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/leads/:id/ai-summary  (403 if no can_view_ai_summary)
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/api/leads/{lead_id}/ai-summary")
async def get_lead_ai_summary(lead_id: str, request: Request):
    user = await _auth(request)
    db = _db(request)
    lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "Lead no encontrado")

    if not can_view_ai_summary(user, lead):
        lvl = get_user_permission_level(user)
        await _safe_audit_ml(
            db, user, action="denied", entity_type="lead_ai_summary_attempt", entity_id=lead_id,
            before=None, after=None, request=request,
            ml_event="permission_denied_attempt",
            ml_context={"lead_id": lead_id, "level": lvl, "field": "ai_summary"},
        )
        raise HTTPException(403, "Sin permisos para ver el resumen IA de este lead")

    # Build AI summary from lead data (deterministic, no LLM call required for stub)
    contact = lead.get("contact", {})
    notes = lead.get("notes") or []
    budget = lead.get("budget_range") or {}
    pms = lead.get("payment_methods", [])
    intent = lead.get("intent")
    status = lead.get("status", "nuevo")

    # Cached summary if exists
    cached = lead.get("ai_summary")
    if cached and isinstance(cached, dict):
        return {**cached, "lead_id": lead_id, "_cached": True}

    # Generate summary heuristically
    notes_text = " · ".join((n.get("text") or "")[:60] for n in notes[-5:])
    summary = {
        "lead_id": lead_id,
        "headline": f"Cliente {contact.get('name', 'sin nombre')} en etapa {status}",
        "intent": intent or "no especificado",
        "budget_summary": (
            f"${(budget.get('min') or 0):,.0f} – ${(budget.get('max') or 0):,.0f} MXN"
            if budget.get("min") or budget.get("max") else "Sin presupuesto"
        ),
        "payment_methods": pms,
        "recent_activity": notes_text or "Sin notas recientes",
        "recommendations": [
            "Confirmar interés con llamada en las próximas 24h" if status == "nuevo" else
            "Seguimiento WhatsApp con propuesta personalizada" if status in ("contactado", "visita_agendada") else
            "Cerrar oferta o reagendar visita" if status == "propuesta" else
            "Documentar lecciones aprendidas",
        ],
        "risk_level": "alto" if lead.get("velocity_flag") else (
            "medio" if status == "under_review" else "bajo"
        ),
        "generated_at": _now().isoformat(),
        "_cached": False,
    }
    return summary


# ─────────────────────────────────────────────────────────────────────────────
# SUB-CHUNK B · 4.30  GET /api/clients/:gid/leads (cross-project visibility)
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/api/clients/{client_gid}/leads")
async def client_cross_project_leads(client_gid: str, request: Request):
    user = await _auth(request)
    db = _db(request)
    uid = getattr(user, "user_id", "")
    lvl = get_user_permission_level(user)
    dev_org = getattr(user, "tenant_id", None)
    inm_id = getattr(user, "inmobiliaria_id", None)

    # Base query
    q: Dict[str, Any] = {"client_global_id": client_gid}
    # Scope visibility per role
    if lvl == "superadmin":
        pass  # sees all
    elif lvl == "developer_director" and dev_org:
        q["dev_org_id"] = dev_org
    elif lvl == "developer_member":
        q["$or"] = [{"assigned_to": uid}, {"created_by": uid}]
    elif lvl == "inmobiliaria_director" and inm_id:
        q["inmobiliaria_id"] = inm_id
    elif lvl in ("asesor_freelance", "inmobiliaria_member"):
        q["$or"] = [{"assigned_to": uid}, {"created_by": uid}]
    else:
        raise HTTPException(403, "Sin acceso")

    leads = await db.leads.find(q, {"_id": 0}).sort("last_activity_at", -1).limit(50).to_list(50)

    # Resolve assignee names and project names
    ids = list({l.get("assigned_to") for l in leads if l.get("assigned_to")})
    name_by_id: Dict[str, str] = {}
    if ids:
        async for u in db.users.find({"user_id": {"$in": ids}}, {"_id": 0, "user_id": 1, "name": 1}):
            name_by_id[u["user_id"]] = u.get("name", "—")

    # Get project names
    project_name_map: Dict[str, str] = {}
    try:
        from data_developments import DEVELOPMENTS
        project_name_map = {d["id"]: d.get("name", d["id"]) for d in DEVELOPMENTS}
    except Exception:
        pass

    result = []
    for l in leads:
        can_full = can_view_full_client_data(user, l)
        assigned = l.get("assigned_to")
        result.append({
            "id": l["id"],
            "project_id": l.get("project_id"),
            "project_name": project_name_map.get(l.get("project_id", ""), l.get("project_id")),
            "status": l.get("status"),
            "origin_type": (l.get("origin") or {}).get("type", ""),
            "asesor_name": name_by_id.get(assigned, "—"),
            "last_activity_at": l.get("last_activity_at"),
            "created_at": l.get("created_at"),
            "contact_name": l.get("contact", {}).get("name") if can_full else None,
            "can_navigate": can_full,
        })

    # Emit ML event for cross-project view
    if len(result) > 1:
        await _safe_audit_ml(
            db, user, action="read", entity_type="client_cross_project_view", entity_id=client_gid,
            before=None, after={"leads_found": len(result)}, request=request,
            ml_event="client_cross_project_view",
            ml_context={"client_gid": client_gid, "leads_count": len(result), "level": lvl},
        )

    return {"client_gid": client_gid, "total": len(result), "leads": result}


# ─────────────────────────────────────────────────────────────────────────────
# Backward compat wrappers (old endpoints → new logic)
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/api/dev/leads/kanban/v2")
async def dev_kanban_compat(
    request: Request,
    project_id: Optional[str] = None,
    scope: str = Query("all_org"),
):
    """Backward-compat wrapper. Dev surfaces should migrate to /api/leads/kanban."""
    return await _run_kanban(request, scope=scope, project_id=project_id)


@router.get("/api/advisor/leads/kanban")
async def advisor_kanban_compat(
    request: Request,
    project_id: Optional[str] = None,
):
    """Backward-compat wrapper for asesor leads kanban (always scope=mine)."""
    return await _run_kanban(request, scope="mine", project_id=project_id)


@router.get("/api/inmobiliaria/leads/kanban")
async def inmobiliaria_kanban_compat(
    request: Request,
    project_id: Optional[str] = None,
    scope: str = Query("all_inmobiliaria"),
):
    """Backward-compat wrapper for inmobiliaria leads kanban."""
    return await _run_kanban(request, scope=scope, project_id=project_id)


async def ensure_batch4_2_indexes(db) -> None:
    await db.leads.create_index([("client_global_id", 1), ("status", 1)], background=True)
    await db.leads.create_index([("assigned_to", 1), ("status", 1)], background=True)
    await db.leads.create_index([("created_by", 1), ("status", 1)], background=True)
    await db.leads.create_index([("inmobiliaria_id", 1), ("status", 1)], background=True)
    log.info("[batch4.2] indexes ensured")
