"""Phase 14 · Batch 37 — Internal Users service.

Manages in-house user invitations and onboarding for developer orgs and inmobiliarias.

Schemas:
  db.invitations: {
    invitation_id (uuid), email, org_type ('dev'|'inmobiliaria'), org_id, role,
    invited_by_user_id, invitation_token_hash, expires_at (7d),
    status: 'pending'|'accepted'|'expired'|'revoked',
    metadata: {assigned_projects?, assigned_dev_partnerships?, name?},
    created_at, accepted_at?, revoked_at?, revoked_by_user_id?
  }

  db.dev_internal_users: {
    id (uuid), user_id (FK→users, None until accepted), dev_org_id, role,
    email, name, invited_by_user_id, invited_at, accepted_at?,
    status: 'pending_invitation'|'active'|'suspended',
    assigned_projects: [project_id]?
  }

  db.inmobiliaria_internal_users (B35 compatible, extended):
    existing fields + assigned_dev_partnerships: [dev_org_id]?
"""
from __future__ import annotations

import hashlib
import logging
import secrets
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.internal_users")

INV_EXPIRY_DAYS = 7

DEV_ROLES = {
    "developer_admin", "developer_director",
    "developer_advisor", "developer_obras", "developer_marketing",
}
INM_ROLES = {
    "inmobiliaria_admin", "inmobiliaria_director",
    "inmobiliaria_advisor", "inmobiliaria_marketing",
}

ROLE_TO_DB_ROLE = {
    # dev roles → stored in db.users.role
    "developer_admin": "developer_admin",
    "developer_director": "developer_member",   # internal_role='director'
    "developer_advisor": "developer_member",    # internal_role='advisor'
    "developer_obras": "developer_member",      # internal_role='obras'
    "developer_marketing": "developer_member",  # internal_role='marketing'
    # inmobiliaria roles
    "inmobiliaria_admin": "inmobiliaria_admin",
    "inmobiliaria_director": "inmobiliaria_director",
    "inmobiliaria_advisor": "inmobiliaria_member",
    "inmobiliaria_marketing": "inmobiliaria_member",
}
ROLE_INTERNAL = {
    "developer_director": "commercial_director",
    "developer_advisor": "advisor",
    "developer_obras": "obras",
    "developer_marketing": "marketing",
    "inmobiliaria_advisor": "asesor",
    "inmobiliaria_marketing": "marketing",
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


# ─── Indexes ──────────────────────────────────────────────────────────────────

async def ensure_invitation_indexes(db) -> None:
    await db.invitations.create_index("invitation_id", unique=True)
    await db.invitations.create_index("invitation_token_hash", unique=True, sparse=True)
    await db.invitations.create_index([("org_type", 1), ("org_id", 1)])
    await db.invitations.create_index("email")
    await db.invitations.create_index("status")
    await db.dev_internal_users.create_index("id", unique=True)
    await db.dev_internal_users.create_index([("dev_org_id", 1), ("email", 1)])
    await db.dev_internal_users.create_index("user_id", sparse=True)
    await db.inmobiliaria_internal_users.create_index("invitation_id", sparse=True)
    log.info("[internal_users] indexes ensured")


# ─── Invite ───────────────────────────────────────────────────────────────────

async def invite_internal_user(
    db,
    *,
    org_type: str,  # 'dev' | 'inmobiliaria'
    org_id: str,
    email: str,
    role: str,
    invited_by_user_id: str,
    name: Optional[str] = None,
    assigned_projects: Optional[List[str]] = None,     # dev only
    assigned_dev_partnerships: Optional[List[str]] = None,  # inmobiliaria only
) -> Dict[str, Any]:
    """Creates invitation + mirrors pending row in the correct internal_users collection.
    Sends branded email with magic link.
    """
    email = (email or "").strip().lower()
    if not email or "@" not in email:
        raise ValueError("Email inválido")

    valid_roles = DEV_ROLES if org_type == "dev" else INM_ROLES
    if role not in valid_roles:
        raise ValueError(f"Rol inválido: {role!r}")

    # Block: 1 user can only belong to 1 org
    existing_user = await db.users.find_one({"email": email}, {"_id": 0, "role": 1, "tenant_id": 1})
    if existing_user and existing_user.get("tenant_id") and existing_user["tenant_id"] != org_id:
        raise ValueError("Este email ya pertenece a otra organización")

    # Block duplicate pending/active invitation
    dup = await db.invitations.find_one(
        {"email": email, "org_id": org_id, "status": {"$in": ["pending", "accepted"]}},
        {"_id": 0, "invitation_id": 1},
    )
    if dup:
        raise ValueError("Ya existe una invitación activa o aceptada para ese email en esta organización")

    now = _now()
    token = secrets.token_urlsafe(32)
    token_hash = _hash_token(token)
    inv_id = str(uuid.uuid4())

    doc: Dict[str, Any] = {
        "invitation_id": inv_id,
        "email": email,
        "org_type": org_type,
        "org_id": org_id,
        "role": role,
        "invited_by_user_id": invited_by_user_id,
        "invitation_token_hash": token_hash,
        "expires_at": now + timedelta(days=INV_EXPIRY_DAYS),
        "status": "pending",
        "metadata": {
            "name": name or email.split("@")[0],
            "assigned_projects": assigned_projects or [],
            "assigned_dev_partnerships": assigned_dev_partnerships or [],
        },
        "created_at": now,
        "accepted_at": None,
        "revoked_at": None,
        "revoked_by_user_id": None,
    }
    await db.invitations.insert_one(doc)
    doc.pop("_id", None)
    doc["invitation_token"] = token  # return raw token only once

    # Mirror as pending in the correct internal users collection
    if org_type == "dev":
        await db.dev_internal_users.update_one(
            {"dev_org_id": org_id, "email": email},
            {"$set": {
                "id": str(uuid.uuid4()),
                "dev_org_id": org_id, "email": email,
                "name": name or email.split("@")[0],
                "role": role, "status": "pending_invitation",
                "user_id": None,
                "invited_by_user_id": invited_by_user_id,
                "invited_at": now.isoformat(),
                "accepted_at": None,
                "invitation_id": inv_id,
                "assigned_projects": assigned_projects or [],
            }},
            upsert=True,
        )
    else:
        # inmobiliaria — extend B35 schema
        await db.inmobiliaria_internal_users.update_one(
            {"inmobiliaria_id": org_id, "email": email},
            {"$set": {
                "id": str(uuid.uuid4()),
                "inmobiliaria_id": org_id, "email": email,
                "name": name or email.split("@")[0],
                "role": _map_inmobiliaria_role(role),
                "status": "pending",
                "password_hash": None,
                "activation_token": token,  # B35 compat
                "invitation_id": inv_id,
                "last_login_at": None,
                "created_at": now.isoformat(),
                "updated_at": now.isoformat(),
                "user_id": None,
                "assigned_dev_partnerships": assigned_dev_partnerships or [],
            }},
            upsert=True,
        )

    # Send invitation email
    try:
        await _send_invitation_email(db, email, token, org_type, org_id, role, invited_by_user_id)
    except Exception as e:
        log.warning(f"[internal_users.invite] email failed: {e}")

    return _serialize_inv(doc)


# ─── Lookup (for frontend pre-fill) ──────────────────────────────────────────

async def lookup_invitation_by_token(db, token: str) -> Dict[str, Any]:
    """Returns invitation info for pre-filling the InHouseSignup form."""
    token_hash = _hash_token(token)
    doc = await db.invitations.find_one({"invitation_token_hash": token_hash}, {"_id": 0})
    if not doc:
        raise ValueError("Invitación no encontrada")
    if doc["status"] == "accepted":
        raise ValueError("Esta invitación ya fue aceptada")
    if doc["status"] == "revoked":
        raise ValueError("Esta invitación fue revocada")

    now = _now()
    expires = doc.get("expires_at")
    if isinstance(expires, datetime):
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if expires < now:
            await db.invitations.update_one(
                {"invitation_id": doc["invitation_id"]},
                {"$set": {"status": "expired"}},
            )
            raise ValueError("Esta invitación expiró · solicita una nueva")

    # Get org_name for display
    org_name = await _get_org_name(db, doc["org_type"], doc["org_id"])
    return {
        "invitation_id": doc["invitation_id"],
        "email": doc["email"],
        "role": doc["role"],
        "org_type": doc["org_type"],
        "org_id": doc["org_id"],
        "org_name": org_name,
        "name_hint": doc.get("metadata", {}).get("name", ""),
        "expires_at": doc["expires_at"].isoformat() if isinstance(doc["expires_at"], datetime) else doc["expires_at"],
    }


# ─── Accept ───────────────────────────────────────────────────────────────────

async def accept_invitation(
    db,
    token: str,
    name: str,
    password_hash: Optional[str] = None,
) -> Dict[str, Any]:
    """Validates invitation + creates user + updates internal_users row.
    Returns user_doc for session creation.
    """
    token_hash = _hash_token(token)
    inv = await db.invitations.find_one({"invitation_token_hash": token_hash}, {"_id": 0})
    if not inv:
        raise ValueError("Token de invitación inválido")
    if inv["status"] == "accepted":
        raise ValueError("Esta invitación ya fue aceptada")
    if inv["status"] == "revoked":
        raise ValueError("Esta invitación fue revocada")

    now = _now()
    expires = inv.get("expires_at")
    if isinstance(expires, datetime):
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if expires < now:
            await db.invitations.update_one(
                {"invitation_id": inv["invitation_id"]},
                {"$set": {"status": "expired"}},
            )
            raise ValueError("El link expiró · solicita una nueva invitación")

    email = inv["email"]
    org_type = inv["org_type"]
    org_id = inv["org_id"]
    role = inv["role"]
    meta = inv.get("metadata", {})

    # Block 1 user / 1 org: check if user already has a different tenant
    existing_user = await db.users.find_one({"email": email}, {"_id": 0})
    if existing_user:
        existing_tid = existing_user.get("tenant_id")
        if existing_tid and existing_tid != org_id:
            raise ValueError("Este email ya pertenece a otra organización")
        user_id = existing_user["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {
                "name": name or existing_user.get("name"),
                "role": ROLE_TO_DB_ROLE.get(role, "developer_member"),
                "internal_role": ROLE_INTERNAL.get(role, ""),
                "tenant_id": org_id,
                "onboarded": True,
                "last_login_at": now,
            }},
        )
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": name or email.split("@")[0],
            "password_hash": password_hash,
            "role": ROLE_TO_DB_ROLE.get(role, "developer_member"),
            "internal_role": ROLE_INTERNAL.get(role, ""),
            "tenant_id": org_id,
            "onboarded": True,
            "created_at": now,
            "last_login_at": now,
        })

    # Mark invitation accepted
    await db.invitations.update_one(
        {"invitation_id": inv["invitation_id"]},
        {"$set": {"status": "accepted", "accepted_at": now}},
    )

    # Update internal_users row
    if org_type == "dev":
        await db.dev_internal_users.update_one(
            {"dev_org_id": org_id, "email": email},
            {"$set": {
                "user_id": user_id,
                "name": name,
                "status": "active",
                "accepted_at": now.isoformat(),
                "assigned_projects": meta.get("assigned_projects", []),
            }},
            upsert=True,
        )
    else:
        await db.inmobiliaria_internal_users.update_one(
            {"inmobiliaria_id": org_id, "email": email},
            {"$set": {
                "user_id": user_id,
                "name": name,
                "status": "active",
                "accepted_at": now.isoformat(),
                "updated_at": now.isoformat(),
                "assigned_dev_partnerships": meta.get("assigned_dev_partnerships", []),
            }},
            upsert=True,
        )

    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    return user_doc


# ─── CRUD ─────────────────────────────────────────────────────────────────────

async def list_dev_internal_users(db, dev_org_id: str) -> List[Dict[str, Any]]:
    docs = await db.dev_internal_users.find(
        {"dev_org_id": dev_org_id},
        {"_id": 0},
    ).sort("invited_at", -1).to_list(500)
    return [_enrich_internal_user(d) for d in docs]


async def list_inmobiliaria_internal_users(db, inmobiliaria_id: str) -> List[Dict[str, Any]]:
    docs = await db.inmobiliaria_internal_users.find(
        {"inmobiliaria_id": inmobiliaria_id},
        {"_id": 0, "password_hash": 0},
    ).sort("created_at", -1).to_list(500)
    return [_enrich_internal_user(d) for d in docs]


async def update_dev_internal_user(
    db,
    *,
    dev_org_id: str,
    target_email: str,
    updated_by_user_id: str,
    role: Optional[str] = None,
    assigned_projects: Optional[List[str]] = None,
    status: Optional[str] = None,
) -> Dict[str, Any]:
    patch: Dict[str, Any] = {}
    if role:
        if role not in DEV_ROLES:
            raise ValueError(f"Rol inválido: {role!r}")
        patch["role"] = role
        # Also update db.users
        u = await db.dev_internal_users.find_one({"dev_org_id": dev_org_id, "email": target_email}, {"_id": 0, "user_id": 1})
        if u and u.get("user_id"):
            await db.users.update_one(
                {"user_id": u["user_id"]},
                {"$set": {
                    "role": ROLE_TO_DB_ROLE.get(role, "developer_member"),
                    "internal_role": ROLE_INTERNAL.get(role, ""),
                }},
            )
    if assigned_projects is not None:
        patch["assigned_projects"] = assigned_projects
    if status in ("active", "suspended", "pending_invitation"):
        patch["status"] = status
        if status == "suspended":
            u = await db.dev_internal_users.find_one({"dev_org_id": dev_org_id, "email": target_email}, {"_id": 0, "user_id": 1})
            if u and u.get("user_id"):
                await _invalidate_sessions(db, u["user_id"])
    if not patch:
        raise ValueError("Sin cambios")

    await db.dev_internal_users.update_one(
        {"dev_org_id": dev_org_id, "email": target_email},
        {"$set": patch},
    )
    try:
        from audit_log import log_mutation
        await log_mutation(
            db, {"user_id": updated_by_user_id, "role": "developer_admin"},
            "update", "dev_internal_users", target_email,
            before={}, after=patch,
        )
    except Exception as _e:
        log.warning("[audit] log_mutation perdido (update dev_internal_users %s): %s", target_email, _e)
    doc = await db.dev_internal_users.find_one({"dev_org_id": dev_org_id, "email": target_email}, {"_id": 0})
    return _enrich_internal_user(doc) if doc else {}


async def update_inmobiliaria_internal_user(
    db,
    *,
    inmobiliaria_id: str,
    target_email: str,
    updated_by_user_id: str,
    role: Optional[str] = None,
    assigned_dev_partnerships: Optional[List[str]] = None,
    status: Optional[str] = None,
) -> Dict[str, Any]:
    patch: Dict[str, Any] = {"updated_at": _now().isoformat()}
    if role:
        if role not in INM_ROLES:
            raise ValueError(f"Rol inválido: {role!r}")
        patch["role"] = _map_inmobiliaria_role(role)
    if assigned_dev_partnerships is not None:
        patch["assigned_dev_partnerships"] = assigned_dev_partnerships
    if status in ("active", "suspended"):
        patch["status"] = status
        if status == "suspended":
            u = await db.inmobiliaria_internal_users.find_one(
                {"inmobiliaria_id": inmobiliaria_id, "email": target_email},
                {"_id": 0, "user_id": 1},
            )
            if u and u.get("user_id"):
                await _invalidate_sessions(db, u["user_id"])

    await db.inmobiliaria_internal_users.update_one(
        {"inmobiliaria_id": inmobiliaria_id, "email": target_email},
        {"$set": patch},
    )
    doc = await db.inmobiliaria_internal_users.find_one(
        {"inmobiliaria_id": inmobiliaria_id, "email": target_email},
        {"_id": 0, "password_hash": 0},
    )
    return _enrich_internal_user(doc) if doc else {}


async def suspend_user(db, user_id: str, suspended_by: str) -> None:
    """Suspends a user: sets status='suspended' + invalidates sessions."""
    await db.dev_internal_users.update_many(
        {"user_id": user_id},
        {"$set": {"status": "suspended"}},
    )
    await db.inmobiliaria_internal_users.update_many(
        {"user_id": user_id},
        {"$set": {"status": "suspended", "updated_at": _now().isoformat()}},
    )
    await _invalidate_sessions(db, user_id)
    try:
        from audit_log import log_mutation
        await log_mutation(
            db, {"user_id": suspended_by, "role": "admin"},
            "update", "users", user_id,
            before={"status": "active"}, after={"status": "suspended"},
        )
    except Exception as _e:
        log.warning("[audit] log_mutation perdido (suspend user %s): %s", user_id, _e)


async def revoke_invitation(db, invitation_id: str, revoked_by: str) -> Dict[str, Any]:
    inv = await db.invitations.find_one({"invitation_id": invitation_id}, {"_id": 0})
    if not inv:
        raise ValueError("Invitación no encontrada")
    if inv["status"] != "pending":
        raise ValueError(f"Solo se puede revocar una invitación pendiente, no '{inv['status']}'")
    now = _now()
    await db.invitations.update_one(
        {"invitation_id": invitation_id},
        {"$set": {"status": "revoked", "revoked_at": now, "revoked_by_user_id": revoked_by}},
    )
    doc = await db.invitations.find_one({"invitation_id": invitation_id}, {"_id": 0})
    doc.pop("_id", None)
    return _serialize_inv(doc)


async def update_assigned_projects(
    db, user_id: str, project_ids: List[str], updated_by: str
) -> None:
    await db.dev_internal_users.update_many(
        {"user_id": user_id},
        {"$set": {"assigned_projects": project_ids}},
    )
    try:
        from audit_log import log_mutation
        await log_mutation(
            db, {"user_id": updated_by, "role": "developer_admin"},
            "update", "dev_internal_users", user_id,
            before={}, after={"assigned_projects": project_ids},
        )
    except Exception as _e:
        log.warning("[audit] log_mutation perdido (update assigned_projects dev_internal_users %s): %s", user_id, _e)


# ─── Resend invitation ────────────────────────────────────────────────────────

async def resend_invitation(db, invitation_id: str, resent_by: str) -> Dict[str, Any]:
    inv = await db.invitations.find_one({"invitation_id": invitation_id}, {"_id": 0})
    if not inv:
        raise ValueError("Invitación no encontrada")
    if inv["status"] not in ("pending", "expired"):
        raise ValueError("Solo se puede reenviar una invitación pendiente o expirada")

    now = _now()
    token = secrets.token_urlsafe(32)
    token_hash = _hash_token(token)
    await db.invitations.update_one(
        {"invitation_id": invitation_id},
        {"$set": {
            "invitation_token_hash": token_hash,
            "expires_at": now + timedelta(days=INV_EXPIRY_DAYS),
            "status": "pending",
        }},
    )
    try:
        await _send_invitation_email(
            db, inv["email"], token, inv["org_type"], inv["org_id"], inv["role"], resent_by,
        )
    except Exception as e:
        log.warning(f"[internal_users.resend] email failed: {e}")
    return {"invitation_id": invitation_id, "resent": True}


# ─── Private helpers ──────────────────────────────────────────────────────────

def _map_inmobiliaria_role(role: str) -> str:
    ROLE_MAP = {
        "inmobiliaria_admin": "admin",
        "inmobiliaria_director": "director",
        "inmobiliaria_advisor": "asesor",
        "inmobiliaria_marketing": "marketing",
    }
    return ROLE_MAP.get(role, role)


async def _get_org_name(db, org_type: str, org_id: str) -> str:
    try:
        if org_type == "dev":
            doc = await db.dev_orgs.find_one({"org_id": org_id}, {"_id": 0, "name": 1})
            if doc:
                return doc.get("name", org_id)
            # fallback: data_developments
            from data_developments import DEVELOPMENTS
            for d in DEVELOPMENTS:
                if d.get("developer_id") == org_id:
                    return d.get("developer_name") or org_id
        else:
            doc = await db.inmobiliarias.find_one(
                {"id": org_id}, {"_id": 0, "name": 1, "razon_social": 1}
            )
            if doc:
                return doc.get("razon_social") or doc.get("name") or org_id
    except Exception:
        pass
    return org_id


async def _invalidate_sessions(db, user_id: str) -> None:
    """Invalidate all active sessions for a user."""
    try:
        await db.user_sessions.delete_many({"user_id": user_id})
        await db.access_tokens.delete_many({"user_id": user_id})
    except Exception as e:
        log.debug(f"[internal_users._invalidate_sessions] {e}")


def _enrich_internal_user(doc: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(doc)
    for f in ("invited_at", "accepted_at", "created_at", "updated_at"):
        if f in out and isinstance(out[f], datetime):
            out[f] = out[f].isoformat()
    return out


def _serialize_inv(doc: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(doc)
    out.pop("invitation_token_hash", None)
    for f in ("created_at", "accepted_at", "revoked_at", "expires_at"):
        if f in out and isinstance(out[f], datetime):
            out[f] = out[f].isoformat()
    return out


async def _send_invitation_email(
    db, email: str, token: str, org_type: str, org_id: str, role: str, invited_by: str,
) -> None:
    org_name = await _get_org_name(db, org_type, org_id)
    role_labels = {
        "developer_admin": "Administrador", "developer_director": "Director Comercial",
        "developer_advisor": "Asesor", "developer_obras": "Obras",
        "developer_marketing": "Marketing", "inmobiliaria_admin": "Administrador",
        "inmobiliaria_director": "Director", "inmobiliaria_advisor": "Asesor",
        "inmobiliaria_marketing": "Marketing",
    }
    role_label = role_labels.get(role, role)

    base = ""
    try:
        import os
        base = os.environ.get("FRONTEND_BASE_URL") or os.environ.get("PUBLIC_BASE_URL") or ""
    except Exception:
        pass
    link = f"{base}/in-house-signup?token={token}"

    html = f"""<!DOCTYPE html><html lang="es"><body style="background:#06080F;font-family:'DM Sans',Arial;padding:32px 20px;max-width:560px;margin:0 auto;">
      <div style="text-align:center;margin-bottom:22px;">
        <div style="display:inline-block;padding:7px 18px;background:linear-gradient(90deg,#6366F1,#EC4899);border-radius:9999px;color:#fff;font-weight:700;font-size:12px;">DesarrollosMX</div>
      </div>
      <h1 style="font-family:Outfit,Arial;font-weight:800;font-size:22px;color:#F0EBE0;margin:0 0 12px;letter-spacing:-0.02em;">Invitacion a {org_name}</h1>
      <p style="color:rgba(240,235,224,0.65);font-size:14px;line-height:1.6;margin:0 0 8px;">
        Has sido invitado a unirte a <strong>{org_name}</strong> como <strong>{role_label}</strong> en DesarrollosMX.
      </p>
      <p style="color:rgba(240,235,224,0.50);font-size:13px;line-height:1.6;margin:0 0 22px;">
        Este link es valido por {INV_EXPIRY_DAYS} dias. Haz clic para activar tu cuenta.
      </p>
      <div style="text-align:center;margin:18px 0;">
        <a href="{link}" style="display:inline-block;padding:13px 28px;background:linear-gradient(90deg,#6366F1,#EC4899);border-radius:9999px;color:#fff;font-weight:700;font-size:14px;text-decoration:none;">
          Activar mi cuenta
        </a>
      </div>
      <p style="color:rgba(240,235,224,0.40);font-size:11px;margin:22px 0 0;">
        Si no esperabas esta invitacion, ignora este correo.
      </p>
    </body></html>"""

    try:
        from services.lead_capture import _send_email
        await _send_email(to=email, subject=f"Invitacion a unirte a {org_name} en DesarrollosMX", html=html)
    except Exception as e:
        log.warning(f"[internal_users._send_invitation_email] {e}")
