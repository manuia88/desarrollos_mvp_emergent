"""METRIC REGISTRY v2 — el catálogo de MEDIDAS BASE del grid de métricas (medida_base × dimensiones).

Cada medida declara su PROCEDENCIA: de dónde sale (fuente real), dónde entra/sale (almacén), qué dimensiones aplican,
su cohorte de comparación, y n_minimo para materializar. El grid_engine genera las celdas (producto cartesiano) y adjunta
n real + frescura + confianza. Procedencia obligatoria: sin fuente+n+cohorte+actualizado, NO se publica (latente).

FUENTES REALES (reconciliadas en Fase 0 — spec → colección real):
  lista_precios   → dmx_units (992) + DEVELOPMENTS.units (embebidas)   [oferta]
  vista_prototipo → buyer_signals (unit_view/ficha_view/view/photo_dwell)
  solicitud_info  → leads + asesor_contactos
  busqueda        → marketplace_searches
  calculadora     → buyer_signals (payment_explore/roi_explore)  [thin → latente]
  transaccion     → transactions (1) + asesor_operaciones  [thin → latente]
  almacen_salida  → metric_grid (colección NUEVA; 'metricas'/'events_raw' del spec no existen)
"""

# ── DIMENSIONES (los ejes — valores canónicos) ──────────────────────────────────
DIMENSIONS = {
    "geo": ["ciudad", "alcaldia", "colonia", "corredor", "desarrollo", "prototipo"],
    "tipologia": ["studio", "1rec", "2rec", "3rec", "4+rec"],
    "rango_m2": ["<60", "60-100", "100-150", ">150"],
    "piso": ["PB-bajo(1-3)", "medio(4-10)", "alto(11-20)", "muy-alto(>20)"],
    "orientacion": ["norte", "sur", "oriente", "poniente"],
    "vista": ["interior", "exterior"],
    "atributo": ["terraza", "balcon", "roof", "bodega", "cajon", "pet_friendly", "amenidades_alta", "seguridad", "gym", "alberca"],
    "tier_precio": ["0-3M", "3-5M", "5-8M", "8-12M", "12-20M", "20M+"],
    "intencion": ["vivir", "invertir"],
    "etapa": ["preventa", "construccion", "entrega"],
    "ventana": ["live", "30d", "90d", "6m", "12m", "YoY"],
}

# almacenes
ALMACEN_SALIDA = "metric_grid"

# ── REGISTRY de medidas base (id, lado, medida, unidad, fuente, almacenes, dims, cohorte, n_min, refresco) ──
REGISTRY = [
    # ───────── OFERTA (lista_precios = dmx_units / DEVELOPMENTS.units) ─────────
    {"id": "of.precio_m2", "lado": "oferta", "medida": "Precio por m²", "unidad": "$/m²",
     "formula": "mediana(price / m2_total)", "fuente": ["dmx_units", "developments.units"],
     "almacen_entrada": ["dmx_units", "developments"], "almacen_salida": ALMACEN_SALIDA,
     "dimensiones_aplicables": ["geo", "tipologia", "rango_m2", "piso", "vista", "orientacion", "atributo", "etapa", "ventana"],
     "cohorte_comparacion": "misma geo + misma tipología + mismo tier", "n_minimo": 5, "refresco": "on-upload"},
    {"id": "of.precio_absoluto", "lado": "oferta", "medida": "Precio de unidad", "unidad": "$",
     "formula": "mediana(price)", "fuente": ["dmx_units", "developments.units"], "almacen_entrada": ["dmx_units"],
     "almacen_salida": ALMACEN_SALIDA, "dimensiones_aplicables": ["geo", "tipologia", "tier_precio", "etapa", "ventana"],
     "cohorte_comparacion": "misma geo + tipología", "n_minimo": 5, "refresco": "on-upload"},
    {"id": "of.inventario_activo", "lado": "oferta", "medida": "Inventario disponible", "unidad": "unidades",
     "formula": "count(status=disponible)", "fuente": ["dmx_units", "developments.units"], "almacen_entrada": ["dmx_units"],
     "almacen_salida": ALMACEN_SALIDA, "dimensiones_aplicables": ["geo", "tipologia", "rango_m2", "tier_precio", "etapa"],
     "cohorte_comparacion": "misma geo + tipología", "n_minimo": 1, "refresco": "on-upload"},
    {"id": "of.sell_through", "lado": "oferta", "medida": "% vendido", "unidad": "%",
     "formula": "vendidas / totales", "fuente": ["dmx_units", "developments.units"], "almacen_entrada": ["dmx_units"],
     "almacen_salida": ALMACEN_SALIDA, "dimensiones_aplicables": ["geo", "tipologia", "etapa"],
     "cohorte_comparacion": "misma geo + tipología", "n_minimo": 5, "refresco": "on-upload"},
    {"id": "of.mix_tipologia", "lado": "oferta", "medida": "Mix de tipología ofertada", "unidad": "distribución",
     "formula": "histograma(prototype)", "fuente": ["developments.units"], "almacen_entrada": ["developments"],
     "almacen_salida": ALMACEN_SALIDA, "dimensiones_aplicables": ["geo", "etapa"],
     "cohorte_comparacion": "misma geo", "n_minimo": 4, "refresco": "on-upload"},
    {"id": "of.premium_atributo", "lado": "oferta", "medida": "Premium $ por atributo", "unidad": "% sobre base",
     "formula": "precio_m2(con atributo) vs precio_m2(sin)", "fuente": ["developments.units"], "almacen_entrada": ["developments"],
     "almacen_salida": ALMACEN_SALIDA, "dimensiones_aplicables": ["geo", "tipologia", "atributo"],
     "cohorte_comparacion": "misma geo + tipología", "n_minimo": 8, "refresco": "on-upload"},
    {"id": "of.absorcion_mensual", "lado": "oferta", "medida": "Absorción mensual", "unidad": "unidades/mes",
     "formula": "Δ vendidas / Δ meses (price_history)", "fuente": ["developments.units", "developments.price_history"],
     "almacen_entrada": ["developments"], "almacen_salida": ALMACEN_SALIDA,
     "dimensiones_aplicables": ["geo", "tipologia", "rango_m2", "tier_precio", "ventana"],
     "cohorte_comparacion": "misma geo + tier + tipología", "n_minimo": 8, "refresco": "on-upload"},
    {"id": "of.meses_inventario", "lado": "oferta", "medida": "Meses para agotar", "unidad": "meses",
     "formula": "inventario_activo / absorcion_mensual", "fuente": ["developments.units"], "almacen_entrada": ["developments"],
     "almacen_salida": ALMACEN_SALIDA, "dimensiones_aplicables": ["geo", "tipologia", "tier_precio"],
     "cohorte_comparacion": "misma geo + tier", "n_minimo": 8, "refresco": "on-upload"},
    {"id": "of.precio_cerrado_m2", "lado": "oferta", "medida": "Precio cerrado $/m² (real)", "unidad": "$/m²",
     "formula": "mediana(precio_cierre / m2)", "fuente": ["transactions"], "almacen_entrada": ["transactions"],
     "almacen_salida": ALMACEN_SALIDA, "dimensiones_aplicables": ["geo", "tipologia", "ventana"],
     "cohorte_comparacion": "misma geo + tipología", "n_minimo": 10, "refresco": "on-close"},  # LATENTE (transactions=1)

    # ───────── DEMANDA (el moat) ─────────
    {"id": "dm.vistas", "lado": "demanda", "medida": "Vistas de listing", "unidad": "vistas",
     "formula": "count(ficha_view+unit_view+view)", "fuente": ["buyer_signals"], "almacen_entrada": ["buyer_signals"],
     "almacen_salida": ALMACEN_SALIDA, "dimensiones_aplicables": ["geo", "tipologia", "atributo", "tier_precio", "ventana"],
     "cohorte_comparacion": "misma geo + tipología", "n_minimo": 5, "refresco": "on-event"},
    {"id": "dm.busquedas", "lado": "demanda", "medida": "Búsquedas realizadas", "unidad": "búsquedas",
     "formula": "count(marketplace_searches)", "fuente": ["marketplace_searches"], "almacen_entrada": ["marketplace_searches"],
     "almacen_salida": ALMACEN_SALIDA, "dimensiones_aplicables": ["geo", "tipologia", "tier_precio", "ventana"],
     "cohorte_comparacion": "misma geo", "n_minimo": 5, "refresco": "on-event"},
    {"id": "dm.solicitudes", "lado": "demanda", "medida": "Solicitudes de info (leads)", "unidad": "solicitudes",
     "formula": "count(leads + intent + lead)", "fuente": ["leads", "buyer_signals"], "almacen_entrada": ["leads", "buyer_signals"],
     "almacen_salida": ALMACEN_SALIDA, "dimensiones_aplicables": ["geo", "tipologia", "atributo", "tier_precio", "ventana"],
     "cohorte_comparacion": "misma geo", "n_minimo": 3, "refresco": "on-event"},
    {"id": "dm.split_intencion", "lado": "demanda", "medida": "Vivir vs invertir", "unidad": "%",
     "formula": "lens/roi/payment → intent", "fuente": ["buyer_signals"], "almacen_entrada": ["buyer_signals"],
     "almacen_salida": ALMACEN_SALIDA, "dimensiones_aplicables": ["geo", "tipologia", "tier_precio"],
     "cohorte_comparacion": "misma geo", "n_minimo": 4, "refresco": "on-event"},
    {"id": "dm.atributo_buscado", "lado": "demanda", "medida": "Atributos demandados (ranking)", "unidad": "ranking",
     "formula": "count(meta.amenidades) + atributos de devs vistos", "fuente": ["buyer_signals"], "almacen_entrada": ["buyer_signals"],
     "almacen_salida": ALMACEN_SALIDA, "dimensiones_aplicables": ["geo", "intencion", "ventana"],
     "cohorte_comparacion": "misma geo", "n_minimo": 5, "refresco": "on-event"},
    {"id": "dm.presupuesto_declarado", "lado": "demanda", "medida": "Presupuesto revelado", "unidad": "$",
     "formula": "mediana(precio_max buscado + meta.presupuesto)", "fuente": ["marketplace_searches", "buyer_signals"],
     "almacen_entrada": ["marketplace_searches"], "almacen_salida": ALMACEN_SALIDA,
     "dimensiones_aplicables": ["geo", "intencion", "ventana"], "cohorte_comparacion": "misma geo", "n_minimo": 5, "refresco": "on-event"},
    {"id": "dm.share_demanda", "lado": "demanda", "medida": "% de demanda de la zona que capta el dev", "unidad": "%",
     "formula": "señales(dev) / señales(colonia)", "fuente": ["buyer_signals"], "almacen_entrada": ["buyer_signals"],
     "almacen_salida": ALMACEN_SALIDA, "dimensiones_aplicables": ["geo"],
     "cohorte_comparacion": "devs de la misma colonia", "n_minimo": 3, "refresco": "on-event"},

    # ───────── CRUCE OFERTA × DEMANDA (el oro) ─────────
    {"id": "x.gap_oferta_demanda", "lado": "cruce", "medida": "Demanda insatisfecha (buscan − ofertan)", "unidad": "Δ",
     "formula": "busquedas − inventario por feature", "fuente": ["marketplace_searches", "dmx_units"],
     "almacen_entrada": ["marketplace_searches", "dmx_units"], "almacen_salida": ALMACEN_SALIDA,
     "dimensiones_aplicables": ["geo", "tipologia", "rango_m2", "tier_precio", "atributo"],
     "cohorte_comparacion": "misma geo + tipología", "n_minimo": 5, "refresco": "on-event"},
    {"id": "x.ratio_demanda_inventario", "lado": "cruce", "medida": "Presión de demanda", "unidad": "ratio",
     "formula": "demanda / inventario_activo", "fuente": ["buyer_signals", "dmx_units"], "almacen_entrada": ["buyer_signals", "dmx_units"],
     "almacen_salida": ALMACEN_SALIDA, "dimensiones_aplicables": ["geo", "tipologia", "atributo"],
     "cohorte_comparacion": "misma geo + tipología", "n_minimo": 5, "refresco": "on-event"},
    {"id": "x.affordability_gap", "lado": "cruce", "medida": "Capacidad de pago vs precios", "unidad": "%",
     "formula": "presupuesto_declarado vs precio_absoluto", "fuente": ["marketplace_searches", "dmx_units"],
     "almacen_entrada": ["marketplace_searches", "dmx_units"], "almacen_salida": ALMACEN_SALIDA,
     "dimensiones_aplicables": ["geo", "tipologia", "tier_precio"], "cohorte_comparacion": "misma geo + tier", "n_minimo": 5, "refresco": "on-event"},
    {"id": "x.dap_atributo", "lado": "cruce", "medida": "Disposición a pagar por atributo", "unidad": "% premium",
     "formula": "demanda_atributo × premium_atributo", "fuente": ["buyer_signals", "developments.units"],
     "almacen_entrada": ["buyer_signals", "developments"], "almacen_salida": ALMACEN_SALIDA,
     "dimensiones_aplicables": ["geo", "atributo"], "cohorte_comparacion": "misma geo", "n_minimo": 6, "refresco": "on-event"},

    # ───────── OFERTA (resto) ─────────
    {"id": "of.precio_p25", "lado": "oferta", "medida": "Precio/m² p25 (barato)", "unidad": "$/m²", "formula": "percentil25(price/m2)",
     "fuente": ["developments.units"], "almacen_entrada": ["developments"], "almacen_salida": ALMACEN_SALIDA,
     "dimensiones_aplicables": ["geo", "tipologia", "ventana"], "cohorte_comparacion": "misma geo + tipología", "n_minimo": 5, "refresco": "on-upload"},
    {"id": "of.precio_p75", "lado": "oferta", "medida": "Precio/m² p75 (caro)", "unidad": "$/m²", "formula": "percentil75(price/m2)",
     "fuente": ["developments.units"], "almacen_entrada": ["developments"], "almacen_salida": ALMACEN_SALIDA,
     "dimensiones_aplicables": ["geo", "tipologia", "ventana"], "cohorte_comparacion": "misma geo + tipología", "n_minimo": 5, "refresco": "on-upload"},
    {"id": "of.unidades_totales", "lado": "oferta", "medida": "Unidades totales", "unidad": "unidades", "formula": "count(units)",
     "fuente": ["developments.units"], "almacen_entrada": ["developments"], "almacen_salida": ALMACEN_SALIDA,
     "dimensiones_aplicables": ["geo", "tipologia"], "cohorte_comparacion": "misma geo", "n_minimo": 1, "refresco": "on-upload"},
    {"id": "of.unidades_vendidas", "lado": "oferta", "medida": "Unidades vendidas", "unidad": "unidades", "formula": "count(status=vendido)",
     "fuente": ["developments.units"], "almacen_entrada": ["developments"], "almacen_salida": ALMACEN_SALIDA,
     "dimensiones_aplicables": ["geo", "tipologia", "rango_m2", "ventana"], "cohorte_comparacion": "misma geo + tipología", "n_minimo": 3, "refresco": "on-upload"},
    {"id": "of.velocidad_venta", "lado": "oferta", "medida": "Velocidad de venta", "unidad": "unidades/mes", "formula": "vendidas / meses_venta",
     "fuente": ["developments.units"], "almacen_entrada": ["developments"], "almacen_salida": ALMACEN_SALIDA,
     "dimensiones_aplicables": ["geo", "tipologia", "rango_m2", "ventana"], "cohorte_comparacion": "misma geo + tipología", "n_minimo": 5, "refresco": "on-upload"},
    {"id": "of.meses_venta", "lado": "oferta", "medida": "Meses desde lanzamiento", "unidad": "meses", "formula": "now − fecha_lanzamiento",
     "fuente": ["developments"], "almacen_entrada": ["developments"], "almacen_salida": ALMACEN_SALIDA,
     "dimensiones_aplicables": ["geo", "etapa"], "cohorte_comparacion": "misma geo", "n_minimo": 1, "refresco": "on-upload"},
    {"id": "of.dias_en_mercado", "lado": "oferta", "medida": "Días en mercado (sin vender)", "unidad": "días", "formula": "mediana(now − listado) de disponibles",
     "fuente": ["developments.units"], "almacen_entrada": ["developments"], "almacen_salida": ALMACEN_SALIDA,
     "dimensiones_aplicables": ["geo", "tipologia", "rango_m2"], "cohorte_comparacion": "misma geo + tipología", "n_minimo": 5, "refresco": "on-upload"},
    {"id": "of.premium_piso", "lado": "oferta", "medida": "Premium $ por altura", "unidad": "% por nivel", "formula": "Δ precio/m² por piso",
     "fuente": ["developments.units"], "almacen_entrada": ["developments"], "almacen_salida": ALMACEN_SALIDA,
     "dimensiones_aplicables": ["geo", "piso"], "cohorte_comparacion": "misma geo + tipología", "n_minimo": 8, "refresco": "on-upload"},
    {"id": "of.premium_vista", "lado": "oferta", "medida": "Premium exterior vs interior", "unidad": "%", "formula": "precio/m²(ext) vs (int)",
     "fuente": ["developments.units"], "almacen_entrada": ["developments"], "almacen_salida": ALMACEN_SALIDA,
     "dimensiones_aplicables": ["geo", "vista"], "cohorte_comparacion": "misma geo + tipología", "n_minimo": 8, "refresco": "on-upload"},
    {"id": "of.premium_orientacion", "lado": "oferta", "medida": "Premium por orientación", "unidad": "%", "formula": "Δ precio/m² por orientación",
     "fuente": ["developments.units"], "almacen_entrada": ["developments"], "almacen_salida": ALMACEN_SALIDA,
     "dimensiones_aplicables": ["geo", "orientacion"], "cohorte_comparacion": "misma geo + tipología", "n_minimo": 8, "refresco": "on-upload"},
    {"id": "of.ticket_promedio", "lado": "oferta", "medida": "Ticket promedio de venta", "unidad": "$", "formula": "promedio(price de vendidas)",
     "fuente": ["developments.units", "transactions"], "almacen_entrada": ["developments"], "almacen_salida": ALMACEN_SALIDA,
     "dimensiones_aplicables": ["geo", "tipologia", "ventana"], "cohorte_comparacion": "misma geo + tipología", "n_minimo": 5, "refresco": "on-upload"},
    {"id": "of.ritmo_lanzamientos", "lado": "oferta", "medida": "Nuevos proyectos", "unidad": "proyectos/periodo", "formula": "count(fecha_lanzamiento en ventana)",
     "fuente": ["developments"], "almacen_entrada": ["developments"], "almacen_salida": ALMACEN_SALIDA,
     "dimensiones_aplicables": ["geo", "ventana"], "cohorte_comparacion": "misma geo", "n_minimo": 2, "refresco": "on-upload"},
    {"id": "of.descuento_negociacion", "lado": "oferta", "medida": "Descuento lista→cerrado", "unidad": "%", "formula": "(lista − cerrado)/lista",
     "fuente": ["transactions", "developments.units"], "almacen_entrada": ["transactions"], "almacen_salida": ALMACEN_SALIDA,
     "dimensiones_aplicables": ["geo", "tipologia", "tier_precio"], "cohorte_comparacion": "misma geo + tier", "n_minimo": 10, "refresco": "on-close"},  # LATENTE
    {"id": "of.posicion_precio_cohorte", "lado": "oferta", "medida": "Caro/barato vs pares", "unidad": "percentil", "formula": "rank precio/m² vs cohorte",
     "fuente": ["metric_grid"], "almacen_entrada": ["metric_grid"], "almacen_salida": ALMACEN_SALIDA,
     "dimensiones_aplicables": ["geo", "tipologia", "tier_precio"], "cohorte_comparacion": "misma geo + tier + tipología", "n_minimo": 5, "refresco": "on-compute"},

    # ───────── DEMANDA (resto) ─────────
    {"id": "dm.vistas_prototipo", "lado": "demanda", "medida": "Atención por prototipo", "unidad": "vistas", "formula": "count(unit_view por prototipo)",
     "fuente": ["buyer_signals"], "almacen_entrada": ["buyer_signals"], "almacen_salida": ALMACEN_SALIDA,
     "dimensiones_aplicables": ["geo", "tipologia"], "cohorte_comparacion": "mismo desarrollo", "n_minimo": 3, "refresco": "on-event"},
    {"id": "dm.filtros_atributo", "lado": "demanda", "medida": "Atributos que se filtran", "unidad": "ranking", "formula": "count(filtros en búsqueda)",
     "fuente": ["marketplace_searches", "buyer_signals"], "almacen_entrada": ["marketplace_searches"], "almacen_salida": ALMACEN_SALIDA,
     "dimensiones_aplicables": ["geo", "atributo", "intencion"], "cohorte_comparacion": "misma geo", "n_minimo": 5, "refresco": "on-event"},
    {"id": "dm.tipologia_buscada", "lado": "demanda", "medida": "Tipología más demandada", "unidad": "ranking", "formula": "count(recamaras_min)",
     "fuente": ["marketplace_searches"], "almacen_entrada": ["marketplace_searches"], "almacen_salida": ALMACEN_SALIDA,
     "dimensiones_aplicables": ["geo", "tier_precio", "intencion"], "cohorte_comparacion": "misma geo", "n_minimo": 5, "refresco": "on-event"},
    {"id": "dm.rango_precio_buscado", "lado": "demanda", "medida": "Banda de precio buscada", "unidad": "tier", "formula": "moda(tier de precio_max)",
     "fuente": ["marketplace_searches"], "almacen_entrada": ["marketplace_searches"], "almacen_salida": ALMACEN_SALIDA,
     "dimensiones_aplicables": ["geo", "tipologia", "intencion"], "cohorte_comparacion": "misma geo", "n_minimo": 5, "refresco": "on-event"},
    {"id": "dm.demanda_por_atributo", "lado": "demanda", "medida": "Demanda por atributo", "unidad": "volumen", "formula": "señales que engachan con atributo",
     "fuente": ["buyer_signals"], "almacen_entrada": ["buyer_signals"], "almacen_salida": ALMACEN_SALIDA,
     "dimensiones_aplicables": ["geo", "atributo", "intencion", "ventana"], "cohorte_comparacion": "misma geo", "n_minimo": 5, "refresco": "on-event"},
    {"id": "dm.recurrencia_busqueda", "lado": "demanda", "medida": "Insistencia del buscador", "unidad": "toques/visitante", "formula": "señales / visitantes",
     "fuente": ["buyer_signals"], "almacen_entrada": ["buyer_signals"], "almacen_salida": ALMACEN_SALIDA,
     "dimensiones_aplicables": ["geo", "intencion"], "cohorte_comparacion": "misma geo", "n_minimo": 5, "refresco": "on-event"},
    {"id": "dm.heat_index", "lado": "demanda", "medida": "Demanda relativa vs peso en inventario", "unidad": "índice", "formula": "share_demanda / share_inventario",
     "fuente": ["buyer_signals", "developments.units"], "almacen_entrada": ["buyer_signals"], "almacen_salida": ALMACEN_SALIDA,
     "dimensiones_aplicables": ["geo", "tipologia", "atributo"], "cohorte_comparacion": "misma geo", "n_minimo": 5, "refresco": "on-event"},
    {"id": "dm.conv_vista_solicitud", "lado": "demanda", "medida": "Conversión vista→solicitud", "unidad": "%", "formula": "solicitudes / vistas",
     "fuente": ["buyer_signals"], "almacen_entrada": ["buyer_signals"], "almacen_salida": ALMACEN_SALIDA,
     "dimensiones_aplicables": ["geo", "tipologia"], "cohorte_comparacion": "misma geo", "n_minimo": 8, "refresco": "on-event"},
    # — calculadora (thin → LATENTE hasta que se use el cotizador) —
    {"id": "dm.sesiones_calculadora", "lado": "demanda", "medida": "Uso del cotizador", "unidad": "sesiones", "formula": "count(payment_explore+roi_explore)",
     "fuente": ["buyer_signals"], "almacen_entrada": ["buyer_signals"], "almacen_salida": ALMACEN_SALIDA,
     "dimensiones_aplicables": ["geo", "tipologia", "intencion", "ventana"], "cohorte_comparacion": "misma geo", "n_minimo": 5, "refresco": "on-event"},
    {"id": "dm.enganche_declarado", "lado": "demanda", "medida": "Enganche disponible", "unidad": "$", "formula": "mediana(meta.enganche)",
     "fuente": ["buyer_signals"], "almacen_entrada": ["buyer_signals"], "almacen_salida": ALMACEN_SALIDA,
     "dimensiones_aplicables": ["geo", "intencion"], "cohorte_comparacion": "misma geo", "n_minimo": 5, "refresco": "on-event"},
    {"id": "dm.capacidad_credito", "lado": "demanda", "medida": "Crédito que califican", "unidad": "$", "formula": "mediana(meta.credito)",
     "fuente": ["buyer_signals"], "almacen_entrada": ["buyer_signals"], "almacen_salida": ALMACEN_SALIDA,
     "dimensiones_aplicables": ["geo", "intencion"], "cohorte_comparacion": "misma geo", "n_minimo": 5, "refresco": "on-event"},
    {"id": "dm.aforo_ltv", "lado": "demanda", "medida": "LTV/aforo promedio", "unidad": "%", "formula": "credito / precio",
     "fuente": ["buyer_signals"], "almacen_entrada": ["buyer_signals"], "almacen_salida": ALMACEN_SALIDA,
     "dimensiones_aplicables": ["geo", "tier_precio"], "cohorte_comparacion": "misma geo + tier", "n_minimo": 5, "refresco": "on-event"},
    {"id": "dm.plazo_target", "lado": "demanda", "medida": "Plazo buscado", "unidad": "años", "formula": "moda(meta.plazo_anos)",
     "fuente": ["buyer_signals"], "almacen_entrada": ["buyer_signals"], "almacen_salida": ALMACEN_SALIDA,
     "dimensiones_aplicables": ["geo", "intencion"], "cohorte_comparacion": "misma geo", "n_minimo": 5, "refresco": "on-event"},
    {"id": "dm.mensualidad_target", "lado": "demanda", "medida": "Mensualidad objetivo", "unidad": "$", "formula": "mediana(meta.mensualidad)",
     "fuente": ["buyer_signals"], "almacen_entrada": ["buyer_signals"], "almacen_salida": ALMACEN_SALIDA,
     "dimensiones_aplicables": ["geo", "tier_precio"], "cohorte_comparacion": "misma geo + tier", "n_minimo": 5, "refresco": "on-event"},
    {"id": "dm.tir_target", "lado": "demanda", "medida": "TIR objetivo (inversión)", "unidad": "%", "formula": "mediana(meta.tir)",
     "fuente": ["buyer_signals"], "almacen_entrada": ["buyer_signals"], "almacen_salida": ALMACEN_SALIDA,
     "dimensiones_aplicables": ["geo", "tipologia"], "cohorte_comparacion": "misma geo", "n_minimo": 5, "refresco": "on-event"},
    {"id": "dm.cap_rate_target", "lado": "demanda", "medida": "Cap rate objetivo", "unidad": "%", "formula": "mediana(meta.cap_rate)",
     "fuente": ["buyer_signals"], "almacen_entrada": ["buyer_signals"], "almacen_salida": ALMACEN_SALIDA,
     "dimensiones_aplicables": ["geo", "tipologia"], "cohorte_comparacion": "misma geo", "n_minimo": 5, "refresco": "on-event"},
    {"id": "dm.tiempo_decision", "lado": "demanda", "medida": "Primer contacto → cierre", "unidad": "días", "formula": "mediana(cierre − 1er toque)",
     "fuente": ["buyer_signals", "transactions"], "almacen_entrada": ["buyer_signals"], "almacen_salida": ALMACEN_SALIDA,
     "dimensiones_aplicables": ["geo", "tipologia", "intencion"], "cohorte_comparacion": "misma geo", "n_minimo": 8, "refresco": "on-close"},  # LATENTE
    {"id": "dm.conv_cotizacion_cierre", "lado": "demanda", "medida": "Conversión cotización→cierre", "unidad": "%", "formula": "cierres / cotizaciones",
     "fuente": ["buyer_signals", "transactions"], "almacen_entrada": ["buyer_signals"], "almacen_salida": ALMACEN_SALIDA,
     "dimensiones_aplicables": ["geo", "tipologia", "tier_precio"], "cohorte_comparacion": "misma geo", "n_minimo": 10, "refresco": "on-close"},  # LATENTE

    # ───────── CRUCE (resto) + CAPA PROPIETARIA ─────────
    {"id": "x.elasticidad_precio", "lado": "cruce", "medida": "Elasticidad: a qué precio se frena la absorción", "unidad": "curva",
     "formula": "absorción por banda de precio", "fuente": ["developments.units", "marketplace_searches"], "almacen_entrada": ["developments", "marketplace_searches"],
     "almacen_salida": ALMACEN_SALIDA, "dimensiones_aplicables": ["geo", "tipologia"], "cohorte_comparacion": "misma geo + tipología", "n_minimo": 8, "refresco": "on-event"},
    {"id": "x.arbitraje", "lado": "cruce", "medida": "Demanda > oferta a precio X", "unidad": "Δ", "formula": "demanda(tier) − oferta(tier)",
     "fuente": ["marketplace_searches", "developments.units"], "almacen_entrada": ["marketplace_searches", "developments"], "almacen_salida": ALMACEN_SALIDA,
     "dimensiones_aplicables": ["geo", "tipologia", "tier_precio"], "cohorte_comparacion": "misma geo + tier", "n_minimo": 5, "refresco": "on-event"},
    {"id": "x.sobreoferta_subdemanda", "lado": "cruce", "medida": "Desbalance por segmento", "unidad": "ratio", "formula": "inventario / demanda",
     "fuente": ["developments.units", "buyer_signals"], "almacen_entrada": ["developments", "buyer_signals"], "almacen_salida": ALMACEN_SALIDA,
     "dimensiones_aplicables": ["geo", "tipologia"], "cohorte_comparacion": "misma geo + tipología", "n_minimo": 5, "refresco": "on-event"},
    {"id": "x.match_score", "lado": "cruce", "medida": "Ajuste oferta-demanda por segmento", "unidad": "score", "formula": "blend(demanda, oferta, precio)",
     "fuente": ["buyer_signals", "developments.units"], "almacen_entrada": ["buyer_signals", "developments"], "almacen_salida": ALMACEN_SALIDA,
     "dimensiones_aplicables": ["geo", "tipologia", "tier_precio"], "cohorte_comparacion": "misma geo + tier", "n_minimo": 6, "refresco": "on-event"},
    {"id": "x.indice_demanda_revelada", "lado": "cruce", "medida": "Índice DMX propietario de demanda revelada", "unidad": "índice 0-100",
     "formula": "compuesto(vistas, solicitudes, recurrencia, share)", "fuente": ["buyer_signals", "marketplace_searches"], "almacen_entrada": ["buyer_signals"],
     "almacen_salida": ALMACEN_SALIDA, "dimensiones_aplicables": ["geo", "tipologia", "intencion"], "cohorte_comparacion": "ciudad", "n_minimo": 8, "refresco": "on-event"},
    {"id": "x.forecast_absorcion", "lado": "cruce", "medida": "Proyección de absorción próximo trimestre", "unidad": "unidades/mes",
     "formula": "tendencia(absorción + demanda + pipeline)", "fuente": ["developments.units", "buyer_signals"], "almacen_entrada": ["developments", "buyer_signals"],
     "almacen_salida": ALMACEN_SALIDA, "dimensiones_aplicables": ["geo", "tipologia"], "cohorte_comparacion": "misma geo + tipología", "n_minimo": 8, "refresco": "on-event"},
]

REGISTRY_BY_ID = {m["id"]: m for m in REGISTRY}


def registry_overview():
    """Resumen del registro: cuántas medidas por lado + celdas teóricas (producto cartesiano de dims aplicables)."""
    por_lado = {}
    total_celdas = 0
    detalle = []
    for m in REGISTRY:
        prod = 1
        for dim in m["dimensiones_aplicables"]:
            prod *= len(DIMENSIONS.get(dim, [1]))
        total_celdas += prod
        por_lado[m["lado"]] = por_lado.get(m["lado"], 0) + 1
        detalle.append({"id": m["id"], "lado": m["lado"], "medida": m["medida"], "fuente": m["fuente"],
                        "almacen_salida": m["almacen_salida"], "dims": m["dimensiones_aplicables"],
                        "celdas_teoricas": prod, "n_minimo": m["n_minimo"]})
    return {"medidas_base": len(REGISTRY), "por_lado": por_lado, "celdas_teoricas_totales": total_celdas,
            "dimensiones": {k: len(v) for k, v in DIMENSIONS.items()}, "almacen_salida": ALMACEN_SALIDA,
            "detalle": detalle}
