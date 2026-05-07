"""Phase 18 · Batch 35 — Inmobiliaria relationships service.

Manages two relationship types:
  1) inmobiliaria <-> asesor (advisor employment)
     collection: db.inmobiliaria_advisor_relationships
       {rel_id, inmobiliaria_id, asesor_id, asesor_email, status:'pending|active|inactive',
        invited_by_user_id, invited_at, accepted_at?}

  2) inmobiliaria <-> developer organization (commercial partnership)
     collection: db.inmobiliaria_dev_partnerships
       {partnership_id, inmobiliaria_id, dev_org_id, dev_org_name?,
        commission_pct?, status:'pending|active|paused|terminated',
        notes?, created_by_user_id, created_at, updated_at}

NB: Asesor invitation also creates pending entries in db.inmobiliaria_internal_users
    + db.users (when accepted) for backwards-compat with existing dashboards/CRUD.
"""
from __future__ import annotations

import logging
import secrets
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.inmobiliaria_relationships")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


# ─── Advisor invitations ──────────────────────────────────────────────────────

async def invite_advisor(
    db,
    *,
    inmobiliaria_id: str,
    invited_email: str,
    invited_name: str,
    invited_role: str = "asesor",
    invited_by_user_id: str,
) -> Dict[str, Any]:
    """Creates a pending advisor relationship + a pending internal_user entry
    (status='pending') with an activation_token so the asesor can accept.
    """
    invited_email = (invited_email or "").strip().lower()
    if not invited_email or "@" not in invited_email:
        raise ValueError("Email inválido")
    if invited_role not in ("asesor", "admin", "director", "marketing"):
        raise ValueError("Rol inválido")

    # Reject duplicate active relationship
    dup = await db.inmobiliaria_advisor_relationships.find_one(
        {"inmobiliaria_id": inmobiliaria_id, "asesor_email": invited_email,
         "status": {"$in": ["pending", "active"]}},
        {"_id": 0, "rel_id": 1},
    )
    if dup:
        raise ValueError("Ya existe una invitación o relación activa para ese email")

    rel_id = _new_id("inm_rel")
    token = secrets.token_urlsafe(24)
    now_iso = _now_iso()
    rel_doc = {
        "rel_id": rel_id,
        "inmobiliaria_id": inmobiliaria_id,
        "asesor_id": None,
        "asesor_email": invited_email,
        "asesor_name": invited_name or invited_email.split("@")[0],
        "role": invited_role,
        "status": "pending",
        "activation_token": token,
        "invited_by_user_id": invited_by_user_id,
        "invited_at": now_iso,
        "accepted_at": None,
    }
    await db.inmobiliaria_advisor_relationships.insert_one(rel_doc)
    rel_doc.pop("_id", None)

    # Mirror as pending internal user (for dashboard listing)
    await db.inmobiliaria_internal_users.insert_one({
        "id": _new_id("inm_user"),
        "inmobiliaria_id": inmobiliaria_id,
        "email": invited_email,
        "name": rel_doc["asesor_name"],
        "role": invited_role,
        "status": "pending",
        "password_hash": None,
        "activation_token": token,
        "last_login_at": None,
        "created_at": now_iso,
        "updated_at": now_iso,
        "user_id": None,
    })
    return rel_doc


async def list_advisor_relationships(
    db, inmobiliaria_id: str, status: Optional[str] = None,
) -> List[Dict[str, Any]]:
    q: Dict[str, Any] = {"inmobiliaria_id": inmobiliaria_id}
    if status:
        q["status"] = status
    return await db.inmobiliaria_advisor_relationships.find(q, {"_id": 0}).sort("invited_at", -1).limit(200).to_list(200)


# ─── Developer partnerships ───────────────────────────────────────────────────

async def create_dev_partnership(
    db,
    *,
    inmobiliaria_id: str,
    dev_org_id: str,
    dev_org_name: Optional[str] = None,
    commission_pct: Optional[float] = None,
    notes: Optional[str] = None,
    created_by_user_id: str,
) -> Dict[str, Any]:
    if not inmobiliaria_id:
        raise ValueError("inmobiliaria_id requerido")
    if not dev_org_id or not str(dev_org_id).strip():
        raise ValueError("dev_org_id requerido")
    dev_org_id = str(dev_org_id).strip()

    if commission_pct is not None:
        try:
            commission_pct = float(commission_pct)
        except Exception:
            raise ValueError("commission_pct debe ser numérico")
        if not (0 <= commission_pct <= 50):
            raise ValueError("commission_pct fuera de rango (0-50)")

    dup = await db.inmobiliaria_dev_partnerships.find_one(
        {"inmobiliaria_id": inmobiliaria_id, "dev_org_id": dev_org_id,
         "status": {"$in": ["pending", "active", "paused"]}},
        {"_id": 0, "partnership_id": 1},
    )
    if dup:
        raise ValueError("Ya existe una alianza activa con ese desarrollador")

    pid = _new_id("inmp")
    now_iso = _now_iso()
    doc = {
        "partnership_id": pid,
        "inmobiliaria_id": inmobiliaria_id,
        "dev_org_id": dev_org_id,
        "dev_org_name": (dev_org_name or "").strip() or None,
        "commission_pct": commission_pct,
        "notes": (notes or "").strip()[:500] or None,
        "status": "pending",
        "created_by_user_id": created_by_user_id,
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    await db.inmobiliaria_dev_partnerships.insert_one(doc)
    doc.pop("_id", None)
    return doc


async def list_dev_partnerships(
    db, inmobiliaria_id: str, status: Optional[str] = None,
) -> List[Dict[str, Any]]:
    q: Dict[str, Any] = {"inmobiliaria_id": inmobiliaria_id}
    if status:
        q["status"] = status
    return await db.inmobiliaria_dev_partnerships.find(q, {"_id": 0}).sort("created_at", -1).limit(200).to_list(200)


async def update_dev_partnership_status(
    db, partnership_id: str, new_status: str,
) -> Dict[str, Any]:
    if new_status not in ("pending", "active", "paused", "terminated"):
        raise ValueError("status inválido")
    existing = await db.inmobiliaria_dev_partnerships.find_one(
        {"partnership_id": partnership_id}, {"_id": 0},
    )
    if not existing:
        raise ValueError("Alianza no encontrada")
    await db.inmobiliaria_dev_partnerships.update_one(
        {"partnership_id": partnership_id},
        {"$set": {"status": new_status, "updated_at": _now_iso()}},
    )
    after = await db.inmobiliaria_dev_partnerships.find_one(
        {"partnership_id": partnership_id}, {"_id": 0},
    )
    return after


# ─── Indexes ─────────────────────────────────────────────────────────────────

async def ensure_inmobiliaria_relationship_indexes(db) -> None:
    await db.inmobiliaria_advisor_relationships.create_index(
        [("rel_id", 1)], unique=True, background=True,
    )
    await db.inmobiliaria_advisor_relationships.create_index(
        [("inmobiliaria_id", 1), ("status", 1)], background=True,
    )
    await db.inmobiliaria_advisor_relationships.create_index(
        [("activation_token", 1)], unique=True, sparse=True, background=True,
    )
    await db.inmobiliaria_dev_partnerships.create_index(
        [("partnership_id", 1)], unique=True, background=True,
    )
    await db.inmobiliaria_dev_partnerships.create_index(
        [("inmobiliaria_id", 1), ("dev_org_id", 1)], background=True,
    )
    await db.ampi_verifications.create_index(
        [("inmobiliaria_id", 1), ("created_at", -1)], background=True,
    )
