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
    leads_map: Dict[str, int] = {}      # cotizador público (alta intención · qué plan piden)
    try:
        async for l in db.lead_captures.find({"interes": {"$ne": None}}, {"_id": 0, "property_id": 1}):
            k = l.get("property_id") or "—"
            leads_map[k] = leads_map.get(k, 0) + 1
    except Exception:
        pass
    leads_db_map: Dict[str, int] = {}   # universo real de leads (db.leads · demanda total)
    try:
        async for l in db.leads.find({}, {"_id": 0, "development_id": 1}):
            k = l.get("development_id")
            if k:
                leads_db_map[k] = leads_db_map.get(k, 0) + 1
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
            "leads_interes": leads_map.get(pid, 0), "leads": leads_db_map.get(pid, 0),
            "units": full.get("units_total") or 0, "legal_docs": (full.get("legal") or {}).get("docs") or 0,
            "plusvalia": full.get("plusvalia_desde_lanzamiento_pct"),
        })
    return rows


def _apply_filters(rows, zona=None, segmento=None, etapa=None, dev=None):
    out = rows
    if zona:
        out = [r for r in out if r["colonia"] == zona]
    if segmento:
        out = [r for r in out if r["segmento"] == segmento]
    if etapa:
        out = [r for r in out if r["stage"] == etapa]
    if dev:
        out = [r for r in out if r["dev_org"] == dev]
    return out


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


# ─── Fase 2 · Home global del dev-master (9 áreas, máxima granularidad, con filtros) ──
def _num(vals):
    return [x for x in vals if isinstance(x, (int, float)) and x is not None]


def _pctile(vals, p):
    v = sorted(_num(vals))
    if not v:
        return None
    k = (len(v) - 1) * p / 100.0
    f = int(k)
    c = min(f + 1, len(v) - 1)
    return round(v[f] + (v[c] - v[f]) * (k - f))


def _group(rows, key):
    out: Dict[str, List[Dict[str, Any]]] = {}
    for r in rows:
        k = r.get(key)
        if k:
            out.setdefault(k, []).append(r)
    return out


@router.get("/home")
async def home(request: Request, zona: Optional[str] = None, segmento: Optional[str] = None,
               etapa: Optional[str] = None, dev: Optional[str] = None):
    from permissions import require_superadmin
    await require_superadmin(request)
    db = request.app.state.db

    all_rows = await _catalog_rows(db)
    rows = _apply_filters(all_rows, zona, segmento, etapa, dev)
    n = len(rows)
    ids = [r["project_id"] for r in rows]
    precios = _num([r["price_from"] for r in rows])
    units_total = sum(r["units"] for r in rows)
    leads_total = sum(r["leads"] for r in rows)            # demanda real (db.leads)
    leads_cotizador = sum(r["leads_interes"] for r in rows)  # alta intención (cotizador)

    # 1. Oferta
    por_etapa = sorted([{"etapa": k, "n": len(v)} for k, v in _group(rows, "stage").items()], key=lambda x: -x["n"])
    dev_groups = _group(rows, "dev_org")
    concentracion = sorted([{"dev": k, "n_proyectos": len(v),
                             "pct": round(len(v) / n * 100) if n else 0} for k, v in dev_groups.items()],
                           key=lambda x: -x["n_proyectos"])[:8]

    # 2. Precios
    precios_blk = {"promedio": round(sum(precios) / len(precios)) if precios else None,
                   "mediana": _pctile(precios, 50), "p25": _pctile(precios, 25), "p75": _pctile(precios, 75),
                   "plusvalia_promedio": (round(sum(_num([r["plusvalia"] for r in rows])) / len(_num([r["plusvalia"] for r in rows])), 1)
                                          if _num([r["plusvalia"] for r in rows]) else None)}

    # 3+4. Demanda + oportunidad (gap) por zona
    zona_groups = _group(rows, "colonia")
    zonas_blk = sorted([{"zona": k, "n_proyectos": len(v), "units": sum(x["units"] for x in v),
                         "precio_prom": (round(sum(_num([x["price_from"] for x in v])) / len(_num([x["price_from"] for x in v])))
                                         if _num([x["price_from"] for x in v]) else None),
                         "leads": sum(x["leads"] for x in v)} for k, v in zona_groups.items()],
                       key=lambda z: -z["leads"])
    # Oportunidad: alta demanda + poco inventario → score = leads / (units+1)
    oportunidad = sorted([{"zona": z["zona"], "units": z["units"], "leads": z["leads"],
                           "score": round(z["leads"] / (z["units"] + 1), 2)} for z in zonas_blk if z["leads"]],
                         key=lambda x: -x["score"])[:6]

    # Top planes que piden (lead_captures interes) — solo de los proyectos filtrados
    plan_demanda: Dict[str, int] = {}
    try:
        q = {"interes": {"$ne": None}}
        if zona or segmento or etapa or dev:
            q["property_id"] = {"$in": ids}
        async for l in db.lead_captures.find(q, {"_id": 0, "interes": 1}):
            p = (l.get("interes") or {}).get("plan") or "—"
            plan_demanda[p] = plan_demanda.get(p, 0) + 1
    except Exception:
        pass
    top_planes = sorted([{"plan": k, "veces": v} for k, v in plan_demanda.items()], key=lambda x: -x["veces"])[:6]

    # 5+6. Canales (db.leads del set filtrado)
    ch = {"inhouse": {"leads": 0, "won": 0}, "broker": {"leads": 0, "won": 0}}
    try:
        async for l in db.leads.find({"development_id": {"$in": ids}}, {"_id": 0, "channel": 1, "status": 1, "status_v2": 1}):
            c = l.get("channel") or "inhouse"
            c = "broker" if c == "broker" else "inhouse"
            ch[c]["leads"] += 1
            st = (l.get("status_v2") or l.get("status") or "").lower()
            if st in ("won", "ganado", "cierre", "closed", "cerrado"):
                ch[c]["won"] += 1
    except Exception:
        pass
    for c in ch.values():
        c["conversion"] = round(c["won"] / c["leads"] * 100, 1) if c["leads"] else 0

    # 7. Devs ranking
    devs_blk = sorted([{"dev": k, "n_proyectos": len(v), "units": sum(x["units"] for x in v),
                        "readiness_prom": round(sum(x["readiness_pct"] for x in v) / len(v)) if v else 0,
                        "leads": sum(x["leads"] for x in v)} for k, v in dev_groups.items()],
                      key=lambda x: -x["n_proyectos"])[:10]

    # 9. Riesgo
    con_legal = sum(1 for r in rows if r["legal_docs"] >= 1)
    baja_readiness = sum(1 for r in rows if r["readiness_pct"] < 50)

    return {
        "filtros": {"zona": zona, "segmento": segmento, "etapa": etapa, "dev": dev},
        "facetas": {"zonas": sorted({r["colonia"] for r in all_rows if r["colonia"]}),
                    "segmentos": sorted({r["segmento"] for r in all_rows if r["segmento"]}),
                    "etapas": sorted({r["stage"] for r in all_rows if r["stage"]}),
                    "devs": sorted({r["dev_org"] for r in all_rows if r["dev_org"]})},
        "resumen": {
            "desarrollos": n, "unidades": units_total, "leads": leads_total, "leads_cotizador": leads_cotizador,
            "ticket_promedio": precios_blk["promedio"], "readiness_promedio": round(sum(r["readiness_pct"] for r in rows) / n) if n else 0,
            "publicados": sum(1 for r in rows if r["publicado"]), "devs": len(dev_groups),
        },
        "oferta": {"por_etapa": por_etapa, "concentracion_devs": concentracion},
        "precios": precios_blk,
        "demanda": {"leads_total": leads_total, "top_planes": top_planes},
        "oportunidad": oportunidad,
        "canales": ch,
        "devs": devs_blk,
        "zonas": zonas_blk[:12],
        "riesgo": {"con_docs_legales": con_legal, "con_docs_legales_pct": round(con_legal / n * 100) if n else 0,
                   "baja_readiness": baja_readiness},
    }
