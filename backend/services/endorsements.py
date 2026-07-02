"""Phase 4 Batch 32 · services — Asesor Endorsements.

Esquemas:
  db.asesor_endorsements: {
    endorsement_id (uuid), asesor_id, client_email, client_name,
    rating: 1-5, text, project_id?, verified: bool default false,
    confirmation_token, created_at, ip_hash
  }

Reusa patrón B25 (saved_searches): email confirmación con token único.
Anti-spam: 3 endorsements/email/asesor.
"""
from __future__ import annotations

import hashlib
import logging
import os
import secrets
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import httpx

log = logging.getLogger("dmx.endorsements")

RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
FROM_EMAIL = "reseñas@desarrollosmx.io"
BASE_URL = os.environ.get("PUBLIC_BASE_URL", "") or os.environ.get(
    "REACT_APP_BACKEND_URL", "http://localhost:8001",
)
MAX_PER_EMAIL_PER_ASESOR = 3


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt else None


def _clean(d: Dict[str, Any]) -> Dict[str, Any]:
    d.pop("_id", None)
    if isinstance(d.get("created_at"), datetime):
        d["created_at"] = _iso(d["created_at"])
    return d


def _hash_ip(ip: str) -> str:
    return hashlib.sha256((ip or "").encode()).hexdigest()[:24]


# ─── Email helper (patrón saved_searches) ─────────────────────────────────────

async def _send_confirmation_email(
    to: str, asesor_name: str, project_name: str, confirm_url: str,
) -> bool:
    if not RESEND_API_KEY:
        log.info(f"[endorsements] RESEND_API_KEY ausente. Email confirm para {to}")
        return False

    subject = f"Confirma tu reseña sobre {asesor_name}"
    html = f"""<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#06080F;font-family:'DM Sans',Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
    <div style="text-align:center;margin-bottom:32px;">
      <div style="display:inline-block;padding:8px 20px;background:linear-gradient(90deg,#6366F1,#EC4899);border-radius:9999px;color:#fff;font-weight:700;font-size:13px;letter-spacing:.06em;">
        DesarrollosMX
      </div>
    </div>
    <h1 style="font-family:Outfit,Arial,sans-serif;font-weight:800;font-size:26px;color:#F0EBE0;letter-spacing:-0.02em;margin:0 0 12px;">
      Confirma tu reseña
    </h1>
    <p style="color:rgba(240,235,224,0.65);font-size:15px;line-height:1.6;margin:0 0 24px;">
      Recibimos tu reseña sobre <strong style="color:#F0EBE0;">{asesor_name}</strong>
      {f'(proyecto {project_name})' if project_name else ''}.
      Confirma con un click para que aparezca en su perfil público.
    </p>
    <div style="text-align:center;margin:32px 0;">
      <a href="{confirm_url}" style="display:inline-block;padding:14px 32px;background:linear-gradient(90deg,#6366F1,#EC4899);color:#fff;text-decoration:none;border-radius:9999px;font-weight:700;font-size:14px;">
        Confirmar mi reseña
      </a>
    </div>
    <p style="color:rgba(240,235,224,0.45);font-size:12px;line-height:1.5;margin:24px 0 0;">
      Si no fuiste tú, ignora este correo. La reseña no se publicará.
    </p>
  </div>
</body></html>"""

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {RESEND_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={"from": FROM_EMAIL, "to": [to], "subject": subject, "html": html},
            )
            return r.status_code in (200, 201)
    except Exception as e:
        log.warning(f"[endorsements] resend exception: {e}")
        return False


# ─── Public API ───────────────────────────────────────────────────────────────

async def create_endorsement(
    db,
    asesor_id: str,
    client_email: str,
    client_name: str,
    rating: int,
    text: str,
    project_id: Optional[str] = None,
    ip: str = "",
) -> Dict[str, Any]:
    if rating < 1 or rating > 5:
        raise ValueError("rating fuera de rango (1-5)")
    if len(text or "") < 8:
        raise ValueError("texto muy corto (min 8 caracteres)")

    # Verificar asesor existe
    asesor = await db.users.find_one(
        {"user_id": asesor_id, "role": {"$in": ["advisor", "asesor_admin"]}},
        {"_id": 0, "user_id": 1, "name": 1, "email": 1},
    )
    if not asesor:
        raise ValueError("asesor no encontrado")

    # Anti-spam: max 3 por email/asesor (sin importar verified)
    existing = await db.asesor_endorsements.count_documents({
        "asesor_id": asesor_id,
        "client_email": client_email.lower().strip(),
    })
    if existing >= MAX_PER_EMAIL_PER_ASESOR:
        raise PermissionError(
            f"Límite de {MAX_PER_EMAIL_PER_ASESOR} reseñas alcanzado para este email",
        )

    # Project name (si aplica)
    project_name = ""
    if project_id:
        dev = await db.developments.find_one(
            {"id": project_id}, {"_id": 0, "name": 1},
        )
        project_name = (dev or {}).get("name", "")

    token = secrets.token_urlsafe(32)
    eid = str(uuid.uuid4())

    doc = {
        "endorsement_id": eid,
        "asesor_id": asesor_id,
        "client_email": client_email.lower().strip(),
        "client_name": (client_name or "").strip()[:120],
        "rating": int(rating),
        "text": (text or "").strip()[:1200],
        "project_id": project_id,
        "project_name": project_name,
        "verified": False,
        "confirmation_token": token,
        "created_at": _now(),
        "ip_hash": _hash_ip(ip),
    }
    await db.asesor_endorsements.insert_one(dict(doc))

    # Email confirm
    confirm_url = f"{BASE_URL}/api/public/endorsements/confirm/{token}"
    await _send_confirmation_email(
        to=client_email,
        asesor_name=asesor.get("name") or asesor.get("email") or "el asesor",
        project_name=project_name,
        confirm_url=confirm_url,
    )

    # log_activity B14
    try:
        from routes.dev_batch14 import log_activity
        await log_activity(
            db, actor_id=asesor_id, actor_type="asesor",
            action="endorsement_pending", entity_id=eid,
            entity_type="asesor_endorsement",
            metadata={"rating": int(rating), "project_id": project_id},
        )
    except Exception as _e:
        log.warning("[audit] log_activity perdido (endorsement_pending asesor_endorsement %s): %s",
                    eid, _e)

    return _clean(doc)


async def confirm_endorsement(db, token: str) -> Optional[Dict[str, Any]]:
    """Confirma con token. Idempotente. Devuelve endorsement updated o None."""
    doc = await db.asesor_endorsements.find_one(
        {"confirmation_token": token}, {"_id": 0},
    )
    if not doc:
        return None
    if doc.get("verified"):
        return _clean(doc)

    await db.asesor_endorsements.update_one(
        {"endorsement_id": doc["endorsement_id"]},
        {"$set": {"verified": True, "verified_at": _now()}},
    )
    doc["verified"] = True

    try:
        from routes.dev_batch14 import log_activity
        await log_activity(
            db, actor_id=doc["asesor_id"], actor_type="asesor",
            action="endorsement_received", entity_id=doc["endorsement_id"],
            entity_type="asesor_endorsement",
            metadata={"rating": doc.get("rating", 0)},
        )
    except Exception as _e:
        log.warning("[audit] log_activity perdido (endorsement_received asesor_endorsement %s): %s",
                    doc["endorsement_id"], _e)

    # Trigger trust score re-compute
    try:
        from services.trust_score import invalidate_trust_score
        await invalidate_trust_score(db, doc["asesor_id"])
    except Exception:
        pass

    return _clean(doc)


async def get_asesor_endorsements(
    db,
    asesor_id: str,
    only_verified: bool = True,
    limit: int = 50,
) -> Dict[str, Any]:
    q: Dict[str, Any] = {"asesor_id": asesor_id}
    if only_verified:
        q["verified"] = True

    docs = await db.asesor_endorsements.find(
        q, {"_id": 0, "confirmation_token": 0, "ip_hash": 0},
    ).sort("created_at", -1).limit(limit).to_list(limit)

    items = []
    total = 0
    suma = 0
    for d in docs:
        d = _clean(d)
        items.append(d)
        if d.get("verified"):
            total += 1
            suma += int(d.get("rating") or 0)

    avg_rating = round(suma / total, 2) if total > 0 else 0.0
    return {
        "items": items,
        "count_verified": total,
        "avg_rating": avg_rating,
    }


async def delete_endorsement(db, endorsement_id: str, asesor_id: str) -> bool:
    """Solo el propio asesor puede borrar (o admin via routes)."""
    r = await db.asesor_endorsements.delete_one({
        "endorsement_id": endorsement_id,
        "asesor_id": asesor_id,
    })
    if r.deleted_count > 0:
        try:
            from services.trust_score import invalidate_trust_score
            await invalidate_trust_score(db, asesor_id)
        except Exception:
            pass
        return True
    return False


async def ensure_endorsement_indexes(db) -> None:
    await db.asesor_endorsements.create_index("endorsement_id", unique=True)
    await db.asesor_endorsements.create_index("confirmation_token", unique=True)
    await db.asesor_endorsements.create_index([("asesor_id", 1), ("verified", 1)])
    await db.asesor_endorsements.create_index([("asesor_id", 1), ("client_email", 1)])
    log.info("[endorsements] indexes ensured")
