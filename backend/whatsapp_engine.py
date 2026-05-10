"""W4.10 Sub-Fix 1 — WhatsApp Business Engine.

Provider-agnostic adapter para WhatsApp: stub | twilio | business (Meta).
WHATSAPP_PROVIDER env var controla el modo activo.

Phase Y: master_switch + feature_tier whatsapp_business >= T1
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import os
import uuid
from base64 import b64decode
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.whatsapp")

PROVIDER = os.environ.get("WHATSAPP_PROVIDER", "stub").lower()
TWILIO_SID = os.environ.get("TWILIO_ACCOUNT_SID", "")
TWILIO_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "")
TWILIO_WA_FROM = os.environ.get("TWILIO_WA_FROM", "whatsapp:+14155238886")
META_TOKEN = os.environ.get("META_WA_TOKEN", "")
META_PHONE_ID = os.environ.get("META_WA_PHONE_ID", "")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _msg_id() -> str:
    return f"wa_{uuid.uuid4().hex[:16]}"


# ─── Twilio adapter ────────────────────────────────────────────────────────────

def _twilio_send(to_number: str, body: str) -> Dict[str, Any]:
    """Envía mensaje vía Twilio WhatsApp API."""
    try:
        from twilio.rest import Client
        client = Client(TWILIO_SID, TWILIO_TOKEN)
        to = f"whatsapp:{to_number}" if not to_number.startswith("whatsapp:") else to_number
        msg = client.messages.create(
            from_=TWILIO_WA_FROM,
            to=to,
            body=body,
        )
        return {"ok": True, "provider_message_id": msg.sid, "status": "queued"}
    except Exception as exc:
        log.error(f"[whatsapp] twilio send error: {exc}")
        return {"ok": False, "error": str(exc), "status": "failed"}


def _verify_twilio_signature(url: str, post_vars: Dict[str, str], signature: str) -> bool:
    """Verifica HMAC-SHA1 de Twilio webhook."""
    try:
        from twilio.request_validator import RequestValidator
        validator = RequestValidator(TWILIO_TOKEN)
        return validator.validate(url, post_vars, signature)
    except Exception:
        return False


# ─── Meta/Business adapter ────────────────────────────────────────────────────

def _meta_send(to_number: str, body: str) -> Dict[str, Any]:
    """Envía mensaje vía Meta Business Cloud API."""
    try:
        import httpx
        import asyncio
        resp = httpx.post(
            f"https://graph.facebook.com/v19.0/{META_PHONE_ID}/messages",
            headers={"Authorization": f"Bearer {META_TOKEN}", "Content-Type": "application/json"},
            json={
                "messaging_product": "whatsapp",
                "to": to_number,
                "type": "text",
                "text": {"body": body},
            },
            timeout=10,
        )
        if resp.status_code == 200:
            data = resp.json()
            msg_id = data.get("messages", [{}])[0].get("id", "")
            return {"ok": True, "provider_message_id": msg_id, "status": "queued"}
        return {"ok": False, "error": resp.text, "status": "failed"}
    except Exception as exc:
        log.error(f"[whatsapp] meta send error: {exc}")
        return {"ok": False, "error": str(exc), "status": "failed"}


# ─── WAEngine ─────────────────────────────────────────────────────────────────

class WAEngine:
    """Interfaz unificada para WhatsApp Business."""

    def __init__(self, db, org_id: str):
        self.db = db
        self.org_id = org_id

    async def _check_phase_y(self) -> bool:
        """Retorna True si whatsapp_business >= T1 está habilitado."""
        try:
            from routes_phase_y_controls import get_phase_y_settings
            s = await get_phase_y_settings(self.db, self.org_id)
            if not s.get("agentic_enabled", False):
                return False
            tier = (s.get("feature_tiers") or {}).get("whatsapp_business", "off")
            return tier not in ("off", "T0")
        except Exception:
            return False

    async def send_message(
        self,
        to_number: str,
        body: str,
        lead_id: Optional[str] = None,
        template_name: Optional[str] = None,
        variables: Optional[Dict[str, str]] = None,
    ) -> Dict[str, Any]:
        """Envía mensaje. Modo stub solo loguea + persiste."""
        phase_ok = await self._check_phase_y()
        if not phase_ok:
            log.info(f"[whatsapp] tier off — stub send to {to_number}: {body[:60]}…")
            result = {"ok": True, "provider_message_id": f"stub_{uuid.uuid4().hex[:8]}", "status": "queued"}
        elif PROVIDER == "stub":
            log.info(f"[whatsapp] stub send to {to_number}: {body[:80]}")
            result = {"ok": True, "provider_message_id": f"stub_{uuid.uuid4().hex[:8]}", "status": "queued"}
        elif PROVIDER == "twilio":
            result = _twilio_send(to_number, body)
        elif PROVIDER == "business":
            result = _meta_send(to_number, body)
        else:
            result = {"ok": False, "error": f"provider desconocido: {PROVIDER}", "status": "failed"}

        msg_doc = {
            "_id": _msg_id(),
            "org_id": self.org_id,
            "lead_id": lead_id,
            "direction": "outbound",
            "provider": PROVIDER,
            "from_number": TWILIO_WA_FROM.replace("whatsapp:", ""),
            "to_number": to_number,
            "body_text": body,
            "media_url": None,
            "template_name": template_name,
            "status": result.get("status", "failed"),
            "provider_message_id": result.get("provider_message_id"),
            "sent_at": _now() if result.get("ok") else None,
            "delivered_at": None,
            "read_at": None,
            "error": result.get("error"),
            "conversation_thread_id": lead_id or f"anon_{to_number[-6:]}",
            "created_at": _now(),
        }
        try:
            await self.db.whatsapp_messages.insert_one(msg_doc)
        except Exception as exc:
            log.warning(f"[whatsapp] persist failed: {exc}")

        # W4.13.A — Lead Journey hook (1ra vez = first_touch_whatsapp)
        if lead_id:
            try:
                count = await self.db.whatsapp_messages.count_documents({"lead_id": lead_id, "direction": "outbound"})
                if count <= 1:  # 1ra ya insertada arriba
                    from lead_journey_engine import emit_step
                    await emit_step(
                        self.db, lead_id=lead_id, tenant_id=getattr(self, "org_id", None),
                        step_type="first_touch_whatsapp", actor_type="system",
                        payload={"channel": "whatsapp", "to": to_number[-6:]},
                    )
            except Exception:
                pass

        return {"msg_id": msg_doc["_id"], **result}

    async def receive_webhook(
        self, payload: Dict[str, Any], signature: str = "", url: str = ""
    ) -> Dict[str, Any]:
        """Procesa webhook inbound. Persiste + dispara Reply Classifier."""
        # Verificación de firma Twilio
        if PROVIDER == "twilio" and signature:
            form_data = {k: str(v) for k, v in payload.items()}
            valid = _verify_twilio_signature(url, form_data, signature)
            if not valid:
                raise ValueError("Firma Twilio inválida")

        from_num = payload.get("From", "").replace("whatsapp:", "")
        body = payload.get("Body", "") or ""
        provider_id = payload.get("MessageSid") or payload.get("id") or ""

        msg_doc = {
            "_id": _msg_id(),
            "org_id": self.org_id,
            "lead_id": None,
            "direction": "inbound",
            "provider": PROVIDER,
            "from_number": from_num,
            "to_number": TWILIO_WA_FROM.replace("whatsapp:", ""),
            "body_text": body,
            "media_url": payload.get("MediaUrl0"),
            "template_name": None,
            "status": "received",
            "provider_message_id": provider_id,
            "sent_at": _now(),
            "delivered_at": None,
            "read_at": None,
            "error": None,
            "conversation_thread_id": f"wa_{from_num[-6:]}",
            "created_at": _now(),
        }
        await self.db.whatsapp_messages.insert_one(msg_doc)

        # Disparar Reply Classifier si hay cuerpo de texto
        classified = None
        if body.strip():
            try:
                from agentic_crm.reply_classifier_engine import classify_reply
                classified = await classify_reply(
                    self.db,
                    reply_text=body,
                    from_address=from_num,
                    org_id=self.org_id,
                    channel="whatsapp",
                )
            except Exception as exc:
                log.warning(f"[whatsapp] reply_classifier failed: {exc}")

        return {
            "ok": True,
            "msg_id": msg_doc["_id"],
            "from_number": from_num,
            "classified": classified,
        }

    async def get_conversation(self, lead_id: str) -> List[Dict[str, Any]]:
        """Retorna thread de mensajes por lead_id."""
        cursor = self.db.whatsapp_messages.find(
            {"org_id": self.org_id, "lead_id": lead_id},
            {"_id": 0},
        ).sort("created_at", 1).limit(100)
        return await cursor.to_list(100)


# ─── Indexes ──────────────────────────────────────────────────────────────────

async def check_pending_whatsapp_replies_cron(db) -> Dict[str, Any]:
    """W4.17 — Cron cada 30min: delega a notifications_engine para msgs WA outbound sin reply >2h."""
    try:
        from notifications_engine import check_pending_whatsapp_replies
        return await check_pending_whatsapp_replies(db)
    except Exception as exc:
        log.warning(f"[whatsapp] check_pending_replies_cron failed: {exc}")
        return {"triggered": 0, "error": str(exc)}


async def ensure_whatsapp_indexes(db) -> None:
    try:
        await db.whatsapp_messages.create_index(
            [("org_id", 1), ("created_at", -1)],
            name="idx_wa_org_date", background=True,
        )
        await db.whatsapp_messages.create_index(
            [("lead_id", 1), ("created_at", 1)],
            name="idx_wa_lead_thread", background=True,
        )
        await db.whatsapp_messages.create_index(
            "provider_message_id", name="idx_wa_provider_id", background=True, sparse=True,
        )
        await db.whatsapp_templates.create_index(
            [("org_id", 1), ("template_name", 1)],
            unique=True, name="idx_wa_tpl_unique", background=True,
        )
        log.info("[whatsapp] indexes OK")
    except Exception as exc:
        log.warning(f"[whatsapp] ensure_indexes failed: {exc}")
