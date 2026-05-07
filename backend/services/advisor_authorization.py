"""Phase 13 · Batch 36 — Advisor Authorization (Whitelist) service.

Schema:
  db.dev_advisor_authorizations: {
    auth_id (uuid PK),
    dev_org_id: str,
    asesor_id: str,                        # user_id del asesor
    status: 'pending'|'approved'|'rejected'|'revoked',
    solicitud: {
      motivo: str,
      experiencia_colonia: str,            # colonias de experiencia (CSV)
      clientes_interesados_count: int,
    },
    comentario_decision: str?,
    auto_approved: bool (default false),
    requested_at: datetime,
    decided_at: datetime?,
    decided_by_user_id: str?,
    revoked_at: datetime?,
    revoked_by_user_id: str?,
    revoked_reason: str?,
  }
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.advisor_authorization")

VALID_STATUSES = {"pending", "approved", "rejected", "revoked"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt else None


# ─── Indexes ─────────────────────────────────────────────────────────────────

async def ensure_whitelist_indexes(db) -> None:
    # auth_id PK unique
    await db.dev_advisor_authorizations.create_index("auth_id", unique=True)
    # lookup: asesor + dev_org (for is_authorized + dup-guard)
    await db.dev_advisor_authorizations.create_index(
        [("asesor_id", 1), ("dev_org_id", 1)]
    )
    # list_pending per dev_org
    await db.dev_advisor_authorizations.create_index(
        [("dev_org_id", 1), ("status", 1)]
    )
    # list_for_asesor
    await db.dev_advisor_authorizations.create_index(
        [("asesor_id", 1), ("requested_at", -1)]
    )
    # auto_approve_rules — unique per dev_org
    await db.dev_auto_approve_rules.create_index("dev_org_id", unique=True)
    log.info("[advisor_authorization] indexes ensured")


# ─── Multi-tenant guard ───────────────────────────────────────────────────────

async def is_authorized(db, asesor_id: str, dev_org_id: str) -> bool:
    """True si el asesor tiene status='approved' para este developer."""
    doc = await db.dev_advisor_authorizations.find_one(
        {"asesor_id": asesor_id, "dev_org_id": dev_org_id, "status": "approved"},
        {"_id": 0, "auth_id": 1},
    )
    return doc is not None


async def get_authorized_dev_org_ids(db, asesor_id: str) -> List[str]:
    """Retorna lista de dev_org_ids con acceso aprobado para el asesor."""
    docs = await db.dev_advisor_authorizations.find(
        {"asesor_id": asesor_id, "status": "approved"},
        {"_id": 0, "dev_org_id": 1},
    ).to_list(500)
    return [d["dev_org_id"] for d in docs]


# ─── List helpers ─────────────────────────────────────────────────────────────

async def list_pending(db, dev_org_id: str) -> List[Dict[str, Any]]:
    """Todas las solicitudes pendientes para un dev_org."""
    docs = await db.dev_advisor_authorizations.find(
        {"dev_org_id": dev_org_id, "status": "pending"},
        {"_id": 0},
    ).sort("requested_at", -1).to_list(500)
    return [_enrich(d) for d in docs]


async def list_for_asesor(db, asesor_id: str) -> List[Dict[str, Any]]:
    """Todas las solicitudes del asesor (cualquier estado)."""
    docs = await db.dev_advisor_authorizations.find(
        {"asesor_id": asesor_id},
        {"_id": 0},
    ).sort("requested_at", -1).to_list(500)
    return [_enrich(d) for d in docs]


async def list_all_for_dev(
    db, dev_org_id: str, status: Optional[str] = None
) -> List[Dict[str, Any]]:
    """Solicitudes de un dev_org filtradas por status (None=todas)."""
    q: Dict[str, Any] = {"dev_org_id": dev_org_id}
    if status:
        q["status"] = status
    docs = await db.dev_advisor_authorizations.find(
        q, {"_id": 0}
    ).sort("requested_at", -1).to_list(500)
    return [_enrich(d) for d in docs]


def _enrich(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Serialize datetimes."""
    out = dict(doc)
    for f in ("requested_at", "decided_at", "revoked_at"):
        v = out.get(f)
        if isinstance(v, datetime):
            out[f] = v.isoformat()
    return out


# ─── Core mutations ───────────────────────────────────────────────────────────

async def request_access(
    db,
    asesor_id: str,
    dev_org_id: str,
    motivo: str,
    experiencia_colonia: str,
    clientes_interesados_count: int,
) -> Dict[str, Any]:
    """Crea solicitud pending y verifica si aplica auto-approve.
    Returns dict con { auth_id, status, auto_approved }.
    """
    # Dup-guard: si ya existe una solicitud pending o approved, la retorna
    existing = await db.dev_advisor_authorizations.find_one(
        {"asesor_id": asesor_id, "dev_org_id": dev_org_id,
         "status": {"$in": ["pending", "approved"]}},
        {"_id": 0},
    )
    if existing:
        raise ValueError(
            "Ya tienes una solicitud activa o acceso aprobado para este desarrollador"
        )

    auth_id = str(uuid.uuid4())
    now = _now()
    doc: Dict[str, Any] = {
        "auth_id": auth_id,
        "dev_org_id": dev_org_id,
        "asesor_id": asesor_id,
        "status": "pending",
        "solicitud": {
            "motivo": motivo,
            "experiencia_colonia": experiencia_colonia,
            "clientes_interesados_count": int(clientes_interesados_count),
        },
        "comentario_decision": None,
        "auto_approved": False,
        "requested_at": now,
        "decided_at": None,
        "decided_by_user_id": None,
        "revoked_at": None,
        "revoked_by_user_id": None,
        "revoked_reason": None,
    }

    # Check auto-approve BEFORE inserting
    auto_ok = False
    try:
        from services.auto_approve_engine import check_auto_approve
        auto_ok = await check_auto_approve(db, asesor_id, dev_org_id)
    except Exception as e:
        log.warning(f"[whitelist.request] auto_approve check failed: {e}")

    if auto_ok:
        doc["status"] = "approved"
        doc["auto_approved"] = True
        doc["decided_at"] = now
        doc["decided_by_user_id"] = "system"

    await db.dev_advisor_authorizations.insert_one(doc)
    # Remove _id for response
    doc.pop("_id", None)

    if not auto_ok:
        # Notify dev_admins of the new pending request
        try:
            await _notify_dev_admins(db, dev_org_id, asesor_id, auth_id)
        except Exception as e:
            log.warning(f"[whitelist.request] notify dev_admins failed: {e}")

    out = _enrich(doc)
    return out


async def approve(
    db,
    auth_id: str,
    decided_by_user_id: str,
    comentario: Optional[str] = None,
) -> Dict[str, Any]:
    doc = await db.dev_advisor_authorizations.find_one(
        {"auth_id": auth_id}, {"_id": 0}
    )
    if not doc:
        raise ValueError("Solicitud no encontrada")
    if doc["status"] not in ("pending", "rejected"):
        raise ValueError(f"No se puede aprobar desde estado '{doc['status']}'")

    now = _now()
    patch = {
        "status": "approved",
        "decided_at": now,
        "decided_by_user_id": decided_by_user_id,
        "comentario_decision": comentario,
    }
    await db.dev_advisor_authorizations.update_one(
        {"auth_id": auth_id}, {"$set": patch}
    )

    # Audit log
    try:
        from audit_log import log_mutation
        await log_mutation(
            db, {"user_id": decided_by_user_id, "role": "developer_admin"},
            "update", "dev_advisor_authorization", auth_id,
            before={"status": doc["status"]},
            after={"status": "approved"},
        )
    except Exception:
        pass

    # log_activity
    try:
        from routes_dev_batch14 import log_activity
        await log_activity(
            db, decided_by_user_id, "developer_admin", "whitelist_approved",
            auth_id, "dev_advisor_authorization",
            metadata={"dev_org_id": doc["dev_org_id"], "asesor_id": doc["asesor_id"]},
        )
    except Exception:
        pass

    # Notificar al asesor
    try:
        from routes_dev_batch14 import create_notification
        await create_notification(
            db, doc["asesor_id"], "whitelist_approved",
            "Acceso aprobado",
            f"Tu solicitud de acceso a '{doc['dev_org_id']}' fue aprobada.",
            action_url="/asesor/inventario",
        )
    except Exception as e:
        log.warning(f"[whitelist.approve] notify asesor failed: {e}")

    # Email al asesor
    try:
        from services.lead_capture import _send_email
        asesor = await db.users.find_one(
            {"user_id": doc["asesor_id"]}, {"_id": 0, "email": 1, "name": 1}
        )
        if asesor and asesor.get("email"):
            html = _approval_email_html(doc["dev_org_id"], comentario)
            await _send_email(asesor["email"], "Acceso aprobado — DesarrollosMX", html)
    except Exception as e:
        log.warning(f"[whitelist.approve] email failed: {e}")

    updated = await db.dev_advisor_authorizations.find_one(
        {"auth_id": auth_id}, {"_id": 0}
    )
    return _enrich(updated)


async def reject(
    db,
    auth_id: str,
    decided_by_user_id: str,
    comentario: str,
) -> Dict[str, Any]:
    doc = await db.dev_advisor_authorizations.find_one(
        {"auth_id": auth_id}, {"_id": 0}
    )
    if not doc:
        raise ValueError("Solicitud no encontrada")
    if doc["status"] != "pending":
        raise ValueError(f"Solo se puede rechazar desde 'pending', no desde '{doc['status']}'")

    now = _now()
    patch = {
        "status": "rejected",
        "decided_at": now,
        "decided_by_user_id": decided_by_user_id,
        "comentario_decision": comentario,
    }
    await db.dev_advisor_authorizations.update_one(
        {"auth_id": auth_id}, {"$set": patch}
    )

    try:
        from audit_log import log_mutation
        await log_mutation(
            db, {"user_id": decided_by_user_id, "role": "developer_admin"},
            "update", "dev_advisor_authorization", auth_id,
            before={"status": "pending"},
            after={"status": "rejected", "comentario": comentario},
        )
    except Exception:
        pass

    try:
        from routes_dev_batch14 import log_activity
        await log_activity(
            db, decided_by_user_id, "developer_admin", "whitelist_rejected",
            auth_id, "dev_advisor_authorization",
            metadata={"asesor_id": doc["asesor_id"], "comentario": comentario},
        )
    except Exception:
        pass

    # Notificar al asesor
    try:
        from routes_dev_batch14 import create_notification
        await create_notification(
            db, doc["asesor_id"], "whitelist_rejected",
            "Solicitud de acceso rechazada",
            f"Tu solicitud para '{doc['dev_org_id']}' fue rechazada. Motivo: {comentario}",
            action_url="/asesor/mini-market",
        )
    except Exception as e:
        log.warning(f"[whitelist.reject] notify asesor failed: {e}")

    updated = await db.dev_advisor_authorizations.find_one(
        {"auth_id": auth_id}, {"_id": 0}
    )
    return _enrich(updated)


async def revoke(
    db,
    auth_id: str,
    revoked_by_user_id: str,
    reason: str,
) -> Dict[str, Any]:
    doc = await db.dev_advisor_authorizations.find_one(
        {"auth_id": auth_id}, {"_id": 0}
    )
    if not doc:
        raise ValueError("Autorización no encontrada")
    if doc["status"] != "approved":
        raise ValueError("Solo se puede revocar una autorización aprobada")

    now = _now()
    patch = {
        "status": "revoked",
        "revoked_at": now,
        "revoked_by_user_id": revoked_by_user_id,
        "revoked_reason": reason,
    }
    await db.dev_advisor_authorizations.update_one(
        {"auth_id": auth_id}, {"$set": patch}
    )

    try:
        from audit_log import log_mutation
        await log_mutation(
            db, {"user_id": revoked_by_user_id, "role": "developer_admin"},
            "update", "dev_advisor_authorization", auth_id,
            before={"status": "approved"},
            after={"status": "revoked", "reason": reason},
        )
    except Exception:
        pass

    try:
        from routes_dev_batch14 import log_activity
        await log_activity(
            db, revoked_by_user_id, "developer_admin", "whitelist_revoked",
            auth_id, "dev_advisor_authorization",
            metadata={"asesor_id": doc["asesor_id"], "reason": reason},
        )
    except Exception:
        pass

    # Notificar al asesor
    try:
        from routes_dev_batch14 import create_notification
        await create_notification(
            db, doc["asesor_id"], "whitelist_revoked",
            "Acceso revocado",
            f"Tu acceso a '{doc['dev_org_id']}' fue revocado. Motivo: {reason}",
            action_url="/asesor/mini-market",
        )
    except Exception as e:
        log.warning(f"[whitelist.revoke] notify asesor failed: {e}")

    updated = await db.dev_advisor_authorizations.find_one(
        {"auth_id": auth_id}, {"_id": 0}
    )
    return _enrich(updated)


async def bulk_approve(
    db,
    auth_ids: List[str],
    decided_by_user_id: str,
    comentario: Optional[str] = None,
) -> Dict[str, Any]:
    """Aprueba múltiples solicitudes en una sola operación."""
    results = {"approved": [], "errors": []}
    for auth_id in auth_ids:
        try:
            r = await approve(db, auth_id, decided_by_user_id, comentario)
            results["approved"].append(r["auth_id"])
        except Exception as e:
            results["errors"].append({"auth_id": auth_id, "error": str(e)})
    return results


# ─── Private helpers ──────────────────────────────────────────────────────────

async def _notify_dev_admins(
    db, dev_org_id: str, asesor_id: str, auth_id: str
) -> None:
    """Envía notification a todos los developer_admin del dev_org."""
    admins = await db.users.find(
        {"role": "developer_admin", "tenant_id": dev_org_id},
        {"_id": 0, "user_id": 1},
    ).to_list(50)
    if not admins:
        # fallback: buscar por dev_org_id field
        admins = await db.users.find(
            {"role": "developer_admin", "dev_org_id": dev_org_id},
            {"_id": 0, "user_id": 1},
        ).to_list(50)

    asesor = await db.users.find_one(
        {"user_id": asesor_id}, {"_id": 0, "name": 1, "email": 1}
    )
    asesor_name = (asesor or {}).get("name", "Un asesor")

    from routes_dev_batch14 import create_notification
    for admin in admins:
        await create_notification(
            db, admin["user_id"], "whitelist_request",
            "Nueva solicitud de acceso",
            f"{asesor_name} solicita acceso a tu inventario exclusivo.",
            action_url="/desarrollador/solicitudes",
            priority="high",
        )


def _approval_email_html(dev_org_id: str, comentario: Optional[str]) -> str:
    note = f"<p style='color:rgba(240,235,224,0.65);font-size:13px;margin:8px 0 0;'>Comentario: {comentario}</p>" if comentario else ""
    return f"""<!DOCTYPE html><html lang="es"><body style="background:#06080F;font-family:'DM Sans',Arial;padding:32px 20px;max-width:560px;margin:0 auto;">
      <div style="text-align:center;margin-bottom:22px;">
        <div style="display:inline-block;padding:7px 18px;background:linear-gradient(90deg,#6366F1,#EC4899);border-radius:9999px;color:#fff;font-weight:700;font-size:12px;">DesarrollosMX</div>
      </div>
      <h1 style="font-family:Outfit,Arial;font-weight:800;font-size:22px;color:#F0EBE0;margin:0 0 12px;letter-spacing:-0.02em;">Acceso aprobado</h1>
      <p style="color:rgba(240,235,224,0.65);font-size:14px;line-height:1.6;margin:0 0 8px;">
        Tu solicitud de acceso al inventario de <strong>{dev_org_id}</strong> fue aprobada.
        Ya puedes ver el inventario completo, comisiones reales y datos de contacto del desarrollador.
      </p>
      {note}
      <div style="text-align:center;margin:22px 0;">
        <a href="/asesor/inventario" style="display:inline-block;padding:13px 28px;background:linear-gradient(90deg,#6366F1,#EC4899);border-radius:9999px;color:#fff;font-weight:700;font-size:14px;text-decoration:none;">
          Ver inventario aliado
        </a>
      </div>
    </body></html>"""
