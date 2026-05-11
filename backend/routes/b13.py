"""Phase 4 Batch 13 Sub-chunk B+C — Tracking attribution + Cross-portal sync.

Endpoints
---------
  POST  /api/leads/public                        — public marketplace lead form (no auth)
  POST  /api/leads/:lead_id/attribution          — append touchpoint (auth)
  GET   /api/leads/:lead_id/attribution          — full attribution chain (auth)

  GET   /api/dev/settings/attribution-model       — current dev_org config
  PATCH /api/dev/settings/attribution-model       — set 'first'|'last'|'split'

  GET   /api/asesor/tracking-links                — list available projects + generate links
  POST  /api/asesor/tracking-links/qrcode         — generate QR (PNG dataURL) for a link
  GET   /api/asesor/tracking-links/stats          — views + conversions per link

  GET   /api/dev/leads/kanban-unified             — leads visible across both project sources
  POST  /api/cross-portal/sync-check              — manual sync verification
"""
from __future__ import annotations

import asyncio
import base64
import io
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

log = logging.getLogger("dmx.b13")
router = APIRouter(tags=["b13_tracking"])


def _now():
    return datetime.now(timezone.utc)


def _db(req: Request):
    return req.app.state.db


async def _auth(req: Request, roles=None):
    from server import get_current_user
    user = await get_current_user(req)
    if not user:
        raise HTTPException(401, "No autenticado")
    if roles and user.role not in roles:
        raise HTTPException(403, f"Requiere rol en {roles}")
    return user


def _uid(prefix):
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def _tenant(user):
    return getattr(user, "tenant_id", None) or getattr(user, "org_id", None) or "default"


# ═════════════════════════════════════════════════════════════════════════════
# ATTRIBUTION SCHEMA
# ═════════════════════════════════════════════════════════════════════════════

class Touchpoint(BaseModel):
    asesor_id: Optional[str] = None
    source: str = "web_form"  # web_form|caya_bot|asesor_link|feria|...
    url_original: Optional[str] = None
    referrer_url: Optional[str] = None
    user_agent: Optional[str] = None
    ip: Optional[str] = None
    cookie_value: Optional[str] = None
    timestamp: Optional[str] = None  # ISO; defaults to now if missing


class AttributionSnapshot(BaseModel):
    touchpoints: List[Touchpoint] = []
    current_url: Optional[str] = None
    referrer: Optional[str] = None
    cookie_ref: Optional[str] = None  # the ?ref=asesor_id seen


# ═════════════════════════════════════════════════════════════════════════════
# PUBLIC LEAD FORM (marketplace, NO auth)
# ═════════════════════════════════════════════════════════════════════════════

class PublicLeadCreate(BaseModel):
    project_id: str
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    intent: Optional[str] = None
    message: Optional[str] = None
    attribution: Optional[AttributionSnapshot] = None


@router.post("/api/leads/public")
async def public_lead_create(payload: PublicLeadCreate, request: Request):
    """No-auth public lead capture. Captures attribution from snapshot."""
    db = _db(request)
    if not payload.email and not payload.phone:
        raise HTTPException(422, "Email o teléfono requerido")

    # Resolve project's dev_org_id
    from projects_unified import get_project_by_slug
    project = await get_project_by_slug(db, payload.project_id)
    if not project:
        raise HTTPException(404, "Proyecto no encontrado")
    dev_org_id = project.get("dev_org_id") or project.get("developer_id") or "default"

    # Determine assigned asesor based on attribution model
    attr = payload.attribution
    first_touch = last_touch = None
    if attr and attr.touchpoints:
        for tp in attr.touchpoints:
            if tp.asesor_id:
                first_touch = first_touch or tp.asesor_id
                last_touch = tp.asesor_id

    # Read attribution model from dev_org settings
    settings = await db.dev_org_settings.find_one(
        {"dev_org_id": dev_org_id}, {"_id": 0}
    ) or {}
    model = settings.get("attribution_model", "last")
    assigned_to = (first_touch if model == "first" else last_touch) or None

    now_iso = _now().isoformat()
    lead_id = _uid("lead")
    lead = {
        "id": lead_id,
        "dev_org_id": dev_org_id,
        "project_id": payload.project_id,
        "development_id": payload.project_id,  # alias used by dev portal
        "source": "marketplace_public",
        "source_metadata": {
            "current_url": attr.current_url if attr else None,
            "referrer": attr.referrer if attr else None,
            "cookie_ref": attr.cookie_ref if attr else None,
        },
        "contact": {"name": payload.name, "email": payload.email, "phone": payload.phone},
        "intent": payload.intent,
        "status": "nuevo",
        "assigned_to": assigned_to,
        "created_at": now_iso, "updated_at": now_iso, "last_activity_at": now_iso,
        "created_by": "_public_form",
        "attribution_model_used": model,
        "first_touch_asesor_id": first_touch,
        "last_touch_asesor_id": last_touch,
    }
    await db.leads.insert_one(dict(lead))
    lead.pop("_id", None)

    # Persist attribution chain
    touchpoints_dump = []
    if attr and attr.touchpoints:
        for tp in attr.touchpoints:
            d = tp.model_dump()
            d.setdefault("timestamp", now_iso)
            touchpoints_dump.append(d)
    await db.lead_source_attribution.update_one(
        {"lead_id": lead_id},
        {"$set": {
            "lead_id": lead_id,
            "dev_org_id": dev_org_id,
            "project_id": payload.project_id,
            "touchpoints": touchpoints_dump,
            "first_touch_asesor_id": first_touch,
            "last_touch_asesor_id": last_touch,
            "attribution_model": model,
            "created_at": now_iso,
        }},
        upsert=True,
    )

    # Notify assigned asesor
    if assigned_to:
        await db.notifications.insert_one({
            "id": f"notif_{uuid.uuid4().hex[:12]}",
            "user_id": assigned_to, "dev_org_id": dev_org_id,
            "type": "lead_attributed",
            "ref_id": lead_id,
            "title": "Nuevo lead atribuido",
            "body": f"{payload.name} preguntó por {project.get('name', payload.project_id)}",
            "link": f"/desarrollador/leads?id={lead_id}",
            "read": False, "created_at": now_iso,
        })

    # Also notify dev_admins for visibility
    async for da in db.users.find(
        {"tenant_id": dev_org_id, "role": "developer_admin"}, {"_id": 0, "user_id": 1}
    ):
        await db.notifications.insert_one({
            "id": f"notif_{uuid.uuid4().hex[:12]}",
            "user_id": da["user_id"], "dev_org_id": dev_org_id,
            "type": "lead_new_marketplace",
            "ref_id": lead_id,
            "title": "Nuevo lead desde marketplace",
            "body": f"{payload.name} · {project.get('name', payload.project_id)}",
            "link": f"/desarrollador/leads?id={lead_id}",
            "read": False, "created_at": now_iso,
        })

    # ml_event
    try:
        from observability import emit_ml_event
        asyncio.create_task(emit_ml_event(
            db, "lead_attribution_captured",
            "_public", dev_org_id, "anonymous",
            context={"lead_id": lead_id, "model": model,
                     "first": first_touch, "last": last_touch,
                     "touchpoints": len(touchpoints_dump)},
        ))
    except Exception:
        pass

    return {"ok": True, "lead_id": lead_id, "assigned_to": assigned_to,
            "attribution_model": model}


# ═════════════════════════════════════════════════════════════════════════════
# ATTRIBUTION READ + APPEND
# ═════════════════════════════════════════════════════════════════════════════

@router.get("/api/leads/{lead_id}/attribution")
async def get_attribution(lead_id: str, request: Request):
    user = await _auth(request)
    db = _db(request)
    doc = await db.lead_source_attribution.find_one({"lead_id": lead_id}, {"_id": 0})
    if not doc:
        return {"lead_id": lead_id, "empty": True, "touchpoints": []}
    return doc


class TouchpointAppend(BaseModel):
    touchpoint: Touchpoint


@router.post("/api/leads/{lead_id}/attribution")
async def append_touchpoint(lead_id: str, payload: TouchpointAppend, request: Request):
    user = await _auth(request)
    db = _db(request)
    tp = payload.touchpoint.model_dump()
    tp.setdefault("timestamp", _now().isoformat())
    await db.lead_source_attribution.update_one(
        {"lead_id": lead_id},
        {"$push": {"touchpoints": tp},
         "$setOnInsert": {"lead_id": lead_id, "created_at": _now().isoformat()}},
        upsert=True,
    )
    return {"ok": True}


# ═════════════════════════════════════════════════════════════════════════════
# DEV ORG SETTINGS — attribution model
# ═════════════════════════════════════════════════════════════════════════════

VALID_MODELS = ("first", "last", "split")


@router.get("/api/dev/settings/attribution-model")
async def get_attribution_model(request: Request):
    user = await _auth(request, ["developer_admin", "developer_member", "director", "superadmin"])
    db = _db(request)
    org = _tenant(user)
    s = await db.dev_org_settings.find_one({"dev_org_id": org}, {"_id": 0}) or {}
    return {"dev_org_id": org, "model": s.get("attribution_model", "last")}


class AttributionModelPatch(BaseModel):
    model: str = Field(..., description="'first' | 'last' | 'split'")


@router.patch("/api/dev/settings/attribution-model")
async def set_attribution_model(payload: AttributionModelPatch, request: Request):
    user = await _auth(request, ["developer_admin", "director", "superadmin"])
    db = _db(request)
    if payload.model not in VALID_MODELS:
        raise HTTPException(400, f"Modelo inválido. Usar: {VALID_MODELS}")
    org = _tenant(user)
    now_iso = _now().isoformat()
    await db.dev_org_settings.update_one(
        {"dev_org_id": org},
        {"$set": {"dev_org_id": org, "attribution_model": payload.model,
                   "updated_at": now_iso, "updated_by": user.user_id}},
        upsert=True,
    )
    try:
        import audit_log as al
        asyncio.create_task(al.log_mutation(
            db, user_id=user.user_id, role=user.role, org_id=org,
            action="update", entity_type="dev_org_settings",
            entity_id=org, before=None,
            after={"attribution_model": payload.model},
        ))
        from observability import emit_ml_event
        asyncio.create_task(emit_ml_event(
            db, "attribution_model_changed",
            user.user_id, org, user.role,
            context={"model": payload.model},
        ))
    except Exception:
        pass
    return {"ok": True, "model": payload.model}


# ═════════════════════════════════════════════════════════════════════════════
# ASESOR TRACKING LINKS
# ═════════════════════════════════════════════════════════════════════════════

@router.get("/api/asesor/tracking-links")
async def list_tracking_links(request: Request):
    user = await _auth(request, ["asesor", "advisor", "developer_admin", "developer_member", "superadmin"])
    db = _db(request)
    # List visible projects (broker whitelist or all if dev_admin)
    from projects_unified import get_all_projects
    projects = await get_all_projects(db)
    # Filter based on role
    if user.role in ("asesor", "advisor"):
        # Show projects where user has broker whitelist OR pre-asignación
        broker_pids = set()
        async for b in db.project_brokers.find(
            {"broker_user_id": user.user_id, "status": "active"},
            {"_id": 0, "project_id": 1}
        ):
            broker_pids.add(b["project_id"])
        async for pa in db.project_preassignments.find(
            {"assigned_user_id": user.user_id, "active": True},
            {"_id": 0, "project_id": 1}
        ):
            broker_pids.add(pa["project_id"])
        projects = [p for p in projects if p["id"] in broker_pids]

    base = "https://desarrollosmx.io"  # production marketing host
    links = []
    for p in projects[:50]:
        slug = p["id"]
        link = f"{base}/desarrollo/{slug}?ref={user.user_id}"
        # Stats
        views = await db.tracking_link_events.count_documents({
            "asesor_id": user.user_id, "project_id": slug, "event": "view"
        })
        conversions = await db.lead_source_attribution.count_documents({
            "first_touch_asesor_id": user.user_id, "project_id": slug
        })
        links.append({
            "project_id": slug,
            "project_name": p.get("name"),
            "colonia": p.get("colonia"),
            "link": link,
            "views": views,
            "conversions": conversions,
            "entity_source": p.get("entity_source"),
        })
    return {"items": links, "asesor_id": user.user_id}


class QRCodePayload(BaseModel):
    url: str


@router.post("/api/asesor/tracking-links/qrcode")
async def generate_qrcode(payload: QRCodePayload, request: Request):
    await _auth(request, ["asesor", "advisor", "developer_admin", "superadmin"])
    try:
        import qrcode
        img = qrcode.make(payload.url)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        b64 = base64.b64encode(buf.getvalue()).decode("ascii")
        return {"data_url": f"data:image/png;base64,{b64}"}
    except Exception as e:
        log.warning(f"qrcode failed: {e}")
        return {"error": str(e), "data_url": None}


@router.get("/api/asesor/tracking-links/stats")
async def tracking_stats(request: Request):
    user = await _auth(request, ["asesor", "advisor", "developer_admin", "superadmin"])
    db = _db(request)
    total_views = await db.tracking_link_events.count_documents({
        "asesor_id": user.user_id, "event": "view"
    })
    total_conversions = await db.lead_source_attribution.count_documents({
        "first_touch_asesor_id": user.user_id
    })
    rate = round((total_conversions / total_views * 100), 2) if total_views else 0
    return {"asesor_id": user.user_id,
            "total_views": total_views,
            "total_conversions": total_conversions,
            "conversion_rate_pct": rate}


# Public endpoint that asesor links hit — captures view event
@router.post("/api/tracking/view")
async def track_view(request: Request):
    """Public endpoint hit by frontend when ?ref param detected on landing."""
    db = _db(request)
    body = await request.json()
    asesor_id = body.get("asesor_id")
    project_id = body.get("project_id")
    if not asesor_id:
        return {"ok": False, "reason": "no_asesor_id"}
    await db.tracking_link_events.insert_one({
        "id": _uid("evt"),
        "asesor_id": asesor_id,
        "project_id": project_id,
        "event": "view",
        "url": body.get("url"),
        "referrer": body.get("referrer"),
        "user_agent": body.get("user_agent"),
        "timestamp": _now().isoformat(),
    })
    return {"ok": True}


# ═════════════════════════════════════════════════════════════════════════════
# CROSS-PORTAL UNIFIED ENDPOINTS
# ═════════════════════════════════════════════════════════════════════════════

@router.get("/api/dev/leads/kanban-unified")
async def kanban_unified(request: Request):
    """Returns leads across both DEVELOPMENTS + db.projects sources."""
    user = await _auth(request, ["developer_admin", "developer_member", "director", "superadmin"])
    db = _db(request)
    org = _tenant(user)
    from projects_unified import get_all_projects
    projects = await get_all_projects(db, org)
    project_ids = [p["id"] for p in projects]

    columns = ["nuevo", "contactado", "qualified", "negociacion", "cerrado_ganado", "cerrado_perdido"]
    by_status: Dict[str, List[Dict]] = {c: [] for c in columns}
    async for lead in db.leads.find(
        {"$or": [{"project_id": {"$in": project_ids}},
                 {"development_id": {"$in": project_ids}}],
         "dev_org_id": org},
        {"_id": 0}
    ).limit(500):
        st = lead.get("status", "nuevo")
        if st in by_status:
            by_status[st].append(lead)

    return {
        "columns": [{"key": c, "label": c.replace("_", " ").title(),
                     "count": len(by_status[c]), "leads": by_status[c]}
                    for c in columns],
        "projects_visible": len(projects),
    }


# ═════════════════════════════════════════════════════════════════════════════
# CROSS-PORTAL SYNC HEALTH (probe support)
# ═════════════════════════════════════════════════════════════════════════════

@router.post("/api/cross-portal/sync-check")
async def cross_portal_sync_check(request: Request):
    user = await _auth(request, ["developer_admin", "director", "superadmin"])
    db = _db(request)
    org = _tenant(user)
    from projects_unified import get_all_projects
    projects = await get_all_projects(db, org)
    issues: List[Dict] = []
    for p in projects:
        # Check that wizard projects have at least 1 unit
        units_n = 0
        if p["entity_source"] == "developments":
            units_n = len(p.get("units", []) or [])
        else:
            units_n = await db.units.count_documents({"project_id": p["id"]})
        if units_n == 0:
            issues.append({
                "project_id": p["id"], "issue": "no_units",
                "entity_source": p["entity_source"],
            })
    try:
        from observability import emit_ml_event
        asyncio.create_task(emit_ml_event(
            db, "cross_portal_sync_check",
            user.user_id, org, user.role,
            context={"projects_checked": len(projects), "issues": len(issues)},
        ))
    except Exception:
        pass
    return {"projects_checked": len(projects), "issues": issues, "ok": len(issues) == 0}


# ═════════════════════════════════════════════════════════════════════════════
# INDEXES
# ═════════════════════════════════════════════════════════════════════════════

async def ensure_b13_indexes(db):
    await db.lead_source_attribution.create_index("lead_id", unique=True, background=True)
    await db.lead_source_attribution.create_index("first_touch_asesor_id", background=True)
    await db.lead_source_attribution.create_index("last_touch_asesor_id", background=True)
    await db.dev_org_settings.create_index("dev_org_id", unique=True, background=True)
    await db.tracking_link_events.create_index(
        [("asesor_id", 1), ("project_id", 1), ("timestamp", -1)], background=True
    )
    await db.developer_project_patches.create_index("project_id", unique=True, background=True)
