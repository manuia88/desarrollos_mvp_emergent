"""W3.7 — Phase Z.5 Compliance Routes (LFPDPPP).

PUBLIC:
  POST /api/privacy/dsr                             — create DSR
  GET  /api/privacy/dsr/{dsr_id}/verify             — token verification (double opt-in)

SUPERADMIN:
  GET  /api/superadmin/compliance/dsr-requests      — list DSR
  POST /api/superadmin/compliance/dsr-requests/{id}/process — execute deletion
  GET  /api/superadmin/compliance/audit-trail       — compliance audit log
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

import compliance_engine as comp

log = logging.getLogger("dmx.routes_compliance")

router = APIRouter(tags=["compliance"])


def _db(request: Request):
    return request.app.state.db


def _ip(request: Request) -> str:
    return request.client.host if request.client else ""


async def _sa(request: Request):
    from permissions import require_superadmin
    return await require_superadmin(request)


# ─── Bodies ───────────────────────────────────────────────────────────────────

class DsrCreateBody(BaseModel):
    request_type: str
    subject_email: str
    subject_phone: Optional[str] = None
    subject_property_ids: Optional[list] = None
    justification: Optional[str] = ""


# ─── PUBLIC ───────────────────────────────────────────────────────────────────

@router.post("/api/privacy/dsr")
async def create_dsr_endpoint(body: DsrCreateBody, request: Request):
    """PUBLIC — Submit a LFPDPPP Data Subject Request."""
    if body.request_type not in comp.VALID_REQUEST_TYPES:
        raise HTTPException(
            400,
            f"request_type inválido. Valores permitidos: {', '.join(sorted(comp.VALID_REQUEST_TYPES))}",
        )
    email = (body.subject_email or "").strip().lower()
    if not email or "@" not in email:
        raise HTTPException(400, "Email inválido")

    db = _db(request)
    dsr, token = await comp.create_dsr(
        db,
        request_type=body.request_type,
        subject_email=email,
        subject_phone=body.subject_phone,
        subject_property_ids=body.subject_property_ids or [],
        justification=body.justification or "",
        requestor_ip=_ip(request),
    )

    # Build public-facing verify URL (frontend route handles display)
    base_url = str(request.base_url).rstrip("/")
    verify_url = f"{base_url}/privacy/dsr?dsr_id={dsr['id']}&token={token}"

    email_result = await comp.send_dsr_confirmation_email(dsr, verify_url)

    await comp.log_compliance_event(
        db,
        action="dsr_request",
        endpoint="/api/privacy/dsr",
        requestor_ip=_ip(request),
        extra={"dsr_id": dsr["id"], "type": body.request_type},
    )

    return {
        "dsr_id": dsr["id"],
        "status": "pending_verification",
        "verification_email_sent": email_result.get("ok", False),
        # Only expose debug URL when Resend is not configured (stub mode)
        "debug_verify_url": verify_url if email_result.get("stub") else None,
        "message": (
            "Solicitud recibida. "
            "Verifica tu email para confirmar la solicitud."
        ),
    }


@router.get("/api/privacy/dsr/{dsr_id}/verify")
async def verify_dsr_endpoint(
    dsr_id: str,
    request: Request,
    token: str = Query(...),
):
    """PUBLIC — Verify DSR via one-time token (double opt-in)."""
    db = _db(request)
    result = await comp.verify_dsr_token(db, dsr_id, token)
    if not result.get("ok"):
        raise HTTPException(400, result.get("reason", "token_invalido"))

    await comp.log_compliance_event(
        db,
        action="dsr_verified",
        endpoint=f"/api/privacy/dsr/{dsr_id}/verify",
        requestor_ip=_ip(request),
        extra={"dsr_id": dsr_id},
    )
    return {
        **result,
        "message": (
            "Solicitud verificada. Nuestro equipo la procesará en un plazo máximo "
            "de 20 días hábiles conforme a la LFPDPPP."
        ),
    }


# ─── SUPERADMIN ───────────────────────────────────────────────────────────────

@router.get("/api/superadmin/compliance/dsr-requests")
async def list_dsr_requests(
    request: Request,
    status: Optional[str] = Query(None),
    days: int = Query(30, ge=1, le=365),
    limit: int = Query(100, ge=1, le=500),
):
    await _sa(request)
    db = _db(request)

    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    q: dict = {"created_at": {"$gte": cutoff}}
    if status:
        q["status"] = status

    cursor = db.dsr_requests.find(
        q, {"_id": 0, "verification_token": 0}
    ).sort("created_at", -1).limit(limit)
    items = [d async for d in cursor]

    # KPIs (all-time)
    pending = await db.dsr_requests.count_documents({"status": "pending"})
    verified = await db.dsr_requests.count_documents({"status": "verified"})
    completed_30d = await db.dsr_requests.count_documents({
        "status": "completed",
        "completed_at": {"$gte": cutoff},
    })
    k_blocks_30d = await db.compliance_audit.count_documents({
        "k_anonymity_passed": False,
        "ts": {"$gte": datetime.now(timezone.utc) - timedelta(days=days)},
    })
    audit_30d = await db.compliance_audit.count_documents({
        "ts": {"$gte": datetime.now(timezone.utc) - timedelta(days=days)},
    })

    return {
        "items": items,
        "count": len(items),
        "kpis": {
            "dsr_pending": pending,
            "dsr_verified": verified,
            "dsr_completed_30d": completed_30d,
            "k_anon_blocks_30d": k_blocks_30d,
            "audit_events_30d": audit_30d,
        },
    }


@router.post("/api/superadmin/compliance/dsr-requests/{dsr_id}/process")
async def process_dsr_endpoint(dsr_id: str, request: Request):
    """SUPERADMIN — Execute PII deletion/anonymization for a verified DSR."""
    user = await _sa(request)
    db = _db(request)

    try:
        result = await comp.process_dsr_deletion(db, dsr_id)
    except ValueError as exc:
        raise HTTPException(400, str(exc))

    await comp.log_compliance_event(
        db,
        action="dsr_complete",
        endpoint=f"/api/superadmin/compliance/dsr-requests/{dsr_id}/process",
        requestor_ip=_ip(request),
        extra={"dsr_id": dsr_id, "processed_by": getattr(user, "user_id", "")},
    )

    try:
        from audit_log import log_mutation
        await log_mutation(
            db, user, "update", "dsr_request", dsr_id,
            before={"status": "verified"},
            after={"status": "completed"},
            request=request,
        )
    except Exception as _e:
        log.warning("[audit] log_mutation perdido (dsr_request %s): %s", dsr_id, _e)

    return result


@router.get("/api/superadmin/compliance/audit-trail")
async def compliance_audit_trail(
    request: Request,
    api_key_id: Optional[str] = Query(None),
    endpoint: Optional[str] = Query(None),
    days: int = Query(30, ge=1, le=365),
    limit: int = Query(200, ge=1, le=1000),
):
    await _sa(request)
    db = _db(request)

    since = datetime.now(timezone.utc) - timedelta(days=days)
    q: dict = {"ts": {"$gte": since}}
    if api_key_id:
        q["api_key_id"] = api_key_id
    if endpoint:
        q["endpoint"] = {"$regex": endpoint, "$options": "i"}

    cursor = db.compliance_audit.find(q, {"_id": 0}).sort("ts", -1).limit(limit)
    items = [d async for d in cursor]
    # Serialize datetime → ISO string
    for item in items:
        ts = item.get("ts")
        if ts and hasattr(ts, "isoformat"):
            item["ts"] = ts.isoformat()

    total = await db.compliance_audit.count_documents(q)
    k_blocks = await db.compliance_audit.count_documents(
        {**q, "k_anonymity_passed": False}
    )
    pii_strips = await db.compliance_audit.count_documents(
        {**q, "response_pii_stripped": True}
    )

    return {
        "items": items,
        "count": len(items),
        "total_matching": total,
        "kpis": {
            "k_anon_blocks": k_blocks,
            "pii_strips": pii_strips,
        },
        "days": days,
    }


# ─── Centro de Seguridad · Aislamiento entre Cuentas (portal Dev) ──────────────
@router.get("/api/superadmin/compliance/cross-org")
async def compliance_cross_org(
    request: Request,
    days: int = Query(30, ge=1, le=365),
    limit: int = Query(100, ge=1, le=500),
):
    """Intentos BLOQUEADOS de una cuenta por ver datos de otra (portal Dev) + verdicto de anomalía.
    Lo normal es 0; alimenta el Centro de Seguridad del superadmin."""
    await _sa(request)
    from dev_guard import cross_org_denials
    return await cross_org_denials(_db(request), days=days, limit=limit)
