"""W5.22 Z.8.5 — 10 Property Templates · specs únicos por persona target.

Cada template define:
  - sections_order: orden distinto de sections (NO mismo orden para todos)
  - unique_section_type: section exclusiva del template (FAMILY=vida_familiar etc)
  - copy_template: headlines/subheads/CTAs/badges en es-MX adaptados per persona
  - data_fields_required: campos especificos que el template muestra
  - theme_key: theme visual de Z.8.3 que mejor matchea (palette+typography+layout)
  - disc_target: D/I/S/C primario · usado por Atlax adaptive copy
  - cta_primary_label: CTA principal especifico del template

Los unique_section_types se renderizan en frontend via SectionRenderer dispatch.
"""
from __future__ import annotations

import copy as _copy
from typing import Any, Dict, List, Optional


# ─── 10 Property Templates ──────────────────────────────────────────────────
PROPERTY_TEMPLATES: Dict[str, Dict[str, Any]] = {
    "modern": {
        "key": "modern",
        "label": "Modern · Property base · universal",
        "theme_key": "modern",
        "disc_target": "balanced",
        "persona_target": "Comprador profesional 30-45 · busca diseno + ubicacion",
        "sections_order": [
            "hero", "property_showcase", "gallery", "stats", "features",
            "map", "video", "testimonials", "lead_form", "footer",
        ],
        "unique_section_type": None,
        "copy_template": {
            "hero_headline": "{name}",
            "hero_subtitle": "Diseno limpio · ubicacion premium · entrega {delivery_estimate}",
            "stats_title": "Lo esencial",
            "features_title": "Lo que vas a vivir",
            "lead_form_headline": "Reservar visita",
        },
        "badges_priority": ["delivery_estimate", "price_from", "amenities_count", "stage"],
        "data_fields_required": ["name", "colonia", "alcaldia", "price_from", "delivery_estimate"],
        "cta_primary_label": "Reservar visita",
        "cta_secondary_label": "Ver brochure",
        "tone": "Limpio · directo · profesional",
    },
    "luxury": {
        "key": "luxury",
        "label": "Luxury · Premium hospitality",
        "theme_key": "luxury",
        "disc_target": "C+D",
        "persona_target": "Comprador 45-65 · networth >$10M MXN · busca status + servicio",
        "sections_order": [
            "hero", "gallery", "servicios_privados", "features", "property_showcase",
            "map", "video", "testimonials", "lead_form", "footer",
        ],
        "unique_section_type": "servicios_privados",
        "copy_template": {
            "hero_headline": "Una vida sin compromisos · {name}",
            "hero_subtitle": "Concierge 24/7 · solo {units_available} residencias privadas disponibles",
            "servicios_title": "Servicios privados incluidos",
            "lead_form_headline": "Tour privado VIP",
        },
        "badges_priority": ["concierge_count", "scarcity_pct", "waitlist", "delivery_estimate"],
        "data_fields_required": ["concierge_services", "units_available", "privacy_score"],
        "cta_primary_label": "Tour privado VIP",
        "cta_secondary_label": "Solicitar dossier",
        "tone": "Exclusivo · time-saver · status",
        "servicios_privados_items": [
            {"icon": "ChefHat", "title": "Chef privado on-demand", "desc": "Reserva con 24h · chef ejecutivo en residencia"},
            {"icon": "Sparkles", "title": "Spa & wellness", "desc": "Spa privado · masaje terapeutico · sauna"},
            {"icon": "Car", "title": "Valet 24/7", "desc": "Acceso vehicular sin tocar volante"},
            {"icon": "Bell", "title": "Concierge", "desc": "Reservas restaurantes · vuelos · eventos"},
            {"icon": "Plane", "title": "Helipad", "desc": "Acceso aereo directo a la torre"},
            {"icon": "User", "title": "Driver dedicado", "desc": "Chofer profesional en residencia"},
        ],
    },
    "family": {
        "key": "family",
        "label": "Family · Calido hogar familiar",
        "theme_key": "family",
        "disc_target": "S+I",
        "persona_target": "Familia 32-42 · 2-3 hijos · busca zona segura escolar pet-friendly",
        "sections_order": [
            "hero", "vida_familiar", "gallery", "features", "property_showcase",
            "stats", "map", "video", "testimonials", "lead_form", "footer",
        ],
        "unique_section_type": "vida_familiar",
        "copy_template": {
            "hero_headline": "Donde tu familia crece feliz · {name}",
            "hero_subtitle": "{schools_nearby} colegios · {parks_nearby} parques · zona segura familiar",
            "vida_familiar_title": "La vida familiar que merece tu familia",
            "lead_form_headline": "Agenda visita en familia",
        },
        "badges_priority": ["schools_nearby", "parks_nearby", "safety_score", "transit_score"],
        "data_fields_required": ["schools_nearby", "parks_nearby", "safety_score", "amenities"],
        "cta_primary_label": "Agenda visita en familia",
        "cta_secondary_label": "Descarga guia zonal",
        "tone": "Calido · seguro · futuro hijos",
        "vida_familiar_cards": [
            {"icon": "GraduationCap", "label": "Colegios cercanos", "data_field": "schools_nearby", "desc_template": "{count} colegios · top zona escolar CDMX"},
            {"icon": "Trees", "label": "Parques 2km", "data_field": "parks_nearby", "desc_template": "{count} parques + areas verdes · pet-friendly"},
            {"icon": "Hospital", "label": "Hospitales", "data_field": "hospitals_nearby", "desc_template": "{count} servicios medicos pediatra cercanos"},
            {"icon": "Bus", "label": "Transporte", "data_field": "transit_score", "desc_template": "Score {score} · acceso facil sin auto"},
        ],
    },
    "investor": {
        "key": "investor",
        "label": "Investor · Data-heavy ROI focused",
        "theme_key": "investor",
        "disc_target": "D+C",
        "persona_target": "Inversionista 35-55 · busca ROI predecible · plusvalia comprobada",
        "sections_order": [
            "hero", "proyeccion_financiera", "property_showcase", "stats",
            "features", "price_table", "map", "video", "testimonials", "lead_form", "footer",
        ],
        "unique_section_type": "proyeccion_financiera",
        "copy_template": {
            "hero_headline": "{name} · ROI proyectado {roi_5y_pct}% a 5 anos",
            "hero_subtitle": "Cap rate {cap_rate_pct}% · gross yield {gross_yield_pct}% · forecast {forecast_24m_pct}% 24m",
            "proyeccion_title": "Proyeccion financiera completa",
            "lead_form_headline": "Descarga proyeccion PDF",
        },
        "badges_priority": ["roi_5y_pct", "cap_rate_pct", "gross_yield_pct", "forecast_24m_pct"],
        "data_fields_required": ["roi_5y_pct", "cap_rate_pct", "gross_yield_pct", "forecast_24m_pct", "estimated_rent_monthly"],
        "cta_primary_label": "Descarga proyeccion PDF",
        "cta_secondary_label": "Modelar mi escenario",
        "tone": "Analitico · numerico · ROI-driven",
        "proyeccion_columns": ["5 anos", "10 anos", "15 anos"],
        "proyeccion_rows": ["Plusvalia esperada", "Renta acumulada", "Cap rate", "Break-even", "TIR", "Cash flow mensual"],
    },
    "boutique": {
        "key": "boutique",
        "label": "Boutique · Artisan curated",
        "theme_key": "boutique",
        "disc_target": "S+I",
        "persona_target": "Comprador 38-55 · valora diseno + unicidad + historia",
        "sections_order": [
            "hero", "curaduria", "gallery", "features", "property_showcase",
            "map", "video", "testimonials", "lead_form", "footer",
        ],
        "unique_section_type": "curaduria",
        "copy_template": {
            "hero_headline": "{name} · arte residencial curado",
            "hero_subtitle": "Edicion limitada de {units_total} residencias · arquitectura firmada",
            "curaduria_title": "Hecho a mano · detalles unicos",
            "lead_form_headline": "Conoce la historia",
        },
        "badges_priority": ["limited_edition", "artisan_features_count", "craftsmanship_score"],
        "data_fields_required": ["unique_design_elements", "limited_edition", "units_total"],
        "cta_primary_label": "Conoce la historia",
        "cta_secondary_label": "Hablar con el arquitecto",
        "tone": "Artesanal · curated · unico",
        "curaduria_cards": [
            {"icon": "Hammer", "title": "Carpinteria custom", "desc": "Maderas mexicanas · ensambladas a mano"},
            {"icon": "Mountain", "title": "Piedras importadas", "desc": "Marmol Carrara · onix Hidalgo · curaduria geologica"},
            {"icon": "Palette", "title": "Arte original", "desc": "Obras comisionadas a artistas mexicanos emergentes"},
            {"icon": "Award", "title": "Arquitecto reconocido", "desc": "Firma con 12+ premios internacionales"},
        ],
    },
    "urgent": {
        "key": "urgent",
        "label": "Urgent · Scarcity countdown",
        "theme_key": "urgent",
        "disc_target": "D+I",
        "persona_target": "Comprador decidido · busca oportunidad · responde a scarcity",
        "sections_order": [
            "countdown", "hero", "scarcity_alert", "property_showcase", "gallery",
            "features", "stats", "map", "lead_form", "footer",
        ],
        "unique_section_type": "scarcity_alert",
        "copy_template": {
            "hero_headline": "{name} · ultimas {units_left} unidades",
            "hero_subtitle": "{scarcity_label} · descuento {price_drop_pct}% vence pronto",
            "scarcity_title": "Por que actuar HOY",
            "lead_form_headline": "Reservar antes de que se acabe",
        },
        "badges_priority": ["units_left", "price_drop_pct", "days_to_expiration"],
        "data_fields_required": ["units_left", "scarcity_label", "price_drop_pct"],
        "cta_primary_label": "Reservar antes de que se acabe",
        "cta_secondary_label": "Bloquear precio 72h",
        "tone": "Urgente · scarcity · se acaba",
        "scarcity_alert_items": [
            {"label": "Unidades restantes", "data_field": "units_left", "icon": "Home"},
            {"label": "Descuento vence", "data_field": "price_drop_pct", "icon": "Tag", "suffix": "%"},
            {"label": "Avance obra", "data_field": "construction_progress", "icon": "TrendingUp", "suffix": "%"},
            {"label": "Reserva con", "data_field": "min_reservation", "icon": "Wallet", "prefix": "$"},
        ],
    },
    "scrollytelling": {
        "key": "scrollytelling",
        "label": "Scrollytelling · Long cinematic story",
        "theme_key": "scrollytelling",
        "disc_target": "I+S",
        "persona_target": "Comprador conectivo · valora narrativa + experiencia + descubrimiento",
        "sections_order": [
            "hero", "capitulo_origen", "capitulo_diseno", "capitulo_vida", "capitulo_inversion",
            "gallery", "features", "property_showcase", "map", "lead_form", "footer",
        ],
        "unique_section_type": "capitulo_origen",
        "copy_template": {
            "hero_headline": "{name}",
            "hero_subtitle": "La historia de un proyecto que transformo {colonia}",
            "lead_form_headline": "Se parte de la historia",
        },
        "badges_priority": ["delivery_estimate", "colonia"],
        "data_fields_required": ["name", "colonia"],
        "cta_primary_label": "Se parte de la historia",
        "cta_secondary_label": "Capitulo 1: el origen",
        "tone": "Narrativo · cinematic · profundo",
        "capitulos": [
            {"key": "capitulo_origen", "num": 1, "title": "El origen", "subtitle": "Como nacio este proyecto", "body_template": "Hace 4 anos · un equipo de arquitectos identifico que {colonia} necesitaba un proyecto diferente · uno que respetara el barrio sin perder ambicion."},
            {"key": "capitulo_diseno", "num": 2, "title": "El diseno", "subtitle": "Vision del arquitecto", "body_template": "Cada metro cuadrado fue dibujado con un proposito · luz natural · circulacion humana · materiales locales."},
            {"key": "capitulo_vida", "num": 3, "title": "La vida adentro", "subtitle": "Como se vive aqui", "body_template": "Desde el desayuno en la terraza hasta la cena en el rooftop · cada espacio invita a habitar el dia completo."},
            {"key": "capitulo_inversion", "num": 4, "title": "La inversion", "subtitle": "El futuro de tu patrimonio", "body_template": "{colonia} crecio 38% en plusvalia en los ultimos 5 anos · este proyecto captura esa tendencia con valor de entrada."},
        ],
    },
    "video_first": {
        "key": "video_first",
        "label": "Video-first · Movie trailer",
        "theme_key": "video_first",
        "disc_target": "I+S",
        "persona_target": "Comprador visual · 28-45 · responde a video cinematic + experiencia",
        "sections_order": [
            "hero", "galeria_video", "property_showcase", "features",
            "stats", "map", "testimonials", "lead_form", "footer",
        ],
        "unique_section_type": "galeria_video",
        "copy_template": {
            "hero_headline": "Vive {name} en movimiento",
            "hero_subtitle": "Tour cinematico · agenda tu visita y descubre el resto",
            "galeria_title": "5 momentos · 5 videos",
            "lead_form_headline": "Vive la experiencia · agenda visita",
        },
        "badges_priority": ["delivery_estimate", "amenities_count"],
        "data_fields_required": ["name", "video_urls"],
        "cta_primary_label": "Vive la experiencia · agenda visita",
        "cta_secondary_label": "Ver trailer",
        "tone": "Cinematic · sensorial · short copy",
        "video_clips_slots": [
            {"slot": "amanecer", "label": "Amanecer en la torre"},
            {"slot": "amenidades", "label": "Tour amenidades"},
            {"slot": "rooftop", "label": "Vista rooftop"},
            {"slot": "drone", "label": "Vista aerea drone"},
            {"slot": "atardecer", "label": "Atardecer rooftop"},
        ],
    },
    "social_proof": {
        "key": "social_proof",
        "label": "Social proof · Testimonios prominentes",
        "theme_key": "social_proof",
        "disc_target": "S+I",
        "persona_target": "Comprador cauteloso · valora validacion social + testimonios reales",
        "sections_order": [
            "hero", "testimonios_grande", "social_stats", "property_showcase",
            "features", "gallery", "map", "lead_form", "footer",
        ],
        "unique_section_type": "social_stats",
        "copy_template": {
            "hero_headline": "{families_count}+ familias ya confiaron · {name}",
            "hero_subtitle": "{avg_rating} estrellas Google · {satisfaction_pct}% satisfaccion",
            "social_stats_title": "Las cifras que importan",
            "lead_form_headline": "Unete a los que ya confiaron",
        },
        "badges_priority": ["families_count", "avg_rating", "satisfaction_pct", "google_rating"],
        "data_fields_required": ["families_count", "avg_rating", "satisfaction_pct"],
        "cta_primary_label": "Unete a los que ya confiaron",
        "cta_secondary_label": "Leer testimonios",
        "tone": "Confianza · social validation · numeros prominentes",
        "social_stats_items": [
            {"label": "Familias confiaron", "data_field": "families_count", "suffix": "+"},
            {"label": "Satisfaccion", "data_field": "satisfaction_pct", "suffix": "%"},
            {"label": "Rating Google", "data_field": "google_rating", "suffix": " estrellas"},
            {"label": "Testimonios", "data_field": "testimonials_count", "suffix": " resenas"},
        ],
    },
    "compare": {
        "key": "compare",
        "label": "Compare · vs competidores",
        "theme_key": "compare",
        "disc_target": "D+C",
        "persona_target": "Comprador racional · evalua opciones · compara antes de decidir",
        "sections_order": [
            "hero", "comparison_table_grande", "property_showcase", "features",
            "stats", "map", "video", "testimonials", "lead_form", "footer",
        ],
        "unique_section_type": "comparison_table_grande",
        "copy_template": {
            "hero_headline": "{name} · por que somos diferentes",
            "hero_subtitle": "Ranking #{ranking} en {colonia} · composite score {composite_score}",
            "comparison_title": "Caracteristica por caracteristica",
            "lead_form_headline": "Ver por que somos diferentes",
        },
        "badges_priority": ["ranking", "composite_score"],
        "data_fields_required": ["ranking", "composite_score", "dim_scores"],
        "cta_primary_label": "Ver por que somos diferentes",
        "cta_secondary_label": "Descargar comparativa",
        "tone": "Claro · diferenciado · esto vs eso",
        "comparison_dimensions": [
            "Precio por m2",
            "Amenidades",
            "Ubicacion (walkability)",
            "Avance obra",
            "Entrega",
            "Reputacion developer",
            "Plusvalia historica zona",
            "Cap rate proyectado",
            "Servicios premium",
            "Sostenibilidad",
        ],
    },
}


def get_property_template_spec(template_key: str) -> Dict[str, Any]:
    """Devuelve spec completo deepcopy · fallback 'modern' si key invalida."""
    spec = PROPERTY_TEMPLATES.get(template_key) or PROPERTY_TEMPLATES["modern"]
    return _copy.deepcopy(spec)


def list_templates_metadata() -> List[Dict[str, Any]]:
    """Metadata liviana para selector UI."""
    out = []
    for k, v in PROPERTY_TEMPLATES.items():
        out.append({
            "key": k,
            "label": v.get("label"),
            "theme_key": v.get("theme_key"),
            "disc_target": v.get("disc_target"),
            "persona_target": v.get("persona_target"),
            "unique_section_type": v.get("unique_section_type"),
            "sections_count": len(v.get("sections_order", [])),
            "cta_primary_label": v.get("cta_primary_label"),
            "tone": v.get("tone"),
        })
    return out


def merge_template_with_data(
    template_spec: Dict[str, Any],
    property_data: Dict[str, Any],
    atlax_data: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    """Renderiza sections array desde template_spec aplicando data hidratada.

    Output: list de section dicts compatible con landing.sections (id, type, config, visible).
    Las sections_order del template definen el orden · cada section recibe config
    con copy_template renderizado + data_fields del template + property_data merged.
    """
    from studio_landing_atlax_adapter import _safe_fmt

    ctx = {**(property_data or {}), **(atlax_data or {})}
    copy_t = template_spec.get("copy_template") or {}
    sections: List[Dict[str, Any]] = []
    order = template_spec.get("sections_order") or []
    template_key = template_spec.get("key", "modern")

    for idx, stype in enumerate(order):
        section_id = f"s_{template_key}_{stype}_{idx}"
        config: Dict[str, Any] = {}

        if stype == "hero":
            config = {
                "variant": "centered",
                "headline": _safe_fmt(copy_t.get("hero_headline", ""), ctx) or property_data.get("name", "Tu proximo proyecto"),
                "subhead": _safe_fmt(copy_t.get("hero_subtitle", ""), ctx),
                "primary_cta": {"text": template_spec.get("cta_primary_label", "Reservar"), "action": "scroll_to_lead"},
                "secondary_cta": {"text": template_spec.get("cta_secondary_label", "Ver mas"), "action": "scroll_to_features"},
                "bg_image": (property_data.get("images") or [None])[0] if property_data.get("images") else "",
            }
        elif stype == "property_showcase":
            config = {"show_features_grid": True, "show_units_progress": True, "show_3dgs_link": False}
        elif stype == "gallery":
            config = {"layout": "grid", "asset_urls": [], "columns": 3}
        elif stype == "stats":
            badges = [{"label": b, "value": str(ctx.get(b, ""))[:24]} for b in (template_spec.get("badges_priority") or [])[:4]]
            config = {"items": badges or [{"label": "Entrega", "value": ctx.get("delivery_estimate", "TBD")}], "columns": min(len(badges) or 3, 4)}
        elif stype == "features":
            config = {"layout": "cards", "columns": 3, "items": [{"icon": "Sparkles", "title": a, "description": ""} for a in (ctx.get("amenities") or [])[:6]]}
        elif stype == "map":
            config = {"lat": ctx.get("lat") or 19.4326, "lng": ctx.get("lng") or -99.1332, "zoom": 15, "marker_label": ctx.get("name", "")}
        elif stype == "video":
            config = {"url": "", "autoplay": True, "muted": True, "loop": True}
        elif stype == "testimonials":
            config = {"layout": "grid", "items": []}
        elif stype == "lead_form":
            config = {
                "headline": _safe_fmt(copy_t.get("lead_form_headline", ""), ctx) or template_spec.get("cta_primary_label", "Contactanos"),
                "subhead": "Te contactamos en menos de 24h.",
                "fields": [
                    {"name": "nombre", "type": "text", "label": "Nombre", "required": True},
                    {"name": "email", "type": "email", "label": "Correo", "required": True},
                    {"name": "telefono", "type": "phone", "label": "Telefono", "required": True},
                    {"name": "mensaje", "type": "text", "label": "Mensaje (opcional)", "required": False},
                ],
                "steps": 1,
                "submit_text": template_spec.get("cta_primary_label", "Enviar"),
                "success_message": "Gracias. Te contactamos pronto.",
            }
        elif stype == "footer":
            config = {"show_social": True, "show_contact": True, "show_disclaimer": True}
        elif stype == "countdown":
            config = {"variant": "banner", "expires_at": "", "title": ""}
        elif stype == "price_table":
            config = {"title": _safe_fmt(copy_t.get("proyeccion_title", "Tipologias"), ctx), "tiers": []}
        # Unique sections: store spec data for frontend to render
        elif stype in {"servicios_privados", "vida_familiar", "proyeccion_financiera", "curaduria", "scarcity_alert", "galeria_video", "social_stats", "testimonios_grande", "comparison_table_grande"}:
            config = {
                "title": _safe_fmt(copy_t.get(f"{stype.split('_')[0]}_title", "") or copy_t.get(f"{stype}_title", ""), ctx) or stype.replace("_", " ").title(),
                "template_key": template_key,
                "items": template_spec.get(f"{stype}_items") or template_spec.get(f"{stype}_cards") or [],
                "spec_data": template_spec,  # frontend lee aqui spec completo para variant rendering
            }
        elif stype.startswith("capitulo_"):
            cap = next((c for c in (template_spec.get("capitulos") or []) if c.get("key") == stype), None)
            if cap:
                config = {
                    "num": cap.get("num"),
                    "title": cap.get("title"),
                    "subtitle": cap.get("subtitle"),
                    "body": _safe_fmt(cap.get("body_template", ""), ctx),
                    "variant": "capitulo",
                }

        sections.append({
            "id": section_id,
            "type": stype if stype not in {"capitulo_origen", "capitulo_diseno", "capitulo_vida", "capitulo_inversion"} else "capitulo",
            "config": config,
            "style_overrides": {},
            "visible": True,
        })

    return sections
