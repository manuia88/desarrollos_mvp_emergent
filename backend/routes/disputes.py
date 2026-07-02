"""W5.11 Parte 3 — Dispute Resolution endpoints (dev portal).

Colecciones:
  - asesor_dispute_history: { id, lead_id, asesor_id, project_id, dev_org_id,
                              resolution, reason_code, reason_text,
                              resolved_by, resolved_at, cooldown_until,
                              audit_log_id, created_at }
  - Index: (asesor_id, project_id, cooldown_until)

Endpoints:
  POST /api/dev/disputes/{lead_id}/resolve
  GET  /api/dev/disputes/pending
  GET  /api/dev/disputes/history?lead_id&asesor_id&limit=50
"""
from __future__ import annotations

import logging
import secrets as _secrets
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

log = logging.getLogger("dmx.disputes")
router = APIRouter(tags=["dev-disputes"])


VALID_RESOLUTIONS = {"approved", "rejected"}
VALID_REASON_CODES = {
    "duplicate_confirmed",
    "low_intent",
    "data_falsification",
    "other",
}
COOLDOWN_DAYS = 90


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _db(request: Request):
    return request.app.state.db


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _auth_dev(request: Request):
    """Permite developer_admin · developer_member · superadmin."""
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    if user.role not in ("developer_admin", "developer_member", "superadmin"):
        raise HTTPException(403, "Rol no autorizado")
    return user


def _user_dev_org(user) -> str:
    return getattr(user, "tenant_id", None) or getattr(user, "org_id", None) or "default"


# ─── Schemas ─────────────────────────────────────────────────────────────────

class ResolveDisputeBody(BaseModel):
    resolution: str = Field(..., description="approved | rejected")
    reason_code: str = Field(..., description="duplicate_confirmed | low_intent | data_falsification | other")
    reason_text: Optional[str] = Field(None, max_length=500)


# ─── POST resolve ────────────────────────────────────────────────────────────

@router.post("/api/dev/disputes/{lead_id}/resolve")
async def resolve_dispute(lead_id: str, payload: ResolveDisputeBody, request: Request) -> Dict[str, Any]:
    user = await _auth_dev(request)
    db = _db(request)

    if payload.resolution not in VALID_RESOLUTIONS:
        raise HTTPException(422, f"resolution debe ser uno de {sorted(VALID_RESOLUTIONS)}")
    if payload.reason_code not in VALID_REASON_CODES:
        raise HTTPException(422, f"reason_code debe ser uno de {sorted(VALID_REASON_CODES)}")
    if payload.reason_code == "other" and not (payload.reason_text or "").strip():
        raise HTTPException(422, "reason_text obligatorio cuando reason_code='other'")

    lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "Lead no encontrado")
    # [AUD-041] check de dueño ANTES del status: si va después, el 404/409 revela existencia/estado de
    # leads ajenos (oráculo de enumeración). Ahora un lead de otro tenant da el mismo 404 que uno inexistente.
    dev_org_id_lead = lead.get("dev_org_id") or "default"
    dev_org_id_user = _user_dev_org(user)
    if user.role != "superadmin" and dev_org_id_lead != dev_org_id_user:
        raise HTTPException(404, "Lead no encontrado")
    if lead.get("status") != "under_review":
        raise HTTPException(409, "El lead no esta en estado 'under_review'")

    asesor_id = lead.get("assigned_to") or lead.get("created_by")
    project_id = lead.get("project_id") or "default"
    now = _now()
    now_iso = now.isoformat()

    is_approved = payload.resolution == "approved"
    cooldown_until: Optional[str] = None
    new_status: str
    new_after: Dict[str, Any]

    if is_approved:
        new_status = "nuevo"
        new_after = {"status": new_status}
    else:
        new_status = "cerrado_perdido"
        cooldown_until_dt = now + timedelta(days=COOLDOWN_DAYS)
        cooldown_until = cooldown_until_dt.isoformat()
        new_after = {"status": new_status, "lost_reason": "dispute_rejected"}

    # 1. Log audit_immutable (SHA-256 chain)
    from audit_immutable_engine import log as audit_log
    actor = {
        "user_id": getattr(user, "user_id", "unknown"),
        "role": getattr(user, "role", "developer_admin"),
    }
    audit_payload_after = {
        **new_after,
        "dispute": {
            "resolution": payload.resolution,
            "reason_code": payload.reason_code,
            "reason_text": payload.reason_text,
            "cooldown_until": cooldown_until,
            "asesor_id": asesor_id,
            "project_id": project_id,
        },
    }
    audit_log_id = await audit_log(
        db,
        actor=actor,
        action="dispute_resolved",
        entity_type="lead",
        entity_id=lead_id,
        before={"status": "under_review"},
        after=audit_payload_after,
        request=request,
    )

    # 2. Crear registro en asesor_dispute_history
    dispute_id = f"disp_{_secrets.token_urlsafe(10)}"
    dispute_doc = {
        "id": dispute_id,
        "lead_id": lead_id,
        "asesor_id": asesor_id,
        "project_id": project_id,
        "dev_org_id": dev_org_id_lead,
        "resolution": payload.resolution,
        "reason_code": payload.reason_code,
        "reason_text": (payload.reason_text or "").strip()[:500] or None,
        "resolved_by": getattr(user, "user_id", "system"),
        "resolved_at": now_iso,
        "cooldown_until": cooldown_until,
        "audit_log_id": audit_log_id,
        "created_at": now_iso,
    }
    await db.asesor_dispute_history.insert_one(dict(dispute_doc))

    # 3. Update lead · activo se deriva del status (mantiene el índice de dedup en sync:
    # rechazo cierra → activo False; aprobación reabre → activo True).
    lead_update: Dict[str, Any] = {
        "status": new_status,
        "activo": new_status not in ("cerrado_ganado", "cerrado_perdido"),
        "updated_at": now_iso,
        "last_activity_at": now_iso,
        "dispute_resolution_id": dispute_id,
    }
    if not is_approved:
        lead_update["lost_reason"] = "dispute_rejected"
    await db.leads.update_one({"id": lead_id}, {"$set": lead_update})

    # W5.12 Parte 1 — KG sync lead status (best-effort · no-op si KG_AVAILABLE=False)
    try:
        from knowledge_graph_engine import kg_sync
        await kg_sync.set_lead_status(db, lead_id, new_status, actor_user_id=getattr(user, "user_id", None))
    except Exception as _kg_exc:
        log.warning(f"[KG sync] set_lead_status skipped: {_kg_exc}")

    # 4. Notify asesor (dispute_resolved)
    project_name = lead.get("project_name") or project_id
    contact = lead.get("contact") or {}
    client_name = contact.get("name") or lead.get("first_name") or lead_id
    try:
        if asesor_id:
            from notifications_engine import emit_notification
            if is_approved:
                title = "Tu disputa fue aprobada"
                body = f"Tu lead {client_name} fue aprobado por el dev de {project_name}. Ya puedes operarlo."
            else:
                reason_label = (payload.reason_text or "").strip() or payload.reason_code
                title = "Tu disputa fue rechazada"
                body = (
                    f"Tu lead {client_name} ({project_name}) fue cerrado. "
                    f"Razon: {reason_label}. Cooldown: {COOLDOWN_DAYS} dias."
                )
            await emit_notification(
                db,
                user_id=asesor_id,
                tenant_id=dev_org_id_lead,
                type="dispute_resolved",
                severity="high",
                title=title,
                body=body,
                payload={
                    "lead_id": lead_id,
                    "resolution": payload.resolution,
                    "reason_code": payload.reason_code,
                    "reason_text": payload.reason_text,
                    "cooldown_until": cooldown_until,
                    "project_id": project_id,
                    "project_name": project_name,
                    "audit_log_id": audit_log_id,
                },
                action_url=f"/asesor/contactos/{lead_id}",
            )
    except Exception as exc:
        log.warning(f"[disputes] notify asesor failed: {exc}")

    # 5. Plantilla WA 3 (solo rejected + activity_score cross-project >= 1.0)
    if not is_approved and asesor_id:
        try:
            client_gid = lead.get("client_global_id")
            if client_gid:
                from routes.dev_batch4_1 import _compute_activity_score, _build_wa_template_3
                # Activity score cross-project = sum sobre otros leads del mismo cliente
                cross_score, last_age_days = await _compute_activity_score(
                    db,
                    client_global_id=client_gid,
                    exclude_lead_id=lead_id,
                    days_back=30,
                )
                if cross_score >= 1.0:
                    asesor_doc = await db.users.find_one({"user_id": asesor_id}, {"_id": 0, "phone": 1, "first_name": 1}) or {}
                    asesor_phone = asesor_doc.get("phone") or ""
                    wa_url = _build_wa_template_3(
                        asesor_phone=asesor_phone,
                        client_name=client_name,
                        last_activity_days=last_age_days,
                    )
                    log.info(f"[disputes] Plantilla WA 3 generada · asesor={asesor_id} score={cross_score} url={wa_url[:60]}")
        except Exception as exc:
            log.warning(f"[disputes] WA template 3 failed: {exc}")

    return {
        "ok": True,
        "resolution": payload.resolution,
        "cooldown_until": cooldown_until,
        "dispute_id": dispute_id,
        "audit_log_id": audit_log_id,
        "lead_id": lead_id,
        "new_status": new_status,
    }


# ─── GET pending ─────────────────────────────────────────────────────────────

@router.get("/api/dev/disputes/pending")
async def list_pending_disputes(request: Request) -> Dict[str, Any]:
    user = await _auth_dev(request)
    db = _db(request)
    dev_org_id = _user_dev_org(user)

    query: Dict[str, Any] = {"status": "under_review"}
    if user.role != "superadmin":
        query["dev_org_id"] = dev_org_id

    rows: List[Dict[str, Any]] = []
    asesor_cache: Dict[str, str] = {}

    async def _asesor_name(uid: str) -> str:
        if not uid:
            return ""
        if uid in asesor_cache:
            return asesor_cache[uid]
        doc = await db.users.find_one(
            {"$or": [{"user_id": uid}, {"id": uid}]},
            {"_id": 0, "first_name": 1, "last_name": 1, "name": 1, "email": 1},
        ) or {}
        full = (doc.get("name") or f"{doc.get('first_name','')} {doc.get('last_name','')}".strip() or doc.get("email") or uid)
        asesor_cache[uid] = full
        return full

    cursor = db.leads.find(query, {"_id": 0}).sort("created_at", -1).limit(200)
    async for lead in cursor:
        asesor_id = lead.get("assigned_to") or lead.get("created_by") or ""
        contact = lead.get("contact") or {}
        rows.append({
            "lead_id": lead.get("id"),
            "contact": {
                "name": contact.get("name") or lead.get("first_name") or "",
                "phone": contact.get("phone") or lead.get("phone") or "",
                "email": contact.get("email") or lead.get("email") or "",
            },
            "asesor_id": asesor_id,
            "asesor_name": await _asesor_name(asesor_id),
            "project_id": lead.get("project_id") or "",
            "project_name": lead.get("project_name") or lead.get("project_id") or "",
            "suspected_match_lead_id": lead.get("suspected_match_id"),
            "velocity_count": lead.get("velocity_count"),
            "review_reason": lead.get("review_reason"),
            "created_at": lead.get("created_at"),
            "presupuesto": lead.get("presupuesto") or {},
        })

    return {"pending": rows, "count": len(rows)}


# ─── GET history ─────────────────────────────────────────────────────────────

@router.get("/api/dev/disputes/history")
async def list_dispute_history(
    request: Request,
    lead_id: Optional[str] = None,
    asesor_id: Optional[str] = None,
    limit: int = 50,
) -> Dict[str, Any]:
    user = await _auth_dev(request)
    db = _db(request)
    dev_org_id = _user_dev_org(user)
    limit = min(max(limit, 1), 200)

    query: Dict[str, Any] = {}
    if user.role != "superadmin":
        query["dev_org_id"] = dev_org_id
    if lead_id:
        query["lead_id"] = lead_id
    if asesor_id:
        query["asesor_id"] = asesor_id

    rows: List[Dict[str, Any]] = []
    cursor = db.asesor_dispute_history.find(query, {"_id": 0}).sort("resolved_at", -1).limit(limit)
    async for doc in cursor:
        rows.append(doc)
    return {"history": rows, "count": len(rows)}


# ─── Indexes ─────────────────────────────────────────────────────────────────

async def ensure_disputes_indexes(db) -> None:
    try:
        from pymongo import ASCENDING, DESCENDING
        await db.asesor_dispute_history.create_index(
            [("asesor_id", ASCENDING), ("project_id", ASCENDING), ("cooldown_until", ASCENDING)],
            name="asesor_project_cooldown_idx",
        )
        await db.asesor_dispute_history.create_index(
            [("dev_org_id", ASCENDING), ("resolved_at", DESCENDING)],
            name="org_resolved_idx",
        )
        await db.asesor_dispute_history.create_index("lead_id", name="lead_idx")
        await db.asesor_dispute_history.create_index("id", unique=True, sparse=True)
        log.info("[disputes] indexes OK")
    except Exception as exc:
        log.warning(f"[disputes] index creation warning: {exc}")
