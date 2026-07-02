"""
DMX · CONTRATO DE DATO MAESTRO — La Unidad Milimétrica (el átomo de la espina)
═══════════════════════════════════════════════════════════════════════════════
Re-arquitectura total IA-first. Este es el GRANO del que agrega todo el cubo OLAP
y del que cuelgan todas las lentes (superadmin god-view, dev, asesor, marketplace, API).

Principios (founder rulings 2026-06-02):
  · "Sin datos ≠ humo": TODO campo es Optional/None. Sin dato = null, listo para
    activarse cuando llegue (NLP de brochure, captura manual, conector externo).
  · Multi-tenant molde: cada Development lleva org/tenant/developer. Superadmin ve
    todo; dev/asesor ven su slice. El scoping NO vive aquí (vive en tenant_scope),
    pero los campos de pertenencia sí.
  · Snapshots temporales: las medidas de mercado se persisten append-only en otra
    colección; este contrato describe el ESTADO actual de la entidad.

Jerarquía: Developer → Development → Prototype → Unit (+ Amenity, Zone como refs).
Ref doc: memory/DMX_SPINE_MASTER.md (grupos A-Q), memory/DMX_BUILD_CHECKLIST.md.

Compatible Pydantic v1/v2 (Optional + Field(None, ...), enums str).
"""
from __future__ import annotations

from enum import Enum
from typing import List, Optional, Dict
from datetime import datetime

from pydantic import BaseModel, Field


# ═══════════════════════════════════════════════════════════════════════════════
# ENUMS — vocabularios controlados
# ═══════════════════════════════════════════════════════════════════════════════

class Tipologia(str, Enum):
    estudio = "estudio"
    loft = "loft"
    depto_1r = "1_recamara"
    depto_2r = "2_recamaras"
    depto_3r = "3_recamaras"
    depto_4r = "4_mas_recamaras"
    penthouse = "penthouse"
    garden_house = "garden_house"
    duplex = "duplex"
    triplex = "triplex"
    flat = "flat"
    casa = "casa"


class PosicionVertical(str, Enum):
    planta_baja = "planta_baja"
    intermedio = "intermedio"
    penthouse = "penthouse"
    garden = "garden"
    roof = "roof"


class Orientacion(str, Enum):
    norte = "N"; sur = "S"; este = "E"; oeste = "O"
    noreste = "NE"; noroeste = "NO"; sureste = "SE"; suroeste = "SO"


class Vista(str, Enum):
    calle = "calle"
    interior = "interior"
    patio = "patio"
    parque = "parque"
    ciudad = "ciudad"
    area_verde = "area_verde"
    avenida = "avenida"


# F · Estacionamiento — ENUM completo (énfasis del founder)
class ParkingArreglo(str, Enum):
    independiente = "independiente"
    en_bateria = "en_bateria"
    en_bateria_compartida = "en_bateria_compartida"
    independiente_compartido = "independiente_compartido"


class ParkingMecanismo(str, Enum):
    al_nivel = "al_nivel"                       # cajón normal, sin mecanismo
    eleva_autos_independiente = "eleva_autos_independiente"
    eleva_autos_compartido = "eleva_autos_compartido"
    hidraulico = "hidraulico"
    automatizado = "automatizado"               # puzzle / robotic


class UnitStatus(str, Enum):
    disponible = "disponible"
    apartado = "apartado"
    reservado = "reservado"
    vendido = "vendido"
    bloqueado = "bloqueado"
    escriturado = "escriturado"


class CreditoAceptado(str, Enum):
    infonavit = "infonavit"
    fovissste = "fovissste"
    bancario = "bancario"
    cofinavit = "cofinavit"
    contado = "contado"


class NivelAcabado(str, Enum):
    gris = "gris"                # obra gris
    blanco = "blanco"            # obra blanca
    llave_en_mano = "llave_en_mano"
    amueblado = "amueblado"


class Regimen(str, Enum):
    condominio = "condominio"
    propiedad = "propiedad"
    fideicomiso = "fideicomiso"


class EtapaConstruccion(str, Enum):
    preventa = "preventa"
    preventa_avanzada = "preventa_avanzada"
    construccion = "construccion"
    entrega_inmediata = "entrega_inmediata"
    entregado = "entregado"


class AmenityCategory(str, Enum):
    wellness = "wellness"
    work = "work"
    family = "family"
    social = "social"
    security = "security"
    pet = "pet"
    parking = "parking"
    sustainability = "sustainability"
    technology = "technology"
    services = "services"
    outdoor = "outdoor"
    accessibility = "accessibility"


# G · Taxonomía canónica de amenidades (~55) — extiende AMENITY_CATALOG de studio_property_intake_schema
AMENITY_TAXONOMY: Dict[str, List[str]] = {
    "wellness":       ["alberca_techada", "alberca_exterior", "alberca_infantil", "jacuzzi", "sauna", "vapor", "spa", "gym", "yoga_deck", "salon_masaje"],
    "work":           ["coworking", "salas_juntas", "business_center", "cabinas_llamadas", "wifi_premium"],
    "family":         ["area_infantil", "ludoteca", "salon_gamer", "splash_pad", "guarderia"],
    "social":         ["roof_garden", "sky_bar", "asadores", "fire_pit", "salon_usos_multiples", "salon_eventos", "cocina_chef", "comedor_privado", "cine", "cava_vinos"],
    "security":       ["vigilancia_24_7", "concierge", "control_acceso_biometrico", "control_acceso_tarjeta", "cctv", "caseta", "boton_panico", "ronda"],
    "pet":            ["pet_park", "pet_spa", "pet_wash", "dog_park"],
    "parking":        ["estacionamiento_visitas", "ev_charging_comun", "biciestacionamiento", "car_wash", "valet"],
    "sustainability": ["paneles_solares", "calentador_solar", "captacion_pluvial", "planta_tratamiento", "medicion_individual", "iluminacion_led", "certificacion_leed", "certificacion_edge"],
    "technology":     ["domotica", "cerradura_inteligente", "termostato_smart", "smart_lockers", "fibra_optica", "app_edificio"],
    "services":       ["lavanderia", "tintoreria", "paqueteria", "limpieza", "mantenimiento"],
    "outdoor":        ["huerto_urbano", "jardin_zen", "asoleadero", "terraza_comun", "running_track", "cancha_padel", "cancha_tenis", "cancha_multiusos"],
    "accessibility":  ["rampas", "elevador_accesible", "estacionamiento_accesible"],
}


# ═══════════════════════════════════════════════════════════════════════════════
# SUB-MODELOS de la UNIDAD (grupos A-Q)
# ═══════════════════════════════════════════════════════════════════════════════

class UnitPosition(BaseModel):
    """A · Posición física."""
    torre: Optional[str] = None
    piso: Optional[int] = Field(None, ge=-10, le=200)
    numero: Optional[str] = None
    niveles_unidad: Optional[int] = Field(None, ge=1, le=5)          # 1=flat, 2=duplex, 3=triplex
    posicion_vertical: Optional[PosicionVertical] = None
    orientacion: Optional[Orientacion] = None
    vista: Optional[Vista] = None
    esquina: Optional[bool] = None
    horas_luz_dia: Optional[float] = Field(None, ge=0, le=24)


class UnitAreas(BaseModel):
    """C · Áreas en m²."""
    m2_construido: Optional[float] = Field(None, ge=5, le=10000)
    m2_privativo: Optional[float] = Field(None, ge=5, le=10000)       # interior
    m2_terreno: Optional[float] = Field(None, ge=0, le=100000)        # casas
    m2_terraza: Optional[float] = Field(None, ge=0, le=2000)
    m2_balcon: Optional[float] = Field(None, ge=0, le=1000)
    m2_roof_garden_privado: Optional[float] = Field(None, ge=0, le=3000)
    m2_jardin_privado: Optional[float] = Field(None, ge=0, le=10000)
    doble_altura: Optional[bool] = None
    altura_techo_m: Optional[float] = Field(None, ge=2, le=12)


class UnitInteriorSpaces(BaseModel):
    """B+D · Recámaras, baños y espacios interiores."""
    recamaras: Optional[int] = Field(None, ge=0, le=20)
    recamaras_en_suite: Optional[int] = Field(None, ge=0, le=20)
    recamara_principal_vestidor: Optional[bool] = None
    banos_completos: Optional[int] = Field(None, ge=0, le=20)
    medios_banos: Optional[int] = Field(None, ge=0, le=10)
    cuarto_servicio: Optional[bool] = None
    bano_servicio: Optional[bool] = None
    estudio_home_office: Optional[bool] = None
    family_room: Optional[bool] = None
    vestidor: Optional[bool] = None
    closet_blancos: Optional[bool] = None
    cocina_tipo: Optional[str] = None                # integral / cerrada / isla
    antecomedor: Optional[bool] = None
    lavanderia: Optional[str] = None                 # interior / comun
    chimenea: Optional[bool] = None
    jacuzzi_privado: Optional[bool] = None
    alberca_privada: Optional[bool] = None


class StorageSpace(BaseModel):
    """E · Bodega (puede haber varias)."""
    incluida: Optional[bool] = None
    m2: Optional[float] = Field(None, ge=0, le=500)
    ubicacion: Optional[str] = None                  # sotano / mismo_piso
    opcional: Optional[bool] = None                  # asignada vs costo extra
    costo_extra_mxn: Optional[float] = Field(None, ge=0)


class ParkingSpot(BaseModel):
    """F · Cajón de estacionamiento (ENUM completo)."""
    arreglo: Optional[ParkingArreglo] = None
    mecanismo: Optional[ParkingMecanismo] = None
    techado: Optional[bool] = None
    ev_charger: Optional[bool] = None
    para_visitas: Optional[bool] = None
    para_moto: Optional[bool] = None
    para_bici: Optional[bool] = None
    costo_extra_mxn: Optional[float] = Field(None, ge=0)


class UnitFinishes(BaseModel):
    """J · Acabados a detalle."""
    nivel: Optional[NivelAcabado] = None
    piso: Optional[str] = None                       # madera / porcelanico / marmol / laminado
    cocina_cubierta: Optional[str] = None            # cuarzo / granito / laminado
    cocina_marca: Optional[str] = None
    banos_griferia_marca: Optional[str] = None
    ventaneria: Optional[str] = None                 # pvc / aluminio / doble_cristal_acustico
    herreria: Optional[str] = None
    personalizable: Optional[bool] = None


class UnitSustainability(BaseModel):
    """K · Sustentabilidad y domótica (de la unidad)."""
    paneles_solares: Optional[bool] = None
    calentador_solar: Optional[bool] = None
    medicion_individual: Optional[bool] = None       # agua/luz/gas medidos por unidad
    doble_cristal: Optional[bool] = None
    cerradura_inteligente: Optional[bool] = None
    termostato_smart: Optional[bool] = None
    persianas_automaticas: Optional[bool] = None
    fibra_incluida: Optional[bool] = None
    certificacion: Optional[str] = None              # EDGE / LEED


class UnitLegal(BaseModel):
    """L · Legal / jurídico."""
    regimen: Optional[Regimen] = None
    escriturable: Optional[bool] = None
    libre_gravamen: Optional[bool] = None
    predial_al_corriente: Optional[bool] = None
    uso_suelo: Optional[str] = None
    pet_friendly: Optional[bool] = None
    pet_limite_kg: Optional[float] = Field(None, ge=0, le=100)
    accesible: Optional[bool] = None


class UnitRecurringCosts(BaseModel):
    """I · Costos recurrentes."""
    mantenimiento_mensual_mxn: Optional[float] = Field(None, ge=0)
    mantenimiento_mxn_m2: Optional[float] = Field(None, ge=0)
    fondo_reserva_mxn: Optional[float] = Field(None, ge=0)
    predial_anual_mxn: Optional[float] = Field(None, ge=0)
    servicios_incluidos: Optional[List[str]] = None  # agua / gas / seguridad / limpieza
    cuota_amenidades_mxn: Optional[float] = Field(None, ge=0)


class UnitCommercial(BaseModel):
    """M · Comercial / transaccional (el oro del cubo)."""
    precio_lista_mxn: Optional[float] = Field(None, ge=0)
    precio_m2_lista_mxn: Optional[float] = Field(None, ge=0)
    precio_cierre_mxn: Optional[float] = Field(None, ge=0)
    precio_m2_cierre_mxn: Optional[float] = Field(None, ge=0)
    spread_pct: Optional[float] = None               # (lista-cierre)/lista
    descuento_pct: Optional[float] = Field(None, ge=0, le=100)
    enganche_pct: Optional[float] = Field(None, ge=0, le=100)
    mensualidades_preventa: Optional[int] = Field(None, ge=0, le=120)
    contra_entrega_pct: Optional[float] = Field(None, ge=0, le=100)
    financiamiento_desarrollador: Optional[bool] = None
    creditos_aceptados: Optional[List[CreditoAceptado]] = None
    status: Optional[UnitStatus] = None
    fecha_alta: Optional[datetime] = None
    fecha_aparta: Optional[datetime] = None
    fecha_reserva: Optional[datetime] = None
    fecha_cierre: Optional[datetime] = None
    fecha_escritura: Optional[datetime] = None
    dias_en_mercado: Optional[int] = Field(None, ge=0)
    reservas_caidas: Optional[int] = Field(None, ge=0)
    promociones: Optional[List[str]] = None          # MSI / pronto_pago / paquete_acabados


class UnitDemand(BaseModel):
    """O · Demanda (del flujo · IA)."""
    leads: Optional[int] = Field(None, ge=0)
    visitas_agendadas: Optional[int] = Field(None, ge=0)
    visitas_hechas: Optional[int] = Field(None, ge=0)
    vistas_portal: Optional[int] = Field(None, ge=0)
    favoritos: Optional[int] = Field(None, ge=0)
    comparaciones: Optional[int] = Field(None, ge=0)
    disc_interesados: Optional[Dict[str, int]] = None    # {D: n, I: n, S: n, C: n}
    objeciones: Optional[List[str]] = None
    micro_commitments: Optional[List[str]] = None        # 2a_visita / pregunto_credito / trajo_familia
    prob_venta: Optional[float] = Field(None, ge=0, le=1)  # ML: prob. de cerrar esta unidad


class UnitInvestment(BaseModel):
    """P · Inversión / renta."""
    roi_renta_larga_pct: Optional[float] = None
    roi_renta_corta_pct: Optional[float] = None          # AirROI/AirDNA
    yield_bruto_pct: Optional[float] = None
    yield_neto_pct: Optional[float] = None
    plusvalia_12m_pct: Optional[float] = None
    plusvalia_24m_pct: Optional[float] = None
    plusvalia_60m_pct: Optional[float] = None
    mensualidad_credito_mxn: Optional[float] = Field(None, ge=0)
    punto_equilibrio_meses: Optional[int] = Field(None, ge=0)
    hold_period_optimo_meses: Optional[int] = Field(None, ge=0)


class UnitGeoSnapshot(BaseModel):
    """Q · Geo denormalizado en la unidad (heredado del development, opcional para queries rápidas)."""
    calle: Optional[str] = None
    numero: Optional[str] = None
    cp: Optional[str] = None
    colonia_id: Optional[str] = None
    alcaldia: Optional[str] = None
    ageb: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    zona_id: Optional[str] = None


# ═══════════════════════════════════════════════════════════════════════════════
# LA UNIDAD (el átomo)
# ═══════════════════════════════════════════════════════════════════════════════

class Unit(BaseModel):
    """
    El grano de toda la espina. Una unidad vendible. TODO nullable: lo que no se
    sabe hoy se autollena después (NLP/captura/conector) sin romper nada.
    """
    # Identidad + pertenencia (multi-tenant)
    unit_id: str
    development_id: str
    prototype_id: Optional[str] = None
    org_id: Optional[str] = None                 # denormalizado para scoping y cubo
    developer_id: Optional[str] = None
    sku: Optional[str] = None

    # Tipología
    tipologia: Optional[Tipologia] = None

    # Grupos (sub-modelos)
    position: UnitPosition = Field(default_factory=UnitPosition)
    areas: UnitAreas = Field(default_factory=UnitAreas)
    interior: UnitInteriorSpaces = Field(default_factory=UnitInteriorSpaces)
    storage: List[StorageSpace] = Field(default_factory=list)        # E · bodegas
    parking: List[ParkingSpot] = Field(default_factory=list)         # F · cajones
    finishes: UnitFinishes = Field(default_factory=UnitFinishes)
    sustainability: UnitSustainability = Field(default_factory=UnitSustainability)
    legal: UnitLegal = Field(default_factory=UnitLegal)
    recurring_costs: UnitRecurringCosts = Field(default_factory=UnitRecurringCosts)
    commercial: UnitCommercial = Field(default_factory=UnitCommercial)
    demand: UnitDemand = Field(default_factory=UnitDemand)
    investment: UnitInvestment = Field(default_factory=UnitInvestment)
    geo: UnitGeoSnapshot = Field(default_factory=UnitGeoSnapshot)

    # Amenidades atribuibles a la unidad (claves de AMENITY_TAXONOMY; default = las del development)
    amenity_keys: Optional[List[str]] = None

    # Procedencia del dato (qué fluyó vs qué falta) — para el motor de activación
    data_completeness: Optional[float] = Field(None, ge=0, le=1)
    sources: Optional[Dict[str, str]] = None     # {campo: fuente} p.ej. {"precio_cierre": "crm"}

    updated_at: Optional[datetime] = None


# ═══════════════════════════════════════════════════════════════════════════════
# PROTOTIPO · DESARROLLO · AMENIDAD (entidades de agregación)
# ═══════════════════════════════════════════════════════════════════════════════

class Prototype(BaseModel):
    """Un modelo repetible. 1 development → N prototipos → M unidades."""
    prototype_id: str
    development_id: str
    nombre: Optional[str] = None
    tipologia: Optional[Tipologia] = None
    m2_construido: Optional[float] = None
    m2_privativo: Optional[float] = None
    recamaras: Optional[int] = None
    banos: Optional[float] = None
    estacionamientos: Optional[int] = None
    precio_desde_mxn: Optional[float] = None
    unidades_total: Optional[int] = None
    floor_plan_url: Optional[str] = None


class Amenity(BaseModel):
    key: str                                     # de AMENITY_TAXONOMY
    category: Optional[AmenityCategory] = None
    nombre: Optional[str] = None
    incluida: Optional[bool] = True


class SecurityConfig(BaseModel):
    """H · Vigilancia/seguridad (a nivel development)."""
    vigilancia_24_7: Optional[bool] = None
    num_casetas: Optional[int] = Field(None, ge=0)
    cctv_camaras: Optional[int] = Field(None, ge=0)
    control_acceso: Optional[str] = None         # tarjeta / biometrico / app
    boton_panico: Optional[bool] = None
    ronda: Optional[bool] = None


class Development(BaseModel):
    """El desarrollo. Multi-tenant: pertenece a un developer/org."""
    development_id: str
    org_id: Optional[str] = None
    developer_id: Optional[str] = None
    nombre: Optional[str] = None

    # Geo
    calle: Optional[str] = None
    numero: Optional[str] = None
    cp: Optional[str] = None
    colonia_id: Optional[str] = None
    alcaldia: Optional[str] = None
    ageb: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    zona_id: Optional[str] = None

    # Construcción / entrega (N)
    etapa: Optional[EtapaConstruccion] = None
    avance_obra_pct: Optional[float] = Field(None, ge=0, le=100)
    fecha_entrega_estimada: Optional[datetime] = None
    fecha_entrega_real: Optional[datetime] = None
    certificaciones: Optional[List[str]] = None

    # Amenidades + seguridad a nivel desarrollo
    amenities: List[Amenity] = Field(default_factory=list)
    security: SecurityConfig = Field(default_factory=SecurityConfig)

    # Verificación (M1 Trust Infra · ya hay campos en data_developments)
    verified_constitution: Optional[bool] = None
    projects_delivered: Optional[int] = None
    no_profeco_complaints: Optional[bool] = None
    no_judicial_records: Optional[bool] = None
    founded_year: Optional[int] = None

    updated_at: Optional[datetime] = None


# ═══════════════════════════════════════════════════════════════════════════════
# ZONA (agregación geográfica · contrato para zone_score_engine + cubo)
# Relaciones: Development.colonia_id/zona_id → Zone.zone_id · Zone.parent_zone_id
# encadena colonia→alcaldía→cdmx. La Zona NO es multi-tenant (es mercado compartido);
# cada dev ve la zona donde tiene proyectos + benchmark anónimo.
# ═══════════════════════════════════════════════════════════════════════════════

class ZoneTier(str, Enum):
    colonia = "colonia"
    alcaldia = "alcaldia"
    ageb = "ageb"
    zona = "zona"
    cdmx = "cdmx"


class ZoneQualityScores(BaseModel):
    """Livability 0-100 (COLONIAS seed) + extensiones IA-first (catálogo maestro)."""
    vida: Optional[float] = None
    movilidad: Optional[float] = None
    seguridad: Optional[float] = None
    comercio: Optional[float] = None
    plusvalia: Optional[float] = None
    educacion: Optional[float] = None
    riesgo: Optional[float] = None              # mayor = menos riesgo
    # extensiones que se autollenan con los motores/fuentes
    walkability: Optional[float] = None
    nightlife: Optional[float] = None
    gentrificacion: Optional[float] = None      # gentrification velocity (colonia_history)
    sustentabilidad: Optional[float] = None


class ZoneIEComposite(BaseModel):
    """Score IE real (zone_score_engine · db.zone_scores · 6 componentes)."""
    score_numeric: Optional[float] = None
    score_letter: Optional[str] = None
    liquidez: Optional[float] = None
    supply: Optional[float] = None
    demand: Optional[float] = None
    risk: Optional[float] = None
    yield_score: Optional[float] = None
    denue_density: Optional[float] = None


class ZoneRisk(BaseModel):
    """Risk composite (Atlas Riesgos + FGJ + SACMEX)."""
    inundacion: Optional[float] = None
    sismo: Optional[float] = None
    criminalidad: Optional[float] = None
    seguridad_hidrica: Optional[float] = None


class Zone(BaseModel):
    zone_id: str
    tier: Optional[ZoneTier] = None
    nombre: Optional[str] = None
    alcaldia: Optional[str] = None
    ageb: Optional[str] = None
    parent_zone_id: Optional[str] = None        # colonia → alcaldía → cdmx
    lat: Optional[float] = None
    lng: Optional[float] = None
    polygon: Optional[List[List[float]]] = None
    color: Optional[str] = None
    tier_comercial: Optional[str] = None        # Premium / Luxury / Trendy / Emergente

    # Mercado (medidas actuales; el histórico vive en snapshots)
    price_m2_mxn: Optional[float] = None
    momentum_pct: Optional[float] = None
    inventario: Optional[int] = None
    absorcion_pct: Optional[float] = None

    # Inteligencia
    quality: ZoneQualityScores = Field(default_factory=ZoneQualityScores)
    ie: ZoneIEComposite = Field(default_factory=ZoneIEComposite)
    risk: ZoneRisk = Field(default_factory=ZoneRisk)

    # Demanda viva
    live_pulse_score: Optional[float] = None    # live_pulse_snapshots
    denue_negocios: Optional[int] = None        # densidad económica
    distancia_metro_m: Optional[float] = None

    updated_at: Optional[datetime] = None


# ═══════════════════════════════════════════════════════════════════════════════
# CUBO OLAP — dimensiones y medidas (contrato para cube_olap_engine)
# ═══════════════════════════════════════════════════════════════════════════════

# Dimensiones por las que se puede cortar cualquier medida
CUBE_DIMENSIONS = [
    # Geo
    "calle", "colonia", "alcaldia", "ageb", "zona",
    # Producto
    "tipologia", "prototipo", "desarrollo", "desarrollador",
    # Atributos físicos / amenidad
    "recamaras", "banda_m2", "banda_precio", "amenidad", "tiene_roof", "tiene_estacionamiento",
    # Comprador
    "disc", "nse", "motivacion",
    # Tiempo
    "dia", "semana", "mes", "trimestre", "anio",
]

# Medidas (facts) que se agregan
CUBE_MEASURES = [
    "precio_m2_lista", "precio_m2_cierre", "spread_pct", "descuento_pct",
    "absorcion_pct", "velocidad_u_mes", "dias_en_mercado", "inventario",
    "ofertas", "leads", "demanda_busquedas", "conversion_pct",
    "plusvalia_pct", "roi_renta_corta", "roi_renta_larga",
]


# ═══════════════════════════════════════════════════════════════════════════════
# MONGO — colecciones e índices (multi-tenant + cubo)
# ═══════════════════════════════════════════════════════════════════════════════

COLLECTIONS = {
    "units": "dmx_units",                    # el átomo (estado actual)
    "developments": "dmx_developments",
    "prototypes": "dmx_prototypes",
    "zones": "dmx_zones",                    # agregación geográfica (estado actual)
    "snapshots": "dmx_market_snapshots",     # append-only, histórico = activo
}

# Índices recomendados (campo, ...) → asegurar scoping multi-tenant + queries del cubo
INDEX_SPECS = {
    "dmx_units": [
        [("org_id", 1), ("development_id", 1)],
        [("development_id", 1), ("prototype_id", 1)],
        [("geo.colonia_id", 1), ("tipologia", 1)],
        [("commercial.status", 1)],
        [("geo.alcaldia", 1), ("commercial.status", 1)],
    ],
    "dmx_developments": [
        [("org_id", 1)], [("developer_id", 1)], [("colonia_id", 1)],
    ],
    "dmx_prototypes": [
        [("development_id", 1)],
    ],
    "dmx_zones": [
        [("tier", 1)], [("parent_zone_id", 1)], [("alcaldia", 1)],
    ],
    "dmx_market_snapshots": [
        [("tier", 1), ("tier_id", 1), ("measure", 1), ("period", 1)],
        [("computed_at", -1)],
    ],
}


def unit_completeness(unit: "Unit") -> float:
    """% de campos clave con dato real (para el motor de activación 'sin dato = dormido')."""
    key_fields = [
        unit.tipologia, unit.areas.m2_construido, unit.interior.recamaras,
        unit.interior.banos_completos, len(unit.parking) or None,
        unit.commercial.precio_lista_mxn, unit.commercial.status,
        unit.position.orientacion, unit.position.vista,
        unit.geo.colonia_id, unit.recurring_costs.mantenimiento_mensual_mxn,
    ]
    filled = sum(1 for f in key_fields if f not in (None, 0, []))
    return round(filled / len(key_fields), 3)
