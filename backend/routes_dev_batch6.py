"""Phase 4 Batch 6 — Demand Heatmap + Engagement Analytics per unit.

Sub-chunks:
  4.17  Demand Heatmap Mapbox real-time     GeoJSON aggregation per colonia
  4.20  Engagement Analytics per unit       Aggregations + AI recommendations
"""
from __future__ import annotations

import json
import logging
import os
from collections import Counter, defaultdict
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request, Query

log = logging.getLogger("dmx.batch6")
router = APIRouter(tags=["batch6"])

_AI_RECO_CACHE: Dict[str, tuple[datetime, Dict]] = {}  # project_id → (ts, reco)
RECO_TTL_HOURS = 12


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────
def _now() -> datetime:
    return datetime.now(timezone.utc)


def _db(request: Request):
    return request.app.state.db


async def _auth(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    return user


async def _safe_audit_ml(
    db, actor, *, action: str, entity_type: str, entity_id: str,
    request: Optional[Request] = None,
    ml_event: Optional[str] = None, ml_context: Optional[Dict] = None,
) -> None:
    try:
        from audit_log import log_mutation
        await log_mutation(db, actor, action, entity_type, entity_id, None, None, request=request)
    except Exception:
        pass
    if ml_event:
        try:
            from observability import emit_ml_event
            uid = getattr(actor, "user_id", None) or "system"
            role = getattr(actor, "role", None) or "system"
            org = getattr(actor, "tenant_id", None) or "dmx"
            await emit_ml_event(db, event_type=ml_event, user_id=uid, org_id=org, role=role,
                                context=ml_context or {}, ai_decision={}, user_action={})
        except Exception:
            pass


def _parse_dates(period_from: Optional[str], period_to: Optional[str]) -> tuple[str, str]:
    now = _now()
    if not period_to:
        period_to = now.isoformat()
    if not period_from:
        period_from = (now - timedelta(days=30)).isoformat()
    return period_from, period_to


# ═════════════════════════════════════════════════════════════════════════════
# 4.17 · DEMAND HEATMAP
# ═════════════════════════════════════════════════════════════════════════════
def _build_polygon(colonia: Dict) -> List[List[float]]:
    """Convert colonia polygon (raw seed) to GeoJSON ring (closed)."""
    poly = colonia.get("polygon") or []
    if not poly:
        # Fallback: tiny square around center
        center = colonia.get("center", [-99.16, 19.41])
        d = 0.005
        poly = [
            [center[0] - d, center[1] + d], [center[0] + d, center[1] + d],
            [center[0] + d, center[1] - d], [center[0] - d, center[1] - d],
        ]
    # Close ring if not already
    ring = list(poly)
    if ring[0] != ring[-1]:
        ring.append(ring[0])
    return ring


@router.get("/api/dev/analytics/demand-heatmap")
async def demand_heatmap(
    request: Request,
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    granularity: str = Query("colonia", pattern=r"^(colonia|cp|h3_resolution_8)$"),
    include_searches: bool = True,
):
    user = await _auth(request)
    if user.role not in ("developer_admin", "developer_director", "inmobiliaria_admin",
                         "inmobiliaria_director", "superadmin"):
        raise HTTPException(403, "Rol no autorizado")
    db = _db(request)
    period_from, period_to = _parse_dates(from_date, to_date)
    org = getattr(user, "tenant_id", None) or "default"

    # Lookup project → colonia map
    try:
        from data_developments import DEVELOPMENTS
        from data_seed import COLONIAS
    except ImportError:
        raise HTTPException(500, "Datos seed no disponibles")
    project_to_colonia: Dict[str, str] = {}
    for d in DEVELOPMENTS:
        project_to_colonia[d["id"]] = d.get("colonia_id", "polanco")
    colonias_by_id = {c["id"]: c for c in COLONIAS}

    # Aggregate leads
    leads_q: Dict[str, Any] = {"created_at": {"$gte": period_from, "$lte": period_to}}
    if user.role != "superadmin":
        if user.role.startswith("developer_"):
            leads_q["dev_org_id"] = org
        elif user.role.startswith("inmobiliaria_"):
            leads_q["inmobiliaria_id"] = getattr(user, "inmobiliaria_id", None) or "default"
    leads = await db.leads.find(leads_q, {"_id": 0, "project_id": 1}).limit(10000).to_list(10000)
    leads_by_colonia = Counter(project_to_colonia.get(ld.get("project_id"), "_") for ld in leads)

    # Aggregate appointments
    appts_q: Dict[str, Any] = {"created_at": {"$gte": period_from, "$lte": period_to}}
    if user.role != "superadmin":
        if user.role.startswith("developer_"):
            appts_q["dev_org_id"] = org
        elif user.role.startswith("inmobiliaria_"):
            appts_q["inmobiliaria_id"] = getattr(user, "inmobiliaria_id", None) or "default"
    appts = await db.appointments.find(appts_q, {"_id": 0, "project_id": 1}).limit(10000).to_list(10000)
    appts_by_colonia = Counter(project_to_colonia.get(a.get("project_id"), "_") for a in appts)

    # Aggregate marketplace searches if available
    searches_by_colonia: Counter = Counter()
    has_searches = False
    if include_searches:
        try:
            count_existing = await db.marketplace_searches.count_documents({})
            if count_existing > 0:
                has_searches = True
                rows = await db.marketplace_searches.find(
                    {"created_at": {"$gte": period_from, "$lte": period_to}},
                    {"_id": 0, "colonia_id": 1, "filters": 1},
                ).limit(20000).to_list(20000)
                for r in rows:
                    cid = r.get("colonia_id") or (r.get("filters") or {}).get("colonia_id")
                    if cid:
                        searches_by_colonia[cid] += 1
        except Exception:
            pass

    # Compute demand_score normalization
    raw_scores = {}
    for cid in colonias_by_id.keys():
        leads_c = leads_by_colonia.get(cid, 0)
        appts_c = appts_by_colonia.get(cid, 0)
        searches_c = searches_by_colonia.get(cid, 0)
        raw_scores[cid] = leads_c * 3 + appts_c * 5 + searches_c * 1
    max_raw = max(raw_scores.values()) if raw_scores else 1
    max_raw = max(max_raw, 1)

    # Build GeoJSON features
    features = []
    for cid, col in colonias_by_id.items():
        leads_c = leads_by_colonia.get(cid, 0)
        appts_c = appts_by_colonia.get(cid, 0)
        searches_c = searches_by_colonia.get(cid, 0)
        score = round(100 * raw_scores[cid] / max_raw, 1)
        ring = _build_polygon(col)
        features.append({
            "type": "Feature",
            "properties": {
                "colonia_id": cid,
                "colonia": col.get("name", cid),
                "alcaldia": col.get("alcaldia"),
                "leads_count": leads_c,
                "appointments_count": appts_c,
                "searches_count": searches_c if has_searches else None,
                "demand_score": score,
                "center": col.get("center", [-99.16, 19.41]),
            },
            "geometry": {"type": "Polygon", "coordinates": [ring]},
        })

    # Top 10
    top_10 = sorted(features, key=lambda f: -f["properties"]["demand_score"])[:10]
    top_10_summary = [
        {"colonia_id": f["properties"]["colonia_id"], "colonia": f["properties"]["colonia"],
         "demand_score": f["properties"]["demand_score"],
         "leads_count": f["properties"]["leads_count"],
         "appointments_count": f["properties"]["appointments_count"]}
        for f in top_10
    ]

    await _safe_audit_ml(
        db, user, action="read", entity_type="demand_heatmap", entity_id=org,
        request=request, ml_event="demand_heatmap_viewed",
        ml_context={"granularity": granularity, "from": period_from, "to": period_to},
    )
    return {
        "type": "FeatureCollection",
        "features": features,
        "top_10": top_10_summary,
        "period": {"from": period_from, "to": period_to},
        "granularity": granularity,
        "has_searches": has_searches,
        "total_leads": len(leads),
        "total_appointments": len(appts),
    }


# ═════════════════════════════════════════════════════════════════════════════
# 4.20 · ENGAGEMENT ANALYTICS PER UNIT
# ═════════════════════════════════════════════════════════════════════════════
async def _claude_recommendations(units_summary: List[Dict], project_name: str) -> Optional[List[str]]:
    """Claude haiku recommendation prompt. Returns list of strings or None."""
    key = os.environ.get("EMERGENT_LLM_KEY", "")
    if not key:
        return None
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=key, session_id=f"unit_reco_{project_name}",
            system_message=(
                "Eres analista senior de marketing inmobiliario en México. Recibes datos de engagement "
                "por unidad de un proyecto. Genera 2 a 3 recomendaciones accionables específicas "
                "(tono directo, sin tecnicismos). Responde JSON válido SIN markdown: "
                '{"recommendations": ["str1", "str2", ...]}'
            ),
        ).with_model("anthropic", "claude-haiku-4-5-20251001")
        msg = UserMessage(text=f"Proyecto: {project_name}. Top 5 unidades por engagement: "
                                f"{json.dumps(units_summary[:5], ensure_ascii=False)}. "
                                f"Genera recomendaciones.")
        raw = await chat.send_message(msg)
        text = (raw or "").strip()
        if text.startswith("```"):
            import re
            text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.S).strip()
        data = json.loads(text)
        recs = data.get("recommendations") or []
        return [str(r)[:160] for r in recs[:3]] if recs else None
    except Exception as e:
        log.warning(f"[batch6] claude reco failed: {e}")
        return None


@router.get("/api/dev/projects/{project_id}/engagement-units")
async def engagement_units(
    project_id: str,
    request: Request,
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    sort: str = Query("engagement_score",
                      pattern=r"^(engagement_score|views|leads|cierres)$"),
):
    user = await _auth(request)
    if user.role not in ("developer_admin", "developer_director", "superadmin"):
        raise HTTPException(403, "Rol no autorizado")
    db = _db(request)
    period_from, period_to = _parse_dates(from_date, to_date)

    try:
        from data_developments import DEVELOPMENTS
    except ImportError:
        raise HTTPException(500, "Datos seed no disponibles")
    project = next((d for d in DEVELOPMENTS if d["id"] == project_id), None)
    if not project:
        raise HTTPException(404, "Proyecto no encontrado")

    units = project.get("units") or []
    if not units:
        return {"items": [], "totals": {"units": 0}, "recommendations": [], "_no_units": True}

    # Aggregations
    leads = await db.leads.find(
        {"project_id": project_id, "created_at": {"$gte": period_from, "$lte": period_to}},
        {"_id": 0, "id": 1, "status": 1, "target_units": 1, "unit_id": 1},
    ).limit(5000).to_list(5000)
    appts = await db.appointments.find(
        {"project_id": project_id, "created_at": {"$gte": period_from, "$lte": period_to}},
        {"_id": 0, "lead_id": 1, "unit_id": 1, "status": 1},
    ).limit(5000).to_list(5000)

    # ml_training_events for views
    views_by_unit: Counter = Counter()
    try:
        events = await db.ml_training_events.find(
            {"event_type": "unit_viewed", "context.project_id": project_id,
             "created_at": {"$gte": period_from, "$lte": period_to}},
            {"_id": 0, "context": 1},
        ).limit(20000).to_list(20000)
        for e in events:
            uid = (e.get("context") or {}).get("unit_id")
            if uid:
                views_by_unit[uid] += 1
    except Exception:
        pass

    # leads/appointments by unit (use appointment.unit_id, fallback lead.unit_id, fallback target_units)
    leads_by_unit: Counter = Counter()
    cierres_by_unit: Counter = Counter()
    for ld in leads:
        unit_id = ld.get("unit_id")
        if not unit_id and ld.get("target_units"):
            unit_id = ld["target_units"][0]
        if unit_id:
            leads_by_unit[unit_id] += 1
            if ld.get("status") == "cerrado_ganado":
                cierres_by_unit[unit_id] += 1
    appts_by_unit: Counter = Counter()
    for a in appts:
        if a.get("unit_id"):
            appts_by_unit[a["unit_id"]] += 1

    # Compute per-unit
    out = []
    raw_scores = {}
    for u in units:
        uid = u.get("id") or u.get("unit_id") or u.get("number") or "_"
        v = views_by_unit.get(uid, 0)
        ld = leads_by_unit.get(uid, 0)
        ap = appts_by_unit.get(uid, 0)
        ci = cierres_by_unit.get(uid, 0)
        raw = v * 1 + ld * 5 + ap * 10 + ci * 30
        raw_scores[uid] = raw
        out.append({
            "unit_id": uid,
            "unit_number": u.get("number") or u.get("name") or uid,
            "type": u.get("type"),
            "status": u.get("status"),
            "price": u.get("price"),
            "m2": u.get("m2"),
            "views": v, "leads": ld, "appointments": ap, "cierres": ci,
            "_raw_score": raw,
        })
    max_raw = max(raw_scores.values(), default=1) or 1
    for item in out:
        item["engagement_score"] = round(100 * item.pop("_raw_score") / max_raw, 1)

    # Sort
    sort_key_map = {"engagement_score": "engagement_score", "views": "views",
                    "leads": "leads", "cierres": "cierres"}
    sk = sort_key_map.get(sort, "engagement_score")
    out.sort(key=lambda x: -(x.get(sk) or 0))

    # AI recommendations (cached 12h per project_id)
    cached = _AI_RECO_CACHE.get(project_id)
    recommendations: List[str] = []
    if cached and (_now() - cached[0]).total_seconds() < RECO_TTL_HOURS * 3600:
        recommendations = cached[1].get("recs", [])
    else:
        recs = await _claude_recommendations(out, project.get("name", project_id))
        if recs:
            recommendations = recs
        else:
            # Deterministic fallback
            top = out[0] if out else None
            slowest = next((u for u in reversed(out) if u["status"] in ("disponible", "available")), None)
            recommendations = []
            if top:
                recommendations.append(f"La unidad {top['unit_number']} lidera engagement ({top['engagement_score']}/100); evalúa replicar su pricing en unidades similares")
            if slowest:
                recommendations.append(f"La unidad {slowest['unit_number']} tiene engagement bajo ({slowest['engagement_score']}/100); considera revisar precio o marketing")
            recommendations.append("Activa pricing experiments A/B en las top 3 unidades para validar elasticidad de demanda")
        _AI_RECO_CACHE[project_id] = (_now(), {"recs": recommendations})

    await _safe_audit_ml(
        db, user, action="read", entity_type="engagement_analytics", entity_id=project_id,
        request=request, ml_event="engagement_analytics_viewed",
        ml_context={"project_id": project_id, "units_count": len(out)},
    )
    return {
        "project_id": project_id, "project_name": project.get("name"),
        "items": out, "totals": {
            "units": len(out),
            "avg_engagement": round(sum(u["engagement_score"] for u in out) / max(len(out), 1), 1),
            "top_performer": out[0]["unit_number"] if out else None,
            "slowest": out[-1]["unit_number"] if out else None,
        },
        "recommendations": recommendations,
        "period": {"from": period_from, "to": period_to},
    }


@router.get("/api/dev/projects/{project_id}/engagement-units/{unit_id}/timeline")
async def engagement_unit_timeline(
    project_id: str, unit_id: str, request: Request,
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
):
    user = await _auth(request)
    if user.role not in ("developer_admin", "developer_director", "superadmin"):
        raise HTTPException(403, "Rol no autorizado")
    db = _db(request)
    period_from, period_to = _parse_dates(from_date, to_date)

    events: List[Dict] = []
    # Views
    try:
        view_evts = await db.ml_training_events.find(
            {"event_type": "unit_viewed", "context.project_id": project_id, "context.unit_id": unit_id,
             "created_at": {"$gte": period_from, "$lte": period_to}},
            {"_id": 0, "created_at": 1, "user_id": 1},
        ).sort("created_at", -1).limit(200).to_list(200)
        for e in view_evts:
            events.append({"type": "view", "timestamp": e.get("created_at"), "actor": e.get("user_id", "anon")})
    except Exception:
        pass
    # Leads
    leads = await db.leads.find(
        {"project_id": project_id, "$or": [{"unit_id": unit_id}, {"target_units": unit_id}],
         "created_at": {"$gte": period_from, "$lte": period_to}},
        {"_id": 0, "id": 1, "created_at": 1, "assigned_to": 1, "status": 1, "contact": 1},
    ).sort("created_at", -1).limit(200).to_list(200)
    for ld in leads:
        events.append({"type": "lead_created", "timestamp": ld.get("created_at"),
                       "actor": ld.get("assigned_to"), "lead_id": ld.get("id"),
                       "contact_name": (ld.get("contact") or {}).get("name")})
        if ld.get("status") == "cerrado_ganado":
            events.append({"type": "cierre", "timestamp": ld.get("created_at"),
                           "actor": ld.get("assigned_to"), "lead_id": ld.get("id")})
    # Appointments
    appts = await db.appointments.find(
        {"project_id": project_id, "unit_id": unit_id,
         "created_at": {"$gte": period_from, "$lte": period_to}},
        {"_id": 0, "id": 1, "created_at": 1, "datetime": 1, "asesor_id": 1, "status": 1},
    ).sort("created_at", -1).limit(200).to_list(200)
    for a in appts:
        events.append({"type": "appointment_scheduled", "timestamp": a.get("created_at"),
                       "actor": a.get("asesor_id"), "appointment_id": a.get("id"),
                       "scheduled_for": a.get("datetime"), "status": a.get("status")})

    events.sort(key=lambda x: x.get("timestamp", ""), reverse=True)

    await _safe_audit_ml(
        db, user, action="read", entity_type="engagement_unit_timeline", entity_id=unit_id,
        request=request, ml_event="engagement_unit_drill",
        ml_context={"project_id": project_id, "unit_id": unit_id, "events": len(events)},
    )
    return {"project_id": project_id, "unit_id": unit_id, "events": events,
            "period": {"from": period_from, "to": period_to}}


# ═════════════════════════════════════════════════════════════════════════════
# Indexes
# ═════════════════════════════════════════════════════════════════════════════
async def ensure_batch6_indexes(db) -> None:
    try:
        await db.ml_training_events.create_index([("event_type", 1), ("context.project_id", 1)], background=True)
    except Exception:
        pass
    log.info("[batch6] indexes ensured")
