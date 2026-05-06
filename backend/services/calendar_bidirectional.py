"""Phase 4 Batch 33 · services — Calendar Bidirectional Sync.

Sub-A: extends B15 (DMX → Google) con INBOUND (Google → DMX).
- Webhook subscriptions Google Calendar API watch
- Polling fallback (APScheduler 30min) si webhook falla
- Auto-renew 6 días antes de expirar
- Idempotent upsert en db.appointments

Schemas:
  db.calendar_webhook_subscriptions: { asesor_id, provider 'google',
    channel_id, resource_id, expiration_at, created_at, last_event_synced_at?,
    status: 'active' | 'expired' | 'error' }
  db.appointments (extend): synced_from_external bool, external_event_id str?
"""
from __future__ import annotations

import logging
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import httpx

log = logging.getLogger("dmx.calendar_bidirectional")

WEBHOOK_LIFE_DAYS = 7
RENEW_BEFORE_DAYS = 1
PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "") or os.environ.get(
    "REACT_APP_BACKEND_URL", "",
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt else None


# ─── Subscribe webhook ─────────────────────────────────────────────────────────

async def subscribe_webhooks(db, asesor_id: str) -> Dict[str, Any]:
    """
    Activa watch en Google Calendar primary del asesor.
    Si OAuth no está configurado, marca status='error' y registra fallback polling.
    """
    # Buscar token OAuth Google del asesor (B15 schema)
    conn = await db.calendar_connections.find_one(
        {"asesor_id": asesor_id, "provider": "google", "status": "active"},
        {"_id": 0},
    )

    channel_id = f"dmx-{secrets.token_urlsafe(16)}"
    expiration_at = _now() + timedelta(days=WEBHOOK_LIFE_DAYS)
    status = "polling"  # default fallback
    resource_id = ""

    if conn and PUBLIC_BASE_URL:
        try:
            from oauth_calendar import decrypt_token
            access_token = decrypt_token(conn.get("access_token_enc", ""))

            if access_token:
                callback_url = (
                    f"{PUBLIC_BASE_URL}/api/asesor/calendar/webhook/callback"
                )
                async with httpx.AsyncClient(timeout=12.0) as client:
                    r = await client.post(
                        "https://www.googleapis.com/calendar/v3/calendars/primary/events/watch",
                        headers={"Authorization": f"Bearer {access_token}",
                                 "Content-Type": "application/json"},
                        json={
                            "id": channel_id,
                            "type": "web_hook",
                            "address": callback_url,
                            "expiration": int(expiration_at.timestamp() * 1000),
                            "params": {"ttl": str(WEBHOOK_LIFE_DAYS * 86400)},
                        },
                    )
                if r.status_code in (200, 201):
                    body = r.json()
                    resource_id = body.get("resourceId", "")
                    if body.get("expiration"):
                        expiration_at = datetime.fromtimestamp(
                            int(body["expiration"]) / 1000, tz=timezone.utc,
                        )
                    status = "active"
                else:
                    log.warning(
                        f"[calendar_bidi] watch HTTP {r.status_code}: {r.text[:200]}",
                    )
        except Exception as e:
            log.warning(f"[calendar_bidi] subscribe exception: {e}")

    doc = {
        "asesor_id": asesor_id,
        "provider": "google",
        "channel_id": channel_id,
        "resource_id": resource_id,
        "expiration_at": expiration_at,
        "created_at": _now(),
        "status": status,
    }
    await db.calendar_webhook_subscriptions.update_one(
        {"asesor_id": asesor_id, "provider": "google"},
        {"$set": doc},
        upsert=True,
    )

    out = dict(doc)
    out["expiration_at"] = _iso(doc["expiration_at"])
    out["created_at"] = _iso(doc["created_at"])
    return out


async def unsubscribe_webhooks(db, asesor_id: str) -> bool:
    sub = await db.calendar_webhook_subscriptions.find_one(
        {"asesor_id": asesor_id, "provider": "google"}, {"_id": 0},
    )
    if not sub:
        return False
    # Best-effort stop notifications
    try:
        conn = await db.calendar_connections.find_one(
            {"asesor_id": asesor_id, "provider": "google"}, {"_id": 0},
        )
        if conn:
            from oauth_calendar import decrypt_token
            access_token = decrypt_token(conn.get("access_token_enc", ""))
            if access_token:
                async with httpx.AsyncClient(timeout=8.0) as client:
                    await client.post(
                        "https://www.googleapis.com/calendar/v3/channels/stop",
                        headers={"Authorization": f"Bearer {access_token}",
                                 "Content-Type": "application/json"},
                        json={"id": sub.get("channel_id"),
                              "resourceId": sub.get("resource_id")},
                    )
    except Exception:
        pass
    await db.calendar_webhook_subscriptions.delete_one(
        {"asesor_id": asesor_id, "provider": "google"},
    )
    return True


# ─── Pull events from Google ──────────────────────────────────────────────────

async def _pull_events_google(
    db, asesor_id: str, since_minutes: int = 1440,
) -> int:
    """Pull events últimos N min, idempotent upsert. Retorna count synced."""
    conn = await db.calendar_connections.find_one(
        {"asesor_id": asesor_id, "provider": "google", "status": "active"},
        {"_id": 0},
    )
    if not conn:
        return 0

    try:
        from oauth_calendar import decrypt_token
        access_token = decrypt_token(conn.get("access_token_enc", ""))
    except Exception:
        return 0
    if not access_token:
        return 0

    time_min = (_now() - timedelta(minutes=since_minutes)).isoformat()
    time_max = (_now() + timedelta(days=60)).isoformat()
    params = {
        "timeMin": time_min, "timeMax": time_max,
        "singleEvents": "true", "orderBy": "startTime",
        "maxResults": "100",
    }

    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            r = await client.get(
                "https://www.googleapis.com/calendar/v3/calendars/primary/events",
                headers={"Authorization": f"Bearer {access_token}"},
                params=params,
            )
        if r.status_code != 200:
            log.warning(f"[calendar_bidi] events HTTP {r.status_code}")
            return 0
        items = r.json().get("items", [])
    except Exception as e:
        log.warning(f"[calendar_bidi] events exception: {e}")
        return 0

    synced = 0
    for it in items:
        if it.get("status") == "cancelled":
            continue
        ev_id = it.get("id")
        start = (it.get("start") or {}).get("dateTime") or (it.get("start") or {}).get("date")
        end = (it.get("end") or {}).get("dateTime") or (it.get("end") or {}).get("date")
        summary = it.get("summary", "")
        description = it.get("description", "")
        if not ev_id or not start:
            continue

        # Match by external_event_id (DMX-created events also have this)
        existing = await db.appointments.find_one(
            {"external_event_id": ev_id}, {"_id": 0, "appointment_id": 1},
        )

        if existing:
            await db.appointments.update_one(
                {"external_event_id": ev_id},
                {"$set": {
                    "scheduled_at": start, "ends_at": end,
                    "title": summary, "notes": description,
                    "synced_at": _now(),
                }},
            )
        else:
            doc = {
                "appointment_id": str(uuid.uuid4()),
                "asesor_id": asesor_id,
                "external_event_id": ev_id,
                "synced_from_external": True,
                "title": summary,
                "notes": description,
                "scheduled_at": start,
                "ends_at": end,
                "status": "scheduled",
                "created_at": _now(),
                "synced_at": _now(),
                "source": "google_inbound",
            }
            await db.appointments.insert_one(doc)
        synced += 1

    # Update last_sync
    await db.calendar_webhook_subscriptions.update_one(
        {"asesor_id": asesor_id, "provider": "google"},
        {"$set": {"last_event_synced_at": _now()}},
        upsert=False,
    )
    return synced


# ─── Webhook callback ─────────────────────────────────────────────────────────

async def handle_webhook_callback(
    db,
    channel_id: str,
    resource_id: str,
    resource_state: str = "exists",
) -> Dict[str, Any]:
    """
    Llamado por Google al notificar cambios.
    Pull events + idempotent upsert.
    """
    sub = await db.calendar_webhook_subscriptions.find_one(
        {"channel_id": channel_id}, {"_id": 0},
    )
    if not sub:
        return {"ignored": True, "reason": "channel not found"}

    if resource_state == "sync":
        # Initial sync handshake
        return {"acknowledged": True}

    asesor_id = sub.get("asesor_id")
    synced = await _pull_events_google(db, asesor_id, since_minutes=2880)
    return {"synced": synced, "asesor_id": asesor_id}


# ─── Polling fallback ─────────────────────────────────────────────────────────

async def polling_sync_all(db) -> Dict[str, Any]:
    """
    Cron job 30min: sincroniza asesores con webhook='polling' o 'error'
    o cuyo último sync sea >30min antes.
    """
    cutoff = _now() - timedelta(minutes=30)
    cur = db.calendar_webhook_subscriptions.find(
        {"$or": [
            {"status": {"$in": ["polling", "error"]}},
            {"last_event_synced_at": {"$lt": cutoff}},
            {"last_event_synced_at": {"$exists": False}},
        ]},
        {"_id": 0, "asesor_id": 1},
    )
    total = 0
    asesores = 0
    async for sub in cur:
        try:
            n = await _pull_events_google(db, sub["asesor_id"])
            total += n
            asesores += 1
        except Exception as e:
            log.warning(f"[calendar_bidi] polling for {sub['asesor_id']}: {e}")
    log.info(f"[calendar_bidi] polling synced {total} events across {asesores} asesores")
    return {"total_events": total, "asesores": asesores}


# ─── Auto-renew ───────────────────────────────────────────────────────────────

async def renew_expiring_webhooks(db) -> int:
    """Cron daily: re-subscribe webhooks que expiran en <RENEW_BEFORE_DAYS días."""
    threshold = _now() + timedelta(days=RENEW_BEFORE_DAYS)
    cur = db.calendar_webhook_subscriptions.find(
        {"expiration_at": {"$lte": threshold}, "status": "active"},
        {"_id": 0, "asesor_id": 1},
    )
    renewed = 0
    async for sub in cur:
        try:
            await subscribe_webhooks(db, sub["asesor_id"])
            renewed += 1
        except Exception as e:
            log.warning(f"[calendar_bidi] renew failed for {sub['asesor_id']}: {e}")
    return renewed


# ─── Status ───────────────────────────────────────────────────────────────────

async def get_sync_status(db, asesor_id: str) -> Dict[str, Any]:
    sub = await db.calendar_webhook_subscriptions.find_one(
        {"asesor_id": asesor_id, "provider": "google"}, {"_id": 0},
    )
    events_count = await db.appointments.count_documents(
        {"asesor_id": asesor_id, "synced_from_external": True},
    )
    if not sub:
        return {
            "webhook_active": False,
            "status": "off",
            "last_sync_at": None,
            "events_synced_count": events_count,
        }
    return {
        "webhook_active": sub.get("status") == "active",
        "status": sub.get("status", "off"),
        "last_sync_at": _iso(sub.get("last_event_synced_at"))
            if isinstance(sub.get("last_event_synced_at"), datetime)
            else sub.get("last_event_synced_at"),
        "expiration_at": _iso(sub.get("expiration_at"))
            if isinstance(sub.get("expiration_at"), datetime)
            else sub.get("expiration_at"),
        "events_synced_count": events_count,
    }


# ─── Indexes ──────────────────────────────────────────────────────────────────

async def ensure_calendar_bidi_indexes(db) -> None:
    await db.calendar_webhook_subscriptions.create_index(
        [("asesor_id", 1), ("provider", 1)], unique=True,
    )
    await db.calendar_webhook_subscriptions.create_index("channel_id", unique=True)
    await db.calendar_webhook_subscriptions.create_index("expiration_at")
    await db.appointments.create_index("external_event_id", sparse=True)
    log.info("[calendar_bidi] indexes ensured")
