"""ENGINE PRESENT — convierte la salida CRUDA de cada motor en INDICADORES hiper-segmentados (cada dato con nombre humano,
valor, uso '¿para qué?', unidad, fuente, confianza). Nada de volcar key→value. Cada motor declara un DESCRIPTOR: qué
campos de su salida importan y qué significan. Lo consume la pestaña Motores (renderiza Indicador, no JSON crudo).

Un INDICADOR = {nombre, valor, unidad, uso, fuente, confianza, dimension, latente}.
"""
from typing import Any, Dict, List, Optional


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
}


def _conf(latente: bool) -> str:
    return "baja" if latente else "media"


def presentar(engine_id: str, salida: Any, fuente: str, eje: str) -> List[Dict[str, Any]]:
    """Salida cruda → lista de INDICADORES hiper-segmentados (cada dato con nombre/uso/fuente/confianza)."""
    desc = DESCRIPTORES.get(engine_id)
    indic: List[Dict[str, Any]] = []
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
