"""Phase 4 Batch 0 — Role-level permission helpers · checks genéricos cross-portal.
Phase 14 Batch 37 — Extended con in-house user roles + cross-org helpers.

SCOPE de este archivo (post-consolidación 2026-05-13):
  - Mapeo de roles a permission levels (`get_user_permission_level`)
  - Gates de role-level (is_superadmin · can_edit_project · can_view_commercialization · etc)
  - Helpers de tenant management (can_manage_inmobiliaria · can_view_org_internal_users)
  - Helpers utilidad (safe_path_param)

FUERA DE SCOPE · NO viven aquí:
  - Gates de acceso a LEADS (can_view_full_client_data · can_move_lead · can_view_kanban
    · can_view_conversation · can_view_ai_summary) → viven en `routes/dev_batch4_2.py`
    porque validan `lead.dev_org_id == user.tenant_id` (lógica estricta · tenant-aware)

Historia: hasta 2026-05-13 hubo 5 funciones zombie aquí con lógica laxa que NUNCA
se usaron en producción (solo tests Wave 1 las importaban). Eliminadas para evitar
confusión · ver `docs/PERMISSIONS_ARCHITECTURE.md` para detalles.
"""
from __future__ import annotations


# ─── Canonical permission levels ──────────────────────────────────────────────
LEVELS_ORDER = [
    "superadmin",
    "developer_director",
    "developer_member",
    "inmobiliaria_director",
    "inmobiliaria_member",
    "asesor_freelance",
]

# B37: All in-house developer roles
DEV_IN_HOUSE_ROLES = {
    "developer_admin",
    "developer_member",  # covers director/advisor/obras/marketing via internal_role
    "developer_director",
    "developer_advisor",
    "developer_obras",
    "developer_marketing",
}

# B37: All inmobiliaria roles
INM_IN_HOUSE_ROLES = {
    "inmobiliaria_admin",
    "inmobiliaria_director",
    "inmobiliaria_member",  # covers advisor/marketing via internal_role
    "inmobiliaria_advisor",
    "inmobiliaria_marketing",
}


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
    if role == "developer_director":           # B37 explicit role
        return "developer_director"
    if role == "inmobiliaria_director":        # B37 explicit role
        return "inmobiliaria_director"
    if role == "developer_member":
        if internal_role in ("admin", "commercial_director", "director"):
            return "developer_director"
        return "developer_member"
    if role in ("developer_advisor", "developer_obras", "developer_marketing"):
        return "developer_member"
    if role in ("inmobiliaria_member", "inmobiliaria_advisor", "inmobiliaria_marketing"):
        return "inmobiliaria_member"
    if role in ("advisor", "asesor_admin"):
        return "asesor_freelance"
    # Default fallback
    return "asesor_freelance"


# ═════════════════════════════════════════════════════════════════════════════
# LEAD-LEVEL GATES · MOVED TO routes/dev_batch4_2.py (2026-05-13 consolidation)
# ═════════════════════════════════════════════════════════════════════════════
#
# Las siguientes 5 funciones existieron aquí con lógica LAXA (sin validar
# tenant_id en el lead). NUNCA se usaron en producción · solo `tests/wave1/
# test_permissions_unit.py` las importaba.
#
# Las versiones canónicas (estrictas · validan `lead.dev_org_id == user.tenant_id`)
# viven en `backend/routes/dev_batch4_2.py` y son las que usan los endpoints
# reales de leads/kanban (rutas /api/leads/* via dev_batch4_2 + dev_batch4_4).
#
# Funciones eliminadas (importar desde routes.dev_batch4_2 si las necesitas):
#   - can_view_kanban
#   - can_move_lead
#   - can_view_full_client_data
#   - can_view_conversation
#   - can_view_ai_summary
#
# Para checks de role-level genéricos (project edit · commercialization · superadmin
# gates · etc), seguir importando desde `permissions.py` como antes.
# ═════════════════════════════════════════════════════════════════════════════


def can_view_full_project_data(user) -> bool:
    lvl = get_user_permission_level(user)
    return lvl in ("superadmin", "developer_director", "inmobiliaria_director")


def can_view_full_unit_data(user) -> bool:
    lvl = get_user_permission_level(user)
    return lvl in ("superadmin", "developer_director", "developer_member", "inmobiliaria_director")


def can_edit_project(user) -> bool:
    """Only developer_admin / director or superadmin can mutate project settings."""
    lvl = get_user_permission_level(user)
    return lvl in ("superadmin", "developer_director")


def can_view_commercialization(user) -> bool:
    """Commercialization data (pricing strategy, commissions, broker agreements)
    visible to directors and above.
    """
    lvl = get_user_permission_level(user)
    return lvl in ("superadmin", "developer_director", "inmobiliaria_director")


def can_view_engagement_metrics(user) -> bool:
    """Engagement analytics (portal hits, time-on-page, funnel drop-offs)
    visible to developers and inmobiliarias at director level or above.
    """
    lvl = get_user_permission_level(user)
    return lvl in ("superadmin", "developer_director", "developer_member",
                   "inmobiliaria_director")


# ─── Phase 18 Batch 35 — Inmobiliaria entity scoping ──────────────────────────

def can_manage_inmobiliaria(user, inmobiliaria_id: str = "") -> bool:
    """True if user can mutate inmobiliaria settings, invite asesores, manage
    dev partnerships. superadmin always can; inmobiliaria_admin can only on
    their own tenant.
    """
    if not user:
        return False
    role = getattr(user, "role", "") or ""
    if role == "superadmin":
        return True
    if role != "inmobiliaria_admin":
        return False
    if not inmobiliaria_id:
        # Permission check w/o target tenant: just confirms admin role.
        return True
    return getattr(user, "tenant_id", None) == inmobiliaria_id


# ─── Phase 13 Batch 36 — Dev Inventory Exclusive Access ───────────────────────

def can_view_dev_inventory_exclusive(user, dev_org_id: str, is_authorized: bool = False) -> bool:
    """True si el usuario puede ver datos exclusivos del inventario (comisión real,
    contacto dev, LP completa) del developer especificado.

    Reglas:
      - superadmin: siempre True
      - developer_admin con mismo dev_org_id: True
      - asesor con whitelist approved (is_authorized=True): True
      - cualquier otro: False
    """
    if not user:
        return False
    role = getattr(user, "role", "") or ""
    if role == "superadmin":
        return True
    if role == "developer_admin":
        return getattr(user, "tenant_id", None) == dev_org_id
    if role in ("advisor", "asesor_admin"):
        return is_authorized
    return False


# ─── Phase 14 Batch 37 — In-house Users + Cross-Org Permissions ───────────────

def can_invite_internal_user(user, org_id: str = "") -> bool:
    """True si el usuario puede invitar usuarios internos a su organización.
    Solo admin/director del mismo org.
    """
    if not user:
        return False
    role = getattr(user, "role", "") or ""
    if role == "superadmin":
        return True
    if role in ("developer_admin", "developer_director"):
        if not org_id:
            return True
        return getattr(user, "tenant_id", None) == org_id
    if role in ("inmobiliaria_admin", "inmobiliaria_director"):
        if not org_id:
            return True
        return getattr(user, "tenant_id", None) == org_id
    return False


def can_modify_assigned_projects(user) -> bool:
    """True si el usuario puede modificar los proyectos asignados a usuarios internos."""
    if not user:
        return False
    role = getattr(user, "role", "") or ""
    internal_role = getattr(user, "internal_role", "") or ""
    if role == "superadmin":
        return True
    if role in ("developer_admin", "developer_director"):
        return True
    if role == "developer_member" and internal_role in ("admin", "commercial_director", "director"):
        return True
    if role in ("inmobiliaria_admin", "inmobiliaria_director"):
        return True
    return False


def can_view_org_internal_users(user, org_id: str) -> bool:
    """True si el usuario puede ver la lista de usuarios internos de la org."""
    if not user:
        return False
    role = getattr(user, "role", "") or ""
    if role == "superadmin":
        return True
    return getattr(user, "tenant_id", None) == org_id


def can_manage_cross_partnership(user, org_id: str = "") -> bool:
    """True si el usuario puede gestionar cross-org partnerships."""
    if not user:
        return False
    role = getattr(user, "role", "") or ""
    if role == "superadmin":
        return True
    if role in ("developer_admin", "developer_director", "inmobiliaria_admin", "inmobiliaria_director"):
        if not org_id:
            return True
        return getattr(user, "tenant_id", None) == org_id
    return False


# ─── Wave 1.1 — Centralized superadmin guards ────────────────────────────────
async def require_superadmin(request):
    """
    Canonical superadmin gate. Raises 401 if no auth, 403 if role != superadmin.
    Returns the authenticated user.
    """
    from fastapi import HTTPException
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    if getattr(user, "role", None) != "superadmin":
        raise HTTPException(403, "Acceso restringido a superadmin")
    return user


async def check_role(request, *roles: str):
    """Candado 3 (anti-parches) · PUNTO ÚNICO de verificación de rol, llamado en el CUERPO del
    handler (no `Depends` — así no toca firmas de ~400 handlers). 401 si no autenticado · 403 si
    el rol no está en `roles` · sin `roles` = cualquier usuario autenticado. Devuelve el user.

    Los ~30 helpers `_auth*`/`require_*` de routes/ deben ENVOLVER esto (pasando SUS roles) en vez
    de reimplementar get_current_user + 401 + check de rol. NO hace god-view automático de
    superadmin: preserva el comportamiento exacto del helper que lo llama (puro refactor, cero
    cambio de acceso). Si un endpoint quiere que superadmin pase, incluye 'superadmin' en sus roles."""
    from fastapi import HTTPException
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    if roles and getattr(user, "role", None) not in roles:
        raise HTTPException(403, "Acceso denegado")
    return user


def is_superadmin(user) -> bool:
    """Pure check (no raise). True if user.role == superadmin."""
    if not user:
        return False
    return getattr(user, "role", None) == "superadmin"


def is_dev_or_superadmin(user) -> bool:
    """Pure check (no raise). True if superadmin OR developer in-house role."""
    if not user:
        return False
    role = getattr(user, "role", None)
    return role == "superadmin" or role in DEV_IN_HOUSE_ROLES


# ─── URL-encoding utilities (Wave 3 fix-pass · zone_id accent handling) ──────
def safe_path_param(value: str) -> str:
    """
    Defensive normalization for URL path params with potential accents/special chars.

    FastAPI auto-decodes URL-encoded path params, but this helper ensures consistent
    behavior even if upstream proxies (e.g. Cloudflare) re-encode in transit.

    Use case: zone_id like 'cuauhtémoc' or 'álvaro-obregón' arrives via URL.
    - Frontend MUST always encodeURIComponent() before fetch.
    - Backend uses this helper as belt-and-suspenders defense before MongoDB query.

    Returns lowercase trimmed string, decoded if URL-encoded, NFC unicode normalized.
    """
    if not value:
        return ""
    from urllib.parse import unquote
    import unicodedata
    # Decode if still URL-encoded (idempotent — no-op if already decoded by FastAPI)
    decoded = unquote(value) if "%" in value else value
    # Normalize unicode (compose accents consistently)
    normalized = unicodedata.normalize("NFC", decoded)
    return normalized.strip().lower()
