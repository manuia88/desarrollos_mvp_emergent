"""cube_catalog — el REGISTRO ÚNICO del Cubo Unificado (Hub de Mercado).

Fuente de verdad hipergranular: cada métrica / score / índice del sistema declarada UNA vez con su familia,
granularidad geo (unidad→ciudad) y temporal (día/semana/quincena/mes/actual), dimensiones de corte, motor
que la produce, lineaje (de qué dato crudo sale), si requiere k-anon al bajar a dev/licencia, formato y
dirección (mayor/menor = mejor). El Hub, las lentes, el corte cruzado, la vista átomo y la lente licenciable
se RENDERIZAN desde este contrato — cero métrica hardcodeada en la UI.

Salió de la auditoría de 6 niveles (2026-07-04, 118 entradas catalogadas). Ver [[CUBO_UNIFICADO_PLAN]].
Regla de honestidad: `estado='stub'` = el motor existe pero espera feeder → la UI la muestra "en preparación",
NUNCA inventa el número.
"""
from typing import Any, Dict, List, Optional

# ─── Vocabularios canónicos ───────────────────────────────────────────────────
FAMILIES = ["oferta", "demanda", "dinero", "riesgo", "gusto", "ia", "indice", "leads", "meta"]
FAMILY_LABEL = {
    "oferta": "Oferta", "demanda": "Demanda", "dinero": "Dinero e inversión",
    "riesgo": "Riesgo y seguridad", "gusto": "Estilo de vida", "ia": "Inteligencia",
    "indice": "Índices compuestos", "leads": "Prospectos", "meta": "Operación",
}
GEO_LEVELS = ["ciudad", "alcaldia", "colonia", "desarrollo", "unidad"]
GEO_LABEL = {"ciudad": "Ciudad", "alcaldia": "Alcaldía", "colonia": "Colonia",
             "desarrollo": "Desarrollo", "unidad": "Unidad"}
TIME_GRAINS = ["actual", "dia", "semana", "quincena", "mes"]
TIME_LABEL = {"actual": "Actual", "dia": "Diario", "semana": "Semanal",
              "quincena": "Quincenal", "mes": "Mensual"}


def E(key, label, family, question, geo, time, engine, *, dims="", lineage="",
      kanon=False, fmt="conteo", direction=None, status="vivo") -> Dict[str, Any]:
    return {
        "key": key, "label": label, "family": family, "question": question,
        "geo": geo, "time": time, "engine": engine, "dims": dims, "lineage": lineage,
        "kanon": kanon, "fmt": fmt, "direction": direction, "status": status,
    }


_ALL_GEO = ["ciudad", "alcaldia", "colonia", "desarrollo", "unidad"]
_ZONE = ["ciudad", "alcaldia", "colonia"]
_ATOM_TIME = ["actual", "dia", "semana", "quincena", "mes"]

# ─── CATÁLOGO (curado desde las 118 entradas · lo que el Hub surfacea) ────────
CATALOG: List[Dict[str, Any]] = [
    # ── OFERTA (baja hasta la unidad · lineaje unit_id · sin k-anon) ──────────
    E("units_total", "Unidades en inventario", "oferta", "¿Cuánto stock hay?", _ALL_GEO, ["actual", "7d", "30d", "90d"], "cube_olap_engine._aggregate_units", dims="tipo·rango·recámaras·m²·roof·bodega·estac", lineage="dmx_units (átomo) + developer_unit_overrides", fmt="conteo"),
    E("units_available", "Disponibles", "oferta", "¿Cuánto queda por vender?", _ALL_GEO, ["actual", "7d", "30d", "90d"], "cube_olap_engine._aggregate_units", lineage="dmx_units", fmt="conteo"),
    E("units_sold", "Vendidas", "oferta", "¿Cuánto se ha colocado?", _ALL_GEO, ["actual", "7d", "30d", "90d"], "cube_olap_engine._aggregate_units", lineage="dmx_units", fmt="conteo"),
    E("units_reserved", "Apartadas", "oferta", "¿Cuánto está en proceso?", _ALL_GEO, ["actual", "7d", "30d", "90d"], "cube_olap_engine._aggregate_units", lineage="developer_unit_overrides.status", fmt="conteo"),
    E("avg_price_mxn", "Precio promedio", "oferta", "¿A cuánto se vende aquí?", _ALL_GEO, ["actual", "7d", "30d", "90d"], "cube_olap_engine._unit_price", lineage="dmx_units.price + overrides", fmt="pesos"),
    E("avg_price_per_m2", "Precio por m²", "oferta", "¿Qué tan caro es el metro?", _ALL_GEO, ["actual", "7d", "30d", "90d"], "cube_olap_engine · units_price_m2", lineage="precio÷m² por unidad", fmt="pesos"),
    E("avg_m2", "Metros cuadrados promedio", "oferta", "¿De qué tamaño son las unidades?", _ALL_GEO, ["actual"], "cube_olap_engine._aggregate_units", fmt="numero"),
    E("absorcion_pct", "Absorción", "oferta", "¿Qué proporción ya se vendió?", _ALL_GEO, ["actual", "7d", "30d", "90d"], "cube_olap_engine._aggregate_units", fmt="pct", direction="higher"),
    E("por_cobrar_mxn", "Inventario por cobrar", "oferta", "¿Cuánto dinero queda en el aire?", _ALL_GEO, ["actual"], "cube_olap_engine._aggregate_units", fmt="pesos"),
    E("conversion_rate", "Conversión", "oferta", "¿Qué tan rápido convierte interés en venta?", _ALL_GEO, ["actual", "30d"], "cube_olap_engine._aggregate_units", fmt="pct", direction="higher"),
    E("absorcion_curva", "Curva de absorción por cohorte", "oferta", "¿A qué ritmo vende cada etapa?", _ZONE, ["actual"], "absorcion_engine", lineage="units_history por etapa", fmt="serie"),
    # ── MOLDE (Catálogo de Moldes 07-15 · baja al tipo del arquitecto) ────────
    E("colocacion_molde", "Colocación por molde", "oferta", "¿Qué TIPO de depa se vende más?", _ALL_GEO, ["actual"], "molde_metrics.colocacion", dims="molde·recámaras·m²", lineage="units.prototype_id → dmx_prototypes", fmt="pct", direction="higher"),
    E("absorcion_molde", "Absorción por molde (u/mes)", "oferta", "¿Qué tipo vuela y qué tipo se atora?", _ALL_GEO, ["dia", "semana", "mes"], "molde_metrics.absorcion", dims="molde", lineage="oferta_timeline (≥2 listas)", fmt="numero", direction="higher", status="espera_2a_lista"),
    E("premium_piso", "Premium por piso (dentro del molde)", "oferta", "¿Cuánto vale subir un piso, aislado?", _ALL_GEO, ["actual"], "molde_metrics.premium_por_piso", dims="molde·piso", lineage="mismo plano ⇒ delta = altura pura", fmt="pct"),
    # ── DEMANDA (comportamiento del comprador · k-anon ≥3 al bajar) ───────────
    E("demand_interactions", "Interacciones de demanda", "demanda", "¿Cuánta actividad genera la zona?", ["desarrollo", "colonia", "alcaldia", "ciudad"], ["dia", "semana", "quincena", "mes"], "cube_olap_engine.materialize_buyer_signals_to_cube", dims="feature·segmento", lineage="buyer_signals (ponderado _INTEREST_WEIGHTS)", kanon=True, fmt="conteo"),
    E("demand_visitors", "Visitantes únicos", "demanda", "¿Cuánta gente distinta la mira?", ["desarrollo", "colonia", "alcaldia", "ciudad"], ["dia", "semana", "quincena", "mes"], "cube_olap_engine · distinct visitor_id", lineage="buyer_signals", kanon=True, fmt="conteo"),
    E("interest_score", "Nivel de interés", "demanda", "¿Qué tan caliente está?", ["desarrollo", "colonia"], ["dia", "semana", "quincena", "mes"], "cube_olap_engine._INTEREST_WEIGHTS", lineage="save 3.0·like 2.0·compare 1.5·view 0.6·dismiss −2.0", kanon=True, fmt="score", direction="higher"),
    E("unmet", "Demanda insatisfecha", "demanda", "¿Qué buscan y NO encuentran? (dónde construir)", ["desarrollo", "colonia", "alcaldia", "ciudad"], ["dia", "semana", "mes"], "demand_intelligence + marketplace_searches", lineage="búsquedas sin match + asesor_anon (bridge)", kanon=True, fmt="conteo"),
    E("features_pedidos", "Atributos más buscados", "demanda", "¿Qué amenidad mueve la aguja?", ["colonia", "alcaldia"], ["dia", "mes"], "demand_intelligence", lineage="marketplace_searches.amenidades_pedidas", kanon=True, fmt="ranking"),
    E("services_demand", "Índice de demanda real (30d)", "demanda", "¿Cuánta búsqueda real tiene la zona?", ["colonia"], ["mes"], "services_demand_engine", lineage="marketplace_searches rolling 30d", kanon=True, fmt="conteo"),
    E("grafo_comprador", "Grafo del comprador", "demanda", "¿Qué segmentos buscan qué?", ["colonia"], ["actual"], "grafo_comprador_engine", lineage="buyer_signals × segmento × feature (k-anon)", kanon=True, fmt="matriz"),
    E("reverse_search", "Búsqueda reversa (parser IA)", "demanda", "¿A qué desarrollo mapea lo que la gente escribe?", ["desarrollo"], ["actual"], "reverse_search_engine", fmt="ranking"),
    E("trends_google", "Google Trends de la zona", "demanda", "¿La zona está subiendo en búsquedas?", _ZONE, ["dia", "semana", "mes"], "trends connector", lineage="Google Trends", fmt="serie"),
    # ── DINERO E INVERSIÓN ────────────────────────────────────────────────────
    E("cap_rate_ajustado_riesgo", "Cap rate ajustado a riesgo", "dinero", "¿Rinde bien descontando el riesgo?", _ZONE, ["actual"], "composites/inversor n30", dims="tipo·rango", lineage="renta÷precio × riesgo Atlas/FGJ", fmt="pct", direction="higher"),
    E("spread_vs_cetes", "Spread vs CETES", "dinero", "¿Gana más que la tasa libre de riesgo?", _ZONE, ["actual"], "composites/inversor n24", lineage="yield − CETES (Banxico vivo)", fmt="pp", direction="higher"),
    E("plusvalia_x_demanda", "Plusvalía × demanda", "dinero", "¿Sube de precio y hay quién compre?", _ZONE, ["mes"], "composites/inversor n28", lineage="forecast 12m × demanda de zona", fmt="pct", direction="higher"),
    E("liquidez_entrada_salida", "Liquidez (entrada-salida)", "dinero", "¿Qué tan fácil es vender después?", _ZONE, ["actual"], "composites/inversor n29", lineage="tiempo de venta + profundidad de mercado", fmt="score", direction="higher"),
    E("sharpe_colonia", "Sharpe de la colonia", "dinero", "¿Retorno vs volatilidad de la zona?", _ZONE, ["actual"], "composites/inversor n23", lineage="retorno÷desviación (serie DRPI)", fmt="score", direction="higher"),
    E("yield_renta_corta_vs_larga", "Yield renta corta vs larga", "dinero", "¿Conviene Airbnb o renta tradicional?", _ZONE, ["actual"], "composites/inversor n26", lineage="AirROI vs renta larga", fmt="pp"),
    E("cap_rate_pct", "Cap rate", "dinero", "¿Rendimiento base del inmueble?", ["desarrollo", "colonia", "alcaldia"], ["actual"], "inversion_v4 + metrics_cube", fmt="pct", direction="higher"),
    E("yield_bruto", "Yield bruto", "dinero", "¿Renta anual sobre precio (bruto)?", ["desarrollo", "colonia", "alcaldia"], ["actual"], "inversion_v4", fmt="pct", direction="higher"),
    E("yield_neto", "Yield neto", "dinero", "¿Renta anual neta de gastos?", ["desarrollo", "colonia", "alcaldia"], ["actual"], "inversion_v4", fmt="pct", direction="higher"),
    E("noi", "Ingreso operativo neto", "dinero", "¿Cuánto deja después de gastos?", ["desarrollo", "colonia"], ["actual"], "inversion_v4", fmt="pesos"),
    E("market_estimate", "Estimación de precio de venta", "dinero", "¿A cuánto DEBERÍA venderse?", ["colonia"], ["actual"], "market_estimate_engine", lineage="AVM low/mid/high", fmt="pesos"),
    E("avm_predios", "AVM por predio catastral", "dinero", "¿Cuánto vale este predio exacto?", ["unidad"], ["actual"], "avm_predios_engine", lineage="SIGCDMX 1.08M predios", fmt="pesos"),
    E("drpi", "DRPI · índice de precios DMX", "indice", "¿Cómo se mueve el precio de la zona en el tiempo?", ["colonia"], ["mes"], "drpi_engine", lineage="transacciones de cierre anonimizadas", fmt="indice", direction="higher"),
    E("indice_str_composite", "Índice STR (Airbnb)", "dinero", "¿Qué tan buena es la zona para renta corta?", _ZONE, ["actual"], "composites STR pack12", lineage="ocupación·ADR·RevPAR·saturación", fmt="score", direction="higher"),
    E("indice_recortes_precio", "Índice de recortes de precio", "dinero", "¿Los desarrollos están bajando precios? (señal de sobreoferta)", ["colonia"], ["actual"], "composites n121", lineage="price_events de developer_unit_overrides", fmt="objeto"),
    # ── RIESGO Y SEGURIDAD (índices IE · colonia) ─────────────────────────────
    E("IE_COL_SEGURIDAD", "Seguridad", "riesgo", "¿Qué tan segura es la colonia?", ["colonia"], ["actual"], "ie_col_seguridad", lineage="FGJ CDMX carpetas de investigación (2.1M)", fmt="score", direction="lower"),
    E("IE_COL_N04_CRIME_TRAJECTORY", "Trayectoria del delito", "riesgo", "¿La seguridad mejora o empeora?", ["colonia"], ["mes"], "ie_col_geo_moat.N04", lineage="FGJ ratio año-reciente/base", fmt="score", direction="higher"),
    E("IE_COL_N05_INFRASTRUCTURE_RESILIENCE", "Resiliencia sismo/inundación", "riesgo", "¿Aguanta un desastre natural?", ["colonia"], ["actual"], "ie_col_geo_moat.N05", lineage="Atlas Riesgos CDMX", fmt="score", direction="higher"),
    E("IE_COL_N07_WATER_SECURITY", "Seguridad hídrica", "riesgo", "¿Hay agua confiable?", ["colonia"], ["actual"], "ie_col_geo_moat.N07", lineage="SACMEX cortes/fugas (313k)", fmt="score", direction="higher"),
    E("IE_COL_AGUA_CONFIABILIDAD", "Confiabilidad del agua", "riesgo", "¿Qué tan seguido cortan el agua?", ["colonia"], ["actual"], "ie_col_seguridad", lineage="SACMEX CKAN", fmt="score", direction="higher"),
    E("IE_COL_AIRE", "Calidad del aire", "riesgo", "¿Qué tan limpio es el aire?", ["colonia"], ["actual"], "ie_col_aire", lineage="NOAA + CONAGUA", fmt="score", direction="higher"),
    E("IE_COL_CLIMA_ISLA_CALOR", "Isla de calor", "riesgo", "¿Qué tanto calor concentra?", ["colonia"], ["actual"], "ie_col_clima", lineage="NOAA TMAX + humedad", fmt="score", direction="lower"),
    E("IE_COL_CLIMA_INUNDACION", "Riesgo de inundación", "riesgo", "¿Se inunda?", ["colonia"], ["actual"], "ie_col_clima (DataPending)", lineage="CENAPRED WFS + Atlas CDMX", fmt="score", direction="lower", status="stub"),
    E("IE_COL_CLIMA_SISMO", "Riesgo sísmico", "riesgo", "¿En qué microzona sísmica está?", ["colonia"], ["actual"], "ie_col_clima (DataPending)", lineage="Atlas microzonas geotécnicas", fmt="score", direction="lower", status="stub"),
    E("IE_COL_LOCATEL", "Reportes ciudadanos 311", "riesgo", "¿Cuántos problemas urbanos reportan?", ["colonia"], ["actual"], "ie_col_seguridad", lineage="Locatel 0311 CKAN", fmt="score", direction="lower"),
    E("IE_COL_TRUST_VECINDARIO", "Confianza del vecindario", "riesgo", "¿Es un vecindario en el que confías?", ["colonia"], ["actual"], "ie_col_economia", lineage="Locatel + FGJ (inverso)", fmt="score", direction="higher"),
    E("risk_score", "Score de riesgo compuesto", "riesgo", "¿Riesgo total de la zona en un número?", ["colonia"], ["actual"], "risk_score_engine", lineage="sismo+inundación+crimen+agua", fmt="score", direction="lower"),
    # ── ESTILO DE VIDA / GUSTO ────────────────────────────────────────────────
    E("IE_COL_N08_WALKABILITY_MX", "Caminabilidad", "gusto", "¿Se resuelve la vida a pie?", ["colonia"], ["actual"], "ie_col_geo_moat.N08", lineage="OSM POIs por radio", fmt="score", direction="higher"),
    E("IE_COL_N06_SCHOOL_PREMIUM", "Prima escolar", "gusto", "¿Hay buenas escuelas cerca?", ["colonia"], ["actual"], "ie_col_geo_moat.N06", lineage="proximidad a escuelas", fmt="score", direction="higher"),
    E("IE_COL_CULTURAL_PARQUES", "Áreas verdes", "gusto", "¿Hay parques y verde?", ["colonia"], ["actual"], "ie_col_cultural", lineage="OSM parques/áreas verdes", fmt="score", direction="higher"),
    E("IE_COL_N09_NIGHTLIFE_ECONOMY", "Economía nocturna", "gusto", "¿Hay vida nocturna y comercio?", ["colonia"], ["actual"], "ie_col_geo_moat.N09", lineage="OSM/DENUE bares·restaurantes", fmt="score", direction="higher"),
    E("IE_COL_N10_SENIOR_LIVABILITY", "Habitabilidad adulto mayor", "gusto", "¿Es cómoda para gente mayor?", ["colonia"], ["actual"], "ie_col_geo_moat.N10", fmt="score", direction="higher"),
    E("IE_COL_DEMOGRAFIA_INGRESO", "Ingreso del hogar", "gusto", "¿Qué nivel socioeconómico tiene?", ["colonia"], ["actual"], "ie_col_demografia", lineage="INEGI ENIGH/Censo", fmt="score", direction="higher"),
    E("IE_COL_DEMOGRAFIA_FAMILIA", "Concentración de familias", "gusto", "¿Es zona de familias con niños?", ["colonia"], ["actual"], "ie_col_demografia", lineage="INEGI hogares con niños", fmt="score", direction="higher"),
    E("gusto_visual", "Gusto visual del mercado", "gusto", "¿Qué estética prefiere la gente aquí?", _ZONE, ["actual"], "amenidades_engine + taste_scores", lineage="swipes/likes de fotos (k-anon)", kanon=True, fmt="ranking"),
    E("amenidades_ranker", "Ranker de amenidades (hedónico)", "gusto", "¿Cuánto suma cada atributo al precio?", ["colonia"], ["actual"], "amenidades_engine (hedónico)", lineage="regresión precio ~ atributos", kanon=True, fmt="ranking"),
    # ── INTELIGENCIA / IA ─────────────────────────────────────────────────────
    E("avm_explain", "Por qué vale esto (AVM)", "ia", "¿De dónde sale el valor estimado?", ["colonia", "unidad"], ["actual"], "avm_explain_engine", lineage="contribuciones del modelo hedónico", fmt="objeto"),
    E("buyer_score", "Score del comprador", "ia", "¿Qué tan probable es que ESTE lead cierre?", ["unidad"], ["actual"], "buyer_score_engine", lineage="conducta + perfil (k-anon)", kanon=True, fmt="score", direction="higher"),
    E("comparable_anomaly", "Alertas de competencia", "meta", "¿Un competidor bajó precio / entró inventario?", ["desarrollo"], ["actual"], "comparable_anomaly_engine", lineage="comparables por radio + price_events", fmt="alertas"),
    E("demand_twin", "Gemelo de demanda", "demanda", "¿Cuánta oportunidad hay si construyo X aquí?", ["colonia"], ["actual"], "demand_twin_engine", lineage="simulación demanda vs oferta", kanon=True, fmt="score", direction="higher"),
    E("plusvalia_proyectada", "Plusvalía proyectada 5 años", "ia", "¿Cuánto subirá de precio?", ["colonia"], ["actual"], "forecast_engine (ARIMA W5.3)", lineage="serie DRPI + forecast", fmt="pct", direction="higher", status="stub"),
    E("cerebro_mercado", "Cerebro del mercado", "ia", "¿Qué aprendió el modelo de los cierres reales?", ["colonia"], ["actual"], "cerebro_mercado_engine", lineage="cierres reales (loop self-improving)", fmt="objeto", status="stub"),
    E("hedonic_regression", "Modelo hedónico", "ia", "¿Cuánto pesa cada variable en el precio?", ["colonia"], ["actual"], "hedonic_regression_engine", fmt="objeto"),
    # ── ÍNDICES COMPUESTOS DE ZONA ────────────────────────────────────────────
    E("zone_score", "Zone Score (6 dimensiones)", "indice", "¿Qué tan buena es la zona en total?", ["colonia"], ["actual"], "zone_score_engine", lineage="6 subscores ponderados", fmt="score", direction="higher"),
    E("dmx_indices", "5 índices DMX (IPV/IAB/IDS/IRS/IL)", "indice", "¿Cómo puntúa la zona en plusvalía/absorción/demanda/riesgo/liquidez?", ["colonia"], ["actual"], "dmx_indices_engine", fmt="objeto"),
    E("perfil_zona", "Perfil de zona unificado", "indice", "¿Radiografía completa de la colonia?", ["colonia"], ["actual"], "perfil_zona_engine", fmt="objeto"),
    E("live_pulse", "Pulso en vivo", "indice", "¿Qué zonas están calientes AHORA?", ["colonia"], ["dia"], "live_pulse_engine", lineage="5 señales (trend/velocity/views/leads/precio)", kanon=True, fmt="score", direction="higher"),
    # ── PROSPECTOS ────────────────────────────────────────────────────────────
    E("leads_count", "Prospectos", "leads", "¿Cuántos interesados hay?", ["desarrollo", "colonia"], ["mes"], "metrics_cube_aggregations.leads_per_dev", lineage="db.leads", fmt="conteo"),
    E("leads_won", "Prospectos ganados", "leads", "¿Cuántos cerraron?", ["desarrollo"], ["mes"], "metrics_cube_aggregations", lineage="leads.status=cerrado_ganado", fmt="conteo"),
]


# ─── API del registro ─────────────────────────────────────────────────────────
def by_family() -> Dict[str, List[Dict[str, Any]]]:
    out: Dict[str, List[Dict[str, Any]]] = {f: [] for f in FAMILIES}
    for e in CATALOG:
        out.setdefault(e["family"], []).append(e)
    return {f: v for f, v in out.items() if v}


def for_geo(level: str) -> List[Dict[str, Any]]:
    """Métricas que existen a ese nivel geográfico (para saber qué mostrar al hacer drill)."""
    return [e for e in CATALOG if level in e["geo"]]


def get(key: str) -> Optional[Dict[str, Any]]:
    return next((e for e in CATALOG if e["key"] == key), None)


def serialize() -> Dict[str, Any]:
    """Contrato que consume el front del Hub: catálogo + vocabularios (para renderizar lentes/cortes)."""
    return {
        "families": [{"key": f, "label": FAMILY_LABEL[f]} for f in FAMILIES if any(e["family"] == f for e in CATALOG)],
        "geo_levels": [{"key": g, "label": GEO_LABEL[g]} for g in GEO_LEVELS],
        "time_grains": [{"key": t, "label": TIME_LABEL.get(t, t)} for t in TIME_GRAINS],
        "metrics": CATALOG,
        "counts": {"total": len(CATALOG), "vivos": sum(1 for e in CATALOG if e["status"] == "vivo"),
                   "stub": sum(1 for e in CATALOG if e["status"] == "stub")},
    }
