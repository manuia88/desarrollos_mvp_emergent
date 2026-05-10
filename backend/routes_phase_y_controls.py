"""W4.3 — Sub-Chunk A · Phase Y Settings endpoints.

Prefix: /api/superadmin/phase-y
Guards: superadmin para acceso global · developer_admin para su propio org_id.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, field_validator

log = logging.getLogger("dmx.phase_y_controls")

router = APIRouter(prefix="/api/superadmin/phase-y", tags=["phase-y-controls"])

# ─── Defaults ─────────────────────────────────────────────────────────────────
VALID_TIERS = {"off", "T1", "T2", "T3", "T4"}

DEFAULT_FEATURE_TIERS: Dict[str, str] = {
    "diagnostic_engine":     "T2",
    "recommendation_banner": "T3",
    "comparable_alerts":     "T3",
    "lead_nurture":          "T3",
    "pricing_agent":         "off",
    "marketing_agent":       "off",
    "lead_agent":            "off",
    "smart_routing_lead":    "off",
    "visit_prep_dossier":    "off",
    "reply_classifier":      "off",
    "construction_agent":    "off",
    "compliance_agent":      "off",
}


def _default_settings(org_id: str) -> Dict[str, Any]:
    return {
        "org_id": org_id,
        "agentic_enabled": False,
        "simulation_mode": False,
        "feature_tiers": dict(DEFAULT_FEATURE_TIERS),
        "updated_at": None,
        "updated_by": None,
    }


# ─── Reusable helper (para que features agentic respeten master switch) ────────
async def get_phase_y_settings(db, org_id: str) -> Dict[str, Any]:
    """Retorna settings Phase Y para org_id. Defaults si no existe doc."""
    doc = await db.phase_y_settings.find_one({"org_id": org_id}, {"_id": 0})
    if not doc:
        return _default_settings(org_id)
    # Asegura que feature_tiers tenga todas las keys (compatibilidad futura)
    tiers = doc.get("feature_tiers") or {}
    for k, v in DEFAULT_FEATURE_TIERS.items():
        if k not in tiers:
            tiers[k] = v
    doc["feature_tiers"] = tiers
    return doc


# ─── Auth helpers ──────────────────────────────────────────────────────────────
async def _resolve_user(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    return user


async def _require_access(request: Request, org_id: str):
    """superadmin siempre · developer_admin solo su propio org."""
    user = await _resolve_user(request)
    role = getattr(user, "role", "")
    if role == "superadmin":
        return user
    if role == "developer_admin":
        tenant_id = getattr(user, "tenant_id", None)
        if tenant_id and tenant_id == org_id:
            return user
        raise HTTPException(403, "Solo puedes acceder a tu propia organización")
    raise HTTPException(403, "Acceso restringido")


# ─── Pydantic models ───────────────────────────────────────────────────────────
class PatchPhaseYIn(BaseModel):
    agentic_enabled: Optional[bool] = None
    simulation_mode: Optional[bool] = None
    feature_tiers: Optional[Dict[str, str]] = None

    @field_validator("feature_tiers")
    @classmethod
    def validate_tiers(cls, v):
        if v is None:
            return v
        for key, val in v.items():
            if key not in DEFAULT_FEATURE_TIERS:
                raise ValueError(f"Feature desconocida: {key}")
            if val not in VALID_TIERS:
                raise ValueError(f"Tier inválido '{val}' para '{key}'")
        return v


class MasterSwitchIn(BaseModel):
    enabled: bool


# ─── Endpoints ────────────────────────────────────────────────────────────────
@router.get("/{org_id}")
async def get_settings(org_id: str, request: Request):
    """Retorna Phase Y settings. Crea defaults si no existe."""
    db = request.app.state.db
    await _require_access(request, org_id)
    settings = await get_phase_y_settings(db, org_id)
    return JSONResponse(settings)


@router.patch("/{org_id}")
async def patch_settings(org_id: str, body: PatchPhaseYIn, request: Request):
    """Actualiza parcialmente los settings. Audit log automático."""
    db = request.app.state.db
    user = await _require_access(request, org_id)

    before = await get_phase_y_settings(db, org_id)
    update: Dict[str, Any] = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": getattr(user, "user_id", "unknown"),
    }
    if body.agentic_enabled is not None:
        update["agentic_enabled"] = body.agentic_enabled
    if body.simulation_mode is not None:
        update["simulation_mode"] = body.simulation_mode
    if body.feature_tiers is not None:
        # Merge con tiers existentes (patch parcial de tiers también)
        merged = dict(before.get("feature_tiers") or DEFAULT_FEATURE_TIERS)
        merged.update(body.feature_tiers)
        update["feature_tiers"] = merged

    await db.phase_y_settings.update_one(
        {"org_id": org_id},
        {"$set": update},
        upsert=True,
    )

    after = await get_phase_y_settings(db, org_id)

    try:
        from audit_log import log_mutation
        await log_mutation(
            db, user, "update", "phase_y_settings",
            entity_id=org_id,
            before=before,
            after=after,
            request=request,
        )
    except Exception as exc:
        log.warning(f"[phase_y] audit log failed: {exc}")

    return JSONResponse(after)


@router.post("/{org_id}/master-switch")
async def toggle_master_switch(org_id: str, body: MasterSwitchIn, request: Request):
    """Kill switch global para features agentic del org."""
    db = request.app.state.db
    user = await _require_access(request, org_id)

    before = await get_phase_y_settings(db, org_id)
    now_iso = datetime.now(timezone.utc).isoformat()

    await db.phase_y_settings.update_one(
        {"org_id": org_id},
        {"$set": {
            "agentic_enabled": body.enabled,
            "updated_at": now_iso,
            "updated_by": getattr(user, "user_id", "unknown"),
        }},
        upsert=True,
    )

    try:
        from audit_log import log_mutation
        await log_mutation(
            db, user, "update", "phase_y_master_switch",
            entity_id=org_id,
            before={"agentic_enabled": before.get("agentic_enabled")},
            after={"agentic_enabled": body.enabled},
            request=request,
        )
    except Exception as exc:
        log.warning(f"[phase_y] audit log failed: {exc}")

    return JSONResponse({
        "ok": True,
        "org_id": org_id,
        "agentic_enabled": body.enabled,
        "updated_at": now_iso,
    })


async def ensure_indexes(db) -> None:
    """Índices para phase_y_settings."""
    try:
        await db.phase_y_settings.create_index("org_id", unique=True, name="idx_phase_y_org")
        await db.phase_y_settings.create_index("updated_at", name="idx_phase_y_updated")
        log.info("[phase_y] indexes OK")
    except Exception as exc:
        log.warning(f"[phase_y] ensure_indexes failed: {exc}")
