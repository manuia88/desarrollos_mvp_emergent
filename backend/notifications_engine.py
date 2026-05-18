"""W4.17 — Smart Notifications Engine.

Colecciones:
  - notifications: { notif_id, user_id, tenant_id, type, severity, title, body,
                     payload, action_url, channels_sent, read, read_at,
                     created_at, expires_at, digest_sent }
  - notification_preferences: { user_id, categories, quiet_hours, digest_frequency }

10 reglas cross-cutting, cron digest 4h, cron WA pending replies.
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.notifications")

SEVERITIES = ("critical", "high", "normal", "low")
NOTIF_TYPES = {
    "lead_new", "lead_high_urgency", "meeting_24h", "meeting_1h",
    "cron_failed", "saved_zone_alert", "message_pending",
    "listing_view_repeat", "comparable_price_drop", "drop_off_pico",
    "tenant_signup", "api_limit_warn", "lfpdppp_dsr", "audit_suspicious",
    "nurture_cooldown", "forecast_trend_alert", "buyer_hot_jump",
    "lead_captured_auto", "dispute_resolved", "kg_alert", "kg_relational_alert",
    "live_pulse_alert", "readiness_ready", "generic",
}

RESEND_FROM = os.environ.get("RESEND_FROM_NOTIFICATIONS", "noreply@desarrollosmx.com")
FRONTEND_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://desarrollosmx.io").replace("/api", "")

DEFAULT_CATEGORIES = {
    "lead_new":              {"in_app": True, "email": True,  "whatsapp": False},
    "lead_high_urgency":     {"in_app": True, "email": True,  "whatsapp": True},
    "meeting_24h":           {"in_app": True, "email": True,  "whatsapp": False},
    "meeting_1h":            {"in_app": True, "email": False, "whatsapp": True},
    "cron_failed":           {"in_app": True, "email": True,  "whatsapp": False},
    "saved_zone_alert":      {"in_app": True, "email": False, "whatsapp": False},
    "message_pending":       {"in_app": True, "email": False, "whatsapp": False},
    "listing_view_repeat":   {"in_app": True, "email": False, "whatsapp": False},
    "comparable_price_drop": {"in_app": True, "email": True,  "whatsapp": False},
    "drop_off_pico":         {"in_app": True, "email": False, "whatsapp": False},
    "tenant_signup":         {"in_app": True, "email": True,  "whatsapp": False},
    "api_limit_warn":        {"in_app": True, "email": True,  "whatsapp": False},
    "lfpdppp_dsr":           {"in_app": True, "email": True,  "whatsapp": False},
    "audit_suspicious":      {"in_app": True, "email": True,  "whatsapp": False},
    "nurture_cooldown":      {"in_app": True, "email": False, "whatsapp": False},
    "forecast_trend_alert":  {"in_app": True, "email": True,  "whatsapp": False},
    "buyer_hot_jump":        {"in_app": True, "email": True,  "whatsapp": False},
    "lead_captured_auto":    {"in_app": True, "email": True,  "whatsapp": False},
    "dispute_resolved":      {"in_app": True, "email": True,  "whatsapp": False},
    "kg_alert":              {"in_app": True, "email": False, "whatsapp": False},
    "kg_relational_alert":   {"in_app": True, "email": True,  "whatsapp": False},
    "live_pulse_alert":      {"in_app": True, "email": False, "whatsapp": False},
    "readiness_ready":       {"in_app": True, "email": False, "whatsapp": False},
    "generic":               {"in_app": True, "email": False, "whatsapp": False},
}

DEFAULT_QUIET_HOURS = {"start": "21:00", "end": "08:00", "tz": "America/Mexico_City"}
DEFAULT_DIGEST_FREQUENCY = "4h"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _notif_id() -> str:
    return f"notif_{uuid.uuid4().hex[:16]}"


def _is_quiet(prefs: Dict[str, Any]) -> bool:
    """True si ahora mismo está dentro del quiet window del usuario."""
    try:
        qh = prefs.get("quiet_hours", DEFAULT_QUIET_HOURS)
        start_h, start_m = map(int, qh.get("start", "21:00").split(":"))
        end_h, end_m = map(int, qh.get("end", "08:00").split(":"))
        now = _now()
        cur_min = now.hour * 60 + now.minute
        start_min = start_h * 60 + start_m
        end_min = end_h * 60 + end_m
        if start_min > end_min:  # Cruza medianoche
            return cur_min >= start_min or cur_min < end_min
        return start_min <= cur_min < end_min
    except Exception:
        return False


async def _get_user_email(db, user_id: str) -> Optional[str]:
    try:
        u = await db.users.find_one({"user_id": user_id}, {"_id": 0, "email": 1})
        return u.get("email") if u else None
    except Exception:
        return None


async def _send_email_notification(to_email: str, title: str, body: str, action_url: str, html_override: str = "") -> bool:
    api_key = os.environ.get("RESEND_API_KEY")
    if not api_key:
        log.info(f"[notifications] Resend stub → email {to_email}: {title}")
        return False
    html = html_override if html_override else f"""
<html><body style="font-family:Arial,sans-serif;background:#06080F;color:#F0EBE0;padding:32px">
<div style="max-width:520px;margin:0 auto">
<div style="background:linear-gradient(90deg,#6366F1,#EC4899);border-radius:8px;padding:2px;margin-bottom:24px">
<div style="background:#0d1017;border-radius:6px;padding:20px 24px">
<span style="font-family:Outfit,Arial;font-weight:800;font-size:20px;color:#F0EBE0">DesarrollosMX</span>
</div></div>
<h2 style="font-family:Outfit,Arial;font-weight:700;font-size:18px;color:#F0EBE0;margin:0 0 12px">{title}</h2>
<p style="font-family:Arial;font-size:14px;color:#a0a4b0;line-height:1.6;margin:0 0 24px">{body}</p>
{f'<a href="{action_url}" style="display:inline-block;background:linear-gradient(90deg,#6366F1,#EC4899);color:#fff;font-family:Arial;font-size:13px;font-weight:600;padding:10px 22px;border-radius:9999px;text-decoration:none">Ver ahora</a>' if action_url else ''}
<hr style="border:none;border-top:1px solid rgba(255,255,255,0.06);margin:28px 0">
<p style="font-family:Arial;font-size:11px;color:#6b7280;margin:0">DesarrollosMX · Plataforma de inteligencia inmobiliaria · <a href="{FRONTEND_URL}/portal/settings/notifications" style="color:#6366F1;text-decoration:none">Gestionar notificaciones</a></p>
</div></body></html>"""
    try:
        import httpx
        r = await httpx.AsyncClient(timeout=8).__aenter__()
        try:
            resp = await r.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {api_key}"},
                json={"from": RESEND_FROM, "to": [to_email], "subject": title, "html": html},
            )
            return resp.status_code in (200, 201, 202)
        finally:
            await r.__aexit__(None, None, None)
    except Exception as exc:
        log.warning(f"[notifications] email send failed: {exc}")
        return False


# ─── Core: emit ─────────────────────────────────────────────────────────────

async def emit_notification(
    db,
    *,
    user_id: str,
    tenant_id: Optional[str] = None,
    type: str = "generic",
    severity: str = "normal",
    title: str,
    body: str,
    payload: Optional[Dict[str, Any]] = None,
    action_url: str = "",
    channels: Optional[List[str]] = None,
) -> Optional[str]:
    """
    Emite una notificación al usuario.
    channels=None → resuelve vía preferencias del usuario.
    Respeta quiet_hours (defer non-critical/high).
    Retorna notif_id o None si falla.
    """
    if not user_id:
        return None
    if type not in NOTIF_TYPES:
        type = "generic"
    if severity not in SEVERITIES:
        severity = "normal"

    # Leer preferencias
    prefs = await get_preferences(db, user_id)

    # Quiet hours check: si critical → siempre enviar; otros → defer non-in_app channels
    in_quiet = _is_quiet(prefs)
    is_critical = severity == "critical"

    # Resolver canales
    if channels is None:
        cat_prefs = prefs.get("categories", {}).get(type) or DEFAULT_CATEGORIES.get(type, {"in_app": True})
        resolved_channels: List[str] = []
        if cat_prefs.get("in_app"):
            resolved_channels.append("in_app")
        if cat_prefs.get("email") and (is_critical or severity == "high" or not in_quiet):
            resolved_channels.append("email")
        if cat_prefs.get("whatsapp") and (is_critical or not in_quiet):
            resolved_channels.append("whatsapp")
    else:
        resolved_channels = list(channels)

    notif_id = _notif_id()
    now = _now()
    doc = {
        "id": notif_id,
        "notif_id": notif_id,
        "user_id": user_id,
        "tenant_id": tenant_id,
        "type": type,
        "severity": severity,
        "title": title,
        "body": body,
        "payload": payload or {},
        "action_url": action_url,
        "channels_sent": resolved_channels,
        "read": False,
        "read_at": None,
        "created_at": now.isoformat(),
        "expires_at": (now + timedelta(days=30)).isoformat(),
        "digest_sent": False,
    }
    try:
        await db.notifications.insert_one(dict(doc))
    except Exception as exc:
        log.warning(f"[notifications] insert failed: {exc}")
        return None

    # Enviar email si está en canales resueltos
    if "email" in resolved_channels:
        try:
            email = await _get_user_email(db, user_id)
            if email:
                await _send_email_notification(email, title, body, action_url)
        except Exception as exc:
            log.warning(f"[notifications] email dispatch failed: {exc}")

    return notif_id


# ─── Read/list ───────────────────────────────────────────────────────────────

async def mark_read(db, notif_id: str, user_id: str) -> bool:
    res = await db.notifications.update_one(
        {"notif_id": notif_id, "user_id": user_id},
        {"$set": {"read": True, "read_at": _now().isoformat()}},
    )
    return res.modified_count > 0


async def mark_all_read(db, user_id: str, type: Optional[str] = None) -> int:
    q: Dict[str, Any] = {"user_id": user_id, "read": False}
    if type:
        q["type"] = type
    res = await db.notifications.update_many(q, {"$set": {"read": True, "read_at": _now().isoformat()}})
    return res.modified_count


async def get_notifications(
    db,
    user_id: str,
    unread_only: bool = False,
    limit: int = 20,
    type_filter: Optional[str] = None,
) -> List[Dict[str, Any]]:
    q: Dict[str, Any] = {"user_id": user_id}
    if unread_only:
        q["read"] = False
    if type_filter:
        q["type"] = type_filter
    cursor = db.notifications.find(q, {"_id": 0}).sort("created_at", -1).limit(min(limit, 100))
    return [doc async for doc in cursor]


async def unread_count(db, user_id: str) -> int:
    try:
        return await db.notifications.count_documents({"user_id": user_id, "read": False})
    except Exception:
        return 0


# ─── Preferences ─────────────────────────────────────────────────────────────

async def get_preferences(db, user_id: str) -> Dict[str, Any]:
    try:
        doc = await db.notification_preferences.find_one({"user_id": user_id}, {"_id": 0})
        if doc:
            return doc
    except Exception:
        pass
    return {
        "user_id": user_id,
        "categories": dict(DEFAULT_CATEGORIES),
        "quiet_hours": dict(DEFAULT_QUIET_HOURS),
        "digest_frequency": DEFAULT_DIGEST_FREQUENCY,
    }


async def update_preferences(db, user_id: str, prefs: Dict[str, Any]) -> bool:
    update = {
        "user_id": user_id,
        "categories": prefs.get("categories", DEFAULT_CATEGORIES),
        "quiet_hours": prefs.get("quiet_hours", DEFAULT_QUIET_HOURS),
        "digest_frequency": prefs.get("digest_frequency", DEFAULT_DIGEST_FREQUENCY),
        "updated_at": _now().isoformat(),
    }
    await db.notification_preferences.update_one(
        {"user_id": user_id}, {"$set": update}, upsert=True
    )
    return True


# ─── 10 Rules helpers ────────────────────────────────────────────────────────

async def rule_lead_new(db, lead_id: str, asesor_id: str, tenant_id: Optional[str] = None) -> Optional[str]:
    return await emit_notification(
        db,
        user_id=asesor_id,
        tenant_id=tenant_id,
        type="lead_new",
        severity="high",
        title="Nuevo lead asignado",
        body=f"Se te asignó el lead {lead_id}. Revisa el perfil y da el primer toque.",
        payload={"lead_id": lead_id},
        action_url="/asesor/contactos",
    )


async def rule_lead_high_urgency(db, lead_id: str, asesor_id: str, tenant_id: Optional[str] = None,
                                  disc: str = "", budget: float = 0, plazo_dias: int = 999) -> Optional[str]:
    is_urgent = (disc.upper() == "D" and budget >= 10_000_000 and plazo_dias <= 30)
    sev = "critical" if is_urgent else "high"
    return await emit_notification(
        db,
        user_id=asesor_id,
        tenant_id=tenant_id,
        type="lead_high_urgency",
        severity=sev,
        title="Lead de alta urgencia",
        body=f"Lead {lead_id} tiene perfil DISC-D + presupuesto >{budget/1e6:.1f}M y plazo {plazo_dias}d — contacto inmediato.",
        payload={"lead_id": lead_id, "disc": disc, "budget": budget, "plazo_dias": plazo_dias},
        action_url="/asesor/contactos",
    )


async def rule_meeting_reminder(db, meeting_id: str, asesor_id: str, hours_before: int = 24,
                                 tenant_id: Optional[str] = None, lead_name: str = "") -> Optional[str]:
    sev = "critical" if hours_before <= 1 else "normal"
    time_label = "1 hora" if hours_before <= 1 else f"{hours_before} horas"
    return await emit_notification(
        db,
        user_id=asesor_id,
        tenant_id=tenant_id,
        type="meeting_24h" if hours_before > 1 else "meeting_1h",
        severity=sev,
        title=f"Cita en {time_label}",
        body=f"Tienes una reunión{' con ' + lead_name if lead_name else ''} en {time_label}. Revisa el dossier de preparación.",
        payload={"meeting_id": meeting_id, "hours_before": hours_before},
        action_url="/asesor/tareas",
    )


async def rule_saved_zone_alert(db, user_id: str, zone_name: str, zone_id: str,
                                 trigger_type: str = "new_dev", tenant_id: Optional[str] = None) -> Optional[str]:
    return await emit_notification(
        db,
        user_id=user_id,
        tenant_id=tenant_id,
        type="saved_zone_alert",
        severity="normal",
        title=f"Alerta de zona: {zone_name}",
        body=f"Hay actividad nueva en tu zona guardada '{zone_name}' ({trigger_type}).",
        payload={"zone_id": zone_id, "zone_name": zone_name, "trigger_type": trigger_type},
        action_url="/mapa",
    )


# ─── W5.3 Parte 2B Sub-C — Forecast trend alert ──────────────────────────────

async def rule_forecast_trend_alert(
    db,
    zone_slug: str,
    zone_name: str,
    delta_pct_12m: float,
    tenant_id: Optional[str] = None,
) -> int:
    """Notifica a usuarios con saved_zones[slug]=true cuando el forecast 12m
    cruza umbrales (+10 alcista · -5 bajista). Idempotencia 14 días por
    (user_id, rule_key, zone_slug) usando colección `notification_dedupe`.

    Devuelve cantidad de notificaciones emitidas.
    """
    from datetime import datetime, timezone, timedelta

    if delta_pct_12m >= 10:
        severity = "normal"
        title = f"Buena oportunidad: {zone_name}"
        body = f"{zone_name} proyecta +{delta_pct_12m:.1f}% en 12 meses según nuestro modelo ARIMA."
        channels = ["in_app", "email"]
    elif delta_pct_12m <= -5:
        severity = "high"
        title = f"Riesgo: {zone_name}"
        body = f"{zone_name} proyecta {delta_pct_12m:.1f}% en 12 meses según nuestro modelo ARIMA."
        channels = ["in_app"]
    else:
        return 0

    rule_key = "forecast_trend_alert"
    sent = 0
    cutoff = datetime.now(timezone.utc) - timedelta(days=14)

    # Buscar usuarios con la zona guardada (saved_zones es dict o array según schema)
    user_cursor = db.users.find(
        {"$or": [
            {f"saved_zones.{zone_slug}": True},
            {"saved_zones": zone_slug},
        ]},
        {"_id": 0, "user_id": 1, "id": 1, "email": 1, "tenant_id": 1},
    )
    async for u in user_cursor:
        uid = u.get("user_id") or u.get("id")
        if not uid:
            continue
        # Idempotencia
        try:
            recent = await db.notification_dedupe.find_one({
                "user_id": uid,
                "rule_key": rule_key,
                "zone_slug": zone_slug,
                "sent_at_dt": {"$gte": cutoff},
            })
            if recent:
                continue
        except Exception:
            pass

        notif_id = await emit_notification(
            db,
            user_id=uid,
            tenant_id=u.get("tenant_id") or tenant_id,
            type="forecast_trend_alert",
            severity=severity,
            title=title,
            body=body,
            payload={
                "zone_slug": zone_slug,
                "zone_name": zone_name,
                "delta_pct_12m": round(float(delta_pct_12m), 2),
                "channels": channels,
            },
            action_url=f"/zona/{zone_slug}",
        )
        if notif_id:
            sent += 1
            try:
                await db.notification_dedupe.insert_one({
                    "user_id": uid,
                    "rule_key": rule_key,
                    "zone_slug": zone_slug,
                    "sent_at_dt": datetime.now(timezone.utc),
                })
            except Exception:
                pass

            # Email opcional para alcistas
            if "email" in channels and u.get("email"):
                try:
                    await _send_email_notification(
                        u["email"], title, body, action_url=f"/zona/{zone_slug}",
                    )
                except Exception:
                    pass

    return sent


async def rule_message_pending(db, lead_id: str, asesor_id: str, hours: float,
                                tenant_id: Optional[str] = None) -> Optional[str]:
    return await emit_notification(
        db,
        user_id=asesor_id,
        tenant_id=tenant_id,
        type="message_pending",
        severity="high",
        title="Mensaje sin respuesta",
        body=f"El lead {lead_id} lleva {hours:.1f}h sin recibir respuesta por WhatsApp.",
        payload={"lead_id": lead_id, "hours_pending": hours},
        action_url="/asesor/tareas",
    )


async def rule_listing_view_repeat(db, lead_id: str, asesor_id: str, listing_id: str,
                                    count: int, tenant_id: Optional[str] = None) -> Optional[str]:
    if count < 3:
        return None
    return await emit_notification(
        db,
        user_id=asesor_id,
        tenant_id=tenant_id,
        type="listing_view_repeat",
        severity="high",
        title="Lead revisó el mismo desarrollo",
        body=f"El lead {lead_id} vio el desarrollo {listing_id} {count} veces. Alta señal de interés.",
        payload={"lead_id": lead_id, "listing_id": listing_id, "view_count": count},
        action_url=f"/desarrollo/{listing_id}",
    )


async def rule_comparable_price_drop(db, dev_id: str, asesor_id: str, comparable_id: str,
                                      pct: float, tenant_id: Optional[str] = None) -> Optional[str]:
    if abs(pct) < 3.0:
        return None
    return await emit_notification(
        db,
        user_id=asesor_id,
        tenant_id=tenant_id,
        type="comparable_price_drop",
        severity="high",
        title=f"Bajada de precio en competidor ({abs(pct):.1f}%)",
        body=f"El desarrollo comparable {comparable_id} bajó {abs(pct):.1f}% respecto a {dev_id}. Revisa tu estrategia de precios.",
        payload={"dev_id": dev_id, "comparable_id": comparable_id, "delta_pct": pct},
        action_url="/desarrollador/competidores",
    )


async def rule_drop_off_pico(db, asesor_id: str, step: str, pct: float,
                              tenant_id: Optional[str] = None) -> Optional[str]:
    if pct < 30.0:
        return None
    return await emit_notification(
        db,
        user_id=asesor_id,
        tenant_id=tenant_id,
        type="drop_off_pico",
        severity="normal",
        title=f"Pico de abandono en etapa '{step}'",
        body=f"El {pct:.0f}% de leads abandona en la etapa '{step}'. Revisa tu proceso.",
        payload={"step": step, "dropoff_pct": pct},
        action_url="/asesor/busquedas",
    )


async def rule_cron_failed(db, cron_name: str, error: str, superadmin_id: str = "admin@desarrollosmx.com") -> Optional[str]:
    """Notifica a superadmin cuando un cron falla. superadmin_id puede ser email o user_id."""
    # Buscar superadmin por email si no tenemos user_id
    sa = await db.users.find_one(
        {"$or": [{"user_id": superadmin_id}, {"email": superadmin_id}]},
        {"_id": 0, "user_id": 1},
    )
    uid = sa["user_id"] if sa else superadmin_id
    return await emit_notification(
        db,
        user_id=uid,
        type="cron_failed",
        severity="critical",
        title=f"Cron fallido: {cron_name}",
        body=f"El cron '{cron_name}' falló: {error[:200]}",
        payload={"cron_name": cron_name, "error": error},
        action_url="/superadmin/health",
    )


async def rule_api_limit_warn(db, provider: str, usage_pct: float, superadmin_id: str = "admin@desarrollosmx.com") -> Optional[str]:
    if usage_pct < 80.0:
        return None
    sev = "critical" if usage_pct >= 95.0 else "high"
    sa = await db.users.find_one(
        {"$or": [{"user_id": superadmin_id}, {"email": superadmin_id}]},
        {"_id": 0, "user_id": 1},
    )
    uid = sa["user_id"] if sa else superadmin_id
    return await emit_notification(
        db,
        user_id=uid,
        type="api_limit_warn",
        severity=sev,
        title=f"Límite API: {provider} al {usage_pct:.0f}%",
        body=f"El proveedor {provider} está al {usage_pct:.0f}% de su límite de uso.",
        payload={"provider": provider, "usage_pct": usage_pct},
        action_url="/superadmin/ai-cost",
    )


# ─── Cron: digest 4h ─────────────────────────────────────────────────────────

async def digest_pending_notifications(db) -> Dict[str, Any]:
    """
    Agrupa notificaciones normal/low de últimas 4h sin digest_sent=True.
    Envía un email digest por usuario. Solo si prefs.digest_frequency != 'instant'.
    """
    sent_count = 0
    skipped = 0
    cutoff = (_now() - timedelta(hours=4)).isoformat()

    # Obtener usuarios con notifs pendientes en ventana de 4h
    pipeline = [
        {"$match": {
            "digest_sent": False,
            "severity": {"$in": ["normal", "low"]},
            "created_at": {"$gte": cutoff},
        }},
        {"$group": {"_id": "$user_id", "notifs": {"$push": "$$ROOT"}, "count": {"$sum": 1}}},
    ]
    groups = await db.notifications.aggregate(pipeline).to_list(length=500)

    for g in groups:
        uid = g["_id"]
        notifs = g["notifs"]
        if not notifs:
            continue

        prefs = await get_preferences(db, uid)
        freq = prefs.get("digest_frequency", "4h")
        if freq == "instant":
            # Instant → ya se envía individualmente, no digest
            await db.notifications.update_many(
                {"user_id": uid, "digest_sent": False, "severity": {"$in": ["normal", "low"]}},
                {"$set": {"digest_sent": True}},
            )
            skipped += 1
            continue

        if _is_quiet(prefs):
            skipped += 1
            continue

        # Componer y enviar digest
        email = await _get_user_email(db, uid)
        if not email:
            skipped += 1
            continue

        items_html = "".join(
            f"<tr><td style='padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06)'>"
            f"<strong style='color:#F0EBE0;font-size:13px'>{n['title']}</strong>"
            f"<br><span style='color:#a0a4b0;font-size:12px'>{n['body'][:120]}</span></td></tr>"
            for n in notifs[:10]
        )
        html = f"""
<html><body style='font-family:Arial;background:#06080F;color:#F0EBE0;padding:32px'>
<div style='max-width:520px;margin:0 auto'>
<div style='background:linear-gradient(90deg,#6366F1,#EC4899);border-radius:8px;padding:2px;margin-bottom:20px'>
<div style='background:#0d1017;border-radius:6px;padding:16px 20px'>
<span style='font-family:Outfit,Arial;font-weight:800;font-size:18px;color:#F0EBE0'>DesarrollosMX</span>
</div></div>
<h2 style='font-family:Outfit,Arial;font-weight:700;font-size:16px;color:#F0EBE0;margin:0 0 16px'>
Tienes {len(notifs)} notificaciones nuevas</h2>
<table style='width:100%;border-collapse:collapse'>{items_html}</table>
<div style='margin-top:24px'>
<a href='{FRONTEND_URL}/portal/notifications' style='display:inline-block;background:linear-gradient(90deg,#6366F1,#EC4899);color:#fff;font-size:13px;font-weight:600;padding:10px 22px;border-radius:9999px;text-decoration:none'>Ver todas</a>
</div>
<hr style='border:none;border-top:1px solid rgba(255,255,255,0.06);margin:24px 0'>
<p style='font-size:11px;color:#6b7280;margin:0'>
<a href='{FRONTEND_URL}/portal/settings/notifications' style='color:#6366F1;text-decoration:none'>Gestionar preferencias</a>
</p></div></body></html>"""
        ok = await _send_email_notification(
            email,
            f"Tienes {len(notifs)} notificaciones · DesarrollosMX",
            "",
            "",
            html_override=html,
        )
        if ok:
            await db.notifications.update_many(
                {"user_id": uid, "notif_id": {"$in": [n["notif_id"] for n in notifs]}},
                {"$set": {"digest_sent": True}},
            )
            sent_count += 1
        else:
            # Si falla, simplemente marcar para no reintentar indefinidamente
            await db.notifications.update_many(
                {"user_id": uid, "notif_id": {"$in": [n["notif_id"] for n in notifs]}},
                {"$set": {"digest_sent": True}},
            )
            skipped += 1

    return {"sent_digests": sent_count, "skipped": skipped, "groups": len(groups)}


# ─── Cron: WA pending replies check ─────────────────────────────────────────

async def check_pending_whatsapp_replies(db) -> Dict[str, Any]:
    """
    Revisa mensajes WA outbound sin reply_at enviados hace >2h.
    Para cada uno, emite rule_message_pending al asesor.
    """
    cutoff = (_now() - timedelta(hours=2)).isoformat()
    # Mensajes outbound sin respuesta recibida, más viejos de 2h
    cursor = db.whatsapp_messages.find(
        {
            "direction": "outbound",
            "sent_at": {"$lte": cutoff},
            "lead_id": {"$ne": None},
            "_pending_notif_sent": {"$ne": True},
        },
        {"_id": 0},
    ).limit(200)

    triggered = 0
    async for msg in cursor:
        lead_id = msg.get("lead_id")
        org_id = msg.get("org_id")
        if not lead_id:
            continue
        # Verificar si hay inbound después del outbound
        reply = await db.whatsapp_messages.find_one({
            "lead_id": lead_id,
            "direction": "inbound",
            "created_at": {"$gt": msg.get("sent_at", "")},
        }, {"_id": 1})
        if reply:
            # Hay reply → marcar como procesado
            await db.whatsapp_messages.update_one({"_id": msg["_id"]}, {"$set": {"_pending_notif_sent": True}})
            continue

        # Buscar asesor asignado al lead
        lead = await db.leads.find_one({"id": lead_id}, {"_id": 0, "assigned_to": 1, "tenant_id": 1})
        if not lead:
            await db.whatsapp_messages.update_one({"_id": msg["_id"]}, {"$set": {"_pending_notif_sent": True}})
            continue

        asesor_id = lead.get("assigned_to")
        tenant_id = lead.get("tenant_id") or org_id
        if asesor_id:
            sent_at = msg.get("sent_at", cutoff)
            hours_pending = (_now() - datetime.fromisoformat(sent_at.replace("Z", "+00:00"))).total_seconds() / 3600
            await rule_message_pending(db, lead_id, asesor_id, hours_pending, tenant_id)
            triggered += 1

        await db.whatsapp_messages.update_one(
            {"_id": msg["_id"]}, {"$set": {"_pending_notif_sent": True}}
        )

    return {"triggered": triggered}


# ─── Indexes ─────────────────────────────────────────────────────────────────

async def ensure_notifications_indexes(db) -> None:
    try:
        from pymongo import ASCENDING, DESCENDING
        await db.notifications.create_index(
            [("user_id", ASCENDING), ("created_at", DESCENDING)], name="user_created_idx"
        )
        await db.notifications.create_index(
            [("user_id", ASCENDING), ("read", ASCENDING), ("created_at", DESCENDING)],
            name="user_unread_idx",
        )
        await db.notifications.create_index("notif_id", unique=True, sparse=True)
        await db.notifications.create_index("expires_at", expireAfterSeconds=0, sparse=True)
        await db.notification_preferences.create_index("user_id", unique=True)
        log.info("[notifications] indexes OK")
    except Exception as exc:
        log.warning(f"[notifications] index creation warning: {exc}")


async def rule_buyer_hot_jump(
    db,
    buyer_user_id: str,
    prev_score: float,
    new_score: float,
    tier: str,
) -> Optional[str]:
    """W5.4 Sub-D — Emite alerta al asesor cuando el buyer sube ≥10 puntos de score.

    Idempotencia 7d: una sola notif por (asesor_id, buyer_user_id) por semana.
    """
    if new_score - prev_score < 10:
        return None

    # Obtener nombre del buyer
    buyer_user = await db.users.find_one(
        {"user_id": buyer_user_id}, {"_id": 0, "first_name": 1, "last_name": 1, "email": 1}
    )
    buyer_name = (
        f"{(buyer_user or {}).get('first_name', '')} {(buyer_user or {}).get('last_name', '')}".strip()
        or (buyer_user or {}).get("email", buyer_user_id)
    )

    # Buscar asesor responsable: leads con email del buyer
    asesor_id: Optional[str] = None
    buyer_email = (buyer_user or {}).get("email", "")
    if buyer_email:
        lead = await db.leads.find_one(
            {"email": buyer_email},
            {"_id": 0, "asesor_id": 1, "owner_id": 1},
            sort=[("created_at", -1)],
        )
        asesor_id = (lead or {}).get("asesor_id") or (lead or {}).get("owner_id")

    if not asesor_id:
        # Intentar en buyer_assignments
        assignment = await db.buyer_assignments.find_one(
            {"buyer_user_id": buyer_user_id}, {"_id": 0, "asesor_id": 1}
        )
        asesor_id = (assignment or {}).get("asesor_id")

    if not asesor_id:
        log.warning(f"[notif] buyer_hot_jump: sin asesor responsable para buyer {buyer_user_id} · skip")
        return None

    # Idempotencia 7d
    cutoff_str = (_now() - timedelta(days=7)).isoformat()
    existing = await db.notifications.find_one({
        "user_id": asesor_id,
        "type": "buyer_hot_jump",
        "payload.buyer_user_id": buyer_user_id,
        "created_at": {"$gte": cutoff_str},
    })
    if existing:
        log.info(f"[notif] buyer_hot_jump duplicate suprimido · asesor={asesor_id} buyer={buyer_user_id}")
        return None

    tier_label = {"hot": "ACTIVO", "warm": "tibio", "cold": "frio"}.get(tier, tier)
    copy = (
        f"{buyer_name} subio de score {int(prev_score)} a {int(new_score)} ({tier_label}) · contactalo ahora"
    )

    return await emit_notification(
        db,
        user_id=asesor_id,
        type="buyer_hot_jump",
        severity="high",
        title="Buyer activo — score elevado",
        body=copy,
        payload={"buyer_user_id": buyer_user_id, "prev_score": prev_score, "new_score": new_score, "tier": tier},
        action_url="/asesor/contactos?score_min=75",
    )



# ─── W5.ASR.5 Parte 2 — Lead capturado automáticamente ──────────────────────

_SOURCE_LABELS = {
    "portal_inmuebles24": "Inmuebles24",
    "portal_lamudi":      "Lamudi",
    "fb_lead_ads":        "FB Lead Ads",
    "email_alias":        "Email directo",
    "landing":            "Landing page",
    "manual":             "Manual",
}


async def rule_lead_captured_auto(
    db,
    lead_id: str,
    asesor_id: str,
    source: str,
    lead_name: Optional[str] = None,
    parser_used: Optional[str] = None,
    tenant_id: Optional[str] = None,
) -> Optional[str]:
    """W5.ASR.5 P2 — Notifica al asesor cuando un lead es capturado automáticamente.

    Idempotencia 1h por (asesor_id, lead_id) — evita duplicar si hay reproceso.
    """
    if not asesor_id:
        return None

    # Idempotencia: 1 hora
    cutoff_str = (_now() - timedelta(hours=1)).isoformat()
    existing = await db.notifications.find_one({
        "user_id": asesor_id,
        "type": "lead_captured_auto",
        "payload.lead_id": lead_id,
        "created_at": {"$gte": cutoff_str},
    })
    if existing:
        log.info(f"[notif] lead_captured_auto idempotente · asesor={asesor_id} lead={lead_id}")
        return None

    source_label = _SOURCE_LABELS.get(source, source)
    display_name = lead_name or lead_id
    body = f"Nuevo lead automático: {display_name} · vía {source_label} · click para abrir"

    return await emit_notification(
        db,
        user_id=asesor_id,
        tenant_id=tenant_id,
        type="lead_captured_auto",
        severity="high",
        title="Nuevo lead capturado automáticamente",
        body=body,
        payload={
            "lead_id": lead_id,
            "source": source,
            "parser_used": parser_used,
            "source_label": source_label,
        },
        action_url="/asesor/contactos",
    )
