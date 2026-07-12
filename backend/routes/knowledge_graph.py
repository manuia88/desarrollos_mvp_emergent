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
from typing import Any, Dict, List, Optional

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
        log.exception("[KG stats] count failed")
        raise HTTPException(500, "Error interno al procesar la consulta")

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
        log.exception("[KG query] execution failed")
        raise HTTPException(500, "Error interno al procesar la consulta")

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


# ─── GET /trigger-rebuild ────────────────────────────────────────────────────

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


# ─── GET /templates (W5.12 P2) ───────────────────────────────────────────────

@router.get("/api/superadmin/kg/templates")
async def kg_templates(request: Request) -> Dict[str, Any]:
    await _auth_superadmin(request)
    from kg_template_registry import list_templates
    tpls = list_templates()
    return {"templates": tpls, "count": len(tpls)}


# ─── GET /subgraph (W5.12 P2) ────────────────────────────────────────────────

@router.get("/api/superadmin/kg/subgraph")
async def kg_subgraph(
    request: Request,
    node_id: str,
    node_type: Optional[str] = None,
    depth: int = 1,
) -> Dict[str, Any]:
    user = await _auth_superadmin(request)
    db = _db(request)
    from knowledge_graph_engine import KG_AVAILABLE, KGDriver, NODE_TYPES
    import re as _re

    if not _re.match(r"^[A-Za-z0-9_\-]{1,80}$", node_id or ""):
        raise HTTPException(422, "node_id invalido")
    if node_type and node_type not in NODE_TYPES:
        raise HTTPException(422, f"node_type debe ser uno de {NODE_TYPES}")
    depth = max(1, min(3, depth))

    if not KG_AVAILABLE:
        await _audit_route(db, user, "kg_subgraph", {"node_id": node_id, "depth": depth, "fallback": True})
        raise HTTPException(503, detail={"fallback": "use_relational_sql", "reason": "KG no disponible"})

    # Cap a 200 nodos. Cypher con LIMIT en el path expansion.
    label_filter = f":{node_type}" if node_type else ""
    cypher = f"""
    MATCH (n{label_filter} {{id: $node_id}})
    OPTIONAL MATCH path = (n)-[*1..{depth}]-(m)
    WITH n, collect(DISTINCT nodes(path)) AS node_paths, collect(DISTINCT relationships(path)) AS rel_paths
    WITH n,
         apoc.coll.toSet(reduce(acc = [], np IN node_paths | acc + np)) AS all_nodes,
         apoc.coll.toSet(reduce(acc = [], rp IN rel_paths | acc + rp)) AS all_rels
    RETURN n, all_nodes, all_rels
    """
    # Fallback sin APOC si no esta disponible
    cypher_fallback = f"""
    MATCH (n{label_filter} {{id: $node_id}})
    OPTIONAL MATCH path = (n)-[*1..{depth}]-(m)
    WITH n, collect(DISTINCT m) AS connected, collect(DISTINCT relationships(path)) AS rels
    RETURN n, connected, rels
    """
    drv = await KGDriver.get()
    try:
        try:
            rows = await drv.run(cypher, {"node_id": node_id}, retries=1)
        except Exception:
            rows = await drv.run(cypher_fallback, {"node_id": node_id}, retries=1)
    except Exception as exc:
        await _audit_route(db, user, "kg_subgraph", {"node_id": node_id, "error": str(exc)[:200]})
        log.exception("[KG subgraph] query failed")
        raise HTTPException(500, "Error interno al procesar la consulta")

    nodes_out: List[Dict[str, Any]] = []
    edges_out: List[Dict[str, Any]] = []
    seen_nodes: set = set()
    seen_edges: set = set()

    def _add_node(neo_node):
        if neo_node is None:
            return
        nid = neo_node.get("id") or neo_node.get("slug") or str(id(neo_node))
        if nid in seen_nodes:
            return
        seen_nodes.add(nid)
        labels = list(getattr(neo_node, "labels", []) or [])
        ntype = labels[0] if labels else (neo_node.get("__type__") or "Unknown")
        label = neo_node.get("name") or neo_node.get("slug") or neo_node.get("id") or nid
        props = {k: v for k, v in dict(neo_node).items() if not k.startswith("_")}
        nodes_out.append({"id": nid, "type": ntype, "label": label, "props": props})

    def _add_edge(rel):
        if rel is None:
            return
        try:
            etype = rel.type
            sn = rel.start_node
            en = rel.end_node
        except Exception:
            return
        if sn is None or en is None:
            return
        a = sn.get("id") or sn.get("slug")
        b = en.get("id") or en.get("slug")
        if not a or not b:
            return
        key = f"{a}|{etype}|{b}"
        if key in seen_edges:
            return
        seen_edges.add(key)
        _add_node(sn)
        _add_node(en)
        edges_out.append({"from": a, "to": b, "type": etype})
        if len(nodes_out) >= 200:
            return

    truncated = False
    for r in rows:
        seed = r.get("n")
        _add_node(seed)
        connected = r.get("all_nodes") or r.get("connected") or []
        rels = r.get("all_rels") or r.get("rels") or []
        # rels puede venir anidado (lista de listas) en fallback
        flat_rels = []
        for el in rels:
            if isinstance(el, list):
                flat_rels.extend(el)
            else:
                flat_rels.append(el)
        for nd in connected:
            if nd is None:
                continue
            _add_node(nd)
            if len(nodes_out) >= 200:
                truncated = True
                break
        for re_ in flat_rels:
            _add_edge(re_)
            if len(nodes_out) >= 200:
                truncated = True
                break

    payload_audit = {"node_id": node_id, "depth": depth, "nodes": len(nodes_out), "edges": len(edges_out), "truncated": truncated}
    await _audit_route(db, user, "kg_subgraph", payload_audit)

    return {
        "seed": {"id": node_id, "type": node_type},
        "depth": depth,
        "nodes": nodes_out,
        "edges": edges_out,
        "truncated": truncated,
        "cap": 200,
    }


# ─── GET /anomalies (W5.12 P2) ───────────────────────────────────────────────

@router.get("/api/superadmin/kg/anomalies")
async def kg_anomalies(
    request: Request,
    severity: Optional[str] = None,
    type: Optional[str] = None,  # noqa: A002 (shadows builtin)
    limit: int = 50,
    skip: int = 0,
) -> Dict[str, Any]:
    user = await _auth_superadmin(request)
    db = _db(request)
    limit = min(max(limit, 1), 500)
    query: Dict[str, Any] = {}
    if severity and severity in ("high", "medium", "low"):
        query["severity"] = severity
    if type:
        query["type"] = type

    rows: List[Dict[str, Any]] = []
    cursor = db.kg_anomalies.find(query, {"_id": 0}).sort("detected_at", -1).skip(skip).limit(limit)
    async for doc in cursor:
        rows.append(doc)
    total = await db.kg_anomalies.count_documents(query)

    await _audit_route(db, user, "kg_anomalies_query", {"filters": query, "count": len(rows)})
    return {"anomalies": rows, "count": len(rows), "total": total, "limit": limit, "skip": skip}


# ─── POST /trigger-anomaly (W5.12 P2) ────────────────────────────────────────

@router.post("/api/superadmin/kg/trigger-anomaly")
async def kg_trigger_anomaly(request: Request) -> Dict[str, Any]:
    user = await _auth_superadmin(request)
    db = _db(request)
    from kg_anomaly_detector import run_anomaly_detection
    summary = await run_anomaly_detection(db)
    await _audit_route(db, user, "kg_trigger_anomaly", {"detected": summary.get("detected"), "duration_s": summary.get("duration_s")})
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

# W5.FF4 register_feature marker · NO duplicate
from feature_registry import register_feature as _w5ff4_register_feature
_w5ff4_register_feature("knowledge_graph_view", plan_tier="enterprise", monthly_price_mxn=499, category="intelligence", name="Knowledge Graph")
