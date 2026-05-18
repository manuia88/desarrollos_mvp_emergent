"""W5.11 Parte 1 — Entity Resolution Routes (superadmin read-only + actions).

Endpoints (todos superadmin only excepto donde se indica):
  GET  /api/superadmin/entity-resolution/pending          → pending duplicates
  POST /api/superadmin/entity-resolution/pending/:id/merge   → trigger merge
  POST /api/superadmin/entity-resolution/pending/:id/reject  → reject
  POST /api/superadmin/entity-resolution/pending/:id/ignore  → ignore (blacklist)
  GET  /api/superadmin/entity-resolution/blacklist        → pares blacklisted
  GET  /api/superadmin/entity-resolution/fraud-patterns   → patrones fraude
  GET  /api/superadmin/entity-resolution/runs             → últimas ejecuciones cron
  POST /api/superadmin/entity-resolution/trigger-run      → trigger manual (dev)
  GET  /api/superadmin/audit/verify-chain                 → verificar cadena audit
  GET  /api/superadmin/audit/log                          → query audit log
  POST /api/superadmin/entity-resolution/undo/:merge_id   → undo merge
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

log = logging.getLogger("dmx.entity_resolution_routes")
router = APIRouter(tags=["entity-resolution"])


# ─── Auth helper ──────────────────────────────────────────────────────────────

async def _auth_superadmin(request: Request):
    from permissions import require_superadmin
    return await require_superadmin(request)


def _db(request: Request):
    return request.app.state.db


def _actor(user) -> Dict[str, Any]:
    return {
        "user_id": getattr(user, "user_id", "superadmin"),
        "role": getattr(user, "role", "superadmin"),
    }


# ─── Pending Duplicates ───────────────────────────────────────────────────────

@router.get("/api/superadmin/entity-resolution/pending")
async def list_pending(
    request: Request,
    entity_type: Optional[str] = None,
    tier: Optional[str] = None,
    limit: int = 50,
    skip: int = 0,
) -> Dict[str, Any]:
    await _auth_superadmin(request)
    db = _db(request)
    query: Dict[str, Any] = {"status": "pending"}
    if entity_type:
        query["entity_type"] = entity_type
    if tier:
        query["confidence_tier"] = tier
    limit = min(limit, 200)
    docs = []
    cursor = db.entity_duplicates_pending.find(query, {"_id": 0}).sort("score_combined", -1).skip(skip).limit(limit)
    async for doc in cursor:
        docs.append(doc)

    # Hidratar canonical_doc + candidate_doc desde la coleccion correspondiente
    from entity_resolution_engine import _get_collection
    cache: Dict[str, Dict[str, Any]] = {}

    async def _fetch_doc(et: str, eid: str) -> Dict[str, Any]:
        cache_key = f"{et}:{eid}"
        if cache_key in cache:
            return cache[cache_key]
        coll = _get_collection(db, et)
        if coll is None:
            cache[cache_key] = {}
            return {}
        id_field = "user_id" if et == "users" else "id"
        found = await coll.find_one({id_field: eid}, {"_id": 0}) or {}
        cache[cache_key] = found
        return found

    for d in docs:
        et = d.get("entity_type")
        d["canonical_doc"] = await _fetch_doc(et, d.get("canonical_id"))
        d["candidate_doc"] = await _fetch_doc(et, d.get("candidate_id"))

    total = await db.entity_duplicates_pending.count_documents(query)
    return {"pending": docs, "total": total, "limit": limit, "skip": skip}


# ─── Acciones sobre pending ───────────────────────────────────────────────────

@router.post("/api/superadmin/entity-resolution/pending/{pending_id}/merge")
async def trigger_merge(pending_id: str, request: Request) -> Dict[str, Any]:
    user = await _auth_superadmin(request)
    db = _db(request)
    pending = await db.entity_duplicates_pending.find_one({"id": pending_id, "status": "pending"}, {"_id": 0})
    if not pending:
        raise HTTPException(404, "Pending duplicate no encontrado o ya resuelto")

    from entity_resolution_engine import auto_merge
    try:
        merge_id = await auto_merge(
            db,
            canonical_id=pending["canonical_id"],
            candidate_id=pending["candidate_id"],
            entity_type=pending["entity_type"],
            actor=_actor(user),
        )
    except Exception as exc:
        raise HTTPException(400, str(exc))

    return {"ok": True, "merge_id": merge_id, "pending_id": pending_id}


@router.post("/api/superadmin/entity-resolution/pending/{pending_id}/reject")
async def reject_duplicate(pending_id: str, request: Request) -> Dict[str, Any]:
    user = await _auth_superadmin(request)
    db = _db(request)
    from datetime import datetime, timezone
    result = await db.entity_duplicates_pending.update_one(
        {"id": pending_id, "status": "pending"},
        {"$set": {
            "status": "rejected",
            "resolved_by": getattr(user, "user_id", "system"),
            "resolved_at": datetime.now(timezone.utc).isoformat(),
            "resolved_action": "reject",
        }},
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Pending duplicate no encontrado")
    return {"ok": True, "pending_id": pending_id, "status": "rejected"}


@router.post("/api/superadmin/entity-resolution/pending/{pending_id}/ignore")
async def ignore_and_blacklist(pending_id: str, request: Request) -> Dict[str, Any]:
    """Marca como NOT duplicate y añade a blacklist (nunca volver a sugerir)."""
    user = await _auth_superadmin(request)
    db = _db(request)
    from datetime import datetime, timezone
    import secrets as _secrets

    pending = await db.entity_duplicates_pending.find_one({"id": pending_id, "status": "pending"}, {"_id": 0})
    if not pending:
        raise HTTPException(404, "Pending duplicate no encontrado")

    now_iso = datetime.now(timezone.utc).isoformat()

    # Blacklist
    await db.dedup_blacklist.update_one(
        {"entity_a_id": pending["canonical_id"], "entity_b_id": pending["candidate_id"]},
        {"$setOnInsert": {
            "id": f"bl_{_secrets.token_urlsafe(8)}",
            "entity_a_id": pending["canonical_id"],
            "entity_b_id": pending["candidate_id"],
            "marked_not_duplicate_by": getattr(user, "user_id", "system"),
            "marked_at": now_iso,
            "reason": "manual_ignore",
        }},
        upsert=True,
    )

    # Marcar pending
    await db.entity_duplicates_pending.update_one(
        {"id": pending_id},
        {"$set": {
            "status": "ignored",
            "resolved_by": getattr(user, "user_id", "system"),
            "resolved_at": now_iso,
            "resolved_action": "ignore",
        }},
    )
    return {"ok": True, "pending_id": pending_id, "status": "ignored"}


# ─── Undo merge ───────────────────────────────────────────────────────────────

@router.post("/api/superadmin/entity-resolution/undo/{merge_id}")
async def undo_merge_endpoint(merge_id: str, request: Request) -> Dict[str, Any]:
    user = await _auth_superadmin(request)
    db = _db(request)
    from entity_resolution_engine import undo_merge
    result = await undo_merge(db, merge_id=merge_id, actor=_actor(user))
    if not result:
        raise HTTPException(400, "No se pudo deshacer el merge. Ventana de 30d expirada o merge_id inválido.")
    return {"ok": True, "merge_id": merge_id, "undone": True}


# ─── Blacklist ────────────────────────────────────────────────────────────────

@router.get("/api/superadmin/entity-resolution/blacklist")
async def list_blacklist(request: Request, limit: int = 50) -> Dict[str, Any]:
    await _auth_superadmin(request)
    db = _db(request)
    limit = min(limit, 200)
    docs = []
    async for doc in db.dedup_blacklist.find({}, {"_id": 0}).sort("marked_at", -1).limit(limit):
        docs.append(doc)
    return {"blacklist": docs, "count": len(docs)}


# ─── Fraud patterns ───────────────────────────────────────────────────────────

@router.get("/api/superadmin/entity-resolution/fraud-patterns")
async def list_fraud_patterns(request: Request, limit: int = 20) -> Dict[str, Any]:
    await _auth_superadmin(request)
    db = _db(request)
    limit = min(limit, 100)
    docs = []
    async for doc in db.broker_fraud_patterns.find({}, {"_id": 0}).sort("pattern_count_30d", -1).limit(limit):
        docs.append(doc)
    return {"fraud_patterns": docs, "count": len(docs)}


# ─── Dedup runs ───────────────────────────────────────────────────────────────

@router.get("/api/superadmin/entity-resolution/runs")
async def list_runs(request: Request, limit: int = 10) -> Dict[str, Any]:
    await _auth_superadmin(request)
    db = _db(request)
    limit = min(limit, 50)
    docs = []
    async for doc in db.dedup_runs.find({}, {"_id": 0}).sort("ran_at", -1).limit(limit):
        docs.append(doc)
    return {"runs": docs, "count": len(docs)}


# ─── Trigger manual (dev/debug) ───────────────────────────────────────────────

@router.post("/api/superadmin/entity-resolution/trigger-run")
async def trigger_run(request: Request) -> Dict[str, Any]:
    """Dispara dedup_detection manualmente para dev/debug."""
    await _auth_superadmin(request)
    db = _db(request)
    from entity_resolution_cron import run_dedup_detection
    import asyncio
    asyncio.create_task(run_dedup_detection(db))
    return {"ok": True, "message": "Dedup detection iniciada en background"}


# ─── Audit: verify chain ──────────────────────────────────────────────────────

@router.get("/api/superadmin/audit/verify-chain")
async def verify_audit_chain(
    request: Request,
    from_id: Optional[str] = None,
    to_id: Optional[str] = None,
) -> Dict[str, Any]:
    await _auth_superadmin(request)
    db = _db(request)
    from audit_immutable_engine import verify_chain
    result = await verify_chain(db, from_id=from_id, to_id=to_id)
    return result


# ─── Audit: query log ─────────────────────────────────────────────────────────

@router.get("/api/superadmin/audit/log")
async def query_audit_log(
    request: Request,
    entity_id: Optional[str] = None,
    entity_type: Optional[str] = None,
    actor_user_id: Optional[str] = None,
    action: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    limit: int = 100,
    skip: int = 0,
) -> Dict[str, Any]:
    await _auth_superadmin(request)
    db = _db(request)
    from audit_immutable_engine import query_audit
    filters = {
        "entity_id": entity_id,
        "entity_type": entity_type,
        "actor_user_id": actor_user_id,
        "action": action,
        "date_from": date_from,
        "date_to": date_to,
    }
    # Limpiar None
    filters = {k: v for k, v in filters.items() if v}
    rows = await query_audit(db, filters=filters, limit=limit, skip=skip)
    return {"audit_log": rows, "count": len(rows), "limit": limit, "skip": skip}

# W5.FF4 register_feature marker · NO duplicate
from feature_registry import register_feature as _w5ff4_register_feature
_w5ff4_register_feature("entity_resolution", plan_tier="enterprise", monthly_price_mxn=399, category="operations",   name="Entity Resolution")
_w5ff4_register_feature("audit_chain", plan_tier="enterprise", monthly_price_mxn=0,   category="operations",   name="Audit Chain")
_w5ff4_register_feature("duplicates", plan_tier="enterprise", monthly_price_mxn=0,   category="operations",   name="Duplicates Review")
