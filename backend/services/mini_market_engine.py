"""Phase 14 · Batch 37 — Mini Market Engine.

Computes visible project lists for in-house users based on:
  - assigned_projects (subset for developer in-house users)
  - assigned_dev_partnerships (subset for inmobiliaria in-house users)
  - allow_external_inventory flag (adds cross-org partner projects)
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.mini_market_engine")


# ─── Dev Mini Market ──────────────────────────────────────────────────────────

async def compute_mini_market_dev(db, user_id: str) -> List[Dict[str, Any]]:
    """For developer in-house user:
    - Pull assigned_projects (subset) if set; else ALL projects of the dev_org
    - If dev_org.allow_external_inventory=True → add cross-dev partner projects
    Returns enriched project list.
    """
    # Get user's internal entry
    internal = await db.dev_internal_users.find_one(
        {"user_id": user_id, "status": "active"},
        {"_id": 0, "dev_org_id": 1, "assigned_projects": 1},
    )
    if not internal:
        # Fallback: pull from db.users
        u = await db.users.find_one({"user_id": user_id}, {"_id": 0, "tenant_id": 1})
        if not u:
            return []
        internal = {"dev_org_id": u.get("tenant_id"), "assigned_projects": []}

    dev_org_id = internal.get("dev_org_id")
    if not dev_org_id:
        return []

    assigned_projects: List[str] = internal.get("assigned_projects") or []

    # Get dev org settings (allow_external_inventory)
    allow_external = await _get_allow_external(db, "dev", dev_org_id)

    # Cross-Portal v2 (#15): inventario con dato FRESCO del dev (precio/unidades editadas) · batch.
    from auto_sync_engine import get_effective_devs_list
    all_projects = await get_effective_devs_list(db)

    # Filter by org membership
    org_projects = [p for p in all_projects if (p.get("developer_id") or p.get("dev_org_id")) == dev_org_id]

    # Apply assigned_projects filter (if set, show only assigned subset)
    if assigned_projects:
        org_projects = [p for p in org_projects if p.get("id") in set(assigned_projects)]

    # Mark as own org projects
    for p in org_projects:
        p["exclusive_access"] = True
        p["source"] = "own_org"

    result = list(org_projects)

    # Add cross-dev partner projects if allow_external_inventory
    if allow_external:
        try:
            from services.cross_org_partnerships import get_active_partner_org_ids
            partner_ids = await get_active_partner_org_ids(db, "dev", dev_org_id, "dev")
            for pid in partner_ids:
                partner_projects = [
                    dict(p) for p in all_projects
                    if (p.get("developer_id") or p.get("dev_org_id")) == pid
                ]
                for p in partner_projects:
                    p["exclusive_access"] = True
                    p["source"] = "cross_partnership"
                    p["partner_org_id"] = pid
                result.extend(partner_projects)
        except Exception as e:
            log.warning(f"[mini_market_dev] cross-dev lookup failed: {e}")

    return result


# ─── Inmobiliaria Mini Market ─────────────────────────────────────────────────

async def compute_mini_market_inmobiliaria(db, user_id: str) -> List[Dict[str, Any]]:
    """For inmobiliaria in-house user:
    - Pull assigned_dev_partnerships (subset) if set; else ALL approved dev_partnerships of inmobiliaria
    - If inmobiliaria.allow_external_inventory=True → add cross-inmobiliaria partner projects
    Returns enriched project list.
    """
    # Get user's internal entry
    internal = await db.inmobiliaria_internal_users.find_one(
        {"user_id": user_id, "status": "active"},
        {"_id": 0, "inmobiliaria_id": 1, "assigned_dev_partnerships": 1},
    )
    if not internal:
        u = await db.users.find_one({"user_id": user_id}, {"_id": 0, "tenant_id": 1})
        if not u:
            return []
        internal = {"inmobiliaria_id": u.get("tenant_id"), "assigned_dev_partnerships": []}

    inmobiliaria_id = internal.get("inmobiliaria_id")
    if not inmobiliaria_id:
        return []

    assigned_devs: List[str] = internal.get("assigned_dev_partnerships") or []
    allow_external = await _get_allow_external(db, "inmobiliaria", inmobiliaria_id)

    # Pull approved dev_partnerships from B35 inmobiliaria_dev_partnerships
    q: Dict[str, Any] = {"inmobiliaria_id": inmobiliaria_id, "status": "active"}
    if assigned_devs:
        q["dev_org_id"] = {"$in": assigned_devs}

    partnerships = await db.inmobiliaria_dev_partnerships.find(q, {"_id": 0, "dev_org_id": 1}).to_list(200)
    approved_dev_org_ids = {p["dev_org_id"] for p in partnerships}

    # Also check cross_org_partnerships for inmobiliaria→dev partnerships
    from services.cross_org_partnerships import get_active_partner_org_ids
    try:
        cross_dev_ids = await get_active_partner_org_ids(db, "inmobiliaria", inmobiliaria_id, "dev")
        approved_dev_org_ids.update(cross_dev_ids)
    except Exception as e:
        log.warning(f"[mini_market_inmobiliaria] cross-dev lookup failed: {e}")

    from data_developments import DEVELOPMENTS
    all_projects = [dict(d) for d in DEVELOPMENTS]

    result = []
    for p in all_projects:
        dev_id = p.get("developer_id") or p.get("dev_org_id") or ""
        if dev_id in approved_dev_org_ids:
            p["exclusive_access"] = True
            p["source"] = "dev_partnership"
            result.append(p)

    # Cross-inmobiliaria partnerships if allow_external
    if allow_external:
        try:
            cross_inm_ids = await get_active_partner_org_ids(db, "inmobiliaria", inmobiliaria_id, "inmobiliaria")
            for inm_id in cross_inm_ids:
                # Get that inmobiliaria's dev partnerships too
                partner_partnerships = await db.inmobiliaria_dev_partnerships.find(
                    {"inmobiliaria_id": inm_id, "status": "active"},
                    {"_id": 0, "dev_org_id": 1},
                ).to_list(100)
                for pp in partner_partnerships:
                    pid = pp["dev_org_id"]
                    for p in all_projects:
                        dev_id = p.get("developer_id") or p.get("dev_org_id") or ""
                        if dev_id == pid and dev_id not in approved_dev_org_ids:
                            p2 = dict(p)
                            p2["exclusive_access"] = True
                            p2["source"] = "cross_inmobiliaria"
                            p2["partner_inm_id"] = inm_id
                            result.append(p2)
        except Exception as e:
            log.warning(f"[mini_market_inmobiliaria] cross-inm lookup failed: {e}")

    return result


# ─── External Inventory Flag ──────────────────────────────────────────────────

async def set_allow_external_inventory(
    db, org_type: str, org_id: str, enabled: bool
) -> None:
    """Toggle allow_external_inventory flag on dev org or inmobiliaria."""
    if org_type == "dev":
        await db.dev_orgs.update_one(
            {"org_id": org_id},
            {"$set": {"allow_external_inventory": enabled}},
            upsert=True,
        )
    else:
        await db.inmobiliarias.update_one(
            {"id": org_id},
            {"$set": {"allow_external_inventory": enabled}},
        )


async def _get_allow_external(db, org_type: str, org_id: str) -> bool:
    try:
        if org_type == "dev":
            doc = await db.dev_orgs.find_one({"org_id": org_id}, {"_id": 0, "allow_external_inventory": 1})
        else:
            doc = await db.inmobiliarias.find_one({"id": org_id}, {"_id": 0, "allow_external_inventory": 1})
        return bool((doc or {}).get("allow_external_inventory", False))
    except Exception:
        return False
