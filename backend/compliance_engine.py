"""W3.7 — Phase Z.5 Compliance Engine.

DSR (Data Subject Request) management + audit trail.
LFPDPPP — Ley Federal de Protección de Datos Personales en Posesión de los Particulares.

Collections:
  dsr_requests      — DSR lifecycle records
  compliance_audit  — immutable audit log (5-year TTL)
"""
from __future__ import annotations

import logging
import os
import secrets
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.compliance_engine")

_DSR_COLL = "dsr_requests"
_AUDIT_COLL = "compliance_audit"

VALID_REQUEST_TYPES = {"access", "deletion", "portability", "rectification"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso() -> str:
    return _now().isoformat()


def _new_id(prefix: str = "dsr") -> str:
    return f"{prefix}_{secrets.token_urlsafe(8)}"


# ─── Index management ─────────────────────────────────────────────────────────

async def ensure_compliance_indexes(db) -> None:
    try:
        await db[_DSR_COLL].create_index([("status", 1), ("created_at", -1)])
        await db[_DSR_COLL].create_index([("subject_email", 1)])
        await db[_DSR_COLL].create_index([("verification_token", 1)], sparse=True)

        await db[_AUDIT_COLL].create_index([("ts", -1)])
        await db[_AUDIT_COLL].create_index([("api_key_id", 1), ("ts", -1)])
        await db[_AUDIT_COLL].create_index([("endpoint", 1)])
        # LFPDPPP requires 5-year retention
        try:
            await db[_AUDIT_COLL].create_index(
                [("ts", 1)],
                expireAfterSeconds=157_680_000,  # 5 years
                name="ttl_5y",
            )
        except Exception:
            pass  # TTL index may already exist

        # Register compliance cron in heartbeat system so it appears in /superadmin/health/crons
        existing = await db.cron_heartbeats.find_one(
            {"job_id": "compliance_audit_retention"}, {"_id": 0}
        )
        if not existing:
            await db.cron_heartbeats.update_one(
                {"job_id": "compliance_audit_retention"},
                {"$setOnInsert": {
                    "job_id": "compliance_audit_retention",
                    "schedule_expr": "mensual · día 1 · 10:00 MX",
                    "last_run_at": None,
                    "last_status": "registered",
                    "last_duration_ms": 0,
                    "run_count_24h": 0,
                    "fail_count_24h": 0,
                    "stale": False,
                    "created_at": _iso(),
                    "updated_at": _iso(),
                }},
                upsert=True,
            )
        log.info("[compliance] indexes ensured")
    except Exception as exc:
        log.warning("[compliance] index creation warning: %s", exc)


# ─── Compliance audit log ─────────────────────────────────────────────────────

async def log_compliance_event(
    db,
    *,
    action: str,
    endpoint: str,
    api_key_id: Optional[str] = None,
    response_pii_stripped: bool = False,
    k_anonymity_passed: bool = True,
    records_returned: int = 0,
    requestor_ip: str = "",
    extra: Optional[Dict] = None,
) -> None:
    """Insert a compliance audit log entry (fire-and-forget, never raises)."""
    try:
        doc: Dict[str, Any] = {
            "id": _new_id("caud"),
            "ts": _now(),
            "action": action,
            "api_key_id": api_key_id,
            "endpoint": endpoint,
            "response_pii_stripped": response_pii_stripped,
            "k_anonymity_passed": k_anonymity_passed,
            "records_returned": records_returned,
            "requestor_ip": requestor_ip,
        }
        if extra:
            doc["extra"] = extra
        await db[_AUDIT_COLL].insert_one(doc)
    except Exception as exc:
        log.warning("[compliance] log_compliance_event failed: %s", exc)


# ─── DSR creation + verification ─────────────────────────────────────────────

async def create_dsr(
    db,
    *,
    request_type: str,
    subject_email: str,
    subject_phone: Optional[str] = None,
    subject_property_ids: Optional[List[str]] = None,
    justification: str = "",
    requestor_ip: str = "",
) -> tuple:
    """Create a DSR record. Returns (dsr_dict, verification_token)."""
    token = secrets.token_urlsafe(24)
    doc = {
        "id": _new_id("dsr"),
        "request_type": request_type,
        "subject_email": subject_email,
        "subject_phone": subject_phone,
        "subject_property_ids": subject_property_ids or [],
        "justification": justification,
        "status": "pending",
        "verification_token": token,
        "verified_at": None,
        "completed_at": None,
        "requestor_ip": requestor_ip,
        "audit_evidence": {},
        "created_at": _iso(),
    }
    await db[_DSR_COLL].insert_one(doc)
    doc.pop("_id", None)
    return doc, token


async def verify_dsr_token(db, dsr_id: str, token: str) -> dict:
    """Mark DSR as verified (double opt-in email confirmation)."""
    doc = await db[_DSR_COLL].find_one(
        {"id": dsr_id, "verification_token": token}, {"_id": 0}
    )
    if not doc:
        return {"ok": False, "reason": "token_invalido_o_expirado"}

    current_status = doc.get("status")
    if current_status not in ("pending",):
        return {"ok": True, "status": current_status, "already_processed": True}

    await db[_DSR_COLL].update_one(
        {"id": dsr_id},
        {"$set": {"status": "verified", "verified_at": _iso()}},
    )
    return {"ok": True, "dsr_id": dsr_id, "status": "verified"}


# ─── DSR deletion / anonymization ────────────────────────────────────────────

# (collection, email_field, action)
# action: "delete" | "anonymize" | "anonymize_user" | "keep"
_PII_COLLECTIONS: List[tuple] = [
    ("users",                             "email",        "anonymize_user"),
    ("contacts",                          "email",        "anonymize"),
    ("leads",                             "email",        "anonymize"),
    ("asesor_contacts",                   "email",        "anonymize"),
    ("ie_advisor_briefings",              "advisor_email","anonymize"),
    ("inmobiliaria_advisor_relationships","asesor_email", "anonymize"),
    ("bulletin_subscribers",              "email",        "delete"),
    ("inm_invite_tokens",                 "email",        "delete"),
    # Keep DSR itself for legal audit trail
    ("dsr_requests",                      "subject_email","keep"),
]

_ANON_PLACEHOLDER = "[eliminado_dsr]"


async def process_dsr_deletion(db, dsr_id: str) -> dict:
    """Execute PII deletion / anonymization for a DSR.

    Conservative approach: anonymizes (replaces email/name with placeholder)
    rather than hard-deleting records that may be required for billing/audit.
    Raises ValueError if DSR not found or status invalid.
    """
    dsr = await db[_DSR_COLL].find_one({"id": dsr_id}, {"_id": 0})
    if not dsr:
        raise ValueError(f"DSR {dsr_id} no encontrado")

    if dsr.get("status") not in ("verified", "pending"):
        raise ValueError(
            f"DSR tiene status '{dsr.get('status')}', se requiere 'verified' o 'pending'"
        )

    subject_email = dsr["subject_email"]
    evidence: Dict[str, Any] = {}

    for coll_name, email_field, action in _PII_COLLECTIONS:
        try:
            count = await db[coll_name].count_documents({email_field: subject_email})
            if count == 0:
                continue

            if action == "delete":
                res = await db[coll_name].delete_many({email_field: subject_email})
                evidence[coll_name] = {"action": "deleted", "count": res.deleted_count}

            elif action == "anonymize":
                res = await db[coll_name].update_many(
                    {email_field: subject_email},
                    {"$set": {
                        email_field: _ANON_PLACEHOLDER,
                        "pii_cleared_dsr": dsr_id,
                        "pii_cleared_at": _iso(),
                    }},
                )
                evidence[coll_name] = {"action": "anonymized", "count": res.modified_count}

            elif action == "anonymize_user":
                # User record: keep for billing audit, anonymize PII fields
                res = await db[coll_name].update_many(
                    {email_field: subject_email},
                    {"$set": {
                        email_field: _ANON_PLACEHOLDER,
                        "name": _ANON_PLACEHOLDER,
                        "phone": None,
                        "pii_cleared_dsr": dsr_id,
                        "pii_cleared_at": _iso(),
                    }},
                )
                evidence[coll_name] = {
                    "action": "anonymized_user", "count": res.modified_count
                }

            # action == "keep": deliberate no-op, keep record for legal

        except Exception as exc:
            log.warning("[compliance] process_dsr error on %s: %s", coll_name, exc)
            evidence[coll_name] = {"action": "error", "error": str(exc)}

    # Mark DSR completed
    await db[_DSR_COLL].update_one(
        {"id": dsr_id},
        {"$set": {
            "status": "completed",
            "completed_at": _iso(),
            "audit_evidence": evidence,
        }},
    )

    return {
        "ok": True,
        "dsr_id": dsr_id,
        "subject_email": subject_email,
        "collections_processed": len(evidence),
        "evidence": evidence,
    }


# ─── DSR confirmation email ───────────────────────────────────────────────────

async def send_dsr_confirmation_email(dsr: dict, verify_url: str) -> dict:
    """Send DSR confirmation email via Resend. Stubs gracefully if key missing."""
    resend_key = os.environ.get("RESEND_API_KEY", "")
    if not resend_key or resend_key.startswith("re_placeholder"):
        log.info(
            "[compliance] Resend key missing — DSR email stub for %s",
            dsr.get("subject_email"),
        )
        return {"ok": True, "stub": True}

    type_labels = {
        "access":         "Acceso a tus datos",
        "deletion":       "Eliminación de tus datos",
        "portability":    "Portabilidad de tus datos",
        "rectification":  "Rectificación de tus datos",
    }
    label = type_labels.get(dsr.get("request_type", ""), dsr.get("request_type", ""))

    html_body = f"""
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1a2e">
      <h2 style="color:#6366f1">DesarrollosMX · Privacidad</h2>
      <p>Hemos recibido tu solicitud de <strong>{label}</strong>.</p>
      <p>Para confirmar tu identidad, haz clic en el siguiente enlace:</p>
      <p>
        <a href="{verify_url}"
           style="background:#6366f1;color:#fff;padding:10px 20px;
                  border-radius:9999px;text-decoration:none;font-weight:700">
          Confirmar solicitud
        </a>
      </p>
      <p style="color:#6b7280;font-size:13px">
        Este enlace es de un solo uso. Si no realizaste esta solicitud, ignora este mensaje.
      </p>
      <p style="color:#6b7280;font-size:12px">
        Folio: <code>{dsr['id']}</code>
      </p>
    </div>
    """

    try:
        import httpx  # already in requirements from other modules
        payload = {
            "from": "DesarrollosMX <privacidad@desarrollosmx.com>",
            "to": [dsr["subject_email"]],
            "subject": f"Confirma tu solicitud LFPDPPP: {label}",
            "html": html_body,
        }
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {resend_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
        return {"ok": r.status_code < 300, "status_code": r.status_code}
    except Exception as exc:
        log.warning("[compliance] send_dsr_confirmation_email failed: %s", exc)
        return {"ok": False, "error": str(exc)}


# ─── Retention cron ───────────────────────────────────────────────────────────

async def cron_compliance_audit_retention_check(db) -> dict:
    """Monthly: flag DSR requests pending > 30 days and report totals."""
    cutoff_30d = (_now() - timedelta(days=30)).isoformat()

    overdue = await db[_DSR_COLL].count_documents({
        "status": {"$in": ["pending", "verified"]},
        "created_at": {"$lte": cutoff_30d},
    })

    if overdue > 0:
        try:
            await db.system_alerts.insert_one({
                "id": _new_id("sa"),
                "severity": "warning",
                "title": f"DSR pendientes > 30 días: {overdue} solicitudes",
                "message": (
                    f"{overdue} solicitudes LFPDPPP llevan más de 30 días sin procesar. "
                    "Revisar /superadmin/compliance."
                ),
                "source": "compliance_cron",
                "resolved": False,
                "created_at": _iso(),
            })
        except Exception:
            pass

    total_audit = await db[_AUDIT_COLL].count_documents({})
    log.info(
        "[compliance] retention check: overdue_dsr=%d, total_audit=%d",
        overdue, total_audit,
    )
    return {
        "ok": True,
        "dsr_overdue_30d": overdue,
        "compliance_audit_total": total_audit,
        "checked_at": _iso(),
    }


def schedule_compliance_audit_retention_cron(scheduler, db) -> None:
    """Register 1ro-mes 10:00 MX cron for retention check (system cron #32)."""
    from apscheduler.triggers.cron import CronTrigger
    try:
        from cron_heartbeat import wrap_apscheduler_job
    except Exception:
        def wrap_apscheduler_job(fn, _):  # noqa: E306
            return fn

    scheduler.add_job(
        wrap_apscheduler_job(
            cron_compliance_audit_retention_check, "compliance_audit_retention"
        ),
        CronTrigger(day=1, hour=10, minute=0, timezone="America/Mexico_City"),
        args=[db],
        id="compliance_audit_retention",
        replace_existing=True,
        misfire_grace_time=3600,
    )
    log.info("[compliance] retention check cron registered (1ro mes 10:00 MX)")
