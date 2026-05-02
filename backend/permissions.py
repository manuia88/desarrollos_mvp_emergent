"""Phase 4 Batch 0 — Permission helpers extracted from routes_dev_batch4_2.py.
Re-exports the canonical permission level and capability checks.
All other route files should import from here instead of batch4_2.
"""
from __future__ import annotations
from typing import Dict


# ─── Canonical permission levels ──────────────────────────────────────────────
LEVELS_ORDER = [
    "superadmin",
    "developer_director",
    "developer_member",
    "inmobiliaria_director",
    "inmobiliaria_member",
    "asesor_freelance",
]


def get_user_permission_level(user) -> str:
    """Canonical permission level for a user. Returns string enum."""
    role = getattr(user, "role", "") or ""
    internal_role = getattr(user, "internal_role", "") or ""

    if role == "superadmin":
        return "superadmin"
    if role == "developer_admin":
        return "developer_director"
    if role == "inmobiliaria_admin":
        return "inmobiliaria_director"
    if role == "developer_member":
        if internal_role in ("admin", "commercial_director"):
            return "developer_director"
        return "developer_member"
    if role in ("inmobiliaria_member",):
        return "inmobiliaria_member"
    if role in ("advisor", "asesor_admin"):
        return "asesor_freelance"
    # Default fallback
    return "asesor_freelance"


def can_view_kanban(user, scope: str, target_org_id: str = "") -> bool:
    lvl = get_user_permission_level(user)
    if lvl == "superadmin":
        return True
    if scope == "developer":
        return lvl in ("developer_director", "developer_member")
    if scope == "inmobiliaria":
        return lvl in ("inmobiliaria_director", "inmobiliaria_member")
    if scope == "asesor":
        return lvl in ("asesor_freelance", "developer_director", "inmobiliaria_director")
    return False


def can_move_lead(user, lead: Dict) -> bool:
    lvl = get_user_permission_level(user)
    if lvl == "superadmin":
        return True
    if lvl in ("developer_director", "inmobiliaria_director"):
        return True
    if lvl == "developer_member":
        # member can only move leads assigned to them
        return getattr(user, "user_id", None) == lead.get("assigned_to")
    if lvl == "asesor_freelance":
        return getattr(user, "tenant_id", None) == lead.get("tenant_id")
    return False


def can_view_full_client_data(user, lead: Dict) -> bool:
    lvl = get_user_permission_level(user)
    if lvl in ("superadmin", "developer_director", "inmobiliaria_director"):
        return True
    if lvl == "developer_member":
        return getattr(user, "user_id", None) == lead.get("assigned_to")
    if lvl == "asesor_freelance":
        return getattr(user, "tenant_id", None) == lead.get("tenant_id")
    return False


def can_view_conversation(user, lead: Dict) -> bool:
    lvl = get_user_permission_level(user)
    if lvl in ("superadmin", "developer_director", "inmobiliaria_director"):
        return True
    if lvl in ("developer_member", "inmobiliaria_member"):
        return getattr(user, "user_id", None) == lead.get("assigned_to")
    return False


def can_view_ai_summary(user, lead: Dict) -> bool:
    lvl = get_user_permission_level(user)
    # AI summaries visible to directors and above, plus assigned member
    if lvl in ("superadmin", "developer_director", "inmobiliaria_director"):
        return True
    if lvl in ("developer_member", "inmobiliaria_member"):
        return getattr(user, "user_id", None) == lead.get("assigned_to")
    return False


def can_view_full_project_data(user) -> bool:
    lvl = get_user_permission_level(user)
    return lvl in ("superadmin", "developer_director", "inmobiliaria_director")


def can_view_full_unit_data(user) -> bool:
    lvl = get_user_permission_level(user)
    return lvl in ("superadmin", "developer_director", "developer_member", "inmobiliaria_director")
