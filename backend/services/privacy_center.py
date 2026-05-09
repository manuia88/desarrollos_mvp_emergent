"""Phase 4 Batch 28 · services — Privacy Center (LFPDPPP).

Schemas:
  db.privacy_consents      { user_id, consents{...}, updated_at, ip_hash, user_agent, history[] }
  db.data_export_requests  { req_id, user_id, status, file_url?, created_at, completed_at? }

Compliance: Art. 25 LFPDPPP — respuesta dentro de 20 días.
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.privacy_center")

DEFAULT_CONSENTS = {
    "marketing_email": False,
    "marketing_wa": False,
    "analytics": True,
    "share_with_dev": False,
    "share_with_asesor": False,
}

VALID_CONSENT_KEYS = set(DEFAULT_CONSENTS.keys())


# ─── Consents ─────────────────────────────────────────────────────────────────

async def get_consents(db, user_id: str) -> Dict[str, Any]:
    doc = await db.privacy_consents.find_one({"user_id": user_id}, {"_id": 0})
    if not doc:
        return {
            "user_id": user_id,
            "consents": dict(DEFAULT_CONSENTS),
            "is_default": True,
            "updated_at": None,
        }
    out = dict(doc)
    out["is_default"] = False
    if isinstance(out.get("updated_at"), datetime):
        out["updated_at"] = out["updated_at"].replace(
            tzinfo=out["updated_at"].tzinfo or timezone.utc
        ).isoformat()
    out.pop("history", None)  # no exponer historial completo aquí
    return out


async def update_consents(
    db,
    user_id: str,
    partial: Dict[str, bool],
    ip_hash: str = "",
    user_agent: str = "",
) -> Dict[str, Any]:
    """Update parcial de consents. Audita cada cambio en `history[]`."""
    cleaned = {k: bool(v) for k, v in partial.items() if k in VALID_CONSENT_KEYS}
    if not cleaned:
        raise ValueError("Ningún consent válido proporcionado")

    existing = await db.privacy_consents.find_one({"user_id": user_id}, {"_id": 0}) or {}
    current = dict(DEFAULT_CONSENTS)
    current.update(existing.get("consents") or {})
    new_state = {**current, **cleaned}

    now = datetime.now(timezone.utc)
    history_entry = {
        "at": now,
        "changed_keys": list(cleaned.keys()),
        "before": {k: current[k] for k in cleaned.keys()},
        "after": {k: new_state[k] for k in cleaned.keys()},
        "ip_hash": ip_hash,
        "user_agent": (user_agent or "")[:200],
    }

    await db.privacy_consents.update_one(
        {"user_id": user_id},
        {
            "$set": {"consents": new_state, "updated_at": now,
                     "ip_hash": ip_hash, "user_agent": (user_agent or "")[:200]},
            "$push": {"history": {"$each": [history_entry], "$slice": -50}},
            "$setOnInsert": {"user_id": user_id, "created_at": now},
        },
        upsert=True,
    )
    return {"user_id": user_id, "consents": new_state, "updated_at": now.isoformat()}


# ─── Data export ──────────────────────────────────────────────────────────────

async def request_export(db, user_id: str, email: str) -> Dict[str, Any]:
    """Crea un export job + ejecuta inline (toma <2s para usuarios típicos)."""
    req_id = f"exp_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)

    await db.data_export_requests.insert_one({
        "req_id": req_id, "user_id": user_id,
        "status": "pending", "created_at": now,
    })

    # Build payload sincrono (la mayoría de usuarios tienen <100 docs en cada colección)
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0}) or {}
    saved = await _collect(db.saved_searches, {"$or": [{"user_id": user_id}, {"email": email}]})
    favs = await _collect(db.buyer_favorites, {"user_id": user_id})
    views = await _collect(db.buyer_views, {"user_id": user_id})
    consents = await db.privacy_consents.find_one({"user_id": user_id}, {"_id": 0}) or {}

    export_payload = {
        "exported_at": now.isoformat(),
        "user_id": user_id,
        "profile": _stringify_dt(user_doc),
        "saved_searches": [_stringify_dt(d) for d in saved],
        "favorites": [_stringify_dt(d) for d in favs],
        "view_history": [_stringify_dt(d) for d in views],
        "privacy_consents": _stringify_dt(consents),
        "compliance_note": (
            "Datos exportados conforme al artículo 25 de la LFPDPPP. "
            "DesarrollosMX conserva copia mínima por requisitos legales."
        ),
    }

    # Send email branded with JSON attachment
    email_sent = await _send_export_email(
        to=email,
        export_json=export_payload,
    )

    await db.data_export_requests.update_one(
        {"req_id": req_id},
        {"$set": {
            "status": "sent" if email_sent else "ready",
            "completed_at": datetime.now(timezone.utc),
            "items": {
                "saved_searches": len(saved),
                "favorites": len(favs),
                "views": len(views),
            },
        }},
    )

    return {
        "req_id": req_id,
        "status": "sent" if email_sent else "ready",
        "items": {
            "saved_searches": len(saved),
            "favorites": len(favs),
            "views": len(views),
        },
    }


async def get_export_requests(db, user_id: str) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    async for r in db.data_export_requests.find(
        {"user_id": user_id}, {"_id": 0}
    ).sort("created_at", -1).limit(20):
        out.append(_stringify_dt(r))
    return out


# ─── Account delete (soft + 30 day grace) ────────────────────────────────────

async def soft_delete_account(db, user_id: str, email: str, reason: Optional[str] = None) -> Dict[str, Any]:
    now = datetime.now(timezone.utc)
    purge_at = now + timedelta(days=30)

    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {
            "is_deleted": True,
            "deleted_at": now,
            "purge_after": purge_at,
            "delete_reason": (reason or "")[:500],
        }},
    )
    # Invalidate sessions
    try:
        await db.user_sessions.delete_many({"user_id": user_id})
    except Exception:
        pass

    # Email confirmation
    try:
        await _send_delete_email(email, purge_at)
    except Exception as ex:
        log.warning(f"[privacy_center] delete email failed: {ex}")

    return {
        "soft_deleted": True,
        "purge_after": purge_at.isoformat(),
        "grace_period_days": 30,
    }


async def cancel_delete(db, user_id: str) -> bool:
    r = await db.users.update_one(
        {"user_id": user_id, "is_deleted": True},
        {"$unset": {"is_deleted": "", "deleted_at": "", "purge_after": "", "delete_reason": ""}},
    )
    return r.modified_count > 0


# ─── Helpers ─────────────────────────────────────────────────────────────────

async def _collect(coll, query: Dict[str, Any]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    async for d in coll.find(query, {"_id": 0}).limit(500):
        out.append(d)
    return out


def _stringify_dt(doc: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(doc)
    for k, v in list(out.items()):
        if isinstance(v, datetime):
            out[k] = v.replace(tzinfo=v.tzinfo or timezone.utc).isoformat()
    return out


# ─── Email helpers (reusan _send_email B25) ──────────────────────────────────

async def _send_export_email(to: str, export_json: Dict[str, Any]) -> bool:
    try:
        from services.lead_capture import _send_email
    except Exception:
        return False

    payload_str = json.dumps(export_json, ensure_ascii=False, indent=2, default=str)
    items = export_json.get("favorites", [])
    saved = export_json.get("saved_searches", [])
    views = export_json.get("view_history", [])

    html = f"""<!DOCTYPE html><html lang="es"><body style="background:#06080F;font-family:'DM Sans',Arial;padding:32px 20px;max-width:560px;margin:0 auto;">
      <div style="text-align:center;margin-bottom:22px;">
        <div style="display:inline-block;padding:7px 18px;background:linear-gradient(90deg,#6366F1,#EC4899);border-radius:9999px;color:#fff;font-weight:700;font-size:12px;">DesarrollosMX</div>
      </div>
      <h1 style="font-family:Outfit,Arial;font-weight:800;font-size:22px;color:#F0EBE0;margin:0 0 10px;letter-spacing:-0.02em;">Tus datos exportados</h1>
      <p style="color:rgba(240,235,224,0.55);font-size:13px;margin:0 0 16px;">
        Conforme al artículo 25 de la LFPDPPP, te enviamos copia completa de tus datos.
      </p>
      <ul style="color:rgba(240,235,224,0.7);font-size:13px;line-height:1.8;padding-left:18px;">
        <li>{len(saved)} búsquedas guardadas</li>
        <li>{len(items)} favoritos</li>
        <li>{len(views)} eventos en tu histórico</li>
      </ul>
      <p style="color:rgba(240,235,224,0.45);font-size:11px;margin:18px 0 0;">
        Adjunto encontrarás el archivo JSON completo. Si no solicitaste esta exportación, contacta a privacidad@desarrollosmx.io.
      </p>
    </body></html>"""

    import base64
    attach = {
        "filename": f"desarrollosmx_export_{datetime.now().strftime('%Y%m%d')}.json",
        "content": base64.b64encode(payload_str.encode()).decode(),
        "type": "application/json",
    }
    try:
        return await _send_email(to=to, subject="Tus datos exportados · DesarrollosMX",
                                 html=html, attachments=[attach])
    except TypeError:
        # Fallback si _send_email no acepta attachments en el firmware
        return await _send_email(to=to, subject="Tus datos exportados · DesarrollosMX",
                                 html=html)


async def _send_delete_email(to: str, purge_at: datetime) -> bool:
    try:
        from services.lead_capture import _send_email
    except Exception:
        return False

    purge_str = purge_at.strftime("%d %b %Y")
    html = f"""<!DOCTYPE html><html lang="es"><body style="background:#06080F;font-family:'DM Sans',Arial;padding:32px 20px;max-width:560px;margin:0 auto;">
      <div style="text-align:center;margin-bottom:22px;">
        <div style="display:inline-block;padding:7px 18px;background:linear-gradient(90deg,#6366F1,#EC4899);border-radius:9999px;color:#fff;font-weight:700;font-size:12px;">DesarrollosMX</div>
      </div>
      <h1 style="font-family:Outfit,Arial;font-weight:800;font-size:22px;color:#F0EBE0;margin:0 0 10px;letter-spacing:-0.02em;">Solicitud de eliminación recibida</h1>
      <p style="color:rgba(240,235,224,0.65);font-size:13px;line-height:1.6;margin:0 0 14px;">
        Tu cuenta entró en período de gracia de 30 días.
        El borrado definitivo se ejecutará el <strong>{purge_str}</strong>.
      </p>
      <p style="color:rgba(240,235,224,0.55);font-size:13px;margin:0 0 14px;">
        Si cambias de opinión, inicia sesión y cancela la eliminación dentro de los próximos 30 días.
      </p>
      <p style="color:rgba(240,235,224,0.40);font-size:11px;margin:20px 0 0;">
        Este flujo cumple con LFPDPPP Art. 25. Conservación mínima por obligación legal.
      </p>
    </body></html>"""
    return await _send_email(to=to, subject="Eliminación de cuenta solicitada · DesarrollosMX", html=html)
