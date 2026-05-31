"""W7.AS.3.A · Conversation channel adapters.

Each adapter exposes `async def deliver(db, conversation, text, **kwargs) -> dict`
with a uniform envelope: {channel, delivered, transport, stub, detail/payload}.
The engine/route layer picks the adapter by channel via `get_adapter(channel)`.

Round 1 channels: web (ChatWidget postMessage), email (resend/sendgrid existente),
inapp (asesor preview/training), whatsapp (STUB-AWARE — WHATSAPP_VPS_READY=false).
"""
from __future__ import annotations

from typing import Callable, Dict

from . import web, email, inapp, whatsapp_stub, messenger, instagram

CHANNEL_ADAPTERS: Dict[str, Callable] = {
    "web": web.deliver,
    "email": email.deliver,
    "inapp": inapp.deliver,
    "whatsapp": whatsapp_stub.deliver,
    "messenger": messenger.deliver,   # omnicanal · Facebook Messenger
    "instagram": instagram.deliver,   # omnicanal · Instagram DM
}


def get_adapter(channel: str) -> Callable:
    """Return the deliver() coroutine for `channel`, defaulting to web."""
    return CHANNEL_ADAPTERS.get((channel or "web").lower(), web.deliver)


__all__ = ["CHANNEL_ADAPTERS", "get_adapter", "web", "email", "inapp",
           "whatsapp_stub", "messenger", "instagram"]
