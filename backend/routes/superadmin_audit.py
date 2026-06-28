"""W2.2 SA3 — Superadmin Audit Log Viewer.

Cross-org timeline (NO scoping) with drill-down before/after, advanced filters,
streaming export CSV/JSON, entity timeline, and bulk-ingest enrichment that
closes the W1.5 inline-edits-history deferred panel.

Prefix: /api/superadmin/audit · all require_superadmin.
Does NOT modify the existing /api/audit/* scoped endpoints.
"""
from __future__ import annotations

import csv
import io
import json
import logging
import time
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

from audit_log import build_filter_query

log = logging.getLogger("dmx.routes_superadmin_audit")

router = APIRouter(tags=["superadmin_audit"])
PREFIX = "/api/superadmin/audit"

# In-memory caches (60s TTL) for distinct endpoints
_CACHE_TTL = 60
_actors_cache: Dict[str, Any] = {"ts": 0.0, "data": None}
_entity_types_cache: Dict[str, Any] = {"ts": 0.0, "data": None}

# Hard limit for export rows (matches spec)
EXPORT_MAX_ROWS = 10000


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


def _summarize(d: Optional[Dict[str, Any]], limit: int = 100) -> Optional[str]:
    if d is None:
        return None
    try:
        s = json.dumps(d, default=str, ensure_ascii=False)
    except Exception:
        s = str(d)
    return s[:limit] + ("…" if len(s) > limit else "")


def _filters_from_query(
    actor_user_id, actor_role, entity_type, entity_id, action,
    tenant_id, severity, from_ts, to_ts, q,
) -> Dict[str, Any]:
    return {
        "actor_user_id": actor_user_id,
        "actor_role": actor_role,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "action": action,
        "tenant_id": tenant_id,
        "severity": severity,
        "from_ts": from_ts,
        "to_ts": to_ts,
        "q": q,
    }


# ─── 1) GET /entries ──────────────────────────────────────────────────────────

@router.get(PREFIX + "/unified")
async def unified_audit_entries(request: Request, source: Optional[str] = None, entity_type: Optional[str] = None,
                                actor_user_id: Optional[str] = None, by_ai: Optional[bool] = None,
                                limit: int = 50, skip: int = 0):
    """Timeline UNIFICADO de los 3 portales: audit_log + developer_audit + lead_events + price_events +
    engagement_events, normalizado y mezclado por tiempo, tagueado por fuente. Cierra la fragmentación de trails."""
    await _require_superadmin(request)
    from unified_audit import unified_entries, SOURCE_NAMES
    data = await unified_entries(request.app.state.db, source=source, entity_type=entity_type,
                                 actor_user_id=actor_user_id, by_ai=by_ai, limit=min(limit, 200), skip=skip)
    data["available_sources"] = SOURCE_NAMES
    return data


@router.get(PREFIX + "/entries")
async def list_entries(
    request: Request,
    actor_user_id: Optional[str] = None,
    actor_role: Optional[str] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    action: Optional[str] = None,
    tenant_id: Optional[str] = None,
    severity: Optional[str] = None,
    from_ts: Optional[str] = None,
    to_ts: Optional[str] = None,
    q: Optional[str] = None,
    by_ai: Optional[bool] = None,   # B3: filtra acciones de IA/agente vs humano (None=todas)
    limit: int = Query(50, ge=1, le=200),
    skip: int = Query(0, ge=0),
):
    await _require_superadmin(request)
    db = _db(request)

    filters = _filters_from_query(actor_user_id, actor_role, entity_type, entity_id,
                                  action, tenant_id, severity, from_ts, to_ts, q)
    query = build_filter_query(filters)
    if by_ai is not None:
        query["actor.by_ai"] = by_ai   # B3: humano vs IA

    total = await db.audit_log.count_documents(query)
    cursor = db.audit_log.find(query, {"_id": 0}).sort("ts", -1).skip(skip).limit(limit)
    raw = [d async for d in cursor]

    items = []
    for it in raw:
        before = it.get("before")
        after = it.get("after")
        items.append({
            "id": it.get("id"),
            "ts": it.get("ts"),
            "action": it.get("action"),
            "entity_type": it.get("entity_type"),
            "entity_id": it.get("entity_id"),
            "actor": it.get("actor") or {},
            "severity": it.get("severity"),
            "before_summary": _summarize(before),
            "after_summary": _summarize(after),
            "has_diff": bool(before) or bool(after),
            "diff_keys": it.get("diff_keys") or [],
        })
    return {"total": total, "skip": skip, "limit": limit, "items": items}


# ─── 2) GET /entries/{entry_id} ──────────────────────────────────────────────

@router.get(PREFIX + "/entries/{entry_id}")
async def get_entry(entry_id: str, request: Request):
    await _require_superadmin(request)
    db = _db(request)
    entry = await db.audit_log.find_one({"id": entry_id}, {"_id": 0})
    if not entry:
        raise HTTPException(404, "Entrada no encontrada")

    enrichment: Dict[str, Any] = {}
    # Bulk-ingest enrichment — closes W1.5 deferred inline-edits history panel.
    if entry.get("entity_type") == "bulk_ingest_item" and entry.get("entity_id"):
        try:
            item = await db.bulk_ingest_items.find_one(
                {"id": entry["entity_id"]},
                {"_id": 0, "extracted": 1, "extracted_overrides": 1,
                 "extraction_history": 1, "decision": 1},
            )
        except Exception as e:
            log.warning(f"[audit] bulk_ingest enrichment failed: {e}")
            item = None
        if item:
            enrichment["bulk_ingest_item"] = {
                "decision": item.get("decision"),
                "ai_extracted": item.get("extracted") or {},
                "extracted_overrides": item.get("extracted_overrides") or [],
                "extraction_history": item.get("extraction_history") or [],
            }

    return {**entry, "enrichment": enrichment}


# ─── 3) GET /entity/{entity_type}/{entity_id}/timeline ───────────────────────

@router.get(PREFIX + "/entity/{entity_type}/{entity_id}/timeline")
async def entity_timeline(entity_type: str, entity_id: str, request: Request,
                          limit: int = Query(500, ge=1, le=500)):
    await _require_superadmin(request)
    db = _db(request)
    cursor = db.audit_log.find(
        {"entity_type": entity_type, "entity_id": entity_id},
        {"_id": 0},
    ).sort("ts", 1).limit(limit)
    items = [d async for d in cursor]
    return {
        "entity_type": entity_type,
        "entity_id": entity_id,
        "items": items,
        "total": len(items),
        "truncated": len(items) >= limit,
    }


# ─── 4) GET /export ───────────────────────────────────────────────────────────

@router.get(PREFIX + "/export")
async def export_entries(
    request: Request,
    format: str = Query("csv", pattern="^(csv|json)$"),
    actor_user_id: Optional[str] = None,
    actor_role: Optional[str] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    action: Optional[str] = None,
    tenant_id: Optional[str] = None,
    severity: Optional[str] = None,
    from_ts: Optional[str] = None,
    to_ts: Optional[str] = None,
    q: Optional[str] = None,
    by_ai: Optional[bool] = None,   # B3: exporta solo IA / solo humano / todas
):
    await _require_superadmin(request)
    db = _db(request)

    filters = _filters_from_query(actor_user_id, actor_role, entity_type, entity_id,
                                  action, tenant_id, severity, from_ts, to_ts, q)
    query = build_filter_query(filters)
    if by_ai is not None:
        query["actor.by_ai"] = by_ai

    total = await db.audit_log.count_documents(query)
    if total > EXPORT_MAX_ROWS:
        raise HTTPException(413, f"Demasiados registros ({total}). Filtra más estrictamente (máx {EXPORT_MAX_ROWS}).")

    cursor = db.audit_log.find(query, {"_id": 0}).sort("ts", -1).limit(EXPORT_MAX_ROWS)
    ts_str = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")

    if format == "json":
        async def _json_gen():
            yield "[\n"
            first = True
            async for doc in cursor:
                prefix = "" if first else ",\n"
                first = False
                yield prefix + json.dumps(doc, default=str, ensure_ascii=False)
            yield "\n]\n"
        return StreamingResponse(
            _json_gen(),
            media_type="application/json",
            headers={"Content-Disposition": f"attachment; filename=audit_export_{ts_str}.json"},
        )

    # CSV
    cols = ["ts", "action", "entity_type", "entity_id",
            "actor_user_id", "actor_role", "actor_by_ai", "actor_tenant",
            "severity", "before_json", "after_json"]

    async def _csv_gen():
        # Header
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(cols)
        yield buf.getvalue()
        async for d in cursor:
            actor = d.get("actor") or {}
            row = [
                d.get("ts") or "",
                d.get("action") or "",
                d.get("entity_type") or "",
                d.get("entity_id") or "",
                actor.get("user_id") or "",
                actor.get("role") or "",
                "IA" if actor.get("by_ai") else "humano",
                actor.get("tenant_id") or "",
                d.get("severity") or "",
                json.dumps(d.get("before"), default=str, ensure_ascii=False) if d.get("before") else "",
                json.dumps(d.get("after"), default=str, ensure_ascii=False) if d.get("after") else "",
            ]
            buf2 = io.StringIO()
            csv.writer(buf2).writerow(row)
            yield buf2.getvalue()

    return StreamingResponse(
        _csv_gen(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename=audit_export_{ts_str}.csv"},
    )


# ─── 5) GET /distinct/actors ──────────────────────────────────────────────────

@router.get(PREFIX + "/distinct/actors")
async def distinct_actors(request: Request):
    await _require_superadmin(request)
    db = _db(request)
    now = time.monotonic()
    if _actors_cache["data"] is not None and (now - _actors_cache["ts"]) < _CACHE_TTL:
        return {"items": _actors_cache["data"], "cached": True}

    pipeline = [
        {"$group": {
            "_id": "$actor.user_id",
            "count": {"$sum": 1},
            "last_seen": {"$max": "$ts"},
            "role": {"$last": "$actor.role"},
            "name": {"$last": "$actor.name"},
            "tenant_id": {"$last": "$actor.tenant_id"},
        }},
        {"$sort": {"last_seen": -1}},
        {"$limit": 200},
    ]
    items = []
    async for row in db.audit_log.aggregate(pipeline):
        if not row.get("_id"):
            continue
        items.append({
            "user_id": row["_id"],
            "name": row.get("name"),
            "role": row.get("role"),
            "tenant_id": row.get("tenant_id"),
            "count": row.get("count"),
            "last_seen": row.get("last_seen"),
        })
    _actors_cache["data"] = items
    _actors_cache["ts"] = now
    return {"items": items, "cached": False}


# ─── 6) GET /distinct/entity-types ────────────────────────────────────────────

@router.get(PREFIX + "/distinct/entity-types")
async def distinct_entity_types(request: Request):
    await _require_superadmin(request)
    db = _db(request)
    now = time.monotonic()
    if _entity_types_cache["data"] is not None and (now - _entity_types_cache["ts"]) < _CACHE_TTL:
        return {"items": _entity_types_cache["data"], "cached": True}

    pipeline = [
        {"$group": {"_id": "$entity_type", "count": {"$sum": 1},
                    "last_seen": {"$max": "$ts"}}},
        {"$sort": {"count": -1}},
        {"$limit": 100},
    ]
    items = []
    async for row in db.audit_log.aggregate(pipeline):
        if not row.get("_id"):
            continue
        items.append({
            "entity_type": row["_id"],
            "count": row.get("count"),
            "last_seen": row.get("last_seen"),
        })
    _entity_types_cache["data"] = items
    _entity_types_cache["ts"] = now
    return {"items": items, "cached": False}


# ─── 7) GET /stats — KPI strip helper ─────────────────────────────────────────

@router.get(PREFIX + "/stats")
async def audit_stats(request: Request):
    await _require_superadmin(request)
    db = _db(request)
    since = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    base = {"ts": {"$gte": since}}

    total_24h = await db.audit_log.count_documents(base)
    critical_24h = await db.audit_log.count_documents({**base, "severity": "critical"})

    mutation_actions = ["create", "update", "delete", "revert", "patch", "merge",
                        "approve", "reject", "force_match", "recompute"]
    mutations_24h = await db.audit_log.count_documents({**base, "action": {"$in": mutation_actions}})
    reads_24h = await db.audit_log.count_documents({**base, "action": "read"})

    return {
        "total_24h": total_24h,
        "critical_24h": critical_24h,
        "mutations_24h": mutations_24h,
        "reads_24h": reads_24h,
        "since": since,
    }


@router.get(PREFIX + "/ai-activity")
async def ai_activity(request: Request, days: int = Query(7, ge=1, le=90)):
    """D (B3): qué hizo la IA — actividad de agentes vs humanos. Consume actor.by_ai del audit_log. Clave antes de
    prender la capa agéntica: ver QUÉ decide/muta cada agente, no solo que existe."""
    await _require_superadmin(request)
    db = _db(request)
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    base = {"ts": {"$gte": since}}
    ia = await db.audit_log.count_documents({**base, "actor.by_ai": True})
    humano = await db.audit_log.count_documents({**base, "actor.by_ai": {"$ne": True}})
    por_agente = await db.audit_log.aggregate([
        {"$match": {**base, "actor.by_ai": True}},
        {"$group": {"_id": "$actor.user_id", "n": {"$sum": 1}}},
        {"$sort": {"n": -1}}, {"$limit": 12},
    ]).to_list(12)
    recientes = await db.audit_log.find(
        {**base, "actor.by_ai": True},
        {"_id": 0, "ts": 1, "action": 1, "entity_type": 1, "entity_id": 1, "actor": 1},
    ).sort("ts", -1).limit(20).to_list(20)
    return {
        "ok": True, "ventana_dias": days, "ia": ia, "humano": humano,
        "ia_pct": round(100 * ia / (ia + humano)) if (ia + humano) else 0,
        "por_agente": [{"agente": a["_id"], "acciones": a["n"]} for a in por_agente if a.get("_id")],
        "recientes": [{"ts": r.get("ts"), "accion": r.get("action"), "entidad": r.get("entity_type"),
                       "entidad_id": r.get("entity_id"), "agente": (r.get("actor") or {}).get("user_id")} for r in recientes],
    }


# ─── Indexes ──────────────────────────────────────────────────────────────────

async def ensure_superadmin_audit_indexes(db) -> None:
    """Best-effort: add the additional indexes useful for cross-org filters.
    Existing audit_log_indexes already covers (ts), (entity_type, entity_id, ts),
    (actor.user_id, ts), (actor.tenant_id, ts) — we add (action, ts).
    """
    try:
        await db.audit_log.create_index([("action", 1), ("ts", -1)], background=True)
        await db.audit_log.create_index([("severity", 1), ("ts", -1)], background=True,
                                        partialFilterExpression={"severity": {"$exists": True}})
    except Exception as e:
        log.warning(f"[superadmin_audit] indexes: {e}")
