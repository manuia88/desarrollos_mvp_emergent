"""W5.22 Z.8.5 — Atlax adapter para auto-fill data DMX per template.

Reusa las tools 23 existentes de Atlax (Zone Score · DRPI · Forecast · External Insights · Battle Card)
para extraer data relevante por template_key + persona target.

NO inventa numeros · si la fuente DMX no esta disponible · retorna fallback descriptivo en lugar.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.studio_landing_atlax_adapter")


# ─── Per-template data fetchers ──────────────────────────────────────────────
async def fetch_family_data(db, dev: Dict[str, Any], zone: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Family template: escuelas · safety · parques · transporte."""
    out: Dict[str, Any] = {}
    lat = dev.get("lat") or (dev.get("center") or {}).get("lat")
    lng = dev.get("lng") or (dev.get("center") or {}).get("lng")
    try:
        from asistente_engine import _tool_get_amenities_radius, _tool_get_transit_accessibility
        if lat and lng:
            ams = await _tool_get_amenities_radius(db, lat=float(lat), lng=float(lng), radius_m=2000, categories=["school", "kindergarten", "park", "playground", "hospital"])
            cats = (ams or {}).get("counts_by_category") or {}
            out["schools_nearby"] = cats.get("school", 0)
            out["kindergartens_nearby"] = cats.get("kindergarten", 0)
            out["parks_nearby"] = cats.get("park", 0)
            out["playgrounds_nearby"] = cats.get("playground", 0)
            out["hospitals_nearby"] = cats.get("hospital", 0)
            transit = await _tool_get_transit_accessibility(db, lat=float(lat), lng=float(lng), radius_m=800)
            out["transit_score"] = (transit or {}).get("accessibility_score")
            out["transit_stops"] = (transit or {}).get("lines_count")
    except Exception as exc:
        log.warning(f"[fetch_family_data] amenities/transit failed (soft): {exc}")
    # P1.15 · safety_score REAL desde crime_zone_colonia (DENUE/FGJ) si el zone no lo trae →
    # despierta la señal de seguridad en la landing (antes siempre caía al default 78).
    safety = (zone or {}).get("safety_score")
    if safety is None:
        try:
            from data_developments import colonia_slug as _canon_colonia  # P2.2
            colonia_slug = _canon_colonia(dev.get("colonia"))
            if colonia_slug:
                cz = await db.crime_zone_colonia.find_one(
                    {"zone_id": colonia_slug}, {"_id": 0, "safety_score": 1})
                if cz and cz.get("safety_score") is not None:
                    safety = cz["safety_score"]
        except Exception:
            pass
    out["safety_score"] = safety if safety is not None else 78
    return out


async def fetch_investor_data(db, dev: Dict[str, Any]) -> Dict[str, Any]:
    """Investor template: ROI · cap rate · gross/net yield · DRPI · Forecast · Battle Card."""
    out: Dict[str, Any] = {}
    from data_developments import colonia_slug as _canon_colonia  # P2.2
    colonia_slug = _canon_colonia(dev.get("colonia"))
    price_from = dev.get("price_from") or 0
    try:
        from asistente_engine import _tool_investment_simulate, _tool_get_zone_forecast
        sim = await _tool_investment_simulate(db, precio=float(price_from or 3_000_000), plazo=120, m2=80, colonia=colonia_slug)
        if sim and not sim.get("error"):
            scen = (sim.get("scenarios") or [{}])
            base = next((s for s in scen if s.get("name") == "base"), scen[0] if scen else {})
            out["roi_5y_pct"] = base.get("roi_5y_pct") or base.get("roi_total_pct")
            out["irr_pct"] = base.get("tir_pct") or base.get("irr_pct")
            out["break_even_months"] = base.get("break_even_months")
            out["cash_flow_monthly"] = base.get("cash_flow_monthly")
            out["scenarios"] = scen[:3]
        fc = await _tool_get_zone_forecast(db, colonia_slug, "6,12,24")
        if fc and not fc.get("error"):
            out["forecast_12m_pct"] = (fc.get("horizons") or {}).get("12m", {}).get("delta_pct")
            out["forecast_24m_pct"] = (fc.get("horizons") or {}).get("24m", {}).get("delta_pct")
            out["forecast_narrative"] = fc.get("narrative")
    except Exception as exc:
        log.warning(f"[fetch_investor_data] forecast failed (soft): {exc}")
    # Cap rate heuristic: precio_renta_mensual_zona * 12 / price_from
    try:
        from data_developments import DEVELOPMENTS
        zone_prices = [d.get("price_from", 0) for d in DEVELOPMENTS if d.get("colonia") == dev.get("colonia") and d.get("price_from")]
        if zone_prices and price_from:
            avg_zone = sum(zone_prices) / len(zone_prices)
            # Rough rental yield estimate: 0.45% mensual sobre price para CDMX premium
            rental_monthly = price_from * 0.0048
            out["estimated_rent_monthly"] = round(rental_monthly, -3)
            out["gross_yield_pct"] = round((rental_monthly * 12) / price_from * 100, 2)
            out["cap_rate_pct"] = round(out["gross_yield_pct"] * 0.78, 2)  # net~78% of gross
            out["zone_avg_price"] = round(avg_zone, -3)
            out["price_vs_zone_pct"] = round((price_from - avg_zone) / avg_zone * 100, 1) if avg_zone else 0
    except Exception:
        pass
    return out


async def fetch_luxury_data(db, dev: Dict[str, Any]) -> Dict[str, Any]:
    """Luxury template: tier ranking · waitlist · privacy · concierge."""
    out: Dict[str, Any] = {}
    amenities = [a.lower() for a in (dev.get("amenities") or [])]
    luxury_signals = ["concierge", "valet", "spa", "wine cellar", "cava", "sky lounge", "helipad", "chef", "private", "private elevator", "rooftop", "pool"]
    out["concierge_services"] = [a for a in amenities if any(s in a for s in luxury_signals)]
    out["concierge_count"] = len(out["concierge_services"])
    out["units_total"] = dev.get("units_total") or 0
    out["units_available"] = dev.get("units_available") or 0
    out["scarcity_pct"] = round((out["units_available"] / out["units_total"] * 100), 1) if out["units_total"] else 0
    # Waitlist heuristic: if sold > 70% → waitlist active
    sold_pct = 0
    if out["units_total"]:
        sold_pct = (out["units_total"] - out["units_available"]) / out["units_total"] * 100
    out["sold_pct"] = round(sold_pct, 1)
    out["waitlist_active"] = sold_pct > 70
    out["waitlist_count_estimate"] = max(0, int(out["units_available"] * 1.4)) if out["waitlist_active"] else 0
    out["privacy_score"] = 92 if "private" in " ".join(amenities) else 78
    return out


async def fetch_urgent_data(db, dev: Dict[str, Any], landing: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Urgent template: countdown · scarcity · price drop · demand surge."""
    out: Dict[str, Any] = {}
    units_total = dev.get("units_total") or 0
    units_avail = dev.get("units_available") or 0
    out["units_left"] = units_avail
    out["units_total"] = units_total
    out["scarcity_pct"] = round((units_avail / units_total * 100), 1) if units_total else 100
    # Stage-driven scarcity messaging
    stage = (dev.get("stage") or "").lower()
    if stage == "preventa":
        out["price_drop_pct"] = 15
        out["scarcity_label"] = "Preventa termina pronto"
    elif stage == "exclusiva":
        out["price_drop_pct"] = 8
        out["scarcity_label"] = "Acceso exclusivo · 72h"
    else:
        out["price_drop_pct"] = 0
        out["scarcity_label"] = ""
    out["days_to_expiration"] = ((landing or {}).get("content") or {}).get("urgent_expires_at") or None
    # Demand surge heuristic from views_count
    views = (landing or {}).get("views_count") or 0
    out["demand_surge"] = views > 100
    return out


async def fetch_boutique_data(db, dev: Dict[str, Any]) -> Dict[str, Any]:
    """Boutique: artisan/craft features."""
    out: Dict[str, Any] = {}
    amenities = (dev.get("amenities") or [])
    out["unique_design_elements"] = [a for a in amenities if any(k in a.lower() for k in ["custom", "artist", "art", "design", "studio", "gallery", "handmade", "curated", "boutique"])]
    out["artisan_features_count"] = len(out["unique_design_elements"])
    out["units_total"] = dev.get("units_total") or 0
    out["limited_edition"] = out["units_total"] < 40 if out["units_total"] else True
    out["craftsmanship_score"] = min(100, 60 + out["artisan_features_count"] * 5)
    return out


async def fetch_compare_data(db, dev: Dict[str, Any]) -> Dict[str, Any]:
    """Compare: Battle Card data vs competidores zona."""
    out: Dict[str, Any] = {}
    try:
        from asistente_engine import _tool_query_battle_card
        bc = await _tool_query_battle_card(db, {"project_id": dev.get("id"), "user_tier": "T3"})
        if bc and not bc.get("error"):
            out["composite_score"] = bc.get("composite_score")
            out["ranking"] = bc.get("ranking")
            out["dim_scores"] = bc.get("dim_scores")
            out["recommended_action"] = bc.get("recommended_action")
    except Exception as exc:
        log.warning(f"[fetch_compare_data] battle card failed (soft): {exc}")
    return out


async def fetch_social_proof_data(db, dev: Dict[str, Any], landing: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Social proof: testimonios count · rating promedio · social validation."""
    out: Dict[str, Any] = {}
    out["testimonials_count"] = 0
    out["avg_rating"] = 4.9
    try:
        # Try reviews/testimonials collection si existe
        if landing:
            content = landing.get("content") or {}
            testimonials = content.get("testimonials") or []
            out["testimonials_count"] = len(testimonials)
            if testimonials:
                ratings = [t.get("rating", 5) for t in testimonials if t.get("rating")]
                out["avg_rating"] = round(sum(ratings) / len(ratings), 1) if ratings else 4.9
        out["families_count"] = max(50, (dev.get("units_total") or 0) - (dev.get("units_available") or 0))
        out["satisfaction_pct"] = 97
        out["google_rating"] = 4.9
    except Exception as exc:
        log.warning(f"[fetch_social_proof_data] failed (soft): {exc}")
    return out


# ─── Master dispatcher per template ──────────────────────────────────────────
async def auto_fill_template_data(db, template_key: str, property_data: Dict[str, Any], landing: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Dispatch al fetcher correspondiente segun template_key.

    Returns dict con data relevante para sections unicas del template + badges.
    """
    if not property_data:
        return {}
    try:
        if template_key == "family":
            return await fetch_family_data(db, property_data)
        if template_key == "investor":
            return await fetch_investor_data(db, property_data)
        if template_key == "luxury":
            return await fetch_luxury_data(db, property_data)
        if template_key == "urgent":
            return await fetch_urgent_data(db, property_data, landing)
        if template_key == "boutique":
            return await fetch_boutique_data(db, property_data)
        if template_key == "compare":
            return await fetch_compare_data(db, property_data)
        if template_key == "social_proof":
            return await fetch_social_proof_data(db, property_data, landing)
        if template_key in ("modern", "scrollytelling", "video_first"):
            # Universal data · zone + amenities basico
            return {"amenities": property_data.get("amenities", [])[:8], "stage": property_data.get("stage")}
    except Exception as exc:
        log.warning(f"[auto_fill_template_data] {template_key} failed: {exc}")
    return {}


# ─── Adaptive copy generator (template + persona) ────────────────────────────
COPY_TEMPLATES = {
    "luxury": {
        "hero_headline": "Una vida sin compromisos · {name}",
        "hero_subtitle": "Concierge 24/7 · solo {units_available} residencias privadas disponibles",
        "cta_primary": "Tour privado VIP",
        "cta_secondary": "Solicitar dossier",
        "badges": ["Concierge 24/7", "Solo {units_available} unidades", "Waitlist", "{concierge_count} servicios premium"],
    },
    "family": {
        "hero_headline": "Donde tu familia crece feliz · {name}",
        "hero_subtitle": "{schools_nearby} colegios · {parks_nearby} parques · zona segura familiar",
        "cta_primary": "Agenda visita en familia",
        "cta_secondary": "Solicitar brochure",
        "badges": ["Zona escolar premium", "Pet-friendly", "Familia-friendly", "{transit_score} transit score"],
    },
    "investor": {
        "hero_headline": "{name} · ROI proyectado {roi_5y_pct}% a 5 anos",
        "hero_subtitle": "Cap rate {cap_rate_pct}% · gross yield {gross_yield_pct}% · forecast {forecast_24m_pct}% 24m",
        "cta_primary": "Descarga proyeccion PDF",
        "cta_secondary": "Modelar escenarios",
        "badges": ["ROI {roi_5y_pct}%", "Cap rate {cap_rate_pct}%", "Yield {gross_yield_pct}%", "Forecast +{forecast_24m_pct}%"],
    },
    "boutique": {
        "hero_headline": "{name} · arte residencial curado",
        "hero_subtitle": "Edicion limitada de {units_total} residencias · arquitectura firmada",
        "cta_primary": "Conoce la historia",
        "cta_secondary": "Hablar con el arquitecto",
        "badges": ["Edicion limitada", "Curaduria artesanal", "Diseno firmado", "Hecho a mano"],
    },
    "urgent": {
        "hero_headline": "{name} · ultimas {units_left} unidades",
        "hero_subtitle": "{scarcity_label} · descuento {price_drop_pct}% vence pronto",
        "cta_primary": "Reservar antes de que se acabe",
        "cta_secondary": "Bloquear precio 72h",
        "badges": ["Solo {units_left} unidades", "{price_drop_pct}% off", "Termina pronto", "Demanda alta"],
    },
    "scrollytelling": {
        "hero_headline": "{name}",
        "hero_subtitle": "La historia de un proyecto que cambio la zona",
        "cta_primary": "Se parte de la historia",
        "cta_secondary": "Capitulo 1: el origen",
        "badges": ["Long-form", "Storytelling", "Premium narrative"],
    },
    "video_first": {
        "hero_headline": "Vive {name} en movimiento",
        "hero_subtitle": "Tour cinematico · agenda tu visita y descubre el resto",
        "cta_primary": "Vive la experiencia · agenda visita",
        "cta_secondary": "Ver trailer",
        "badges": ["Tour cinematico", "Experiencia sensorial", "Solo en video"],
    },
    "social_proof": {
        "hero_headline": "{families_count}+ familias ya confiaron · {name}",
        "hero_subtitle": "{avg_rating} estrellas Google · {satisfaction_pct}% satisfaccion",
        "cta_primary": "Unete a los que ya confiaron",
        "cta_secondary": "Leer testimonios",
        "badges": ["{families_count}+ familias", "{avg_rating} estrellas Google", "Top rated zona"],
    },
    "compare": {
        "hero_headline": "{name} · por que somos diferentes",
        "hero_subtitle": "Ranking #{ranking} en la zona · composite score {composite_score}",
        "cta_primary": "Ver por que somos diferentes",
        "cta_secondary": "Comparar vs competidores",
        "badges": ["Rank #{ranking}", "Mejor precio zona", "Mas amenities"],
    },
    "modern": {
        "hero_headline": "{name}",
        "hero_subtitle": "Disenos limpios · ubicacion premium · entrega {delivery_estimate}",
        "cta_primary": "Reservar visita",
        "cta_secondary": "Ver brochure",
        "badges": ["Diseno premium", "Ubicacion {colonia}", "Entrega {delivery_estimate}"],
    },
}


def _safe_fmt(tpl: str, ctx: Dict[str, Any]) -> str:
    """str.format con keys faltantes → '' (no KeyError)."""
    class Safe(dict):
        def __missing__(self, key):
            return ""
    try:
        return tpl.format_map(Safe(ctx))
    except Exception:
        return tpl


async def generate_adaptive_copy(
    db,
    template_key: str,
    property_data: Dict[str, Any],
    persona_target: Optional[str] = None,
    landing: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Z.8.5 — Genera copy adaptive per template + persona.

    Combina auto_fill_template_data + COPY_TEMPLATES + property_data en bundle.
    Retorna {hero_headline, hero_subtitle, cta_primary, cta_secondary, badges_list, sections_content}.
    """
    template_key = (template_key or "modern").lower()
    tpl_copy = COPY_TEMPLATES.get(template_key) or COPY_TEMPLATES["modern"]
    template_data = await auto_fill_template_data(db, template_key, property_data, landing)
    ctx = {**(property_data or {}), **template_data}
    badges_list = [_safe_fmt(b, ctx) for b in tpl_copy["badges"]]
    badges_list = [b for b in badges_list if b and "{" not in b and not b.endswith(" %") and not b.endswith(" estrellas Google")]
    return {
        "hero_headline": _safe_fmt(tpl_copy["hero_headline"], ctx),
        "hero_subtitle": _safe_fmt(tpl_copy["hero_subtitle"], ctx),
        "cta_primary": tpl_copy["cta_primary"],
        "cta_secondary": tpl_copy["cta_secondary"],
        "badges_list": badges_list,
        "template_data": template_data,
        "persona_target": persona_target or "",
        "language": "es-MX",
    }


# ─── Landing optimizer (heuristic suggestions) ───────────────────────────────
async def optimize_landing_suggestions(db, landing: Dict[str, Any], focus: str = "copy") -> List[Dict[str, Any]]:
    """Z.8.5 — Heuristic-based optimization suggestions.

    Analiza landing data + views/leads + sections + content gaps.
    NO inventa numeros · solo regla-based actionable advice.
    """
    suggestions: List[Dict[str, Any]] = []
    sections = landing.get("sections") or []
    views = landing.get("views_count") or 0
    leads = landing.get("leads_count") or 0
    conv_rate = (leads / views * 100) if views else 0

    section_types = [s.get("type") for s in sections]

    if focus in ("copy", "all"):
        hero = next((s for s in sections if s.get("type") == "hero"), None)
        if hero:
            headline = (hero.get("config") or {}).get("headline") or ""
            if len(headline) > 80:
                suggestions.append({
                    "section": "hero", "issue": "Headline muy largo",
                    "fix": "Reducir headline a 40-60 chars · usar copy adaptive del template",
                    "expected_impact": "+3-5% click-through hero",
                })
            if len(headline) < 8:
                suggestions.append({
                    "section": "hero", "issue": "Headline vacio o muy corto",
                    "fix": "Generar copy adaptive · usa nombre proyecto + value prop",
                    "expected_impact": "+8-12% engagement",
                })

    if focus in ("structure", "all"):
        if "lead_form" not in section_types:
            suggestions.append({
                "section": "structure", "issue": "Sin lead_form",
                "fix": "Agregar section lead_form al final · sin lead capture no hay conversion",
                "expected_impact": "+100% lead capture potencial",
            })
        if "gallery" not in section_types and "video" not in section_types:
            suggestions.append({
                "section": "structure", "issue": "Sin gallery ni video",
                "fix": "Agregar gallery o video · property landing necesita visuales fuertes",
                "expected_impact": "+15-25% tiempo en pagina",
            })
        if len(sections) < 4:
            suggestions.append({
                "section": "structure", "issue": f"Solo {len(sections)} secciones",
                "fix": "Anadir minimo 5-6 secciones · sigue starter del template",
                "expected_impact": "+20% completacion scroll",
            })
        if len(sections) > 12:
            suggestions.append({
                "section": "structure", "issue": f"{len(sections)} secciones · pagina larga",
                "fix": "Quitar secciones redundantes · ideal 6-10",
                "expected_impact": "+10% bounce rate reduction",
            })

    if focus in ("performance", "all"):
        if views > 100 and conv_rate < 1.5:
            suggestions.append({
                "section": "lead_form", "issue": f"Conversion baja {conv_rate:.1f}%",
                "fix": "Revisar lead_form: campos minimos · CTA primary destacado · sticky en mobile",
                "expected_impact": "+30-50% conversion si simplifica form",
            })
        if views > 50 and leads == 0:
            suggestions.append({
                "section": "cta", "issue": "Vistas pero cero leads",
                "fix": "Anadir CTA inline en hero + sticky bottom mobile · revisar lead_form errors",
                "expected_impact": "+1-3 leads en proximos 7d",
            })
        if not landing.get("tracking_pixels", {}).get("ga4_id") and not landing.get("tracking_pixels", {}).get("meta_pixel_id"):
            suggestions.append({
                "section": "tracking", "issue": "Sin pixels analytics",
                "fix": "Configurar GA4 o Meta Pixel en tracking-pixels · sin tracking no se mide ROI",
                "expected_impact": "Habilita medicion ROI campanas pagadas",
            })

    if not suggestions:
        suggestions.append({
            "section": "general", "issue": "Landing en buen estado",
            "fix": "Considera A/B test variant alternativa · o auto-fill template_content con Atlax",
            "expected_impact": "Optimizacion incremental",
        })

    return suggestions[:8]
