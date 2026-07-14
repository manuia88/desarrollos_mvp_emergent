"""SALA DE INVERSIONISTAS — rutas (superadmin only).

  GET    /api/superadmin/investor-room/resumen         → todo el tablero (cada bloque con fuente)
  GET    /api/superadmin/investor-room/entrevistas     → registro de entrevistas de usuarios
  POST   /api/superadmin/investor-room/entrevistas     → registrar entrevista
  PATCH  /api/superadmin/investor-room/entrevistas/{id}→ editar
  DELETE /api/superadmin/investor-room/entrevistas/{id}
  GET    /api/superadmin/investor-room/pipeline        → pipeline de pilotos/LOIs
  POST   /api/superadmin/investor-room/pipeline        → agregar prospecto
  PATCH  /api/superadmin/investor-room/pipeline/{id}   → mover de etapa / editar
  DELETE /api/superadmin/investor-room/pipeline/{id}
  PATCH  /api/superadmin/investor-room/checklist       → marcar ítem legal hecho/pendiente
  PATCH  /api/superadmin/investor-room/supuestos       → editar supuestos (TAM/burn/caja)
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from permissions import require_superadmin
from investor_room import resumen, ETAPAS_PIPELINE, CHECKLIST_LEGAL, SUPUESTOS_DEFAULT

router = APIRouter(prefix="/api/superadmin/investor-room")

_ETAPAS_VALIDAS = {e["id"] for e in ETAPAS_PIPELINE}
_CHECKLIST_IDS = {c["id"] for c in CHECKLIST_LEGAL}


def _db(request: Request):
    return request.app.state.db


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ─── Tablero ──────────────────────────────────────────────────────────────────
@router.get("/resumen")
async def get_resumen(request: Request):
    await require_superadmin(request)
    return await resumen(_db(request))


# ─── Entrevistas de usuarios (la respuesta a "¿cómo sabes que lo necesitan?") ─
class EntrevistaIn(BaseModel):
    nombre: str = Field(min_length=2, max_length=120)
    rol: str = Field(min_length=2, max_length=80)          # dev / asesor / inmobiliaria / comprador / fondo
    fecha: Optional[str] = None                             # ISO; default hoy
    dolor: str = Field(min_length=3, max_length=600)        # el problema con sus palabras
    frase: str = Field(default="", max_length=600)          # cita textual (oro para YC)
    aprendizaje: str = Field(default="", max_length=600)    # qué cambia en el producto
    siguiente_paso: str = Field(default="", max_length=300)


@router.get("/entrevistas")
async def list_entrevistas(request: Request):
    await require_superadmin(request)
    rows = await _db(request).investor_interviews.find({}, {"_id": 0}) \
        .sort("fecha", -1).to_list(500)
    return {"n": len(rows), "entrevistas": rows}


@router.post("/entrevistas")
async def add_entrevista(request: Request, body: EntrevistaIn):
    await require_superadmin(request)
    doc = body.model_dump()
    doc["id"] = f"ent_{uuid.uuid4().hex[:10]}"
    doc["fecha"] = doc["fecha"] or _now_iso()[:10]
    doc["created_at"] = _now_iso()
    await _db(request).investor_interviews.insert_one({**doc})
    return {"ok": True, "id": doc["id"]}


@router.patch("/entrevistas/{ent_id}")
async def edit_entrevista(request: Request, ent_id: str, body: Dict[str, Any]):
    await require_superadmin(request)
    permitidos = {k: v for k, v in (body or {}).items()
                  if k in EntrevistaIn.model_fields and v is not None}
    if not permitidos:
        raise HTTPException(400, "Nada que actualizar")
    r = await _db(request).investor_interviews.update_one({"id": ent_id}, {"$set": permitidos})
    if not r.matched_count:
        raise HTTPException(404, "Entrevista no encontrada")
    return {"ok": True}


@router.delete("/entrevistas/{ent_id}")
async def del_entrevista(request: Request, ent_id: str):
    await require_superadmin(request)
    r = await _db(request).investor_interviews.delete_one({"id": ent_id})
    if not r.deleted_count:
        raise HTTPException(404, "Entrevista no encontrada")
    return {"ok": True}


# ─── Pipeline de pilotos / LOIs ───────────────────────────────────────────────
class ProspectoIn(BaseModel):
    organizacion: str = Field(min_length=2, max_length=120)
    tipo: str = Field(default="dev", max_length=40)         # dev / inmobiliaria / asesor / fondo / otro
    contacto: str = Field(default="", max_length=120)
    etapa: str = Field(default="contactado")
    notas: str = Field(default="", max_length=600)
    proxima_accion: str = Field(default="", max_length=300)


@router.get("/pipeline")
async def list_pipeline(request: Request):
    await require_superadmin(request)
    rows = await _db(request).investor_pipeline.find({}, {"_id": 0}) \
        .sort("updated_at", -1).to_list(500)
    return {"n": len(rows), "etapas": ETAPAS_PIPELINE, "prospectos": rows}


@router.post("/pipeline")
async def add_prospecto(request: Request, body: ProspectoIn):
    await require_superadmin(request)
    if body.etapa not in _ETAPAS_VALIDAS:
        raise HTTPException(400, f"Etapa inválida; usa una de {sorted(_ETAPAS_VALIDAS)}")
    doc = body.model_dump()
    doc["id"] = f"pros_{uuid.uuid4().hex[:10]}"
    doc["created_at"] = _now_iso()
    doc["updated_at"] = _now_iso()
    await _db(request).investor_pipeline.insert_one({**doc})
    return {"ok": True, "id": doc["id"]}


@router.patch("/pipeline/{pros_id}")
async def edit_prospecto(request: Request, pros_id: str, body: Dict[str, Any]):
    await require_superadmin(request)
    permitidos = {k: v for k, v in (body or {}).items()
                  if k in ProspectoIn.model_fields and v is not None}
    if "etapa" in permitidos and permitidos["etapa"] not in _ETAPAS_VALIDAS:
        raise HTTPException(400, f"Etapa inválida; usa una de {sorted(_ETAPAS_VALIDAS)}")
    if not permitidos:
        raise HTTPException(400, "Nada que actualizar")
    permitidos["updated_at"] = _now_iso()
    r = await _db(request).investor_pipeline.update_one({"id": pros_id}, {"$set": permitidos})
    if not r.matched_count:
        raise HTTPException(404, "Prospecto no encontrado")
    return {"ok": True}


@router.delete("/pipeline/{pros_id}")
async def del_prospecto(request: Request, pros_id: str):
    await require_superadmin(request)
    r = await _db(request).investor_pipeline.delete_one({"id": pros_id})
    if not r.deleted_count:
        raise HTTPException(404, "Prospecto no encontrado")
    return {"ok": True}


# ─── Checklist legal + supuestos ──────────────────────────────────────────────
class ChecklistPatch(BaseModel):
    item_id: str
    ok: bool


@router.patch("/checklist")
async def patch_checklist(request: Request, body: ChecklistPatch):
    await require_superadmin(request)
    if body.item_id not in _CHECKLIST_IDS:
        raise HTTPException(400, f"Ítem desconocido; usa uno de {sorted(_CHECKLIST_IDS)}")
    await _db(request).investor_room_config.update_one(
        {"_id": "config"}, {"$set": {f"checklist.{body.item_id}": body.ok}}, upsert=True)
    return {"ok": True}


@router.patch("/supuestos")
async def patch_supuestos(request: Request, body: Dict[str, Any]):
    await require_superadmin(request)
    permitidos = {k: v for k, v in (body or {}).items()
                  if k in SUPUESTOS_DEFAULT and isinstance(v, (int, float)) and v >= 0}
    if not permitidos:
        raise HTTPException(400, f"Nada válido; supuestos editables: {sorted(SUPUESTOS_DEFAULT)}")
    await _db(request).investor_room_config.update_one(
        {"_id": "config"}, {"$set": {f"supuestos.{k}": v for k, v in permitidos.items()}}, upsert=True)
    return {"ok": True, "actualizados": sorted(permitidos)}


# W5.FF4 register_feature marker · NO duplicate
# (enterprise + precio 0: herramienta interna del founder, no se vende — pero queda visible
#  en el registro de features para el gate de visibilidad)
from feature_registry import register_feature as _w5ff4_register_feature
_w5ff4_register_feature("investor_room", plan_tier="enterprise", monthly_price_mxn=0,
                        category="operations", name="Sala de Inversionistas")
