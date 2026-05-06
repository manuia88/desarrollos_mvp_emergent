"""Phase 4 Batch 26 · services — Lead Capture centralizado.

Schema db.lead_captures:
  { capture_id, email, source, payload, ip_hash, created_at, dev_org_attributed }
"""
from __future__ import annotations

import hashlib
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import httpx

log = logging.getLogger("dmx.lead_capture")

RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
FROM_EMAIL = "leads@desarrollosmx.com"
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001")

VALID_SOURCES = {"colonia_report", "quiz", "comparator", "mortgage_calc", "virtual_tour_request"}


async def _send_email(to: str, subject: str, html: str, attachments: list = None) -> bool:
    if not RESEND_API_KEY:
        log.info(f"[lead_capture] RESEND not configured. Would send '{subject}' to {to}")
        return False
    payload: Dict[str, Any] = {
        "from": FROM_EMAIL, "to": [to],
        "subject": subject, "html": html,
    }
    if attachments:
        payload["attachments"] = attachments  # [{"filename": "x.pdf", "content": base64str}]
    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            r = await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
                json=payload,
            )
            return r.status_code in (200, 201)
    except Exception as e:
        log.warning(f"[lead_capture] email failed: {e}")
        return False


async def attribute_to_dev(db, capture_id: str, colonia_id: str) -> Optional[str]:
    """Atribuye a la org desarrolladora si tiene proyectos activos en esa colonia."""
    try:
        dev = await db.developments.find_one(
            {"colonia_id": colonia_id, "stage": {"$ne": "sold_out"}},
            {"_id": 0, "developer_id": 1},
        )
        if dev and dev.get("developer_id"):
            await db.lead_captures.update_one(
                {"capture_id": capture_id},
                {"$set": {"dev_org_attributed": dev["developer_id"]}},
            )
            return dev["developer_id"]
    except Exception as ex:
        log.debug(f"[lead_capture] attribution failed: {ex}")
    return None


async def capture_lead(
    db,
    email: str,
    source: str,
    payload: Dict[str, Any],
    ip_hash: str = "",
) -> Dict[str, Any]:
    """Inserta un lead capture en db.lead_captures."""
    capture_id = uuid.uuid4().hex
    doc = {
        "capture_id": capture_id,
        "email": email.lower().strip(),
        "source": source if source in VALID_SOURCES else "unknown",
        "payload": payload,
        "ip_hash": ip_hash,
        "created_at": datetime.now(timezone.utc),
        "dev_org_attributed": None,
    }
    try:
        await db.lead_captures.insert_one(doc)
    except Exception as ex:
        log.warning(f"[lead_capture] insert failed: {ex}")

    # Attribution asíncrona (non-blocking)
    colonia_id = payload.get("colonia_id")
    if colonia_id:
        await attribute_to_dev(db, capture_id, colonia_id)

    return {k: v for k, v in doc.items() if k != "_id"}


async def send_report_email(
    to: str,
    colonia_nombre: str,
    pdf_bytes: bytes,
) -> bool:
    """Envía email con PDF del reporte de colonia adjunto."""
    import base64
    pdf_b64 = base64.b64encode(pdf_bytes).decode("utf-8")
    html = f"""
<!DOCTYPE html><html lang="es">
<head><meta charset="UTF-8"></head>
<body style="background:#06080F;font-family:'DM Sans',Arial,sans-serif;padding:40px 24px;max-width:560px;margin:0 auto;">
  <div style="text-align:center;margin-bottom:28px;">
    <div style="display:inline-block;padding:8px 20px;background:linear-gradient(90deg,#6366F1,#EC4899);border-radius:9999px;color:#fff;font-weight:700;font-size:13px;">DesarrollosMX</div>
  </div>
  <h1 style="font-family:Outfit,Arial;font-weight:800;font-size:26px;color:#F0EBE0;letter-spacing:-0.02em;margin:0 0 12px;">
    Tu reporte de {colonia_nombre}
  </h1>
  <p style="color:rgba(240,235,224,0.65);font-size:14px;line-height:1.6;margin:0 0 24px;">
    Encontrarás el reporte completo de la colonia adjunto en PDF. Incluye precios, scores IE, riesgos, climate twin y los mejores desarrollos disponibles.
  </p>
  <p style="color:rgba(240,235,224,0.45);font-size:12px;margin:0;">
    Responde este email si quieres hablar con un asesor.
  </p>
</body></html>
"""
    return await _send_email(
        to=to,
        subject=f"Tu Reporte de Colonia: {colonia_nombre} · DesarrollosMX",
        html=html,
        attachments=[{
            "filename": f"reporte_{colonia_nombre.lower().replace(' ', '_')}.pdf",
            "content": pdf_b64,
        }],
    )


async def send_quiz_results_email(
    to: str,
    matches: list,
) -> bool:
    """Envía resultados del quiz de colonia ideal."""
    cards = ""
    for m in matches[:3]:
        pct = m.get("match_pct", 0)
        cards += f"""
        <div style="margin-bottom:14px;padding:14px 16px;background:rgba(255,255,255,0.04);border:1px solid rgba(240,235,224,0.10);border-radius:10px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <div style="font-family:Outfit,Arial;font-weight:800;font-size:16px;color:#F0EBE0;">{m.get('nombre', '—')}</div>
            <div style="padding:3px 10px;background:linear-gradient(90deg,#6366F1,#EC4899);border-radius:9999px;color:#fff;font-weight:700;font-size:12px;">{pct}% match</div>
          </div>
          <div style="font-size:12px;color:rgba(240,235,224,0.5);">{m.get('alcaldia','')}</div>
          <ul style="margin:8px 0 0;padding-left:16px;color:rgba(240,235,224,0.65);font-size:12px;">
            {''.join(f"<li>{r}</li>" for r in m.get('top_3_reasons', [])[:3])}
          </ul>
        </div>
        """
    html = f"""
<!DOCTYPE html><html lang="es">
<head><meta charset="UTF-8"></head>
<body style="background:#06080F;font-family:'DM Sans',Arial,sans-serif;padding:40px 24px;max-width:560px;margin:0 auto;">
  <div style="text-align:center;margin-bottom:28px;">
    <div style="display:inline-block;padding:8px 20px;background:linear-gradient(90deg,#6366F1,#EC4899);border-radius:9999px;color:#fff;font-weight:700;font-size:13px;">DesarrollosMX</div>
  </div>
  <h1 style="font-family:Outfit,Arial;font-weight:800;font-size:24px;color:#F0EBE0;margin:0 0 16px;">
    Tus colonias ideales
  </h1>
  {cards}
  <div style="text-align:center;margin-top:24px;">
    <a href="https://desarrollosmx.com/marketplace" style="display:inline-block;padding:12px 28px;background:linear-gradient(90deg,#6366F1,#EC4899);border-radius:9999px;color:#fff;font-weight:700;font-size:14px;text-decoration:none;">Ver desarrollos</a>
  </div>
</body></html>
"""
    return await _send_email(to=to, subject="Tus Colonias Ideales · DesarrollosMX", html=html)
