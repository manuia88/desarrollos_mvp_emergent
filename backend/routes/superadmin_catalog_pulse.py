"""Superadmin · Pulso del catálogo (B3.2) — terminal global que cruza TODOS los proyectos.

Tres lentes sobre la capa unificada (project_full):
  1. Listas para publicar    — readiness agregado (cuántas fichas están completas).
  2. Cobertura del catálogo   — % de proyectos con servicios/sistema/pagos/legal/fotos configurados.
  3. Demanda del comprador    — qué planes piden los compradores (lead_captures.interes del cotizador
     público, B2). Esto INTEGRA marketplace → superadmin: el corporativo ve qué quiere el mercado.

Reusa project_full + project_readiness (no duplica). Net-new, additive. Built-for-endstate: la
demanda se llena sola conforme entran leads.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List

from fastapi import APIRouter, Request

log = logging.getLogger("dmx.catalog_pulse")
router = APIRouter(prefix="/api/superadmin/catalog-pulse", tags=["superadmin_catalog_pulse"])

_CHECK_LABELS = {
    "amenidades": "Amenidades", "servicios": "Servicios", "sistema": "Sistema constructivo",
    "pagos": "Formas de pago", "legal": "Documentos legales", "fotos": "Fotos",
}


async def _all_project_ids(db) -> List[str]:
    from data_developments import DEVELOPMENTS_BY_ID
    ids = set(DEVELOPMENTS_BY_ID.keys())
    try:
        async for d in db.developments.find({}, {"_id": 0, "id": 1}):
            if d.get("id"):
                ids.add(d["id"])
        async for p in db.projects.find({}, {"_id": 0, "id": 1}):
            if p.get("id"):
                ids.add(p["id"])
    except Exception as e:  # noqa
        log.warning(f"[catalog_pulse] list ids: {e}")
    return list(ids)[:300]


def _coverage(full: Dict[str, Any]) -> Dict[str, bool]:
    am = full.get("amenidades") or {}
    con = full.get("construccion") or {}
    cont = full.get("contenido") or {}
    leg = full.get("legal") or {}
    return {
        "amenidades": len(am.get("amenities") or []) >= 3,
        "servicios": len(am.get("servicios") or {}) >= 1,
        "sistema": bool((con.get("sistema_constructivo") or {}).get("cimentacion")),
        "pagos": len((full.get("pagos") or {}).get("schemes") or []) >= 1,
        "legal": (leg.get("docs") or 0) >= 1,
        "fotos": ((cont.get("photos") or 0) + (cont.get("assets") or 0)) >= 3,
    }


async def _cover(db, pid: str) -> Any:
    """Portada del proyecto para la tarjeta (seed/db photos[0], si no la 1ª foto subida)."""
    from data_developments import DEVELOPMENTS_BY_ID
    photos = (DEVELOPMENTS_BY_ID.get(pid) or {}).get("photos") or []
    if not photos:
        d = (await db.developments.find_one({"id": pid}, {"_id": 0, "photos": 1})
             or await db.projects.find_one({"$or": [{"id": pid}, {"slug": pid}]}, {"_id": 0, "photos": 1}) or {})
        photos = d.get("photos") or []
    if photos:
        return photos[0]
    try:
        a = await db.dev_assets.find_one({"development_id": pid}, sort=[("order_index", 1)], projection={"_id": 0, "storage_path": 1})
        if a and a.get("storage_path"):
            from pathlib import Path
            return f"/api/assets-static/{Path(a['storage_path']).name}"
    except Exception:
        pass
    return None


async def catalog_pulse(db) -> Dict[str, Any]:
    from routes.dev_project_full import project_full, project_readiness

    ids = await _all_project_ids(db)
    try:
        pub_ids = {d["id"] async for d in db.developments.find({"published_at": {"$ne": None}}, {"_id": 0, "id": 1})}
    except Exception:
        pub_ids = set()

    proyectos: List[Dict[str, Any]] = []
    cov_counts = {k: 0 for k in _CHECK_LABELS}
    readiness_sum = 0
    publicables = 0
    n = 0

    for pid in ids:
        try:
            full = await project_full(db, pid)
        except Exception:
            full = None
        if not full:
            continue
        n += 1
        rd = project_readiness(full)
        cov = _coverage(full)
        for k, ok in cov.items():
            if ok:
                cov_counts[k] += 1
        readiness_sum += rd.get("pct", 0)
        if rd.get("publishable"):
            publicables += 1
        proyectos.append({
            "project_id": pid, "nombre": full.get("nombre"),
            "colonia": (full.get("ubicacion") or {}).get("colonia"),
            "cover": await _cover(db, pid),
            "price_from": full.get("price_from"), "stage": full.get("stage"),
            "publicado": pid in pub_ids,
            "readiness_pct": rd.get("pct", 0), "publishable": rd.get("publishable", False),
            "faltan": [m["label"] for m in (rd.get("missing") or [])],
        })

    # ── Demanda del comprador (lead_captures.interes del cotizador público · B2) ──
    leads_por_proyecto: Dict[str, int] = {}
    plan_demanda: Dict[str, Dict[str, Any]] = {}
    total_leads_interes = 0
    try:
        cur = db.lead_captures.find({"interes": {"$ne": None}},
                                    {"_id": 0, "property_id": 1, "interes": 1})
        async for l in cur:
            total_leads_interes += 1
            pidx = l.get("property_id") or "—"
            leads_por_proyecto[pidx] = leads_por_proyecto.get(pidx, 0) + 1
            plan = (l.get("interes") or {}).get("plan") or "—"
            slot = plan_demanda.setdefault(plan, {"plan": plan, "veces": 0, "precio_prom": 0, "_suma": 0})
            slot["veces"] += 1
            pr = (l.get("interes") or {}).get("precio")
            if isinstance(pr, (int, float)):
                slot["_suma"] += pr
    except Exception as e:  # noqa
        log.warning(f"[catalog_pulse] demanda: {e}")
    for slot in plan_demanda.values():
        slot["precio_prom"] = round(slot["_suma"] / slot["veces"]) if slot["veces"] else 0
        slot.pop("_suma", None)
    top_planes = sorted(plan_demanda.values(), key=lambda s: -s["veces"])[:6]
    for p in proyectos:
        p["leads_interes"] = leads_por_proyecto.get(p["project_id"], 0)

    proyectos.sort(key=lambda p: (-p["leads_interes"], p["readiness_pct"]))
    cobertura = [{"key": k, "label": _CHECK_LABELS[k], "configurados": v,
                  "pct": round(v / n * 100) if n else 0} for k, v in cov_counts.items()]

    return {
        "total_proyectos": n,
        "resumen": {
            "readiness_promedio": round(readiness_sum / n) if n else 0,
            "listas_para_publicar": publicables,
            "leads_con_interes": total_leads_interes,
        },
        "cobertura": sorted(cobertura, key=lambda c: c["pct"]),
        "demanda": {"total": total_leads_interes, "top_planes": top_planes},
        "proyectos": proyectos,
    }


@router.get("/dashboard")
async def get_catalog_pulse(request: Request):
    from permissions import require_superadmin
    await require_superadmin(request)
    db = request.app.state.db
    return await catalog_pulse(db)


async def project_detail(db, pid: str) -> Dict[str, Any]:
    """Ficha COMPLETA de un proyecto para el superadmin (vista de dios): todo lo que ve el comprador
    + todo lo interno que ve el dev (comisión, políticas, costos) + operación (leads/demanda).
    Reusa project_full + sellos; agrega lo que el overlay público OCULTA."""
    from routes.dev_project_full import project_full, project_readiness, legal_seal
    from routes.dev_batch2 import construction_seal
    from data_developments import DEVELOPMENTS_BY_ID

    full = await project_full(db, pid)
    if not full:
        return {}
    rd = project_readiness(full)
    comm = await db.project_commercialization.find_one({"project_id": pid}, {"_id": 0}) or {}
    seed = DEVELOPMENTS_BY_ID.get(pid) or await db.projects.find_one(
        {"$or": [{"id": pid}, {"slug": pid}]}, {"_id": 0}) or {}
    pub = await db.developments.find_one({"id": pid}, {"_id": 0, "published_at": 1, "published_by": 1})
    con = full.get("construccion") or {}
    leg = full.get("legal") or {}

    # Demanda de este proyecto (los planes que pidieron sus compradores)
    demanda: Dict[str, int] = {}
    n_leads = 0
    try:
        async for l in db.lead_captures.find({"property_id": pid, "interes": {"$ne": None}},
                                             {"_id": 0, "interes": 1}):
            n_leads += 1
            plan = (l.get("interes") or {}).get("plan") or "—"
            demanda[plan] = demanda.get(plan, 0) + 1
    except Exception:
        pass

    return {
        "project_id": pid, "nombre": full.get("nombre"),
        "colonia": (full.get("ubicacion") or {}).get("colonia"),
        "cover": await _cover(db, pid),
        "price_from": full.get("price_from"), "price_to": full.get("price_to"),
        "stage": full.get("stage"), "units_total": full.get("units_total"),
        "delivery_estimate": full.get("delivery_estimate"),
        "publicado": bool((pub or {}).get("published_at")),
        "readiness": rd,
        # Lo que ve el COMPRADOR (público)
        "comprador": {
            "amenidades": (full.get("amenidades") or {}).get("amenities") or [],
            "servicios": (full.get("amenidades") or {}).get("servicios") or {},
            "formas_pago": (full.get("pagos") or {}).get("schemes") or [],
            "sistema_constructivo": con.get("sistema_constructivo") or {},
            "sello_constructivo": construction_seal(con.get("sistema_constructivo") or {}),
            "sello_legal": legal_seal(leg.get("estado"), leg.get("docs") or 0, leg.get("verificados") or 0),
            "plusvalia_pct": full.get("plusvalia_desde_lanzamiento_pct"),
            "fotos": (full.get("contenido") or {}).get("photos", 0) + (full.get("contenido") or {}).get("assets", 0),
        },
        # Lo INTERNO que ve el DEV (no sale al comprador). Usa el bloque fusionado de project_full
        # (aplica defaults) + marca si está configurado de verdad.
        "interno": (lambda fc: {
            "comercializacion_configurada": fc.get("configured"),
            "trabaja_con_brokers": fc.get("works_with_brokers"),
            "solo_interno": fc.get("in_house_only"),
            "comision_pct": fc.get("default_commission_pct"),
            "broker_policy": fc.get("broker_policy") or {},
            "sales_policy": fc.get("sales_policy") or {},
            "iva_incluido": comm.get("iva_included"),
            "costo_construccion": seed.get("construction_cost"),
            "precio_objetivo": seed.get("target_price") or seed.get("price_from"),
            "absorcion_meses_meta": seed.get("target_absorption_months"),
            "documentos_legales": leg.get("docs") or 0,
            "developer_id": seed.get("developer_id"),
            "dev_org_id": seed.get("dev_org_id") or seed.get("developer_id"),
            "fuente": full.get("source"),
        })(full.get("comercializacion") or {}),
        # OPERACIÓN (demanda real)
        "operacion": {
            "leads_interes": n_leads,
            "demanda_planes": sorted(
                [{"plan": k, "veces": v} for k, v in demanda.items()], key=lambda x: -x["veces"]),
        },
    }


@router.get("/project/{project_id}")
async def get_project_detail(project_id: str, request: Request):
    from permissions import require_superadmin
    await require_superadmin(request)
    db = request.app.state.db
    d = await project_detail(db, project_id)
    if not d:
        from fastapi import HTTPException
        raise HTTPException(404, "Proyecto no encontrado")
    return d
