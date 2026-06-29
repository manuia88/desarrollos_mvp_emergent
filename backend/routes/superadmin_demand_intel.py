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
