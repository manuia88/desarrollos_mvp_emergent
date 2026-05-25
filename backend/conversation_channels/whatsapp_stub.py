"""W7.AS.3.A · WhatsApp channel adapter — STUB-AWARE.

Default WHATSAPP_VPS_READY=false → no real send. We print/log "would send" and
return stub=True so the rest of the flow is unaffected. When the VPS bridge is
ready (WHATSAPP_VPS_READY=true), this is where the real send is wired in a future
batch — kept intentionally minimal here to avoid colliding with whatsapp_engine.
"""
from __future__ import annotations

import logging
import os
from typing import Any, Dict

log = logging.getLogger("dmx.conversation_channels.whatsapp")


def _vps_ready() -> bool:
    return os.environ.get("WHATSAPP_VPS_READY", "false").strip().lower() in ("1", "true", "yes")


async def deliver(db, conversation: Dict[str, Any], text: str, **kwargs) -> Dict[str, Any]:
    to = kwargs.get("to") or (conversation or {}).get("recipient_phone")
    conv_id = (conversation or {}).get("conversation_id") or (conversation or {}).get("_id")

    if not _vps_ready():
        msg = f"[whatsapp][would send] to={to or '?'} conv={conv_id}: {text[:120]}"
        print(msg)
        log.info(msg)
        return {"channel": "whatsapp", "delivered": False, "transport": "vps_bridge",
                "stub": True, "detail": "would_send", "to": to,
                "would_send": text}

    # VPS ready path — placeholder. Real bridge wired in a later batch.
    log.info(f"[whatsapp] VPS bridge send (placeholder) to={to} conv={conv_id}")
    return {"channel": "whatsapp", "delivered": False, "transport": "vps_bridge",
            "stub": False, "detail": "vps_send_not_implemented", "to": to}
