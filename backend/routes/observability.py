"""W4.8 Y.5 — Observability + Replay Debugger + AI ROI per-Dev REST routes.

Superadmin endpoints (8) + Developer portal endpoints (2).

Phase Y guard: master_switch + tier observability_dashboard ≥ T1 para developer.
Superadmin always allowed (cross-org).
"""
from __future__ import annotations

import logging
import time
from typing import Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from agentic_crm.observability_engine import (
    AIROIPerDev,
    AuditReplay,
    MLAccuracy,
    ReplayDebugger,
    _check_observability_access,
)

log = logging.getLogger("dmx.routes_observability")

router = APIRouter(tags=["observability"])

OBS_ROLES = {
    "developer_admin", "developer_director", "developer_member",
    "inmobiliaria_admin", "inmobiliaria_director",
    "superadmin",
}

# In-process per-user rate limit · 30 calls/min
_obs_buckets: Dict[str, List[float]] = {}
OBS_USER_CAP = 30


def _check_rate(user_id: str) -> bool:
    now = time.monotonic()
    bucket = _obs_buckets.setdefault(user_id, [])
    _obs_buckets[user_id] = [t for t in bucket if now - t < 60]
    if len(_obs_buckets[user_id]) >= OBS_USER_CAP:
        return False
    _obs_buckets[user_id].append(now)
    return True


async def _get_user(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    return user


async def _require_superadmin(request: Request):
    user = await _get_user(request)
    if getattr(user, "role", "") != "superadmin":
        raise HTTPException(403, "Requiere rol superadmin")
    if not _check_rate(getattr(user, "user_id", "anon")):
        raise HTTPException(429, "Rate limit observability (30 calls/min)")
    return user


async def _require_dev_or_superadmin(request: Request, target_org: Optional[str] = None):
    user = await _get_user(request)
    role = getattr(user, "role", "")
    if role not in OBS_ROLES:
        raise HTTPException(403, "Rol no autorizado")
    if not _check_rate(getattr(user, "user_id", "anon")):
        raise HTTPException(429, "Rate limit observability (30 calls/min)")
    if role != "superadmin" and target_org:
        if getattr(user, "tenant_id", None) != target_org:
            raise HTTPException(403, "Cross-org acceso denegado")
    return user


# ═══════════════════════════════════════════════════════════════════════════════
# 1) AUDIT REPLAY (superadmin)
# ═══════════════════════════════════════════════════════════════════════════════
@router.get("/api/superadmin/observability/audit-replay")
async def audit_replay_timeline(
    request: Request,
    target_type: str = Query(..., pattern=r"^(lead|project|asesor|org)$"),
    target_id: str = Query(..., min_length=2, max_length=120),
    org_id: str = Query(..., min_length=2, max_length=120),
    days: int = Query(30, ge=1, le=180),
    limit: int = Query(500, ge=1, le=1000),
):
    """Timeline cronológica de actividad agentic en un target específico."""
    await _require_superadmin(request)
    db = request.app.state.db

    allowed, reason = await _check_observability_access(db, org_id)
    if not allowed and reason in ("master_switch_off",):
        raise HTTPException(503, f"Phase Y no habilitado para org {org_id}: {reason}")

    engine = AuditReplay(db)
    result = await engine.get_timeline(org_id, target_type, target_id, days=days, limit=limit)
    return JSONResponse(result)


# ═══════════════════════════════════════════════════════════════════════════════
# 2) ML ACCURACY (superadmin)
# ═══════════════════════════════════════════════════════════════════════════════
@router.get("/api/superadmin/observability/ml-accuracy")
async def ml_accuracy_endpoint(
    request: Request,
    feature: Optional[str] = Query(None),
    org_id: Optional[str] = Query(None),
    days: int = Query(30, ge=1, le=365),
):
    """Accuracy de un feature ML (o dashboard completo si feature=None)."""
    await _require_superadmin(request)
    db = request.app.state.db

    if org_id:
        allowed, reason = await _check_observability_access(db, org_id)
        if not allowed and reason == "master_switch_off":
            raise HTTPException(503, f"Phase Y master_switch off para {org_id}")

    engine = MLAccuracy(db)
    if feature:
        if feature not in MLAccuracy.FEATURES:
            raise HTTPException(
                422, f"feature inválido. Permitidos: {list(MLAccuracy.FEATURES)}",
            )
        result = await engine.compute_accuracy(feature, org_id=org_id, days=days)
    else:
        result = await engine.get_accuracy_dashboard(org_id=org_id, days=days)
    return JSONResponse(result)


# ═══════════════════════════════════════════════════════════════════════════════
# 3) REPLAY DEBUGGER (superadmin)
# ═══════════════════════════════════════════════════════════════════════════════
@router.get("/api/superadmin/observability/replay/list")
async def replay_list(
    request: Request,
    org_id: str = Query(..., min_length=2),
    days: int = Query(7, ge=1, le=30),
    limit: int = Query(100, ge=1, le=500),
):
    """Lista eventos replayables últimos N días."""
    await _require_superadmin(request)
    db = request.app.state.db
    engine = ReplayDebugger(db)
    result = await engine.list_replayable_events(org_id, days=days, limit=limit)
    return JSONResponse(result)


class ReplayIn(BaseModel):
    org_id: str = Field(..., min_length=2, max_length=120)
    event_type: str = Field(..., pattern=r"^(argumentario|smart_routing|visit_prep|disc|reply_classifier|nurture_sequence)$")


@router.post("/api/superadmin/observability/replay/{event_id}")
async def replay_event(event_id: str, body: ReplayIn, request: Request):
    """Re-ejecuta evento Phase Y en simulation_mode · NO afecta data real."""
    user = await _require_superadmin(request)
    db = request.app.state.db

    allowed, reason = await _check_observability_access(db, body.org_id)
    if not allowed and reason == "master_switch_off":
        raise HTTPException(503, f"Phase Y master_switch off para {body.org_id}")

    engine = ReplayDebugger(db)
    result = await engine.replay_event(
        body.org_id, event_id, body.event_type,
        actor_id=getattr(user, "user_id", None),
    )
    return JSONResponse(result)


# ═══════════════════════════════════════════════════════════════════════════════
# 4) AI ROI PER-DEV
# ═══════════════════════════════════════════════════════════════════════════════
@router.get("/api/dev/ai-roi")
async def dev_ai_roi(request: Request, days: int = Query(30, ge=1, le=180)):
    """Developer portal: ROI Phase Y de su propia org."""
    user = await _require_dev_or_superadmin(request)
    db = request.app.state.db
    role = getattr(user, "role", "")
    target_org = getattr(user, "tenant_id", None)
    if role == "superadmin":
        target_org = request.query_params.get("org_id") or target_org
    if not target_org:
        raise HTTPException(400, "tenant_id requerido")

    # Phase Y guard for self
    if role != "superadmin":
        allowed, reason = await _check_observability_access(db, target_org)
        if not allowed:
            raise HTTPException(
                403,
                f"Observability requiere tier T1+ y master switch ON. Estado: {reason}",
            )

    engine = AIROIPerDev(db)
    result = await engine.compute_dev_roi(target_org, days=days, persist=True)
    return JSONResponse(result)


@router.get("/api/superadmin/observability/ai-roi/matrix")
async def ai_roi_matrix(
    request: Request,
    days: int = Query(30, ge=1, le=180),
    tier: Optional[str] = Query(None),
    limit: int = Query(200, ge=1, le=500),
):
    """Cross-org matrix sorted por ROI ratio desc."""
    await _require_superadmin(request)
    db = request.app.state.db
    engine = AIROIPerDev(db)
    result = await engine.get_matrix(days=days, tier_filter=tier, limit=limit)
    return JSONResponse(result)


# ═══════════════════════════════════════════════════════════════════════════════
# DASHBOARD AGGREGATOR (superadmin · KPIs globales)
# ═══════════════════════════════════════════════════════════════════════════════
@router.get("/api/superadmin/observability/dashboard")
async def observability_dashboard(
    request: Request,
    days: int = Query(30, ge=1, le=180),
):
    """KPIs globales Phase Y: events totales · cost · top orgs por ROI."""
    await _require_superadmin(request)
    db = request.app.state.db

    # Total events últimos 30d (cross collection)
    from datetime import datetime, timedelta, timezone
    since = datetime.now(timezone.utc) - timedelta(days=days)
    counts: Dict[str, int] = {}
    try:
        counts["subagent_runs"] = await db.subagent_runs.count_documents(
            {"created_at": {"$gte": since}},
        )
    except Exception:
        counts["subagent_runs"] = 0
    try:
        counts["lead_routings"] = await db.lead_routings.count_documents(
            {"routed_at": {"$gte": since}},
        )
    except Exception:
        counts["lead_routings"] = 0
    try:
        counts["visit_prep_dossiers"] = await db.visit_prep_dossiers.count_documents(
            {"dossier_generated_at": {"$gte": since}},
        )
    except Exception:
        counts["visit_prep_dossiers"] = 0
    try:
        counts["email_replies"] = await db.email_replies.count_documents(
            {"received_at": {"$gte": since}},
        )
    except Exception:
        counts["email_replies"] = 0
    try:
        counts["argumentario_scripts"] = await db.argumentario_scripts.count_documents(
            {"generated_at": {"$gte": since.isoformat()}},
        )
    except Exception:
        counts["argumentario_scripts"] = 0
    try:
        counts["disc_profiles"] = await db.disc_profiles.count_documents(
            {"inferred_at": {"$gte": since}},
        )
    except Exception:
        counts["disc_profiles"] = 0
    try:
        counts["nurture_sequences"] = await db.nurture_sequences.count_documents(
            {"generated_at": {"$gte": since}},
        )
    except Exception:
        counts["nurture_sequences"] = 0
    try:
        counts["director_messages"] = await db.director_messages.count_documents(
            {"created_at": {"$gte": since}},
        )
    except Exception:
        counts["director_messages"] = 0

    # Top orgs by ROI
    matrix = await AIROIPerDev(db).get_matrix(days=days, limit=10)

    # Orgs with Phase Y enabled
    try:
        orgs_active = await db.phase_y_settings.count_documents(
            {"agentic_enabled": True},
        )
    except Exception:
        orgs_active = 0

    return JSONResponse({
        "ok": True,
        "days": days,
        "orgs_phase_y_active": orgs_active,
        "event_counts_period": counts,
        "total_events": sum(counts.values()),
        "top_orgs_by_roi": matrix.get("rows", [])[:10],
    })
