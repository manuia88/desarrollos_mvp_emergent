# Z.8 · Property Intake Form Schema (Canonical)

**Fecha**: 2026-05-20
**Backend file objetivo**: `backend/studio_property_intake_schema.py`
**Frontend file objetivo**: `frontend/src/pages/portal/studio/PropertyIntakeForm.js`
**Mongo collection objetivo**: `studio_property_intakes`

Schema de ~80 campos agrupados en 14 categorías que el broker llena para crear un landing. La data alimenta:
- Los 10 templates JSX (renderizado HTML)
- Los 10 prompts LLM (generación de copy literal)
- El sistema de fallbacks graceful degradation

---

## 1. TIPO Y DATOS BÁSICOS

```python
class PropertyType(str, Enum):
    DEVELOPMENT = "development"  # pre-venta · obra nueva
    RESALE = "resale"            # reventa · obra existente

class ListingIntent(str, Enum):
    SALE = "sale"
    RENT = "rent"  # raro · pero soportado para luxury rentals largo plazo

class BuyerIntent(str, Enum):
    LIVE = "live"
    INVEST = "invest"
    MIXED = "mixed"

property_type: PropertyType
listing_intent: ListingIntent = ListingIntent.SALE
buyer_intent: Optional[BuyerIntent] = None  # required si template_key ∈ hybrid
name: str = Field(..., min_length=3, max_length=120)
internal_code: Optional[str] = Field(None, max_length=40)
slug: str = Field(..., regex=r"^[a-z0-9-]{3,80}$")
template_key: str  # uno de los 10 keys
landing_id: Optional[str] = None  # foreign key a studio_landings
```

## 2. UBICACIÓN

```python
address: str = Field(..., min_length=10, max_length=200)
colonia: str
alcaldia: str
city: str = "Ciudad de México"
country: str = "México"
state: str = "CDMX"
postal_code: Optional[str] = None
lat: float
lon: float

distance_to_landmarks: List[LandmarkDistance] = []
# LandmarkDistance:
#   name: str (ej "Parque México", "Bosque de Chapultepec", "AICM")
#   category: Literal["park", "landmark", "school", "hospital", "transport_hub", "office_hub", "shopping"]
#   distance_km: float
#   walking_minutes: Optional[int]
```

## 3. DEVELOPER / VENDEDOR

```python
# Si property_type == DEVELOPMENT
developer_name: Optional[str]
developer_founded_year: Optional[int]
developer_total_projects: Optional[int]
developer_total_units_delivered: Optional[int]
developer_track_record_url: Optional[HttpUrl]
developer_logo_url: Optional[HttpUrl]
architect_name: Optional[str]  # alto valor en Luxury/Boutique
architect_credentials: Optional[str]  # ej "Pritzker 2008 · 47 años trayectoria"
architect_signed_projects_count: Optional[int]
architect_portfolio_url: Optional[HttpUrl]

# Si property_type == RESALE
seller_name: Optional[str]
seller_role: Optional[Literal["owner", "broker"]]
seller_ampi_id: Optional[str]
listing_exclusive: bool = False
listing_since: Optional[date]
prior_owners_count: Optional[int]
```

## 4. TIPOLOGÍAS

```python
units_total: Optional[int]                  # required si dev
units_available: Optional[int]              # required si dev
units_sold: Optional[int]                   # calculable como total - available

class Typology(BaseModel):
    name: str                               # "Tipo A", "Penthouse 320", etc.
    size_m2: float
    bedrooms: int
    bathrooms: float                        # 1.5 supports half-baths
    parking_spots: int = 1
    has_balcony: bool = False
    has_terrace: bool = False
    has_garden: bool = False
    has_private_pool: bool = False           # luxury
    view_orientation: Optional[str]          # "norte", "sur-oeste vista Bosque"
    price_from: Optional[Decimal]
    price_to: Optional[Decimal]
    units_count_for_this_typology: Optional[int]

typologies: List[Typology] = []

price_currency: Literal["MXN", "USD"] = "MXN"
price_visible: Literal["yes", "range", "upon_request"] = "yes"
# "yes" = mostrar precio exacto · "range" = solo rango · "upon_request" = luxury

price_from_global: Optional[Decimal]  # calculable desde typologies
price_to_global: Optional[Decimal]

delivery_date: Optional[date]               # required si dev
construction_year: Optional[int]            # required si resale
construction_status: Optional[Literal[
    "blueprint", "foundation", "structure",
    "facade", "interior", "delivered"
]]
remodel_year: Optional[int]                 # resale opcional
```

## 5. AMENIDADES

```python
class AmenityCategory(str, Enum):
    POOL_SPA = "pool_spa"
    FITNESS = "fitness"
    BUSINESS = "business"
    SOCIAL = "social"
    OUTDOOR = "outdoor"
    SPORTS = "sports"
    KIDS = "kids"
    PETS = "pets"
    SECURITY = "security"
    SERVICES = "services"
    LUXURY = "luxury"
    GREEN_TECH = "green_tech"

AMENITY_CATALOG = {
    "pool_spa": ["alberca", "alberca_techada", "alberca_infantil", "spa", "sauna",
                 "jacuzzi", "vapor", "regadera_sensaciones"],
    "fitness": ["gimnasio", "yoga_room", "crossfit_zone", "spinning_room"],
    "business": ["business_center", "coworking", "sala_juntas", "lounge",
                 "phone_booths"],
    "social": ["roof_garden", "terraza", "lounge_principal", "cine_privado",
               "sala_juegos", "sala_billar", "cafeteria", "restaurante"],
    "outdoor": ["jardin_principal", "sky_garden", "mirador", "observatorio",
                "jogging_track", "huerto_urbano"],
    "sports": ["cancha_padel", "cancha_tennis", "cancha_squash", "muro_escalar",
               "putting_green"],
    "kids": ["ludoteca", "kids_area", "kids_pool", "salon_fiestas_infantil",
             "guarderia"],
    "pets": ["mascotas_zona", "pet_spa", "lavanderia_canina", "veterinario_zona"],
    "security": ["seguridad_24_7", "control_acceso", "cctv", "biometrico",
                 "drones_perimetrales"],
    "services": ["tienda_conveniencia", "lavanderia", "tintoreria_pickup",
                 "concierge", "valet", "bell_boy", "mensajeria_privada"],
    "luxury": ["bodega_vinos_climatizada", "sala_cigarros", "capilla", "oratorio",
               "humedero_puros", "salon_eventos_privado"],
    "green_tech": ["cargador_ev", "bici_estacionamiento", "tratamiento_aguas",
                   "paneles_solares", "domotica_unidad"],
}

amenities: Dict[AmenityCategory, List[str]] = {}  # category → list of selected amenity_ids
amenities_custom: List[str] = []  # free-text para casos no en catálogo
```

## 6. SERVICIOS PREMIUM (luxury / boutique específico)

```python
class PremiumService(BaseModel):
    service_id: str          # "concierge_24_7", "chef_visitante", etc.
    label: str               # display label
    included: bool = True
    description: Optional[str]
    monetary_value_mxn: Optional[Decimal]   # solo si calculable

PREMIUM_SERVICES_CATALOG = [
    "concierge_24_7", "concierge_horario", "valet",
    "chef_visitante", "driver_share", "driver_personal",
    "pet_sitter", "mensajeria_privada",
    "spa_privado", "gimnasio_personal", "personal_trainer",
    "bodega_vinos_climatizada", "sala_cigarros",
    "asesoria_tributaria_3y", "asesoria_legal_3y",
    "membresía_spa_vitalicia", "membresía_club_partner",
    "programa_intercambio_propiedades",
]

services_premium: List[PremiumService] = []
```

## 7. MÉTRICAS INVERSIÓN

```python
# Required para template Investor · opcional pero recomendado para Luxury/Urgent

class InvestmentMetrics(BaseModel):
    avm_price_per_m2: Optional[Decimal]              # AVM W5.1 output
    avm_confidence: Optional[Literal["low", "mid", "high"]]
    avg_price_per_m2_zone: Optional[Decimal]
    avg_price_per_m2_zone_source: Optional[str]      # "Softec Q4 2025"
    cap_rate_pct: Optional[float]                    # ej 7.2
    gross_yield_pct: Optional[float]
    net_yield_pct: Optional[float]
    irr_pct: Optional[float]
    roi_5y_pct: Optional[float]
    roi_10y_pct: Optional[float]
    roi_15y_pct: Optional[float]
    cash_on_cash_year_1_pct: Optional[float]
    break_even_months: Optional[int]
    estimated_rent_monthly: Optional[Decimal]
    estimated_rent_currency: Literal["MXN", "USD"] = "MXN"
    zone_appreciation_5y_pct: Optional[float]
    zone_appreciation_5y_source: Optional[str]       # "BBVA Research 2024"
    zone_occupancy_pct: Optional[float]
    zone_occupancy_source: Optional[str]
    # 3 escenarios para tabla switcheable
    scenarios: Optional[Dict[Literal["conservador", "base", "optimista"],
                              Dict[str, float]]]

investment_metrics: Optional[InvestmentMetrics] = None

# Comparables (otros desarrollos zona)
class ComparableDevelopment(BaseModel):
    name: str
    location_zone: str
    distance_km: float
    price_per_m2: Decimal
    cap_rate_pct: Optional[float]
    delivery_year: Optional[int]
    units_total: Optional[int]
    units_sold_pct: Optional[float]
    diff_pct_vs_this: Optional[float]                # calculable

comparable_developments: List[ComparableDevelopment] = []
```

## 8. MEDIA

```python
class PhotoCategory(str, Enum):
    FACADE = "facade"
    LOBBY = "lobby"
    UNIT_INTERIOR = "unit_interior"
    UNIT_KITCHEN = "unit_kitchen"
    UNIT_BATHROOM = "unit_bathroom"
    UNIT_BEDROOM = "unit_bedroom"
    AMENITY = "amenity"
    VIEW = "view"
    NEIGHBORHOOD = "neighborhood"
    DRONE = "drone"
    FLOOR_PLAN = "floor_plan"
    CONSTRUCTION = "construction"  # progress
    NIGHT = "night"
    ARCHITECT_RENDER = "architect_render"

class Photo(BaseModel):
    url: HttpUrl
    caption: Optional[str]
    category: PhotoCategory
    sort_order: int = 0
    is_hero: bool = False                  # 1 sola foto puede ser hero
    typology_ref: Optional[str]            # link a typology.name si aplica
    photographer_credit: Optional[str]

photos: List[Photo] = []  # min 12 recommended · 20+ optimal · 40+ luxury

class VideoType(str, Enum):
    DRONE_AERIAL = "drone_aerial"
    INTERIOR_TOUR = "interior_tour"
    AMENITIES_TOUR = "amenities_tour"
    NEIGHBORHOOD = "neighborhood"
    DEVELOPER_MESSAGE = "developer_message"
    ARCHITECT_MESSAGE = "architect_message"
    TESTIMONIAL = "testimonial"
    VSL = "vsl"                              # video sales letter (Brunson/Hormozi)
    CONSTRUCTION_PROGRESS = "construction_progress"

class Video(BaseModel):
    url: HttpUrl                            # YouTube · Vimeo · self-hosted
    type: VideoType
    duration_seconds: int
    thumbnail_url: Optional[HttpUrl]
    caption: Optional[str]
    autoplay_in_hero: bool = False

videos: List[Video] = []

tour_3d_url: Optional[HttpUrl]               # Matterport · Kuula · etc
tour_vr_url: Optional[HttpUrl]
tour_3dgs_url: Optional[HttpUrl]             # 3D Gaussian Splatting (W4 stack)

class FloorPlan(BaseModel):
    url: HttpUrl
    typology_ref: str                       # link a typology.name
    size_m2: float
    file_format: Literal["image", "pdf"]

floor_plans: List[FloorPlan] = []

brochure_pdf_url: Optional[HttpUrl]
memorandum_technical_url: Optional[HttpUrl]  # investor template
```

## 9. FINANCIAMIENTO (clave family / first-home / urgent)

```python
class CreditOption(BaseModel):
    type: Literal["infonavit", "fovissste", "bank", "developer_direct",
                  "fideicomiso_uso_arrend"]
    bank_name: Optional[str]                # si type=bank
    max_amount_mxn: Optional[Decimal]
    rate_annual_pct: Optional[float]
    term_years: Optional[int]

credit_options: List[CreditOption] = []
accepts_infonavit: bool = False
accepts_fovissste: bool = False
pre_approved_credit_amount_max: Optional[Decimal]

down_payment_pct: Optional[float]
down_payment_amount_min: Optional[Decimal]
monthly_payment_min_financed: Optional[Decimal]

class PaymentMilestone(BaseModel):
    label: str                              # "Reserva", "Contrato", "Construcción"
    percentage: float
    due_date: Optional[date]
    due_milestone: Optional[str]            # "30 días post-reserva", "construcción 50%"

payment_schedule: List[PaymentMilestone] = []
```

## 10. TRUST ELEMENTS

```python
class Testimonial(BaseModel):
    name: str
    photo_url: Optional[HttpUrl]
    city: str
    profession: Optional[str]
    age_range: Optional[str]                # "35-45"
    family_status: Optional[str]            # "casado · 2 hijos"
    quote: str = Field(..., min_length=20, max_length=500)
    project_purchased: Optional[str]
    typology_purchased: Optional[str]
    year_purchased: Optional[int]
    video_url: Optional[HttpUrl]
    rating: Optional[int] = Field(None, ge=1, le=5)

testimonials: List[Testimonial] = []

class MediaMention(BaseModel):
    outlet_name: str                        # "El Financiero", "Forbes MX"
    outlet_logo_url: Optional[HttpUrl]
    article_url: Optional[HttpUrl]
    article_title: Optional[str]
    date: Optional[date]
    excerpt: Optional[str]

media_mentions: List[MediaMention] = []

class Certification(BaseModel):
    type: Literal["LEED", "Passive_House", "EDGE", "WELL", "BREEAM",
                  "SEDUVI", "RUV", "AMPI", "other"]
    issuer: str
    level: Optional[str]                    # "Platinum", "Gold"
    date_issued: Optional[date]
    valid_until: Optional[date]
    badge_url: Optional[HttpUrl]

certifications: List[Certification] = []

class Award(BaseModel):
    name: str
    issuer: str
    year: int
    category: Optional[str]

awards: List[Award] = []
```

## 11. ASESOR ASIGNADO

```python
class AssignedAdvisor(BaseModel):
    user_id: str                            # FK a users
    name: str
    photo_url: Optional[HttpUrl]
    whatsapp: str                           # E.164 format
    email: EmailStr
    ampi_id: Optional[str]
    cedula_inmobiliaria: Optional[str]
    cedula_amib: Optional[str]              # investor template
    years_experience: int
    languages: List[str] = ["es"]
    specialization: Optional[List[str]]     # ["luxury", "investor", "family"]
    response_time_promised: Literal["60s", "5min", "15min", "1h", "24h"] = "15min"

assigned_advisor: AssignedAdvisor
backup_advisor: Optional[AssignedAdvisor] = None
```

## 12. LEGAL

```python
rfc_developer: Optional[str]
ruv_id: Optional[str]                       # vivienda registrada
seduvi_permit: Optional[str]                # CDMX permit
compliance_lfpdppp: bool = True
contract_type: Literal["promesa", "compraventa", "fideicomiso",
                        "reserva_simple"] = "promesa"
contract_template_url: Optional[HttpUrl]
trust_entity: Optional[str]                 # nombre fiduciaria si aplica
escrow_provider: Optional[str]              # banco/notario que custodia
disclaimer_text: Optional[str]              # personalizado por developer
```

## 13. URGENCIA (real · no fabricada)

```python
class PhaseInfo(BaseModel):
    phase_number: int
    units_in_phase: int
    units_available_in_phase: int
    price_per_m2_at_this_phase: Optional[Decimal]
    phase_start_date: Optional[date]
    phase_end_date: Optional[date]

phases: List[PhaseInfo] = []
phase_current: Optional[int]
phase_total: Optional[int]
next_price_increase_date: Optional[date]
next_price_increase_pct: Optional[float]
next_price_increase_reason: Optional[str]   # "costos certificados obra"

class PromotionalOffer(BaseModel):
    label: str                              # "Enganche $0 con Infonavit"
    description: str
    expires: Optional[datetime]
    eligibility: Optional[str]

promotional_offers: List[PromotionalOffer] = []
```

## 14. DIFERENCIADORES (free text para LLM)

```python
unique_selling_points: List[str] = Field(
    default_factory=list,
    min_items=0,
    max_items=8,
    description="3-5 USPs explícitos · cada uno 1 línea · evitar genericos"
)

founder_notes: Optional[str] = Field(
    None,
    max_length=2000,
    description="Texto libre · LLM extrae lo persuasivo · puede incluir history del proyecto, anécdotas, datos sueltos"
)

# Auto-populated from W5 systems
zone_score_data: Optional[Dict[str, Any]] = None      # Zone Score W3
disc_target_inferred: Optional[str] = None            # DISC W4
live_pulse_score: Optional[float] = None              # W5.5
forecast_data: Optional[Dict[str, Any]] = None        # W5.3 / W5.15

# Telemetry / audit
created_by_user_id: str
created_at: datetime
updated_at: datetime
last_published_at: Optional[datetime] = None
version: int = 1
```

---

## Validaciones cross-field

```python
@root_validator
def cross_field_validations(cls, values):
    # 1. property_type=DEVELOPMENT requiere developer_name + units_total +
    #    units_available + delivery_date + construction_status
    if values.get("property_type") == "development":
        required = ["developer_name", "units_total", "units_available",
                    "delivery_date", "construction_status"]
        for f in required:
            if not values.get(f):
                raise ValueError(f"property_type=development requiere {f}")

    # 2. property_type=RESALE requiere seller_name + construction_year
    if values.get("property_type") == "resale":
        if not values.get("seller_name"):
            raise ValueError("property_type=resale requiere seller_name")
        if not values.get("construction_year"):
            raise ValueError("property_type=resale requiere construction_year")

    # 3. template_key=investor requiere investment_metrics con métricas core
    if values.get("template_key") == "investor":
        m = values.get("investment_metrics")
        if not m or not m.cap_rate_pct or not m.gross_yield_pct:
            raise ValueError(
                "template_key=investor requiere investment_metrics con "
                "cap_rate_pct y gross_yield_pct mínimo"
            )

    # 4. template_key=luxury idealmente price_visible=upon_request
    if values.get("template_key") == "luxury":
        if values.get("price_visible") == "yes":
            # warn no error · broker decide
            values["_warnings"] = values.get("_warnings", []) + [
                "Luxury con price_visible=yes · considere upon_request para mejor posicionamiento"
            ]

    # 5. template_key ∈ hybrid templates requiere buyer_intent
    HYBRID_TEMPLATES = {"luxury", "urgent", "social_proof", "compare",
                        "scrollytelling", "video_first"}
    if values.get("template_key") in HYBRID_TEMPLATES:
        if not values.get("buyer_intent"):
            raise ValueError(
                f"template_key={values['template_key']} es hybrid · "
                f"requiere buyer_intent (live | invest | mixed)"
            )

    # 6. min 12 fotos para todos los templates
    photos = values.get("photos", [])
    if len(photos) < 12:
        values["_warnings"] = values.get("_warnings", []) + [
            f"Solo {len(photos)} fotos · recomendado min 12 (40+ para luxury)"
        ]

    # 7. min 1 floor_plan recomendado (NAR: 31% buyers rank #1 valuable)
    if not values.get("floor_plans"):
        values["_warnings"] = values.get("_warnings", []) + [
            "Sin floor_plans · 31% de buyers los rank como #1 más valioso (NAR 2024)"
        ]

    # 8. assigned_advisor requerido siempre
    if not values.get("assigned_advisor"):
        raise ValueError("assigned_advisor es obligatorio para captura de leads")

    return values
```

## Defaults inteligentes

```python
def autofill_defaults(intake_data: dict) -> dict:
    """Calcula campos derivados desde inputs."""
    # units_sold = total - available
    if intake_data.get("units_total") and intake_data.get("units_available") is not None:
        intake_data["units_sold"] = intake_data["units_total"] - intake_data["units_available"]

    # price_from_global = min de typologies
    typs = intake_data.get("typologies", [])
    if typs:
        prices = [t["price_from"] for t in typs if t.get("price_from")]
        if prices:
            intake_data["price_from_global"] = min(prices)
            intake_data["price_to_global"] = max(prices)

    # buyer_intent default por template
    template = intake_data.get("template_key")
    if template in {"family", "first_home", "boutique"}:
        intake_data["buyer_intent"] = "live"
    elif template == "investor":
        intake_data["buyer_intent"] = "invest"
    # hybrid templates conservan lo que ya tienen o None

    return intake_data
```

## API endpoints (referencia)

```
POST   /api/studio/property-intake                  # crear intake
PATCH  /api/studio/property-intake/{id}             # update
GET    /api/studio/property-intake/{id}             # read
GET    /api/studio/property-intake/list             # list per user
POST   /api/studio/property-intake/{id}/generate-copy
       # invoca AI Copy Generator con el template_key seleccionado
       # devuelve copy_json listo para renderizar
POST   /api/studio/property-intake/{id}/regenerate-copy
       # re-genera (after intake update o template change)
```

## Mongo indexes

```python
db.studio_property_intakes.create_index([("created_by_user_id", 1)])
db.studio_property_intakes.create_index([("template_key", 1)])
db.studio_property_intakes.create_index([("property_type", 1)])
db.studio_property_intakes.create_index([("slug", 1)], unique=True)
db.studio_property_intakes.create_index([("landing_id", 1)], sparse=True)
db.studio_property_intakes.create_index([("created_at", -1)])
```

## Referencias

- `memory/Z8_TEMPLATE_PROMPTS_FINAL.md` — los 10 prompts consumen este schema
- `memory/Z8_BUYER_INTENT_DECISION.md` — decisión arquitectónica de `buyer_intent`
- `memory/WAVE5_PLAN.md` — Z.8.7 SUB-A
