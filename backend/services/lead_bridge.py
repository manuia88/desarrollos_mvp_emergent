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


async def resolve_user_inmobiliaria(db, user_id: Optional[str]) -> Optional[str]:
    """Inmobiliaria (agencia) a la que pertenece un asesor. Fuente única que absorbe el
    enredo de enlaces: enlace canónico inmobiliaria_internal_users (del seed) → fallback
    a users.tenant_id (legacy). Devuelve None si no se puede determinar."""
    if not user_id:
        return None
    try:
        iu = await db.inmobiliaria_internal_users.find_one(
            {"user_id": user_id}, {"_id": 0, "inmobiliaria_id": 1})
        if iu and iu.get("inmobiliaria_id"):
            return iu["inmobiliaria_id"]
        u = await db.users.find_one({"user_id": user_id}, {"_id": 0, "tenant_id": 1})
        if u and u.get("tenant_id"):
            return u["tenant_id"]
    except Exception as e:
        log.warning(f"[lead_bridge] resolve_user_inmobiliaria fail-open: {e}")
    return None


async def backfill_lead_inmobiliaria(db, limit: int = 5000) -> int:
    """Canoniza `leads.inmobiliaria_id` (campo único de inmobiliaria del lead): para leads
    asignados sin inmobiliaria_id, lo deriva del asesor asignado. Así el filtro de outbound
    y el aislamiento por inmobiliaria machean de verdad. Idempotente · acotado · FAIL-OPEN."""
    n = 0
    try:
        cur = db.leads.find(
            {"$and": [
                {"$or": [{"inmobiliaria_id": {"$exists": False}}, {"inmobiliaria_id": None}]},
                {"$or": [{"assigned_to": {"$nin": [None, ""]}}, {"asesor_id": {"$nin": [None, ""]}}]},
            ]},
            {"_id": 0, "id": 1, "assigned_to": 1, "asesor_id": 1},
        ).limit(limit)
        async for ld in cur:
            owner = ld.get("assigned_to") or ld.get("asesor_id")
            inm = await resolve_user_inmobiliaria(db, owner)
            if inm:
                await db.leads.update_one({"id": ld["id"]}, {"$set": {"inmobiliaria_id": inm}})
                n += 1
        if n:
            log.info(f"[lead_bridge] backfill_lead_inmobiliaria canonizó {n} leads")
    except Exception as e:
        log.warning(f"[lead_bridge] backfill_lead_inmobiliaria fail-open: {e}")
    return n


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

        # Canoniza el campo único de inmobiliaria del lead desde el asesor, en UN solo
        # lugar → cubre todas las rutas que materializan (cita, marketplace b13, landing)
        # al momento de crear, no solo en el backfill de arranque.
        try:
            if not lead.get("inmobiliaria_id"):
                _inm = await resolve_user_inmobiliaria(db, owner)
                if _inm:
                    await db.leads.update_one({"id": lead_id}, {"$set": {"inmobiliaria_id": _inm}})
        except Exception:
            pass

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
        if not fn and not ln:  # forma con campos planos (landing/email): first_name/last_name
            fn = lead.get("first_name") or ""
            ln = lead.get("last_name") or ""
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
        # Solo una receptora ACTIVADA (user_id real) puede recibir: si caemos al id del
        # internal_user (cuenta sin activar) el puente lo rechaza y el lead no llega a
        # "Mis Leads". Si nadie está activado → (None, inm) = lead sin asignar pero
        # tagueado a la inmobiliaria (queda reclamable), nunca asignado a un id falso.
        r = await db.inmobiliaria_internal_users.find_one(
            {"inmobiliaria_id": inm["id"], "status": "active", "public_lead_receiver": True,
             "user_id": {"$nin": [None, ""]}},
            {"_id": 0, "user_id": 1},
        )
        rid = r.get("user_id") if r else None
        return (rid, inm["id"])
    except Exception as e:
        log.warning(f"[lead_bridge] resolve_house_public_receiver fail-open: {e}")
        return (None, None)


async def _replay_favoritos(db, lead: dict):
    """Cuando el contacto del asesor ya existe, baja los favoritos/citas/notas/unidades del comprador a su tablero
    (Ficha360). Cierra la promesa "las dos caras" incluso si el asesor se activó DESPUÉS de que el comprador eligió.
    Idempotente (upserts). Fail-open."""
    try:
        vid = lead.get("visitor_id")
        lid = lead.get("id")
        if not vid or not lid:
            return
        from routes.favoritos import mirror_favoritos_to_board
        await mirror_favoritos_to_board(db, vid, lid)
    except Exception:
        pass


async def retry_pending_mirrors(db, limit: int = 500) -> int:
    """AUTO-REPARABLE: re-intenta el espejo al CRM de los leads marcados `mirror_pending`
    (el espejo falló al crearlos → no aparecían en "Mis Leads"). Al lograrlo, limpia la
    bandera. Así el sistema se arregla solo sin que nadie tenga que leer una alerta.
    Idempotente · acotado · FAIL-OPEN · corre en cada arranque."""
    n = 0
    try:
        cur = db.leads.find({"mirror_pending": True}, {"_id": 0}).limit(limit)
        async for ld in cur:
            try:
                if await mirror_lead_to_asesor_contacto(db, ld):
                    await db.leads.update_one({"id": ld.get("id")}, {"$unset": {"mirror_pending": ""}})
                    await _replay_favoritos(db, ld)  # ahora que el contacto SÍ existe, baja sus favoritos al tablero
                    n += 1
            except Exception:
                continue
        if n:
            log.info(f"[lead_bridge] retry_pending_mirrors reparó {n} leads que no se veían en Mis Leads")
    except Exception as e:
        log.warning(f"[lead_bridge] retry_pending_mirrors fail-open: {e}")
    return n


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
                await _replay_favoritos(db, ld)  # baja sus favoritos al tablero al activar/backfill el asesor
                n += 1
    except Exception as e:
        log.warning(f"[lead_bridge] backfill_owner fail-open: {e}")
    return n
