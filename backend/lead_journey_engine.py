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

# W5.ASR.2 Parte 2 — Mapeo de status V2 (lineales + paralelos) → step_type del journey
V2_STATUS_TO_STEP: Dict[str, str] = {
    # Lineales (7)
    "lead_nuevo":   "captured",
    "contactado":   "first_touch_email",
    "calificado":   "disc_inferred",
    "visita":       "meeting_scheduled",
    "negociacion":  "quote_sent",
    "cierre":       "quote_sent",
    "vendido":      "closed_won",
    # Paralelos (2)
    "nurture":      "nurtured",
    "perdido":      "closed_lost",
}


def step_type_for_v2_target(target_status_v2: str) -> Optional[str]:
    """W5.ASR.2 Parte 2 — Devuelve el step_type del journey correspondiente al
    target status V2. Retorna None si el status es desconocido.
    """
    return V2_STATUS_TO_STEP.get(target_status_v2)


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


async def bulk_re_route(db, lead_ids: List[str], by_user_id: str, inmobiliaria_id: str) -> Dict[str, Any]:
    """Re-routea N leads entre asesores de la MISMA inmobiliaria. smart_routing_engine.py
    NO existe aún, así que emite step `routed` + reasigna (heurística round-robin).
    """
    lead_ids = (lead_ids or [])[:50]
    ok, failed = 0, 0
    # Asesores activos de la inmobiliaria (enlace canónico inmobiliaria_internal_users)
    asesores = []
    try:
        cursor = db.inmobiliaria_internal_users.find(
            {"inmobiliaria_id": inmobiliaria_id, "status": "active",
             "role": {"$in": ["asesor", "admin", "advisor", "broker"]},
             "user_id": {"$nin": [None, ""]}},
            {"_id": 0, "user_id": 1},
        ).limit(50)
        asesores = [u["user_id"] async for u in cursor]
    except Exception:
        pass
    for i, lid in enumerate(lead_ids):
        try:
            chosen = asesores[i % len(asesores)] if asesores else None
            await emit_step(
                db, lead_id=lid, tenant_id=inmobiliaria_id, step_type="routed",
                actor_type="system", actor_id=by_user_id,
                payload={"bulk_triggered": True, "routed_to": chosen},
            )
            if chosen:
                try:
                    # Seguridad: solo re-routear leads de la MISMA inmobiliaria (no robar)
                    lead_q = {"id": lid}
                    if inmobiliaria_id:
                        lead_q["inmobiliaria_id"] = inmobiliaria_id
                    await db.leads.update_one(lead_q, {"$set": {"assigned_to": chosen, "rerouted_at": _now().isoformat()}})
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


async def outbound_claim(db, lead_id: str, asesor_user_id: str, inmobiliaria_id: str) -> Dict[str, Any]:
    """Asesor 1-click claim: assigns lead + emits 2 steps.
    Seguridad: solo se puede reclamar un lead DISPONIBLE (mismo filtro que
    list_outbound_leads: sin asignar o frío >30d) y de la MISMA inmobiliaria. El update
    es atómico (CAS): si modified_count==0, el lead ya no estaba disponible → no se roba."""
    cutoff = _now() - timedelta(days=30)
    claim_q: Dict[str, Any] = {
        "id": lead_id,
        "$or": [
            {"assigned_to": None},
            {"assigned_to": {"$exists": False}},
            {"last_contact_at": {"$lt": cutoff.isoformat()}},
        ],
    }
    if inmobiliaria_id:
        claim_q["inmobiliaria_id"] = inmobiliaria_id
    try:
        res = await db.leads.update_one(
            claim_q,
            {"$set": {"assigned_to": asesor_user_id, "outbound_claimed_at": _now().isoformat()}},
        )
    except Exception:
        return {"ok": False, "claimed": False, "reason": "error"}
    if res.modified_count != 1:
        return {"ok": False, "claimed": False,
                "reason": "lead no disponible (ya asignado o de otra inmobiliaria)"}
    await emit_step(
        db, lead_id=lead_id, tenant_id=inmobiliaria_id, step_type="routed",
        actor_type="asesor", actor_id=asesor_user_id,
        payload={"forced_reassign": True, "routed_to": asesor_user_id},
    )
    await emit_step(
        db, lead_id=lead_id, tenant_id=inmobiliaria_id, step_type="outbound_initiated_by_asesor",
        actor_type="asesor", actor_id=asesor_user_id,
        payload={"trigger": "1_click_claim"},
    )
    return {"ok": True, "lead_id": lead_id, "assigned_to": asesor_user_id}


async def list_outbound_leads(db, inmobiliaria_id: str, limit: int = 100) -> List[Dict[str, Any]]:
    """Leads disponibles para outbound (de la inmobiliaria): sin assigned_to o frío >30d."""
    cutoff = _now() - timedelta(days=30)
    q = {
        "$or": [
            {"assigned_to": None},
            {"assigned_to": {"$exists": False}},
            {"last_contact_at": {"$lt": cutoff.isoformat()}},
        ],
    }
    if inmobiliaria_id:
        q["inmobiliaria_id"] = inmobiliaria_id
    cursor = db.leads.find(q, {"_id": 0}).sort("created_at", -1).limit(limit)
    out = []
    async for r in cursor:
        out.append(r)
    return out


async def top_3_leads_active(
    db, asesor_id: str, period_days: int = 7,
) -> List[Dict[str, Any]]:
    """F0.2·Sub-A — Returns top-3 leads with most recent step activity for asesor.

    Best-effort: never raises. Uses assigned_to = asesor_id + last step within window.
    """
    if not asesor_id:
        return []
    cutoff = _now() - timedelta(days=int(period_days or 7))
    out: List[Dict[str, Any]] = []
    try:
        # Pull recent journey steps to identify active leads for this asesor
        pipeline = [
            {"$match": {
                "occurred_at": {"$gte": cutoff},
                "$or": [
                    {"actor_id": asesor_id, "actor_type": {"$in": ["asesor", "broker"]}},
                ],
            }},
            {"$sort": {"occurred_at": -1}},
            {"$group": {
                "_id": "$lead_id",
                "last_step": {"$first": "$step_type"},
                "last_at": {"$first": "$occurred_at"},
                "steps_count": {"$sum": 1},
            }},
            {"$sort": {"last_at": -1}},
            {"$limit": 10},
        ]
        async for row in db.lead_journey_steps.aggregate(pipeline):
            lead_id = row.get("_id")
            if not lead_id:
                continue
            lead = await db.leads.find_one(
                {"id": lead_id},
                {"_id": 0, "id": 1, "name": 1, "full_name": 1, "email": 1, "stage": 1, "assigned_to": 1},
            ) or {}
            # Filter: only leads assigned to this asesor (or owned by their steps)
            if lead.get("assigned_to") and lead["assigned_to"] != asesor_id:
                continue
            name = lead.get("name") or lead.get("full_name") or (lead.get("email") or "lead").split("@")[0]
            last_at = row.get("last_at")
            if isinstance(last_at, datetime):
                last_at = last_at.isoformat()
            out.append({
                "lead_id": lead_id,
                "name": name[:80],
                "last_step": row.get("last_step") or "—",
                "last_at": last_at,
                "steps_count": int(row.get("steps_count") or 0),
            })
            if len(out) >= 3:
                break
    except Exception as exc:
        log.warning(f"[top_3_leads_active] failed asesor={asesor_id}: {exc}")
    return out


async def leaderboard_cohort(
    db, tenant_id: Optional[str], period_days: int = 30, limit: int = 5,
) -> List[Dict[str, Any]]:
    """F0.2·Sub-B — Top N asesores by closed_won steps in period.

    Cross-tenant: returns anonymized initials when caller is not superadmin (tenant_id="").
    Same-tenant: returns full name.
    """
    cutoff = _now() - timedelta(days=int(period_days or 30))
    match: Dict[str, Any] = {
        "step_type": "closed_won",
        "occurred_at": {"$gte": cutoff},
    }
    same_tenant = bool(tenant_id)
    if same_tenant:
        match["tenant_id"] = tenant_id

    pipeline = [
        {"$match": match},
        {"$group": {
            "_id": "$actor_id",
            "closed_won": {"$sum": 1},
            "tenant_id": {"$first": "$tenant_id"},
        }},
        {"$sort": {"closed_won": -1}},
        {"$limit": int(limit) * 3},  # over-fetch to account for unknown users
    ]
    rows: List[Dict[str, Any]] = []
    try:
        async for r in db.lead_journey_steps.aggregate(pipeline):
            actor_id = r.get("_id")
            if not actor_id:
                continue
            rows.append({
                "actor_id": actor_id,
                "closed_won": int(r.get("closed_won") or 0),
                "tenant_id": r.get("tenant_id"),
            })
    except Exception as exc:
        log.warning(f"[leaderboard_cohort] aggregate failed: {exc}")

    out: List[Dict[str, Any]] = []
    rank = 1
    for r in rows:
        if rank > limit:
            break
        u = None
        try:
            u = await db.users.find_one(
                {"user_id": r["actor_id"]},
                {"_id": 0, "user_id": 1, "full_name": 1, "email": 1, "tenant_id": 1},
            )
        except Exception:
            u = None
        if not u:
            continue
        is_self_tenant = same_tenant and u.get("tenant_id") == tenant_id
        full = (u.get("full_name") or (u.get("email") or "").split("@")[0] or "").strip() or "Asesor"
        if is_self_tenant:
            display = full
        else:
            parts = [p for p in full.split() if p]
            initials = "".join((p[0].upper() for p in parts[:2])) or "A"
            display = f"{initials}."
        out.append({
            "rank": rank,
            "asesor_display": display,
            "closed_won": r["closed_won"],
            "is_self_tenant": is_self_tenant,
        })
        rank += 1
    return out


async def ensure_lead_journey_indexes(db) -> None:
    try:
        await db.lead_journey_steps.create_index([("lead_id", 1), ("occurred_at", -1)])
        await db.lead_journey_steps.create_index([("tenant_id", 1), ("occurred_at", -1)])
        await db.lead_journey_steps.create_index([("step_type", 1), ("occurred_at", -1)])
        await db.lead_journey_steps.create_index("step_id", unique=True)
    except Exception as exc:
        log.warning(f"[ensure_lead_journey_indexes] {exc}")
