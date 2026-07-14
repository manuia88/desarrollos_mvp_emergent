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


class UnidadPatch(BaseModel):
    status: Optional[str] = None
    price_mxn: Optional[float] = Field(default=None, ge=0)


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
    return {"ok": True, "unidad": {**u, **cambios}}
