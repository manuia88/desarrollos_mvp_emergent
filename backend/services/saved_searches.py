"""Phase 4 Batch 25 · services — Saved Searches con email confirmation.

Schema db.saved_searches:
  { search_id, email, filters, created_at, last_alert_sent,
    alert_frequency ('daily'|'weekly'), confirmed, confirmation_token,
    unsubscribe_token, ip_hash }
"""
from __future__ import annotations

import hashlib
import logging
import os
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

import httpx

log = logging.getLogger("dmx.saved_searches")

RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
FROM_EMAIL = "alertas@desarrollosmx.com"
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001")


# ─── Email helper ─────────────────────────────────────────────────────────────

async def _send_email(to: str, subject: str, html: str) -> bool:
    """Envía email vía Resend API. Retorna True si exitoso."""
    if not RESEND_API_KEY:
        log.info(f"[saved_search] RESEND_API_KEY no configurada. Email para {to}: {subject}")
        return False

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {RESEND_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": FROM_EMAIL,
                    "to": [to],
                    "subject": subject,
                    "html": html,
                },
            )
            if r.status_code in (200, 201):
                log.info(f"[saved_search] email sent to {to}: {r.json().get('id')}")
                return True
            else:
                log.warning(f"[saved_search] resend failed {r.status_code}: {r.text[:200]}")
                return False
    except Exception as e:
        log.warning(f"[saved_search] email exception: {e}")
        return False


def _confirmation_html(confirm_url: str, filters_desc: str, unsubscribe_url: str) -> str:
    return f"""
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#06080F;font-family:'DM Sans',Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
    <div style="text-align:center;margin-bottom:32px;">
      <div style="display:inline-block;padding:8px 20px;background:linear-gradient(90deg,#6366F1,#EC4899);border-radius:9999px;color:#fff;font-weight:700;font-size:13px;letter-spacing:.06em;">
        DesarrollosMX
      </div>
    </div>
    <h1 style="font-family:Outfit,Arial,sans-serif;font-weight:800;font-size:28px;color:#F0EBE0;letter-spacing:-0.02em;margin:0 0 12px;">
      Confirma tu alerta de búsqueda
    </h1>
    <p style="color:rgba(240,235,224,0.65);font-size:15px;line-height:1.6;margin:0 0 24px;">
      Configuraste una alerta para: <strong style="color:#F0EBE0;">{filters_desc}</strong>
    </p>
    <p style="color:rgba(240,235,224,0.65);font-size:14px;line-height:1.6;margin:0 0 28px;">
      Haz click en el botón para confirmar y comenzar a recibir nuevas propiedades que coincidan con tu búsqueda.
    </p>
    <div style="text-align:center;margin-bottom:32px;">
      <a href="{confirm_url}"
         style="display:inline-block;padding:14px 32px;background:linear-gradient(90deg,#6366F1,#EC4899);border-radius:9999px;color:#fff;font-weight:700;font-size:15px;text-decoration:none;">
        Confirmar alerta
      </a>
    </div>
    <hr style="border:none;border-top:1px solid rgba(240,235,224,0.10);margin:32px 0;">
    <p style="color:rgba(240,235,224,0.35);font-size:12px;text-align:center;margin:0;">
      ¿No solicitaste esto?
      <a href="{unsubscribe_url}" style="color:rgba(99,102,241,0.7);text-decoration:none;">
        Cancelar suscripción
      </a>
    </p>
  </div>
</body>
</html>
"""


def _alert_html(
    email: str,
    filters_desc: str,
    properties: List[Dict],
    unsubscribe_url: str,
) -> str:
    cards = ""
    for p in properties[:6]:
        price_txt = f"${int(p.get('price_from', 0) / 1_000_000):.1f}M" if p.get("price_from") else "—"
        cover = p.get("cover_photo", "") or ""
        img_tag = (
            f'<img src="{cover}" width="100%" height="140px" style="object-fit:cover;border-radius:8px 8px 0 0;" />'
            if cover else ""
        )
        cards += f"""
        <div style="background:rgba(255,255,255,0.05);border:1px solid rgba(240,235,224,0.10);
                    border-radius:10px;overflow:hidden;margin-bottom:14px;">
          {img_tag}
          <div style="padding:12px 14px;">
            <div style="font-family:Outfit,Arial;font-weight:700;font-size:15px;color:#F0EBE0;margin-bottom:4px;">{p.get('name', 'Proyecto')}</div>
            <div style="font-size:12px;color:rgba(240,235,224,0.55);">{p.get('colonia', '—')}</div>
            <div style="font-weight:800;font-size:16px;color:#6366F1;margin-top:6px;">{price_txt}</div>
          </div>
        </div>
        """

    return f"""
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#06080F;font-family:'DM Sans',Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
    <div style="text-align:center;margin-bottom:28px;">
      <div style="display:inline-block;padding:8px 20px;background:linear-gradient(90deg,#6366F1,#EC4899);border-radius:9999px;color:#fff;font-weight:700;font-size:13px;">
        DesarrollosMX
      </div>
    </div>
    <h1 style="font-family:Outfit,Arial;font-weight:800;font-size:24px;color:#F0EBE0;margin:0 0 8px;">
      {len(properties)} nueva{'s' if len(properties) != 1 else ''} propiedad{'es' if len(properties) != 1 else ''} para ti
    </h1>
    <p style="color:rgba(240,235,224,0.60);font-size:14px;margin:0 0 24px;">
      Búsqueda: <strong style="color:#F0EBE0;">{filters_desc}</strong>
    </p>
    {cards}
    <div style="text-align:center;margin:28px 0;">
      <a href="https://desarrollosmx.com/marketplace"
         style="display:inline-block;padding:12px 28px;background:linear-gradient(90deg,#6366F1,#EC4899);border-radius:9999px;color:#fff;font-weight:700;font-size:14px;text-decoration:none;">
        Ver todas en el marketplace
      </a>
    </div>
    <hr style="border:none;border-top:1px solid rgba(240,235,224,0.10);margin:28px 0;">
    <p style="color:rgba(240,235,224,0.30);font-size:11px;text-align:center;margin:0;">
      <a href="{unsubscribe_url}" style="color:rgba(99,102,241,0.6);text-decoration:none;">
        Cancelar alertas
      </a>
    </p>
  </div>
</body>
</html>
"""


def _describe_filters(filters: Dict) -> str:
    parts = []
    if filters.get("colonia"):
        parts.append(f"Colonia: {filters['colonia']}")
    if filters.get("zona"):
        parts.append(f"Zona: {filters['zona']}")
    if filters.get("tipo"):
        parts.append(f"Tipo: {filters['tipo']}")
    if filters.get("price_max"):
        parts.append(f"Hasta ${int(filters['price_max'] / 1_000_000):.1f}M")
    if filters.get("recamaras_min"):
        parts.append(f"{filters['recamaras_min']}+ recámaras")
    return " · ".join(parts) if parts else "Todos los desarrollos"


# ─── CRUD ─────────────────────────────────────────────────────────────────────

async def save_search(
    db,
    email: str,
    filters: Dict,
    alert_frequency: str = "weekly",
    ip_hash: str = "",
    user_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Crea una búsqueda guardada y envía email de confirmación."""
    email = email.strip().lower()

    # Idempotencia: misma email + filters → update
    existing = await db.saved_searches.find_one(
        {"email": email, "confirmed": False},
        {"_id": 0, "search_id": 1, "confirmation_token": 1},
    )

    confirmation_token = str(uuid.uuid4())
    unsubscribe_token = str(uuid.uuid4())
    now = datetime.now(timezone.utc)

    doc = {
        "search_id": str(uuid.uuid4()),
        "email": email,
        "filters": filters,
        "alert_frequency": alert_frequency,
        "created_at": now,
        "last_alert_sent": None,
        "confirmed": False,
        "confirmation_token": confirmation_token,
        "unsubscribe_token": unsubscribe_token,
        "ip_hash": ip_hash,
    }
    if user_id:
        doc["user_id"] = user_id

    if existing:
        # Re-enviar confirmación con nuevo token
        update_set = {
            "filters": filters,
            "confirmation_token": confirmation_token,
            "unsubscribe_token": unsubscribe_token,
            "created_at": now,
        }
        if user_id:
            update_set["user_id"] = user_id
        await db.saved_searches.update_one(
            {"search_id": existing["search_id"]},
            {"$set": update_set},
        )
        doc["search_id"] = existing["search_id"]
    else:
        await db.saved_searches.insert_one(doc)

    # Enviar email de confirmación
    confirm_url = f"{BASE_URL}/api/public/saved-search/confirm/{confirmation_token}"
    unsub_url = f"{BASE_URL}/api/public/saved-search/unsubscribe/{unsubscribe_token}"
    filters_desc = _describe_filters(filters)
    html = _confirmation_html(confirm_url, filters_desc, unsub_url)
    email_sent = await _send_email(email, "Confirma tu alerta de búsqueda · DesarrollosMX", html)

    return {
        "search_id": doc["search_id"],
        "email_sent": email_sent,
        "message": "Revisa tu email para confirmar la alerta",
    }


async def confirm_search(db, token: str) -> bool:
    """Confirma una búsqueda guardada. Returns True si encontró y confirmó."""
    result = await db.saved_searches.update_one(
        {"confirmation_token": token},
        {"$set": {"confirmed": True, "confirmation_token": None}},
    )
    return result.modified_count > 0


async def unsubscribe(db, token: str) -> bool:
    """Elimina una búsqueda guardada por token de unsubscribe."""
    result = await db.saved_searches.delete_one({"unsubscribe_token": token})
    return result.deleted_count > 0


async def find_new_matches(
    db,
    search: Dict,
    since: Optional[datetime] = None,
) -> List[Dict]:
    """Busca propiedades nuevas que coincidan con los filtros de la búsqueda."""
    from data_developments import DEVELOPMENTS

    filters = search.get("filters", {})
    cutoff = since or search.get("last_alert_sent") or (datetime.now(timezone.utc) - timedelta(days=7))

    # Query en DB
    query: Dict[str, Any] = {"published_at": {"$gte": cutoff}}
    if filters.get("colonia"):
        query["colonia"] = {"$regex": filters["colonia"], "$options": "i"}
    if filters.get("zona"):
        query["zona"] = {"$regex": filters["zona"], "$options": "i"}
    if filters.get("tipo"):
        query["tipo"] = filters["tipo"]
    if filters.get("price_max"):
        query["price_from"] = {"$lte": filters["price_max"]}

    try:
        db_matches = await db.developments.find(query, {"_id": 0}).limit(10).to_list(10)
    except Exception as ex:
        log.warning(f"[saved_search] DB query failed: {ex}")
        db_matches = []

    # Fallback a datos estáticos si DB vacía
    if not db_matches:
        static = []
        for d in DEVELOPMENTS:
            if filters.get("colonia") and filters["colonia"].lower() not in (d.get("colonia", "")).lower():
                continue
            if filters.get("price_max") and d.get("price_from", 0) > filters["price_max"]:
                continue
            static.append(d)
        db_matches = static[:6]

    return db_matches


async def send_alert(db, search: Dict) -> bool:
    """Envía alerta de nuevas propiedades para una búsqueda guardada."""
    new_props = await find_new_matches(db, search)
    if not new_props:
        return False

    email = search["email"]
    filters_desc = _describe_filters(search.get("filters", {}))
    unsub_url = f"{BASE_URL}/api/public/saved-search/unsubscribe/{search['unsubscribe_token']}"
    html = _alert_html(email, filters_desc, new_props, unsub_url)
    sent = await _send_email(
        email,
        f"{len(new_props)} nuevas propiedades para ti · DesarrollosMX",
        html,
    )

    if sent:
        await db.saved_searches.update_one(
            {"search_id": search["search_id"]},
            {"$set": {"last_alert_sent": datetime.now(timezone.utc)}},
        )

    return sent
