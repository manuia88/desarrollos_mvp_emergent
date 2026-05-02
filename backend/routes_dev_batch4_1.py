"""Phase 4 Batch 4.1 — Cita Registration + DMX Inmobiliaria + Anti-fraude.

Sub-chunks:
  4.26  Cita Registration Form   (appointments + project_slots)
  4.27  DMX Inmobiliaria + Auto-routing (inmobiliarias + inmobiliaria_internal_users)
  4.28  Anti-duplicate + Anti-fraude + WA Templates (6-layer validation + rapidfuzz)
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import logging
import os
import re
import secrets
import unicodedata
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Request, Query
from pydantic import BaseModel, Field

log = logging.getLogger("dmx.batch4_1")

router = APIRouter(tags=["batch4.1"])

# ─────────────────────────────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────────────────────────────
APPT_STATUSES = ["agendada", "confirmada", "realizada", "cancelada", "no_show", "reagendada"]
MODALIDADES = ["presencial", "videollamada"]
PAYMENT_METHODS = ["recursos_propios", "credito_hipotecario", "infonavit", "cofinavit"]
ORIGIN_TYPES = ["public_unassigned", "broker_external", "inmobiliaria_lead", "dev_inhouse", "dev_direct"]
INM_ROLES = ["admin", "director", "asesor", "marketing"]
CLOSED_STATUSES = {"cerrado_ganado", "cerrado_perdido"}
DAYS_ES = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"]
MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]

NON_CDMX_AREA_CODES = {"33", "32", "81", "222", "442", "477", "614", "667", "744", "998", "999"}

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────
def _now() -> datetime:
    return datetime.now(timezone.utc)


def _uid(pfx: str) -> str:
    return f"{pfx}_{uuid.uuid4().hex[:12]}"


def _db(request: Request):
    return request.app.state.db


async def _auth_dev(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    if user.role not in ("developer_admin", "developer_member", "superadmin"):
        raise HTTPException(403, "Rol no autorizado")
    return user


async def _optional_auth(request: Request):
    """Returns user or None for optional-auth endpoints."""
    try:
        from server import get_current_user
        return await get_current_user(request)
    except Exception:
        return None


def _tenant(user) -> str:
    if user is None:
        return "public"
    return getattr(user, "tenant_id", None) or getattr(user, "org_id", None) or "default"


async def _safe_audit_ml(
    db, user_or_actor, *, action: str, entity_type: str, entity_id: str,
    before: Optional[Dict], after: Optional[Dict],
    request: Request,
    ml_event: Optional[str] = None, ml_context: Optional[Dict] = None,
) -> None:
    try:
        from audit_log import log_mutation
        await log_mutation(db, user_or_actor, action, entity_type, entity_id, before, after, request=request)
    except Exception:
        pass
    if ml_event:
        try:
            from observability import emit_ml_event
            uid = getattr(user_or_actor, "user_id", None) or (user_or_actor.get("user_id") if isinstance(user_or_actor, dict) else "anon")
            role = getattr(user_or_actor, "role", None) or (user_or_actor.get("role") if isinstance(user_or_actor, dict) else "anon")
            org = _tenant(user_or_actor)
            await emit_ml_event(
                db, event_type=ml_event,
                user_id=uid or "anon", org_id=org, role=role or "anon",
                context=ml_context or {}, ai_decision={}, user_action={},
            )
        except Exception:
            pass


async def _push_notification(db, *, user_id: str, org_id: str, ntype: str, payload: Dict) -> None:
    doc = {
        "id": _uid("notif"),
        "user_id": user_id,
        "org_id": org_id,
        "type": ntype,
        "payload": payload,
        "channels": ["in_app"],
        "read_at": None,
        "created_at": _now().isoformat(),
    }
    try:
        await db.notifications.insert_one(doc)
    except Exception:
        pass


# ─── Normalization helpers ────────────────────────────────────────────────────
def _normalize_phone(phone: Optional[str]) -> str:
    if not phone:
        return ""
    digits = re.sub(r"\D", "", phone)
    if digits.startswith("521") and len(digits) >= 13:
        digits = digits[3:]
    elif digits.startswith("52") and len(digits) >= 12:
        digits = digits[2:]
    return digits[-10:] if len(digits) >= 10 else digits


def _normalize_email(email: Optional[str]) -> str:
    return (email or "").lower().strip()


def _strip_accents(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", text.lower()) if unicodedata.category(c) != "Mn")


def _normalize_name(name: Optional[str]) -> str:
    return re.sub(r"\s+", " ", _strip_accents(name or "")).strip()


def _client_global_id(phone_norm: str, email_norm: str) -> str:
    key = f"{phone_norm}|{email_norm}"
    return hashlib.sha256(key.encode()).hexdigest()[:32]


def _phone_area_code(phone_norm: str) -> str:
    if len(phone_norm) < 10:
        return ""
    for prefix3 in {"998", "999", "222", "442", "477", "614", "667", "744"}:
        if phone_norm.startswith(prefix3):
            return prefix3
    return phone_norm[:2]


# ─── Date formatting ─────────────────────────────────────────────────────────
def _fmt_date_es(dt_str: str) -> str:
    try:
        dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
        return f"{dt.day} {MONTHS_ES[dt.month - 1]} {dt.year}"
    except Exception:
        return dt_str


def _fmt_time(dt_str: str) -> str:
    try:
        dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
        return dt.strftime("%H:%M")
    except Exception:
        return ""


def _fmt_price(val: Optional[float]) -> str:
    if val is None:
        return "N/D"
    return f"{val:,.0f}"


def _fmt_payment_methods(methods: List[str]) -> str:
    labels = {
        "recursos_propios": "Recursos propios",
        "credito_hipotecario": "Crédito hipotecario",
        "infonavit": "Infonavit",
        "cofinavit": "Cofinavit",
    }
    return " · ".join(labels.get(m, m) for m in methods) if methods else "No especificado"


# ─── .ics calendar invite ─────────────────────────────────────────────────────
def _generate_ics(apt_datetime: str, duration_min: int, project_name: str,
                  contact_name: str, confirmation_token: str, modalidad: str) -> str:
    try:
        dt = datetime.fromisoformat(apt_datetime.replace("Z", "+00:00"))
    except Exception:
        dt = _now()
    dt_utc = dt.astimezone(timezone.utc)
    dt_end_utc = dt_utc + timedelta(minutes=max(30, duration_min))
    dtstart = dt_utc.strftime("%Y%m%dT%H%M%SZ")
    dtend = dt_end_utc.strftime("%Y%m%dT%H%M%SZ")
    dtstamp = _now().strftime("%Y%m%dT%H%M%SZ")
    modal_label = "Videollamada" if modalidad == "videollamada" else "Presencial"
    safe_token = re.sub(r"[^a-zA-Z0-9]", "", confirmation_token)[:32]
    pname = project_name.replace(",", " ").replace("\n", " ")
    cname = contact_name.replace(",", " ").replace("\n", " ")
    return (
        "BEGIN:VCALENDAR\r\nVERSION:2.0\r\n"
        "PRODID:-//DesarrollosMX//DMX Citas//ES\r\nCALSCALE:GREGORIAN\r\n"
        "BEGIN:VEVENT\r\n"
        f"DTSTART:{dtstart}\r\nDTEND:{dtend}\r\nDTSTAMP:{dtstamp}\r\n"
        f"UID:{safe_token}@desarrollosmx.com\r\n"
        f"SUMMARY:Cita {pname} -- {cname}\r\n"
        f"DESCRIPTION:Modalidad: {modal_label}\\nDesarrollo: {pname}\\nRegistrada en DesarrollosMX\r\n"
        f"LOCATION:{pname}\r\nSTATUS:CONFIRMED\r\n"
        "BEGIN:VALARM\r\nTRIGGER:-PT24H\r\nACTION:DISPLAY\r\n"
        f"DESCRIPTION:Recordatorio cita {pname} manana\r\nEND:VALARM\r\n"
        "BEGIN:VALARM\r\nTRIGGER:-PT2H\r\nACTION:DISPLAY\r\n"
        f"DESCRIPTION:Recordatorio cita {pname} en 2 horas\r\nEND:VALARM\r\n"
        "END:VEVENT\r\nEND:VCALENDAR\r\n"
    )


async def _send_cita_email(
    db, *, to_email: str, to_name: str, project_name: str,
    apt_datetime: str, duration_min: int, modalidad: str, confirmation_token: str,
) -> None:
    resend_key = os.environ.get("RESEND_API_KEY", "")
    if not resend_key or not to_email:
        return
    try:
        import resend
        resend.api_key = resend_key
        ics_content = _generate_ics(apt_datetime, duration_min, project_name, to_name, confirmation_token, modalidad)
        ics_b64 = base64.b64encode(ics_content.encode()).decode()
        fecha_es = f"{_fmt_date_es(apt_datetime)} a las {_fmt_time(apt_datetime)}"
        modal_label = "videollamada" if modalidad == "videollamada" else "presencial"
        resend.Emails.send({
            "from": "citas@desarrollosmx.com",
            "to": [to_email],
            "subject": f"Cita confirmada: {project_name}",
            "html": (
                f"<p>Hola {to_name},</p>"
                f"<p>Tu cita <strong>{modal_label}</strong> para <strong>{project_name}</strong> "
                f"está agendada para el <strong>{fecha_es}</strong>.</p>"
                f"<p>Adjuntamos el archivo de calendario (.ics) para que puedas agregar el evento.</p>"
                f"<p>Recibirás recordatorios 24h y 2h antes de la cita.</p>"
                f"<p>— DesarrollosMX</p>"
            ),
            "attachments": [{
                "filename": f"cita-{re.sub(r'[^a-z0-9]', '-', project_name.lower())}.ics",
                "content": ics_b64,
            }],
        })
    except Exception as ex:
        log.warning(f"[cita] Resend failed: {ex}")


# ─── WA template builders ─────────────────────────────────────────────────────
def _build_wa_template_1(*, dev_admin_name: str, dev_phone: str, project_name: str,
                          contact: Dict, apt_datetime: str, modalidad: str,
                          presupuesto: Dict, payment_methods: List[str], asesor_name: str) -> str:
    text = (
        f"Hola {dev_admin_name}! 👋\n"
        f"Acabo de agendar una cita para {project_name}:\n"
        f"📋 Cliente: {contact.get('name', '')}\n"
        f"📞 {contact.get('phone', '')} · 📧 {contact.get('email', '')}\n"
        f"📅 {_fmt_date_es(apt_datetime)} · 🕐 {_fmt_time(apt_datetime)} · {modalidad}\n"
        f"💰 Presupuesto: ${_fmt_price(presupuesto.get('min'))} – ${_fmt_price(presupuesto.get('max'))} MXN\n"
        f"💳 Pago: {_fmt_payment_methods(payment_methods)}\n"
        f"👤 Asesor: {asesor_name}\n"
        "¿Podemos confirmar disponibilidad y bloquear la unidad?\n"
        "Si necesitas mover fecha o algún detalle del cliente, avísame por aquí. 🙌\n"
        "— Enviado desde DesarrollosMX"
    )
    phone_digits = re.sub(r"\D", "", dev_phone)
    return f"https://wa.me/{phone_digits}?text={quote(text)}"


def _build_wa_template_2(*, dev_admin_name: str, dev_phone: str, project_name: str,
                          contact: Dict, apt_datetime: str,
                          presupuesto: Dict, asesor_name: str) -> str:
    text = (
        f"Hola {dev_admin_name}! 👋\n"
        f"Intenté registrar un cliente para {project_name} pero el sistema detectó posible coincidencia con un registro previo.\n"
        f"📋 Cliente: {contact.get('name', '')}\n"
        f"📞 {contact.get('phone', '')} · 📧 {contact.get('email', '')}\n"
        f"📅 Cita propuesta: {_fmt_date_es(apt_datetime)} · {_fmt_time(apt_datetime)}\n"
        f"💰 Presupuesto: ${_fmt_price(presupuesto.get('min'))} – ${_fmt_price(presupuesto.get('max'))} MXN\n"
        f"👤 Asesor: {asesor_name}\n"
        "¿Me confirmas si ya tienen este lead en su base?\n"
        "Quiero evitar duplicar esfuerzo y coordinar contigo el seguimiento. 🤝\n"
        "— Enviado desde DesarrollosMX (lead status: en revisión)"
    )
    phone_digits = re.sub(r"\D", "", dev_phone)
    return f"https://wa.me/{phone_digits}?text={quote(text)}"


async def _get_project_dev_info(db, project_id: str) -> Dict[str, str]:
    """Return {dev_org_id, project_name, dev_admin_name, dev_phone} for a project."""
    fallback_phone = os.environ.get("DMX_FALLBACK_WHATSAPP", "+525512345678")
    result = {
        "dev_org_id": "default",
        "project_name": project_id,
        "dev_admin_name": "Desarrolladora",
        "dev_phone": fallback_phone,
    }
    try:
        from data_developments import DEVELOPMENTS
        dev_map = {d["id"]: d for d in DEVELOPMENTS}
        if project_id in dev_map:
            dev = dev_map[project_id]
            result["project_name"] = dev.get("name", project_id)
            result["dev_org_id"] = dev.get("developer_id", "default")
    except Exception:
        pass
    # Look up dev admin
    dev_org_id = result["dev_org_id"]
    try:
        admin = await db.users.find_one(
            {"tenant_id": dev_org_id, "role": "developer_admin"},
            {"_id": 0, "name": 1, "phone": 1},
        )
        if admin:
            result["dev_admin_name"] = admin.get("name", "Admin")
            if admin.get("phone"):
                result["dev_phone"] = admin["phone"]
    except Exception:
        pass
    return result


# ─────────────────────────────────────────────────────────────────────────────
# Anti-fraud: activity score + movement alert
# ─────────────────────────────────────────────────────────────────────────────
async def _activity_score(db, asesor_id: str, lead_id: str, now: datetime) -> float:
    cutoff = (now - timedelta(days=21)).isoformat()
    score = 0.0
    try:
        audits = await db.audit_log.find(
            {"entity_id": lead_id, "actor.user_id": asesor_id, "ts": {"$gte": cutoff}},
            {"_id": 0, "ts": 1},
        ).to_list(100)
        lead = await db.leads.find_one({"id": lead_id}, {"_id": 0, "notes": 1})
        note_dates = [
            n.get("created_at", "") for n in (lead.get("notes") or []) if n.get("user_id") == asesor_id
        ] if lead else []
        apts = await db.appointments.find(
            {"lead_id": lead_id, "asesor_id": asesor_id, "created_at": {"$gte": cutoff}},
            {"_id": 0, "created_at": 1},
        ).to_list(50)
        all_ts = [a["ts"] for a in audits] + note_dates + [a["created_at"] for a in apts]
        for ts_str in all_ts:
            try:
                ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
                age = (now - ts.astimezone(timezone.utc)).days
                if age <= 7:
                    score += 1.0
                elif age <= 14:
                    score += 0.5
                elif age <= 21:
                    score += 0.25
            except Exception:
                pass
    except Exception:
        pass
    return score


async def _fire_movement_alert(db, asesor_id: str, client_name: str, activity: float) -> None:
    age_days = max(1, round(21 - min(activity, 20) * 1.5))
    payload = {
        "client_name": client_name,
        "last_activity_days": age_days,
        "message": (
            f"Otro asesor está atendiendo a {client_name} en otro proyecto. "
            "Tu cliente está comparando opciones, cerca de cerrar. "
            "La buena noticia: ya tienes vínculo construido — los clientes recuerdan al asesor "
            "que les dio valor real, no al que solo enseñó departamentos. "
            "Suma valor antes que el otro lo haga."
        ),
        "actions": ["whatsapp", "llamar", "historial"],
    }
    await _push_notification(db, user_id=asesor_id, org_id="dmx", ntype="movement_alert", payload=payload)
    try:
        from observability import emit_ml_event
        await emit_ml_event(
            db, event_type="movement_alert_sent",
            user_id="system", org_id="dmx", role="system",
            context={"target_asesor_id": asesor_id, "client_name": client_name},
            ai_decision={}, user_action={},
        )
    except Exception:
        pass


async def _run_antifraude(
    db, *, project_id: str, contact: Dict,
    phone_norm: str, email_norm: str, name_norm: str,
    client_gid: str, asesor_id: Optional[str], now: datetime,
) -> Dict:
    """
    6-layer anti-fraud check.
    Returns:
      {"status": "ok", "geo_mismatch": bool}
      {"status": "conflict_409", "lead_id": str, "wa_key": "2"}
      {"status": "under_review", "reason": str, "suspected_match_id"?: str, "velocity_count"?: int}
    """
    CLOSED = {"cerrado_ganado", "cerrado_perdido"}

    # CHECK 1 — Exact match in same project (409 block)
    if phone_norm:
        existing = await db.leads.find_one(
            {"project_id": project_id, "status": {"$nin": list(CLOSED)}, "contact.phone_norm": phone_norm},
            {"_id": 0, "id": 1},
        )
        if existing:
            return {"status": "conflict_409", "lead_id": existing["id"], "wa_key": "2"}
    if email_norm:
        existing = await db.leads.find_one(
            {"project_id": project_id, "status": {"$nin": list(CLOSED)}, "contact.email_norm": email_norm},
            {"_id": 0, "id": 1},
        )
        if existing:
            return {"status": "conflict_409", "lead_id": existing["id"], "wa_key": "2"}

    # CHECK 2 — 85% similarity in same project (under_review)
    try:
        from rapidfuzz import fuzz, distance as rfz_distance
        candidates = await db.leads.find(
            {"project_id": project_id, "status": {"$nin": list(CLOSED)}},
            {"_id": 0, "id": 1, "contact": 1},
        ).limit(200).to_list(200)
        for cand in candidates:
            cc = cand.get("contact", {})
            c_phone = cc.get("phone_norm", "")
            c_email = cc.get("email_norm", "")
            c_name = _normalize_name(cc.get("name", ""))
            phone_sim = fuzz.ratio(phone_norm, c_phone) / 100.0 if phone_norm and c_phone else 0.0
            # Email: domain exact + local Levenshtein
            email_sim = 0.0
            if email_norm and c_email:
                pn = email_norm.split("@")
                pc = c_email.split("@")
                if len(pn) == 2 and len(pc) == 2 and pn[1] == pc[1]:
                    email_sim = fuzz.ratio(pn[0], pc[0]) / 100.0
            name_sim = rfz_distance.JaroWinkler.normalized_similarity(name_norm, c_name) if name_norm and c_name else 0.0
            sim_score = phone_sim * 0.5 + email_sim * 0.3 + name_sim * 0.2
            if 0.85 <= sim_score < 1.0:
                return {
                    "status": "under_review", "reason": "similarity",
                    "suspected_match_id": cand["id"], "similarity_score": round(sim_score, 3),
                }
    except ImportError:
        log.warning("[antifraude] rapidfuzz not available, similarity check skipped")

    # CHECK 3 — Velocity check (5+ leads in 30 min by same asesor)
    if asesor_id:
        cutoff_30m = (now - timedelta(minutes=30)).isoformat()
        velocity_count = await db.leads.count_documents({
            "created_by": asesor_id, "created_at": {"$gte": cutoff_30m},
        })
        if velocity_count >= 5:
            return {"status": "under_review", "reason": "velocity", "velocity_count": velocity_count}

    # CHECK 4 — Geo mismatch (informational only)
    area_code = _phone_area_code(phone_norm) if phone_norm else ""
    geo_mismatch = area_code in NON_CDMX_AREA_CODES

    # CHECK 5 — Cross-project active follow-up alert
    if client_gid:
        other_leads = await db.leads.find(
            {
                "client_global_id": client_gid,
                "project_id": {"$ne": project_id},
                "status": {"$nin": list(CLOSED)},
            },
            {"_id": 0, "id": 1, "asesor_id": 1, "assigned_to": 1},
        ).limit(20).to_list(20)
        for ol in other_leads:
            existing_asesor = ol.get("asesor_id") or ol.get("assigned_to")
            if existing_asesor and existing_asesor != asesor_id:
                activity = await _activity_score(db, existing_asesor, ol["id"], now)
                if activity >= 1.0:
                    asyncio.create_task(_fire_movement_alert(db, existing_asesor, contact.get("name", ""), activity))

    return {"status": "ok", "geo_mismatch": geo_mismatch}


# ─────────────────────────────────────────────────────────────────────────────
# SUB-CHUNK B: Auto-routing helper
# ─────────────────────────────────────────────────────────────────────────────
async def _pick_best_inmobiliaria_asesor(db, inmobiliaria_id: str, colonia: str) -> Optional[str]:
    """Score-based asesor picker for auto-routing public leads."""
    candidates = await db.inmobiliaria_internal_users.find(
        {"inmobiliaria_id": inmobiliaria_id, "status": "active", "role": {"$in": ["asesor", "admin"]}},
        {"_id": 0, "id": 1, "user_id": 1},
    ).to_list(50)
    if not candidates:
        return None
    scored: List[tuple] = []
    for c in candidates:
        uid = c.get("user_id") or c.get("id")
        sc = 0
        # +50 if past closed deals in colonia
        closed_in_col = await db.leads.count_documents({
            "asesor_id": uid, "status": "cerrado_ganado",
            "colonia": {"$regex": colonia, "$options": "i"},
        })
        sc += 50 * min(closed_in_col, 1)
        # +30 if conversion_rate > 0.5
        total_closed = await db.leads.count_documents({"asesor_id": uid, "status": {"$in": ["cerrado_ganado", "cerrado_perdido"]}})
        won = await db.leads.count_documents({"asesor_id": uid, "status": "cerrado_ganado"})
        if total_closed > 0 and (won / total_closed) > 0.5:
            sc += 30
        # -20 per active lead (load balancing)
        active_leads = await db.leads.count_documents({"asesor_id": uid, "status": {"$nin": ["cerrado_ganado", "cerrado_perdido"]}})
        sc -= 20 * min(active_leads, 3)
        scored.append((uid, sc))
    if not scored:
        return None
    scored.sort(key=lambda x: x[1], reverse=True)
    return scored[0][0]


# ─────────────────────────────────────────────────────────────────────────────
# Seed DMX inmobiliaria on startup
# ─────────────────────────────────────────────────────────────────────────────
async def seed_dmx_inmobiliaria(db) -> None:
    existing = await db.inmobiliarias.find_one({"is_system_default": True}, {"_id": 0, "id": 1})
    if existing:
        return
    now_iso = _now().isoformat()
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@desarrollosmx.com")
    dmx = {
        "id": "dmx_root",
        "name": "DesarrollosMX",
        "type": "dmx_owner",
        "status": "active",
        "is_system_default": True,
        "rfc": "DMX260101ABC",
        "brokers_count": 0,
        "founded_year": 2024,
        "contact": {"email": admin_email, "phone": os.environ.get("DMX_FALLBACK_WHATSAPP", "+525512345678")},
        "created_at": now_iso,
    }
    await db.inmobiliarias.insert_one(dmx)
    # Create DMX admin user entry in inmobiliaria_internal_users
    admin_entry = {
        "id": _uid("inm_user"),
        "inmobiliaria_id": "dmx_root",
        "email": admin_email,
        "name": "Admin DMX",
        "role": "admin",
        "status": "active",
        "password_hash": None,
        "activation_token": None,
        "last_login_at": None,
        "created_at": now_iso,
        "user_id": None,
    }
    await db.inmobiliaria_internal_users.insert_one(admin_entry)
    log.info("[batch4.1] DMX root inmobiliaria seeded")


# ═════════════════════════════════════════════════════════════════════════════
# 4.26 · PROJECT SLOTS
# ═════════════════════════════════════════════════════════════════════════════
class SlotBody(BaseModel):
    day_of_week: int = Field(..., ge=0, le=6)
    hour_start: str = Field(..., pattern=r"^\d{2}:\d{2}$")
    hour_end: str = Field(..., pattern=r"^\d{2}:\d{2}$")
    max_concurrent: int = Field(1, ge=1, le=20)
    active: bool = True


class SlotsPayload(BaseModel):
    slots: List[SlotBody]


@router.post("/api/dev/projects/{project_id}/slots")
async def configure_slots(project_id: str, payload: SlotsPayload, request: Request):
    user = await _auth_dev(request)
    if user.role not in ("developer_admin", "superadmin"):
        raise HTTPException(403, "Solo developer_admin puede configurar slots")
    db = _db(request)
    now_iso = _now().isoformat()
    dev_org_id = _tenant(user)
    upserted_ids = []
    for s in payload.slots:
        filt = {"project_id": project_id, "dev_org_id": dev_org_id, "day_of_week": s.day_of_week}
        doc = {**filt, "hour_start": s.hour_start, "hour_end": s.hour_end,
               "max_concurrent": s.max_concurrent, "active": s.active, "updated_at": now_iso}
        res = await db.project_slots.update_one(filt, {"$set": doc, "$setOnInsert": {"id": _uid("slot"), "created_at": now_iso}}, upsert=True)
        if res.upserted_id:
            upserted_ids.append(str(res.upserted_id))
    await _safe_audit_ml(
        db, user, action="update", entity_type="project_slots", entity_id=project_id,
        before=None, after={"slots_count": len(payload.slots)}, request=request,
        ml_event="project_slots_configured", ml_context={"project_id": project_id, "slots": len(payload.slots)},
    )
    return {"ok": True, "project_id": project_id, "slots_configured": len(payload.slots)}


@router.get("/api/projects/{project_id}/slots/availability")
async def get_slot_availability(
    project_id: str, request: Request,
    date: str = Query(..., description="YYYY-MM-DD"),
):
    db = _db(request)
    try:
        target_date = datetime.strptime(date, "%Y-%m-%d")
        day_of_week = target_date.weekday()  # 0=Monday
    except ValueError:
        raise HTTPException(422, "date debe ser YYYY-MM-DD")

    slots = await db.project_slots.find(
        {"project_id": project_id, "day_of_week": day_of_week, "active": True},
        {"_id": 0},
    ).to_list(20)

    now = _now()
    results = []
    for s in slots:
        h_start, m_start = map(int, s["hour_start"].split(":"))
        h_end, m_end = map(int, s["hour_end"].split(":"))
        slot_dt = datetime(target_date.year, target_date.month, target_date.day,
                           h_start, m_start, tzinfo=timezone.utc)
        slot_dt_end = datetime(target_date.year, target_date.month, target_date.day,
                               h_end, m_end, tzinfo=timezone.utc)
        # Count concurrent appointments
        booked = await db.appointments.count_documents({
            "project_id": project_id,
            "datetime": {"$gte": slot_dt.isoformat(), "$lte": slot_dt_end.isoformat()},
            "status": {"$nin": ["cancelada"]},
        })
        available = booked < s["max_concurrent"]
        reason = None
        if slot_dt <= now:
            available = False
            reason = "past"
        elif not available:
            reason = "full"
        results.append({
            "datetime": slot_dt.isoformat(),
            "hour_start": s["hour_start"],
            "hour_end": s["hour_end"],
            "available": available,
            "booked": booked,
            "max_concurrent": s["max_concurrent"],
            "reason": reason,
        })
    return {"project_id": project_id, "date": date, "day_of_week": day_of_week, "slots": results}


# ═════════════════════════════════════════════════════════════════════════════
# 4.26 · POST /api/cita  (optional auth — integrates A + B + C)
# ═════════════════════════════════════════════════════════════════════════════
class CitaContactBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    phone: Optional[str] = None
    email: Optional[str] = None
    preferred_channel: Optional[str] = None


class LfpdpppConsent(BaseModel):
    accepted: bool


class CitaPresupuesto(BaseModel):
    min: Optional[float] = Field(None, ge=0)
    max: Optional[float] = Field(None, ge=0)


class CitaBody(BaseModel):
    project_id: str
    contact: CitaContactBody
    datetime: str  # ISO with tz
    modalidad: str = "presencial"
    presupuesto: Optional[CitaPresupuesto] = None
    payment_methods: List[str] = []
    intent: Optional[str] = None
    lfpdppp_consent: LfpdpppConsent
    asesor_id: Optional[str] = None  # override if admin
    duration_minutes: int = Field(60, ge=15, le=480)


@router.post("/api/cita")
async def create_cita(payload: CitaBody, request: Request):
    # Validate LFPDPPP consent (REQUIRED)
    if not payload.lfpdppp_consent.accepted:
        raise HTTPException(422, "Consentimiento LFPDPPP requerido para registrar la cita")

    # Validate contact
    if not payload.contact.phone and not payload.contact.email:
        raise HTTPException(422, "contact.phone o contact.email es obligatorio")

    # Validate modalidad
    if payload.modalidad not in MODALIDADES:
        raise HTTPException(422, f"modalidad debe ser: {MODALIDADES}")

    # Validate payment_methods
    for pm in payload.payment_methods:
        if pm not in PAYMENT_METHODS:
            raise HTTPException(422, f"payment_method inválido: {pm}")

    # Validate datetime is in the future
    try:
        apt_dt = datetime.fromisoformat(payload.datetime.replace("Z", "+00:00"))
        if apt_dt.astimezone(timezone.utc) <= _now():
            raise HTTPException(422, "La fecha de la cita debe ser futura")
    except ValueError:
        raise HTTPException(422, "datetime inválido, usa ISO format")

    db = _db(request)
    user = await _optional_auth(request)
    now = _now()

    # Normalize contact data
    phone_norm = _normalize_phone(payload.contact.phone)
    email_norm = _normalize_email(payload.contact.email)
    name_norm = _normalize_name(payload.contact.name)
    client_gid = _client_global_id(phone_norm, email_norm) if (phone_norm or email_norm) else ""

    # Detect origin and asesor_id
    asesor_id: Optional[str] = None
    origin_type = "public_unassigned"
    origin_inmobiliaria_id: Optional[str] = None
    lead_inmobiliaria_id: Optional[str] = None

    if user:
        role = user.role
        if role in ("developer_admin", "developer_member"):
            origin_type = "dev_direct" if role == "developer_admin" else "dev_inhouse"
            asesor_id = user.user_id
        elif role in ("advisor", "asesor_admin"):
            origin_type = "broker_external"
            asesor_id = user.user_id
        elif role == "superadmin":
            origin_type = "dev_direct"
            asesor_id = user.user_id

        # If user has inmobiliaria_id → inmobiliaria_lead
        user_inm_id = getattr(user, "inmobiliaria_id", None)
        if user_inm_id:
            origin_type = "inmobiliaria_lead"
            origin_inmobiliaria_id = user_inm_id
            lead_inmobiliaria_id = user_inm_id

        # Override asesor_id if explicitly provided by admin
        if payload.asesor_id and role in ("developer_admin", "superadmin"):
            asesor_id = payload.asesor_id
    else:
        origin_type = "public_unassigned"
        asesor_id = None

    # Get project info
    proj_info = await _get_project_dev_info(db, payload.project_id)
    dev_org_id = proj_info["dev_org_id"]
    project_name = proj_info["project_name"]

    # Anti-fraud: run validation (Sub-chunk C)
    fraud_result = await _run_antifraude(
        db,
        project_id=payload.project_id,
        contact=payload.contact.model_dump(),
        phone_norm=phone_norm,
        email_norm=email_norm,
        name_norm=name_norm,
        client_gid=client_gid,
        asesor_id=asesor_id,
        now=now,
    )

    # Handle 409 exact duplicate
    if fraud_result["status"] == "conflict_409":
        wa_url = _build_wa_template_2(
            dev_admin_name=proj_info["dev_admin_name"],
            dev_phone=proj_info["dev_phone"],
            project_name=project_name,
            contact=payload.contact.model_dump(),
            apt_datetime=payload.datetime,
            presupuesto=(payload.presupuesto.model_dump() if payload.presupuesto else {}),
            asesor_name=getattr(user, "name", "Asesor") if user else "Público",
        )
        raise HTTPException(409, detail={
            "error": "Lead duplicado: ya existe un registro activo para este contacto en el proyecto",
            "existing_lead_id": fraud_result.get("lead_id"),
            "wa_template_url": wa_url,
        })

    # Determine lead status
    is_under_review = fraud_result["status"] == "under_review"
    lead_status = "under_review" if is_under_review else "nuevo"
    geo_mismatch = fraud_result.get("geo_mismatch", False)

    # Auto-routing for public leads → DMX
    if origin_type == "public_unassigned":
        dmx = await db.inmobiliarias.find_one({"is_system_default": True}, {"_id": 0, "id": 1})
        if dmx:
            dmx_id = dmx["id"]
            # Get project colonia for scoring
            colonia = ""
            try:
                from data_developments import DEVELOPMENTS
                dm = {d["id"]: d for d in DEVELOPMENTS}
                colonia = dm.get(payload.project_id, {}).get("colonia", "")
            except Exception:
                pass
            picked_asesor = await _pick_best_inmobiliaria_asesor(db, dmx_id, colonia)
            origin_type = "inmobiliaria_lead"
            origin_inmobiliaria_id = dmx_id
            lead_inmobiliaria_id = dmx_id
            if picked_asesor:
                asesor_id = picked_asesor
            await _safe_audit_ml(
                db,
                {"user_id": "system", "role": "system", "tenant_id": "dmx"},
                action="create", entity_type="lead_auto_route", entity_id=payload.project_id,
                before=None, after={"origin": "public_unassigned", "routed_to": "dmx_root"},
                request=request,
                ml_event="lead_auto_routed_dmx",
                ml_context={"project_id": payload.project_id, "asesor_id": picked_asesor},
            )

    now_iso = now.isoformat()
    confirmation_token = secrets.token_urlsafe(32)

    # Create LEAD
    presupuesto_dict = payload.presupuesto.model_dump() if payload.presupuesto else {}
    contact_dict = {
        **payload.contact.model_dump(),
        "phone_norm": phone_norm,
        "email_norm": email_norm,
    }
    lead = {
        "id": _uid("lead"),
        "dev_org_id": dev_org_id,
        "project_id": payload.project_id,
        "source": "cita_form",
        "source_metadata": {"origin_type": origin_type},
        "contact": contact_dict,
        "intent": payload.intent,
        "budget_range": presupuesto_dict,
        "status": lead_status,
        "assigned_to": asesor_id,
        "asesor_id": asesor_id,
        "notes": [],
        "lost_reason": None,
        # Extended fields (B4.1)
        "payment_methods": payload.payment_methods,
        "lfpdppp_consent": {
            "accepted_at": now_iso,
            "ip": request.headers.get("x-forwarded-for", ""),
            "user_agent": request.headers.get("user-agent", ""),
        },
        "presupuesto_min": presupuesto_dict.get("min"),
        "presupuesto_max": presupuesto_dict.get("max"),
        # Anti-fraud fields
        "client_global_id": client_gid,
        "geo_metadata": {"phone_area_code": _phone_area_code(phone_norm), "mismatch": geo_mismatch},
        "velocity_flag": fraud_result.get("reason") == "velocity",
        "suspected_match_id": fraud_result.get("suspected_match_id"),
        # Origin
        "origin": {
            "type": origin_type,
            "inmobiliaria_id": origin_inmobiliaria_id,
        },
        "inmobiliaria_id": lead_inmobiliaria_id,
        "created_at": now_iso,
        "updated_at": now_iso,
        "last_activity_at": now_iso,
        "created_by": getattr(user, "user_id", "public") if user else "public",
    }
    await db.leads.insert_one(lead)
    lead.pop("_id", None)

    # Create APPOINTMENT
    appointment = {
        "id": _uid("apt"),
        "lead_id": lead["id"],
        "project_id": payload.project_id,
        "dev_org_id": dev_org_id,
        "asesor_id": asesor_id,
        "inmobiliaria_id": lead_inmobiliaria_id,
        "datetime": payload.datetime,
        "duration_minutes": payload.duration_minutes,
        "modalidad": payload.modalidad,
        "status": "agendada",
        "confirmation_token": confirmation_token,
        "reminders": {"sent_24h": False, "sent_2h": False, "sent_1h": False},
        "cancel_reason": None,
        "reschedule_reason": None,
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    await db.appointments.insert_one(appointment)
    appointment.pop("_id", None)

    # Send Resend email with .ics (fire-and-forget)
    if contact_dict.get("email"):
        asyncio.create_task(_send_cita_email(
            db,
            to_email=contact_dict["email"],
            to_name=contact_dict["name"],
            project_name=project_name,
            apt_datetime=payload.datetime,
            duration_min=payload.duration_minutes,
            modalidad=payload.modalidad,
            confirmation_token=confirmation_token,
        ))

    # Audit + ML
    actor = user or {"user_id": "public", "role": "public", "tenant_id": dev_org_id}
    await _safe_audit_ml(
        db, actor, action="create", entity_type="appointment", entity_id=appointment["id"],
        before=None,
        after={"lead_id": lead["id"], "project_id": payload.project_id, "status": lead_status},
        request=request,
        ml_event="cita_created",
        ml_context={"project_id": payload.project_id, "source": "cita_form", "has_consent": True, "under_review": is_under_review},
    )

    # Notify developer admin of under_review
    if is_under_review and dev_org_id != "default":
        admin_user = await db.users.find_one({"tenant_id": dev_org_id, "role": "developer_admin"}, {"_id": 0, "user_id": 1})
        if admin_user:
            await _push_notification(
                db, user_id=admin_user["user_id"], org_id=dev_org_id,
                ntype="lead_under_review",
                payload={
                    "lead_id": lead["id"],
                    "contact_name": contact_dict["name"],
                    "reason": fraud_result.get("reason"),
                    "suspected_match_id": fraud_result.get("suspected_match_id"),
                },
            )

    # Emit ML for suspected duplicate
    if is_under_review and fraud_result.get("reason") == "similarity":
        try:
            from observability import emit_ml_event
            await emit_ml_event(
                db, event_type="lead_suspected_duplicate",
                user_id=getattr(user, "user_id", "public") if user else "public",
                org_id=dev_org_id, role=getattr(user, "role", "public") if user else "public",
                context={"score": fraud_result.get("similarity_score"), "candidate_id": fraud_result.get("suspected_match_id")},
                ai_decision={}, user_action={},
            )
        except Exception:
            pass

    # Build WA templates
    asesor_name = getattr(user, "name", "Asesor") if user else "Público"
    presupuesto_for_wa = presupuesto_dict
    if is_under_review:
        wa_url = _build_wa_template_2(
            dev_admin_name=proj_info["dev_admin_name"],
            dev_phone=proj_info["dev_phone"],
            project_name=project_name,
            contact=contact_dict,
            apt_datetime=payload.datetime,
            presupuesto=presupuesto_for_wa,
            asesor_name=asesor_name,
        )
    else:
        wa_url = _build_wa_template_1(
            dev_admin_name=proj_info["dev_admin_name"],
            dev_phone=proj_info["dev_phone"],
            project_name=project_name,
            contact=contact_dict,
            apt_datetime=payload.datetime,
            modalidad=payload.modalidad,
            presupuesto=presupuesto_for_wa,
            payment_methods=payload.payment_methods,
            asesor_name=asesor_name,
        )

    status_out = "under_review" if is_under_review else "created"
    return {
        "lead_id": lead["id"],
        "appointment_id": appointment["id"],
        "status": status_out,
        "under_review": is_under_review,
        "wa_template_url": wa_url,
        "confirmation_token": confirmation_token,
        "project_name": project_name,
        "contact_name": contact_dict["name"],
        "apt_datetime": payload.datetime,
    }


# ═════════════════════════════════════════════════════════════════════════════
# GET /api/asesor/citas  (asesor own scope)
# ═════════════════════════════════════════════════════════════════════════════
@router.get("/api/asesor/citas")
async def list_asesor_citas(
    request: Request,
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    status: Optional[str] = None,
    project_id: Optional[str] = None,
):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    if user.role not in ("advisor", "asesor_admin", "developer_admin", "developer_member", "superadmin"):
        raise HTTPException(403, "Acceso denegado")
    db = _db(request)
    q: Dict[str, Any] = {"asesor_id": user.user_id}
    if status:
        q["status"] = status
    if project_id:
        q["project_id"] = project_id
    if from_date or to_date:
        q["datetime"] = {}
        if from_date:
            q["datetime"]["$gte"] = from_date
        if to_date:
            q["datetime"]["$lte"] = to_date
    appointments = await db.appointments.find(q, {"_id": 0}).sort("datetime", 1).limit(200).to_list(200)
    # Enrich with lead data
    for apt in appointments:
        if apt.get("lead_id"):
            lead = await db.leads.find_one({"id": apt["lead_id"]}, {"_id": 0, "contact": 1, "status": 1, "budget_range": 1, "project_id": 1})
            if lead:
                apt["lead"] = lead
    now_iso = _now().isoformat()
    # Stats
    month_start = _now().replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    week_end = (_now() + timedelta(days=7)).isoformat()
    total_mes = await db.appointments.count_documents({"asesor_id": user.user_id, "datetime": {"$gte": month_start}})
    proximas = await db.appointments.count_documents({"asesor_id": user.user_id, "datetime": {"$gte": now_iso, "$lte": week_end}, "status": {"$nin": ["cancelada"]}})
    realizadas = await db.appointments.count_documents({"asesor_id": user.user_id, "status": "realizada"})
    canceladas = await db.appointments.count_documents({"asesor_id": user.user_id, "status": "cancelada"})
    return {
        "items": appointments,
        "stats": {"total_mes": total_mes, "proximas_7d": proximas, "realizadas": realizadas, "canceladas": canceladas},
    }


# ═════════════════════════════════════════════════════════════════════════════
# GET /api/dev/citas  (developer scope)
# ═════════════════════════════════════════════════════════════════════════════
@router.get("/api/dev/citas")
async def list_dev_citas(
    request: Request,
    project_id: Optional[str] = None,
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    status: Optional[str] = None,
    asesor_id: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(30, ge=1, le=100),
):
    user = await _auth_dev(request)
    db = _db(request)
    dev_org_id = _tenant(user)
    q: Dict[str, Any] = {"dev_org_id": dev_org_id}
    # Comercial only sees own (unless admin/superadmin)
    if user.role == "developer_member" and getattr(user, "internal_role", None) not in ("admin", "commercial_director"):
        q["asesor_id"] = user.user_id
    if project_id:
        q["project_id"] = project_id
    if status:
        q["status"] = status
    if asesor_id and user.role in ("developer_admin", "superadmin"):
        q["asesor_id"] = asesor_id
    if from_date or to_date:
        q["datetime"] = {}
        if from_date:
            q["datetime"]["$gte"] = from_date
        if to_date:
            q["datetime"]["$lte"] = to_date
    skip = (page - 1) * limit
    total = await db.appointments.count_documents(q)
    items = await db.appointments.find(q, {"_id": 0}).sort("datetime", 1).skip(skip).limit(limit).to_list(limit)
    for apt in items:
        if apt.get("lead_id"):
            lead = await db.leads.find_one({"id": apt["lead_id"]}, {"_id": 0, "contact": 1, "status": 1, "payment_methods": 1, "budget_range": 1})
            if lead:
                apt["lead"] = lead
    return {"total": total, "page": page, "limit": limit, "items": items}


# ═════════════════════════════════════════════════════════════════════════════
# PATCH /api/cita/:id
# ═════════════════════════════════════════════════════════════════════════════
class CitaPatch(BaseModel):
    status: Optional[str] = None
    datetime: Optional[str] = None
    cancel_reason: Optional[str] = None
    reschedule_reason: Optional[str] = None
    notes: Optional[str] = None


@router.patch("/api/cita/{apt_id}")
async def patch_cita(apt_id: str, payload: CitaPatch, request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    db = _db(request)
    apt = await db.appointments.find_one({"id": apt_id}, {"_id": 0})
    if not apt:
        raise HTTPException(404, "Cita no encontrada")
    # Permission: asesor own, dev_admin, inmobiliaria_admin, superadmin
    is_own_asesor = apt.get("asesor_id") == user.user_id
    is_admin = user.role in ("developer_admin", "superadmin")
    if not (is_own_asesor or is_admin):
        raise HTTPException(403, "Sin permisos para modificar esta cita")

    patch: Dict[str, Any] = {}
    data = payload.model_dump(exclude_unset=True)

    if "status" in data and data["status"] is not None:
        new_status = data["status"]
        if new_status not in APPT_STATUSES:
            raise HTTPException(422, f"status inválido. Opciones: {APPT_STATUSES}")
        if new_status == "cancelada" and not payload.cancel_reason:
            raise HTTPException(422, "cancel_reason requerido al cancelar la cita")
        if new_status == "reagendada":
            if not payload.reschedule_reason:
                raise HTTPException(422, "reschedule_reason requerido al reagendar")
            if not payload.datetime:
                raise HTTPException(422, "datetime nuevo requerido al reagendar")
        patch["status"] = new_status
        if payload.cancel_reason:
            patch["cancel_reason"] = payload.cancel_reason
        if payload.reschedule_reason:
            patch["reschedule_reason"] = payload.reschedule_reason

    if "datetime" in data and data["datetime"] is not None:
        patch["datetime"] = data["datetime"]

    if not patch:
        return apt

    patch["updated_at"] = _now().isoformat()
    before = {k: apt.get(k) for k in patch.keys()}
    await db.appointments.update_one({"id": apt_id}, {"$set": patch})
    after_doc = await db.appointments.find_one({"id": apt_id}, {"_id": 0})

    await _safe_audit_ml(
        db, user, action="update", entity_type="appointment", entity_id=apt_id,
        before=before, after={k: after_doc.get(k) for k in patch.keys()},
        request=request,
        ml_event="cita_status_changed",
        ml_context={"from_status": apt.get("status"), "to_status": patch.get("status", apt.get("status"))},
    )
    return after_doc


# ═════════════════════════════════════════════════════════════════════════════
# GET /api/cita/:id/wa-template
# ═════════════════════════════════════════════════════════════════════════════
@router.get("/api/cita/{apt_id}/wa-template")
async def get_wa_template(apt_id: str, request: Request, type: str = Query("success")):
    db = _db(request)
    apt = await db.appointments.find_one({"id": apt_id}, {"_id": 0})
    if not apt:
        raise HTTPException(404, "Cita no encontrada")
    lead = await db.leads.find_one({"id": apt.get("lead_id")}, {"_id": 0}) if apt.get("lead_id") else None
    if not lead:
        raise HTTPException(404, "Lead asociado no encontrado")
    proj_info = await _get_project_dev_info(_db(request), apt["project_id"])
    asesor_name = "Asesor"
    if apt.get("asesor_id"):
        au = await db.users.find_one({"user_id": apt["asesor_id"]}, {"_id": 0, "name": 1})
        if au:
            asesor_name = au.get("name", "Asesor")
    contact = lead.get("contact", {})
    presupuesto = lead.get("budget_range") or {}
    pms = lead.get("payment_methods", [])
    if type == "under_review":
        wa_url = _build_wa_template_2(
            dev_admin_name=proj_info["dev_admin_name"],
            dev_phone=proj_info["dev_phone"],
            project_name=proj_info["project_name"],
            contact=contact, apt_datetime=apt["datetime"],
            presupuesto=presupuesto, asesor_name=asesor_name,
        )
    else:
        wa_url = _build_wa_template_1(
            dev_admin_name=proj_info["dev_admin_name"],
            dev_phone=proj_info["dev_phone"],
            project_name=proj_info["project_name"],
            contact=contact, apt_datetime=apt["datetime"],
            modalidad=apt.get("modalidad", "presencial"),
            presupuesto=presupuesto, payment_methods=pms, asesor_name=asesor_name,
        )
    return {"wa_template_url": wa_url, "type": type}


# ═════════════════════════════════════════════════════════════════════════════
# Anti-fraude: approve / reject under_review leads
# ═════════════════════════════════════════════════════════════════════════════
@router.post("/api/dev/leads/{lead_id}/approve-review")
async def approve_review(lead_id: str, request: Request):
    user = await _auth_dev(request)
    if user.role not in ("developer_admin", "superadmin"):
        raise HTTPException(403, "Solo developer_admin puede aprobar revisiones")
    db = _db(request)
    lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "Lead no encontrado")
    if lead.get("status") != "under_review":
        raise HTTPException(409, "El lead no está en estado 'under_review'")
    now_iso = _now().isoformat()
    await db.leads.update_one({"id": lead_id}, {"$set": {"status": "nuevo", "updated_at": now_iso, "last_activity_at": now_iso}})
    await _safe_audit_ml(
        db, user, action="update", entity_type="lead", entity_id=lead_id,
        before={"status": "under_review"}, after={"status": "nuevo"},
        request=request,
        ml_event="lead_review_approved", ml_context={"lead_id": lead_id},
    )
    # Notify asesor
    if lead.get("assigned_to"):
        await _push_notification(
            db, user_id=lead["assigned_to"], org_id=_tenant(user),
            ntype="lead_review_approved",
            payload={"lead_id": lead_id, "contact_name": lead.get("contact", {}).get("name", "")},
        )
    return {"ok": True, "lead_id": lead_id, "new_status": "nuevo"}


@router.post("/api/dev/leads/{lead_id}/reject-review")
async def reject_review(lead_id: str, request: Request):
    user = await _auth_dev(request)
    if user.role not in ("developer_admin", "superadmin"):
        raise HTTPException(403, "Solo developer_admin puede rechazar revisiones")
    db = _db(request)
    lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "Lead no encontrado")
    if lead.get("status") != "under_review":
        raise HTTPException(409, "El lead no está en estado 'under_review'")
    now_iso = _now().isoformat()
    await db.leads.update_one(
        {"id": lead_id},
        {"$set": {"status": "cerrado_perdido", "lost_reason": "duplicado", "updated_at": now_iso, "last_activity_at": now_iso}},
    )
    await _safe_audit_ml(
        db, user, action="update", entity_type="lead", entity_id=lead_id,
        before={"status": "under_review"}, after={"status": "cerrado_perdido", "lost_reason": "duplicado"},
        request=request,
        ml_event="lead_review_rejected", ml_context={"lead_id": lead_id},
    )
    if lead.get("assigned_to"):
        await _push_notification(
            db, user_id=lead["assigned_to"], org_id=_tenant(user),
            ntype="lead_review_rejected",
            payload={"lead_id": lead_id, "contact_name": lead.get("contact", {}).get("name", ""), "lost_reason": "duplicado"},
        )
    return {"ok": True, "lead_id": lead_id, "new_status": "cerrado_perdido"}


# ═════════════════════════════════════════════════════════════════════════════
# SUB-CHUNK B · INMOBILIARIA CRUD
# ═════════════════════════════════════════════════════════════════════════════
class InmAsesorCreate(BaseModel):
    email: str = Field(..., min_length=3)
    name: str = Field(..., min_length=1)
    role: str = "asesor"
    inmobiliaria_id: Optional[str] = None


class InmAsesorPatch(BaseModel):
    role: Optional[str] = None
    status: Optional[str] = None
    name: Optional[str] = None


async def _auth_inm(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    if user.role not in ("superadmin", "developer_admin"):
        raise HTTPException(403, "Acceso solo para superadmin y administradores")
    return user


@router.post("/api/inmobiliaria/asesores")
async def create_inm_asesor(payload: InmAsesorCreate, request: Request):
    user = await _auth_inm(request)
    db = _db(request)
    if payload.role not in INM_ROLES:
        raise HTTPException(422, f"role inválido: {INM_ROLES}")
    inm_id = payload.inmobiliaria_id or "dmx_root"
    inm = await db.inmobiliarias.find_one({"id": inm_id}, {"_id": 0, "id": 1})
    if not inm:
        raise HTTPException(404, f"Inmobiliaria '{inm_id}' no encontrada")
    existing = await db.inmobiliaria_internal_users.find_one({"inmobiliaria_id": inm_id, "email": payload.email.lower()}, {"_id": 0, "id": 1})
    if existing:
        raise HTTPException(409, "Ya existe un usuario con ese email en esta inmobiliaria")
    now_iso = _now().isoformat()
    doc = {
        "id": _uid("inm_user"),
        "inmobiliaria_id": inm_id,
        "email": payload.email.lower(),
        "name": payload.name,
        "role": payload.role,
        "status": "active",
        "password_hash": None,
        "activation_token": None,
        "last_login_at": None,
        "created_at": now_iso,
        "updated_at": now_iso,
        "user_id": None,
    }
    await db.inmobiliaria_internal_users.insert_one(doc)
    doc.pop("_id", None)
    await _safe_audit_ml(
        db, user, action="create", entity_type="inmobiliaria_user", entity_id=doc["id"],
        before=None, after={"email": doc["email"], "role": doc["role"], "inmobiliaria_id": inm_id},
        request=request,
    )
    return doc


@router.get("/api/inmobiliaria/asesores")
async def list_inm_asesores(
    request: Request,
    inmobiliaria_id: Optional[str] = Query("dmx_root"),
    status: Optional[str] = None,
):
    await _auth_inm(request)
    db = _db(request)
    q: Dict[str, Any] = {"inmobiliaria_id": inmobiliaria_id or "dmx_root"}
    if status:
        q["status"] = status
    items = await db.inmobiliaria_internal_users.find(q, {"_id": 0}).sort("created_at", -1).limit(100).to_list(100)
    return {"items": items, "total": len(items)}


@router.patch("/api/inmobiliaria/asesores/{user_id}")
async def patch_inm_asesor(user_id: str, payload: InmAsesorPatch, request: Request):
    user = await _auth_inm(request)
    db = _db(request)
    existing = await db.inmobiliaria_internal_users.find_one({"id": user_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Usuario no encontrado")
    patch: Dict[str, Any] = {}
    data = payload.model_dump(exclude_unset=True)
    if "role" in data and data["role"]:
        if data["role"] not in INM_ROLES:
            raise HTTPException(422, f"role inválido: {INM_ROLES}")
        patch["role"] = data["role"]
    if "status" in data and data["status"]:
        if data["status"] not in ("active", "inactive", "disabled"):
            raise HTTPException(422, "status inválido: active|inactive|disabled")
        patch["status"] = data["status"]
    if "name" in data and data["name"]:
        patch["name"] = data["name"]
    if not patch:
        return existing
    patch["updated_at"] = _now().isoformat()
    await db.inmobiliaria_internal_users.update_one({"id": user_id}, {"$set": patch})
    after_doc = await db.inmobiliaria_internal_users.find_one({"id": user_id}, {"_id": 0})
    await _safe_audit_ml(
        db, user, action="update", entity_type="inmobiliaria_user", entity_id=user_id,
        before={k: existing.get(k) for k in patch.keys()},
        after={k: after_doc.get(k) for k in patch.keys()},
        request=request,
    )
    return after_doc


@router.delete("/api/inmobiliaria/asesores/{user_id}")
async def disable_inm_asesor(user_id: str, request: Request):
    user = await _auth_inm(request)
    db = _db(request)
    existing = await db.inmobiliaria_internal_users.find_one({"id": user_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Usuario no encontrado")
    now_iso = _now().isoformat()
    await db.inmobiliaria_internal_users.update_one({"id": user_id}, {"$set": {"status": "disabled", "updated_at": now_iso}})
    await _safe_audit_ml(
        db, user, action="delete", entity_type="inmobiliaria_user", entity_id=user_id,
        before={"status": existing.get("status")}, after={"status": "disabled"},
        request=request,
    )
    return {"ok": True, "id": user_id, "status": "disabled"}


# ═════════════════════════════════════════════════════════════════════════════
# GET /api/inmobiliaria/dashboard
# ═════════════════════════════════════════════════════════════════════════════
@router.get("/api/inmobiliaria/dashboard")
async def inmobiliaria_dashboard(
    request: Request,
    period: str = Query("30d"),
    inmobiliaria_id: str = Query("dmx_root"),
):
    await _auth_inm(request)
    db = _db(request)
    days_map = {"7d": 7, "30d": 30, "90d": 90, "all_time": 365 * 10}
    days = days_map.get(period, 30)
    since = (_now() - timedelta(days=days)).isoformat()

    total_leads = await db.leads.count_documents({"inmobiliaria_id": inmobiliaria_id, "created_at": {"$gte": since}})
    active_leads = await db.leads.count_documents({
        "inmobiliaria_id": inmobiliaria_id, "created_at": {"$gte": since},
        "status": {"$nin": ["cerrado_ganado", "cerrado_perdido"]},
    })
    won = await db.leads.count_documents({"inmobiliaria_id": inmobiliaria_id, "status": "cerrado_ganado", "created_at": {"$gte": since}})
    total_closed_period = await db.leads.count_documents({
        "inmobiliaria_id": inmobiliaria_id,
        "status": {"$in": ["cerrado_ganado", "cerrado_perdido"]},
        "created_at": {"$gte": since},
    })
    win_rate = round(won / total_closed_period * 100, 1) if total_closed_period else 0

    # Avg time to close (days)
    closed_leads = await db.leads.find(
        {"inmobiliaria_id": inmobiliaria_id, "status": "cerrado_ganado", "created_at": {"$gte": since}},
        {"_id": 0, "created_at": 1, "updated_at": 1},
    ).limit(100).to_list(100)
    avg_ttc = 0.0
    if closed_leads:
        ttcs = []
        for lead_doc in closed_leads:
            try:
                c = datetime.fromisoformat(lead_doc["created_at"].replace("Z", "+00:00"))
                u = datetime.fromisoformat(lead_doc["updated_at"].replace("Z", "+00:00"))
                ttcs.append((u - c).days)
            except Exception:
                pass
        avg_ttc = round(sum(ttcs) / len(ttcs), 1) if ttcs else 0

    # Top 5 asesores
    asesores = await db.inmobiliaria_internal_users.find(
        {"inmobiliaria_id": inmobiliaria_id, "status": "active"},
        {"_id": 0, "id": 1, "name": 1, "email": 1},
    ).limit(20).to_list(20)
    top_asesores = []
    for a in asesores:
        uid = a.get("user_id") or a.get("id")
        a_leads = await db.leads.count_documents({"asesor_id": uid, "inmobiliaria_id": inmobiliaria_id, "created_at": {"$gte": since}})
        a_won = await db.leads.count_documents({"asesor_id": uid, "inmobiliaria_id": inmobiliaria_id, "status": "cerrado_ganado", "created_at": {"$gte": since}})
        a_closed = await db.leads.count_documents({"asesor_id": uid, "inmobiliaria_id": inmobiliaria_id, "status": {"$in": ["cerrado_ganado", "cerrado_perdido"]}, "created_at": {"$gte": since}})
        wr = round(a_won / a_closed * 100, 1) if a_closed else 0
        top_asesores.append({**a, "leads": a_leads, "won": a_won, "win_rate": wr})
    top_asesores.sort(key=lambda x: x["leads"], reverse=True)

    return {
        "inmobiliaria_id": inmobiliaria_id,
        "period": period,
        "stats": {
            "total_leads": total_leads,
            "active_leads": active_leads,
            "won": won,
            "win_rate_pct": win_rate,
            "avg_time_to_close_days": avg_ttc,
        },
        "top_asesores": top_asesores[:5],
    }


# ═════════════════════════════════════════════════════════════════════════════
# GET /api/inmobiliaria/list  (list all inmobiliarias)
# ═════════════════════════════════════════════════════════════════════════════
@router.get("/api/inmobiliaria/list")
async def list_inmobiliarias(request: Request):
    await _auth_inm(request)
    db = _db(request)
    items = await db.inmobiliarias.find({}, {"_id": 0}).sort("created_at", -1).limit(50).to_list(50)
    return {"items": items}


# ═════════════════════════════════════════════════════════════════════════════
# INDEXES
# ═════════════════════════════════════════════════════════════════════════════
async def ensure_batch4_1_indexes(db) -> None:
    # appointments
    await db.appointments.create_index([("id", 1)], unique=True, background=True)
    await db.appointments.create_index([("project_id", 1), ("datetime", 1)], background=True)
    await db.appointments.create_index([("asesor_id", 1), ("datetime", 1)], background=True)
    await db.appointments.create_index([("lead_id", 1)], background=True)
    await db.appointments.create_index([("dev_org_id", 1), ("status", 1)], background=True)
    await db.appointments.create_index([("confirmation_token", 1)], unique=True, sparse=True, background=True)
    # project_slots
    await db.project_slots.create_index([("project_id", 1), ("day_of_week", 1)], background=True)
    # leads: new fields
    await db.leads.create_index([("contact.phone_norm", 1), ("project_id", 1)], background=True)
    await db.leads.create_index([("contact.email_norm", 1), ("project_id", 1)], background=True)
    await db.leads.create_index([("client_global_id", 1)], background=True)
    await db.leads.create_index([("inmobiliaria_id", 1), ("status", 1)], background=True)
    await db.leads.create_index([("asesor_id", 1), ("created_at", -1)], background=True)
    # inmobiliarias
    await db.inmobiliarias.create_index([("id", 1)], unique=True, background=True)
    await db.inmobiliarias.create_index([("is_system_default", 1)], background=True)
    await db.inmobiliarias.create_index([("type", 1), ("status", 1)], background=True)
    # inmobiliaria_internal_users
    await db.inmobiliaria_internal_users.create_index([("id", 1)], unique=True, background=True)
    await db.inmobiliaria_internal_users.create_index([("inmobiliaria_id", 1), ("status", 1)], background=True)
    await db.inmobiliaria_internal_users.create_index([("inmobiliaria_id", 1), ("email", 1)], background=True)
    log.info("[batch4.1] indexes ensured")
