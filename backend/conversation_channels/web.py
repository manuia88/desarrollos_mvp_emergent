"""W7.AS.3.A · Web channel adapter (ChatWidget).

The ChatWidget renders the assistant reply directly from the HTTP response, so
"delivery" here means formatting a window.postMessage envelope for the iframe
host (Z.8 landings embed the widget via <iframe>). No external network call.
"""
from __future__ import annotations

import logging
from typing import Any, Dict

log = logging.getLogger("dmx.conversation_channels.web")


async def deliver(db, conversation: Dict[str, Any], text: str, **kwargs) -> Dict[str, Any]:
    conv_id = (conversation or {}).get("conversation_id") or (conversation or {}).get("_id")
    payload = {
        "type": "dmx:conversation:message",
        "conversation_id": conv_id,
        "role": "assistant",
        "text": text,
    }
    log.debug(f"[web] postMessage envelope conv={conv_id}")
    return {
        "channel": "web",
        "delivered": True,
        "transport": "web_postmessage",
        "stub": False,
        "payload": payload,
    }
