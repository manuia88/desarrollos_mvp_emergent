"""W5.FF2 Sub-B — Legacy Adapter (tier → feature_flag).

Bridges the existing tier-based access control (battle_card T3+, FSD, etc) with
the new feature_flags system. Features pertenecientes al tier del user se
"implicit-grant" sin requerir explicit upsert en tenant_features.

API:
  TIER_TO_FEATURES            → Dict[str, List[str]] mapping canónico (spec W5.FF2)
  resolve_features_from_tier  → user|str → List[str] de features implicit por tier
  merge_legacy_with_flags     → UNION explicit grants (DB) ∪ implicit tier features
                                FAIL-OPEN: [] si DB rota

Convenciones:
  - tier canónico: "free" | "pro" | "enterprise" (consistente con FEATURE_CATALOG.plan_tier)
  - tiers más permisivos heredan features de tiers inferiores (pro incluye free, etc.)
  - Keys de TIER_TO_FEATURES son canónicas del spec W5.FF · pueden o no existir en
    FEATURE_CATALOG W2.4 (legacy) · feature_registry las registrará progresivamente.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Union

import feature_flags_engine as ff

_log = logging.getLogger("dmx.feature_legacy_adapter")


# ─── Canonical tier → features mapping (spec W5.FF2 §Sub-B) ───────────────────
TIER_TO_FEATURES: Dict[str, List[str]] = {
    "free":       ["dashboard", "marketplace_basic", "perfil"],
    "pro":        ["battle_card", "fsd_accuracy", "live_pulse_alerts", "knowledge_graph_view"],
    "enterprise": ["api_keys", "bulk_csv", "ab_testing", "data_licensing"],
}

# Inheritance: pro hereda free · enterprise hereda free+pro.
_TIER_INHERITANCE: Dict[str, List[str]] = {
    "free":       ["free"],
    "basic":      ["free"],
    "pro":        ["free", "pro"],
    "enterprise": ["free", "pro", "enterprise"],
}


def _normalize_tier(tier: Optional[str]) -> str:
    t = (tier or "").lower().strip()
    if t in TIER_TO_FEATURES or t == "basic":
        return t if t != "basic" else "free"
    return "free"


def _extract_tier_from_user(user: Any) -> str:
    """Best-effort tier extraction · supports Pydantic obj, dict, or str."""
    if user is None:
        return "free"
    if isinstance(user, str):
        return _normalize_tier(user)
    # Pydantic model attrs first (UserOut doesn't have tier today · returns None)
    for attr in ("tier", "plan_tier", "plan"):
        v = getattr(user, attr, None)
        if v:
            return _normalize_tier(v)
    # dict-like fallback
    if isinstance(user, dict):
        for k in ("tier", "plan_tier", "plan"):
            if user.get(k):
                return _normalize_tier(user[k])
    return "free"


def resolve_features_from_tier(user_or_tier: Union[str, Any, None]) -> List[str]:
    """Returns features implicitly granted by tier (with inheritance).

    Accepts a string tier ('free'|'pro'|'enterprise') OR a user object/dict.
    Returns deduplicated list. Defaults to free-tier features on unknown tier.
    """
    tier = _normalize_tier(user_or_tier) if isinstance(user_or_tier, str) else _extract_tier_from_user(user_or_tier)
    seen: List[str] = []
    for t in _TIER_INHERITANCE.get(tier, ["free"]):
        for key in TIER_TO_FEATURES.get(t, []):
            if key not in seen:
                seen.append(key)
    return seen


async def merge_legacy_with_flags(db, user_id: str, tenant_id: str) -> List[str]:
    """UNION explicit-grants (tenant_features collection) ∪ implicit-tier features.

    Flow:
      1. Query feature_flags_engine.get_tenant_flags(db, tenant_id)
      2. Derive tier vía most-permissive plan_tier of active flags
         (using feature_gate_engine.derive_user_tier · lazy import circular-safe)
      3. resolve_features_from_tier(tier) → implicit features
      4. UNION (active explicit keys + implicit) · ordered stable

    FAIL-OPEN: cualquier excepción → [] (caller / frontend interpreta como "show all").
    """
    if db is None:
        _log.warning("[legacy_adapter] db=None · FAIL-OPEN []")
        return []
    try:
        flags = await ff.get_tenant_flags(db, tenant_id)
        # Lazy import to avoid circular feature_gate_engine ↔ legacy_adapter loop.
        from feature_gate_engine import derive_user_tier
        tier = derive_user_tier(flags)
        implicit = resolve_features_from_tier(tier)
        explicit = [k for k, d in flags.items() if ff._is_active(d)]
        # UNION preserving order: explicit first (user-customized), then implicit.
        seen: List[str] = []
        for k in explicit + implicit:
            if k not in seen:
                seen.append(k)
        return seen
    except Exception as exc:
        _log.warning(
            f"[legacy_adapter] merge failed tenant={tenant_id} err={exc} · FAIL-OPEN []"
        )
        return []
