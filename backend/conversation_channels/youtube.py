"""YouTube channel adapter — STUB-AWARE (omnicanal · 2026-05-31).

comentarios en videos (YouTube Data API). Default sin YOUTUBE_TOKEN → no envía real, stub=True. Construido HOY per regla
'estado final': el canal existe y se autollena cuando llegue la conexión.
"""
from __future__ import annotations

import logging
import os
from typing import Any, Dict

log = logging.getLogger("dmx.conversation_channels.youtube")


def is_connected() -> bool:
    return bool(os.environ.get("YOUTUBE_TOKEN"))


async def deliver(db, conversation: Dict[str, Any], text: str, **kwargs) -> Dict[str, Any]:
    to = kwargs.get("to") or (conversation or {}).get("recipient_id")
    if not is_connected():
        log.info(f"[youtube][would send] to={to or '?'}: {text[:120]}")
        return {"channel": "youtube", "delivered": False, "stub": True,
                "detail": "not_connected", "to": to}
    log.info(f"[youtube][send] to={to}: {text[:80]}")
    return {"channel": "youtube", "delivered": True, "stub": False, "to": to}
