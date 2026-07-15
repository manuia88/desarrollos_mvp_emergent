"""INVENTARIO (Fase 3 rebuild UX) — el backend del drill Devs → Proyectos → Unidades.

  GET   /api/superadmin/inventario/arbol           → devs con sus proyectos y conteos (1 llamada)
  GET   /api/superadmin/inventario/proyecto/{id}   → el proyecto con TODAS sus unidades (la torre)
  PATCH /api/superadmin/inventario/unidad/{id}     → editar disponibilidad/precio SIN wizard
        {status?, price_mxn?} → audit log + bitácora (snapshot debounced) — linaje intacto.

Cero duplicación: lee developments/units existentes; la edición dispara la MISMA bitácora que
la ingesta (transiciones detectan el cambio como cualquier otro).
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from permissions import require_superadmin

router = APIRouter(prefix="/api/superadmin/inventario")

ESTADOS_VALIDOS = {"disponible", "apartada", "vendida", "bloqueada", "renta"}


def _db(request: Request):
    return request.app.state.db


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.get("/arbol")
async def arbol(request: Request):
    """Todo el inventario en UNA llamada: dev → proyectos → conteos por estado."""
    await require_superadmin(request)
    db = _db(request)

    # unidades agrupadas por (development, status)
    por_dev_estado: Dict[str, Dict[str, int]] = {}
    async for r in db.units.aggregate([
            {"$group": {"_id": {"d": "$development_id", "s": "$status"}, "n": {"$sum": 1}}}]):
        d = por_dev_estado.setdefault(r["_id"]["d"], {})
        d[(r["_id"].get("s") or "disponible").lower()] = r["n"]

    protos = {}
    async for r in db.dmx_prototypes.aggregate([
            {"$group": {"_id": "$development_id", "n": {"$sum": 1}}}]):
        protos[r["_id"]] = r["n"]

    devs: Dict[str, Dict[str, Any]] = {}
    async for d in db.developments.find({}, {"_id": 0, "id": 1, "name": 1, "developer_id": 1,
                                             "colonia": 1, "colonia_name": 1, "stage": 1,
                                             "published": 1, "price_from": 1}).limit(2000):
        org = d.get("developer_id") or "sin_dev"
        dev = devs.setdefault(org, {"dev_org_id": org, "nombre": org, "proyectos": []})
        estados = por_dev_estado.get(d["id"], {})
        dev["proyectos"].append({
            "id": d["id"], "nombre": d.get("name") or d["id"],
            "colonia": d.get("colonia_name") or d.get("colonia") or "",
            "etapa": d.get("stage") or "", "publicado": bool(d.get("published")),
            "precio_desde": d.get("price_from"),
            "unidades": sum(estados.values()), "por_estado": estados,
            "prototipos": protos.get(d["id"], 0),
        })

    # nombres humanos de los dev orgs (users developer_admin ∪ dev_orgs ∪ manifiesto)
    nombres: Dict[str, str] = {}
    async for u in db.users.find({"role": "developer_admin"}, {"_id": 0, "tenant_id": 1, "name": 1}).limit(500):
        if u.get("tenant_id"):
            nombres[u["tenant_id"]] = u.get("name") or u["tenant_id"]
    async for o in db.dev_orgs.find({}, {"_id": 0, "tenant_id": 1, "name": 1}).limit(500):
        nombres.setdefault(o.get("tenant_id") or "", o.get("name") or "")
    # devs de la plataforma SIN proyectos aún (para que también se vean — cero pérdida)
    for org, nombre in nombres.items():
        if org and org not in devs:
            devs[org] = {"dev_org_id": org, "nombre": nombre, "proyectos": []}
    for org, dev in devs.items():
        dev["nombre"] = nombres.get(org) or dev["nombre"]
        dev["n_proyectos"] = len(dev["proyectos"])
        dev["n_unidades"] = sum(p["unidades"] for p in dev["proyectos"])

    # vigía: mapeos + pendientes (la bandeja vive integrada en Inventario)
    mapeos = {m["dev_org_id"]: m["dev_carpeta"] for m in
              await db.vigia_manifiesto.find({}, {"_id": 0}).to_list(200)}
    pendientes_n = await db.vigia_pendientes.count_documents({"estado": "pendiente"})
    revision_n = await db.bulk_ingest_items.count_documents({"decision": "pending_review"})
    for org, dev in devs.items():
        dev["carpeta_vigilada"] = mapeos.get(org)

    orden = sorted(devs.values(), key=lambda x: (-x["n_unidades"], x["nombre"].lower()))
    return {"devs": orden, "n_devs": len(orden),
            "n_proyectos": sum(d["n_proyectos"] for d in orden),
            "n_unidades": sum(d["n_unidades"] for d in orden),
            "vigia_pendientes": pendientes_n,
            "revision_pendientes": revision_n}


@router.get("/expediente/{development_id}")
async def expediente(request: Request, development_id: str):
    """EL EXPEDIENTE (orden founder 07-14: 'todo en un mismo espacio, no regado por media
    plataforma'). UNA llamada = TODO el desarrollo: datos, unidades, prototipos, multimedia con
    URLs, pagos, avance, legal, política comercial, confianza y el semáforo de completitud."""
    await require_superadmin(request)
    db = _db(request)
    d = await db.developments.find_one({"id": development_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Desarrollo no encontrado")

    units = await db.units.find({"development_id": development_id}, {"_id": 0}) \
        .sort("unit_number", 1).to_list(2000)
    protos = await db.dmx_prototypes.find({"development_id": development_id}, {"_id": 0}).to_list(200)

    # multimedia: locales (con URL servible) + referencias a Drive (agrupadas por categoría)
    locales = []
    async for a in db.dev_assets.find({"development_id": development_id}, {"_id": 0}) \
            .sort("order_index", 1):
        sp = a.get("storage_path") or ""
        locales.append({"id": a.get("id"), "tipo": a.get("asset_type"),
                        "nombre": a.get("filename"), "caption": a.get("ai_caption"),
                        "concepto": a.get("concepto"),
                        "url": f"/api/assets-static/{sp.split('/')[-1]}" if sp else None,
                        "cover": a.get("role") == "cover"})
    drive_por_cat: Dict[str, Any] = {}
    async for a in db.project_assets.find({"development_id": development_id},
                                          {"_id": 0, "asset_categoria": 1, "filename": 1,
                                           "unidad_hint": 1, "image_kind": 1}):
        c = drive_por_cat.setdefault(a.get("asset_categoria") or "otro",
                                     {"n": 0, "muestra": [], "con_unidad": 0})
        c["n"] += 1
        if a.get("unidad_hint"):
            c["con_unidad"] += 1
        if len(c["muestra"]) < 3:
            c["muestra"].append(a.get("filename"))

    pagos = await db.dev_payment_schemes.find_one({"project_id": development_id}, {"_id": 0}) or {}
    avance = await db.project_construction_progress.find_one({"project_id": development_id}, {"_id": 0}) or {}
    comm = await db.project_commercialization.find_one({"project_id": development_id}, {"_id": 0}) or {}
    legal_docs = await db.di_documents.count_documents({"development_id": development_id})
    amen = await db.project_amenities.find_one({"project_id": development_id}, {"_id": 0}) or {}

    from routes.dev_project_full import project_full, project_readiness
    readiness = project_readiness(await project_full(db, development_id))

    # el dato fino del Catálogo de Moldes — todo en la MISMA llamada (orden founder:
    # un solo espacio): métricas, programa arquitectónico, cotejo y playbook del dev
    from molde_metrics import metricas_desarrollo
    from playbook_precios import playbook_desarrollo
    metricas = await metricas_desarrollo(db, development_id)
    programas = await db.molde_programa.find({"development_id": development_id},
                                             {"_id": 0}).to_list(200)
    cotejo = await db.cotejo_datos.find_one({"development_id": development_id}, {"_id": 0})
    playbook = await playbook_desarrollo(db, development_id)

    return {
        "desarrollo": d, "unidades": units, "n_unidades": len(units),
        "prototipos": protos,
        "metricas_moldes": {m["prototype_id"]: m for m in metricas["moldes"]},
        "programas": {p["prototype_id"]: p for p in programas},
        "cotejo": cotejo,
        "playbook": playbook,
        "multimedia": {"locales": locales, "drive": drive_por_cat},
        "pagos": pagos.get("schemes") or [],
        "avance": {"pct": avance.get("overall_percent"), "etapa": avance.get("current_stage")},
        "comercializacion": {"configurada": bool(comm.get("configured")),
                             "comision_pct": comm.get("default_commission_pct"),
                             "brokers": comm.get("works_with_brokers")},
        "legal": {"docs": legal_docs, "estado": d.get("legal_status")},
        "amenidades": (amen.get("amenities") or d.get("amenities") or []),
        "servicios": (amen.get("servicios") or {}),
        "completitud": readiness,
    }


class ExpedientePatch(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    address_full: Optional[str] = None
    stage: Optional[str] = None
    delivery_estimate: Optional[str] = None


@router.patch("/expediente/{development_id}")
async def editar_expediente(request: Request, development_id: str, body: ExpedientePatch):
    """Edición directa de los datos del desarrollo — sin wizard, con auditoría."""
    user = await require_superadmin(request)
    db = _db(request)
    cambios = {k: v for k, v in body.model_dump().items() if v is not None}
    if not cambios:
        raise HTTPException(400, "Nada que cambiar")
    cambios["updated_at"] = _now_iso()
    r = await db.developments.update_one({"id": development_id}, {"$set": cambios})
    if not r.matched_count:
        raise HTTPException(404, "Desarrollo no encontrado")
    try:
        from audit_log import log_mutation
        await log_mutation(db, user, "update", "development", development_id,
                           before=None, after=cambios, request=request)
    except Exception:
        pass
    return {"ok": True, "cambios": sorted(cambios)}


@router.get("/proyecto/{development_id}")
async def proyecto(request: Request, development_id: str):
    """El proyecto completo con su torre: unidades + prototipos, listo para pintar y editar."""
    await require_superadmin(request)
    db = _db(request)
    d = await db.developments.find_one({"id": development_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Proyecto no encontrado")
    units = await db.units.find({"development_id": development_id}, {"_id": 0}) \
        .sort("unit_number", 1).to_list(2000)
    protos = await db.dmx_prototypes.find({"development_id": development_id}, {"_id": 0}).to_list(200)
    return {"proyecto": d, "unidades": units, "prototipos": protos, "n_unidades": len(units)}


ORIENTACIONES = {"norte", "sur", "oriente", "poniente", "noreste", "noroeste",
                 "sureste", "suroeste"}


class UnidadPatch(BaseModel):
    status: Optional[str] = None
    price_mxn: Optional[float] = Field(default=None, ge=0)
    orientacion: Optional[str] = None      # norte/sur/oriente/poniente/…
    vista: Optional[str] = Field(default=None, max_length=80)   # calle/interior/parque…


@router.patch("/unidad/{unit_id}")
async def editar_unidad(request: Request, unit_id: str, body: UnidadPatch):
    """El clic directo en la torre: cambiar disponibilidad o precio SIN wizard.
    Con linaje: audit log + bitácora (la transición 'vendida' queda registrada como
    cualquier cambio de ingesta)."""
    user = await require_superadmin(request)
    db = _db(request)
    u = await db.units.find_one({"id": unit_id}, {"_id": 0})
    if not u:
        raise HTTPException(404, "Unidad no encontrada")
    cambios: Dict[str, Any] = {}
    if body.status is not None:
        st = body.status.strip().lower()
        if st not in ESTADOS_VALIDOS:
            raise HTTPException(400, f"Estado inválido; usa uno de {sorted(ESTADOS_VALIDOS)}")
        cambios["status"] = st
    if body.price_mxn is not None:
        cambios["price_mxn"] = float(body.price_mxn)
        cambios["price"] = float(body.price_mxn)
    if body.orientacion is not None:
        o = body.orientacion.strip().lower()
        if o and o not in ORIENTACIONES:
            raise HTTPException(400, f"Orientación inválida; usa una de {sorted(ORIENTACIONES)}")
        cambios["orientacion"] = o or None
    if body.vista is not None:
        cambios["vista"] = body.vista.strip() or None
    if not cambios:
        raise HTTPException(400, "Nada que cambiar (manda status y/o price_mxn)")
    cambios["updated_at"] = _now_iso()
    cambios["last_edit_source"] = "inventario_superadmin"
    await db.units.update_one({"id": unit_id}, {"$set": cambios})

    # linaje: audit inmutable + bitácora de oferta (transiciones lo detectan)
    try:
        from audit_log import log_mutation
        await log_mutation(db, user, "update", "unit", unit_id,
                           before={k: u.get(k) for k in cambios}, after=cambios, request=request)
    except Exception:
        pass
    try:
        from market_timeline import disparar_snapshot_debounced
        disparar_snapshot_debounced(db, fuente="edicion_inventario")
    except Exception:
        pass
    # conciliador de moldes: solo cuando algo cambió (event-driven, ya no hay cron)
    try:
        import asyncio as _aio
        import prototype_engine as _pe
        import cotejo_engine as _ce

        async def _concilia_y_coteja():
            await _pe.materializar(db, u["development_id"])
            await _ce.cotejar_desarrollo(db, u["development_id"])
        _aio.create_task(_concilia_y_coteja())
    except Exception:
        pass
    return {"ok": True, "unidad": {**u, **cambios}}
