"""F0.1 Sub-C — Resend email helpers (DMX templates).

Best-effort wrappers around Resend API. If `RESEND_API_KEY` is missing or the
network call fails, every helper logs a warning and returns `False`; callers
should treat email send as non-blocking.
"""
from __future__ import annotations

import logging
import os
from typing import Optional

log = logging.getLogger("dmx.resend_engine")

DEFAULT_FROM = os.environ.get("RESEND_FROM", "DesarrollosMX <noreply@desarrollosmx.io>")
DEFAULT_REPLY_TO = os.environ.get("RESEND_REPLY_TO", "soporte@desarrollosmx.io")
APP_BASE = os.environ.get("APP_PUBLIC_BASE", "https://desarrollosmx.com")


def _send(subject: str, html: str, to: str) -> bool:
    key = os.environ.get("RESEND_API_KEY", "").strip()
    if not key:
        log.info(f"[resend] no RESEND_API_KEY · skip subject={subject!r} to={to}")
        return False
    if not to or "@" not in to:
        log.warning(f"[resend] invalid to addr · {to!r}")
        return False
    try:
        import resend  # type: ignore
        resend.api_key = key
        resend.Emails.send({
            "from": DEFAULT_FROM,
            "to": to,
            "reply_to": DEFAULT_REPLY_TO,
            "subject": subject,
            "html": html,
        })
        return True
    except Exception as exc:
        log.warning(f"[resend] send failed · {exc}")
        return False


def _welcome_broker_html(name: str, invite_code: str) -> str:
    safe_name = (name or "asesor").strip() or "asesor"
    safe_code = invite_code or "—"
    portal = f"{APP_BASE}/broker-portal"
    contactos = f"{APP_BASE}/asesor/contactos"
    notif = f"{APP_BASE}/portal/settings/notifications"
    return f"""\
<div style="font-family:Helvetica,Arial,sans-serif;background:#06080F;color:#F0EBE0;padding:0;margin:0">
  <div style="background:linear-gradient(90deg,#6366F1,#EC4899);padding:36px 32px;text-align:center">
    <div style="font-family:'Outfit',Helvetica,Arial,sans-serif;font-weight:800;font-size:28px;letter-spacing:-0.01em;color:#fff;margin:0">
      DesarrollosMX
    </div>
    <div style="font-family:'DM Sans',Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:0.12em;color:rgba(255,255,255,0.85);margin-top:6px;text-transform:uppercase">
      Private Beta · acceso confirmado
    </div>
  </div>

  <div style="padding:36px 32px;max-width:600px;margin:0 auto">
    <h2 style="font-family:'Outfit',Helvetica,Arial,sans-serif;font-weight:700;font-size:22px;margin:0 0 10px;color:#F0EBE0">
      Bienvenido {safe_name}
    </h2>
    <p style="font-family:'DM Sans',Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#a0a4b0;margin:0 0 20px">
      Ya formas parte del DMX private beta. Tu acceso está activo · enseguida te dejamos los 3 pasos para empezar a operar.
    </p>

    <div style="background:#161b25;border:1px solid rgba(99,102,241,0.30);border-radius:14px;padding:18px;margin:18px 0">
      <div style="font-family:'DM Sans',Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.08em;color:#a5b4fc;margin:0 0 8px;text-transform:uppercase">
        Tu código usado
      </div>
      <div style="font-family:'Outfit',Helvetica,Arial,sans-serif;font-weight:800;font-size:18px;color:#F0EBE0;letter-spacing:0.04em">
        {safe_code}
      </div>
    </div>

    <a href="{portal}" style="display:inline-block;background:linear-gradient(90deg,#6366F1,#EC4899);color:#fff;text-decoration:none;font-family:'Outfit',Helvetica,Arial,sans-serif;font-weight:800;font-size:12px;letter-spacing:0.1em;padding:13px 26px;border-radius:9999px">
      ABRIR BROKER PORTAL
    </a>

    <h3 style="font-family:'Outfit',Helvetica,Arial,sans-serif;font-weight:700;font-size:16px;margin:32px 0 12px;color:#F0EBE0">
      3 pasos para empezar
    </h3>
    <ol style="font-family:'DM Sans',Helvetica,Arial,sans-serif;font-size:14px;color:#a0a4b0;line-height:1.7;padding-left:18px;margin:0 0 16px">
      <li>Conecta tu primer listing en <a href="{contactos}" style="color:#a5b4fc">/asesor/contactos</a>.</li>
      <li>Genera tu primer brochure desde la ficha de cualquier desarrollo (botón “Brochure”).</li>
      <li>Configura notificaciones en <a href="{notif}" style="color:#a5b4fc">/portal/settings/notifications</a>.</li>
    </ol>

    <div style="background:rgba(99,102,241,0.06);border-left:3px solid #6366F1;padding:12px 14px;border-radius:8px;margin:24px 0;font-family:'DM Sans',Helvetica,Arial,sans-serif;font-size:13px;color:#d4d4d8">
      <strong style="color:#F0EBE0">Atlax</strong> está disponible 24/7 · pregúntale lo que sea sobre DMX, scoring de zonas, simulaciones o tus leads.
    </div>

    <hr style="border:none;border-top:1px solid rgba(240,235,224,0.08);margin:28px 0">
    <div style="font-family:'DM Sans',Helvetica,Arial,sans-serif;font-size:11px;color:#6b7280;line-height:1.6">
      LFPDPPP · DesarrollosMX trata tus datos conforme a la legislación mexicana.
      Si no deseas recibir más correos, responde con <em>baja</em> o usa el enlace
      <a href="{APP_BASE}/unsubscribe" style="color:#6b7280;text-decoration:underline">unsubscribe</a>.
    </div>
  </div>
</div>
"""


def send_welcome_broker(email: str, name: str, invite_code: str) -> bool:
    """Public helper · best-effort send."""
    html = _welcome_broker_html(name=name, invite_code=invite_code)
    subject = "Bienvenido a DesarrollosMX · acceso confirmado"
    return _send(subject, html, email)
