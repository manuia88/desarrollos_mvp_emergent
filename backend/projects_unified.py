"""Phase 4 Batch 13 Sub-chunk A — Unified projects helper.

Bridges the legacy `DEVELOPMENTS` static catalog and the new `db.projects`
collection (created via Wizard B12). Used by probes, list-with-stats endpoint,
marketplace, and other consumers that need a complete project view.

Usage
-----
    from projects_unified import get_all_projects, get_project_by_slug, is_wizard_project
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.projects_unified")


def is_wizard_project(project: Dict[str, Any]) -> bool:
    """Heuristic detector for projects created via Wizard B12."""
    return bool(project.get("created_via") == "wizard"
                or project.get("wizard_source") in ("manual", "ia_upload", "drive"))


def _normalize(p: Dict[str, Any], source: str) -> Dict[str, Any]:
    """Ensure both sources expose a stable shape."""
    out = dict(p)
    out["entity_source"] = source
    out["_unified"] = True
    # Aliases
    out.setdefault("id", out.get("slug"))
    out.setdefault("slug", out.get("id"))
    out.setdefault("dev_org_id", out.get("dev_org_id") or "default")
    return out


async def get_all_projects(db, dev_org_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Merged list of legacy `DEVELOPMENTS` + `db.projects` collection.

    Args:
        db: motor AsyncIOMotorDatabase.
        dev_org_id: filter (optional). If None, returns all.
    Returns:
        List of project dicts with `entity_source` field set.
    """
    # Legacy DEVELOPMENTS
    out: List[Dict[str, Any]] = []
    seen_ids: set = set()
    try:
        from data_developments import DEVELOPMENTS
        for d in DEVELOPMENTS:
            if dev_org_id and d.get("dev_org_id") != dev_org_id and d.get("developer_id") != dev_org_id:
                continue
            n = _normalize(d, "developments")
            out.append(n)
            seen_ids.add(n["id"])
    except Exception as e:
        log.warning(f"DEVELOPMENTS load failed: {e}")

    # db.projects (wizard or future direct creation)
    try:
        q: Dict[str, Any] = {}
        if dev_org_id:
            q["dev_org_id"] = dev_org_id
        async for p in db.projects.find(q, {"_id": 0}):
            if p.get("id") in seen_ids:
                continue
            out.append(_normalize(p, "db.projects"))
            seen_ids.add(p.get("id"))
    except Exception as e:
        log.warning(f"db.projects scan failed: {e}")

    return out


async def get_project_by_slug(db, slug: str,
                               dev_org_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Lookup a single project across both sources by slug/id."""
    if not slug:
        return None
    try:
        from data_developments import DEVELOPMENTS
        for d in DEVELOPMENTS:
            if d.get("id") == slug or d.get("slug") == slug:
                if dev_org_id and d.get("dev_org_id") != dev_org_id and d.get("developer_id") != dev_org_id:
                    return None
                return _normalize(d, "developments")
    except Exception:
        pass
    q: Dict[str, Any] = {"$or": [{"id": slug}, {"slug": slug}]}
    if dev_org_id:
        q["dev_org_id"] = dev_org_id
    p = await db.projects.find_one(q, {"_id": 0})
    if p:
        return _normalize(p, "db.projects")
    return None


async def get_units_for_project(db, project: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Returns units for a project regardless of source."""
    if project.get("entity_source") == "developments":
        return list(project.get("units", []) or [])
    # db.projects: units live in db.units
    units: List[Dict[str, Any]] = []
    async for u in db.units.find({"project_id": project["id"]}, {"_id": 0}):
        units.append(u)
    return units


async def update_project_unified(db, slug: str, patch: Dict[str, Any],
                                  user) -> Optional[Dict[str, Any]]:
    """Apply patch to project (only db.projects mutable). DEVELOPMENTS is immutable."""
    p = await get_project_by_slug(db, slug)
    if not p:
        return None
    if p["entity_source"] == "developments":
        # Use developer_unit_overrides + dev-side patches
        from datetime import datetime, timezone
        now_iso = datetime.now(timezone.utc).isoformat()
        await db.developer_project_patches.update_one(
            {"project_id": slug},
            {"$set": {**patch, "project_id": slug, "updated_at": now_iso,
                       "updated_by": getattr(user, "user_id", None)}},
            upsert=True,
        )
        return {**p, **patch, "_patched": True}
    # db.projects: direct update
    from datetime import datetime, timezone
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.projects.update_one(
        {"id": slug},
        {"$set": {**patch, "updated_at": now_iso,
                   "updated_by": getattr(user, "user_id", None)}},
    )
    return {**p, **patch}
