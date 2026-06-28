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

        # GUSTO → Ficha360 (auditoría Fix #3): el asesor NO debe hablar a ciegas. Al espejar, adjuntamos un resumen
        # COMPACTO del gusto del comprador (qué ama / evita / techo de precio / espacios / motivos del NO) leído de
        # visitor_taste. FAIL-OPEN: si no hay señal, el contacto se crea igual.
        taste_compact = None
        _vid = lead.get("visitor_id")
        if _vid:
            try:
                from visitor_taste import build_visitor_taste
                _tp = await build_visitor_taste(db, _vid)
                if _tp:
                    taste_compact = {
                        "resumen": _tp.get("resumen"),
                        "amenidades": (_tp.get("amenidades") or [])[:5],
                        "zonas_gustan": (_tp.get("zonas_gustan") or [])[:3],
                        "evita": (_tp.get("evita") or [])[:3],
                        "precio_techo": _tp.get("precio_techo"),
                        "espacios": [r.get("label") for r in (_tp.get("rooms") or [])][:3],
                        "motivos_no": (_tp.get("motivos_no") or [])[:3],
                        "confianza": _tp.get("confianza"),
                    }
            except Exception:  # noqa: BLE001
                pass

        # 1) ¿ya materializado este lead? → idempotente
        existing = await db.asesor_contactos.find_one(
            {"owner_id": owner, "source_lead_id": lead_id}, {"_id": 0, "id": 1}
        )
        if existing:
            # Re-engagement: el comprador volvió y subió su interés → refresca temperatura + factores para que el
            # asesor lo vea CALENTARSE en su lista (no se queda frío de la primera vez). FAIL-OPEN.
            try:
                _upd = {
                    "temperatura": lead.get("temperatura") or "frio",
                    "engagement_score": lead.get("engagement_score"),
                    "engagement_factores": lead.get("engagement_factores") or [],
                }
                if taste_compact:
                    _upd["taste_compact"] = taste_compact   # refresca el gusto al re-engancharse
                await db.asesor_contactos.update_one({"id": existing["id"]}, {"$set": _upd})
            except Exception:  # noqa: BLE001
                pass
            return existing["id"]

        # 2) ¿el dueño ya tiene un contacto del mismo cliente (alta manual)? → enlazar
        ident_or = []
        if email:
            ident_or.append({"emails": {"$in": [email]}})
        if np:
            ident_or.append({"phones_norm": {"$in": [np]}})
        if ident_or:
            dup = await db.asesor_contactos.find_one(
                {"owner_id": owner, "$or": ident_or}, {"_id": 0, "id": 1}
            )
            if dup:
                _dupset = {"source_lead_id": lead_id, "origin": "marketplace"}
                if taste_compact:
                    _dupset["taste_compact"] = taste_compact   # alta manual ahora con gusto del comprador
                await db.asesor_contactos.update_one({"id": dup["id"]}, {"$set": _dupset})
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
            "temperatura": lead.get("temperatura") or "frio",   # conducta real, no 'frio' hardcodeado
            # Por QUÉ está así de caliente: el engagement explicable del comprador (guardó/agendó/vio unidades…) →
            # el asesor prioriza por interés real y abre con contexto, no a ciegas.
            "engagement_score": lead.get("engagement_score"),
            "engagement_factores": lead.get("engagement_factores") or [],
            "taste_compact": taste_compact,   # gusto del comprador → Ficha360 (asesor no habla a ciegas)
            "etapa": _STATUS_TO_ETAPA.get(lead.get("status"), "nuevo"),
            "tags": [],
            "fuente": "Marketplace",
            "project_id": lead.get("project_id") or lead.get("development_id"),
            # CONTEXTO que el comprador eligió en la ficha → el asesor NO repite preguntas (lo que la UI le promete).
            "development_id": lead.get("development_id"),
            "unidad_interes": lead.get("unidad_interes"),
            "lente": lead.get("lente"),
            "contexto_registro": lead.get("contexto_registro"),
            "buyer_profile": lead.get("buyer_profile"),
            "dev_org_id": lead.get("dev_org_id"),
            "created_at": lead.get("created_at"),
        }
        await db.asesor_contactos.insert_one(doc)
        # E0.8 · primer evento en el hilo de actividad canónico (FAIL-OPEN) — con el contexto real del comprador.
        try:
            from services.lead_activity import record_activity
            _did = lead.get("development_id") or lead.get("project_id") or ""
            try:
                from data_developments import DEVELOPMENTS_BY_ID
                _dname = (DEVELOPMENTS_BY_ID.get(_did) or {}).get("name") or _did
            except Exception:
                _dname = _did
            _parts = [f"Desarrollo: {_dname}"] if _dname else ["Entró por marketplace"]
            if lead.get("unidad_interes"):
                _parts.append(f"unidad {lead['unidad_interes']}")
            if lead.get("lente"):
                _parts.append(str(lead["lente"]))
            if lead.get("contexto_registro"):
                _parts.append(str(lead["contexto_registro"]))
            await record_activity(
                db, owner, cid, "evento",
                title="Lead recibido",
                body=" · ".join(_parts),
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


async def resolve_public_lead_owner(db, liked_devs=None, viewed_devs=None, colonias=None):
    """Asignación INTELIGENTE de un lead PÚBLICO (sin referidor) entre los asesores de la inmobiliaria de la casa:
      1) AFINIDAD: si un asesor cubre la ZONA o el PROYECTO que al comprador le interesó → a ese asesor (lo conoce →
         regla 1 broker×proyecto, sin lead frío).
      2) ROUND-ROBIN: si no hay afinidad, al asesor con MENOS leads activos (reparto justo, sin cuello de botella).
    Instantáneo, nunca espera. Devuelve (owner_user_id, inmobiliaria_id). (None, inm) si aún no hay asesores ACTIVADOS
    en la casa → el lead queda reclamable y se notifica al admin (que puede asignarlo a mano)."""
    try:
        inm = await db.inmobiliarias.find_one({"is_system_default": True}, {"_id": 0, "id": 1})
        if not inm:
            return (None, None)
        roster = await db.inmobiliaria_internal_users.find(
            {"inmobiliaria_id": inm["id"], "status": "active", "role": "asesor", "user_id": {"$nin": [None, ""]}},
            {"_id": 0, "user_id": 1, "zonas": 1, "projects": 1}).to_list(100)
        if not roster:
            return (None, inm["id"])  # nadie activado aún → reclamable (+ notificación al admin)
        liked = set((liked_devs or []) + (viewed_devs or []))
        cols = {str(c).lower() for c in (colonias or [])}
        # 1) AFINIDAD por proyecto o zona
        for r in roster:
            if (set(r.get("projects") or []) & liked) or ({str(z).lower() for z in (r.get("zonas") or [])} & cols):
                return (r["user_id"], inm["id"])
        # 2) ROUND-ROBIN: el de menos leads activos (reparto parejo)
        best, best_n = roster[0]["user_id"], None
        for r in roster:
            n = await db.leads.count_documents({"assigned_to": r["user_id"], "activo": True})
            if best_n is None or n < best_n:
                best, best_n = r["user_id"], n
        return (best, inm["id"])
    except Exception as e:
        log.warning(f"[lead_bridge] resolve_public_lead_owner fail-open: {e}")
        return (None, None)


async def notify_house_admin_new_lead(db, lead: dict, assigned_to=None):
    """Avisa al admin de la inmobiliaria de la casa que entró un lead público (asignado a X, o por asignar si nadie).
    Así el admin SIEMPRE se entera y puede reasignar. Fail-open."""
    try:
        inm = await db.inmobiliarias.find_one({"is_system_default": True}, {"_id": 0, "id": 1})
        if not inm:
            return
        admins = await db.inmobiliaria_internal_users.find(
            {"inmobiliaria_id": inm["id"], "status": "active", "role": "admin", "user_id": {"$nin": [None, ""]}},
            {"_id": 0, "user_id": 1}).to_list(20)
        if not admins:
            return
        nombre = ((lead.get("contact") or {}).get("name")) or "Comprador"
        temp = lead.get("temperatura") or "frio"
        cuerpo = (f"Nuevo lead público {('· ' + temp.upper()) if temp == 'caliente' else ''} — "
                  + ("asignado automáticamente." if assigned_to else "por asignar (tócalo para repartirlo)."))
        from routes.dev_batch14 import create_notification
        for a in admins:
            await create_notification(
                db, a["user_id"], "lead_publico_nuevo", f"Nuevo lead: {nombre}", cuerpo,
                action_url="/desarrollador/crm/leads", priority=("high" if temp == "caliente" else "med"),
                org_id=inm["id"])
    except Exception as e:  # noqa: BLE001
        log.info(f"[lead_bridge] notify_house_admin skip: {e}")


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
        # B2 (Audit B 🟠): solo reintenta los que SÍ pueden espejarse (tienen asesor: assigned_to o asesor_id). Un lead
        # sin asesor no se puede espejar a nadie → no re-escanearlo cada hora (evita spin infinito); conserva su
        # mirror_pending y se espeja cuando se le asigne asesor. Los sin-asignar quedan como hallazgo de routing (B2-A2).
        cur = db.leads.find(
            {"mirror_pending": True,
             "$or": [{"assigned_to": {"$nin": [None, ""]}}, {"asesor_id": {"$nin": [None, ""]}}]},
            {"_id": 0},
        ).limit(limit)
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


async def route_orphan_leads(db, limit: int = 500) -> int:
    """B2-A2: leads REALES sin asesor (creados antes de que hubiera asesores activos, o por un flujo que no ruteó) →
    los rutea con resolve_public_lead_owner (afinidad/round-robin) y los espeja al CRM. SOLO leads de FUENTE REAL
    (excluye seed source=None y _demo_home) para no inundar el CRM con datos de ejemplo. Idempotente · fail-open.
    Cierra B2-A2: ningún lead real queda invisible aunque se haya creado antes de activar un asesor."""
    n = 0
    try:
        q = {
            "$or": [{"assigned_to": {"$in": [None, ""]}}, {"assigned_to": {"$exists": False}}],
            "asesor_id": {"$in": [None, ""]},
            # Audit B 🔴 anti-fuga cross-tenant: SOLO leads de la casa PÚBLICA/default. Un lead de un dev/inmobiliaria
            # B2B (su propio dev_org_id) NO se rutea aquí → su org lo rutea por su cuenta; nunca cruza al asesor ajeno.
            "dev_org_id": {"$in": ["default", None]},
            "source": {"$nin": [None, ""]},        # excluye seed (source None)
            "_demo_home": {"$ne": True},            # excluye datos de ejemplo
            "activo": {"$ne": False},               # incluye activos y legacy sin el campo (no perder leads reales)
        }
        async for ld in db.leads.find(q, {"_id": 0}).limit(limit):
            try:
                rid, inm = await resolve_public_lead_owner(
                    db, ld.get("liked_devs"), ld.get("viewed_devs"),
                    (ld.get("buyer_profile") or {}).get("colonias"))
                if not rid:
                    continue   # aún no hay asesor activo en la casa → queda reclamable (no se pierde)
                upd = {"assigned_to": rid}
                if inm:
                    upd["inmobiliaria_id"] = inm
                await db.leads.update_one({"id": ld.get("id")}, {"$set": upd})
                ld.update(upd)
                if await mirror_lead_to_asesor_contacto(db, ld):
                    await db.leads.update_one({"id": ld.get("id")}, {"$unset": {"mirror_pending": ""}})
                    await _replay_favoritos(db, ld)
                else:
                    # Audit B 🟠: si el espejo falla DESPUÉS de asignar, marca pendiente → retry_pending_mirrors lo recoge
                    # (ya tiene asesor → no se pierde en la siguiente barrida).
                    await db.leads.update_one({"id": ld.get("id")}, {"$set": {"mirror_pending": True}})
                try:   # Audit B 🟠: avisa al asesor/casa del lead recién asignado (audit + visibilidad)
                    await notify_house_admin_new_lead(db, ld, assigned_to=rid)
                except Exception:  # noqa: BLE001
                    pass
                try:   # B3: la auto-asignación la decidió el sistema → audit_log con by_ai=True (no audit-dark)
                    from audit_log import log_agent_action
                    await log_agent_action(db, "lead_router", "update", "lead", entity_id=ld.get("id"),
                                           after={"assigned_to": rid}, org_id=inm)
                except Exception:  # noqa: BLE001
                    pass
                n += 1
            except Exception:
                continue
        if n:
            log.info(f"[lead_bridge] route_orphan_leads ruteó {n} leads huérfanos a un asesor")
    except Exception as e:  # noqa: BLE001
        log.warning(f"[lead_bridge] route_orphan_leads fail-open: {e}")
    return n


async def lead_completeness_sweep(db) -> dict:
    """B2: barrido de integridad de leads — (1) rutea huérfanos REALES a un asesor, (2) reintenta espejos pendientes.
    Corre en arranque + cada hora. Así ningún lead real queda sin asesor ni invisible en el CRM."""
    routed = await route_orphan_leads(db)
    mirrored = await retry_pending_mirrors(db)
    return {"routed": routed, "mirrored": mirrored}


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


# ─── Reconciliación etapa→status (auditoría Fix #4) ─────────────────────────────
# El bridge inverso (advisor.patch_contacto) sincroniza al instante, pero si alguna vez falla, las métricas de
# dev/superadmin quedan stale. Este job diario re-sincroniza TODOS los contactos con source_lead_id. Idempotente.
_ETAPA_TO_STATUS = {"nuevo": "nuevo", "contactado": "contactado", "visita": "cita",
                    "negociacion": "negociacion", "cerrado": "cerrado_ganado"}


async def reconcile_etapa_to_leads(db, limit: int = 8000) -> dict:
    scanned = 0
    fixed = 0
    try:
        cur = db.asesor_contactos.find(
            {"source_lead_id": {"$ne": None}, "etapa": {"$ne": None}},
            {"_id": 0, "source_lead_id": 1, "etapa": 1},
        ).limit(limit)
        async for c in cur:
            scanned += 1
            st = _ETAPA_TO_STATUS.get(c.get("etapa"))
            if not st:
                continue
            r = await db.leads.update_one(
                {"id": c["source_lead_id"], "status": {"$ne": st}},
                {"$set": {"status": st, "lead_stage": st}},
            )
            if r.modified_count:
                fixed += 1
    except Exception as e:  # noqa: BLE001
        log.warning(f"[lead_bridge] reconcile fail-open: {e}")
    log.info(f"[lead_bridge] reconcile etapa→status — scanned={scanned} fixed={fixed}")
    return {"ok": True, "scanned": scanned, "fixed": fixed}


def schedule_reconcile_cron(scheduler, db) -> None:
    """Cron `lead_etapa_reconcile` 04:20 MX (tras el cubo de demanda)."""
    try:
        from cron_heartbeat import wrap_apscheduler_job
        from apscheduler.triggers.cron import CronTrigger
        scheduler.add_job(
            wrap_apscheduler_job(reconcile_etapa_to_leads, "lead_etapa_reconcile"),
            CronTrigger(hour=4, minute=20, timezone="America/Mexico_City"),
            args=[db], id="lead_etapa_reconcile", replace_existing=True, misfire_grace_time=1800,
        )
    except Exception as e:  # noqa: BLE001
        log.warning(f"[lead_bridge] schedule reconcile cron failed: {e}")


# ─── Re-entrenar temperatura del lead (oportunidad #6) ──────────────────────────
# La temperatura se congelaba al espejar. Este job (cada 6h) la "descongela": si el comprador VOLVIÓ y subió su
# actividad, el contacto SE CALIENTA para que el asesor lo vea re-engancharse. Sólo SUBE (nunca baja → respeta el
# juicio del asesor); no toca cerrados. Reusa compute_engagement (conducta real). Idempotente.
_TEMP_RANK = {"frio": 0, "tibio": 1, "caliente": 2}


async def refresh_lead_temperatures(db, limit: int = 6000) -> dict:
    scanned = 0
    bumped = 0
    try:
        from routes.buyer_signals import compute_engagement
        cur = db.asesor_contactos.find(
            {"source_lead_id": {"$ne": None},
             "etapa": {"$nin": ["cerrado", "perdido", "cerrado_ganado", "cerrado_perdido"]}},
            {"_id": 0, "id": 1, "source_lead_id": 1, "temperatura": 1},
        ).limit(limit)
        async for c in cur:
            scanned += 1
            lead = await db.leads.find_one({"id": c["source_lead_id"]}, {"_id": 0, "visitor_id": 1})
            vid = (lead or {}).get("visitor_id")
            if not vid:
                continue
            eng = await compute_engagement(db, vid)
            upd = {"engagement_score": eng.get("score"), "engagement_factores": eng.get("factores") or []}
            if _TEMP_RANK.get(eng.get("temperatura"), 0) > _TEMP_RANK.get(c.get("temperatura"), 0):
                upd["temperatura"] = eng["temperatura"]   # sólo sube (re-engagement)
                bumped += 1
            await db.asesor_contactos.update_one({"id": c["id"]}, {"$set": upd})
    except Exception as e:  # noqa: BLE001
        log.warning(f"[lead_bridge] refresh temperaturas fail-open: {e}")
    log.info(f"[lead_bridge] refresh temperaturas — scanned={scanned} bumped={bumped}")
    return {"ok": True, "scanned": scanned, "bumped": bumped}


def schedule_temp_refresh_cron(scheduler, db) -> None:
    """Cron `lead_temp_refresh` cada 6h."""
    try:
        from cron_heartbeat import wrap_apscheduler_job
        from apscheduler.triggers.cron import CronTrigger
        scheduler.add_job(
            wrap_apscheduler_job(refresh_lead_temperatures, "lead_temp_refresh"),
            CronTrigger(hour="*/6", timezone="America/Mexico_City"),
            args=[db], id="lead_temp_refresh", replace_existing=True, misfire_grace_time=1800,
        )
    except Exception as e:  # noqa: BLE001
        log.warning(f"[lead_bridge] schedule temp refresh cron failed: {e}")


def schedule_mirror_retry_cron(scheduler, db) -> None:
    """Cron `lead_completeness` cada hora :15. B2: antes el retry del espejo SOLO corría en arranque → leads invisibles
    hasta reiniciar. Ahora el barrido (1) rutea huérfanos REALES a un asesor (B2-A2) y (2) reintenta espejos pendientes,
    cada hora. Idempotente · fail-open."""
    try:
        from cron_heartbeat import wrap_apscheduler_job
        from apscheduler.triggers.cron import CronTrigger
        scheduler.add_job(
            wrap_apscheduler_job(lead_completeness_sweep, "lead_completeness"),
            CronTrigger(minute=15, hour="*", timezone="America/Mexico_City"),
            args=[db], id="lead_completeness", replace_existing=True, misfire_grace_time=1800,
        )
    except Exception as e:  # noqa: BLE001
        log.warning(f"[lead_bridge] schedule lead completeness cron failed: {e}")
