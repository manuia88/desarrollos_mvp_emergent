"""Phase 4 Batch 29 · services — Smart Buyer Alerts.

Esquemas:
  db.buyer_alerts: {
    alert_id, user_id, type, channel, conditions,
    frequency, active, last_triggered, created_at
  }
  db.alert_deliveries: {
    delivery_id, alert_id, user_id, payload,
    channel, status, sent_at
  }
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.buyer_alerts")

VALID_TYPES = ("new_match", "price_drop", "slot_available", "project_status")
VALID_CHANNELS = ("push", "email", "whatsapp")
VALID_FREQUENCIES = ("instant", "daily", "weekly")


# ─── Email HTML ────────────────────────────────────────────────────────────────

def _alert_email_html(alert_type: str, payload: Dict[str, Any], user_email: str) -> str:
    titles = {
        "new_match": "Nuevo desarrollo que coincide con tu búsqueda",
        "price_drop": "Reducción de precio en un desarrollo que sigues",
        "slot_available": "Hay unidades disponibles en el proyecto que te interesa",
        "project_status": "Actualización de estado en un desarrollo",
    }
    title = titles.get(alert_type, "Nueva alerta en DesarrollosMX")
    summary = payload.get("summary", "")
    return f"""<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><title>{title}</title></head>
<body style="margin:0;padding:0;background:#06080F;font-family:'DM Sans',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#06080F;min-height:100vh;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0"
        style="background:rgba(13,16,23,0.92);border:1px solid rgba(240,235,224,0.1);border-radius:16px;overflow:hidden;">
        <tr><td style="background:linear-gradient(90deg,#6366F1,#EC4899);padding:4px 0;"></td></tr>
        <tr><td style="padding:32px 32px 24px;">
          <div style="font-family:'Outfit',Arial,sans-serif;font-size:22px;font-weight:800;
            color:#F0EBE0;letter-spacing:-0.02em;margin-bottom:6px;">DesarrollosMX</div>
          <div style="font-size:11px;font-weight:700;color:rgba(99,102,241,0.85);
            text-transform:uppercase;letter-spacing:0.08em;margin-bottom:24px;">Portal Comprador</div>
          <div style="font-size:18px;font-weight:700;color:#F0EBE0;margin-bottom:12px;">{title}</div>
          {f'<div style="font-size:14px;color:rgba(240,235,224,0.75);line-height:1.6;margin-bottom:20px;">{summary}</div>' if summary else ''}
          <a href="https://desarrollosmx.io/comprador"
            style="display:inline-block;padding:12px 24px;border-radius:9999px;
            background:linear-gradient(90deg,#6366F1,#EC4899);
            color:#fff;font-size:13px;font-weight:700;text-decoration:none;">
            Ver en mi portal
          </a>
        </td></tr>
        <tr><td style="padding:16px 32px 24px;border-top:1px solid rgba(240,235,224,0.06);">
          <div style="font-size:11px;color:rgba(240,235,224,0.3);">
            Recibiste esta alerta porque la activaste en tu Portal Comprador.
            Puedes gestionarla en la sección Alertas.
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


# ─── Trigger ───────────────────────────────────────────────────────────────────

async def trigger_alert(db, alert: Dict[str, Any], payload: Dict[str, Any]) -> str:
    """
    Despacha una alerta por su canal configurado.
    Retorna delivery_id.
    """
    delivery_id = uuid.uuid4().hex
    channel = alert.get("channel", "push")
    user_id = alert.get("user_id", "")
    status = "sent"

    try:
        if channel == "email":
            user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0, "email": 1})
            to_email = user_doc.get("email", "") if user_doc else ""
            if to_email:
                from services.lead_capture import _send_email
                html = _alert_email_html(alert.get("type", "new_match"), payload, to_email)
                subject_map = {
                    "new_match": "Nuevo match con tu búsqueda · DesarrollosMX",
                    "price_drop": "Baja de precio detectada · DesarrollosMX",
                    "slot_available": "Unidades disponibles · DesarrollosMX",
                    "project_status": "Actualización de proyecto · DesarrollosMX",
                }
                ok = await _send_email(
                    to_email,
                    subject_map.get(alert.get("type", "new_match"), "Alerta · DesarrollosMX"),
                    html,
                )
                status = "sent" if ok else "failed"
            else:
                status = "failed"

        elif channel == "push":
            from routes_dev_batch14 import create_notification
            notif_titles = {
                "new_match": "Nuevo match en tu búsqueda guardada",
                "price_drop": "Baja de precio detectada",
                "slot_available": "Unidades disponibles en proyecto que sigues",
                "project_status": "Proyecto actualizado",
            }
            await create_notification(
                db,
                user_id=user_id,
                notif_type="buyer_alert",
                title=notif_titles.get(alert.get("type", "new_match"), "Alerta"),
                body=payload.get("summary", "Hay novedades en tu búsqueda."),
                action_url="/comprador/alertas",
                priority="med",
            )
            status = "sent"

        elif channel == "whatsapp":
            # Forward-compat stub — WA Business Phase 8
            log.info(f"[buyer_alerts] WA stub: alert_id={alert.get('alert_id')} user={user_id}")
            status = "pending_wa"

    except Exception as e:
        log.warning(f"[buyer_alerts] trigger failed channel={channel}: {e}")
        status = "failed"

    # Record delivery
    now = datetime.now(timezone.utc)
    delivery_doc = {
        "delivery_id": delivery_id,
        "alert_id": alert.get("alert_id", ""),
        "user_id": user_id,
        "payload": payload,
        "channel": channel,
        "status": status,
        "sent_at": now,
    }
    try:
        await db.alert_deliveries.insert_one(delivery_doc)
        # Update last_triggered
        await db.buyer_alerts.update_one(
            {"alert_id": alert["alert_id"]},
            {"$set": {"last_triggered": now}},
        )
    except Exception as e:
        log.warning(f"[buyer_alerts] delivery insert failed: {e}")

    return delivery_id


# ─── Condition evaluators ──────────────────────────────────────────────────────

async def _check_new_match(db, alert: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    new_match: si existe una saved_search con match nuevo desde last_triggered.
    """
    try:
        conditions = alert.get("conditions", {})
        search_id = conditions.get("saved_search_id")
        if not search_id:
            # Genérico: buscar cualquier proyecto nuevo (últimas 24h)
            last_triggered = alert.get("last_triggered")
            since = last_triggered if last_triggered else (datetime.now(timezone.utc) - timedelta(hours=24))
            count = await db.developments.count_documents({"created_at": {"$gte": since}})
            if count > 0:
                return {"summary": f"Hay {count} desarrollos nuevos en el marketplace."}
            return None

        saved = await db.saved_searches.find_one({"search_id": search_id}, {"_id": 0})
        if not saved:
            return None

        # Buscar propiedades nuevas con filtros de la búsqueda
        last_triggered = alert.get("last_triggered")
        since = last_triggered if last_triggered else (datetime.now(timezone.utc) - timedelta(days=1))

        query: Dict[str, Any] = {"created_at": {"$gte": since}}
        filters = saved.get("filters", {})
        if filters.get("price_max"):
            query["price_from"] = {"$lte": int(filters["price_max"])}
        if filters.get("colonia"):
            query["colonia_id"] = filters["colonia"]

        count = await db.developments.count_documents(query)
        if count > 0:
            return {"summary": f"{count} desarrollos nuevos coinciden con tu búsqueda guardada."}
    except Exception as e:
        log.debug(f"[buyer_alerts] new_match eval error: {e}")
    return None


async def _check_price_drop(db, alert: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    price_drop: si precio de project_id bajó más de threshold_pct desde baseline.
    """
    try:
        conditions = alert.get("conditions", {})
        project_id = conditions.get("project_id")
        threshold_pct = float(conditions.get("threshold_pct", 5.0))

        if not project_id:
            return None

        dev = await db.developments.find_one(
            {"$or": [{"id": project_id}, {"slug": project_id}]},
            {"_id": 0, "price_from": 1, "name": 1},
        )
        if not dev:
            return None

        # Check price history for drop
        last_price = await db.unit_price_history.find_one(
            {"development_id": project_id},
            sort=[("changed_at", -1)],
        ) if await db.list_collection_names() else None

        baseline_price = conditions.get("baseline_price")
        current_price = dev.get("price_from", 0)
        if not baseline_price or not current_price:
            return None

        drop_pct = ((baseline_price - current_price) / baseline_price) * 100
        if drop_pct >= threshold_pct:
            return {
                "summary": f"{dev.get('name', project_id)} bajó {drop_pct:.1f}% · "
                           f"Precio actual: ${current_price:,} MXN",
            }
    except Exception as e:
        log.debug(f"[buyer_alerts] price_drop eval error: {e}")
    return None


async def _check_slot_available(db, alert: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    slot_available: si proyecto tiene unidades disponibles.
    """
    try:
        conditions = alert.get("conditions", {})
        project_id = conditions.get("project_id")
        if not project_id:
            return None

        count = await db.units.count_documents(
            {"development_id": project_id, "status": "disponible"}
        )
        if count > 0:
            dev = await db.developments.find_one(
                {"$or": [{"id": project_id}, {"slug": project_id}]},
                {"_id": 0, "name": 1},
            )
            name = dev.get("name", project_id) if dev else project_id
            return {"summary": f"{count} unidad(es) disponibles en {name}."}
    except Exception as e:
        log.debug(f"[buyer_alerts] slot_available eval error: {e}")
    return None


async def _check_project_status(db, alert: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    project_status: si el estado del proyecto cambió.
    """
    try:
        conditions = alert.get("conditions", {})
        project_id = conditions.get("project_id")
        last_known_status = conditions.get("last_known_status")
        if not project_id:
            return None

        dev = await db.developments.find_one(
            {"$or": [{"id": project_id}, {"slug": project_id}]},
            {"_id": 0, "stage": 1, "name": 1},
        )
        if not dev:
            return None

        current_status = dev.get("stage", "")
        if last_known_status and current_status != last_known_status:
            return {
                "summary": f"{dev.get('name', project_id)}: estado cambió "
                           f"de '{last_known_status}' a '{current_status}'.",
            }
    except Exception as e:
        log.debug(f"[buyer_alerts] project_status eval error: {e}")
    return None


# ─── Main evaluator ────────────────────────────────────────────────────────────

async def evaluate_alerts(db, user_id: Optional[str] = None, frequency: Optional[str] = None) -> Dict[str, Any]:
    """
    Evalúa las alertas activas y despacha si hay payload.
    user_id=None → procesa todos.
    frequency=None → procesa todas las frecuencias.
    """
    q: Dict[str, Any] = {"active": True}
    if user_id:
        q["user_id"] = user_id
    if frequency:
        q["frequency"] = frequency

    triggered = 0
    skipped = 0
    errors = 0

    try:
        alerts = await db.buyer_alerts.find(q, {"_id": 0}).to_list(1000)
    except Exception as e:
        log.error(f"[buyer_alerts] DB query failed: {e}")
        return {"triggered": 0, "skipped": 0, "errors": 1}

    evaluators = {
        "new_match": _check_new_match,
        "price_drop": _check_price_drop,
        "slot_available": _check_slot_available,
        "project_status": _check_project_status,
    }

    for alert in alerts:
        alert_type = alert.get("type", "")
        evaluator = evaluators.get(alert_type)
        if not evaluator:
            skipped += 1
            continue

        try:
            payload = await evaluator(db, alert)
            if payload:
                await trigger_alert(db, alert, payload)
                triggered += 1
            else:
                skipped += 1
        except Exception as e:
            log.warning(f"[buyer_alerts] eval error for alert {alert.get('alert_id')}: {e}")
            errors += 1

    log.info(f"[buyer_alerts] eval done freq={frequency}: triggered={triggered} skipped={skipped} errors={errors}")
    return {"triggered": triggered, "skipped": skipped, "errors": errors}


# ─── Match handler hook ────────────────────────────────────────────────────────

async def register_match_handler(db, user_id: str, search_id: str, matched_count: int) -> None:
    """
    Hook: llama cuando saved_search detecta nuevas propiedades.
    Activa alertas type='new_match' que referencian este search_id.
    """
    try:
        alert = await db.buyer_alerts.find_one(
            {
                "user_id": user_id,
                "type": "new_match",
                "active": True,
                "conditions.saved_search_id": search_id,
            },
            {"_id": 0},
        )
        if alert:
            payload = {"summary": f"{matched_count} propiedades nuevas coinciden con tu búsqueda guardada."}
            await trigger_alert(db, alert, payload)
    except Exception as e:
        log.warning(f"[buyer_alerts] match_handler error: {e}")


# ─── Ensure indexes ────────────────────────────────────────────────────────────

async def ensure_buyer_alerts_indexes(db) -> None:
    await db.buyer_alerts.create_index("user_id")
    await db.buyer_alerts.create_index("alert_id", unique=True)
    await db.buyer_alerts.create_index([("user_id", 1), ("active", 1)])
    await db.buyer_alerts.create_index([("frequency", 1), ("active", 1)])
    await db.alert_deliveries.create_index("alert_id")
    await db.alert_deliveries.create_index("user_id")
    await db.alert_deliveries.create_index([("user_id", 1), ("sent_at", -1)])
