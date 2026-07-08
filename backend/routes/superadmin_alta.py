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
import secrets
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
    email: Optional[str] = None      # vacío → crea SHELL (cuenta vacía) para reclamar después
    password: Optional[str] = None
    plan_tier: Optional[str] = "pro"  # informativo; el gating real vive en feature_flags
    display_name: Optional[str] = None
    contact_email: Optional[str] = None   # SHELL: a dónde mandar la invitación de claim (opcional)
    claim_base: Optional[str] = None      # SHELL: origen público para armar el link (lo manda el front)


@router.post(PREFIX + "/desarrollador")
async def alta_desarrollador(body: AltaDevBody, request: Request):
    """Crea un desarrollador: usuario developer_admin + su tenant propio (aislado, como el
    auto-registro pero hecho por el founder). El dev entra con ese email/password a su portal."""
    user = await _require_superadmin(request)
    db = _db(request)
    from server import hash_password

    email = (body.email or "").lower().strip()
    password = body.password or ""
    now = dt.datetime.now(dt.timezone.utc)
    tenant_id = f"org_user_{uuid.uuid4().hex[:12]}"   # tenant PROPIO (aislado)

    # ── MODO SHELL: sin email/password → crea la cuenta VACÍA para que el dev oficial la reclame ──
    if not email and not password:
        claim_token = secrets.token_urlsafe(16)
        contact = (body.contact_email or "").lower().strip()
        await db.dev_orgs.update_one(
            {"tenant_id": tenant_id},
            {"$set": {"tenant_id": tenant_id, "name": body.name,
                      "display_name": body.display_name or body.name,
                      "plan_tier": body.plan_tier or "pro",
                      "created_at": now.isoformat(), "created_by": "superadmin",
                      "status": "pending_claim", "claim_token": claim_token,
                      "contact_email": contact or None}},
            upsert=True)
        # Envío automático de la invitación (best-effort · skip si no hay RESEND_API_KEY)
        invite_sent = False
        if contact and "@" in contact:
            base = (body.claim_base or "").rstrip("/") or "https://desarrollosmx.io"
            try:
                from resend_engine import send_dev_claim_invite
                invite_sent = bool(send_dev_claim_invite(contact, body.name, f"{base}/reclamar/{claim_token}"))
            except Exception as e:  # noqa: BLE001
                log.warning(f"[alta] envío de invitación falló: {e}")
        await _audit(db, user, "create", "developer_org_shell", tenant_id,
                     {"name": body.name, "contact_email": contact or None})
        return {"ok": True, "dev_org_id": tenant_id, "name": body.name,
                "status": "pending_claim", "claim_token": claim_token,
                "claim_path": f"/reclamar/{claim_token}",
                "contact_email": contact or None, "invite_sent": invite_sent}

    # ── MODO COMPLETO: crea usuario developer_admin + org activa ──
    if not email or "@" not in email:
        raise HTTPException(400, "Email inválido (o déjalo vacío para crear una cuenta a reclamar después)")
    if not (password and len(password) >= 8):
        raise HTTPException(400, "La contraseña debe tener al menos 8 caracteres")
    if await db.users.find_one({"email": email}):
        raise HTTPException(409, "Ese correo ya está registrado")

    user_id = f"user_{uuid.uuid4().hex[:12]}"
    tenant_id = f"org_{user_id}"
    await db.users.insert_one({
        "user_id": user_id, "email": email, "name": body.name,
        "password_hash": hash_password(password),
        "role": "developer_admin", "tenant_id": tenant_id,
        "onboarded": True, "created_at": now,
        "created_by": "superadmin", "created_by_id": user.user_id,
        "plan_tier": body.plan_tier,
    })
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
    out, seen = [], set()
    async for u in db.users.find({"role": "developer_admin"},
                                 {"_id": 0, "user_id": 1, "name": 1, "email": 1, "tenant_id": 1,
                                  "created_by": 1, "plan_tier": 1}).sort("created_at", -1).limit(500):
        tid = u.get("tenant_id")
        seen.add(tid)
        out.append({"dev_org_id": tid, "user_id": u.get("user_id"), "name": u.get("name"),
                    "email": u.get("email"), "plan_tier": u.get("plan_tier") or "—",
                    "alta": "superadmin" if u.get("created_by") == "superadmin" else "auto-registro",
                    "proyectos": proj_por_org.get(tid, 0), "status": "active", "claim_path": None})
    # Cuentas VACÍAS (shell) aún sin reclamar: no tienen usuario todavía, pero deben verse aquí y
    # poder recibir proyectos — si no, "se crean y no aparecen". Se dedupean contra los usuarios.
    async for o in db.dev_orgs.find({"status": "pending_claim"},
                                    {"_id": 0, "tenant_id": 1, "name": 1, "plan_tier": 1,
                                     "claim_token": 1, "contact_email": 1, "created_by": 1}).sort("created_at", -1).limit(500):
        tid = o.get("tenant_id")
        if not tid or tid in seen:
            continue
        seen.add(tid)
        tok = o.get("claim_token")
        out.append({"dev_org_id": tid, "user_id": None, "name": o.get("name"),
                    "email": o.get("contact_email"), "plan_tier": o.get("plan_tier") or "—",
                    "alta": "superadmin" if o.get("created_by") == "superadmin" else "auto-registro",
                    "proyectos": proj_por_org.get(tid, 0), "status": "pending_claim",
                    "claim_path": f"/reclamar/{tok}" if tok else None})
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
    # El dev puede ser un usuario ya activo O una cuenta vacía (shell) aún sin reclamar: en ambos
    # casos se le pueden cargar proyectos por adelantado (los hereda al reclamar la cuenta).
    if not (await db.users.find_one({"tenant_id": body.dev_org_id, "role": "developer_admin"})
            or await db.dev_orgs.find_one({"tenant_id": body.dev_org_id})):
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
    # UNIFICAR universos: espejar a db.developments para que TODOS los motores (fit/director/
    # alertas/simulador/mood/KG/calidad) que leen db.developments vean también el proyecto manual.
    try:
        from routes.dev_project_full import publish_to_developments
        await publish_to_developments(db, slug, user_id=user.user_id, source="superadmin_manual")
    except Exception as e:  # noqa: BLE001
        log.warning(f"[alta] espejo a developments falló: {e}")
    await _audit(db, user, "create", "development", slug,
                 {"name": body.name, "dev_org_id": body.dev_org_id, "via": "manual"})
    return {"ok": True, "project_id": slug, "colonia_id": colonia_id,
            "nota": "El proyecto ya está en el catálogo. Súbele unidades/fotos/precio desde su ficha o Ingesta masiva."}


# ─── 4) Ficha de un DESARROLLADOR: detalle + sus proyectos (gestión granular) ──

@router.get(PREFIX + "/desarrollador/{dev_org_id}")
async def detalle_desarrollador(dev_org_id: str, request: Request):
    """Ficha de un dev: datos de la org + TODOS sus proyectos (db.projects + db.developments),
    para verlos/gestionarlos desde superadmin aunque la cuenta aún no haya sido reclamada."""
    await _require_superadmin(request)
    db = _db(request)
    org = await db.dev_orgs.find_one({"tenant_id": dev_org_id}, {"_id": 0})
    usr = await db.users.find_one({"tenant_id": dev_org_id, "role": "developer_admin"},
                                  {"_id": 0, "email": 1, "name": 1, "user_id": 1, "plan_tier": 1})
    if not org and not usr:
        raise HTTPException(404, "Desarrollador no encontrado")
    tok = (org or {}).get("claim_token")
    status = (org or {}).get("status") or ("active" if usr else "pending_claim")
    scope = {"$or": [{"dev_org_id": dev_org_id}, {"developer_id": dev_org_id}, {"tenant_id": dev_org_id}]}
    proyectos, seen = [], set()
    for coll in ("projects", "developments"):
        async for p in db[coll].find(scope, {"_id": 0}):
            pid = p.get("id") or p.get("slug")
            if not pid or pid in seen:
                continue
            seen.add(pid)
            amen = p.get("amenities") or p.get("amenidades") or []
            proyectos.append({
                "id": pid, "name": p.get("name"), "colonia": p.get("colonia"),
                "alcaldia": p.get("alcaldia") or p.get("municipio"),
                "stage": p.get("stage"), "segmento": p.get("segmento"),
                "total_units": p.get("total_units") or p.get("units_total") or 0,
                "price_from": p.get("price_from") or p.get("price_min_mxn"),
                "price_to": p.get("price_to") or p.get("price_max_mxn"),
                "marketplace_published": p.get("marketplace_published"),
                "source": coll, "created_via": p.get("created_via"),
                # datos que sacó la IA (para "Ver datos" en la ficha, sin salir)
                "address": p.get("address") or p.get("address_full") or p.get("calle"),
                "amenities": amen if isinstance(amen, list) else [],
                "has_geo": bool(p.get("lat") and p.get("lng")),
                "source_files": len(p.get("source_files") or []) or p.get("source_files_count") or None})
    proyectos.sort(key=lambda x: (x.get("name") or "").lower())
    return {"dev_org_id": dev_org_id,
            "name": (org or {}).get("name") or (usr or {}).get("name"),
            "display_name": (org or {}).get("display_name"),
            "plan_tier": (org or {}).get("plan_tier") or (usr or {}).get("plan_tier") or "pro",
            "status": status,
            "email": (usr or {}).get("email") or (org or {}).get("admin_email"),
            "contact_email": (org or {}).get("contact_email"),
            "claim_path": f"/reclamar/{tok}" if tok else None,
            "has_user": bool(usr),
            "proyectos": proyectos, "total_proyectos": len(proyectos)}


class EditDevBody(BaseModel):
    name: Optional[str] = None
    display_name: Optional[str] = None
    plan_tier: Optional[str] = None
    contact_email: Optional[str] = None


@router.patch(PREFIX + "/desarrollador/{dev_org_id}")
async def editar_desarrollador(dev_org_id: str, body: EditDevBody, request: Request):
    """Edita datos de un dev (nombre/plan/contacto) sin recrearlo — actualiza org y su usuario."""
    user = await _require_superadmin(request)
    db = _db(request)
    if not await db.dev_orgs.find_one({"tenant_id": dev_org_id}, {"_id": 0, "tenant_id": 1}):
        raise HTTPException(404, "Desarrollador no encontrado")
    org_set: Dict[str, Any] = {}
    usr_set: Dict[str, Any] = {}
    if body.name is not None:
        org_set["name"] = body.name.strip(); usr_set["name"] = body.name.strip()
    if body.display_name is not None:
        org_set["display_name"] = body.display_name.strip()
    if body.plan_tier is not None:
        org_set["plan_tier"] = body.plan_tier; usr_set["plan_tier"] = body.plan_tier
    if body.contact_email is not None:
        org_set["contact_email"] = (body.contact_email or "").lower().strip() or None
    if org_set:
        await db.dev_orgs.update_one({"tenant_id": dev_org_id}, {"$set": org_set})
    if usr_set:
        await db.users.update_one({"tenant_id": dev_org_id, "role": "developer_admin"}, {"$set": usr_set})
    await _audit(db, user, "update", "developer_org", dev_org_id, org_set)
    return {"ok": True, "dev_org_id": dev_org_id, **org_set}


class DarAccesoBody(BaseModel):
    email: str
    password: str


@router.post(PREFIX + "/desarrollador/{dev_org_id}/dar-acceso")
async def dar_acceso_desarrollador(dev_org_id: str, body: DarAccesoBody, request: Request):
    """Le pone acceso (email+contraseña) a una cuenta vacía existente: crea el usuario
    developer_admin bajo ESE tenant (hereda sus proyectos) y activa la org, sin usar el link."""
    user = await _require_superadmin(request)
    db = _db(request)
    from server import hash_password
    org = await db.dev_orgs.find_one({"tenant_id": dev_org_id}, {"_id": 0})
    if not org:
        raise HTTPException(404, "Desarrollador no encontrado")
    if await db.users.find_one({"tenant_id": dev_org_id, "role": "developer_admin"}):
        raise HTTPException(409, "Esta cuenta ya tiene acceso")
    email = (body.email or "").lower().strip()
    if not email or "@" not in email:
        raise HTTPException(400, "Email inválido")
    if not (body.password and len(body.password) >= 8):
        raise HTTPException(400, "La contraseña debe tener al menos 8 caracteres")
    if await db.users.find_one({"email": email}):
        raise HTTPException(409, "Ese correo ya está registrado")
    now = dt.datetime.now(dt.timezone.utc)
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    try:
        await db.users.insert_one({
            "user_id": user_id, "email": email, "name": org.get("name"),
            "password_hash": hash_password(body.password),
            "role": "developer_admin", "tenant_id": dev_org_id,
            "onboarded": True, "created_at": now,
            "created_by": "superadmin", "created_by_id": user.user_id,
            "plan_tier": org.get("plan_tier")})
    except Exception as e:  # noqa: BLE001
        from pymongo.errors import DuplicateKeyError
        if isinstance(e, DuplicateKeyError):
            raise HTTPException(409, "Ese correo ya está registrado")
        raise
    await db.dev_orgs.update_one(
        {"tenant_id": dev_org_id},
        {"$set": {"status": "active", "admin_email": email, "claimed_at": now.isoformat()},
         "$unset": {"claim_token": ""}})
    await _audit(db, user, "update", "developer_org", dev_org_id, {"dar_acceso": email})
    return {"ok": True, "dev_org_id": dev_org_id, "email": email}


class EditProyectoBody(BaseModel):
    name: Optional[str] = None
    colonia: Optional[str] = None
    alcaldia: Optional[str] = None
    stage: Optional[str] = None
    segmento: Optional[str] = None
    tipo_proyecto: Optional[str] = None
    total_units: Optional[int] = None
    price_from: Optional[float] = None


@router.patch(PREFIX + "/proyecto/{project_id}")
async def editar_proyecto(project_id: str, body: EditProyectoBody, request: Request):
    """Edita los campos básicos de un proyecto (nombre/etapa/segmento/precio/unidades). Los detalles
    finos (unidades, amenidades, planes de pago) se editan por impersonación en el portal del dev."""
    user = await _require_superadmin(request)
    db = _db(request)
    coll = "projects"
    if not await db.projects.find_one({"id": project_id}, {"_id": 0, "id": 1}):
        coll = "developments"
        if not await db.developments.find_one({"id": project_id}, {"_id": 0, "id": 1}):
            raise HTTPException(404, "Proyecto no encontrado")
    upd: Dict[str, Any] = {}
    if body.name is not None:
        upd["name"] = body.name.strip()
    if body.colonia is not None:
        upd["colonia"] = body.colonia
    if body.alcaldia is not None:
        upd["alcaldia"] = body.alcaldia
        upd["municipio"] = body.alcaldia
    if body.stage is not None:
        upd["stage"] = body.stage
    if body.segmento is not None:
        upd["segmento"] = body.segmento
    if body.tipo_proyecto is not None:
        upd["tipo_proyecto"] = body.tipo_proyecto
    if body.total_units is not None:
        upd["total_units"] = int(body.total_units)
    if body.price_from is not None:
        upd["price_from"] = float(body.price_from)
    if not upd:
        return {"ok": True, "project_id": project_id, "nota": "sin cambios"}
    upd["updated_at"] = _now_iso()
    await db[coll].update_one({"id": project_id}, {"$set": upd})
    await _audit(db, user, "update", "development", project_id, upd)
    return {"ok": True, "project_id": project_id, **upd}


@router.get(PREFIX + "/proyecto/{project_id}/full")
async def proyecto_full(project_id: str, request: Request):
    """FICHA UNIFICADA (superadmin): TODO un proyecto en una sola respuesta — datos, unidades (con desglose),
    amenidades, scores/granularidad de su zona, históricos (precios) y documentos. Lee de CUALQUIER origen
    (semilla/ingesta/wizard) sin cambiar de portal. Cada sección fail-open (nunca rompe la ficha)."""
    await _require_superadmin(request)
    db = _db(request)
    from ingested_reader import resolve_dev_doc, units_for_dev, apply_unit_aggregates
    doc = await resolve_dev_doc(db, project_id, with_units=False)
    if not doc:
        raise HTTPException(404, "Proyecto no encontrado")
    src = "developments" if await db.developments.find_one({"id": project_id}, {"_id": 0, "id": 1}) else \
          ("projects" if await db.projects.find_one({"id": project_id}, {"_id": 0, "id": 1}) else "seed")

    unidades = await units_for_dev(db, project_id) or (doc.get("units") or [])
    resumen = {"total": len(unidades),
               "disponible": sum(1 for u in unidades if u.get("status") == "disponible"),
               "apartado": sum(1 for u in unidades if u.get("status") == "reservado"),
               "vendido": sum(1 for u in unidades if u.get("status") == "vendido")}
    _card: Dict[str, Any] = {}
    apply_unit_aggregates(_card, unidades)

    out: Dict[str, Any] = {
        "id": project_id, "source": src, "name": doc.get("name"),
        "ubicacion": {"colonia": doc.get("colonia"), "colonia_id": doc.get("colonia_id"),
                      "alcaldia": doc.get("alcaldia") or doc.get("municipio"),
                      "address": doc.get("address") or doc.get("address_full") or doc.get("calle"),
                      "lat": doc.get("lat"), "lng": doc.get("lng"), "has_geo": bool(doc.get("lat") and doc.get("lng"))},
        "comercial": {"price_from": _card.get("price_from") or doc.get("price_from"),
                      "price_to": _card.get("price_to") or doc.get("price_to"),
                      "total_units": len(unidades) or doc.get("total_units"),
                      "delivery_estimate": doc.get("delivery_estimate"),
                      "maintenance_fee_mxn": doc.get("maintenance_fee_mxn"),
                      "stage": doc.get("stage"), "marketplace_published": doc.get("marketplace_published")},
        "amenidades": doc.get("amenities") or doc.get("amenidades") or [],
        "unidades": unidades, "unidades_resumen": resumen,
    }
    # Overlay rico del dev (servicios/sistema/pagos) si existe — fail-open
    try:
        from routes.dev_project_full import project_public_overlay
        ov = await project_public_overlay(db, project_id)
        if ov:
            out["config"] = ov
    except Exception:
        pass
    # SCORES / GRANULARIDAD de la zona (IE/AVM/zone) por colonia_id — fail-open
    try:
        cid = doc.get("colonia_id")
        if cid:
            scores = []
            async for s in db.ie_scores.find({"zone_id": cid}, {"_id": 0, "code": 1, "value": 1, "tier": 1, "is_stub": 1}).limit(40):
                if not s.get("is_stub"):
                    scores.append({"code": s.get("code"), "value": s.get("value"), "tier": s.get("tier")})
            out["scores"] = scores
            zs = await db.zone_scores.find_one({"zone_id": cid}, {"_id": 0, "overall": 1, "subscores": 1})
            if zs:
                out["zona_score"] = zs
    except Exception:
        pass
    # HISTÓRICOS: cambios de precio registrados (price_events) — fail-open
    try:
        hist = []
        async for e in db.price_events.find({"dev_id": project_id}, {"_id": 0, "old_price": 1, "new_price": 1, "changed_at": 1}).sort("changed_at", -1).limit(50):
            hist.append(e)
        out["historicos"] = {"precios": hist}
    except Exception:
        out["historicos"] = {"precios": []}
    # DOCUMENTOS (planos/brochure/listas de Drive) — fail-open
    try:
        docs = []
        async for a in db.project_assets.find({"development_id": project_id}, {"_id": 0, "filename": 1, "mime": 1, "type": 1, "drive_file_id": 1}).limit(100):
            docs.append(a)
        out["documentos"] = docs
    except Exception:
        out["documentos"] = []
    return out


async def _audit(db, user, accion: str, entidad: str, eid: str, after: Dict[str, Any]) -> None:
    try:
        from audit_log import log_mutation
        await log_mutation(db, {"user_id": user.user_id, "role": "superadmin",
                                "name": getattr(user, "name", None)},
                           accion, entidad, entity_id=eid, after=after)
    except Exception:  # noqa: BLE001
        pass


# ─── 4) Claim PÚBLICO: el dev oficial reclama una cuenta shell y se vuelve su admin ──────

class ClaimDevBody(BaseModel):
    email: str
    password: str
    name: Optional[str] = None


@router.get("/api/dev-claim/{token}")
async def dev_claim_info(token: str, request: Request):
    """Info PÚBLICA de la cuenta shell a reclamar (para la página de registro del dev invitado).
    404 si el token es inválido o la cuenta ya fue reclamada."""
    db = _db(request)
    org = await db.dev_orgs.find_one(
        {"claim_token": token, "status": "pending_claim"},
        {"_id": 0, "name": 1, "display_name": 1, "plan_tier": 1})
    if not org:
        raise HTTPException(404, "Invitación inválida o ya reclamada")
    return {"ok": True, "name": org.get("display_name") or org.get("name"), "plan_tier": org.get("plan_tier")}


@router.post("/api/dev-claim/{token}")
async def dev_claim(token: str, body: ClaimDevBody, request: Request):
    """El dev oficial RECLAMA la cuenta shell: crea su usuario developer_admin bajo ESE tenant
    (hereda los proyectos ya cargados) y activa la org. Público — el dev aún no tiene cuenta.
    Después, como developer_admin, puede invitar a sus propios usuarios (POST /api/dev/internal-users)."""
    db = _db(request)
    from server import hash_password
    email = (body.email or "").lower().strip()
    if not email or "@" not in email:
        raise HTTPException(400, "Email inválido")
    if not (body.password and len(body.password) >= 8):
        raise HTTPException(400, "La contraseña debe tener al menos 8 caracteres")
    # Consumo ATÓMICO del token: sólo UN request concurrente gana el match (evita que dos reclamos
    # simultáneos con correos distintos creen DOS developer_admin sobre el mismo tenant). El perdedor
    # ya no matchea (status ya no es pending_claim, token removido) → 404.
    org = await db.dev_orgs.find_one_and_update(
        {"claim_token": token, "status": "pending_claim"},
        {"$set": {"status": "claiming"}, "$unset": {"claim_token": ""}})
    if not org:
        raise HTTPException(404, "Invitación inválida o ya reclamada")
    tenant_id = org["tenant_id"]
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    now = dt.datetime.now(dt.timezone.utc)
    try:
        if await db.users.find_one({"email": email}):
            raise HTTPException(409, "Ese correo ya está registrado")
        await db.users.insert_one({
            "user_id": user_id, "email": email, "name": body.name or org.get("name"),
            "password_hash": hash_password(body.password),
            "role": "developer_admin", "tenant_id": tenant_id,
            "onboarded": True, "created_at": now, "created_via": "claim",
            "plan_tier": org.get("plan_tier"),
        })
    except Exception as e:  # noqa: BLE001
        # Rollback: reabrir la cuenta con su token original para que el dev legítimo pueda reintentar.
        await db.dev_orgs.update_one(
            {"tenant_id": tenant_id},
            {"$set": {"status": "pending_claim", "claim_token": token}})
        from pymongo.errors import DuplicateKeyError
        if isinstance(e, DuplicateKeyError):
            raise HTTPException(409, "Ese correo ya está registrado")
        raise
    await db.dev_orgs.update_one(
        {"tenant_id": tenant_id},
        {"$set": {"status": "active", "admin_email": email, "claimed_at": now.isoformat()}})
    return {"ok": True, "dev_org_id": tenant_id, "email": email, "name": body.name or org.get("name")}
