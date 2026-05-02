"""Phase 4 Batch 17 — Inline edit + Undo system + Filter presets + Reorder endpoints.

Consolidates 4 concerns:
1. Generic inline edit via PATCH /api/inline/{entity_type}/{entity_id}  (whitelisted fields)
2. Undo system: register_undo() helper + POST /api/undo/{id} + GET /api/undo/recent
3. Filter presets CRUD
4. Reorder endpoints for: documents, prototypes, tareas (Kanban lead move already exists B4.2)

All mutations that go through these surfaces auto-register an undo entry (TTL 10 min default).
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

log = logging.getLogger("dmx.batch17")

router = APIRouter(tags=["batch17"])

UNDO_TTL_MIN = 10  # window for user-initiated undo
UNDO_PURGE_TTL_HOURS = 24  # hard delete after 24h


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _db(req: Request):
    return req.app.state.db


async def _auth(req: Request):
    from server import get_current_user
    u = await get_current_user(req)
    if not u:
        raise HTTPException(401, "No autenticado")
    return u


# ═══════════════════════════════════════════════════════════════════════════
# A) INLINE EDIT — whitelist per entity_type
# ═══════════════════════════════════════════════════════════════════════════

INLINE_WHITELIST: Dict[str, Dict[str, Any]] = {
    "unit": {
        "collection": "units",
        "id_field": "unit_id",
        "fields": {
            "price": {"type": "number", "min": 0, "max": 1_000_000_000},
            "sqm": {"type": "number", "min": 0, "max": 5000},
            "beds": {"type": "number", "min": 0, "max": 20},
            "baths": {"type": "number", "min": 0, "max": 20},
            "status": {"type": "enum", "values": ["disponible", "apartada", "reservada",
                                                     "vendida", "pausada"]},
            "unit_number": {"type": "string", "max_len": 50},
        },
    },
    "lead": {
        "collection": "leads",
        "id_field": "lead_id",
        "fields": {
            "name": {"type": "string", "max_len": 120},
            "phone": {"type": "string", "max_len": 40},
            "email": {"type": "string", "max_len": 120},
            "tags": {"type": "array", "max_items": 10},
            "lead_stage": {"type": "string", "max_len": 40},
            "notes": {"type": "string", "max_len": 2000},
        },
    },
    "project": {
        "collection": "projects",
        "id_field": "id",
        "fields": {
            "name": {"type": "string", "max_len": 200},
            "address": {"type": "string", "max_len": 400},
            "price_from": {"type": "number", "min": 0},
            "price_to": {"type": "number", "min": 0},
            "description": {"type": "string", "max_len": 2000},
        },
    },
    "tarea": {
        "collection": "asesor_tareas",
        "id_field": "id",
        "fields": {
            "title": {"type": "string", "max_len": 200},
            "due_at": {"type": "string", "max_len": 40},
            "priority": {"type": "enum", "values": ["low", "med", "high"]},
            "notes": {"type": "string", "max_len": 1000},
        },
    },
    "comision": {
        "collection": "asesor_operaciones",
        "id_field": "id",
        "fields": {
            "split_pct_asesor": {"type": "number", "min": 0, "max": 100},
            "monto_fijo": {"type": "number", "min": 0},
        },
    },
    "asesor_profile": {
        "collection": "users",
        "id_field": "user_id",
        "fields": {
            "name": {"type": "string", "max_len": 120},
            "whatsapp": {"type": "string", "max_len": 40},
            "bio": {"type": "string", "max_len": 1000},
            "phone": {"type": "string", "max_len": 40},
        },
    },
    "broker": {
        "collection": "project_brokers",
        "id_field": "id",
        "fields": {
            "contact_name": {"type": "string", "max_len": 120},
            "contact_email": {"type": "string", "max_len": 120},
            "contact_phone": {"type": "string", "max_len": 40},
            "commission_pct": {"type": "number", "min": 0, "max": 100},
        },
    },
    "amenity": {
        "collection": "project_amenities",
        "id_field": "id",
        "fields": {
            "label": {"type": "string", "max_len": 120},
            "category": {"type": "string", "max_len": 60},
            "active": {"type": "boolean"},
        },
    },
}


def _validate_value(field_spec: Dict[str, Any], value: Any) -> Any:
    """Validate and coerce. Raises HTTPException(400) if invalid."""
    t = field_spec.get("type", "string")
    if t == "number":
        try:
            num = float(value) if value is not None else None
        except (TypeError, ValueError):
            raise HTTPException(400, "Valor numérico inválido")
        if num is not None:
            mn = field_spec.get("min")
            mx = field_spec.get("max")
            if mn is not None and num < mn:
                raise HTTPException(400, f"Valor menor al mínimo ({mn})")
            if mx is not None and num > mx:
                raise HTTPException(400, f"Valor mayor al máximo ({mx})")
        return num
    if t == "string":
        if value is None:
            return ""
        s = str(value)
        mx = field_spec.get("max_len", 500)
        if len(s) > mx:
            raise HTTPException(400, f"Texto demasiado largo (máx {mx})")
        return s
    if t == "boolean":
        return bool(value)
    if t == "enum":
        if value not in field_spec.get("values", []):
            raise HTTPException(400, f"Valor no permitido. Opciones: {field_spec.get('values')}")
        return value
    if t == "array":
        if not isinstance(value, list):
            raise HTTPException(400, "Se esperaba lista")
        mx = field_spec.get("max_items", 20)
        if len(value) > mx:
            raise HTTPException(400, f"Demasiados items (máx {mx})")
        return value
    return value


def _user_can_edit(user, entity_type: str, doc: Dict[str, Any]) -> bool:
    """Permission check per entity_type. Conservative: deny unless explicit allow."""
    role = getattr(user, "role", "")
    tenant = getattr(user, "tenant_id", "") or ""

    if role == "superadmin":
        return True
    if entity_type == "unit" or entity_type == "project" or entity_type == "broker" or entity_type == "amenity":
        # Developer roles can edit their own projects/units
        if role in ("developer_admin", "developer_director", "developer_member"):
            doc_tenant = (doc.get("dev_org_id") or doc.get("developer_id") or "").lower()
            # tenant match OR dev has same developer_id convention
            return bool(doc_tenant) and (tenant.lower() in doc_tenant or doc_tenant in tenant.lower()
                                            or doc.get("dev_org_id") == tenant)
        return False
    if entity_type == "lead":
        if role in ("developer_admin", "developer_director", "superadmin"):
            return True
        if role in ("advisor", "asesor_admin"):
            return doc.get("assigned_to") == user.user_id or doc.get("assigned_user_id") == user.user_id
        return False
    if entity_type == "tarea":
        if role == "superadmin":
            return True
        return doc.get("owner_id") == user.user_id
    if entity_type == "comision":
        if role in ("advisor", "asesor_admin", "superadmin"):
            return doc.get("asesor_user_id") == user.user_id or role in ("asesor_admin", "superadmin")
        return False
    if entity_type == "asesor_profile":
        # Users can edit their own profile; superadmin edits anyone
        return doc.get("user_id") == user.user_id
    return False


class InlineIn(BaseModel):
    field: str
    value: Any


@router.patch("/api/inline/{entity_type}/{entity_id}")
async def inline_edit(entity_type: str, entity_id: str, body: InlineIn, request: Request):
    user = await _auth(request)
    spec = INLINE_WHITELIST.get(entity_type)
    if not spec:
        raise HTTPException(400, f"entity_type inválido: {entity_type}")
    field_spec = spec["fields"].get(body.field)
    if not field_spec:
        raise HTTPException(400, f"field no editable: {body.field}")

    db = _db(request)
    coll = db[spec["collection"]]
    doc = await coll.find_one({spec["id_field"]: entity_id}, {"_id": 0}) \
        or await coll.find_one({"id": entity_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Entidad no encontrada")

    if not _user_can_edit(user, entity_type, doc):
        raise HTTPException(403, "Sin permiso para editar este campo")

    new_value = _validate_value(field_spec, body.value)
    old_value = doc.get(body.field)

    now = _now()
    # Match on the id_field that actually worked
    match_filter = (
        {spec["id_field"]: entity_id}
        if await coll.find_one({spec["id_field"]: entity_id}, {"_id": 0})
        else {"id": entity_id}
    )
    await coll.update_one(
        match_filter,
        {"$set": {body.field: new_value, "updated_at": now.isoformat(),
                   "updated_by": user.user_id}},
    )

    # Activity log
    try:
        from routes_dev_batch14 import log_activity
        await log_activity(
            db, user.user_id, user.role, "inline_edit",
            entity_id, entity_type,
            metadata={"field": body.field, "old": old_value, "new": new_value},
        )
    except Exception:
        pass

    # Register undo
    try:
        await register_undo(
            db, user_id=user.user_id,
            action="inline_edit",
            entity_type=entity_type,
            entity_id=entity_id,
            before_state={body.field: old_value},
            after_state={body.field: new_value},
            meta={"collection": spec["collection"], "id_field": spec["id_field"]},
        )
    except Exception as e:
        log.warning(f"[inline] register_undo failed: {e}")

    updated = await coll.find_one(match_filter, {"_id": 0, "password_hash": 0})
    return {"ok": True, "doc": updated, "field": body.field, "old": old_value, "new": new_value}


# ═══════════════════════════════════════════════════════════════════════════
# B) UNDO SYSTEM — register_undo + endpoints
# ═══════════════════════════════════════════════════════════════════════════

async def register_undo(
    db,
    *,
    user_id: str,
    action: str,
    entity_type: str,
    entity_id: str,
    before_state: Dict[str, Any],
    after_state: Dict[str, Any],
    meta: Optional[Dict[str, Any]] = None,
    ttl_minutes: int = UNDO_TTL_MIN,
) -> str:
    """Persist an undo-able mutation. Returns undo_id."""
    now = _now()
    undo_id = f"undo_{uuid.uuid4().hex[:14]}"
    doc = {
        "id": undo_id,
        "user_id": user_id,
        "action": action,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "before_state": before_state or {},
        "after_state": after_state or {},
        "meta": meta or {},
        "created_at": now.isoformat(),
        "expires_at": (now + timedelta(minutes=ttl_minutes)).isoformat(),
        "hard_purge_at": (now + timedelta(hours=UNDO_PURGE_TTL_HOURS)).isoformat(),
        "undone_at": None,
    }
    try:
        await db.undo_log.insert_one({**doc})
    except Exception as e:
        log.warning(f"[undo] insert failed: {e}")
    return undo_id


async def _restore_inline_edit(db, undo_doc: Dict[str, Any]) -> bool:
    """Restore an inline_edit: write before_state back to the collection."""
    meta = undo_doc.get("meta", {})
    coll_name = meta.get("collection")
    id_field = meta.get("id_field", "id")
    if not coll_name:
        return False
    coll = db[coll_name]
    before = undo_doc.get("before_state", {})
    entity_id = undo_doc.get("entity_id")
    if not entity_id:
        return False
    # Try both id fields
    res = await coll.update_one({id_field: entity_id}, {"$set": before})
    if res.matched_count == 0:
        await coll.update_one({"id": entity_id}, {"$set": before})
    return True


async def _restore_lead_stage(db, undo_doc: Dict[str, Any]) -> bool:
    before = undo_doc.get("before_state", {})
    lead_id = undo_doc.get("entity_id")
    if not lead_id:
        return False
    restore = {}
    if "lead_stage" in before:
        restore["lead_stage"] = before["lead_stage"]
    if "status" in before:
        restore["status"] = before["status"]
    if not restore:
        return False
    await db.leads.update_one(
        {"$or": [{"lead_id": lead_id}, {"id": lead_id}]},
        {"$set": restore},
    )
    return True


async def _restore_reorder(db, undo_doc: Dict[str, Any]) -> bool:
    """Restore ordered list by resetting order_index to before_state sequence."""
    before = undo_doc.get("before_state", {})
    meta = undo_doc.get("meta", {})
    coll_name = meta.get("collection")
    id_field = meta.get("id_field", "id")
    order_list = before.get("ordered_ids", [])
    if not coll_name or not order_list:
        return False
    coll = db[coll_name]
    for i, doc_id in enumerate(order_list):
        await coll.update_one({id_field: doc_id}, {"$set": {"order_index": i}})
    return True


_UNDO_RESTORERS = {
    "inline_edit": _restore_inline_edit,
    "lead_stage_change": _restore_lead_stage,
    "reorder": _restore_reorder,
}


@router.post("/api/undo/{undo_id}")
async def undo_action(undo_id: str, request: Request):
    user = await _auth(request)
    db = _db(request)
    u = await db.undo_log.find_one({"id": undo_id}, {"_id": 0})
    if not u:
        raise HTTPException(404, "Acción no encontrada")
    if u.get("user_id") != user.user_id and user.role != "superadmin":
        raise HTTPException(403, "Sin permiso")
    if u.get("undone_at"):
        raise HTTPException(409, "Ya fue deshecha")
    expires = u.get("expires_at", "")
    if expires and expires < _now().isoformat():
        raise HTTPException(410, "La ventana para deshacer ya cerró (10 min)")

    restorer = _UNDO_RESTORERS.get(u.get("action", ""))
    if not restorer:
        raise HTTPException(400, f"No se puede deshacer acción: {u.get('action')}")
    try:
        ok = await restorer(db, u)
    except Exception as e:
        log.warning(f"[undo] restore error: {e}")
        raise HTTPException(500, "Error al deshacer")

    if not ok:
        raise HTTPException(500, "No se pudo restaurar el estado")

    await db.undo_log.update_one(
        {"id": undo_id},
        {"$set": {"undone_at": _now().isoformat(), "undone_by": user.user_id}},
    )
    # Activity log
    try:
        from routes_dev_batch14 import log_activity
        await log_activity(
            db, user.user_id, user.role, "undo",
            u.get("entity_id", ""), u.get("entity_type", ""),
            metadata={"undo_id": undo_id, "action": u.get("action")},
        )
    except Exception:
        pass
    return {"ok": True, "undo_id": undo_id, "restored_action": u.get("action")}


@router.get("/api/undo/recent")
async def undo_recent(request: Request, limit: int = Query(10, le=50)):
    user = await _auth(request)
    db = _db(request)
    now_iso = _now().isoformat()
    items = await db.undo_log.find(
        {"user_id": user.user_id, "undone_at": None, "expires_at": {"$gt": now_iso}},
        {"_id": 0},
    ).sort("created_at", -1).limit(limit).to_list(limit)
    return {"items": items, "count": len(items)}


async def purge_expired_undo_log(db) -> int:
    """APScheduler job — deletes entries past hard_purge_at."""
    try:
        res = await db.undo_log.delete_many(
            {"hard_purge_at": {"$lt": _now().isoformat()}}
        )
        log.info(f"[undo] purged {res.deleted_count} expired entries")
        return res.deleted_count
    except Exception as e:
        log.warning(f"[undo] purge failed: {e}")
        return 0


# ═══════════════════════════════════════════════════════════════════════════
# C) FILTER PRESETS — CRUD
# ═══════════════════════════════════════════════════════════════════════════

class PresetIn(BaseModel):
    route: str
    name: str
    filters: Dict[str, Any]
    is_default: Optional[bool] = False


@router.get("/api/filter-presets")
async def list_presets(request: Request, route: Optional[str] = Query(None)):
    user = await _auth(request)
    db = _db(request)
    q: Dict[str, Any] = {"user_id": user.user_id}
    if route:
        q["route"] = route
    items = await db.filter_presets.find(q, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"items": items, "count": len(items)}


@router.post("/api/filter-presets")
async def create_preset(body: PresetIn, request: Request):
    user = await _auth(request)
    db = _db(request)
    name = (body.name or "").strip()[:80]
    if not name:
        raise HTTPException(400, "Nombre requerido")
    preset_id = f"preset_{uuid.uuid4().hex[:12]}"
    doc = {
        "id": preset_id,
        "user_id": user.user_id,
        "route": body.route,
        "name": name,
        "filters": body.filters or {},
        "is_default": bool(body.is_default),
        "created_at": _now().isoformat(),
    }
    await db.filter_presets.insert_one({**doc})
    return doc


@router.delete("/api/filter-presets/{preset_id}")
async def delete_preset(preset_id: str, request: Request):
    user = await _auth(request)
    db = _db(request)
    res = await db.filter_presets.delete_one(
        {"id": preset_id, "user_id": user.user_id}
    )
    if res.deleted_count == 0:
        raise HTTPException(404, "Preset no encontrado")
    return {"ok": True, "id": preset_id}


# ═══════════════════════════════════════════════════════════════════════════
# D) REORDER endpoints — documents, prototypes, tareas
# ═══════════════════════════════════════════════════════════════════════════

class ReorderIn(BaseModel):
    ordered_ids: List[str]


async def _reorder_generic(db, coll_name: str, id_field: str,
                            scope_filter: Dict[str, Any],
                            ordered_ids: List[str], user_id: str,
                            entity_type: str) -> Dict[str, Any]:
    coll = db[coll_name]

    # Capture previous order for undo
    prev = await coll.find(
        {**scope_filter, id_field: {"$in": ordered_ids}},
        {"_id": 0, id_field: 1, "order_index": 1},
    ).sort("order_index", 1).to_list(len(ordered_ids))
    prev_ids = [p[id_field] for p in prev]

    for i, doc_id in enumerate(ordered_ids):
        await coll.update_one(
            {**scope_filter, id_field: doc_id},
            {"$set": {"order_index": i, "updated_at": _now().isoformat()}},
        )

    # Register undo
    try:
        await register_undo(
            db, user_id=user_id, action="reorder",
            entity_type=entity_type,
            entity_id=scope_filter.get("development_id") or scope_filter.get("project_id") or scope_filter.get("owner_id") or "multi",
            before_state={"ordered_ids": prev_ids},
            after_state={"ordered_ids": ordered_ids},
            meta={"collection": coll_name, "id_field": id_field},
        )
    except Exception:
        pass

    try:
        from routes_dev_batch14 import log_activity
        await log_activity(db, user_id, "system", "reorder",
                           scope_filter.get("development_id", ""),
                           entity_type, metadata={"count": len(ordered_ids)})
    except Exception:
        pass
    return {"ok": True, "reordered": len(ordered_ids)}


@router.post("/api/dev/projects/{dev_id}/documents/reorder")
async def reorder_documents(dev_id: str, body: ReorderIn, request: Request):
    user = await _auth(request)
    if user.role not in ("developer_admin", "developer_director", "developer_member",
                          "superadmin"):
        raise HTTPException(403, "Sin permiso")
    db = _db(request)
    return await _reorder_generic(
        db, "di_documents", "id",
        {"development_id": dev_id},
        body.ordered_ids, user.user_id, "document",
    )


@router.post("/api/dev/projects/{project_id}/prototypes/reorder")
async def reorder_prototypes(project_id: str, body: ReorderIn, request: Request):
    user = await _auth(request)
    if user.role not in ("developer_admin", "developer_director", "developer_member",
                          "superadmin"):
        raise HTTPException(403, "Sin permiso")
    db = _db(request)
    return await _reorder_generic(
        db, "project_prototypes", "id",
        {"project_id": project_id},
        body.ordered_ids, user.user_id, "prototype",
    )


@router.post("/api/asesor/tareas/reorder")
async def reorder_tareas(body: ReorderIn, request: Request):
    user = await _auth(request)
    db = _db(request)
    return await _reorder_generic(
        db, "asesor_tareas", "id",
        {"owner_id": user.user_id},
        body.ordered_ids, user.user_id, "tarea",
    )


# ═══════════════════════════════════════════════════════════════════════════
# E) INDEXES
# ═══════════════════════════════════════════════════════════════════════════

async def ensure_batch17_indexes(db) -> None:
    # undo_log
    await db.undo_log.create_index("id", unique=True, background=True)
    await db.undo_log.create_index([("user_id", 1), ("created_at", -1)], background=True)
    await db.undo_log.create_index("expires_at", background=True)
    await db.undo_log.create_index("hard_purge_at", background=True)
    # filter_presets
    await db.filter_presets.create_index("id", unique=True, background=True)
    await db.filter_presets.create_index([("user_id", 1), ("route", 1)], background=True)
    log.info("[batch17] indexes ensured")
