"""W4.1D — Comparable alerts endpoint.

GET /api/comparable-alerts/dev/{dev_id}
  Returns cached alerts from db.comparable_alerts (populated by 03:00 cron).
  Auth: dev_admin owner OR superadmin.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException, Request

log = logging.getLogger("dmx.comparable_alerts")

router = APIRouter(prefix="/api/comparable-alerts", tags=["comparable-alerts"])

# W4.1C++ tech-debt 2026-05-13: source-of-truth movido a backend/tenant_dev_map.py
from tenant_dev_map import get_allowed_dev_ids_sync as _legacy_lookup


def _tenant_allowed(tenant: str) -> Optional[List[str]]:
    """Compat wrapper · este endpoint NO usa wildcard (solo lista o None)."""
    rule = _legacy_lookup(tenant)
    return rule if isinstance(rule, list) else None

_SEVERITY_RANK = {"high": 0, "medium": 1, "low": 2}


def _db(req: Request):
    return req.app.state.db


async def _auth(req: Request):
    from server import get_current_user
    user = await get_current_user(req)
    if not user:
        raise HTTPException(401, "No autenticado")
    return user


def _check_owner_permission(user, dev_id: str, dev_developer_id: str) -> None:
    """Raise 403 if dev_admin does not own the dev."""
    if user.role == "superadmin":
        return
    if user.role not in ("developer_admin",):
        raise HTTPException(403, "Solo superadmin o developer_admin pueden ver alertas comparables.")
    tenant = getattr(user, "tenant_id", None) or getattr(user, "org_id", None) or ""
    allowed = _tenant_allowed(tenant)
    if allowed is not None:
        if dev_developer_id not in allowed:
            raise HTTPException(403, f"No tienes permiso para ver alertas de '{dev_id}'.")
    elif dev_developer_id != tenant:
        raise HTTPException(403, f"No tienes permiso para ver alertas de '{dev_id}'.")


@router.get("/dev/{dev_id}")
async def get_comparable_alerts(dev_id: str, request: Request) -> Dict[str, Any]:
    """Return comparable-anomaly alerts for a development, ordered by severity desc.

    Populated by the 03:00 MX cron. Empty array if cron hasn't run yet.
    """
    user = await _auth(request)
    db = _db(request)

    from data_developments import DEVELOPMENTS_BY_ID
    dev = DEVELOPMENTS_BY_ID.get(dev_id)
    if not dev:
        raise HTTPException(404, f"Desarrollo '{dev_id}' no encontrado.")

    _check_owner_permission(user, dev_id, dev.get("developer_id", ""))

    # Feature-flag Phase Y (toggle de superadmin funcional): comparable_alerts "off" → sin alertas.
    from routes.phase_y_controls import get_phase_y_settings
    _tenant = getattr(user, "tenant_id", None) or getattr(user, "org_id", None) or ""
    _phasey = await get_phase_y_settings(db, _tenant)
    if (_phasey.get("feature_tiers") or {}).get("comparable_alerts", "off") == "off":
        return {"dev_id": dev_id, "alerts": []}

    raw = await db.comparable_alerts.find(
        {"dev_id": dev_id},
        {"_id": 0},
    ).sort([("last_fired_at", -1)]).to_list(50)

    # Sort by severity rank
    raw.sort(key=lambda a: _SEVERITY_RANK.get(a.get("severity", "low"), 9))

    return {"dev_id": dev_id, "alerts": raw}
