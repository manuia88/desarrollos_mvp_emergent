"""Phase 7.9 (complement) — Status histórico per unit.

Centralized audit trail for unit field changes (precio, status, tipo, etc.).
Triggers from:
- Manual edit (routes_developer patch_unit_status)
- Auto-sync 7.5 (auto_sync_engine.apply_changes)
- Drive watcher 7.11 (auto-sync chain)
- Drive webhooks 7.11 upgrade
"""
from __future__ import annotations

import uuid
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request, Query

log = logging.getLogger("dmx.units_history")

ALLOWED_SOURCES = {"manual_edit", "auto_sync", "drive_sheets", "drive_webhook", "bulk_upload", "system"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def ensure_units_history_indexes(db) -> None:
    coll = db.units_history
    await coll.create_index([("unit_id", 1), ("changed_at", -1)])
    await coll.create_index([("development_id", 1), ("changed_at", -1)])
    await coll.create_index("source")


async def record_unit_change(
    db,
    *,
    unit_id: str,
    development_id: str,
    field_changed: str,
    old_value: Any,
    new_value: Any,
    changed_by_user_id: str,
    source: str,
    source_doc_id: Optional[str] = None,
    extra: Optional[Dict[str, Any]] = None,
) -> Optional[str]:
    """Insert a row into units_history. Returns id, or None if old==new."""
    if old_value == new_value:
        return None
    if source not in ALLOWED_SOURCES:
        log.warning(f"[units_history] unknown source={source}, falling back to 'system'")
        source = "system"
    entry_id = f"uh_{uuid.uuid4().hex[:14]}"
    doc = {
        "id": entry_id,
        "unit_id": unit_id,
        "development_id": development_id,
        "field_changed": field_changed,
        "old_value": old_value,
        "new_value": new_value,
        "changed_by_user_id": changed_by_user_id,
        "source": source,
        "source_doc_id": source_doc_id,
        "changed_at": _now(),
        "extra": extra or {},
    }
    await db.units_history.insert_one(doc)
    return entry_id


async def diff_units_overlay_and_record(
    db,
    *,
    development_id: str,
    old_units: List[Dict[str, Any]],
    new_units: List[Dict[str, Any]],
    source: str,
    source_doc_id: Optional[str] = None,
    changed_by_user_id: str = "system",
) -> List[str]:
    """Compare two units lists by unit_id and emit a units_history row per changed field.
    Tracked fields: precio, status, tipo, m2, recamaras, banos, nivel, cajones."""
    TRACKED = ("precio", "status", "tipo", "m2", "recamaras", "banos", "nivel", "cajones")
    old_by = {u.get("unit_id") or u.get("id"): u for u in (old_units or [])}
    new_by = {u.get("unit_id") or u.get("id"): u for u in (new_units or [])}
    inserted: List[str] = []
    for uid, new_u in new_by.items():
        if not uid:
            continue
        old_u = old_by.get(uid) or {}
        for f in TRACKED:
            ov = old_u.get(f)
            nv = new_u.get(f)
            if ov != nv:
                rid = await record_unit_change(
                    db, unit_id=uid, development_id=development_id,
                    field_changed=f, old_value=ov, new_value=nv,
                    changed_by_user_id=changed_by_user_id,
                    source=source, source_doc_id=source_doc_id,
                )
                if rid:
                    inserted.append(rid)
    # Detect removals (old → new disappeared)
    for uid in old_by:
        if uid not in new_by:
            rid = await record_unit_change(
                db, unit_id=uid, development_id=development_id,
                field_changed="status", old_value=old_by[uid].get("status"), new_value="removed",
                changed_by_user_id=changed_by_user_id,
                source=source, source_doc_id=source_doc_id,
            )
            if rid:
                inserted.append(rid)
    return inserted


# ─── Routers ──────────────────────────────────────────────────────────────────
router = APIRouter(tags=["units_history"])


def _serialize(doc: Dict[str, Any]) -> Dict[str, Any]:
    out = {k: v for k, v in doc.items() if k != "_id"}
    if isinstance(out.get("changed_at"), datetime):
        out["changed_at"] = out["changed_at"].isoformat()
    return out


async def _get_user(request: Request):
    from server import get_current_user
    return await get_current_user(request)


def _check_dev_access(user, dev_id: str) -> None:
    if not user:
        raise HTTPException(401, "Auth requerida")
    role = getattr(user, "role", None)
    if role == "superadmin":
        return
    if role not in ("developer_admin", "developer_member"):
        raise HTTPException(403, "Sólo superadmin o developer")
    from routes_documents import _allowed_dev_ids
    allowed = _allowed_dev_ids(user)
    if allowed == "*":
        return
    if dev_id not in allowed:
        raise HTTPException(403, f"Sin acceso a {dev_id}")


@router.get("/api/superadmin/units/{unit_id}/history")
async def get_unit_history(unit_id: str, request: Request, limit: int = Query(50, ge=1, le=500)):
    user = await _get_user(request)
    db = request.app.state.db
    # Find dev_id from any history row to check access
    sample = await db.units_history.find_one({"unit_id": unit_id}, {"_id": 0, "development_id": 1})
    if sample:
        _check_dev_access(user, sample["development_id"])
    cursor = db.units_history.find({"unit_id": unit_id}, {"_id": 0}).sort("changed_at", -1).limit(limit)
    items = [_serialize(d) async for d in cursor]
    return {"unit_id": unit_id, "count": len(items), "history": items}


@router.get("/api/superadmin/developments/{dev_id}/units-history")
async def get_dev_units_history(dev_id: str, request: Request, limit: int = Query(50, ge=1, le=500)):
    user = await _get_user(request)
    _check_dev_access(user, dev_id)
    db = request.app.state.db
    cursor = db.units_history.find({"development_id": dev_id}, {"_id": 0}).sort("changed_at", -1).limit(limit)
    items = [_serialize(d) async for d in cursor]
    return {"development_id": dev_id, "count": len(items), "history": items}


# Developer aliases (multi-tenant)
dev_alias = APIRouter(tags=["units_history_dev"])


@dev_alias.get("/api/desarrollador/units/{unit_id}/history")
async def _alias_unit_history(unit_id: str, request: Request, limit: int = Query(50, ge=1, le=500)):
    return await get_unit_history(unit_id, request, limit)


@dev_alias.get("/api/desarrollador/developments/{dev_id}/units-history")
async def _alias_dev_history(dev_id: str, request: Request, limit: int = Query(50, ge=1, le=500)):
    return await get_dev_units_history(dev_id, request, limit)
