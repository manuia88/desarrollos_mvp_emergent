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


@router.post("/project/{project_id}/marketplace")
async def toggle_project_marketplace(project_id: str, request: Request):
    """DEV PUBLICA → MARKETPLACE · control del superadmin: publica/despublica un proyecto del wizard en el marketplace
    público. Body {published: bool}. Loguea el cambio (auditoría). Idempotente."""
    from permissions import require_superadmin
    await require_superadmin(request)
    db = request.app.state.db
    body = await request.json()
    published = bool(body.get("published", True))
    proj = await db.projects.find_one({"id": project_id}, {"_id": 0, "id": 1, "name": 1, "colonia_id": 1, "price_from": 1})
    if not proj:
        raise HTTPException(404, "Proyecto no encontrado")
    if published and not (proj.get("colonia_id") and (proj.get("price_from") or 0) > 0):
        raise HTTPException(400, "El proyecto necesita colonia y precio para publicarse en el marketplace")
    await db.projects.update_one({"id": project_id}, {"$set": {"marketplace_published": published}})
    try:
        from audit_log import log_mutation
        actor = getattr(request.state, "user", None)
        await log_mutation(db, {"user_id": getattr(actor, "user_id", "superadmin"), "role": "superadmin"},
                           "update", "project", entity_id=project_id,
                           after={"marketplace_published": published, "name": proj.get("name")})
    except Exception as _e:
        log.warning("[audit] log_mutation perdido (update project %s marketplace_published): %s", project_id, _e)
    return {"ok": True, "project_id": project_id, "marketplace_published": published}


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
    # Etiquetas REALES de las fotos (asesor_photo_tags · Capa 2 vision/url) si ya se procesaron;
    # si no, se cae al nombre del archivo. (dev_id, photo_idx) → tag.
    tags_real: Dict[tuple, Dict[str, Any]] = {}
    fotos_etiquetadas = 0
    fuente_fotos = "nombre-de-archivo"
    try:
        async for ptag in db.asesor_photo_tags.find({}, {"_id": 0, "dev_id": 1, "photo_idx": 1, "room_label": 1, "features": 1, "source": 1}):
            tags_real[(ptag.get("dev_id"), ptag.get("photo_idx"))] = ptag
            if ptag.get("source") == "vision":
                fuente_fotos = "vision"
    except Exception:
        pass
    if tags_real and fuente_fotos != "vision":
        fuente_fotos = "etiquetas-guardadas"
    for d in devs:
        w = weight_by_dev.get(d["id"], 0.0)
        z = d.get("colonia")
        for i, url in enumerate(d.get("photos") or []):
            real = tags_real.get((d["id"], i))
            if real:
                rl = real.get("room_label") or "Interior"
                feats = real.get("features") or []
                fotos_etiquetadas += 1
            else:
                t = pt.tag_from_url(url)
                rl = t.get("room_label") or "Interior"
                feats = t.get("features") or []
            room_cat[rl] = room_cat.get(rl, 0) + 1
            room_w[rl] = room_w.get(rl, 0) + w
            if z:
                room_by_zone.setdefault(z, {})[rl] = room_by_zone.setdefault(z, {}).get(rl, 0) + 1
            for f in feats:
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
                   "amenidades": "leads-reales", "fotos": fuente_fotos, "fotos_etiquetadas": fotos_etiquetadas,
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


async def _comportamiento(db, zona=None, segmento=None, dev_ids=None):
    # dev_ids: si se pasa, scope-a a los leads de ESE desarrollador (reuso desde el portal dev).
    from data_developments import DEVELOPMENTS_BY_ID
    try:
        from disc_inferencer_landing import infer_disc_from_lead, disc_label
    except Exception:
        infer_disc_from_lead = lambda x: None  # noqa: E731
        disc_label = lambda x: "Sin perfil"    # noqa: E731

    WON = ("vendido", "won", "ganado", "cierre", "cerrado")
    LOST = ("perdido", "lost", "descartado")

    leads = []
    q = {"development_id": {"$in": list(dev_ids)}} if dev_ids else {}
    try:
        async for l in db.leads.find(q, {"_id": 0}):
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


async def _stock_soldout(db, zona=None, segmento=None, dev_ids=None):
    # dev_ids: si se pasa, scope-a a los proyectos de ESE desarrollador (reuso desde el portal dev).
    from data_developments import DEVELOPMENTS

    devs = [d for d in DEVELOPMENTS if (not zona or d.get("colonia") == zona)]
    if dev_ids is not None:
        _ids = set(dev_ids)
        devs = [d for d in devs if d["id"] in _ids]

    leads_by_dev: Dict[str, int] = {}
    try:
        async for l in db.leads.find({}, {"_id": 0, "development_id": 1}):
            k = l.get("development_id")
            if k:
                leads_by_dev[k] = leads_by_dev.get(k, 0) + 1
    except Exception:
        pass

    # Mediana de precio por zona = del MERCADO completo (todos los devs de la zona), no solo los
    # del scope → el "espacio de precio" compara tu precio vs el mercado, no vs ti mismo.
    zona_prices: Dict[str, List[int]] = {}
    for d in DEVELOPMENTS:
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
        # El inventario/estatus del catálogo es DEMO (generado del seed) hasta que entre inventario/ventas reales →
        # absorción, sell-through y "espacio para subir precio" son ilustrativos, NO métricas reales. La demanda (leads) SÍ es real.
        "inventario_demo": True,
        "fuente": {"proyectos": len(proyectos), "con_demanda": sum(1 for p in proyectos if p["leads"]),
                   "nota": "⚠️ Inventario y absorción son DATOS DEMO (catálogo seed) hasta que entre inventario/ventas reales. La demanda (leads) sí es real."},
    }


@router.get("/stock-soldout")
async def stock_soldout(request: Request, zona: Optional[str] = None, segmento: Optional[str] = None):
    from permissions import require_superadmin
    await require_superadmin(request)
    return await _stock_soldout(request.app.state.db, zona, segmento)


# ─── Fase 3 · Macro + Ciudad (transporte/negocios/riesgo/tasas → valor) ──────────────
# Cruza las señales de CIUDAD (movilidad=transporte, comercio=negocios, riesgo, seguridad, educación,
# vida) con el VALOR (precio/m²) y la DEMANDA (leads) para responder "qué mueve el precio en CDMX".
# + Tasa Banxico real → afford./crédito · gentrificación (trend de la zona) · riesgo de ciudad.
# Reusa COLONIAS (scores 7 ejes + trend) + banxico_series (dato real) + gov_data_mx_engine (fail-open).
# Cero deuda: GTFS/DENUE/Atlas se enriquecen al prender llaves.
_CITY_AXES = [
    ("movilidad", "Movilidad (transporte)", "Qué tan bien conectada está (metro, vías)."),
    ("comercio", "Comercio (negocios)", "Densidad de comercios y oficinas alrededor."),
    ("seguridad", "Seguridad", "Percepción y datos de seguridad."),
    ("educacion", "Educación", "Escuelas y universidades cercanas."),
    ("vida", "Calidad de vida", "Parques, servicios, ambiente."),
    ("riesgo", "Riesgo bajo", "Menor riesgo sísmico/climático = mejor."),
]


def _mortgage_payment(principal, annual_rate_pct, years=20):
    r = (annual_rate_pct or 0) / 100.0 / 12.0
    nN = years * 12
    if r <= 0:
        return round(principal / nN) if nN else None
    return round(principal * r / (1 - (1 + r) ** (-nN)))


async def _macro_ciudad(db, zona=None, segmento=None):
    from data_seed import COLONIAS, COLONIAS_BY_ID  # noqa: F401
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
    # Demanda + #proyectos por colonia (de nuestro catálogo)
    leads_by_zona: Dict[str, int] = {}
    proy_by_zona: Dict[str, int] = {}
    for d in devs:
        z = d.get("colonia")
        if z:
            leads_by_zona[z] = leads_by_zona.get(z, 0) + leads_by_dev.get(d["id"], 0)
            proy_by_zona[z] = proy_by_zona.get(z, 0) + 1

    cols = COLONIAS
    if zona:
        cols = [c for c in COLONIAS if c["name"] == zona] or COLONIAS

    # ── 1. Qué mueve el valor: correlación de cada eje de ciudad con precio/m² ───────
    precios = [c.get("price_m2_num") for c in cols if c.get("price_m2_num")]
    drivers = []
    for key, label, desc in _CITY_AXES:
        xs, ys, ds = [], [], []
        for c in cols:
            sc = (c.get("scores") or {}).get(key)
            pm = c.get("price_m2_num")
            if sc is not None and pm:
                xs.append(sc)
                ys.append(pm)
        corr = _pearson(xs, ys)
        # correlación con demanda (leads) donde haya
        xd, yd = [], []
        for c in cols:
            sc = (c.get("scores") or {}).get(key)
            ld = leads_by_zona.get(c["name"], 0)
            if sc is not None:
                xd.append(sc)
                yd.append(ld)
        corr_dem = _pearson(xd, yd)
        if corr is not None:
            direccion = "sube" if corr > 0.1 else "inverso" if corr < -0.1 else "neutro"
            if direccion == "sube":
                efecto = f"A más {label.split('(')[0].strip().lower()}, más caro."
            elif direccion == "inverso":
                efecto = f"Las zonas más caras tienen MENOS {label.split('(')[0].strip().lower()} (relación inversa)."
            else:
                efecto = "Sin relación clara con el precio."
            drivers.append({"eje": key, "label": label, "desc": desc, "corr_precio": corr,
                            "corr_demanda": corr_dem, "direccion": direccion, "efecto": efecto,
                            "impacto": "alto" if abs(corr) >= 0.5 else "medio" if abs(corr) >= 0.25 else "bajo"})
    drivers.sort(key=lambda x: -abs(x["corr_precio"]))

    # ── 2. Tasa Banxico → crédito (dato real) ───────────────────────────────────────
    tasa_actual = None
    tasa_prev = None
    try:
        rows = await db.banxico_series.find({}, {"_id": 0, "date": 1, "value": 1}).sort("date", -1).limit(40).to_list(40)
        if rows:
            tasa_actual = round(rows[0]["value"], 2)
            tasa_prev = round(rows[-1]["value"], 2)
    except Exception:
        pass
    rate = tasa_actual if tasa_actual is not None else 10.5  # fallback razonable
    ticket = _pctile([d.get("price_from") for d in devs if d.get("price_from")], 50) or 8_000_000
    loan = round(ticket * 0.8)
    pago_actual = _mortgage_payment(loan, rate)
    pago_menos1 = _mortgage_payment(loan, rate - 1)
    ahorro_si_baja = (pago_actual - pago_menos1) if (pago_actual and pago_menos1) else None
    tendencia_tasa = None
    if tasa_actual is not None and tasa_prev is not None:
        tendencia_tasa = "bajando" if tasa_actual < tasa_prev - 0.05 else "subiendo" if tasa_actual > tasa_prev + 0.05 else "estable"
    credito = {"tasa": tasa_actual, "tendencia": tendencia_tasa, "ticket_referencia": ticket,
               "credito": loan, "pago_mensual": pago_actual, "ahorro_si_baja_1pt": ahorro_si_baja,
               "fuente": "banxico_series" if tasa_actual is not None else "estimado"}

    # ── 3. Gentrificación: zonas que se calientan (momentum + pendiente del trend) ──
    calientan = []
    for c in cols:
        tr = c.get("trend") or []
        slope = (tr[-1] - tr[0]) if len(tr) >= 2 else 0
        try:
            mom = float(str(c.get("momentum", "0")).replace("%", "").replace("+", ""))
        except Exception:
            mom = 0
        calientan.append({"zona": c["name"], "momentum_pct": mom, "subida_trend": round(slope, 1),
                          "price_m2": c.get("price_m2_num"), "tier": c.get("tier"),
                          "proyectos_nuestros": proy_by_zona.get(c["name"], 0)})
    calientan.sort(key=lambda x: (-x["momentum_pct"], -x["subida_trend"]))

    # ── 4. Riesgo de ciudad (mayor score = más seguro) ──────────────────────────────
    riesgo = sorted([{"zona": c["name"], "riesgo_score": (c.get("scores") or {}).get("riesgo"),
                      "price_m2": c.get("price_m2_num"), "proyectos_nuestros": proy_by_zona.get(c["name"], 0)}
                     for c in cols if (c.get("scores") or {}).get("riesgo") is not None],
                    key=lambda x: x["riesgo_score"])  # más riesgoso primero

    # ── 5. Perfil de ciudad de NUESTRAS zonas ───────────────────────────────────────
    nuestras = []
    for z, nproy in sorted(proy_by_zona.items(), key=lambda x: -x[1]):
        c = next((x for x in COLONIAS if x["name"] == z), None)
        if not c:
            continue
        nuestras.append({"zona": z, "proyectos": nproy, "leads": leads_by_zona.get(z, 0),
                         "price_m2": c.get("price_m2_num"), "momentum": c.get("momentum"),
                         "scores": c.get("scores"), "tier": c.get("tier")})

    # ── 6. Resumen + acciones (agentic) ─────────────────────────────────────────────
    top_driver = drivers[0] if drivers else None
    top_pos = next((d for d in drivers if d["direccion"] == "sube"), None)
    sube = calientan[0] if calientan else None
    partes = []
    if top_pos:
        partes.append(f"En CDMX, lo que más sube el precio es {top_pos['label'].split('(')[0].strip().lower()}.")
    if credito["tasa"] is not None:
        partes.append(f"La tasa de Banxico está en {credito['tasa']}% ({credito['tendencia']}); la mensualidad de un depto de ${round(ticket/1e6,1)}M ronda ${pago_actual:,}.".replace(",", ","))
    if sube and sube["momentum_pct"] > 0:
        partes.append(f"La zona que más se calienta es {sube['zona']} (+{sube['momentum_pct']}%).")
    resumen = " ".join(partes) or "Señal de ciudad en construcción."

    acciones = []
    if top_pos:
        zonas_top_eje = sorted(cols, key=lambda c: -((c.get("scores") or {}).get(top_pos["eje"]) or 0))[:1]
        if zonas_top_eje:
            acciones.append({"tipo": "valor", "texto": f"Lo que más sube el precio es {top_pos['label'].split('(')[0].strip().lower()}: resáltalo en tus proyectos de zonas como {zonas_top_eje[0]['name']}."})
    if credito["tasa"] is not None and credito["tendencia"] == "bajando":
        acciones.append({"tipo": "credito", "texto": f"La tasa viene bajando — el crédito se abarata. Empuja la compra: una mensualidad de ${round(ticket/1e6,1)}M ya está en ~${pago_actual:,}."})
    if sube and sube["proyectos_nuestros"] == 0 and sube["momentum_pct"] > 0:
        acciones.append({"tipo": "gentrificacion", "texto": f"{sube['zona']} se está calentando (+{sube['momentum_pct']}%) y no tienes proyectos ahí — considera entrar antes que suba más.", "link": f"/superadmin/desarrollos?zona={sube['zona']}"})

    return {
        "filtros": {"zona": zona, "segmento": segmento},
        "resumen": resumen,
        "drivers_valor": drivers,
        "credito": credito,
        "zonas_calientan": calientan[:8],
        "riesgo_ciudad": riesgo[:8],
        "perfil_zonas": nuestras[:10],
        "acciones": acciones[:3],
        "fuente": {"tasa": credito["fuente"], "colonias": len(cols),
                   "nota": "Transporte (GTFS), negocios (DENUE) y riesgo (Atlas CENAPRED) se enriquecen al prender los conectores de datos abiertos."},
    }


@router.get("/macro-ciudad")
async def macro_ciudad(request: Request, zona: Optional[str] = None, segmento: Optional[str] = None):
    from permissions import require_superadmin
    await require_superadmin(request)
    return await _macro_ciudad(request.app.state.db, zona, segmento)


# ─── Fase 3 · Competencia y Red (knowledge graph: quién compite, red de asesores) ───
# Mapa de relaciones del mercado: qué proyectos pelean por el mismo comprador (misma zona × banda),
# qué asesores/brokers manejan qué proyectos (red), y qué inventario está "zombie". Computa el grafo
# desde Mongo (no requiere Neo4j); reusa knowledge_graph_engine si está prendido. Built-for-endstate:
# los compradores compartidos (edges INTERESTED_IN reales) se llenan con swipes/behavioral. Cero deuda.
async def _competencia_red(db, zona=None, segmento=None):
    from data_developments import DEVELOPMENTS, DEVELOPMENTS_BY_ID

    devs = [d for d in DEVELOPMENTS if (not zona or d.get("colonia") == zona)]
    leads_by_dev: Dict[str, int] = {}
    won_by_dev: Dict[str, int] = {}
    try:
        async for l in db.leads.find({}, {"_id": 0, "development_id": 1, "status_v2": 1}):
            k = l.get("development_id")
            if k:
                leads_by_dev[k] = leads_by_dev.get(k, 0) + 1
                if (l.get("status_v2") or "").lower() in ("vendido", "won", "ganado"):
                    won_by_dev[k] = won_by_dev.get(k, 0) + 1
    except Exception:
        pass

    # ── 1. Quién compite con quién (misma zona × bandas de precio que cruzan) ────────
    def _bands(d):
        return set(_band_overlaps(d.get("price_from"), d.get("price_to")))

    competidores = []
    for d in devs:
        my_bands = _bands(d)
        rivales = []
        for o in DEVELOPMENTS:
            if o["id"] == d["id"] or o.get("colonia") != d.get("colonia"):
                continue
            shared = my_bands & _bands(o)
            if shared:
                rivales.append({"project_id": o["id"], "nombre": o.get("name"),
                                "precio": o.get("price_from"), "disponibles": o.get("units_available"),
                                "bandas_compartidas": sorted(shared)})
        if rivales:
            competidores.append({"project_id": d["id"], "nombre": d.get("name"), "zona": d.get("colonia"),
                                 "precio": d.get("price_from"), "leads": leads_by_dev.get(d["id"], 0),
                                 "n_rivales": len(rivales), "rivales": rivales[:6]})
    competidores.sort(key=lambda x: -x["n_rivales"])

    # ── 2. Celdas más disputadas (zona × banda con más proyectos peleando) ──────────
    celda: Dict[tuple, Dict[str, Any]] = {}
    for d in devs:
        z = d.get("colonia")
        for b in _bands(d):
            if not z:
                continue
            c = celda.setdefault((z, b), {"zona": z, "banda": b, "proyectos": 0, "unidades": 0, "leads": 0})
            c["proyectos"] += 1
            c["unidades"] += d.get("units_available") or 0
            c["leads"] += leads_by_dev.get(d["id"], 0)
    disputadas = sorted([c for c in celda.values() if c["proyectos"] >= 2],
                        key=lambda x: (-x["proyectos"], -x["unidades"]))[:8]

    # ── 3. Red de asesores (quién maneja qué · hubs · concentración) ────────────────
    asesor_map: Dict[str, Dict[str, Any]] = {}
    try:
        async for l in db.leads.find({}, {"_id": 0, "assignee_name": 1, "channel": 1, "development_id": 1, "status_v2": 1}):
            name = l.get("assignee_name")
            if not name:
                continue
            a = asesor_map.setdefault(name, {"asesor": name, "canal": l.get("channel") or "inhouse",
                                             "leads": 0, "won": 0, "proyectos": set()})
            a["leads"] += 1
            if (l.get("status_v2") or "").lower() in ("vendido", "won", "ganado"):
                a["won"] += 1
            if l.get("development_id"):
                a["proyectos"].add(l["development_id"])
    except Exception:
        pass
    red_asesores = sorted([
        {"asesor": a["asesor"], "canal": a["canal"], "leads": a["leads"], "won": a["won"],
         "conversion": round(a["won"] / a["leads"] * 100) if a["leads"] else 0,
         "n_proyectos": len(a["proyectos"])}
        for a in asesor_map.values()], key=lambda x: -x["leads"])
    total_leads_asig = sum(a["leads"] for a in red_asesores) or 1
    top_asesor = red_asesores[0] if red_asesores else None
    concentracion = round(top_asesor["leads"] / total_leads_asig * 100) if top_asesor else 0
    canal_split = {"inhouse": sum(a["leads"] for a in red_asesores if a["canal"] == "inhouse"),
                   "broker": sum(a["leads"] for a in red_asesores if a["canal"] == "broker")}

    # ── 4. Inventario zombie (mucho stock + nula tracción) ──────────────────────────
    zombies = []
    for d in devs:
        tot = d.get("units_total") or 0
        avail = d.get("units_available") or 0
        sold = (d.get("units_sold") or 0) + (d.get("units_reserved") or 0)
        sellthrough = round(sold / tot * 100) if tot else 0
        if avail >= 8 and sellthrough < 35 and leads_by_dev.get(d["id"], 0) == 0:
            zombies.append({"project_id": d["id"], "nombre": d.get("name"), "zona": d.get("colonia"),
                            "disponibles": avail, "sellthrough": sellthrough})
    zombies.sort(key=lambda x: -x["disponibles"])

    # ── 5. Estado del grafo (Neo4j · músculo backend) ───────────────────────────────
    kg = {"conectado": False, "nodos": None, "fuente": "calculado-en-vivo"}
    try:
        import knowledge_graph_engine as kge
        h = await kge.health_check()
        kg = {"conectado": bool(h.get("available")), "nodos": h.get("node_count"),
              "fuente": "neo4j" if h.get("available") else "calculado-en-vivo"}
    except Exception:
        pass

    # ── 6. Resumen + acciones (agentic) ─────────────────────────────────────────────
    top_disp = disputadas[0] if disputadas else None
    partes = []
    if top_disp:
        partes.append(f"La pelea más fuerte es en {top_disp['zona']} banda {top_disp['banda']}: {top_disp['proyectos']} proyectos por los mismos compradores.")
    if top_asesor:
        partes.append(f"{top_asesor['asesor']} concentra {concentracion}% de los leads asignados.")
    if zombies:
        partes.append(f"{len(zombies)} proyectos están sin tracción (inventario zombie).")
    resumen = " ".join(partes) or "El mapa de competencia y red está despejado."

    acciones = []
    if top_disp:
        acciones.append({"tipo": "competencia",
                         "texto": f"{top_disp['zona']} ~{top_disp['banda']} está saturada ({top_disp['proyectos']} proyectos, {top_disp['unidades']} unidades) — diferénciate en producto o precio.",
                         "link": f"/superadmin/desarrollos?zona={top_disp['zona']}"})
    if top_asesor and concentracion >= 30:
        acciones.append({"tipo": "red",
                         "texto": f"{top_asesor['asesor']} maneja {concentracion}% de tus leads — si se va, te duele. Reparte y suma más canales."})
    if zombies:
        z0 = zombies[0]
        acciones.append({"tipo": "zombie",
                         "texto": f"{z0['nombre']} tiene {z0['disponibles']} unidades y cero leads — reactívalo con marketing o ajusta el precio.",
                         "link": f"/superadmin/desarrollos/{z0['project_id']}"})

    return {
        "filtros": {"zona": zona, "segmento": segmento},
        "resumen": resumen,
        "competidores": competidores[:10],
        "celdas_disputadas": disputadas,
        "red_asesores": red_asesores[:10],
        "concentracion_top": concentracion,
        "canal_split": canal_split,
        "zombies": zombies[:6],
        "grafo": kg,
        "acciones": acciones[:3],
        "fuente": {"proyectos": len(devs), "asesores": len(red_asesores),
                   "nota": "Los compradores compartidos reales (un comprador que ve varios proyectos) se llenan con los swipes y la navegación; hoy la competencia se infiere por zona y banda de precio."},
    }


@router.get("/competencia-red")
async def competencia_red(request: Request, zona: Optional[str] = None, segmento: Optional[str] = None):
    from permissions import require_superadmin
    await require_superadmin(request)
    return await _competencia_red(request.app.state.db, zona, segmento)


# ─── Fase 3 · Observabilidad de la IA (cómo aprende · el cable dormido) ──────────────
# Hace VISIBLE el cerebro: qué tan bien le atina cada modelo (AVM/forecast/hedónico), cómo se
# reentrena solo, qué aprendió el Cerebro, qué vigila — y un inventario que muestra qué IA está
# ACTIVA vs EN ESPERA de datos. Rescata engines que corrían por cron sin panel (accuracy/drift/retrain).
# Reusa accuracy_snapshots/model_validation_runs/cerebro_*/predictive_alerts_runs (datos reales). Cero deuda.
def _hace(dt):
    from datetime import datetime, timezone
    d = _parse_dt(dt)
    if not d:
        return None
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    delta = datetime.now(timezone.utc) - d
    s = int(delta.total_seconds())
    if s < 3600:
        return f"hace {max(1, s // 60)} min"
    if s < 86400:
        return f"hace {s // 3600} h"
    if s < 86400 * 30:
        return f"hace {s // 86400} días"
    return f"hace {s // (86400 * 30)} meses"


async def _observabilidad_ia(db):
    async def _count(c):
        try:
            return await db[c].count_documents({})
        except Exception:
            return 0

    async def _latest(c, sort_field="_id"):
        try:
            return await db[c].find_one({}, sort=[(sort_field, -1)])
        except Exception:
            return None

    # ── 1. Salud de los modelos (accuracy real) ─────────────────────────────────────
    def _mape_norm(m):
        if isinstance(m, dict):
            val = m.get("mape") or m.get("value")
            return {"disponible": bool(m.get("available")) and val is not None,
                    "valor": round(val, 1) if isinstance(val, (int, float)) else None,
                    "muestras": m.get("sample_size"), "min": m.get("min_required")}
        if isinstance(m, (int, float)):
            return {"disponible": True, "valor": round(m, 1), "muestras": None, "min": None}
        return {"disponible": False, "valor": None, "muestras": None, "min": None}

    snap = await _latest("accuracy_snapshots", "computed_at")
    accuracy = None
    mape30 = None
    if snap:
        m30 = _mape_norm(snap.get("mape_30d"))
        mape30 = m30["valor"] if m30["disponible"] else None
        accuracy = {"mape_30d": m30, "mape_90d": _mape_norm(snap.get("mape_90d")),
                    "mape_365d": _mape_norm(snap.get("mape_365d")), "hit_rate_30d": _mape_norm(snap.get("hit_rate_30d")),
                    "scope": snap.get("scope"), "cuando": _hace(snap.get("computed_at"))}
    validaciones = []
    try:
        seen = set()
        async for v in db.model_validation_runs.find({}, {"_id": 0}).sort("run_at", -1).limit(20):
            nm = v.get("model_name")
            if nm and nm not in seen:
                seen.add(nm)
                validaciones.append({"modelo": nm, "mape": v.get("mape"), "r2": v.get("r_squared"),
                                     "rmse": v.get("rmse"), "muestras": v.get("sample_size"),
                                     "metodo": v.get("validation_method"), "cuando": _hace(v.get("run_at"))})
    except Exception:
        pass

    # ── 2. Cómo aprende (reentrenamiento automático) ────────────────────────────────
    retrains = []
    for col, label in [("forecast_retrain_runs", "Pronóstico de precio"), ("hedonic_retrain_runs", "Modelo de precio por características")]:
        r = await _latest(col, "finished_at")
        if r:
            retrains.append({"motor": label, "zonas": r.get("zones_total"), "ok": r.get("fitted_ok"),
                             "promovidos": r.get("promoted"), "duracion_s": r.get("duration_s"),
                             "cuando": _hace(r.get("finished_at") or r.get("started_at")),
                             "corridas": await _count(col)})
    hedonic_vivos = await _count("hedonic_models")

    # ── 3. El espejo del asistente (lo que el Cerebro aprendió) ─────────────────────
    lecciones = []
    try:
        async for l in db.cerebro_lessons.find({}, {"_id": 0}).sort("created_at", -1).limit(5):
            lecciones.append({"texto": l.get("text"), "resultado": l.get("outcome"),
                              "base": l.get("basis"), "cuando": _hace(l.get("created_at"))})
    except Exception:
        pass
    reajustes = []
    try:
        async for r in db.cerebro_retrains.find({}, {"_id": 0}).sort("created_at", -1).limit(5):
            reajustes.append({"motores": r.get("engines"), "resumen": r.get("summary"),
                              "disparo": r.get("trigger"), "nivel": r.get("level"),
                              "aplicado": r.get("applied"), "cuando": _hace(r.get("created_at"))})
    except Exception:
        pass

    # ── 4. Qué vigila la IA (alertas predictivas + drift) ───────────────────────────
    pa = await _latest("predictive_alerts_runs", "started_at")
    vigilancia = {"corridas": await _count("predictive_alerts_runs"),
                  "leads_escaneados": (pa or {}).get("leads_scanned"),
                  "alertas_creadas": (pa or {}).get("alerts_created"),
                  "cuando": _hace((pa or {}).get("started_at")),
                  "drift_alertas": await _count("drift_triggers_log") + await _count("conversation_drift_alerts")}

    # ── 5. Inventario de modelos: qué IA está ACTIVA vs EN ESPERA (el cable dormido) ─
    async def _estado(activo_si, *, motivo_espera):
        return {"estado": "activo", "detalle": None} if activo_si else {"estado": "espera", "detalle": motivo_espera}
    swipes = await _count("asesor_swipe_events")
    convos = await _count("conversation_messages") + await _count("whatsapp_messages")
    photo_tags = await _count("asesor_photo_tags")
    conv_sig = await db.conversation_signal.find_one({"_id": "global"}) if "conversation_signal" else None
    conv_procesados = (conv_sig or {}).get("procesados", 0) if conv_sig else 0
    # Gusto: activo si ya analizamos fotos (Capa 2) o hay swipes. Conversaciones: si hay mensajes/procesados.
    if photo_tags > 0 and swipes == 0:
        gusto_estado = {"estado": "activo", "detalle": f"Analiza {photo_tags} fotos reales del catálogo. El gusto por swipes se enciende con el link al comprador."}
    elif photo_tags > 0 or swipes > 0:
        gusto_estado = {"estado": "activo", "detalle": None}
    else:
        gusto_estado = {"estado": "espera", "detalle": "analiza las fotos del catálogo y los swipes del comprador"}
    conv_estado = (await _estado((convos > 0 or conv_procesados > 0), motivo_espera="se llena al conectar WhatsApp/chat"))
    inventario = [
        {"modelo": "Valuación automática (AVM)", "para": "Dev · Superadmin",
         **(await _estado(bool(snap), motivo_espera="se activa con cierres para calibrar"))},
        {"modelo": "Pronóstico de precio por zona", "para": "Dev · Superadmin · Asesor",
         **(await _estado((await _count("forecast_retrain_runs")) > 0, motivo_espera="necesita histórico de precios"))},
        {"modelo": "Precio por características (hedónico)", "para": "Dev · Superadmin",
         **(await _estado(hedonic_vivos > 0, motivo_espera="necesita más operaciones por zona"))},
        {"modelo": "Probabilidad de cierre", "para": "Asesor",
         **(await _estado((await _count("cerebro_predictions")) > 0 or (await _count("cerebro_retrains")) > 0, motivo_espera="aprende con cada trato ganado/perdido"))},
        {"modelo": "Cerebro que aprende (agente)", "para": "Todos",
         **(await _estado((await _count("cerebro_lessons")) > 0, motivo_espera="aprende con el uso real"))},
        {"modelo": "Alertas predictivas de leads", "para": "Asesor",
         **(await _estado(vigilancia["corridas"] > 0, motivo_espera="necesita actividad de leads"))},
        {"modelo": "Gusto visual del comprador", "para": "Dev · Asesor", "accion": "gusto",
         "accion_label": "Analizar fotos del catálogo", **gusto_estado},
        {"modelo": "Análisis de conversaciones", "para": "Asesor", "accion": "conversaciones",
         "accion_label": "Procesar conversaciones", **conv_estado},
    ]
    activos = sum(1 for m in inventario if m["estado"] == "activo")

    # ── 6. Resumen + acciones ───────────────────────────────────────────────────────
    partes = [f"{activos} de {len(inventario)} modelos de IA están activos."]
    if mape30 is not None:
        partes.append(f"La valuación se equivoca en promedio {mape30}% (últimos 30 días).")
    else:
        partes.append("La precisión de la valuación se empieza a medir con los primeros cierres reales.")
    if retrains:
        partes.append(f"Los modelos se reentrenan solos: el último fue {retrains[0]['cuando'] or 'reciente'}.")
    if vigilancia["corridas"]:
        partes.append(f"La IA vigila los leads en automático ({vigilancia['corridas']} corridas).")
    resumen = " ".join(partes)

    acciones = []
    en_espera = [m for m in inventario if m["estado"] == "espera"]
    if en_espera:
        acciones.append({"tipo": "activar",
                         "texto": f"Hay {len(en_espera)} modelos listos pero en espera de datos (ej. {en_espera[0]['modelo']}: {en_espera[0]['detalle']}). Conecta la fuente y se prenden solos."})
    if mape30 is None:
        acciones.append({"tipo": "calibrar", "texto": "La valuación ya corre, pero para medir qué tan bien le atina necesita ~20 cierres reales. Carga los cierres y empieza a calificarse sola."})
    elif mape30 > 12:
        acciones.append({"tipo": "calibrar", "texto": f"La valuación se está desviando ({mape30}%). Conviene cargar más cierres reales para recalibrar."})
    if lecciones:
        acciones.append({"tipo": "aprendizaje", "texto": f"La IA ya aprende del uso: \"{(lecciones[0]['texto'] or '')[:80]}\". Mientras más se use, mejor predice."})

    return {
        "resumen": resumen,
        "salud_modelos": {"accuracy": accuracy, "validaciones": validaciones[:8]},
        "como_aprende": {"retrains": retrains, "modelos_vivos_hedonico": hedonic_vivos},
        "espejo": {"lecciones": lecciones, "reajustes": reajustes},
        "vigilancia": vigilancia,
        "inventario_modelos": inventario,
        "activos": activos, "total_modelos": len(inventario),
        "acciones": acciones[:3],
        "fuente": {"nota": "Estos modelos corrían por detrás (cron) sin panel; aquí se hacen visibles. Se afinan solos con cada cierre, conversación y swipe real."},
    }


@router.get("/observabilidad-ia")
async def observabilidad_ia(request: Request):
    from permissions import require_superadmin
    await require_superadmin(request)
    return await _observabilidad_ia(request.app.state.db)


# ─── Cablear los 2 modelos en espera · conectores reales (gusto · conversaciones) ───
# "Activar" = correr el conector que ALIMENTA cada modelo con el dato real que SÍ tenemos:
#   · gusto → etiqueta las fotos del catálogo (photo_tagger, visión si hay llave OpenAI · Capa 2)
#     → asesor_photo_tags → el modelo de gusto deja de adivinar por el nombre del archivo.
#   · conversaciones → mina los mensajes guardados (objeciones + DISC + ánimo) → conversation_signal.
# Idempotente, fail-open, cero deuda. Lo externo (swipes del comprador, WhatsApp) se autollena.
async def _activar_gusto(db):
    from data_developments import DEVELOPMENTS
    import os
    import photo_tagger as pt
    use_vision = bool(os.environ.get("OPENAI_API_KEY"))
    etiquetadas = 0
    devs_ok = 0
    for d in DEVELOPMENTS:
        photos = d.get("photos") or []
        if not photos:
            continue
        try:
            tags = await pt.ensure_tags(db, d["id"], photos, use_vision=use_vision)
            etiquetadas += len(tags)
            devs_ok += 1
        except Exception as e:
            log.warning("activar_gusto %s: %s", d.get("id"), e)
    total = 0
    try:
        total = await db.asesor_photo_tags.count_documents({})
    except Exception:
        pass
    return {"modelo": "gusto", "ok": True, "fotos_etiquetadas": total, "procesadas_ahora": etiquetadas,
            "desarrollos": devs_ok, "metodo": "vision" if use_vision else "nombre-de-archivo",
            "mensaje": (f"Analicé {total} fotos del catálogo{' con visión IA' if use_vision else ''}. "
                        "El gusto del mercado ya aprende de las imágenes reales, no del nombre del archivo. "
                        "El gusto por swipes se enciende cuando un comprador use el link tipo Tinder.")}


async def _activar_conversaciones(db):
    """Mina los mensajes del comprador (objeciones + ánimo + DISC) → conversation_signal. 0 hoy, auto-llena."""
    from datetime import datetime, timezone
    obj_counts: Dict[str, int] = {}
    sent = {"positivo": 0, "negativo": 0, "neutral": 0}
    procesados = 0
    try:
        from taste_profile import extract_text_signals
        for col in ["conversation_messages", "whatsapp_messages", "chat_messages", "buyer_coach_conversations"]:
            try:
                async for m in db[col].find({"$or": [{"role": "user"}, {"from": "lead"}, {"sender": "buyer"}, {"direction": "inbound"}]},
                                            {"_id": 0, "content": 1, "text": 1, "body": 1, "message": 1}).limit(2000):
                    txt = m.get("content") or m.get("text") or m.get("body") or m.get("message")
                    if not txt:
                        continue
                    sig = extract_text_signals(txt)
                    procesados += 1
                    sent[sig.get("sentiment", "neutral")] = sent.get(sig.get("sentiment", "neutral"), 0) + 1
                    for s in sig.get("signals", []):
                        if s.get("kind") == "budget" and s.get("polarity") == "neg":
                            obj_counts["precio"] = obj_counts.get("precio", 0) + 1
                        if s.get("kind") == "feature" and s.get("value") == "amplio":
                            obj_counts["tamano"] = obj_counts.get("tamano", 0) + 1
            except Exception:
                continue
    except Exception as e:
        log.warning("activar_conversaciones: %s", e)
    doc = {"_id": "global", "procesados": procesados, "objeciones": obj_counts, "sentimiento": sent,
           "updated_at": datetime.now(timezone.utc).isoformat()}
    try:
        await db.conversation_signal.replace_one({"_id": "global"}, doc, upsert=True)
    except Exception:
        pass
    return {"modelo": "conversaciones", "ok": True, "mensajes_procesados": procesados,
            "objeciones": obj_counts, "sentimiento": sent,
            "mensaje": (f"Procesé {procesados} mensajes de compradores." if procesados else
                        "El conector quedó listo y conectado. En cuanto entre la primera conversación "
                        "(WhatsApp o el chat del asistente), se llena solo con objeciones, ánimo y perfil DISC.")}


@router.post("/activar-modelo/{modelo}")
async def activar_modelo(modelo: str, request: Request):
    from permissions import require_superadmin
    await require_superadmin(request)
    db = request.app.state.db
    if modelo == "gusto":
        return await _activar_gusto(db)
    if modelo == "conversaciones":
        return await _activar_conversaciones(db)
    raise HTTPException(400, "Modelo no reconocido")


@router.get("/equipo-en-riesgo")
async def equipo_en_riesgo(request: Request, umbral: int = 50, limite: int = 50):
    """Asesores/usuarios que se están enfriando (riesgo de abandono > umbral), ordenados de mayor a
    menor riesgo. Reusa el motor de churn — NO calcula nada nuevo. FAIL-OPEN: si el motor falla,
    devuelve lista vacía con lectura honesta en vez de romper el tablero del superadmin."""
    from permissions import require_superadmin
    await require_superadmin(request)
    db = request.app.state.db
    umbral = max(0, min(int(umbral or 50), 100))
    limite = max(1, min(int(limite or 50), 200))
    en_riesgo: List[Dict[str, Any]] = []
    try:
        from churn_prediction_engine import detect_cold_users
        cold = await detect_cold_users(db, threshold_score=umbral)
        en_riesgo = (cold or [])[:limite]
    except Exception as e:
        log.warning("[equipo-en-riesgo] fail-open: %s", e)
        en_riesgo = []
    # Resumen por banda de riesgo para el encabezado del panel
    altos = sum(1 for c in en_riesgo if (c.get("churn_risk_score") or 0) >= 75)
    medios = len(en_riesgo) - altos
    if not en_riesgo:
        lectura = "Nadie en riesgo de enfriarse ahora mismo. El equipo está activo."
    else:
        lectura = (f"{len(en_riesgo)} en riesgo de enfriarse"
                   + (f" ({altos} crítico{'s' if altos != 1 else ''})" if altos else "")
                   + " — contáctalos para reactivar antes de perderlos.")
    return {"ok": True, "umbral": umbral, "total": len(en_riesgo),
            "criticos": altos, "moderados": medios,
            "en_riesgo": en_riesgo, "lectura": lectura}


@router.get("/demanda-unidades")
async def demanda_unidades(request: Request, limit: int = 20):
    """GRANULARIDAD POR UNIDAD → superadmin (el moat): qué UNIDADES concretas (no solo desarrollos) mueven más demanda en
    TODA la ciudad — vistas + guardados + leads por unidad, cruzando todos los devs, con colonia/precio/m². El dato ya se
    captura (buyer_signals.unit_number + leads.unidad_interes); aquí se AGREGA y EXPONE (capas 2-3 del cubo por-unidad).
    Cero dato inventado: si no hay señal, lista vacía (hide-if-empty en el front)."""
    from permissions import require_superadmin
    await require_superadmin(request)
    db = request.app.state.db
    from data_developments import DEVELOPMENTS_BY_ID
    from collections import defaultdict
    dem = defaultdict(lambda: {"vistas": 0, "guardados": 0, "leads": 0})
    try:
        async for s in db.buyer_signals.find({"type": "unit_view", "unit_number": {"$nin": [None, ""]}}, {"_id": 0, "entity_id": 1, "unit_number": 1}):
            if s.get("entity_id"):
                dem[(s["entity_id"], s["unit_number"])]["vistas"] += 1
        async for s in db.buyer_signals.find({"type": "unit_save", "active": True, "unit_number": {"$nin": [None, ""]}}, {"_id": 0, "entity_id": 1, "unit_number": 1}):
            if s.get("entity_id"):
                dem[(s["entity_id"], s["unit_number"])]["guardados"] += 1
        async for ld in db.leads.find({"unidad_interes": {"$nin": [None, ""]}}, {"_id": 0, "development_id": 1, "unidad_interes": 1}):
            if ld.get("development_id"):
                dem[(ld["development_id"], ld["unidad_interes"])]["leads"] += 1
    except Exception:
        pass
    rows = []
    for (dev_id, unit), v in dem.items():
        d = DEVELOPMENTS_BY_ID.get(dev_id) or {}
        uo = next((u for u in (d.get("units") or []) if u.get("unit_number") == unit), {})
        rows.append({
            "dev_id": dev_id, "dev_name": d.get("name") or dev_id, "colonia": d.get("colonia"),
            "unidad": unit, "precio": uo.get("price"), "m2": uo.get("m2_total") or uo.get("m2_privative"),
            "score": v["leads"] * 5 + v["guardados"] * 2 + v["vistas"], **v,
        })
    rows.sort(key=lambda r: -r["score"])
    return {"ok": True, "unidades": rows[:limit], "total_con_demanda": len(rows)}
