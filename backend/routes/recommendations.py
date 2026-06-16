"""W4.1C — Top-recommendation endpoint per developer_admin tenant.

GET /api/recommendations/top
  Auth: developer_admin only (403 for other roles).
  Logic:
    1. Resolve tenant → developer_ids via TENANT_DEV_MAP.
    2. For each development, call analyze_dev (6h cache).
    3. Collect findings with severity="high".
    4. Return the one with highest estimated_impact_pct.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request

log = logging.getLogger("dmx.recommendations")

router = APIRouter(prefix="/api/recommendations", tags=["recommendations"])

# W4.1C++ tech-debt 2026-05-13: source-of-truth movido a backend/tenant_dev_map.py
# Helper sync devuelve Union[str, List[str], None] · acá filtramos a List[str] (sin "*")
from tenant_dev_map import get_allowed_dev_ids_sync as _legacy_lookup


def _tenant_dev_map_get(tenant: str) -> Optional[List[str]]:
    """Compat wrapper · este endpoint NO soporta wildcard '*' (solo lista o None)."""
    rule = _legacy_lookup(tenant)
    if isinstance(rule, list):
        return rule
    return None  # "*" o None → conservative deny


def _db(req: Request):
    return req.app.state.db


async def _auth_dev_admin(req: Request):
    from server import get_current_user
    user = await get_current_user(req)
    if not user:
        raise HTTPException(401, "No autenticado")
    if user.role != "developer_admin":
        raise HTTPException(403, "Solo developer_admin puede acceder a recomendaciones.")
    return user


@router.get("/top")
async def get_top_recommendation(request: Request) -> Dict[str, Any]:
    """Return the single highest-impact HIGH-severity finding across all tenant projects.

    Response shapes:
      { has_recommendation: False }
      { has_recommendation: True, dev_id, dev_name, finding: {...}, rec_id }
    """
    user = await _auth_dev_admin(request)
    db = _db(request)

    tenant = getattr(user, "tenant_id", None) or getattr(user, "org_id", None) or ""
    allowed_dev_ids: Optional[List[str]] = _tenant_dev_map_get(tenant)

    # Feature-flag Phase Y (toggle de superadmin funcional): si recommendation_banner
    # está "off" para el tenant, no se muestra banner. Default T3 = on (no desactiva nada).
    from routes.phase_y_controls import get_phase_y_settings
    _phasey = await get_phase_y_settings(db, tenant)
    if (_phasey.get("feature_tiers") or {}).get("recommendation_banner", "off") == "off":
        return {"has_recommendation": False}

    from data_developments import DEVELOPMENTS_BY_ID, DEVELOPMENTS
    if allowed_dev_ids is not None:
        tenant_devs = [d for d in DEVELOPMENTS if d.get("developer_id") in allowed_dev_ids]
    else:
        # Unknown tenant → conservative: no access
        log.warning(f"[recommendations] tenant '{tenant}' not in TENANT_DEV_MAP, returning empty")
        return {"has_recommendation": False}

    if not tenant_devs:
        return {"has_recommendation": False}

    from diagnostic_engine import analyze_dev, DiagnosticReport

    best_impact: float = -1.0
    best_payload: Optional[Dict[str, Any]] = None

    for dev in tenant_devs:
        dev_id = dev["id"]
        try:
            report: DiagnosticReport = await analyze_dev(db, dev_id)
        except Exception as e:
            log.warning(f"[recommendations] analyze_dev({dev_id}) failed: {e}")
            continue

        for finding in report.findings:
            if finding.severity == "high" and finding.estimated_impact_pct > best_impact:
                best_impact = finding.estimated_impact_pct
                best_payload = {
                    "has_recommendation": True,
                    "dev_id": dev_id,
                    "dev_name": report.dev_name,
                    "finding": finding.to_dict(),
                    "rec_id": f"{dev_id}-{finding.rule_id}",
                    "summary_score": report.summary_score,
                }

    if best_payload is None:
        return {"has_recommendation": False}

    return best_payload
