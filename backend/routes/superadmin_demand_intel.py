"""Superadmin · INTELIGENCIA DE DEMANDA — la capa feature × colonia × tiempo que faltaba.

Complementa donde-construir (supply-gap) y demanda-unidades (unit-level) con la pregunta núcleo de la plataforma:
qué busca el mercado (feature/colonia/atributo), cuándo, y qué/dónde construir. Expone demand_intelligence.py.
"""
from fastapi import APIRouter, Request
from typing import Optional

router = APIRouter(prefix="/api/superadmin/demand-intel", tags=["superadmin_demand_intel"])


@router.get("/overview")
async def demand_overview(request: Request, colonia: Optional[str] = None, period: str = "month", since_days: int = 365):
    """Tablero de demanda: features más buscados, colonias más solicitadas, atributos explícitos, qué construir."""
    from permissions import require_superadmin
    await require_superadmin(request)
    import demand_intelligence as di
    db = request.app.state.db
    return {
        "alertas": await di.demand_alerts(db, since_days=since_days),   # jugadas proactivas globales
        "by_feature": await di.demand_by_feature(db, colonia=colonia, period=period, since_days=since_days),
        "by_colonia": await di.demand_by_colonia(db, period=period, since_days=since_days),
        "by_attribute": await di.demand_by_attribute(db, since_days=since_days),
        "what_to_build": await di.what_to_build(db, colonia=colonia, since_days=since_days),
        "engagement_contenido": await di.engagement_by_content(db, since_days=since_days),
        "no_satisfecha": await di.unmet_demand(db, since_days=since_days),
        "tendencias": await di.trend_alerts(db),
        "intencion_financiera": await di.financial_intent(db, since_days=since_days),
        "por_geo": await di.demand_by_geo(db, since_days=since_days),                # calle/CP/colonia/alcaldía/ciudad
        "conversacion": await di.conversation_intel(db, since_days=since_days),      # qué dice el comprador con Atlax
    }


@router.get("/deep")
async def demand_deep(request: Request, since_days: int = 365):
    """Dimensiones PROFUNDAS no obvias: por-qué-NO (rechazo), intent vivir/invertir, qué compite (market basket),
    cuándo buscan (hora/día), profundidad del journey. Todas de dato YA capturado."""
    from permissions import require_superadmin
    await require_superadmin(request)
    import demand_intelligence as di
    db = request.app.state.db
    return {
        "por_que_no": await di.rejection_intel(db, since_days=since_days),
        "intent": await di.intent_split(db, since_days=since_days),
        "que_compite": await di.co_viewed(db, since_days=since_days),
        "cuando": await di.temporal_demand(db),
        "journey": await di.journey_depth(db, since_days=since_days),
        "comportamiento": await di.behavior_profile(db, since_days=since_days),   # device + DISC + tour + scroll
        "sensibilidad_precio": await di.price_sensitivity(db, since_days=since_days),
        "velocidad_embudo": await di.funnel_velocity(db, since_days=since_days),
        "visitantes_calientes": await di.hot_visitors(db),
    }


@router.get("/zonas")
async def demand_zonas(request: Request, since_days: int = 180):
    """DINÁMICA DE ZONA a 3 escalas — macro (alcaldía) · media (colonia) · micro (CP). Por zona: demanda, oferta,
    ABSORCIÓN y MOVIMIENTO (subiendo/enfriando/nuevo). El mapa de calor del mercado a 3 zooms."""
    from permissions import require_superadmin
    await require_superadmin(request)
    import demand_intelligence as di
    db = request.app.state.db
    mm = await di.market_movement(db, since_days=since_days)
    mm["inteligencia"] = await di.zone_intelligence(db, since_days=since_days)  # fusión 9 motores por colonia
    mm["cruces"] = await di.cross_intelligence(db, since_days=since_days)        # métricas compuestas net-new
    return mm


@router.get("/screener/metricas")
async def screener_metricas(request: Request):
    """SCREENER — métricas y operadores disponibles para armar criterios de búsqueda."""
    from permissions import require_superadmin
    await require_superadmin(request)
    import screener as sc
    return sc.metricas_disponibles()


@router.post("/screener/buscar")
async def screener_buscar(request: Request, ordenar_por: Optional[str] = None, desc: bool = True, top: int = 40):
    """SCREENER — buscar por criterios: body = [{metrica, op, valor}]. Devuelve colonias que cumplen TODOS (AND)."""
    from permissions import require_superadmin
    await require_superadmin(request)
    import screener as sc
    criterios = await request.json()
    if isinstance(criterios, dict):
        criterios = criterios.get("criterios", [])
    return await sc.screen(request.app.state.db, criterios, ordenar_por=ordenar_por, desc=desc, top=top)


@router.get("/explorar")
async def explorar(request: Request, tipo: str = "ciudad", id: str = "CDMX", combinaciones: bool = True):
    """EXPLORADOR — un nodo del árbol (ciudad▸alcaldía▸colonia▸desarrollo▸unidad): hijos + cada segmento INDEPENDIENTE
    (oferta/demanda/gap por valor) + fichas técnicas (combinaciones) + características al fondo."""
    from permissions import require_superadmin
    await require_superadmin(request)
    import explorador as ex
    return await ex.explorar_nodo(request.app.state.db, tipo, id, con_combinaciones=combinaciones)


@router.get("/dimensiones")
async def dimensiones(request: Request, eje: Optional[str] = None, arbol: bool = False):
    """Catálogo CANÓNICO de hiper-segmentación: 114 dimensiones × 7 ejes, cada una con su campo real/derivado/por-crear.
    Única fuente de verdad para el árbol, el screener y la captura de datos."""
    from permissions import require_superadmin
    await require_superadmin(request)
    import dimension_registry as dr
    if arbol:
        return {"overview": dr.overview(), "arbol": dr.arbol(eje), "eje": eje}
    if eje:
        return {"overview": dr.overview(), "dimensiones": dr.by_eje(eje), "eje": eje}
    return {"overview": dr.overview(), "dimensiones": dr.DIMENSIONS}


@router.get("/atlas/entity")
async def atlas_entity(request: Request, tipo: str, id: str, ventana: str = "90d"):
    """ATLAS — ficha universal de métricas de una entidad (nano→macro, cualquier dimensión): todas las medidas por tema
    con procedencia + fusión + conductual (unidades más vistas/sin cita, perfil cliente, forma de pago) + navegación."""
    from permissions import require_superadmin
    await require_superadmin(request)
    import entity_atlas as ea
    return await ea.entity_panel(request.app.state.db, tipo, id, ventana=ventana)


@router.get("/atlas/children")
async def atlas_children(request: Request, tipo: str = "ciudad", id: str = "CDMX"):
    """ATLAS — navegación: hijos de una entidad (ciudad→alcaldía→corredor→colonia→desarrollo→prototipo→unidad)."""
    from permissions import require_superadmin
    await require_superadmin(request)
    import entity_atlas as ea
    return {"tipo": tipo, "id": id, "hijos": ea.entity_children(tipo, id), "tipos_entidad": ea.ENTITY_TYPES}


@router.get("/indicadores/atributos")
async def indicadores_atributos(request: Request, geo_nivel: Optional[str] = None, geo_valor: Optional[str] = None):
    """Atributos como INDICADORES con valor: demanda vs oferta + comparativo vs ciudad + uso + fuente + granularidad."""
    from permissions import require_superadmin
    await require_superadmin(request)
    import terminal_indicadores as ti
    geo = (geo_nivel, geo_valor) if geo_nivel and geo_valor else None
    return await ti.atributos_indicadores(request.app.state.db, geo=geo)


@router.get("/indicadores/financiero")
async def indicadores_financiero(request: Request, geo_nivel: Optional[str] = None, geo_valor: Optional[str] = None):
    """Financiero como INDICADORES con uso + fuente + estado honesto (latente donde el cotizador no se usa)."""
    from permissions import require_superadmin
    await require_superadmin(request)
    import terminal_indicadores as ti
    geo = (geo_nivel, geo_valor) if geo_nivel and geo_valor else None
    return await ti.financiero_indicadores(request.app.state.db, geo=geo)


@router.get("/compare/run")
async def compare_run(request: Request, split: str = "amenidades_nivel", outcome: str = "sell_through",
                      geo_nivel: Optional[str] = None, geo_valor: Optional[str] = None):
    """COMPARATIVA (el porqué) — parte desarrollos por [split] y compara [outcome] entre grupos → delta cuantificado."""
    from permissions import require_superadmin
    await require_superadmin(request)
    import compare_engine as ce
    geo = (geo_nivel, geo_valor) if geo_nivel and geo_valor else None
    return await ce.compare(request.app.state.db, split, outcome, geo=geo)


@router.get("/compare/insights")
async def compare_insights(request: Request, geo_nivel: Optional[str] = None, geo_valor: Optional[str] = None, top: int = 15):
    """COMPARATIVA — auto-insights: barre split×outcome y sube los deltas más grandes ('sin amenidades = +N meses')."""
    from permissions import require_superadmin
    await require_superadmin(request)
    import compare_engine as ce
    geo = (geo_nivel, geo_valor) if geo_nivel and geo_valor else None
    return await ce.auto_insights(request.app.state.db, geo=geo, top=top)


@router.post("/compare/set-launch")
async def compare_set_launch(request: Request, dev_id: str, fecha_lanzamiento: str):
    """Captura la fecha de lanzamiento REAL de un desarrollo (AAAA-MM) → gana sobre la estimación y enciende velocidad."""
    from permissions import require_superadmin
    await require_superadmin(request)
    import launch_dates as ld
    return await ld.set_launch(request.app.state.db, dev_id, fecha_lanzamiento)


@router.get("/compare/launch-coverage")
async def compare_launch_coverage(request: Request):
    """Cobertura de fecha de lanzamiento: cuántos capturados / estimados por obra / estimados por etapa / sin dato."""
    from permissions import require_superadmin
    await require_superadmin(request)
    import launch_dates as ld
    lm = await ld.dev_launch_map(request.app.state.db)
    return {"cobertura": ld.coverage(lm), "total": len(lm),
            "detalle": [{"dev_id": k, "fecha": (v[0].strftime("%Y-%m") if v[0] else None), "metodo": v[1], "preciso": v[2]}
                        for k, v in sorted(lm.items())]}


@router.get("/compare/catalog")
async def compare_catalog(request: Request):
    """COMPARATIVA — catálogo de splits y outcomes disponibles."""
    from permissions import require_superadmin
    await require_superadmin(request)
    import compare_engine as ce
    return {"splits": ce.SPLITS, "outcomes": [{"id": k, "label": v[0], "unidad": v[1], "mejor_es": v[2]} for k, v in ce.OUTCOMES.items()]}


@router.get("/facet/catalog")
async def facet_catalog(request: Request):
    """FACETEO — catálogo: poblaciones (unidades/desarrollos/demanda), facets disponibles, ventanas, granularidades."""
    from permissions import require_superadmin
    await require_superadmin(request)
    import facet_engine as fe
    return fe.facets_catalog()


@router.get("/facet/query")
async def facet_query_ep(request: Request, poblacion: str = "unidades", group_by: Optional[str] = None,
                         geo_nivel: Optional[str] = None, geo_valor: Optional[str] = None, ventana: Optional[str] = None,
                         filtros: Optional[str] = None):
    """FACETEO — ¿cuántos [población] cumplen [filtros], por [group_by], en [geo], en [ventana]? OFERTA y DEMANDA,
    independiente (cada lado solo) y relacional (gap/ratio por valor). filtros = JSON {facet:valor}."""
    import json
    from permissions import require_superadmin
    await require_superadmin(request)
    import facet_engine as fe
    fdict = json.loads(filtros) if filtros else {}
    geo = (geo_nivel, geo_valor) if geo_nivel and geo_valor else None
    return await fe.facet_query(request.app.state.db, poblacion=poblacion, filtros=fdict, group_by=group_by, geo=geo, ventana=ventana)


@router.get("/facet/list")
async def facet_list_ep(request: Request, poblacion: str = "unidades", geo_nivel: Optional[str] = None,
                        geo_valor: Optional[str] = None, ventana: Optional[str] = None, filtros: Optional[str] = None,
                        limit: int = 300):
    """FACETEO — drill-down: ¿CUÁLES unidades/desarrollos/zonas hay detrás del conteo? filtros = JSON {facet:valor}."""
    import json
    from permissions import require_superadmin
    await require_superadmin(request)
    import facet_engine as fe
    fdict = json.loads(filtros) if filtros else {}
    geo = (geo_nivel, geo_valor) if geo_nivel and geo_valor else None
    return await fe.facet_list(request.app.state.db, poblacion=poblacion, filtros=fdict, geo=geo, ventana=ventana, limit=limit)


@router.get("/facet/crosstab")
async def facet_crosstab_ep(request: Request, poblacion: str, facet_a: str, facet_b: str,
                            geo_nivel: Optional[str] = None, geo_valor: Optional[str] = None):
    """FACETEO — cross-tab: conteo de [población] por facet_a × facet_b (tabla 2D)."""
    from permissions import require_superadmin
    await require_superadmin(request)
    import facet_engine as fe
    geo = (geo_nivel, geo_valor) if geo_nivel and geo_valor else None
    return await fe.facet_crosstab(request.app.state.db, poblacion, facet_a, facet_b, geo=geo)


@router.get("/facet/serie")
async def facet_serie_ep(request: Request, granularidad: str = "semana", periodos: int = 12,
                         geo_nivel: Optional[str] = None, geo_valor: Optional[str] = None):
    """FACETEO — serie de tiempo del conteo de demanda (día/semana/quincena/mes), últimos N periodos."""
    from permissions import require_superadmin
    await require_superadmin(request)
    import facet_engine as fe
    geo = (geo_nivel, geo_valor) if geo_nivel and geo_valor else None
    return await fe.serie_temporal(request.app.state.db, geo=geo, granularidad=granularidad, periodos=periodos)


@router.get("/facet/unmet")
async def facet_unmet_ep(request: Request, top: int = 12):
    """FACETEO — 'lo que NO existe': combinaciones (colonia × tipología × tier) que se BUSCAN con 0 oferta."""
    from permissions import require_superadmin
    await require_superadmin(request)
    import facet_engine as fe
    return await fe.unmet_combos(request.app.state.db, top=top)


@router.get("/grid/overview")
async def grid_overview(request: Request):
    """Grid de métricas — resumen del registro: medidas base, celdas teóricas, dimensiones, almacén de salida."""
    from permissions import require_superadmin
    await require_superadmin(request)
    import metric_registry as mr
    return mr.registry_overview()


@router.get("/grid/cell")
async def grid_cell(request: Request, measure: str, geo_nivel: Optional[str] = None, geo_valor: Optional[str] = None,
                    tipologia: Optional[str] = None, rango_m2: Optional[str] = None, tier_precio: Optional[str] = None,
                    atributo: Optional[str] = None, vista: Optional[str] = None, etapa: Optional[str] = None, ventana: Optional[str] = None):
    """Pivot: una celda con PROCEDENCIA (fuente/almacén/n/cohorte/frescura/confianza). Latente si n<n_mínimo."""
    from permissions import require_superadmin
    await require_superadmin(request)
    import grid_engine as ge
    dims = {"geo": (geo_nivel, geo_valor) if geo_nivel and geo_valor else None, "tipologia": tipologia,
            "rango_m2": rango_m2, "tier_precio": tier_precio, "atributo": atributo, "vista": vista, "etapa": etapa, "ventana": ventana}
    return await ge.compute(request.app.state.db, measure, {k: v for k, v in dims.items() if v})


@router.get("/grid/ranking")
async def grid_ranking(request: Request, measure: str, por: str = "colonia", top: int = 12,
                       tipologia: Optional[str] = None, atributo: Optional[str] = None, ventana: Optional[str] = None):
    """Ranking: top zonas/desarrollos por una medida (recorre el eje geo pedido)."""
    from permissions import require_superadmin
    await require_superadmin(request)
    import grid_engine as ge
    return await ge.ranking(request.app.state.db, measure, por=por, top=top,
                            **{k: v for k, v in {"tipologia": tipologia, "atributo": atributo, "ventana": ventana}.items() if v})


@router.get("/grid/insights")
async def grid_insights(request: Request):
    """Insights redactados que suben solos del grid (cada uno con n + cohorte + fuente — no se inventa)."""
    from permissions import require_superadmin
    await require_superadmin(request)
    import grid_engine as ge
    return await ge.insights(request.app.state.db)


@router.post("/grid/materialize")
async def grid_materialize(request: Request, measure: str, ejes: str = "geo,tipologia"):
    """Materializa una medida sobre los ejes (producto cartesiano) en metric_grid — solo n≥n_mínimo; resto latente."""
    from permissions import require_superadmin
    await require_superadmin(request)
    import grid_engine as ge
    return await ge.materialize(request.app.state.db, measure, [e.strip() for e in ejes.split(",") if e.strip()])


@router.get("/terminal-zona")
async def terminal_zona(request: Request, axis: str = "resumen", since_days: int = 180):
    """TERMINAL DE ZONA — la vista madre que pivotea TODOS los ejes del cubo (carga perezosa por eje):
    escalas (micro/media/macro) · inteligencia (fusión 8 motores) · cruces (compuestas) · compuestas (las 100) ·
    atributos (balcón/vista/altura…) · financiero (enganche/crédito/años/mensualidad/ROI/rentabilidad)."""
    from permissions import require_superadmin
    await require_superadmin(request)
    import demand_intelligence as di
    db = request.app.state.db
    if axis == "escalas":
        return await di.market_movement(db, since_days=since_days)
    if axis == "inteligencia":
        scale = request.query_params.get("scale", "media")
        air = request.query_params.get("airroi", "1") != "0"   # AirROI cacheado 1×/zona/mes (default on)
        return await di.zone_intelligence_scaled(db, scale=scale, since_days=since_days, with_airroi=air, with_underwriting=True)
    if axis == "cruces":
        return await di.cross_intelligence(db, since_days=since_days)
    if axis == "compuestas":
        import composite_metrics as cm
        return await cm.compute_all(db, since_days=since_days)
    if axis == "desarrollos":
        return await di.development_intelligence(db, dev_id=request.query_params.get("dev_id"), since_days=since_days)
    if axis == "areas-escala":
        return await di.axes_por_escala(db, scale=request.query_params.get("scale", "macro"), since_days=since_days)
    if axis == "atributos":
        return await di.attribute_demand(db, since_days=since_days)
    if axis == "financiero":
        return await di.financial_demand(db, since_days=since_days)
    # resumen: el índice de ejes
    return {
        "ejes": [
            {"key": "escalas", "label": "Escalas geo", "desc": "micro (CP) · media (colonia) · macro (alcaldía): demanda+absorción+movimiento"},
            {"key": "inteligencia", "label": "Inteligencia de zona", "desc": "fusión de 8 motores por colonia (precio/riesgo/inversión/ciclo)"},
            {"key": "atributos", "label": "Atributos de unidad", "desc": "balcón · vista int/ext · altura edificio · orientación · baños · recámaras"},
            {"key": "financiero", "label": "Financiero", "desc": "presupuesto · enganche · crédito · años · mensualidad · intent · ROI/cap rate · rentabilidad"},
            {"key": "cruces", "label": "Cruces (compuestas)", "desc": "brecha demanda-precio · ajustada a riesgo · oportunidad real"},
            {"key": "compuestas", "label": "Las 100 compuestas", "desc": "10 paquetes vendibles — comportamiento ⊗ mercado"},
        ],
        "lectura": "el cubo de ~4,000 celdas/colonia — pivotea medida × escala × atributo × financiero × tiempo",
    }


@router.get("/granular-advanced")
async def granular_advanced(request: Request, since_days: int = 365):
    """Las 20 granularidades AVANZADAS (estacionalidad, balance oferta-demanda, absorción, RFM, elasticidad, viral, fugas
    de embudo, competidores, locale, re-engagement, criterios, urgencia, sentimiento, presupuesto/timeline/prob predichos,
    co-ocurrencia, willingness-to-pay, sustitución, atribución). Todas de dato YA capturado."""
    from permissions import require_superadmin
    await require_superadmin(request)
    import marketplace_granularity as mg
    return await mg.run_all(request.app.state.db, since_days=since_days)


@router.post("/notify")
async def demand_notify(request: Request):
    """Dispara YA el push proactivo (normalmente cron semanal): notifica a cada dev qué construir en sus colonias."""
    from permissions import require_superadmin
    await require_superadmin(request)
    import demand_intelligence as di
    return await di.notify_demand_alerts(request.app.state.db)


@router.get("/feature")
async def demand_feature(request: Request, feature: str, colonia: str, period: str = "month"):
    """El query asesino: '¿cuántos clientes engancharon con [feature] en [colonia], y cuándo?' (serie de tiempo)."""
    from permissions import require_superadmin
    await require_superadmin(request)
    import demand_intelligence as di
    return await di.killer_query(request.app.state.db, feature, colonia, period=period)
