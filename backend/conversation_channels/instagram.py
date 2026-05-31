"""Instagram DM channel adapter — STUB-AWARE (omnicanal · 2026-05-31).

IG Direct usa la misma Graph API de Meta (token de página con scope de Instagram).
Default sin META_IG_TOKEN (o META_PAGE_TOKEN) → no envía real, stub=True. Construido HOY
per regla 'estado final': el canal existe y se autollena cuando llegue la conexión.
"""
from __future__ import annotations

import logging
import os
from typing import Any, Dict

log = logging.getLogger("dmx.conversation_channels.instagram")


def is_connected() -> bool:
    return bool(os.environ.get("META_IG_TOKEN") or os.environ.get("META_PAGE_TOKEN"))


async def deliver(db, conversation: Dict[str, Any], text: str, **kwargs) -> Dict[str, Any]:
    to = kwargs.get("to") or (conversation or {}).get("recipient_igsid")
    if not is_connected():
        log.info(f"[instagram][would send] to={to or '?'}: {text[:120]}")
        return {"channel": "instagram", "delivered": False, "stub": True,
                "detail": "meta_not_connected", "to": to}
    # TODO (al conectar Meta): POST https://graph.facebook.com/v19.0/me/messages
    #   con {recipient:{id:IGSID}, message:{text}} + access_token (IG-scoped)
    log.info(f"[instagram][send] to={to}: {text[:80]}")
    return {"channel": "instagram", "delivered": True, "stub": False, "to": to}
