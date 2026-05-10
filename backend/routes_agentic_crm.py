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

import asyncio
import json
import logging
import os
import time
import uuid
from datetime import datetime, timedelta, timezone
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
from agentic_crm.reply_classifier_engine import (
    ReplyClassifierEngine,
    ReplyClassifierDisabledError,
    ReplyClassifierForbiddenError,
    ReplyClassifierNotFoundError,
    ReplyClassifierRateLimitError,
    ingest_webhook_reply,
)
from agentic_crm.disc_inferencer_engine import (
    DISCInferencer,
    DISCInferencerDisabledError,
    DISCInferencerForbiddenError,
    DISCInferencerNotFoundError,
    DISCInferencerRateLimitError,
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


# ─── W4.6 Y.3C · Reply Classifier (Resend inbound webhooks) ───────────────────
import hashlib  # noqa: E402
import hmac     # noqa: E402
import base64   # noqa: E402


def _verify_svix_signature(secret: str, raw_body: bytes,
                           svix_id: str, svix_timestamp: str, svix_signature: str) -> bool:
    """Verifica firma Svix-Signature (estándar Resend webhooks).

    Header svix-signature trae 1+ versiones: "v1,base64sig v1,base64sig2 ..."
    Firma se calcula como HMAC-SHA256 sobre `{svix_id}.{svix_timestamp}.{body}`.
    """
    if not (secret and svix_id and svix_timestamp and svix_signature):
        return False
    if secret.startswith("whsec_"):
        try:
            secret_bytes = base64.b64decode(secret[len("whsec_"):])
        except Exception:
            return False
    else:
        secret_bytes = secret.encode("utf-8")
    msg = f"{svix_id}.{svix_timestamp}.".encode("utf-8") + raw_body
    expected = base64.b64encode(hmac.new(secret_bytes, msg, hashlib.sha256).digest()).decode()
    for chunk in svix_signature.split():
        if "," not in chunk:
            continue
        _ver, sig = chunk.split(",", 1)
        if hmac.compare_digest(sig, expected):
            return True
    return False


@router.post("/api/agentic-crm/webhooks/resend-inbound")
async def resend_inbound_webhook(request: Request):
    """PÚBLICO · valida Svix-Signature de Resend antes de procesar."""
    secret = os.environ.get("RESEND_WEBHOOK_SECRET", "")
    raw_body = await request.body()
    svix_id = request.headers.get("svix-id", "")
    svix_ts = request.headers.get("svix-timestamp", "")
    svix_sig = request.headers.get("svix-signature", "")

    # En producción, secret obligatorio. Si está vacío → solo modo dev local.
    if secret and not _verify_svix_signature(secret, raw_body, svix_id, svix_ts, svix_sig):
        raise HTTPException(401, "Firma Svix inválida")

    try:
        payload = json.loads(raw_body) if raw_body else {}
    except json.JSONDecodeError:
        raise HTTPException(400, "Payload JSON inválido")

    db = request.app.state.db
    try:
        ingest_result = await ingest_webhook_reply(db, payload, raw_body)
    except Exception as e:  # noqa: BLE001
        log.exception(f"[resend_inbound] ingest failed: {e}")
        raise HTTPException(500, "Ingest error")

    reply_id = ingest_result["reply_id"]
    org_id = ingest_result.get("org_id") or "dmx"

    # Phase Y check fast-path: si OFF, NO clasifica (guarda crudo)
    try:
        from routes_phase_y_controls import get_phase_y_settings
        settings = await get_phase_y_settings(db, org_id)
        if not settings.get("agentic_enabled", False) or \
           (settings.get("feature_tiers") or {}).get("reply_classifier", "off") == "off":
            # 503 con info que el reply queda guardado para review
            return {"ok": True, "reply_id": reply_id, "classified": False,
                    "reason": "reply_classifier_disabled"}
    except Exception:
        pass

    # Async fire-and-forget classification
    async def _bg_classify():
        try:
            engine = ReplyClassifierEngine(db, org_id)
            await engine.classify_reply(reply_id)
        except Exception as e:  # noqa: BLE001
            log.warning(f"[resend_inbound] bg classify failed: {e}")

    asyncio.create_task(_bg_classify())
    return {"ok": True, "reply_id": reply_id, "classified": "async",
            "lead_id": ingest_result.get("lead_id"),
            "review_needed": ingest_result.get("review_needed")}


@router.get("/api/agentic-crm/replies")
async def list_replies(
    request: Request,
    asesor_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None, pattern=r"^(pending|action_taken|archived|all)$"),
    urgency: Optional[str] = Query(None, pattern=r"^(high|medium|low|all)$"),
    category: Optional[str] = Query(None),
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
    if role in {"advisor", "asesor", "asesor_freelance"}:
        q["asesor_id"] = getattr(user, "user_id", "")
    elif asesor_id:
        q["asesor_id"] = asesor_id
    if status and status != "all":
        q["status"] = status
    if urgency and urgency != "all":
        q["classification.urgency"] = urgency
    if category:
        q["classification.category"] = category

    cur = db.email_replies.find(q).sort([("classification.urgency", -1), ("received_at", -1)]).limit(limit)
    rows = []
    async for d in cur:
        out = {k: v for k, v in d.items() if k != "_id"}
        out["reply_id"] = d.get("_id")
        for k in ("received_at", "classified_at", "action_taken_at", "expires_at"):
            v = out.get(k)
            if isinstance(v, datetime):
                out[k] = v.isoformat()
        rows.append(out)
    return {"ok": True, "count": len(rows), "replies": rows}


class MarkActionTakenIn(BaseModel):
    action_type: Optional[str] = Field(None, max_length=64)
    action_data: Optional[Dict[str, Any]] = None


class EscalateReplyIn(BaseModel):
    manager_id: Optional[str] = Field(None, max_length=120)
    reason: str = Field(..., min_length=2, max_length=500)


@router.post("/api/agentic-crm/replies/{reply_id}/mark-action-taken")
async def mark_reply_action_taken(reply_id: str, request: Request,
                                   payload: Optional[MarkActionTakenIn] = None):
    user = await _get_user(request)
    role = getattr(user, "role", "")
    if role not in ROUTING_ROLES:
        raise HTTPException(403, "Rol no autorizado")
    db = request.app.state.db
    doc = await db.email_replies.find_one({"_id": reply_id}, {"_id": 1, "org_id": 1, "asesor_id": 1})
    if not doc:
        raise HTTPException(404, "Reply no encontrado")
    if role != "superadmin" and getattr(user, "tenant_id", None) != doc["org_id"]:
        raise HTTPException(403, "Cross-org acceso denegado")

    asesor_filter = None
    if role in {"advisor", "asesor", "asesor_freelance"}:
        asesor_filter = getattr(user, "user_id", None)

    try:
        engine = ReplyClassifierEngine(db, doc["org_id"])
        result = await engine.mark_action_taken(reply_id, asesor_id=asesor_filter)
    except ReplyClassifierNotFoundError as e:
        raise HTTPException(404, str(e))
    except ReplyClassifierForbiddenError as e:
        raise HTTPException(403, str(e))

    # Y.3C.5 — registrar action_type para tracking diferenciado
    action_type = (payload.action_type if payload else None) or "manual"
    try:
        await db.activity_log.insert_one({
            "id": f"act_{uuid.uuid4().hex[:12]}",
            "type": f"reply_classifier.one_click.{action_type}",
            "org_id": doc["org_id"],
            "reply_id": reply_id,
            "asesor_id": getattr(user, "user_id", None),
            "action_data": (payload.action_data if payload else None) or {},
            "created_at": datetime.now(timezone.utc),
        })
    except Exception:
        pass

    return {"ok": True, "action_type": action_type, **result}


@router.post("/api/agentic-crm/replies/{reply_id}/escalate")
async def escalate_reply(reply_id: str, payload: EscalateReplyIn, request: Request):
    """Y.3C.5 — escala reply a developer_admin/inmobiliaria_admin · envía email Resend."""
    user = await _get_user(request)
    role = getattr(user, "role", "")
    if role not in ROUTING_ROLES:
        raise HTTPException(403, "Rol no autorizado")
    db = request.app.state.db
    doc = await db.email_replies.find_one({"_id": reply_id})
    if not doc:
        raise HTTPException(404, "Reply no encontrado")
    if role != "superadmin" and getattr(user, "tenant_id", None) != doc["org_id"]:
        raise HTTPException(403, "Cross-org acceso denegado")

    org_id = doc["org_id"]
    # Resolver manager (manager_id explícito o primer admin de la org)
    if payload.manager_id:
        mgr = await db.users.find_one(
            {"user_id": payload.manager_id, "tenant_id": org_id,
             "role": {"$in": ["developer_admin", "inmobiliaria_admin", "developer_director", "inmobiliaria_director"]}},
            {"_id": 0, "user_id": 1, "name": 1, "email": 1, "role": 1},
        )
    else:
        mgr = await db.users.find_one(
            {"tenant_id": org_id,
             "role": {"$in": ["developer_admin", "inmobiliaria_admin", "developer_director", "inmobiliaria_director"]}},
            {"_id": 0, "user_id": 1, "name": 1, "email": 1, "role": 1},
        )

    sent_ok = False
    sent_reason = None
    if mgr and mgr.get("email"):
        api_key = os.environ.get("RESEND_API_KEY")
        if api_key:
            cls = doc.get("classification") or {}
            color = {"high": "#EF4444", "medium": "#F59E0B", "low": "#10B981"}.get(
                cls.get("urgency"), "#6366F1")
            preview = (doc.get("body_text") or "")[:600]
            html = f"""<!doctype html><html><body style="background:#F0EBE0;padding:20px;font-family:Arial,sans-serif;">
<div style="max-width:640px;margin:0 auto;background:#fff;border-radius:14px;padding:24px;">
  <div style="font-size:11px;letter-spacing:0.18em;font-weight:700;color:{color};text-transform:uppercase;margin-bottom:6px;">
    Reply ESCALADO · {(cls.get('urgency') or '?').upper()} URGENCY
  </div>
  <h1 style="font-size:20px;color:#06080F;margin:0 0 10px;">
    Reply escalado por asesor: {(getattr(user, 'name', None) or getattr(user, 'user_id', '?'))}
  </h1>
  <div style="padding:12px;background:#fef3c7;border-radius:10px;margin-bottom:14px;">
    <div style="font-size:11px;color:#b45309;text-transform:uppercase;letter-spacing:0.06em;font-weight:700;">Razón de escalación</div>
    <div style="font-size:13.5px;color:#06080F;margin-top:4px;">{payload.reason}</div>
  </div>
  <div style="padding:12px;background:#f9fafb;border-radius:10px;margin-bottom:14px;">
    <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;">De</div>
    <div style="font-size:13px;color:#06080F;font-weight:600;">{doc.get('from_email', '—')}</div>
    <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin-top:8px;">Asunto</div>
    <div style="font-size:13px;color:#06080F;font-weight:600;">{doc.get('subject', '—')}</div>
    <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin-top:8px;">Body (preview)</div>
    <div style="font-size:13px;color:#374151;white-space:pre-wrap;">{preview}</div>
  </div>
  <p style="font-size:10px;color:#9ca3af;margin:18px 0 0;">
    Categoría: {cls.get('category', '?')} · Confianza: {cls.get('confidence_score', '?')}/100
  </p>
</div></body></html>"""
            subject = f"[DMX · Manager] Reply ESCALADO · {doc.get('from_email', '?')}"
            try:
                import httpx
                async with httpx.AsyncClient(timeout=10) as cli:
                    r = await cli.post(
                        "https://api.resend.com/emails",
                        headers={"Authorization": f"Bearer {api_key}"},
                        json={"from": os.environ.get("RESEND_FROM_LEAD_NURTURE",
                                                      "DesarrollosMX <no-reply@desarrollosmx.io>"),
                              "to": [mgr["email"]], "subject": subject, "html": html},
                    )
                sent_ok = r.status_code in (200, 202)
                if not sent_ok:
                    sent_reason = f"resend_{r.status_code}"
            except Exception as e:  # noqa: BLE001
                sent_reason = f"resend_error: {e}"[:200]
        else:
            sent_reason = "no_resend_key"
    else:
        sent_reason = "no_manager_found"

    now = datetime.now(timezone.utc)
    await db.email_replies.update_one(
        {"_id": reply_id},
        {"$set": {"status": "action_taken", "action_taken_at": now,
                  "escalated_to": (mgr or {}).get("user_id"),
                  "escalation_reason": payload.reason}},
    )
    try:
        await db.activity_log.insert_one({
            "id": f"act_{uuid.uuid4().hex[:12]}",
            "type": "reply_classifier.one_click.escalate",
            "org_id": org_id, "reply_id": reply_id,
            "asesor_id": getattr(user, "user_id", None),
            "manager_id": (mgr or {}).get("user_id"),
            "manager_email": (mgr or {}).get("email"),
            "reason": payload.reason,
            "sent_ok": sent_ok, "sent_reason": sent_reason,
            "created_at": now,
        })
    except Exception:
        pass
    return {"ok": True, "reply_id": reply_id, "escalated": True,
            "manager_email": (mgr or {}).get("email"),
            "email_sent": sent_ok, "reason": sent_reason}


# ─── W4.6 Y.3D · DISC Inferencer ──────────────────────────────────────────────
class DiscRefreshIn(BaseModel):
    simulation_override: bool = False


def _clean_disc_doc(doc: Dict[str, Any]) -> Dict[str, Any]:
    out = {k: v for k, v in doc.items() if k != "_id"}
    out["profile_id"] = doc.get("_id") or doc.get("profile_id")
    for k in ("inferred_at", "expires_at"):
        v = out.get(k)
        if isinstance(v, datetime):
            out[k] = v.isoformat()
    return out


@router.get("/api/agentic-crm/disc/{lead_id}")
async def get_disc_profile(lead_id: str, request: Request):
    """Y.3D · retorna profile DISC del lead. Auto-infer si no existe."""
    user = await _require_authorized(request)
    db = request.app.state.db
    role = getattr(user, "role", "")

    lead = await db.leads.find_one({"id": lead_id}, {"_id": 0, "dev_org_id": 1, "id": 1})
    if not lead:
        raise HTTPException(404, f"Lead {lead_id} no encontrado")
    org_id = lead.get("dev_org_id")
    if role != "superadmin" and org_id and getattr(user, "tenant_id", None) != org_id:
        raise HTTPException(403, "Lead pertenece a otra org")
    target_org = _resolve_org(user, org_id)

    try:
        engine = DISCInferencer(db, target_org)
        result = await engine.infer_profile(lead_id)
        return {"ok": True, **result}
    except DISCInferencerDisabledError as e:
        raise HTTPException(403, str(e))
    except DISCInferencerRateLimitError as e:
        raise HTTPException(429, str(e))
    except DISCInferencerNotFoundError as e:
        raise HTTPException(404, str(e))
    except DISCInferencerForbiddenError as e:
        raise HTTPException(403, str(e))


@router.post("/api/agentic-crm/disc/{lead_id}/refresh")
async def refresh_disc_profile(lead_id: str, request: Request,
                                payload: Optional[DiscRefreshIn] = None):
    """Y.3D · fuerza re-inference (rate-limited 1/24h por lead)."""
    user = await _require_authorized(request)
    db = request.app.state.db
    role = getattr(user, "role", "")

    lead = await db.leads.find_one({"id": lead_id}, {"_id": 0, "dev_org_id": 1, "id": 1})
    if not lead:
        raise HTTPException(404, f"Lead {lead_id} no encontrado")
    org_id = lead.get("dev_org_id")
    if role != "superadmin" and org_id and getattr(user, "tenant_id", None) != org_id:
        raise HTTPException(403, "Lead pertenece a otra org")
    target_org = _resolve_org(user, org_id)

    sim_override = payload.simulation_override if payload else False
    try:
        engine = DISCInferencer(db, target_org)
        result = await engine.infer_profile(lead_id, force_refresh=True,
                                            simulation_override=sim_override)
        return {"ok": True, **result}
    except DISCInferencerDisabledError as e:
        raise HTTPException(403, str(e))
    except DISCInferencerRateLimitError as e:
        raise HTTPException(429, str(e))
    except DISCInferencerNotFoundError as e:
        raise HTTPException(404, str(e))
    except DISCInferencerForbiddenError as e:
        raise HTTPException(403, str(e))


@router.get("/api/superadmin/agentic-crm/disc/distribution")
async def superadmin_disc_distribution(
    request: Request,
    org_id: str = Query(..., min_length=2),
    days: int = Query(90, ge=1, le=365),
):
    """Y.3D · stats predominant_type breakdown por org."""
    from permissions import require_superadmin
    await require_superadmin(request)
    db = request.app.state.db
    since = datetime.now(timezone.utc) - timedelta(days=days)

    cur = db.disc_profiles.aggregate([
        {"$match": {"org_id": org_id, "inferred_at": {"$gte": since}}},
        {"$group": {
            "_id": "$predominant_type",
            "count": {"$sum": 1},
            "avg_confidence": {"$avg": "$confidence_score"},
        }},
    ])
    by_type: Dict[str, Dict[str, Any]] = {}
    total = 0
    async for r in cur:
        t = r["_id"] or "unknown"
        by_type[t] = {"count": r["count"],
                      "avg_confidence": round(r.get("avg_confidence") or 0, 1)}
        total += r["count"]

    layer_cur = db.disc_profiles.aggregate([
        {"$match": {"org_id": org_id, "inferred_at": {"$gte": since}}},
        {"$group": {"_id": "$layer_used", "count": {"$sum": 1}}},
    ])
    by_layer: Dict[str, int] = {}
    async for r in layer_cur:
        by_layer[r["_id"] or "unknown"] = r["count"]

    return {
        "ok": True, "org_id": org_id, "days": days,
        "total_profiles": total,
        "by_predominant_type": by_type,
        "by_layer_used": by_layer,
    }

