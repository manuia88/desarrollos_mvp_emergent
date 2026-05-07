"""Phase 18 · Batch 35 — Inmobiliaria public signup service.

Creates a new multi-tenant Inmobiliaria + admin user in a single flow.

Schema:
  db.inmobiliarias:
    {id, name, type='broker', status, ampi_verified, ampi_id?, ampi_expires_at?,
     ampi_manual_review, brokers_count, contact, rfc?, founded_year?,
     created_by_user_id, created_at, is_system_default=False}

  db.inmobiliaria_internal_users:
    {id, inmobiliaria_id, email, name, role='admin', status='active', user_id, ...}

  db.users:
    {user_id, email, name, password_hash, role='inmobiliaria_admin',
     tenant_id=<inmobiliaria_id>, onboarded=True, created_at}
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from services.ampi_verification import validate_ampi_id, record_verification

log = logging.getLogger("dmx.inmobiliaria_signup")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


async def signup_inmobiliaria(
    db,
    *,
    company_name: str,
    admin_email: str,
    admin_password_hash: str,
    admin_name: str,
    ampi_id: Optional[str] = None,
    rfc: Optional[str] = None,
    founded_year: Optional[int] = None,
    contact_phone: Optional[str] = None,
) -> Dict[str, Any]:
    """Idempotent on email: if user already exists raises ValueError.
    Returns: {inmobiliaria, user_id}
    """
    company_name = (company_name or "").strip()
    admin_email = (admin_email or "").strip().lower()

    if not company_name or len(company_name) < 2:
        raise ValueError("Nombre de la inmobiliaria es obligatorio")
    if not admin_email or "@" not in admin_email:
        raise ValueError("Email del administrador inválido")

    # Reject duplicate user
    existing_user = await db.users.find_one({"email": admin_email}, {"_id": 0, "user_id": 1})
    if existing_user:
        raise ValueError("Ya existe una cuenta con ese email")

    # AMPI verification (stub)
    ampi_result = {"valid": False, "ampi_id": "", "manual_review_required": False, "reason": None, "expires_at": None}
    if ampi_id:
        ampi_result = validate_ampi_id(ampi_id)
        if not ampi_result["valid"]:
            raise ValueError(ampi_result.get("reason") or "AMPI ID inválido")

    inm_id = _new_id("inm")
    now_iso = _now_iso()
    inm_doc = {
        "id": inm_id,
        "name": company_name,
        "type": "broker",
        "status": "active",
        "is_system_default": False,
        "ampi_verified": bool(ampi_result.get("valid")),
        "ampi_id": ampi_result.get("ampi_id") or None,
        "ampi_expires_at": ampi_result.get("expires_at"),
        "ampi_manual_review": bool(ampi_result.get("manual_review_required")),
        "rfc": (rfc or "").strip().upper() or None,
        "founded_year": founded_year,
        "brokers_count": 0,
        "contact": {"email": admin_email, "phone": contact_phone or ""},
        "created_by_user_id": None,  # filled below
        "created_at": now_iso,
    }
    await db.inmobiliarias.insert_one(inm_doc)
    inm_doc.pop("_id", None)

    # Record AMPI verification audit trail
    if ampi_id:
        await record_verification(db, inm_id, ampi_id, ampi_result)

    # Create admin user (in db.users) bound to this tenant
    user_id = _new_id("user")
    await db.users.insert_one({
        "user_id": user_id,
        "email": admin_email,
        "name": admin_name or admin_email.split("@")[0],
        "password_hash": admin_password_hash,
        "role": "inmobiliaria_admin",
        "tenant_id": inm_id,
        "onboarded": True,
        "created_at": datetime.now(timezone.utc),
    })

    # Mirror entry in inmobiliaria_internal_users (so existing CRUD/dashboard works)
    await db.inmobiliaria_internal_users.insert_one({
        "id": _new_id("inm_user"),
        "inmobiliaria_id": inm_id,
        "email": admin_email,
        "name": admin_name or admin_email.split("@")[0],
        "role": "admin",
        "status": "active",
        "password_hash": None,  # auth lives in db.users
        "activation_token": None,
        "last_login_at": None,
        "created_at": now_iso,
        "updated_at": now_iso,
        "user_id": user_id,
    })

    # Backfill created_by_user_id
    await db.inmobiliarias.update_one(
        {"id": inm_id}, {"$set": {"created_by_user_id": user_id, "brokers_count": 1}}
    )
    inm_doc["created_by_user_id"] = user_id
    inm_doc["brokers_count"] = 1

    return {"inmobiliaria": inm_doc, "user_id": user_id, "ampi_result": ampi_result}
