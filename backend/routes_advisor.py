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


# ─── Pydantic models ──────────────────────────────────────────────────────────
class ContactoIn(BaseModel):
    first_name: str
    last_name: Optional[str] = ""
    phones: List[str] = []
    emails: List[str] = []
    tipo: str = "comprador"
    temperatura: str = "frio"
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
    tags: Optional[List[str]] = None
    notas: Optional[str] = None

class TimelineIn(BaseModel):
    kind: str  # call|visit|email|whatsapp|nota
    body: str

class BusquedaIn(BaseModel):
    contacto_id: str
    tipos: List[str] = ["dept"]
    recamaras_min: int = 1
    colonias: List[str] = []
    precio_min: Optional[int] = None
    precio_max: Optional[int] = None
    amenidades: List[str] = []
    urgencia: str = "media"
    fuente: str = "referido"
    notas: Optional[str] = ""

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
    license_ampi: Optional[str] = None
    colonias: Optional[List[str]] = None
    languages: Optional[List[str]] = None
    bio: Optional[str] = None
    phone: Optional[str] = None


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
        # first time → bootstrap empty profile
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
            "public_slug": (user.name or "asesor").lower().replace(" ", "-")[:40] + "-" + user.user_id[-4:],
            "created_at": _now(),
        }
        await db.asesor_profiles.insert_one(prof)
        prof.pop("_id", None)
    return prof


@router.patch("/profile")
async def patch_profile(payload: AsesorProfilePatch, request: Request):
    user = await require_advisor(request)
    db = get_db(request)
    patch = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not patch:
        raise HTTPException(400, "Sin cambios")
    await db.asesor_profiles.update_one({"user_id": user.user_id}, {"$set": patch}, upsert=True)
    prof = await db.asesor_profiles.find_one({"user_id": user.user_id}, {"_id": 0})
    return prof


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

    return {
        "tareas_hoy": tareas,
        "leads_recientes": leads,
        "comisiones_por_cobrar": comisiones_por_cobrar,
        "briefing": briefings[0] if briefings else None,
        "counts": counts,
    }


# ─── Contactos ────────────────────────────────────────────────────────────────
@router.get("/contactos")
async def list_contactos(request: Request, q: Optional[str] = None, tipo: Optional[str] = None, temp: Optional[str] = None):
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
    return items


@router.post("/contactos")
async def create_contacto(payload: ContactoIn, request: Request):
    user = await require_advisor(request)
    db = get_db(request)
    if payload.tipo not in TIPO_CONTACTO: raise HTTPException(400, "tipo inválido")
    if payload.temperatura not in TEMP_CONTACTO: raise HTTPException(400, "temperatura inválida")
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
    timeline = await db.asesor_contacto_timeline.find({"contacto_id": cid}, {"_id": 0}).sort("ts", -1).limit(100).to_list(100)
    c["timeline"] = timeline
    return c


@router.patch("/contactos/{cid}")
async def patch_contacto(cid: str, payload: ContactoPatch, request: Request):
    user = await require_advisor(request)
    db = get_db(request)
    patch = {k: v for k, v in payload.model_dump().items() if v is not None}
    if "phones" in patch:
        patch["phones_norm"] = [_norm_phone(p) for p in patch["phones"]]
    res = await db.asesor_contactos.update_one({"id": cid, "owner_id": user.user_id}, {"$set": patch})
    if not res.matched_count: raise HTTPException(404, "No encontrado")
    c = await db.asesor_contactos.find_one({"id": cid}, {"_id": 0})
    return c


@router.delete("/contactos/{cid}")
async def delete_contacto(cid: str, request: Request):
    user = await require_advisor(request)
    db = get_db(request)
    r = await db.asesor_contactos.update_one({"id": cid, "owner_id": user.user_id}, {"$set": {"deleted_at": _now()}})
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
    """Deterministic 5-dim matcher: price 30% + zone 25% + amenities 20% + beds 15% + urgency 10%."""
    from data_developments import DEVELOPMENTS
    user = await require_advisor(request)
    db = get_db(request)
    b = await db.asesor_busquedas.find_one({"id": bid, "owner_id": user.user_id}, {"_id": 0})
    if not b: raise HTTPException(404, "No encontrada")

    out = []
    for d in DEVELOPMENTS:
        score = 0
        rationale = []
        # price
        pmin = b.get("precio_min") or 0
        pmax = b.get("precio_max") or 10**9
        if pmin <= d["price_from"] <= pmax or pmin <= d["price_to"] <= pmax:
            score += 30; rationale.append("Dentro de rango de precio")
        # zone (colonia)
        if b.get("colonias") and d["colonia_id"] in b["colonias"]:
            score += 25; rationale.append(f"Colonia preferida: {d['colonia']}")
        # amenities overlap
        want_amen = set(b.get("amenidades", []))
        have_amen = set(d.get("amenities", []))
        if want_amen:
            overlap = len(want_amen & have_amen)
            pct = overlap / max(1, len(want_amen))
            score += int(pct * 20)
            if overlap: rationale.append(f"{overlap} amenidades coincidentes")
        # beds
        if b.get("recamaras_min", 0) <= d["bedrooms_range"][1]:
            score += 15; rationale.append(f"Ofrece {d['bedrooms_range'][0]}-{d['bedrooms_range'][1]} recámaras")
        # urgency/stage alignment
        if b.get("urgencia") == "alta" and d["stage"] in ("entrega_inmediata", "en_construccion"):
            score += 10; rationale.append("Entrega acelerada alineada con urgencia")
        elif b.get("urgencia") != "alta":
            score += 5

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
async def list_tareas(request: Request, scope: Optional[str] = None):
    user = await require_advisor(request)
    db = get_db(request)
    flt = {"owner_id": user.user_id, "done": {"$ne": True}}
    if scope:
        # scope group: property|capture|search → property; client|lead → client; general → general
        groups = {"property": ["property", "capture", "search"], "client": ["client", "lead"], "general": ["general"]}
        if scope in groups: flt["tipo"] = {"$in": groups[scope]}
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
    await db.asesor_operaciones.update_one({"id": oid}, {"$set": upd})
    # Closure: grant XP + increment cierres
    if payload.status == "cerrada":
        await db.asesor_profiles.update_one({"user_id": user.user_id}, {"$inc": {"xp": 250, "cierres_total": 1}}, upsert=True)
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
        }},
        upsert=True,
    )

    demo_contactos = [
        {"first_name": "Laura", "last_name": "Martínez", "phones": ["+525512345100"], "emails": ["laura.m@demo.mx"], "tipo": "comprador", "temperatura": "caliente", "tags": ["Polanco", "Premium"]},
        {"first_name": "Ricardo", "last_name": "Ortiz", "phones": ["+525512345101"], "emails": ["r.ortiz@demo.mx"], "tipo": "inversor", "temperatura": "tibio", "tags": ["Preventa", "Santa Fe"]},
        {"first_name": "Mariana", "last_name": "López", "phones": ["+525512345102"], "emails": ["m.lopez@demo.mx"], "tipo": "comprador", "temperatura": "frio", "tags": ["Primera vivienda"]},
        {"first_name": "Carlos", "last_name": "Vázquez", "phones": ["+525512345103"], "emails": ["carlos.v@demo.mx"], "tipo": "vendedor", "temperatura": "cliente", "tags": ["Condesa", "Depto 120m²"]},
        {"first_name": "Sofía", "last_name": "Ramírez", "phones": ["+525512345104"], "emails": ["sofia.r@demo.mx"], "tipo": "comprador", "temperatura": "caliente", "tags": ["Roma Norte", "Pet friendly"]},
        {"first_name": "Alejandro", "last_name": "Flores", "phones": ["+525512345105"], "emails": ["a.flores@demo.mx"], "tipo": "inversor", "temperatura": "tibio", "tags": ["Yield"]},
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
