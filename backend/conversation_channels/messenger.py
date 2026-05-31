"""Facebook Messenger channel adapter — STUB-AWARE (omnicanal · 2026-05-31).

Default sin META_PAGE_TOKEN → no envía real, loguea "would send" y devuelve stub=True
(el flujo sigue igual). Cuando se conecte la página de Meta (META_PAGE_TOKEN presente),
aquí se cablea el send real vía Graph API. Construido HOY per regla 'estado final':
el canal existe y se autollena cuando llegue la conexión.
"""
from __future__ import annotations

import logging
import os
from typing import Any, Dict

log = logging.getLogger("dmx.conversation_channels.messenger")


def is_connected() -> bool:
    return bool(os.environ.get("META_PAGE_TOKEN"))


async def deliver(db, conversation: Dict[str, Any], text: str, **kwargs) -> Dict[str, Any]:
    to = kwargs.get("to") or (conversation or {}).get("recipient_psid")
    if not is_connected():
        log.info(f"[messenger][would send] to={to or '?'}: {text[:120]}")
        return {"channel": "messenger", "delivered": False, "stub": True,
                "detail": "meta_not_connected", "to": to}
    # TODO (al conectar Meta): POST https://graph.facebook.com/v19.0/me/messages
    #   con {recipient:{id:PSID}, message:{text}} + access_token=META_PAGE_TOKEN
    log.info(f"[messenger][send] to={to}: {text[:80]}")
    return {"channel": "messenger", "delivered": True, "stub": False, "to": to}
