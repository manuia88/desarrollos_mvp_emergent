"""
Rutas del motor de Precio de Equilibrio + Gap de mercado (dato real 4S).

DECISIÓN DEL FOUNDER (2026-07-12): el dato 4S es un activo estratégico y queda EXCLUSIVAMENTE
en superadmin — NO se expone en marketplace público ni en el portal del desarrollador. Todos
los endpoints van bajo /api/superadmin/equilibrio/* con require_superadmin. Al dev se le
despacha guía curada por el superadmin (patrón cube→brief), no acceso al dato crudo.

Endpoints (todos superadmin):
  GET  /api/superadmin/equilibrio/precio        ?estudio=&zona=&clasificacion=&meses=
  GET  /api/superadmin/equilibrio/gap           ?estudio=
  GET  /api/superadmin/equilibrio/gap-radar
  GET  /api/superadmin/equilibrio/market-intel  ?estudio=&zona=&meses=
  GET  /api/superadmin/market-4s/overview                     ← god-view (competidores + cobertura)
  POST /api/superadmin/market-4s/load                         ← carga/refresca el dato 4S
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Request, Query

from permissions import require_superadmin

log = logging.getLogger("dmx.equilibrium.routes")
router = APIRouter(tags=["equilibrium"])


def _db(request: Request):
    return request.app.state.db


@router.get("/api/superadmin/equilibrio/precio")
async def r_precio_equilibrio(
    request: Request,
    estudio: Optional[str] = Query(None),
    zona: Optional[str] = Query(None),
    clasificacion: Optional[str] = Query(None),
    meses: int = Query(12, ge=1, le=120),
):
    await require_superadmin(request)
    from equilibrium_engine import precio_equilibrio
    return await precio_equilibrio(_db(request), zona=zona, estudio=estudio,
                                   clasificacion=clasificacion, meses_objetivo=meses)


@router.get("/api/superadmin/equilibrio/gap")
async def r_gap_mercado(request: Request, estudio: Optional[str] = Query(None)):
    await require_superadmin(request)
    from equilibrium_engine import gap_por_rango
    return await gap_por_rango(_db(request), estudio=estudio)


@router.get("/api/superadmin/equilibrio/gap-radar")
async def r_gap_radar(request: Request):
    """Radar de oportunidad: todas las zonas×segmentos rankeadas por índice de oportunidad."""
    await require_superadmin(request)
    from equilibrium_engine import gap_radar
    return await gap_radar(_db(request))


@router.get("/api/superadmin/equilibrio/market-intel")
async def r_market_intelligence(
    request: Request,
    estudio: Optional[str] = Query(None),
    zona: Optional[str] = Query(None),
    meses: int = Query(12, ge=1, le=120),
):
    await require_superadmin(request)
    from equilibrium_engine import market_intelligence
    return await market_intelligence(_db(request), zona=zona, estudio=estudio, meses_objetivo=meses)


@router.post("/api/superadmin/market-4s/load")
async def r_load_market_4s(request: Request):
    await require_superadmin(request)
    from market_4s_loader import load_market_4s
    return await load_market_4s(_db(request))


# ── GENERADOR DE REPORTES por menú (Ola B3 · territorio + bloques + cortes) ──
@router.get("/api/superadmin/reportes/bloques")
async def r_reportes_bloques(request: Request):
    """El MENÚ: bloques disponibles para armar el reporte."""
    await require_superadmin(request)
    from report_builder import catalogo
    return catalogo()


@router.post("/api/superadmin/reportes/generar")
async def r_reportes_generar(request: Request):
    """Genera el reporte a la medida: {colonias?, estudio?, bloques?, cortes?}."""
    await require_superadmin(request)
    body = await request.json()
    from report_builder import generar_reporte, guardar_reporte
    r = await generar_reporte(_db(request),
                              colonias=body.get("colonias"), estudio=body.get("estudio"),
                              bloques=body.get("bloques"), cortes=body.get("cortes"),
                              unit_id=body.get("unit_id"), granularidad=body.get("granularidad"),
                              desglosar_por=body.get("desglosar_por"),
                              fecha=body.get("fecha"),
                              vendidas_desde=body.get("vendidas_desde"),
                              vendidas_hasta=body.get("vendidas_hasta"))
    if body.get("guardar"):   # memoria: comparar hoy vs hace un mes
        g = await guardar_reporte(_db(request), r, nombre=body.get("nombre"))
        r["guardado"] = g
    return r


@router.get("/api/superadmin/reportes/guardados")
async def r_reportes_guardados(request: Request):
    await require_superadmin(request)
    from report_builder import listar_reportes
    return await listar_reportes(_db(request))


@router.get("/api/superadmin/reportes/guardado")
async def r_reporte_guardado(request: Request, id: str = Query(...)):
    await require_superadmin(request)
    from report_builder import obtener_reporte
    r = await obtener_reporte(_db(request), id)
    return r or {"error": "no encontrado"}


# ── ESPEJO del genoma + data negativa + radar léxico (Ola B1/B2/B5/B6) ──
@router.get("/api/superadmin/genoma/espejo")
async def r_genoma_espejo(request: Request, colonias: Optional[str] = Query(None)):
    await require_superadmin(request)
    from demand_mirror import espejo
    from market_4s_bridge import norm_colonia
    cols = {norm_colonia(c) for c in colonias.split(",") if c.strip()} if colonias else None
    return await espejo(_db(request), cols)


@router.get("/api/superadmin/genoma/escasez")
async def r_genoma_escasez(request: Request, colonias: Optional[str] = Query(None)):
    await require_superadmin(request)
    from demand_mirror import escasez
    from market_4s_bridge import norm_colonia
    cols = {norm_colonia(c) for c in colonias.split(",") if c.strip()} if colonias else None
    return await escasez(_db(request), cols)


@router.get("/api/superadmin/genoma/data-negativa")
async def r_genoma_negativa(request: Request, dias: int = Query(30, ge=7, le=365)):
    await require_superadmin(request)
    from demand_mirror import data_negativa
    return await data_negativa(_db(request), dias=dias)


@router.get("/api/superadmin/genoma/radar-lexico")
async def r_genoma_lexico(request: Request):
    await require_superadmin(request)
    from demand_mirror import radar_lexico
    return await radar_lexico(_db(request))


# ── SCORES del mercado (Ola C) ──
def _cols_param(colonias: Optional[str]):
    from market_4s_bridge import norm_colonia
    return {norm_colonia(c) for c in colonias.split(",") if c.strip()} if colonias else None


@router.get("/api/superadmin/genoma/precio-sombra")
async def r_precio_sombra(request: Request, colonias: Optional[str] = Query(None)):
    await require_superadmin(request)
    from market_scores_engine import precio_sombra
    return await precio_sombra(_db(request), _cols_param(colonias))


@router.get("/api/superadmin/genoma/liquidez")
async def r_liquidez(request: Request, colonias: Optional[str] = Query(None)):
    await require_superadmin(request)
    from market_scores_engine import score_liquidez
    return await score_liquidez(_db(request), _cols_param(colonias))


@router.get("/api/superadmin/genoma/screener")
async def r_screener(request: Request, colonias: Optional[str] = Query(None),
                     umbral_pct: float = Query(10.0, ge=1, le=50)):
    await require_superadmin(request)
    from market_scores_engine import screener
    return await screener(_db(request), _cols_param(colonias), umbral_pct=umbral_pct)


@router.get("/api/superadmin/genoma/curva-vertical")
async def r_curva_vertical(request: Request, colonias: Optional[str] = Query(None)):
    await require_superadmin(request)
    from market_scores_engine import curva_vertical
    return await curva_vertical(_db(request), _cols_param(colonias))


@router.get("/api/superadmin/genoma/land-bank")
async def r_land_bank(request: Request):
    await require_superadmin(request)
    from market_scores_engine import land_bank
    return await land_bank(_db(request))


@router.get("/api/superadmin/genoma/corredores")
async def r_corredores(request: Request):
    await require_superadmin(request)
    from demand_graph_engine import corredores
    return await corredores(_db(request))


@router.get("/api/superadmin/genoma/set-competitivo")
async def r_set_competitivo(request: Request, unit_id: Optional[str] = Query(None)):
    await require_superadmin(request)
    from demand_graph_engine import set_competitivo
    return await set_competitivo(_db(request), unit_id=unit_id)


@router.post("/api/superadmin/genoma/inexistente-a-brief")
async def r_inexistente_brief(request: Request, colonias: Optional[str] = Query(None)):
    """Lo inexistente (demanda con cero oferta) → orden de trabajo al buzón del dev."""
    u = await require_superadmin(request)
    from demand_graph_engine import inexistente_a_brief
    actor = getattr(u, "email", None) or "superadmin"
    return await inexistente_a_brief(_db(request), _cols_param(colonias), actor=actor)


# ── GENOMA DE DEMANDA · átomos de la señal VIVA (Ola A · GENOMA_DEMANDA_BLUEPRINT.md) ──
@router.post("/api/superadmin/genoma/explotar")
async def r_genoma_explotar(request: Request):
    """Backfill: explota TODAS las búsquedas del marketplace en átomos de demanda (idempotente)."""
    await require_superadmin(request)
    from demand_genome import explotar_busquedas
    return await explotar_busquedas(_db(request))


@router.post("/api/superadmin/genoma/explotar-senales")
async def r_genoma_senales(request: Request):
    """buyer_signals (ver/like/dwell) → átomos con PESO (deseo más débil que buscar)."""
    await require_superadmin(request)
    from demand_genome import explotar_senales
    return await explotar_senales(_db(request))


@router.post("/api/superadmin/genoma/kpi-snapshot")
async def r_genoma_snapshot(request: Request):
    """Foto semanal del KPI del moat (idempotente) — construye la curva 'crece solo'."""
    await require_superadmin(request)
    from demand_genome import snapshot_kpi
    return await snapshot_kpi(_db(request))


@router.post("/api/superadmin/genoma/taxonomia/promover")
async def r_genoma_promover(request: Request, termino: str = Query(...),
                            slug: Optional[str] = Query(None)):
    """Cierra el ciclo del radar léxico: término emergente → feature contable (runtime)."""
    await require_superadmin(request)
    from demand_genome import promover_termino
    return await promover_termino(_db(request), termino, slug)


# ── BITÁCORA TEMPORAL (la 4ª dimensión: cualquier corte × tiempo) ──
@router.post("/api/superadmin/genoma/snapshot-oferta")
async def r_snapshot_oferta(request: Request):
    """Event-sourcing del inventario: cada cambio de precio/estado queda escrito para siempre."""
    await require_superadmin(request)
    from market_timeline import snapshot_oferta, snapshot_contexto
    o = await snapshot_oferta(_db(request))
    c = await snapshot_contexto(_db(request))
    return {"oferta": o, "contexto": c}


@router.get("/api/superadmin/genoma/evolucion")
async def r_evolucion(request: Request,
                      colonias: Optional[str] = Query(None),
                      dimension: Optional[str] = Query(None), valor: Optional[str] = Query(None),
                      desglosar_por: Optional[str] = Query(None),
                      unit_id: Optional[str] = Query(None),
                      desde: Optional[str] = Query(None), hasta: Optional[str] = Query(None),
                      granularidad: str = Query("mes")):
    """La serie temporal HIPERSEGMENTADA: cualquier corte × hora/día/semana/mes/trimestre/año,
    cualquier horizonte, con desglose (una serie por valor de la dimensión elegida)."""
    await require_superadmin(request)
    from market_timeline import evolucion, GRANULARIDADES
    if granularidad not in GRANULARIDADES:
        return {"error": f"granularidad inválida: {granularidad}", "validas": sorted(GRANULARIDADES)}
    return await evolucion(_db(request), colonias=_cols_param(colonias),
                           dimension=dimension, valor=valor, desglosar_por=desglosar_por,
                           unit_id=unit_id, desde=desde, hasta=hasta, granularidad=granularidad)


@router.post("/api/superadmin/genoma/instantanea")
async def r_instantanea(request: Request):
    """La pregunta-2033: el mercado COMO ERA en cualquier fecha, con cualquier mezcla de cortes
    (=, >=, <=, rango, tiene) sobre cualquier campo — registros unitarios + agregados.
    Body: {fecha?, colonias?, cortes?[{campo,op,valor,valor2}], vendidas_desde?, vendidas_hasta?, limite?}"""
    await require_superadmin(request)
    body = await request.json()
    from market_timeline import instantanea
    from market_4s_bridge import norm_colonia
    cols = {norm_colonia(c) for c in (body.get("colonias") or []) if c} or None
    return await instantanea(_db(request), fecha=body.get("fecha"), colonias=cols,
                             cortes=body.get("cortes"),
                             vendidas_desde=body.get("vendidas_desde"),
                             vendidas_hasta=body.get("vendidas_hasta"),
                             limite=int(body.get("limite") or 100))


@router.post("/api/superadmin/genoma/transiciones")
async def r_transiciones(request: Request):
    """El 'vendido' GENERALIZADO: toda transición del mercado (alta, salida confirmada/probable,
    reaparición, cambio de cualquier campo con delta%, features que aparecen/desaparecen) —
    hipersegmentada por territorio, tiempo, tipo, campo y cualquier corte del genoma.
    Body: {colonias?, tipo?, campo?, cortes?[{campo,op,valor,valor2}], desde?, hasta?, granularidad?, limite?}"""
    await require_superadmin(request)
    body = await request.json()
    from market_timeline import transiciones, GRANULARIDADES
    from market_4s_bridge import norm_colonia
    g = body.get("granularidad") or "mes"
    if g not in GRANULARIDADES:
        return {"error": f"granularidad inválida: {g}", "validas": sorted(GRANULARIDADES)}
    cols = {norm_colonia(c) for c in (body.get("colonias") or []) if c} or None
    return await transiciones(_db(request), colonias=cols, tipo=body.get("tipo"),
                              campo=body.get("campo"), cortes=body.get("cortes"),
                              desde=body.get("desde"), hasta=body.get("hasta"),
                              granularidad=g, limite=int(body.get("limite") or 200))


@router.post("/api/superadmin/genoma/absorcion-viva")
async def r_absorcion_viva(request: Request):
    """La velocidad de venta REAL medida por la bitácora (salidas, tasa, meses-de-inventario) —
    hipersegmentada. Body: {colonias?, cortes?, desde?, hasta?, granularidad?}"""
    await require_superadmin(request)
    body = await request.json()
    from market_timeline import absorcion_viva, GRANULARIDADES
    from market_4s_bridge import norm_colonia
    g = body.get("granularidad") or "mes"
    if g not in GRANULARIDADES:
        return {"error": f"granularidad inválida: {g}", "validas": sorted(GRANULARIDADES)}
    cols = {norm_colonia(c) for c in (body.get("colonias") or []) if c} or None
    return await absorcion_viva(_db(request), colonias=cols, cortes=body.get("cortes"),
                                desde=body.get("desde"), hasta=body.get("hasta"), granularidad=g)


@router.get("/api/superadmin/genoma/salud-dato")
async def r_salud_dato(request: Request):
    """Salud del inventario: campos presentes / rescatados de datos sucios / perdidos, con ejemplos."""
    await require_superadmin(request)
    from demand_mirror import salud_oferta
    return await salud_oferta(_db(request))


@router.get("/api/superadmin/genoma/resumen")
async def r_genoma_resumen(request: Request):
    """EL KPI DEL MOAT: átomos de demanda, dimensiones con señal, radar léxico. Debe crecer cada semana."""
    await require_superadmin(request)
    from demand_genome import resumen_genoma
    return await resumen_genoma(_db(request))


# ── CUBO 4S · átomos macro→nano (2,200+ hechos de los 4 estudios · superadmin-only) ──
@router.post("/api/superadmin/cubo-4s/load")
async def r_cubo4s_load(request: Request):
    await require_superadmin(request)
    from market_4s_facts import load_facts_4s
    return await load_facts_4s(_db(request))


@router.get("/api/superadmin/cubo-4s/catalogo")
async def r_cubo4s_catalogo(request: Request):
    await require_superadmin(request)
    from cube_4s_engine import catalogo
    return await catalogo(_db(request))


@router.get("/api/superadmin/cubo-4s/corte")
async def r_cubo4s_corte(
    request: Request,
    estudio: Optional[str] = Query(None), tema: Optional[str] = Query(None),
    pregunta: Optional[str] = Query(None), opcion: Optional[str] = Query(None),
    subzona: Optional[str] = Query(None),
    corte_dim: Optional[str] = Query(None), corte_valor: Optional[str] = Query(None),
):
    await require_superadmin(request)
    from cube_4s_engine import corte
    return await corte(_db(request), estudio=estudio, tema=tema, pregunta=pregunta,
                       opcion=opcion, subzona=subzona, corte_dim=corte_dim, corte_valor=corte_valor)


@router.get("/api/superadmin/cubo-4s/comparar")
async def r_cubo4s_comparar(request: Request, tema: str = Query(...), pregunta: str = Query(...)):
    await require_superadmin(request)
    from cube_4s_engine import comparar
    return await comparar(_db(request), tema=tema, pregunta=pregunta)


@router.get("/api/superadmin/cubo-4s/nano")
async def r_cubo4s_nano(request: Request, estudio: str = Query(...),
                        corte_dim: str = Query("etapa_vida"), corte_valor: str = Query(...)):
    await require_superadmin(request)
    from cube_4s_engine import nano
    return await nano(_db(request), estudio=estudio, corte_dim=corte_dim, corte_valor=corte_valor)


@router.get("/api/superadmin/cubo-4s/dimensiones")
async def r_cubo4s_dims(request: Request):
    await require_superadmin(request)
    from cube_4s_engine import dimensiones_nano
    return await dimensiones_nano(_db(request))


@router.get("/api/superadmin/cubo-4s/prior")
async def r_cubo4s_prior(request: Request, estudio: str = Query(...)):
    """El prior de mercado de la zona (dominantes 4S) que alimenta cuota/pagos/producto."""
    await require_superadmin(request)
    from market_4s_prior import prior_zona
    return await prior_zona(_db(request), estudio)


@router.get("/api/superadmin/cubo-4s/brief")
async def r_cubo4s_brief(request: Request, estudio: str = Query(...)):
    """Brief de producto auto-generado desde los átomos (modelo ganador + hueco + pago + riesgos)."""
    await require_superadmin(request)
    from brief_4s_engine import generar_brief
    return await generar_brief(_db(request), estudio)


@router.post("/api/superadmin/cubo-4s/brief/despachar")
async def r_cubo4s_brief_despachar(request: Request, estudio: str = Query(...)):
    """Genera el brief y lo despacha al buzón del dev (cube_actions · patrón cubo→brief)."""
    u = await require_superadmin(request)
    from brief_4s_engine import despachar_brief
    actor = getattr(u, "email", None) or "superadmin"
    return await despachar_brief(_db(request), estudio, actor=actor)


@router.get("/api/superadmin/cubo-4s/prior-colonia")
async def r_cubo4s_prior_colonia(request: Request, colonia: str = Query(...),
                                 precio_m2: Optional[float] = Query(None)):
    """Prior aplicable a CUALQUIER colonia: real (zona 4S) → transferido (perfil similar) → sin_prior."""
    await require_superadmin(request)
    from market_4s_transfer import prior_para_colonia
    return await prior_para_colonia(_db(request), colonia, precio_m2=precio_m2)


@router.get("/api/superadmin/cubo-4s/contraste")
async def r_cubo4s_contraste(request: Request, dias: int = Query(90, ge=7, le=365)):
    """Prior 4S (foto may/jun-2026) vs comprador OBSERVADO en el marketplace → confirma o DRIFT."""
    await require_superadmin(request)
    from market_4s_prior import contraste_4s_vs_observado
    return await contraste_4s_vs_observado(_db(request), dias=dias)


@router.get("/api/superadmin/market-4s/consumidor")
async def r_market_4s_consumidor(request: Request):
    """Inteligencia del CONSUMIDOR 4S (god-view): WTP (cuánto paga) + producto ideal (qué quiere)
    + score verde (sustentabilidad que vende) + plusvalía validada (avalúo vs reventa vs nuevo)."""
    await require_superadmin(request)
    from consumer_4s_engine import inteligencia_consumidor
    return await inteligencia_consumidor(_db(request))


@router.get("/api/superadmin/market-4s/overview")
async def r_market_4s_overview(request: Request):
    """God-view del dato 4S: proyectos competidores por estudio (nombres + absorción exacta),
    radar de oportunidad y la COBERTURA ganada (colonias cuyo IAB pasó de estimado→real)."""
    await require_superadmin(request)
    db = _db(request)
    from equilibrium_engine import gap_radar
    from market_4s_bridge import absorcion_4s_by_colonia

    estudios: dict = {}
    try:
        async for c in db.market_comps_4s.find({}, {"_id": 0}):
            estudios.setdefault(c.get("estudio") or "—", []).append(c)
    except Exception as e:
        log.warning("[market-4s/overview] comps fail-open: %s", e)

    radar = await gap_radar(db)
    cobertura = await absorcion_4s_by_colonia(db)

    def _abs(comps):
        tot = sum(int(x.get("unidades_totales") or 0) for x in comps)
        sold = sum(int(x.get("unidades_vendidas") or 0) for x in comps)
        return round(100 * sold / tot, 1) if tot else None

    return {
        "n_proyectos": sum(len(v) for v in estudios.values()),
        "n_estudios": len(estudios),
        "estudios": [{
            "estudio": k, "n_proyectos": len(v),
            "absorcion_pct": _abs(v),
            "comps": sorted(v, key=lambda x: -(x.get("absorcion_pct") or 0)),
        } for k, v in sorted(estudios.items())],
        "gap_radar": radar,
        "cobertura_iab_real": {
            "n_colonias": len(cobertura),
            "colonias": sorted(cobertura.keys()),
            "detalle": [{"colonia": k, **v} for k, v in sorted(cobertura.items())],
        },
        "fuente": "4s_2026-05",
    }
