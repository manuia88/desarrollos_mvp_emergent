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
from fastapi.responses import JSONResponse
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
from lead_nurture_engine import (
    NurtureIntelligentEngine,
    NurtureIntelligentDisabledError,
    NurtureIntelligentForbiddenError,
    NurtureIntelligentNotFoundError,
    NurtureIntelligentRateLimitError,
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
    if role != "superadmin":
        user_org = getattr(user, "tenant_id", None)
        if not user_org:
            # Sin inmobiliaria asignada no se puede acotar el alcance → no acceso (evita
            # que un asesor sin tenant pase ?org_id=víctima y lea/escriba otra org).
            raise HTTPException(403, "Tu cuenta no tiene inmobiliaria asignada")
        if target_org_id and user_org != target_org_id:
            raise HTTPException(403, "Cross-org acceso denegado")
    return user


def _resolve_org(user, override_org_id: Optional[str]) -> str:
    role = getattr(user, "role", "")
    if role == "superadmin":
        return override_org_id or getattr(user, "tenant_id", None) or "dmx"
    # No-superadmin: SIEMPRE su propio tenant, nunca el org_id del cliente.
    return getattr(user, "tenant_id", None) or "dmx"


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
    """PÚBLICO · valida Svix-Signature de Resend antes de procesar.
    W5.ASR.5: Si el To: coincide con alias de lead_capture → deriva a engine de captura.
    """
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

    # W5.ASR.5 — Interceptar emails dirigidos a alias de captura
    try:
        to_header = (
            (payload.get("data") or {}).get("to")
            or (payload.get("data") or {}).get("headers", {}).get("to", "")
            or payload.get("to", "")
            or ""
        )
        _ALIAS_DOMAIN = "leads.desarrollosmx.io"
        if _ALIAS_DOMAIN in to_header.lower():
            from lead_capture_engine import build_alias_map, process_email_capture
            alias_map = await build_alias_map(db)
            # Normalizar payload a formato raw_email esperado por el engine
            raw_email_payload = payload.get("data") or payload
            capture_result = await process_email_capture(db, raw_email_payload, alias_map)
            if capture_result.get("captured"):
                return {"ok": True, "flow": "lead_capture", **capture_result}
            # Si no capturó (alias no encontrado en mapa) → continúa flow normal
    except Exception as _lce:  # noqa: BLE001
        log.warning(f"[resend_inbound] lead_capture intercept error (continuando): {_lce}")

    try:
        ingest_result = await ingest_webhook_reply(db, payload, raw_body)
    except Exception as e:  # noqa: BLE001
        log.exception(f"[resend_inbound] ingest failed: {e}")
        raise HTTPException(500, "Ingest error")

    reply_id = ingest_result["reply_id"]
    org_id = ingest_result.get("org_id") or "dmx"

    # Phase Y check fast-path: si OFF, NO clasifica (guarda crudo)
    try:
        from routes.phase_y_controls import get_phase_y_settings
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



# ─── W4.6 Y.3E · Lead Nurture Intelligent ─────────────────────────────────────
class NurtureDryRunIn(BaseModel):
    simulation_override: bool = False


class NurtureToggleIn(BaseModel):
    org_id: str = Field(..., min_length=2, max_length=120)
    tier: str = Field(..., pattern="^(off|T1|T2|T3)$")


@router.get("/api/agentic-crm/nurture/sequences")
async def list_nurture_sequences(request: Request,
                                  status: Optional[str] = Query(None),
                                  org_id: Optional[str] = Query(None),
                                  limit: int = Query(50, ge=1, le=200)):
    """Lista nurture_sequences de la org del usuario (o cross-org si superadmin)."""
    user = await _require_authorized(request)
    db = request.app.state.db
    role = getattr(user, "role", "")
    target_org = org_id if (role == "superadmin" and org_id) else getattr(user, "tenant_id", None)
    if not target_org:
        raise HTTPException(400, "tenant requerido")

    q: Dict[str, Any] = {"org_id": target_org}
    if status and status != "all":
        q["status"] = status
    cur = db.nurture_sequences.find(
        q,
        {"_id": 1, "lead_id": 1, "sequence_type": 1, "current_step": 1,
         "total_steps": 1, "status": 1, "layer_used": 1, "data_quality": 1,
         "generated_at": 1, "last_touch_at": 1, "next_touch_scheduled_at": 1},
    ).sort("generated_at", -1).limit(limit)

    items: List[Dict[str, Any]] = []
    async for s in cur:
        item = {**s, "sequence_id": s.pop("_id", None)}
        for k in ("generated_at", "last_touch_at", "next_touch_scheduled_at"):
            v = item.get(k)
            if isinstance(v, datetime):
                item[k] = v.isoformat()
        items.append(item)
    return {"ok": True, "count": len(items), "sequences": items}


@router.post("/api/agentic-crm/nurture/sequences/{lead_id}/dry-run")
async def nurture_sequence_dry_run(lead_id: str, request: Request,
                                    payload: Optional[NurtureDryRunIn] = None):
    """Genera sequence sin enviar (preview superadmin/asesor)."""
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
        engine = NurtureIntelligentEngine(db, target_org)
        result = await engine.design_sequence(
            lead_id, dry_run=True, simulation_override=sim_override,
        )
        return {"ok": True, "preview": True, **result}
    except NurtureIntelligentDisabledError as e:
        raise HTTPException(403, str(e))
    except NurtureIntelligentRateLimitError as e:
        raise HTTPException(429, str(e))
    except NurtureIntelligentNotFoundError as e:
        raise HTTPException(404, str(e))
    except NurtureIntelligentForbiddenError as e:
        raise HTTPException(403, str(e))


@router.post("/api/agentic-crm/nurture/sequences/{lead_id}/pause")
async def nurture_pause(lead_id: str, request: Request):
    user = await _require_authorized(request)
    db = request.app.state.db
    role = getattr(user, "role", "")
    if role not in ROUTING_ROLES:
        raise HTTPException(403, "Rol no autorizado")
    seq = await db.nurture_sequences.find_one({"lead_id": lead_id}, {"_id": 0, "org_id": 1})
    if not seq:
        raise HTTPException(404, "Sequence no encontrada")
    if role != "superadmin" and getattr(user, "tenant_id", None) != seq["org_id"]:
        raise HTTPException(403, "Cross-org")
    try:
        engine = NurtureIntelligentEngine(db, seq["org_id"])
        return {"ok": True, **(await engine.pause_sequence(lead_id))}
    except NurtureIntelligentNotFoundError as e:
        raise HTTPException(404, str(e))


@router.post("/api/agentic-crm/nurture/sequences/{lead_id}/resume")
async def nurture_resume(lead_id: str, request: Request):
    user = await _require_authorized(request)
    db = request.app.state.db
    role = getattr(user, "role", "")
    if role not in ROUTING_ROLES:
        raise HTTPException(403, "Rol no autorizado")
    seq = await db.nurture_sequences.find_one({"lead_id": lead_id}, {"_id": 0, "org_id": 1})
    if not seq:
        raise HTTPException(404, "Sequence no encontrada")
    if role != "superadmin" and getattr(user, "tenant_id", None) != seq["org_id"]:
        raise HTTPException(403, "Cross-org")
    try:
        engine = NurtureIntelligentEngine(db, seq["org_id"])
        return {"ok": True, **(await engine.resume_sequence(lead_id))}
    except NurtureIntelligentNotFoundError as e:
        raise HTTPException(404, str(e))


@router.post("/api/superadmin/agentic-crm/nurture/toggle")
async def superadmin_nurture_toggle(payload: NurtureToggleIn, request: Request):
    """Enable/disable intelligent path para una org · audit log."""
    from permissions import require_superadmin
    superuser = await require_superadmin(request)
    db = request.app.state.db

    settings = await db.phase_y_settings.find_one({"org_id": payload.org_id})
    feature_tiers = dict((settings or {}).get("feature_tiers") or {})
    prev_tier = feature_tiers.get("nurture_intelligent", "off")
    feature_tiers["nurture_intelligent"] = payload.tier
    now = datetime.now(timezone.utc)

    await db.phase_y_settings.update_one(
        {"org_id": payload.org_id},
        {"$set": {"org_id": payload.org_id, "feature_tiers": feature_tiers,
                  "updated_at": now.isoformat()}},
        upsert=True,
    )
    try:
        await db.activity_log.insert_one({
            "id": f"act_{uuid.uuid4().hex[:12]}",
            "type": "phase_y.toggle.nurture_intelligent",
            "org_id": payload.org_id,
            "actor_id": getattr(superuser, "user_id", None),
            "prev_tier": prev_tier, "new_tier": payload.tier,
            "created_at": now,
        })
    except Exception:
        pass
    return {"ok": True, "org_id": payload.org_id,
            "feature": "nurture_intelligent",
            "prev_tier": prev_tier, "new_tier": payload.tier}


@router.get("/api/superadmin/agentic-crm/nurture/stats")
async def superadmin_nurture_stats(request: Request,
                                    org_id: str = Query(..., min_length=2),
                                    days: int = Query(30, ge=1, le=365)):
    """Metrics: sequences_generated, open_rate, reply_rate, conversion_pct, layer_breakdown."""
    from permissions import require_superadmin
    await require_superadmin(request)
    db = request.app.state.db
    since = datetime.now(timezone.utc) - timedelta(days=days)

    total = await db.nurture_sequences.count_documents(
        {"org_id": org_id, "generated_at": {"$gte": since}},
    )
    active = await db.nurture_sequences.count_documents(
        {"org_id": org_id, "status": "active"},
    )
    completed = await db.nurture_sequences.count_documents(
        {"org_id": org_id, "status": "completed", "generated_at": {"$gte": since}},
    )
    paused = await db.nurture_sequences.count_documents(
        {"org_id": org_id, "status": "paused"},
    )

    # Layer breakdown
    layer_cur = db.nurture_sequences.aggregate([
        {"$match": {"org_id": org_id, "generated_at": {"$gte": since}}},
        {"$group": {"_id": "$layer_used", "count": {"$sum": 1}}},
    ])
    by_layer: Dict[str, int] = {}
    async for r in layer_cur:
        by_layer[r["_id"] or "unknown"] = r["count"]

    # Open + reply rates from touches.opened_at / replied_at
    sent_touches = 0
    opened = 0
    replied = 0
    cur = db.nurture_sequences.find(
        {"org_id": org_id, "generated_at": {"$gte": since}},
        {"_id": 0, "touches": 1},
    )
    async for s in cur:
        for t in s.get("touches") or []:
            if t.get("sent_at"):
                sent_touches += 1
                if t.get("opened_at"):
                    opened += 1
                if t.get("replied_at"):
                    replied += 1

    open_rate = round(100 * opened / sent_touches, 1) if sent_touches else 0.0
    reply_rate = round(100 * replied / sent_touches, 1) if sent_touches else 0.0

    # Conversion vs legacy: converted leads (stage=closed_won) en orgs con tier vs sin tier
    converted = await db.leads.count_documents({
        "dev_org_id": org_id, "stage": "closed_won",
        "updated_at": {"$gte": since.isoformat() if isinstance(since, datetime) else since},
    })
    conversion_pct = round(100 * converted / total, 2) if total else 0.0

    return {
        "ok": True, "org_id": org_id, "days": days,
        "sequences_total": total, "active": active, "completed": completed,
        "paused": paused,
        "open_rate": open_rate, "reply_rate": reply_rate,
        "conversion_pct": conversion_pct,
        "by_layer_used": by_layer,
        "sent_touches": sent_touches, "opened": opened, "replied": replied,
    }


# ─── W4.7 Y.4B — Match Weights Adaptive ──────────────────────────────────────
# In-process rate limit per user for match-weights · 10 calls/min
_mw_user_min_buckets: Dict[str, List[float]] = {}
MW_USER_MIN_CAP = 10


def _check_mw_rate(user_id: str) -> bool:
    now = time.monotonic()
    bucket = _mw_user_min_buckets.setdefault(user_id, [])
    _mw_user_min_buckets[user_id] = [t for t in bucket if now - t < 60]
    if len(_mw_user_min_buckets[user_id]) >= MW_USER_MIN_CAP:
        return False
    _mw_user_min_buckets[user_id].append(now)
    return True


class WeightsPatchIn(BaseModel):
    weights: Dict[str, float] = Field(..., description="Pesos por dimensión. Deben sumar 1.0 ± 0.05")
    org_id: Optional[str] = None  # superadmin override


@router.get("/api/agentic-crm/match-weights")
async def get_match_weights(request: Request, org_id: Optional[str] = None):
    """Retorna pesos de matching del org del user (T1+ para custom · sino DEFAULT_WEIGHTS)."""
    user = await _require_authorized(request)
    db = request.app.state.db
    uid = getattr(user, "user_id", "anon")
    if not _check_mw_rate(uid):
        raise HTTPException(429, "Rate limit match-weights (10 calls/min)")

    resolved_org = _resolve_org(user, org_id)

    from agentic_crm.match_weights_engine import MatchWeightsEngine
    engine = MatchWeightsEngine(db, resolved_org)
    result = await engine.get_weights()
    return JSONResponse(result)


@router.patch("/api/agentic-crm/match-weights")
async def patch_match_weights(body: WeightsPatchIn, request: Request):
    """Actualiza pesos manualmente. Tier T2+ · validación sum=1.0 ± 0.05 · cap 5/día."""
    user = await _require_authorized(request)
    db = request.app.state.db
    uid = getattr(user, "user_id", "anon")
    if not _check_mw_rate(uid):
        raise HTTPException(429, "Rate limit match-weights (10 calls/min)")

    resolved_org = _resolve_org(user, body.org_id)

    from agentic_crm.match_weights_engine import (
        MatchWeightsEngine, MatchWeightsDisabledError,
        MatchWeightsValidationError, MatchWeightsRateLimitError,
    )
    engine = MatchWeightsEngine(db, resolved_org)
    try:
        result = await engine.manual_set_weights(body.weights, uid)
    except MatchWeightsDisabledError as e:
        raise HTTPException(403, str(e))
    except MatchWeightsValidationError as e:
        raise HTTPException(400, str(e))
    except MatchWeightsRateLimitError as e:
        raise HTTPException(429, str(e))
    return JSONResponse({**result, "ok": True})


@router.post("/api/agentic-crm/match-weights/auto-tune")
async def trigger_match_weights_auto_tune(request: Request, org_id: Optional[str] = None):
    """Trigger manual de auto-tune. superadmin o developer_admin propio org."""
    user = await _require_authorized(request)
    db = request.app.state.db
    uid = getattr(user, "user_id", "anon")
    role = getattr(user, "role", "")
    if not _check_mw_rate(uid):
        raise HTTPException(429, "Rate limit match-weights (10 calls/min)")

    resolved_org = _resolve_org(user, org_id)

    from agentic_crm.match_weights_engine import MatchWeightsEngine
    engine = MatchWeightsEngine(db, resolved_org)
    result = await engine.auto_tune()
    return JSONResponse({**result, "ok": True})


@router.get("/api/superadmin/agentic-crm/match-weights/distribution")
async def get_match_weights_distribution(request: Request, org_id: Optional[str] = None):
    """Superadmin: ver weights + historial de audit para un org dado (org_id query param)."""
    user = await _require_authorized(request)
    db = request.app.state.db
    role = getattr(user, "role", "")
    if role != "superadmin":
        raise HTTPException(403, "Solo superadmin puede ver distribución de weights")

    if not org_id:
        raise HTTPException(422, "org_id requerido como query param")

    from agentic_crm.match_weights_engine import MatchWeightsEngine
    engine = MatchWeightsEngine(db, org_id)
    result = await engine.get_weights()

    # Enrich with last 10 audit entries
    audit_raw = result.get("audit_log") or []
    # Return full result with audit
    return JSONResponse({
        **result,
        "audit_log": audit_raw[-10:],
        "org_queried": org_id,
    })


# ─── #4.2 Casamentera cross-org — cruza un lead con asesores/inventario de orgs ALIADAS ──────────
@router.get("/api/agentic-crm/casamentera/{lead_id}")
async def casamentera(lead_id: str, request: Request):
    """Marketplace agéntico (la casamentera): cruza un lead con asesores de orgs ALIADAS (solo alianzas
    aprobadas = cruce SEGURO · candado E5). Reusa compute_match + cross_org_partnerships. Build-for-endstate:
    se activa al haber alianzas + leads; honesto-vacío si no."""
    user = await _require_authorized(request)
    db = request.app.state.db
    org = _resolve_org(user, None)
    from services.cross_org_partnerships import get_active_partner_org_ids
    partners = await get_active_partner_org_ids(db, "dev", org)  # org_type no filtra la consulta base
    if not partners:
        return {"matches": [], "partners": 0, "cross_org": True,
                "note": "Aún no tienes alianzas activas. Al aprobar una alianza cross-org, aquí verás compradores de tu red que encajan con tu inventario (y viceversa)."}
    pool = []
    try:
        async for u in db.users.find(
            {"$or": [{"dev_org_id": {"$in": partners}}, {"inmobiliaria_id": {"$in": partners}}],
             "role": {"$regex": "asesor|advisor|broker", "$options": "i"}},
            {"_id": 0, "user_id": 1}).limit(100):
            if u.get("user_id"):
                pool.append(u["user_id"])
    except Exception:
        pass
    if not pool:
        return {"matches": [], "partners": len(partners), "cross_org": True,
                "note": "Tus orgs aliadas aún no tienen asesores con inventario que cruce. Se activa al haber inventario."}
    from services.lead_to_asesor_match import compute_match
    res = await compute_match(db, lead_id, asesor_pool=pool)
    matches = res.get("matches") or res.get("ranked") or ([res] if res and res.get("score") is not None else [])
    return {"matches": matches, "partners": len(partners), "pool": len(pool), "cross_org": True}


# ─── W4.7 Y.4C — Argumentario Tone Behavioral-Driven ─────────────────────────
_arg_user_min_buckets: Dict[str, List[float]] = {}
ARG_RATE_CAP = 60


def _check_arg_rate(user_id: str) -> bool:
    now = time.monotonic()
    bucket = _arg_user_min_buckets.setdefault(user_id, [])
    _arg_user_min_buckets[user_id] = [t for t in bucket if now - t < 60]
    if len(_arg_user_min_buckets[user_id]) >= ARG_RATE_CAP:
        return False
    _arg_user_min_buckets[user_id].append(now)
    return True


@router.get("/api/agentic-crm/argumentario/{lead_id}")
async def get_argumentario(lead_id: str, request: Request, asesor_id: Optional[str] = None):
    """Retorna argumentario (auto-genera si no existe). Tier T1+.

    Permission: asesor own leads · developer/inmobiliaria own org · superadmin any.
    """
    user = await _require_authorized(request)
    db = request.app.state.db
    uid = getattr(user, "user_id", "anon")
    role = getattr(user, "role", "")

    if not _check_arg_rate(uid):
        raise HTTPException(429, "Rate limit argumentario (60 calls/min)")

    org_id = _resolve_org(user, None)
    resolved_asesor = asesor_id or uid

    from agentic_crm.argumentario_engine import (
        ArgumentarioEngine, ArgumentarioDisabledError,
    )
    engine = ArgumentarioEngine(db, org_id)
    try:
        result = await engine.generate_argumentario(lead_id, resolved_asesor)
    except ArgumentarioDisabledError as e:
        raise HTTPException(403, str(e))
    return JSONResponse(result)


@router.post("/api/agentic-crm/argumentario/{lead_id}/refresh")
async def refresh_argumentario(lead_id: str, request: Request, asesor_id: Optional[str] = None):
    """Fuerza re-generación del argumentario. Rate-limited: 1/12h/lead."""
    user = await _require_authorized(request)
    db = request.app.state.db
    uid = getattr(user, "user_id", "anon")

    if not _check_arg_rate(uid):
        raise HTTPException(429, "Rate limit argumentario (60 calls/min)")

    org_id = _resolve_org(user, None)
    resolved_asesor = asesor_id or uid

    from agentic_crm.argumentario_engine import (
        ArgumentarioEngine, ArgumentarioDisabledError, ArgumentarioRateLimitError,
    )
    engine = ArgumentarioEngine(db, org_id)
    try:
        result = await engine.refresh_argumentario(lead_id, resolved_asesor)
    except ArgumentarioDisabledError as e:
        raise HTTPException(403, str(e))
    except ArgumentarioRateLimitError as e:
        raise HTTPException(429, str(e))
    return JSONResponse({**result, "ok": True})


@router.post("/api/agentic-crm/argumentario/{lead_id}/mark-used")
async def mark_argumentario_used(lead_id: str, request: Request):
    """Asesor confirma que usó el argumentario. status=used · log_activity."""
    user = await _require_authorized(request)
    db = request.app.state.db
    uid = getattr(user, "user_id", "anon")
    org_id = _resolve_org(user, None)

    from agentic_crm.argumentario_engine import (
        ArgumentarioEngine, ArgumentarioDisabledError,
    )
    engine = ArgumentarioEngine(db, org_id)
    try:
        result = await engine.mark_used(lead_id, uid)
    except ArgumentarioDisabledError as e:
        raise HTTPException(403, str(e))
    return JSONResponse({**result, "ok": True})
