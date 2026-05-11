"""Wave 2 · Tests audit_log.py · 14 tests unidad sin DB.

Cubre helpers puros del módulo audit_log (Phase F0.1):
- _compute_diff_keys (key diff entre before/after dicts)
- _safe_strip (sanitización: drop _id + bytes)
- _extract_request_meta (None-safe FastAPI Request parse)
- _scope_filter (multi-tenant Mongo filter por role)
- build_filter_query (W2.2 SA3 reusable filter builder · 10+ filtros)
- _uid · _now_iso (id + timestamp generators)

Funciones SKIPED (necesitan FastAPI Request real / Mongo / asyncio.create_task):
- log_mutation · ensure_audit_log_indexes · list_audit_log · entity_trail · audit_stats

NO toca infra · NO modifica código · solo lectura.
"""
import pytest
from types import SimpleNamespace

from audit_log import (
    _compute_diff_keys,
    _extract_request_meta,
    _now_iso,
    _safe_strip,
    _scope_filter,
    _uid,
    build_filter_query,
)


pytestmark = pytest.mark.unit


# ─── 1. _compute_diff_keys: detección de campos cambiados ────────────────────


def test_diff_keys_both_none_returns_empty():
    """Sin before ni after → lista vacía (no-op)."""
    assert _compute_diff_keys(None, None) == []


def test_diff_keys_both_empty_dicts_returns_empty():
    """Dos dicts vacíos → sin diff."""
    assert _compute_diff_keys({}, {}) == []


def test_diff_keys_added_field():
    """Campo nuevo en after → aparece en diff."""
    assert _compute_diff_keys({"a": 1}, {"a": 1, "c": 2}) == ["c"]


def test_diff_keys_removed_field():
    """Campo presente en before y ausente en after → aparece en diff."""
    assert _compute_diff_keys({"a": 1, "d": 2}, {"a": 1}) == ["d"]


def test_diff_keys_changed_value():
    """Mismo key, distinto value → aparece en diff."""
    diff = _compute_diff_keys({"a": 1, "b": 2}, {"a": 1, "b": 3})
    assert diff == ["b"]


def test_diff_keys_identical_returns_empty():
    """Dicts idénticos → sin diff (no false positives)."""
    assert _compute_diff_keys({"a": 1, "b": 2}, {"a": 1, "b": 2}) == []


def test_diff_keys_one_side_none_treats_as_empty():
    """before None + after dict → after keys cuentan como nuevos."""
    diff = _compute_diff_keys(None, {"a": 1})
    assert diff == ["a"]


# ─── 2. _safe_strip: sanitización Mongo doc ──────────────────────────────────


def test_safe_strip_none_input_returns_none():
    """None in → None out (no raise)."""
    assert _safe_strip(None) is None


def test_safe_strip_removes_underscore_id():
    """_id (Mongo ObjectId) se elimina · audit no debe persistir ObjectIds raw."""
    out = _safe_strip({"_id": "X", "a": 1})
    assert out == {"a": 1}


def test_safe_strip_removes_bytes_values():
    """Valores bytes se eliminan (no serializables a JSON / payload bloat)."""
    out = _safe_strip({"b": b"binary", "a": "ok"})
    assert out == {"a": "ok"}


def test_safe_strip_preserves_nested_id_keys():
    """Strip es shallow · nested _id queda intacto (no recursivo)."""
    out = _safe_strip({"nested": {"_id": "keep"}, "a": 1})
    assert out == {"nested": {"_id": "keep"}, "a": 1}


# ─── 3. _extract_request_meta: None-safe ─────────────────────────────────────


def test_extract_request_meta_none_returns_all_none():
    """Request None → dict con ip/user_agent/route todos None."""
    assert _extract_request_meta(None) == {
        "ip": None, "user_agent": None, "route": None,
    }


# ─── 4. _scope_filter: multi-tenant query por role ───────────────────────────


def test_scope_filter_superadmin_sees_all():
    """superadmin → filter {} (sin scope)."""
    user = SimpleNamespace(role="superadmin", tenant_id=None, user_id="S1")
    assert _scope_filter(user) == {}


def test_scope_filter_dev_admin_scoped_to_org():
    """developer_admin / inmobiliaria_admin / asesor_admin → filter por actor.org_id."""
    user = SimpleNamespace(role="developer_admin", tenant_id="T1", user_id="U1")
    assert _scope_filter(user) == {"actor.org_id": "T1"}

    inm = SimpleNamespace(role="inmobiliaria_admin", tenant_id="T2", user_id="I1")
    assert _scope_filter(inm) == {"actor.org_id": "T2"}


def test_scope_filter_advisor_scoped_to_self():
    """advisor (rol más bajo) → filter por actor.user_id (solo propios actos)."""
    user = SimpleNamespace(role="advisor", tenant_id="T1", user_id="U1")
    assert _scope_filter(user) == {"actor.user_id": "U1"}


def test_scope_filter_accepts_dict_input():
    """_scope_filter acepta tanto objeto-like como dict (compat dual)."""
    out = _scope_filter({"role": "superadmin", "tenant_id": None, "user_id": "X"})
    assert out == {}


# ─── 5. build_filter_query: reusable filter builder (W2.2 SA3) ───────────────


def test_build_filter_empty_returns_empty():
    """Sin filtros · sin base → {} (identidad)."""
    assert build_filter_query({}) == {}


def test_build_filter_merges_base():
    """`base` argument se merge primero (preserve scope filter)."""
    assert build_filter_query({}, {"foo": "bar"}) == {"foo": "bar"}


def test_build_filter_actor_user_id_maps_correctly():
    """actor_user_id → query field actor.user_id."""
    assert build_filter_query({"actor_user_id": "U1"}) == {"actor.user_id": "U1"}


def test_build_filter_action_mutations_expands_to_in_list():
    """action='mutations' se expande a $in con todas las write-actions canónicas."""
    out = build_filter_query({"action": "mutations"})
    assert "$in" in out["action"]
    in_list = out["action"]["$in"]
    # Debe contener al menos las 4 acciones core
    assert "create" in in_list
    assert "update" in in_list
    assert "delete" in in_list
    assert "revert" in in_list


def test_build_filter_action_specific_passes_through():
    """action='create' (no 'mutations') → equality match directo."""
    assert build_filter_query({"action": "create"}) == {"action": "create"}


def test_build_filter_ts_range_both_bounds():
    """from_ts + to_ts → ts: {$gte, $lte}."""
    out = build_filter_query({"from_ts": "2026-01-01", "to_ts": "2026-12-31"})
    assert out == {"ts": {"$gte": "2026-01-01", "$lte": "2026-12-31"}}


def test_build_filter_q_regex_or_across_three_fields():
    """`q` produce $or regex case-insensitive sobre action/entity_type/entity_id."""
    out = build_filter_query({"q": "create_lead"})
    assert "$or" in out
    assert len(out["$or"]) == 3
    fields = {next(iter(clause.keys())) for clause in out["$or"]}
    assert fields == {"action", "entity_type", "entity_id"}
    # Regex case-insensitive
    for clause in out["$or"]:
        rx = next(iter(clause.values()))
        assert rx["$options"] == "i"


# ─── 6. _uid / _now_iso: generators ──────────────────────────────────────────


def test_uid_format_audit_prefix():
    """_uid retorna `audit_<16 hex>` (22 chars total)."""
    uid = _uid()
    assert uid.startswith("audit_")
    assert len(uid) == 6 + 16  # 'audit_' + 16 hex chars


def test_uid_uniqueness_within_loop():
    """uuid4 → batches consecutivos distintos (no collisions)."""
    ids = {_uid() for _ in range(50)}
    assert len(ids) == 50


def test_now_iso_returns_utc_timestamp():
    """_now_iso retorna ISO 8601 con timezone UTC (+00:00 suffix)."""
    iso = _now_iso()
    assert "+00:00" in iso or iso.endswith("Z")
