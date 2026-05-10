"""W4.6 Y.3A — Agentic CRM REST routes (Smart Routing).

Endpoints:
  POST   /api/agentic-crm/routings                       → ejecuta routing
  GET    /api/agentic-crm/routings                       → lista (filtros status, asesor_id)
  POST   /api/agentic-crm/routings/{id}/accept           → asesor acepta
  POST   /api/agentic-crm/routings/{id}/reject           → asesor rechaza + re-route
  POST   /api/agentic-crm/routings/{id}/reassign         → superadmin override
  GET    /api/superadmin/agentic-crm/routings/metrics    → métricas dashboard

Permission: developer/inmobiliaria own org · superadmin any · 403 cross-org.
Rate limit handled inside SmartRoutingEngine (50/min/org).
"""
from __future__ import annotations

import logging
import time
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from agentic_crm.smart_routing_engine import (
    SmartRoutingEngine,
    SmartRoutingDisabledError,
    SmartRoutingForbiddenError,
    SmartRoutingNotFoundError,
    SmartRoutingRateLimitError,
)
from agentic_crm.visit_prep_engine import (
    VisitPrepEngine,
    VisitPrepDisabledError,
    VisitPrepForbiddenError,
    VisitPrepNotFoundError,
    VisitPrepRateLimitError,
)

log = logging.getLogger("dmx.routes_agentic_crm")

router = APIRouter(tags=["agentic-crm"])

ROUTING_ROLES = {"developer_admin", "developer_member", "inmobiliaria_admin",
                 "inmobiliaria_director", "inmobiliaria_member",
                 "advisor", "asesor", "asesor_admin", "asesor_freelance",
                 "superadmin"}

# In-process rate limit per user · 30 calls/min
_user_minute_buckets: Dict[str, List[float]] = {}
USER_MIN_CAP = 30


def _clean_routing_doc(doc: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(doc)
    if "_id" in out:
        out["routing_id"] = out.pop("_id")
    for k in ("routed_at", "expires_at", "accepted_at", "rejected_at",
              "reassigned_at"):
        v = out.get(k)
        if isinstance(v, datetime):
            out[k] = v.isoformat()
    return out


def _check_user_rate(user_id: str) -> bool:
    now = time.monotonic()
    bucket = _user_minute_buckets.setdefault(user_id, [])
    _user_minute_buckets[user_id] = [t for t in bucket if now - t < 60]
    if len(_user_minute_buckets[user_id]) >= USER_MIN_CAP:
        return False
    _user_minute_buckets[user_id].append(now)
    return True


async def _get_user(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    return user


async def _require_authorized(request: Request, target_org_id: Optional[str] = None):
    user = await _get_user(request)
    role = getattr(user, "role", "")
    if role not in ROUTING_ROLES:
        raise HTTPException(403, "Rol no autorizado")
    if not _check_user_rate(getattr(user, "user_id", "anon")):
        raise HTTPException(429, "Rate limit (30 calls/min). Intenta más tarde.")
    if target_org_id and role != "superadmin":
        user_org = getattr(user, "tenant_id", None)
        if user_org and user_org != target_org_id:
            raise HTTPException(403, "Cross-org acceso denegado")
    return user


def _resolve_org(user, override_org_id: Optional[str]) -> str:
    role = getattr(user, "role", "")
    if role == "superadmin" and override_org_id:
        return override_org_id
    return getattr(user, "tenant_id", None) or override_org_id or "dmx"


# ─── Pydantic ─────────────────────────────────────────────────────────────────
class RouteIn(BaseModel):
    lead_id: str = Field(..., min_length=2, max_length=120)
    org_id: Optional[str] = None
    simulation_override: bool = False


class RejectIn(BaseModel):
    reason: str = Field(..., min_length=2, max_length=300)


class ReassignIn(BaseModel):
    new_asesor_id: str = Field(..., min_length=2, max_length=120)
    reason: str = Field(..., min_length=2, max_length=300)


# ─── Endpoints ────────────────────────────────────────────────────────────────
@router.post("/api/agentic-crm/routings", status_code=201)
async def create_routing(payload: RouteIn, request: Request):
    user = await _require_authorized(request)
    db = request.app.state.db
    # Resolve lead's org_id
    lead = await db.leads.find_one({"id": payload.lead_id}, {"_id": 0, "dev_org_id": 1})
    if not lead:
        raise HTTPException(404, f"Lead {payload.lead_id} no encontrado")
    lead_org = lead.get("dev_org_id")
    role = getattr(user, "role", "")
    if role != "superadmin" and lead_org and getattr(user, "tenant_id", None) != lead_org:
        raise HTTPException(403, "Lead pertenece a otra org")
    org_id = _resolve_org(user, payload.org_id or lead_org)

    try:
        engine = SmartRoutingEngine(db, org_id)
        result = await engine.route_lead(payload.lead_id, simulation_override=payload.simulation_override)
        return {"ok": True, **result}
    except SmartRoutingDisabledError as e:
        raise HTTPException(403, str(e))
    except SmartRoutingRateLimitError as e:
        raise HTTPException(429, str(e))
    except SmartRoutingNotFoundError as e:
        raise HTTPException(404, str(e))
    except SmartRoutingForbiddenError as e:
        raise HTTPException(403, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/api/agentic-crm/routings")
async def list_routings(
    request: Request,
    status: Optional[str] = Query(None, pattern=r"^(pending|accepted|rejected|reassigned|expired|all)$"),
    asesor_id: Optional[str] = Query(None),
    org_id: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    user = await _require_authorized(request, org_id)
    db = request.app.state.db
    role = getattr(user, "role", "")
    target_org = _resolve_org(user, org_id)

    q: Dict[str, Any] = {"org_id": target_org} if role != "superadmin" or org_id else {}
    if role == "superadmin" and not org_id:
        # superadmin sin filtro · ver todo
        pass
    if status and status != "all":
        q["status"] = status
    if asesor_id:
        q["suggested_asesor_id"] = asesor_id

    cur = db.lead_routings.find(q).sort("routed_at", -1).limit(limit)
    rows = []
    async for d in cur:
        rows.append(_clean_routing_doc(d))
    return {"ok": True, "count": len(rows), "routings": rows}


@router.post("/api/agentic-crm/routings/{routing_id}/accept")
async def accept_routing(routing_id: str, request: Request):
    user = await _require_authorized(request)
    db = request.app.state.db
    doc = await db.lead_routings.find_one({"_id": routing_id}, {"_id": 1, "org_id": 1, "suggested_asesor_id": 1})
    if not doc:
        raise HTTPException(404, "Routing no encontrado")
    role = getattr(user, "role", "")
    if role != "superadmin" and getattr(user, "tenant_id", None) != doc["org_id"]:
        raise HTTPException(403, "Cross-org acceso denegado")
    try:
        engine = SmartRoutingEngine(db, doc["org_id"])
        return {"ok": True, **await engine.accept_routing(routing_id)}
    except (SmartRoutingNotFoundError, SmartRoutingForbiddenError) as e:
        raise HTTPException(404 if isinstance(e, SmartRoutingNotFoundError) else 403, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/api/agentic-crm/routings/{routing_id}/reject")
async def reject_routing(routing_id: str, payload: RejectIn, request: Request):
    user = await _require_authorized(request)
    db = request.app.state.db
    doc = await db.lead_routings.find_one({"_id": routing_id}, {"_id": 1, "org_id": 1})
    if not doc:
        raise HTTPException(404, "Routing no encontrado")
    role = getattr(user, "role", "")
    if role != "superadmin" and getattr(user, "tenant_id", None) != doc["org_id"]:
        raise HTTPException(403, "Cross-org acceso denegado")
    try:
        engine = SmartRoutingEngine(db, doc["org_id"])
        return {"ok": True, **await engine.reject_routing(routing_id, payload.reason)}
    except SmartRoutingNotFoundError as e:
        raise HTTPException(404, str(e))
    except SmartRoutingForbiddenError as e:
        raise HTTPException(403, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/api/agentic-crm/routings/{routing_id}/reassign")
async def reassign_routing(routing_id: str, payload: ReassignIn, request: Request):
    user = await _require_authorized(request)
    role = getattr(user, "role", "")
    db = request.app.state.db
    doc = await db.lead_routings.find_one({"_id": routing_id}, {"_id": 1, "org_id": 1})
    if not doc:
        raise HTTPException(404, "Routing no encontrado")
    # Solo superadmin o admin de org puede reassign
    if role not in {"superadmin", "developer_admin", "inmobiliaria_admin", "inmobiliaria_director"}:
        raise HTTPException(403, "Reassign requiere rol admin/superadmin")
    if role != "superadmin" and getattr(user, "tenant_id", None) != doc["org_id"]:
        raise HTTPException(403, "Cross-org acceso denegado")
    try:
        engine = SmartRoutingEngine(db, doc["org_id"])
        return {"ok": True, **await engine.reassign(routing_id, payload.new_asesor_id, payload.reason)}
    except SmartRoutingNotFoundError as e:
        raise HTTPException(404, str(e))
    except SmartRoutingForbiddenError as e:
        raise HTTPException(403, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/api/superadmin/agentic-crm/routings/metrics")
async def superadmin_metrics(
    request: Request,
    org_id: str = Query(..., min_length=2),
    days: int = Query(30, ge=1, le=180),
):
    from permissions import require_superadmin
    await require_superadmin(request)
    db = request.app.state.db

    engine = SmartRoutingEngine(db, org_id)
    refresh = await engine.update_routing_metrics(period_days=days)

    cur = db.routing_metrics.find({"org_id": org_id}, {"_id": 0}).sort("updated_at", -1).limit(200)
    rows = []
    async for d in cur:
        for k in ("period_start", "period_end", "updated_at"):
            v = d.get(k)
            if isinstance(v, datetime):
                d[k] = v.isoformat()
        rows.append(d)

    # Aggregate org-level summary
    agg_cur = db.lead_routings.aggregate([
        {"$match": {"org_id": org_id}},
        {"$group": {
            "_id": "$status",
            "count": {"$sum": 1},
            "avg_fit": {"$avg": "$fit_score"},
        }},
    ])
    by_status = {}
    async for r in agg_cur:
        by_status[r["_id"]] = {"count": r["count"], "avg_fit": round(r.get("avg_fit") or 0, 1)}

    layer_cur = db.lead_routings.aggregate([
        {"$match": {"org_id": org_id}},
        {"$group": {"_id": "$routing_layer", "count": {"$sum": 1}}},
    ])
    by_layer = {}
    async for r in layer_cur:
        by_layer[r["_id"] or "unknown"] = r["count"]

    return {
        "ok": True, "org_id": org_id, "days": days,
        "refresh": refresh, "metrics": rows,
        "summary": {"by_status": by_status, "by_layer": by_layer},
    }


# ─── W4.6 Y.3B · Visit Prep Automation ────────────────────────────────────────
class VisitPrepGenerateIn(BaseModel):
    lead_id: str = Field(..., min_length=2, max_length=120)
    asesor_id: str = Field(..., min_length=2, max_length=120)
    project_id: str = Field(..., min_length=2, max_length=120)
    visit_scheduled_at: str = Field(..., min_length=10, max_length=40)
    org_id: Optional[str] = None
    simulation_override: bool = False


# In-process visit-prep user rate limit · 30/min
_user_vp_buckets: Dict[str, List[float]] = {}
USER_VP_CAP = 30


def _check_user_vp_rate(user_id: str) -> bool:
    now = time.monotonic()
    bucket = _user_vp_buckets.setdefault(user_id, [])
    _user_vp_buckets[user_id] = [t for t in bucket if now - t < 60]
    if len(_user_vp_buckets[user_id]) >= USER_VP_CAP:
        return False
    _user_vp_buckets[user_id].append(now)
    return True


def _clean_dossier_doc(doc: Dict[str, Any]) -> Dict[str, Any]:
    out = {k: v for k, v in doc.items() if k != "_id"}
    out["dossier_id"] = doc.get("_id") or doc.get("dossier_id")
    for k in ("visit_scheduled_at", "dossier_generated_at",
              "sent_email_at", "viewed_at", "expires_at"):
        v = out.get(k)
        if isinstance(v, datetime):
            out[k] = v.isoformat()
    return out


@router.post("/api/agentic-crm/visit-prep/generate", status_code=201)
async def generate_visit_prep(payload: VisitPrepGenerateIn, request: Request):
    user = await _get_user(request)
    role = getattr(user, "role", "")
    if role not in ROUTING_ROLES:
        raise HTTPException(403, "Rol no autorizado")
    if not _check_user_vp_rate(getattr(user, "user_id", "anon")):
        raise HTTPException(429, "Rate limit (30 calls/min). Intenta más tarde.")

    db = request.app.state.db
    # Resolve org from lead
    lead = await db.leads.find_one({"id": payload.lead_id}, {"_id": 0, "dev_org_id": 1})
    if not lead:
        raise HTTPException(404, f"Lead {payload.lead_id} no encontrado")
    lead_org = lead.get("dev_org_id")
    if role != "superadmin" and lead_org and getattr(user, "tenant_id", None) != lead_org:
        raise HTTPException(403, "Lead pertenece a otra org")
    org_id = _resolve_org(user, payload.org_id or lead_org)

    # Asesor permission: asesor solo puede generar para sí mismo
    if role in {"advisor", "asesor", "asesor_freelance"} and getattr(user, "user_id", None) != payload.asesor_id:
        raise HTTPException(403, "Asesor solo puede generar sus propios dossiers")

    try:
        engine = VisitPrepEngine(db, org_id)
        result = await engine.generate_dossier(
            payload.lead_id, payload.asesor_id, payload.project_id,
            payload.visit_scheduled_at,
            simulation_override=payload.simulation_override,
        )
        return {"ok": True, **result}
    except VisitPrepDisabledError as e:
        raise HTTPException(403, str(e))
    except VisitPrepRateLimitError as e:
        raise HTTPException(429, str(e))
    except VisitPrepNotFoundError as e:
        raise HTTPException(404, str(e))
    except VisitPrepForbiddenError as e:
        raise HTTPException(403, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/api/agentic-crm/visit-prep/dossiers")
async def list_dossiers(
    request: Request,
    asesor_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None, pattern=r"^(generated|sent|viewed|expired|all)$"),
    org_id: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    user = await _require_authorized(request, org_id)
    db = request.app.state.db
    role = getattr(user, "role", "")
    target_org = _resolve_org(user, org_id)

    q: Dict[str, Any] = {}
    if role != "superadmin" or org_id:
        q["org_id"] = target_org
    # asesor restringido a su propio asesor_id
    if role in {"advisor", "asesor", "asesor_freelance"}:
        q["asesor_id"] = getattr(user, "user_id", "")
    elif asesor_id:
        q["asesor_id"] = asesor_id
    if status and status != "all":
        q["status"] = status

    cur = db.visit_prep_dossiers.find(q).sort("dossier_generated_at", -1).limit(limit)
    rows = []
    async for d in cur:
        rows.append(_clean_dossier_doc(d))
    return {"ok": True, "count": len(rows), "dossiers": rows}


@router.post("/api/agentic-crm/visit-prep/dossiers/{dossier_id}/mark-viewed")
async def mark_dossier_viewed(dossier_id: str, request: Request):
    user = await _get_user(request)
    role = getattr(user, "role", "")
    if role not in ROUTING_ROLES:
        raise HTTPException(403, "Rol no autorizado")
    db = request.app.state.db
    doc = await db.visit_prep_dossiers.find_one(
        {"_id": dossier_id}, {"_id": 1, "org_id": 1, "asesor_id": 1},
    )
    if not doc:
        raise HTTPException(404, "Dossier no encontrado")
    if role != "superadmin" and getattr(user, "tenant_id", None) != doc["org_id"]:
        raise HTTPException(403, "Cross-org acceso denegado")

    asesor_filter = None
    if role in {"advisor", "asesor", "asesor_freelance"}:
        asesor_filter = getattr(user, "user_id", None)

    try:
        engine = VisitPrepEngine(db, doc["org_id"])
        return {"ok": True, **await engine.mark_viewed(dossier_id, asesor_id=asesor_filter)}
    except VisitPrepNotFoundError as e:
        raise HTTPException(404, str(e))
    except VisitPrepForbiddenError as e:
        raise HTTPException(403, str(e))
