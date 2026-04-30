"""Developments + units + developers seed data for DesarrollosMX.
Public marketplace model = new construction developments (preventa / en construcción /
entrega inmediata / exclusiva). Each development has multiple units.

Resale properties live in advisor private portal (Phase 4), not here.
"""

import hashlib
from typing import List

# ─── Developers (10 fictitious plausible LATAM brands) ────────────────────────
DEVELOPERS = [
    {
        "id": "habitare-capital", "name": "Habitare Capital", "founded_year": 2009,
        "verified_constitution": True, "no_judicial_records": True, "no_profeco_complaints": True,
        "projects_delivered": 18, "units_sold": 1240, "years_experience": 17,
        "description": "Habitare se especializa en desarrollos de alta densidad con enfoque en diseño contemporáneo y eficiencia energética. Proyectos entregados en Polanco, Condesa, Roma Norte y Santa Fe.",
        "website": "https://habitare.mx", "logo_hue": 231,
    },
    {
        "id": "lumbre", "name": "Lumbre Desarrollos", "founded_year": 2014,
        "verified_constitution": True, "no_judicial_records": True, "no_profeco_complaints": True,
        "projects_delivered": 9, "units_sold": 620, "years_experience": 12,
        "description": "Lumbre apuesta por edificios boutique de entre 20 y 60 unidades, con curaduría de arquitectos emergentes mexicanos y acabados producidos localmente.",
        "website": "https://lumbre-desarrollos.mx", "logo_hue": 16,
    },
    {
        "id": "atlas-urbano", "name": "Atlas Urbano", "founded_year": 2011,
        "verified_constitution": True, "no_judicial_records": True, "no_profeco_complaints": True,
        "projects_delivered": 14, "units_sold": 980, "years_experience": 15,
        "description": "Atlas Urbano desarrolla proyectos mid-rise en barrios en transición. Enfoque en plusvalía comprobada y relación precio-m² competitiva.",
        "website": "https://atlasurbano.mx", "logo_hue": 198,
    },
    {
        "id": "mosaico", "name": "Mosaico Group", "founded_year": 2016,
        "verified_constitution": True, "no_judicial_records": True, "no_profeco_complaints": True,
        "projects_delivered": 6, "units_sold": 410, "years_experience": 10,
        "description": "Mosaico integra vivienda + comercio + cowork en torres mixtas. Operan en corredores corporativos de CDMX y Monterrey.",
        "website": "https://mosaicogroup.mx", "logo_hue": 142,
    },
    {
        "id": "sereno", "name": "Sereno Real Estate", "founded_year": 2018,
        "verified_constitution": True, "no_judicial_records": True, "no_profeco_complaints": True,
        "projects_delivered": 4, "units_sold": 280, "years_experience": 8,
        "description": "Sereno entrega desarrollos de escala humana — entre 12 y 40 unidades — con énfasis en áreas verdes, iluminación natural y materiales biofílicos.",
        "website": "https://sereno.mx", "logo_hue": 62,
    },
    {
        "id": "quattro", "name": "Quattro Capital", "founded_year": 2010,
        "verified_constitution": True, "no_judicial_records": True, "no_profeco_complaints": True,
        "projects_delivered": 21, "units_sold": 1680, "years_experience": 16,
        "description": "Quattro Capital se enfoca en torres de lujo con amenidades resort (spa, alberca climatizada, cava, sky lounge). Operan en Polanco, Lomas, Pedregal y Santa Fe.",
        "website": "https://quattrocapital.mx", "logo_hue": 276,
    },
    {
        "id": "origen", "name": "Origen Desarrollos", "founded_year": 2015,
        "verified_constitution": True, "no_judicial_records": True, "no_profeco_complaints": True,
        "projects_delivered": 8, "units_sold": 540, "years_experience": 11,
        "description": "Origen trabaja con arquitectos reconocidos para crear hitos urbanos — fachadas brutalistas, double heights y espacios comunes con obra de arte comisionada.",
        "website": "https://origen-desarrollos.mx", "logo_hue": 350,
    },
    {
        "id": "cobalto", "name": "Cobalto Group", "founded_year": 2012,
        "verified_constitution": True, "no_judicial_records": True, "no_profeco_complaints": True,
        "projects_delivered": 11, "units_sold": 790, "years_experience": 14,
        "description": "Cobalto construye vivienda joven en barrios centrales — lofts, micro-lofts y pet-friendly — orientada al primer comprador profesional.",
        "website": "https://cobaltogroup.mx", "logo_hue": 214,
    },
    {
        "id": "agora-urbana", "name": "Ágora Urbana", "founded_year": 2019,
        "verified_constitution": True, "no_judicial_records": True, "no_profeco_complaints": True,
        "projects_delivered": 3, "units_sold": 170, "years_experience": 7,
        "description": "Ágora Urbana desarrolla proyectos que combinan vivienda con coworking y retail local. Modelo community-first en colonias culturales como Roma, Juárez y San Rafael.",
        "website": "https://agoraurbana.mx", "logo_hue": 92,
    },
    {
        "id": "solera", "name": "Solera Inmobiliaria", "founded_year": 2013,
        "verified_constitution": True, "no_judicial_records": True, "no_profeco_complaints": True,
        "projects_delivered": 12, "units_sold": 860, "years_experience": 13,
        "description": "Solera se especializa en casas y residencias unifamiliares en zonas premium del sur de CDMX (Coyoacán, Pedregal, San Ángel).",
        "website": "https://solera-inmobiliaria.mx", "logo_hue": 28,
    },
]

DEVELOPERS_BY_ID = {d["id"]: d for d in DEVELOPERS}

# ─── Developments (15 across 13 colonias, stage mix 50/30/15/5) ──────────────
# Stage distribution: 8 preventa, 4 en_construccion, 2 entrega_inmediata, 1 exclusiva
DEVELOPMENTS_RAW = [
    # Premium high-end (Polanco / Lomas / Pedregal)
    {
        "id": "altavista-polanco", "slug": "altavista-polanco",
        "name": "Altavista Polanco", "colonia_id": "polanco",
        "street": "Moliere 245", "postal_code": "11570",
        "developer_id": "quattro",
        "stage": "preventa", "delivery_estimate": "2027-10",
        "price_from": 14500000, "price_to": 28900000,
        "amenities": ["gym", "alberca", "concierge", "roof", "spa", "sky_lounge", "cava", "seguridad", "salon_eventos"],
        "description": "Torre boutique de 34 niveles sobre Moliere, a dos cuadras de Parque Lincoln. Diseño de SMA + Estudio Herreros. Acabados italianos, cocinas Poliform y sistema domótico integral. Amenidades resort con alberca climatizada, cava privada y sky lounge al nivel 33.",
        "prototypes": [
            {"name": "A", "beds": 2, "baths": 2, "parking": 2, "m2_priv": 115, "m2_balcony": 12, "price_base": 14800000},
            {"name": "B", "beds": 3, "baths": 3, "parking": 2, "m2_priv": 168, "m2_balcony": 18, "price_base": 19200000},
            {"name": "PH", "beds": 3, "baths": 4, "parking": 3, "m2_priv": 235, "m2_balcony": 45, "m2_roof": 72, "price_base": 28500000},
        ],
        "levels": (2, 28),
        "progress": 8,
    },
    {
        "id": "lomas-signature", "slug": "lomas-signature",
        "name": "Lomas Signature", "colonia_id": "lomas-chapultepec",
        "street": "Prado Sur 180", "postal_code": "11000",
        "developer_id": "quattro",
        "stage": "en_construccion", "delivery_estimate": "2026-11",
        "price_from": 22400000, "price_to": 48000000,
        "amenities": ["gym", "alberca", "concierge", "spa", "cava", "seguridad", "salon_eventos", "business_center"],
        "description": "Residencial de 6 niveles con solo 24 unidades. Diseño reservado, vestíbulo con doble altura y obra de arte comisionada. Alberca interior climatizada, cava vinícola y servicio de concierge 24/7.",
        "prototypes": [
            {"name": "A", "beds": 3, "baths": 4, "parking": 3, "m2_priv": 210, "m2_balcony": 24, "price_base": 22800000},
            {"name": "B", "beds": 4, "baths": 5, "parking": 4, "m2_priv": 295, "m2_balcony": 36, "price_base": 32400000},
            {"name": "PH", "beds": 4, "baths": 5, "parking": 4, "m2_priv": 420, "m2_balcony": 85, "m2_roof": 120, "price_base": 48000000},
        ],
        "levels": (1, 6),
        "progress": 54,
    },
    {
        "id": "pedregal-brutalist", "slug": "pedregal-brutalist",
        "name": "Pedregal Brutalist", "colonia_id": "pedregal",
        "street": "Avenida de las Fuentes 72", "postal_code": "01900",
        "developer_id": "origen",
        "stage": "preventa", "delivery_estimate": "2028-03",
        "price_from": 19800000, "price_to": 36500000,
        "amenities": ["gym", "alberca", "spa", "pet", "seguridad", "area_pets", "jardines"],
        "description": "Conjunto residencial de 14 casas brutalistas sobre terreno amplio. Fachadas en concreto martelinado, jardines diseñados por Entorno Taller de Paisaje. Cada casa con alberca privada opcional.",
        "prototypes": [
            {"name": "A", "beds": 3, "baths": 4, "parking": 3, "m2_priv": 280, "m2_balcony": 0, "price_base": 19800000, "m2_roof": 60},
            {"name": "B", "beds": 4, "baths": 5, "parking": 4, "m2_priv": 360, "m2_balcony": 0, "price_base": 26400000, "m2_roof": 85},
            {"name": "C", "beds": 5, "baths": 6, "parking": 4, "m2_priv": 445, "m2_balcony": 0, "price_base": 36500000, "m2_roof": 110},
        ],
        "levels": (1, 3),
        "progress": 4,
    },

    # Trendy / revival (Roma Norte / Condesa / Juárez)
    {
        "id": "tamaulipas-89", "slug": "tamaulipas-89",
        "name": "Tamaulipas 89", "colonia_id": "condesa",
        "street": "Tamaulipas 89", "postal_code": "06140",
        "developer_id": "lumbre",
        "stage": "en_construccion", "delivery_estimate": "2026-08",
        "price_from": 6500000, "price_to": 14200000,
        "amenities": ["roof", "gym", "pet", "bicicletas", "cowork"],
        "description": "Edificio boutique de 8 niveles sobre Tamaulipas, a media cuadra del Parque México. Fachada de cantera artesanal, 28 unidades, rooftop con asadores y vista al parque. Diseño de PRODUCTORA.",
        "prototypes": [
            {"name": "A", "beds": 1, "baths": 1, "parking": 1, "m2_priv": 68, "m2_balcony": 8, "price_base": 6500000},
            {"name": "B", "beds": 2, "baths": 2, "parking": 1, "m2_priv": 96, "m2_balcony": 11, "price_base": 8900000},
            {"name": "C", "beds": 2, "baths": 2, "parking": 2, "m2_priv": 124, "m2_balcony": 14, "price_base": 11400000},
            {"name": "PH", "beds": 3, "baths": 3, "parking": 2, "m2_priv": 156, "m2_balcony": 22, "m2_roof": 48, "price_base": 14200000},
        ],
        "levels": (2, 8),
        "progress": 42,
    },
    {
        "id": "roma-norte-85", "slug": "roma-norte-85",
        "name": "Roma Norte 85", "colonia_id": "roma-norte",
        "street": "Álvaro Obregón 85", "postal_code": "06700",
        "developer_id": "lumbre",
        "stage": "preventa", "delivery_estimate": "2027-04",
        "price_from": 5800000, "price_to": 12800000,
        "amenities": ["roof", "gym", "pet", "cowork", "bicicletas"],
        "description": "34 unidades sobre el corredor cultural de Álvaro Obregón. Fachada restaurada de 1922 integrada con volumen contemporáneo al fondo. Terraza-bar comunal y cowork en planta baja.",
        "prototypes": [
            {"name": "A", "beds": 1, "baths": 1, "parking": 1, "m2_priv": 62, "m2_balcony": 6, "price_base": 5800000},
            {"name": "B", "beds": 2, "baths": 2, "parking": 1, "m2_priv": 88, "m2_balcony": 10, "price_base": 7900000},
            {"name": "C", "beds": 2, "baths": 2, "parking": 1, "m2_priv": 110, "m2_balcony": 14, "price_base": 9800000},
            {"name": "PH", "beds": 3, "baths": 3, "parking": 2, "m2_priv": 148, "m2_balcony": 24, "m2_roof": 45, "price_base": 12800000},
        ],
        "levels": (2, 7),
        "progress": 12,
    },
    {
        "id": "juarez-boutique", "slug": "juarez-boutique",
        "name": "Juárez Boutique", "colonia_id": "juarez",
        "street": "Calle Marsella 42", "postal_code": "06600",
        "developer_id": "cobalto",
        "stage": "preventa", "delivery_estimate": "2027-08",
        "price_from": 3650000, "price_to": 8400000,
        "amenities": ["roof", "gym", "pet", "cowork", "seguridad"],
        "description": "Torre de 32 unidades en el corazón renacido de Juárez. Acabados en micro-cemento y madera natural. A 3 minutos del Ángel de la Independencia.",
        "prototypes": [
            {"name": "A", "beds": 1, "baths": 1, "parking": 1, "m2_priv": 54, "m2_balcony": 4, "price_base": 3650000},
            {"name": "B", "beds": 2, "baths": 2, "parking": 1, "m2_priv": 76, "m2_balcony": 7, "price_base": 5200000},
            {"name": "C", "beds": 2, "baths": 2, "parking": 1, "m2_priv": 94, "m2_balcony": 10, "price_base": 6700000},
            {"name": "PH", "beds": 3, "baths": 2, "parking": 2, "m2_priv": 118, "m2_balcony": 16, "m2_roof": 38, "price_base": 8400000},
        ],
        "levels": (2, 8),
        "progress": 18,
    },

    # Family / mid-up (Del Valle / Narvarte / Anzures)
    {
        "id": "del-valle-garden", "slug": "del-valle-garden",
        "name": "Del Valle Garden", "colonia_id": "del-valle-centro",
        "street": "Uxmal 280", "postal_code": "03100",
        "developer_id": "sereno",
        "stage": "en_construccion", "delivery_estimate": "2026-06",
        "price_from": 4900000, "price_to": 9800000,
        "amenities": ["gym", "roof", "pet", "estacionamiento", "jardines", "area_pets", "salon_eventos"],
        "description": "Edificio de 5 niveles con 42 unidades, áreas verdes de 520 m² y jardín central con árboles maduros preservados. Tipologías garden en planta baja con patio privado.",
        "prototypes": [
            {"name": "A", "beds": 2, "baths": 2, "parking": 1, "m2_priv": 78, "m2_balcony": 9, "price_base": 4900000},
            {"name": "B", "beds": 2, "baths": 2, "parking": 1, "m2_priv": 94, "m2_balcony": 11, "price_base": 5900000},
            {"name": "C", "beds": 3, "baths": 2, "parking": 2, "m2_priv": 116, "m2_balcony": 14, "price_base": 7400000},
            {"name": "G", "beds": 2, "baths": 2, "parking": 1, "m2_priv": 95, "m2_balcony": 25, "price_base": 6800000},
        ],
        "levels": (1, 5),
        "progress": 68,
    },
    {
        "id": "narvarte-32", "slug": "narvarte-32",
        "name": "Narvarte 32", "colonia_id": "narvarte",
        "street": "Eugenia 1100", "postal_code": "03020",
        "developer_id": "atlas-urbano",
        "stage": "preventa", "delivery_estimate": "2027-05",
        "price_from": 3250000, "price_to": 6900000,
        "amenities": ["gym", "roof", "pet", "bicicletas"],
        "description": "Torre de 9 niveles con 48 unidades sobre Eugenia, a 4 minutos del Metro. Fachada de ladrillo artesanal, rooftop con asadores y cowork en planta baja.",
        "prototypes": [
            {"name": "A", "beds": 1, "baths": 1, "parking": 1, "m2_priv": 52, "m2_balcony": 5, "price_base": 3250000},
            {"name": "B", "beds": 2, "baths": 2, "parking": 1, "m2_priv": 72, "m2_balcony": 8, "price_base": 4400000},
            {"name": "C", "beds": 2, "baths": 2, "parking": 1, "m2_priv": 88, "m2_balcony": 10, "price_base": 5500000},
            {"name": "PH", "beds": 3, "baths": 2, "parking": 2, "m2_priv": 108, "m2_balcony": 18, "m2_roof": 35, "price_base": 6900000},
        ],
        "levels": (2, 9),
        "progress": 22,
    },
    {
        "id": "anzures-classic", "slug": "anzures-classic",
        "name": "Anzures Classic", "colonia_id": "anzures",
        "street": "Darwin 108", "postal_code": "11590",
        "developer_id": "habitare-capital",
        "stage": "entrega_inmediata", "delivery_estimate": "2026-02",
        "price_from": 5400000, "price_to": 11200000,
        "amenities": ["gym", "roof", "pet", "seguridad", "estacionamiento", "concierge"],
        "description": "Edificio clásico con 26 unidades en zona residencial muy tranquila. Acabados de lujo, doble frente y terraza comunal en azotea con vista a Chapultepec.",
        "prototypes": [
            {"name": "A", "beds": 2, "baths": 2, "parking": 1, "m2_priv": 86, "m2_balcony": 8, "price_base": 5400000},
            {"name": "B", "beds": 3, "baths": 3, "parking": 2, "m2_priv": 128, "m2_balcony": 12, "price_base": 8200000},
            {"name": "PH", "beds": 3, "baths": 3, "parking": 2, "m2_priv": 164, "m2_balcony": 28, "m2_roof": 55, "price_base": 11200000},
        ],
        "levels": (1, 7),
        "progress": 100,
    },

    # Corporate / Santa Fe
    {
        "id": "santa-fe-tower", "slug": "santa-fe-tower",
        "name": "Santa Fe Tower", "colonia_id": "santa-fe",
        "street": "Prol. Paseo de la Reforma 600", "postal_code": "05348",
        "developer_id": "mosaico",
        "stage": "preventa", "delivery_estimate": "2028-02",
        "price_from": 7400000, "price_to": 17800000,
        "amenities": ["gym", "alberca", "concierge", "sky_lounge", "business_center", "seguridad", "spa"],
        "description": "Torre de 38 niveles con 220 unidades + piso comercial en planta baja. Amenidades full-resort, sky lounge al 37 con vista a toda la ciudad.",
        "prototypes": [
            {"name": "A", "beds": 1, "baths": 1, "parking": 1, "m2_priv": 62, "m2_balcony": 7, "price_base": 7400000},
            {"name": "B", "beds": 2, "baths": 2, "parking": 2, "m2_priv": 95, "m2_balcony": 11, "price_base": 9800000},
            {"name": "C", "beds": 3, "baths": 3, "parking": 2, "m2_priv": 134, "m2_balcony": 16, "price_base": 13200000},
            {"name": "PH", "beds": 3, "baths": 4, "parking": 3, "m2_priv": 186, "m2_balcony": 35, "m2_roof": 0, "price_base": 17800000},
        ],
        "levels": (8, 36),
        "progress": 6,
    },

    # Up-and-coming (Doctores)
    {
        "id": "doctores-loft", "slug": "doctores-loft",
        "name": "Doctores Loft", "colonia_id": "doctores",
        "street": "Dr. Vértiz 340", "postal_code": "06720",
        "developer_id": "agora-urbana",
        "stage": "preventa", "delivery_estimate": "2027-11",
        "price_from": 2450000, "price_to": 4800000,
        "amenities": ["gym", "pet", "cowork", "bicicletas", "seguridad"],
        "description": "60 unidades tipo loft con dobles alturas y acabados industriales. Zona con mayor apreciación proyectada en CDMX (+12% anual). Cowork + cafetería en planta baja.",
        "prototypes": [
            {"name": "L1", "beds": 1, "baths": 1, "parking": 1, "m2_priv": 48, "m2_balcony": 0, "price_base": 2450000},
            {"name": "L2", "beds": 1, "baths": 1, "parking": 1, "m2_priv": 62, "m2_balcony": 5, "price_base": 3100000},
            {"name": "L3", "beds": 2, "baths": 2, "parking": 1, "m2_priv": 82, "m2_balcony": 7, "price_base": 4100000},
            {"name": "PH-L", "beds": 2, "baths": 2, "parking": 2, "m2_priv": 104, "m2_balcony": 18, "m2_roof": 30, "price_base": 4800000},
        ],
        "levels": (2, 6),
        "progress": 28,
    },

    # Emerging (Roma Sur)
    {
        "id": "roma-sur-52", "slug": "roma-sur-52",
        "name": "Roma Sur 52", "colonia_id": "roma-sur",
        "street": "Coahuila 52", "postal_code": "06760",
        "developer_id": "lumbre",
        "stage": "en_construccion", "delivery_estimate": "2026-10",
        "price_from": 4200000, "price_to": 9400000,
        "amenities": ["roof", "gym", "pet", "cowork"],
        "description": "Torre de 12 niveles con fachada de cantera. 38 unidades, rooftop con asadores y estudio yoga. Una calle del Parque Luis Cabrera.",
        "prototypes": [
            {"name": "A", "beds": 1, "baths": 1, "parking": 1, "m2_priv": 56, "m2_balcony": 6, "price_base": 4200000},
            {"name": "B", "beds": 2, "baths": 2, "parking": 1, "m2_priv": 82, "m2_balcony": 9, "price_base": 5800000},
            {"name": "C", "beds": 3, "baths": 2, "parking": 2, "m2_priv": 118, "m2_balcony": 14, "price_base": 7800000},
            {"name": "PH", "beds": 3, "baths": 3, "parking": 2, "m2_priv": 144, "m2_balcony": 22, "m2_roof": 40, "price_base": 9400000},
        ],
        "levels": (2, 11),
        "progress": 48,
    },

    # Coyoacán colonial residential
    {
        "id": "coyoacan-reserve", "slug": "coyoacan-reserve",
        "name": "Coyoacán Reserve", "colonia_id": "coyoacan-centro",
        "street": "Francisco Sosa 215", "postal_code": "04000",
        "developer_id": "solera",
        "stage": "exclusiva", "delivery_estimate": "2026-05",
        "price_from": 9800000, "price_to": 18500000,
        "amenities": ["gym", "alberca", "pet", "seguridad", "jardines", "salon_eventos"],
        "description": "12 casas coloniales restauradas con intervención contemporánea. Jardines privados, patios centrales y acceso controlado. Un proyecto único por su ubicación histórica.",
        "prototypes": [
            {"name": "A", "beds": 3, "baths": 3, "parking": 2, "m2_priv": 210, "m2_balcony": 0, "price_base": 9800000, "m2_roof": 45},
            {"name": "B", "beds": 4, "baths": 4, "parking": 3, "m2_priv": 280, "m2_balcony": 0, "price_base": 13600000, "m2_roof": 60},
            {"name": "C", "beds": 5, "baths": 5, "parking": 4, "m2_priv": 360, "m2_balcony": 0, "price_base": 18500000, "m2_roof": 85},
        ],
        "levels": (1, 2),
        "progress": 88,
    },

    # Nápoles corporate-adjacent
    {
        "id": "napoles-wtc", "slug": "napoles-wtc",
        "name": "Nápoles WTC", "colonia_id": "napoles",
        "street": "Dakota 201", "postal_code": "03810",
        "developer_id": "atlas-urbano",
        "stage": "en_construccion", "delivery_estimate": "2026-12",
        "price_from": 3780000, "price_to": 8200000,
        "amenities": ["gym", "estacionamiento", "seguridad", "business_center", "cowork"],
        "description": "Torre residencial-corporativa a 3 cuadras del WTC. 86 unidades enfocadas a profesionales con oficinas en la zona. Business center y cowork 24/7.",
        "prototypes": [
            {"name": "A", "beds": 1, "baths": 1, "parking": 1, "m2_priv": 52, "m2_balcony": 5, "price_base": 3780000},
            {"name": "B", "beds": 2, "baths": 2, "parking": 1, "m2_priv": 74, "m2_balcony": 8, "price_base": 4900000},
            {"name": "C", "beds": 2, "baths": 2, "parking": 2, "m2_priv": 96, "m2_balcony": 10, "price_base": 6400000},
            {"name": "PH", "beds": 3, "baths": 3, "parking": 2, "m2_priv": 124, "m2_balcony": 18, "m2_roof": 30, "price_base": 8200000},
        ],
        "levels": (3, 18),
        "progress": 38,
    },

    # Cuauhtémoc central
    {
        "id": "cuauhtemoc-central", "slug": "cuauhtemoc-central",
        "name": "Cuauhtémoc Central", "colonia_id": "cuauhtemoc",
        "street": "Río Lerma 120", "postal_code": "06500",
        "developer_id": "cobalto",
        "stage": "entrega_inmediata", "delivery_estimate": "2026-01",
        "price_from": 2850000, "price_to": 5600000,
        "amenities": ["gym", "roof", "cowork", "bicicletas", "pet", "seguridad"],
        "description": "Edificio restaurado de 1948 con intervención contemporánea. 22 unidades tipo studio y 1 recámara. Zona ultra-conectada con 3 líneas del Metro.",
        "prototypes": [
            {"name": "S", "beds": 1, "baths": 1, "parking": 0, "m2_priv": 42, "m2_balcony": 3, "price_base": 2850000},
            {"name": "A", "beds": 1, "baths": 1, "parking": 1, "m2_priv": 58, "m2_balcony": 5, "price_base": 3800000},
            {"name": "B", "beds": 2, "baths": 2, "parking": 1, "m2_priv": 78, "m2_balcony": 7, "price_base": 5100000},
            {"name": "PH", "beds": 2, "baths": 2, "parking": 1, "m2_priv": 94, "m2_balcony": 14, "m2_roof": 22, "price_base": 5600000},
        ],
        "levels": (1, 6),
        "progress": 100,
    },
]


def _photo_urls(dev: dict) -> List[str]:
    """Return 6 Unsplash Source URLs varied by keyword — stable per dev via seed hash."""
    themes = [
        ["modern", "apartment", "architecture"],
        ["luxury", "condo", "interior"],
        ["residential", "building", "facade"],
        ["rooftop", "terrace", "city"],
        ["lobby", "architecture", "contemporary"],
        ["kitchen", "modern", "design"],
        ["pool", "amenities", "resort"],
        ["bedroom", "suite", "luxury"],
        ["living-room", "modern", "interior"],
    ]
    # Use a hash of dev id to vary and avoid duplicates
    digest = hashlib.md5(dev["id"].encode()).hexdigest()
    offsets = [int(digest[i:i+2], 16) for i in range(0, 12, 2)]
    urls = []
    for i in range(6):
        idx = offsets[i] % len(themes)
        keywords = ",".join(themes[idx])
        # Static seed per dev+index keeps image stable across renders
        urls.append(f"https://source.unsplash.com/featured/1200x800/?{keywords}&sig={dev['id']}{i}")
    return urls


def _price_history(dev: dict) -> List[dict]:
    """Synthetic 4-point price history — launch to today showing plusvalía."""
    base = dev["price_from"]
    # Stage determines how much price has moved since launch
    growth = {"preventa": 0.05, "en_construccion": 0.12, "entrega_inmediata": 0.22, "exclusiva": 0.18}
    g = growth.get(dev["stage"], 0.1)
    launch = int(base / (1 + g))
    return [
        {"date": "Lanzamiento", "price": launch},
        {"date": "+6 meses", "price": int(launch * (1 + g * 0.4))},
        {"date": "+12 meses", "price": int(launch * (1 + g * 0.75))},
        {"date": "Hoy", "price": base},
    ]


def _timeline_events(dev: dict) -> List[dict]:
    """Progress log entries — most recent first. Blurred after the first 2 for public users."""
    progress = dev["progress"]
    date_base = dev["delivery_estimate"]
    if progress <= 10:
        return [
            {"date": "Feb 2026", "percentage": progress, "description": "Diseño ejecutivo y trámites de permisos en SEDUVI. Obtención de manifestaciones de construcción. Inicio de excavación planeado para abril."},
            {"date": "Ene 2026", "percentage": max(1, progress - 3), "description": "Licencia de construcción otorgada por la Alcaldía. Campaña de preventa abierta a público general con descuento pre-lanzamiento."},
        ]
    elif progress <= 40:
        return [
            {"date": "Mar 2026", "percentage": progress, "description": f"Avance {progress}%. Estructura niveles 1-3 completada. Colado de losas de concreto armado. Inicio de tabicado en planta baja."},
            {"date": "Ene 2026", "percentage": progress - 12, "description": "Cimentación concluida con pilas de 28 m de profundidad. Inicio de estructura metálica en sótanos."},
            {"date": "Oct 2025", "percentage": progress - 24, "description": "Excavación completada. Primera verificación geotécnica por el DRO. Preparación para colado de plantilla."},
        ]
    elif progress <= 75:
        return [
            {"date": "Mar 2026", "percentage": progress, "description": f"Avance {progress}%. Albañilería en niveles {max(1, progress // 12)} y {max(2, progress // 12 + 1)}. Se completaron muros de colindancia. Inicio de instalaciones hidráulicas en nivel 2."},
            {"date": "Dic 2025", "percentage": progress - 18, "description": "Estructura completa hasta azotea. Inicio de cancelería en fachada. Recepción de primera remesa de acabados italianos."},
            {"date": "Sep 2025", "percentage": progress - 36, "description": "Colado de losas terminado. Inicio de instalación eléctrica y voz/datos nivel por nivel."},
            {"date": "Jun 2025", "percentage": progress - 52, "description": "Cimentación y sótanos terminados. Inicio de estructura sobre rasante."},
        ]
    else:
        return [
            {"date": "Mar 2026", "percentage": progress, "description": f"Avance {progress}%. Acabados finales y pruebas de sistemas. Preparación para entrega formal de primeras unidades."},
            {"date": "Ene 2026", "percentage": progress - 8, "description": "Entrega de amenidades (gym, roof garden) y vestíbulo. Inicio de recorridos de pre-cierre con primeros compradores."},
            {"date": "Oct 2025", "percentage": progress - 22, "description": "Acabados en unidades de los primeros 3 niveles. Pruebas hidráulicas, eléctricas e hidrosanitarias aprobadas por DRO."},
            {"date": "Jul 2025", "percentage": progress - 40, "description": "Albañilería completa en toda la torre. Inicio de cancelería, pisos y plomería fina."},
        ]


def _construction_phases(dev: dict) -> List[dict]:
    """7-phase horizontal timeline."""
    progress = dev["progress"]
    phases = [
        {"key": "excavacion", "label": "Excavación", "threshold": 5},
        {"key": "cimentacion", "label": "Cimentación", "threshold": 15},
        {"key": "estructura", "label": "Estructura", "threshold": 35},
        {"key": "albanileria", "label": "Albañilería", "threshold": 55},
        {"key": "instalaciones", "label": "Instalaciones", "threshold": 75},
        {"key": "acabados", "label": "Acabados", "threshold": 92},
        {"key": "entrega", "label": "Entrega", "threshold": 100},
    ]
    current_idx = 0
    for i, p in enumerate(phases):
        if progress >= p["threshold"]:
            current_idx = i
    for i, p in enumerate(phases):
        p["status"] = "done" if progress >= p["threshold"] and i < current_idx else ("active" if i == current_idx and progress < 100 else ("done" if progress >= p["threshold"] else "pending"))
    return phases


def _generate_units(dev: dict) -> List[dict]:
    """Generate units for a development — cartesian product of prototypes × levels with minor price variation."""
    units = []
    lvl_min, lvl_max = dev["levels"]
    levels = list(range(lvl_min, lvl_max + 1))
    prototypes = dev["prototypes"]

    # For each prototype, create units across a subset of levels
    for proto in prototypes:
        # PH only on top levels
        is_penthouse = proto["name"].startswith("PH")
        proto_levels = levels[-2:] if is_penthouse else levels
        for level in proto_levels:
            # Level premium adds 1-2% per floor above min
            level_premium = (level - lvl_min) * 0.012
            price = int(proto["price_base"] * (1 + level_premium))
            # Randomized but deterministic status distribution
            unit_num = f"{level:02d}{proto['name']}"
            seed = hashlib.md5(f"{dev['id']}{unit_num}".encode()).hexdigest()
            status_val = int(seed[:2], 16) % 100
            if status_val < 55:
                status = "disponible"
            elif status_val < 80:
                status = "reservado"
            else:
                status = "vendido"
            # Bodega: ~40% of units
            bodega = int(seed[2:4], 16) % 100 < 40
            # Parking type
            park_type = "individual" if proto["parking"] >= 2 else ("battery_shared" if int(seed[4:6], 16) % 100 < 30 else "individual")
            m2_terr = 0
            m2_roof = proto.get("m2_roof", 0)
            m2_total = proto["m2_priv"] + proto.get("m2_balcony", 0) + m2_terr + m2_roof

            units.append({
                "id": f"{dev['id']}-{unit_num}",
                "development_id": dev["id"],
                "unit_number": unit_num,
                "prototype": proto["name"],
                "level": level,
                "m2_privative": proto["m2_priv"],
                "m2_balcony": proto.get("m2_balcony", 0),
                "m2_terrace": m2_terr,
                "m2_roof_garden": m2_roof,
                "m2_total": m2_total,
                "bedrooms": proto["beds"],
                "bathrooms": proto["baths"],
                "parking_spots": proto["parking"],
                "parking_type": park_type,
                "bodega": bodega,
                "price": price,
                "price_display": f"${price:,}",
                "status": status,
                "orientation": ["Norte", "Sur", "Oriente", "Poniente"][int(seed[6:8], 16) % 4],
            })

    return units


def _build_dev(dev_raw: dict) -> dict:
    """Enrich raw development with computed fields (photos, units, etc.)."""
    from data_seed import COLONIAS_BY_ID  # reuse colonia centers
    colonia = COLONIAS_BY_ID[dev_raw["colonia_id"]]
    units = _generate_units(dev_raw)
    status_counts = {"disponible": 0, "reservado": 0, "vendido": 0}
    for u in units:
        status_counts[u["status"]] += 1

    # Compute ranges
    beds = [u["bedrooms"] for u in units]
    baths = [u["bathrooms"] for u in units]
    parking = [u["parking_spots"] for u in units]
    m2 = [u["m2_privative"] for u in units]

    return {
        "id": dev_raw["id"],
        "slug": dev_raw["slug"],
        "name": dev_raw["name"],
        "description": dev_raw["description"],
        "colonia_id": dev_raw["colonia_id"],
        "colonia": colonia["name"],
        "alcaldia": colonia["alcaldia"],
        "street": dev_raw["street"],
        "postal_code": dev_raw["postal_code"],
        "city": "Ciudad de México",
        "center": colonia["center"],
        "address_full": f"{dev_raw['street']}, Col. {colonia['name']}, CP {dev_raw['postal_code']}",
        "developer_id": dev_raw["developer_id"],
        "stage": dev_raw["stage"],
        "delivery_estimate": dev_raw["delivery_estimate"],
        "price_from": dev_raw["price_from"],
        "price_to": dev_raw["price_to"],
        "price_from_display": f"${dev_raw['price_from']:,}",
        "price_to_display": f"${dev_raw['price_to']:,}",
        "m2_range": [min(m2), max(m2)],
        "bedrooms_range": [min(beds), max(beds)],
        "bathrooms_range": [min(baths), max(baths)],
        "parking_range": [min(parking), max(parking)],
        "amenities": dev_raw["amenities"],
        "photos": _photo_urls(dev_raw),
        "video_url": None,
        "tour360_url": None,
        "price_history": _price_history(dev_raw),
        "construction_progress": {
            "percentage": dev_raw["progress"],
            "status": "En tiempo según calendario" if dev_raw["progress"] < 100 else "Entrega activa",
            "last_update": "Marzo 2026",
            "log": _timeline_events(dev_raw),
            "phases": _construction_phases(dev_raw),
        },
        "featured": dev_raw["id"] in {"tamaulipas-89", "altavista-polanco", "del-valle-garden", "coyoacan-reserve"},
        "verified": True,
        "units_total": len(units),
        "units_available": status_counts["disponible"],
        "units_reserved": status_counts["reservado"],
        "units_sold": status_counts["vendido"],
        "units": units,  # embedded for now; separate collection in DB refactor phase
        "contact_phone": None,  # falls back to DMX_FALLBACK_WHATSAPP
    }


DEVELOPMENTS = [_build_dev(d) for d in DEVELOPMENTS_RAW]
DEVELOPMENTS_BY_ID = {d["id"]: d for d in DEVELOPMENTS}
ALL_UNITS = [u for d in DEVELOPMENTS for u in d["units"]]
