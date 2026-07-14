"""EL VIGÍA + PROTOTIPOS v2 — rutas (superadmin only).

  GET    /api/superadmin/vigia                     → fuentes + conteo de pendientes
  POST   /api/superadmin/vigia/fuentes             → registrar carpeta maestra {url, nombre?}
  DELETE /api/superadmin/vigia/fuentes/{id}        → desactivar
  POST   /api/superadmin/vigia/ronda               → correr la ronda AHORA (metadata, $0)
  GET    /api/superadmin/vigia/pendientes          → bandeja (?estado=pendiente)
  POST   /api/superadmin/vigia/pendientes/{id}/aprobar   → tu clic = OK de gasto (dispara ingesta)
  POST   /api/superadmin/vigia/pendientes/{id}/rechazar  → {razon?}
  GET    /api/superadmin/vigia/eventos             → linaje (?dev=&tipo=&limit=)

  GET    /api/superadmin/prototipos/resumen        → prototipos por desarrollo + cuarentena
  POST   /api/superadmin/prototipos/rederivar      → {development_id?|todos, bautizar_ia?}
"""
from __future__ import annotations

import secrets
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from permissions import require_superadmin
import vigia_engine as VE
import prototype_engine as PE

router = APIRouter(prefix="/api/superadmin")


def _db(request: Request):
    return request.app.state.db


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ═══ VIGÍA ═══════════════════════════════════════════════════════════════════
@router.get("/vigia")
async def estado(request: Request):
    await require_superadmin(request)
    db = _db(request)
    fuentes = await db.vigia_fuentes.find({}, {"_id": 0}).to_list(50)
    pendientes_n = await db.vigia_pendientes.count_documents({"estado": "pendiente"})
    return {"fuentes": fuentes, "pendientes_n": pendientes_n}


class FuenteIn(BaseModel):
    url: str
    nombre: str = Field(default="Carpeta maestra", max_length=120)


@router.post("/vigia/fuentes")
async def agregar_fuente(request: Request, body: FuenteIn):
    await require_superadmin(request)
    db = _db(request)
    import bulk_ingest_engine as bie
    folder_id = bie.parse_folder_id(body.url)
    if not folder_id:
        raise HTTPException(400, "No parece un link de carpeta de Drive")
    ya = await db.vigia_fuentes.find_one({"folder_id": folder_id, "activa": True})
    if ya:
        raise HTTPException(409, "Esa carpeta ya está vigilada")
    doc = {"id": f"vf_{secrets.token_urlsafe(8)}", "tipo": "drive_master",
           "nombre": body.nombre, "url": body.url, "folder_id": folder_id,
           "activa": True, "cadencia_min": 60, "created_at": _now_iso(),
           "last_ronda_at": None, "last_resumen": None}
    await db.vigia_fuentes.insert_one(dict(doc))
    return {"ok": True, "fuente": doc}


@router.delete("/vigia/fuentes/{fuente_id}")
async def quitar_fuente(request: Request, fuente_id: str):
    await require_superadmin(request)
    r = await _db(request).vigia_fuentes.update_one({"id": fuente_id},
                                                    {"$set": {"activa": False}})
    if not r.matched_count:
        raise HTTPException(404, "Fuente no encontrada")
    return {"ok": True}


@router.post("/vigia/ronda")
async def correr_ronda(request: Request):
    """Ronda manual AHORA. Solo metadata (nombres/fechas/huellas): $0, sin IA."""
    await require_superadmin(request)
    return await VE.ronda(_db(request))


@router.get("/vigia/pendientes")
async def pendientes(request: Request, estado: str = "pendiente", limit: int = 100):
    await require_superadmin(request)
    q: Dict[str, Any] = {"estado": estado} if estado else {}
    rows = await _db(request).vigia_pendientes.find(q, {"_id": 0}) \
        .sort("created_at", -1).to_list(min(limit, 300))
    return {"n": len(rows), "pendientes": rows}


class RechazoIn(BaseModel):
    razon: str = Field(default="", max_length=300)


# ─── EL MANIFIESTO: tu carpeta → el dev de la plataforma + su patrón ──────────
async def _devs_plataforma(db):
    """La identidad de un dev = dev_org_id (tenant de su usuario o shell sin reclamar)."""
    out, seen = [], set()
    async for u in db.users.find({"role": "developer_admin"},
                                 {"_id": 0, "tenant_id": 1, "name": 1}).limit(500):
        if u.get("tenant_id") and u["tenant_id"] not in seen:
            seen.add(u["tenant_id"])
            out.append({"dev_org_id": u["tenant_id"], "name": u.get("name") or u["tenant_id"]})
    async for o in db.dev_orgs.find({}, {"_id": 0, "tenant_id": 1, "name": 1}).limit(500):
        if o.get("tenant_id") and o["tenant_id"] not in seen:
            seen.add(o["tenant_id"])
            out.append({"dev_org_id": o["tenant_id"], "name": o.get("name") or o["tenant_id"]})
    return sorted(out, key=lambda x: (x["name"] or "").lower())


@router.get("/vigia/manifiesto")
async def ver_manifiesto(request: Request):
    await require_superadmin(request)
    db = _db(request)
    rows = await db.vigia_manifiesto.find({}, {"_id": 0}).sort("dev_carpeta", 1).to_list(200)
    return {"mapeos": rows, "devs_plataforma": await _devs_plataforma(db)}


class MapeoIn(BaseModel):
    fuente_id: str
    dev_carpeta: str = Field(min_length=1, max_length=200)     # nombre de la carpeta en TU drive
    dev_org_id: str = Field(min_length=1)                      # el dev de la plataforma
    dev_folder_id: str = Field(default="", max_length=120)
    patron_notas: str = Field(default="", max_length=1500)     # cómo trabaja este dev (para el RECON)


@router.put("/vigia/manifiesto")
async def guardar_mapeo(request: Request, body: MapeoIn):
    await require_superadmin(request)
    db = _db(request)
    existe = (await db.users.find_one({"role": "developer_admin", "tenant_id": body.dev_org_id},
                                      {"_id": 0, "tenant_id": 1})
              or await db.dev_orgs.find_one({"tenant_id": body.dev_org_id},
                                            {"_id": 0, "tenant_id": 1}))
    if not existe:
        raise HTTPException(404, "Ese desarrollador no existe en la plataforma (créalo en Alta manual)")
    doc = await VE.mapear_dev(db, body.fuente_id, body.dev_carpeta, body.dev_org_id,
                              body.dev_folder_id, body.patron_notas)
    return {"ok": True, "mapeo": doc}


@router.post("/vigia/pendientes/{pendiente_id}/aprobar")
async def aprobar(request: Request, pendiente_id: str):
    user = await require_superadmin(request)
    try:
        resultado = await VE.aprobar_pendiente(_db(request), pendiente_id, user.user_id)
    except LookupError as e:          # sin mapeo en el manifiesto → la UI pide mapear
        raise HTTPException(409, str(e))
    except ValueError as e:
        raise HTTPException(404, str(e))
    return {"ok": True, **resultado}


@router.post("/vigia/pendientes/{pendiente_id}/rechazar")
async def rechazar(request: Request, pendiente_id: str, body: Optional[RechazoIn] = None):
    user = await require_superadmin(request)
    try:
        await VE.rechazar_pendiente(_db(request), pendiente_id, user.user_id,
                                    (body.razon if body else ""))
    except ValueError as e:
        raise HTTPException(404, str(e))
    return {"ok": True}


@router.get("/vigia/eventos")
async def eventos(request: Request, dev: str = "", tipo: str = "", limit: int = 100):
    await require_superadmin(request)
    q: Dict[str, Any] = {}
    if dev:
        q["dev"] = dev
    if tipo:
        q["tipo"] = tipo
    rows = await _db(request).vigia_eventos.find(q, {"_id": 0}) \
        .sort("ts", -1).to_list(min(limit, 500))
    return {"n": len(rows), "eventos": rows}


# ═══ PROTOTIPOS v2 ═══════════════════════════════════════════════════════════
@router.get("/prototipos/resumen")
async def prototipos_resumen(request: Request):
    await require_superadmin(request)
    db = _db(request)
    protos = await db.dmx_prototypes.find({}, {"_id": 0}).to_list(2000)
    por_dev: Dict[str, Any] = {}
    for p in protos:
        d = por_dev.setdefault(p["development_id"], {"prototipos": [], "n_unidades": 0})
        d["prototipos"].append(p)
        d["n_unidades"] += p.get("unidades_total") or 0
    cuarentena = await db.units.count_documents({"prototype_cuarentena": True})
    nombres = {d.get("id"): d.get("name") for d in await db.developments.find(
        {"id": {"$in": list(por_dev)}}, {"_id": 0, "id": 1, "name": 1}).to_list(500)}
    return {"desarrollos": [{"development_id": k, "nombre": nombres.get(k) or k, **v}
                            for k, v in sorted(por_dev.items(), key=lambda x: -len(x[1]["prototipos"]))],
            "total_prototipos": len(protos), "unidades_en_cuarentena": cuarentena}


class RederivarIn(BaseModel):
    development_id: Optional[str] = None   # None = todos
    bautizar_ia: bool = False              # nombra con IA (centavos) — tu clic es el OK


@router.post("/prototipos/rederivar")
async def rederivar(request: Request, body: RederivarIn):
    await require_superadmin(request)
    db = _db(request)
    if body.development_id:
        return await PE.materializar(db, body.development_id, bautizar=body.bautizar_ia)
    return await PE.materializar_todos(db, bautizar=body.bautizar_ia)
