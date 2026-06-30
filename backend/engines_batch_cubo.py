"""ENGINES BATCH · CUBO/SEÑALES — TANDA 5 del engine hub (engines_hub.py).

Aporta runners + descriptores para los motores del CUBO OLAP y de SEÑALES de mercado. El hub mergea este REGISTRO
y engine_present.py mergea estos DESCRIPTORES, de modo que cada motor queda CONSULTABLE por el mismo patrón y se
PRESENTA como Indicadores hiper-segmentados (nombre humano · uso en decisión · unidad), nunca como JSON crudo.

Cada runner toma (db, ctx) con ctx simple {colonia_id, dev_id?, _dev?, _unit?} y devuelve la salida cruda del motor.
Es defensivo por diseño (el hub envuelve en try/except): un motor latente o sin datos no tumba el hub.

Motores cubiertos (16 archivos · 1 saltado):
  cube_olav (slice + compare) · metrics_cube · transaction_network (price_index + stats) · knowledge_graph ·
  dmx_cube_feed · cross_check · cross_sell · cerebro_mercado · external_insights · intelligence_insights ·
  insights_factcheck · narrative_layer · newsletter_pulse · entity_resolution.
  SALTADO: narrative_engine (exige ANTHROPIC_API_KEY + scores reales sembrados; sin ellos lanza 422/RuntimeError).
"""
from typing import Any, Dict, List, Optional


# ── helpers de zona (slugs de colonias reales del seed, para comparar/fallbacks) ──
def _colonias_para_comparar(colonia_id: Optional[str], n: int = 3) -> List[str]:
    """Devuelve [colonia_id + vecinas reales] hasta n, sacando slugs de DEVELOPMENTS."""
    from data_developments import DEVELOPMENTS
    seen: List[str] = []
    if colonia_id:
        seen.append(colonia_id)
    for d in DEVELOPMENTS:
        c = d.get("colonia_id")
        if c and c not in seen:
            seen.append(c)
        if len(seen) >= n:
            break
    return seen[:n]


# ── RUNNERS ───────────────────────────────────────────────────────────────────
async def _r_cubo_slice(db, ctx):
    import cube_olap_engine as e
    return await e.query_slice(db, tier="colonia", tier_id=ctx.get("colonia_id"), period="current")


async def _r_cubo_compare(db, ctx):
    import cube_olap_engine as e
    zonas = _colonias_para_comparar(ctx.get("colonia_id"), 3)
    return await e.query_compare_zones(db, zonas, period="current")


async def _r_cubo_comparables(db, ctx):
    import metrics_cube_aggregations as e
    return await e.find_comparables(db, ctx.get("dev_id"), radius_km=2.0, limit=20)


async def _r_cubo_price_index(db, ctx):
    import transaction_network_engine as e
    return await e.compute_price_index(db, ctx.get("colonia_id"), tier="colonia",
                                       property_type="depto", period="month")


async def _r_cubo_txn_stats(db, ctx):
    import transaction_network_engine as e
    return await e.compute_stats(db)


async def _r_cubo_kg_health(db, ctx):
    import knowledge_graph_engine as e
    return await e.health_check()


async def _r_cubo_atom_units(db, ctx):
    import dmx_cube_feed as e
    return await e.atom_units_for(db, "colonia", ctx.get("colonia_id"))


async def _r_cubo_cross_check(db, ctx):
    import cross_check_engine as e
    return await e.get_dev_cross_check(db, ctx.get("dev_id"))


async def _r_cubo_cross_sell(db, ctx):
    import cross_sell_engine as e
    return await e.compute_funnel_analytics(db, days=30)


async def _r_cubo_cerebro(db, ctx):
    import cerebro_mercado_engine as e
    return await e.aprendizaje_mercado(db)


async def _r_cubo_exec_overview(db, ctx):
    import intelligence_insights_engine as e
    return await e.executive_overview(db)


async def _r_cubo_external_sources(db, ctx):
    import external_insights_engine as e
    return await e.list_sources_status(db)


async def _r_cubo_factcheck_courses(db, ctx):
    import insights_factcheck_engine as e
    return await e.list_courses(db)


async def _r_cubo_newsletter_pulse(db, ctx):
    import newsletter_pulse_engine as e
    # contenido del Pulse para el segmento comprador (cae a stub determinista sin ANTHROPIC_API_KEY)
    return await e._generate_segment_content("buyer", {"top_growth": []}, db)


async def _r_cubo_narrative(db, ctx):
    import narrative_layer_engine as e
    return await e.generate(db, "colonia", ctx.get("colonia_id"), audience="neutral")


async def _r_cubo_dedup(db, ctx):
    import entity_resolution_engine as e
    return await e.detect_duplicates(db, "leads")


# ── REGISTRO ────────────────────────────────────────────────────────────────────
REGISTRO: List[Dict[str, Any]] = [
    {"id": "cub_cubo_slice", "nombre": "Cubo OLAP — KPIs de la colonia", "eje": "CUBO", "tanda": 5,
     "produce": "KPIs agregados (inventario, vendidas, $/m², absorción, conversión) de la colonia",
     "input": ["colonia_id"], "fn": _r_cubo_slice, "fuente": "cube_olap_engine"},
    {"id": "cub_cubo_compare", "nombre": "Cubo OLAP — comparar colonias", "eje": "CUBO", "tanda": 5,
     "produce": "comparación lado a lado de KPIs entre la colonia y 2 vecinas",
     "input": ["colonia_id"], "fn": _r_cubo_compare, "fuente": "cube_olap_engine"},
    {"id": "cub_comparables", "nombre": "Comparables en radio (2km)", "eje": "CUBO", "tanda": 5,
     "produce": "desarrollos comparables a ≤2km del proyecto (precio/m², etapa, distancia)",
     "input": ["dev_id"], "fn": _r_cubo_comparables, "fuente": "metrics_cube_aggregations"},
    {"id": "cub_price_index", "nombre": "Índice de precio transaccional", "eje": "SEÑALES", "tanda": 5,
     "produce": "mediana $/m² de cierres reales + descuento típico de la colonia (último mes)",
     "input": ["colonia_id"], "fn": _r_cubo_price_index, "fuente": "transaction_network_engine"},
    {"id": "cub_txn_stats", "nombre": "Red de transacciones — KPIs", "eje": "SEÑALES", "tanda": 5,
     "produce": "snapshot cross-org: cierres verificados, días en mercado, descuento, zonas con más velocidad",
     "input": [], "fn": _r_cubo_txn_stats, "fuente": "transaction_network_engine"},
    {"id": "cub_kg_health", "nombre": "Grafo de conocimiento — estado", "eje": "CUBO", "tanda": 5,
     "produce": "estado del grafo de conocimiento (Neo4j conectado/latencia/versión)",
     "input": [], "fn": _r_cubo_kg_health, "fuente": "knowledge_graph_engine"},
    {"id": "cub_atom_units", "nombre": "Átomo del cubo — unidades de la colonia", "eje": "CUBO", "tanda": 5,
     "produce": "unidades del átomo granular (dmx_units) que alimentan el cubo para la colonia",
     "input": ["colonia_id"], "fn": _r_cubo_atom_units, "fuente": "dmx_cube_feed"},
    {"id": "cub_cross_check", "nombre": "Cross-check documental del proyecto", "eje": "SEÑALES", "tanda": 5,
     "produce": "consistencia de los documentos del proyecto (críticos/advertencias/pasados/inconclusos)",
     "input": ["dev_id"], "fn": _r_cubo_cross_check, "fuente": "cross_check_engine"},
    {"id": "cub_cross_sell", "nombre": "Embudo de cross-sell (partners)", "eje": "SEÑALES", "tanda": 5,
     "produce": "embudo de cross-sell y revenue por partner (últimos 30 días)",
     "input": [], "fn": _r_cubo_cross_sell, "fuente": "cross_sell_engine"},
    {"id": "cub_cerebro", "nombre": "Cómo aprende el mercado (Cerebro)", "eje": "SEÑALES", "tanda": 5,
     "produce": "calibración del Cerebro: palancas de venta, lecciones, predicciones y drift",
     "input": [], "fn": _r_cubo_cerebro, "fuente": "cerebro_mercado_engine"},
    {"id": "cub_exec_overview", "nombre": "Panorama ejecutivo del mercado", "eje": "SEÑALES", "tanda": 5,
     "produce": "panorama CDMX: unidades totales, $/m² promedio, top alcaldías que crecen/caen, estado del mercado",
     "input": [], "fn": _r_cubo_exec_overview, "fuente": "intelligence_insights_engine"},
    {"id": "cub_external_sources", "nombre": "Fuentes externas — estado", "eje": "SEÑALES", "tanda": 5,
     "produce": "estado de las fuentes macro externas (BIS/OECD/INEGI/FRED…) cacheadas",
     "input": [], "fn": _r_cubo_external_sources, "fuente": "external_insights_engine"},
    {"id": "cub_factcheck_courses", "nombre": "Cursos / insights publicados", "eje": "SEÑALES", "tanda": 5,
     "produce": "catálogo de cursos/insights educativos publicados (fact-check)",
     "input": [], "fn": _r_cubo_factcheck_courses, "fuente": "insights_factcheck_engine"},
    {"id": "cub_newsletter_pulse", "nombre": "Pulse semanal (comprador)", "eje": "SEÑALES", "tanda": 5,
     "produce": "contenido del boletín semanal para el segmento comprador (resumen de mercado + top zonas)",
     "input": [], "fn": _r_cubo_newsletter_pulse, "fuente": "newsletter_pulse_engine"},
    {"id": "cub_narrative", "nombre": "Narrativa de la colonia", "eje": "SEÑALES", "tanda": 5,
     "produce": "narrativa en lenguaje natural de la colonia (corta/media/larga) con confianza",
     "input": ["colonia_id"], "fn": _r_cubo_narrative, "fuente": "narrative_layer_engine"},
    {"id": "cub_dedup", "nombre": "Duplicados de leads detectados", "eje": "SEÑALES", "tanda": 5,
     "produce": "pares de leads sospechosos de ser duplicados (calidad del dato del CRM)",
     "input": [], "fn": _r_cubo_dedup, "fuente": "entity_resolution_engine"},
]


# ── DESCRIPTORES (salida cruda → Indicadores hiper-segmentados) ───────────────────
DESCRIPTORES: Dict[str, Dict[str, Any]] = {
    "cub_cubo_slice": {"items": [
        {"k": "kpis.units_total", "nombre": "Unidades totales (colonia)", "uso": "Tamaño del inventario que mide el cubo en la colonia.", "unidad": "unidades"},
        {"k": "kpis.units_sold", "nombre": "Unidades vendidas", "uso": "Cuántas se cerraron: tracción real de la zona.", "unidad": "unidades"},
        {"k": "kpis.avg_price_per_m2", "nombre": "$/m² promedio", "uso": "Precio de referencia por m² de la colonia (cifra canónica entre portales).", "unidad": "$/m²"},
        {"k": "kpis.absorcion_pct", "nombre": "Absorción", "uso": "Qué % del inventario ya se vendió: ritmo de venta de la zona.", "unidad": "%"},
        {"k": "kpis.conversion_rate", "nombre": "Conversión", "uso": "Vendidas sobre el inventario activo: qué tan líquida está la colonia.", "unidad": "%"},
        {"k": "source_units_count", "nombre": "Unidades en la muestra", "uso": "Base de cálculo: a más unidades, más confiable el KPI.", "unidad": "unidades"},
    ]},
    "cub_cubo_compare": {"items": [
        {"k": "diff_pct.avg_price_per_m2", "nombre": "Brecha de $/m² entre colonias", "uso": "Qué tan dispar está el precio entre la colonia y sus vecinas.", "unidad": "%"},
        {"k": "diff_pct.units_total", "nombre": "Brecha de inventario", "uso": "Diferencia de tamaño de oferta entre zonas comparadas.", "unidad": "%"},
        {"k": "diff_pct.conversion_rate", "nombre": "Brecha de conversión", "uso": "Cuál zona convierte mejor: dónde se vende más rápido.", "unidad": "%"},
        {"k": "period", "nombre": "Periodo comparado", "uso": "Ventana temporal de la comparación."},
    ]},
    "cub_comparables": {"es_lista": True, "nombre_total": "Comparables en 2km", "uso_total": "Cuántos desarrollos comparables hay a ≤2km (competencia directa).", "items": [
        {"k": "name", "nombre": "Comparable más cercano", "uso": "El desarrollo competidor más próximo al proyecto."},
        {"k": "distance_km", "nombre": "Distancia (#1)", "uso": "Qué tan cerca está la competencia más próxima.", "unidad": "km"},
        {"k": "avg_price_per_m2", "nombre": "$/m² del comparable", "uso": "A cómo vende el m² la competencia cercana.", "unidad": "$/m²"},
        {"k": "stage", "nombre": "Etapa del comparable", "uso": "En qué fase comercial está el competidor."},
    ]},
    "cub_price_index": {"items": [
        {"k": "median_price_per_m2", "nombre": "$/m² de cierres reales", "uso": "Mediana de precio por m² en transacciones cerradas: el precio que de verdad se paga.", "unidad": "$/m²"},
        {"k": "median_discount_pct", "nombre": "Descuento típico al cierre", "uso": "Cuánto se baja del precio de lista al cerrar: poder de negociación.", "unidad": "%"},
        {"k": "transactions_count", "nombre": "Cierres en la muestra", "uso": "Cuántas transacciones sostienen el índice (más = más confiable).", "unidad": "cierres"},
        {"k": "iqr", "nombre": "Dispersión de precio (IQR)", "uso": "Qué tan disperso está el $/m²: homogeneidad de la zona.", "unidad": "$/m²"},
    ]},
    "cub_txn_stats": {"items": [
        {"k": "total_verified", "nombre": "Cierres verificados", "uso": "Tamaño del track-record transaccional (el moat de datos).", "unidad": "cierres"},
        {"k": "avg_dom", "nombre": "Días en mercado (promedio)", "uso": "Cuánto tarda en venderse: velocidad del mercado.", "unidad": "días"},
        {"k": "avg_discount_pct", "nombre": "Descuento promedio", "uso": "Qué tanto se descuenta en promedio al cerrar.", "unidad": "%"},
    ]},
    "cub_kg_health": {"items": [
        {"k": "connected", "nombre": "Grafo conectado", "uso": "Si el grafo de conocimiento (relaciones proyecto/zona/lead) está disponible."},
        {"k": "version", "nombre": "Versión del grafo", "uso": "Versión del motor Neo4j que respalda el grafo."},
        {"k": "last_ping_ms", "nombre": "Latencia del grafo", "uso": "Qué tan rápido responde el grafo (salud operativa).", "unidad": "ms"},
    ]},
    "cub_atom_units": {"es_lista": True, "nombre_total": "Unidades del átomo (colonia)", "uso_total": "Cuántas unidades granulares del átomo (dmx_units) alimentan el cubo en la colonia.", "items": [
        {"k": "tipologia", "nombre": "Tipología (1ª unidad)", "uso": "Tipo de la primera unidad del átomo (señal del mix de producto)."},
        {"k": "banda_m2", "nombre": "Banda de m²", "uso": "Rango de tamaño de la unidad (dimensión rica del cubo)."},
        {"k": "price_mxn", "nombre": "Precio (1ª unidad)", "uso": "Precio de lista de la unidad granular.", "unidad": "MXN"},
    ]},
    "cub_cross_check": {"items": [
        {"k": "criticals", "nombre": "Inconsistencias críticas", "uso": "Hallazgos críticos en los documentos del proyecto: bloquean confianza.", "unidad": "reglas"},
        {"k": "warnings", "nombre": "Advertencias documentales", "uso": "Puntos a revisar en la documentación antes de cerrar.", "unidad": "reglas"},
        {"k": "passed", "nombre": "Reglas pasadas", "uso": "Cuántas validaciones documentales pasaron limpias.", "unidad": "reglas"},
        {"k": "total_rules", "nombre": "Reglas evaluadas", "uso": "Universo de validaciones aplicadas al proyecto.", "unidad": "reglas"},
    ]},
    "cub_cross_sell": {"items": [
        {"k": "funnel.presented", "nombre": "Ofertas de cross-sell presentadas", "uso": "Cuántas ofertas de partners se mostraron: tope del embudo.", "unidad": "ofertas"},
        {"k": "conversion_rates.accepted", "nombre": "Conversión a aceptada", "uso": "Qué % de ofertas se aceptan: eficacia del cross-sell.", "unidad": "%"},
        {"k": "days", "nombre": "Ventana del embudo", "uso": "Periodo medido del embudo de cross-sell.", "unidad": "días"},
    ]},
    "cub_cerebro": {"items": [
        {"k": "predicciones.resueltas", "nombre": "Predicciones resueltas", "uso": "Cuántas predicciones del Cerebro ya se confrontaron con la realidad (track-record del modelo).", "unidad": "predicciones"},
        {"k": "predicciones.abiertas", "nombre": "Predicciones abiertas", "uso": "Cuántas predicciones esperan resolverse (aprendizaje en curso).", "unidad": "predicciones"},
        {"k": "palancas.base_pct", "nombre": "Tasa base de venta", "uso": "% de venta base contra el que se miden las palancas del Cerebro.", "unidad": "%"},
        {"k": "drift.drift", "nombre": "¿Hay deterioro (drift)?", "uso": "Si el Cerebro está fallando más que antes: señal para recalibrar."},
    ]},
    "cub_exec_overview": {"items": [
        {"k": "total_units_market", "nombre": "Unidades en el mercado (CDMX)", "uso": "Tamaño del mercado total que ve la plataforma.", "unidad": "unidades"},
        {"k": "avg_price_per_m2_cdmx", "nombre": "$/m² promedio CDMX", "uso": "Precio de referencia agregado de la ciudad.", "unidad": "$/m²"},
        {"k": "market_state_overall", "nombre": "Estado del mercado", "uso": "Lectura macro (bull/bear/stable) para orientar la jugada."},
    ]},
    "cub_external_sources": {"es_lista": True, "nombre_total": "Fuentes externas registradas", "uso_total": "Cuántas fuentes macro externas alimentan el contexto (BIS/OECD/INEGI/FRED…).", "items": [
        {"k": "source_id", "nombre": "Fuente externa (1ª)", "uso": "Identificador de una fuente macro de contexto."},
        {"k": "status", "nombre": "Estado de la fuente", "uso": "Si la fuente está fresca, vencida o nunca traída."},
    ]},
    "cub_factcheck_courses": {"items": [
        {"k": "total", "nombre": "Cursos/insights publicados", "uso": "Tamaño del catálogo educativo publicado.", "unidad": "cursos"},
    ]},
    "cub_newsletter_pulse": {"items": [
        {"k": "hero_title", "nombre": "Titular del Pulse", "uso": "Gancho del boletín semanal para el comprador."},
        {"k": "market_summary", "nombre": "Resumen de mercado", "uso": "Lectura semanal del mercado en lenguaje natural."},
        {"k": "layer", "nombre": "Origen del contenido", "uso": "Si el Pulse vino de LLM o de plantilla (transparencia)."},
    ]},
    "cub_narrative": {"items": [
        {"k": "narrative_short", "nombre": "Narrativa corta de la colonia", "uso": "Frase que resume el diferenciador de la zona (para la ficha)."},
        {"k": "confidence", "nombre": "Confianza de la narrativa", "uso": "Qué tan sólida es la narrativa (baja si fue plantilla).", "unidad": "0-1"},
        {"k": "model", "nombre": "Modelo/origen", "uso": "Qué generó la narrativa (LLM vs plantilla)."},
    ]},
    "cub_dedup": {"es_lista": True, "nombre_total": "Pares de leads duplicados", "uso_total": "Cuántos pares de leads parecen duplicados: calidad del dato del CRM.", "items": [
        {"k": "score", "nombre": "Score de duplicado (#1)", "uso": "Qué tan probable es que el par más sospechoso sea el mismo lead.", "unidad": "0-1"},
        {"k": "match_type", "nombre": "Tipo de coincidencia", "uso": "Por qué se marcó como duplicado (email/teléfono/nombre)."},
    ]},
}
