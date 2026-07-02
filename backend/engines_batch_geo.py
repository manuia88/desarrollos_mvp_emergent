"""ENGINES BATCH · GEO / RIESGO (tanda 5) — registra los motores de geografía, seguridad,
riesgo, ciclo y migración climática en el hub del cubo (engines_hub). Cada motor se vuelve
CONSULTABLE por el patrón único del hub y se presenta como Indicadores hiper-segmentados
(nombre humano · uso '¿para qué?' · unidad), nunca como JSON crudo.

Contrato (lo que engines_hub.py + engine_present.py mergean):
  · REGISTRO     → lista de descriptores de motor con su runner async (db, ctx) → salida.
  · DESCRIPTORES → por motor, qué campos de la salida importan (dot-path + nombre + uso + unidad).

Reglas seguidas:
  · Runners DB-only / cómputo en memoria. NO se llama a APIs externas (red lenta) — los motores
    cuyo único entrypoint hace fetch HTTP (sig_catastro WFS) se SALTAN (anotado abajo).
  · Cada runner es defensivo: un motor sin dato devuelve salida honesta-latente, no revienta.
  · IDs y runners con prefijo 'geo_' para no colisionar con el registro base del hub.

Saltados (y por qué):
  · sig_catastro_engine — sus 2 entrypoints (fetch_vsuelo_zone/sync_vsuelo_for_city) hacen fetch
    al WFS de la SIG CDMX por HTTP. Ya está cubierto en el hub vía catastro_sig_engine (id
    'catastro', DB-only). No se duplica con una llamada de red.
"""
from typing import Any, Dict, List, Optional



# ─── helpers de contexto (centroide / colonia dict desde el seed) ─────────────
def _centroide_de(colonia_id: str):
    """(lat, lng) promedio de los desarrollos de la colonia (center=[lng,lat])."""
    from data_developments import DEVELOPMENTS
    pts = [d.get("center") for d in DEVELOPMENTS if d.get("colonia_id") == colonia_id and d.get("center")]
    if not pts:
        return None
    return (sum(p[1] for p in pts) / len(pts), sum(p[0] for p in pts) / len(pts))


def _colonia_dict(colonia_id: str) -> Optional[Dict[str, Any]]:
    """Dict de colonia para motores SYNC (zone_cycle). Prefiere el seed; cae a DEVELOPMENTS."""
    try:
        from data_seed import COLONIAS_BY_ID
        c = COLONIAS_BY_ID.get(colonia_id)
        if c:
            return c
    except Exception:
        pass
    from data_developments import DEVELOPMENTS
    devs = [d for d in DEVELOPMENTS if d.get("colonia_id") == colonia_id]
    if not devs:
        return None
    return {"name": devs[0].get("colonia") or colonia_id, "tier": devs[0].get("tier") or "Mid",
            "city": "CDMX", "scores": {}, "momentum": "0%", "trend": []}


# ─── runners (1 por motor) ────────────────────────────────────────────────────
async def _r_geo_crime_sesnsp(db, ctx):
    """SESNSP por alcaldía (incidencia oficial · per 100k). DB-only; honesto si no hay dato."""
    import crime_data_engine as e
    return await e.aggregate_crime_zone(db, ctx.get("colonia_id"), period_months=6)


async def _r_geo_crime_fgj(db, ctx):
    """Seguridad real por colonia (FGJ · densidad por área + gravedad). Lee la colección que el
    motor escribe (crime_zone_colonia); NO golpea el API de datos.cdmx (eso lo hace el cron)."""
    cid = ctx.get("colonia_id")
    doc = await db.crime_zone_colonia.find_one({"zone_id": cid}, {"_id": 0})
    if not doc:
        return {"available": False, "zone_id": cid, "reason": "sin_sync_fgj"}
    by = doc.get("by_category") or {}
    return {"available": True, "zone_id": cid,
            "safety_score": doc.get("safety_score"),
            "incidentes_ponderados": doc.get("incidentes_ponderados"),
            "top_categoria": (max(by.items(), key=lambda kv: kv[1])[0] if by else None),
            "by_category": by, "radius_m": doc.get("radius_m"), "source": doc.get("source")}


async def _r_geo_climate_migration(db, ctx):
    """Migración climática por colonia: salida (outflow) vs entrada (inflow) y neto, desde señales
    de clima/comportamiento/demografía (DB-only · compute en memoria)."""
    import climate_migration_engine as e
    cid = ctx.get("colonia_id")
    climate = await e.aggregate_climate_signals_per_zone(db, cid, days=90)
    behavioral = await e.aggregate_behavioral_trends_per_zone(db, cid, days=90)
    demographic = await e.aggregate_demographic_signals(db, cid)
    outflow = e.compute_outflow_score(climate, behavioral, demographic)
    inflow = e.compute_inflow_score(climate, behavioral, demographic)
    return {"zone_id": cid, "outflow_score": outflow, "inflow_score": inflow,
            "net_score": int(inflow - outflow),
            "tendencia": ("entra gente" if inflow > outflow else "sale gente" if outflow > inflow else "estable"),
            "top_drivers": climate.get("top_drivers") or [],
            "data_completeness_pct": climate.get("data_completeness_pct", 0),
            "flood_risk": climate.get("flood_risk"), "air_quality_index": climate.get("air_quality_index")}


async def _r_geo_zone_cycle(db, ctx):
    """Ciclo de mercado + gentrificación + renta de la colonia (SYNC · usa dict del seed)."""
    import zone_cycle_engine as e
    col = _colonia_dict(ctx.get("colonia_id"))
    if not col:
        return {"error": "sin datos de colonia para el ciclo"}
    z = e.compute_zone_cycle(col)
    try:
        z["recomendacion"] = e.zone_recommendation(z)
    except Exception:
        pass
    return z


async def _r_geo_maps_devs(db, ctx):
    """Capa del mapa 'desarrollos' (GeoJSON DB-only) — proyectos de la colonia vs ciudad."""
    import maps_engine as e
    from data_developments import DEVELOPMENTS
    cid = ctx.get("colonia_id")
    geo = await e.MapsEngine(db).get_layer_data("devs")
    feats = (geo or {}).get("features") or []
    en_col = [d for d in DEVELOPMENTS if d.get("colonia_id") == cid]
    return {"proyectos_colonia": len(en_col), "proyectos_ciudad": len(feats), "layer": "devs", "colonia": cid,
            "primer_proyecto": (en_col[0].get("name") if en_col else None),
            "tipo": geo.get("type") if isinstance(geo, dict) else None}


async def _r_geo_score_ie(db, ctx):
    """Scores IE oficiales de la colonia (recetas score_engine · DB-only). Lista de ScoreResult."""
    import score_engine as e
    cid = ctx.get("colonia_id")
    results = await e.ScoreEngine(db).compute_many(cid, [])
    out: List[Dict[str, Any]] = []
    for r in results:
        out.append({"code": r.code, "value": r.value, "tier": r.tier,
                    "confidence": r.confidence, "is_stub": r.is_stub})
    # titular informativo: no-stub primero, los saturados a 100 (no diferencian) al final, luego por valor desc
    out.sort(key=lambda d: (d["is_stub"], (d["value"] or 0) >= 100, -(d["value"] or 0)))
    return out


async def _r_geo_gov_data(db, ctx):
    """Estado de los conectores de datos gubernamentales (Banxico/SE/CONAVI/SESNSP/CENAPRED).
    Resumen read-only del caché (NO dispara fetch)."""
    import gov_data_mx_engine as e
    return await e.get_stats(db)


async def _r_geo_state_cdmx(db, ctx):
    """'State of CDMX' — tablero global (top colonias ROI, gap demanda-oferta, predicciones)."""
    import state_of_cdmx_engine as e
    return await e.get_or_compute(db)


async def _r_geo_zone_subscores(db, ctx):
    """6+1 sub-scores oficiales de la colonia (lifestyle/seguridad/transporte/amenidades/precio/
    vibe/educación), cada uno con su fuente. DB-only, fail-soft a stub."""
    import zone_subscores_compute as e
    return await e.compute_all_subscores(db, ctx.get("colonia_id"))


async def _r_geo_risk_score(db, ctx):
    """Risk Score compuesto de la zona (crimen+natural+título+percepción) con letra A-F. DB-only."""
    import risk_score_engine as e
    return await e.get_risk_score_or_compute(db, ctx.get("colonia_id"))


async def _r_geo_comparable_anomaly(db, ctx):
    """Anomalías de comparables en la misma colonia (baja de precio / sold-out / nuevo lanzamiento)
    para el desarrollo de contexto. DB-only (DEVELOPMENTS + comparable_alerts). Lista."""
    import comparable_anomaly_engine as e
    dev_id = ctx.get("dev_id")
    if not dev_id:
        return []
    alerts = await e.detect_anomalies_for_dev(db, dev_id)
    return [a.to_dict() for a in alerts]


# ─── REGISTRO (tanda 5 · GEO/RIESGO) ─────────────────────────────────────────
REGISTRO: List[Dict[str, Any]] = [
    {"id": "geo_crime_sesnsp", "nombre": "Crimen oficial (SESNSP · alcaldía)", "eje": "RIESGO", "tanda": 5,
     "produce": "incidencia delictiva oficial por alcaldía (per 100k hab)", "input": ["colonia_id"],
     "fn": _r_geo_crime_sesnsp, "fuente": "crime_data_engine"},
    {"id": "geo_crime_fgj", "nombre": "Seguridad real por colonia (FGJ)", "eje": "RIESGO", "tanda": 5,
     "produce": "seguridad fina por colonia (densidad de delito ponderada por gravedad)", "input": ["colonia_id"],
     "fn": _r_geo_crime_fgj, "fuente": "crime_fgj_engine"},
    {"id": "geo_climate_migration", "nombre": "Migración climática (entra/sale gente)", "eje": "SEÑALES", "tanda": 5,
     "produce": "balance de migración por clima/comportamiento (inflow vs outflow)", "input": ["colonia_id"],
     "fn": _r_geo_climate_migration, "fuente": "climate_migration_engine"},
    {"id": "geo_zone_cycle", "nombre": "Ciclo de mercado + gentrificación + renta", "eje": "CUÁNDO", "tanda": 5,
     "produce": "en qué fase del ciclo está la zona y qué conviene hacer", "input": ["colonia_id"],
     "fn": _r_geo_zone_cycle, "fuente": "zone_cycle_engine"},
    {"id": "geo_maps_devs", "nombre": "Capa de mapa — desarrollos", "eje": "DÓNDE", "tanda": 5,
     "produce": "qué proyectos hay en el mapa y dónde (capa GeoJSON)", "input": [],
     "fn": _r_geo_maps_devs, "fuente": "maps_engine"},
    {"id": "geo_score_ie", "nombre": "Scores IE oficiales de la colonia", "eje": "DÓNDE", "tanda": 5,
     "produce": "los indicadores IE calculados por receta para la colonia", "input": ["colonia_id"],
     "fn": _r_geo_score_ie, "fuente": "score_engine"},
    {"id": "geo_gov_data", "nombre": "Conectores de datos de gobierno (estado)", "eje": "SEÑALES", "tanda": 5,
     "produce": "qué fuentes oficiales están frescas/caídas (Banxico/SE/CONAVI/SESNSP/CENAPRED)", "input": [],
     "fn": _r_geo_gov_data, "fuente": "gov_data_mx_engine"},
    {"id": "geo_state_cdmx", "nombre": "State of CDMX (tablero global)", "eje": "SEÑALES", "tanda": 5,
     "produce": "top colonias por ROI, gap demanda-oferta y predicciones del periodo", "input": [],
     "fn": _r_geo_state_cdmx, "fuente": "state_of_cdmx_engine"},
    {"id": "geo_zone_subscores", "nombre": "Sub-scores de zona (7 dimensiones)", "eje": "DÓNDE", "tanda": 5,
     "produce": "lifestyle/seguridad/transporte/amenidades/precio/vibe/educación de la colonia", "input": ["colonia_id"],
     "fn": _r_geo_zone_subscores, "fuente": "zone_subscores_compute"},
    {"id": "geo_risk_score", "nombre": "Risk Score compuesto (A-F)", "eje": "RIESGO", "tanda": 5,
     "produce": "riesgo compuesto de la zona (crimen+natural+título+percepción) con calificación A-F", "input": ["colonia_id"],
     "fn": _r_geo_risk_score, "fuente": "risk_score_engine"},
    {"id": "geo_comparable_anomaly", "nombre": "Anomalías de comparables (alertas)", "eje": "SEÑALES", "tanda": 5,
     "produce": "alertas de comparables en la colonia (baja de precio / sold-out / nuevo lanzamiento)", "input": ["dev_id"],
     "fn": _r_geo_comparable_anomaly, "fuente": "comparable_anomaly_engine"},
]


# ─── DESCRIPTORES (qué campos importan · nombre humano + uso + unidad) ────────
DESCRIPTORES: Dict[str, Dict[str, Any]] = {
    "geo_crime_sesnsp": {"items": [
        {"k": "available", "nombre": "¿Hay dato SESNSP?", "uso": "Transparencia: si la incidencia oficial de la alcaldía está cargada.", "siempre": True},
        {"k": "incidents_per_100k", "nombre": "Incidencia por 100k hab", "uso": "Tasa de delito normalizada por población — comparable entre alcaldías.", "unidad": "/100k"},
        {"k": "total_incidents", "nombre": "Incidentes (6 meses)", "uso": "Volumen bruto de delito en el periodo.", "unidad": "incidentes"},
        {"k": "alcaldia", "nombre": "Alcaldía del índice", "uso": "Zona de gobierno a la que pertenece la colonia."},
    ]},
    "geo_crime_fgj": {"items": [
        {"k": "safety_score", "nombre": "Score de seguridad (colonia)", "uso": "Qué tan segura es la colonia vs el resto de la ciudad (percentil, 100=la más segura).", "unidad": "0-100"},
        {"k": "incidentes_ponderados", "nombre": "Delito ponderado por gravedad", "uso": "Suma de incidentes pesando lo violento alto y el bajo impacto bajo.", "unidad": "índice"},
        {"k": "top_categoria", "nombre": "Delito más frecuente", "uso": "Qué tipo de incidente domina en el radio de la colonia."},
        {"k": "radius_m", "nombre": "Radio de medición", "uso": "Área fija comparable usada para todas las colonias.", "unidad": "m"},
    ]},
    "geo_climate_migration": {"items": [
        {"k": "tendencia", "nombre": "Tendencia migratoria", "uso": "Si la zona gana o pierde gente por clima/comportamiento — anticipa demanda."},
        {"k": "inflow_score", "nombre": "Entrada de gente (inflow)", "uso": "Qué tanto la zona atrae población (refugio climático + tendencia positiva).", "unidad": "0-100"},
        {"k": "outflow_score", "nombre": "Salida de gente (outflow)", "uso": "Qué tanto la zona expulsa población (riesgo climático + tendencia negativa).", "unidad": "0-100"},
        {"k": "net_score", "nombre": "Neto migratorio", "uso": "Balance entrada menos salida — señal direccional de demanda futura.", "unidad": "±"},
        {"k": "data_completeness_pct", "nombre": "Completitud del dato", "uso": "Transparencia: cuántas fuentes climáticas respondieron.", "unidad": "%"},
    ]},
    "geo_zone_cycle": {"items": [
        {"k": "ciclo.label", "nombre": "Fase del ciclo", "uso": "Dónde está la zona (recuperación/expansión/maduro/contracción) — define la jugada."},
        {"k": "ciclo.lectura", "nombre": "Lectura del ciclo", "uso": "Qué significa la fase en lenguaje simple."},
        {"k": "ciclo.momentum_pct", "nombre": "Momentum", "uso": "Velocidad de cambio de precio de la zona.", "unidad": "%"},
        {"k": "gentrificacion.etiqueta", "nombre": "Gentrificación", "uso": "Qué tan rápido se revaloriza vs el resto de la ciudad."},
        {"k": "renta.mejor", "nombre": "Mejor renta (larga/corta)", "uso": "Si la zona rinde más en renta tradicional o Airbnb."},
        {"k": "recomendacion", "nombre": "Jugada recomendada", "uso": "Qué hacer dada la fase, gentrificación y renta."},
    ]},
    "geo_maps_devs": {"items": [
        {"k": "proyectos_colonia", "nombre": "Proyectos en la colonia", "uso": "Cuántos desarrollos hay en esta colonia (competencia directa).", "unidad": "proyectos", "siempre": True},
        {"k": "proyectos_ciudad", "nombre": "Proyectos en el mapa (ciudad)", "uso": "Total geolocalizado en la capa de toda la ciudad.", "unidad": "proyectos"},
        {"k": "primer_proyecto", "nombre": "Proyecto de referencia", "uso": "Un desarrollo de la colonia."},
    ]},
    "geo_score_ie": {"es_lista": True, "nombre_total": "Indicadores IE calculados", "uso_total": "Cuántos indicadores IE oficiales tiene la colonia.", "items": [
        {"k": "code", "nombre": "Indicador IE principal", "uso": "El indicador IE con mayor valor no-stub de la colonia."},
        {"k": "value", "nombre": "Valor del indicador (#1)", "uso": "Qué tan alto sale el indicador líder.", "unidad": "0-100"},
        {"k": "tier", "nombre": "Semáforo del indicador", "uso": "Verde/ámbar/rojo del indicador líder."},
        {"k": "confidence", "nombre": "Confianza", "uso": "Qué tan sólido es el cálculo (high/med/low)."},
    ]},
    "geo_gov_data": {"items": [
        {"k": "track_a.total", "nombre": "Fuentes de gobierno", "uso": "Cuántas fuentes oficiales hay conectadas.", "unidad": "fuentes"},
        {"k": "track_a.counts.ok", "nombre": "Fuentes frescas (OK)", "uso": "Cuántas fuentes están al día — confianza del dato oficial.", "unidad": "fuentes"},
        {"k": "track_a.counts.stale", "nombre": "Fuentes vencidas", "uso": "Cuántas fuentes quedaron viejas (a refrescar).", "unidad": "fuentes"},
        {"k": "track_a.counts.missing", "nombre": "Fuentes sin conectar", "uso": "Cuántas fuentes oficiales aún no se han traído nunca.", "unidad": "fuentes"},
        {"k": "track_b_raw_total", "nombre": "Registros crudos guardados", "uso": "Volumen de dato gubernamental ingerido.", "unidad": "registros"},
    ]},
    "geo_state_cdmx": {"items": [
        {"k": "period", "nombre": "Periodo del tablero", "uso": "Trimestre del 'State of CDMX'."},
        {"k": "predictions_2026.q_next_avg_appreciation", "nombre": "Plusvalía esperada (próx.)", "uso": "Apreciación promedio direccional de las zonas top.", "unidad": "%"},
        {"k": "predictions_2026.es_estimado", "nombre": "¿Predicción estimada?", "uso": "Transparencia: si el escenario es derivado (no medido)."},
        {"k": "velocity_by_category.premium", "nombre": "Velocidad de venta premium", "uso": "Meses para vender en el segmento premium.", "unidad": "meses"},
    ]},
    "geo_zone_subscores": {"items": [
        {"k": "seguridad.value", "nombre": "Seguridad (sub-score)", "uso": "Qué tan segura se mide la colonia (0-100).", "unidad": "0-100"},
        {"k": "transporte.value", "nombre": "Transporte (sub-score)", "uso": "Conectividad de movilidad de la colonia.", "unidad": "0-100"},
        {"k": "amenidades.value", "nombre": "Amenidades (sub-score)", "uso": "Densidad de servicios/comercio de la colonia.", "unidad": "0-100"},
        {"k": "precio.value", "nombre": "Nivel de precio (sub-score)", "uso": "Posición de valor de la zona (mayor = zona más cara).", "unidad": "0-100"},
        {"k": "lifestyle.value", "nombre": "Lifestyle (sub-score)", "uso": "Vida de barrio (restaurantes/ocio).", "unidad": "0-100"},
        {"k": "educacion.value", "nombre": "Educación (sub-score)", "uso": "Oferta educativa cercana.", "unidad": "0-100"},
    ]},
    "geo_risk_score": {"items": [
        {"k": "score_letter", "nombre": "Calificación de riesgo (A-F)", "uso": "Letra resumen del riesgo de la zona — lo que un comité exige."},
        {"k": "score_numeric", "nombre": "Score de riesgo", "uso": "Riesgo compuesto numérico (mayor = más seguro).", "unidad": "0-100"},
        {"k": "components.natural_score", "nombre": "Componente natural", "uso": "Sub-score de riesgo físico (sísmico/inundación/hundimiento).", "unidad": "0-100"},
        {"k": "components.crime_score", "nombre": "Componente crimen", "uso": "Sub-score de seguridad dentro del riesgo.", "unidad": "0-100"},
        {"k": "sources_active", "nombre": "Fuentes activas del riesgo", "uso": "Transparencia: qué capas alimentaron la calificación."},
    ]},
    "geo_comparable_anomaly": {"es_lista": True, "nombre_total": "Alertas de comparables", "uso_total": "Cuántas señales de movimiento hay entre los comparables de la colonia.", "items": [
        {"k": "title", "nombre": "Alerta principal", "uso": "El movimiento más relevante de un comparable (precio/inventario/lanzamiento)."},
        {"k": "anomaly_type", "nombre": "Tipo de señal", "uso": "PRICE_DROP / SOLD_OUT_VELOCITY / NEW_LAUNCH."},
        {"k": "severity", "nombre": "Severidad", "uso": "Qué tan urgente es reaccionar (high/medium/low)."},
        {"k": "comparable_name", "nombre": "Comparable", "uso": "Qué desarrollo de la colonia disparó la señal."},
    ]},
}
