"""ENGINE PRESENT — convierte la salida CRUDA de cada motor en INDICADORES hiper-segmentados (cada dato con nombre humano,
valor, uso '¿para qué?', unidad, fuente, confianza). Nada de volcar key→value. Cada motor declara un DESCRIPTOR: qué
campos de su salida importan y qué significan. Lo consume la pestaña Motores (renderiza Indicador, no JSON crudo).

Un INDICADOR = {nombre, valor, unidad, uso, fuente, confianza, dimension, latente}.
"""
from typing import Any, Dict, List


def _dig(obj, path):
    cur = obj
    for k in path.split("."):
        if isinstance(cur, dict):
            cur = cur.get(k)
        else:
            return None
    return cur


# DESCRIPTOR por motor: items = [{k (dot-path), nombre, uso, unidad?}]. fuente toma del registro.
DESCRIPTORES: Dict[str, Dict[str, Any]] = {
    "osm_pois": {"items": [
        {"k": "businesses_count_total", "nombre": "Comercios/POIs en radio", "uso": "Densidad de equipamiento urbano: a más POIs, zona más caminable y deseable.", "unidad": "POIs"},
        {"k": "score_15min", "nombre": "Score 15 minutos", "uso": "Qué tanto resuelves la vida a pie en 15 min.", "unidad": "score"},
        {"k": "restaurants", "nombre": "Restaurantes/cafés", "uso": "Vida de barrio; señal aspiracional/gentrificación."},
        {"k": "schools", "nombre": "Escuelas", "uso": "Atractivo para familias."},
        {"k": "health", "nombre": "Salud (hospitales/clínicas)", "uso": "Servicios esenciales cerca."},
    ]},
    "shf": {"items": [
        {"k": "apreciacion_anual_pct", "nombre": "Apreciación SHF", "uso": "Plusvalía oficial de la alcaldía — el benchmark institucional (no la muestra de visitantes).", "unidad": "%/año"},
        {"k": "apreciacion", "nombre": "Apreciación SHF", "uso": "Plusvalía oficial.", "unidad": "%"},
        {"k": "alcaldia", "nombre": "Alcaldía", "uso": "Zona del índice."},
    ]},
    "catastro": {"items": [
        {"k": "predios", "nombre": "Predios catastrales", "uso": "Granularidad de predio: base para valor de suelo y due diligence.", "unidad": "predios"},
        {"k": "valor_suelo_m2", "nombre": "Valor de suelo (catastral)", "uso": "Piso de valor del terreno.", "unidad": "$/m²"},
    ]},
    "riesgo_natural": {"items": [
        {"k": "composite_risk", "nombre": "Riesgo natural compuesto", "uso": "Sísmico+inundación: riesgo físico que un comité exige.", "unidad": "índice"},
        {"k": "sismico", "nombre": "Riesgo sísmico", "uso": "Microzonificación geotécnica."},
        {"k": "inundacion", "nombre": "Riesgo de inundación", "uso": "Probabilidad histórica."},
    ]},
    "riesgo_percibido": {"items": [
        {"k": "perception_index", "nombre": "Percepción de inseguridad", "uso": "ENVIPE: cómo se siente la zona (afecta demanda)."},
    ]},
    "zone_score": {"items": [
        {"k": "score", "nombre": "Score de zona", "uso": "Calidad compuesta de la colonia.", "unidad": "0-100"},
        {"k": "zone_name", "nombre": "Zona", "uso": "Colonia evaluada."},
    ]},
    "demanda_demografica": {"items": [
        {"k": "demanda_estimada", "nombre": "Demanda demográfica estimada", "uso": "Demanda por perfil poblacional (no solo los 18 visitantes).", "unidad": "hogares"},
        {"k": "hogares_objetivo", "nombre": "Hogares objetivo", "uso": "Tamaño del mercado demográfico.", "unidad": "hogares"},
    ]},
    "bancabilidad": {"items": [
        {"k": "bancabilidad", "nombre": "Bancabilidad de la zona", "uso": "Capacidad de crédito del segmento: techo de precio financiable.", "unidad": "score"},
        {"k": "letra", "nombre": "Calificación de bancabilidad", "uso": "A-D: qué tan financiable es la demanda."},
    ]},
    "valores_unitarios": {"items": [
        {"k": "valor_unitario_catastral_m2", "nombre": "Valor unitario catastral", "uso": "Referencia fiscal del suelo.", "unidad": "$/m²"},
    ]},
    "market_estimate": {"items": [
        {"k": "precio_venta_m2", "nombre": "Precio de venta estimado", "uso": "AVM base de la colonia.", "unidad": "$/m²"},
        {"k": "es_estimado", "nombre": "¿Es estimación?", "uso": "Transparencia: dato real vs modelado."},
    ]},
    "forecast_zona": {"items": [
        {"k": "available", "nombre": "Pronóstico disponible", "uso": "Si hay historia suficiente para pronosticar."},
    ]},
    "terminal_mercado": {"items": [
        {"k": "oferta.projects_count", "nombre": "Proyectos en mercado", "uso": "Tamaño de la oferta activa.", "unidad": "proyectos"},
        {"k": "oferta.units_total", "nombre": "Unidades totales", "uso": "Inventario total del mercado.", "unidad": "unidades"},
    ]},
    "amenidades_ranker": {"items": [
        {"k": "vale_la_pena", "nombre": "Amenidades que valen la pena", "uso": "Cuáles amenidades pagan su costo en esta zona."},
    ]},
    "dmx_demand_gap": {"items": [
        {"k": "es_estimado", "nombre": "¿Estimado?", "uso": "Transparencia del dato."},
    ]},
    "generador_producto": {"items": [
        {"k": "cus", "nombre": "CUS (coef. uso de suelo)", "uso": "Cuánto puedes construir en el terreno — el potencial.", "unidad": "x"},
        {"k": "niveles_max", "nombre": "Niveles permitidos", "uso": "Altura máxima por normativa.", "unidad": "niveles"},
    ]},
    "invest_baseline": {"items": [
        {"k": "tier_zona", "nombre": "Tier de zona", "uso": "Clasificación de la zona para inversión."},
        {"k": "zone_score", "nombre": "Score de zona", "uso": "Calidad para invertir.", "unidad": "0-100"},
    ]},
    "tasas_mercado": {"items": [
        {"k": "cetes", "nombre": "CETES", "uso": "Tasa libre de riesgo: el piso que debe superar la inversión.", "unidad": "%"},
        {"k": "hipotecaria", "nombre": "Tasa hipotecaria", "uso": "Costo del crédito del comprador.", "unidad": "%"},
    ]},
    "perfil_zona": {"items": [
        {"k": "zone_score.score", "nombre": "Score de zona", "uso": "Calidad compuesta de la colonia.", "unidad": "0-100"},
        {"k": "ciclo.fase", "nombre": "Fase de ciclo", "uso": "Dónde está la colonia en el ciclo de mercado (expansión/pico/contracción)."},
        {"k": "ciclo.recomendacion", "nombre": "Recomendación de ciclo", "uso": "Qué conviene hacer dada la fase."},
    ]},
    "dmx_indices": {"items": [
        {"k": "price_m2", "nombre": "Precio/m² (índice)", "uso": "Precio de referencia del índice DMX.", "unidad": "$/m²"},
        {"k": "momentum_pct", "nombre": "Momentum del índice", "uso": "Aceleración/desaceleración del mercado.", "unidad": "%"},
    ]},
    "drpi": {"items": [
        {"k": "available", "nombre": "DRPI disponible", "uso": "Índice de precios real: se activa cuando haya snapshots."},
    ]},
    "live_pulse": {"items": [
        {"k": "value", "nombre": "Pulso de tendencia", "uso": "Velocidad de la demanda en la zona (señal viva tipo Bloomberg).", "unidad": "idx"},
        {"k": "delta_pct", "nombre": "Cambio vs baseline", "uso": "Qué tanto se aceleró vs su normal.", "unidad": "%"},
        {"k": "confidence", "nombre": "Confianza del pulso", "uso": "Qué tan confiable es la señal (source=stub = baja).", "unidad": "0-1"},
    ]},
    "score_inversion_top": {"es_lista": True, "uso_total": "Cuántas colonias rankeadas por inversión.", "nombre_total": "Colonias rankeadas", "items": [
        {"k": "colonia_name", "nombre": "Mejor colonia (inversión)", "uso": "La #1 por score de inversión."},
        {"k": "score", "nombre": "Score de inversión (#1)", "uso": "Calidad de inversión de la líder.", "unidad": "0-100"},
        {"k": "recommendation", "nombre": "Recomendación", "uso": "Qué hacer con la #1."},
    ]},
    "inversionista_comercio": {"items": [
        {"k": "recomendacion", "nombre": "Comercio en planta baja", "uso": "Si conviene mixto (comercio PB) o solo departamentos."},
        {"k": "razon", "nombre": "Razón", "uso": "Por qué de la recomendación."},
        {"k": "referencia_estudio", "nombre": "Referencia (estudio)", "uso": "Sustento del dato."},
    ]},
    "due_diligence": {"items": [
        {"k": "semaforo", "nombre": "Semáforo de due diligence", "uso": "Verde/amarillo/rojo: qué tan limpio está el predio para comprar."},
        {"k": "resumen", "nombre": "Resumen de revisión", "uso": "Qué puntos requieren atención antes de comprar."},
    ]},
    "calidad_construccion": {"es_lista": True, "uso_total": "Desarrollos rankeados por calidad de construcción.", "nombre_total": "Desarrollos evaluados", "items": [
        {"k": "name", "nombre": "Mejor por calidad", "uso": "El desarrollo top en calidad de construcción."},
        {"k": "construction_quality_score", "nombre": "Score de calidad (#1)", "uso": "Calidad de obra del líder.", "unidad": "0-100"},
        {"k": "construction_quality_tier", "nombre": "Tier de calidad", "uso": "Clasificación de calidad."},
    ]},
    "estudio_mercado": {"items": [
        {"k": "n_colonias", "nombre": "Colonias en radio (1km)", "uso": "Tamaño del submercado analizado.", "unidad": "colonias"},
        {"k": "representativo", "nombre": "¿Muestra representativa?", "uso": "Transparencia: si el estudio tiene suficiente base."},
        {"k": "demanda_real.total", "nombre": "Demanda real en radio", "uso": "Demanda observada en 1km.", "unidad": "señales"},
        {"k": "demanda_potencial.total", "nombre": "Demanda potencial", "uso": "Techo de demanda del submercado."},
    ]},
    "avm_publico": {"items": [
        {"k": "precio_estimado", "nombre": "Valor estimado (AVM)", "uso": "Valor de mercado de la unidad (o de un depto típico si no se da unidad): ¿está bien puesto el precio?", "unidad": "MXN"},
        {"k": "precio_per_m2", "nombre": "Precio estimado por m²", "uso": "Referencia AVM por m².", "unidad": "$/m²"},
        {"k": "confidence", "nombre": "Confianza del AVM", "uso": "Qué tan confiable es la estimación."},
    ]},
    "costo_propiedad": {"items": [
        {"k": "tco.costo_real_mensual", "nombre": "Costo real mensual de ser dueño", "uso": "Lo que de verdad cuesta al mes tener la propiedad (más allá de la mensualidad).", "unidad": "MXN/mes"},
        {"k": "rent_vs_buy.renta_mensual_estimada", "nombre": "Renta equivalente", "uso": "Cuánto rentaría: la comparación dueño vs rentar.", "unidad": "MXN/mes"},
        {"k": "rent_vs_buy.clave", "nombre": "¿Conviene comprar o rentar?", "uso": "El veredicto financiero del horizonte."},
        {"k": "rent_vs_buy.lectura", "nombre": "Lectura renta vs compra", "uso": "El porqué en lenguaje simple."},
    ]},
    "esquemas_pago": {"items": [
        {"k": "esquemas_sugeridos.segment_label", "nombre": "Segmento de pago sugerido", "uso": "Para qué tipo de comprador es el esquema."},
        {"k": "esquemas_sugeridos.confidence", "nombre": "Confianza del esquema", "uso": "Qué tan sólida es la sugerencia."},
        {"k": "esquemas_sugeridos.rationale", "nombre": "Lógica del esquema", "uso": "Por qué este enganche/mensualidades."},
    ]},
    "contexto_precio": {"items": [
        {"k": "este_pm2", "nombre": "Precio/m² de la zona", "uso": "El precio de referencia de la colonia.", "unidad": "$/m²"},
        {"k": "posicion.etiqueta", "nombre": "Posición de precio", "uso": "Dónde cae el precio vs comparables (entrada/medio/tope de gama)."},
        {"k": "posicion.vs_pct", "nombre": "Percentil vs peers", "uso": "Qué tan caro/barato vs colonias comparables.", "unidad": "%"},
        {"k": "posicion.lectura", "nombre": "Lectura de posición", "uso": "El porqué en lenguaje simple."},
    ]},
}


# merge de descriptores de los módulos por tanda (falla suave)
for _b in ("engines_batch_valuacion", "engines_batch_geo", "engines_batch_demanda", "engines_batch_cubo", "engines_batch_inversion"):
    try:
        _m = __import__(_b)
        DESCRIPTORES.update(getattr(_m, "DESCRIPTORES", {}))
    except Exception:  # noqa: BLE001
        pass


def _conf(latente: bool) -> str:
    return "baja" if latente else "media"


def presentar(engine_id: str, salida: Any, fuente: str, eje: str) -> List[Dict[str, Any]]:
    """Salida cruda → lista de INDICADORES hiper-segmentados (cada dato con nombre/uso/fuente/confianza)."""
    desc = DESCRIPTORES.get(engine_id)
    indic: List[Dict[str, Any]] = []
    # motores que devuelven LISTA (rankings): un indicador de total + el top item mapeado
    if desc and desc.get("es_lista") and isinstance(salida, list):
        indic.append({"nombre": desc.get("nombre_total", "Resultados"), "valor": len(salida), "unidad": None,
                      "uso": desc.get("uso_total", ""), "fuente": fuente, "dimension": eje,
                      "confianza": _conf(len(salida) == 0), "latente": len(salida) == 0})
        top = salida[0] if (salida and isinstance(salida[0], dict)) else {}
        for it in desc["items"]:
            v = _dig(top, it["k"])
            latente = v in (None, "", [], {}, 0, False)
            if latente and not it.get("siempre"):
                continue
            indic.append({"nombre": it["nombre"], "valor": v, "unidad": it.get("unidad"), "uso": it["uso"],
                          "fuente": fuente, "dimension": eje, "confianza": _conf(False), "latente": False})
        return indic
    if desc and isinstance(salida, dict):
        for it in desc["items"]:
            v = _dig(salida, it["k"])
            if v is None and not it.get("siempre"):
                continue
            latente = v in (None, "", [], {}, 0, False)
            indic.append({"nombre": it["nombre"], "valor": (None if latente else v), "unidad": it.get("unidad"),
                          "uso": it["uso"], "fuente": fuente, "dimension": eje, "confianza": _conf(latente),
                          "latente": latente})
    # si NO hay descriptor: NO volcamos crudo — devolvemos vacío con bandera (honesto, pendiente de hipersegmentar)
    return indic


def tiene_descriptor(engine_id: str) -> bool:
    return engine_id in DESCRIPTORES
