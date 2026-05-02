"""Phase 4 Batch 4 — Sales / CRM core.

Scope:
  4.19  Lead Pipeline Cross-Channel
        - POST  /api/dev/leads                          create
        - GET   /api/dev/leads                          list + filter
        - GET   /api/dev/leads/analytics                funnel, source, win rate, per-asesor
        - GET   /api/dev/leads/kanban                   5-col grouped view
        - PATCH /api/dev/leads/{id}                     update (status/assigned/notes)
        - POST  /api/dev/leads/{id}/note                append note
        - POST  /api/dev/leads/{id}/assign              assign to user
        - POST  /api/dev/leads/{id}/move-column         kanban move

  4.23  project_brokers whitelist
        - GET    /api/dev/projects/{id}/brokers
        - POST   /api/dev/projects/{id}/brokers
        - PATCH  /api/dev/projects/{id}/brokers/{broker_row_id}
        - DELETE /api/dev/projects/{id}/brokers/{broker_row_id}   (soft delete -> status='revoked')

All mutations fire audit_log.log_mutation + observability.emit_ml_event.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/dev", tags=["dev-batch4"])


# ─────────────────────────────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────────────────────────────
LEAD_STATUSES = [
    "nuevo", "contactado", "visita_agendada", "visita_realizada",
    "propuesta", "cerrado_ganado", "cerrado_perdido",
]
LEAD_SOURCES = {
    "web_form", "caya_bot", "whatsapp", "feria", "asesor_referral", "erp_webhook", "manual",
}
LEAD_INTENTS = {"comprar", "invertir", "visitar", "info"}
LOST_REASONS = {"precio", "timing", "financiamiento", "otro"}
BROKER_LEVELS = {"view_only", "sell", "master_broker"}
BROKER_STATUSES = {"active", "paused", "revoked"}

KANBAN_COLUMNS = [
    {"key": "nuevo",              "label": "Nuevo",             "statuses": ["nuevo"]},
    {"key": "en_contacto",        "label": "En contacto",       "statuses": ["contactado", "visita_agendada"]},
    {"key": "visita_realizada",   "label": "Visita realizada",  "statuses": ["visita_realizada"]},
    {"key": "propuesta",          "label": "Propuesta",         "statuses": ["propuesta"]},
    {"key": "cerrado",            "label": "Cerrado",           "statuses": ["cerrado_ganado", "cerrado_perdido"]},
]
COLUMN_BY_STATUS = {
    s: col["key"] for col in KANBAN_COLUMNS for s in col["statuses"]
}


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────
def _now() -> datetime:
    return datetime.now(timezone.utc)


def _uid(pfx: str) -> str:
    return f"{pfx}_{uuid.uuid4().hex[:12]}"


def _db(request: Request):
    return request.app.state.db


async def _auth(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    if user.role not in ("developer_admin", "developer_member", "superadmin"):
        raise HTTPException(403, "Rol no autorizado")
    return user


def _tenant(user) -> str:
    return getattr(user, "tenant_id", None) or getattr(user, "org_id", None) or "default"


async def _safe_audit_ml(db, user, *, action: str, entity_type: str, entity_id: str,
                        before: Optional[Dict[str, Any]], after: Optional[Dict[str, Any]],
                        request: Request,
                        ml_event: Optional[str] = None, ml_context: Optional[Dict[str, Any]] = None,
                        ml_action: Optional[Dict[str, Any]] = None):
    try:
        from audit_log import log_mutation
        await log_mutation(db, user, action, entity_type, entity_id, before, after, request=request)
    except Exception:
        pass
    if ml_event:
        try:
            from observability import emit_ml_event
            await emit_ml_event(
                db, event_type=ml_event,
                user_id=user.user_id, org_id=_tenant(user), role=user.role,
                context=ml_context or {}, ai_decision={}, user_action=ml_action or {},
            )
        except Exception:
            pass


async def _push_notification(db, *, user_id: str, org_id: str, ntype: str, payload: Dict[str, Any]) -> None:
    doc = {
        "id": _uid("notif"),
        "user_id": user_id,
        "org_id":  org_id,
        "type":    ntype,
        "payload": payload,
        "channels": ["in_app"],
        "read_at":  None,
        "created_at": _now().isoformat(),
    }
    try:
        await db.notifications.insert_one(doc)
    except Exception:
        pass


async def _round_robin_assignee(db, dev_org_id: str) -> Optional[str]:
    """Pick the internal commercial user with the oldest last-assigned lead to
    round-robin new leads. Falls back to any active comercial. Returns user_id."""
    # Active commercial users in this org.
    cursor = db.users.find(
        {"tenant_id": dev_org_id, "internal_role": "comercial"},
        {"_id": 0, "user_id": 1, "name": 1},
    )
    commercials = await cursor.to_list(50)
    if not commercials:
        return None

    # Lookup most-recent lead assigned per commercial.
    assignee_with_last: List[tuple] = []
    for c in commercials:
        last = await db.leads.find_one(
            {"dev_org_id": dev_org_id, "assigned_to": c["user_id"]},
            {"_id": 0, "created_at": 1},
            sort=[("created_at", -1)],
        )
        ts = last.get("created_at") if last else None
        assignee_with_last.append((c["user_id"], ts))

    # Sort: those with None (no leads ever) first, then oldest ts.
    assignee_with_last.sort(key=lambda x: (x[1] is not None, x[1] or ""))
    return assignee_with_last[0][0]


# ═════════════════════════════════════════════════════════════════════════════
# 4.19 · LEAD PIPELINE
# ═════════════════════════════════════════════════════════════════════════════
class LeadContact(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    email: Optional[str] = None
    phone: Optional[str] = None
    preferred_channel: Optional[str] = None


class LeadBudget(BaseModel):
    min: Optional[float] = Field(None, ge=0)
    max: Optional[float] = Field(None, ge=0)
    currency: str = "MXN"


class LeadCreate(BaseModel):
    project_id: Optional[str] = None
    source: str
    source_metadata: Optional[Dict[str, Any]] = None
    contact: LeadContact
    intent: Optional[str] = None
    budget_range: Optional[LeadBudget] = None
    assigned_to: Optional[str] = None


@router.post("/leads")
async def create_lead(payload: LeadCreate, request: Request):
    user = await _auth(request)
    db = _db(request)

    if payload.source not in LEAD_SOURCES:
        raise HTTPException(400, f"source inválido: {payload.source}")
    if payload.intent and payload.intent not in LEAD_INTENTS:
        raise HTTPException(400, f"intent inválido: {payload.intent}")
    if not payload.contact.email and not payload.contact.phone:
        raise HTTPException(422, "contact.email o contact.phone es obligatorio")

    dev_org_id = _tenant(user)
    assigned_to = payload.assigned_to
    if not assigned_to:
        assigned_to = await _round_robin_assignee(db, dev_org_id)

    now_iso = _now().isoformat()
    lead = {
        "id": _uid("lead"),
        "dev_org_id":        dev_org_id,
        "project_id":        payload.project_id,
        "source":            payload.source,
        "source_metadata":   payload.source_metadata or {},
        "contact":           payload.contact.model_dump(),
        "intent":            payload.intent,
        "budget_range":      payload.budget_range.model_dump() if payload.budget_range else None,
        "status":            "nuevo",
        "assigned_to":       assigned_to,
        "notes":             [],
        "lost_reason":       None,
        "created_at":        now_iso,
        "updated_at":        now_iso,
        "last_activity_at":  now_iso,
        "created_by":        user.user_id,
    }
    await db.leads.insert_one(dict(lead))
    lead.pop("_id", None)

    await _safe_audit_ml(
        db, user, action="create", entity_type="lead", entity_id=lead["id"],
        before=None, after={"source": lead["source"], "project_id": lead["project_id"]},
        request=request,
        ml_event="lead_created",
        ml_context={"source": lead["source"], "project_id": lead["project_id"], "assigned_to": assigned_to},
    )

    # Notify assignee
    if assigned_to and assigned_to != user.user_id:
        await _push_notification(
            db, user_id=assigned_to, org_id=dev_org_id,
            ntype="lead_assigned",
            payload={
                "lead_id": lead["id"],
                "contact_name": lead["contact"]["name"],
                "source": lead["source"],
                "project_id": lead["project_id"],
                "intent": lead["intent"],
            },
        )

    return lead


@router.get("/leads")
async def list_leads(
    request: Request,
    status: Optional[str] = None,
    source: Optional[str] = None,
    assigned_to: Optional[str] = None,
    project_id: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
):
    user = await _auth(request)
    db = _db(request)
    q: Dict[str, Any] = {"dev_org_id": _tenant(user)}
    if status:
        q["status"] = status
    if source:
        q["source"] = source
    if assigned_to:
        q["assigned_to"] = assigned_to
    if project_id:
        q["project_id"] = project_id
    if from_date or to_date:
        q["created_at"] = {}
        if from_date:
            q["created_at"]["$gte"] = from_date
        if to_date:
            q["created_at"]["$lte"] = to_date

    limit = max(1, min(100, limit))
    skip = max(0, (page - 1) * limit)
    total = await db.leads.count_documents(q)
    items = await db.leads.find(q, {"_id": 0}).sort("last_activity_at", -1).skip(skip).limit(limit).to_list(limit)

    # Resolve assignee names (best-effort)
    ids = list({x.get("assigned_to") for x in items if x.get("assigned_to")})
    name_by_id = {}
    if ids:
        async for u in db.users.find({"user_id": {"$in": ids}}, {"_id": 0, "user_id": 1, "name": 1, "email": 1}):
            name_by_id[u["user_id"]] = u.get("name") or u.get("email")
    for it in items:
        it["assigned_to_name"] = name_by_id.get(it.get("assigned_to"))

    return {"items": items, "total": total, "page": page, "limit": limit}


class LeadPatch(BaseModel):
    status: Optional[str] = None
    assigned_to: Optional[str] = None
    intent: Optional[str] = None
    project_id: Optional[str] = None
    budget_range: Optional[LeadBudget] = None
    lost_reason: Optional[str] = None


@router.patch("/leads/{lead_id}")
async def patch_lead(lead_id: str, payload: LeadPatch, request: Request):
    user = await _auth(request)
    db = _db(request)
    old = await db.leads.find_one({"id": lead_id, "dev_org_id": _tenant(user)}, {"_id": 0})
    if not old:
        raise HTTPException(404, "Lead no encontrado")

    patch: Dict[str, Any] = {}
    data = payload.model_dump(exclude_unset=True)
    if "status" in data:
        if data["status"] not in LEAD_STATUSES:
            raise HTTPException(400, f"status inválido: {data['status']}")
        patch["status"] = data["status"]
    if "assigned_to" in data and data["assigned_to"] is not None:
        patch["assigned_to"] = data["assigned_to"]
    if "intent" in data and data["intent"] is not None:
        if data["intent"] not in LEAD_INTENTS:
            raise HTTPException(400, f"intent inválido: {data['intent']}")
        patch["intent"] = data["intent"]
    if "project_id" in data:
        patch["project_id"] = data["project_id"]
    if "budget_range" in data:
        patch["budget_range"] = data["budget_range"]
    if "lost_reason" in data and data["lost_reason"] is not None:
        if data["lost_reason"] not in LOST_REASONS:
            raise HTTPException(400, f"lost_reason inválido: {data['lost_reason']}")
        patch["lost_reason"] = data["lost_reason"]

    # Enforce lost_reason when closing as lost
    target_status = patch.get("status", old.get("status"))
    if target_status == "cerrado_perdido":
        effective_reason = patch.get("lost_reason", old.get("lost_reason"))
        if not effective_reason:
            raise HTTPException(422, "lost_reason es obligatorio al cerrar como perdido")

    if not patch:
        return old

    now_iso = _now().isoformat()
    patch["updated_at"] = now_iso
    patch["last_activity_at"] = now_iso
    await db.leads.update_one({"id": lead_id}, {"$set": patch})
    updated = await db.leads.find_one({"id": lead_id}, {"_id": 0})

    # Derived ML events on close
    ml_event = None
    ml_context: Dict[str, Any] = {"lead_id": lead_id}
    if "status" in patch and patch["status"] in ("cerrado_ganado", "cerrado_perdido") and old.get("status") != patch["status"]:
        try:
            created = datetime.fromisoformat(old["created_at"])
            closed = datetime.fromisoformat(now_iso)
            days = max(0, (closed - created).days)
        except Exception:
            days = None
        ml_event = "lead_closed"
        ml_context.update({
            "result": "won" if patch["status"] == "cerrado_ganado" else "lost",
            "time_to_close_days": days,
            "lost_reason": updated.get("lost_reason"),
            "source": old.get("source"),
        })

    await _safe_audit_ml(
        db, user, action="update", entity_type="lead", entity_id=lead_id,
        before={k: old.get(k) for k in patch.keys()},
        after={k: updated.get(k) for k in patch.keys()},
        request=request,
        ml_event=ml_event, ml_context=ml_context,
        ml_action={"fields": list(patch.keys())},
    )

    # Notify new assignee if changed
    if "assigned_to" in patch and patch["assigned_to"] and patch["assigned_to"] != old.get("assigned_to"):
        await _push_notification(
            db, user_id=patch["assigned_to"], org_id=_tenant(user),
            ntype="lead_assigned",
            payload={
                "lead_id": lead_id,
                "contact_name": updated["contact"]["name"],
                "source": updated["source"],
                "project_id": updated.get("project_id"),
            },
        )

    return updated


class LeadNotePayload(BaseModel):
    text: str = Field(..., min_length=1, max_length=800)


@router.post("/leads/{lead_id}/note")
async def append_lead_note(lead_id: str, payload: LeadNotePayload, request: Request):
    user = await _auth(request)
    db = _db(request)
    old = await db.leads.find_one({"id": lead_id, "dev_org_id": _tenant(user)}, {"_id": 0})
    if not old:
        raise HTTPException(404, "Lead no encontrado")
    entry = {
        "id": _uid("ln"),
        "text": payload.text,
        "by_user_id": user.user_id,
        "by_name": getattr(user, "name", None) or (user.email.split("@")[0] if hasattr(user, "email") else "Usuario"),
        "ts": _now().isoformat(),
    }
    await db.leads.update_one(
        {"id": lead_id},
        {"$push": {"notes": {"$each": [entry], "$position": 0}},
         "$set":  {"last_activity_at": entry["ts"], "updated_at": entry["ts"]}},
    )
    await _safe_audit_ml(
        db, user, action="create", entity_type="lead_note", entity_id=entry["id"],
        before=None, after={"lead_id": lead_id, "text_len": len(payload.text)},
        request=request,
    )
    return {"ok": True, "entry": entry}


class LeadAssignPayload(BaseModel):
    user_id: str


@router.post("/leads/{lead_id}/assign")
async def assign_lead(lead_id: str, payload: LeadAssignPayload, request: Request):
    user = await _auth(request)
    db = _db(request)
    old = await db.leads.find_one({"id": lead_id, "dev_org_id": _tenant(user)}, {"_id": 0})
    if not old:
        raise HTTPException(404, "Lead no encontrado")

    # Validate that the target user belongs to the same dev_org.
    target = await db.users.find_one(
        {"user_id": payload.user_id, "tenant_id": _tenant(user)},
        {"_id": 0, "user_id": 1, "name": 1, "email": 1, "role": 1, "internal_role": 1},
    )
    if not target:
        raise HTTPException(404, "Usuario no encontrado en tu organización")

    now_iso = _now().isoformat()
    await db.leads.update_one(
        {"id": lead_id},
        {"$set": {"assigned_to": payload.user_id, "updated_at": now_iso, "last_activity_at": now_iso}},
    )
    await _safe_audit_ml(
        db, user, action="update", entity_type="lead_assignment", entity_id=lead_id,
        before={"assigned_to": old.get("assigned_to")},
        after={"assigned_to": payload.user_id},
        request=request,
        ml_event="lead_assigned",
        ml_context={"lead_id": lead_id, "to_user_id": payload.user_id},
    )
    await _push_notification(
        db, user_id=payload.user_id, org_id=_tenant(user),
        ntype="lead_assigned",
        payload={
            "lead_id": lead_id,
            "contact_name": old["contact"]["name"],
            "source": old["source"],
            "project_id": old.get("project_id"),
        },
    )
    return {"ok": True, "lead_id": lead_id, "assigned_to": payload.user_id, "assignee_name": target.get("name")}


class KanbanMovePayload(BaseModel):
    target_status: str


@router.post("/leads/{lead_id}/move-column")
async def move_lead_column(lead_id: str, payload: KanbanMovePayload, request: Request):
    user = await _auth(request)
    db = _db(request)
    if payload.target_status not in LEAD_STATUSES:
        raise HTTPException(400, f"status inválido: {payload.target_status}")

    old = await db.leads.find_one({"id": lead_id, "dev_org_id": _tenant(user)}, {"_id": 0})
    if not old:
        raise HTTPException(404, "Lead no encontrado")

    if payload.target_status == "cerrado_perdido" and not old.get("lost_reason"):
        raise HTTPException(422, "Para mover a cerrado_perdido actualiza primero el lost_reason")

    # days in previous column
    try:
        prev_ts = datetime.fromisoformat(old.get("last_activity_at") or old.get("created_at"))
        days_in_prev = max(0, (_now() - prev_ts).days)
    except Exception:
        days_in_prev = None

    now_iso = _now().isoformat()
    await db.leads.update_one(
        {"id": lead_id},
        {"$set": {"status": payload.target_status, "updated_at": now_iso, "last_activity_at": now_iso}},
    )
    await _safe_audit_ml(
        db, user, action="update", entity_type="lead_kanban_move", entity_id=lead_id,
        before={"status": old.get("status")},
        after={"status": payload.target_status},
        request=request,
        ml_event="lead_kanban_move",
        ml_context={
            "lead_id": lead_id,
            "from_status": old.get("status"),
            "to_status": payload.target_status,
            "days_in_prev": days_in_prev,
        },
    )
    updated = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    return {"ok": True, "lead": updated, "days_in_prev": days_in_prev}


# ─── Kanban view ──────────────────────────────────────────────────────────────
@router.get("/leads/kanban")
async def kanban_view(request: Request, project_id: Optional[str] = None):
    user = await _auth(request)
    db = _db(request)
    q: Dict[str, Any] = {"dev_org_id": _tenant(user)}
    if project_id:
        q["project_id"] = project_id

    items = await db.leads.find(q, {"_id": 0}).sort("last_activity_at", -1).limit(500).to_list(500)

    # Resolve assignee names
    ids = list({x.get("assigned_to") for x in items if x.get("assigned_to")})
    name_by_id: Dict[str, str] = {}
    if ids:
        async for u in db.users.find({"user_id": {"$in": ids}}, {"_id": 0, "user_id": 1, "name": 1, "email": 1}):
            name_by_id[u["user_id"]] = u.get("name") or u.get("email")

    now = _now()
    cols: Dict[str, List[Dict[str, Any]]] = {c["key"]: [] for c in KANBAN_COLUMNS}
    for lead in items:
        col_key = COLUMN_BY_STATUS.get(lead.get("status", "nuevo"))
        if not col_key:
            continue
        # days_in_status
        try:
            ts = datetime.fromisoformat(lead.get("last_activity_at") or lead.get("created_at"))
            days_in_status = max(0, (now - ts).days)
        except Exception:
            days_in_status = None
        card = {
            "id":                lead["id"],
            "status":            lead["status"],
            "project_id":        lead.get("project_id"),
            "source":            lead["source"],
            "contact_name":      lead["contact"]["name"],
            "contact_email":     lead["contact"].get("email"),
            "contact_phone":     lead["contact"].get("phone"),
            "assigned_to":       lead.get("assigned_to"),
            "assigned_to_name":  name_by_id.get(lead.get("assigned_to")),
            "budget_range":      lead.get("budget_range"),
            "last_activity_at":  lead.get("last_activity_at"),
            "days_in_status":    days_in_status,
            "lost_reason":       lead.get("lost_reason"),
            "intent":            lead.get("intent"),
        }
        cols[col_key].append(card)

    columns_out = []
    for c in KANBAN_COLUMNS:
        cards = cols[c["key"]]
        total_budget = sum(
            (card["budget_range"] or {}).get("max") or 0
            for card in cards
            if card.get("budget_range")
        )
        columns_out.append({
            "key":          c["key"],
            "label":        c["label"],
            "count":        len(cards),
            "total_budget_max": total_budget,
            "cards":        cards,
        })

    return {"columns": columns_out, "project_id": project_id, "total": len(items)}


# ─── Analytics ───────────────────────────────────────────────────────────────
@router.get("/leads/analytics")
async def leads_analytics(request: Request, project_id: Optional[str] = None):
    user = await _auth(request)
    db = _db(request)
    q: Dict[str, Any] = {"dev_org_id": _tenant(user)}
    if project_id:
        q["project_id"] = project_id
    leads = await db.leads.find(q, {"_id": 0}).to_list(5000)

    if not leads:
        return {
            "total":             0,
            "funnel":            [{"k": s, "label": s, "count": 0} for s in LEAD_STATUSES],
            "source_breakdown":  [],
            "avg_time_to_close_days": None,
            "win_rate":          None,
            "lost_reasons":      [],
            "per_assignee":      [],
        }

    # ── Funnel by status
    by_status: Dict[str, int] = {s: 0 for s in LEAD_STATUSES}
    for ld in leads:
        by_status[ld.get("status", "nuevo")] = by_status.get(ld.get("status", "nuevo"), 0) + 1
    status_labels = {
        "nuevo": "Nuevo", "contactado": "Contactado", "visita_agendada": "Visita agendada",
        "visita_realizada": "Visita realizada", "propuesta": "Propuesta",
        "cerrado_ganado": "Cerrado ganado", "cerrado_perdido": "Cerrado perdido",
    }
    funnel = [{"k": s, "label": status_labels[s], "count": by_status[s]} for s in LEAD_STATUSES]

    # ── Source breakdown
    by_source: Dict[str, int] = {}
    for ld in leads:
        by_source[ld["source"]] = by_source.get(ld["source"], 0) + 1
    total = len(leads)
    source_labels = {
        "web_form": "Formulario web", "caya_bot": "Bot Caya", "whatsapp": "WhatsApp",
        "feria": "Feria", "asesor_referral": "Asesor referido", "erp_webhook": "ERP webhook", "manual": "Manual",
    }
    source_breakdown = [
        {"source": s, "label": source_labels.get(s, s), "count": c, "pct": round(100 * c / total, 1)}
        for s, c in sorted(by_source.items(), key=lambda x: -x[1])
    ]

    # ── Avg time to close (days) + Win rate
    closes = [ld for ld in leads if ld.get("status") in ("cerrado_ganado", "cerrado_perdido")]
    won = [ld for ld in closes if ld["status"] == "cerrado_ganado"]
    ttc_days: List[int] = []
    for ld in closes:
        try:
            created = datetime.fromisoformat(ld["created_at"])
            closed = datetime.fromisoformat(ld["updated_at"])
            ttc_days.append(max(0, (closed - created).days))
        except Exception:
            pass
    avg_ttc = round(sum(ttc_days) / len(ttc_days), 1) if ttc_days else None
    win_rate = round(100 * len(won) / len(closes), 1) if closes else None

    # ── Lost reasons breakdown
    lost = [ld for ld in closes if ld["status"] == "cerrado_perdido"]
    lost_by_reason: Dict[str, int] = {}
    for ld in lost:
        r = ld.get("lost_reason") or "otro"
        lost_by_reason[r] = lost_by_reason.get(r, 0) + 1
    lost_labels = {"precio": "Precio", "timing": "Timing", "financiamiento": "Financiamiento", "otro": "Otro"}
    lost_total = max(1, len(lost))
    lost_reasons = [
        {"reason": r, "label": lost_labels.get(r, r), "count": c, "pct": round(100 * c / lost_total, 1)}
        for r, c in sorted(lost_by_reason.items(), key=lambda x: -x[1])
    ]

    # ── Per-assignee breakdown
    per_assignee_map: Dict[str, Dict[str, int]] = {}
    for ld in leads:
        uid = ld.get("assigned_to") or "_unassigned"
        d = per_assignee_map.setdefault(uid, {"active": 0, "won": 0, "lost": 0})
        if ld["status"] == "cerrado_ganado":
            d["won"] += 1
        elif ld["status"] == "cerrado_perdido":
            d["lost"] += 1
        else:
            d["active"] += 1

    uids = [k for k in per_assignee_map.keys() if k != "_unassigned"]
    name_by_id: Dict[str, str] = {}
    if uids:
        async for u in db.users.find({"user_id": {"$in": uids}}, {"_id": 0, "user_id": 1, "name": 1, "email": 1}):
            name_by_id[u["user_id"]] = u.get("name") or u.get("email")

    per_assignee = []
    for uid, counts in per_assignee_map.items():
        closed_here = counts["won"] + counts["lost"]
        wr = round(100 * counts["won"] / closed_here, 1) if closed_here else None
        per_assignee.append({
            "user_id":   uid,
            "name":      name_by_id.get(uid, "Sin asignar") if uid != "_unassigned" else "Sin asignar",
            "active":    counts["active"],
            "won":       counts["won"],
            "lost":      counts["lost"],
            "win_rate":  wr,
        })
    per_assignee.sort(key=lambda x: (-x["won"], -x["active"]))

    return {
        "total":                  total,
        "funnel":                 funnel,
        "source_breakdown":       source_breakdown,
        "avg_time_to_close_days": avg_ttc,
        "win_rate":               win_rate,
        "lost_reasons":           lost_reasons,
        "per_assignee":           per_assignee,
    }


# ═════════════════════════════════════════════════════════════════════════════
# 4.23 · PROJECT BROKERS (whitelist)
# ═════════════════════════════════════════════════════════════════════════════
class BrokerCreate(BaseModel):
    broker_user_id: str
    access_level:   str = "sell"
    commission_pct: float = Field(..., ge=0, le=20)


@router.get("/projects/{project_id}/brokers")
async def list_brokers(project_id: str, request: Request, include_revoked: bool = False):
    user = await _auth(request)
    db = _db(request)
    q: Dict[str, Any] = {"project_id": project_id, "dev_org_id": _tenant(user)}
    if not include_revoked:
        q["status"] = {"$ne": "revoked"}
    items = await db.project_brokers.find(q, {"_id": 0}).sort("assigned_at", -1).to_list(200)
    # Resolve broker names
    ids = list({x["broker_user_id"] for x in items})
    name_by_id: Dict[str, Dict[str, Any]] = {}
    if ids:
        async for u in db.users.find(
            {"user_id": {"$in": ids}},
            {"_id": 0, "user_id": 1, "name": 1, "email": 1, "role": 1, "internal_role": 1},
        ):
            name_by_id[u["user_id"]] = u
    for it in items:
        it["broker_info"] = name_by_id.get(it["broker_user_id"])
    return {"items": items, "project_id": project_id}


@router.post("/projects/{project_id}/brokers")
async def assign_broker(project_id: str, payload: BrokerCreate, request: Request):
    user = await _auth(request)
    if user.role not in ("developer_admin", "superadmin"):
        raise HTTPException(403, "Solo developer_admin / superadmin pueden asignar brokers")

    db = _db(request)
    if payload.access_level not in BROKER_LEVELS:
        raise HTTPException(400, f"access_level inválido: {payload.access_level}")

    # Validate broker exists (either same tenant internal_user OR an advisor from any tenant).
    broker = await db.users.find_one(
        {"user_id": payload.broker_user_id},
        {"_id": 0, "user_id": 1, "name": 1, "email": 1, "role": 1, "internal_role": 1, "tenant_id": 1},
    )
    if not broker:
        raise HTTPException(404, "Broker no encontrado")
    if broker["role"] not in ("advisor", "developer_admin", "developer_member"):
        raise HTTPException(400, "Broker debe ser asesor o miembro interno")

    # Dedup — no active row already
    existing = await db.project_brokers.find_one({
        "project_id": project_id,
        "dev_org_id": _tenant(user),
        "broker_user_id": payload.broker_user_id,
        "status": {"$ne": "revoked"},
    })
    if existing:
        raise HTTPException(409, "Este broker ya está asignado activamente al proyecto")

    now_iso = _now().isoformat()
    row = {
        "id":              _uid("pb"),
        "project_id":      project_id,
        "dev_org_id":      _tenant(user),
        "broker_user_id":  payload.broker_user_id,
        "access_level":    payload.access_level,
        "commission_pct":  payload.commission_pct,
        "status":          "active",
        "assigned_at":     now_iso,
        "assigned_by_user_id": user.user_id,
    }
    await db.project_brokers.insert_one(dict(row))
    row.pop("_id", None)

    await _safe_audit_ml(
        db, user, action="create", entity_type="project_broker", entity_id=row["id"],
        before=None, after={"project_id": project_id, "broker_user_id": payload.broker_user_id, "level": payload.access_level},
        request=request,
        ml_event="project_broker_assigned",
        ml_context={"project_id": project_id, "broker_user_id": payload.broker_user_id,
                    "access_level": payload.access_level, "commission_pct": payload.commission_pct},
    )

    row["broker_info"] = broker
    return row


class BrokerPatch(BaseModel):
    access_level:   Optional[str] = None
    commission_pct: Optional[float] = Field(None, ge=0, le=20)
    status:         Optional[str] = None


@router.patch("/projects/{project_id}/brokers/{row_id}")
async def patch_broker(project_id: str, row_id: str, payload: BrokerPatch, request: Request):
    user = await _auth(request)
    if user.role not in ("developer_admin", "superadmin"):
        raise HTTPException(403, "Solo developer_admin / superadmin pueden modificar brokers")
    db = _db(request)
    old = await db.project_brokers.find_one({"id": row_id, "project_id": project_id, "dev_org_id": _tenant(user)}, {"_id": 0})
    if not old:
        raise HTTPException(404, "Asignación de broker no encontrada")

    patch: Dict[str, Any] = {}
    data = payload.model_dump(exclude_unset=True)
    if "access_level" in data and data["access_level"] is not None:
        if data["access_level"] not in BROKER_LEVELS:
            raise HTTPException(400, f"access_level inválido: {data['access_level']}")
        patch["access_level"] = data["access_level"]
    if "commission_pct" in data and data["commission_pct"] is not None:
        patch["commission_pct"] = data["commission_pct"]
    if "status" in data and data["status"] is not None:
        if data["status"] not in BROKER_STATUSES:
            raise HTTPException(400, f"status inválido: {data['status']}")
        patch["status"] = data["status"]

    if not patch:
        return old
    patch["updated_at"] = _now().isoformat()
    await db.project_brokers.update_one({"id": row_id}, {"$set": patch})
    new = await db.project_brokers.find_one({"id": row_id}, {"_id": 0})
    await _safe_audit_ml(
        db, user, action="update", entity_type="project_broker", entity_id=row_id,
        before={k: old.get(k) for k in patch.keys()},
        after={k: new.get(k) for k in patch.keys()},
        request=request,
    )
    return new


@router.delete("/projects/{project_id}/brokers/{row_id}")
async def revoke_broker(project_id: str, row_id: str, request: Request):
    user = await _auth(request)
    if user.role not in ("developer_admin", "superadmin"):
        raise HTTPException(403, "Solo developer_admin / superadmin pueden revocar brokers")
    db = _db(request)
    old = await db.project_brokers.find_one({"id": row_id, "project_id": project_id, "dev_org_id": _tenant(user)}, {"_id": 0})
    if not old:
        raise HTTPException(404, "Asignación de broker no encontrada")
    if old.get("status") == "revoked":
        return {"ok": True, "id": row_id, "status": "revoked"}
    await db.project_brokers.update_one(
        {"id": row_id},
        {"$set": {"status": "revoked", "revoked_at": _now().isoformat(), "revoked_by_user_id": user.user_id}},
    )
    await _safe_audit_ml(
        db, user, action="delete", entity_type="project_broker", entity_id=row_id,
        before={"status": old.get("status")},
        after={"status": "revoked"},
        request=request,
    )
    return {"ok": True, "id": row_id, "status": "revoked"}


# ═════════════════════════════════════════════════════════════════════════════
# INDEXES
# ═════════════════════════════════════════════════════════════════════════════
async def ensure_dev_batch4_indexes(db) -> None:
    await db.leads.create_index([("id", 1)], unique=True, background=True)
    await db.leads.create_index(
        [("dev_org_id", 1), ("status", 1), ("last_activity_at", -1)], background=True,
    )
    await db.leads.create_index([("dev_org_id", 1), ("assigned_to", 1)], background=True)
    await db.leads.create_index([("dev_org_id", 1), ("source", 1)], background=True)
    await db.leads.create_index([("dev_org_id", 1), ("project_id", 1)], background=True)
    await db.leads.create_index([("created_at", -1)], background=True)
    await db.project_brokers.create_index([("id", 1)], unique=True, background=True)
    await db.project_brokers.create_index(
        [("project_id", 1), ("dev_org_id", 1), ("status", 1)], background=True,
    )
    await db.project_brokers.create_index([("broker_user_id", 1)], background=True)
    import logging
    logging.getLogger("dmx").info("[dev_batch4] indexes ensured")
