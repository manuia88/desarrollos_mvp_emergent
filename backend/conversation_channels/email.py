"""W7.AS.3.A · Email channel adapter.

Reuses the existing Resend integration (resend_engine._send). Stub-aware: if
RESEND_API_KEY is absent, resend_engine already no-ops and returns False, so we
surface stub=True instead of failing.
"""
from __future__ import annotations

import logging
import os
from typing import Any, Dict

log = logging.getLogger("dmx.conversation_channels.email")


async def deliver(db, conversation: Dict[str, Any], text: str, **kwargs) -> Dict[str, Any]:
    to = kwargs.get("to") or (conversation or {}).get("recipient_email")
    subject = kwargs.get("subject") or "Mensaje de tu asesor DesarrollosMX"
    has_key = bool(os.environ.get("RESEND_API_KEY"))

    if not to:
        return {"channel": "email", "delivered": False, "transport": "resend",
                "stub": not has_key, "detail": "missing_recipient"}

    if not has_key:
        log.info(f"[email] would send to={to} (stub · sin RESEND_API_KEY)")
        return {"channel": "email", "delivered": False, "transport": "resend",
                "stub": True, "detail": "would_send", "to": to}

    try:
        from resend_engine import _send
        html = f"<div style='font-family:sans-serif;line-height:1.5'>{text}</div>"
        ok = _send(subject=subject, html=html, to=to)
        return {"channel": "email", "delivered": bool(ok), "transport": "resend",
                "stub": False, "to": to}
    except Exception as exc:
        log.warning(f"[email] send failed: {exc}")
        return {"channel": "email", "delivered": False, "transport": "resend",
                "stub": False, "detail": str(exc)[:200]}
