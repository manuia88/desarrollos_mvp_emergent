"""Phase 4 Batch 4.3 — Reminders + Magic Link + Auto-Progression.

Sub-chunks:
  4.32  Reminders 24h + 2h          APScheduler job + Resend email + delivery_log
  4.33  Magic Link self-service     /api/cita/public/:token (GET, confirm, cancel, reschedule)
  4.34  Auto-progression post-cita  Scheduler + post-action endpoint + followup +24h
"""
from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import re
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request, Query
from pydantic import BaseModel, Field

log = logging.getLogger("dmx.batch4_3")
router = APIRouter(tags=["batch4.3"])


# ─────────────────────────────────────────────────────────────────────────────
# Helpers (reuse patterns from batch4_1)
# ─────────────────────────────────────────────────────────────────────────────
def _now() -> datetime:
    return datetime.now(timezone.utc)


def _uid(pfx: str) -> str:
    return f"{pfx}_{uuid.uuid4().hex[:12]}"


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
    before: Optional[Dict], after: Optional[Dict], request: Optional[Request] = None,
    ml_event: Optional[str] = None, ml_context: Optional[Dict] = None,
) -> None:
    try:
        from audit_log import log_mutation
        await log_mutation(db, actor, action, entity_type, entity_id, before, after, request=request)
    except Exception:
        pass
    if ml_event:
        try:
            from observability import emit_ml_event
            uid = getattr(actor, "user_id", None) or (actor.get("user_id") if isinstance(actor, dict) else "system")
            role = getattr(actor, "role", None) or (actor.get("role") if isinstance(actor, dict) else "system")
            org = getattr(actor, "tenant_id", None) or (actor.get("tenant_id") if isinstance(actor, dict) else "dmx")
            await emit_ml_event(
                db, event_type=ml_event, user_id=uid or "system",
                org_id=org or "dmx", role=role or "system",
                context=ml_context or {}, ai_decision={}, user_action={},
            )
        except Exception:
            pass


async def _push_notif(db, *, user_id: str, org_id: str, ntype: str, payload: Dict, related_id: str = "") -> str:
    nid = _uid("notif")
    doc = {
        "id": nid, "user_id": user_id, "org_id": org_id,
        "type": ntype, "payload": payload, "channels": ["in_app"],
        "related_id": related_id,
        "read_at": None, "dismissed_at": None,
        "created_at": _now().isoformat(),
    }
    try:
        await db.notifications.insert_one(doc)
    except Exception as e:
        log.warning(f"[batch4.3] notif persist failed: {e}")
    return nid


def _fmt_date_legible(dt_iso: str) -> str:
    months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
    try:
        dt = datetime.fromisoformat(dt_iso.replace("Z", "+00:00"))
        return f"{dt.day} {months[dt.month - 1]} {dt.year} · {dt.strftime('%H:%M')}"
    except Exception:
        return dt_iso


def _frontend_url() -> str:
    return os.environ.get("FRONTEND_PUBLIC_URL") or os.environ.get("REACT_APP_BACKEND_URL", "https://desarrollosmx.com").rstrip("/")


# ═════════════════════════════════════════════════════════════════════════════
# 4.32 · REMINDERS — Resend email + delivery log
# ═════════════════════════════════════════════════════════════════════════════
async def _build_ics(apt: Dict, project_name: str, contact_name: str) -> str:
    try:
        dt = datetime.fromisoformat(apt["datetime"].replace("Z", "+00:00")).astimezone(timezone.utc)
    except Exception:
        dt = _now()
    duration = apt.get("duration_minutes", 60)
    dt_end = dt + timedelta(minutes=duration)
    safe_token = re.sub(r"[^a-zA-Z0-9]", "", apt.get("confirmation_token", ""))[:32]
    pname = project_name.replace(",", " ").replace("\n", " ")
    cname = contact_name.replace(",", " ").replace("\n", " ")
    return (
        "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//DesarrollosMX//ES\r\n"
        "BEGIN:VEVENT\r\n"
        f"DTSTART:{dt.strftime('%Y%m%dT%H%M%SZ')}\r\n"
        f"DTEND:{dt_end.strftime('%Y%m%dT%H%M%SZ')}\r\n"
        f"DTSTAMP:{_now().strftime('%Y%m%dT%H%M%SZ')}\r\n"
        f"UID:{safe_token}@desarrollosmx.com\r\n"
        f"SUMMARY:Cita {pname} -- {cname}\r\nLOCATION:{pname}\r\n"
        f"STATUS:CONFIRMED\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"
    )


def _reminder_email_html(*, contact_name: str, project_name: str, fecha_legible: str,
                         modalidad: str, asesor_name: str, magic_url: str, window: str) -> str:
    intro = "tu cita es mañana" if window == "24h" else "tu cita es en 2 horas"
    return f"""
    <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; background: #06080F; color: #F0EBE0;">
      <div style="border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 16px; margin-bottom: 20px;">
        <h1 style="font-family: 'Outfit', Arial, sans-serif; font-weight: 800; font-size: 22px; margin: 0; color: #F0EBE0;">DesarrollosMX</h1>
      </div>
      <p style="margin: 0 0 12px; font-size: 14px; line-height: 1.6;">Hola <strong>{contact_name}</strong>,</p>
      <p style="margin: 0 0 18px; font-size: 14px; line-height: 1.6;">Te recordamos que {intro} en <strong>{project_name}</strong>.</p>
      <table style="width: 100%; border-collapse: collapse; background: rgba(240,235,224,0.04); border-radius: 8px; padding: 12px; margin-bottom: 20px;">
        <tr><td style="padding: 8px 12px; color: rgba(240,235,224,0.62); font-size: 12px;">Desarrollo</td><td style="padding: 8px 12px; font-weight: 600;">{project_name}</td></tr>
        <tr><td style="padding: 8px 12px; color: rgba(240,235,224,0.62); font-size: 12px;">Fecha y hora</td><td style="padding: 8px 12px; font-weight: 600;">{fecha_legible}</td></tr>
        <tr><td style="padding: 8px 12px; color: rgba(240,235,224,0.62); font-size: 12px;">Modalidad</td><td style="padding: 8px 12px;">{modalidad}</td></tr>
        <tr><td style="padding: 8px 12px; color: rgba(240,235,224,0.62); font-size: 12px;">Asesor</td><td style="padding: 8px 12px;">{asesor_name}</td></tr>
      </table>
      <p style="margin: 0 0 16px; font-size: 13px; line-height: 1.6;">¿Necesitas confirmar, reagendar o cancelar?</p>
      <a href="{magic_url}" style="display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #6366F1, #EC4899); color: #fff; text-decoration: none; border-radius: 9999px; font-weight: 700; font-size: 14px;">Gestionar mi cita</a>
      <p style="margin: 22px 0 0; font-size: 11px; color: rgba(240,235,224,0.32);">Este recordatorio fue enviado automáticamente por DesarrollosMX. Si no agendaste esta cita, ignora este mensaje.</p>
    </div>
    """


async def _send_reminder(db, apt: Dict, window: str) -> Dict[str, Any]:
    """Send reminder via Resend email + queue WhatsApp deep-link. Returns delivery result."""
    delivery: List[Dict[str, Any]] = []
    now_iso = _now().isoformat()

    lead = await db.leads.find_one({"id": apt.get("lead_id")}, {"_id": 0})
    contact = (lead or {}).get("contact", {})
    contact_name = contact.get("name", "Cliente")
    contact_email = contact.get("email")
    contact_phone = contact.get("phone")

    # Resolve project & asesor
    project_name = apt.get("project_id", "—")
    try:
        from data_developments import DEVELOPMENTS
        for d in DEVELOPMENTS:
            if d["id"] == apt.get("project_id"):
                project_name = d.get("name", project_name)
                break
    except Exception:
        pass

    asesor_name = "Asesor"
    if apt.get("asesor_id"):
        au = await db.users.find_one({"user_id": apt["asesor_id"]}, {"_id": 0, "name": 1})
        if au:
            asesor_name = au.get("name", "Asesor")

    fecha_legible = _fmt_date_legible(apt.get("datetime", ""))
    magic_url = f"{_frontend_url()}/cita/{apt.get('confirmation_token', '')}"

    # Email channel
    if contact_email:
        resend_key = os.environ.get("RESEND_API_KEY", "")
        if not resend_key:
            delivery.append({"channel": "email", "sent_at": now_iso, "success": False, "error": "RESEND_API_KEY not configured (stub)"})
        else:
            try:
                import resend
                resend.api_key = resend_key
                ics = await _build_ics(apt, project_name, contact_name)
                resend.Emails.send({
                    "from": "citas@desarrollosmx.com",
                    "to": [contact_email],
                    "subject": f"Recordatorio: tu cita en {project_name} - {fecha_legible}",
                    "html": _reminder_email_html(
                        contact_name=contact_name, project_name=project_name,
                        fecha_legible=fecha_legible, modalidad=apt.get("modalidad", "presencial"),
                        asesor_name=asesor_name, magic_url=magic_url, window=window,
                    ),
                    "attachments": [{
                        "filename": f"cita-{re.sub(r'[^a-z0-9]', '-', project_name.lower())}.ics",
                        "content": base64.b64encode(ics.encode()).decode(),
                    }],
                })
                delivery.append({"channel": "email", "sent_at": now_iso, "success": True})
            except Exception as ex:
                delivery.append({"channel": "email", "sent_at": now_iso, "success": False, "error": str(ex)[:200]})

    # WhatsApp deep-link channel (no API push — only generated URL ready to be invoked)
    if contact_phone:
        digits = re.sub(r"\D", "", contact_phone)
        if len(digits) >= 10:
            wa_url = f"https://wa.me/{digits}?text=Recordatorio%20cita%20{project_name}%20{fecha_legible}"
            delivery.append({"channel": "whatsapp", "sent_at": now_iso, "success": True, "wa_url": wa_url})
        else:
            delivery.append({"channel": "whatsapp", "sent_at": now_iso, "success": False, "error": "phone invalid"})

    return {"delivery": delivery, "window": window}


async def check_pending_reminders(db) -> Dict[str, Any]:
    """APScheduler job — runs every 15min. Sends 24h and 2h reminders."""
    now = _now()
    # 24h window: 22h..26h ahead
    t_24_min = (now + timedelta(hours=22)).isoformat()
    t_24_max = (now + timedelta(hours=26)).isoformat()
    # 2h window: 1.5h..2.5h ahead
    t_2_min = (now + timedelta(minutes=90)).isoformat()
    t_2_max = (now + timedelta(minutes=150)).isoformat()

    candidates = await db.appointments.find({
        "status": {"$in": ["agendada", "confirmada"]},
        "$or": [
            {"datetime": {"$gte": t_24_min, "$lte": t_24_max}},
            {"datetime": {"$gte": t_2_min, "$lte": t_2_max}},
        ],
    }, {"_id": 0}).to_list(500)

    sent_24, sent_2, errors = 0, 0, 0
    for apt in candidates:
        try:
            apt_dt = datetime.fromisoformat(apt["datetime"].replace("Z", "+00:00"))
            hours_until = (apt_dt - now).total_seconds() / 3600.0
            reminders = apt.get("reminders") or {}

            window = None
            if 22 <= hours_until <= 26 and not reminders.get("sent_24h"):
                window = "24h"
            elif 1.5 <= hours_until <= 2.5 and not reminders.get("sent_2h"):
                window = "2h"
            if not window:
                continue

            result = await _send_reminder(db, apt, window)
            new_log = list(reminders.get("delivery_log") or []) + result["delivery"]
            update = {
                f"reminders.sent_{window}": True,
                "reminders.delivery_log": new_log,
                "updated_at": now.isoformat(),
            }
            await db.appointments.update_one({"id": apt["id"]}, {"$set": update})

            await _safe_audit_ml(
                db, {"user_id": "system", "role": "system", "tenant_id": apt.get("dev_org_id", "dmx")},
                action="update", entity_type="appointment_reminder", entity_id=apt["id"],
                before=None, after={"window": window, "channels": [d["channel"] for d in result["delivery"]]},
                ml_event="reminder_sent",
                ml_context={"window": window, "appointment_id": apt["id"], "lead_id": apt.get("lead_id")},
            )
            if window == "24h":
                sent_24 += 1
            else:
                sent_2 += 1
        except Exception as e:
            log.warning(f"[batch4.3] reminder error apt={apt.get('id')}: {e}")
            errors += 1

    summary = {"checked": len(candidates), "sent_24h": sent_24, "sent_2h": sent_2, "errors": errors}
    log.info(f"[batch4.3] reminders run: {summary}")
    return summary


@router.post("/api/internal/reminders/trigger")
async def manual_reminder_trigger(request: Request):
    """Superadmin-only debug trigger — fires reminder for one appointment."""
    user = await _auth(request)
    if user.role != "superadmin":
        raise HTTPException(403, "Solo superadmin")
    body = await request.json()
    apt_id = body.get("appointment_id")
    if not apt_id:
        raise HTTPException(422, "appointment_id requerido")
    db = _db(request)
    apt = await db.appointments.find_one({"id": apt_id}, {"_id": 0})
    if not apt:
        raise HTTPException(404, "Cita no encontrada")
    window = body.get("window", "24h")
    result = await _send_reminder(db, apt, window)
    new_log = list((apt.get("reminders") or {}).get("delivery_log") or []) + result["delivery"]
    await db.appointments.update_one(
        {"id": apt_id},
        {"$set": {f"reminders.sent_{window}": True, "reminders.delivery_log": new_log}},
    )
    return {"ok": True, "appointment_id": apt_id, "window": window, "delivery": result["delivery"]}


# ═════════════════════════════════════════════════════════════════════════════
# 4.33 · MAGIC LINK SELF-SERVICE
# ═════════════════════════════════════════════════════════════════════════════
@router.get("/api/cita/public/{token}")
async def public_cita_view(token: str, request: Request):
    db = _db(request)
    apt = await db.appointments.find_one({"confirmation_token": token}, {"_id": 0})
    if not apt:
        raise HTTPException(404, "Cita no encontrada o token inválido")
    if apt["status"] in ("cancelada", "no_show", "realizada", "reagendada"):
        raise HTTPException(410, f"Cita ya {apt['status']}, no se puede modificar")

    lead = await db.leads.find_one({"id": apt.get("lead_id")}, {"_id": 0})
    contact = (lead or {}).get("contact", {})
    project_name = apt.get("project_id", "—")
    try:
        from data_developments import DEVELOPMENTS
        for d in DEVELOPMENTS:
            if d["id"] == apt.get("project_id"):
                project_name = d.get("name", project_name)
                break
    except Exception:
        pass
    asesor_name = "Asesor"
    asesor_phone = None
    if apt.get("asesor_id"):
        au = await db.users.find_one({"user_id": apt["asesor_id"]}, {"_id": 0, "name": 1, "phone": 1})
        if au:
            asesor_name = au.get("name", "Asesor")
            asesor_phone = au.get("phone")
    return {
        "appointment_id": apt["id"],
        "project_id": apt["project_id"],
        "project_name": project_name,
        "datetime": apt["datetime"],
        "datetime_legible": _fmt_date_legible(apt["datetime"]),
        "duration_minutes": apt.get("duration_minutes", 60),
        "modalidad": apt.get("modalidad", "presencial"),
        "status": apt["status"],
        "asesor_name": asesor_name,
        "asesor_phone": asesor_phone,
        "contact_name": contact.get("name", "Cliente"),
    }


def _client_action_entry(action: str, request: Request, extra: Optional[Dict] = None) -> Dict:
    return {
        "action": action,
        "timestamp": _now().isoformat(),
        "ip": (request.headers.get("x-forwarded-for", "") or "").split(",")[0].strip() or None,
        "user_agent": request.headers.get("user-agent", ""),
        **(extra or {}),
    }


async def _kanban_lead_status(db, lead_id: str, new_status: str, ml_event: str, actor_id: str = "client_via_token"):
    """Sync lead.status to a new value (auto-progression)."""
    if not lead_id:
        return
    now_iso = _now().isoformat()
    await db.leads.update_one(
        {"id": lead_id},
        {"$set": {"status": new_status, "updated_at": now_iso, "last_activity_at": now_iso}},
    )


@router.post("/api/cita/public/{token}/confirm")
async def public_cita_confirm(token: str, request: Request):
    db = _db(request)
    apt = await db.appointments.find_one({"confirmation_token": token}, {"_id": 0})
    if not apt:
        raise HTTPException(404, "Cita no encontrada")
    if apt["status"] in ("cancelada", "no_show", "realizada", "reagendada"):
        raise HTTPException(410, f"Cita ya {apt['status']}")

    entry = _client_action_entry("confirmed", request)
    new_log = list(apt.get("client_actions") or []) + [entry]
    await db.appointments.update_one(
        {"id": apt["id"]},
        {"$set": {"status": "confirmada", "client_actions": new_log, "updated_at": _now().isoformat()}},
    )

    actor = {"user_id": "client_via_token", "role": "public", "tenant_id": apt.get("dev_org_id", "dmx")}
    await _safe_audit_ml(
        db, actor, action="update", entity_type="appointment_client_confirm", entity_id=apt["id"],
        before={"status": apt["status"]}, after={"status": "confirmada"}, request=request,
        ml_event="cita_confirmed_by_client",
        ml_context={"appointment_id": apt["id"], "lead_id": apt.get("lead_id")},
    )

    # Notify asesor
    if apt.get("asesor_id"):
        lead = await db.leads.find_one({"id": apt.get("lead_id")}, {"_id": 0, "contact": 1})
        cn = (lead or {}).get("contact", {}).get("name", "Cliente")
        await _push_notif(
            db, user_id=apt["asesor_id"], org_id=apt.get("dev_org_id", "dmx"),
            ntype="cita_client_confirmed",
            payload={"appointment_id": apt["id"], "contact_name": cn, "datetime": apt["datetime"]},
            related_id=apt["id"],
        )
    return {"ok": True, "status": "confirmada"}


class CancelBody(BaseModel):
    reason: Optional[str] = Field(None, pattern=r"^(cambio_presupuesto|encontro_otra|imprevisto|otro)$")
    notes: Optional[str] = None


@router.post("/api/cita/public/{token}/cancel")
async def public_cita_cancel(token: str, payload: CancelBody, request: Request):
    db = _db(request)
    apt = await db.appointments.find_one({"confirmation_token": token}, {"_id": 0})
    if not apt:
        raise HTTPException(404, "Cita no encontrada")
    if apt["status"] in ("cancelada", "no_show", "realizada", "reagendada"):
        raise HTTPException(410, f"Cita ya {apt['status']}")

    entry = _client_action_entry("cancelled", request, {"reason": payload.reason, "notes": payload.notes})
    new_log = list(apt.get("client_actions") or []) + [entry]
    await db.appointments.update_one(
        {"id": apt["id"]},
        {"$set": {
            "status": "cancelada",
            "cancel_reason": payload.reason or "no_especificada",
            "client_actions": new_log,
            "updated_at": _now().isoformat(),
        }},
    )

    actor = {"user_id": "client_via_token", "role": "public", "tenant_id": apt.get("dev_org_id", "dmx")}
    await _safe_audit_ml(
        db, actor, action="update", entity_type="appointment_client_cancel", entity_id=apt["id"],
        before={"status": apt["status"]}, after={"status": "cancelada", "reason": payload.reason},
        request=request,
        ml_event="cita_cancelled_by_client",
        ml_context={"appointment_id": apt["id"], "lead_id": apt.get("lead_id"), "reason": payload.reason},
    )

    # Notify asesor + dev_admin
    payload_n = {"appointment_id": apt["id"], "reason": payload.reason, "notes": payload.notes}
    if apt.get("asesor_id"):
        await _push_notif(db, user_id=apt["asesor_id"], org_id=apt.get("dev_org_id", "dmx"),
                          ntype="cita_client_cancelled", payload=payload_n, related_id=apt["id"])
    dev_org = apt.get("dev_org_id")
    if dev_org and dev_org != "default":
        admin = await db.users.find_one({"tenant_id": dev_org, "role": "developer_admin"}, {"_id": 0, "user_id": 1})
        if admin:
            await _push_notif(db, user_id=admin["user_id"], org_id=dev_org,
                              ntype="cita_client_cancelled", payload=payload_n, related_id=apt["id"])
    return {"ok": True, "status": "cancelada", "reason": payload.reason}


class RescheduleBody(BaseModel):
    new_datetime: str
    reason: Optional[str] = None


@router.post("/api/cita/public/{token}/reschedule")
async def public_cita_reschedule(token: str, payload: RescheduleBody, request: Request):
    db = _db(request)
    apt = await db.appointments.find_one({"confirmation_token": token}, {"_id": 0})
    if not apt:
        raise HTTPException(404, "Cita no encontrada")
    if apt["status"] in ("cancelada", "no_show", "realizada", "reagendada"):
        raise HTTPException(410, f"Cita ya {apt['status']}")

    # Validate new datetime is future
    try:
        new_dt = datetime.fromisoformat(payload.new_datetime.replace("Z", "+00:00"))
        if new_dt <= _now():
            raise HTTPException(422, "La nueva fecha debe ser futura")
    except ValueError:
        raise HTTPException(422, "new_datetime inválido")

    # Mark old appointment as reagendada
    entry = _client_action_entry("rescheduled", request, {"new_datetime": payload.new_datetime, "reason": payload.reason})
    new_log = list(apt.get("client_actions") or []) + [entry]
    now_iso = _now().isoformat()
    new_token = uuid.uuid4().hex[:24]

    await db.appointments.update_one(
        {"id": apt["id"]},
        {"$set": {
            "status": "reagendada",
            "reschedule_reason": payload.reason or "cliente",
            "client_actions": new_log,
            "rescheduled_to": new_token,
            "updated_at": now_iso,
        }},
    )

    # Create new appointment (linked to old)
    new_apt = {
        "id": _uid("apt"),
        "lead_id": apt.get("lead_id"),
        "project_id": apt["project_id"],
        "dev_org_id": apt.get("dev_org_id"),
        "asesor_id": apt.get("asesor_id"),
        "inmobiliaria_id": apt.get("inmobiliaria_id"),
        "datetime": payload.new_datetime,
        "duration_minutes": apt.get("duration_minutes", 60),
        "modalidad": apt.get("modalidad", "presencial"),
        "status": "agendada",
        "confirmation_token": new_token,
        "rescheduled_from": apt["id"],
        "reminders": {"sent_24h": False, "sent_2h": False, "delivery_log": []},
        "cancel_reason": None, "reschedule_reason": None, "client_actions": [],
        "created_at": now_iso, "updated_at": now_iso,
    }
    await db.appointments.insert_one(new_apt)
    new_apt.pop("_id", None)

    actor = {"user_id": "client_via_token", "role": "public", "tenant_id": apt.get("dev_org_id", "dmx")}
    await _safe_audit_ml(
        db, actor, action="update", entity_type="appointment_client_reschedule", entity_id=apt["id"],
        before={"datetime": apt["datetime"]}, after={"datetime": payload.new_datetime},
        request=request,
        ml_event="cita_rescheduled_by_client",
        ml_context={"old_appointment_id": apt["id"], "new_appointment_id": new_apt["id"], "lead_id": apt.get("lead_id")},
    )

    if apt.get("asesor_id"):
        lead = await db.leads.find_one({"id": apt.get("lead_id")}, {"_id": 0, "contact": 1})
        cn = (lead or {}).get("contact", {}).get("name", "Cliente")
        await _push_notif(
            db, user_id=apt["asesor_id"], org_id=apt.get("dev_org_id", "dmx"),
            ntype="cita_client_rescheduled",
            payload={"old_appointment_id": apt["id"], "new_appointment_id": new_apt["id"],
                     "new_datetime": payload.new_datetime, "contact_name": cn},
            related_id=new_apt["id"],
        )
    return {"ok": True, "old_appointment_id": apt["id"], "new_appointment_id": new_apt["id"], "new_token": new_token}


# ═════════════════════════════════════════════════════════════════════════════
# 4.34 · AUTO-PROGRESSION KANBAN POST-CITA
# ═════════════════════════════════════════════════════════════════════════════
async def check_post_cita_progression(db) -> Dict[str, int]:
    """APScheduler job — runs every 15min. Notifies asesor 30min after cita ends."""
    now = _now()
    cutoff = (now - timedelta(minutes=30)).isoformat()
    candidates = await db.appointments.find({
        "status": {"$in": ["agendada", "confirmada"]},
        "datetime": {"$lte": cutoff},
        "post_check_notified": {"$ne": True},
    }, {"_id": 0}).to_list(500)

    notified = 0
    for apt in candidates:
        if not apt.get("asesor_id"):
            continue
        lead = await db.leads.find_one({"id": apt.get("lead_id")}, {"_id": 0, "contact": 1})
        cn = (lead or {}).get("contact", {}).get("name", "Cliente")
        await _push_notif(
            db, user_id=apt["asesor_id"], org_id=apt.get("dev_org_id", "dmx"),
            ntype="cita_post_check",
            payload={
                "appointment_id": apt["id"],
                "contact_name": cn,
                "title": f"¿Cómo te fue con {cn}?",
                "datetime": apt["datetime"],
                "actions": [
                    {"label": "Sí, se realizó", "action": "mark_realizada"},
                    {"label": "No-show", "action": "mark_noshow"},
                    {"label": "Reagendar", "action": "open_reschedule_drawer"},
                ],
            },
            related_id=apt["id"],
        )
        await db.appointments.update_one(
            {"id": apt["id"]}, {"$set": {"post_check_notified": True, "post_check_at": now.isoformat()}},
        )
        notified += 1

    summary = {"candidates": len(candidates), "notified": notified}
    log.info(f"[batch4.3] post-cita progression: {summary}")
    return summary


async def check_followup_proposals(db) -> Dict[str, int]:
    """Run every 15min. 24h after status='realizada' send followup notification."""
    now = _now()
    cutoff_min = (now - timedelta(hours=25)).isoformat()
    cutoff_max = (now - timedelta(hours=24)).isoformat()
    candidates = await db.appointments.find({
        "status": "realizada",
        "post_realizada_at": {"$gte": cutoff_min, "$lte": cutoff_max},
        "followup_notified": {"$ne": True},
    }, {"_id": 0}).to_list(500)
    notified = 0
    for apt in candidates:
        if not apt.get("asesor_id"):
            continue
        lead = await db.leads.find_one({"id": apt.get("lead_id")}, {"_id": 0, "contact": 1})
        cn = (lead or {}).get("contact", {}).get("name", "Cliente")
        await _push_notif(
            db, user_id=apt["asesor_id"], org_id=apt.get("dev_org_id", "dmx"),
            ntype="cita_followup",
            payload={
                "appointment_id": apt["id"], "lead_id": apt.get("lead_id"), "contact_name": cn,
                "title": f"¿Hay propuesta para {cn}?",
                "actions": [
                    {"label": "Sí, propuesta enviada", "action": "has_proposal_yes"},
                    {"label": "Aún no", "action": "has_proposal_no"},
                ],
            },
            related_id=apt["id"],
        )
        await db.appointments.update_one(
            {"id": apt["id"]}, {"$set": {"followup_notified": True}},
        )
        notified += 1
    return {"candidates": len(candidates), "notified": notified}


class PostActionBody(BaseModel):
    action: str  # 'realizada' | 'noshow' | 'reschedule'
    new_datetime: Optional[str] = None
    reason: Optional[str] = None


@router.post("/api/cita/{apt_id}/post-action")
async def cita_post_action(apt_id: str, payload: PostActionBody, request: Request):
    user = await _auth(request)
    db = _db(request)
    apt = await db.appointments.find_one({"id": apt_id}, {"_id": 0})
    if not apt:
        raise HTTPException(404, "Cita no encontrada")

    is_own = apt.get("asesor_id") == user.user_id
    is_admin = user.role in ("developer_admin", "superadmin")
    if not (is_own or is_admin):
        raise HTTPException(403, "Solo el asesor asignado o admin pueden ejecutar post-action")

    now_iso = _now().isoformat()

    if payload.action == "realizada":
        await db.appointments.update_one(
            {"id": apt_id},
            {"$set": {"status": "realizada", "post_realizada_at": now_iso, "updated_at": now_iso}},
        )
        if apt.get("lead_id"):
            await _kanban_lead_status(db, apt["lead_id"], "visita_realizada", "lead_auto_progress")
        await _safe_audit_ml(
            db, user, action="update", entity_type="appointment_post_realizada", entity_id=apt_id,
            before={"status": apt["status"]}, after={"status": "realizada"}, request=request,
            ml_event="cita_realizada_by_asesor",
            ml_context={"appointment_id": apt_id, "lead_id": apt.get("lead_id")},
        )
        return {"ok": True, "status": "realizada", "lead_status": "visita_realizada"}

    if payload.action == "noshow":
        await db.appointments.update_one(
            {"id": apt_id},
            {"$set": {"status": "no_show", "updated_at": now_iso}},
        )
        if apt.get("lead_id"):
            await db.leads.update_one(
                {"id": apt["lead_id"]},
                {"$set": {"status": "cerrado_perdido", "lost_reason": "no_show",
                          "updated_at": now_iso, "last_activity_at": now_iso}},
            )
        await _safe_audit_ml(
            db, user, action="update", entity_type="appointment_post_noshow", entity_id=apt_id,
            before={"status": apt["status"]}, after={"status": "no_show"}, request=request,
            ml_event="cita_noshow",
            ml_context={"appointment_id": apt_id, "lead_id": apt.get("lead_id")},
        )
        return {"ok": True, "status": "no_show", "lead_status": "cerrado_perdido"}

    if payload.action == "reschedule":
        if not payload.new_datetime:
            raise HTTPException(422, "new_datetime requerido para reschedule")
        try:
            new_dt = datetime.fromisoformat(payload.new_datetime.replace("Z", "+00:00"))
            if new_dt <= _now():
                raise HTTPException(422, "La nueva fecha debe ser futura")
        except ValueError:
            raise HTTPException(422, "new_datetime inválido")
        new_token = uuid.uuid4().hex[:24]
        await db.appointments.update_one(
            {"id": apt_id},
            {"$set": {"status": "reagendada", "reschedule_reason": payload.reason or "asesor",
                      "rescheduled_to": new_token, "updated_at": now_iso}},
        )
        new_apt = {
            "id": _uid("apt"), "lead_id": apt.get("lead_id"), "project_id": apt["project_id"],
            "dev_org_id": apt.get("dev_org_id"), "asesor_id": apt.get("asesor_id"),
            "inmobiliaria_id": apt.get("inmobiliaria_id"),
            "datetime": payload.new_datetime, "duration_minutes": apt.get("duration_minutes", 60),
            "modalidad": apt.get("modalidad", "presencial"), "status": "agendada",
            "confirmation_token": new_token, "rescheduled_from": apt_id,
            "reminders": {"sent_24h": False, "sent_2h": False, "delivery_log": []},
            "cancel_reason": None, "reschedule_reason": None, "client_actions": [],
            "created_at": now_iso, "updated_at": now_iso,
        }
        await db.appointments.insert_one(new_apt)
        new_apt.pop("_id", None)
        await _safe_audit_ml(
            db, user, action="update", entity_type="appointment_post_reschedule", entity_id=apt_id,
            before={"datetime": apt["datetime"]}, after={"datetime": payload.new_datetime},
            request=request,
            ml_event="cita_rescheduled_by_asesor",
            ml_context={"old": apt_id, "new": new_apt["id"]},
        )
        return {"ok": True, "old_appointment_id": apt_id, "new_appointment_id": new_apt["id"]}

    raise HTTPException(422, f"action inválida: {payload.action}")


class FollowupBody(BaseModel):
    has_proposal: bool
    notes: Optional[str] = None


@router.post("/api/leads/{lead_id}/post-realizada-followup")
async def lead_followup(lead_id: str, payload: FollowupBody, request: Request):
    user = await _auth(request)
    db = _db(request)
    lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "Lead no encontrado")
    if lead.get("assigned_to") != user.user_id and user.role not in ("developer_admin", "superadmin"):
        raise HTTPException(403, "Solo el asesor asignado o admin puede responder")

    now_iso = _now().isoformat()
    update: Dict[str, Any] = {"updated_at": now_iso, "last_activity_at": now_iso}
    if payload.has_proposal:
        update["status"] = "propuesta"
    if payload.notes:
        new_notes = list(lead.get("notes") or []) + [{
            "user_id": user.user_id, "text": payload.notes, "created_at": now_iso,
        }]
        update["notes"] = new_notes
    await db.leads.update_one({"id": lead_id}, {"$set": update})

    await _safe_audit_ml(
        db, user, action="update", entity_type="lead_followup", entity_id=lead_id,
        before={"status": lead.get("status")},
        after={"status": update.get("status", lead.get("status")), "has_proposal": payload.has_proposal},
        request=request,
        ml_event="cita_followup_response",
        ml_context={"lead_id": lead_id, "has_proposal": payload.has_proposal},
    )
    return {"ok": True, "lead_id": lead_id, "has_proposal": payload.has_proposal,
            "new_status": update.get("status", lead.get("status"))}


# ═════════════════════════════════════════════════════════════════════════════
# Indexes + scheduler hook
# ═════════════════════════════════════════════════════════════════════════════
async def ensure_batch4_3_indexes(db) -> None:
    await db.appointments.create_index([("status", 1), ("datetime", 1)], background=True)
    await db.appointments.create_index([("post_check_notified", 1), ("status", 1)], background=True)
    await db.appointments.create_index([("post_realizada_at", 1), ("followup_notified", 1)], background=True)
    log.info("[batch4.3] indexes ensured")


# ─────────────────────────────────────────────────────────────────────────────
# Universal notifications endpoint (any role)
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/api/notifications")
async def list_notifications_universal(request: Request, unread_only: bool = False, limit: int = 50, type: Optional[str] = None):
    user = await _auth(request)
    db = _db(request)
    org = getattr(user, "tenant_id", None) or "default"
    q: Dict[str, Any] = {"user_id": user.user_id, "org_id": org}
    if unread_only:
        q["read_at"] = None
    if type:
        q["type"] = type
    items = await db.notifications.find(q, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    unread = await db.notifications.count_documents({"user_id": user.user_id, "org_id": org, "read_at": None})
    return {"items": items, "unread_count": unread}


@router.post("/api/notifications/{nid}/dismiss")
async def dismiss_notification(nid: str, request: Request):
    user = await _auth(request)
    db = _db(request)
    org = getattr(user, "tenant_id", None) or "default"
    r = await db.notifications.update_one(
        {"id": nid, "user_id": user.user_id, "org_id": org},
        {"$set": {"dismissed_at": _now().isoformat(), "read_at": _now().isoformat()}},
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Notificación no encontrada")
    return {"ok": True, "id": nid}


def register_batch4_3_jobs(scheduler, db):
    """Add reminder + post-cita jobs to the existing scheduler. Called from server.py startup."""
    from apscheduler.triggers.cron import CronTrigger
    TZ = "America/Mexico_City"
    scheduler.add_job(
        check_pending_reminders, CronTrigger(minute="*/15", timezone=TZ),
        args=[db], id="cita_reminders_15min", replace_existing=True,
        misfire_grace_time=300,
    )
    scheduler.add_job(
        check_post_cita_progression, CronTrigger(minute="*/15", timezone=TZ),
        args=[db], id="cita_post_progression_15min", replace_existing=True,
        misfire_grace_time=300,
    )
    scheduler.add_job(
        check_followup_proposals, CronTrigger(minute="*/15", timezone=TZ),
        args=[db], id="cita_followup_15min", replace_existing=True,
        misfire_grace_time=300,
    )
    log.info("[batch4.3] 3 cron jobs registered")
