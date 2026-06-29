"""DIMENSION REGISTRY — el catálogo CANÓNICO de hiper-segmentación. Única fuente de verdad de TODAS las dimensiones,
niveles y sub-niveles por los que se puede segmentar el mercado. El árbol, el screener y el frontend leen de aquí.

Cada dimensión declara su campo REAL en backend (o si es derivada / por crear), para que la UI capture sólo lo que existe
y deje LATENTE lo que aún no — y se llene solo conforme entre data. Verificado contra el schema real (dev/unit/signal/search).

estado: real (campo existe y con dato) · derivado (se calcula de otros campos) · por_crear (campo aún no existe → latente).
origen: dev · unit · signal · search · derivado · catastro · externo.
tipo: jerarquico · categorico · banda · booleano · numerico · geo.
"""
from typing import Any, Dict, List, Optional

# ── helper para declarar dimensiones de forma compacta ──────────────────────────
def _d(id, eje, nivel, label, campo=None, origen="derivado", estado="derivado", tipo="categorico",
       parent=None, valores=None, unidad=None, nota=None):
    return {"id": id, "eje": eje, "nivel": nivel, "label": label, "campo": campo, "origen": origen,
            "estado": estado, "tipo": tipo, "parent": parent, "valores": valores, "unidad": unidad, "nota": nota}


# bandas reutilizables (los VALORES de cada segmento — cada uno es un dato independiente)
B_M2 = ["<45", "45-60", "60-80", "80-100", "100-130", "130-180", ">180"]
B_TIER = ["0-2M", "2-3M", "3-5M", "5-8M", "8-12M", "12-20M", "20-35M", "35M+"]
B_PISO = ["PB", "bajo(1-3)", "medio(4-8)", "alto(9-15)", "muy-alto(16-25)", "torre-alta(>25)"]
B_REC = ["studio", "1rec", "2rec", "3rec", "4+rec"]
B_BANOS = ["1", "1.5", "2", "2.5", "3", "3.5+"]
B_CAJONES = ["0", "1", "2", "3+"]
B_AVANCE = ["0-10%", "10-30%", "30-50%", "50-70%", "70-90%", "90-100%"]


DIMENSIONS: List[Dict[str, Any]] = []

# ═══════════════ EJE 1 · DÓNDE (geografía) ═══════════════
# (a) cadena de anidamiento
DIMENSIONS += [
    _d("geo.pais", "DONDE", 0, "País", "city", "dev", "real", "jerarquico", None, ["México"]),
    _d("geo.zona_metro", "DONDE", 1, "Zona metropolitana", None, "derivado", "derivado", "jerarquico", "geo.pais", ["ZMVM"]),
    _d("geo.estado", "DONDE", 2, "Estado", "city", "dev", "real", "jerarquico", "geo.zona_metro", ["CDMX", "Edomex"]),
    _d("geo.alcaldia", "DONDE", 3, "Alcaldía / municipio", "alcaldia", "dev", "real", "jerarquico", "geo.estado"),
    _d("geo.sector", "DONDE", 4, "Sector / distrito", None, "por_crear", "por_crear", "jerarquico", "geo.alcaldia", nota="dividir alcaldía en sectores"),
    _d("geo.corredor", "DONDE", 4, "Corredor inmobiliario", None, "derivado", "derivado", "jerarquico", "geo.alcaldia", nota="cluster de mercado (_corridor)"),
    _d("geo.colonia", "DONDE", 5, "Colonia", "colonia_id", "dev", "real", "jerarquico", "geo.corredor"),
    _d("geo.barrio", "DONDE", 6, "Barrio / sub-colonia", None, "por_crear", "por_crear", "jerarquico", "geo.colonia", nota="ej. Hipódromo dentro de Condesa"),
    _d("geo.cp", "DONDE", 6, "Código postal", "postal_code", "dev", "real", "jerarquico", "geo.colonia"),
    _d("geo.ageb", "DONDE", 7, "AGEB (INEGI)", None, "por_crear", "por_crear", "jerarquico", "geo.cp", nota="join INEGI"),
    _d("geo.manzana", "DONDE", 8, "Manzana", None, "por_crear", "por_crear", "jerarquico", "geo.ageb", nota="join catastro"),
    _d("geo.calle", "DONDE", 9, "Calle / vialidad", "street", "dev", "real", "jerarquico", "geo.manzana"),
    _d("geo.tramo", "DONDE", 10, "Tramo (entre cruces)", None, "por_crear", "por_crear", "jerarquico", "geo.calle"),
    _d("geo.predio", "DONDE", 11, "Predio / lote", "center", "dev", "real", "geo", "geo.calle", nota="lat/lng; cuenta catastral por crear"),
    _d("geo.desarrollo", "DONDE", 12, "Desarrollo / proyecto", "id", "dev", "real", "jerarquico", "geo.predio"),
    _d("geo.torre", "DONDE", 13, "Torre / edificio", None, "por_crear", "por_crear", "jerarquico", "geo.desarrollo", nota="multi-torre"),
    _d("geo.piso", "DONDE", 14, "Piso / nivel", "level", "unit", "real", "banda", "geo.torre", B_PISO),
    _d("geo.unidad", "DONDE", 15, "Unidad / departamento", "unit_number", "unit", "real", "jerarquico", "geo.piso"),
    _d("geo.espacio", "DONDE", 16, "Espacio (recámara/baño/cocina/terraza)", None, "por_crear", "por_crear", "categorico", "geo.unidad", nota="m² por espacio"),
]
# (b) atributos DEL lugar (segmentan en cualquier nivel)
DIMENSIONS += [
    _d("lugar.iso_metro", "DONDE", 0, "Cercanía a metro/metrobús (min)", None, "por_crear", "por_crear", "banda", None, ["<5", "5-10", "10-20", ">20"], "min", "isócrona"),
    _d("lugar.iso_parque", "DONDE", 0, "Cercanía a parque (min)", None, "por_crear", "por_crear", "banda", None, ["<5", "5-15", ">15"], "min"),
    _d("lugar.frente", "DONDE", 0, "Frente a", None, "por_crear", "por_crear", "categorico", None, ["avenida", "calle interior", "parque", "esquina"]),
    _d("lugar.amai", "DONDE", 0, "Nivel socioeconómico (AMAI)", None, "por_crear", "por_crear", "categorico", None, ["A/B", "C+", "C", "C-", "D+"]),
    _d("lugar.uso_suelo", "DONDE", 0, "Uso de suelo (SEDUVI)", None, "por_crear", "por_crear", "categorico", None, nota="zonificación"),
    _d("lugar.potencial", "DONDE", 0, "Niveles permitidos / CUS-COS", "max_level", "dev", "derivado", "numerico", None, nota="potencial constructivo no usado"),
    _d("lugar.sismico", "DONDE", 0, "Zona sísmica (geotécnica)", None, "derivado", "derivado", "categorico", None, ["Lomas(I)", "Transición(II)", "Lago(III)"], nota="natural_risk_layers"),
    _d("lugar.inundacion", "DONDE", 0, "Riesgo de inundación", None, "derivado", "derivado", "banda", None, ["bajo", "medio", "alto"]),
    _d("lugar.hundimiento", "DONDE", 0, "Hundimiento / subsidencia", None, "por_crear", "por_crear", "banda", None),
    _d("lugar.saturacion", "DONDE", 0, "Saturación de oferta (radio)", None, "derivado", "derivado", "banda", None, nota="competencia en radio X"),
    _d("lugar.plusvalia_hist", "DONDE", 0, "Plusvalía histórica", "price_history", "dev", "derivado", "banda", None, "%/año"),
]

# ═══════════════ EJE 2 · QUÉ (producto / ficha técnica) ═══════════════
DIMENSIONS += [
    _d("prod.tipo", "QUE", 0, "Tipo de producto", "property_type", "dev", "real", "categorico", None, ["departamento", "casa", "loft", "PH", "townhouse"]),
    _d("prod.recamaras", "QUE", 1, "Recámaras", "bedrooms", "unit", "real", "banda", None, B_REC),
    _d("prod.cuarto_servicio", "QUE", 2, "Cuarto de servicio", None, "por_crear", "por_crear", "booleano", "prod.recamaras", ["con", "sin"]),
    _d("prod.estudio", "QUE", 2, "Estudio / flex", None, "por_crear", "por_crear", "booleano", "prod.recamaras", ["con", "sin"]),
    _d("prod.banos", "QUE", 1, "Baños", "bathrooms", "unit", "real", "banda", None, B_BANOS),
    _d("prod.banos_tipo", "QUE", 2, "Completos vs medios", None, "por_crear", "por_crear", "categorico", "prod.banos"),
    _d("prod.cajones", "QUE", 1, "Estacionamientos", "parking_spots", "unit", "real", "banda", None, B_CAJONES),
    _d("prod.cajon_tipo", "QUE", 2, "Tipo de cajón", "parking_type", "unit", "real", "categorico", "prod.cajones", ["independiente", "dependiente", "mecánico"]),
    _d("prod.m2_total", "QUE", 1, "Superficie total (m²)", "m2_total", "unit", "real", "banda", None, B_M2, "m²"),
    _d("prod.m2_privativo", "QUE", 2, "m² privativos", "m2_privative", "unit", "real", "numerico", "prod.m2_total", None, "m²"),
    _d("prod.m2_exterior", "QUE", 2, "m² terraza/balcón/roof", "m2_terrace", "unit", "real", "numerico", "prod.m2_total", None, "m²"),
    _d("prod.eficiencia", "QUE", 2, "Eficiencia (privativo/total)", None, "derivado", "derivado", "banda", "prod.m2_total", ["<0.8", "0.8-0.9", ">0.9"]),
    _d("prod.piso", "QUE", 1, "Piso / altura", "level", "unit", "real", "banda", None, B_PISO),
    _d("prod.orientacion", "QUE", 1, "Orientación", "orientation", "unit", "real", "categorico", None, ["norte", "sur", "oriente", "poniente"]),
    _d("prod.asoleamiento", "QUE", 2, "Horas de sol", None, "derivado", "derivado", "banda", "prod.orientacion"),
    _d("prod.vista", "QUE", 1, "Vista", "vista", "unit", "real", "categorico", None, ["interior", "exterior", "parque", "avenida", "panorámica"]),
    # atributos de unidad (cada uno binario = un dato)
    _d("attr.terraza", "QUE", 1, "Terraza", "terraza", "unit", "real", "booleano", None, ["con", "sin"]),
    _d("attr.balcon", "QUE", 1, "Balcón", "balcon", "unit", "real", "booleano", None, ["con", "sin"]),
    _d("attr.roof_garden", "QUE", 1, "Roof garden privado", "roof_garden", "unit", "real", "booleano", None, ["con", "sin"]),
    _d("attr.bodega", "QUE", 1, "Bodega", "bodega", "unit", "real", "booleano", None, ["con", "sin"]),
    _d("attr.pet_friendly", "QUE", 1, "Pet friendly", "pet_friendly", "unit", "real", "booleano", None, ["con", "sin"]),
    _d("attr.estacion_indep", "QUE", 1, "Estacionamiento independiente", "estacionamiento_independiente", "unit", "real", "booleano", None, ["con", "sin"]),
    _d("attr.vestidor", "QUE", 1, "Closet vestidor", None, "por_crear", "por_crear", "booleano", None, ["con", "sin"]),
    _d("attr.doble_altura", "QUE", 1, "Doble altura", None, "por_crear", "por_crear", "booleano", None, ["con", "sin"]),
    _d("attr.domotica", "QUE", 1, "Domótica", None, "por_crear", "por_crear", "booleano", None, ["con", "sin"]),
    _d("attr.cocina_equipada", "QUE", 1, "Cocina equipada", None, "por_crear", "por_crear", "booleano", None, ["con", "sin"]),
    # amenidades del edificio (lista real)
    _d("amen.lista", "QUE", 1, "Amenidades del edificio", "amenities", "dev", "real", "categorico", None, nota="gym/alberca/roof/spa/coworking/24h…"),
    _d("amen.riqueza", "QUE", 2, "Riqueza de amenidades", "amenities", "dev", "derivado", "banda", "amen.lista", ["pocas(<5)", "medias(5-8)", "muchas(>8)"]),
    _d("serv.lista", "QUE", 1, "Servicios (gas/agua/energía/internet)", "servicios", "dev", "real", "categorico", None),
    _d("prod.acabados", "QUE", 1, "Gama de acabados", "memoria_acabados", "dev", "por_crear", "categorico", None, ["básico", "medio", "premium", "lujo"], nota="clasificar memoria_acabados"),
    _d("prod.certificacion", "QUE", 1, "Certificación (LEED/EDGE)", None, "por_crear", "por_crear", "categorico", None),
    _d("prod.etapa", "QUE", 1, "Etapa / entrega", "stage", "dev", "real", "categorico", None, ["preventa", "construcción", "entrega inmediata"]),
    _d("prod.avance", "QUE", 2, "% de avance de obra", "construction_progress", "dev", "real", "banda", "prod.etapa", B_AVANCE),
    _d("prod.entrega_fecha", "QUE", 2, "Fecha de entrega (trimestre)", "delivery_estimate", "dev", "real", "banda", "prod.etapa"),
    _d("prod.estado", "QUE", 1, "Estado", None, "por_crear", "por_crear", "categorico", None, ["nuevo", "reventa", "remate"]),
]

# ═══════════════ EJE 3 · QUIÉN (comprador / demanda) ═══════════════
DIMENSIONS += [
    _d("dem.intencion", "QUIEN", 0, "Intención", "value", "signal", "real", "categorico", None, ["vivir", "invertir", "vacacional", "especular"], nota="zone_intent/meta.intent"),
    _d("dem.intencion_sub", "QUIEN", 1, "Sub-intención", None, "por_crear", "por_crear", "categorico", "dem.intencion", ["primer hogar", "upgrade", "downsizing", "2ª casa"]),
    _d("dem.edad", "QUIEN", 0, "Edad / etapa de vida", None, "por_crear", "por_crear", "categorico", None, ["soltero", "pareja", "familia c/hijos", "nido vacío"]),
    _d("dem.arquetipo", "QUIEN", 0, "Arquetipo (DISC)", None, "derivado", "derivado", "categorico", None, nota="taste/atlax_profile"),
    _d("dem.presupuesto", "QUIEN", 0, "Presupuesto declarado", "precio_max", "search", "real", "banda", None, B_TIER),
    _d("dem.enganche", "QUIEN", 1, "Enganche disponible", None, "search", "latente", "banda", "dem.presupuesto", nota="cotizador: meta.enganche aún sin volumen"),
    _d("dem.credito", "QUIEN", 1, "Capacidad de crédito", None, "search", "latente", "banda", "dem.presupuesto"),
    _d("dem.mensualidad", "QUIEN", 1, "Mensualidad que aguanta", None, "search", "latente", "banda", "dem.presupuesto"),
    _d("dem.plazo", "QUIEN", 1, "Plazo de crédito (años)", "plazo", "search", "real", "banda", "dem.presupuesto", ["10", "15", "20"]),
    _d("dem.fuente_credito", "QUIEN", 1, "Fuente de crédito", None, "por_crear", "por_crear", "categorico", "dem.presupuesto", ["Infonavit", "Fovissste", "bancario", "contado", "cofinanciado"]),
    _d("dem.tir_obj", "QUIEN", 1, "TIR objetivo", None, "latente", "latente", "banda", "dem.intencion", nota="inversionista"),
    _d("dem.cap_obj", "QUIEN", 1, "Cap rate objetivo", None, "latente", "latente", "banda", "dem.intencion"),
    _d("dem.rec_buscadas", "QUIEN", 0, "Recámaras buscadas", "recamaras_min", "search", "real", "banda", None, B_REC),
    _d("dem.banos_buscados", "QUIEN", 0, "Baños buscados", "banos_min", "search", "real", "banda", None, B_BANOS),
    _d("dem.cajones_buscados", "QUIEN", 0, "Cajones buscados", "estacionamientos_min", "search", "real", "banda", None, B_CAJONES),
    _d("dem.amenidades_buscadas", "QUIEN", 0, "Amenidades buscadas", "amenidades", "signal", "real", "categorico", None, nota="meta.amenidades"),
    _d("dem.comportamiento", "QUIEN", 0, "Comportamiento", None, "signal", "real", "categorico", None, ["profundidad", "recurrencia", "velocidad", "foto-dwell", "zoom"], nota="photo_dwell/dwell/compare"),
    _d("dem.origen", "QUIEN", 0, "Origen (vive vs busca)", None, "por_crear", "por_crear", "categorico", None, ["local", "foráneo", "extranjero"]),
    _d("dem.embudo", "QUIEN", 0, "Etapa del embudo", None, "derivado", "derivado", "categorico", None, ["anónimo", "identificado", "caliente", "cierre"]),
    _d("dem.sensibilidad", "QUIEN", 0, "Sensibilidad", None, "derivado", "derivado", "categorico", None, ["precio", "ubicación", "amenidad", "entrega"]),
]

# ═══════════════ EJE 4 · CUÁNDO (tiempo) ═══════════════
DIMENSIONS += [
    _d("t.grano", "CUANDO", 0, "Granularidad", "created_at_dt", "signal", "real", "categorico", None, ["hora", "día", "semana", "quincena", "mes", "trimestre", "año"]),
    _d("t.ventana", "CUANDO", 0, "Ventana", "created_at_dt", "signal", "real", "categorico", None, ["7d", "30d", "90d", "6m", "12m", "YoY"]),
    _d("t.cohorte", "CUANDO", 1, "Cohorte", "fecha_lanzamiento", "dev", "real", "categorico", None, ["de lanzamiento", "de lead", "de cierre"]),
    _d("t.estacionalidad", "CUANDO", 0, "Estacionalidad", None, "derivado", "derivado", "categorico", None, ["alta", "baja"]),
    _d("t.ciclo", "CUANDO", 0, "Fase de ciclo", None, "derivado", "derivado", "categorico", None, ["expansión", "pico", "contracción", "valle"], nota="zone_cycle_engine"),
    _d("t.momentum", "CUANDO", 0, "Momentum (velocidad/aceleración)", None, "derivado", "derivado", "numerico", None, nota="1ª y 2ª derivada"),
]

# ═══════════════ EJE 5 · PRECIO / TRANSACCIÓN ═══════════════
DIMENSIONS += [
    _d("px.lista_m2", "PRECIO", 0, "Precio de lista por m²", "price", "unit", "real", "banda", None, nota="$/m²"),
    _d("px.lista_abs", "PRECIO", 0, "Precio de lista absoluto", "price", "unit", "real", "banda", None, B_TIER),
    _d("px.tier", "PRECIO", 0, "Rango de precio", "price", "unit", "real", "banda", None, B_TIER),
    _d("px.cerrado_m2", "PRECIO", 1, "Precio de cierre por m²", None, "latente", "latente", "banda", "px.lista_m2", nota="transactions thin"),
    _d("px.descuento", "PRECIO", 1, "Descuento de negociación", None, "latente", "latente", "banda", "px.lista_abs", nota="lista vs cierre"),
    _d("px.esquema", "PRECIO", 0, "Esquema de pago", "creditos_aceptados", "dev", "derivado", "categorico", None, nota="payment_schemes"),
    _d("px.enganche_pct", "PRECIO", 1, "% de enganche", None, "derivado", "derivado", "banda", "px.esquema", ["5-10%", "10-20%", "20-30%", ">30%"]),
    _d("px.mensualidades_obra", "PRECIO", 1, "Mensualidades durante obra", None, "por_crear", "por_crear", "banda", "px.esquema"),
    _d("px.ajuste_velocidad", "PRECIO", 1, "Velocidad de ajuste de precio", "price_history", "dev", "derivado", "banda", "px.lista_abs"),
]

# ═══════════════ EJE 6 · OFERENTE / COMPETENCIA ═══════════════
DIMENSIONS += [
    _d("of.desarrollador", "OFERENTE", 0, "Desarrollador", "developer_id", "dev", "real", "categorico", None),
    _d("of.marca", "OFERENTE", 1, "Marca", None, "por_crear", "por_crear", "categorico", "of.desarrollador"),
    _d("of.gama", "OFERENTE", 1, "Gama", None, "por_crear", "por_crear", "categorico", "of.desarrollador", ["económica", "media", "residencial", "lujo"]),
    _d("of.track_record", "OFERENTE", 1, "Track record (entrega a tiempo)", "construction_progress", "dev", "por_crear", "banda", "of.desarrollador"),
    _d("of.unidades_estado", "OFERENTE", 0, "Estado de unidades", "units_sold", "dev", "real", "categorico", None, ["disponibles", "reservadas", "vendidas"]),
    _d("of.concentracion", "OFERENTE", 0, "Concentración de mercado", None, "derivado", "derivado", "banda", None, nota="# jugadores por colonia"),
    _d("of.bróker", "OFERENTE", 0, "Bróker / asesor", None, "por_crear", "por_crear", "categorico", None),
]

# ═══════════════ EJE 7 · RIESGO (transversal) ═══════════════
DIMENSIONS += [
    _d("rk.sismico", "RIESGO", 0, "Riesgo sísmico", None, "derivado", "derivado", "categorico", None, ["bajo", "medio", "alto"], nota="natural_risk_layers"),
    _d("rk.inundacion", "RIESGO", 0, "Riesgo de inundación", None, "derivado", "derivado", "categorico", None, ["bajo", "medio", "alto"]),
    _d("rk.crimen", "RIESGO", 0, "Riesgo de crimen", None, "derivado", "derivado", "banda", None, nota="crime_zone_colonia"),
    _d("rk.sobreoferta", "RIESGO", 0, "Riesgo de sobreoferta", None, "derivado", "derivado", "banda", None, nota="pipeline ÷ absorción"),
    _d("rk.iliquidez", "RIESGO", 0, "Riesgo de iliquidez", None, "derivado", "derivado", "banda", None, nota="meses para vender"),
    _d("rk.legal", "RIESGO", 0, "Riesgo legal (régimen/gravamen)", None, "por_crear", "por_crear", "categorico", None),
    _d("rk.credito", "RIESGO", 0, "Riesgo de crédito del segmento", None, "por_crear", "por_crear", "banda", None),
]

# ═══════════════ PRECIO / TRANSACCIÓN · hiper-segmentado a fondo ═══════════════
DIMENSIONS += [
    _d("px.por_recamara", "PRECIO", 1, "Precio por recámara", "price", "unit", "derivado", "banda", "px.lista_abs", nota="price/bedrooms"),
    _d("px.privativo_vs_vendible", "PRECIO", 1, "Precio m² privativo vs vendible", "m2_privative", "unit", "derivado", "banda", "px.lista_m2"),
    _d("px.percentil_colonia", "PRECIO", 1, "Percentil de precio en la colonia", "price", "unit", "derivado", "banda", "px.tier", ["p10", "p25", "p50", "p75", "p90"]),
    _d("px.hedonico", "PRECIO", 1, "Precio explicado por atributo (hedónico)", None, "derivado", "derivado", "numerico", "px.lista_m2", nota="cuánto del precio aporta cada feature"),
    _d("px.enganche_pct_detalle", "PRECIO", 2, "Enganche %", "creditos_aceptados", "dev", "derivado", "banda", "px.esquema", ["5%", "10%", "15%", "20%", "30%"]),
    _d("px.enganche_monto", "PRECIO", 2, "Enganche monto", None, "derivado", "derivado", "banda", "px.esquema"),
    _d("px.enganche_momento", "PRECIO", 2, "Momento del enganche", None, "por_crear", "por_crear", "categorico", "px.esquema", ["firma", "preventa", "diferido"]),
    _d("px.mensualidades_num", "PRECIO", 2, "# de mensualidades en obra", None, "por_crear", "por_crear", "banda", "px.esquema"),
    _d("px.mensualidades_pct", "PRECIO", 2, "% pagado durante obra", None, "por_crear", "por_crear", "banda", "px.esquema"),
    _d("px.contra_entrega_pct", "PRECIO", 2, "% contra-entrega", None, "por_crear", "por_crear", "banda", "px.esquema"),
    _d("px.tasa_implicita", "PRECIO", 2, "Tasa implícita del esquema", None, "derivado", "derivado", "banda", "px.esquema"),
    _d("px.dispersion_dev", "PRECIO", 1, "Dispersión de precios en el dev", "price", "unit", "derivado", "banda", "px.lista_abs", nota="rango/desv"),
    _d("px.ajustes_num", "PRECIO", 1, "# de ajustes de precio", "price_history", "dev", "derivado", "banda", "px.ajuste_velocidad"),
    _d("px.apreciacion_velocidad", "PRECIO", 1, "Velocidad de apreciación", "price_history", "dev", "derivado", "banda", "px.lista_abs", None, "%/año"),
    _d("px.relativo_cohorte", "PRECIO", 1, "Precio vs cohorte comparable", "price", "unit", "derivado", "banda", "px.tier"),
    _d("px.comision_broker", "PRECIO", 1, "Comisión del bróker", None, "por_crear", "por_crear", "banda", None),
    _d("px.costos_cierre", "PRECIO", 1, "Costos de cierre (ISAI/notario/avalúo)", None, "por_crear", "por_crear", "banda", None),
    _d("px.financiamiento_tasa", "PRECIO", 1, "Tasa de financiamiento / CAT", None, "por_crear", "por_crear", "banda", "px.esquema"),
    _d("px.banco", "PRECIO", 1, "Banco / producto de crédito", None, "por_crear", "por_crear", "categorico", "px.esquema", ["Infonavit", "Fovissste", "bancario", "cofinanciado"]),
]

# ═══════════════ OFERENTE / COMPETENCIA · hiper-segmentado a fondo ═══════════════
DIMENSIONS += [
    _d("of.tamano", "OFERENTE", 1, "Tamaño del desarrollador", None, "por_crear", "por_crear", "categorico", "of.desarrollador", ["boutique", "mediano", "grande", "institucional"]),
    _d("of.antiguedad", "OFERENTE", 1, "Antigüedad / experiencia", None, "por_crear", "por_crear", "banda", "of.desarrollador"),
    _d("of.num_proyectos", "OFERENTE", 1, "# de proyectos", None, "derivado", "derivado", "banda", "of.desarrollador"),
    _d("of.salud_financiera", "OFERENTE", 1, "Salud financiera", None, "por_crear", "por_crear", "categorico", "of.desarrollador"),
    _d("of.velocidad_hist", "OFERENTE", 1, "Velocidad de venta histórica", None, "derivado", "derivado", "banda", "of.desarrollador"),
    _d("of.calidad_resenas", "OFERENTE", 1, "Calidad (reseñas)", None, "derivado", "latente", "banda", "of.desarrollador", nota="reviews_residents_cache"),
    _d("of.litigios", "OFERENTE", 1, "Litigios / quejas", None, "por_crear", "por_crear", "banda", "of.desarrollador"),
    _d("of.hhi", "OFERENTE", 1, "Concentración (HHI por colonia)", None, "derivado", "derivado", "banda", "of.concentracion"),
    _d("of.share_lider", "OFERENTE", 1, "Share del líder", "units_total", "dev", "derivado", "banda", "of.concentracion"),
    _d("of.pipeline", "OFERENTE", 1, "Pipeline del competidor (qué lanzará)", None, "por_crear", "por_crear", "categorico", "of.desarrollador"),
    _d("of.pos_precio", "OFERENTE", 1, "Posición de precio vs rivales", "price_from", "dev", "derivado", "banda", "of.desarrollador", nota="battle_card"),
    _d("of.pos_amenidades", "OFERENTE", 1, "Posición de amenidades vs rivales", "amenities", "dev", "derivado", "banda", "of.desarrollador"),
    _d("of.pos_absorcion", "OFERENTE", 1, "Posición de absorción vs rivales", "units_sold", "dev", "derivado", "banda", "of.desarrollador"),
    _d("of.canal_venta", "OFERENTE", 1, "Canal de venta", None, "por_crear", "por_crear", "categorico", None, ["directo", "bróker", "portal", "showroom"]),
    _d("of.broker_conversion", "OFERENTE", 2, "Conversión del bróker", None, "derivado", "latente", "banda", "of.bróker"),
    _d("of.broker_respuesta", "OFERENTE", 2, "Tiempo de respuesta del bróker", None, "derivado", "latente", "banda", "of.bróker"),
]

# ═══════════════ RIESGO · hiper-segmentado a fondo ═══════════════
DIMENSIONS += [
    _d("rk.sismico_micro", "RIESGO", 1, "Microzonificación sísmica", None, "derivado", "derivado", "categorico", "rk.sismico", ["Lomas(I)", "Transición(II)", "Lago(III)"]),
    _d("rk.sismico_pml", "RIESGO", 1, "PML sísmico estimado", None, "por_crear", "por_crear", "banda", "rk.sismico", None, "% del valor"),
    _d("rk.sismico_norma", "RIESGO", 1, "Norma sísmica (año de construcción)", None, "por_crear", "por_crear", "categorico", "rk.sismico", ["pre-1985", "1985-2004", "2004-2017", "post-2017"]),
    _d("rk.hundimiento_cm", "RIESGO", 1, "Hundimiento (cm/año)", None, "por_crear", "por_crear", "banda", "rk.inundacion"),
    _d("rk.falla", "RIESGO", 1, "Falla / grieta / ladera", None, "por_crear", "por_crear", "categorico", "rk.sismico"),
    _d("rk.volatilidad_precio", "RIESGO", 1, "Volatilidad de precio", "price_history", "dev", "derivado", "banda", "rk.iliquidez"),
    _d("rk.concentracion_demanda", "RIESGO", 1, "Concentración de demanda (1 segmento)", None, "derivado", "derivado", "banda", "rk.sobreoferta"),
    _d("rk.regimen", "RIESGO", 1, "Régimen de propiedad / condominio", None, "por_crear", "por_crear", "categorico", "rk.legal"),
    _d("rk.gravamenes", "RIESGO", 1, "Gravámenes / hipotecas", None, "por_crear", "por_crear", "booleano", "rk.legal"),
    _d("rk.permisos", "RIESGO", 1, "Permisos / manifestación de obra", None, "por_crear", "por_crear", "categorico", "rk.legal"),
    _d("rk.morosidad_segmento", "RIESGO", 1, "Morosidad esperada del segmento", None, "por_crear", "por_crear", "banda", "rk.credito"),
    _d("rk.dscr", "RIESGO", 1, "DSCR del segmento", None, "latente", "latente", "banda", "rk.credito"),
    _d("rk.reputacional", "RIESGO", 1, "Reputacional (reseñas negativas)", None, "derivado", "latente", "banda", None),
    _d("rk.macro_tasa", "RIESGO", 1, "Sensibilidad a tasa de interés", None, "derivado", "derivado", "banda", None, nota="CETES/Banxico"),
    _d("rk.macro_fx", "RIESGO", 1, "Sensibilidad a tipo de cambio (extranjeros)", None, "por_crear", "por_crear", "banda", None),
    _d("rk.macro_construccion", "RIESGO", 1, "Inflación de costo de construcción", None, "derivado", "derivado", "banda", None),
]

# ═══════════════ EJE 8 · SEÑALES (las 10 ideas-upgrade, ahora como dimensiones) ═══════════════
DIMENSIONS += [
    _d("sig.preferencia_revelada", "SENALES", 0, "Preferencia revelada vs declarada", None, "derivado", "derivado", "numerico", None, nota="qué mira/compara vs qué dice — moat de comportamiento"),
    _d("sig.dap_atributo", "SENALES", 0, "Disposición a pagar por atributo (por segmento)", None, "derivado", "derivado", "numerico", None, nota="x.dap_atributo, por zona×tipología"),
    _d("sig.whitespace", "SENALES", 0, "Whitespace (buscado con 0 oferta)", None, "derivado", "derivado", "categorico", None, nota="unmet_combos a nivel ficha"),
    _d("sig.sustitucion", "SENALES", 0, "Sustitución / segunda opción", None, "derivado", "derivado", "categorico", None, nota="co_viewed — grafo de competencia real"),
    _d("sig.calentamiento", "SENALES", 0, "Índice de calentamiento (aceleración)", None, "derivado", "derivado", "numerico", None, nota="2ª derivada de demanda"),
    _d("sig.sobreoferta_predictiva", "SENALES", 0, "Sobreoferta predictiva", None, "derivado", "derivado", "banda", None, nota="pipeline ÷ absorción futura"),
    _d("sig.profundidad_mercado", "SENALES", 0, "Profundidad de mercado por ficha", None, "derivado", "derivado", "numerico", None, nota="compradores activos por combinación"),
    _d("sig.migracion", "SENALES", 0, "Migración intencional (origen→destino)", None, "por_crear", "por_crear", "categorico", None, nota="de dónde viene la demanda"),
    _d("sig.market_basket", "SENALES", 0, "Afinidad de atributos (market basket)", None, "derivado", "derivado", "categorico", None, nota="qué se busca junto — bundles óptimos"),
    _d("sig.brecha_deseo_capacidad", "SENALES", 0, "Brecha deseo vs capacidad", None, "latente", "latente", "banda", None, nota="busca vs puede pagar"),
    _d("sig.liquidez", "SENALES", 0, "Score de liquidez por segmento", None, "derivado", "derivado", "banda", None, nota="qué tan rápido se vende/revende"),
    _d("sig.competitividad_precio", "SENALES", 0, "Competitividad de precio (AVM por segmento)", None, "derivado", "derivado", "numerico", None, nota="¿bien puesto el precio?"),
    _d("sig.elasticidad", "SENALES", 0, "Elasticidad precio-demanda por segmento", None, "derivado", "derivado", "numerico", None, nota="x.elasticidad_precio"),
]

# ═══════════════ EJE 9 · DATO (calidad / confianza — meta, para filtrar por solidez) ═══════════════
DIMENSIONS += [
    _d("meta.n", "DATO", 0, "Tamaño de muestra (n)", None, "derivado", "derivado", "banda", None, ["<10", "10-30", "30-100", ">100"]),
    _d("meta.confianza", "DATO", 0, "Confianza del dato", None, "derivado", "derivado", "categorico", None, ["alta", "media", "baja"]),
    _d("meta.frescura", "DATO", 0, "Frescura (qué tan reciente)", None, "derivado", "derivado", "banda", None, ["hoy", "<7d", "<30d", ">30d"]),
    _d("meta.cobertura", "DATO", 0, "Cobertura del segmento", None, "derivado", "derivado", "banda", None, nota="% de la ficha con dato real"),
    _d("meta.estado_dato", "DATO", 0, "Estado del dato", None, "derivado", "derivado", "categorico", None, ["real", "derivado", "latente", "por_crear"]),
]

# ═══════════════ complementos (QUE / QUIEN) que sumé ═══════════════
DIMENSIONS += [
    _d("prod.esg", "QUE", 1, "Sostenibilidad / ESG", None, "por_crear", "por_crear", "categorico", None, ["sí", "no"]),
    _d("prod.smart", "QUE", 1, "Edificio inteligente / fibra", "servicios", "dev", "derivado", "booleano", None, ["sí", "no"]),
    _d("dem.fiscal", "QUIEN", 1, "Perfil fiscal (deducibilidad/RESICO/ISR)", None, "por_crear", "por_crear", "categorico", "dem.intencion"),
    _d("dem.liquidez_salida", "QUIEN", 1, "Necesidad de liquidez de salida", None, "por_crear", "por_crear", "banda", "dem.intencion", nota="inversionista: facilidad de reventa"),
]

# ── índice por id + helpers ─────────────────────────────────────────────────────
BY_ID = {d["id"]: d for d in DIMENSIONS}
EJES = ["DONDE", "QUE", "QUIEN", "CUANDO", "PRECIO", "OFERENTE", "RIESGO", "SENALES", "DATO"]


def overview() -> Dict[str, Any]:
    from collections import Counter
    por_eje = Counter(d["eje"] for d in DIMENSIONS)
    por_estado = Counter(d["estado"] for d in DIMENSIONS)
    return {
        "total_dimensiones": len(DIMENSIONS),
        "por_eje": dict(por_eje), "por_estado": dict(por_estado),
        "leyenda_estado": {"real": "campo existe con dato", "derivado": "se calcula", "latente": "campo existe, sin volumen", "por_crear": "falta el campo (se llena al capturarlo)"},
        "ejes": EJES,
    }


def by_eje(eje: str) -> List[Dict[str, Any]]:
    return sorted([d for d in DIMENSIONS if d["eje"] == eje], key=lambda x: (x["nivel"], x["id"]))


def arbol(eje: Optional[str] = None) -> List[Dict[str, Any]]:
    """Devuelve las dimensiones como árbol (parent→children) para pintar la jerarquía."""
    dims = DIMENSIONS if not eje else [d for d in DIMENSIONS if d["eje"] == eje]
    by_parent: Dict[Optional[str], List] = {}
    for d in dims:
        by_parent.setdefault(d["parent"], []).append(d)

    def build(pid):
        return [{**d, "hijos": build(d["id"])} for d in sorted(by_parent.get(pid, []), key=lambda x: x["nivel"])]
    roots = [d for d in dims if d["parent"] is None or d["parent"] not in BY_ID or (eje and BY_ID.get(d["parent"], {}).get("eje") != eje)]
    seen = set()
    out = []
    for d in sorted(roots, key=lambda x: (x["nivel"], x["id"])):
        if d["id"] in seen:
            continue
        seen.add(d["id"])
        out.append({**d, "hijos": build(d["id"])})
    return out
