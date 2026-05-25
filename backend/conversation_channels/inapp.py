"""W7.AS.3.A · In-app channel adapter (asesor preview / training mode).

Used by the ConversationPlayground: the asesor tunes the system prompt and chats
with the IA without any external delivery. The reply is consumed in-app from the
HTTP response, so deliver() just acknowledges the turn.
"""
from __future__ import annotations

import logging
from typing import Any, Dict

log = logging.getLogger("dmx.conversation_channels.inapp")


async def deliver(db, conversation: Dict[str, Any], text: str, **kwargs) -> Dict[str, Any]:
    conv_id = (conversation or {}).get("conversation_id") or (conversation or {}).get("_id")
    return {
        "channel": "inapp",
        "delivered": True,
        "transport": "inapp_preview",
        "stub": False,
        "training_mode": True,
        "conversation_id": conv_id,
    }
