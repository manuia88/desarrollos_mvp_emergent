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
from typing import Any, ClassVar, Dict, Optional

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
                                             "published": 1, "price_from": 1,
                                             "readiness_pct": 1, "salud_dato": 1}).limit(2000):
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
            "avance_pct": d.get("readiness_pct"),
            "salud_dato": d.get("salud_dato"),
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


@router.get("/corte")
async def corte_universal(request: Request, por: str = "colonia",
                          development_id: Optional[str] = None,
                          incluir_sin_dato: bool = False,
                          filtros: Optional[str] = None,
                          con_atomos: bool = False):
    """EL CORTE n-dimensional: ?por=a,b,c (hasta 3 cruzadas) + ?filtros={"dim":"valor"}
    (segmentos ANCLADOS: profundidad sin límite) + ?con_atomos=1 (cada fila trae sus
    unidades — el drill al átomo). Dimensiones = registro en corte_engine.DIMENSIONES."""
    await require_superadmin(request)
    dims = [d.strip() for d in por.split(",") if d.strip()][:3]
    if not dims:
        raise HTTPException(400, "Falta ?por=dimension[,dimension2[,dimension3]]")
    f: Dict[str, str] = {}
    if filtros:
        import json as _json
        try:
            f = {str(k): str(v) for k, v in _json.loads(filtros).items()}
        except Exception:
            raise HTTPException(400, 'filtros debe ser JSON: {"colonia":"Del Valle"}')
    from corte_engine import corte
    try:
        return await corte(_db(request), dims, development_id=development_id,
                           incluir_sin_dato=incluir_sin_dato, filtros=f,
                           con_atomos=con_atomos)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/pins")
async def pins_catalogo(request: Request):
    """Los proyectos del catálogo para el MAPA (pin + colocación + avance + sello)."""
    await require_superadmin(request)
    db = _db(request)
    out = []
    async for d in db.developments.find({"lat": {"$ne": None}},
                                        {"_id": 0, "id": 1, "name": 1, "lat": 1, "lng": 1,
                                         "readiness_pct": 1, "total_units_project": 1,
                                         "published": 1, "juez_pct": 1}).limit(500):
        n = await db.units.count_documents({"development_id": d["id"]})
        if not n:
            continue
        vend = await db.units.count_documents({"development_id": d["id"],
                                               "status": {"$in": ["vendida", "vendido", "sold"]}})
        tot = d.get("total_units_project")
        coloc = round((1 - n / tot) * 100, 1) if tot and tot >= n else             (round(vend * 100 / n, 1) if n else None)
        out.append({**d, "unidades": n, "colocacion_pct": coloc})
    return {"pins": out}


@router.get("/diff-listas/{development_id}")
async def diff_listas(request: Request, development_id: str):
    """QUÉ CAMBIÓ entre las últimas 2 fotos de la bitácora (el git-diff humano).
    Con 1 sola foto responde honesto: esperando la 2ª lista."""
    await require_superadmin(request)
    db = _db(request)
    fechas = sorted({str(e["ts"])[:10] async for e in db.oferta_timeline.find(
        {"dev_id": development_id}, {"_id": 0, "ts": 1})})
    if len(fechas) < 2:
        return {"listo": False, "fotos": len(fechas),
                "nota": "se activa con la 2ª lista (hoy hay " + str(len(fechas)) + " foto)"}
    f1, f2 = fechas[-2], fechas[-1]
    async def foto(dia):
        out = {}
        async for e in db.oferta_timeline.find(
                {"dev_id": development_id, "ts": {"$regex": f"^{dia}"}}, {"_id": 0}):
            out[e.get("unit_id")] = e
        return out
    a, b = await foto(f1), await foto(f2)
    unidades = {u["id"]: u.get("unit_number") for u in await db.units.find(
        {"development_id": development_id}, {"_id": 0, "id": 1, "unit_number": 1}).to_list(3000)}
    cambios = {"subieron": [], "bajaron": [], "salieron": [], "nuevas": [], "estatus": []}
    for uid, e2 in b.items():
        e1 = a.get(uid)
        num = unidades.get(uid, uid)
        if not e1:
            cambios["nuevas"].append({"unidad": num, "precio": e2.get("precio")})
            continue
        p1, p2 = e1.get("precio"), e2.get("precio")
        if p1 and p2 and p2 != p1:
            (cambios["subieron"] if p2 > p1 else cambios["bajaron"]).append(
                {"unidad": num, "antes": p1, "ahora": p2,
                 "pct": round((p2 - p1) * 100 / p1, 1)})
        if e1.get("disponible") and not e2.get("disponible"):
            cambios["estatus"].append({"unidad": num, "cambio": "salió de la lista (venta probable)"})
    for uid, e1 in a.items():
        if uid not in b and e1.get("disponible"):
            cambios["salieron"].append({"unidad": unidades.get(uid, uid)})
    return {"listo": True, "de": f1, "a": f2, "cambios": cambios,
            "resumen": {k: len(v) for k, v in cambios.items()}}


@router.get("/fabrica")
async def fabrica(request: Request):
    """OBSERVABILIDAD: la salud de la fábrica de datos en un vistazo."""
    await require_superadmin(request)
    db = _db(request)
    import pathlib
    fuente = await db.vigia_fuentes.find_one({"activa": True}, {"_id": 0})
    respaldos = sorted((pathlib.Path.home() / "dmx_backups").glob("auto_*"))
    actas = await db.actas_ingesta.count_documents({})
    gates = [d async for d in db.developments.find({"juez_pct": {"$ne": None}},
                                                   {"_id": 0, "name": 1, "juez_pct": 1,
                                                    "juez_gate": 1})]
    from salud_proceso import estado_proceso
    proceso = await estado_proceso(db)   # detecta código viejo (incidente 07-15)
    return {"proceso": proceso,
            "vigia": {"ultima_ronda": (fuente or {}).get("last_ronda_at"),
                      "activa": bool(fuente)},
            "lotes": {"pendientes": await db.bulk_ingest_items.count_documents(
                {"decision": "pending_review"}), "actas": actas},
            "juez": {"con_gate": sum(1 for g in gates if g.get("juez_gate")),
                     "total_juzgados": len(gates)},
            "respaldo": {"ultimo": respaldos[-1].name if respaldos else "aún ninguno (corre 3:30am)",
                         "copias": len(respaldos)},
            "juicio_visual_pendiente": await db.cola_juicio_visual.count_documents(
                {"estado": "pendiente"}),
            "modelo_ml": await db.ml_modelos.find_one(
                {}, {"_id": 0, "residuales": 0, "anomalias": 0}, sort=[("ts", -1)]),
            "examen_modelo": _resumen_examen(
                await db.pronostico_vs_real.find({}, {"_id": 0}).to_list(5000)),
            "censo": await _resumen_censo_global(db),
            "cobertura": await _resumen_cobertura(db),
            "estado_historico": await _estado_historico(db)}


async def _estado_historico(db):
    from estado_catalogo import estado_con_comparativo
    return await estado_con_comparativo(db)


async def _resumen_cobertura(db):
    """Cobertura de fuente (capa 7): ¿qué % de lo que el Maestro trae capturamos?"""
    docs = await db.cobertura_fuente.find(
        {}, {"_id": 0, "capturadas": 1, "columnas_con_fuente": 1, "huecos": 1}).to_list(100)
    if not docs:
        return None
    cap = sum(d.get("capturadas") or 0 for d in docs)
    con = sum(d.get("columnas_con_fuente") or 0 for d in docs)
    return {"devs": len(docs), "capturadas": cap, "campos_fuente": con,
            "pct": round(cap * 100 / con, 1) if con else None,
            "devs_con_hueco": sum(1 for d in docs if d.get("huecos"))}


async def _resumen_censo_global(db):
    """El Censo (capa 6) en un vistazo: % de campos verificados contra fuente."""
    docs = await db.censo_verificacion.find({}, {"_id": 0, "pct": 1, "discrepa": 1,
                                                 "comparados": 1}).to_list(100)
    if not docs:
        return None
    comparados = sum(d.get("comparados") or 0 for d in docs)
    discrepa = sum(d.get("discrepa") or 0 for d in docs)
    cargas_rotas = await db.censo_post_carga.count_documents({"ok": False})
    return {"devs_censados": len(docs), "campos": comparados,
            "pct": round((comparados - discrepa) * 100 / comparados, 2)
            if comparados else None,
            "discrepa": discrepa, "cargas_con_perdida": cargas_rotas}


def _resumen_examen(examenes):
    from pronostico_real import resumen
    return resumen(examenes)


@router.get("/autopiloto")
async def autopiloto_estado(request: Request):
    """LA PÓLIZA + el log de decisiones: qué hace solo, qué escala y por qué."""
    await require_superadmin(request)
    db = _db(request)
    import autopiloto_catalogo as ap
    ultimas = await db.autopiloto_log.find({}, {"_id": 0}) \
        .sort("ts", -1).to_list(50)
    return {"encendido": ap.encendido(), "poliza": ap.POLIZA,
            "pedidos_preparados": await db.pedidos_preparados.count_documents({}),
            "ultimas_decisiones": ultimas}


@router.post("/autopiloto/correr")
async def autopiloto_correr(request: Request):
    """Una pasada manual del autopiloto (también corre solo tras cada ronda del vigía)."""
    await require_superadmin(request)
    from autopiloto_catalogo import correr_autopiloto
    return await correr_autopiloto(_db(request))


class DeshacerIn(BaseModel):
    acta_id: str


@router.post("/deshacer-lote")
async def deshacer(request: Request, body: DeshacerIn):
    """LA REVERSA: restaura el estado previo a una carga (auditado)."""
    user = await require_superadmin(request)
    from actas_ingesta import deshacer_lote
    r = await deshacer_lote(_db(request), body.acta_id)
    try:
        from audit_log import log_mutation
        await log_mutation(_db(request), user, "rollback", "acta_ingesta", body.acta_id,
                           before=None, after=r, request=request)
    except Exception:
        pass
    return r


@router.get("/bandeja")
async def bandeja_del_dia(request: Request):
    """LA BANDEJA ÚNICA: todo lo accionable en una lista por prioridad (inbox cero)."""
    await require_superadmin(request)
    from bandeja_unica import bandeja
    return await bandeja(_db(request))


@router.get("/mercado-cruces")
async def mercado_cruces_ep(request: Request):
    """Gap de producto + demanda revelada: el catálogo vs el mercado real minado (4S)."""
    await require_superadmin(request)
    from mercado_cruces import cruces_mercado
    return await cruces_mercado(_db(request))


@router.get("/unit-economics")
async def unit_economics(request: Request):
    """La tesis del moat en números: qué costó cada proyecto ingerido."""
    await require_superadmin(request)
    db = _db(request)
    n_devs = len([d async for d in db.developments.find({}, {"_id": 0, "id": 1})])
    n_units = await db.units.count_documents({})
    n_eventos = await db.oferta_timeline.count_documents({})
    costo = 0.0
    async for c in db.ai_cost_daily_snapshots.find({}, {"_id": 0}):
        costo += c.get("total_mxn") or c.get("cost_mxn") or 0
    return {"proyectos": n_devs, "unidades": n_units, "eventos_bitacora": n_eventos,
            "costo_api_acumulado_mxn": round(costo, 2),
            "costo_por_unidad_mxn": round(costo / n_units, 2) if n_units else 0,
            "nota": "piloto en sesión = $0 API; esto medirá el costo real al escalar"}


@router.get("/dev/{dev_org_id}/perfil")
async def perfil_dev(request: Request, dev_org_id: str):
    """EL PERFIL DEL DESARROLLADOR: catálogo + radar del Drive (portafolio completo con
    etapa por carpeta) + agregados. La empresa entera, no solo lo ingerido."""
    await require_superadmin(request)
    from perfil_dev import perfil_desarrollador
    return await perfil_desarrollador(_db(request), dev_org_id)


@router.get("/pedidos/{development_id}")
async def pedidos(request: Request, development_id: str):
    """LA LISTA DE PEDIDOS: todo lo que hay que pedirle a este dev, redactado y listo
    para copiar/pegar (faltantes 80% + preguntas del auditor + contradicciones + huecos)."""
    await require_superadmin(request)
    from lista_pedidos import pedido_desarrollo
    return await pedido_desarrollo(_db(request), development_id)


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

    from unidades_efectivas import unidades_efectivas
    units = sorted(await unidades_efectivas(db, {"development_id": development_id}),
                   key=lambda u: u.get("unit_number") or "")
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

    ult_ev = await db.oferta_timeline.find({"dev_id": development_id}, {"_id": 0, "ts": 1}) \
        .sort("ts", -1).to_list(1)
    n_eventos = await db.oferta_timeline.count_documents({"dev_id": development_id})
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

    # ═══ EL SELLO DE LAS 5 CAPAS (la etiqueta nutricional del dato) ═══
    cruce_doc = await db.cotejo_cruce_fuentes.find_one({"development_id": development_id},
                                                       {"_id": 0})
    juez_doc = await db.veredictos_juez.find_one({"development_id": development_id},
                                                 {"_id": 0}, sort=[("ts", -1)])
    errores_dev = [h for h in ((await __import__("auditor_catalogo").ultima_auditoria(
        db, development_id=development_id)).get("hallazgos") or [])
        if h.get("severidad") == "error"]
    sello = {
        "aritmetica": bool(units),                       # capa 1: validada al extraer (gate)
        "cruce": bool(cruce_doc) or bool(cotejo),        # capa 2: multi-fuente corrida
        "porton": bool(units),                           # capa 3: pre-auditoría del lote
        "auditor": len(errores_dev) == 0,                # capa 4: 0 errores vivos
        "juez": bool((juez_doc or {}).get("gate_98")),   # capa 5: gate ≥98%
    }
    sello["completas"] = sum(1 for v in sello.values() if v is True)

    return {
        "desarrollo": d, "unidades": units, "n_unidades": len(units),
        "sello_capas": sello,
        "prototipos": protos,
        "metricas_moldes": {m["prototype_id"]: m for m in metricas["moldes"]},
        "programas": {p["prototype_id"]: p for p in programas},
        "cotejo": cotejo,
        "playbook": playbook,
        "bitacora": {"eventos": n_eventos,
                     "ultima_foto": str(ult_ev[0]["ts"]) if ult_ev else None},
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
        "posicion_unidades": __import__("ficha_atomo").posiciones_por_molde(units),
    }


class PublicarIn(BaseModel):
    forzar: bool = False          # publicar aunque no llegue al 80% (con acuse)
    despublicar: bool = False


@router.post("/expediente/{development_id}/publicar")
async def publicar(request: Request, development_id: str, body: PublicarIn):
    """Publicar al marketplace. <80% requiere forzar=true (override consciente del
    founder): se registra en auditoría CON la lista de faltantes que el comprador verá."""
    user = await require_superadmin(request)
    db = _db(request)
    d = await db.developments.find_one({"id": development_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Desarrollo no encontrado")
    if body.despublicar:
        await db.developments.update_one({"id": development_id},
                                         {"$set": {"published": False,
                                                   "marketplace_published": False}})
        return {"ok": True, "published": False}
    from routes.dev_project_full import project_full, project_readiness
    rd = project_readiness(await project_full(db, development_id))
    faltantes = [m.get("label") for m in (rd.get("missing") or [])]
    if (rd.get("pct") or 0) < 80 and not body.forzar:
        raise HTTPException(409, {"pct": rd.get("pct"), "faltantes": faltantes,
                                  "detalle": "Bajo el 80%: manda forzar=true para "
                                             "publicar de todos modos (queda con acuse)"})
    await db.developments.update_one(
        {"id": development_id},
        {"$set": {"published": True, "marketplace_published": True,
                  "published_at": _now_iso(),
                  "published_override": (rd.get("pct") or 0) < 80}})
    try:
        from audit_log import log_mutation
        await log_mutation(db, user, "publish", "development", development_id,
                           before={"pct": rd.get("pct")},
                           after={"forzado": (rd.get("pct") or 0) < 80,
                                  "faltantes_al_publicar": faltantes}, request=request)
    except Exception:
        pass
    return {"ok": True, "published": True, "pct": rd.get("pct"),
            "override": (rd.get("pct") or 0) < 80, "faltantes": faltantes}


@router.get("/auditoria")
async def auditoria(request: Request, development_id: Optional[str] = None,
                    nivel: Optional[str] = None, severidad: Optional[str] = None,
                    correr: bool = False):
    """La salud del dato (Auditor del Catálogo) — hipersegmentable. ?correr=1 = auditar YA."""
    await require_superadmin(request)
    from auditor_catalogo import auditar, ultima_auditoria
    if correr:
        await auditar(_db(request))
    return await ultima_auditoria(_db(request), development_id=development_id,
                                  nivel=nivel, severidad=severidad)


class ExpedientePatch(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    address_full: Optional[str] = None
    stage: Optional[str] = None
    delivery_estimate: Optional[str] = None
    ciudad: Optional[str] = Field(default=None, max_length=60)   # multi-ciudad (Mérida…)
    # ✏️ Completar datos (founder 07-15): capturar AQUÍ lo que el dev conteste al pedido
    fondo_mantenimiento_mxn: Optional[float] = Field(default=None, ge=0)
    cuota_equipamiento_mxn: Optional[float] = Field(default=None, ge=0)
    legal_status: Optional[str] = Field(default=None, max_length=40)
    servicios: Optional[Dict[str, str]] = None          # {gas: "natural", agua: "...", luz: "..."}
    amenidades: Optional[list] = None                   # lista completa (reemplaza)
    sistema_constructivo: Optional[str] = Field(default=None, max_length=200)
    avance_pct: Optional[float] = Field(default=None, ge=0, le=100)
    etapa_obra: Optional[str] = Field(default=None, max_length=80)
    comision_pct: Optional[float] = Field(default=None, ge=0, le=20)
    brokers: Optional[bool] = None


@router.patch("/expediente/{development_id}")
async def editar_expediente(request: Request, development_id: str, body: ExpedientePatch):
    """Edición directa de los datos del desarrollo — sin wizard, con auditoría."""
    user = await require_superadmin(request)
    db = _db(request)
    todo = {k: v for k, v in body.model_dump().items() if v is not None}
    if not todo:
        raise HTTPException(400, "Nada que cambiar")
    # cada dato aterriza en SU colección (las mismas llaves que lee el semáforo del 80%)
    if "servicios" in todo or "amenidades" in todo:
        set_a: Dict[str, Any] = {"project_id": development_id}
        if todo.get("servicios") is not None:
            set_a["servicios"] = {k: v for k, v in todo.pop("servicios").items() if v}
        if todo.get("amenidades") is not None:
            from amenidades_canon import canonizar_lista
            set_a["amenities"] = canonizar_lista(todo.pop("amenidades"))
        await db.project_amenities.update_one({"project_id": development_id},
                                              {"$set": set_a}, upsert=True)
    if any(k in todo for k in ("sistema_constructivo", "avance_pct", "etapa_obra")):
        set_c: Dict[str, Any] = {"project_id": development_id}
        if todo.get("sistema_constructivo") is not None:
            sc = todo.pop("sistema_constructivo")
            set_c["sistema_constructivo"] = {"cimentacion": sc, "descripcion": sc}
        if todo.get("avance_pct") is not None:
            set_c["overall_percent"] = todo.pop("avance_pct")
        if todo.get("etapa_obra") is not None:
            set_c["current_stage"] = todo.pop("etapa_obra")
        await db.project_construction_progress.update_one(
            {"project_id": development_id}, {"$set": set_c}, upsert=True)
    if any(k in todo for k in ("comision_pct", "brokers")):
        set_m: Dict[str, Any] = {"project_id": development_id, "configured": True}
        if todo.get("comision_pct") is not None:
            set_m["default_commission_pct"] = todo.pop("comision_pct")
        if todo.get("brokers") is not None:
            set_m["works_with_brokers"] = todo.pop("brokers")
        await db.project_commercialization.update_one(
            {"project_id": development_id}, {"$set": set_m}, upsert=True)
    cambios = dict(todo)
    cambios["updated_at"] = _now_iso()
    r = await db.developments.update_one({"id": development_id}, {"$set": cambios})
    if not r.matched_count:
        raise HTTPException(404, "Desarrollo no encontrado")
    # el semáforo y la barra se refrescan solos (auditor cachea readiness)
    try:
        from auditor_catalogo import auditar
        import asyncio as _aio
        _aio.create_task(auditar(db, development_id))
    except Exception:
        pass
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
    from unidades_efectivas import unidades_efectivas
    units = sorted(await unidades_efectivas(db, {"development_id": development_id}),
                   key=lambda u: u.get("unit_number") or "")
    protos = await db.dmx_prototypes.find({"development_id": development_id}, {"_id": 0}).to_list(200)
    from ficha_atomo import posiciones_por_molde
    return {"proyecto": d, "unidades": units, "prototipos": protos, "n_unidades": len(units),
            "posicion_unidades": posiciones_por_molde(units)}


ORIENTACIONES = {"norte", "sur", "oriente", "poniente", "noreste", "noroeste",
                 "sureste", "suroeste"}


@router.get("/unidad/{unit_id}/ficha")
async def ficha_de_unidad(request: Request, unit_id: str):
    """LA FICHA DEL ÁTOMO: todo lo que se sabe de UNA unidad (registro universal de
    campos — lo que falta sale en ámbar con quién lo llena) + el análisis del motor
    (vs molde, vs piso, percentil, gemelas, demanda, bitácora)."""
    await require_superadmin(request)
    from ficha_atomo import ficha_unidad
    r = await ficha_unidad(_db(request), unit_id)
    if not r:
        raise HTTPException(404, "Unidad no encontrada")
    return r


class UnidadPatch(BaseModel):
    status: Optional[str] = None
    price_mxn: Optional[float] = Field(default=None, ge=0)
    orientacion: Optional[str] = None      # norte/sur/oriente/poniente/…
    vista: Optional[str] = Field(default=None, max_length=80)   # calle/interior/parque…
    # corrección de datos desde la ficha (founder 07-15: "un botón que permita editar")
    bedrooms: Optional[int] = Field(default=None, ge=0, le=10)
    bathrooms: Optional[float] = Field(default=None, ge=0, le=10)
    size_m2: Optional[float] = Field(default=None, gt=0)
    m2_balcony: Optional[float] = Field(default=None, ge=0)
    m2_terrace: Optional[float] = Field(default=None, ge=0)
    m2_roof_garden: Optional[float] = Field(default=None, ge=0)
    patio_m2: Optional[float] = Field(default=None, ge=0)
    m2_total: Optional[float] = Field(default=None, gt=0)
    parking_spots: Optional[int] = Field(default=None, ge=0, le=10)
    parking_type: Optional[str] = Field(default=None, max_length=60)
    bodega: Optional[str] = Field(default=None, max_length=60)
    mantenimiento_mxn: Optional[float] = Field(default=None, ge=0)
    reservacion_mxn: Optional[float] = Field(default=None, ge=0)
    contrato_mxn: Optional[float] = Field(default=None, ge=0)
    a_diferir_mxn: Optional[float] = Field(default=None, ge=0)
    escritura_mxn: Optional[float] = Field(default=None, ge=0)
    acabados: Optional[str] = Field(default=None, max_length=120)
    altura_techo_m: Optional[float] = Field(default=None, gt=0, le=8)
    notas: Optional[str] = Field(default=None, max_length=400)
    renta_mxn: Optional[float] = Field(default=None, ge=0)      # rieles de RENTA
    operacion: Optional[str] = Field(default=None, max_length=10)   # venta | renta

    CAMPOS_DIRECTOS: ClassVar[tuple] = ("bedrooms", "bathrooms", "size_m2", "m2_balcony", "m2_terrace",
                       "m2_roof_garden", "patio_m2", "m2_total", "parking_spots",
                       "parking_type", "bodega", "mantenimiento_mxn", "reservacion_mxn",
                       "contrato_mxn", "a_diferir_mxn", "escritura_mxn", "acabados",
                       "altura_techo_m", "notas", "renta_mxn", "operacion")


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
    for campo in UnidadPatch.CAMPOS_DIRECTOS:
        v = getattr(body, campo)
        if v is not None:
            cambios[campo] = (v.strip() or None) if isinstance(v, str) else v
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
            try:
                from auditor_catalogo import auditar
                await auditar(db, u["development_id"])
            except Exception:  # noqa: BLE001
                pass
        _aio.create_task(_concilia_y_coteja())
    except Exception:
        pass
    return {"ok": True, "unidad": {**u, **cambios}}
