"""Phase 4 Batch 0 — Data scoping utility.
scope_data() scrubs entity data based on user permission level.
Apply to GET endpoints that return lead/project/unit/client/asesor data.
Phase 13 Batch 36 — Added scope_dev_inventory_for_asesor for whitelist multi-tenant guard.
"""
from __future__ import annotations
from typing import Dict, List


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


# ─── Phase 13 Batch 36 — Dev Inventory scoping for Asesores ──────────────────

# Campos exclusivos que solo se muestran a asesores con whitelist approved o developers
_DEV_EXCLUSIVE_FIELDS = {
    "commission_real",
    "commission_pct_real",
    "contacto_dev",
    "contacto_dev_whatsapp",
    "contacto_dev_email",
    "fotos_premium",
    "lp_completa",
    "lp_sections",
    "sales_pitch",
    "commission_breakdown",
    "developer_contact",
    "dev_contact",
    "precio_interno",
    "precio_costo",
    "margin_internal",
    "cost_breakdown",
    "financial_model",
    "reserve_price",
    "internal_notes_dev",
}


def scope_dev_project_for_asesor(
    project: Dict, is_authorized: bool
) -> Dict:
    """Scrub datos exclusivos de un proyecto desarrollador para un asesor.

    Si is_authorized=True (whitelist approved), retorna datos completos.
    Si is_authorized=False, elimina campos exclusivos del response.

    Uso: aplicar en GET /api/asesor/inventario y /api/asesor/mini-market
    """
    if not project:
        return project
    out = dict(project)
    if is_authorized:
        return out
    # Sin whitelist: eliminar campos exclusivos
    for f in _DEV_EXCLUSIVE_FIELDS:
        out.pop(f, None)
    return out


def scope_dev_projects_for_asesor(
    projects: List[Dict], authorized_dev_org_ids: List[str]
) -> List[Dict]:
    """Aplica scope_dev_project_for_asesor a una lista de proyectos.

    authorized_dev_org_ids: IDs de developers con whitelist aprobada para este asesor.
    """
    result = []
    auth_set = set(authorized_dev_org_ids)
    for p in projects:
        dev_id = p.get("developer_id") or p.get("dev_org_id") or ""
        is_auth = dev_id in auth_set
        result.append(scope_dev_project_for_asesor(p, is_auth))
    return result


# ─── Phase 14 Batch 37 — In-house User Scoping ────────────────────────────────

def filter_projects_for_in_house_user(
    projects: List[Dict],
    assigned_projects: List[str],
) -> List[Dict]:
    """Filter project list to only assigned_projects (if set).
    If assigned_projects is empty, returns all projects unchanged.
    """
    if not assigned_projects:
        return projects
    assigned_set = set(assigned_projects)
    return [p for p in projects if p.get("id") in assigned_set]


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
