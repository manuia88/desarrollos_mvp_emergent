"""ENGINES BATCH · INVERSIÓN / COSTO / COMPETENCIA (tanda 5 del hub).

Aporta runners + descriptores que `engines_hub.py` y `engine_present.py` mergean por su lista de batches.
Cada runner toma (db, ctx) y devuelve la salida CRUDA del motor; el hub la convierte en INDICADORES
hiper-segmentados con su DESCRIPTOR. Casi todos los motores de este eje toman un DEAL/UNIDAD/DESARROLLO,
así que reusamos ctx['_dev'] (dict del desarrollo de la zona) y ctx['_unit'] (su primera unidad), que el
hub ya inyecta cuando solo llega colonia_id.

Doctrina: REUSAR motores (cero lógica nueva de cálculo), fail-soft (un motor que falla no tumba el hub),
y SOLO motores que producen un indicador real a partir de colonia/dev/unidad. Los que exigen texto/scrape/
entidad externa o un `user`/lead se SALTAN y se anotan abajo.

SALTADOS (y por qué):
  · house_pool_engine        — rutea LEADS a asesores de la casa; no produce un indicador de zona/dev/unidad.
  · dmx_dev_benchmark        — benchmark(db, user) EXIGE un `user` (tenant_scope); el hub no provee user.
  · comparator_engine        — compute_deltas(items) necesita `items` comparables que no se construyen aquí.
  · fraud_detection_engine   — exige un `listing` concreto / scrape de cadena de título; no aplica a la zona.
"""
from typing import Any, Dict


# ───────────────────────── helpers de contexto ─────────────────────────
def _unit_price(u: Dict[str, Any]):
    c = (u or {}).get("commercial") or {}
    return (c.get("precio_cierre_mxn") or c.get("precio_lista_mxn")
            or (u or {}).get("price") or (u or {}).get("price_mxn") or (u or {}).get("precio"))


def _unit_m2(u: Dict[str, Any]):
    a = (u or {}).get("areas") or {}
    return (a.get("m2_privativo") or a.get("m2_construido")
            or (u or {}).get("m2_total") or (u or {}).get("m2") or (u or {}).get("m2_privative"))


def _deal_desde_unidad(ctx: Dict[str, Any]) -> Dict[str, Any]:
    """Arma un DEAL mínimo (precio, m², renta, defaults conservadores) desde ctx['_unit']/['_dev'] para los
    motores inversion_v4. Renta estimada a ~0.42% mensual del precio (yield bruto típico CDMX) si no hay otra."""
    unit = ctx.get("_unit") or {}
    dev = ctx.get("_dev") or {}
    precio = _unit_price(unit) or dev.get("price_from") or 6_000_000
    m2 = _unit_m2(unit) or 90.0
    renta_mensual = round(precio * 0.0042)
    return {
        "valor_propiedad": float(precio), "m2_construido": float(m2), "num_unidades": 1,
        "renta_mensual": renta_mensual, "con_credito": True, "perfil": "fisica",
        "horizonte_anios": 5, "modo_renta": "largo",
    }


# ───────────────────────── runners ─────────────────────────
async def _r_inv_v4_finance(db, ctx):
    import inversion_v4_finance as e
    import inversion_v4_tax as tax
    return e.analyze(_deal_desde_unidad(ctx), tax.make_isr_fn())


async def _r_inv_v4_tax(db, ctx):
    import inversion_v4_tax as e
    deal = _deal_desde_unidad(ctx)
    ctx_isr = {**deal, "ingreso_bruto_anual": deal["renta_mensual"] * 12.0, "predial": round(deal["valor_propiedad"] * 0.0016)}
    return e.isr_renta_anual(ctx_isr)


async def _r_inv_v4_veredicto(db, ctx):
    import inversion_v4_finance as fin
    import inversion_v4_tax as tax
    import inversion_v4_veredicto as e
    r = fin.analyze(_deal_desde_unidad(ctx), tax.make_isr_fn())
    return e.veredicto(r)


async def _r_inv_tax_projector(db, ctx):
    import tax_projector_engine as e
    deal = _deal_desde_unidad(ctx)
    precio = deal["valor_propiedad"]
    # valor catastral ~ 55% del precio comercial (proxy CDMX); base del ISAI = mayor(precio, catastral)
    val_catastral = round(precio * 0.55)
    return e.calculate_closing_cost_total(precio, val_catastral, year=2026, con_credito_hipotecario=True)


async def _r_inv_lote_veredicto(db, ctx):
    import lote_veredicto_engine as e
    # terreno representativo de la zona: m² de la unidad ×6 como proxy de lote desarrollable
    terreno = float(_unit_m2(ctx.get("_unit") or {}) or 90.0) * 6.0
    return await e.analizar_lote(db, terreno_m2=terreno, categoria="media", colonia_id=ctx.get("colonia_id"))


async def _r_inv_construction_cost(db, ctx):
    import construction_cost_engine as e
    return await e.get_or_compute_cost(db, ctx.get("colonia_id") or "cdmx", building_type="vertical", tier="mid")


async def _r_inv_simulador_palancas(db, ctx):
    import simulador_palancas_engine as e
    return await e.simular(db, "recamaras", 2, 3, colonia_id=ctx.get("colonia_id"))


async def _r_inv_margin(db, ctx):
    import dmx_margin as e
    dev = ctx.get("_dev") or {}
    price_m2 = e.project_price_m2(dev.get("units") or [])
    proj = {"id": ctx.get("dev_id") or dev.get("id") or "dev", "colonia_id": ctx.get("colonia_id"),
            "price_m2": price_m2, "absorption_rate": 1.0}
    res = await e.compute_margins([proj])
    return res.get(proj["id"], {})


async def _r_inv_project_score(db, ctx):
    import dmx_project_score as e
    dev = ctx.get("_dev") or {}
    p = {
        "units_total": dev.get("units_total"),
        "units_by_status": {"vendido": dev.get("units_sold", 0) or 0, "reservado": dev.get("units_reserved", 0) or 0,
                            "disponible": dev.get("units_available", 0) or 0},
        "health_score": 60, "margin": {"color": "amarillo"}, "weekly_sales": [], "leads_active": 0, "conversion_pct": 0,
    }
    return e.compute(p)


async def _r_inv_unidad_insights(db, ctx):
    import unidad_insights_engine as e
    return await e.unit_insights(db, ctx.get("_dev") or {}, ctx.get("_unit") or {})


async def _r_inv_close_probability(db, ctx):
    import close_probability as e
    # sin lead concreto (el hub trabaja por zona/dev); FAIL-OPEN devuelve prob neutral honesta.
    return await e.close_probability(db, ctx.get("lead_id") or "")


async def _r_inv_battle_card(db, ctx):
    import battle_card_engine as e
    return await e.get_my_score(db, ctx.get("dev_id") or (ctx.get("_dev") or {}).get("id") or "")


async def _r_inv_reviews_residents(db, ctx):
    import reviews_residents_engine as e
    return await e.get_stats(db)


async def _r_inv_reputation(db, ctx):
    import reputation_monitor_engine as e
    return await e.aggregate_stats(db, days=30)


# ───────────────────────── REGISTRO ─────────────────────────
REGISTRO = [
    {"id": "inv_v4_finance", "nombre": "Análisis de inversión v4 (institucional)", "eje": "INVERSIÓN", "tanda": 5,
     "produce": "TIR/cap rate/cash-on-cash + neto al vender de una unidad típica de la zona", "input": ["colonia_id"],
     "fn": _r_inv_v4_finance, "fuente": "inversion_v4_finance"},
    {"id": "inv_v4_tax", "nombre": "ISR sobre la renta (régimen óptimo)", "eje": "INVERSIÓN", "tanda": 5,
     "produce": "ISR anual de rentar la unidad y qué régimen paga menos", "input": ["colonia_id"],
     "fn": _r_inv_v4_tax, "fuente": "inversion_v4_tax"},
    {"id": "inv_v4_veredicto", "nombre": "Veredicto de inversión (semáforo)", "eje": "INVERSIÓN", "tanda": 5,
     "produce": "veredicto FLOJA/SÓLIDA/EXCELENTE + semáforo de la inversión", "input": ["colonia_id"],
     "fn": _r_inv_v4_veredicto, "fuente": "inversion_v4_veredicto"},
    {"id": "inv_tax_projector", "nombre": "Costo de cierre (ISAI + notario + RPP)", "eje": "INVERSIÓN", "tanda": 5,
     "produce": "cuánto cuesta cerrar la compra (impuestos + escrituración + hipoteca)", "input": ["colonia_id"],
     "fn": _r_inv_tax_projector, "fuente": "tax_projector_engine"},
    {"id": "inv_lote_veredicto", "nombre": "Veredicto del lote (cuánto pagar por el terreno)", "eje": "INVERSIÓN", "tanda": 5,
     "produce": "oferta máxima por el terreno + margen + qué revisar (lectura única del lote)", "input": ["colonia_id"],
     "fn": _r_inv_lote_veredicto, "fuente": "lote_veredicto_engine"},
    {"id": "inv_construction_cost", "nombre": "Costo de construcción $/m²", "eje": "INVERSIÓN", "tanda": 5,
     "produce": "costo de obra por m² en la zona (INPP/INCC, fallback honesto)", "input": ["colonia_id"],
     "fn": _r_inv_construction_cost, "fuente": "construction_cost_engine"},
    {"id": "inv_simulador_palancas", "nombre": "Qué pasaría si (palancas de producto)", "eje": "QUÉ", "tanda": 5,
     "produce": "impacto en la venta de cambiar una palanca de producto (ej. recámaras)", "input": ["colonia_id"],
     "fn": _r_inv_simulador_palancas, "fuente": "simulador_palancas_engine"},
    {"id": "inv_margin", "nombre": "Margen del proyecto (semáforo)", "eje": "OFERENTE", "tanda": 5,
     "produce": "margen bruto % del proyecto + si se está comprimiendo", "input": ["dev_id"],
     "fn": _r_inv_margin, "fuente": "dmx_margin"},
    {"id": "inv_project_score", "nombre": "Score del proyecto (1 número 0-100)", "eje": "OFERENTE", "tanda": 5,
     "produce": "score 0-100 + grado del proyecto (PageRank del desarrollo)", "input": ["dev_id"],
     "fn": _r_inv_project_score, "fuente": "dmx_project_score"},
    {"id": "inv_unidad_insights", "nombre": "Insights de la unidad (prob. venta + inversión)", "eje": "OFERENTE", "tanda": 5,
     "produce": "probabilidad de venta + renta/yield/ROI + días en mercado de la unidad", "input": ["dev_id"],
     "fn": _r_inv_unidad_insights, "fuente": "unidad_insights_engine"},
    {"id": "inv_close_probability", "nombre": "Probabilidad de cierre (lead)", "eje": "OFERENTE", "tanda": 5,
     "produce": "probabilidad de cierre 0-100 de un lead (neutral sin lead concreto)", "input": ["lead_id"],
     "fn": _r_inv_close_probability, "fuente": "close_probability"},
    {"id": "inv_battle_card", "nombre": "Battle card (score competitivo)", "eje": "OFERENTE", "tanda": 5,
     "produce": "score competitivo 0-100 del proyecto (precio/ventas/zona/marketing/lead-gen)", "input": ["dev_id"],
     "fn": _r_inv_battle_card, "fuente": "battle_card_engine"},
    {"id": "inv_reviews_residents", "nombre": "Reseñas de residentes (calidad)", "eje": "EXPERIENCIA", "tanda": 5,
     "produce": "sentimiento y ranking de reseñas de residentes (zonas y desarrollos)", "input": [],
     "fn": _r_inv_reviews_residents, "fuente": "reviews_residents_engine"},
    {"id": "inv_reputation", "nombre": "Monitor de reputación (menciones)", "eje": "EXPERIENCIA", "tanda": 5,
     "produce": "menciones y sentimiento de la marca en las últimas semanas", "input": [],
     "fn": _r_inv_reputation, "fuente": "reputation_monitor_engine"},
]


# ───────────────────────── DESCRIPTORES ─────────────────────────
DESCRIPTORES = {
    "inv_v4_finance": {"items": [
        {"k": "tir_pct", "nombre": "TIR de la inversión", "uso": "Rendimiento anual esperado: la métrica que un comité usa para decidir.", "unidad": "%"},
        {"k": "cap_rate_pct", "nombre": "Cap rate (going-in)", "uso": "Renta neta sobre precio: el yield de entrada del inmueble.", "unidad": "%"},
        {"k": "cash_on_cash_pct", "nombre": "Cash-on-cash", "uso": "Flujo anual sobre el dinero realmente puesto (con crédito).", "unidad": "%"},
        {"k": "flujo_mensual_1", "nombre": "Flujo mensual año 1", "uso": "Lo que te queda (o pones) al mes tras renta, gastos y crédito.", "unidad": "MXN/mes"},
        {"k": "neto_al_vender", "nombre": "Neto al vender", "uso": "Cuánto te llevas al salir tras comisión, ISR y saldo del crédito.", "unidad": "MXN"},
        {"k": "mejor_anio_venta", "nombre": "Mejor año para vender", "uso": "El año de salida que maximiza tu rendimiento.", "unidad": "año"},
    ]},
    "inv_v4_tax": {"items": [
        {"k": "isr_renta_anual", "nombre": "ISR anual sobre la renta", "uso": "Lo que pagas de impuesto por rentar la unidad cada año.", "unidad": "MXN"},
        {"k": "regimen_efectivo", "nombre": "Régimen óptimo", "uso": "Qué régimen fiscal paga menos (RESICO / arrendamiento ciega / real)."},
        {"k": "isr_renta_efectivo_pct", "nombre": "Tasa efectiva de ISR", "uso": "Qué porcentaje de la renta se va en impuesto.", "unidad": "%"},
    ]},
    "inv_v4_veredicto": {"items": [
        {"k": "nivel", "nombre": "Nivel de la inversión", "uso": "FLOJA/SÓLIDA/EXCELENTE: el veredicto en una palabra."},
        {"k": "semaforo", "nombre": "Semáforo", "uso": "Verde/amarillo/rojo: lectura rápida de si conviene."},
        {"k": "parrafo", "nombre": "Lectura del veredicto", "uso": "El porqué de la decisión en lenguaje simple para el cliente."},
    ]},
    "inv_tax_projector": {"items": [
        {"k": "total", "nombre": "Costo total de cierre", "uso": "Cuánto desembolsas al comprar más allá del precio (impuestos + trámites).", "unidad": "MXN"},
        {"k": "isai", "nombre": "ISAI (impuesto de adquisición)", "uso": "El impuesto CDMX por comprar — el mayor concepto del cierre.", "unidad": "MXN"},
        {"k": "notario_fees", "nombre": "Honorarios de notario", "uso": "Costo de la escritura.", "unidad": "MXN"},
        {"k": "registro", "nombre": "Registro Público (RPP)", "uso": "Derechos de inscripción del inmueble a tu nombre.", "unidad": "MXN"},
        {"k": "breakdown.isai_pct_of_total", "nombre": "ISAI como % del cierre", "uso": "Qué tanto pesa el ISAI en el costo total.", "unidad": "%"},
    ]},
    "inv_lote_veredicto": {"items": [
        {"k": "veredicto.titular", "nombre": "Cuánto pagar por el lote", "uso": "La oferta máxima recomendada por el terreno (el número)."},
        {"k": "veredicto.semaforo", "nombre": "Semáforo del lote", "uso": "Verde/amarillo/rojo: si el lote deja margen sano."},
        {"k": "veredicto.resumen_corto", "nombre": "Resumen del lote", "uso": "Una línea que ata precio, margen, qué revisar y la jugada de fusión."},
        {"k": "residual.confianza", "nombre": "Confianza del cálculo", "uso": "Qué tan sólido es el residual (baja sin tus datos de mercado)."},
    ]},
    "inv_construction_cost": {"items": [
        {"k": "cost_per_m2_mxn", "nombre": "Costo de construcción $/m²", "uso": "Cuánto cuesta construir por m² en la zona — base del margen del dev.", "unidad": "$/m²"},
        {"k": "zone_premium", "nombre": "Premium de zona", "uso": "Cuánto encarece la zona el costo de obra vs base.", "unidad": "x"},
        {"k": "confidence_pct", "nombre": "Confianza del costo", "uso": "Qué tan confiable es la estimación (más alta con BANXICO/INEGI).", "unidad": "%"},
        {"k": "stub_reason", "nombre": "Nota de estimación", "uso": "Transparencia: si faltaron fuentes externas y se estimó por constantes."},
    ]},
    "inv_simulador_palancas": {"items": [
        {"k": "lectura", "nombre": "Qué pasaría si", "uso": "El impacto en venta de cambiar la palanca, en lenguaje simple."},
        {"k": "delta_pp", "nombre": "Cambio en venta esperada", "uso": "Cuántos puntos sube/baja la venta al mover la palanca.", "unidad": "pp"},
        {"k": "mejor_opcion", "nombre": "Mejor opción", "uso": "Qué configuración de producto vende más en la zona."},
        {"k": "data_basis", "nombre": "Base del dato", "uso": "Si proyecta sobre ventas reales o catálogo de ejemplo (demo)."},
    ]},
    "inv_margin": {"items": [
        {"k": "margin_pct", "nombre": "Margen bruto del proyecto", "uso": "Precio/m² menos costo de obra: el colchón del desarrollo.", "unidad": "%"},
        {"k": "color", "nombre": "Semáforo de margen", "uso": "Verde/amarillo/rojo: si el margen es sano o se comprime."},
        {"k": "verdict", "nombre": "Lectura del margen", "uso": "Qué hacer (mover precio, cuidar costos, empujar marketing)."},
        {"k": "price_m2", "nombre": "Precio/m² del proyecto", "uso": "El precio de venta real de las unidades.", "unidad": "$/m²"},
        {"k": "cost_m2", "nombre": "Costo/m² estimado", "uso": "El costo de obra usado en el margen.", "unidad": "$/m²"},
    ]},
    "inv_project_score": {"items": [
        {"k": "score", "nombre": "Score del proyecto", "uso": "Un número 0-100 para comparar cualquier proyecto con otro.", "unidad": "0-100"},
        {"k": "grade", "nombre": "Grado del proyecto", "uso": "AAA-D: la calificación del desarrollo de un vistazo."},
    ]},
    "inv_unidad_insights": {"items": [
        {"k": "prob_venta.valor", "nombre": "Probabilidad de venta", "uso": "Qué tan probable es que esta unidad se venda (encaje con la demanda).", "unidad": "%"},
        {"k": "prob_venta.etiqueta", "nombre": "Lectura de la probabilidad", "uso": "Muy Probable/Probable/Posible/Difícil en una palabra."},
        {"k": "inversion.renta_mensual_estimada", "nombre": "Renta mensual estimada", "uso": "Cuánto rentaría la unidad: base del yield.", "unidad": "MXN/mes"},
        {"k": "inversion.roi_anual_pct", "nombre": "ROI anual (renta + plusvalía)", "uso": "Rendimiento total esperado de la unidad como inversión.", "unidad": "%"},
        {"k": "dias_en_mercado", "nombre": "Días en mercado", "uso": "Cuánto lleva publicada la unidad (señal de liquidez).", "unidad": "días"},
    ]},
    "inv_close_probability": {"items": [
        {"k": "prob", "nombre": "Probabilidad de cierre", "uso": "Qué tan cerca está un lead de cerrar (0-100).", "unidad": "%"},
        {"k": "confidence", "nombre": "Confianza", "uso": "ALTA/MEDIA/BAJA según cuántas señales hay (baja sin lead concreto)."},
    ]},
    "inv_battle_card": {"items": [
        {"k": "composite_score", "nombre": "Score competitivo", "uso": "Qué tan fuerte es el proyecto vs sus rivales de zona.", "unidad": "0-100"},
        {"k": "color", "nombre": "Semáforo competitivo", "uso": "Verde/amarillo/rojo de la posición competitiva."},
        {"k": "dim_scores.precio", "nombre": "Dimensión precio", "uso": "Qué tan competitivo está el precio vs el AVM.", "unidad": "0-100"},
        {"k": "dim_scores.ventas", "nombre": "Dimensión ventas", "uso": "Velocidad de leads sobre inventario.", "unidad": "0-100"},
        {"k": "dim_scores.zona", "nombre": "Dimensión zona", "uso": "Fuerza de los sub-scores de la colonia.", "unidad": "0-100"},
    ]},
    "inv_reviews_residents": {"items": [
        {"k": "total_reviews", "nombre": "Reseñas analizadas", "uso": "Tamaño de la base de reseñas de residentes.", "unidad": "reseñas"},
        {"k": "sentiment_counts.positive", "nombre": "Reseñas positivas", "uso": "Cuántas reseñas hablan bien (señal de experiencia)."},
        {"k": "sentiment_counts.negative", "nombre": "Reseñas negativas", "uso": "Cuántas reseñas alertan (focos de fricción)."},
    ]},
    "inv_reputation": {"items": [
        {"k": "total_mentions", "nombre": "Menciones (30 días)", "uso": "Cuánto se habla de la marca en el último mes.", "unidad": "menciones"},
        {"k": "by_sentiment.negative", "nombre": "Menciones negativas", "uso": "Señales negativas a vigilar para la reputación."},
        {"k": "by_sentiment.positive", "nombre": "Menciones positivas", "uso": "Cobertura favorable de la marca."},
    ]},
}
