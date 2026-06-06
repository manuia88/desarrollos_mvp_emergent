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
    return await _home_data(request.app.state.db, zona, segmento, etapa, dev)


async def _home_data(db, zona=None, segmento=None, etapa=None, dev=None):
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


# ─── Fase 3 · Brief del mercado (asistente que sintetiza + recomienda · IA-first) ────
def _mmm(n):
    return f"${round((n or 0) / 1e6, 1)}M" if n else "—"


async def _market_brief(db, zona=None, segmento=None, etapa=None, dev=None):
    """El 'asistente del mercado': sintetiza el panorama en una frase + 3 movidas accionables.
    Rule-based hoy (determinista, exacto); built-for-endstate: hook para narrar con LLM (intelligence_engine)."""
    home = await _home_data(db, zona, segmento, etapa, dev)
    rows = _apply_filters(await _catalog_rows(db), zona, segmento, etapa, dev)
    r = home["resumen"]
    zonas = home["zonas"]
    op = home["oportunidad"]
    top_zona = next((z for z in zonas if z["leads"]), None)
    top_plan = (home["demanda"]["top_planes"] or [{}])[0].get("plan")

    # ── Narrativa (lenguaje normal) ──
    partes = [f"Tu catálogo tiene {r['desarrollos']} desarrollos con {r['unidades']} unidades de {r['devs']} desarrolladoras."]
    if top_zona:
        partes.append(f"La demanda se concentra en {top_zona['zona']} ({top_zona['leads']} interesados).")
    if op:
        partes.append(f"Hay oportunidad de construir en {op[0]['zona']}: más gente buscando que inventario.")
    if r["readiness_promedio"] < 60:
        partes.append(f"Pero el catálogo está en promedio al {r['readiness_promedio']}% — muchas fichas aún no listas para publicar.")
    if top_plan:
        partes.append(f"El plan de pago que más piden es {top_plan}.")
    resumen = " ".join(partes)

    # ── 3 movidas accionables (agentic) ──
    acciones = []
    # 1. Proyecto con demanda pero ficha incompleta / sin publicar → completarlo
    cand = [r2 for r2 in rows if r2["leads"] and not r2["publicado"]]
    cand.sort(key=lambda x: (-x["leads"], x["readiness_pct"]))
    if cand:
        c = cand[0]
        acciones.append({"tipo": "completar", "project_id": c["project_id"],
                         "texto": f"{c['nombre']} tiene {c['leads']} interesados pero no está publicado (ficha {c['readiness_pct']}%). Complétala y publícala.",
                         "link": f"/superadmin/desarrollos/{c['project_id']}"})
    # 2. Oportunidad de construcción
    if op:
        acciones.append({"tipo": "oportunidad", "zona": op[0]["zona"],
                         "texto": f"Dile a tus devs: en {op[0]['zona']} hay {op[0]['leads']} buscando y solo {op[0]['units']} unidades — buena zona para construir.",
                         "link": f"/superadmin/desarrollos?zona={op[0]['zona']}"})
    # 3. Riesgo legal / completitud
    if home["riesgo"]["con_docs_legales_pct"] < 40:
        acciones.append({"tipo": "riesgo",
                         "texto": f"Solo {home['riesgo']['con_docs_legales_pct']}% del catálogo tiene documentos legales — empuja a los devs a subirlos (confianza del comprador).",
                         "link": "/superadmin/desarrollos"})
    elif home["riesgo"]["baja_readiness"]:
        acciones.append({"tipo": "riesgo",
                         "texto": f"{home['riesgo']['baja_readiness']} fichas están bajo 50% — no se podrán publicar hasta completarlas.",
                         "link": "/superadmin/desarrollos"})

    return {
        "titulo": "El mercado hoy",
        "resumen": resumen,
        "señales": [
            {"label": "Demanda", "valor": f"{r['leads']} leads", "sub": (f"foco {top_zona['zona']}" if top_zona else "")},
            {"label": "Oportunidad", "valor": (op[0]["zona"] if op else "—"), "sub": (f"índice {op[0]['score']}" if op else "")},
            {"label": "Listas para publicar", "valor": f"{r['publicados']}/{r['desarrollos']}", "sub": f"{r['readiness_promedio']}% prom"},
            {"label": "Ticket promedio", "valor": _mmm(r["ticket_promedio"]), "sub": top_plan or ""},
        ],
        "acciones": acciones[:3],
        "fuente": "asistente-de-mercado",
    }


@router.get("/brief")
async def brief(request: Request, zona: Optional[str] = None, segmento: Optional[str] = None,
                etapa: Optional[str] = None, dev: Optional[str] = None):
    from permissions import require_superadmin
    await require_superadmin(request)
    return await _market_brief(request.app.state.db, zona, segmento, etapa, dev)


# ─── Fase 3 #2 · Dónde construir (demanda latente: zona × banda de precio × recámaras) ──
# Cruza la DEMANDA real (leads: presupuesto + prototipo → recámaras + desarrollo → zona) contra la
# OFERTA (unidades disponibles por banda/recámaras). Responde la pregunta del founder: "N compradores
# buscan X en zona Y y solo hay M unidades → construye esto". Reusa dmx_demand (cubo) como señal
# secundaria. Built-for-endstate: cotizador (marketplace) y modelo de gusto (amenidades) stubbeados,
# se autollenan al llegar el dato. Cero deuda.
_BANDS = [(0, 6e6, "< $6M"), (6e6, 9e6, "$6–9M"), (9e6, 12e6, "$9–12M"),
          (12e6, 16e6, "$12–16M"), (16e6, 22e6, "$16–22M"), (22e6, float("inf"), "$22M+")]


def _band_label(mxn):
    for lo, hi, lab in _BANDS:
        if mxn is not None and lo <= mxn < hi:
            return lab
    return None


def _band_overlaps(pf, pt):
    """Bandas que cruza un rango [price_from, price_to]."""
    pf = pf or 0
    pt = pt or pf
    return [lab for lo, hi, lab in _BANDS if pf < hi and pt >= lo]


def _proto_to_recamaras(proto, br):
    """Mapea prototipo (A/B/PH) a recámaras dentro del rango del desarrollo (heurística defensiva)."""
    if not br or not isinstance(br, (list, tuple)) or not br:
        return None
    lo, hi = (br[0], br[-1]) if len(br) >= 2 else (br[0], br[0])
    p = (proto or "").upper()
    if p == "A":
        return lo
    if p in ("PH", "P"):
        return hi
    if p == "B":
        return round((lo + hi) / 2)
    return round((lo + hi) / 2)


def _mode(vals):
    vals = [v for v in vals if v is not None]
    if not vals:
        return None
    counts: Dict[Any, int] = {}
    for v in vals:
        counts[v] = counts.get(v, 0) + 1
    return max(counts.items(), key=lambda x: x[1])[0]


_PROTO_LABEL = {"A": "tipo de entrada", "B": "intermedio", "PH": "penthouse"}


async def _donde_construir(db, zona=None, segmento=None):
    from data_developments import DEVELOPMENTS_BY_ID, DEVELOPMENTS

    # 0. Universo de desarrollos (filtrado por zona si aplica) + lookup
    devs = list(DEVELOPMENTS)
    if zona:
        devs = [d for d in devs if d.get("colonia") == zona]
    dev_ids = {d["id"] for d in devs}

    # 1. DEMANDA real — leads (presupuesto + prototipo → recámaras + desarrollo → zona)
    demand_cells: Dict[tuple, Dict[str, Any]] = {}     # (zona, banda) → agg
    proto_pop: Dict[str, Dict[str, int]] = {}          # zona → {proto: n}
    leads_usados = 0
    try:
        async for l in db.leads.find({}, {"_id": 0, "development_id": 1, "budget_mxn": 1, "prototype_interes": 1}):
            did = l.get("development_id")
            dv = DEVELOPMENTS_BY_ID.get(did)
            if not dv:
                continue
            z = dv.get("colonia")
            if zona and z != zona:
                continue
            band = _band_label(l.get("budget_mxn"))
            if not band:
                continue
            rec = _proto_to_recamaras(l.get("prototype_interes"), dv.get("bedrooms_range"))
            key = (z, band)
            cell = demand_cells.setdefault(key, {"zona": z, "banda": band, "demanda": 0, "_rec": [], "_dids": set()})
            cell["demanda"] += 1
            cell["_rec"].append(rec)
            cell["_dids"].add(did)
            proto = (l.get("prototype_interes") or "—").upper()
            proto_pop.setdefault(z, {})[proto] = proto_pop.setdefault(z, {}).get(proto, 0) + 1
            leads_usados += 1
    except Exception as e:
        log.warning("donde_construir demanda leads: %s", e)

    # 1b. Cotizador (marketplace) — STUB hoy (lead_captures vacío), se autollena. Fail-open.
    cotizador_usados = 0
    try:
        async for l in db.lead_captures.find({"interes": {"$ne": None}}, {"_id": 0, "property_id": 1, "interes": 1}):
            dv = DEVELOPMENTS_BY_ID.get(l.get("property_id"))
            if not dv:
                continue
            z = dv.get("colonia")
            if zona and z != zona:
                continue
            band = _band_label((l.get("interes") or {}).get("precio") or dv.get("price_from"))
            if not band:
                continue
            cell = demand_cells.setdefault((z, band), {"zona": z, "banda": band, "demanda": 0, "_rec": [], "_dids": set()})
            cell["demanda"] += 1
            cotizador_usados += 1
    except Exception:
        pass

    # 2. OFERTA — units_available distribuidas en las bandas que cruza cada desarrollo
    supply_cells: Dict[tuple, Dict[str, Any]] = {}     # (zona, banda) → agg
    for d in devs:
        z = d.get("colonia")
        avail = d.get("units_available") or 0
        if not z or avail <= 0:
            continue
        bands = _band_overlaps(d.get("price_from"), d.get("price_to")) or [_band_label(d.get("price_from"))]
        bands = [b for b in bands if b]
        if not bands:
            continue
        per = avail / len(bands)
        br = d.get("bedrooms_range")
        rec_typ = round((br[0] + br[-1]) / 2) if br else None
        for b in bands:
            cell = supply_cells.setdefault((z, b), {"zona": z, "banda": b, "oferta": 0, "_rec": [], "_devs": 0})
            cell["oferta"] += per
            cell["_devs"] += 1
            if rec_typ:
                cell["_rec"].append(rec_typ)

    # 3. CRUCE → celdas con gap + veredicto + mensaje en lenguaje normal
    all_keys = set(demand_cells) | set(supply_cells)
    dmax = max([c["demanda"] for c in demand_cells.values()] or [1])
    smax = max([c["oferta"] for c in supply_cells.values()] or [1])
    cells: List[Dict[str, Any]] = []
    for k in all_keys:
        dem = demand_cells.get(k, {})
        sup = supply_cells.get(k, {})
        z, band = k
        demanda = dem.get("demanda", 0)
        oferta = round(sup.get("oferta", 0))
        rec_dem = _mode(dem.get("_rec", []))
        rec_sup = _mode(sup.get("_rec", []))
        rec = rec_dem or rec_sup
        gap = round((demanda / dmax) - (oferta / smax), 3)
        ratio = round(demanda / (oferta + 1), 2)
        if demanda == 0:
            verdict, color = "Sobreoferta: inventario sin demanda", "rojo"
        elif oferta == 0:
            verdict, color = "Construir: demanda sin inventario", "verde"
        elif ratio >= 2:
            verdict, color = "Construir: mucha más demanda que oferta", "verde"
        elif ratio >= 1:
            verdict, color = "Ventana: la demanda supera la oferta", "ambar"
        else:
            verdict, color = "Equilibrado", "neutro"
        rec_txt = f"{rec} rec" if rec else "esta tipología"
        if demanda and oferta == 0:
            msg = f"En {z}, {demanda} compradores buscan {rec_txt} ~{band} y NO hay inventario → construye {rec_txt} en {band}."
        elif demanda:
            msg = f"En {z}, {demanda} buscan {rec_txt} ~{band} y solo hay {oferta} unidades → {'construye más' if ratio >= 1 else 'sostén'} {rec_txt}."
        else:
            msg = f"En {z} hay {oferta} unidades ~{band} sin demanda registrada → cuidado con sobreoferta."
        cells.append({"zona": z, "banda": band, "recamaras": rec, "demanda": demanda, "oferta": oferta,
                      "gap_score": gap, "ratio": ratio, "veredicto": verdict, "color": color,
                      "mensaje": msg, "devs": sup.get("_devs", 0)})

    oportunidades = sorted([c for c in cells if c["demanda"] > 0], key=lambda x: (-x["gap_score"], -x["ratio"]))
    sobreoferta = sorted([c for c in cells if c["demanda"] == 0 and c["oferta"] > 0], key=lambda x: -x["oferta"])[:5]

    # 4. Agregado por zona (macro)
    by_zone: Dict[str, Dict[str, Any]] = {}
    for c in cells:
        z = by_zone.setdefault(c["zona"], {"zona": c["zona"], "demanda": 0, "oferta": 0})
        z["demanda"] += c["demanda"]
        z["oferta"] += c["oferta"]
    por_zona = sorted(by_zone.values(), key=lambda z: -(z["demanda"] / (z["oferta"] + 1)))
    for z in por_zona:
        z["indice_oportunidad"] = round(z["demanda"] / (z["oferta"] + 1), 2)

    # 5. Prototipo más pedido (qué tipo de producto piden) — global + por zona top
    proto_global: Dict[str, int] = {}
    for zmap in proto_pop.values():
        for p, n in zmap.items():
            proto_global[p] = proto_global.get(p, 0) + n
    top_proto = max(proto_global.items(), key=lambda x: x[1])[0] if proto_global else None
    prototipo_pedido = {
        "global": ({"proto": top_proto, "label": _PROTO_LABEL.get(top_proto, top_proto), "veces": proto_global.get(top_proto, 0)}
                   if top_proto else None),
        "por_zona": sorted([
            {"zona": z, "proto": (max(m.items(), key=lambda x: x[1])[0]),
             "label": _PROTO_LABEL.get(max(m.items(), key=lambda x: x[1])[0], "—"),
             "veces": max(m.values())} for z, m in proto_pop.items() if m],
            key=lambda x: -x["veces"])[:6],
    }

    # 6. Amenidades sugeridas — STUB del modelo de gusto (Fase 3 #11). Hoy: las que más ofrecen los
    #    desarrollos en las zonas de mayor demanda. Se afina con el taste model. Fail-open.
    top_zonas_dem = {z["zona"] for z in por_zona[:3] if z["demanda"]}
    amen_count: Dict[str, int] = {}
    for d in devs:
        if d.get("colonia") in top_zonas_dem:
            for a in (d.get("amenities") or []):
                amen_count[a] = amen_count.get(a, 0) + 1
    amenidades = sorted([{"amenidad": a, "veces": n} for a, n in amen_count.items()], key=lambda x: -x["veces"])[:6]

    # 7. Señal secundaria: cubo zona × tipología (dmx_demand) — se enriquece cuando carguen átomos
    cube = {"fuente": "no-disponible", "cells": []}
    try:
        import dmx_demand
        cg = await dmx_demand.demand_gap(db, top=8)
        cube = {"fuente": cg.get("demand_source"), "cells": cg.get("cells", [])[:8]}
    except Exception as e:
        log.info("donde_construir cubo no disponible: %s", e)

    # 8. Resumen accionable (una frase)
    if oportunidades:
        o = oportunidades[0]
        rec_txt = f"{o['recamaras']} rec" if o["recamaras"] else "producto"
        resumen = (f"La mayor oportunidad: {rec_txt} ~{o['banda']} en {o['zona']} — "
                   f"{o['demanda']} buscando y {o['oferta']} disponibles.")
    elif leads_usados == 0:
        resumen = "Aún no hay demanda registrada para cruzar. Se llena cuando entren leads y cotizaciones."
    else:
        resumen = "Oferta y demanda están equilibradas en el catálogo actual."

    return {
        "filtros": {"zona": zona, "segmento": segmento},
        "resumen": resumen,
        "oportunidades": oportunidades[:12],
        "sobreoferta": sobreoferta,
        "por_zona": por_zona[:12],
        "prototipo_pedido": prototipo_pedido,
        "amenidades_sugeridas": amenidades,
        "cube": cube,
        "fuente": {
            "demanda": "leads-reales" if leads_usados else "sin-datos",
            "leads_usados": leads_usados,
            "cotizador_usados": cotizador_usados,
            "amenidades": "oferta-actual (el modelo de gusto la afinará)",
        },
    }


@router.get("/donde-construir")
async def donde_construir(request: Request, zona: Optional[str] = None, segmento: Optional[str] = None):
    from permissions import require_superadmin
    await require_superadmin(request)
    return await _donde_construir(request.app.state.db, zona, segmento)


# ─── Fase 3 #11 · Gusto visual del mercado (modelo de gusto agregado) ────────────────
# Rescata el modelo de gusto (B5.4 · per-contacto) y lo AGREGA a nivel mercado: qué cuartos/estilos
# enganchan, qué amenidades mueven la demanda (lift), qué fotos conviene subir. Primary: swipes reales
# (asesor_swipe_events); fallback: tags del catálogo (photo_tagger) ponderados por demanda (leads).
# Built-for-endstate: se autoafina cuando entren swipes/tags/perfiles. Cero deuda.
_FEAT_LABEL = {"luz_natural": "Luz natural", "ventanal": "Ventanales", "moderno": "Moderno",
               "lujo": "Lujo", "amplio": "Amplio", "vista_ciudad": "Vista a la ciudad",
               "madera": "Madera", "verde": "Áreas verdes"}
_AMEN_LABEL = {"gym": "Gimnasio", "alberca": "Alberca", "concierge": "Concierge", "roof": "Roof garden",
               "spa": "Spa", "sky_lounge": "Sky lounge", "cava": "Cava", "seguridad": "Seguridad 24/7",
               "salon_eventos": "Salón de eventos", "business_center": "Business center",
               "pet_friendly": "Pet friendly", "cine": "Cine", "coworking": "Coworking"}


def _lift_pct(lift):
    if lift >= 1.15:
        return f"+{round((lift - 1) * 100)}% interés"
    if lift <= 0.85:
        return f"−{round((1 - lift) * 100)}% interés"
    return "estándar (no diferencia)"


async def _gusto_mercado(db, zona=None, segmento=None):
    from data_developments import DEVELOPMENTS
    import photo_tagger as pt

    devs = [d for d in DEVELOPMENTS if (not zona or d.get("colonia") == zona)]

    # Demanda por desarrollo (db.leads) — peso de "qué engancha"
    leads_by_dev: Dict[str, int] = {}
    try:
        async for l in db.leads.find({}, {"_id": 0, "development_id": 1}):
            k = l.get("development_id")
            if k:
                leads_by_dev[k] = leads_by_dev.get(k, 0) + 1
    except Exception:
        pass

    # Peso de engagement: swipes del COMPRADOR (link tipo Tinder que manda el asesor) si existen
    # (asesor_swipe_events · B5.4 Capa 1), si no → demanda (leads). Esquema real del evento:
    # type ∈ {photo_view, photo_return, photo_zoom, detail_open, detail_dwell, decision(thumb up/down)}.
    swipe_n = 0
    swipe_by_dev: Dict[str, float] = {}
    try:
        swipe_n = await db.asesor_swipe_events.count_documents({})
        if swipe_n:
            async for ev in db.asesor_swipe_events.find({}, {"_id": 0, "dev_id": 1, "type": 1, "thumb": 1, "dwell_ms": 1}):
                did = ev.get("dev_id")
                if not did:
                    continue
                typ = (ev.get("type") or "").lower()
                if typ == "decision":
                    w = 3.0 if (ev.get("thumb") == "up") else 0.2      # 👍 fuerte · 👎 casi nulo
                elif typ in ("detail_open", "photo_return", "photo_zoom"):
                    w = 1.5                                            # señales de interés
                else:
                    w = 0.5                                            # vista simple
                w += min((ev.get("dwell_ms") or 0) / 4000.0, 2.0)     # + tiempo en la foto
                swipe_by_dev[did] = swipe_by_dev.get(did, 0) + w
    except Exception:
        pass
    weight_by_dev = swipe_by_dev if swipe_n else {k: float(v) for k, v in leads_by_dev.items()}
    fuente_taste = "swipes-reales" if swipe_n else "estimado-catalogo"

    # 1. Tag de TODAS las fotos del catálogo → distribución (mostrado) + ponderada (engancha)
    room_cat: Dict[str, int] = {}
    room_w: Dict[str, float] = {}
    feat_cat: Dict[str, int] = {}
    feat_w: Dict[str, float] = {}
    room_by_zone: Dict[str, Dict[str, int]] = {}
    for d in devs:
        w = weight_by_dev.get(d["id"], 0.0)
        z = d.get("colonia")
        for url in (d.get("photos") or []):
            t = pt.tag_from_url(url)
            rl = t.get("room_label") or "Interior"
            room_cat[rl] = room_cat.get(rl, 0) + 1
            room_w[rl] = room_w.get(rl, 0) + w
            if z:
                room_by_zone.setdefault(z, {})[rl] = room_by_zone.setdefault(z, {}).get(rl, 0) + 1
            for f in (t.get("features") or []):
                feat_cat[f] = feat_cat.get(f, 0) + 1
                feat_w[f] = feat_w.get(f, 0) + w

    tot_cat = sum(room_cat.values()) or 1
    tot_w = sum(room_w.values()) or 1
    ftot_cat = sum(feat_cat.values()) or 1
    ftot_w = sum(feat_w.values()) or 1

    def _indice(cat, c_tot, w, w_tot, count):
        cs = cat / c_tot
        ws = w / w_tot
        return round((ws / cs), 2) if cs else 1.0

    gusto_visual = []
    for rl, c in room_cat.items():
        ind = _indice(c, tot_cat, room_w.get(rl, 0), tot_w, c)
        gusto_visual.append({"tag": rl, "tipo": "cuarto", "veces": c, "indice_interes": ind})
    for f, c in feat_cat.items():
        ind = _indice(c, ftot_cat, feat_w.get(f, 0), ftot_w, c)
        gusto_visual.append({"tag": _FEAT_LABEL.get(f, f.title()), "tipo": "estilo", "veces": c, "indice_interes": ind})
    gusto_visual.sort(key=lambda x: -x["indice_interes"])

    # 2. Amenidades que mueven la aguja — lift de demanda (avg leads con amenidad / avg global)
    all_leads = [leads_by_dev.get(d["id"], 0) for d in devs]
    avg_all = (sum(all_leads) / len(all_leads)) if all_leads else 0
    amen_vals: Dict[str, List[int]] = {}
    for d in devs:
        for a in (d.get("amenities") or []):
            amen_vals.setdefault(a, []).append(leads_by_dev.get(d["id"], 0))
    amenidades = []
    for a, vals in amen_vals.items():
        m = sum(vals) / len(vals)
        lift = round(m / avg_all, 2) if avg_all else 1.0
        amenidades.append({"amenidad": a, "label": _AMEN_LABEL.get(a, a.replace("_", " ").title()),
                           "lift": lift, "lift_label": _lift_pct(lift), "n_proyectos": len(vals),
                           "confianza": "alta" if len(vals) >= 5 else "temprana"})
    amenidades.sort(key=lambda x: -x["lift"])

    # 3. Qué fotos conviene subir — cuartos que enganchan (índice alto) pero poco mostrados
    med_cov = sorted(room_cat.values())[len(room_cat) // 2] if room_cat else 0
    fotos_reco = [{"cuarto": g["tag"], "motivo": f"engancha (índice {g['indice_interes']}) pero hay pocas fotos"}
                  for g in gusto_visual if g["tipo"] == "cuarto" and g["indice_interes"] >= 1.1 and g["veces"] <= med_cov][:4]

    # 4. Por zona — qué prefiere cada mercado
    por_zona = []
    for z, rmap in room_by_zone.items():
        top_room = max(rmap.items(), key=lambda x: x[1])[0] if rmap else None
        zdevs = [d for d in devs if d.get("colonia") == z]
        zamen: Dict[str, int] = {}
        for d in zdevs:
            for a in (d.get("amenities") or []):
                zamen[a] = zamen.get(a, 0) + 1
        top_amen = max(zamen.items(), key=lambda x: x[1])[0] if zamen else None
        por_zona.append({"zona": z, "top_cuarto": top_room,
                         "top_amenidad": _AMEN_LABEL.get(top_amen, top_amen) if top_amen else None})

    # 5. Perfil del mercado — agrega asesor_taste_profile si existe; si no, estimado de leads
    perfil = {"fuente": "estimado", "cuartos": [], "caracteristicas": [], "zona_top": None, "precio_tipico": None}
    try:
        tp_n = await db.asesor_taste_profile.count_documents({})
        if tp_n:
            agg_rooms: Dict[str, float] = {}
            agg_feats: Dict[str, float] = {}
            zt: Dict[str, int] = {}
            precios: List[float] = []
            async for p in db.asesor_taste_profile.find({}, {"_id": 0}):
                for r, sc in (p.get("rooms") or {}).items():
                    agg_rooms[r] = agg_rooms.get(r, 0) + (sc or 0)
                for ft, sc in (p.get("features") or {}).items():
                    agg_feats[ft] = agg_feats.get(ft, 0) + (sc or 0)
                if p.get("zona"):
                    zt[p["zona"]] = zt.get(p["zona"], 0) + 1
                if p.get("precio"):
                    precios.append(p["precio"])
            perfil = {"fuente": "swipes-reales",
                      "cuartos": [k for k, _ in sorted(agg_rooms.items(), key=lambda x: -x[1])[:4]],
                      "caracteristicas": [_FEAT_LABEL.get(k, k) for k, _ in sorted(agg_feats.items(), key=lambda x: -x[1])[:4]],
                      "zona_top": (max(zt.items(), key=lambda x: x[1])[0] if zt else None),
                      "precio_tipico": (sorted(precios)[len(precios) // 2] if precios else None)}
        else:
            # estimado: zona más buscada por leads + presupuesto mediano
            budgets: List[int] = []
            zt2: Dict[str, int] = {}
            from data_developments import DEVELOPMENTS_BY_ID
            async for l in db.leads.find({}, {"_id": 0, "budget_mxn": 1, "development_id": 1}):
                if l.get("budget_mxn"):
                    budgets.append(l["budget_mxn"])
                dv = DEVELOPMENTS_BY_ID.get(l.get("development_id"))
                if dv and dv.get("colonia"):
                    zt2[dv["colonia"]] = zt2.get(dv["colonia"], 0) + 1
            perfil["zona_top"] = max(zt2.items(), key=lambda x: x[1])[0] if zt2 else None
            perfil["precio_tipico"] = sorted(budgets)[len(budgets) // 2] if budgets else None
            perfil["caracteristicas"] = [g["tag"] for g in gusto_visual if g["tipo"] == "estilo"][:3]
    except Exception as e:
        log.info("gusto_mercado perfil: %s", e)

    # 6. Resumen + acciones (agentic · en lenguaje normal)
    top_visual = [g["tag"] for g in gusto_visual[:3]]
    top_amen_pos = [a for a in amenidades if a["lift"] >= 1.5][:3]
    estandar = [a["label"] for a in amenidades if 0.85 <= a["lift"] <= 1.15][:2]
    partes = []
    if top_visual:
        partes.append(f"El mercado se fija en {', '.join(top_visual[:2]).lower()}.")
    if top_amen_pos:
        partes.append(f"Lo que más mueve el interés: {', '.join(a['label'].lower() for a in top_amen_pos)}.")
    if estandar:
        partes.append(f"En cambio {', '.join(e.lower() for e in estandar)} ya son estándar y no diferencian.")
    resumen = " ".join(partes) or "Aún no hay suficiente señal de gusto. Se llena con swipes y leads."

    acciones = []
    if top_amen_pos:
        a0 = top_amen_pos[0]
        acciones.append({"tipo": "amenidad",
                         "texto": f"Diles a tus devs: incluir {a0['label'].lower()} se asocia a {a0['lift']}× más interés. {'Señal temprana.' if a0['confianza']=='temprana' else ''}".strip()})
    if fotos_reco:
        acciones.append({"tipo": "fotos",
                         "texto": f"Pide más fotos de {fotos_reco[0]['cuarto'].lower()}: enganchan y casi no se muestran."})
    if estandar:
        acciones.append({"tipo": "diferenciar",
                         "texto": f"{', '.join(estandar)} ya las tiene todo el mundo — para destacar hay que ir por amenidades de mayor interés."})

    return {
        "filtros": {"zona": zona, "segmento": segmento},
        "resumen": resumen,
        "gusto_visual": gusto_visual[:10],
        "amenidades_aguja": amenidades[:10],
        "fotos_recomendadas": fotos_reco,
        "por_zona": sorted(por_zona, key=lambda x: x["zona"])[:12],
        "perfil_mercado": perfil,
        "acciones": acciones[:3],
        "fuente": {"gusto": fuente_taste, "swipes": swipe_n, "leads": sum(leads_by_dev.values()),
                   "amenidades": "leads-reales",
                   "nota": "Se afina solo cuando los compradores swipeen en el link tipo Tinder que les manda el asesor."},
    }


@router.get("/gusto-mercado")
async def gusto_mercado(request: Request, zona: Optional[str] = None, segmento: Optional[str] = None):
    from permissions import require_superadmin
    await require_superadmin(request)
    return await _gusto_mercado(request.app.state.db, zona, segmento)


# ─── Fase 3 · Objeciones + comportamiento del comprador (minería de conversaciones) ──
# Agrega a nivel mercado: qué frena la compra (objeciones) + cómo es y cómo decide el comprador.
# Señal REAL hoy: outcomes de leads (precio vs presupuesto, velocidad de respuesta vs cierre, embudo,
# maduración). Minería de texto de conversaciones (objeciones literales + DISC + sentimiento) cableada
# fail-open: se autollena cuando entren mensajes (whatsapp/conversation_messages). Reusa extract_text_signals
# + infer_disc_from_lead. Cada objeción trae su contra-argumento (agentic). Cero deuda.
_DISC_SELL = {
    "D": "Directo, con datos duros y retorno. Decide rápido — no lo marees.",
    "I": "Con estilo de vida y experiencia. Conecta emocionalmente, usa historias.",
    "S": "Con calma y seguridad. No presiones; da garantías y tiempo.",
    "C": "Con documentos, comparativos y evidencia. Responde TODO al detalle.",
}
_OBJ_LABEL = {
    "precio": "Precio / presupuesto", "respuesta_lenta": "Le contestaron tarde",
    "ubicacion": "Ubicación / zona", "financiamiento": "Crédito / financiamiento",
    "tamano": "Tamaño / espacios", "confianza": "Confianza / legal", "entrega": "Tiempo de entrega",
}
_OBJ_REBUTTAL = {
    "precio": "Resalta plusvalía y plan de pagos; muestra el costo por m² vs la zona (no el precio total).",
    "respuesta_lenta": "Contesta en menos de 2 horas: tus leads rápidos cierran mucho más.",
    "ubicacion": "Apóyate en el score de barrio, conectividad y servicios cercanos.",
    "financiamiento": "Ofrece simulador de crédito (Infonavit/bancario) y enganche flexible.",
    "tamano": "Muestra distribuciones eficientes y opciones de mayor metraje del mismo proyecto.",
    "confianza": "Comparte documentos legales, avance de obra y testimonios verificados.",
    "entrega": "Da fecha de entrega clara y avance de obra con fotos.",
}


def _parse_dt(v):
    from datetime import datetime
    if not v:
        return None
    try:
        return datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except Exception:
        return None


async def _comportamiento(db, zona=None, segmento=None):
    from data_developments import DEVELOPMENTS_BY_ID
    try:
        from disc_inferencer_landing import infer_disc_from_lead, disc_label
    except Exception:
        infer_disc_from_lead = lambda x: None  # noqa: E731
        disc_label = lambda x: "Sin perfil"    # noqa: E731

    WON = ("vendido", "won", "ganado", "cierre", "cerrado")
    LOST = ("perdido", "lost", "descartado")

    leads = []
    try:
        async for l in db.leads.find({}, {"_id": 0}):
            dv = DEVELOPMENTS_BY_ID.get(l.get("development_id"))
            if zona and (not dv or dv.get("colonia") != zona):
                continue
            l["_dev"] = dv
            leads.append(l)
    except Exception as e:
        log.warning("comportamiento leads: %s", e)
    n = len(leads)

    # ── 1. Objeciones ──────────────────────────────────────────────────────────────
    # 1a. Precio (REAL): presupuesto del lead < precio del desarrollo → fricción de precio.
    precio_obj = 0
    precio_lost = 0
    for l in leads:
        dv = l.get("_dev")
        b = l.get("budget_mxn")
        if dv and b and dv.get("price_from") and b < dv["price_from"] * 0.9:
            precio_obj += 1
            if (l.get("status_v2") or "").lower() in LOST:
                precio_lost += 1
    # 1b. Respuesta lenta (REAL): contestados tarde (>6h) y perdidos.
    lenta_obj = sum(1 for l in leads if (l.get("first_response_hrs") or 0) > 6)
    lenta_lost = sum(1 for l in leads if (l.get("first_response_hrs") or 0) > 6 and (l.get("status_v2") or "").lower() in LOST)

    # 1c. Minería de texto de conversaciones (objeciones literales) — fail-open, se autollena.
    text_obj: Dict[str, int] = {}
    msgs_minados = 0
    try:
        from taste_profile import extract_text_signals
        cols = ["whatsapp_messages", "conversation_messages", "chat_messages", "buyer_coach_conversations"]
        for col in cols:
            try:
                async for m in db[col].find({"$or": [{"role": "user"}, {"from": "lead"}, {"sender": "buyer"}]},
                                            {"_id": 0, "text": 1, "body": 1, "content": 1, "message": 1}).limit(500):
                    txt = m.get("text") or m.get("body") or m.get("content") or m.get("message")
                    if not txt:
                        continue
                    sig = extract_text_signals(txt)
                    msgs_minados += 1
                    for s in sig.get("signals", []):
                        if s.get("kind") == "budget" and s.get("polarity") == "neg":
                            text_obj["precio"] = text_obj.get("precio", 0) + 1
                        if s.get("kind") == "feature" and s.get("value") == "amplio" and s.get("polarity") in ("wants", "neg"):
                            text_obj["tamano"] = text_obj.get("tamano", 0) + 1
            except Exception:
                continue
    except Exception:
        pass

    objeciones = []
    if precio_obj:
        objeciones.append({"tipo": "precio", "label": _OBJ_LABEL["precio"], "n": precio_obj,
                           "pct": round(precio_obj / n * 100) if n else 0, "perdidos": precio_lost,
                           "severidad": "alta" if precio_obj >= n * 0.3 else "media", "fuente": "leads-reales",
                           "rebuttal": _OBJ_REBUTTAL["precio"]})
    if lenta_obj:
        objeciones.append({"tipo": "respuesta_lenta", "label": _OBJ_LABEL["respuesta_lenta"], "n": lenta_obj,
                           "pct": round(lenta_obj / n * 100) if n else 0, "perdidos": lenta_lost,
                           "severidad": "alta" if lenta_lost else "media", "fuente": "leads-reales",
                           "rebuttal": _OBJ_REBUTTAL["respuesta_lenta"]})
    for t, c in text_obj.items():
        if t not in [o["tipo"] for o in objeciones]:
            objeciones.append({"tipo": t, "label": _OBJ_LABEL.get(t, t), "n": c,
                               "pct": round(c / max(msgs_minados, 1) * 100), "perdidos": 0,
                               "severidad": "media", "fuente": "conversaciones",
                               "rebuttal": _OBJ_REBUTTAL.get(t, "")})
    # Objeciones que SOLO se detectan con conversaciones (hoy en espera) — visibles como "pendientes".
    pendientes = [{"tipo": t, "label": _OBJ_LABEL[t]} for t in ("ubicacion", "financiamiento", "confianza", "entrega")
                  if t not in text_obj and not msgs_minados]
    objeciones.sort(key=lambda x: -x["n"])

    # ── 2. Comportamiento · DISC del mercado ────────────────────────────────────────
    disc_count: Dict[str, int] = {}
    disc_zone: Dict[str, Dict[str, int]] = {}
    inferibles = 0
    for l in leads:
        d = infer_disc_from_lead(l)
        if d:
            inferibles += 1
            disc_count[d] = disc_count.get(d, 0) + 1
            z = (l.get("_dev") or {}).get("colonia")
            if z:
                disc_zone.setdefault(z, {})[d] = disc_zone.setdefault(z, {}).get(d, 0) + 1
    disc_dist = sorted([{"tipo": k, "label": disc_label(k), "n": v,
                         "pct": round(v / inferibles * 100) if inferibles else 0,
                         "como_venderle": _DISC_SELL.get(k, "")} for k, v in disc_count.items()],
                       key=lambda x: -x["n"])

    # ── 3. Maduración + velocidad de respuesta vs cierre (REAL · la joya) ───────────
    # 3a. Embudo
    funnel_order = ["lead_nuevo", "contactado", "negociacion", "vendido", "perdido"]
    funnel_label = {"lead_nuevo": "Nuevos", "contactado": "Contactados", "negociacion": "En negociación",
                    "vendido": "Ganados", "perdido": "Perdidos"}
    funnel_count: Dict[str, int] = {}
    for l in leads:
        s = (l.get("status_v2") or "lead_nuevo").lower()
        funnel_count[s] = funnel_count.get(s, 0) + 1
    embudo = [{"etapa": funnel_label.get(s, s), "key": s, "n": funnel_count.get(s, 0)} for s in funnel_order if funnel_count.get(s)]

    # 3b. Días promedio a cierre (created_at → last_activity_at de ganados)
    dias = []
    for l in leads:
        if (l.get("status_v2") or "").lower() in WON:
            a, b = _parse_dt(l.get("created_at")), _parse_dt(l.get("last_activity_at"))
            if a and b:
                dias.append((b - a).days)
    dias_cierre = round(sum(dias) / len(dias)) if dias else None

    # 3c. Interacciones promedio
    inter = [l.get("interactions") for l in leads if isinstance(l.get("interactions"), (int, float))]
    inter_prom = round(sum(inter) / len(inter), 1) if inter else None

    # 3d. Velocidad de respuesta vs cierre (la joya accionable)
    buckets = [("Menos de 2h", lambda h: h <= 2), ("2 a 6h", lambda h: 2 < h <= 6), ("Más de 6h", lambda h: h > 6)]
    resp_vs_cierre = []
    for label, cond in buckets:
        grp = [l for l in leads if cond(l.get("first_response_hrs") or 99)]
        won = sum(1 for l in grp if (l.get("status_v2") or "").lower() in WON)
        resp_vs_cierre.append({"rango": label, "leads": len(grp), "cierres": won,
                               "win_rate": round(won / len(grp) * 100) if grp else 0})

    # ── 4. Resumen + acciones (agentic, lenguaje normal) ────────────────────────────
    top_obj = objeciones[0] if objeciones else None
    fast = resp_vs_cierre[0]["win_rate"] if resp_vs_cierre else 0
    slow = resp_vs_cierre[-1]["win_rate"] if resp_vs_cierre else 0
    partes = []
    if top_obj:
        partes.append(f"La objeción que más frena es {top_obj['label'].lower()} ({top_obj['pct']}% de los leads).")
    if dias_cierre is not None:
        partes.append(f"Un cierre tarda en promedio {dias_cierre} días.")
    if fast and fast > slow:
        partes.append(f"Contestar rápido importa: {fast}% de cierre si respondes en <2h vs {slow}% si tardas más de 6h.")
    resumen = " ".join(partes) or "Aún hay poca señal de comportamiento. Se enriquece con cada conversación."

    acciones = []
    if top_obj:
        acciones.append({"tipo": "objecion", "texto": f"Frente a '{top_obj['label'].lower()}': {top_obj['rebuttal']}"})
    if fast and slow is not None and fast > slow:
        acciones.append({"tipo": "velocidad", "texto": f"Pon a tus asesores a contestar en <2h — ahí el cierre es {fast}% vs {slow}%."})
    if disc_dist:
        d0 = disc_dist[0]
        acciones.append({"tipo": "disc", "texto": f"El comprador dominante es {d0['label']}: {d0['como_venderle']}"})
    elif not inferibles:
        acciones.append({"tipo": "disc", "texto": "El perfil de personalidad (DISC) se infiere de las conversaciones — conecta WhatsApp para activarlo."})

    return {
        "filtros": {"zona": zona, "segmento": segmento},
        "resumen": resumen,
        "objeciones": objeciones,
        "objeciones_pendientes": pendientes,
        "disc": {"distribucion": disc_dist, "inferibles": inferibles, "total_leads": n,
                 "fuente": "leads" if inferibles else "espera-conversaciones"},
        "maduracion": {"dias_cierre": dias_cierre, "interacciones_promedio": inter_prom,
                       "embudo": embudo, "respuesta_vs_cierre": resp_vs_cierre},
        "sentimiento": {"fuente": "espera-conversaciones", "positivo": None, "negativo": None,
                        "nota": "Se calcula cuando entren mensajes de los compradores."},
        "acciones": acciones[:3],
        "fuente": {"leads": n, "conversaciones_minadas": msgs_minados,
                   "nota": "Las objeciones literales, el DISC y el sentimiento se afinan con las conversaciones (WhatsApp/chat) del comprador."},
    }


@router.get("/comportamiento")
async def comportamiento(request: Request, zona: Optional[str] = None, segmento: Optional[str] = None):
    from permissions import require_superadmin
    await require_superadmin(request)
    return await _comportamiento(request.app.state.db, zona, segmento)


# ─── Fase 3 · Mercado Predictivo: Stock Score + Sold-Out + Elasticidad de Precio ────
# Cierra el ciclo "¿cuándo se agota y cuánto puedo cobrar?": absorción real (units_sold/reserved
# sobre tiempo) → meses para agotar + stock score · elasticidad cross-seccional (precio vs venta) →
# espacio de precio por proyecto · receta de los que se agotan (lookalike). Reusa forecast_engine
# (precio por zona, fail-open) + datos del catálogo. Built-for-endstate: se afina con ventas reales
# en serie de tiempo. Cero deuda.
import re as _re

_SOLD_FAST = 15   # ≤ meses para agotar el inventario restante = se vende bien (benchmark preventa CDMX)
_SOLD_SLOW = 30   # > = se está estancando


def _months_on_market(dev):
    """Antigüedad en meses, estimada del price_history ('Lanzamiento'→'+N meses'→'Hoy'). Default 12."""
    ph = dev.get("price_history") or []
    mx = 0
    for p in ph:
        m = _re.search(r"(\d{1,2})\s*mes", str(p.get("date", "")).lower())
        if m:
            mx = max(mx, int(m.group(1)))
    return max(mx + 3, 6) if mx else 12  # 'Hoy' ≈ +3m sobre el último hito; piso 6


def _pearson(xs, ys):
    nN = len(xs)
    if nN < 3:
        return None
    mx = sum(xs) / nN
    my = sum(ys) / nN
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    dx = sum((x - mx) ** 2 for x in xs) ** 0.5
    dy = sum((y - my) ** 2 for y in ys) ** 0.5
    if dx == 0 or dy == 0:
        return None
    return round(num / (dx * dy), 2)


def _appreciation_pct(dev):
    ph = dev.get("price_history") or []
    if len(ph) >= 2 and ph[0].get("price") and ph[-1].get("price"):
        return round((ph[-1]["price"] / ph[0]["price"] - 1) * 100, 1)
    return None


async def _stock_soldout(db, zona=None, segmento=None):
    from data_developments import DEVELOPMENTS

    devs = [d for d in DEVELOPMENTS if (not zona or d.get("colonia") == zona)]

    leads_by_dev: Dict[str, int] = {}
    try:
        async for l in db.leads.find({}, {"_id": 0, "development_id": 1}):
            k = l.get("development_id")
            if k:
                leads_by_dev[k] = leads_by_dev.get(k, 0) + 1
    except Exception:
        pass

    # Mediana de precio por zona (para "espacio de precio")
    zona_prices: Dict[str, List[int]] = {}
    for d in devs:
        if d.get("colonia") and d.get("price_from"):
            zona_prices.setdefault(d["colonia"], []).append(d["price_from"])
    zona_med = {z: sorted(v)[len(v) // 2] for z, v in zona_prices.items()}

    proyectos = []
    for d in devs:
        tot = d.get("units_total") or 0
        avail = d.get("units_available") or 0
        sold = d.get("units_sold") or 0
        resv = d.get("units_reserved") or 0
        mom = _months_on_market(d)
        colocadas = sold + resv
        sellthrough = round(colocadas / tot * 100) if tot else 0
        velocity = colocadas / mom if mom else 0                  # unidades/mes
        meses_agotar = round(avail / velocity) if velocity > 0 else None
        leads = leads_by_dev.get(d["id"], 0)
        demanda_presion = round(leads / (avail + 1), 2)

        # Stock score 0-100: vende rápido + demanda + sell-through, penaliza estancado en entrega
        v_score = min(velocity / 2.0, 1.0) * 45                   # 2 u/mes ≈ tope
        d_score = min(demanda_presion / 1.0, 1.0) * 25
        s_score = (sellthrough / 100.0) * 30
        score = round(v_score + d_score + s_score)
        if (d.get("stage") in ("entrega_inmediata", "exclusiva")) and sellthrough < 50:
            score = max(0, score - 12)                            # listo para entregar y aún con mucho stock

        if meses_agotar is not None and meses_agotar <= _SOLD_FAST:
            estado, color = "Se vende bien", "verde"
        elif meses_agotar is not None and meses_agotar <= _SOLD_SLOW:
            estado, color = "Ritmo normal", "neutro"
        else:
            estado, color = "Se está estancando", "rojo"

        # Espacio de precio (elasticidad por proyecto): precio vs mediana de zona + absorción
        med = zona_med.get(d.get("colonia"))
        vs_med = round((d["price_from"] / med - 1) * 100) if (med and d.get("price_from")) else None
        if meses_agotar is not None and meses_agotar <= _SOLD_FAST and (vs_med is None or vs_med <= 5):
            headroom = "Tiene espacio para subir precio"
            headroom_color = "verde"
        elif meses_agotar is not None and meses_agotar > _SOLD_SLOW and (vs_med is not None and vs_med > 5):
            headroom = "Está caro para su demanda — considera ajustar"
            headroom_color = "rojo"
        else:
            headroom = "Precio en línea con su ritmo"
            headroom_color = "neutro"

        proyectos.append({
            "project_id": d["id"], "nombre": d.get("name"), "zona": d.get("colonia"),
            "units_total": tot, "disponibles": avail, "colocadas": colocadas, "sellthrough": sellthrough,
            "meses_para_agotar": meses_agotar, "velocidad_mes": round(velocity, 2), "meses_en_mercado": mom,
            "stock_score": score, "estado": estado, "color": color, "leads": leads,
            "precio": d.get("price_from"), "vs_mediana_zona": vs_med, "apreciacion_pct": _appreciation_pct(d),
            "espacio_precio": headroom, "espacio_precio_color": headroom_color, "stage": d.get("stage"),
        })

    proyectos.sort(key=lambda x: (x["meses_para_agotar"] is None, x["meses_para_agotar"] or 9999))
    rapidos = [p for p in proyectos if p["color"] == "verde"]
    estancados = sorted([p for p in proyectos if p["color"] == "rojo"], key=lambda x: -(x["disponibles"]))

    # Elasticidad de mercado (cross-seccional): precio vs sell-through. Negativo = más caro vende menos.
    px = [p["precio"] for p in proyectos if p["precio"]]
    sy = [p["sellthrough"] for p in proyectos if p["precio"]]
    corr = _pearson(px, sy)
    if corr is None:
        elasticidad = {"signo": None, "fuerza": "sin señal", "texto": "Aún no hay suficiente señal para medir sensibilidad al precio."}
    elif corr <= -0.3:
        elasticidad = {"signo": "elastico", "corr": corr, "fuerza": "alta" if corr <= -0.6 else "media",
                       "texto": "El mercado es sensible al precio: los proyectos más caros se venden más lento. Cuida el precio."}
    elif corr >= 0.3:
        elasticidad = {"signo": "inelastico", "corr": corr, "fuerza": "media",
                       "texto": "Poco sensible al precio: el precio no frena la venta — hay espacio para cobrar más donde hay demanda."}
    else:
        elasticidad = {"signo": "neutro", "corr": corr, "fuerza": "baja",
                       "texto": "Sensibilidad al precio mixta: depende más de la zona y el producto que del precio."}

    # Receta de los que se agotan (lookalike de éxitos)
    receta = None
    if rapidos:
        from collections import Counter
        zc = Counter(p["zona"] for p in rapidos if p["zona"])
        precios_r = [p["precio"] for p in rapidos if p["precio"]]
        amen_c: Dict[str, int] = {}
        rids = {p["project_id"] for p in rapidos}
        for d in devs:
            if d["id"] in rids:
                for a in (d.get("amenities") or []):
                    amen_c[a] = amen_c.get(a, 0) + 1
        receta = {
            "zonas": [z for z, _ in zc.most_common(3)],
            "precio_tipico": (sorted(precios_r)[len(precios_r) // 2] if precios_r else None),
            "amenidades": [a for a, _ in sorted(amen_c.items(), key=lambda x: -x[1])[:4]],
            "n": len(rapidos),
        }

    # Forecast de precio por zona (reusa forecast_engine · fail-open)
    forecast = {"fuente": "no-disponible", "zona": None, "horizontes": None}
    try:
        import forecast_engine as fe
        zslug = (zona or (proyectos[0]["zona"] if proyectos else None))
        if zslug:
            fc = await fe.get_zone_forecast(db, str(zslug).lower().replace(" ", "-"))
            if fc:
                forecast = {"fuente": "forecast_engine", "zona": zslug, "horizontes": fc.get("horizons") or fc.get("forecast")}
    except Exception as e:
        log.info("stock forecast: %s", e)

    # Resumen + acciones (agentic)
    partes = []
    if rapidos:
        partes.append(f"{len(rapidos)} proyectos se venden a buen ritmo (se agotan en ~{_SOLD_FAST} meses o menos).")
    if estancados:
        partes.append(f"{len(estancados)} se están estancando y conviene moverlos.")
    if elasticidad.get("signo"):
        partes.append(elasticidad["texto"])
    resumen = " ".join(partes) or "El inventario va a ritmo sano en general."

    acciones = []
    subir = next((p for p in proyectos if p["espacio_precio_color"] == "verde"), None)
    if subir:
        acciones.append({"tipo": "subir_precio",
                         "texto": f"{subir['nombre']} se agota en {subir['meses_para_agotar']} meses y está {'bajo' if (subir['vs_mediana_zona'] or 0) < 0 else 'en línea con'} la mediana de {subir['zona']} — tiene espacio para subir precio.",
                         "link": f"/superadmin/desarrollos/{subir['project_id']}"})
    if estancados:
        e0 = estancados[0]
        acciones.append({"tipo": "mover_inventario",
                         "texto": f"{e0['nombre']} lleva {e0['meses_en_mercado']} meses y aún tiene {e0['disponibles']} disponibles — baja precio o mete marketing.",
                         "link": f"/superadmin/desarrollos/{e0['project_id']}"})
    if receta and receta["amenidades"]:
        acciones.append({"tipo": "receta",
                         "texto": f"Receta de los que se agotan: {', '.join(receta['zonas'][:2])}, ~${round((receta['precio_tipico'] or 0)/1e6,1)}M, con {', '.join(receta['amenidades'][:3])}."})

    return {
        "filtros": {"zona": zona, "segmento": segmento},
        "resumen": resumen,
        "proyectos": proyectos,
        "estancados": estancados[:6],
        "elasticidad": elasticidad,
        "receta_exito": receta,
        "forecast_precio": forecast,
        "acciones": acciones[:3],
        "fuente": {"proyectos": len(proyectos), "con_demanda": sum(1 for p in proyectos if p["leads"]),
                   "nota": "La absorción usa ventas acumuladas sobre el tiempo en mercado; se afina con la serie real de ventas semanales."},
    }


@router.get("/stock-soldout")
async def stock_soldout(request: Request, zona: Optional[str] = None, segmento: Optional[str] = None):
    from permissions import require_superadmin
    await require_superadmin(request)
    return await _stock_soldout(request.app.state.db, zona, segmento)
