"""W5.22 Z.8.3 — Landing Themes Engine.

10 themes con tokens completos (palette · typography · layout · animation · section_variants).
Cada template_key tiene un theme distintivo que el frontend aplica como OVERRIDE sobre
el design system base (foundation DMX), no como replacement.

Estructura theme:
    name                  Label visible al user en el selector
    use_case_fit          ["property" | "personal_brand" | "marketplace"]
    palette               primary · secondary · accent · bg · text · text_dim · gradient
    typography            heading_font · heading_weight · heading_letter_spacing ·
                          body_font · body_size · line_height · data_font (opcional)
    layout                hero_variant · section_padding · border_radius · card_style ·
                          spacing_scale
    animation             scroll_reveal · transition_curve · duration
    section_variants      mapping section_type → variant key (Hero · Gallery · Features ·
                          Testimonials · Stats · PriceTable · Countdown · Footer · etc)
"""
from __future__ import annotations

from typing import Any, Dict, List


LANDING_THEMES: Dict[str, Dict[str, Any]] = {
    "luxury": {
        "name": "Luxury · Premium hospitality",
        "use_case_fit": ["property"],
        "palette": {
            "primary": "#D4AF37",
            "secondary": "#1A1A1A",
            "accent": "#F5F0E8",
            "bg": "#0A0A0A",
            "text": "#F5F0E8",
            "text_dim": "rgba(245,240,232,0.6)",
            "gradient": "linear-gradient(90deg, #D4AF37, #B8941F)",
        },
        "typography": {
            "heading_font": "'Playfair Display', 'Outfit', serif",
            "heading_weight": "700",
            "heading_letter_spacing": "-0.02em",
            "body_font": "'DM Sans', sans-serif",
            "body_size": "16px",
            "line_height": "1.7",
        },
        "layout": {
            "hero_variant": "fullscreen",
            "section_padding": "120px 24px",
            "border_radius": "0px",
            "card_style": "minimal-border",
            "spacing_scale": "spacious",
        },
        "animation": {
            "scroll_reveal": "fade-up-slow",
            "transition_curve": "cubic-bezier(0.65, 0, 0.35, 1)",
            "duration": "800ms",
        },
        "section_variants": {
            "hero": "fullscreen-text-bottom-left",
            "gallery": "grid-tight",
            "features": "alternating",
            "testimonials": "carousel-large-quote",
            "stats": "default",
            "price_table": "default",
            "countdown": "inline",
            "footer": "minimal",
            "marketplace": "grid-tight-elegant",
        },
    },
    "modern": {
        "name": "Modern · Linear/Stripe minimalist",
        "use_case_fit": ["property", "personal_brand", "marketplace"],
        "palette": {
            "primary": "#6366F1",
            "secondary": "#EC4899",
            "accent": "#F0EBE0",
            "bg": "#06080F",
            "text": "#F0EBE0",
            "text_dim": "rgba(240,235,224,0.62)",
            "gradient": "linear-gradient(90deg, #6366F1, #EC4899)",
        },
        "typography": {
            "heading_font": "'Outfit', sans-serif",
            "heading_weight": "800",
            "heading_letter_spacing": "-0.02em",
            "body_font": "'DM Sans', sans-serif",
            "body_size": "16px",
            "line_height": "1.6",
        },
        "layout": {
            "hero_variant": "centered",
            "section_padding": "80px 24px",
            "border_radius": "16px",
            "card_style": "glass-card",
            "spacing_scale": "balanced",
        },
        "animation": {
            "scroll_reveal": "fade-up",
            "transition_curve": "cubic-bezier(0.22, 1, 0.36, 1)",
            "duration": "320ms",
        },
        "section_variants": {
            "hero": "centered",
            "gallery": "masonry",
            "features": "cards",
            "testimonials": "grid",
            "stats": "default",
            "price_table": "default",
            "countdown": "inline",
            "footer": "default",
            "marketplace": "masonry-clean",
        },
    },
    "family": {
        "name": "Family · Warm home vibes",
        "use_case_fit": ["property"],
        "palette": {
            "primary": "#F97316",
            "secondary": "#10B981",
            "accent": "#FEF3C7",
            "bg": "#1C1410",
            "text": "#FEF3C7",
            "text_dim": "rgba(254,243,199,0.65)",
            "gradient": "linear-gradient(90deg, #F97316, #FBBF24)",
        },
        "typography": {
            "heading_font": "'Outfit', sans-serif",
            "heading_weight": "700",
            "heading_letter_spacing": "-0.01em",
            "body_font": "'DM Sans', sans-serif",
            "body_size": "17px",
            "line_height": "1.7",
        },
        "layout": {
            "hero_variant": "split-image-right",
            "section_padding": "100px 32px",
            "border_radius": "24px",
            "card_style": "soft-shadow",
            "spacing_scale": "comfortable",
        },
        "animation": {
            "scroll_reveal": "fade-up",
            "transition_curve": "ease-out",
            "duration": "450ms",
        },
        "section_variants": {
            "hero": "split-image-right",
            "gallery": "grid-rounded",
            "features": "icons-warm",
            "testimonials": "carousel-photos",
            "stats": "default",
            "price_table": "default",
            "countdown": "inline",
            "footer": "default",
            "marketplace": "grid-rounded-warm",
        },
    },
    "investor": {
        "name": "Investor · Data-heavy Wall Street",
        "use_case_fit": ["marketplace", "property"],
        "palette": {
            "primary": "#3B82F6",
            "secondary": "#22C55E",
            "accent": "#0F172A",
            "bg": "#020617",
            "text": "#E2E8F0",
            "text_dim": "rgba(226,232,240,0.6)",
            "gradient": "linear-gradient(90deg, #3B82F6, #22C55E)",
        },
        "typography": {
            "heading_font": "'Outfit', sans-serif",
            "heading_weight": "800",
            "heading_letter_spacing": "-0.02em",
            "body_font": "'DM Sans', sans-serif",
            "body_size": "15px",
            "line_height": "1.5",
            "data_font": "'JetBrains Mono', 'Menlo', monospace",
        },
        "layout": {
            "hero_variant": "stats-hero",
            "section_padding": "64px 24px",
            "border_radius": "8px",
            "card_style": "data-card",
            "spacing_scale": "dense",
        },
        "animation": {
            "scroll_reveal": "fade-in",
            "transition_curve": "linear",
            "duration": "200ms",
        },
        "section_variants": {
            "hero": "stats-hero",
            "gallery": "grid-tight",
            "features": "minimal",
            "testimonials": "grid",
            "stats": "big-numbers-mono",
            "price_table": "highlighted-comparison",
            "countdown": "inline",
            "footer": "default",
            "marketplace": "data-table",
        },
    },
    "boutique": {
        "name": "Boutique · Artisan craft curated",
        "use_case_fit": ["property", "personal_brand"],
        "palette": {
            "primary": "#92400E",
            "secondary": "#D97706",
            "accent": "#FEF3C7",
            "bg": "#1C1410",
            "text": "#FEF3C7",
            "text_dim": "rgba(254,243,199,0.6)",
            "gradient": "linear-gradient(90deg, #92400E, #D97706)",
        },
        "typography": {
            "heading_font": "'Lora', 'Playfair Display', serif",
            "heading_weight": "600",
            "heading_letter_spacing": "-0.01em",
            "body_font": "'DM Sans', sans-serif",
            "body_size": "16px",
            "line_height": "1.7",
        },
        "layout": {
            "hero_variant": "portrait-frame",
            "section_padding": "96px 32px",
            "border_radius": "4px",
            "card_style": "textured-paper",
            "spacing_scale": "comfortable",
        },
        "animation": {
            "scroll_reveal": "fade-up-slow",
            "transition_curve": "ease-in-out",
            "duration": "600ms",
        },
        "section_variants": {
            "hero": "portrait-frame",
            "gallery": "polaroid-stack",
            "features": "alternating-text",
            "testimonials": "single-large",
            "stats": "default",
            "price_table": "default",
            "countdown": "inline",
            "footer": "default",
            "marketplace": "polaroid-stack",
        },
    },
    "urgent": {
        "name": "Urgent · Scarcity countdown",
        "use_case_fit": ["property", "marketplace"],
        "palette": {
            "primary": "#EF4444",
            "secondary": "#F97316",
            "accent": "#FEE2E2",
            "bg": "#0F0606",
            "text": "#FEE2E2",
            "text_dim": "rgba(254,226,226,0.65)",
            "gradient": "linear-gradient(90deg, #EF4444, #F97316)",
        },
        "typography": {
            "heading_font": "'Outfit', sans-serif",
            "heading_weight": "800",
            "heading_letter_spacing": "-0.04em",
            "body_font": "'DM Sans', sans-serif",
            "body_size": "16px",
            "line_height": "1.5",
        },
        "layout": {
            "hero_variant": "countdown-prominent",
            "section_padding": "60px 20px",
            "border_radius": "12px",
            "card_style": "alert-bordered",
            "spacing_scale": "tight",
        },
        "animation": {
            "scroll_reveal": "slide-in",
            "transition_curve": "cubic-bezier(0.34, 1.56, 0.64, 1)",
            "duration": "350ms",
        },
        "section_variants": {
            "hero": "countdown-prominent",
            "gallery": "masonry",
            "features": "checkmarks-fast",
            "testimonials": "grid",
            "stats": "default",
            "price_table": "default",
            "countdown": "banner",
            "footer": "default",
            "marketplace": "scarcity-cards",
        },
    },
    "scrollytelling": {
        "name": "Scrollytelling · Long cinematic story",
        "use_case_fit": ["personal_brand", "property"],
        "palette": {
            "primary": "#7C3AED",
            "secondary": "#EC4899",
            "accent": "#F0EBE0",
            "bg": "#0A0612",
            "text": "#F0EBE0",
            "text_dim": "rgba(240,235,224,0.65)",
            "gradient": "linear-gradient(90deg, #7C3AED, #EC4899)",
        },
        "typography": {
            "heading_font": "'Outfit', sans-serif",
            "heading_weight": "700",
            "heading_letter_spacing": "-0.02em",
            "body_font": "'DM Sans', sans-serif",
            "body_size": "18px",
            "line_height": "1.7",
        },
        "layout": {
            "hero_variant": "parallax-fullscreen",
            "section_padding": "140px 48px",
            "border_radius": "12px",
            "card_style": "transparent-overlay",
            "spacing_scale": "very-spacious",
        },
        "animation": {
            "scroll_reveal": "parallax-slow",
            "transition_curve": "cubic-bezier(0.22, 1, 0.36, 1)",
            "duration": "1200ms",
        },
        "section_variants": {
            "hero": "parallax-fullscreen",
            "gallery": "fade-sequence",
            "features": "scroll-sticky",
            "testimonials": "cinematic",
            "stats": "default",
            "price_table": "default",
            "countdown": "inline",
            "footer": "default",
            "marketplace": "fade-grid",
        },
    },
    "video_first": {
        "name": "Video-first · Movie trailer feel",
        "use_case_fit": ["property"],
        "palette": {
            "primary": "#FFFFFF",
            "secondary": "#EC4899",
            "accent": "#1A1A1A",
            "bg": "#000000",
            "text": "#FFFFFF",
            "text_dim": "rgba(255,255,255,0.7)",
            "gradient": "linear-gradient(180deg, transparent, rgba(0,0,0,0.7))",
        },
        "typography": {
            "heading_font": "'Outfit', sans-serif",
            "heading_weight": "800",
            "heading_letter_spacing": "-0.03em",
            "body_font": "'DM Sans', sans-serif",
            "body_size": "16px",
            "line_height": "1.6",
        },
        "layout": {
            "hero_variant": "video-fullscreen-overlay",
            "section_padding": "72px 24px",
            "border_radius": "8px",
            "card_style": "dark-translucent",
            "spacing_scale": "balanced",
        },
        "animation": {
            "scroll_reveal": "fade-from-video",
            "transition_curve": "ease-out",
            "duration": "500ms",
        },
        "section_variants": {
            "hero": "video-fullscreen-overlay",
            "gallery": "grid-tight",
            "features": "minimal-dark",
            "testimonials": "video-cards",
            "stats": "default",
            "price_table": "default",
            "countdown": "inline",
            "footer": "default",
            "marketplace": "video-thumbs",
        },
    },
    "social_proof": {
        "name": "Social proof · Testimonials prominent",
        "use_case_fit": ["personal_brand", "property"],
        "palette": {
            "primary": "#22C55E",
            "secondary": "#3B82F6",
            "accent": "#FEF3C7",
            "bg": "#06080F",
            "text": "#F0EBE0",
            "text_dim": "rgba(240,235,224,0.65)",
            "gradient": "linear-gradient(90deg, #22C55E, #3B82F6)",
        },
        "typography": {
            "heading_font": "'Outfit', sans-serif",
            "heading_weight": "700",
            "heading_letter_spacing": "-0.02em",
            "body_font": "'DM Sans', sans-serif",
            "body_size": "16px",
            "line_height": "1.6",
        },
        "layout": {
            "hero_variant": "testimonial-prominent",
            "section_padding": "80px 24px",
            "border_radius": "16px",
            "card_style": "testimonial-card",
            "spacing_scale": "balanced",
        },
        "animation": {
            "scroll_reveal": "fade-up",
            "transition_curve": "ease-out",
            "duration": "400ms",
        },
        "section_variants": {
            "hero": "testimonial-prominent",
            "gallery": "masonry",
            "features": "with-reviews",
            "testimonials": "carousel-large",
            "stats": "social-proof-numbers",
            "price_table": "default",
            "countdown": "inline",
            "footer": "default",
            "marketplace": "with-reviews-grid",
        },
    },
    "compare": {
        "name": "Compare · Stripe-style comparison",
        "use_case_fit": ["marketplace", "property"],
        "palette": {
            "primary": "#6366F1",
            "secondary": "#22C55E",
            "accent": "#F0EBE0",
            "bg": "#06080F",
            "text": "#F0EBE0",
            "text_dim": "rgba(240,235,224,0.62)",
            "gradient": "linear-gradient(90deg, #6366F1, #22C55E)",
        },
        "typography": {
            "heading_font": "'Outfit', sans-serif",
            "heading_weight": "700",
            "heading_letter_spacing": "-0.02em",
            "body_font": "'DM Sans', sans-serif",
            "body_size": "15px",
            "line_height": "1.55",
        },
        "layout": {
            "hero_variant": "split-vs",
            "section_padding": "72px 24px",
            "border_radius": "12px",
            "card_style": "comparison-table",
            "spacing_scale": "dense",
        },
        "animation": {
            "scroll_reveal": "fade-up",
            "transition_curve": "cubic-bezier(0.22, 1, 0.36, 1)",
            "duration": "350ms",
        },
        "section_variants": {
            "hero": "split-vs",
            "gallery": "grid-tight",
            "features": "comparison-grid",
            "testimonials": "grid",
            "stats": "default",
            "price_table": "highlighted-cols",
            "countdown": "inline",
            "footer": "default",
            "marketplace": "comparison-table",
        },
    },
}


def get_theme(template_key: str) -> Dict[str, Any]:
    """Return theme dict for template_key · fallback to 'modern' if unknown."""
    return LANDING_THEMES.get(template_key) or LANDING_THEMES["modern"]


def list_themes_metadata() -> List[Dict[str, Any]]:
    """Lightweight metadata list para selector UI (no envia layouts/section_variants)."""
    out: List[Dict[str, Any]] = []
    for k, v in LANDING_THEMES.items():
        out.append({
            "key": k,
            "name": v["name"],
            "use_case_fit": v["use_case_fit"],
            "preview_palette": {
                "primary": v["palette"]["primary"],
                "secondary": v["palette"]["secondary"],
                "bg": v["palette"]["bg"],
                "gradient": v["palette"]["gradient"],
            },
            "hero_variant": v["layout"]["hero_variant"],
            "spacing_scale": v["layout"]["spacing_scale"],
        })
    return out
