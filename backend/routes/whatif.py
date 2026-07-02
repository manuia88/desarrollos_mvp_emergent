"""W4.4D — Phase Y.1D · What-if Simulator REST routes.

Prefijos:
  /api/whatif/...                → developer / inmobiliaria / advisor (own org)
  /api/superadmin/whatif/...     → superadmin

Rate limit: 30 simulate calls/min/user.
"""
from __future__ import annotations

import logging
import time
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from whatif_engine import (
    PhaseYDisabledError,
    WhatIfCapExceededError,
    WhatIfInputError,
    run_simulation,
)

log = logging.getLogger("dmx.routes_whatif")

WHATIF_ROLES = {"desarrollador", "inmobiliaria", "advisor", "developer_admin", "superadmin"}

# Rate limiter en-process: 30 simulate/min/user
_simulate_buckets: Dict[str, list] = defaultdict(list)


def _check_rate(buckets: Dict[str, list], key: str, limit: int, window_s: int) -> bool:
    now = time.monotonic()
    buckets[key] = [t for t in buckets[key] if now - t < window_s]
    if len(buckets[key]) >= limit:
        return False
    buckets[key].append(now)
    return True


async def _get_user(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    return user


async def _require_whatif_access(request: Request, target_org_id: Optional[str] = None):
    user = await _get_user(request)
    role = getattr(user, "role", "")
    if role not in WHATIF_ROLES:
        raise HTTPException(403, "Tu rol no tiene acceso al What-if Simulator")
    if target_org_id and role != "superadmin":
        tenant_id = getattr(user, "tenant_id", None)
        if tenant_id != target_org_id:
            raise HTTPException(403, "Acceso denegado a este recurso")
    return user


def _scenario_to_dict(doc: Dict[str, Any]) -> Dict[str, Any]:
    d = dict(doc)
    sid = d.pop("_id", None)
    if sid is not None:
        d["scenario_id"] = sid
    ts = d.get("created_at")
    if isinstance(ts, datetime):
        d["created_at"] = ts.isoformat()
    return d


# ─── Pydantic models ──────────────────────────────────────────────────────────
class SimulateIn(BaseModel):
    project_id: str
    scenario_type: str
    inputs: Dict[str, Any] = {}


# ─── Routers ──────────────────────────────────────────────────────────────────
router = APIRouter(prefix="/api/whatif", tags=["whatif"])
sa_router = APIRouter(prefix="/api/superadmin/whatif", tags=["whatif-admin"])


# POST /api/whatif/simulate ────────────────────────────────────────────────────
@router.post("/simulate", status_code=201)
async def simulate(body: SimulateIn, request: Request):
    user = await _require_whatif_access(request)
    user_id = getattr(user, "user_id", "unknown")
    org_id = getattr(user, "tenant_id", None)
    if not org_id:
        raise HTTPException(422, "user sin tenant_id")

    if not _check_rate(_simulate_buckets, user_id, 30, 60):
        raise HTTPException(429, "Límite de simulaciones alcanzado (30/min). Intenta en un momento.")

    if not body.project_id or not body.project_id.strip():
        raise HTTPException(422, "project_id es requerido")

    db = request.app.state.db
    try:
        result = await run_simulation(
            db, org_id=org_id, user_id=user_id,
            project_id=body.project_id.strip(),
            scenario_type=body.scenario_type,
            inputs=body.inputs or {},
            persist=True,
        )
    except PhaseYDisabledError as e:
        raise HTTPException(403, str(e))
    except WhatIfCapExceededError as e:
        raise HTTPException(429, str(e))
    except WhatIfInputError as e:
        raise HTTPException(422, str(e))
    except Exception as exc:
        log.error(f"[whatif] simulate error org={org_id}: {exc}")
        raise HTTPException(500, "Error interno del simulador. Intenta de nuevo.")

    return JSONResponse(result, status_code=201)


# GET /api/whatif/scenarios?project_id=... ────────────────────────────────────
@router.get("/scenarios")
async def list_scenarios(
    request: Request,
    project_id: Optional[str] = Query(None),
    scenario_type: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    user = await _require_whatif_access(request)
    org_id = getattr(user, "tenant_id", None)
    role = getattr(user, "role", "")
    db = request.app.state.db

    q: Dict[str, Any] = {"deleted": {"$ne": True}}
    if role != "superadmin":
        q["org_id"] = org_id
    if project_id:
        q["project_id"] = project_id
    if scenario_type:
        q["scenario_type"] = scenario_type

    docs = await db.whatif_scenarios.find(q).sort("created_at", -1).limit(limit).to_list(length=limit)
    return JSONResponse({"items": [_scenario_to_dict(d) for d in docs], "count": len(docs)})


# GET /api/whatif/scenarios/{scenario_id} ──────────────────────────────────────
@router.get("/scenarios/{scenario_id}")
async def get_scenario(scenario_id: str, request: Request):
    db = request.app.state.db
    doc = await db.whatif_scenarios.find_one({"_id": scenario_id, "deleted": {"$ne": True}})
    if not doc:
        raise HTTPException(404, "Escenario no encontrado")
    await _require_whatif_access(request, doc.get("org_id"))

    out = _scenario_to_dict(doc)
    # Inflate comparables_used: trae nombre/colonia de los developments referenciados
    comps = (out.get("outputs") or {}).get("comparables_used") or []
    if comps:
        try:
            from data_developments import DEVELOPMENTS_BY_ID
            out["comparables_inflated"] = [
                {
                    "id": cid,
                    "name": (DEVELOPMENTS_BY_ID.get(cid) or {}).get("name"),
                    "colonia": (DEVELOPMENTS_BY_ID.get(cid) or {}).get("colonia"),
                    "price_from": (DEVELOPMENTS_BY_ID.get(cid) or {}).get("price_from"),
                    "stage": (DEVELOPMENTS_BY_ID.get(cid) or {}).get("stage"),
                }
                for cid in comps
            ]
        except Exception:
            out["comparables_inflated"] = []
    else:
        out["comparables_inflated"] = []

    return JSONResponse(out)


# DELETE /api/whatif/scenarios/{scenario_id} — soft delete (DSR-compliant) ────
@router.delete("/scenarios/{scenario_id}")
async def delete_scenario(scenario_id: str, request: Request):
    db = request.app.state.db
    doc = await db.whatif_scenarios.find_one({"_id": scenario_id})
    if not doc:
        raise HTTPException(404, "Escenario no encontrado")
    await _require_whatif_access(request, doc.get("org_id"))

    await db.whatif_scenarios.update_one(
        {"_id": scenario_id},
        {"$set": {"deleted": True, "deleted_at": datetime.now(timezone.utc).isoformat()}},
    )
    return JSONResponse({"ok": True, "scenario_id": scenario_id, "status": "deleted"})


# ─── Superadmin usage ────────────────────────────────────────────────────────
@sa_router.get("/usage")
async def whatif_usage(
    request: Request,
    org_id: Optional[str] = Query(None),
    days: int = Query(30, ge=1, le=365),
):
    from permissions import require_superadmin
    await require_superadmin(request)
    db = request.app.state.db

    since = datetime.now(timezone.utc) - timedelta(days=days)
    q: Dict[str, Any] = {"created_at": {"$gte": since}, "deleted": {"$ne": True}}
    if org_id:
        q["org_id"] = org_id

    total = await db.whatif_scenarios.count_documents(q)

    by_type_pipe = [
        {"$match": q},
        {"$group": {"_id": "$scenario_type", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    by_type = [{"scenario_type": r["_id"], "count": r["count"]}
               async for r in db.whatif_scenarios.aggregate(by_type_pipe)]

    by_tier_pipe = [
        {"$match": q},
        {"$group": {"_id": "$simulated_at_tier", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    by_tier = [{"tier": r["_id"], "count": r["count"]}
               async for r in db.whatif_scenarios.aggregate(by_tier_pipe)]

    by_org_pipe = [
        {"$match": q},
        {"$group": {"_id": "$org_id", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 20},
    ]
    by_org = [{"org_id": r["_id"], "count": r["count"]}
              async for r in db.whatif_scenarios.aggregate(by_org_pipe)]

    return JSONResponse({
        "days": days,
        "org_id_filter": org_id,
        "total_simulations": total,
        "by_scenario_type": by_type,
        "by_tier": by_tier,
        "by_org": by_org,
    })
