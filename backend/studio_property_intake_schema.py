"""W5.22 Z.8.7 Sub-B1 Sub-A — PropertyIntake Pydantic schema (14 categories · ~80 fields).

Source of truth declared in memory/Z8_FORM_SCHEMA_FINAL.md (no presente · conservador).
Aplica las 8 validaciones cross-field declaradas en el spec.

Imports limpios para usar como:
    from studio_property_intake_schema import PropertyIntake, autofill_defaults, HYBRID_TEMPLATES
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional, Set

from pydantic import BaseModel, Field, model_validator

# ─── Enums ───────────────────────────────────────────────────────────────────
class PropertyType(str, Enum):
    development = "development"
    resale = "resale"
    rental = "rental"
    commercial = "commercial"
    industrial = "industrial"
    land = "land"


class ListingIntent(str, Enum):
    sell = "sell"
    rent = "rent"
    invest = "invest"
    promote = "promote"


class BuyerIntent(str, Enum):
    live = "live"
    invest = "invest"
    mixed = "mixed"


class PhotoCategory(str, Enum):
    exterior = "exterior"
    interior = "interior"
    amenity = "amenity"
    render = "render"
    drone = "drone"
    night = "night"
    floor = "floor"
    location = "location"


class VideoType(str, Enum):
    walkthrough = "walkthrough"
    drone = "drone"
    testimonial = "testimonial"
    teaser = "teaser"
    interview = "interview"


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


# ─── Catalogs ────────────────────────────────────────────────────────────────
AMENITY_CATALOG: Dict[str, List[str]] = {
    "wellness": ["Gym", "Spa", "Sauna", "Steam room", "Yoga deck", "Pool", "Jacuzzi", "Massage room"],
    "work": ["Coworking", "Meeting room", "Phone booths", "Business center", "Wi-Fi premium"],
    "family": ["Playground", "Kids room", "Daycare", "Game room", "Splash pad"],
    "social": ["Roof garden", "Sky lounge", "BBQ area", "Wine cellar", "Cinema", "Bar"],
    "security": ["24/7 security", "Concierge", "Biometric access", "CCTV", "Alarm"],
    "pet": ["Pet park", "Pet spa", "Pet daycare"],
    "parking": ["Underground parking", "Visitor parking", "EV charging", "Bicycle storage"],
    "sustainability": ["Solar panels", "Rainwater harvest", "Green roof", "LEED Gold", "Greywater"],
    "technology": ["Smart home", "Home automation", "EV charger per unit", "Fiber optic"],
    "services": ["Laundry", "Dry cleaning", "Grocery delivery", "Cleaning service"],
}

PREMIUM_SERVICES_CATALOG: List[str] = [
    "Concierge 24/7",
    "Property management",
    "Valet parking",
    "Personal shopper",
    "In-house chef",
    "Private chauffeur",
    "Childcare on demand",
    "Personal trainer",
    "Wellness coordinator",
    "Lifestyle curator",
]

HYBRID_TEMPLATES: Set[str] = {"luxury", "urgent", "social_proof", "compare", "scrollytelling", "video_first"}
LIVE_ONLY_TEMPLATES: Set[str] = {"family", "first_home", "boutique"}
INVEST_ONLY_TEMPLATES: Set[str] = {"investor"}


# ─── Nested models ───────────────────────────────────────────────────────────
class Typology(BaseModel):
    code: str = Field(..., max_length=24)
    name: Optional[str] = Field(None, max_length=80)
    bedrooms: Optional[int] = Field(None, ge=0, le=20)
    bathrooms: Optional[float] = Field(None, ge=0, le=20)
    parking: Optional[int] = Field(None, ge=0, le=20)
    area_m2: Optional[float] = Field(None, ge=5, le=10000)
    price_mxn: Optional[float] = Field(None, ge=0)
    units_total: Optional[int] = Field(None, ge=0)
    units_available: Optional[int] = Field(None, ge=0)
    floor_plan_url: Optional[str] = None


class LandmarkDistance(BaseModel):
    name: str = Field(..., max_length=80)
    type: Optional[str] = Field(None, max_length=40)  # school/mall/park/metro
    distance_m: Optional[float] = Field(None, ge=0)
    walking_minutes: Optional[int] = Field(None, ge=0, le=180)


class Photo(BaseModel):
    url: str
    category: PhotoCategory = PhotoCategory.exterior
    caption: Optional[str] = Field(None, max_length=200)
    order: int = 0


class Video(BaseModel):
    url: str
    type: VideoType = VideoType.walkthrough
    title: Optional[str] = Field(None, max_length=120)
    duration_sec: Optional[int] = Field(None, ge=0)
    thumbnail_url: Optional[str] = None


class FloorPlan(BaseModel):
    url: str
    typology_code: Optional[str] = Field(None, max_length=24)
    label: Optional[str] = Field(None, max_length=80)


class Testimonial(BaseModel):
    author: str = Field(..., max_length=80)
    role: Optional[str] = Field(None, max_length=80)
    quote: str = Field(..., max_length=600)
    rating: Optional[int] = Field(None, ge=1, le=5)
    avatar_url: Optional[str] = None


class MediaMention(BaseModel):
    outlet: str = Field(..., max_length=80)
    title: Optional[str] = Field(None, max_length=200)
    url: Optional[str] = None
    date: Optional[datetime] = None


class Certification(BaseModel):
    name: str = Field(..., max_length=80)
    issued_by: Optional[str] = Field(None, max_length=80)
    valid_until: Optional[datetime] = None
    badge_url: Optional[str] = None


class Award(BaseModel):
    name: str = Field(..., max_length=120)
    year: Optional[int] = Field(None, ge=1900, le=2100)
    issued_by: Optional[str] = Field(None, max_length=120)


class InvestmentMetrics(BaseModel):
    expected_roi_pct: Optional[float] = Field(None, ge=0, le=200)
    expected_yield_pct: Optional[float] = Field(None, ge=0, le=100)
    expected_capital_appreciation_pct: Optional[float] = Field(None, ge=0, le=300)
    payback_years: Optional[float] = Field(None, ge=0, le=50)
    cap_rate_pct: Optional[float] = Field(None, ge=0, le=50)
    drpi_index: Optional[float] = Field(None, ge=-200, le=200)
    irr_pct: Optional[float] = Field(None, ge=-100, le=300)


class ComparableDevelopment(BaseModel):
    name: str = Field(..., max_length=120)
    price_from_mxn: Optional[float] = Field(None, ge=0)
    yield_pct: Optional[float] = Field(None, ge=0, le=100)
    distance_km: Optional[float] = Field(None, ge=0)


class PaymentMilestone(BaseModel):
    label: str = Field(..., max_length=80)
    percent: float = Field(..., ge=0, le=100)
    due_date: Optional[datetime] = None


class CreditOption(BaseModel):
    bank_or_institution: str = Field(..., max_length=80)
    type: Optional[str] = Field(None, max_length=40)  # bancario/infonavit/fovissste
    cat_pct: Optional[float] = Field(None, ge=0, le=100)
    enganche_pct: Optional[float] = Field(None, ge=0, le=100)


class PhaseInfo(BaseModel):
    phase_name: str = Field(..., max_length=80)
    delivery_estimate: Optional[str] = Field(None, max_length=40)
    units_in_phase: Optional[int] = Field(None, ge=0)
    status: Optional[str] = Field(None, max_length=24)


class PremiumService(BaseModel):
    name: str = Field(..., max_length=80)
    description: Optional[str] = Field(None, max_length=400)
    included: bool = True
    monthly_fee_mxn: Optional[float] = Field(None, ge=0)


class AssignedAdvisor(BaseModel):
    user_id: Optional[str] = None
    full_name: str = Field(..., max_length=120)
    email: Optional[str] = None
    phone: Optional[str] = Field(None, max_length=40)
    photo_url: Optional[str] = None
    ampi_id: Optional[str] = Field(None, max_length=40)
    bio: Optional[str] = Field(None, max_length=1000)


# ─── PropertyIntake (master schema · 14 categorias) ──────────────────────────
class PropertyIntake(BaseModel):
    # 1. Basic identification
    slug: Optional[str] = Field(None, pattern=r"^[a-z0-9-]{3,80}$")
    project_name: str = Field(..., min_length=2, max_length=160)
    property_type: PropertyType = PropertyType.development
    listing_intent: ListingIntent = ListingIntent.sell
    buyer_intent: Optional[BuyerIntent] = None
    template_key: str = Field(..., min_length=2, max_length=40)
    language: str = Field("es-MX", max_length=10)

    # 2. Location
    address: Optional[str] = Field(None, max_length=240)
    colonia: Optional[str] = Field(None, max_length=80)
    alcaldia_municipio: Optional[str] = Field(None, max_length=80)
    city: Optional[str] = Field(None, max_length=80)
    state: Optional[str] = Field(None, max_length=80)
    country: str = Field("MX", max_length=4)
    lat: Optional[float] = Field(None, ge=-90, le=90)
    lng: Optional[float] = Field(None, ge=-180, le=180)
    walkscore: Optional[int] = Field(None, ge=0, le=100)
    bikescore: Optional[int] = Field(None, ge=0, le=100)
    transitscore: Optional[int] = Field(None, ge=0, le=100)
    landmarks: List[LandmarkDistance] = Field(default_factory=list)

    # 3. Developer / Seller (development OR resale)
    developer_name: Optional[str] = Field(None, max_length=160)
    developer_track_record: Optional[str] = Field(None, max_length=2000)
    developer_total_projects: Optional[int] = Field(None, ge=0)
    developer_units_delivered: Optional[int] = Field(None, ge=0)
    developer_logo_url: Optional[str] = None
    resale_owner_type: Optional[str] = Field(None, max_length=40)  # owner/broker
    resale_years_owned: Optional[float] = Field(None, ge=0, le=120)
    resale_reason: Optional[str] = Field(None, max_length=400)

    # 4. Typologies
    typologies: List[Typology] = Field(default_factory=list)
    units_total: Optional[int] = Field(None, ge=0)
    units_sold: Optional[int] = Field(None, ge=0)
    units_available: Optional[int] = Field(None, ge=0)
    price_from_mxn: Optional[float] = Field(None, ge=0)
    price_to_mxn: Optional[float] = Field(None, ge=0)
    price_visible: bool = True

    # 5. Amenities
    amenities_by_category: Dict[str, List[str]] = Field(default_factory=dict)
    common_areas_m2: Optional[float] = Field(None, ge=0)

    # 6. Premium services
    premium_services: List[PremiumService] = Field(default_factory=list)

    # 7. Investment metrics (required if template=investor)
    investment_metrics: Optional[InvestmentMetrics] = None
    comparable_developments: List[ComparableDevelopment] = Field(default_factory=list)

    # 8. Media
    photos: List[Photo] = Field(default_factory=list)
    videos: List[Video] = Field(default_factory=list)
    floor_plans: List[FloorPlan] = Field(default_factory=list)
    virtual_tour_url: Optional[str] = None
    drone_video_url: Optional[str] = None

    # 9. Financing
    payment_schedule: List[PaymentMilestone] = Field(default_factory=list)
    credit_options: List[CreditOption] = Field(default_factory=list)
    enganche_pct: Optional[float] = Field(None, ge=0, le=100)
    phases: List[PhaseInfo] = Field(default_factory=list)

    # 10. Trust
    testimonials: List[Testimonial] = Field(default_factory=list)
    media_mentions: List[MediaMention] = Field(default_factory=list)
    certifications: List[Certification] = Field(default_factory=list)
    awards: List[Award] = Field(default_factory=list)
    trust_score: Optional[int] = Field(None, ge=0, le=100)

    # 11. Assigned advisor (REQUIRED)
    assigned_advisor: Optional[AssignedAdvisor] = None

    # 12. Legal
    legal_disclaimer: Optional[str] = Field(None, max_length=2000)
    rule_of_use: Optional[str] = Field(None, max_length=2000)
    notary_office: Optional[str] = Field(None, max_length=120)
    construction_permit_id: Optional[str] = Field(None, max_length=80)

    # 13. Urgency / scarcity
    urgent_expires_at: Optional[datetime] = None
    last_units_warning: Optional[bool] = None
    promo_label: Optional[str] = Field(None, max_length=80)
    promo_discount_pct: Optional[float] = Field(None, ge=0, le=100)

    # Publishing state (Z.8.7 Sub-D)
    published: bool = Field(False, description="Si true, intake visible en endpoint publico /landing/:slug")
    published_at: Optional[datetime] = None

    # 14. Differentiators
    unique_selling_points: List[str] = Field(default_factory=list, max_length=10)
    target_buyer_persona: Optional[str] = Field(None, max_length=80)
    competitive_advantages: List[str] = Field(default_factory=list, max_length=10)

    # ── Cross-field validations ──────────────────────────────────────────────
    @model_validator(mode="after")
    def cross_field_checks(self):
        warnings: List[str] = []
        # 1. development sin developer_name → warning (no rechazar · broker puede completar después)
        if self.property_type == PropertyType.development and not self.developer_name:
            warnings.append("Falta el nombre del desarrollador. Edítalo en la sección 3 antes de publicar.")
        # 2. resale requires resale_owner_type → warning (no rechazar)
        if self.property_type == PropertyType.resale and not self.resale_owner_type:
            warnings.append("Para una reventa, elige si vendes como dueño o como broker en la sección 3.")
        # 3. investor template sin métricas → WARNING (no rechazar · permite cambiar template y completar después)
        if self.template_key == "investor":
            m = self.investment_metrics
            if not m or not any(getattr(m, f, None) is not None for f in m.model_dump().keys()):
                warnings.append("El template Inversionista necesita al menos una métrica financiera (ROI, yield o cap rate). Llénalo en la sección 7 antes de publicar.")
        # 4. luxury con precio visible → warning
        if self.template_key == "luxury" and self.price_visible:
            warnings.append("Para el template Lujo recomendamos ocultar el precio público (en la sección 4). Refuerza el posicionamiento premium.")
        # 5. hybrid templates require buyer_intent → warning (autofill ya pone default mixed)
        if self.template_key in HYBRID_TEMPLATES and self.buyer_intent is None:
            warnings.append(f"El template {self.template_key} requiere que elijas para quién es la landing (vivir, invertir o ambos) en la sección 1.")
        # 6. min 12 photos warning
        if self.template_key not in ("first_home",) and len(self.photos) < 12:
            warnings.append(f"Tienes {len(self.photos)} fotos. Recomendamos al menos 12 para mejor conversión. Súbelas en la sección 8.")
        # 7. floor_plans warning if development
        if self.property_type == PropertyType.development and not self.floor_plans:
            warnings.append("Falta agregar al menos un plano. Los planos son lo #1 que buyers valoran (NAR 2024). Súbelos en la sección 8.")
        # 8. assigned_advisor warning (autofill ya pone mínimo desde user)
        if not self.assigned_advisor:
            warnings.append("Falta el asesor que va a recibir los leads. Edítalo en la sección 11.")
        # Attach warnings on the instance via __dict__ (no validation impact)
        object.__setattr__(self, "_collected_warnings", warnings)
        return self


def autofill_defaults(intake_data: dict) -> dict:
    """Calcula defaults derivados ANTES de la validacion Pydantic.

    - units_sold = units_total - units_available si ambos presentes y ninguno es units_sold
    - price_from_mxn (global) = min(typologies.price_mxn) si vacio
    - buyer_intent default: invest si template=investor · live si template en LIVE_ONLY · hybrid si HYBRID_TEMPLATES y vacio
    """
    data = dict(intake_data or {})
    typs = data.get("typologies") or []
    # units_sold
    if data.get("units_total") is not None and data.get("units_available") is not None and data.get("units_sold") is None:
        try:
            data["units_sold"] = max(0, int(data["units_total"]) - int(data["units_available"]))
        except Exception:
            pass
    # price_from_mxn global
    if data.get("price_from_mxn") is None and typs:
        prices = [t.get("price_mxn") for t in typs if isinstance(t, dict) and t.get("price_mxn") is not None]
        if prices:
            data["price_from_mxn"] = min(prices)
    # buyer_intent default
    if not data.get("buyer_intent"):
        tk = data.get("template_key", "")
        if tk in INVEST_ONLY_TEMPLATES:
            data["buyer_intent"] = "invest"
        elif tk in LIVE_ONLY_TEMPLATES:
            data["buyer_intent"] = "live"
        elif tk in HYBRID_TEMPLATES:
            data["buyer_intent"] = "mixed"
    return data
