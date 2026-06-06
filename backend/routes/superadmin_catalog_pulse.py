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


async def catalog_pulse(db) -> Dict[str, Any]:
    from routes.dev_project_full import project_full, project_readiness

    ids = await _all_project_ids(db)
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
