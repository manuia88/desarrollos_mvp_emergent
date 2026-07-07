"""F0.1 Sub-C — Resend email helpers (DMX templates).

Best-effort wrappers around Resend API. If `RESEND_API_KEY` is missing or the
network call fails, every helper logs a warning and returns `False`; callers
should treat email send as non-blocking.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime

log = logging.getLogger("dmx.resend_engine")

DEFAULT_FROM = os.environ.get("RESEND_FROM", "DesarrollosMX <noreply@desarrollosmx.io>")
DEFAULT_REPLY_TO = os.environ.get("RESEND_REPLY_TO", "soporte@desarrollosmx.io")
APP_BASE = os.environ.get("APP_PUBLIC_BASE", "https://desarrollosmx.io")


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


def send_dev_claim_invite(email: str, org_name: str, claim_url: str) -> bool:
    """Invita al desarrollador oficial a RECLAMAR su cuenta (creada vacía por el equipo DMX) con un
    link de un solo uso. Best-effort: si no hay RESEND_API_KEY, no rompe (skip)."""
    safe_org = (org_name or "tu desarrollo").replace("<", "").replace(">", "")
    html = f"""<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a">
  <div style="font-size:13px;letter-spacing:2px;color:#888;margin-bottom:16px">DESARROLLOS<b style="color:#111">MX</b></div>
  <h1 style="font-size:22px;margin:0 0 12px">Tu cuenta de <span style="color:#4f46e5">{safe_org}</span> está lista</h1>
  <p style="font-size:15px;line-height:1.6;color:#444">El equipo de DesarrollosMX creó tu cuenta y ya le cargó tus proyectos. Reclámala para tomar el control: eliges tu correo y contraseña, y desde tu portal podrás invitar a tu equipo.</p>
  <p style="margin:24px 0">
    <a href="{claim_url}" style="background:#111;color:#fff;text-decoration:none;padding:13px 26px;border-radius:10px;font-size:15px;font-weight:700;display:inline-block">Reclamar mi cuenta →</a>
  </p>
  <p style="font-size:12.5px;color:#888;line-height:1.5">Este link es de un solo uso. Si no reconoces esta invitación, ignora este correo.<br>O copia y pega: <span style="color:#4f46e5">{claim_url}</span></p>
</div>"""
    return _send(f"Reclama tu cuenta de {safe_org} · DesarrollosMX", html, email)


# ─── F0.2·Sub-A — Digest semanal asesor ───────────────────────────────────────

def _digest_semanal_html(asesor_name: str, week_data: dict) -> str:
    safe_name = (asesor_name or "asesor").strip() or "asesor"
    stats = (week_data or {}).get("stats") or {}
    leads = (week_data or {}).get("top_leads") or []
    portal = f"{APP_BASE}/asesor"
    contactos = f"{APP_BASE}/asesor/contactos"

    total = int(stats.get("total_leads") or 0)
    closed_won = int(stats.get("closed_won") or 0)
    conv = stats.get("conversion_rate")
    conv_str = f"{float(conv):.1f}%" if conv not in (None, "") else "—"

    leads_html_parts = []
    if leads:
        for lead in leads[:3]:
            leads_html_parts.append(f"""\
<tr>
  <td style="padding:10px 12px;border-bottom:1px solid rgba(240,235,224,0.06)">
    <div style="font-family:'Outfit',Helvetica,Arial,sans-serif;font-weight:700;font-size:13px;color:#F0EBE0">{(lead.get('name') or '—')[:40]}</div>
    <div style="font-family:'DM Sans',Helvetica,Arial,sans-serif;font-size:11px;color:#a0a4b0;margin-top:2px">
      Último paso: {(lead.get('last_step') or '—').replace('_', ' ')} · {int(lead.get('steps_count') or 0)} acciones
    </div>
  </td>
</tr>""")
    else:
        leads_html_parts.append("""\
<tr><td style="padding:14px 12px;font-family:'DM Sans',Helvetica,Arial,sans-serif;font-size:12px;color:#a0a4b0">
  Sin leads activos esta semana · prospecta desde el portal.
</td></tr>""")
    leads_table = "\n".join(leads_html_parts)

    return f"""\
<div style="font-family:Helvetica,Arial,sans-serif;background:#06080F;color:#F0EBE0;padding:0;margin:0">
  <div style="background:linear-gradient(90deg,#6366F1,#EC4899);padding:30px 28px;text-align:center">
    <div style="font-family:'Outfit',Helvetica,Arial,sans-serif;font-weight:800;font-size:24px;color:#fff;margin:0">
      DesarrollosMX
    </div>
    <div style="font-family:'DM Sans',Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.12em;color:rgba(255,255,255,0.85);margin-top:4px;text-transform:uppercase">
      Digest semanal · {datetime.now().strftime('%d %b %Y')}
    </div>
  </div>

  <div style="padding:30px 28px;max-width:600px;margin:0 auto">
    <h2 style="font-family:'Outfit',Helvetica,Arial,sans-serif;font-weight:700;font-size:20px;margin:0 0 10px;color:#F0EBE0">
      Hola {safe_name}
    </h2>
    <p style="font-family:'DM Sans',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.55;color:#a0a4b0;margin:0 0 18px">
      Tu semana en DMX, en 30 segundos.
    </p>

    <table cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 22px">
      <tr>
        <td style="background:#161b25;border:1px solid rgba(99,102,241,0.30);border-radius:12px;padding:14px;text-align:center;width:33%">
          <div style="font-family:'DM Sans',Helvetica,Arial,sans-serif;font-size:10px;letter-spacing:0.08em;color:#a5b4fc;text-transform:uppercase">Leads totales</div>
          <div style="font-family:'Outfit',Helvetica,Arial,sans-serif;font-weight:800;font-size:22px;color:#F0EBE0;margin-top:4px">{total}</div>
        </td>
        <td style="width:8px"></td>
        <td style="background:#161b25;border:1px solid rgba(99,102,241,0.30);border-radius:12px;padding:14px;text-align:center;width:33%">
          <div style="font-family:'DM Sans',Helvetica,Arial,sans-serif;font-size:10px;letter-spacing:0.08em;color:#a5b4fc;text-transform:uppercase">Cierres</div>
          <div style="font-family:'Outfit',Helvetica,Arial,sans-serif;font-weight:800;font-size:22px;color:#F0EBE0;margin-top:4px">{closed_won}</div>
        </td>
        <td style="width:8px"></td>
        <td style="background:#161b25;border:1px solid rgba(99,102,241,0.30);border-radius:12px;padding:14px;text-align:center;width:33%">
          <div style="font-family:'DM Sans',Helvetica,Arial,sans-serif;font-size:10px;letter-spacing:0.08em;color:#a5b4fc;text-transform:uppercase">Conversión</div>
          <div style="font-family:'Outfit',Helvetica,Arial,sans-serif;font-weight:800;font-size:22px;color:#F0EBE0;margin-top:4px">{conv_str}</div>
        </td>
      </tr>
    </table>

    <h3 style="font-family:'Outfit',Helvetica,Arial,sans-serif;font-weight:700;font-size:14px;margin:0 0 10px;color:#F0EBE0">
      Top leads activos
    </h3>
    <table cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#0E1220;border:1px solid rgba(240,235,224,0.08);border-radius:12px;overflow:hidden;margin:0 0 22px">
      {leads_table}
    </table>

    <a href="{portal}" style="display:inline-block;background:linear-gradient(90deg,#6366F1,#EC4899);color:#fff;text-decoration:none;font-family:'Outfit',Helvetica,Arial,sans-serif;font-weight:800;font-size:11px;letter-spacing:0.1em;padding:12px 22px;border-radius:9999px">
      ABRIR MI PANEL
    </a>
    <a href="{contactos}" style="display:inline-block;margin-left:10px;border:1px solid rgba(240,235,224,0.20);color:#F0EBE0;text-decoration:none;font-family:'Outfit',Helvetica,Arial,sans-serif;font-weight:700;font-size:11px;letter-spacing:0.1em;padding:12px 22px;border-radius:9999px">
      VER CONTACTOS
    </a>

    <hr style="border:none;border-top:1px solid rgba(240,235,224,0.08);margin:28px 0">
    <div style="font-family:'DM Sans',Helvetica,Arial,sans-serif;font-size:11px;color:#6b7280;line-height:1.6">
      LFPDPPP · DesarrollosMX trata tus datos conforme a la legislación mexicana.
      Si no deseas recibir más correos, usa el enlace
      <a href="{APP_BASE}/unsubscribe" style="color:#6b7280;text-decoration:underline">unsubscribe</a>.
    </div>
  </div>
</div>
"""


def send_digest_semanal_asesor(asesor_email: str, asesor_name: str, week_data: dict) -> bool:
    """F0.2·Sub-A — Best-effort weekly digest sender."""
    html = _digest_semanal_html(asesor_name=asesor_name, week_data=week_data or {})
    subject = "Tu semana en DesarrollosMX"
    return _send(subject, html, asesor_email)
