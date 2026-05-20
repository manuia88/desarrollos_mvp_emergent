"""W5.22 Z.8.2 — 3 Starter templates editables (sections precargadas).

Each starter = list of sections con config preliminar editable.
Returned via GET /api/studio/landing/starters · used by CreateLandingModal step 3.
"""
from __future__ import annotations

from typing import Any, Dict, List


def _section(stype: str, config: Dict[str, Any], style: Dict[str, Any] | None = None) -> Dict[str, Any]:
    return {
        "id": f"s_{stype}_{abs(hash(stype + str(config))) % 100000}",
        "type": stype,
        "config": config,
        "style_overrides": style or {"bg_color": "", "padding_top": 80, "padding_bottom": 80, "text_align": "left"},
        "visible": True,
    }


STARTER_PROPERTY: List[Dict[str, Any]] = [
    _section("hero", {
        "variant": "fullscreen",
        "headline": "Tu proximo proyecto en CDMX",
        "subhead": "Plusvalia comprobada · entrega Q4 2026 · desde $4.8M MXN",
        "bg_image": "",
        "primary_cta": {"text": "Reservar visita", "action": "scroll_to_lead"},
        "secondary_cta": {"text": "Ver brochure", "action": "download_pdf"},
    }),
    _section("property_showcase", {
        "show_features_grid": True,
        "show_units_progress": True,
        "show_3dgs_link": True,
    }),
    _section("gallery", {
        "layout": "grid",
        "asset_urls": [],
        "columns": 3,
    }),
    _section("map", {
        "lat": 19.4326,
        "lng": -99.1332,
        "zoom": 15,
        "marker_label": "Aqui estamos",
    }),
    _section("testimonials", {
        "layout": "grid",
        "items": [
            {"author": "Maria L.", "role": "Compradora 2025", "quote": "Proceso transparente y rapido.", "rating": 5},
        ],
    }),
    _section("lead_form", {
        "headline": "Agenda tu visita",
        "subhead": "Te confirmamos en menos de 24h.",
        "fields": [
            {"name": "nombre", "type": "text", "label": "Nombre", "required": True},
            {"name": "email", "type": "email", "label": "Correo", "required": True},
            {"name": "telefono", "type": "phone", "label": "Telefono", "required": True},
            {"name": "mensaje", "type": "text", "label": "Mensaje (opcional)", "required": False},
        ],
        "steps": 1,
        "submit_text": "Enviar solicitud",
        "success_message": "Gracias. Te contactamos pronto.",
    }),
]

STARTER_PERSONAL_BRAND: List[Dict[str, Any]] = [
    _section("hero", {
        "variant": "split",
        "headline": "Hola · soy tu asesor inmobiliario",
        "subhead": "12 anios cerrando operaciones en CDMX",
        "primary_cta": {"text": "Hablar conmigo", "action": "scroll_to_lead"},
    }),
    _section("stats", {
        "items": [
            {"label": "Operaciones cerradas", "value": "240", "suffix": "+"},
            {"label": "Anios de experiencia", "value": "12"},
            {"label": "Clientes satisfechos", "value": "98", "suffix": "%"},
        ],
        "columns": 3,
    }),
    _section("features", {
        "layout": "cards",
        "columns": 3,
        "items": [
            {"icon": "Award", "title": "AMPI certified", "description": "Cumplo con etica AMPI."},
            {"icon": "Shield", "title": "Trust Score 92", "description": "Validado por DMX."},
            {"icon": "Zap", "title": "Respuesta 24h", "description": "Comunicacion garantizada."},
        ],
    }),
    _section("gallery", {
        "layout": "masonry",
        "asset_urls": [],
        "columns": 3,
    }),
    _section("testimonials", {
        "layout": "carousel",
        "items": [],
    }),
    _section("lead_form", {
        "headline": "Contactame",
        "fields": [
            {"name": "nombre", "type": "text", "label": "Nombre", "required": True},
            {"name": "email", "type": "email", "label": "Correo", "required": True},
            {"name": "interes", "type": "select", "label": "Que buscas?", "required": True,
             "options": ["Comprar", "Vender", "Rentar", "Solo info"]},
        ],
        "steps": 1,
        "submit_text": "Enviar",
        "success_message": "Te contacto en 24h.",
    }),
    _section("footer", {
        "show_social": True,
        "show_contact": True,
        "show_disclaimer": True,
    }),
]

STARTER_MARKETPLACE: List[Dict[str, Any]] = [
    _section("hero", {
        "variant": "centered",
        "headline": "Mi portafolio completo",
        "subhead": "Filtra, busca y descubre todos los proyectos que represento en CDMX.",
        "primary_cta": {"text": "Ver inventario", "action": "scroll_to_marketplace"},
    }),
    _section("stats", {
        "items": [
            {"label": "Proyectos activos", "value": "18"},
            {"label": "Alcaldias", "value": "8"},
            {"label": "Desde", "value": "$2.4M", "prefix": ""},
        ],
        "columns": 3,
    }),
    # Z.8.4 — Real marketplace section (sustituye property_showcase pseudo-marketplace)
    _section("marketplace", {
        "title": "Catalogo completo",
    }),
    _section("lead_form", {
        "headline": "Cuentame que buscas",
        "subhead": "Te mando opciones a medida en menos de 24h.",
        "fields": [
            {"name": "nombre", "type": "text", "label": "Nombre", "required": True},
            {"name": "email", "type": "email", "label": "Correo", "required": True},
            {"name": "presupuesto", "type": "select", "label": "Presupuesto", "required": False,
             "options": ["< $3M", "$3M - $6M", "$6M - $10M", "> $10M"]},
            {"name": "zona", "type": "text", "label": "Zona de interes", "required": False},
        ],
        "steps": 2,
        "submit_text": "Enviar",
        "success_message": "Te enviare opciones acorde a tu presupuesto.",
    }),
    _section("footer", {
        "show_social": True,
        "show_contact": True,
        "show_disclaimer": True,
    }),
]


STARTERS: Dict[str, List[Dict[str, Any]]] = {
    "property": STARTER_PROPERTY,
    "personal_brand": STARTER_PERSONAL_BRAND,
    "marketplace": STARTER_MARKETPLACE,
}


def get_starter(landing_type: str) -> List[Dict[str, Any]]:
    import copy
    return copy.deepcopy(STARTERS.get(landing_type, STARTER_PROPERTY))
