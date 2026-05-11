"""Wave 1 · Tests permissions.py · 18 tests críticos sin infra.

Cubre:
- get_user_permission_level (mapping roles → permission levels)
- can_view_kanban / can_move_lead / can_view_full_client_data
- can_edit_project / can_view_commercialization
- can_manage_inmobiliaria (tenant scope)
- can_view_dev_inventory_exclusive (whitelist)
- is_superadmin / is_dev_or_superadmin
- safe_path_param (URL/unicode normalization)

NO toca infra · NO requiere Mongo · NO requiere servidor.
Todos los tests usan SimpleNamespace (mock user attribute access).
"""
import pytest
from types import SimpleNamespace

from permissions import (
    get_user_permission_level,
    can_view_kanban,
    can_move_lead,
    can_view_full_client_data,
    can_view_conversation,
    can_edit_project,
    can_view_commercialization,
    can_manage_inmobiliaria,
    can_view_dev_inventory_exclusive,
    can_invite_internal_user,
    is_superadmin,
    is_dev_or_superadmin,
    safe_path_param,
    DEV_IN_HOUSE_ROLES,
    INM_IN_HOUSE_ROLES,
)


pytestmark = pytest.mark.unit


# ─── 1. get_user_permission_level: mapeo roles → niveles ─────────────────────


def test_permission_level_superadmin():
    """superadmin role → superadmin level."""
    user = SimpleNamespace(role="superadmin", internal_role="")
    assert get_user_permission_level(user) == "superadmin"


def test_permission_level_developer_admin_to_director():
    """developer_admin se mapea a developer_director."""
    user = SimpleNamespace(role="developer_admin", internal_role="")
    assert get_user_permission_level(user) == "developer_director"


def test_permission_level_developer_member_with_internal_admin():
    """developer_member + internal_role admin/director → director level."""
    user = SimpleNamespace(role="developer_member", internal_role="admin")
    assert get_user_permission_level(user) == "developer_director"

    user2 = SimpleNamespace(role="developer_member", internal_role="commercial_director")
    assert get_user_permission_level(user2) == "developer_director"

    user3 = SimpleNamespace(role="developer_member", internal_role="")
    assert get_user_permission_level(user3) == "developer_member"


def test_permission_level_unknown_role_falls_back():
    """Role no reconocido → asesor_freelance (fallback seguro · privilege más bajo)."""
    user = SimpleNamespace(role="random_unknown", internal_role="")
    assert get_user_permission_level(user) == "asesor_freelance"


# ─── 2. can_view_kanban: scope + role ───────────────────────────────────────


def test_can_view_kanban_superadmin_all_scopes():
    """superadmin puede ver todos los scopes."""
    user = SimpleNamespace(role="superadmin", internal_role="")
    assert can_view_kanban(user, "developer") is True
    assert can_view_kanban(user, "inmobiliaria") is True
    assert can_view_kanban(user, "asesor") is True


def test_can_view_kanban_developer_only_developer_scope():
    """developer_admin solo ve developer scope."""
    user = SimpleNamespace(role="developer_admin", internal_role="")
    assert can_view_kanban(user, "developer") is True
    assert can_view_kanban(user, "inmobiliaria") is False


# ─── 3. can_move_lead: ownership ─────────────────────────────────────────────


def test_can_move_lead_member_only_own_assigned():
    """developer_member solo puede mover leads asignados a él · NO ajenos."""
    user = SimpleNamespace(role="developer_member", internal_role="", user_id="U001", tenant_id="T1")

    own_lead = {"assigned_to": "U001", "tenant_id": "T1"}
    assert can_move_lead(user, own_lead) is True

    foreign_lead = {"assigned_to": "U002", "tenant_id": "T1"}
    assert can_move_lead(user, foreign_lead) is False


def test_can_move_lead_asesor_freelance_only_own_tenant():
    """asesor_freelance puede mover leads de su tenant · NO ajenos."""
    user = SimpleNamespace(role="advisor", internal_role="", user_id="A001", tenant_id="T1")

    own_tenant_lead = {"tenant_id": "T1", "assigned_to": "anyone"}
    assert can_move_lead(user, own_tenant_lead) is True

    foreign_tenant_lead = {"tenant_id": "T2", "assigned_to": "anyone"}
    assert can_move_lead(user, foreign_tenant_lead) is False


# ─── 4. can_view_full_client_data: PII protection ────────────────────────────


def test_can_view_full_client_data_director_yes_member_no():
    """director siempre · member solo si asignado."""
    director = SimpleNamespace(role="developer_admin", internal_role="", user_id="D1", tenant_id="T1")
    lead = {"assigned_to": "U999", "tenant_id": "T1"}
    assert can_view_full_client_data(director, lead) is True

    member = SimpleNamespace(role="developer_member", internal_role="", user_id="M1", tenant_id="T1")
    assert can_view_full_client_data(member, lead) is False  # no asignado a M1


# ─── 5. can_view_conversation ────────────────────────────────────────────────


def test_can_view_conversation_member_only_assigned():
    """member ve conversación solo si lead asignado a él."""
    member = SimpleNamespace(role="developer_member", internal_role="", user_id="M1", tenant_id="T1")

    own_lead = {"assigned_to": "M1"}
    assert can_view_conversation(member, own_lead) is True

    foreign_lead = {"assigned_to": "OTHER"}
    assert can_view_conversation(member, foreign_lead) is False


# ─── 6. can_edit_project: solo dev_director / superadmin ─────────────────────


def test_can_edit_project_only_director_and_superadmin():
    """Solo superadmin y developer_director pueden editar proyecto · resto NO."""
    superadmin = SimpleNamespace(role="superadmin", internal_role="")
    dev_admin = SimpleNamespace(role="developer_admin", internal_role="")
    dev_member = SimpleNamespace(role="developer_member", internal_role="")
    inm_director = SimpleNamespace(role="inmobiliaria_admin", internal_role="")
    asesor = SimpleNamespace(role="advisor", internal_role="")

    assert can_edit_project(superadmin) is True
    assert can_edit_project(dev_admin) is True  # mapped to developer_director
    assert can_edit_project(dev_member) is False
    assert can_edit_project(inm_director) is False  # only DEV_director can edit project
    assert can_edit_project(asesor) is False


# ─── 7. can_view_commercialization ───────────────────────────────────────────


def test_can_view_commercialization_directors_yes_members_no():
    """Pricing/comissions visibles solo a directors+."""
    superadmin = SimpleNamespace(role="superadmin", internal_role="")
    inm_director = SimpleNamespace(role="inmobiliaria_admin", internal_role="")
    member = SimpleNamespace(role="developer_member", internal_role="")
    asesor = SimpleNamespace(role="advisor", internal_role="")

    assert can_view_commercialization(superadmin) is True
    assert can_view_commercialization(inm_director) is True
    assert can_view_commercialization(member) is False
    assert can_view_commercialization(asesor) is False


# ─── 8. can_manage_inmobiliaria: tenant scope ────────────────────────────────


def test_can_manage_inmobiliaria_admin_only_own_tenant():
    """inmobiliaria_admin maneja solo su propia inmobiliaria · NO ajenas."""
    inm_admin = SimpleNamespace(role="inmobiliaria_admin", tenant_id="INM_OWN")

    assert can_manage_inmobiliaria(inm_admin, "INM_OWN") is True
    assert can_manage_inmobiliaria(inm_admin, "INM_FOREIGN") is False
    # Sin target_id (chequeo solo de role) → True
    assert can_manage_inmobiliaria(inm_admin, "") is True


def test_can_manage_inmobiliaria_others_blocked():
    """Resto de roles NO puede manejar inmobiliaria · solo superadmin + inm_admin."""
    superadmin = SimpleNamespace(role="superadmin", tenant_id=None)
    dev_admin = SimpleNamespace(role="developer_admin", tenant_id="DEV1")
    asesor = SimpleNamespace(role="advisor", tenant_id="T1")

    assert can_manage_inmobiliaria(superadmin, "INM_X") is True
    assert can_manage_inmobiliaria(dev_admin, "INM_X") is False
    assert can_manage_inmobiliaria(asesor, "INM_X") is False


# ─── 9. can_view_dev_inventory_exclusive: whitelist asesor ──────────────────


def test_can_view_dev_inventory_asesor_whitelist_required():
    """asesor SOLO ve inventario exclusivo si is_authorized=True (whitelist)."""
    asesor = SimpleNamespace(role="advisor", tenant_id="T1")

    # Sin authorize → False
    assert can_view_dev_inventory_exclusive(asesor, "DEV_X", is_authorized=False) is False
    # Con authorize → True
    assert can_view_dev_inventory_exclusive(asesor, "DEV_X", is_authorized=True) is True


def test_can_view_dev_inventory_dev_admin_only_own_org():
    """developer_admin ve inventario exclusivo solo de SU org."""
    dev_admin = SimpleNamespace(role="developer_admin", tenant_id="DEV_OWN")

    assert can_view_dev_inventory_exclusive(dev_admin, "DEV_OWN") is True
    assert can_view_dev_inventory_exclusive(dev_admin, "DEV_FOREIGN") is False


# ─── 10. is_superadmin / is_dev_or_superadmin ────────────────────────────────


def test_is_superadmin_pure_check():
    """is_superadmin retorna boolean · NO raise · None-safe."""
    assert is_superadmin(SimpleNamespace(role="superadmin")) is True
    assert is_superadmin(SimpleNamespace(role="developer_admin")) is False
    assert is_superadmin(None) is False


def test_is_dev_or_superadmin_includes_in_house_roles():
    """is_dev_or_superadmin true para superadmin + cualquier rol DEV_IN_HOUSE_ROLES."""
    assert is_dev_or_superadmin(SimpleNamespace(role="superadmin")) is True
    assert is_dev_or_superadmin(SimpleNamespace(role="developer_admin")) is True
    assert is_dev_or_superadmin(SimpleNamespace(role="developer_marketing")) is True
    assert is_dev_or_superadmin(SimpleNamespace(role="advisor")) is False
    assert is_dev_or_superadmin(None) is False


# ─── 11. safe_path_param: URL/unicode normalization ──────────────────────────


def test_safe_path_param_url_decoded():
    """URL-encoded path param se decodifica correctamente."""
    # %20 = space, %C3%A9 = é, %C3%B3 = ó
    assert safe_path_param("polanco%20norte") == "polanco norte"
    assert safe_path_param("benito-ju%C3%A1rez") == "benito-juárez"


def test_safe_path_param_lowercase_strip_normalize():
    """Lowercase + strip + NFC unicode normalize."""
    assert safe_path_param("  POLANCO  ") == "polanco"
    assert safe_path_param("ÁLVARO-OBREGÓN") == "álvaro-obregón"
    assert safe_path_param("") == ""
    assert safe_path_param(None) == ""


# ─── 12. Constants integrity ─────────────────────────────────────────────────


def test_dev_in_house_roles_complete():
    """DEV_IN_HOUSE_ROLES incluye los 6 roles canónicos."""
    expected = {
        "developer_admin", "developer_member", "developer_director",
        "developer_advisor", "developer_obras", "developer_marketing",
    }
    assert DEV_IN_HOUSE_ROLES == expected


def test_inm_in_house_roles_complete():
    """INM_IN_HOUSE_ROLES incluye los 5 roles canónicos."""
    expected = {
        "inmobiliaria_admin", "inmobiliaria_director", "inmobiliaria_member",
        "inmobiliaria_advisor", "inmobiliaria_marketing",
    }
    assert INM_IN_HOUSE_ROLES == expected
