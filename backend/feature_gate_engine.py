"""W5.FF1 Sub-A — Feature Gate Engine (defensiva).

Provides:
  - requires_feature(key, fallback_tier=None) → FastAPI dependency factory
      Usage: dependencies=[requires_feature("battle_card")]
      FAIL-OPEN si engine cae · audit log cada check · 403 si denied
  - get_user_features(db, user_id, tenant_id) → List[str]
      Delegates to feature_flags_engine.get_tenant_flags() (W2.4 SA5) · NO duplica lógica
      Cache in-memory TTL 60s · FAIL-OPEN ([]) si falla
  - derive_user_tier(flags) → "free"|"pro"|"enterprise"
      Helper para Sub-C aditivo · tier más permisivo entre flags activos

Defensa en profundidad (W5_FF_FEATURE_VISIBILITY_SPEC.md §1):
  - FAIL-OPEN siempre default · NUNCA cascada bloqueante (1.1)
  - Audit chain mandatory cada gate check (1.7)
"""
from __future__ import annotations

import logging
import time
from typing import Any, Dict, List, Optional, Tuple

from fastapi import Depends, HTTPException, Request

import feature_flags_engine as ff
from audit_immutable_engine import log as audit_log

_log = logging.getLogger("dmx.feature_gate_engine")

CACHE_TTL_SECONDS = 60
FAIL_OPEN_ENABLED = True

# (user_id, tenant_id) → {ts: monotonic, features: [keys]}
_user_cache: Dict[Tuple[str, str], Dict[str, Any]] = {}


# ─── Cache helpers ────────────────────────────────────────────────────────────
def _cache_get(user_id: str, tenant_id: str) -> Optional[List[str]]:
    e = _user_cache.get((user_id, tenant_id))
    if not e:
        return None
    if (time.monotonic() - e["ts"]) > CACHE_TTL_SECONDS:
        _user_cache.pop((user_id, tenant_id), None)
        return None
    return list(e["features"])


def _cache_set(user_id: str, tenant_id: str, features: List[str]) -> None:
    _user_cache[(user_id, tenant_id)] = {"ts": time.monotonic(), "features": list(features)}


def cache_invalidate(user_id: Optional[str] = None, tenant_id: Optional[str] = None) -> None:
    if user_id is None and tenant_id is None:
        _user_cache.clear()
        return
    keys = [
        k for k in list(_user_cache.keys())
        if (user_id is None or k[0] == user_id) and (tenant_id is None or k[1] == tenant_id)
    ]
    for k in keys:
        _user_cache.pop(k, None)


# ─── Public API ───────────────────────────────────────────────────────────────
async def get_user_features(db, user_id: str, tenant_id: str) -> List[str]:
    """Returns enabled feature_keys for the user.

    W5.FF2: UNION explicit grants (W2.4 SA5 tenant_features) + implicit tier
    features (legacy adapter). Backward compat: si adapter retorna [] (FAIL-OPEN),
    cae al path original W5.FF1 (solo explicit grants).
    FAIL-OPEN final: si todo falla → retorna [] (frontend interpreta como 'show all').
    """
    cached = _cache_get(user_id, tenant_id)
    if cached is not None:
        return cached
    # W5.FF2 primary path: adapter merge.
    try:
        from feature_legacy_adapter import merge_legacy_with_flags  # lazy circular-safe
        merged = await merge_legacy_with_flags(db, user_id, tenant_id)
        if merged:
            _cache_set(user_id, tenant_id, merged)
            return merged
        # adapter returned [] → fall through to W5.FF1 backward-compat path.
    except Exception as exc:
        _log.warning(
            f"[feature_gate] legacy adapter failed tenant={tenant_id} err={exc} · fallback W5.FF1 path"
        )

    # W5.FF1 backward-compat path: solo explicit grants.
    try:
        flags = await ff.get_tenant_flags(db, tenant_id)
        enabled = [k for k, d in flags.items() if ff._is_active(d)]
        _cache_set(user_id, tenant_id, enabled)
        return enabled
    except Exception as exc:
        _log.warning(
            f"[feature_gate] get_user_features failed tenant={tenant_id} err={exc} · FAIL-OPEN []"
        )
        return []


_TIER_ORDER = {"free": 0, "basic": 0, "pro": 1, "enterprise": 2}


def derive_user_tier(flags: Dict[str, Any]) -> str:
    """Most-permissive plan_tier across active flags. Defaults to 'free' si vacío."""
    tiers = [d.get("plan_tier") for d in flags.values()
             if isinstance(d, dict) and ff._is_active(d) and d.get("plan_tier")]
    if "enterprise" in tiers:
        return "enterprise"
    if "pro" in tiers:
        return "pro"
    return "free"


def _tier_meets(user_tier: str, required_tier: str) -> bool:
    return _TIER_ORDER.get((user_tier or "").lower(), 0) >= _TIER_ORDER.get((required_tier or "").lower(), 0)


# ─── Audit ────────────────────────────────────────────────────────────────────
async def _audit_check(
    db,
    actor: Dict[str, Any],
    feature_key: str,
    granted: bool,
    reason: str,
    request: Optional[Request] = None,
) -> None:
    """Best-effort audit log. NUNCA propaga excepción (no bloquea request)."""
    if db is None:
        return
    try:
        await audit_log(
            db,
            actor=actor,
            action="feature_gate_check",
            entity_type="feature_flag",
            entity_id=feature_key,
            before=None,
            after={"feature_key": feature_key, "granted": granted, "reason": reason},
            request=request,
        )
    except Exception as exc:
        _log.warning(f"[feature_gate] audit log failed (non-fatal): {exc}")


# ─── Dependency factory ───────────────────────────────────────────────────────
def requires_feature(feature_key: str, fallback_tier: Optional[str] = None):
    """FastAPI dependency factory · FAIL-OPEN gate.

    Usage:
        @router.get("/x", dependencies=[requires_feature("battle_card")])
        async def endpoint(): ...

    Reglas:
      - 401 si user no autenticado.
      - superadmin pasa siempre (audited reason='superadmin_bypass').
      - feature en catalog + active → permite (reason='enabled').
      - feature en catalog inactive + fallback_tier permitido por user_tier → permite
        (reason='legacy_tier'). Sin fallback o tier insuficiente → 403 (reason='denied').
      - feature NO en catalog + fallback_tier → check tier · si pasa, permite (reason='legacy_tier').
      - Engine lanza Exception → FAIL-OPEN permite (reason='fail_open') si FAIL_OPEN_ENABLED.
    """
    async def _dep(request: Request):
        from server import get_current_user  # lazy import (circular safe)

        user = await get_current_user(request)
        if not user:
            raise HTTPException(401, "No autenticado")

        actor = {
            "user_id": getattr(user, "user_id", "anon") or "anon",
            "role": getattr(user, "role", "") or "",
        }
        tenant_id = getattr(user, "tenant_id", None) or actor["user_id"]
        db = getattr(request.app.state, "db", None)

        if actor["role"] == "superadmin":
            await _audit_check(db, actor, feature_key, True, "superadmin_bypass", request)
            return user

        try:
            in_catalog = feature_key in ff._BY_KEY
            flags = await ff.get_tenant_flags(db, tenant_id) if db is not None else {}
            user_tier = derive_user_tier(flags)

            if in_catalog:
                doc = flags.get(feature_key)
                if doc and ff._is_active(doc):
                    await _audit_check(db, actor, feature_key, True, "enabled", request)
                    return user
                if fallback_tier and _tier_meets(user_tier, fallback_tier):
                    await _audit_check(db, actor, feature_key, True, "legacy_tier", request)
                    return user
                await _audit_check(db, actor, feature_key, False, "denied", request)
                raise HTTPException(403, f"Feature '{feature_key}' no habilitada")

            # NOT in catalog
            if fallback_tier:
                if _tier_meets(user_tier, fallback_tier):
                    await _audit_check(db, actor, feature_key, True, "legacy_tier", request)
                    return user
                await _audit_check(db, actor, feature_key, False, "denied", request)
                raise HTTPException(403, f"Feature '{feature_key}' requiere tier {fallback_tier}")

            if FAIL_OPEN_ENABLED:
                await _audit_check(db, actor, feature_key, True, "fail_open", request)
                return user
            raise HTTPException(403, f"Feature '{feature_key}' no reconocida")

        except HTTPException:
            raise
        except Exception as exc:
            _log.warning(
                f"[feature_gate] engine error feature={feature_key} err={exc} · FAIL-OPEN"
            )
            if FAIL_OPEN_ENABLED:
                await _audit_check(db, actor, feature_key, True, "fail_open", request)
                return user
            raise HTTPException(503, "Feature gate temporarily unavailable")

    return Depends(_dep)
