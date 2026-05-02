"""Phase 4 Batch 0 — Data scoping utility.
scope_data() scrubs entity data based on user permission level.
Apply to GET endpoints that return lead/project/unit/client/asesor data.
"""
from __future__ import annotations
from typing import Any, Dict, Optional


def scope_data(data: Dict, user, entity_type: str) -> Dict:
    """Return a scrubbed copy of data per user permission level.

    entity_type: 'lead' | 'project' | 'unit' | 'asesor' | 'client' | 'commercialization'
    """
    if not data:
        return data

    try:
        from permissions import get_user_permission_level
        lvl = get_user_permission_level(user)
    except Exception:
        lvl = "asesor_freelance"

    if lvl == "superadmin":
        return data

    out = dict(data)

    if entity_type == "lead":
        return _scope_lead(out, lvl, user)
    if entity_type == "project":
        return _scope_project(out, lvl)
    if entity_type == "unit":
        return _scope_unit(out, lvl)
    if entity_type in ("asesor", "client"):
        return _scope_contact(out, lvl, user)
    if entity_type == "commercialization":
        return _scope_commercialization(out, lvl)
    return out


# ─── Private helpers ───────────────────────────────────────────────────────────

_LEAD_PRIVATE_FIELDS = {
    "email", "phone", "whatsapp", "client_email", "client_phone",
    "internal_notes", "ai_summary", "conversation_log",
}

_LEAD_MEMBER_HIDDEN = {
    "commission_breakdown", "margin_internal",
}


def _scope_lead(data: Dict, lvl: str, user) -> Dict:
    out = dict(data)
    if lvl in ("developer_director", "inmobiliaria_director"):
        # Directors see everything
        return out
    if lvl in ("developer_member", "inmobiliaria_member"):
        # Members see full client data only for their assigned leads
        uid = getattr(user, "user_id", None)
        if out.get("assigned_to") != uid:
            for f in _LEAD_PRIVATE_FIELDS:
                out.pop(f, None)
        for f in _LEAD_MEMBER_HIDDEN:
            out.pop(f, None)
        return out
    # asesor_freelance: only tenant-scoped, no internals
    for f in _LEAD_PRIVATE_FIELDS | _LEAD_MEMBER_HIDDEN:
        out.pop(f, None)
    return out


def _scope_project(data: Dict, lvl: str) -> Dict:
    out = dict(data)
    if lvl not in ("developer_director", "inmobiliaria_director"):
        for f in ("margin_internal", "cost_breakdown", "financial_model"):
            out.pop(f, None)
    return out


def _scope_unit(data: Dict, lvl: str) -> Dict:
    out = dict(data)
    if lvl not in ("developer_director", "inmobiliaria_director", "developer_member"):
        for f in ("cost_price", "developer_margin", "reservation_private"):
            out.pop(f, None)
    return out


def _scope_contact(data: Dict, lvl: str, user) -> Dict:
    out = dict(data)
    if lvl == "asesor_freelance":
        uid = getattr(user, "user_id", None)
        if out.get("advisor_id") != uid:
            for f in ("phone", "email", "whatsapp"):
                out.pop(f, None)
    return out


_COMMERCIALIZATION_SENSITIVE = {
    "broker_commission_pct", "internal_target_margin", "reserve_price",
    "discount_budget_total", "broker_agreements", "co_broker_contacts",
}


def _scope_commercialization(data: Dict, lvl: str) -> Dict:
    """Only directors and above see full commercialization terms."""
    out = dict(data)
    if lvl not in ("developer_director", "inmobiliaria_director"):
        for f in _COMMERCIALIZATION_SENSITIVE:
            out.pop(f, None)
    return out
