"""
Inteligencia Superadmin del Copiloto — el CUBO del ciclo del comprador (2026-06-18).

El ciclo del comprador agregado cross-ciudad = el moat "Bloomberg CDMX". Lee el ESPINAZO (marketplace_searches +
buyer_signals + leads + appointments) y lo destila en el cubo: EMBUDO (search→like→save→register→visit) ·
HUECOS de mercado (demandado sin oferta) · TOP demanda por colonia · VELOCIDAD (tendencia) · SHADOW demand
(anónimas vs registradas = el top-of-funnel real). Solo superadmin. Anónimo/agregado (no expone PII).
"""
import logging
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, HTTPException, Request, Query

log = logging.getLogger("dmx.routes_superadmin_copiloto")
router = APIRouter(tags=["superadmin_copiloto"])
PREFIX = "/api/superadmin/copiloto"


async def _require_superadmin(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    if user.role != "superadmin":
        raise HTTPException(403, "Solo superadmin")
    return user


async def _count(coll, q):
    try:
        return await coll.count_documents(q)
    except Exception:
        return 0


async def _agg(coll, pipeline):
    try:
        return await coll.aggregate(pipeline).to_list(50)
    except Exception:
        return []


async def buyer_cycle_intel(db, dias: int = 30):
    """El cubo del ciclo del comprador (callable directo para verificación)."""
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=dias)
    F = {"created_at_dt": {"$gte": since}}

    # ── EMBUDO ── (cada paso del ciclo)
    busquedas = await _count(db.marketplace_searches, F)
    likes = await _count(db.buyer_signals, {"type": "like", "active": True, **F})
    guardadas = await _count(db.marketplace_searches, {"alert": True, **F})
    registros = await _count(db.leads, {"visitor_id": {"$exists": True, "$nin": [None, ""]}})
    visitas = await _count(db.appointments, {})
    conv = round(registros / busquedas * 100, 1) if busquedas else 0.0

    # ── HUECOS DE MERCADO ── (búsquedas SIN resultado, por colonia = dónde construir / vendible a devs)
    gaps = await _agg(db.marketplace_searches, [
        {"$match": {"unmet": True}}, {"$unwind": "$colonias"},
        {"$group": {"_id": "$colonias", "n": {"$sum": 1}, "presupuesto_prom": {"$avg": "$precio_max"}}},
        {"$sort": {"n": -1}}, {"$limit": 10},
    ])

    # ── TOP DEMANDA por colonia ──
    top = await _agg(db.marketplace_searches, [
        {"$match": F}, {"$unwind": "$colonias"},
        {"$group": {"_id": "$colonias", "busquedas": {"$sum": 1}, "presupuesto_prom": {"$avg": "$precio_max"},
                    "recamaras_prom": {"$avg": "$recamaras_min"}}},
        {"$sort": {"busquedas": -1}}, {"$limit": 10},
    ])

    # ── VELOCIDAD ── (señales últimos 7d vs previos 7d)
    d7, d14 = now - timedelta(days=7), now - timedelta(days=14)
    last7 = await _count(db.buyer_signals, {"created_at_dt": {"$gte": d7}})
    prev7 = await _count(db.buyer_signals, {"created_at_dt": {"$gte": d14, "$lt": d7}})

    # ── SHADOW DEMAND ── (anónimas vs registradas = el top-of-funnel real)
    anon = await _count(db.marketplace_searches, {"lead_id": {"$in": [None]}, **F})
    reg = await _count(db.marketplace_searches, {"lead_id": {"$nin": [None]}, **F})

    # ── CIERRES (E7 · flywheel) ── la inteligencia de CONVERSIÓN y COMPROMISO (el moat que se mejora solo).
    cierres = await _count(db.copiloto_closings, {})
    subio_pres = await _count(db.copiloto_closings, {"desajuste.subio_presupuesto": True})
    cambio_zona = await _count(db.copiloto_closings, {"desajuste.cambio_zona": True})
    like_antes = await _count(db.copiloto_closings, {"conducta.dio_like_al_comprado": True})
    ciclo = await _agg(db.copiloto_closings, [{"$group": {"_id": None, "dias": {"$avg": "$recorrido.dias_a_cierre"}}}])
    pct = lambda n: round(n / cierres * 100) if cierres else 0  # noqa: E731

    # ── DEMANDA GRANULAR (B) ── lo que el mercado PIDE por dimensión fina + el HUECO (pedido vs ofertado).
    # Lo que NO podemos cumplir (amenidad rara, zona fuera de cobertura) es el dato más valioso: dónde está el dinero.
    from data_developments import DEVELOPMENTS as _DEVS
    _supply_amen: dict = {}
    for _d in _DEVS:
        for _a in (_d.get("amenities") or []):
            _supply_amen[_a] = _supply_amen.get(_a, 0) + 1
    amen_ped = await _agg(db.marketplace_searches, [
        {"$match": F}, {"$unwind": "$amenidades_pedidas"},
        {"$group": {"_id": "$amenidades_pedidas", "n": {"$sum": 1}}}, {"$sort": {"n": -1}}, {"$limit": 12},
    ])
    feat_ped = await _agg(db.marketplace_searches, [
        {"$match": F}, {"$unwind": "$features_pedidos"},
        {"$group": {"_id": "$features_pedidos", "n": {"$sum": 1}}}, {"$sort": {"n": -1}}, {"$limit": 8},
    ])
    zonas_nd = await _agg(db.marketplace_searches, [
        {"$match": {"zona_no_disponible": {"$nin": [None, ""]}, **F}},
        {"$group": {"_id": "$zona_no_disponible", "n": {"$sum": 1}}}, {"$sort": {"n": -1}}, {"$limit": 10},
    ])
    cred_ped = await _agg(db.marketplace_searches, [
        {"$match": {"credito": {"$nin": [None, "", "none"]}, **F}},
        {"$group": {"_id": "$credito", "n": {"$sum": 1}}}, {"$sort": {"n": -1}}, {"$limit": 6},
    ])
    # A · captura total: intención completa (4 datos) vs exploratoria/abandonada + las frases CRUDAS recientes.
    completas = await _count(db.marketplace_searches, {"completa": True, **F})
    exploratorias = await _count(db.marketplace_searches, {"source": "ai_search", "completa": {"$ne": True}, **F})
    frases = await _agg(db.marketplace_searches, [
        {"$match": {"texto_crudo": {"$nin": [None, ""]}, **F}},
        {"$sort": {"created_at_dt": -1}}, {"$limit": 14}, {"$project": {"_id": 0, "t": "$texto_crudo"}},
    ])
    # E · Disposición a pagar por zona: presupuesto que la gente BUSCA vs el precio que el dev OFRECE en esa zona.
    wtp = await _agg(db.marketplace_searches, [
        {"$match": {"precio_max": {"$gt": 0}, **F}}, {"$unwind": "$colonias"},
        {"$group": {"_id": "$colonias", "n": {"$sum": 1}, "presup_prom": {"$avg": "$precio_max"}}},
        {"$sort": {"n": -1}}, {"$limit": 8},
    ])
    _oferta_min: dict = {}
    for _d in _DEVS:
        _z = _d.get("colonia_id")
        _pf = _d.get("price_from") or 0
        if _z and _pf and (_z not in _oferta_min or _pf < _oferta_min[_z]):
            _oferta_min[_z] = _pf
    # C · Elasticidad: en qué CEDE la gente cuando no hay match (lo que más relajan).
    cede = await _agg(db.buyer_elasticidad, [
        {"$match": F}, {"$group": {"_id": "$cedio", "n": {"$sum": 1}}}, {"$sort": {"n": -1}}, {"$limit": 10},
    ])
    # Demanda INSATISFECHA: búsqueda COMPLETA en zona que SÍ cubrimos pero sin nada que cumpla todo = hueco de
    # producto EXACTO (cierra ciclo comprador → dev). Agrupa por zona+recámaras+presupuesto+m².
    from collections import Counter as _Cnt
    insatisf_raw = await _agg(db.demanda_insatisfecha, [
        {"$match": F},
        {"$group": {"_id": {"zona": "$zona", "beds": "$criterios.beds", "max_price": "$criterios.max_price",
                            "min_sqm": "$criterios.min_sqm"},
                    "personas": {"$sum": 1}, "falta": {"$push": "$falta_top"}}},
        {"$sort": {"personas": -1}}, {"$limit": 10},
    ])
    demanda_insatisfecha = []
    for g in insatisf_raw:
        _cnt = _Cnt()
        for sub in (g.get("falta") or []):
            for x in (sub or []):
                _cnt[x] += 1
        k = g.get("_id") or {}
        demanda_insatisfecha.append({
            "zona": k.get("zona"), "recamaras": k.get("beds"), "presupuesto_max": k.get("max_price"),
            "m2_min": k.get("min_sqm"), "personas": g["personas"],
            "lo_que_mas_falta": [f for f, _ in _cnt.most_common(3)],
        })

    # SALUD DEL BUSCADOR (bucle de fallas de lectura): conceptos que la gente escribió y el parser NO leyó.
    miss_cnt = _Cnt()
    frases_miss = []
    try:
        async for x in db.parse_misses.find(F, {"_id": 0, "texto": 1, "miss": 1, "fuente": 1}).sort("created_at_dt", -1).limit(200):
            for m in (x.get("miss") or []):
                miss_cnt[m] += 1
            if len(frases_miss) < 12 and x.get("texto"):
                frases_miss.append({"texto": x["texto"][:120], "no_leyo": x.get("miss"), "fuente": x.get("fuente")})
    except Exception:
        pass
    salud_buscador = {
        "conceptos_no_leidos": [{"concepto": k, "veces": v} for k, v in miss_cnt.most_common(12)],
        "frases_recientes": frases_miss,
        "lectura": "Lo que la gente escribió y el buscador NO entendió. Prender el LLM resuelve la mayoría; lo que persista = afinar el respaldo o agregar el campo. Es data real, no adivinanza.",
    }

    # SUSTITUCIÓN: a qué zonas se va la demanda que NO encontró match en la zona pedida (cross-zona del buscador IA + wizards).
    # 'La demanda de A se va a B' = dónde construir/expandir (selección de terreno). Oro de inteligencia de mercado.
    sust_flows = await _agg(db.marketplace_searches, [
        {"$match": {"sustitucion": True, **F}},
        {"$unwind": "$zonas_sustitutas"},
        {"$group": {"_id": {"pedida": "$colonia_id", "sustituta": "$zonas_sustitutas"}, "n": {"$sum": 1}}},
        {"$sort": {"n": -1}}, {"$limit": 25},
    ])
    sust_total = await _count(db.marketplace_searches, {"sustitucion": True, **F})
    sustitucion = {
        "total": sust_total,
        "flujos": [{"pedida": (f.get("_id") or {}).get("pedida"), "sustituta": (f.get("_id") or {}).get("sustituta"), "veces": f.get("n")}
                   for f in sust_flows if (f.get("_id") or {}).get("pedida") and (f["_id"].get("sustituta") != f["_id"].get("pedida"))],
        "lectura": "La demanda que la zona pedida no pudo cumplir pero que SÍ matchea en otra. 'La demanda de A se va a B' → dónde construir/expandir (selección de terreno).",
    }

    # ESQUEMA DE PAGO que pide la gente (preventa vs crédito) → señal para devs: cómo estructurar precio y plan de pagos.
    esq_rows = await _agg(db.marketplace_searches, [
        {"$match": {"esquema_pedido": {"$ne": None}, **F}},
        {"$group": {"_id": "$esquema_pedido", "n": {"$sum": 1}}},
        {"$sort": {"n": -1}},
    ])
    esquema_demanda = {
        "reparto": [{"esquema": e["_id"], "veces": e["n"]} for e in esq_rows if e.get("_id")],
        "lectura": "Qué esquema de pago pide la gente (crédito hipotecario vs preventa/plan del dev) → cómo estructurar precio y plan de pagos.",
    }

    # BRECHA DE PAGO: zonas donde la gente pide pero su mensualidad NO alcanza ni lo más barato (gap>0) → demanda a un precio que no existe.
    brecha_rows = await _agg(db.marketplace_searches, [
        {"$match": {"gap_mensualidad": {"$gt": 0}, **F}},
        {"$group": {"_id": "$colonia_id", "n": {"$sum": 1}, "gap_prom": {"$avg": "$gap_mensualidad"},
                    "mens_pedida_prom": {"$avg": "$mensualidad_max"}}},
        {"$sort": {"n": -1}}, {"$limit": 12},
    ])
    brecha_total = await _count(db.marketplace_searches, {"gap_mensualidad": {"$gt": 0}, **F})
    brecha_pago = {
        "total": brecha_total,
        "zonas": [{"colonia": b["_id"], "veces": b["n"],
                   "gap_prom": round(b["gap_prom"]) if b.get("gap_prom") else None,
                   "mens_pedida_prom": round(b["mens_pedida_prom"]) if b.get("mens_pedida_prom") else None}
                  for b in brecha_rows if b.get("_id")],
        "lectura": "Zonas donde la gente quiere comprar pero su mensualidad no llega ni a lo más barato. Demanda real a un precio que el mercado no ofrece (oportunidad de producto accesible).",
    }

    # Atlax (buscador IA · superficie + burbuja) — ANTES estas señales eran write-only (dark a superadmin). Ahora el
    # cubo lee el embudo del perfilador guiado + las búsquedas sin match exacto (hueco de producto) + la intención.
    atlax_busquedas = await _count(db.buyer_signals, {"type": "atlax_query", **F})
    atlax_perfil_pasos = await _count(db.buyer_signals, {"type": "atlax_profile", **F})
    atlax_perfil_completos = await _count(db.buyer_signals, {"type": "atlax_profile", "value": "completo", **F})
    atlax_sin_match = await _count(db.buyer_signals, {"type": "atlax_query", "meta.n_exact": 0, **F})
    atlax_quickviews = await _count(db.buyer_signals, {"type": "view", "value": "atlax_quickview", **F})
    atlax_ficha_clicks = await _count(db.buyer_signals, {"type": "ficha_view", "value": "atlax", **F})
    atlax_intent = await _agg(db.buyer_signals, [
        {"$match": {"type": "atlax_query", "meta.intent": {"$nin": [None, ""]}, **F}},
        {"$group": {"_id": "$meta.intent", "n": {"$sum": 1}}},
        {"$sort": {"n": -1}}, {"$limit": 6},
    ])
    # GRAFO DEL RECHAZO (el porqué del NO) — la data privilegiada que NADIE más tiene: por qué dicen que no.
    atlax_saves = await _count(db.buyer_signals, {"type": "save", "active": True, **F})
    atlax_rechazo_motivo = await _agg(db.buyer_signals, [
        {"$match": {"type": "dismiss", "value": {"$nin": [None, ""]}, **F}},
        {"$group": {"_id": "$value", "n": {"$sum": 1}}}, {"$sort": {"n": -1}}, {"$limit": 8},
    ])
    atlax_rechazo_dev = await _agg(db.buyer_signals, [
        {"$match": {"type": "dismiss", "entity_id": {"$nin": [None, ""]}, **F}},
        {"$group": {"_id": {"dev": "$entity_id", "motivo": "$value"}, "n": {"$sum": 1}}}, {"$sort": {"n": -1}}, {"$limit": 60},
    ])
    atlax_foto_dwell = await _count(db.buyer_signals, {"type": "photo_dwell", **F})
    atlax_foto_zoom = await _count(db.buyer_signals, {"type": "photo_zoom", **F})
    # GAP DE PRESENTACIÓN: desarrollos rechazados sobre todo por FOTOS → el producto puede encajar pero la imagen mata
    # (insumo del loop al dev: "tu producto encaja, tus renders no venden — Studio").
    _devmot = {}
    for r in (atlax_rechazo_dev or []):
        k = r.get("_id") or {}
        dev = k.get("dev")
        if not dev:
            continue
        d = _devmot.setdefault(dev, {})
        d[k.get("motivo") or "?"] = d.get(k.get("motivo") or "?", 0) + r.get("n", 0)
    gap_pres = []
    for dev, mots in _devmot.items():
        tot = sum(mots.values()) or 1
        fotos = mots.get("fotos", 0)
        if fotos and fotos / tot >= 0.4:
            gap_pres.append({"dev_id": dev, "rechazos": tot, "por_fotos": fotos, "pct_fotos": round(100 * fotos / tot)})
    gap_pres.sort(key=lambda x: -x["por_fotos"])
    gap_pres = gap_pres[:10]

    return {
        "atlax": {
            "busquedas": atlax_busquedas,
            "perfilador_completados": atlax_perfil_completos,
            "perfilador_pasos_respondidos": atlax_perfil_pasos,
            "busquedas_sin_match_exacto": atlax_sin_match,
            "vistas_rapidas": atlax_quickviews,
            "clicks_a_ficha": atlax_ficha_clicks,
            "guardados": atlax_saves,
            "intencion_top": [{"intent": x["_id"], "veces": x["n"]} for x in atlax_intent if x.get("_id")],
            "rechazo_por_motivo": [{"motivo": x["_id"], "veces": x["n"]} for x in (atlax_rechazo_motivo or []) if x.get("_id")],
            "gap_presentacion": gap_pres,
            "engagement_fotos": {"vistas_de_foto": atlax_foto_dwell, "zooms": atlax_foto_zoom},
            "lectura": "Lo que la gente le pide a Atlax y qué hace: búsquedas, perfilador, búsquedas SIN match (hueco de producto), engagement (vistas rápidas/ficha/foto/zoom), guardados, intención — y EL PORQUÉ DEL NO: rechazo_por_motivo (fotos/precio/zona/…) + gap_presentacion (desarrollos que la demanda rechaza por las FOTOS aunque encajen → ofrecer Studio). Data que ningún portal tiene.",
        },
        "sustitucion": sustitucion,
        "esquema_demanda": esquema_demanda,
        "brecha_pago": brecha_pago,
        "salud_buscador": salud_buscador,
        "ventana_dias": dias,
        "embudo": {
            "busquedas": busquedas, "likes": likes, "guardadas_con_alerta": guardadas,
            "registros": registros, "visitas": visitas,
            "conversion_busqueda_a_registro_pct": conv,
        },
        "huecos_mercado": [{"colonia": g["_id"], "busquedas_sin_oferta": g["n"],
                            "presupuesto_prom": round(g["presupuesto_prom"]) if g.get("presupuesto_prom") else None} for g in gaps],
        "top_demanda": [{"colonia": t["_id"], "busquedas": t["busquedas"],
                         "presupuesto_prom": round(t["presupuesto_prom"]) if t.get("presupuesto_prom") else None,
                         "recamaras_prom": round(t["recamaras_prom"], 1) if t.get("recamaras_prom") else None} for t in top],
        "velocidad": {"ultimos_7d": last7, "previos_7d": prev7,
                      "tendencia": "subiendo" if last7 > prev7 else "bajando" if last7 < prev7 else "estable"},
        "shadow_demand": {"anonimas": anon, "registradas": reg, "ratio_anon_vs_reg": round(anon / max(reg, 1), 1),
                          "lectura": "Por cada lead registrado hay N búsquedas anónimas (el verdadero top-of-funnel)."},
        "cierres": {"n": cierres, "pct_subio_presupuesto": pct(subio_pres), "pct_cambio_zona": pct(cambio_zona),
                    "pct_like_antes_de_comprar": pct(like_antes),
                    "ciclo_dias_prom": round(ciclo[0]["dias"], 1) if (ciclo and ciclo[0].get("dias") is not None) else None,
                    "lectura": "Qué transigen los que SÍ cierran (presupuesto/zona) + el gusto predice la compra (el moat)."},
        "demanda_granular": {
            "amenidades_pedidas": [{"amenidad": a["_id"], "pedidos": a["n"],
                                    "desarrollos_que_la_ofrecen": _supply_amen.get(a["_id"], 0)} for a in amen_ped],
            "features_pedidos": [{"feature": f["_id"], "pedidos": f["n"]} for f in feat_ped],
            "zonas_fuera_de_cobertura": [{"zona": z["_id"], "pedidos": z["n"]} for z in zonas_nd],
            "creditos_pedidos": [{"credito": c["_id"], "pedidos": c["n"]} for c in cred_ped],
            "intencion": {"completas": completas, "exploratorias": exploratorias,
                          "lectura": "Completas = pidieron los 4 datos (zona+precio+recámaras+m²). Exploratorias = se quedaron a medias (también es demanda: querían algo pero no concretaron)."},
            "frases_recientes": [f["t"] for f in frases],
            "disposicion_pago": [{"zona": w["_id"], "busquedas": w["n"],
                                  "presupuesto_buscado_prom": round(w["presup_prom"]) if w.get("presup_prom") else None,
                                  "oferta_desde": _oferta_min.get(w["_id"]),
                                  "lectura": ("la gente busca debajo de tu precio de entrada — estás arriba de la demanda"
                                              if (_oferta_min.get(w["_id"]) and w.get("presup_prom") and _oferta_min[w["_id"]] > w["presup_prom"])
                                              else "tu precio de entrada cae dentro de lo que buscan")} for w in wtp],
            "elasticidad_en_que_ceden": [{"cedio": c["_id"], "veces": c["n"]} for c in cede],
            "demanda_insatisfecha": demanda_insatisfecha,
            "lectura": "Lo que el mercado pide por dimensión fina. Amenidad muy pedida y poco ofertada = qué construir/aceptar. Zona fuera de cobertura = dónde expandir. disposicion_pago = presupuesto buscado vs precio de entrada del dev por zona. demanda_insatisfecha = búsquedas EXACTAS en zona cubierta sin nada que cumpla = qué producto falta (recámaras+presupuesto+m² + lo que más falta).",
        },
        "es_estimado": busquedas < 30,
        "data_source": "espinazo Copiloto (marketplace_searches + buyer_signals + leads)",
    }


@router.get(PREFIX + "/intel")
async def intel(request: Request, dias: int = Query(30, ge=1, le=365)):
    """El cubo del ciclo del comprador para superadmin (Bloomberg CDMX). Agregado, sin PII."""
    await _require_superadmin(request)
    db = request.app.state.db
    return {"ok": True, **await buyer_cycle_intel(db, dias)}
