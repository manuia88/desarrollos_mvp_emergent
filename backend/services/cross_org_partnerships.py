"""Phase 14 · Batch 37 — Cross-Org Partnerships service.

Generic cross-org partnership schema (reuses B36 whitelist pattern).
Supports dev↔dev, inmobiliaria↔inmobiliaria, dev↔inmobiliaria partnerships.

Schema db.cross_org_partnerships:
  { partnership_id, requester_org_type: 'dev'|'inmobiliaria', requester_org_id,
    target_org_type: 'dev'|'inmobiliaria', target_org_id,
    status: 'pending'|'approved'|'rejected'|'revoked',
    commission_pct_default?, requested_by_user_id, requested_at,
    decided_at?, decided_by_user_id?, revoked_at?, revoked_by_user_id?,
    notes?, revoke_reason? }
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.cross_org_partnerships")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _serialize(doc: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(doc)
    out.pop("_id", None)
    for f in ("requested_at", "decided_at", "revoked_at"):
        v = out.get(f)
        if isinstance(v, datetime):
            out[f] = v.isoformat()
    return out


# ─── Indexes ──────────────────────────────────────────────────────────────────

async def ensure_cross_partnership_indexes(db) -> None:
    await db.cross_org_partnerships.create_index("partnership_id", unique=True)
    await db.cross_org_partnerships.create_index(
        [("requester_org_id", 1), ("target_org_id", 1)]
    )
    await db.cross_org_partnerships.create_index(
        [("target_org_id", 1), ("status", 1)]
    )
    await db.cross_org_partnerships.create_index(
        [("requester_org_id", 1), ("status", 1)]
    )
    log.info("[cross_org_partnerships] indexes ensured")


# ─── Request ──────────────────────────────────────────────────────────────────

async def request_partnership(
    db,
    *,
    requester_org_type: str,
    requester_org_id: str,
    target_org_type: str,
    target_org_id: str,
    requested_by_user_id: str,
    notes: Optional[str] = None,
    commission_pct_default: Optional[float] = None,
) -> Dict[str, Any]:
    # Self-partnership prevention
    if requester_org_id == target_org_id and requester_org_type == target_org_type:
        raise ValueError("No se puede solicitar una alianza con la misma organización")

    # Duplicate-guard: no pending/approved between same pair
    dup = await db.cross_org_partnerships.find_one(
        {
            "$or": [
                {"requester_org_id": requester_org_id, "target_org_id": target_org_id},
                {"requester_org_id": target_org_id, "target_org_id": requester_org_id},
            ],
            "status": {"$in": ["pending", "approved"]},
        },
        {"_id": 0, "partnership_id": 1, "status": 1},
    )
    if dup:
        raise ValueError(f"Ya existe una alianza activa o pendiente entre estas organizaciones (status: {dup['status']})")

    now = _now()
    pid = str(uuid.uuid4())
    doc: Dict[str, Any] = {
        "partnership_id": pid,
        "requester_org_type": requester_org_type,
        "requester_org_id": requester_org_id,
        "target_org_type": target_org_type,
        "target_org_id": target_org_id,
        "status": "pending",
        "commission_pct_default": commission_pct_default,
        "requested_by_user_id": requested_by_user_id,
        "requested_at": now,
        "decided_at": None,
        "decided_by_user_id": None,
        "revoked_at": None,
        "revoked_by_user_id": None,
        "revoke_reason": None,
        "notes": notes,
    }
    await db.cross_org_partnerships.insert_one(doc)
    doc.pop("_id", None)

    # Notify target org admins
    try:
        await _notify_target_admins(db, target_org_type, target_org_id, requester_org_id, pid)
    except Exception as e:
        log.warning(f"[cross_partners.request] notify failed: {e}")

    return _serialize(doc)


# ─── Approve / Reject / Revoke ────────────────────────────────────────────────

async def approve(
    db,
    partnership_id: str,
    approver_user_id: str,
) -> Dict[str, Any]:
    doc = await _get_or_raise(db, partnership_id)
    if doc["status"] not in ("pending", "rejected"):
        raise ValueError(f"No se puede aprobar desde estado '{doc['status']}'")

    now = _now()
    await db.cross_org_partnerships.update_one(
        {"partnership_id": partnership_id},
        {"$set": {
            "status": "approved",
            "decided_at": now,
            "decided_by_user_id": approver_user_id,
        }},
    )
    try:
        from audit_log import log_mutation
        await log_mutation(
            db, {"user_id": approver_user_id, "role": "admin"},
            "update", "cross_org_partnership", partnership_id,
            before={"status": "pending"}, after={"status": "approved"},
        )
        from routes_dev_batch14 import log_activity
        await log_activity(
            db, approver_user_id, "developer_admin", "cross_partnership_approved",
            partnership_id, "cross_org_partnership",
            metadata={"requester": doc["requester_org_id"], "target": doc["target_org_id"]},
        )
    except Exception:
        pass

    # Notify requester
    try:
        await _notify_requester(db, doc, "approved")
    except Exception as e:
        log.warning(f"[cross_partners.approve] notify failed: {e}")

    updated = await db.cross_org_partnerships.find_one(
        {"partnership_id": partnership_id}, {"_id": 0}
    )
    return _serialize(updated)


async def reject(
    db,
    partnership_id: str,
    rejector_user_id: str,
    reason: str,
) -> Dict[str, Any]:
    doc = await _get_or_raise(db, partnership_id)
    if doc["status"] != "pending":
        raise ValueError(f"Solo se puede rechazar desde 'pending', no desde '{doc['status']}'")

    now = _now()
    await db.cross_org_partnerships.update_one(
        {"partnership_id": partnership_id},
        {"$set": {
            "status": "rejected",
            "decided_at": now,
            "decided_by_user_id": rejector_user_id,
            "notes": reason,
        }},
    )
    try:
        await _notify_requester(db, doc, "rejected")
    except Exception as e:
        log.warning(f"[cross_partners.reject] notify failed: {e}")

    updated = await db.cross_org_partnerships.find_one(
        {"partnership_id": partnership_id}, {"_id": 0}
    )
    return _serialize(updated)


async def revoke(
    db,
    partnership_id: str,
    revoker_user_id: str,
    reason: str,
) -> Dict[str, Any]:
    doc = await _get_or_raise(db, partnership_id)
    if doc["status"] != "approved":
        raise ValueError("Solo se puede revocar una alianza aprobada")

    now = _now()
    await db.cross_org_partnerships.update_one(
        {"partnership_id": partnership_id},
        {"$set": {
            "status": "revoked",
            "revoked_at": now,
            "revoked_by_user_id": revoker_user_id,
            "revoke_reason": reason,
        }},
    )
    try:
        await _notify_requester(db, doc, "revoked")
    except Exception as e:
        log.warning(f"[cross_partners.revoke] notify failed: {e}")

    updated = await db.cross_org_partnerships.find_one(
        {"partnership_id": partnership_id}, {"_id": 0}
    )
    return _serialize(updated)


# ─── List / Query ─────────────────────────────────────────────────────────────

async def list_for_org(
    db,
    org_type: str,
    org_id: str,
    role: str = "both",  # 'requester' | 'target' | 'both'
    status: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """List partnerships for an org (as requester, target, or both)."""
    conditions = []
    if role in ("requester", "both"):
        conditions.append({"requester_org_id": org_id})
    if role in ("target", "both"):
        conditions.append({"target_org_id": org_id})

    q: Dict[str, Any] = {"$or": conditions} if len(conditions) > 1 else conditions[0]
    if status:
        q["status"] = status

    docs = await db.cross_org_partnerships.find(q, {"_id": 0}).sort("requested_at", -1).to_list(500)
    return [_serialize(d) for d in docs]


async def is_active_partnership(
    db,
    org_type_a: str,
    org_id_a: str,
    org_type_b: str,
    org_id_b: str,
) -> bool:
    """True if there is an approved partnership between the two orgs."""
    doc = await db.cross_org_partnerships.find_one(
        {
            "$or": [
                {"requester_org_id": org_id_a, "target_org_id": org_id_b},
                {"requester_org_id": org_id_b, "target_org_id": org_id_a},
            ],
            "status": "approved",
        },
        {"_id": 0, "partnership_id": 1},
    )
    return doc is not None


async def get_active_partner_org_ids(
    db, org_type: str, org_id: str, partner_org_type: Optional[str] = None
) -> List[str]:
    """Retorna IDs de orgs con alianza aprobada para org_id."""
    conditions: List[Dict] = [
        {"requester_org_id": org_id, "status": "approved"},
        {"target_org_id": org_id, "status": "approved"},
    ]
    if partner_org_type:
        conditions[0]["target_org_type"] = partner_org_type
        conditions[1]["requester_org_type"] = partner_org_type

    docs = await db.cross_org_partnerships.find(
        {"$or": conditions},
        {"_id": 0, "requester_org_id": 1, "target_org_id": 1},
    ).to_list(500)

    ids = set()
    for d in docs:
        if d.get("requester_org_id") != org_id:
            ids.add(d["requester_org_id"])
        if d.get("target_org_id") != org_id:
            ids.add(d["target_org_id"])
    return list(ids)


# ─── Private helpers ──────────────────────────────────────────────────────────

async def _get_or_raise(db, partnership_id: str) -> Dict[str, Any]:
    doc = await db.cross_org_partnerships.find_one(
        {"partnership_id": partnership_id}, {"_id": 0}
    )
    if not doc:
        raise ValueError("Alianza no encontrada")
    return doc


async def _notify_target_admins(
    db, target_org_type: str, target_org_id: str, requester_org_id: str, partnership_id: str
) -> None:
    """Notify admin of target org about new partnership request."""
    from routes_dev_batch14 import create_notification
    if target_org_type == "dev":
        admins = await db.users.find(
            {"role": "developer_admin", "tenant_id": target_org_id},
            {"_id": 0, "user_id": 1},
        ).to_list(20)
    else:
        admins = await db.users.find(
            {"role": {"$in": ["inmobiliaria_admin", "inmobiliaria_director"]}, "tenant_id": target_org_id},
            {"_id": 0, "user_id": 1},
        ).to_list(20)

    for admin in admins:
        await create_notification(
            db, admin["user_id"], "cross_partnership_request",
            "Nueva solicitud de alianza",
            f"'{requester_org_id}' solicita una alianza de colaboracion contigo.",
            action_url="/desarrollador/cross-partnerships" if target_org_type == "dev" else "/inmobiliaria/cross-partnerships",
            priority="high",
        )


async def _notify_requester(db, partnership: Dict[str, Any], action: str) -> None:
    """Notify requester about decision on their partnership."""
    from routes_dev_batch14 import create_notification
    admins = await db.users.find(
        {"tenant_id": partnership["requester_org_id"], "role": {"$in": ["developer_admin", "inmobiliaria_admin"]}},
        {"_id": 0, "user_id": 1},
    ).to_list(20)

    status_labels = {"approved": "aprobada", "rejected": "rechazada", "revoked": "revocada"}
    label = status_labels.get(action, action)
    target_url = ("/desarrollador/cross-partnerships"
                  if partnership["requester_org_type"] == "dev"
                  else "/inmobiliaria/cross-partnerships")
    for admin in admins:
        await create_notification(
            db, admin["user_id"], f"cross_partnership_{action}",
            f"Alianza {label}",
            f"Tu solicitud de alianza con '{partnership['target_org_id']}' fue {label}.",
            action_url=target_url,
        )
