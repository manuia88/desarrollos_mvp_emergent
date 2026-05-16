"""W5.2 Sub-D — SEO landings temáticas auto.

6 temas hardcoded basados en sub-scores:
  - top-seguras           (seguridad desc)
  - top-familias          (avg seguridad + amenidades)
  - top-movilidad         (transporte desc)
  - top-vibe              (vibe desc)
  - mejor-precio-calidad  (avg precio + lifestyle)
  - top-amenidades        (amenidades desc)
"""
from __future__ import annotations

from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from zone_score_engine import (
    list_top_zones_by_subscore,
    list_top_zones_by_avg,
)

router = APIRouter()

THEMES: Dict[str, Dict[str, Any]] = {
    "top-seguras": {
        "mode": "single",
        "subscore": "seguridad",
        "title": "Las colonias más seguras de CDMX",
        "h1": "Top colonias más seguras en CDMX",
        "description": "Ranking de las colonias con mayor índice de seguridad en Ciudad de México, basado en incidencia delictiva normalizada y percepción ciudadana.",
        "og_image_url": "/og/seo/top-seguras.png",
    },
    "top-familias": {
        "mode": "avg",
        "subscores": ["seguridad", "amenidades"],
        "title": "Mejores colonias para familias en CDMX",
        "h1": "Top colonias para familias en CDMX",
        "description": "Las colonias con mejor combinación de seguridad y amenidades familiares para vivir con niños en Ciudad de México.",
        "og_image_url": "/og/seo/top-familias.png",
    },
    "top-movilidad": {
        "mode": "single",
        "subscore": "transporte",
        "title": "Colonias con mejor movilidad en CDMX",
        "h1": "Top colonias con mejor transporte público en CDMX",
        "description": "Ranking de colonias en CDMX ordenadas por cercanía a Metro, Metrobús y conectividad vial.",
        "og_image_url": "/og/seo/top-movilidad.png",
    },
    "top-vibe": {
        "mode": "single",
        "subscore": "vibe",
        "title": "Colonias con mejor vibe en CDMX",
        "h1": "Top colonias con mejor vibe urbano en CDMX",
        "description": "Las colonias con más carácter cultural, gastronómico y atractivo de barrio en Ciudad de México.",
        "og_image_url": "/og/seo/top-vibe.png",
    },
    "mejor-precio-calidad": {
        "mode": "avg",
        "subscores": ["precio", "lifestyle"],
        "title": "Mejor precio-calidad en CDMX",
        "h1": "Colonias con mejor precio-calidad de vida en CDMX",
        "description": "Las colonias con mejor relación entre plusvalía esperada y calidad de vida diaria en Ciudad de México.",
        "og_image_url": "/og/seo/mejor-precio-calidad.png",
    },
    "top-amenidades": {
        "mode": "single",
        "subscore": "amenidades",
        "title": "Colonias con más amenidades en CDMX",
        "h1": "Top colonias con más amenidades en CDMX",
        "description": "Ranking de colonias con mayor densidad comercial, gastronomía y servicios en Ciudad de México.",
        "og_image_url": "/og/seo/top-amenidades.png",
    },
}


def all_theme_keys() -> List[str]:
    return list(THEMES.keys())


def all_theme_paths() -> List[str]:
    return [f"/cdmx/{k}" for k in THEMES.keys()]


@router.get("/api/seo-themed/{theme_key}")
async def seo_themed_landing(theme_key: str, request: Request):
    theme = THEMES.get(theme_key)
    if not theme:
        raise HTTPException(404, f"theme_not_found:{theme_key}")

    db = request.app.state.db
    if theme["mode"] == "single":
        items = await list_top_zones_by_subscore(db, theme["subscore"], 20)
    else:
        items = await list_top_zones_by_avg(db, theme["subscores"], 20)

    # Schema.org ItemList con cada zona como Place
    item_list = []
    for i, z in enumerate(items, 1):
        item_list.append({
            "@type": "ListItem",
            "position": i,
            "item": {
                "@type": "Place",
                "name": z.get("name"),
                "url": f"/zona/{z.get('slug')}",
                "address": {
                    "@type": "PostalAddress",
                    "addressLocality": z.get("alcaldia") or "CDMX",
                    "addressRegion": "Ciudad de México",
                    "addressCountry": "MX",
                },
                "aggregateRating": {
                    "@type": "AggregateRating",
                    "ratingValue": z.get("score"),
                    "bestRating": 100,
                    "worstRating": 0,
                    "ratingCount": 1,
                },
            },
        })

    schema_org = {
        "@context": "https://schema.org",
        "@type": "ItemList",
        "name": theme["h1"],
        "description": theme["description"],
        "numberOfItems": len(items),
        "itemListElement": item_list,
    }

    breadcrumb_ld = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "DesarrollosMX", "item": "/"},
            {"@type": "ListItem", "position": 2, "name": "CDMX", "item": "/cdmx"},
            {"@type": "ListItem", "position": 3, "name": theme["title"], "item": f"/cdmx/{theme_key}"},
        ],
    }

    return JSONResponse({
        "ok": True,
        "theme_key": theme_key,
        "title": theme["title"],
        "h1": theme["h1"],
        "description": theme["description"],
        "og_image_url": theme["og_image_url"],
        "top_zones": items,
        "schema_org_jsonld": [schema_org, breadcrumb_ld],
    })


@router.get("/api/seo-themed")
async def list_seo_themes():
    """Lista pública de temas disponibles (utilizado por sitemap consumers)."""
    return JSONResponse({
        "ok": True,
        "themes": [
            {"key": k, "title": v["title"], "path": f"/cdmx/{k}"}
            for k, v in THEMES.items()
        ],
    })
