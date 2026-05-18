"""W5.FF4 Sub-C — Feature dependencies validator + cascade resolver.

API:
  validate_dependencies(db, user_id, tenant_id, feature_key)
      → (is_valid: bool, missing: List[str])
  resolve_cascade(db, tenant_id, feature_keys)
      → List[str] · canonical order: dependencies first · then originals
      (used by apply-template to auto-grant prerequisites)

Logic:
  - Reads requires_features from get_extended_catalog (W5.FF2 merge legacy+registry)
  - Compares against the user's current enabled features
    (via feature_legacy_adapter.merge_legacy_with_flags · UNION explicit+implicit)
  - FAIL-OPEN: cualquier excepción → (True, []) (no bloquea grants legítimos)
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Tuple

import feature_flags_engine as ff

_log = logging.getLogger("dmx.feature_dependencies")


def _catalog_by_key() -> Dict[str, Dict[str, Any]]:
    try:
        return {f.get("key"): f for f in ff.get_extended_catalog() if f.get("key")}
    except Exception as exc:
        _log.warning(f"[dependencies] extended_catalog failed: {exc}")
        return {}


async def validate_dependencies(
    db, user_id: str, tenant_id: str, feature_key: str
) -> Tuple[bool, List[str]]:
    """Returns (is_valid, missing_features_list).

    is_valid=True means user has all prerequisites for `feature_key` OR no
    prerequisites declared. FAIL-OPEN: errors → (True, []).
    """
    try:
        cat = _catalog_by_key()
        entry = cat.get(feature_key)
        if not entry:
            return True, []
        requires = [r for r in (entry.get("requires_features") or []) if r]
        if not requires:
            return True, []
        from feature_legacy_adapter import merge_legacy_with_flags
        current_list = await merge_legacy_with_flags(db, user_id, tenant_id)
        # FAIL-OPEN convention (spec §1.1): empty current is indistinguishable from
        # adapter FAIL-OPEN · NUNCA bloquear grants en este caso.
        if not current_list:
            return True, []
        current = set(current_list)
        missing = [r for r in requires if r not in current]
        return (len(missing) == 0, missing)
    except Exception as exc:
        _log.warning(
            f"[dependencies] validate failed user={user_id} feature={feature_key} err={exc} · FAIL-OPEN"
        )
        return True, []


def resolve_cascade(feature_keys: List[str], max_depth: int = 4) -> List[str]:
    """Returns the input keys with required dependencies prepended (topological-ish).

    Uses static catalog (no DB) · safe to call before bulk upsert. Cycles broken
    by max_depth. Each key appears at most once · dependencies first.
    """
    cat = _catalog_by_key()
    seen: List[str] = []

    def _expand(k: str, depth: int) -> None:
        if k in seen:
            return
        if depth > max_depth:
            seen.append(k)
            return
        entry = cat.get(k) or {}
        for dep in entry.get("requires_features") or []:
            if dep and dep not in seen:
                _expand(dep, depth + 1)
        if k not in seen:
            seen.append(k)

    for k in feature_keys:
        if k:
            _expand(k, 0)
    return seen
