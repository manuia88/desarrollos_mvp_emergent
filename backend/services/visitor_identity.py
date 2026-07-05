"""visitor_identity — pega el aprendizaje ANÓNIMO (visitor_id) a la PERSONA, para que el gusto/lista la sigan
cross-device. Identidad = hash(email|teléfono) (PII-min: nunca guarda el contacto crudo, solo el hash). Cuando alguien
se registra desde 2 dispositivos con el MISMO contacto, sus visitor_ids quedan unidos → las lecturas de gusto/favoritos
unen TODOS sus dispositivos. No toca el login; el momento de identidad es el registro (create_buyer_lead). Fail-open.
"""
import hashlib
import logging
from datetime import datetime, timezone

log = logging.getLogger("dmx.visitor_identity")


def _norm(email, phone):
    e = (email or "").strip().lower()
    p = "".join(ch for ch in (phone or "") if ch.isdigit())[-10:]
    return e or (p if len(p) == 10 else "")


def _key(email, phone):
    base = _norm(email, phone)
    return hashlib.sha256(("dmx_vid:" + base).encode()).hexdigest()[:24] if base else None


async def link(db, email, phone, visitor_id):
    """Une este visitor_id a la identidad (email/teléfono). Aditivo, fail-open."""
    k = _key(email, phone)
    if not k or not visitor_id or db is None:
        return
    try:
        await db.visitor_identity.update_one(
            {"id_key": k},
            {"$addToSet": {"visitors": str(visitor_id)[:64]}, "$set": {"updated_at": datetime.now(timezone.utc)}},
            upsert=True,
        )
    except Exception as e:  # noqa: BLE001
        log.warning(f"[visitor_identity] link fail: {e}")


async def resolve_visitors_by_contact(db, email, phone=None):
    """visitor_ids de la persona a partir de su CONTACTO (portal logueado) — mismo hash que link().
    Permite que el portal comprador lea los favoritos/gusto que la persona generó anónima en el marketplace."""
    k = _key(email, phone)
    if not k or db is None:
        return []
    try:
        doc = await db.visitor_identity.find_one({"id_key": k}, {"_id": 0, "visitors": 1})
        return list(doc.get("visitors") or [])[:20] if doc else []
    except Exception as e:  # noqa: BLE001
        log.warning(f"[visitor_identity] resolve_by_contact fail: {e}")
        return []


async def resolve_visitors(db, visitor_id):
    """TODOS los visitor_ids de la misma persona (el actual + los de sus otros dispositivos registrados). Devuelve
    [visitor_id] si no hay link (anónimo de un solo dispositivo). El actual va primero."""
    if not visitor_id or db is None:
        return [visitor_id] if visitor_id else []
    try:
        doc = await db.visitor_identity.find_one({"visitors": visitor_id}, {"_id": 0, "visitors": 1})
        if doc and doc.get("visitors"):
            return list(dict.fromkeys([visitor_id] + list(doc["visitors"])))[:20]
    except Exception as e:  # noqa: BLE001
        log.warning(f"[visitor_identity] resolve fail: {e}")
    return [visitor_id]
