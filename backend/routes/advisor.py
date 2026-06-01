"""Advisor portal (CRM Pulppo+) routes.

Exposes a single router under /api/asesor/* with all CRUD + AI endpoints.
Role-gated to advisor / asesor_admin / superadmin.
"""

import os
import uuid
import hashlib
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Depends, Query, Request
from pydantic import BaseModel, Field


# ─── Router + deps ────────────────────────────────────────────────────────────
router = APIRouter(prefix="/api/asesor", tags=["asesor"])

ADVISOR_ROLES = {"advisor", "asesor_admin", "superadmin"}

# Kanban stage orders
STAGE_BUSQ = ["pendiente", "buscando", "visitando", "ofertando", "cerrando", "ganada", "perdida"]
STAGE_CAPT = ["pendiente", "seguimiento", "encuentro", "valuacion", "documentacion", "captado"]
STATUS_OP  = ["propuesta", "oferta_aceptada", "escritura", "cerrada", "pagando", "cobrada", "cancelada"]

TIPO_CONTACTO  = ["comprador", "vendedor", "propietario", "inversor", "broker"]
TEMP_CONTACTO  = ["frio", "tibio", "caliente", "cliente"]
PRIORITY       = ["alta", "media", "baja"]

# Etapa del pipeline del LEAD (kanban "Tu embudo de leads" del mockup). Aditivo:
# los contactos previos sin este campo se leen como "nuevo". El asesor lo mueve
# arrastrando la tarjeta o con los chips del perfil-hub. Distinto de la temperatura
# (frío/tibio/caliente) que es la señal de calor del lead, no su posición en el embudo.
ETAPA_CONTACTO = ["nuevo", "contactado", "visita", "negociacion", "cerrado"]

# B5.1 · Estatus de cada propiedad DENTRO del tablero de un lead (Tab Propiedades del
# perfil-hub). Es el destino donde aterrizan los swipes del link Tinder (B5.2):
# 👍 del cliente → "gusto", 👎 → "descartada". El asesor también mueve arrastrando.
BOARD_STATUS = ["por_verificar", "enviada", "le_gusto", "cita", "visitada", "oferta", "descartada"]
# Compat: ítems viejos (B5.1) usaban dispo/gusto → se normalizan al leer.
BOARD_STATUS_ALIAS = {"dispo": "por_verificar", "gusto": "le_gusto"}


# ─── Pydantic models ──────────────────────────────────────────────────────────
class ContactoIn(BaseModel):
    first_name: str
    last_name: Optional[str] = ""
    phones: List[str] = []
    emails: List[str] = []
    tipo: str = "comprador"
    temperatura: str = "frio"
    etapa: str = "nuevo"
    tags: List[str] = []
    fuente: Optional[str] = "manual"
    notas: Optional[str] = ""

class ContactoPatch(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phones: Optional[List[str]] = None
    emails: Optional[List[str]] = None
    tipo: Optional[str] = None
    temperatura: Optional[str] = None
    etapa: Optional[str] = None
    tags: Optional[List[str]] = None
    notas: Optional[str] = None

class TimelineIn(BaseModel):
    kind: str  # call|visit|email|whatsapp|nota
    body: str

class BusquedaIn(BaseModel):
    contacto_id: str
    tipos: List[str] = ["dept"]
    recamaras_min: int = 1
    banos_min: int = 1
    estacionamientos_min: int = 0
    m2_min: Optional[int] = None
    colonias: List[str] = []
    precio_min: Optional[int] = None
    precio_max: Optional[int] = None
    amenidades: List[str] = []
    mascotas: bool = False
    no_negociables: List[str] = []
    urgencia: str = "media"
    fuente: str = "referido"
    notas: Optional[str] = ""
    # E2 · perfil de compra (capturable/auto-extraíble)
    forma_pago: Optional[str] = None       # contado | credito | mixto
    credito_tipo: Optional[str] = None     # banco | infonavit | fovissste | cofinavit
    plazo_compra: Optional[str] = None     # "1 mes" | "2 meses" | "6 meses" ...

class BusquedaPatch(BaseModel):
    """Edición del perfil de búsqueda (founder: el cliente sube presupuesto / amplía zona)."""
    tipos: Optional[List[str]] = None
    recamaras_min: Optional[int] = None
    banos_min: Optional[int] = None
    estacionamientos_min: Optional[int] = None
    m2_min: Optional[int] = None
    colonias: Optional[List[str]] = None
    precio_min: Optional[int] = None
    precio_max: Optional[int] = None
    amenidades: Optional[List[str]] = None
    mascotas: Optional[bool] = None
    no_negociables: Optional[List[str]] = None
    urgencia: Optional[str] = None
    notas: Optional[str] = None
    # E2 · perfil de compra (capturable/auto-extraíble)
    forma_pago: Optional[str] = None
    credito_tipo: Optional[str] = None
    plazo_compra: Optional[str] = None

class BusquedaStage(BaseModel):
    stage: str

class CaptacionIn(BaseModel):
    direccion: str
    tipo_operacion: str  # venta|renta
    precio_sugerido: int
    colonia_id: Optional[str] = None
    tipo_inmueble: str = "dept"
    recamaras: int = 2
    banos: int = 2
    estacionamientos: int = 1
    m2_construidos: Optional[int] = None
    propietario_nombre: Optional[str] = ""
    propietario_telefono: Optional[str] = ""
    urgencia: str = "media"
    notas: Optional[str] = ""

class CaptacionStage(BaseModel):
    stage: str
    payload: Optional[dict] = None  # stage-specific payload (valuacion, documentacion, etc.)

class TareaIn(BaseModel):
    titulo: str
    tipo: str  # property|capture|search|client|lead|general
    entity_id: Optional[str] = None
    entity_label: Optional[str] = None
    due_at: str  # ISO
    prioridad: str = "media"
    notas: Optional[str] = ""
    reminder: bool = False  # recordatorio (el cron de tareas lo recoge)

class OperacionIn(BaseModel):
    side: str  # ambos|vendedor|comprador
    contacto_id: Optional[str] = None
    desarrollo_id: Optional[str] = None
    unidad_id: Optional[str] = None
    valor_cierre: int
    currency: str = "MXN"
    comision_pct: float = 4.0
    fecha_cierre: Optional[str] = None
    notas: Optional[str] = ""

class OperacionStatus(BaseModel):
    status: str
    reason: Optional[str] = None

class ArgumentarioIn(BaseModel):
    contacto_id: str
    desarrollo_id: str
    objetivo: str = "agendar_visita"  # agendar_visita|enviar_info|reactivar|negociar

class AsesorProfilePatch(BaseModel):
    full_name: Optional[str] = None
    brokerage: Optional[str] = None
    brokerage_type: Optional[str] = None  # 'independent' | 'inmobiliaria' | 'desarrolladora'
    license_ampi: Optional[str] = None
    colonias: Optional[List[str]] = None
    languages: Optional[List[str]] = None
    bio: Optional[str] = None
    phone: Optional[str] = None

# B5.1 · Tablero de propiedades por lead
class BoardItemIn(BaseModel):
    dev_id: str
    name: Optional[str] = ""
    price: Optional[float] = None
    colonia: Optional[str] = ""
    addr: Optional[str] = ""
    specs: List[str] = []
    status: str = "por_verificar"
    note: Optional[str] = ""

class BoardItemPatch(BaseModel):
    status: Optional[str] = None
    note: Optional[str] = None
    visit_feedback: Optional[dict] = None  # B5.2-B · {salio, nota} de la visita
    cita_confirmada: Optional[str] = None  # B5.2-C · ISO datetime confirmado por el asesor
    cita_confirm: Optional[dict] = None    # B5.2-C · {cliente, propietario, agenda} (bool)


# ─── Helpers ──────────────────────────────────────────────────────────────────
def _now():
    return datetime.now(timezone.utc)

def _uid(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:10]}"

def _norm_phone(p: str) -> str:
    return "".join(c for c in (p or "") if c.isdigit())[-10:]


def get_db(request: Request):
    return request.app.state.db


async def require_advisor(request: Request):
    """Role gate + user retrieval."""
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    if user.role not in ADVISOR_ROLES:
        raise HTTPException(403, "Acceso restringido al portal de asesores")
    return user


# ─── Profile ──────────────────────────────────────────────────────────────────
@router.get("/profile")
async def get_profile(request: Request):
    user = await require_advisor(request)
    db = get_db(request)
    prof = await db.asesor_profiles.find_one({"user_id": user.user_id}, {"_id": 0})
    if not prof:
        # first time → bootstrap empty profile (NOT marked complete — onboarding gate must run)
        prof = {
            "user_id": user.user_id,
            "full_name": user.name,
            "brokerage": "",
            "license_ampi": "",
            "colonias": [],
            "languages": ["es-MX"],
            "bio": "",
            "phone": "",
            "score_elo": 1000,
            "cierres_total": 0,
            "xp": 0,
            "streak": 0,
            "badges": [],
            "profile_completed": False,
            "auth_provider": getattr(user, "auth_provider", "email"),
            "public_slug": (user.name or "asesor").lower().replace(" ", "-")[:40] + "-" + user.user_id[-4:],
            "created_at": _now(),
        }
        await db.asesor_profiles.insert_one(prof)
        prof.pop("_id", None)
    # Backfill flag for older profiles
    if "profile_completed" not in prof:
        complete = bool(prof.get("full_name") and prof.get("brokerage") and (prof.get("colonias") or []))
        prof["profile_completed"] = complete
        await db.asesor_profiles.update_one({"user_id": user.user_id}, {"$set": {"profile_completed": complete}})
    return prof


@router.patch("/profile")
async def patch_profile(payload: AsesorProfilePatch, request: Request):
    user = await require_advisor(request)
    db = get_db(request)
    patch = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not patch:
        raise HTTPException(400, "Sin cambios")
    # Auto-set profile_completed if minimum fields satisfied
    # Bug-fix 2026-05-15: brokerage solo es requerido si NO es independiente.
    # Si brokerage_type == 'independent', el asesor opera por cuenta propia y NO tiene inmobiliaria/desarrolladora.
    existing = await db.asesor_profiles.find_one({"user_id": user.user_id}, {"_id": 0}) or {}
    merged = {**existing, **patch}
    is_independent = merged.get("brokerage_type") == "independent"
    brokerage_ok = is_independent or (merged.get("brokerage") and len(merged.get("brokerage", "").strip()) >= 2)
    merged["profile_completed"] = bool(
        merged.get("full_name") and len(merged.get("full_name", "").strip()) >= 3
        and brokerage_ok
        and (merged.get("colonias") or [])
    )
    patch["profile_completed"] = merged["profile_completed"]
    await db.asesor_profiles.update_one({"user_id": user.user_id}, {"$set": patch}, upsert=True)
    prof = await db.asesor_profiles.find_one({"user_id": user.user_id}, {"_id": 0})
    return prof


# ─── Command Center (P1) · helpers ──────────────────────────────────────────────
# Collection: command_center_actions — acciones priorizadas que agentes (P2) insertan.
# P1 las mergea en la action_queue. Schema:
#   {id, user_id, tenant_id, type, priority, title, subtitle, lead_id?, source_agent?,
#    cta_actions[], status: pending|done|dismissed, created_at, expires_at}
#
# CONTRATO P2 (5 agentes escriben aquí):
#   · dedup: usar dedup_key determinista (p.ej. f"{source_agent}:{type}:{lead_id}") y
#     upsert por (user_id, dedup_key) para NO crear duplicados al re-correr. P1 además
#     deduplica en lectura (_build_action_queue) por (type, lead_id, source_agent) como
#     red de seguridad, así que aunque un agente inserte dos veces, el asesor ve una.
#   · expires_at: horizonte de RELEVANCIA de la acción (no created+ttl corto), porque el
#     índice TTL la borra cuando vence sin importar el status (incluido pending).
#   · user_id: el del asesor dueño. dashboard() solo lee acciones del owner (no cross-tenant).

async def ensure_command_center_indexes(db):
    """Índices para command_center_actions. Idempotente. Llamado en startup server.py."""
    try:
        # Lectura dashboard: owner + pending ordenado por prioridad.
        await db.command_center_actions.create_index([("user_id", 1), ("status", 1), ("priority", -1)])
        # P2 orchestrator: consultas/dedup por agente (user_id + status + source_agent).
        await db.command_center_actions.create_index([("user_id", 1), ("status", 1), ("source_agent", 1)])
        # TTL: documentos con expires_at se borran automáticamente al vencer.
        await db.command_center_actions.create_index("expires_at", expireAfterSeconds=0)
        # B5.1 · Tablero de propiedades por lead: lectura por dueño + lead.
        await db.asesor_lead_properties.create_index([("owner_id", 1), ("contacto_id", 1), ("updated_at", -1)])
    except Exception as _e:
        import logging
        logging.getLogger("dmx.advisor").warning(f"[command_center] ensure_indexes: {_e}")


def _pct(cur: float, prev: float) -> int:
    """Cambio porcentual entero · FAIL-OPEN 0 si base 0/inválida."""
    try:
        if not prev:
            return 0
        return round((cur - prev) / prev * 100)
    except Exception:
        return 0


async def _last_contact_map(db, contacto_ids: list) -> dict:
    """Mapa contacto_id → último ts (datetime) de su timeline. FAIL-OPEN {}."""
    out: dict = {}
    try:
        if not contacto_ids:
            return out
        async for row in db.asesor_contacto_timeline.aggregate([
            {"$match": {"contacto_id": {"$in": contacto_ids}}},
            {"$group": {"_id": "$contacto_id", "last_ts": {"$max": "$ts"}}},
        ]):
            out[row["_id"]] = row.get("last_ts")
    except Exception:
        pass
    return out


async def _build_action_queue(db, owner: str) -> list:
    """Unifica + prioriza acciones en UNA lista. Cada sección FAIL-OPEN."""
    now = _now()
    now_iso = now.isoformat()
    queue: list = []

    # 1 · Citas de hoy (appointments · prioridad 1)
    try:
        day_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        day_end = (now.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)).isoformat()
        citas = await db.appointments.find(
            {"asesor_id": owner, "datetime": {"$gte": day_start, "$lt": day_end}, "status": {"$nin": ["cancelada"]}},
            {"_id": 0},
        ).sort("datetime", 1).limit(20).to_list(20)
        for c in citas:
            queue.append({
                "id": f"cita_{c.get('id', c.get('datetime'))}",
                "type": "cita_hoy", "priority": 1,
                "title": c.get("titulo") or "Cita de hoy",
                "subtitle": (c.get("lead", {}) or {}).get("contact", "") or c.get("datetime", ""),
                "lead_id": c.get("lead_id"), "source_agent": None,
                "cta_actions": ["ver_lead", "completar"],
                "icon_hint": "calendar", "color_hint": "blue",
            })
    except Exception:
        pass

    # 2 · Tareas vencidas (asesor_tareas done=false, due_at < now · prioridad 1)
    try:
        vencidas = await db.asesor_tareas.find(
            {"owner_id": owner, "done": False, "due_at": {"$lt": now_iso}}, {"_id": 0},
        ).sort("due_at", 1).limit(20).to_list(20)
        for t in vencidas:
            queue.append({
                "id": f"tarea_{t.get('id')}",
                "type": "tarea_vencida", "priority": 1,
                "title": t.get("titulo") or "Tarea vencida",
                "subtitle": t.get("entity_label") or "Vencida",
                "lead_id": t.get("entity_id") if t.get("tipo") in ("client", "lead") else None,
                "source_agent": None,
                "cta_actions": ["completar", "ver_lead"],
                "icon_hint": "clock", "color_hint": "red",
            })
    except Exception:
        pass

    # 3+4 · Leads sin contacto reciente (buyer_scores tier hot → prio 2 · resto >7d → prio 3)
    try:
        leads = await db.asesor_contactos.find(
            {"owner_id": owner}, {"_id": 0, "id": 1, "first_name": 1, "last_name": 1, "emails": 1},
        ).sort("created_at", -1).limit(200).to_list(200)
        ids = [c["id"] for c in leads if c.get("id")]
        last_map = await _last_contact_map(db, ids)
        # buyer_scores join (email → user_id → tier) reusa patrón de list_contactos
        emails = list({(c.get("emails") or [None])[0] for c in leads if (c.get("emails") or [None])[0]})
        email_to_uid: dict = {}
        if emails:
            async for u in db.users.find({"email": {"$in": emails}}, {"_id": 0, "user_id": 1, "email": 1}):
                if u.get("user_id") and u.get("email"):
                    email_to_uid[u["email"]] = u["user_id"]
        tier_map: dict = {}
        if email_to_uid:
            async for s in db.buyer_scores.find({"user_id": {"$in": list(email_to_uid.values())}}, {"_id": 0, "user_id": 1, "tier": 1}):
                tier_map[s["user_id"]] = s.get("tier", "cold")
        d3 = now - timedelta(days=3)
        d7 = now - timedelta(days=7)
        for c in leads:
            last = last_map.get(c["id"])
            # normaliza last a datetime aware
            if isinstance(last, str):
                try:
                    last = datetime.fromisoformat(last.replace("Z", "+00:00"))
                except Exception:
                    last = None
            email = (c.get("emails") or [None])[0]
            tier = tier_map.get(email_to_uid.get(email)) if email else None
            nombre = (f"{c.get('first_name', '')} {c.get('last_name', '')}").strip() or "Lead"
            if tier == "hot" and (last is None or last < d3):
                queue.append({
                    "id": f"lead_hot_{c['id']}", "type": "lead_caliente", "priority": 2,
                    "title": f"Contactar a {nombre}", "subtitle": "Lead caliente sin contacto reciente",
                    "lead_id": c["id"], "source_agent": None,
                    "cta_actions": ["llamar", "whatsapp", "ver_lead"],
                    "icon_hint": "flame", "color_hint": "amber",
                })
            elif last is not None and last < d7:
                queue.append({
                    "id": f"lead_cold_{c['id']}", "type": "lead_sin_contacto", "priority": 3,
                    "title": f"Reactivar a {nombre}", "subtitle": "Sin contacto hace más de 7 días",
                    "lead_id": c["id"], "source_agent": None,
                    "cta_actions": ["whatsapp", "ver_lead"],
                    "icon_hint": "user", "color_hint": "muted",
                })
    except Exception:
        pass

    # 5 · MERGE acciones de agentes (command_center_actions · pending, no vencidas)
    #     Dedup en lectura (red de seguridad para 5 agentes P2): si dos docs comparten
    #     (type, lead_id, source_agent) se conserva el de MAYOR prioridad (priority menor).
    try:
        # synthetic:{$ne:True} → las sintéticas (cita_/tarea_/lead_) reaparecen vía
        # regeneración (secciones 1-4); incluirlas aquí tras un restore duplicaría la
        # card (mismo id) y rompería la key de React. Solo mergeamos acciones de agente.
        agent_actions = await db.command_center_actions.find(
            {"user_id": owner, "status": "pending", "synthetic": {"$ne": True}}, {"_id": 0},
        ).sort("priority", -1).limit(100).to_list(100)
        seen: dict = {}
        for a in agent_actions:
            exp = a.get("expires_at")
            if isinstance(exp, str):
                try:
                    exp = datetime.fromisoformat(exp.replace("Z", "+00:00"))
                except Exception:
                    exp = None
            if exp and exp < now:
                continue
            dedup_key = a.get("dedup_key") or (a.get("type"), a.get("lead_id"), a.get("source_agent"))
            prio = a.get("priority", 2)
            prev = seen.get(dedup_key)
            if prev is not None and prev[0] <= prio:
                continue  # ya hay una de igual o mayor prioridad
            seen[dedup_key] = (prio, {
                "id": a.get("id"),
                "type": a.get("type", "agente"),
                "priority": prio,
                "title": a.get("title", "Acción sugerida"),
                "subtitle": a.get("subtitle", ""),
                "lead_id": a.get("lead_id"),
                "source_agent": a.get("source_agent"),
                "cta_actions": a.get("cta_actions") or ["ver_lead"],
                "icon_hint": a.get("icon_hint", "sparkles"),
                "color_hint": a.get("color_hint", "indigo"),
            })
        for _k, (_p, item) in seen.items():
            queue.append(item)
    except Exception:
        pass

    # SUPRESIÓN · acciones (sintéticas o de agente) que el asesor ya resolvió
    # (done/dismissed/archived) NO deben reaparecer en la cola. Se persisten por
    # su id en command_center_actions (ver _cc_set_status upsert).
    # Scope: solo se consultan los ids YA presentes en la cola (≤~100) en vez de
    # cargar TODOS los resueltos con limit(500) → robusto a escala (un asesor con
    # cientos de acciones resueltas no podría hacer reaparecer una por overflow).
    try:
        queue_ids = [a.get("id") for a in queue if a.get("id")]
        if queue_ids:
            resolved = await db.command_center_actions.find(
                {"user_id": owner, "id": {"$in": queue_ids},
                 "status": {"$in": ["done", "dismissed", "archived"]}},
                {"_id": 0, "id": 1},
            ).to_list(len(queue_ids))
            suppressed = {r["id"] for r in resolved if r.get("id")}
            if suppressed:
                queue = [a for a in queue if a.get("id") not in suppressed]
    except Exception:
        pass

    # Orden: priority desc (1=más urgente arriba) → priority ascendente
    queue.sort(key=lambda x: x.get("priority", 99))
    return queue[:50]


async def _build_kpis_trend(db, owner: str) -> dict:
    """KPIs con tendencia vs 7 días atrás. Cada métrica FAIL-OPEN."""
    now = _now()
    d7 = now - timedelta(days=7)
    d7_iso = d7.isoformat()
    kpis = {
        "pipeline_mxn": 0, "pipeline_trend_pct": 0,
        "leads_calientes": 0, "leads_calientes_trend_pct": 0,
        "cierres_mes": 0, "cierres_trend_pct": 0,
        "meta_mes": 0, "comisiones_por_cobrar": 0,
    }
    # Pipeline = suma valor_cierre de operaciones abiertas · trend vs creadas hace >7d
    try:
        ops = await db.asesor_operaciones.find(
            {"owner_id": owner, "status": {"$nin": ["cobrada", "cancelada"]}},
            {"_id": 0, "valor_cierre": 1, "created_at": 1},
        ).to_list(500)
        total = sum(o.get("valor_cierre", 0) or 0 for o in ops)
        prev = sum(o.get("valor_cierre", 0) or 0 for o in ops if str(o.get("created_at", "")) and str(o.get("created_at")) <= d7_iso)
        kpis["pipeline_mxn"] = total
        kpis["pipeline_trend_pct"] = _pct(total, prev)
    except Exception:
        pass
    # Leads calientes = contactos con buyer_score tier hot
    try:
        leads = await db.asesor_contactos.find({"owner_id": owner}, {"_id": 0, "emails": 1, "created_at": 1}).limit(500).to_list(500)
        emails = list({(c.get("emails") or [None])[0] for c in leads if (c.get("emails") or [None])[0]})
        email_to_uid: dict = {}
        if emails:
            async for u in db.users.find({"email": {"$in": emails}}, {"_id": 0, "user_id": 1, "email": 1}):
                if u.get("user_id") and u.get("email"):
                    email_to_uid[u["email"]] = u["user_id"]
        hot_uids = set()
        if email_to_uid:
            async for s in db.buyer_scores.find({"user_id": {"$in": list(email_to_uid.values())}, "tier": "hot"}, {"_id": 0, "user_id": 1}):
                hot_uids.add(s["user_id"])
        hot = sum(1 for c in leads if email_to_uid.get((c.get("emails") or [None])[0]) in hot_uids)
        prev_total = sum(1 for c in leads if str(c.get("created_at", "")) and str(c.get("created_at")) <= d7_iso)
        kpis["leads_calientes"] = hot
        kpis["leads_calientes_trend_pct"] = _pct(len(leads), prev_total)
    except Exception:
        pass
    # Cierres del mes (status cerrada/cobrada con fecha_cierre este mes)
    try:
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
        prev_month_start = (now.replace(day=1) - timedelta(days=1)).replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
        cierres = await db.asesor_operaciones.count_documents(
            {"owner_id": owner, "status": {"$in": ["cerrada", "cobrada", "pagando"]}, "fecha_cierre": {"$gte": month_start}})
        cierres_prev = await db.asesor_operaciones.count_documents(
            {"owner_id": owner, "status": {"$in": ["cerrada", "cobrada", "pagando"]}, "fecha_cierre": {"$gte": prev_month_start, "$lt": month_start}})
        kpis["cierres_mes"] = cierres
        kpis["cierres_trend_pct"] = _pct(cierres, cierres_prev)
    except Exception:
        pass
    # Meta mensual (del perfil · FAIL-OPEN 0) + comisiones por cobrar
    try:
        prof = await db.asesor_profiles.find_one({"user_id": owner}, {"_id": 0, "meta_mes": 1}) or {}
        kpis["meta_mes"] = prof.get("meta_mes", 0) or 0
    except Exception:
        pass
    try:
        ops_pag = await db.asesor_operaciones.find({"owner_id": owner, "status": "pagando"}, {"_id": 0, "comision_total": 1}).to_list(100)
        kpis["comisiones_por_cobrar"] = sum(o.get("comision_total", 0) or 0 for o in ops_pag)
    except Exception:
        pass
    return kpis


# ─── Dashboard ────────────────────────────────────────────────────────────────
@router.get("/dashboard")
async def dashboard(request: Request):
    user = await require_advisor(request)
    db = get_db(request)
    owner = user.user_id

    tareas = await db.asesor_tareas.find({"owner_id": owner, "done": False}, {"_id": 0}).sort("due_at", 1).limit(5).to_list(5)
    leads = await db.asesor_contactos.find({"owner_id": owner}, {"_id": 0}).sort("created_at", -1).limit(3).to_list(3)
    ops_pend = await db.asesor_operaciones.find({"owner_id": owner, "status": {"$in": ["cerrada", "pagando"]}}, {"_id": 0}).to_list(50)
    comisiones_por_cobrar = sum(o.get("comision_total", 0) for o in ops_pend if o.get("status") == "pagando")
    briefings = await db.asesor_briefings.find({"user_id": owner}, {"_id": 0}).sort("date", -1).limit(1).to_list(1)

    counts = {
        "contactos": await db.asesor_contactos.count_documents({"owner_id": owner}),
        "busquedas": await db.asesor_busquedas.count_documents({"owner_id": owner}),
        "captaciones": await db.asesor_captaciones.count_documents({"owner_id": owner}),
        "tareas_vencidas": await db.asesor_tareas.count_documents({"owner_id": owner, "done": False, "due_at": {"$lt": _now().isoformat()}}),
        "operaciones_abiertas": await db.asesor_operaciones.count_documents({"owner_id": owner, "status": {"$nin": ["cobrada", "cancelada"]}}),
    }

    # P1 · Command Center extensions (FAIL-OPEN · no rompen el shape previo)
    try:
        action_queue = await _build_action_queue(db, owner)
    except Exception:
        action_queue = []
    try:
        kpis_trend = await _build_kpis_trend(db, owner)
    except Exception:
        kpis_trend = {}

    return {
        "tareas_hoy": tareas,
        "leads_recientes": leads,
        "comisiones_por_cobrar": comisiones_por_cobrar,
        "briefing": briefings[0] if briefings else None,
        "counts": counts,
        # P1 · nuevos campos (aditivos)
        "action_queue": action_queue,
        "kpis_trend": kpis_trend,
    }


# ─── Command Center (P1) · endpoints complete/dismiss ────────────────────────────
# Retención de acciones resueltas (done/dismissed/archived) antes de que el TTL las borre.
# Suficiente para "Ver archivadas" reciente; las sintéticas resueltas no se acumulan eterno.
RESOLVED_ACTION_TTL_DAYS = 30


async def _cc_set_status(request: Request, action_id: str, new_status: str, payload: dict = None):
    """Cambia el status de una acción · UPSERT por id.

    Acciones de agente ya existen en command_center_actions. Las SINTÉTICAS
    (cita_/tarea_/lead_ · generadas por heurística) NO existen aún: si llega
    `payload` (el contenido de la card), se persiste la primera vez para que
    (a) NO reaparezca en la cola (supresión) y (b) sea recuperable si archived.
    _assert owner siempre (NO cross-tenant).
    """
    user = await require_advisor(request)
    db = get_db(request)
    now = _now()
    existing = await db.command_center_actions.find_one(
        {"id": action_id, "user_id": user.user_id}, {"_id": 0})
    set_doc = {"status": new_status, "resolved_at": now}
    # TTL housekeeping · las acciones RESUELTAS (incl. sintéticas, que no traían
    # expires_at) caducan a los 30d → el índice TTL las borra. Evita crecimiento
    # ilimitado de command_center_actions y mantiene chico el set de supresión.
    # Restore (pending) NO setea expires_at aquí → se conserva el horizonte previo.
    if new_status in ("done", "dismissed", "archived"):
        set_doc["expires_at"] = now + timedelta(days=RESOLVED_ACTION_TTL_DAYS)
    if not existing:
        if not payload:
            raise HTTPException(404, "Acción no encontrada")
        # Persistir sintética la primera vez (con su contenido para recuperarla).
        set_doc.update({
            "id": action_id,
            "user_id": user.user_id,
            "tenant_id": getattr(user, "tenant_id", None) or "default",
            "type": payload.get("type", "accion"),
            "title": payload.get("title", "Acción"),
            "subtitle": payload.get("subtitle", ""),
            "priority": payload.get("priority", 3),
            "lead_id": payload.get("lead_id"),
            "source_agent": payload.get("source_agent"),
            "cta_actions": payload.get("cta_actions") or [],
            "icon_hint": payload.get("icon_hint", "sparkles"),
            "color_hint": payload.get("color_hint", "indigo"),
            "synthetic": True,
            "created_at": _now(),
        })
    await db.command_center_actions.update_one(
        {"id": action_id, "user_id": user.user_id},
        {"$set": set_doc}, upsert=True,
    )
    try:
        from audit_log import log_mutation
        await log_mutation(db, user, new_status, "command_center_action", action_id,
                           before=existing or {}, after={**(existing or {}), **set_doc}, request=request)
    except Exception:
        pass
    return {"ok": True, "id": action_id, "status": new_status}


async def _cc_payload(request: Request) -> dict:
    # Body opcional · contiene la card sintética para persistirla la 1ra vez.
    try:
        body = await request.json()
        return body if isinstance(body, dict) else {}
    except Exception:
        return {}


@router.post("/command-center/action/{action_id}/complete")
async def cc_complete_action(action_id: str, request: Request):
    return await _cc_set_status(request, action_id, "done", await _cc_payload(request))


@router.post("/command-center/action/{action_id}/dismiss")
async def cc_dismiss_action(action_id: str, request: Request):
    return await _cc_set_status(request, action_id, "dismissed", await _cc_payload(request))


@router.post("/command-center/action/{action_id}/archive")
async def cc_archive_action(action_id: str, request: Request):
    # Archivar = guardar sin perder (status=archived · recuperable · NO en queue pending).
    return await _cc_set_status(request, action_id, "archived", await _cc_payload(request))


@router.post("/command-center/action/{action_id}/restore")
async def cc_restore_action(action_id: str, request: Request):
    # Restaurar archivada → vuelve a la cola (status=pending).
    return await _cc_set_status(request, action_id, "pending")


@router.get("/command-center/archived")
async def cc_list_archived(request: Request):
    # Acciones archivadas del asesor (para ver/recuperar). Solo del owner.
    user = await require_advisor(request)
    db = get_db(request)
    items = await db.command_center_actions.find(
        {"user_id": user.user_id, "status": "archived"}, {"_id": 0},
    ).sort("resolved_at", -1).limit(100).to_list(100)
    return {"archived": items, "count": len(items)}


# ─── Contactos ────────────────────────────────────────────────────────────────
@router.get("/contactos")
async def list_contactos(
    request: Request,
    q: Optional[str] = None,
    tipo: Optional[str] = None,
    temp: Optional[str] = None,
    score_min: Optional[int] = None,
):
    user = await require_advisor(request)
    db = get_db(request)
    flt = {"owner_id": user.user_id}
    if tipo: flt["tipo"] = tipo
    if temp: flt["temperatura"] = temp
    if q:
        flt["$or"] = [
            {"first_name": {"$regex": q, "$options": "i"}},
            {"last_name": {"$regex": q, "$options": "i"}},
            {"phones": {"$regex": q}},
        ]
    items = await db.asesor_contactos.find(flt, {"_id": 0}).sort("created_at", -1).limit(500).to_list(500)

    # Etapa del pipeline · default 'nuevo' para contactos previos sin el campo.
    for c in items:
        c.setdefault("etapa", "nuevo")

    # W5.4 Sub-B / E0.5 — JOIN buyer_scores vía resolvedor canónico (email + teléfono).
    # Reemplaza el JOIN email-only: ahora un contacto sin email coincidente pero con el
    # mismo teléfono que un comprador SÍ resuelve su score. FAIL-OPEN (deja buyer_score=None).
    from services.buyer_identity import attach_buyer_scores
    await attach_buyer_scores(db, items)

    # E1 · Clasificación viva: etiqueta cada contacto con sus segmentos reales (tier+etapa+
    # recencia) server-side. El board filtra/cuenta por c.segments (fuente única de verdad).
    from services.lead_segments import tag_segments
    await tag_segments(db, items, user.user_id)

    # E2.2 · línea de gusto por contacto (de asesor_taste_profile persistido) para la tarjeta.
    try:
        from taste_profile import taste_summary_line
        tmap: dict = {}
        async for tp in db.asesor_taste_profile.find({"owner_id": user.user_id}, {"_id": 0}):
            if tp.get("contacto_id"):
                tmap[tp["contacto_id"]] = tp
        for c in items:
            tp = tmap.get(c.get("id"))
            c["taste_line"] = taste_summary_line(tp) if tp else ""
    except Exception:
        for c in items:
            c.setdefault("taste_line", "")

    # Filtrar por score_min si se proporciona
    if score_min is not None and score_min > 0:
        items = [c for c in items if (c.get("buyer_score") or {}).get("value", 0) >= score_min]

    return items


@router.post("/contactos")
async def create_contacto(payload: ContactoIn, request: Request):
    user = await require_advisor(request)
    db = get_db(request)
    if payload.tipo not in TIPO_CONTACTO: raise HTTPException(400, "tipo inválido")
    if payload.temperatura not in TEMP_CONTACTO: raise HTTPException(400, "temperatura inválida")
    if payload.etapa not in ETAPA_CONTACTO: raise HTTPException(400, "etapa inválida")
    phones_norm = [_norm_phone(p) for p in payload.phones if p]
    # dedupe check
    if phones_norm:
        dup = await db.asesor_contactos.find_one({"owner_id": user.user_id, "phones_norm": {"$in": phones_norm}})
        if dup:
            raise HTTPException(409, {"message": "Ya existe este contacto", "contacto_id": dup["id"]})
    item = {
        "id": _uid("contacto"),
        "owner_id": user.user_id,
        "created_at": _now(),
        "phones_norm": phones_norm,
        **payload.model_dump(),
    }
    await db.asesor_contactos.insert_one(dict(item))
    item.pop("_id", None)
    return item


@router.get("/contactos/{cid}")
async def get_contacto(cid: str, request: Request):
    user = await require_advisor(request)
    db = get_db(request)
    c = await db.asesor_contactos.find_one({"id": cid, "owner_id": user.user_id}, {"_id": 0})
    if not c: raise HTTPException(404, "No encontrado")
    c.setdefault("etapa", "nuevo")
    timeline = await db.asesor_contacto_timeline.find({"contacto_id": cid}, {"_id": 0}).sort("ts", -1).limit(100).to_list(100)
    c["timeline"] = timeline
    return c


@router.get("/contactos/{cid}/close-probability")
async def get_close_probability(cid: str, request: Request):
    """P3.A · Probabilidad de cierre de un lead. Reusa close_probability (P2) ·
    _assert owner · FAIL-OPEN (prob None) si el motor no está disponible."""
    user = await require_advisor(request)
    db = get_db(request)
    c = await db.asesor_contactos.find_one({"id": cid, "owner_id": user.user_id}, {"_id": 0, "id": 1})
    if not c:
        raise HTTPException(404, "No encontrado")
    try:
        from close_probability import close_probability
        return await close_probability(db, cid)
    except Exception:
        return {"prob": None, "factors": [], "confidence": "BAJA"}


def _ts_iso(ts) -> str:
    """Normaliza un ts (datetime|str|None) a string ISO comparable para ordenar."""
    if isinstance(ts, datetime):
        t = ts if ts.tzinfo else ts.replace(tzinfo=timezone.utc)
        return t.isoformat()
    return str(ts or "")


@router.get("/contactos/{cid}/overview")
async def get_contacto_overview(cid: str, request: Request):
    """B1 · Agregador de actividad del lead (alimenta el tab Actividad del perfil-hub).

    Fan-out a las fuentes que ya existen (timeline propio + búsquedas + operaciones +
    client_insights del comprador) y las normaliza a UN timeline unificado ordenado
    por ts (desc). FAIL-OPEN por fuente: si una falla, el resto responde igual. No crea
    colecciones ni datos — solo lee e indexa. Aislamiento: owner_id == user.user_id.
    """
    user = await require_advisor(request)
    db = get_db(request)
    # Aislamiento: el contacto debe pertenecer al asesor (si no, 404).
    c = await db.asesor_contactos.find_one({"id": cid, "owner_id": user.user_id}, {"_id": 0, "id": 1})
    if not c:
        raise HTTPException(404, "No encontrado")

    events: List[dict] = []
    sources: dict = {}

    # 1) Timeline propio (notas/visitas/llamadas/mensajes registrados).
    try:
        tl = await db.asesor_contacto_timeline.find(
            {"contacto_id": cid, "owner_id": user.user_id}, {"_id": 0},
        ).sort("ts", -1).limit(100).to_list(100)
        for e in tl:
            events.append({
                "ts": _ts_iso(e.get("ts")),
                "source": "timeline",
                "kind": e.get("kind", "nota"),
                "title": e.get("kind", "nota"),
                "body": e.get("body", ""),
            })
        sources["timeline"] = "ok"
    except Exception:
        sources["timeline"] = "error"

    # 2) Búsquedas del contacto (alta + etapa del pipeline de búsqueda).
    try:
        bs = await db.asesor_busquedas.find(
            {"contacto_id": cid, "owner_id": user.user_id}, {"_id": 0},
        ).sort("created_at", -1).limit(50).to_list(50)
        for b in bs:
            colonias = ", ".join(b.get("colonias", []) or []) or "sin zona definida"
            events.append({
                "ts": _ts_iso(b.get("created_at")),
                "source": "busqueda",
                "kind": "busqueda",
                "title": "Búsqueda registrada",
                "body": f"{colonias} · etapa {b.get('stage', 'pendiente')}",
            })
        sources["busquedas"] = "ok"
    except Exception:
        sources["busquedas"] = "error"

    # 3) Operaciones del contacto (alta + status).
    try:
        ops = await db.asesor_operaciones.find(
            {"contacto_id": cid, "owner_id": user.user_id}, {"_id": 0},
        ).sort("created_at", -1).limit(50).to_list(50)
        for o in ops:
            label = f"{o.get('status', 'propuesta')} · {o.get('op_code', '')}".strip(" ·")
            events.append({
                "ts": _ts_iso(o.get("created_at")),
                "source": "operacion",
                "kind": "operacion",
                "title": "Operación",
                "body": label,
            })
        sources["operaciones"] = "ok"
    except Exception:
        sources["operaciones"] = "error"

    # 4) Client insights del comprador (best-effort · actividad 30d en el marketplace).
    insights = None
    try:
        from services.client_insights import compute_client_insights
        insights = await compute_client_insights(db, cid, user.user_id)
        for ev in (insights.get("timeline") or [])[:50]:
            events.append({
                "ts": _ts_iso(ev.get("ts")),
                "source": "insights",
                "kind": ev.get("type", "actividad"),
                "title": ev.get("label", "Actividad"),
                "body": ev.get("label", ""),
            })
        sources["insights"] = "ok"
    except Exception:
        sources["insights"] = "error"

    # 5) Tareas del contacto (ligadas vía entity_id). E0.8 · antes NO salían en Actividad.
    try:
        tks = await db.asesor_tareas.find(
            {"owner_id": user.user_id, "entity_id": cid}, {"_id": 0},
        ).limit(100).to_list(100)
        for t in tks:
            estado = "completada" if t.get("done") else "pendiente"
            events.append({
                "ts": _ts_iso(t.get("due_at") or t.get("created_at")),
                "source": "tarea", "kind": "tarea", "title": "Tarea",
                "body": f"{t.get('titulo', 'Tarea')} · {estado}",
            })
        sources["tareas"] = "ok"
    except Exception:
        sources["tareas"] = "error"

    # 6) Citas del contacto (appointments). E0.8 · antes NO salían en Actividad.
    try:
        aps = await db.appointments.find(
            {"asesor_id": user.user_id, "lead_id": cid}, {"_id": 0},
        ).limit(100).to_list(100)
        for a in aps:
            events.append({
                "ts": _ts_iso(a.get("datetime") or a.get("created_at")),
                "source": "cita", "kind": "cita", "title": "Cita",
                "body": f"{a.get('titulo', 'Cita')} · {a.get('status', 'agendada')}",
            })
        sources["citas"] = "ok"
    except Exception:
        sources["citas"] = "error"

    # 7) Hilo de actividad canónico (lead_events · E0.8). Aquí escriben las superficies
    # nuevas vía record_activity; todas las vistas leen de aquí (base de E3).
    try:
        from services.lead_activity import read_lead_events
        events.extend(await read_lead_events(db, cid, user.user_id))
        sources["lead_events"] = "ok"
    except Exception:
        sources["lead_events"] = "error"

    # 8) Conversaciones (WhatsApp del lead). E3 · antes NO salían en el hilo.
    try:
        msgs = await db.whatsapp_messages.find(
            {"org_id": user.user_id, "lead_id": cid}, {"_id": 0},
        ).sort("created_at", -1).limit(60).to_list(60)
        for m in msgs:
            entrante = m.get("direction") == "inbound"
            body = (m.get("body_text") or "").strip()
            events.append({
                "ts": _ts_iso(m.get("created_at") or m.get("sent_at")),
                "source": "whatsapp", "kind": "mensaje",
                "title": "WhatsApp" + (" · cliente" if entrante else " · tú"),
                "body": (body[:140] + ("…" if len(body) > 140 else "")),
            })
        sources["whatsapp"] = "ok"
    except Exception:
        sources["whatsapp"] = "error"

    # 9) Swipes del lead (lo que le gustó / descartó en la Galería). E3 · cierra el hilo.
    try:
        SW = {"le_gusto": ("👍 Le gustó", "ok"), "descartada": ("👎 Descartó", "no"), "oferta": ("Oferta", "oferta")}
        props = await db.asesor_lead_properties.find(
            {"owner_id": user.user_id, "contacto_id": cid, "status": {"$in": list(SW.keys())}}, {"_id": 0},
        ).sort("updated_at", -1).limit(60).to_list(60)
        for p in props:
            lbl, _k = SW.get(p.get("status"), ("Propiedad", "evt"))
            events.append({
                "ts": _ts_iso(p.get("updated_at") or p.get("created_at")),
                "source": "swipe", "kind": "swipe",
                "title": lbl,
                "body": p.get("name") or p.get("dev_name") or "Propiedad",
            })
        sources["swipes"] = "ok"
    except Exception:
        sources["swipes"] = "error"

    events.sort(key=lambda e: e.get("ts") or "", reverse=True)

    next_action = insights.get("next_action") if isinstance(insights, dict) else None
    return {
        "contacto_id": cid,
        "count": len(events),
        "timeline": events,
        "sources": sources,
        "next_action": next_action,
    }


# DISC del prospecto (letra) → etiqueta + cómo tratarlo (es-MX). Estático y derivado
# del motor real (resolve_disc deriva del tier de buyer_score). NO se inventa el DISC:
# si el motor no tiene señal, este bloque viene null y la UI lo oculta.
_DISC_LABELS = {
    "D": {"name": "Dominante", "sub": "directo · decidido · orientado a resultados",
          "tips": ["Ve al grano, sin rodeos", "Enfócate en resultados y retorno", "Dale el control de la decisión"]},
    "I": {"name": "Influyente", "sub": "cálido · social · decide con emoción",
          "tips": ["Sé cercano y entusiasta, evita lo técnico", "Usa historias y testimonios, no solo números", "Dale opciones y hazlo sentir especial"]},
    "S": {"name": "Estable", "sub": "tranquilo · leal · evita el riesgo",
          "tips": ["Genera confianza sin presionar", "Da garantías y pasos claros", "Respeta su ritmo, no lo apures"]},
    "C": {"name": "Concienzudo", "sub": "analítico · detallista · pide datos",
          "tips": ["Dale datos, fichas y comparativos", "Sé preciso, evita exagerar", "Documenta todo por escrito"]},
}


async def _contacto_user_id(db, contacto: dict) -> Optional[str]:
    """Resuelve el user_id del comprador detrás de un contacto (E0.5: email + teléfono).
    Los motores de IA (buyer_score/DISC/churn) operan por user_id; un contacto
    alta-manual sin cuenta de comprador no resuelve → None (bloques se ocultan)."""
    from services.buyer_identity import resolve_buyer_user_id
    return await resolve_buyer_user_id(db, contacto)


@router.get("/lead/{lead_id}/buyer-score")
async def lead_buyer_score(lead_id: str, request: Request):
    """E0.1 — buyer_score de un lead/contacto para la vista de Alertas (Fit panel).
    Resuelve el lead (asesor_contactos del asesor o leads asignado) → comprador →
    score, vía el resolvedor canónico (email+teléfono). null si no hay comprador."""
    user = await require_advisor(request)
    db = get_db(request)
    from services.buyer_identity import buyer_score_for_doc
    doc = await db.asesor_contactos.find_one(
        {"id": lead_id, "owner_id": user.user_id}, {"_id": 0, "emails": 1, "phones": 1}
    )
    if not doc:
        # Seguridad: el fallback a `leads` debe estar scopeado al asesor (no a cualquier lead).
        doc = await db.leads.find_one(
            {"id": lead_id, "$or": [{"assigned_to": user.user_id}, {"asesor_id": user.user_id}]},
            {"_id": 0, "email": 1, "phone": 1, "emails": 1, "phones": 1}
        )
    if not doc:
        return None
    return await buyer_score_for_doc(db, doc)


@router.get("/contactos/{cid}/intel")
async def get_contacto_intel(cid: str, request: Request):
    """B2 · Inteligencia del lead para el perfil-hub (DISC · riesgo de enfriamiento ·
    brief). Fan-out FAIL-OPEN a los motores REALES; cada bloque = null si el motor no
    tiene señal (la UI lo oculta · cero pintura falsa). Aislado por owner_id."""
    user = await require_advisor(request)
    db = get_db(request)
    c = await db.asesor_contactos.find_one({"id": cid, "owner_id": user.user_id}, {"_id": 0})
    if not c:
        raise HTTPException(404, "No encontrado")

    uid = await _contacto_user_id(db, c)

    # DISC del prospecto (motor real · derivado de buyer_score tier).
    disc = None
    if uid:
        try:
            from conversation_disc_adapter import resolve_disc
            letter = (await resolve_disc(db, uid) or "").strip().upper()[:1]
            if letter in _DISC_LABELS:
                disc = {"letter": letter, **_DISC_LABELS[letter]}
        except Exception:
            disc = None

    # Riesgo de enfriamiento (motor real · churn_prediction sobre behavioral_events).
    churn = None
    if uid:
        try:
            from churn_prediction_engine import compute_churn_risk
            r = await compute_churn_risk(db, uid)
            score = int((r or {}).get("churn_risk_score", 0) or 0)
            has_signal = bool((r or {}).get("has_data") or score > 0 or (r or {}).get("last_active"))
            if has_signal:
                level = "Alto" if score >= 60 else "Medio" if score >= 30 else "Bajo"
                churn = {"score": score, "level": level,
                         "reason": "lleva días sin actividad" if score >= 30 else "actividad reciente estable"}
        except Exception:
            churn = None

    # Búsqueda más reciente del lead (la usan brief + oferta).
    busq = await db.asesor_busquedas.find_one(
        {"contacto_id": cid, "owner_id": user.user_id}, {"_id": 0}, sort=[("created_at", -1)])

    # Mejor hora de contacto (señal REAL · histograma de la hora de SUS mensajes).
    best_time = None
    try:
        threads = await db.chat_threads.find({"buyer_id": cid}, {"_id": 0, "thread_id": 1}).to_list(50)
        tids = [t.get("thread_id") for t in threads if t.get("thread_id")]
        if tids:
            msgs = await db.chat_messages.find(
                {"thread_id": {"$in": tids}, "sender_role": "buyer"},
                {"_id": 0, "sent_at": 1}).limit(500).to_list(500)
            hours = [m["sent_at"].hour for m in msgs if isinstance(m.get("sent_at"), datetime)]
            if hours:
                from collections import Counter
                top = Counter(hours).most_common(1)[0][0]
                best_time = {"value": f"{top}:00–{(top + 2) % 24}:00",
                             "sub": f"cuando más responde · {len(hours)} mensajes"}
    except Exception:
        best_time = None

    # Oferta sugerida (valuación AVM REAL de la zona de su búsqueda). HONESTO: es una
    # estimación de zona, NO una oferta de propiedad específica con prob. de aceptación.
    offer = None
    try:
        cols = (busq or {}).get("colonias") or []
        if cols:
            from avm_public_engine import avm_quick_async
            rec = int((busq or {}).get("recamaras_min") or 2)
            colonia = str(cols[0]).lower().replace(" ", "-")
            avm = await avm_quick_async(db, colonia, m2=float(65 + rec * 15),
                                        recamaras=rec, banos=max(1, rec - 1), antiguedad_anos=5)
            val = (avm or {}).get("precio_estimado")
            if avm and not avm.get("error") and val:
                offer = {"value": int(val), "colonia": (avm.get("colonia_name") or cols[0]),
                         "confidence": avm.get("confidence"),
                         "basis": f"valuación AVM de zona ~{int((65 + rec * 15))}m² {rec} rec · estimado"}
    except Exception:
        offer = None

    # Brief determinístico desde datos REALES del lead (sin LLM · siempre disponible
    # si el lead tiene búsqueda/probabilidad). No inventa: solo resume lo que ya hay.
    brief = None
    try:
        prob = None
        try:
            from close_probability import close_probability
            pr = await close_probability(db, cid)
            if pr and pr.get("prob") is not None:
                prob = max(0, min(100, int(round(float(pr["prob"])))))
        except Exception:
            prob = None
        bits = []
        if busq:
            seg = []
            if busq.get("recamaras_min"):
                seg.append(f"{busq['recamaras_min']} rec")
            cols = busq.get("colonias") or []
            if cols:
                seg.append("en " + ", ".join(cols[:2]))
            if busq.get("precio_max"):
                seg.append(f"hasta ${busq['precio_max']/1_000_000:.0f}M")
            if seg:
                bits.append("Busca " + " ".join(seg))
        if prob is not None:
            bits.append(f"{prob}% probabilidad de cierre")
        etapa = c.get("etapa", "nuevo")
        falta = {"nuevo": "contactar y calificar", "contactado": "dar seguimiento",
                 "visita": "confirmar la visita", "negociacion": "meter la oferta",
                 "cerrado": ""}.get(etapa, "")
        if bits:
            nombre = c.get("first_name", "El lead")
            brief = {"text": f"{nombre} · " + " · ".join(bits) + ".",
                     "falta": (f"Falta: {falta}." if falta else "")}
    except Exception:
        brief = None

    # B5.4 · Gusto del prospecto (aprendido de sus 👍/👎 del Modo Tinder + cuartos que mira).
    # Es POR-LEAD (NO promediado): lo que SU conducta revela. FAIL-OPEN · null si no hay señal.
    taste = None
    try:
        from taste_profile import build_taste_profile, taste_summary_line
        tp = await build_taste_profile(db, user.user_id, cid, persist=False)
        if tp and int(tp.get("signal_count") or 0) > 0:
            tp["summary"] = taste_summary_line(tp)
            taste = tp
    except Exception:
        taste = None

    return {"disc": disc, "churn": churn, "best_time": best_time, "offer": offer,
            "brief": brief, "taste": taste, "has_user": bool(uid)}


@router.patch("/contactos/{cid}")
async def patch_contacto(cid: str, payload: ContactoPatch, request: Request):
    user = await require_advisor(request)
    db = get_db(request)
    patch = {k: v for k, v in payload.model_dump().items() if v is not None}
    if "etapa" in patch and patch["etapa"] not in ETAPA_CONTACTO:
        raise HTTPException(400, "etapa inválida")
    if "temperatura" in patch and patch["temperatura"] not in TEMP_CONTACTO:
        raise HTTPException(400, "temperatura inválida")
    if "phones" in patch:
        patch["phones_norm"] = [_norm_phone(p) for p in patch["phones"]]
    old_c = await db.asesor_contactos.find_one({"id": cid, "owner_id": user.user_id}, {"_id": 0})
    res = await db.asesor_contactos.update_one({"id": cid, "owner_id": user.user_id}, {"$set": patch})
    if not res.matched_count: raise HTTPException(404, "No encontrado")
    c = await db.asesor_contactos.find_one({"id": cid}, {"_id": 0})
    # F0.1 — Audit log
    try:
        from audit_log import log_mutation
        await log_mutation(db, user, "update", "contacto", cid, before=old_c, after=c, request=request)
    except Exception: pass
    return c


@router.delete("/contactos/{cid}")
async def delete_contacto(cid: str, request: Request):
    user = await require_advisor(request)
    db = get_db(request)
    old_c = await db.asesor_contactos.find_one({"id": cid, "owner_id": user.user_id}, {"_id": 0})
    r = await db.asesor_contactos.update_one({"id": cid, "owner_id": user.user_id}, {"$set": {"deleted_at": _now()}})
    # F0.1 — Audit log
    try:
        from audit_log import log_mutation
        await log_mutation(db, user, "delete", "contacto", cid, before=old_c, after=None, request=request)
    except Exception: pass
    return {"ok": bool(r.matched_count)}


@router.post("/contactos/{cid}/timeline")
async def add_timeline(cid: str, payload: TimelineIn, request: Request):
    user = await require_advisor(request)
    db = get_db(request)
    if not await db.asesor_contactos.find_one({"id": cid, "owner_id": user.user_id}):
        raise HTTPException(404, "Contacto no encontrado")
    entry = {
        "id": _uid("tl"),
        "contacto_id": cid,
        "owner_id": user.user_id,
        "kind": payload.kind,
        "body": payload.body,
        "ts": _now(),
    }
    await db.asesor_contacto_timeline.insert_one(dict(entry))
    entry.pop("_id", None)
    return entry


# ─── B5.1 · Tablero de propiedades por lead (Tab Propiedades del perfil-hub) ─────
# Estatus de cada propiedad para un lead, en columnas arrastrables. Aislamiento por
# owner_id. Es la BASE donde el link Tinder (B5.2) escribirá los swipes del cliente
# (👍 → "gusto", 👎 → "descartada"). El asesor mueve arrastrando o desde las coincidencias.

@router.get("/contactos/{cid}/board")
async def get_lead_board(cid: str, request: Request):
    """Tablero de propiedades del lead: items con estatus + resumen de engagement.
    Aislamiento owner_id. Vacío (sin error) si el lead aún no tiene propiedades."""
    user = await require_advisor(request)
    db = get_db(request)
    if not await db.asesor_contactos.find_one({"id": cid, "owner_id": user.user_id}, {"_id": 0, "id": 1}):
        raise HTTPException(404, "No encontrado")
    items = await db.asesor_lead_properties.find(
        {"owner_id": user.user_id, "contacto_id": cid}, {"_id": 0}
    ).sort("updated_at", -1).to_list(200)
    for it in items:  # normaliza estatus viejos (dispo/gusto → nuevos)
        it["status"] = BOARD_STATUS_ALIAS.get(it.get("status"), it.get("status"))
    # B5.4 Capa 3 · perfil de gusto (eventos + cuartos + swipes) · FAIL-OPEN. Va ANTES del match
    # porque la Capa 4 lo usa para el gusto visual aprendido.
    taste = None
    try:
        from taste_profile import build_taste_profile, taste_summary_line
        taste = await build_taste_profile(db, user.user_id, cid)
        taste["summary"] = taste_summary_line(taste)
    except Exception:
        taste = None
    # B5.4 Capa 5 · brief de venta (la acción #1 según la etapa del pipeline) · FAIL-OPEN.
    brief = None
    try:
        from taste_profile import build_brief
        brief = build_brief(items, taste)
    except Exception:
        brief = None
    # B5.3+B5.4 · match explicable por item (zona/precio/cuestionario + gusto visual) · FAIL-OPEN.
    try:
        from lead_match import aggregate_signals, match_for
        from data_developments import DEVELOPMENTS_BY_ID as _MDEVS
        _sig = aggregate_signals(items)
        _prof = await db.asesor_swipe_profiles.find_one({"owner_id": user.user_id, "contacto_id": cid}, {"_id": 0})
        # tags de fotos por dev (para el gusto visual de la Capa 4)
        _devids = list({it.get("dev_id") for it in items if it.get("dev_id")})
        _tags_by = {}
        if _devids:
            async for _t in db.asesor_photo_tags.find({"dev_id": {"$in": _devids}}, {"_id": 0}):
                _tags_by.setdefault(_t.get("dev_id"), []).append(_t)
        for it in items:
            dev = _MDEVS.get(it.get("dev_id")) or {}
            if dev:
                try:
                    it["match"] = match_for(_prof, _sig, dev, listed_price=it.get("price"),
                                            taste=taste, dev_tags=_tags_by.get(it.get("dev_id")))
                except Exception:
                    pass
    except Exception:
        pass
    # B5.2-D · AVM (oferta-backing): solo para items en "oferta" · FAIL-OPEN.
    oferta_items = [it for it in items if it.get("status") == "oferta" and not it.get("avm")]
    if oferta_items:
        try:
            from avm_public_engine import avm_quick_async
            from data_developments import DEVELOPMENTS_BY_ID as _DEVS
            for it in oferta_items:
                dev = _DEVS.get(it.get("dev_id")) or {}
                col = dev.get("colonia_id") or dev.get("colonia")
                if not col:
                    continue
                m2 = (dev.get("m2_range") or [90])[0]
                rec = (dev.get("bedrooms_range") or [2])[0]
                ban = (dev.get("bathrooms_range") or [2])[0]
                try:
                    avm = await avm_quick_async(db, col, float(m2), int(rec), int(ban), 5)
                    est = (avm or {}).get("precio_estimado")
                    if est and not (avm or {}).get("error"):
                        listado = it.get("price") or est
                        it["avm"] = {"estimado": int(est),
                                     "sugerido": int(round(min(est, listado) * 0.97)),
                                     "arriba": bool(listado and listado > est * 1.02)}
                except Exception:
                    pass
        except Exception:
            pass
    up = sum(1 for it in items if it.get("thumb") == "up")
    down = sum(1 for it in items if it.get("thumb") == "down")
    views = sum(int(it.get("views") or 0) for it in items)
    return {"items": items, "statuses": BOARD_STATUS,
            "engagement": {"views": views, "up": up, "down": down},
            "taste": taste, "brief": brief}


@router.post("/contactos/{cid}/board")
async def add_lead_board_item(cid: str, payload: BoardItemIn, request: Request):
    """Agrega una propiedad al tablero del lead (default columna 'por_verificar'). Si la
    propiedad (dev_id) ya está en el tablero del lead, solo actualiza su estatus.
    Acepta alias legacy (dispo→por_verificar, gusto→le_gusto)."""
    user = await require_advisor(request)
    db = get_db(request)
    if not await db.asesor_contactos.find_one({"id": cid, "owner_id": user.user_id}, {"_id": 0, "id": 1}):
        raise HTTPException(404, "No encontrado")
    payload.status = BOARD_STATUS_ALIAS.get(payload.status, payload.status)
    if payload.status not in BOARD_STATUS:
        raise HTTPException(400, "status inválido")
    existing = await db.asesor_lead_properties.find_one(
        {"owner_id": user.user_id, "contacto_id": cid, "dev_id": payload.dev_id}, {"_id": 0})
    if existing:
        await db.asesor_lead_properties.update_one(
            {"id": existing["id"]}, {"$set": {"status": payload.status, "updated_at": _now()}})
        existing.update({"status": payload.status, "updated_at": _now()})
        return existing
    item = {
        "id": _uid("lprop"),
        "owner_id": user.user_id,
        "contacto_id": cid,
        "created_at": _now(),
        "updated_at": _now(),
        "thumb": None,
        "views": 0,
        "source": "manual",
        **payload.model_dump(),
    }
    await db.asesor_lead_properties.insert_one(dict(item))
    item.pop("_id", None)
    return item


@router.patch("/board/{item_id}")
async def patch_lead_board_item(item_id: str, payload: BoardItemPatch, request: Request):
    """Mueve la propiedad de columna (status) o edita la nota. Es el endpoint del
    arrastrar-y-soltar del tablero. Aislamiento owner_id."""
    user = await require_advisor(request)
    db = get_db(request)
    patch = {k: v for k, v in payload.model_dump().items() if v is not None}
    if "status" in patch and patch["status"] not in BOARD_STATUS:
        raise HTTPException(400, "status inválido")
    if not patch:
        raise HTTPException(400, "Nada que actualizar")
    patch["updated_at"] = _now()
    res = await db.asesor_lead_properties.update_one(
        {"id": item_id, "owner_id": user.user_id}, {"$set": patch})
    if not res.matched_count:
        raise HTTPException(404, "No encontrado")
    return await db.asesor_lead_properties.find_one({"id": item_id}, {"_id": 0})


@router.delete("/board/{item_id}")
async def delete_lead_board_item(item_id: str, request: Request):
    """Quita una propiedad del tablero del lead. Aislamiento owner_id."""
    user = await require_advisor(request)
    db = get_db(request)
    res = await db.asesor_lead_properties.delete_one({"id": item_id, "owner_id": user.user_id})
    if not res.deleted_count:
        raise HTTPException(404, "No encontrado")
    return {"ok": True}


@router.get("/contactos/{cid}/suggestions")
async def lead_suggestions(cid: str, request: Request):
    """B5.3 · Recomendador — inventario rankeado por match para ESTE lead.

    El asesor abre "+ Agregar propiedad" y, en vez de ver el catálogo crudo, lo ve
    ORDENADO por lo que le encaja al cliente (mismo motor explicable que las tarjetas).
    Excluye lo que ya está en el tablero. Top-N con su % + la razón #1 (1 toque = agregar).
    """
    user = await require_advisor(request)
    db = get_db(request)
    c = await db.asesor_contactos.find_one(
        {"id": cid, "owner_id": user.user_id}, {"_id": 0, "id": 1})
    if not c:
        raise HTTPException(404, "Contacto no encontrado")
    items = await db.asesor_lead_properties.find(
        {"owner_id": user.user_id, "contacto_id": cid}, {"_id": 0}).to_list(300)
    on_board = {it.get("dev_id") for it in items if it.get("dev_id")}
    out = []
    try:
        from lead_match import aggregate_signals, match_for
        from data_developments import DEVELOPMENTS
        sig = aggregate_signals(items)
        prof = await db.asesor_swipe_profiles.find_one(
            {"owner_id": user.user_id, "contacto_id": cid}, {"_id": 0})
        # B5.4 · perfil de gusto + tags de fotos del catálogo (para el gusto visual aprendido)
        taste = None
        try:
            from taste_profile import build_taste_profile
            taste = await build_taste_profile(db, user.user_id, cid, persist=False)
        except Exception:
            taste = None
        tags_by = {}
        try:
            from photo_tagger import tag_from_url
            for _d in DEVELOPMENTS:
                tags_by[_d.get("id")] = [tag_from_url(u) for u in (_d.get("photos") or [])[:6]]
        except Exception:
            pass
        for d in DEVELOPMENTS:
            if d.get("id") in on_board:
                continue
            try:
                m = match_for(prof, sig, d, listed_price=d.get("price_from"),
                              taste=taste, dev_tags=tags_by.get(d.get("id")))
            except Exception:
                continue
            out.append({
                "id": d.get("id"), "name": d.get("name"), "colonia": d.get("colonia"),
                "price_from": d.get("price_from"),
                "photo": (d.get("photos") or [None])[0],
                "match": m,
            })
        out.sort(key=lambda x: x["match"]["score"], reverse=True)
    except Exception:
        out = []
    return {"items": out[:24], "has_signals": bool(out and (
        (items and any(it.get("status") in ("le_gusto", "cita", "visitada", "oferta", "descartada") for it in items))))}


@router.get("/intel/prospects")
async def prospect_intel(request: Request):
    """B5.4 Capa 6 · El NORTE — inteligencia agregada de TODOS los prospectos del asesor.
    'El 70% se clava en las cocinas', 'preventa rechazada por el 40%', 'Altavista convierte 60%'.
    Read-time sobre los perfiles de gusto + tableros del owner. FAIL-OPEN."""
    user = await require_advisor(request)
    db = get_db(request)
    try:
        from taste_profile import build_prospect_intel
        return await build_prospect_intel(db, user.user_id)
    except Exception:
        return {"signal_leads": 0, "top_rooms": [], "top_features": [],
                "by_development": [], "reject_reasons": [], "totals": {"likes": 0, "dislikes": 0}, "insights": []}


class WAMessageIn(BaseModel):
    text: str
    channel: Optional[str] = "whatsapp"  # omnicanal · whatsapp | messenger | instagram
    from_suggestion: Optional[str] = None  # CIERRE #1 · tipo de sugerencia del Copiloto que originó el envío


# CIERRE #3 · rate-limit del copiloto-ask (anti-abuso/costo IA) · en memoria · 15/min/asesor
_copilot_ask_buckets: dict = {}


def _check_copilot_rate(user_id: str, limit: int = 15, window_s: int = 60) -> bool:
    import time as _t
    now = _t.monotonic()
    b = [x for x in _copilot_ask_buckets.get(user_id, []) if now - x < window_s]
    if len(b) >= limit:
        _copilot_ask_buckets[user_id] = b
        return False
    b.append(now)
    _copilot_ask_buckets[user_id] = b
    return True


# Canales de mensajería directa que viven en whatsapp_messages (omnicanal · del registro central)
try:
    from conversation_channels.registry import DM_CHANNEL_KEYS as DM_CHANNELS
except Exception:
    DM_CHANNELS = ["whatsapp", "messenger", "instagram", "linkedin", "tiktok", "youtube"]


def _channel_q(channel: str) -> dict:
    """Filtro por canal · whatsapp incluye docs viejos sin campo channel (back-compat)."""
    if channel == "whatsapp":
        return {"$or": [{"channel": "whatsapp"}, {"channel": {"$exists": False}}, {"channel": None}]}
    return {"channel": channel}


@router.get("/contactos/{cid}/whatsapp")
async def lead_whatsapp_thread(cid: str, request: Request, channel: str = "whatsapp"):
    """B5.5 + omnicanal · Hilo de mensajería con ESTE lead por canal (aislado por asesor).
    whatsapp_messages es el store de DMs (WhatsApp/Messenger/Instagram) keyeado org_id+lead_id."""
    user = await require_advisor(request)
    db = get_db(request)
    c = await db.asesor_contactos.find_one(
        {"id": cid, "owner_id": user.user_id}, {"_id": 0, "id": 1, "first_name": 1, "phones": 1})
    if not c:
        raise HTTPException(404, "Contacto no encontrado")
    ch = (channel or "whatsapp").lower()
    q = {"org_id": user.user_id, "lead_id": cid, **_channel_q(ch)}
    msgs = await db.whatsapp_messages.find(q).sort("created_at", 1).to_list(500)
    out = [{"id": str(m.get("_id")), "direction": m.get("direction"), "text": m.get("body_text"),
            "status": m.get("status"), "ts": (m.get("created_at") or m.get("sent_at"))} for m in msgs]
    phone = (c.get("phones") or [None])[0]
    # WhatsApp necesita teléfono; Messenger/Instagram se contestan sobre el hilo entrante.
    ready = bool(phone) if ch == "whatsapp" else True
    return {"messages": out, "phone": phone, "ready": ready, "channel": ch}


@router.post("/contactos/{cid}/whatsapp")
async def lead_whatsapp_send(cid: str, body: WAMessageIn, request: Request):
    """B5.5 + omnicanal · Envía al lead por el canal indicado. WhatsApp → WAEngine;
    Messenger/Instagram → adaptador (stub-aware) + persiste en el mismo store. Aislado por asesor."""
    user = await require_advisor(request)
    db = get_db(request)
    c = await db.asesor_contactos.find_one(
        {"id": cid, "owner_id": user.user_id}, {"_id": 0, "first_name": 1, "phones": 1})
    if not c:
        raise HTTPException(404, "Contacto no encontrado")
    text = (body.text or "").strip()
    if not text:
        raise HTTPException(400, "Mensaje vacío")
    ch = (body.channel or "whatsapp").lower()
    if ch not in DM_CHANNELS:
        raise HTTPException(400, "Canal inválido")
    now = datetime.now(timezone.utc)
    if ch == "whatsapp":
        phone = (c.get("phones") or [None])[0]
        if not phone:
            raise HTTPException(400, "El contacto no tiene teléfono")
        try:
            from whatsapp_engine import WAEngine
            eng = WAEngine(db, org_id=user.user_id)
            res = await eng.send_message(to_number=phone, body=text, lead_id=cid)
            msg_id, status = res.get("msg_id"), res.get("status")
        except Exception:
            raise HTTPException(500, "No se pudo enviar el mensaje")
    else:
        # Messenger / Instagram · adaptador stub-aware + persiste con su canal
        try:
            from conversation_channels import get_adapter
            res = await get_adapter(ch)(db, {"lead_id": cid}, text)
        except Exception:
            res = {"delivered": False, "stub": True}
        msg_id = "msg_" + uuid.uuid4().hex[:12]
        status = "sent" if res.get("delivered") else "queued"
        try:
            await db.whatsapp_messages.insert_one({
                "_id": msg_id, "org_id": user.user_id, "lead_id": cid, "channel": ch,
                "direction": "outbound", "provider": ch, "body_text": text, "status": status,
                "created_at": now, "sent_at": now, "conversation_thread_id": f"{ch}_{cid}"})
        except Exception:
            pass
    try:
        await db.asesor_contacto_timeline.insert_one({
            "id": "tl_" + uuid.uuid4().hex[:10], "contacto_id": cid, "owner_id": user.user_id,
            "kind": f"{ch}_out", "body": f"Mensaje {ch} enviado: {text[:120]}", "ts": now})
    except Exception:
        pass
    # CIERRE #2 + #3 · la acción alimenta al lead (last_contact + calienta) y queda auditada
    try:
        from copilot_events import touch_lead_on_action, log_event
        await touch_lead_on_action(db, user.user_id, cid, warm=True)
        await log_event(db, user.user_id, cid, "mensaje_enviado", channel=ch, text=text, outcome="sent",
                        suggestion_type=getattr(body, "from_suggestion", None))
    except Exception:
        pass
    return {"ok": True, "msg_id": msg_id, "status": status, "channel": ch}


@router.post("/contactos/{cid}/whatsapp/draft")
async def lead_whatsapp_draft(cid: str, request: Request):
    """B5.5 Upgrade A · El mensaje se escribe solo desde el modelo de gusto + brief.
    Redacta un WhatsApp personalizado ("te separé 3 con cocina amplia y luz como te late").
    El asesor lo revisa/edita antes de enviar. FAIL-OPEN a plantilla si el LLM no responde."""
    user = await require_advisor(request)
    db = get_db(request)
    c = await db.asesor_contactos.find_one(
        {"id": cid, "owner_id": user.user_id}, {"_id": 0, "first_name": 1})
    if not c:
        raise HTTPException(404, "Contacto no encontrado")
    nombre = c.get("first_name") or ""
    items = await db.asesor_lead_properties.find(
        {"owner_id": user.user_id, "contacto_id": cid}, {"_id": 0}).to_list(300)
    _ALIAS = {"dispo": "por_verificar", "gusto": "le_gusto"}
    _POS = {"le_gusto", "cita", "visitada", "oferta"}
    liked = [it.get("name") for it in items if _ALIAS.get(it.get("status"), it.get("status")) in _POS and it.get("name")][:3]

    summary, nextstep = "", ""
    try:
        from taste_profile import build_taste_profile, taste_summary_line, build_brief
        _t = await build_taste_profile(db, user.user_id, cid)
        _t["summary"] = taste_summary_line(_t)
        summary = _t.get("summary") or ""
        nextstep = (build_brief(items, _t) or {}).get("next_step", {}).get("text", "")
    except Exception:
        pass

    props_txt = (", ".join(liked)) if liked else "algunas opciones nuevas"
    prompt = f"""Eres un asesor inmobiliario mexicano escribiendo un WhatsApp corto y cálido (es-MX) a un cliente.

Cliente: {nombre}
Lo que le importa (de su comportamiento real): {summary or 'aún lo estamos conociendo'}
Propiedades que le interesaron: {props_txt}
Siguiente paso recomendado: {nextstep or 'proponer ver opciones'}

Escribe UN mensaje de WhatsApp (máximo 60 palabras, 1 emoji sutil máximo, NADA de marketing vacío).
Menciona de forma natural lo que le gusta (si lo sabemos) y propón el siguiente paso con una pregunta clara.
Tono de un asesor real que ya lo conoce, no plantilla. Solo el mensaje, sin comillas."""

    text = None
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(api_key=os.environ.get("EMERGENT_LLM_KEY"), session_id=f"wadraft_{cid}",
                       system_message="Eres un asesor inmobiliario mexicano cercano y eficaz.")
        chat.with_model("anthropic", "claude-sonnet-4-5-20250929")
        text = (await chat.send_message(UserMessage(text=prompt))).strip().strip('"')
    except Exception:
        text = None
    if not text:
        base = f"Hola {nombre}! "
        if liked:
            base += f"Te aparté {props_txt} que te latieron. "
        elif summary:
            base += f"Tengo opciones que van con lo que buscas ({summary}). "
        base += "¿Te late que agendemos para verlas esta semana? 🙌"
        text = base
    return {"text": text, "used": {"taste": summary, "next_step": nextstep, "properties": liked}}


@router.post("/contactos/{cid}/whatsapp/inbound")
async def lead_whatsapp_inbound(cid: str, body: WAMessageIn, request: Request):
    """B5.5 Upgrade B · Lo que el cliente responde, el modelo lo aprende.
    Registra el mensaje del cliente en el hilo + extrae preferencias (cuarto/feature/
    polaridad) → las suma a su perfil de gusto + avisa qué aprendió. Funciona hoy (el
    asesor pega lo que le dijeron); el webhook real lo llamará igual cuando haya provider."""
    user = await require_advisor(request)
    db = get_db(request)
    if not await db.asesor_contactos.find_one({"id": cid, "owner_id": user.user_id}, {"_id": 0, "id": 1}):
        raise HTTPException(404, "Contacto no encontrado")
    text = (body.text or "").strip()
    if not text:
        raise HTTPException(400, "Mensaje vacío")
    now = datetime.now(timezone.utc)
    # 1) registrar el mensaje entrante en el hilo
    try:
        await db.whatsapp_messages.insert_one({
            "_id": "wa_" + uuid.uuid4().hex[:14], "org_id": user.user_id, "lead_id": cid,
            "direction": "inbound", "provider": "manual", "body_text": text,
            "status": "received", "created_at": now, "sent_at": now,
            "conversation_thread_id": cid})
    except Exception:
        pass
    # 2) extraer preferencias + 3) persistir como señales que alimentan el gusto
    learned, sentiment = [], "neutral"
    try:
        from taste_profile import extract_text_signals
        ex = extract_text_signals(text)
        learned, sentiment = ex.get("signals", []), ex.get("sentiment", "neutral")
        if learned:
            await db.asesor_text_signals.insert_one({
                "id": "txt_" + uuid.uuid4().hex[:10], "owner_id": user.user_id, "contacto_id": cid,
                "text": text[:400], "signals": learned, "sentiment": sentiment, "ts": now})
    except Exception:
        pass
    # E2.2 · auto-extract del perfil de compra (forma de pago / plazo) → pre-llena la
    # búsqueda SOLO en campos vacíos (no pisa lo que el asesor fijó). FAIL-OPEN.
    prof_set: dict = {}
    try:
        from taste_profile import extract_buyer_profile
        prof = extract_buyer_profile(text)
        if prof:
            bq = await db.asesor_busquedas.find_one(
                {"contacto_id": cid, "owner_id": user.user_id}, sort=[("created_at", -1)])
            patch = {k: prof[k] for k in ("forma_pago", "credito_tipo", "plazo_compra")
                     if prof.get(k) and not (bq or {}).get(k)}
            if patch:
                if bq:
                    await db.asesor_busquedas.update_one({"id": bq["id"]}, {"$set": patch})
                else:
                    await db.asesor_busquedas.insert_one({
                        "id": _uid("busqueda"), "contacto_id": cid, "owner_id": user.user_id,
                        "created_at": _now(), "fuente": "whatsapp", **patch})
                prof_set = patch
                try:
                    from services.lead_activity import record_activity
                    parts = []
                    if patch.get("forma_pago"):
                        parts.append("forma de pago: " + patch["forma_pago"] + (f" ({patch['credito_tipo']})" if patch.get("credito_tipo") else ""))
                    if patch.get("plazo_compra"):
                        parts.append("plazo: " + patch["plazo_compra"])
                    await record_activity(db, user.user_id, cid, "perfil",
                                          title="IA detectó del chat", body=" · ".join(parts), source="whatsapp")
                except Exception:
                    pass
    except Exception:
        pass

    # nudge en lenguaje llano (gusto + perfil detectado)
    nudge_bits = []
    if learned:
        bits = []
        for s in learned[:3]:
            tag = "le importa" if s["polarity"] in ("pos", "wants") else "le molesta" if s["polarity"] == "neg" else "mencionó"
            bits.append(f"{tag} {s['label']}")
        nudge_bits.append("gusto → " + " · ".join(bits))
    if prof_set:
        pp = []
        if prof_set.get("forma_pago"):
            pp.append("forma de pago")
        if prof_set.get("plazo_compra"):
            pp.append("plazo")
        nudge_bits.append("perfil → " + " y ".join(pp))
    nudge = ("Aprendí del chat: " + " · ".join(nudge_bits) + ". Ya lo sumé a su ficha.") if nudge_bits else ""
    try:
        await db.asesor_contacto_timeline.insert_one({
            "id": "tl_" + uuid.uuid4().hex[:10], "contacto_id": cid, "owner_id": user.user_id,
            "kind": "whatsapp_in", "body": f"Cliente respondió: {text[:120]}", "ts": now})
    except Exception:
        pass
    return {"ok": True, "learned": learned, "sentiment": sentiment, "profile": prof_set, "nudge": nudge}


@router.get("/conversations/unified")
async def unified_inbox(request: Request, channel: str = "", q: str = ""):
    """B6 · Bandeja global UNIFICADA — hilos de WhatsApp (B5.5) + chats IA en una sola
    lista, con NOMBRE del lead + canal + qué urge responder. Aislado por asesor
    (WhatsApp org_id=user_id · IA asesor_id=user_id). FAIL-OPEN por canal."""
    user = await require_advisor(request)
    db = get_db(request)
    out = []
    meta_by = {}
    async for c in db.asesor_contactos.find(
            {"owner_id": user.user_id}, {"_id": 0, "id": 1, "first_name": 1, "last_name": 1, "temperatura": 1}):
        meta_by[c["id"]] = {"name": f"{c.get('first_name', '')} {c.get('last_name', '')}".strip(),
                            "temp": c.get("temperatura")}

    # 1) Hilos de mensajería directa (omnicanal: WhatsApp/Messenger/Instagram) · agrupados por (lead, canal)
    if channel == "" or channel in DM_CHANNELS:
        try:
            pipe = [
                {"$match": {"org_id": user.user_id}},
                {"$sort": {"created_at": 1}},
                {"$group": {"_id": {"lead": "$lead_id", "ch": {"$ifNull": ["$channel", "whatsapp"]}},
                            "count": {"$sum": 1}, "last": {"$last": "$body_text"},
                            "last_dir": {"$last": "$direction"}, "last_ts": {"$last": "$created_at"}}},
            ]
            for t in await db.whatsapp_messages.aggregate(pipe).to_list(800):
                cid = (t.get("_id") or {}).get("lead")
                ch = (t.get("_id") or {}).get("ch") or "whatsapp"
                if channel and ch != channel:
                    continue
                out.append({
                    "conversation_id": f"{ch}_{cid}", "channel": ch,
                    "lead_id": cid, "lead_name": (meta_by.get(cid) or {}).get("name") or ch.capitalize(),
                    "temperatura": (meta_by.get(cid) or {}).get("temp"),
                    "message_count": t.get("count", 0), "last_message": (t.get("last") or "")[:90],
                    "last_ts": t.get("last_ts"), "needs_reply": t.get("last_dir") == "inbound",
                    "status": "active", "sentiment": "neutral",
                })
        except Exception:
            pass

    # 2) Chats IA (reusa el motor de conversación · scope al asesor)
    if channel in ("", "ai"):
        try:
            from conversation_engine import ConversationEngine
            eng = ConversationEngine(db)
            ai = await eng.superadmin_list(asesor_id=user.user_id, limit=100,
                                           caller_tenant_id=None, is_superadmin=False)
            for conv in ai:
                lid = conv.get("lead_id")
                conv["channel"] = conv.get("channel") or "ai"
                conv["lead_name"] = (meta_by.get(lid) or {}).get("name") or lid or "Chat IA"
                conv["temperatura"] = (meta_by.get(lid) or {}).get("temp")
                conv["needs_reply"] = conv.get("status") in ("handoff", "taken_over")
                conv["last_ts"] = conv.get("last_message_at") or conv.get("updated_at")
                out.append(conv)
        except Exception:
            pass

    # 3) Filtro de texto
    if q:
        ql = q.lower()
        out = [c for c in out if ql in (str(c.get("lead_name", "")) + " " + str(c.get("last_message") or "")).lower()]

    # 4) Prioridad: lo que urge responder arriba (sin responder + negativo + reciente)
    def _ts_key(c):
        v = c.get("last_ts")
        try:
            return v.isoformat() if hasattr(v, "isoformat") else str(v or "")
        except Exception:
            return ""

    def _prio(c):
        s = 0
        if c.get("needs_reply"):
            s += 100
        if c.get("sentiment") == "negative":
            s += 50
        return s

    out.sort(key=lambda c: (_prio(c), _ts_key(c)), reverse=True)
    # B7+ · métricas/estados para los filtros clickeables (cada chip = contador + filtro)
    _HOT = {"hot", "caliente"}
    def _ch(c):
        return c.get("channel") or "ai"
    stats = {
        "total": len(out),
        "sin_responder": sum(1 for c in out if c.get("needs_reply")),
        "atencion": sum(1 for c in out if c.get("sentiment") == "negative"),
        "calientes": sum(1 for c in out if str(c.get("temperatura") or "").lower() in _HOT),
        "ia": sum(1 for c in out if _ch(c) in ("ai", "web")),
    }
    # conteo por canal de mensajería (data-driven desde el registro)
    for ck in DM_CHANNELS:
        stats[ck] = sum(1 for c in out if _ch(c) == ck)
    return {"conversations": out, "count": len(out), "stats": stats}


class AtlaxToggleIn(BaseModel):
    channel: str
    auto: bool


@router.get("/atlax-settings")
async def get_atlax_settings(request: Request):
    """Por asesor: en qué canales Atlax contesta en automático. {whatsapp: true, ...}"""
    user = await require_advisor(request)
    db = get_db(request)
    doc = await db.asesor_atlax_settings.find_one({"owner_id": user.user_id}, {"_id": 0, "channels": 1})
    return {"channels": (doc or {}).get("channels", {})}


@router.post("/atlax-settings")
async def set_atlax_settings(body: AtlaxToggleIn, request: Request):
    """Prender/apagar el piloto de Atlax para un canal (founder: cómo activo Atlax).
    Guarda la intención · cuando el canal esté conectado, Atlax contesta solo si está en Auto."""
    user = await require_advisor(request)
    db = get_db(request)
    ch = (body.channel or "").lower()
    await db.asesor_atlax_settings.update_one(
        {"owner_id": user.user_id},
        {"$set": {f"channels.{ch}": bool(body.auto), "owner_id": user.user_id, "updated_at": datetime.now(timezone.utc)}},
        upsert=True)
    # ¿está conectado ese canal? (para decirle al asesor si ya contesta o solo queda listo)
    connected = False
    try:
        from conversation_channels.registry import public_channels
        connected = next((c["connected"] for c in public_channels() if c["key"] == ch), False)
    except Exception:
        pass
    return {"ok": True, "channel": ch, "auto": bool(body.auto), "connected": connected}


@router.get("/channels")
async def list_channels(request: Request):
    """Omnicanal · registro de canales + estado de conexión + si el asesor ya pidió conectarlo
    (para los chips de la bandeja y la pantalla 'Conectar canales')."""
    user = await require_advisor(request)
    db = get_db(request)
    try:
        from conversation_channels.registry import public_channels
        chans = public_channels()
    except Exception:
        chans = []
    try:
        reqs = await db.asesor_channel_requests.find(
            {"owner_id": user.user_id}, {"_id": 0, "channel": 1, "status": 1, "requested_at": 1}).to_list(50)
        by = {r["channel"]: r for r in reqs}
        for c in chans:
            r = by.get(c["key"])
            c["requested"] = bool(r) and not c.get("connected")
            c["requested_at"] = (r or {}).get("requested_at")
    except Exception:
        pass
    return {"channels": chans}


class ChannelConnectIn(BaseModel):
    note: Optional[str] = ""


@router.post("/channels/{key}/connect-request")
async def request_channel_connect(key: str, payload: ChannelConnectIn, request: Request):
    """Registra la intención del asesor de conectar este canal. Atlax responderá ahí en cuanto
    se active el proveedor (Meta/etc). Aún no hace OAuth — deja la solicitud lista para activación."""
    user = await require_advisor(request)
    db = get_db(request)
    from conversation_channels.registry import DM_CHANNEL_KEYS
    if key not in DM_CHANNEL_KEYS:
        raise HTTPException(400, "Canal no válido")
    existing = await db.asesor_channel_requests.find_one(
        {"owner_id": user.user_id, "channel": key}, {"_id": 0})
    if existing:
        return {"ok": True, "channel": key, "status": existing.get("status", "requested"), "already": True}
    doc = {"id": _uid("chreq"), "owner_id": user.user_id, "channel": key,
           "status": "requested", "note": (payload.note or "")[:300], "requested_at": _now()}
    await db.asesor_channel_requests.insert_one(dict(doc))
    return {"ok": True, "channel": key, "status": "requested", "already": False}


# Objeciones comunes del cliente → cómo manejarla (suggestion) + qué decirle (script listo).
_OBJECIONES = [
    ("precio", ["caro", "carisimo", "carísimo", "muy alto", "presupuesto", "no me alcanza", "elevado", "fuera de mi", "mas barato", "más barato", "descuento", "rebaja", "bajar el precio"],
     "Precio / presupuesto", "Reconoce el presupuesto y reencuadra en valor: plusvalía, ubicación y costo por m². Ofrece opciones dentro de su rango.",
     "Te entiendo, el precio importa. Más que el número, mira el costo por m² y la plusvalía de la zona — tengo un par de opciones dentro de tu rango. ¿Te las comparto?"),
    ("ubicacion", ["lejos", "retirado", "no me queda", "trafico", "tráfico", "lejano", "muy lejos"],
     "Ubicación", "Conecta la zona con su día a día: tiempos reales a trabajo/escuela y servicios cerca. Propón colonias que sí le acomoden.",
     "Buen punto. ¿A qué lugares necesitas llegar seguido? Así te muestro opciones con buenos tiempos reales, no solo por la colonia."),
    ("financiamiento", ["credito", "crédito", "hipoteca", "infonavit", "enganche", "mensualidad", "financi", "banco", "cuanto pagaria", "cuánto pagaría"],
     "Financiamiento", "Aterriza los números: enganche, mensualidad estimada y opciones de crédito. Ofrécele una simulación rápida.",
     "Va, aterricémoslo: con tu enganche estimado la mensualidad quedaría manejable. ¿Te hago una simulación rápida para que lo veas claro?"),
    ("tiempo", ["lo pienso", "pensarlo", "despues", "después", "mas adelante", "más adelante", "no es momento", "ocupado", "luego", "tiempo"],
     "No es el momento", "No presiones: ofrece un paso pequeño (una visita o más info) y agenda un recordatorio para retomar.",
     "Sin prisa, cuando estés listo seguimos. ¿Te parece si te mando 1-2 opciones para que las tengas en el radar y retomamos la próxima semana?"),
    ("competencia", ["otra opcion", "otra opción", "otro asesor", "otra inmobiliaria", "vi otro", "comparando", "otra propiedad"],
     "Está comparando", "Diferénciate: resalta lo único de tu propiedad/servicio y pregunta qué está comparando para responder con datos.",
     "¡Qué bueno que estás comparando! ¿Qué viste que te gustó? Así te digo con datos en qué se diferencia lo que te propongo."),
    ("duda", ["no se", "no sé", "no estoy seguro", "dudo", "convencido", "inseguro", "no estoy convencido"],
     "Tiene dudas", "Haz una pregunta abierta para descubrir la duda real y responde con un caso de éxito parecido.",
     "Cuéntame qué te genera duda y lo resolvemos juntos. Tengo un caso parecido al tuyo que te puede servir de referencia."),
]


def _detect_objection(text: str):
    """Detecta la objeción más probable en el mensaje del cliente y sugiere cómo manejarla."""
    t = (text or "").lower()
    if not t:
        return None
    for key, kws, label, suggestion, script in _OBJECIONES:
        if any(k in t for k in kws):
            return {"type": key, "label": label, "suggestion": suggestion, "script": script}
    return None


def _build_coaching(objecion, animo, nombre):
    """Coaching del Copiloto (no solo propiedades): QUÉ decirle (guion listo) + CÓMO tratarlo
    (tono según ánimo). Heurístico · FAIL-OPEN. El asesor lo edita antes de enviar."""
    nom = nombre or ""
    # CÓMO tratarlo · tono según el ánimo detectado
    sent = (animo or {}).get("sentiment", "neutral")
    if sent == "negativo":
        como = {"label": "Baja el ritmo", "tip": "Valida primero su preocupación; no propongas hasta que se sienta escuchado."}
    elif sent == "positivo":
        como = {"label": "Está receptivo", "tip": "Aprovecha el momento: propón el siguiente paso concreto (visita o cierre) ya."}
    else:
        como = {"label": "Descubre qué le mueve", "tip": "Haz una pregunta abierta para entender su prioridad real antes de proponer."}
    # QUÉ decirle · guion listo (de la objeción si existe; si no, abrir conversación)
    if objecion and objecion.get("script"):
        que = {"script": objecion["script"], "rationale": f"Maneja la objeción: {objecion['label']}"}
    else:
        saludo = f"Hola {nom}! " if nom else "Hola! "
        que = {"script": f"{saludo}¿Qué te pareció lo último que vimos? Si me dices qué te late y qué no, te afino las opciones a tu medida.",
               "rationale": "Mantén la conversación viva y aprende su gusto."}
    return {"que_decirle": que, "como_tratarlo": como}


@router.get("/contactos/{cid}/conversation-ai")
async def conversation_ai(cid: str, request: Request, channel: str = "whatsapp"):
    """Pieza 1 · IA EN VIVO en la conversación (rescate): ánimo del cliente (del último
    mensaje entrante) + recomendación de propiedad (top match no-en-tablero). La sugerencia
    de respuesta la da el botón 'Redactar con IA' (draft). FAIL-OPEN."""
    user = await require_advisor(request)
    db = get_db(request)
    if not await db.asesor_contactos.find_one({"id": cid, "owner_id": user.user_id}, {"_id": 0, "id": 1}):
        raise HTTPException(404, "Contacto no encontrado")
    # Ánimo + objeción: del último mensaje ENTRANTE del hilo (reusa el extractor de B5.5.3).
    animo = None
    objecion = None
    try:
        last_in = await db.whatsapp_messages.find_one(
            {"org_id": user.user_id, "lead_id": cid, "direction": "inbound", **_channel_q((channel or "whatsapp").lower())},
            {"_id": 0, "body_text": 1}, sort=[("created_at", -1)])
        if last_in:
            from taste_profile import extract_text_signals
            _txt = last_in.get("body_text") or ""
            sent = extract_text_signals(_txt).get("sentiment", "neutral")
            animo = {"sentiment": sent, "label": {"positivo": "Positivo", "negativo": "Negativo"}.get(sent, "Neutral")}
            objecion = _detect_objection(_txt)
    except Exception:
        pass
    # Recomendación: top propiedad por match para este lead (reusa el recomendador).
    rec = None
    try:
        from lead_match import aggregate_signals, match_for
        from data_developments import DEVELOPMENTS
        from photo_tagger import tag_from_url
        items = await db.asesor_lead_properties.find(
            {"owner_id": user.user_id, "contacto_id": cid}, {"_id": 0}).to_list(300)
        on_board = {it.get("dev_id") for it in items if it.get("dev_id")}
        sig = aggregate_signals(items)
        prof = await db.asesor_swipe_profiles.find_one({"owner_id": user.user_id, "contacto_id": cid}, {"_id": 0})
        taste = None
        try:
            from taste_profile import build_taste_profile
            taste = await build_taste_profile(db, user.user_id, cid, persist=False)
        except Exception:
            taste = None
        best = None
        for d in DEVELOPMENTS:
            if d.get("id") in on_board:
                continue
            try:
                dev_tags = [tag_from_url(u) for u in (d.get("photos") or [])[:6]]
                m = match_for(prof, sig, d, listed_price=d.get("price_from"), taste=taste, dev_tags=dev_tags)
            except Exception:
                continue
            if best is None or m["score"] > best[1]["score"]:
                best = (d, m)
        if best:
            d, m = best
            r0 = (m.get("reasons") or [{}])[0].get("t", "")
            rec = {"id": d.get("id"), "name": d.get("name"), "colonia": d.get("colonia"),
                   "match": m["score"], "reason": r0, "price_from": d.get("price_from")}
    except Exception:
        rec = None
    # Siguiente mejor acción · QUÉ HACER ahora (no siempre es una propiedad). Heurístico priorizado.
    try:
        board_count = len(items)
    except NameError:
        board_count = 0
    if objecion:
        nba = {"action_type": "objecion", "title": f"Maneja la objeción: {objecion['label']}",
               "why": objecion["suggestion"], "cta": "Responder", "urgency": "alta"}
    elif board_count == 0:
        nba = {"action_type": "afinar_gusto", "title": "Conoce su gusto",
               "why": "Aún no tiene propiedades en su tablero. Mándale la Galería para aprender qué le late.",
               "cta": "Enviar Galería", "urgency": "media"}
    elif rec:
        nba = {"action_type": "recomendar", "title": "Mándale una propiedad a su medida",
               "why": f"{rec['name']} encaja {rec['match']}% con lo que busca.", "cta": "Ver propuestas", "urgency": "media"}
    else:
        nba = {"action_type": "seguimiento", "title": "Dale seguimiento",
               "why": "Mantén viva la conversación con un mensaje breve.", "cta": "Escribir", "urgency": "baja"}
    # Coaching del Copiloto · QUÉ decirle (guion listo) + CÓMO tratarlo (no solo propiedades)
    nombre = None
    try:
        cdoc = await db.asesor_contactos.find_one({"id": cid, "owner_id": user.user_id}, {"_id": 0, "first_name": 1})
        nombre = (cdoc or {}).get("first_name")
    except Exception:
        nombre = None
    coaching = _build_coaching(objecion, animo, nombre)
    # Sugerencia PRIORITARIA para el chat (1 sola tira contextual · híbrido). El resto vive
    # en el tab Copiloto. Prioridad: objeción detectada > NBA urgente > NBA media > qué-decirle.
    top = None
    if objecion:
        top = {"kind": "objecion", "label": objecion["label"], "text": objecion.get("script", ""), "cta": "Usar", "action": "use_script"}
    elif nba and nba.get("urgency") in ("alta", "media"):
        top = {"kind": nba.get("action_type", "nba"), "label": nba["title"], "text": nba.get("why", ""), "cta": nba.get("cta", "Hacer"), "action": "nba"}
    elif coaching.get("que_decirle"):
        top = {"kind": "que_decirle", "label": "Qué decirle", "text": coaching["que_decirle"]["script"], "cta": "Usar", "action": "use_script"}
    return {"animo": animo, "recomendacion": rec, "objecion": objecion, "nba": nba, "coaching": coaching, "top": top}


class CopilotLeadAsk(BaseModel):
    question: str
    channel: str = "whatsapp"


@router.post("/contactos/{cid}/copilot-ask")
async def copilot_ask_lead(cid: str, payload: CopilotLeadAsk, request: Request):
    """Copiloto contextual del lead · responde la pregunta del asesor con el contexto de
    ESTE cliente cargado (gusto, presupuesto, conversación, tablero). Reusa el copiloto
    general inyectando un resumen del lead. FAIL-OPEN a un resumen heurístico."""
    user = await require_advisor(request)
    db = get_db(request)
    c = await db.asesor_contactos.find_one({"id": cid, "owner_id": user.user_id}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Contacto no encontrado")
    # CIERRE #3 · rate-limit anti-abuso/costo IA (15 preguntas/min/asesor) · FAIL-OPEN
    if not _check_copilot_rate(user.user_id):
        raise HTTPException(429, "Demasiadas preguntas seguidas. Espera unos segundos.")
    nombre = c.get("first_name") or "el cliente"
    q = (payload.question or "").strip()
    if not q:
        raise HTTPException(400, "Pregunta vacía")

    # Arma contexto compacto del lead (gusto + presupuesto + últimos mensajes + tablero)
    ctx_bits = [f"Cliente: {nombre} {c.get('last_name','')}".strip()]
    if c.get("temperatura"):
        ctx_bits.append(f"Temperatura: {c['temperatura']}")
    if c.get("tags"):
        ctx_bits.append(f"Etiquetas: {', '.join(c.get('tags') or [])}")
    try:
        b = await db.asesor_busquedas.find_one({"owner_id": user.user_id, "contacto_id": cid}, {"_id": 0}, sort=[("created_at", -1)])
        if b:
            seg = []
            if b.get("precio_max"): seg.append(f"presupuesto hasta {_fmt_mxn(b['precio_max'])}")
            if b.get("recamaras_min"): seg.append(f"{b['recamaras_min']}+ recámaras")
            if b.get("colonias"): seg.append("zonas: " + ", ".join(c2.replace('-', ' ') for c2 in (b.get('colonias') or [])[:4]))
            if seg: ctx_bits.append("Busca: " + " · ".join(seg))
    except Exception:
        pass
    try:
        from taste_profile import build_taste_profile, taste_summary_line
        _t = await build_taste_profile(db, user.user_id, cid, persist=False)
        line = taste_summary_line(_t) if _t else ""
        if line: ctx_bits.append(f"Gusto: {line}")
    except Exception:
        pass
    try:
        msgs = await db.whatsapp_messages.find(
            {"org_id": user.user_id, "lead_id": cid, **_channel_q((payload.channel or "whatsapp").lower())},
            {"_id": 0, "direction": 1, "body_text": 1}).sort("created_at", -1).limit(6).to_list(6)
        if msgs:
            convo = " | ".join(f"{'cliente' if m.get('direction')=='inbound' else 'yo'}: {(m.get('body_text') or '')[:80]}" for m in reversed(msgs))
            ctx_bits.append(f"Últimos mensajes: {convo}")
    except Exception:
        pass
    lead_ctx = "\n".join(ctx_bits)

    # CIERRE #3 · auditoría de la consulta al copiloto (qué se preguntó sobre cada lead)
    try:
        from copilot_events import log_event
        await log_event(db, user.user_id, cid, "copilot_ask", channel=payload.channel, text=q)
    except Exception:
        pass
    # Reusa el copiloto general (Claude) inyectando el contexto del lead en la pregunta.
    try:
        from services.copilot_engine import ask_copilot
        full_q = (f"Eres mi copiloto de ventas. Contexto del lead con el que estoy chateando:\n{lead_ctx}\n\n"
                  f"Mi pregunta: {q}\n\nResponde concreto y accionable, en español de México, máximo 6 líneas.")
        out = await ask_copilot(db, user, full_q, None)
        return {"answer": out.get("response_markdown") or out.get("answer") or "", "lead_context_used": lead_ctx, "fallback": bool(out.get("fallback"))}
    except Exception:
        # FAIL-OPEN heurístico
        return {"answer": f"Con {nombre}: revisa lo que busca y su gusto, y propón el siguiente paso concreto. {lead_ctx}",
                "lead_context_used": lead_ctx, "fallback": True}


class CopilotFeedbackIn(BaseModel):
    suggestion_type: str           # que_decirle | objecion | recomendar | seguimiento | ...
    outcome: str                   # used | positive | ignored
    lead_id: Optional[str] = None
    kind: Optional[str] = None     # objecion | nba | coaching | rec
    text: Optional[str] = None


@router.post("/copilot/feedback")
async def copilot_feedback(payload: CopilotFeedbackIn, request: Request):
    """CIERRE #1 · registra que el asesor USÓ una sugerencia (y luego si dio positivo).
    Alimenta suggestion_weights → el Copiloto sube lo que funciona. FAIL-OPEN."""
    user = await require_advisor(request)
    db = get_db(request)
    try:
        from copilot_events import log_event
        await log_event(db, user.user_id, payload.lead_id, payload.kind or "sugerencia",
                        suggestion_type=payload.suggestion_type, text=payload.text, outcome=payload.outcome)
    except Exception:
        pass
    return {"ok": True}


@router.get("/copilot/metrics")
async def copilot_metrics_endpoint(request: Request, days: int = 30):
    """CIERRE #4 · métricas del Copiloto para el panel (usadas, tasa positiva, objeciones top)
    + pesos de aprendizaje. FAIL-OPEN a ceros."""
    user = await require_advisor(request)
    db = get_db(request)
    try:
        from copilot_events import copilot_metrics, suggestion_weights
        m = await copilot_metrics(db, user.user_id, days=days)
        m["weights"] = await suggestion_weights(db, user.user_id)
        return m
    except Exception:
        return {"used": 0, "positive": 0, "response_rate": 0.0, "by_type": {}, "top_objeciones": [], "weights": {}, "days": days}


@router.get("/superadmin/copilot/overview")
async def copilot_admin_overview_endpoint(request: Request, days: int = 30):
    """CIERRE · panel founder/superadmin · inteligencia agregada de toda la operación
    (adopción, eficacia, objeciones del mercado, guiones top, ranking de asesores, alertas)."""
    from permissions import require_superadmin
    await require_superadmin(request)
    db = get_db(request)
    try:
        from copilot_events import copilot_admin_overview
        return await copilot_admin_overview(db, days=days)
    except Exception:
        return {"days": days, "active_advisors": 0, "total_used": 0, "total_positive": 0,
                "total_ask": 0, "response_rate": 0.0, "top_objeciones": [], "top_scripts": [],
                "top_advisors": [], "alerts": []}


_DIA_RX = {"hoy": 0, "mañana": 1, "manana": 1, "lunes": None, "martes": None, "miércoles": None,
           "miercoles": None, "jueves": None, "viernes": None, "sábado": None, "sabado": None, "domingo": None}
_DOW = {"lunes": 0, "martes": 1, "miércoles": 2, "miercoles": 2, "jueves": 3, "viernes": 4,
        "sábado": 5, "sabado": 5, "domingo": 6}


@router.get("/contactos/{cid}/ai-suggest")
async def ai_suggest(cid: str, request: Request, type: str = "nota", channel: str = "whatsapp"):
    """✨ Auto-redacta tarea/nota/cita desde la conversación + el brief (la IA ya lee el hilo).
    Heurístico (sin depender del LLM) · FAIL-OPEN. Para cita, también sugiere fecha si el
    cliente mencionó un día."""
    user = await require_advisor(request)
    db = get_db(request)
    c = await db.asesor_contactos.find_one({"id": cid, "owner_id": user.user_id}, {"_id": 0, "first_name": 1})
    if not c:
        raise HTTPException(404, "Contacto no encontrado")
    nombre = c.get("first_name") or "el cliente"
    msgs = await db.whatsapp_messages.find(
        {"org_id": user.user_id, "lead_id": cid, **_channel_q((channel or "whatsapp").lower())},
        {"_id": 0, "direction": 1, "body_text": 1}).sort("created_at", 1).to_list(60)
    inbound = [m.get("body_text", "") for m in msgs if m.get("direction") == "inbound"]
    last_in = inbound[-1] if inbound else ""
    out = {"text": "", "date": None}

    if type == "nota":
        try:
            from taste_profile import extract_text_signals
            sent = extract_text_signals(last_in).get("sentiment", "neutral") if last_in else "neutral"
        except Exception:
            sent = "neutral"
        partes = [f"Conversación por {channel} con {nombre} · ánimo {sent}."]
        if last_in:
            partes.append(f'Último mensaje: "{last_in[:120]}".')
        out["text"] = " ".join(partes)

    elif type == "tarea":
        # del brief (siguiente paso) si existe, si no genérica
        try:
            items = await db.asesor_lead_properties.find({"owner_id": user.user_id, "contacto_id": cid}, {"_id": 0}).to_list(300)
            from taste_profile import build_taste_profile, build_brief
            taste = await build_taste_profile(db, user.user_id, cid, persist=False)
            step = (build_brief(items, taste) or {}).get("next_step", {}).get("text", "")
        except Exception:
            step = ""
        out["text"] = step or f"Dar seguimiento a {nombre}"

    elif type == "cita":
        out["text"] = f"Visita con {nombre}"
        # detectar día mencionado en los mensajes del cliente
        blob = " ".join(inbound).lower()
        now = datetime.now(timezone.utc)
        target = None
        if "mañana" in blob or "manana" in blob:
            target = now + timedelta(days=1)
        elif "hoy" in blob:
            target = now
        else:
            for d, dow in _DOW.items():
                if d in blob:
                    delta = (dow - now.weekday()) % 7
                    target = now + timedelta(days=delta or 7)
                    break
        if target:
            out["date"] = target.replace(hour=11, minute=0, second=0, microsecond=0).isoformat()
    return out


class LeadCitaIn(BaseModel):
    titulo: str
    datetime: str  # ISO


@router.post("/contactos/{cid}/cita")
async def create_lead_cita(cid: str, body: LeadCitaIn, request: Request):
    """Cita rápida para el lead desde la bandeja (appointment ligero · sin wizard de proyecto)."""
    user = await require_advisor(request)
    db = get_db(request)
    c = await db.asesor_contactos.find_one({"id": cid, "owner_id": user.user_id}, {"_id": 0, "first_name": 1, "last_name": 1})
    if not c:
        raise HTTPException(404, "Contacto no encontrado")
    apt = {"id": "apt_" + uuid.uuid4().hex[:10], "asesor_id": user.user_id, "lead_id": cid,
           "titulo": (body.titulo or "Cita").strip()[:120], "datetime": body.datetime,
           "status": "agendada", "lead": {"contact": f"{c.get('first_name','')} {c.get('last_name','')}".strip()},
           "created_at": datetime.now(timezone.utc)}
    try:
        await db.appointments.insert_one(apt)
    except Exception:
        raise HTTPException(500, "No se pudo crear la cita")
    return {"ok": True, "id": apt["id"]}


@router.get("/contactos/{cid}/context")
async def lead_context(cid: str, request: Request):
    """B6 · Contexto ligero del lead para la columna derecha de la bandeja:
    perfil de gusto (B5.4) + siguiente paso (brief). FAIL-OPEN."""
    user = await require_advisor(request)
    db = get_db(request)
    c = await db.asesor_contactos.find_one(
        {"id": cid, "owner_id": user.user_id},
        {"_id": 0, "first_name": 1, "last_name": 1, "phones": 1, "emails": 1,
         "temperatura": 1, "tipo": 1, "fuente": 1, "tags": 1, "created_at": 1})
    if not c:
        raise HTTPException(404, "Contacto no encontrado")
    items = await db.asesor_lead_properties.find(
        {"owner_id": user.user_id, "contacto_id": cid}, {"_id": 0}).to_list(300)
    taste, brief = None, None
    try:
        from taste_profile import build_taste_profile, taste_summary_line, build_brief
        taste = await build_taste_profile(db, user.user_id, cid)
        taste["summary"] = taste_summary_line(taste)
        brief = build_brief(items, taste)
    except Exception:
        pass
    # B7+ · estado del tablero (cuántas propiedades por etapa) para la columna derecha
    _ALIAS = {"dispo": "por_verificar", "gusto": "le_gusto"}
    board = {}
    for it in items:
        st = _ALIAS.get(it.get("status"), it.get("status")) or "por_verificar"
        board[st] = board.get(st, 0) + 1
    # B7+ · probabilidad de cierre (reusa close_probability · FAIL-OPEN)
    close_prob = None
    try:
        from close_probability import close_probability
        cp = await close_probability(db, cid)
        close_prob = (cp or {}).get("prob") if isinstance(cp, dict) else None
    except Exception:
        close_prob = None
    # Práctico para el día a día (founder): tareas pendientes + próxima cita de ESTE lead.
    tareas = []
    try:
        tdocs = await db.asesor_tareas.find(
            {"owner_id": user.user_id, "contacto_id": cid, "done": False},
            {"_id": 0, "id": 1, "titulo": 1, "title": 1, "due_at": 1}).sort("due_at", 1).limit(5).to_list(5)
        tareas = [{"id": t.get("id"), "titulo": t.get("titulo") or t.get("title") or "Tarea", "due_at": t.get("due_at")} for t in tdocs]
    except Exception:
        pass
    proxima_cita = None
    try:
        now_iso = datetime.now(timezone.utc).isoformat()
        cdoc = await db.appointments.find_one(
            {"asesor_id": user.user_id, "lead_id": cid, "datetime": {"$gte": now_iso}, "status": {"$nin": ["cancelada"]}},
            {"_id": 0, "titulo": 1, "datetime": 1, "status": 1}, sort=[("datetime", 1)])
        if cdoc:
            proxima_cita = {"titulo": cdoc.get("titulo") or "Cita", "datetime": cdoc.get("datetime"), "status": cdoc.get("status")}
    except Exception:
        pass
    # Pieza 3 · lo que sugieren los 5 AGENTES para ESTE lead (command_center_actions · rescate)
    AGENT_LABELS = {"prospector": "Prospector", "nurturer": "Nurturer", "closer": "Closer", "analyst": "Analyst", "coach": "Coach"}
    agent_actions = []
    try:
        async for a in db.command_center_actions.find(
                {"user_id": user.user_id, "lead_id": cid, "status": "pending", "source_agent": {"$ne": None}},
                {"_id": 0, "id": 1, "title": 1, "source_agent": 1}).limit(4):
            agent_actions.append({"id": a.get("id"), "agent": a.get("source_agent"),
                                  "agent_label": AGENT_LABELS.get(a.get("source_agent"), a.get("source_agent")),
                                  "title": a.get("title")})
    except Exception:
        pass
    # Datos del perfil (tab Perfil) + búsqueda activa (lo que pidió: presupuesto/zonas/recámaras)
    created_at = c.get("created_at")
    if hasattr(created_at, "isoformat"):
        created_at = created_at.isoformat()
    busqueda = None
    try:
        b = await db.asesor_busquedas.find_one(
            {"owner_id": user.user_id, "contacto_id": cid}, {"_id": 0}, sort=[("created_at", -1)])
        if b:
            busqueda = {"id": b.get("id"), "precio_min": b.get("precio_min"), "precio_max": b.get("precio_max"),
                        "colonias": b.get("colonias") or [], "recamaras_min": b.get("recamaras_min"),
                        "banos_min": b.get("banos_min"), "estacionamientos_min": b.get("estacionamientos_min"),
                        "m2_min": b.get("m2_min"), "tipos": b.get("tipos") or [],
                        "amenidades": b.get("amenidades") or [], "mascotas": b.get("mascotas"),
                        "no_negociables": b.get("no_negociables") or [],
                        "urgencia": b.get("urgencia"), "notas": b.get("notas") or ""}
    except Exception:
        busqueda = None
    return {"name": f"{c.get('first_name', '')} {c.get('last_name', '')}".strip(),
            "phone": (c.get("phones") or [None])[0], "email": (c.get("emails") or [None])[0],
            "tipo": c.get("tipo"), "fuente": c.get("fuente"), "tags": c.get("tags") or [],
            "created_at": created_at, "busqueda": busqueda, "temperatura": c.get("temperatura"),
            "taste": taste, "brief": brief, "board_count": len(items),
            "board": board, "close_probability": close_prob,
            "tareas": tareas, "proxima_cita": proxima_cita, "agent_actions": agent_actions}


@router.post("/contactos/{cid}/swipe-link")
async def create_swipe_link(cid: str, request: Request):
    """B5.2 · Crea (o reusa) el link Tinder público del lead + mensaje de WhatsApp.
    Lo llama el botón "Crear y enviar" del tab Propiedades. Token estable por lead
    (reusa el mismo link si ya existe). Los endpoints públicos viven en swipe_public.py."""
    user = await require_advisor(request)
    db = get_db(request)
    c = await db.asesor_contactos.find_one(
        {"id": cid, "owner_id": user.user_id}, {"_id": 0, "id": 1, "first_name": 1})
    if not c:
        raise HTTPException(404, "No encontrado")
    link = await db.asesor_property_links.find_one(
        {"owner_id": user.user_id, "contacto_id": cid}, {"_id": 0})
    if not link:
        link = {
            "id": _uid("plink"),
            "token": "swp_" + uuid.uuid4().hex[:14],
            "owner_id": user.user_id,
            "contacto_id": cid,
            "asesor_name": user.name or "Tu asesor",
            "lead_name": c.get("first_name") or "",
            "created_at": _now(),
            # E6/S4 · expira a 90d (se refresca al re-compartir) → un link filtrado no vive eterno.
            "expires_at": _now() + timedelta(days=90),
            "views": 0,
        }
        await db.asesor_property_links.insert_one(dict(link))
        link.pop("_id", None)
    else:
        # Re-compartir un link existente refresca su expiración (sigue vivo mientras se use).
        try:
            await db.asesor_property_links.update_one(
                {"id": link["id"]}, {"$set": {"expires_at": _now() + timedelta(days=90)}})
        except Exception:
            pass
    base = (os.environ.get("FRONTEND_URL") or os.environ.get("PUBLIC_URL") or "").rstrip("/")
    url = f"{base}/p/{link['token']}" if base else f"/p/{link['token']}"
    first = c.get("first_name") or ""
    wa_text = (f"Hola {first}, te preparé tu Galería Personalizada con propiedades pensadas en lo que buscas. "
               f"Entra y dime cuáles te laten (deslizas 👍/👎, toma 1 min) 👉 {url}")
    return {"token": link["token"], "url": url, "wa_text": wa_text}


# ─── Búsquedas (Kanban) ───────────────────────────────────────────────────────
@router.get("/busquedas")
async def list_busquedas(request: Request):
    user = await require_advisor(request)
    db = get_db(request)
    items = await db.asesor_busquedas.find({"owner_id": user.user_id}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return items


@router.post("/busquedas")
async def create_busqueda(payload: BusquedaIn, request: Request):
    user = await require_advisor(request)
    db = get_db(request)
    if not await db.asesor_contactos.find_one({"id": payload.contacto_id, "owner_id": user.user_id}):
        raise HTTPException(404, "Contacto no encontrado")
    item = {
        "id": _uid("busq"),
        "owner_id": user.user_id,
        "stage": "pendiente",
        "created_at": _now(),
        "visits": 0,
        "offers": 0,
        "matched_dev_ids": [],
        **payload.model_dump(),
    }
    await db.asesor_busquedas.insert_one(dict(item))
    item.pop("_id", None)
    return item


@router.patch("/busquedas/{bid}/stage")
async def move_busqueda(bid: str, payload: BusquedaStage, request: Request):
    user = await require_advisor(request)
    db = get_db(request)
    if payload.stage not in STAGE_BUSQ: raise HTTPException(400, "Etapa inválida")
    b = await db.asesor_busquedas.find_one({"id": bid, "owner_id": user.user_id}, {"_id": 0})
    if not b: raise HTTPException(404, "Búsqueda no encontrada")
    # Hard validations
    if payload.stage == "visitando" and b.get("visits", 0) < 1:
        raise HTTPException(400, "Registra al menos 1 visita antes de mover a Visitando")
    if payload.stage == "ofertando" and b.get("offers", 0) < 1:
        raise HTTPException(400, "Registra al menos 1 oferta antes de mover a Ofertando")
    if payload.stage == "ganada" and b.get("offers", 0) < 1:
        raise HTTPException(400, "Requiere oferta aceptada registrada")
    await db.asesor_busquedas.update_one({"id": bid}, {"$set": {"stage": payload.stage, "updated_at": _now()}})
    return {"ok": True, "stage": payload.stage}


@router.post("/busquedas/{bid}/visit")
async def register_visit(bid: str, request: Request):
    user = await require_advisor(request)
    db = get_db(request)
    r = await db.asesor_busquedas.update_one({"id": bid, "owner_id": user.user_id}, {"$inc": {"visits": 1}})
    if not r.matched_count: raise HTTPException(404, "No encontrado")
    return {"ok": True}


@router.post("/busquedas/{bid}/offer")
async def register_offer(bid: str, request: Request):
    user = await require_advisor(request)
    db = get_db(request)
    r = await db.asesor_busquedas.update_one({"id": bid, "owner_id": user.user_id}, {"$inc": {"offers": 1}})
    if not r.matched_count: raise HTTPException(404, "No encontrado")
    return {"ok": True}


@router.get("/busquedas/{bid}/matches")
async def busqueda_matches(bid: str, request: Request):
    """Matcher determinista: precio 28 + zona 22 + amenidades 16 + recámaras 12 + baños 8
    + estacionamiento 6 + m² 4 + urgencia 4. Honra mascotas y no-negociables."""
    from data_developments import DEVELOPMENTS
    user = await require_advisor(request)
    db = get_db(request)
    b = await db.asesor_busquedas.find_one({"id": bid, "owner_id": user.user_id}, {"_id": 0})
    if not b: raise HTTPException(404, "No encontrada")

    out = []
    for d in DEVELOPMENTS:
        score = 0
        rationale = []
        max_beds = (d.get("bedrooms_range") or [0, 0])[1]
        max_baths = (d.get("bathrooms_range") or [0, 0])[1]
        max_parking = (d.get("parking_range") or [0, 0])[1]
        max_m2 = (d.get("m2_range") or [0, 0])[1]
        # price
        pmin = b.get("precio_min") or 0
        pmax = b.get("precio_max") or 10**9
        if pmin <= d["price_from"] <= pmax or pmin <= d["price_to"] <= pmax:
            score += 28; rationale.append("Dentro de rango de precio")
        # zone (colonia)
        if b.get("colonias") and d["colonia_id"] in b["colonias"]:
            score += 22; rationale.append(f"Colonia preferida: {d['colonia']}")
        # amenities overlap (mascotas se trata como amenidad 'pet')
        want_amen = set(b.get("amenidades", []))
        if b.get("mascotas"):
            want_amen.add("pet")
        have_amen = set(d.get("amenities", []))
        if want_amen:
            overlap = len(want_amen & have_amen)
            pct = overlap / max(1, len(want_amen))
            score += int(pct * 16)
            if overlap: rationale.append(f"{overlap} amenidades coincidentes")
        # beds
        if b.get("recamaras_min", 0) <= max_beds:
            score += 12; rationale.append(f"Hasta {max_beds} recámaras")
        # baths
        if b.get("banos_min", 0) <= max_baths:
            score += 8
        # parking
        if b.get("estacionamientos_min", 0) <= max_parking:
            score += 6
        # m2
        if not b.get("m2_min") or b.get("m2_min", 0) <= max_m2:
            score += 4
        # urgency/stage alignment
        if b.get("urgencia") == "alta" and d["stage"] in ("entrega_inmediata", "en_construccion"):
            score += 4; rationale.append("Entrega acelerada alineada con urgencia")
        elif b.get("urgencia") != "alta":
            score += 2

        if score > 0:
            out.append({
                "dev_id": d["id"],
                "name": d["name"],
                "colonia": d["colonia"],
                "stage": d["stage"],
                "price_from": d["price_from"],
                "photos": d.get("photos", [])[:1],
                "score": min(100, score),
                "rationale": rationale,
            })
    out.sort(key=lambda x: -x["score"])
    return out[:12]


def _fmt_mxn(n):
    try:
        return f"${int(n)/1_000_000:.1f}M".replace(".0M", "M")
    except Exception:
        return str(n)


@router.patch("/busquedas/{bid}")
async def update_busqueda(bid: str, payload: BusquedaPatch, request: Request):
    """Edita el perfil de búsqueda del lead. Detecta los cambios (sube presupuesto / amplía
    zona / +recámaras…) y devuelve recomendaciones con IA + cuántas propiedades nuevas
    desbloquea el cambio (re-corre el matcher). FAIL-OPEN."""
    user = await require_advisor(request)
    db = get_db(request)
    b = await db.asesor_busquedas.find_one({"id": bid, "owner_id": user.user_id}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Búsqueda no encontrada")
    changes = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if not changes:
        return {"ok": True, "changed": [], "recomendaciones": [], "matches_delta": 0}

    # matches ANTES del cambio
    try:
        before = await busqueda_matches(bid, request)
        before_ids = {m["dev_id"] for m in before}
        before_top = before[0]["score"] if before else 0
    except Exception:
        before, before_ids, before_top = [], set(), 0

    # detectar QUÉ cambió (en lenguaje llano) para las recomendaciones
    diffs = []
    if "precio_max" in changes and (b.get("precio_max") or 0) != changes["precio_max"]:
        up = (changes["precio_max"] or 0) > (b.get("precio_max") or 0)
        diffs.append(("presupuesto_up" if up else "presupuesto_down",
                      f"{'subió' if up else 'bajó'} el presupuesto a {_fmt_mxn(changes['precio_max'])}"))
    if "colonias" in changes and set(changes["colonias"] or []) != set(b.get("colonias") or []):
        nuevas = [c for c in (changes["colonias"] or []) if c not in (b.get("colonias") or [])]
        if nuevas:
            diffs.append(("zona_amplia", f"amplió zona: +{', '.join(n.replace('-', ' ') for n in nuevas)}"))
        else:
            diffs.append(("zona_cambia", "ajustó las zonas de interés"))
    if "recamaras_min" in changes and (b.get("recamaras_min") or 0) != changes["recamaras_min"]:
        diffs.append(("recamaras", f"ahora busca {changes['recamaras_min']}+ recámaras"))
    if "banos_min" in changes and (b.get("banos_min") or 0) != changes["banos_min"]:
        diffs.append(("banos", f"ahora pide {changes['banos_min']}+ baños"))
    if "amenidades" in changes and set(changes["amenidades"] or []) != set(b.get("amenidades") or []):
        diffs.append(("amenidades", "cambió las amenidades deseadas"))

    await db.asesor_busquedas.update_one({"id": bid}, {"$set": {**changes, "updated_at": _now()}})

    # matches DESPUÉS del cambio → cuántas propiedades nuevas desbloqueó
    try:
        after = await busqueda_matches(bid, request)
        after_ids = {m["dev_id"] for m in after}
        after_top = after[0]["score"] if after else 0
        nuevas_props = [m for m in after if m["dev_id"] not in before_ids][:5]
    except Exception:
        after, after_ids, after_top, nuevas_props = [], set(), 0, []
    matches_delta = len(after_ids - before_ids)

    # Recomendaciones IA/ML según el cambio (heurístico stub-aware · FAIL-OPEN)
    recs = []
    for key, _txt in diffs:
        if key == "presupuesto_up":
            recs.append({"icon": "📈", "title": "Subió el presupuesto",
                         "detail": f"Se abren {matches_delta} propiedades nuevas en su rango. Mándale las mejores hoy mientras está caliente."})
        elif key == "presupuesto_down":
            recs.append({"icon": "📉", "title": "Bajó el presupuesto",
                         "detail": "Reordené el tablero a lo que sí le cuadra. Evita mostrarle lo que ya quedó fuera de rango."})
        elif key == "zona_amplia":
            recs.append({"icon": "📍", "title": "Amplió la zona",
                         "detail": f"{matches_delta} opciones nuevas en las colonias agregadas. Buen momento para una Galería fresca."})
        elif key == "recamaras":
            recs.append({"icon": "🛏️", "title": "Cambió recámaras",
                         "detail": "Filtré el inventario a lo que ahora pide. Revisa el match% actualizado."})
        elif key == "amenidades":
            recs.append({"icon": "✨", "title": "Nuevas amenidades",
                         "detail": "Re-prioricé por amenidades. Las que ya tenía en tablero conservan su lugar."})
    if after_top > before_top + 5:
        recs.append({"icon": "🎯", "title": "Mejor match disponible",
                     "detail": f"Con el cambio, tu mejor coincidencia sube a {after_top}%."})
    if not recs and changes:
        recs.append({"icon": "✅", "title": "Perfil actualizado",
                     "detail": "Guardé los cambios y volví a calcular las coincidencias."})
    return {
        "ok": True,
        "changed": [t for _k, t in diffs],
        "matches_delta": matches_delta,
        "nuevas_props": [{"name": m["name"], "colonia": m["colonia"], "score": m["score"]} for m in nuevas_props],
        "recomendaciones": recs,
    }


@router.get("/busquedas/{bid}/op-prefill")
async def busqueda_op_prefill(bid: str, request: Request):
    """Auto-prefill payload for the 6-step operación wizard when a búsqueda moves to 'ganada'."""
    from datetime import timedelta as _td
    user = await require_advisor(request)
    db = get_db(request)
    b = await db.asesor_busquedas.find_one({"id": bid, "owner_id": user.user_id}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Búsqueda no encontrada")

    # Top match as default development suggestion
    top_dev_id = None
    try:
        resp = await busqueda_matches(bid, request)
        if resp: top_dev_id = resp[0]["dev_id"]
    except Exception:
        pass

    valor = b.get("precio_max") or b.get("precio_min") or 0
    fecha_cierre = (_now() + _td(days=10)).strftime("%Y-%m-%d")
    return {
        "side": "ambos",
        "contacto_id": b.get("contacto_id"),
        "desarrollo_id": top_dev_id,
        "unidad_id": None,
        "valor_cierre": valor,
        "currency": "MXN",
        "comision_pct": 4.0,
        "fecha_cierre": fecha_cierre,
        "notas": f"Originada desde búsqueda {bid} (ganada)",
        "source_busqueda_id": bid,
    }


# ─── Captaciones (Kanban) ─────────────────────────────────────────────────────
@router.get("/captaciones")
async def list_captaciones(request: Request):
    user = await require_advisor(request)
    db = get_db(request)
    items = await db.asesor_captaciones.find({"owner_id": user.user_id}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return items


@router.post("/captaciones")
async def create_captacion(payload: CaptacionIn, request: Request):
    user = await require_advisor(request)
    db = get_db(request)
    if payload.tipo_operacion not in ("venta", "renta"): raise HTTPException(400, "tipo_operacion inválido")
    item = {
        "id": _uid("capt"),
        "owner_id": user.user_id,
        "stage": "pendiente",
        "created_at": _now(),
        "comision_pct": 4.0,
        "exclusividad_meses": 6,
        "stage_payloads": {},  # per-stage metadata
        "foto_urls": [],
        **payload.model_dump(),
    }
    await db.asesor_captaciones.insert_one(dict(item))
    item.pop("_id", None)
    return item


@router.patch("/captaciones/{cid}/stage")
async def move_captacion(cid: str, payload: CaptacionStage, request: Request):
    user = await require_advisor(request)
    db = get_db(request)
    if payload.stage not in STAGE_CAPT: raise HTTPException(400, "Etapa inválida")
    update = {"stage": payload.stage, "updated_at": _now()}
    if payload.payload:
        update[f"stage_payloads.{payload.stage}"] = payload.payload
    r = await db.asesor_captaciones.update_one({"id": cid, "owner_id": user.user_id}, {"$set": update})
    if not r.matched_count: raise HTTPException(404, "No encontrada")
    return {"ok": True, "stage": payload.stage}


@router.get("/captaciones/{cid}")
async def get_captacion(cid: str, request: Request):
    user = await require_advisor(request)
    db = get_db(request)
    c = await db.asesor_captaciones.find_one({"id": cid, "owner_id": user.user_id}, {"_id": 0})
    if not c: raise HTTPException(404, "No encontrada")
    return c


# ─── Tareas ───────────────────────────────────────────────────────────────────
@router.get("/tareas")
async def list_tareas(request: Request, scope: Optional[str] = None, contacto_id: Optional[str] = None):
    user = await require_advisor(request)
    db = get_db(request)
    flt = {"owner_id": user.user_id, "done": {"$ne": True}}
    if scope:
        # scope group: property|capture|search → property; client|lead → client; general → general
        groups = {"property": ["property", "capture", "search"], "client": ["client", "lead"], "general": ["general"]}
        if scope in groups: flt["tipo"] = {"$in": groups[scope]}
    # B1 · filtro additive por contacto (perfil-hub · Pendientes). Default sin
    # contacto_id = comportamiento actual. La tarea liga el lead via entity_id.
    if contacto_id:
        flt["entity_id"] = contacto_id
    items = await db.asesor_tareas.find(flt, {"_id": 0}).sort("due_at", 1).limit(500).to_list(500)
    return items


@router.post("/tareas")
async def create_tarea(payload: TareaIn, request: Request):
    user = await require_advisor(request)
    db = get_db(request)
    if payload.prioridad not in PRIORITY: raise HTTPException(400, "prioridad inválida")
    item = {
        "id": _uid("tarea"),
        "owner_id": user.user_id,
        "done": False,
        "created_at": _now(),
        **payload.model_dump(),
    }
    await db.asesor_tareas.insert_one(dict(item))
    item.pop("_id", None)
    return item


@router.patch("/tareas/{tid}/done")
async def complete_tarea(tid: str, request: Request):
    user = await require_advisor(request)
    db = get_db(request)
    r = await db.asesor_tareas.update_one({"id": tid, "owner_id": user.user_id}, {"$set": {"done": True, "done_at": _now()}})
    if not r.matched_count: raise HTTPException(404, "No encontrada")
    # +5 XP on task completion
    await db.asesor_profiles.update_one({"user_id": user.user_id}, {"$inc": {"xp": 5}}, upsert=True)
    return {"ok": True}


@router.delete("/tareas/{tid}")
async def delete_tarea(tid: str, request: Request):
    user = await require_advisor(request)
    db = get_db(request)
    r = await db.asesor_tareas.delete_one({"id": tid, "owner_id": user.user_id})
    return {"ok": bool(r.deleted_count)}


# ─── Operaciones ──────────────────────────────────────────────────────────────
def _unique_op_code() -> str:
    alphabet = "BCDFGHJKLMNPQRSTVWXZ23456789"
    a = "".join(alphabet[int(x, 16) % len(alphabet)] for x in uuid.uuid4().hex[:3])
    b = "".join(alphabet[int(x, 16) % len(alphabet)] for x in uuid.uuid4().hex[:4])
    c = "".join(alphabet[int(x, 16) % len(alphabet)] for x in uuid.uuid4().hex[:4])
    return f"{a}-{b}-{c}"


@router.get("/operaciones")
async def list_operaciones(request: Request, status: Optional[str] = None):
    user = await require_advisor(request)
    db = get_db(request)
    flt = {"owner_id": user.user_id}
    if status: flt["status"] = status
    items = await db.asesor_operaciones.find(flt, {"_id": 0}).sort("created_at", -1).limit(500).to_list(500)
    return items


@router.post("/operaciones")
async def create_operacion(payload: OperacionIn, request: Request):
    user = await require_advisor(request)
    db = get_db(request)
    if payload.side not in ("ambos", "vendedor", "comprador"): raise HTTPException(400, "side inválido")
    if payload.currency not in ("MXN", "USD", "AED"): raise HTTPException(400, "currency inválido")

    comision_base = payload.valor_cierre * (payload.comision_pct / 100.0)
    iva = comision_base * 0.16
    platform_split = comision_base * 0.20
    asesor_split = comision_base * 0.80
    comision_total = comision_base + iva

    item = {
        "id": _uid("op"),
        "code": _unique_op_code(),
        "owner_id": user.user_id,
        "status": "propuesta",
        "created_at": _now(),
        "comision_base": round(comision_base, 2),
        "iva": round(iva, 2),
        "comision_total": round(comision_total, 2),
        "platform_split": round(platform_split, 2),
        "asesor_split": round(asesor_split, 2),
        **payload.model_dump(),
    }
    await db.asesor_operaciones.insert_one(dict(item))
    item.pop("_id", None)
    # F0.1 — Audit log
    try:
        from audit_log import log_mutation
        await log_mutation(db, user, "create", "operacion", item["id"], before=None, after=item, request=request)
    except Exception: pass
    return item


@router.patch("/operaciones/{oid}/status")
async def update_op_status(oid: str, payload: OperacionStatus, request: Request):
    user = await require_advisor(request)
    db = get_db(request)
    if payload.status not in STATUS_OP: raise HTTPException(400, "status inválido")
    op = await db.asesor_operaciones.find_one({"id": oid, "owner_id": user.user_id}, {"_id": 0})
    if not op: raise HTTPException(404, "Operación no encontrada")
    # Hard transitions
    cur = op["status"]
    legal = {
        "propuesta": ["oferta_aceptada", "cancelada"],
        "oferta_aceptada": ["escritura", "cancelada"],
        "escritura": ["cerrada", "cancelada"],
        "cerrada": ["pagando", "cancelada"],
        "pagando": ["cobrada"],
        "cobrada": [],
        "cancelada": [],
    }
    if payload.status not in legal.get(cur, []):
        raise HTTPException(400, f"Transición inválida {cur} → {payload.status}")
    upd = {"status": payload.status, "updated_at": _now()}
    if payload.reason: upd["reason"] = payload.reason
    # CAS: solo actualiza si el status sigue siendo 'cur'. Dos PATCH concurrentes a la
    # misma transición → solo uno gana (modified_count==1); el otro recibe 409 y NO
    # vuelve a sumar XP/cierres (evita doble-cobro de gamificación).
    res = await db.asesor_operaciones.update_one(
        {"id": oid, "owner_id": user.user_id, "status": cur}, {"$set": upd})
    if res.modified_count != 1:
        raise HTTPException(409, "La operación ya cambió de estado · recarga e intenta de nuevo")
    # Closure: grant XP + increment cierres (solo el ganador de la carrera llega aquí)
    if payload.status == "cerrada":
        await db.asesor_profiles.update_one({"user_id": user.user_id}, {"$inc": {"xp": 250, "cierres_total": 1}}, upsert=True)
    # Phase F0.11 — ML training event on status transition
    try:
        from observability import emit_ml_event
        await emit_ml_event(
            db, event_type="operacion_status_change",
            user_id=user.user_id, org_id=getattr(user, "tenant_id", None), role=user.role,
            context={"operacion_id": oid, "contacto_id": op.get("contacto_id"), "dev_id": op.get("dev_id"),
                     "precio": op.get("precio"), "from_status": cur},
            ai_decision={},
            user_action={"to_status": payload.status, "reason": payload.reason or None},
        )
    except Exception: pass
    # F0.1 — Audit log (kanban critical mutation + ML emit trigger)
    try:
        from audit_log import log_mutation
        from observability import emit_ml_event as _emit
        await log_mutation(db, user, "update", "operacion", oid,
                           before={"status": cur}, after={"status": payload.status}, request=request)
        await _emit(db, "mutation_logged", user.user_id, getattr(user, "tenant_id", None), user.role,
                    context={"entity_type": "operacion", "action": "update"}, ai_decision={}, user_action={})
    except Exception: pass
    return {"ok": True, "status": payload.status}


@router.get("/operaciones/{oid}")
async def get_operacion(oid: str, request: Request):
    user = await require_advisor(request)
    db = get_db(request)
    op = await db.asesor_operaciones.find_one({"id": oid, "owner_id": user.user_id}, {"_id": 0})
    if not op: raise HTTPException(404, "No encontrada")
    return op


# ─── Comisiones ───────────────────────────────────────────────────────────────
@router.get("/comisiones")
async def comisiones_summary(request: Request):
    user = await require_advisor(request)
    db = get_db(request)
    ops = await db.asesor_operaciones.find({"owner_id": user.user_id}, {"_id": 0}).to_list(1000)
    by_status = {}
    total_cobradas = 0.0
    total_por_cobrar = 0.0
    forecast_6m = 0.0
    now = _now()
    six_months = (now + timedelta(days=180)).isoformat()
    for o in ops:
        s = o["status"]
        by_status[s] = by_status.get(s, 0) + o.get("asesor_split", 0)
        if s == "cobrada": total_cobradas += o.get("asesor_split", 0)
        if s in ("pagando", "cerrada"): total_por_cobrar += o.get("asesor_split", 0)
        if o.get("fecha_cierre") and o["fecha_cierre"] < six_months and s not in ("cobrada", "cancelada"):
            forecast_6m += o.get("asesor_split", 0)
    return {
        "total_cobradas": round(total_cobradas, 2),
        "total_por_cobrar": round(total_por_cobrar, 2),
        "forecast_6m": round(forecast_6m, 2),
        "by_status": {k: round(v, 2) for k, v in by_status.items()},
        "ops_count": len(ops),
    }


# ─── Argumentario AI (Claude Sonnet 4.5) ──────────────────────────────────────
@router.post("/argumentario")
async def generate_argumentario(payload: ArgumentarioIn, request: Request):
    from data_developments import DEVELOPMENTS_BY_ID
    user = await require_advisor(request)
    db = get_db(request)

    contact = await db.asesor_contactos.find_one({"id": payload.contacto_id, "owner_id": user.user_id}, {"_id": 0})
    if not contact: raise HTTPException(404, "Contacto no encontrado")
    dev = DEVELOPMENTS_BY_ID.get(payload.desarrollo_id)
    if not dev: raise HTTPException(404, "Desarrollo no encontrado")

    cache_key = hashlib.md5(f"{payload.contacto_id}|{payload.desarrollo_id}|{payload.objetivo}|{_now().strftime('%Y-W%V')}".encode()).hexdigest()
    cached = await db.asesor_argumentarios.find_one({"cache_key": cache_key}, {"_id": 0})
    if cached:
        return cached

    objetivos = {
        "agendar_visita": "agendar una visita al desarrollo",
        "enviar_info": "enviar información clave del proyecto",
        "reactivar": "reactivar el interés de un contacto frío",
        "negociar": "abrir una conversación de negociación de precio",
    }
    objetivo_txt = objetivos.get(payload.objetivo, "abrir conversación")

    prompt = f"""Eres un asesor inmobiliario mexicano experto escribiendo un mensaje en español mexicano (es-MX) para enviar por WhatsApp.

Contexto del contacto:
- Nombre: {contact['first_name']} {contact.get('last_name', '')}
- Tipo: {contact.get('tipo')}
- Temperatura: {contact.get('temperatura')}
- Tags: {', '.join(contact.get('tags', []))}

Contexto del desarrollo:
- Nombre: {dev['name']}
- Colonia: {dev['colonia']}, {dev['alcaldia']}
- Etapa: {dev['stage']}
- Entrega: {dev['delivery_estimate']}
- Precio desde: ${dev['price_from']:,} MXN
- m² desde: {dev['m2_range'][0]}
- Amenidades: {', '.join(dev.get('amenities', [])[:5])}

Objetivo: {objetivo_txt}.

Escribe un mensaje de WhatsApp de 2-3 párrafos cortos, tono profesional-cercano mexicano, específico y con datos. Evita frases de marketing vacío. Cierra con 1 CTA claro. No uses emojis. Máximo 180 palabras."""

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(api_key=os.environ.get("EMERGENT_LLM_KEY"), session_id=cache_key,
                       system_message="Eres un asesor inmobiliario mexicano experto.")
        chat.with_model("anthropic", "claude-sonnet-4-5-20250929")
        text = await chat.send_message(UserMessage(text=prompt))
    except Exception as e:
        text = (f"Hola {contact['first_name']}, qué tal. Te escribo porque tengo una oportunidad que encaja con lo "
                f"que me comentaste: {dev['name']}, en {dev['colonia']}. Etapa {dev['stage']}, entrega {dev['delivery_estimate']}, "
                f"desde ${dev['price_from']:,} MXN, con {dev['m2_range'][0]} m² en adelante. "
                f"¿Tienes 20 minutos esta semana para que te enseñe las unidades disponibles y corramos números?")

    result = {
        "cache_key": cache_key,
        "contacto_id": payload.contacto_id,
        "desarrollo_id": payload.desarrollo_id,
        "objetivo": payload.objetivo,
        "text": text,
        "created_at": _now(),
    }
    await db.asesor_argumentarios.insert_one(dict(result))
    result.pop("_id", None)
    return result


# ─── Argumentario RAG (Phase D2 · Bot RAG integration) ────────────────────────
class ArgumentarioRagIn(BaseModel):
    contact_id: str
    development_id: Optional[str] = None
    force: bool = False


_ARG_RAG_SYS = """Eres un asesor inmobiliario mexicano (es-MX) que genera argumentarios de venta data-backed para contactos específicos.

REGLAS INMUTABLES:
- NUNCA inventes datos. Solo cita scores, documentos y datos que estén en el input (CONTEXTO RAG).
- Cada afirmación cuantitativa DEBE estar respaldada por un chunk del CONTEXTO RAG. Si no encuentras data sobre algo, di explícito "no tengo data sobre X".
- Cita los chunks con su chunk_id en el campo `citations`.
- Cada párrafo puede incluir referencias inline tipo "[1]" o "[2]" que correspondan al index del array citations.
- Tono profesional-cercano mexicano. Sin emojis. Sin frases marketing vacío.
- Output: SOLO JSON válido (sin markdown) con keys: hook, paragraphs (array de 2-3 strings), call_to_action, whatsapp_text (≤700 chars plain), citations (array de {chunk_id, label, source_type, source_id}).
"""


@router.post("/argumentario-rag")
async def generate_argumentario_rag(payload: ArgumentarioRagIn, request: Request):
    user = await require_advisor(request)
    db = get_db(request)

    contact = await db.asesor_contactos.find_one(
        {"id": payload.contact_id, "owner_id": user.user_id}, {"_id": 0}
    )
    if not contact:
        raise HTTPException(404, "Contacto no encontrado")

    dev = None
    if payload.development_id:
        from data_developments import DEVELOPMENTS_BY_ID
        dev = DEVELOPMENTS_BY_ID.get(payload.development_id)
        if not dev:
            raise HTTPException(404, "Desarrollo no encontrado")

    # Cache 24h por (advisor, contact, dev|none)
    cache_key = hashlib.md5(
        f"rag|{user.user_id}|{payload.contact_id}|{payload.development_id or 'none'}|v1.0".encode()
    ).hexdigest()
    if not payload.force:
        cached = await db.asesor_argumentarios_rag.find_one(
            {"cache_key": cache_key}, {"_id": 0},
        )
        if cached and cached.get("expires_at"):
            exp = cached["expires_at"]
            if isinstance(exp, datetime) and exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            if exp > _now():
                # Serialize datetimes for JSON
                for k in ("generated_at", "expires_at"):
                    v = cached.get(k)
                    if isinstance(v, datetime):
                        cached[k] = v.isoformat()
                return {**cached, "cache_hit": True}

    # Budget cap shared con narrative_engine ($5/sesión, 1h rolling)
    from narrative_engine import _session_budget_used, SESSION_BUDGET_CAP_USD
    used = await _session_budget_used(db)
    if used >= SESSION_BUDGET_CAP_USD:
        raise HTTPException(429, f"Cap LLM alcanzado ({used:.2f}/${SESSION_BUDGET_CAP_USD}). Reintenta en 1h.")

    # RAG retrieve top-5
    from rag_engine import semantic_search
    interest_hint = " ".join((contact.get("tags") or [])[:5])
    if dev:
        rag_q = f"argumentario venta {dev.get('name','')} {dev.get('colonia','')} {interest_hint}"
        rag_res = await semantic_search(db, rag_q, top_k=5, scope="development", entity_id=payload.development_id)
    else:
        rag_q = f"propiedades CDMX {interest_hint} contacto {contact.get('tipo','')} {contact.get('temperatura','')}"
        rag_res = await semantic_search(db, rag_q, top_k=5)
    chunks = rag_res.get("results", []) or []

    # Claude prompt
    contact_block = (
        f"CONTACTO:\n"
        f"  - Nombre: {contact.get('first_name','')} {contact.get('last_name','')}\n"
        f"  - Tipo: {contact.get('tipo','?')}\n"
        f"  - Temperatura: {contact.get('temperatura','?')}\n"
        f"  - Tags: {', '.join(contact.get('tags', []))}\n"
        f"  - Notas: {(contact.get('notas') or '')[:300]}\n"
    )
    dev_block = ""
    if dev:
        dev_block = (
            f"\nDESARROLLO:\n"
            f"  - Nombre: {dev.get('name','')}\n"
            f"  - Colonia: {dev.get('colonia','')}, {dev.get('alcaldia','')}\n"
            f"  - Etapa: {dev.get('stage','')}\n"
            f"  - Precio desde: ${dev.get('price_from',0):,} MXN\n"
            f"  - Amenidades: {', '.join(dev.get('amenities',[])[:6])}\n"
        )
    rag_lines = ["\nCONTEXTO RAG (cita estos chunks por chunk_id):"]
    for i, c in enumerate(chunks, 1):
        snip = (c.get("snippet") or "")[:280].replace("\n", " ")
        rag_lines.append(
            f"  [{i}] chunk_id={c.get('chunk_id')} · type={c.get('source_type')} · {c.get('title','')} → {snip}"
        )
    user_prompt = (
        f"Genera un argumentario de venta para {contact.get('first_name','')} "
        f"({contact.get('temperatura','')}, {contact.get('tipo','')}). "
        + ("Foco en el desarrollo " + dev["name"] + ". " if dev else "Sin desarrollo específico aún. ")
        + "Output JSON.\n\n"
        + contact_block + dev_block + "\n".join(rag_lines)
    )

    # Claude call
    import json as _json
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=os.environ.get("EMERGENT_LLM_KEY"),
            session_id=f"argrag_{cache_key}",
            system_message=_ARG_RAG_SYS,
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")
        raw = await chat.send_message(UserMessage(text=user_prompt))
        text = (raw or "").strip()
        if text.startswith("```"):
            lines = text.splitlines()
            if lines and lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].startswith("```"):
                lines = lines[:-1]
            text = "\n".join(lines).strip()
        try:
            parsed = _json.loads(text)
        except Exception:
            start = text.find("{"); end = text.rfind("}")
            parsed = _json.loads(text[start:end+1])
    except Exception as e:
        raise HTTPException(502, f"Claude error: {type(e).__name__}: {e}")

    # Defensive: ensure citations[] field
    citations = parsed.get("citations") or []
    if not isinstance(citations, list):
        citations = []

    # Cost approximation
    in_tokens = (len(user_prompt) + len(_ARG_RAG_SYS)) // 4
    out_tokens = len(text) // 4
    cost = (in_tokens / 1000.0) * 0.003 + (out_tokens / 1000.0) * 0.015

    now = _now()
    result = {
        "id": uuid.uuid4().hex,
        "cache_key": cache_key,
        "advisor_user_id": user.user_id,
        "contact_id": payload.contact_id,
        "development_id": payload.development_id,
        "hook": parsed.get("hook", ""),
        "paragraphs": parsed.get("paragraphs", []) or [],
        "call_to_action": parsed.get("call_to_action", ""),
        "whatsapp_text": (parsed.get("whatsapp_text") or "")[:700],
        "citations": citations,
        "rag_chunks_used": [
            {"chunk_id": c.get("chunk_id"), "source_type": c.get("source_type"),
             "title": c.get("title"), "snippet": (c.get("snippet") or "")[:200],
             "metadata": c.get("metadata", {})} for c in chunks
        ],
        "prompt_version": "v1.0",
        "model": "claude-sonnet-4-5-20250929",
        "input_tokens": in_tokens,
        "output_tokens": out_tokens,
        "cost_usd": round(cost, 6),
        "generated_at": now,
        "expires_at": now + timedelta(hours=24),
    }
    # Persist (also log into ie_narratives for budget tracking)
    await db.asesor_argumentarios_rag.insert_one(dict(result))
    await db.ie_narratives.insert_one({
        "id": uuid.uuid4().hex, "scope": "argumentario_rag", "entity_id": result["id"],
        "narrative_text": result["hook"], "prompt_version": "v1.0",
        "scores_snapshot": {}, "generated_at": now,
        "expires_at": result["expires_at"], "model": result["model"],
        "input_tokens": in_tokens, "output_tokens": out_tokens, "cost_usd": result["cost_usd"],
    })
    out = {k: v for k, v in result.items() if k != "_id"}
    out["generated_at"] = out["generated_at"].isoformat()
    out["expires_at"] = out["expires_at"].isoformat()
    # Phase F0.11 — ML training seed for RAG quality
    try:
        from observability import emit_ml_event
        await emit_ml_event(
            db, event_type="argumentario_rag_generated",
            user_id=user.user_id, org_id=getattr(user, "tenant_id", None), role=user.role,
            context={"contact_id": payload.contact_id, "development_id": payload.development_id,
                     "rag_chunks_count": len(chunks), "cost_usd": result["cost_usd"]},
            ai_decision={"hook": result["hook"][:120], "citations_count": len(citations)},
            user_action={},
        )
    except Exception: pass
    return {**out, "cache_hit": False}


# ─── Briefing diario (stub, regenerates on demand) ────────────────────────────
@router.post("/briefing/daily")
async def daily_briefing(request: Request):
    user = await require_advisor(request)
    db = get_db(request)

    tareas_hoy = await db.asesor_tareas.find({"owner_id": user.user_id, "done": False}).sort("due_at", 1).limit(5).to_list(5)
    leads_frios = await db.asesor_contactos.find({"owner_id": user.user_id, "temperatura": "frio"}).limit(3).to_list(3)
    ops_vence = await db.asesor_operaciones.find({"owner_id": user.user_id, "status": {"$in": ["cerrada", "pagando"]}}).limit(3).to_list(3)

    today = _now().strftime("%d de %B")
    parts = [f"Buenos días {user.name.split()[0]}, tu briefing del {today}:\n"]
    if tareas_hoy:
        parts.append(f"Tareas prioritarias ({len(tareas_hoy)}):")
        for t in tareas_hoy[:3]:
            parts.append(f"  · {t['titulo']}")
    if leads_frios:
        parts.append(f"\nLeads fríos para reactivar: {', '.join(l['first_name'] for l in leads_frios[:3])}")
    if ops_vence:
        parts.append(f"\nOperaciones en seguimiento: {len(ops_vence)} pendientes de cierre.")
    parts.append("\nInventario nuevo: revisa los lanzamientos de la semana en el marketplace.")
    parts.append("\nAcción sugerida top: contacta a los 3 leads fríos antes de las 11am.")

    text = "\n".join(parts)

    doc = {
        "id": _uid("brf"),
        "user_id": user.user_id,
        "date": _now().strftime("%Y-%m-%d"),
        "text": text,
        "created_at": _now(),
    }
    # Replace today's briefing
    await db.asesor_briefings.delete_many({"user_id": user.user_id, "date": doc["date"]})
    await db.asesor_briefings.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


# ─── P4 · Voice Briefing (TTS) + Smart Digest ────────────────────────────────────
# Rate-limit in-memory para digest send-now: 3/h/usuario (best-effort · FAIL-OPEN abierto).
_digest_send_buckets: dict = {}


def _check_digest_send_rate(user_id: str, limit: int = 3, window_s: int = 3600) -> bool:
    import time
    now = time.monotonic()
    bucket = [t for t in _digest_send_buckets.get(user_id, []) if now - t < window_s]
    if len(bucket) >= limit:
        _digest_send_buckets[user_id] = bucket
        return False
    bucket.append(now)
    _digest_send_buckets[user_id] = bucket
    return True


@router.post("/briefing/voice")
async def briefing_voice(request: Request):
    """P4 · Lee el briefing del día en voz. Reusa VoiceAtlaxEngine.synthesize (TTS ·
    stub-aware sin ELEVENLABS · trackea ai_budget internamente). _assert owner ·
    FAIL-OPEN: si TTS no disponible retorna {ok:False, reason} (200 · el botón se deshabilita)."""
    user = await require_advisor(request)
    db = get_db(request)
    # Texto del briefing del día (último doc). Si no hay, no sintetiza.
    b = await db.asesor_briefings.find_one(
        {"user_id": user.user_id}, {"_id": 0, "text": 1}, sort=[("date", -1)])
    text = (b or {}).get("text", "").strip() if b else ""
    if not text:
        return {"ok": False, "reason": "no_briefing", "audio_id": None, "audio_url": None}
    try:
        from voice_atlax_engine import VoiceAtlaxEngine
        engine = VoiceAtlaxEngine(db)
        result = await engine.synthesize(text[:2500], session_token=f"asesor_briefing:{user.user_id}")
        if not result.get("ok"):
            return {"ok": False, "reason": result.get("error", "tts_unavailable"),
                    "audio_id": None, "audio_url": None}
        return {"ok": True, "audio_id": result.get("audio_id"),
                "audio_url": result.get("audio_url_relative")}
    except Exception as e:
        import logging
        logging.getLogger("dmx.advisor").warning(f"[briefing_voice] {e}")
        return {"ok": False, "reason": "tts_error", "audio_id": None, "audio_url": None}


@router.get("/digest/preview")
async def digest_preview(request: Request):
    """P4 · Arma el digest del día SIN enviarlo (para previsualizar). _assert owner."""
    user = await require_advisor(request)
    db = get_db(request)
    from asesor_digest_engine import build_daily_digest, get_digest_prefs
    digest = await build_daily_digest(db, user.user_id, getattr(user, "tenant_id", None))
    prefs = await get_digest_prefs(db, user.user_id)
    return {"digest": digest, "prefs": prefs}


@router.post("/digest/send-now")
async def digest_send_now(request: Request):
    """P4 · Envía el digest ahora (override · ignora dedup diario). Rate-limit 3/h."""
    user = await require_advisor(request)
    db = get_db(request)
    if not _check_digest_send_rate(user.user_id):
        raise HTTPException(429, "Límite alcanzado: máximo 3 envíos por hora.")
    from asesor_digest_engine import send_digest
    return await send_digest(db, user.user_id, getattr(user, "tenant_id", None), force=True)


@router.get("/digest/prefs")
async def digest_get_prefs(request: Request):
    """P4 · Lee preferencias de digest del asesor (toggle + canales). _assert owner."""
    user = await require_advisor(request)
    db = get_db(request)
    from asesor_digest_engine import get_digest_prefs
    return await get_digest_prefs(db, user.user_id)


@router.patch("/digest/prefs")
async def digest_set_prefs(request: Request):
    """P4 · Actualiza preferencias de digest (enabled + canales). _assert owner."""
    user = await require_advisor(request)
    db = get_db(request)
    try:
        patch = await request.json()
        if not isinstance(patch, dict):
            patch = {}
    except Exception:
        patch = {}
    from asesor_digest_engine import set_digest_prefs
    return await set_digest_prefs(db, user.user_id, patch)


# ─── Leaderboard + public profile ─────────────────────────────────────────────
@router.get("/leaderboard")
async def leaderboard(request: Request, scope: str = "global", limit: int = 20):
    user = await require_advisor(request)
    db = get_db(request)
    items = await db.asesor_profiles.find({}, {"_id": 0, "user_id": 1, "full_name": 1, "brokerage": 1, "score_elo": 1, "cierres_total": 1, "public_slug": 1, "colonias": 1, "xp": 1}).sort("score_elo", -1).limit(limit).to_list(limit)
    return items


@router.get("/perfil-publico/{slug}")
async def public_profile(slug: str, request: Request):
    db = get_db(request)
    p = await db.asesor_profiles.find_one({"public_slug": slug}, {"_id": 0})
    if not p: raise HTTPException(404, "Perfil no encontrado")
    # Hide private counts
    return {
        "full_name": p.get("full_name"),
        "brokerage": p.get("brokerage"),
        "license_ampi": p.get("license_ampi"),
        "colonias": p.get("colonias", []),
        "languages": p.get("languages", []),
        "bio": p.get("bio", ""),
        "score_elo": p.get("score_elo", 1000),
        "cierres_total": p.get("cierres_total", 0),
        "badges": p.get("badges", []),
        "public_slug": p.get("public_slug"),
    }


# ─── Seed demo data (dev convenience) ────────────────────────────────────────
@router.post("/_seed-demo")
async def seed_demo(request: Request):
    """Seed demo contactos/busquedas/captaciones/tareas/operaciones for current advisor."""
    user = await require_advisor(request)
    db = get_db(request)

    # Skip if already seeded
    if await db.asesor_contactos.count_documents({"owner_id": user.user_id, "seed": True}) > 0:
        return {"message": "Demo ya existente", "skipped": True}

    # Ensure profile is populated
    await db.asesor_profiles.update_one(
        {"user_id": user.user_id},
        {"$set": {
            "full_name": user.name or "Asesor Demo",
            "brokerage": "Pulppo Real Estate",
            "license_ampi": "AMPI-CDMX-01234",
            "colonias": ["polanco", "condesa", "roma-norte"],
            "languages": ["es-MX", "en-US"],
            "bio": "Especialista en preventa Polanco y Roma con 8 años de experiencia.",
            "profile_completed": True,
        }},
        upsert=True,
    )

    demo_contactos = [
        {"first_name": "Laura", "last_name": "Martínez", "phones": ["+525512345100"], "emails": ["laura.m@demo.mx"], "tipo": "comprador", "temperatura": "caliente", "etapa": "visita", "tags": ["Polanco", "Premium"]},
        {"first_name": "Ricardo", "last_name": "Ortiz", "phones": ["+525512345101"], "emails": ["r.ortiz@demo.mx"], "tipo": "inversor", "temperatura": "tibio", "etapa": "contactado", "tags": ["Preventa", "Santa Fe"]},
        {"first_name": "Mariana", "last_name": "López", "phones": ["+525512345102"], "emails": ["m.lopez@demo.mx"], "tipo": "comprador", "temperatura": "frio", "etapa": "nuevo", "tags": ["Primera vivienda"]},
        {"first_name": "Carlos", "last_name": "Vázquez", "phones": ["+525512345103"], "emails": ["carlos.v@demo.mx"], "tipo": "vendedor", "temperatura": "cliente", "etapa": "cerrado", "tags": ["Condesa", "Depto 120m²"]},
        {"first_name": "Sofía", "last_name": "Ramírez", "phones": ["+525512345104"], "emails": ["sofia.r@demo.mx"], "tipo": "comprador", "temperatura": "caliente", "etapa": "negociacion", "tags": ["Roma Norte", "Pet friendly"]},
        {"first_name": "Alejandro", "last_name": "Flores", "phones": ["+525512345105"], "emails": ["a.flores@demo.mx"], "tipo": "inversor", "temperatura": "tibio", "etapa": "nuevo", "tags": ["Yield"]},
    ]
    ids_contactos = []
    for c in demo_contactos:
        doc = {"id": _uid("contacto"), "owner_id": user.user_id, "created_at": _now(), "seed": True,
               "phones_norm": [_norm_phone(p) for p in c["phones"]],
               "fuente": "referido", "notas": "", **c}
        await db.asesor_contactos.insert_one(dict(doc))
        ids_contactos.append(doc["id"])

    busqs = [
        {"contacto_id": ids_contactos[0], "tipos": ["dept"], "recamaras_min": 2, "colonias": ["polanco", "lomas-chapultepec"], "precio_min": 12000000, "precio_max": 18000000, "amenidades": ["gym", "alberca"], "urgencia": "alta", "fuente": "referido", "stage": "visitando", "visits": 2, "offers": 0},
        {"contacto_id": ids_contactos[1], "tipos": ["dept"], "recamaras_min": 1, "colonias": ["santa-fe"], "precio_min": 5000000, "precio_max": 9000000, "amenidades": ["cowork"], "urgencia": "media", "fuente": "web", "stage": "buscando", "visits": 0, "offers": 0},
        {"contacto_id": ids_contactos[4], "tipos": ["dept"], "recamaras_min": 2, "colonias": ["roma-norte", "condesa"], "precio_min": 6000000, "precio_max": 11000000, "amenidades": ["pet", "roof"], "urgencia": "alta", "fuente": "referido", "stage": "ofertando", "visits": 3, "offers": 1},
    ]
    for b in busqs:
        doc = {"id": _uid("busq"), "owner_id": user.user_id, "created_at": _now(), "seed": True,
               "matched_dev_ids": [], "notas": "", **b}
        await db.asesor_busquedas.insert_one(dict(doc))

    capts = [
        {"direccion": "Medellín 120, Roma Norte", "tipo_operacion": "venta", "precio_sugerido": 9800000, "colonia_id": "roma-norte", "tipo_inmueble": "dept", "recamaras": 2, "banos": 2, "estacionamientos": 1, "m2_construidos": 95, "propietario_nombre": "Elena Ruiz", "propietario_telefono": "+525512345200", "urgencia": "media", "stage": "encuentro"},
        {"direccion": "Campos Elíseos 200, Polanco", "tipo_operacion": "venta", "precio_sugerido": 28500000, "colonia_id": "polanco", "tipo_inmueble": "dept", "recamaras": 3, "banos": 3, "estacionamientos": 2, "m2_construidos": 180, "propietario_nombre": "Gerardo Alba", "propietario_telefono": "+525512345201", "urgencia": "alta", "stage": "valuacion"},
    ]
    for c in capts:
        doc = {"id": _uid("capt"), "owner_id": user.user_id, "created_at": _now(), "seed": True,
               "comision_pct": 4.0, "exclusividad_meses": 6, "stage_payloads": {}, "foto_urls": [], "notas": "", **c}
        await db.asesor_captaciones.insert_one(dict(doc))

    tareas = [
        {"titulo": "Llamar a Laura Martínez para confirmar visita sábado", "tipo": "client", "entity_id": ids_contactos[0], "entity_label": "Laura Martínez", "due_at": (_now() + timedelta(hours=3)).isoformat(), "prioridad": "alta"},
        {"titulo": "Enviar ACM Polanco a Gerardo", "tipo": "capture", "entity_label": "Campos Elíseos 200", "due_at": (_now() + timedelta(days=1)).isoformat(), "prioridad": "alta"},
        {"titulo": "Subir fotos nueva captación Roma Norte", "tipo": "capture", "entity_label": "Medellín 120", "due_at": (_now() + timedelta(days=2)).isoformat(), "prioridad": "media"},
        {"titulo": "Revisar match scores búsqueda Sofía Ramírez", "tipo": "search", "entity_label": "Sofía Ramírez", "due_at": (_now() - timedelta(days=1)).isoformat(), "prioridad": "media"},  # vencida
    ]
    for t in tareas:
        doc = {"id": _uid("tarea"), "owner_id": user.user_id, "done": False, "created_at": _now(), "seed": True,
               "notas": "", **t}
        await db.asesor_tareas.insert_one(dict(doc))

    ops = [
        {"side": "ambos", "contacto_id": ids_contactos[3], "desarrollo_id": "altavista-polanco", "unidad_id": "altavista-polanco-14B", "valor_cierre": 21964800, "currency": "MXN", "comision_pct": 4.0, "fecha_cierre": (_now() + timedelta(days=30)).strftime("%Y-%m-%d"), "status": "oferta_aceptada"},
        {"side": "vendedor", "contacto_id": ids_contactos[2], "desarrollo_id": "tamaulipas-89", "unidad_id": None, "valor_cierre": 7500000, "currency": "MXN", "comision_pct": 3.0, "fecha_cierre": (_now() + timedelta(days=90)).strftime("%Y-%m-%d"), "status": "propuesta"},
    ]
    for o in ops:
        base = o["valor_cierre"] * (o["comision_pct"] / 100.0)
        iva = base * 0.16
        doc = {"id": _uid("op"), "code": _unique_op_code(), "owner_id": user.user_id, "created_at": _now(), "seed": True,
               "comision_base": round(base, 2), "iva": round(iva, 2), "comision_total": round(base + iva, 2),
               "platform_split": round(base * 0.20, 2), "asesor_split": round(base * 0.80, 2), "notas": "", **o}
        await db.asesor_operaciones.insert_one(dict(doc))

    return {"message": "Demo seed creado", "contactos": len(ids_contactos), "busquedas": len(busqs), "captaciones": len(capts), "tareas": len(tareas), "operaciones": len(ops)}


# ════════════════════════════════════════════════════════════════════════════
# P5.B · UX bundle · Bulk + Pinned + Custom Widgets + Recent
# Sección NUEVA · aditiva · NO modifica endpoints P1-P4 (diff=0 arriba de esta línea).
# Reglas: bulk → _assert owner CADA id (el filtro owner_id en el query lo garantiza ·
# imposible mutar cross-tenant) · widgets/recent → upsert thin en colecciones propias
# (NO toca asesor_profiles core).
# ════════════════════════════════════════════════════════════════════════════

# Paneles configurables del Command Center (orden por defecto).
WIDGET_PANELS = ["kpis", "agents", "queue", "leads", "perf", "briefing", "recent"]


class BulkContactosIn(BaseModel):
    ids: List[str]
    action: str  # archive | unarchive | set_temp | assign_task
    payload: Optional[dict] = None


class WidgetsConfigIn(BaseModel):
    order: Optional[List[str]] = None    # ids de panel en orden
    hidden: Optional[List[str]] = None   # ids de panel ocultos


class RecentTrackIn(BaseModel):
    entity_type: str                     # lead | page | busqueda | operacion ...
    entity_id: str
    label: Optional[str] = ""
    url: Optional[str] = None


# ─── Bulk actions sobre contactos ───────────────────────────────────────────────
@router.post("/contactos/bulk")
async def bulk_contactos(payload: BulkContactosIn, request: Request):
    """Acción en lote sobre N leads. _assert owner CADA id vía filtro owner_id en el
    query (un id de otro asesor simplemente no matchea → cero mutación cross-tenant).
    Acciones: archive · unarchive · set_temp{temperatura} · assign_task{titulo,due_at,prioridad?}."""
    user = await require_advisor(request)
    db = get_db(request)
    ids = [i for i in (payload.ids or []) if i][:200]
    if not ids:
        raise HTTPException(400, "ids vacío")
    owner_flt = {"id": {"$in": ids}, "owner_id": user.user_id}
    action = payload.action
    pl = payload.payload or {}

    if action == "archive":
        res = await db.asesor_contactos.update_many(owner_flt, {"$set": {"archived": True, "archived_at": _now()}})
        affected = res.modified_count
    elif action == "unarchive":
        res = await db.asesor_contactos.update_many(owner_flt, {"$set": {"archived": False}, "$unset": {"archived_at": ""}})
        affected = res.modified_count
    elif action == "set_temp":
        temp = pl.get("temperatura")
        if temp not in TEMP_CONTACTO:
            raise HTTPException(400, "temperatura inválida")
        res = await db.asesor_contactos.update_many(owner_flt, {"$set": {"temperatura": temp}})
        affected = res.modified_count
    elif action == "assign_task":
        titulo = (pl.get("titulo") or "").strip()
        due_at = pl.get("due_at")
        if not titulo or not due_at:
            raise HTTPException(400, "assign_task requiere titulo + due_at")
        prioridad = pl.get("prioridad") if pl.get("prioridad") in PRIORITY else "media"
        # Sólo contactos que son del owner (re-confirma ownership por cada id).
        owned = await db.asesor_contactos.find(owner_flt, {"_id": 0, "id": 1, "first_name": 1, "last_name": 1}).to_list(200)
        docs = []
        for c in owned:
            docs.append({
                "id": _uid("tarea"), "owner_id": user.user_id, "done": False, "created_at": _now(),
                "titulo": titulo, "tipo": "lead", "entity_id": c["id"],
                "entity_label": (f"{c.get('first_name','')} {c.get('last_name','')}").strip() or "Lead",
                "due_at": due_at, "prioridad": prioridad, "notas": "",
            })
        if docs:
            await db.asesor_tareas.insert_many(docs)
        affected = len(docs)
    else:
        raise HTTPException(400, f"acción no soportada: {action}")

    # Audit log (best-effort · no rompe).
    try:
        from audit_log import log_mutation
        await log_mutation(db, user, f"bulk_{action}", "contacto", ",".join(ids[:20]),
                           before=None, after={"action": action, "count": affected}, request=request)
    except Exception:
        pass
    return {"ok": True, "action": action, "requested": len(ids), "affected": affected}


# ─── Pin / unpin contacto ───────────────────────────────────────────────────────
@router.post("/contactos/{cid}/pin")
async def pin_contacto(cid: str, request: Request):
    """Toggle pinned de un lead. _assert owner. Pinned al top lo ordena el cliente
    (list_contactos devuelve el campo `pinned` en el doc · P1-P4 diff=0)."""
    user = await require_advisor(request)
    db = get_db(request)
    c = await db.asesor_contactos.find_one({"id": cid, "owner_id": user.user_id}, {"_id": 0, "pinned": 1})
    if c is None:
        raise HTTPException(404, "No encontrado")
    new_val = not bool(c.get("pinned"))
    await db.asesor_contactos.update_one(
        {"id": cid, "owner_id": user.user_id},
        {"$set": {"pinned": new_val, "pinned_at": _now() if new_val else None}},
    )
    return {"id": cid, "pinned": new_val}


# ─── Custom widgets config (Command Center) ──────────────────────────────────────
@router.get("/dashboard/widgets-config")
async def get_widgets_config(request: Request):
    """Config de paneles del Command Center del asesor. upsert thin · colección propia
    asesor_dashboard_widgets (NO toca asesor_profiles core). Default si no existe."""
    user = await require_advisor(request)
    db = get_db(request)
    doc = await db.asesor_dashboard_widgets.find_one({"user_id": user.user_id}, {"_id": 0})
    if not doc:
        return {"order": WIDGET_PANELS, "hidden": []}
    return {"order": doc.get("order") or WIDGET_PANELS, "hidden": doc.get("hidden") or []}


@router.patch("/dashboard/widgets-config")
async def patch_widgets_config(payload: WidgetsConfigIn, request: Request):
    """Actualiza orden/ocultos de paneles. Valida ids contra WIDGET_PANELS. upsert thin."""
    user = await require_advisor(request)
    db = get_db(request)
    patch = {}
    if payload.order is not None:
        patch["order"] = [p for p in payload.order if p in WIDGET_PANELS]
    if payload.hidden is not None:
        patch["hidden"] = [p for p in payload.hidden if p in WIDGET_PANELS]
    if not patch:
        raise HTTPException(400, "Nada que actualizar")
    patch["updated_at"] = _now()
    await db.asesor_dashboard_widgets.update_one(
        {"user_id": user.user_id}, {"$set": patch}, upsert=True,
    )
    doc = await db.asesor_dashboard_widgets.find_one({"user_id": user.user_id}, {"_id": 0})
    return {"order": doc.get("order") or WIDGET_PANELS, "hidden": doc.get("hidden") or []}


# ─── Recent items (visto recientemente · TTL 30d) ────────────────────────────────
_recent_idx_ready = False


async def _ensure_recent_index(db):
    """Crea índices de asesor_recent de forma lazy + idempotente (NO toca server.py
    startup · A owner). TTL 30d sobre viewed_at. FAIL-OPEN."""
    global _recent_idx_ready
    if _recent_idx_ready:
        return
    try:
        await db.asesor_recent.create_index([("owner_id", 1), ("entity_type", 1), ("entity_id", 1)], unique=True)
        await db.asesor_recent.create_index([("owner_id", 1), ("viewed_at", -1)])
        await db.asesor_recent.create_index("viewed_at", expireAfterSeconds=2592000)  # 30d
        _recent_idx_ready = True
    except Exception:
        pass


@router.post("/recent")
async def track_recent(payload: RecentTrackIn, request: Request):
    """Registra/actualiza un item visto recientemente (upsert por owner+entity).
    TTL 30d (lazy index). FAIL-OPEN: nunca rompe la navegación."""
    user = await require_advisor(request)
    db = get_db(request)
    await _ensure_recent_index(db)
    try:
        await db.asesor_recent.update_one(
            {"owner_id": user.user_id, "entity_type": payload.entity_type, "entity_id": payload.entity_id},
            {"$set": {"label": payload.label or "", "url": payload.url, "viewed_at": _now()}},
            upsert=True,
        )
    except Exception:
        return {"ok": False}
    return {"ok": True}


@router.get("/recent")
async def list_recent(request: Request, limit: int = 5):
    """Últimos N items vistos (default 5). Orden por viewed_at desc · TTL 30d."""
    user = await require_advisor(request)
    db = get_db(request)
    limit = max(1, min(limit, 20))
    items = await db.asesor_recent.find(
        {"owner_id": user.user_id}, {"_id": 0, "owner_id": 0},
    ).sort("viewed_at", -1).limit(limit).to_list(limit)
    for it in items:
        ts = it.get("viewed_at")
        if isinstance(ts, datetime):
            it["viewed_at"] = ts.isoformat()
    return items
