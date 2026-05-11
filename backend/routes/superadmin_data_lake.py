"""W2.7 Phase Z.0 — Data Lake routes.

Prefix: /api/superadmin/data-lake (auth required) + /api/data-lake/public/* (no auth).

Endpoints:
  GET  /etl-runs                — paginated runs list
  POST /etl/trigger             — manual run, audit
  GET  /coverage                — % zones with data per tier
  GET  /validation-metrics      — list runs filtered by model_name
  GET  /api/data-lake/public/validation — PUBLIC, used by /methodology page
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

import data_lake_etl as etl
import model_validation_engine as mve

log = logging.getLogger("dmx.routes_superadmin_data_lake")

router = APIRouter(tags=["superadmin_data_lake"])
PREFIX = "/api/superadmin/data-lake"
PUBLIC_PREFIX = "/api/data-lake/public"


def _db(request: Request):
    return request.app.state.db


async def _require_superadmin(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    if user.role != "superadmin":
        raise HTTPException(403, "Solo superadmin")
    return user


class TriggerBody(BaseModel):
    zones: Optional[List[str]] = None
    target_date: Optional[str] = None  # ISO date


# ─── 1) GET /etl-runs ─────────────────────────────────────────────────────────
@router.get(PREFIX + "/etl-runs")
async def list_etl_runs(
    request: Request,
    status: Optional[Literal["ok", "partial", "failed"]] = None,
    limit: int = Query(20, ge=1, le=200),
    skip: int = Query(0, ge=0),
):
    await _require_superadmin(request)
    db = _db(request)
    q: Dict[str, Any] = {}
    if status:
        q["status"] = status
    cur = db.etl_runs.find(q, {"_id": 0}).sort([("run_at", -1)]).skip(skip).limit(limit)
    items = [d async for d in cur]
    total = await db.etl_runs.count_documents(q)

    # 7d KPI tally
    seven_days_ago = datetime.now(timezone.utc).timestamp() - 7 * 86400
    ok_7d = 0
    total_7d = 0
    for it in items[:50]:
        try:
            ts = datetime.fromisoformat((it.get("run_at") or "").replace("Z", "+00:00"))
            if ts.timestamp() >= seven_days_ago:
                total_7d += 1
                if it.get("status") == "ok":
                    ok_7d += 1
        except Exception:
            pass

    last_run = items[0] if items else None
    return {"items": items, "total": total, "ok_7d": ok_7d, "total_7d": total_7d,
            "last_run": last_run}


# ─── 2) POST /etl/trigger ─────────────────────────────────────────────────────
@router.post(PREFIX + "/etl/trigger")
async def trigger_etl(body: TriggerBody, request: Request):
    user = await _require_superadmin(request)
    db = _db(request)
    target = None
    if body.target_date:
        try:
            target = datetime.fromisoformat(body.target_date.replace("Z", "+00:00"))
        except Exception:
            raise HTTPException(400, "target_date inválido (ISO 8601 requerido)")

    summary = await etl.run_daily_etl(
        db, target_date=target, run_type="manual",
        triggered_by=user.user_id,
    )
    # Also run validations after manual ETL
    try:
        val_summary = await mve.run_all_validations(db)
        summary["validation_summary"] = val_summary
    except Exception as e:
        summary["validation_error"] = str(e)[:120]

    try:
        from audit_log import log_mutation
        await log_mutation(
            db, user, "trigger", "data_lake_etl", summary["id"],
            before=None, after={"status": summary["status"],
                                "zones_processed": summary["zones_processed"]},
            request=request,
        )
    except Exception:
        pass
    return summary


# ─── 3) GET /coverage ─────────────────────────────────────────────────────────
@router.get(PREFIX + "/coverage")
async def coverage_route(
    request: Request,
    tier: Optional[Literal["city", "alcaldia", "colonia", "ageb", "development"]] = None,
    days: int = Query(7, ge=1, le=90),
):
    await _require_superadmin(request)
    db = _db(request)
    if tier:
        return await etl.coverage_per_tier(db, tier, days=days)
    out = []
    for t in ("city", "alcaldia", "colonia", "development"):
        out.append(await etl.coverage_per_tier(db, t, days=days))
    return {"items": out, "window_days": days}


# ─── 4) GET /validation-metrics ───────────────────────────────────────────────
@router.get(PREFIX + "/validation-metrics")
async def validation_metrics_route(
    request: Request,
    model_name: Optional[str] = None,
    limit: int = Query(50, ge=1, le=500),
):
    await _require_superadmin(request)
    db = _db(request)

    q: Dict[str, Any] = {}
    if model_name:
        q["model_name"] = model_name
    cur = db.model_validation_runs.find(q, {"_id": 0}).sort(
        [("run_at", -1)],
    ).limit(limit)
    items = [d async for d in cur]
    latest = await mve.latest_per_model(db)

    # Avg R² across registered models (validation health)
    r2_vals = [m.get("r_squared") for m in latest if m.get("r_squared") is not None]
    avg_r2 = round(sum(r2_vals) / len(r2_vals), 4) if r2_vals else None

    return {"items": items, "latest_per_model": latest,
            "avg_r_squared": avg_r2,
            "registered_models": list(mve.REGISTERED_MODELS)}


# ─── 4b) POST /validation/run-now (convenience for founder smoke test) ─────────
@router.post(PREFIX + "/validation/run-now")
async def run_validations_now(request: Request):
    user = await _require_superadmin(request)
    db = _db(request)
    summary = await mve.run_all_validations(db)
    try:
        from audit_log import log_mutation
        await log_mutation(
            db, user, "trigger", "model_validation", "manual",
            before=None, after=summary, request=request,
        )
    except Exception:
        pass
    return summary


# ─── 5) GET /api/data-lake/public/validation (NO AUTH) ────────────────────────
@router.get(PUBLIC_PREFIX + "/validation")
async def public_validation_route(request: Request):
    """Public methodology metrics. Used by /methodology page (Wave 3 ZZ.3).

    Exposes ONLY: model name, R², RMSE, MAPE, sample size, last_validated.
    NO internal data, NO predictions, NO source rows.
    """
    db = _db(request)
    latest = await mve.latest_per_model(db)
    out = []
    for m in latest:
        out.append({
            "name": m.get("model_name"),
            "r_squared_latest": m.get("r_squared"),
            "rmse_latest": m.get("rmse"),
            "mape_latest": m.get("mape"),
            "sample_size": m.get("sample_size"),
            "last_validated": m.get("run_at"),
            "validation_method": m.get("validation_method"),
            "training_window_days": m.get("training_window_days"),
        })
    return {
        "models": out,
        "computed_at": datetime.now(timezone.utc).isoformat(),
        "disclaimer": (
            "Métricas calculadas snapshot-vs-snapshot sobre datos públicos del cubo "
            "de métricas DesarrollosMX. Validación rigurosa siguiendo estándares "
            "estadísticos: R², RMSE, MAPE."
        ),
    }
