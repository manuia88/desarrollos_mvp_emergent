"""W4.13.A — Lead Journey Engine.

Source of truth for outbound asesor→dev lead journey events.

15 step types:
- captured · enriched · disc_inferred · routed · assigned
- first_touch_email · first_touch_whatsapp · meeting_scheduled · visit_completed · quote_sent
- nurtured · outbound_initiated_by_asesor · atlax_consulted_broker · closed_won · closed_lost
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.lead_journey_engine")

VALID_STEP_TYPES = {
    "captured", "enriched", "disc_inferred", "routed", "assigned",
    "first_touch_email", "first_touch_whatsapp", "meeting_scheduled",
    "visit_completed", "quote_sent", "nurtured",
    "outbound_initiated_by_asesor", "atlax_consulted_broker",
    "closed_won", "closed_lost", "nurture_paused",
}
ACTOR_TYPES = {"system", "asesor", "broker", "buyer", "atlax", "cron"}
IDEMPOTENCY_WINDOW_S = 60


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ─── Core API ─────────────────────────────────────────────────────────────────
async def emit_step(
    db,
    *,
    lead_id: str,
    tenant_id: Optional[str] = None,
    step_type: str,
    actor_type: str = "system",
    actor_id: Optional[str] = None,
    payload: Optional[Dict[str, Any]] = None,
    audit_ref: Optional[str] = None,
) -> Optional[str]:
    """Idempotent: same lead+step+actor in <60s → skip."""
    if not lead_id or step_type not in VALID_STEP_TYPES:
        return None
    actor_type = actor_type if actor_type in ACTOR_TYPES else "system"
    cutoff = _now() - timedelta(seconds=IDEMPOTENCY_WINDOW_S)
    try:
        existing = await db.lead_journey_steps.find_one({
            "lead_id": lead_id,
            "step_type": step_type,
            "actor_type": actor_type,
            "actor_id": actor_id,
            "occurred_at": {"$gte": cutoff},
        }, {"_id": 0, "step_id": 1})
        if existing:
            return existing.get("step_id")
    except Exception:
        pass

    step_id = f"jstep_{uuid.uuid4().hex[:14]}"
    doc = {
        "step_id": step_id,
        "lead_id": lead_id,
        "tenant_id": tenant_id,
        "step_type": step_type,
        "actor_type": actor_type,
        "actor_id": actor_id,
        "payload": payload or {},
        "occurred_at": _now(),
        "audit_log_ref": audit_ref,
    }
    try:
        await db.lead_journey_steps.insert_one(dict(doc))
        # Audit log integration (best-effort)
        try:
            await db.audit_log.insert_one({
                "audit_id": f"a_{uuid.uuid4().hex[:14]}",
                "ts": _now(),
                "action_type": f"lead_journey.{step_type}",
                "entity_type": "lead",
                "entity_id": lead_id,
                "actor": {"type": actor_type, "id": actor_id, "tenant_id": tenant_id},
                "context": {"step_id": step_id},
            })
        except Exception:
            pass
        # W4.17 — Notifications hook (best-effort)
        if step_type in ("assigned", "captured") and actor_type == "system":
            try:
                from notifications_engine import rule_lead_new
                if actor_id:
                    await rule_lead_new(db, lead_id=lead_id, asesor_id=actor_id, tenant_id=tenant_id)
            except Exception:
                pass
    except Exception as exc:
        log.warning(f"[emit_step] insert failed: {exc}")
        return None
    return step_id


async def get_journey(db, lead_id: str) -> List[Dict[str, Any]]:
    cursor = db.lead_journey_steps.find({"lead_id": lead_id}, {"_id": 0}).sort("occurred_at", -1)
    out = []
    async for s in cursor:
        if isinstance(s.get("occurred_at"), datetime):
            s["occurred_at"] = s["occurred_at"].isoformat()
        out.append(s)
    return out


async def bulk_re_route(db, lead_ids: List[str], by_user_id: str, tenant_id: str) -> Dict[str, Any]:
    """Re-routea N leads. smart_routing_engine.py NO existe en codebase actual,
    así que emite step `routed` con flag `bulk_triggered=True` (heurística simple
    selecting next asesor del tenant). Cuando smart_routing exista, swap.
    """
    lead_ids = (lead_ids or [])[:50]
    ok, failed = 0, 0
    # Fallback simple: rota entre asesores activos del tenant
    asesores = []
    try:
        cursor = db.users.find(
            {"tenant_id": tenant_id, "role": {"$in": ["advisor", "asesor", "broker"]}},
            {"_id": 0, "user_id": 1},
        ).limit(50)
        asesores = [u["user_id"] async for u in cursor]
    except Exception:
        pass
    for i, lid in enumerate(lead_ids):
        try:
            chosen = asesores[i % len(asesores)] if asesores else None
            await emit_step(
                db, lead_id=lid, tenant_id=tenant_id, step_type="routed",
                actor_type="system", actor_id=by_user_id,
                payload={"bulk_triggered": True, "routed_to": chosen},
            )
            if chosen:
                try:
                    await db.leads.update_one({"id": lid}, {"$set": {"assigned_to": chosen, "rerouted_at": _now().isoformat()}})
                except Exception:
                    pass
            ok += 1
        except Exception:
            failed += 1
    return {"ok_count": ok, "failed_count": failed}


async def pause_nurture(db, lead_id: str, by_user_id: str, until_iso: Optional[str], tenant_id: Optional[str] = None) -> Dict[str, Any]:
    until_dt = None
    if until_iso:
        try:
            until_dt = datetime.fromisoformat(until_iso)
        except ValueError:
            until_dt = _now() + timedelta(days=30)
    else:
        until_dt = _now() + timedelta(days=30)
    try:
        await db.leads.update_one(
            {"id": lead_id},
            {"$set": {"nurture_paused_until": until_dt.isoformat(), "nurture_paused_by": by_user_id}},
        )
    except Exception:
        pass
    await emit_step(
        db, lead_id=lead_id, tenant_id=tenant_id, step_type="nurture_paused",
        actor_type="asesor", actor_id=by_user_id,
        payload={"until": until_dt.isoformat()},
    )
    return {"ok": True, "until": until_dt.isoformat()}


async def journey_stats(db, tenant_id: str, period_days: int = 30) -> Dict[str, Any]:
    cutoff = _now() - timedelta(days=int(period_days or 30))
    base_q = {"tenant_id": tenant_id, "occurred_at": {"$gte": cutoff}}

    # Total unique leads
    leads = set()
    by_step: Dict[str, int] = {}
    cursor = db.lead_journey_steps.find(base_q, {"_id": 0, "lead_id": 1, "step_type": 1})
    async for s in cursor:
        leads.add(s["lead_id"])
        by_step[s["step_type"]] = by_step.get(s["step_type"], 0) + 1

    total_leads = len(leads)
    closed_won = by_step.get("closed_won", 0)
    closed_lost = by_step.get("closed_lost", 0)
    closed = closed_won + closed_lost
    conversion_rate = round(closed_won / closed * 100, 1) if closed else 0

    # Avg steps to close: count steps per lead that has closed_won/lost
    closed_lead_ids = set()
    cursor2 = db.lead_journey_steps.find(
        {"tenant_id": tenant_id, "step_type": {"$in": ["closed_won", "closed_lost"]}, "occurred_at": {"$gte": cutoff}},
        {"_id": 0, "lead_id": 1},
    )
    async for s in cursor2:
        closed_lead_ids.add(s["lead_id"])
    if closed_lead_ids:
        steps_per_closed = await db.lead_journey_steps.count_documents({"lead_id": {"$in": list(closed_lead_ids)}})
        avg_steps = round(steps_per_closed / len(closed_lead_ids), 1)
    else:
        avg_steps = 0

    # Drop-off step: max count by step (excluding closed)
    funnel_order = [
        "captured", "enriched", "disc_inferred", "routed", "assigned",
        "first_touch_email", "first_touch_whatsapp", "meeting_scheduled",
        "visit_completed", "quote_sent", "nurtured",
    ]
    drop_off_step = None
    drop_off_count = 0
    for s in funnel_order:
        c = by_step.get(s, 0)
        if c > drop_off_count:
            drop_off_count = c
            drop_off_step = s

    return {
        "total_leads": total_leads,
        "closed_won": closed_won,
        "closed_lost": closed_lost,
        "conversion_rate": conversion_rate,
        "avg_steps_to_close": avg_steps,
        "drop_off_step": drop_off_step,
        "drop_off_count": drop_off_count,
        "by_step": by_step,
        "period_days": int(period_days or 30),
    }


async def outbound_claim(db, lead_id: str, asesor_user_id: str, tenant_id: str) -> Dict[str, Any]:
    """Asesor 1-click claim: assigns lead + emits 2 steps."""
    try:
        await db.leads.update_one(
            {"id": lead_id},
            {"$set": {"assigned_to": asesor_user_id, "outbound_claimed_at": _now().isoformat()}},
        )
    except Exception:
        pass
    await emit_step(
        db, lead_id=lead_id, tenant_id=tenant_id, step_type="routed",
        actor_type="asesor", actor_id=asesor_user_id,
        payload={"forced_reassign": True, "routed_to": asesor_user_id},
    )
    await emit_step(
        db, lead_id=lead_id, tenant_id=tenant_id, step_type="outbound_initiated_by_asesor",
        actor_type="asesor", actor_id=asesor_user_id,
        payload={"trigger": "1_click_claim"},
    )
    return {"ok": True, "lead_id": lead_id, "assigned_to": asesor_user_id}


async def list_outbound_leads(db, tenant_id: str, limit: int = 100) -> List[Dict[str, Any]]:
    """Leads disponibles para outbound: sin assigned_to o cooldown >30d."""
    cutoff = _now() - timedelta(days=30)
    q = {
        "$or": [
            {"assigned_to": None},
            {"assigned_to": {"$exists": False}},
            {"last_contact_at": {"$lt": cutoff.isoformat()}},
        ],
    }
    if tenant_id:
        q["tenant_id"] = tenant_id
    cursor = db.leads.find(q, {"_id": 0}).sort("created_at", -1).limit(limit)
    out = []
    async for r in cursor:
        out.append(r)
    return out


async def ensure_lead_journey_indexes(db) -> None:
    try:
        await db.lead_journey_steps.create_index([("lead_id", 1), ("occurred_at", -1)])
        await db.lead_journey_steps.create_index([("tenant_id", 1), ("occurred_at", -1)])
        await db.lead_journey_steps.create_index([("step_type", 1), ("occurred_at", -1)])
        await db.lead_journey_steps.create_index("step_id", unique=True)
    except Exception as exc:
        log.warning(f"[ensure_lead_journey_indexes] {exc}")
