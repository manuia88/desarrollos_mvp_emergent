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
