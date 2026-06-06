"""Superadmin · Portal "Dev-Master" (Fase 0-2). El superadmin ve TODOS los desarrollos de todos los
devs como un marketplace interno, entra a la ficha completa de cada uno (3 lentes: concentrado +
analítica + solo-superadmin) y tiene un home global con máxima granularidad.

Reusa la capa unificada (project_full/readiness) + la ficha de dios de catalog_pulse + los motores
ya existentes. NO duplica nada. Additive.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request

log = logging.getLogger("dmx.devmaster")
router = APIRouter(prefix="/api/superadmin/devmaster", tags=["superadmin_devmaster"])


async def _project_doc(db, pid: str) -> Dict[str, Any]:
    from data_developments import DEVELOPMENTS_BY_ID
    return (DEVELOPMENTS_BY_ID.get(pid)
            or await db.projects.find_one({"$or": [{"id": pid}, {"slug": pid}]}, {"_id": 0})
            or await db.developments.find_one({"id": pid}, {"_id": 0}) or {})


async def _catalog_rows(db) -> List[Dict[str, Any]]:
    """Filas ligeras de TODOS los proyectos (sin portada) — base de la lista y del comparativo."""
    from routes.dev_project_full import project_full, project_readiness
    from routes.superadmin_catalog_pulse import _all_project_ids

    ids = await _all_project_ids(db)
    try:
        pub_ids = {d["id"] async for d in db.developments.find({"published_at": {"$ne": None}}, {"_id": 0, "id": 1})}
    except Exception:
        pub_ids = set()
    leads_map: Dict[str, int] = {}
    try:
        async for l in db.lead_captures.find({"interes": {"$ne": None}}, {"_id": 0, "property_id": 1}):
            k = l.get("property_id") or "—"
            leads_map[k] = leads_map.get(k, 0) + 1
    except Exception:
        pass

    rows: List[Dict[str, Any]] = []
    for pid in ids:
        try:
            full = await project_full(db, pid)
        except Exception:
            full = None
        if not full:
            continue
        doc = await _project_doc(db, pid)
        loc = full.get("ubicacion") or {}
        rd = project_readiness(full)
        rows.append({
            "project_id": pid, "nombre": full.get("nombre"), "colonia": loc.get("colonia"),
            "alcaldia": loc.get("alcaldia") or doc.get("alcaldia"), "segmento": doc.get("segmento"),
            "stage": full.get("stage"), "dev_org": doc.get("dev_org_id") or doc.get("developer_id"),
            "price_from": full.get("price_from"), "readiness_pct": rd.get("pct", 0),
            "publishable": rd.get("publishable", False), "publicado": pid in pub_ids,
            "leads_interes": leads_map.get(pid, 0),
        })
    return rows


# ─── Fase 0 · Catálogo global con filtros + facetas ──────────────────────────────
@router.get("/projects")
async def list_projects(request: Request, zona: Optional[str] = None, segmento: Optional[str] = None,
                        etapa: Optional[str] = None, dev: Optional[str] = None,
                        publicado: Optional[str] = None, q: Optional[str] = None):
    from permissions import require_superadmin
    await require_superadmin(request)
    db = request.app.state.db
    from routes.superadmin_catalog_pulse import _cover

    rows = await _catalog_rows(db)
    facetas = {"zonas": sorted({r["colonia"] for r in rows if r["colonia"]}),
               "segmentos": sorted({r["segmento"] for r in rows if r["segmento"]}),
               "etapas": sorted({r["stage"] for r in rows if r["stage"]}),
               "devs": sorted({r["dev_org"] for r in rows if r["dev_org"]})}

    def _ok(r):
        if zona and r["colonia"] != zona:
            return False
        if segmento and r["segmento"] != segmento:
            return False
        if etapa and r["stage"] != etapa:
            return False
        if dev and r["dev_org"] != dev:
            return False
        if publicado in ("true", "false") and r["publicado"] != (publicado == "true"):
            return False
        if q and q.lower() not in f"{r.get('nombre') or ''} {r.get('colonia') or ''} {r.get('dev_org') or ''}".lower():
            return False
        return True

    filtered = [dict(r) for r in rows if _ok(r)]
    filtered.sort(key=lambda r: (-r["leads_interes"], -r["readiness_pct"]))
    for r in filtered[:60]:
        r["cover"] = await _cover(db, r["project_id"])
    return {"total": len(filtered), "total_catalogo": len(rows), "facetas": facetas, "proyectos": filtered}


# ─── Fase 1 · Ficha completa del proyecto (concentrado + analítica + solo-superadmin) ─
def _pct_rank(values: List[float], v: float) -> int:
    vals = [x for x in values if isinstance(x, (int, float))]
    if not vals:
        return 0
    below = sum(1 for x in vals if x < v)
    return round(below / len(vals) * 100)


def _avg(values: List[float]) -> Optional[float]:
    vals = [x for x in values if isinstance(x, (int, float)) and x is not None]
    return round(sum(vals) / len(vals)) if vals else None


async def _comparativo(db, pid: str, detail: Dict[str, Any]) -> Dict[str, Any]:
    """Este proyecto vs su cohorte (misma zona; si hay pocas, su segmento; si no, todo el catálogo)."""
    rows = await _catalog_rows(db)
    me = next((r for r in rows if r["project_id"] == pid), None)
    if not me:
        return {}
    same_zone = [r for r in rows if r["colonia"] and r["colonia"] == me["colonia"] and r["project_id"] != pid]
    same_seg = [r for r in rows if r["segmento"] and r["segmento"] == me["segmento"] and r["project_id"] != pid]
    if len(same_zone) >= 2:
        cohorte, etiqueta = same_zone, f"zona {me['colonia']}"
    elif len(same_seg) >= 2:
        cohorte, etiqueta = same_seg, f"segmento {me['segmento']}"
    else:
        cohorte, etiqueta = [r for r in rows if r["project_id"] != pid], "todo el catálogo"
    precios = [r["price_from"] for r in cohorte]
    reads = [r["readiness_pct"] for r in cohorte]
    leads = [r["leads_interes"] for r in cohorte]
    return {
        "cohorte": etiqueta, "n": len(cohorte),
        "precio": {"mio": me["price_from"], "promedio": _avg(precios), "percentil": _pct_rank(precios, me["price_from"] or 0)},
        "readiness": {"mio": me["readiness_pct"], "promedio": _avg(reads), "percentil": _pct_rank(reads, me["readiness_pct"])},
        "demanda": {"mio": me["leads_interes"], "promedio": _avg(leads), "percentil": _pct_rank(leads, me["leads_interes"])},
    }


@router.get("/project/{project_id}")
async def project_view(project_id: str, request: Request):
    from permissions import require_superadmin
    await require_superadmin(request)
    db = request.app.state.db
    from routes.superadmin_catalog_pulse import project_detail

    detail = await project_detail(db, project_id)
    if not detail:
        raise HTTPException(404, "Desarrollo no encontrado")
    detail["comparativo"] = await _comparativo(db, project_id, detail)
    return detail
