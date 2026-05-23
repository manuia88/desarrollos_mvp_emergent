"""W6.5 — Project Wizard duplication engine.

Forks a project JSON document (developer-created via wizard) into a new draft.
Sanitizes runtime fields (id, units_sold_count, created_at, audit_id, status="draft").
Preserves static design fields (name template, price tier, zone, amenities, schemas).

Collections:
  - projects        : wizard-created developments (per-tenant)
  - developments    : legacy/seeded catalog (read-only here)
  - audit_immutable : audit trail (via audit_immutable_engine.log)

Roles allowed: superadmin · developer_director · developer_member.
"""
from __future__ import annotations

import logging
import uuid
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.project_wizard_engine")

# Runtime fields that MUST be cleared on duplication
_RUNTIME_FIELDS_TO_CLEAR = {
    "id",
    "_id",
    "units_sold_count",
    "units_reserved_count",
    "leads_active",
    "leads_30d",
    "revenue_mtd_est",
    "weekly_sales",
    "audit_id",
    "created_at",
    "updated_at",
    "published_at",
    "publish_state",
    "is_template",
    "duplicated_from",
}

# Static fields that should be carried over (whitelist when stripping unknowns)
_STATIC_FIELDS_KEEP = {
    "name",
    "developer_id",
    "developer_name",
    "dev_org_id",
    "tenant_id",
    "colonia",
    "colonia_id",
    "alcaldia",
    "zone_slug",
    "price_from",
    "price_to",
    "price_tier",
    "bedrooms_range",
    "m2_range",
    "amenities",
    "stage",
    "description",
    "cover_photo",
    "gallery",
    "address",
    "delivery_date",
    "total_units",
    "unit_types",
    "schemas",
    "floor_plans",
    "metadata",
}


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _short_uid() -> str:
    return uuid.uuid4().hex[:16]


def _sanitize_source(source: Dict[str, Any]) -> Dict[str, Any]:
    """Strip runtime/non-portable fields, returning a clean fork-ready dict."""
    cloned = deepcopy(source)
    for k in list(cloned.keys()):
        if k in _RUNTIME_FIELDS_TO_CLEAR:
            cloned.pop(k, None)
    return cloned


async def _name_exists(db, tenant_id: Optional[str], name: str) -> bool:
    query: Dict[str, Any] = {"name": name}
    if tenant_id:
        query["$or"] = [{"dev_org_id": tenant_id}, {"tenant_id": tenant_id}]
    found = await db.projects.find_one(query, {"_id": 1, "id": 1})
    return bool(found)


async def duplicate_project(
    db,
    source_id: str,
    new_name: str,
    actor: Dict[str, Any],
    override_fields: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Duplicate a project. Returns the inserted document (without _id)."""
    if not source_id:
        return {"error": "source_id requerido"}
    if not new_name or len(new_name.strip()) < 3:
        return {"error": "new_name requerido (mínimo 3 caracteres)"}

    new_name = new_name.strip()

    tenant_id = actor.get("tenant_id") if isinstance(actor, dict) else None

    source = await db.projects.find_one({"id": source_id}, {"_id": 0})
    source_collection = "projects"
    if not source:
        source = await db.developments.find_one({"id": source_id}, {"_id": 0})
        source_collection = "developments"
    if not source:
        return {"error": f"source_id '{source_id}' no encontrado"}

    if await _name_exists(db, tenant_id, new_name):
        return {"error": f"nombre '{new_name}' ya existe en este tenant"}

    forked = _sanitize_source(source)
    forked["id"] = _short_uid()
    forked["name"] = new_name
    forked["status"] = "draft"
    forked["publish_state"] = "draft"
    forked["created_at"] = _iso_now()
    forked["duplicated_from"] = {
        "source_id": source_id,
        "source_collection": source_collection,
        "at": forked["created_at"],
    }
    forked["units_sold_count"] = 0
    forked["units_reserved_count"] = 0
    forked["leads_active"] = 0
    forked["leads_30d"] = 0

    if tenant_id:
        forked.setdefault("dev_org_id", tenant_id)
        forked.setdefault("tenant_id", tenant_id)

    if override_fields and isinstance(override_fields, dict):
        for k, v in override_fields.items():
            if k in _RUNTIME_FIELDS_TO_CLEAR or k in {"id", "status"}:
                continue
            forked[k] = v

    await db.projects.insert_one(deepcopy(forked))

    try:
        from audit_immutable_engine import log as audit_log

        await audit_log(
            db,
            actor=actor,
            action="development_duplicated",
            entity_type="project",
            entity_id=forked["id"],
            before={"source_id": source_id, "source_collection": source_collection},
            after={"new_id": forked["id"], "new_name": new_name},
        )
    except Exception as exc:
        log.warning(f"[project_wizard] audit log failed: {exc}")

    return {"ok": True, "project": forked}


async def list_templates(db, tenant_id: Optional[str] = None, limit: int = 50) -> List[Dict[str, Any]]:
    """Return projects flagged as duplicable templates (is_template=true)."""
    query: Dict[str, Any] = {"is_template": True}
    if tenant_id:
        query["$or"] = [{"dev_org_id": tenant_id}, {"tenant_id": tenant_id}]
    items: List[Dict[str, Any]] = []
    cursor = db.projects.find(query, {"_id": 0}).limit(int(limit) or 50)
    async for doc in cursor:
        items.append({
            "id": doc.get("id"),
            "name": doc.get("name"),
            "colonia": doc.get("colonia"),
            "price_tier": doc.get("price_tier"),
            "stage": doc.get("stage"),
        })
    return items


async def mark_as_template(db, project_id: str, actor: Dict[str, Any], enabled: bool = True) -> Dict[str, Any]:
    if not project_id:
        return {"error": "project_id requerido"}
    proj = await db.projects.find_one({"id": project_id}, {"_id": 0, "id": 1, "is_template": 1, "name": 1})
    if not proj:
        return {"error": f"project_id '{project_id}' no encontrado"}

    await db.projects.update_one(
        {"id": project_id},
        {"$set": {"is_template": bool(enabled), "updated_at": _iso_now()}},
    )

    try:
        from audit_immutable_engine import log as audit_log

        await audit_log(
            db,
            actor=actor,
            action="project_template_flag_set",
            entity_type="project",
            entity_id=project_id,
            before={"is_template": proj.get("is_template", False)},
            after={"is_template": bool(enabled)},
        )
    except Exception as exc:
        log.warning(f"[project_wizard] audit log failed: {exc}")

    return {"ok": True, "id": project_id, "is_template": bool(enabled)}


async def get_duplicate_history(db, tenant_id: Optional[str] = None, limit: int = 20) -> List[Dict[str, Any]]:
    query: Dict[str, Any] = {"duplicated_from": {"$exists": True, "$ne": None}}
    if tenant_id:
        query["$or"] = [{"dev_org_id": tenant_id}, {"tenant_id": tenant_id}]
    items: List[Dict[str, Any]] = []
    cursor = (
        db.projects.find(query, {"_id": 0, "id": 1, "name": 1, "duplicated_from": 1, "created_at": 1})
        .sort("created_at", -1)
        .limit(int(limit) or 20)
    )
    async for doc in cursor:
        items.append(doc)
    return items
