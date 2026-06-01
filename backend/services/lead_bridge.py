"""Puente leads → asesor_contactos (E0.7b).

Materializa un lead de marketplace/dev (db.leads) como contacto de PRIMERA CLASE en el
CRM rico del asesor asignado, para trabajarlo con toda la IA (score, gusto, Ficha360,
hilo de actividad). Así un lead que entra por la web aparece en "Mis Leads" del asesor,
no solo en el kanban del pipeline.

Garantías (repair, no patch):
  - IDEMPOTENTE: upsert lógico por (owner_id, source_lead_id) → nunca duplica el mismo lead.
  - DEDUP vs alta manual: si el dueño ya tiene un contacto con el mismo teléfono/correo,
    LO ENLAZA (set source_lead_id) en vez de crear otro.
  - AISLAMIENTO: solo materializa si el asesor asignado es un user_id REAL (existe en
    `users`). Si el asignado es un id pre-activación o no hay dueño → no toca nada.
  - FAIL-OPEN: cualquier error → no rompe la creación del lead (solo loggea).

phones_norm se calcula igual que en asesor_contactos (últimos 10 dígitos) para que el
dedup contra contactos manuales coincida con la convención existente.
"""
import logging
from uuid import uuid4
from typing import Optional

log = logging.getLogger("dmx.lead_bridge")


def _digits10(p: Optional[str]) -> str:
    """Últimos 10 dígitos (misma convención que _norm_phone en asesor_contactos)."""
    return "".join(c for c in (p or "") if c.isdigit())[-10:]


def _split_name(name: Optional[str]):
    parts = (name or "").strip().split()
    if not parts:
        return ("Lead", "")
    return (parts[0], " ".join(parts[1:]))


# status del lead (db.leads) → etapa del pipeline del asesor (conservador).
_STATUS_TO_ETAPA = {
    "nuevo": "nuevo", "under_review": "nuevo", "contactado": "contactado",
    "en_seguimiento": "contactado", "cita": "visita", "visita": "visita",
    "negociacion": "negociacion", "cerrado_ganado": "cerrado", "cerrado_perdido": "cerrado",
}


async def mirror_lead_to_asesor_contacto(db, lead: dict) -> Optional[str]:
    """Materializa/enlaza un lead en el CRM del asesor asignado.
    Devuelve el id del asesor_contacto resultante, o None si no aplica."""
    try:
        if not lead:
            return None
        owner = lead.get("assigned_to") or lead.get("asesor_id")
        lead_id = lead.get("id")
        if not owner or not lead_id:
            return None
        # Aislamiento: el dueño debe ser un user_id REAL (no un internal_user id
        # pre-activación). Si no, no materializamos (el lead espera en el kanban).
        u = await db.users.find_one({"user_id": owner}, {"_id": 0, "user_id": 1})
        if not u:
            return None

        contact = lead.get("contact") or {}
        email = contact.get("email") or lead.get("email")
        phone = contact.get("phone") or lead.get("phone")
        np = _digits10(phone)

        # 1) ¿ya materializado este lead? → idempotente
        existing = await db.asesor_contactos.find_one(
            {"owner_id": owner, "source_lead_id": lead_id}, {"_id": 0, "id": 1}
        )
        if existing:
            return existing["id"]

        # 2) ¿el dueño ya tiene un contacto del mismo cliente (alta manual)? → enlazar
        ident_or = []
        if email:
            ident_or.append({"emails": email})
        if np:
            ident_or.append({"phones_norm": np})
        if ident_or:
            dup = await db.asesor_contactos.find_one(
                {"owner_id": owner, "$or": ident_or}, {"_id": 0, "id": 1}
            )
            if dup:
                await db.asesor_contactos.update_one(
                    {"id": dup["id"]},
                    {"$set": {"source_lead_id": lead_id, "origin": "marketplace"}},
                )
                return dup["id"]

        # 3) crear contacto materializado
        fn, ln = _split_name(contact.get("name"))
        cid = f"contacto_{uuid4().hex[:14]}"
        doc = {
            "id": cid,
            "owner_id": owner,
            "source_lead_id": lead_id,
            "origin": "marketplace",
            "first_name": fn,
            "last_name": ln,
            "phones": [phone] if phone else [],
            "phones_norm": [np] if np else [],
            "emails": [email] if email else [],
            "tipo": "comprador",
            "temperatura": "frio",
            "etapa": _STATUS_TO_ETAPA.get(lead.get("status"), "nuevo"),
            "tags": [],
            "fuente": "Marketplace",
            "project_id": lead.get("project_id"),
            "dev_org_id": lead.get("dev_org_id"),
            "created_at": lead.get("created_at"),
        }
        await db.asesor_contactos.insert_one(doc)
        # E0.8 · primer evento en el hilo de actividad canónico (FAIL-OPEN).
        try:
            from services.lead_activity import record_activity
            proj = lead.get("project_id") or ""
            await record_activity(
                db, owner, cid, "evento",
                title="Lead recibido",
                body=("Entró por marketplace" + (f" · {proj}" if proj else "")),
                source="system", ref_id=lead_id, ts=lead.get("created_at"),
            )
        except Exception:
            pass
        return cid
    except Exception as e:
        log.warning(f"[lead_bridge] mirror fail-open: {e}")
        return None


async def resolve_house_public_receiver(db):
    """(receiver_id, inmobiliaria_id) de la inmobiliaria de la casa (Livoo · system-default):
    la asesora marcada como public_lead_receiver (Claudia). (None, None) si no hay.
    Regla founder: lead de marketplace PÚBLICO sin referidor → cae a esta receptora."""
    try:
        inm = await db.inmobiliarias.find_one({"is_system_default": True}, {"_id": 0, "id": 1})
        if not inm:
            return (None, None)
        r = await db.inmobiliaria_internal_users.find_one(
            {"inmobiliaria_id": inm["id"], "status": "active", "public_lead_receiver": True},
            {"_id": 0, "user_id": 1, "id": 1},
        )
        rid = (r.get("user_id") or r.get("id")) if r else None
        return (rid, inm["id"])
    except Exception as e:
        log.warning(f"[lead_bridge] resolve_house_public_receiver fail-open: {e}")
        return (None, None)


async def backfill_owner(db, owner_user_id: str, limit: int = 2000) -> int:
    """Materializa todos los leads YA asignados a un asesor (idempotente). Para cuando
    un asesor activa su cuenta / one-shot. Devuelve cuántos materializó/enlazó."""
    n = 0
    try:
        cur = db.leads.find(
            {"$or": [{"assigned_to": owner_user_id}, {"asesor_id": owner_user_id}]},
            {"_id": 0},
        ).limit(limit)
        async for ld in cur:
            if await mirror_lead_to_asesor_contacto(db, ld):
                n += 1
    except Exception as e:
        log.warning(f"[lead_bridge] backfill_owner fail-open: {e}")
    return n
