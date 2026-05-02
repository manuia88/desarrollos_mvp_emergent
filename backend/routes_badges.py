"""Phase 4 Batch 0 Sub-chunk C — Badge counter endpoints.
Called by PortalLayout.js every 60s to show real badge counts in sidebar nav items.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Request

log = logging.getLogger("dmx.badges")
router = APIRouter(tags=["badges"])


def _now():
    return datetime.now(timezone.utc)


def _db(request: Request):
    return request.app.state.db


async def _auth(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    return user


# ─── Dev badge endpoints ───────────────────────────────────────────────────────

@router.get("/api/dev/leads/count-unread")
async def count_unread_leads(request: Request):
    """Leads asignados al org que no han sido leídos/marcados como vistos."""
    user = await _auth(request)
    db = _db(request)
    org = getattr(user, "tenant_id", None) or "default"
    try:
        q = {"dev_org_id": org, "unread_by_user": True}
        if user.role not in ("developer_admin", "developer_director", "superadmin"):
            q["assigned_to"] = getattr(user, "user_id", "")
        count = await db.leads.count_documents(q)
    except Exception:
        count = 0
    return {"count": count}


@router.get("/api/dev/citas/count-today")
async def count_citas_today(request: Request):
    """Citas/appointments programadas para hoy scoped al usuario."""
    user = await _auth(request)
    db = _db(request)
    org = getattr(user, "tenant_id", None) or "default"
    now = _now()
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    day_end = now.replace(hour=23, minute=59, second=59, microsecond=0).isoformat()
    try:
        q = {
            "datetime": {"$gte": day_start, "$lte": day_end},
            "status": {"$in": ["scheduled", "confirmed", "programada", "confirmada"]},
        }
        if user.role not in ("developer_admin", "developer_director", "superadmin"):
            q["$or"] = [{"assigned_to": getattr(user, "user_id", "")}, {"dev_org_id": org}]
        else:
            q["dev_org_id"] = org
        count = await db.appointments.count_documents(q)
    except Exception:
        count = 0
    return {"count": count}


@router.get("/api/dev/projects/count-unhealthy")
async def count_unhealthy_projects(request: Request):
    """Proyectos en el dev_org cuyo health_score < 60."""
    user = await _auth(request)
    db = _db(request)
    org = getattr(user, "tenant_id", None) or "default"
    try:
        q: dict = {"health_score": {"$lt": 60}}
        if user.role != "superadmin":
            q["dev_org_id"] = org
        count = await db.dev_project_meta.count_documents(q)
        if count == 0:
            # Fallback: check ie_scores collection for low-scoring developments
            count = await db.ie_scores.count_documents({
                "scope": "development",
                "value": {"$lt": 60},
                **({"dev_org_id": org} if user.role != "superadmin" else {}),
            })
    except Exception:
        count = 0
    return {"count": count}


# ─── Asesor badge endpoints ────────────────────────────────────────────────────

@router.get("/api/asesor/contacts/count-new")
async def count_new_asesor_contacts(request: Request):
    """Contactos nuevos en los últimos 7 días asignados al asesor."""
    user = await _auth(request)
    db = _db(request)
    uid = getattr(user, "user_id", "")
    since = (_now() - timedelta(days=7)).isoformat()
    try:
        q = {
            "created_at": {"$gte": since},
            "$or": [{"assigned_to": uid}, {"advisor_id": uid}],
        }
        count = await db.leads.count_documents(q)
    except Exception:
        count = 0
    return {"count": count}
