"""W2.1 SA2 — Data Sources Hub Routes.

Prefix: /api/superadmin/data-hub · all require_superadmin.
Provides unified status / retry / replay over the 11 external connectors registered
in `connector_registry.py`.

NOTE: Does NOT replace the existing /api/superadmin/data-sources (IE Engine routes).
This is a parallel hub focused on status + retry + replay only.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, Literal, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

import connector_registry as creg

log = logging.getLogger("dmx.routes_superadmin_data_hub")

router = APIRouter(tags=["superadmin_data_hub"])
PREFIX = "/api/superadmin/data-hub"


def _db(request: Request):
    return request.app.state.db


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _require_superadmin(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    if user.role != "superadmin":
        raise HTTPException(403, "Solo superadmin")
    return user


# ─── Schemas ──────────────────────────────────────────────────────────────────

class ReplayBody(BaseModel):
    from_ts: str
    to_ts: str


# ─── Helpers ──────────────────────────────────────────────────────────────────

async def _build_connector_summary(db, meta: Dict[str, Any]) -> Dict[str, Any]:
    cid = meta["id"]
    agg = await creg.aggregate_24h(db, cid)
    status = await creg.compute_status(db, cid, agg)
    return {
        "id": cid,
        "name": meta["name"],
        "category": meta["category"],
        "icon_key": meta["icon_key"],
        "required_env": meta.get("required_env") or [],
        "env_present": creg.env_present(cid),
        "supports_retry": meta.get("supports_retry", False),
        "supports_replay": meta.get("supports_replay", False),
        "status": status,
        **agg,
    }


# ─── 1) GET /connectors ───────────────────────────────────────────────────────

@router.get(PREFIX + "/connectors")
async def list_connectors(request: Request):
    await _require_superadmin(request)
    db = _db(request)
    items = []
    for meta in creg.get_catalog():
        try:
            items.append(await _build_connector_summary(db, meta))
        except Exception as e:
            log.warning(f"[data-hub] summary failed for {meta['id']}: {e}")
            items.append({**meta, "status": "failed", "error": str(e)[:200]})
    counts = {
        "total": len(items),
        "ok": sum(1 for i in items if i.get("status") == "ok"),
        "degraded": sum(1 for i in items if i.get("status") == "degraded"),
        "failed": sum(1 for i in items if i.get("status") == "failed"),
        "stub": sum(1 for i in items if i.get("status") == "stub"),
    }
    return {"items": items, "counts": counts, "ts": _now_iso()}


# ─── 2) GET /connectors/{id} ──────────────────────────────────────────────────

@router.get(PREFIX + "/connectors/{connector_id}")
async def get_connector(connector_id: str, request: Request):
    await _require_superadmin(request)
    db = _db(request)
    meta = creg.get_meta(connector_id)
    if not meta:
        raise HTTPException(404, "Connector desconocido")
    summary = await _build_connector_summary(db, meta)

    # Last 50 invocations
    inv_cursor = db.connector_invocations.find(
        {"connector_id": connector_id}, {"_id": 0},
    ).sort("ts", -1).limit(50)
    invocations = [d async for d in inv_cursor]

    # Last 20 audit_log entries (entity_type=connector AND entity_id=connector_id OR actor.source=connector:{id})
    audit_cursor = db.audit_log.find(
        {"$or": [
            {"entity_type": "connector", "entity_id": connector_id},
            {"actor.source": f"connector:{connector_id}"},
        ]},
        {"_id": 0},
    ).sort("ts", -1).limit(20)
    audits = [d async for d in audit_cursor]

    return {
        "connector": summary,
        "invocations": invocations,
        "audit_log": audits,
    }


# ─── 3) POST /connectors/{id}/test ────────────────────────────────────────────

@router.post(PREFIX + "/connectors/{connector_id}/test")
async def test_connector(connector_id: str, request: Request):
    user = await _require_superadmin(request)
    db = _db(request)
    meta = creg.get_meta(connector_id)
    if not meta:
        raise HTTPException(404, "Connector desconocido")

    result = await creg.run_healthcheck(db, connector_id)

    # Audit
    try:
        from audit_log import log_mutation
        await log_mutation(
            db, user, "test", "connector", connector_id,
            before=None, after={"ok": result.get("ok"), "latency_ms": result.get("latency_ms")},
            request=request,
        )
    except Exception as _e:
        log.warning("[audit] log_mutation perdido (test connector %s): %s", connector_id, _e)
    return result


# ─── 4) POST /connectors/{id}/retry ───────────────────────────────────────────

@router.post(PREFIX + "/connectors/{connector_id}/retry")
async def retry_connector_route(connector_id: str, request: Request):
    user = await _require_superadmin(request)
    db = _db(request)
    meta = creg.get_meta(connector_id)
    if not meta:
        raise HTTPException(404, "Connector desconocido")
    if not meta.get("supports_retry"):
        raise HTTPException(409, "Connector no soporta retry")

    try:
        result = await creg.retry_connector(db, connector_id)
    except ValueError as e:
        raise HTTPException(409, str(e)) from e
    except Exception as e:
        raise HTTPException(500, f"Error al reintentar: {e}") from e

    try:
        from audit_log import log_mutation
        await log_mutation(
            db, user, "retry", "connector", connector_id,
            before=None, after={"retry_ok": (result.get("retry_result") or {}).get("ok")},
            request=request,
        )
    except Exception as _e:
        log.warning("[audit] log_mutation perdido (retry connector %s): %s", connector_id, _e)
    return result


# ─── 5) POST /connectors/{id}/replay ──────────────────────────────────────────

@router.post(PREFIX + "/connectors/{connector_id}/replay")
async def replay_connector_route(connector_id: str, body: ReplayBody, request: Request):
    user = await _require_superadmin(request)
    db = _db(request)
    meta = creg.get_meta(connector_id)
    if not meta:
        raise HTTPException(404, "Connector desconocido")
    if not meta.get("supports_replay"):
        raise HTTPException(409, "Connector no soporta replay")
    try:
        result = await creg.replay_range(db, connector_id, body.from_ts, body.to_ts)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except Exception as e:
        raise HTTPException(500, f"Error en replay: {e}") from e

    try:
        from audit_log import log_mutation
        await log_mutation(
            db, user, "replay", "connector", connector_id,
            before=None,
            after={"total": result.get("total"), "succeeded": result.get("succeeded"),
                   "failed_again": result.get("failed_again"),
                   "from_ts": body.from_ts, "to_ts": body.to_ts},
            request=request,
        )
    except Exception as _e:
        log.warning("[audit] log_mutation perdido (replay connector %s): %s", connector_id, _e)
    return result


# ─── 6) GET /connectors/{id}/invocations ──────────────────────────────────────

@router.get(PREFIX + "/connectors/{connector_id}/invocations")
async def list_invocations(
    connector_id: str,
    request: Request,
    status: Optional[Literal["ok", "fail"]] = None,
    from_ts: Optional[str] = None,
    to_ts: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
    skip: int = Query(0, ge=0),
):
    await _require_superadmin(request)
    db = _db(request)
    meta = creg.get_meta(connector_id)
    if not meta:
        raise HTTPException(404, "Connector desconocido")

    q: Dict[str, Any] = {"connector_id": connector_id}
    if status:
        q["status"] = status
    ts_q: Dict[str, Any] = {}
    if from_ts:
        ts_q["$gte"] = from_ts
    if to_ts:
        ts_q["$lte"] = to_ts
    if ts_q:
        q["ts"] = ts_q

    total = await db.connector_invocations.count_documents(q)
    cursor = db.connector_invocations.find(q, {"_id": 0}).sort("ts", -1).skip(skip).limit(limit)
    items = [d async for d in cursor]
    return {"items": items, "total": total, "skip": skip, "limit": limit}


# ─── Cron registration ────────────────────────────────────────────────────────

def schedule_data_hub_healthcheck(scheduler, db) -> None:
    """Register the 10-min healthcheck-all cron with cron_heartbeat instrumentation."""
    try:
        from cron_heartbeat import wrap_apscheduler_job
        scheduler.add_job(
            wrap_apscheduler_job(creg.healthcheck_all_connectors, "data_hub_healthcheck_all"),
            "interval", minutes=10,
            args=[db], id="data_hub_healthcheck_all", replace_existing=True,
            misfire_grace_time=180,
        )
    except Exception as e:
        log.warning(f"[data-hub] schedule healthcheck cron failed: {e}")
