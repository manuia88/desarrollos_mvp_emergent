"""Phase 4 Batch 34 · services — Asesor Daily Smart Feed ("Tu día hoy").

Reusa client_insights B33 para next_action + sentiment + heat trend.
Calcula priority_score = health_score × momentum_signed_pct.
Filtra leads con next_action válida (call/whatsapp/email/schedule_visit).
Top N por priority desc.

Cache 60min en db.asesor_daily_feed_cache.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.asesor_daily_feed")

CACHE_TTL_MIN = 60
VALID_ACTIONS = {"call", "whatsapp", "email", "schedule_visit"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt else None


# ─── Generate ─────────────────────────────────────────────────────────────────

async def generate_daily_feed(
    db, asesor_id: str, top_n: int = 5, force: bool = False,
) -> Dict[str, Any]:
    if not force:
        cached = await db.asesor_daily_feed_cache.find_one(
            {"asesor_id": asesor_id}, {"_id": 0},
        )
        if cached:
            ga = cached.get("generated_at")
            if isinstance(ga, datetime):
                if ga.tzinfo is None:
                    ga = ga.replace(tzinfo=timezone.utc)
                age_min = (_now() - ga).total_seconds() / 60.0
                if age_min < CACHE_TTL_MIN:
                    cached["generated_at"] = _iso(ga)
                    cached["from_cache"] = True
                    return cached

    # Pull leads asignados al asesor
    leads = await db.leads.find(
        {"$or": [
            {"assigned_to": asesor_id},
            {"asesor_id": asesor_id},
        ]},
        {"_id": 0, "id": 1, "lead_id": 1, "first_name": 1,
         "last_name": 1, "name": 1, "email": 1, "phone": 1},
    ).limit(60).to_list(60)

    items: List[Dict[str, Any]] = []
    from services.client_insights import compute_client_insights

    for lead in leads:
        lead_id = lead.get("id") or lead.get("lead_id")
        if not lead_id:
            continue
        try:
            insights = await compute_client_insights(db, lead_id, asesor_id=asesor_id)
        except Exception as e:
            log.warning(f"[daily_feed] insights {lead_id}: {e}")
            continue

        next_action = insights.get("next_action") or {}
        action_type = next_action.get("action_type")
        if action_type not in VALID_ACTIONS:
            continue

        health = insights.get("health") or {}
        score = int(health.get("current") or 0)
        trend = int(health.get("trend_7d") or 0)

        # priority_score = health × signed momentum factor
        # momentum_signed_pct: trend_7d como %  (-X o +X) ⇒ factor 1+(trend/100)
        factor = 1.0 + (trend / 100.0)
        priority_score = round(score * factor, 2)

        first = lead.get("first_name") or lead.get("name", "")
        last = lead.get("last_name", "")
        full = f"{first} {last}".strip() or lead.get("email") or lead_id

        # Reason text desde insights
        reason = (next_action.get("text") or "")[:160]

        items.append({
            "lead_id": lead_id,
            "lead_name": full,
            "phone": lead.get("phone", ""),
            "email": lead.get("email", ""),
            "heat_score": score,
            "momentum_signed_pct": trend,
            "recommended_action": {
                "type": action_type,
                "label": _action_label(action_type),
                "payload": _action_payload(action_type, lead, insights),
            },
            "reason_text": reason,
            "priority_score": priority_score,
        })

    # Sort desc · top N
    items.sort(key=lambda x: x["priority_score"], reverse=True)
    top = items[:top_n]

    doc = {
        "asesor_id": asesor_id,
        "generated_at": _now(),
        "ttl_minutes": CACHE_TTL_MIN,
        "items": top,
        "total_leads_evaluated": len(leads),
    }
    await db.asesor_daily_feed_cache.update_one(
        {"asesor_id": asesor_id},
        {"$set": doc},
        upsert=True,
    )
    out = dict(doc)
    out["generated_at"] = _iso(doc["generated_at"])
    out["from_cache"] = False
    return out


def _action_label(at: str) -> str:
    return {
        "call": "Llamar ahora",
        "whatsapp": "Mandar WA",
        "email": "Enviar email",
        "schedule_visit": "Agendar visita",
    }.get(at, "Hacer ahora")


def _action_payload(at: str, lead: Dict[str, Any], insights: Dict[str, Any]) -> Dict[str, Any]:
    if at == "whatsapp":
        phone = (lead.get("phone") or "").replace("+", "").replace(" ", "")
        first = lead.get("first_name") or lead.get("name", "")
        msg = f"Hola {first}, soy tu asesor en DesarrollosMX. ¿Tienes 5 min para platicar?"
        return {"phone": phone, "message": msg}
    if at == "email":
        return {"email": lead.get("email", ""),
                "subject": "Seguimiento DesarrollosMX",
                "template": "asesor_followup"}
    if at == "call":
        return {"phone": lead.get("phone", "")}
    if at == "schedule_visit":
        return {"redirect": f"/asesor/citas?lead_id={lead.get('id') or lead.get('lead_id', '')}"}
    return {}


# ─── Execute action ───────────────────────────────────────────────────────────

async def execute_action(
    db, asesor_id: str, lead_id: str, action_type: str,
) -> Dict[str, Any]:
    if action_type not in VALID_ACTIONS:
        raise ValueError(f"action_type inválido: {action_type}")

    lead = await db.leads.find_one(
        {"$or": [{"id": lead_id}, {"lead_id": lead_id}]},
        {"_id": 0, "first_name": 1, "name": 1, "phone": 1, "email": 1},
    )

    result: Dict[str, Any] = {"action_type": action_type, "executed": True}

    if action_type == "whatsapp":
        phone = (lead or {}).get("phone", "").replace("+", "").replace(" ", "")
        first = (lead or {}).get("first_name") or (lead or {}).get("name", "")
        msg = f"Hola {first}, soy tu asesor en DesarrollosMX. ¿Tienes 5 min para platicar?"
        result["redirect_url"] = (
            f"https://wa.me/{phone}?text={msg}" if phone else ""
        )
    elif action_type == "email":
        result.update(await _send_email_followup(db, lead or {}))
    elif action_type == "schedule_visit":
        result["redirect_url"] = f"/asesor/citas?lead_id={lead_id}"
    elif action_type == "call":
        phone = (lead or {}).get("phone", "")
        result["dial_phone"] = phone

    # Log activity
    try:
        from routes.dev_batch14 import log_activity
        await log_activity(
            db, actor_id=asesor_id, actor_type="asesor",
            action=f"daily_feed_action_{action_type}",
            entity_id=lead_id, entity_type="lead",
            metadata={"action_type": action_type},
        )
    except Exception:
        pass

    return result


async def _send_email_followup(db, lead: Dict[str, Any]) -> Dict[str, Any]:
    """Manda email via send_resend si está configurado, sino marca queued."""
    email = lead.get("email")
    if not email:
        return {"sent": False, "reason": "lead sin email"}

    RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
    if not RESEND_API_KEY:
        return {"sent": False, "queued": True, "reason": "RESEND_API_KEY ausente"}

    import httpx
    first = lead.get("first_name") or lead.get("name", "")
    html = f"""<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#06080F;font-family:'DM Sans',Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
    <div style="text-align:center;margin-bottom:32px;">
      <div style="display:inline-block;padding:8px 20px;background:linear-gradient(90deg,#6366F1,#EC4899);border-radius:9999px;color:#fff;font-weight:700;font-size:13px;">
        DesarrollosMX
      </div>
    </div>
    <h1 style="font-family:Outfit,Arial,sans-serif;font-size:24px;color:#F0EBE0;">
      Hola {first}, te contactamos desde DesarrollosMX
    </h1>
    <p style="color:rgba(240,235,224,0.7);font-size:14px;line-height:1.6;">
      Tu asesor te invita a platicar para mostrarte opciones que pueden interesarte.
      ¿Tienes 5 minutos esta semana?
    </p>
    <p style="color:rgba(240,235,224,0.5);font-size:12px;margin-top:32px;">
      DesarrollosMX · LATAM
    </p>
  </div>
</body></html>"""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {RESEND_API_KEY}",
                         "Content-Type": "application/json"},
                json={
                    "from": "asesor@desarrollosmx.io",
                    "to": [email],
                    "subject": "Te contactamos desde DesarrollosMX",
                    "html": html,
                },
            )
            return {"sent": r.status_code in (200, 201)}
    except Exception as e:
        log.warning(f"[daily_feed] email exception: {e}")
        return {"sent": False, "reason": str(e)[:100]}


async def ensure_daily_feed_indexes(db) -> None:
    await db.asesor_daily_feed_cache.create_index("asesor_id", unique=True)
    await db.asesor_daily_feed_cache.create_index("generated_at")
    log.info("[daily_feed] indexes ensured")
