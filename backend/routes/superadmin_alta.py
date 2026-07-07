"""ALTA de desarrolladores y proyectos DESDE superadmin (manual).

El founder necesita dar de alta un desarrollador (tenant) + sus proyectos a mano, sin depender
de que el dev se auto-registre por el portal. El alta AUTOMATIZADA ya existe (bulk_ingest desde
Google Drive → extracción IA → aprobar → insert). Esto cierra el hueco del alta MANUAL:

- POST /api/superadmin/alta/desarrollador  → crea dev_org (usuario developer_admin + tenant propio)
- GET  /api/superadmin/alta/desarrolladores → lista los devs para el selector al crear proyecto
- POST /api/superadmin/alta/proyecto        → crea un proyecto bajo un dev elegido (db.projects,
                                              la MISMA colección del wizard → aparece en el marketplace)

Reusa: hash_password (server), el catálogo de colonias (para que prenda la inteligencia de zona),
y el shape de proyecto del wizard (created_via='superadmin_manual'). Cero motor nuevo.
"""
from __future__ import annotations

import datetime as dt
import logging
import re
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

log = logging.getLogger("dmx.routes_superadmin_alta")
router = APIRouter(tags=["superadmin_alta"])
PREFIX = "/api/superadmin/alta"


def _db(request: Request):
    return request.app.state.db


def _now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


async def _require_superadmin(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user or user.role != "superadmin":
        raise HTTPException(403, "Solo superadmin")
    return user


def _slug(s: str) -> str:
    import unicodedata
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower().strip()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


# ─── 1) Alta de DESARROLLADOR (tenant) ────────────────────────────────────────

class AltaDevBody(BaseModel):
    name: str
    email: str
    password: str
    plan_tier: str = "pro"          # informativo; el gating real vive en feature_flags
    display_name: Optional[str] = None


@router.post(PREFIX + "/desarrollador")
async def alta_desarrollador(body: AltaDevBody, request: Request):
    """Crea un desarrollador: usuario developer_admin + su tenant propio (aislado, como el
    auto-registro pero hecho por el founder). El dev entra con ese email/password a su portal."""
    user = await _require_superadmin(request)
    db = _db(request)
    from server import hash_password

    email = (body.email or "").lower().strip()
    if not email or "@" not in email:
        raise HTTPException(400, "Email inválido")
    if not (body.password and len(body.password) >= 8):
        raise HTTPException(400, "La contraseña debe tener al menos 8 caracteres")
    if await db.users.find_one({"email": email}):
        raise HTTPException(409, "Ese correo ya está registrado")

    user_id = f"user_{uuid.uuid4().hex[:12]}"
    tenant_id = f"org_{user_id}"     # tenant PROPIO (aislado) — mismo patrón que el registro público
    now = dt.datetime.now(dt.timezone.utc)
    await db.users.insert_one({
        "user_id": user_id, "email": email, "name": body.name,
        "password_hash": hash_password(body.password),
        "role": "developer_admin", "tenant_id": tenant_id,
        "onboarded": True, "created_at": now,
        "created_by": "superadmin", "created_by_id": user.user_id,
        "plan_tier": body.plan_tier,
    })
    # doc de organización (nombre para mostrar en Clientes/impersonar)
    await db.dev_orgs.update_one(
        {"tenant_id": tenant_id},
        {"$set": {"tenant_id": tenant_id, "name": body.name,
                  "display_name": body.display_name or body.name,
                  "admin_email": email, "plan_tier": body.plan_tier,
                  "created_at": now.isoformat(), "created_by": "superadmin", "status": "active"}},
        upsert=True)
    await _audit(db, user, "create", "developer_org", tenant_id,
                 {"name": body.name, "email": email})
    return {"ok": True, "dev_org_id": tenant_id, "user_id": user_id,
            "name": body.name, "email": email}


# ─── 2) Listar desarrolladores (para el selector al crear proyecto) ───────────

@router.get(PREFIX + "/desarrolladores")
async def listar_desarrolladores(request: Request):
    """Los devs disponibles (usuarios developer_admin) con su conteo de proyectos — para el
    selector al crear un proyecto manual y para ver el estado del alta."""
    await _require_superadmin(request)
    db = _db(request)
    # conteo de proyectos por dev_org (db.projects = wizard/manual · db.developments = bulk_ingest)
    proj_por_org: Dict[str, int] = {}
    for coll, field in (("projects", "dev_org_id"), ("developments", "developer_id")):
        async for r in db[coll].aggregate([{"$group": {"_id": f"${field}", "n": {"$sum": 1}}}]):
            if r["_id"]:
                proj_por_org[r["_id"]] = proj_por_org.get(r["_id"], 0) + r["n"]
    out = []
    async for u in db.users.find({"role": "developer_admin"},
                                 {"_id": 0, "user_id": 1, "name": 1, "email": 1, "tenant_id": 1,
                                  "created_by": 1, "plan_tier": 1}).sort("created_at", -1).limit(500):
        tid = u.get("tenant_id")
        out.append({"dev_org_id": tid, "user_id": u.get("user_id"), "name": u.get("name"),
                    "email": u.get("email"), "plan_tier": u.get("plan_tier") or "—",
                    "alta": "superadmin" if u.get("created_by") == "superadmin" else "auto-registro",
                    "proyectos": proj_por_org.get(tid, 0)})
    return {"desarrolladores": out, "total": len(out)}


# ─── 3) Alta de PROYECTO bajo un desarrollador elegido ────────────────────────

class AltaProyectoBody(BaseModel):
    dev_org_id: str
    name: str
    colonia: Optional[str] = None
    colonia_id: Optional[str] = None
    alcaldia: Optional[str] = None
    calle: Optional[str] = None
    total_units: int = 0
    price_from: Optional[float] = None
    tipo_proyecto: Optional[str] = "vertical"
    segmento: Optional[str] = None
    stage: str = "preventa"
    amenidades: List[str] = []


@router.post(PREFIX + "/proyecto")
async def alta_proyecto(body: AltaProyectoBody, request: Request):
    """Crea un proyecto bajo el dev elegido, en db.projects (la misma colección del wizard →
    aparece en el marketplace y prende la inteligencia de zona). El colonia_id se resuelve del
    catálogo para que la ficha nazca con lugares/demanda/riesgos/valor."""
    user = await _require_superadmin(request)
    db = _db(request)
    if not (body.name or "").strip():
        raise HTTPException(400, "Nombre del proyecto requerido")
    if not await db.users.find_one({"tenant_id": body.dev_org_id, "role": "developer_admin"}):
        raise HTTPException(404, "Desarrollador no encontrado")

    slug = _slug(body.name)
    if await db.projects.find_one({"id": slug}):
        slug = f"{slug}-{uuid.uuid4().hex[:4]}"
    # resolver colonia del catálogo (reusa el resolvedor del wizard) — prende la inteligencia de zona
    colonia_id = body.colonia_id
    if not colonia_id and body.colonia:
        try:
            from routes.wizard import _resolve_colonia_id
            colonia_id = await _resolve_colonia_id(db, body.colonia, body.alcaldia)
        except Exception:  # noqa: BLE001
            colonia_id = _slug(body.colonia)
    now = _now_iso()
    doc = {
        "id": slug, "slug": slug, "name": body.name.strip(),
        "dev_org_id": body.dev_org_id, "developer_id": body.dev_org_id,
        "tipo_proyecto": body.tipo_proyecto, "segmento": body.segmento,
        "stage": body.stage, "total_units": int(body.total_units or 0),
        "price_from": float(body.price_from) if body.price_from else None,
        "municipio": body.alcaldia, "alcaldia": body.alcaldia,
        "colonia": body.colonia, "colonia_id": colonia_id, "calle": body.calle,
        "amenities": body.amenidades or [],
        "legal_status": "sin_contrato",
        "created_via": "superadmin_manual", "created_by_id": user.user_id,
        "status": "active", "marketplace_published": "pending",  # aprobación pre-publicar
        "created_at": now, "updated_at": now,
    }
    await db.projects.insert_one(dict(doc))
    await _audit(db, user, "create", "development", slug,
                 {"name": body.name, "dev_org_id": body.dev_org_id, "via": "manual"})
    return {"ok": True, "project_id": slug, "colonia_id": colonia_id,
            "nota": "El proyecto ya está en el catálogo. Súbele unidades/fotos/precio desde su ficha o Ingesta masiva."}


async def _audit(db, user, accion: str, entidad: str, eid: str, after: Dict[str, Any]) -> None:
    try:
        from audit_log import log_mutation
        await log_mutation(db, {"user_id": user.user_id, "role": "superadmin",
                                "name": getattr(user, "name", None)},
                           accion, entidad, entity_id=eid, after=after)
    except Exception:  # noqa: BLE001
        pass
