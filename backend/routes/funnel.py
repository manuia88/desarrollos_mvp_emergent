"""Phase 4 Batch 20 · Backend routes — Conversion funnel + Sankey attribution."""
from __future__ import annotations
import hashlib
import json
import logging
import os
import re
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

from services.sankey_data import compute_sankey_flow

log = logging.getLogger("dmx.funnel")
router = APIRouter(tags=["funnel"])

VALID_EVENTS = {
    "view_ficha", "click_reservar", "slot_picked",
    "form_filled", "booking_confirmed", "visit_completed",
}
ADMIN_ROLES = {"developer_admin", "developer_director", "inmobiliaria_admin",
                "asesor_admin", "superadmin"}

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
SUGGESTION_THRESHOLD = 100  # min events before AI gets called
SUGGESTION_TTL_HOURS = 24


def _db(req): return req.app.state.db
def _now(): return datetime.now(timezone.utc)


async def _auth_optional(req):
    from server import get_current_user
    return await get_current_user(req)


# ─── Public funnel event ingest ───────────────────────────────────────────────

class FunnelEventIn(BaseModel):
    event_type: str
    project_id: str
    link_id: Optional[str] = None
    session_id: Optional[str] = None
    utm_source: Optional[str] = None
    utm_medium: Optional[str] = None
    utm_campaign: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


@router.post("/api/funnel/event")
async def post_funnel_event(body: FunnelEventIn, request: Request):
    if body.event_type not in VALID_EVENTS:
        raise HTTPException(400, f"event_type inválido. Opciones: {sorted(VALID_EVENTS)}")
    db = _db(request)
    ip = request.client.host if request.client else ""
    ip_hash = hashlib.sha256(ip.encode()).hexdigest()[:16] if ip else ""
    doc = {
        "id": str(uuid.uuid4()),
        "event_type": body.event_type,
        "project_id": body.project_id,
        "link_id": body.link_id,
        "session_id": body.session_id or "",
        "ip_hash": ip_hash,
        "utm_source": body.utm_source or "",
        "utm_medium": body.utm_medium or "",
        "utm_campaign": body.utm_campaign or "",
        "metadata": body.metadata or {},
        "created_at": _now().isoformat(),
    }
    await db.funnel_events.insert_one({**doc})
    return {"ok": True, "id": doc["id"]}


# ─── Funnel aggregation ──────────────────────────────────────────────────────

STAGES_ORDER = ["view_ficha", "click_reservar", "slot_picked",
                 "form_filled", "booking_confirmed", "visit_completed"]


@router.get("/api/funnel/{project_id}")
async def get_funnel(
    project_id: str,
    request: Request,
    period: str = Query("30d", pattern="^(7d|30d|90d)$"),
    utm_source: Optional[str] = None,
    asesor: Optional[str] = None,
):
    db = _db(request)
    days = {"7d": 7, "30d": 30, "90d": 90}[period]
    since = (_now() - timedelta(days=days)).isoformat()

    base_q: Dict[str, Any] = {"project_id": project_id, "created_at": {"$gte": since}}
    if utm_source:
        base_q["utm_source"] = utm_source

    # Resolve asesor filter via tracking_links
    if asesor:
        link_ids = [
            ln["link_id"]
            for ln in await db.tracking_links.find(
                {"asesor_id": asesor}, {"_id": 0, "link_id": 1},
            ).to_list(2000)
        ]
        base_q["link_id"] = {"$in": link_ids} if link_ids else {"$in": ["__none__"]}

    pipeline = [
        {"$match": base_q},
        {"$group": {"_id": "$event_type", "count": {"$sum": 1}}},
    ]
    counts: Dict[str, int] = {s: 0 for s in STAGES_ORDER}
    async for r in db.funnel_events.aggregate(pipeline):
        if r["_id"] in counts:
            counts[r["_id"]] = int(r["count"])

    stages = []
    for i, s in enumerate(STAGES_ORDER):
        c = counts[s]
        prev_c = counts[STAGES_ORDER[i - 1]] if i > 0 else c
        drop = round((1 - c / prev_c) * 100, 1) if prev_c > 0 and i > 0 else 0.0
        conv_from_prev = round((c / prev_c) * 100, 1) if prev_c > 0 and i > 0 else (100.0 if c else 0.0)
        stages.append({
            "stage": s, "count": c,
            "drop_off_pct": drop,
            "conv_from_prev_pct": conv_from_prev,
        })

    total_events = sum(counts.values())
    overall_conv = (
        round((counts["booking_confirmed"] / counts["view_ficha"]) * 100, 2)
        if counts.get("view_ficha") else 0.0
    )

    return {
        "project_id": project_id,
        "period": period,
        "filters": {"utm_source": utm_source, "asesor": asesor},
        "stages": stages,
        "total_events": total_events,
        "overall_conversion_pct": overall_conv,
    }


@router.get("/api/funnel/{project_id}/breakdown")
async def funnel_breakdown(
    project_id: str,
    request: Request,
    dimension: str = Query("utm_source", pattern="^(utm_source|asesor|campaign)$"),
    period: str = Query("30d", pattern="^(7d|30d|90d)$"),
):
    db = _db(request)
    days = {"7d": 7, "30d": 30, "90d": 90}[period]
    since = (_now() - timedelta(days=days)).isoformat()

    if dimension == "campaign":
        group_field = "$utm_campaign"
    elif dimension == "asesor":
        group_field = "$link_id"  # resolve below
    else:
        group_field = "$utm_source"

    pipeline = [
        {"$match": {"project_id": project_id, "created_at": {"$gte": since}}},
        {"$group": {
            "_id": {"dim": group_field, "event": "$event_type"},
            "count": {"$sum": 1},
        }},
    ]
    rows: Dict[str, Dict[str, int]] = {}
    async for r in db.funnel_events.aggregate(pipeline):
        dim_val = r["_id"].get("dim") or "(none)"
        ev = r["_id"]["event"]
        rows.setdefault(dim_val, {})[ev] = int(r["count"])

    if dimension == "asesor":
        link_ids = [k for k in rows.keys() if k and k != "(none)"]
        link_to_asesor = {}
        async for ln in db.tracking_links.find(
            {"link_id": {"$in": link_ids}},
            {"_id": 0, "link_id": 1, "asesor_id": 1},
        ):
            link_to_asesor[ln["link_id"]] = ln.get("asesor_id", "")
        # Re-key by asesor_id
        regrouped: Dict[str, Dict[str, int]] = {}
        for link_id, evs in rows.items():
            ase = link_to_asesor.get(link_id, "(none)")
            for k, v in evs.items():
                regrouped.setdefault(ase, {})[k] = regrouped.get(ase, {}).get(k, 0) + v
        rows = regrouped

    output = []
    for dim_val, evs in rows.items():
        bc = evs.get("booking_confirmed", 0)
        vf = evs.get("view_ficha", 0)
        output.append({
            "dimension_value": dim_val,
            "events_by_stage": {**{s: evs.get(s, 0) for s in STAGES_ORDER}},
            "conversion_pct": round((bc / vf) * 100, 2) if vf else 0.0,
            "total": sum(evs.values()),
        })
    output.sort(key=lambda r: -r["total"])
    return {"project_id": project_id, "dimension": dimension, "period": period, "rows": output}


# ─── AI Suggestion (cost-gated) ──────────────────────────────────────────────

async def _maybe_suggest(db, project_id: str, period: str, total: int,
                          stages: List[Dict[str, Any]]):
    if total < SUGGESTION_THRESHOLD:
        return None
    cache_q = {
        "entity_type": "funnel",
        "entity_id": f"{project_id}:{period}",
        "status": "active",
        "expires_at": {"$gt": _now().isoformat()},
    }
    cached = await db.ai_suggestions.find_one(cache_q, {"_id": 0})
    if cached:
        return cached

    # Cost gating
    try:
        from ai_budget import is_within_budget
        if not await is_within_budget(db, "default"):
            return None
    except Exception:
        pass
    if not EMERGENT_LLM_KEY:
        return None

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        prompt = (
            "Analiza este funnel de conversión y sugiere UNA acción concreta para reducir el "
            "principal drop-off. Responde JSON válido sin markdown: "
            '{"title": "<= 80 chars", "body": "<= 200 chars", '
            '"cta_label": "<= 22 chars", "cta_action": "open_url:/ruta"}\n\n'
            f"Stages: {json.dumps(stages, ensure_ascii=False)}\n"
            f"Periodo: {period} · Total eventos: {total}"
        )
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"funnel_sugg_{project_id}",
            system_message=("Eres un asistente DMX. Responde SIEMPRE en es-MX, sin emojis. "
                             "Solo JSON válido."),
        ).with_model("anthropic", "claude-haiku-4-5-20251001")
        raw = await chat.send_message(UserMessage(text=prompt[:3500]))
        text = (raw or "").strip()
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.S).strip()
        data = json.loads(text)
        sug_id = f"sug_{uuid.uuid4().hex[:12]}"
        doc = {
            "id": sug_id,
            "entity_type": "funnel",
            "entity_id": f"{project_id}:{period}",
            "dev_org_id": "default",
            "suggestion_type": "insight",
            "title": (data.get("title") or "")[:80],
            "body": (data.get("body") or "")[:220],
            "cta_label": (data.get("cta_label") or "Ver detalles")[:30],
            "cta_action": (data.get("cta_action") or "")[:200],
            "status": "active",
            "model": "claude-haiku-4-5-20251001",
            "generated_at": _now().isoformat(),
            "expires_at": (_now() + timedelta(hours=SUGGESTION_TTL_HOURS)).isoformat(),
            "created_by_ai": True,
        }
        await db.ai_suggestions.insert_one({**doc})
        return doc
    except Exception as e:
        log.warning(f"[funnel] AI suggestion failed: {e}")
        return None


@router.get("/api/funnel/{project_id}/suggestion")
async def get_funnel_suggestion(
    project_id: str, request: Request,
    period: str = Query("30d", pattern="^(7d|30d|90d)$"),
):
    user = await _auth_optional(request)
    if not user or user.role not in ADMIN_ROLES:
        raise HTTPException(403, "Sin permiso")
    db = _db(request)
    funnel = await get_funnel(project_id, request, period)
    sug = await _maybe_suggest(db, project_id, period, funnel["total_events"], funnel["stages"])
    return {"suggestion": sug, "min_events_required": SUGGESTION_THRESHOLD,
             "current_events": funnel["total_events"]}


# ─── Sankey ──────────────────────────────────────────────────────────────────

@router.get("/api/sankey/attribution")
async def get_sankey(
    request: Request,
    project_id: str = Query(...),
    period: str = Query("30d", pattern="^(7d|30d|90d)$"),
):
    user = await _auth_optional(request)
    if not user or user.role not in ADMIN_ROLES:
        raise HTTPException(403, "Sin permiso")
    db = _db(request)
    return await compute_sankey_flow(db, project_id, period)


# ─── Indexes ─────────────────────────────────────────────────────────────────

async def ensure_funnel_indexes(db) -> None:
    await db.funnel_events.create_index("id", unique=True, background=True)
    await db.funnel_events.create_index(
        [("project_id", 1), ("event_type", 1), ("created_at", -1)],
        background=True,
    )
    await db.funnel_events.create_index("link_id", background=True)
    log.info("[funnel] indexes ensured")
