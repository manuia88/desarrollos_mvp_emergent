"""W5.12 Parte 1 — Knowledge Graph routes (4 endpoints superadmin only).

Endpoints:
  GET  /api/superadmin/kg/health
  GET  /api/superadmin/kg/stats
  POST /api/superadmin/kg/query           body: {template, params}
  POST /api/superadmin/kg/trigger-rebuild
"""
from __future__ import annotations

import logging
import time
from typing import Any, Dict

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

log = logging.getLogger("dmx.kg.routes")
router = APIRouter(tags=["knowledge-graph"])


def _db(request: Request):
    return request.app.state.db


async def _auth_superadmin(request: Request):
    from permissions import require_superadmin
    return await require_superadmin(request)


# ─── GET /health ─────────────────────────────────────────────────────────────

@router.get("/api/superadmin/kg/health")
async def kg_health(request: Request) -> Dict[str, Any]:
    await _auth_superadmin(request)
    from knowledge_graph_engine import health_check, KG_AVAILABLE
    result = await health_check()
    result["kg_available"] = KG_AVAILABLE
    return result


# ─── GET /stats ──────────────────────────────────────────────────────────────

@router.get("/api/superadmin/kg/stats")
async def kg_stats(request: Request) -> Dict[str, Any]:
    user = await _auth_superadmin(request)
    db = _db(request)
    from knowledge_graph_engine import KG_AVAILABLE, KGDriver, NODE_TYPES, EDGE_TYPES

    if not KG_AVAILABLE:
        # Audit
        await _audit_route(db, user, "kg_stats", {"status": "fallback"})
        raise HTTPException(503, detail={
            "fallback": "use_relational_sql",
            "reason": "KG no disponible",
            "kg_available": False,
        })

    drv = await KGDriver.get()
    nodes: Dict[str, int] = {}
    edges: Dict[str, int] = {}
    try:
        for nt in NODE_TYPES:
            rows = await drv.run(f"MATCH (n:{nt}) RETURN count(n) AS n", retries=1)
            nodes[nt] = int((rows[0].get("n") if rows else 0) or 0)
        for et in EDGE_TYPES:
            rows = await drv.run(f"MATCH ()-[r:{et}]->() RETURN count(r) AS n", retries=1)
            edges[et] = int((rows[0].get("n") if rows else 0) or 0)
    except Exception as exc:
        log.warning(f"[KG stats] count failed: {exc}")
        raise HTTPException(500, f"Error contando nodos/edges: {exc}")

    # last_rebuild + queries_24h desde audit_immutable
    last_rebuild = None
    queries_24h = 0
    avg_latency_ms = None
    try:
        last_rb = await db.audit_immutable.find_one(
            {"action": "kg_rebuild"}, {"_id": 0, "timestamp": 1, "after_state": 1},
            sort=[("timestamp", -1)],
        )
        if last_rb:
            last_rebuild = {
                "timestamp": last_rb.get("timestamp"),
                "summary": last_rb.get("after_state"),
            }
        from datetime import datetime, timezone, timedelta
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
        latencies = []
        async for q in db.audit_immutable.find(
            {"action": "kg_query", "timestamp": {"$gte": cutoff}},
            {"_id": 0, "after_state": 1},
        ).limit(2000):
            queries_24h += 1
            after = q.get("after_state") or {}
            lat = after.get("latency_ms")
            if isinstance(lat, (int, float)):
                latencies.append(lat)
        if latencies:
            avg_latency_ms = round(sum(latencies) / len(latencies), 2)
    except Exception as exc:
        log.warning(f"[KG stats] audit lookup failed: {exc}")

    response = {
        "kg_available": True,
        "nodes": nodes,
        "edges": edges,
        "total_nodes": sum(nodes.values()),
        "total_edges": sum(edges.values()),
        "last_rebuild": last_rebuild,
        "queries_24h": queries_24h,
        "avg_latency_ms": avg_latency_ms,
    }
    await _audit_route(db, user, "kg_stats", {"total_nodes": response["total_nodes"], "total_edges": response["total_edges"]})
    return response


# ─── POST /query ─────────────────────────────────────────────────────────────

class KGQueryBody(BaseModel):
    template: str = Field(..., min_length=1, max_length=80)
    params: Dict[str, Any] = Field(default_factory=dict)


@router.post("/api/superadmin/kg/query")
async def kg_query(payload: KGQueryBody, request: Request) -> Dict[str, Any]:
    user = await _auth_superadmin(request)
    db = _db(request)
    from knowledge_graph_engine import KG_AVAILABLE, KGDriver
    from kg_template_registry import TEMPLATES, validate_params, get_cypher

    if payload.template not in TEMPLATES:
        raise HTTPException(422, "Template no encontrado: usa GET /api/superadmin/kg/stats para listar")

    ok, errors, norm_params = validate_params(payload.template, payload.params or {})
    if not ok:
        raise HTTPException(422, {"errors": errors})

    if not KG_AVAILABLE:
        await _audit_route(db, user, "kg_query", {
            "template": payload.template, "params": norm_params, "fallback": True,
        })
        raise HTTPException(503, detail={
            "fallback": "use_relational_sql",
            "reason": "KG no disponible",
            "template": payload.template,
        })

    cypher = get_cypher(payload.template)
    started = time.perf_counter()
    try:
        drv = await KGDriver.get()
        rows = await drv.run(cypher, norm_params, retries=2)
    except Exception as exc:
        await _audit_route(db, user, "kg_query", {
            "template": payload.template, "params": norm_params,
            "error": str(exc)[:200], "latency_ms": (time.perf_counter() - started) * 1000,
        })
        raise HTTPException(500, f"Error ejecutando query: {exc}")

    latency_ms = round((time.perf_counter() - started) * 1000, 2)
    await _audit_route(db, user, "kg_query", {
        "template": payload.template,
        "params": norm_params,
        "result_count": len(rows),
        "latency_ms": latency_ms,
    })
    return {
        "template_used": payload.template,
        "rows": rows,
        "count": len(rows),
        "latency_ms": latency_ms,
    }


# ─── POST /trigger-rebuild ────────────────────────────────────────────────────

@router.post("/api/superadmin/kg/trigger-rebuild")
async def kg_trigger_rebuild(request: Request) -> Dict[str, Any]:
    user = await _auth_superadmin(request)
    db = _db(request)
    from knowledge_graph_engine import KG_AVAILABLE
    if not KG_AVAILABLE:
        await _audit_route(db, user, "kg_trigger_rebuild", {"status": "fallback"})
        raise HTTPException(503, detail={"fallback": "use_relational_sql", "reason": "KG no disponible"})

    from kg_etl import rebuild_full
    summary = await rebuild_full(db)
    await _audit_route(db, user, "kg_trigger_rebuild", {"summary_keys": list(summary.keys()), "duration_s": summary.get("duration_s")})
    return {"ok": True, "summary": summary}


# ─── Audit helper ────────────────────────────────────────────────────────────

async def _audit_route(db, user, action: str, payload: Dict[str, Any]) -> None:
    try:
        from audit_immutable_engine import log as audit_log
        actor = {
            "user_id": getattr(user, "user_id", "superadmin"),
            "role": getattr(user, "role", "superadmin"),
        }
        await audit_log(
            db, actor=actor, action=action,
            entity_type="kg", entity_id=action,
            before=None, after=payload,
        )
    except Exception as exc:
        log.warning(f"[KG audit] route audit log failed: {exc}")
